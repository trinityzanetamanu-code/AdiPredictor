#!/usr/bin/env python3
"""Package only explicit HK DOM captures, offline, without browser/profile access."""
import argparse
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
from datetime import datetime, timezone
from urllib.parse import urlsplit
import zipfile

TYPE = 'OWNER_BROWSER_DOM_DIAGNOSTIC_NOT_CANONICAL'
PRIVATE = re.compile(r'token|nonce|auth|cookie|session|challenge|csrf|clearance|captcha|password|cf-', re.I)
ALLOWED_TAGS = set('html head meta title body div span p table thead tbody tfoot tr td th caption img h1 h2 h3 h4 h5 h6 br hr b strong i em small time ul ol li section article main header footer a'.split())
ALLOWED_ATTRS = {'id', 'class', 'alt', 'title', 'colspan', 'rowspan', 'data-digit', 'src', 'href', 'data-static-background', 'charset'}


def safe_url(value, source=False):
    url = urlsplit(value)
    if (url.scheme != 'https' or not url.hostname or url.username or url.password or
            url.query or url.fragment or PRIVATE.search(url.path)):
        raise ValueError('UNSAFE_URL')
    if source and (url.netloc != 'www.hongkongpools.com' or url.path not in ('/live', '/live.html')):
        raise ValueError('WRONG_SOURCE_PAGE')
    return value


class Structure(HTMLParser):
    def __init__(self):
        super().__init__()
        self.text = []
        self.rows = []
        self.images = []
        self.table_count = 0
        self.row = None

    def handle_starttag(self, tag, attrs):
        if tag not in ALLOWED_TAGS:
            raise ValueError('UNSAFE_DOM_TAG')
        values = dict(attrs)
        for key, value in attrs:
            if key not in ALLOWED_ATTRS or PRIVATE.search(key):
                raise ValueError('UNSAFE_DOM_ATTRIBUTE')
            if key in ('src', 'href', 'data-static-background'):
                safe_url(value or '')
            if key in ('id', 'class', 'alt', 'title') and PRIVATE.search(value or ''):
                raise ValueError('UNSAFE_DISPLAY_ATTRIBUTE')
        if tag == 'table':
            self.table_count += 1
        if tag == 'tr':
            self.row = {'text': [], 'images': []}
        if tag == 'img':
            image = {key: values[key] for key in ('src', 'alt', 'title', 'data-digit') if key in values}
            self.images.append(image)
            if self.row is not None:
                self.row['images'].append(image)

    def handle_endtag(self, tag):
        if tag == 'tr' and self.row is not None:
            self.rows.append({**self.row, 'text': ' '.join(self.row['text'])})
            self.row = None

    def handle_data(self, data):
        # Reject URL query/fragment and visible credential labels as a second boundary.
        if re.search(r'(?:authorization|bearer|cf_clearance|access_token|session_token)\b', data, re.I):
            raise ValueError('SENSITIVE_DOM_TEXT')
        for value in re.findall(r'https?://[^\s<>"\']+', data):
            safe_url(value)
        value = data.strip()
        if value:
            self.text.append(value)
            if self.row is not None:
                self.row['text'].append(value)


def read_capture(path):
    if path.stat().st_size > 5_000_000:
        raise ValueError('CAPTURE_TOO_LARGE')
    value = json.loads(path.read_text(encoding='utf-8'))
    if (value.get('schema_version') != 1 or value.get('type') != TYPE or
            value.get('capture_status') != 'DOM_CAPTURED_REVIEW_REQUIRED' or
            value.get('finality_verified') is not False or
            value.get('owner_draw_date_verified') is not False):
        raise ValueError('INVALID_CAPTURE_CONTRACT')
    safe_url(value['source_url'], source=True)
    checked = datetime.fromisoformat(value['captured_at'].replace('Z', '+00:00'))
    if checked.tzinfo is None:
        raise ValueError('CAPTURE_TIMEZONE_MISSING')
    if value.get('owner_phase') not in ('partial', 'completed', 'unknown'):
        raise ValueError('INVALID_OBSERVATION_PHASE')
    owner_date = value.get('owner_draw_date')
    if owner_date:
        from datetime import date
        if date.fromisoformat(owner_date).isoformat() != owner_date:
            raise ValueError('INVALID_OWNER_DATE')
    html = value['html']
    if not isinstance(html, str):
        raise ValueError('INVALID_DOM')
    structure = Structure()
    structure.feed(html)
    text = ' '.join(structure.text)
    if re.search(r'just a moment|tunggu sebentar|verify you are human|melakukan verifikasi keamanan|challenge-platform', text, re.I):
        raise ValueError('CHALLENGE_NOT_RESULT_DOM')
    if not structure.table_count or not re.search(r'(?:1st|first)\s*prize', text, re.I):
        raise ValueError('RESULT_TABLE_NOT_FOUND')
    # Rebuild the metadata allowlist. Never package the original JSON or extra fields.
    meta = {key: value[key] for key in ('schema_version', 'type', 'capture_status', 'source_url',
            'captured_at', 'owner_phase', 'owner_draw_date', 'owner_draw_date_verified', 'finality_verified')}
    meta['sanitized_dom_sha256'] = hashlib.sha256(html.encode()).hexdigest()
    meta['source_http_response_captured'] = False
    meta['structure'] = {
        'table_count': structure.table_count,
        'rows': structure.rows,
        'images': structure.images,
        'date_candidates': list(dict.fromkeys(re.findall(r'\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b|\b\d{1,2}[-/]\d{1,2}[-/]\d{4}\b|\b[A-Za-z]+\s+\d{1,2},?\s+\d{4}\b|\b\d{1,2}\s+[A-Za-z]+\s+\d{4}\b', text))),
        'six_digit_text_candidates': list(dict.fromkeys(re.findall(r'(?<!\d)\d{6}(?!\d)', text)))
    }
    hints = value.get('structure', {})
    refresh = hints.get('meta_refresh_seconds')
    meta['meta_refresh_seconds'] = refresh if isinstance(refresh, (int, float)) and refresh >= 0 else None
    meta['static_script_paths'] = [safe_url(item) for item in hints.get('static_script_paths', [])]
    meta['iframe_origins'] = [safe_url(item) for item in hints.get('iframe_origins', [])]
    meta['limitations'] = 'Owner phase/date are unverified. Sanitized DOM is not an HTTP response. Scripts, hidden/form content and iframe DOM are absent. Multiple captures can show changes but cannot alone prove finality or cloud collection.'
    return html, meta


def package_captures(downloads, output=None):
    downloads = Path(downloads)
    if not downloads.is_dir():
        raise ValueError('DOWNLOAD_DIRECTORY_NOT_FOUND: jalankan termux-setup-storage dahulu')
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    output = Path(output) if output else downloads / f'AdiPredictor_HK_Evidence_{stamp}.zip'
    accepted, rejected = [], []
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(downloads.glob('HK_CAPTURE_*.json')):
            if path.is_symlink() or not path.is_file():
                continue
            try:
                html, meta = read_capture(path)
                folder = f'captures/{len(accepted) + 1:03d}-{meta["owner_phase"]}'
                archive.writestr(folder + '/result-dom.html', html)
                archive.writestr(folder + '/metadata.json', json.dumps(meta, ensure_ascii=False, indent=2) + '\n')
                accepted.append({key: meta[key] for key in ('source_url', 'captured_at', 'owner_phase', 'owner_draw_date', 'sanitized_dom_sha256')})
            except (ValueError, KeyError, TypeError, OSError, OverflowError):
                rejected.append({'capture_index': len(accepted) + len(rejected) + 1, 'status': 'REJECTED_INVALID_OR_UNSAFE_CAPTURE'})
        summary = {'diagnostic_status': 'CAPTURE_SUCCESS_REVIEW_REQUIRED' if accepted and not rejected else
                   'CAPTURE_PARTIAL_REVIEW_REQUIRED' if accepted else 'CAPTURE_FAILED_NO_VALID_DOM',
                   'created_at': datetime.now(timezone.utc).isoformat(), 'accepted_count': len(accepted),
                   'rejected_count': len(rejected), 'captures': accepted, 'rejected': rejected,
                   'hk_cloud_access': 'NOT_TESTED_BY_OWNER_KIT', 'hk_finality_evidence': 'NOT_VERIFIED',
                   'hk_canonical_e2e': 'NOT_VERIFIED', 'canonical_data_modified': False}
        archive.writestr('SUMMARY.json', json.dumps(summary, ensure_ascii=False, indent=2) + '\n')
        archive.writestr('README.txt', 'Kirim hanya ZIP ini. Owner DOM capture adalah evidence diagnostic, bukan hasil canonical.\nTidak ada akses cookie, token, header, profil browser atau jaringan dari packer.\n')
    return output, summary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['pack'])
    parser.add_argument('--downloads', type=Path, default=Path.home() / 'storage' / 'downloads')
    args = parser.parse_args()
    try:
        output, summary = package_captures(args.downloads)
    except (ValueError, OSError) as error:
        print(f'DIAGNOSTIC_FAILED: {error}')
        return 1
    print(f'DIAGNOSTIC_STATUS={summary["diagnostic_status"]}')
    print(f'VALID_DOM_CAPTURES={summary["accepted_count"]} REJECTED={summary["rejected_count"]}')
    print(f'ZIP={output}')
    print('Kirim ZIP ini kembali. FINALITY/CLOUD/CANONICAL belum terverifikasi.')
    return 0 if summary['accepted_count'] and not summary['rejected_count'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
