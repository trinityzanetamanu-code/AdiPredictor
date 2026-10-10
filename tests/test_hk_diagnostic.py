import json
from pathlib import Path
import zipfile

import pytest
from scripts.hk_diagnostic.hk_diagnostic import package_captures, read_capture
from scripts.hk_diagnostic.build_kit import build, bookmarklet


def capture(tmp_path, html=None, **updates):
    payload = {
        'schema_version': 1,
        'type': 'OWNER_BROWSER_DOM_DIAGNOSTIC_NOT_CANONICAL',
        'capture_status': 'DOM_CAPTURED_REVIEW_REQUIRED',
        'source_url': 'https://www.hongkongpools.com/live.html',
        'captured_at': '2026-10-10T16:00:00Z',
        'owner_phase': 'completed',
        'owner_draw_date': '2026-10-10',
        'owner_draw_date_verified': False,
        'finality_verified': False,
        'html': html or '<html><body><div>October 10, 2026</div><table><tr><td>1st Prize</td><td>000052</td></tr></table></body></html>',
        **updates,
    }
    path = tmp_path / 'HK_CAPTURE_controlled.json'
    path.write_text(json.dumps(payload))
    return path


def test_diagnostic_pack_preserves_zeroes_and_never_asserts_canonical(tmp_path):
    capture(tmp_path, unexpected_private_field='MUST_NOT_BE_PACKAGED')
    (tmp_path / 'unrelated-private.json').write_text('DO_NOT_READ')
    output, summary = package_captures(tmp_path)
    assert output.parent == tmp_path
    assert summary['diagnostic_status'] == 'CAPTURE_SUCCESS_REVIEW_REQUIRED'
    assert summary['canonical_data_modified'] is False
    assert summary['hk_canonical_e2e'] == 'NOT_VERIFIED'
    with zipfile.ZipFile(output) as archive:
        data = '\n'.join(archive.read(name).decode() for name in archive.namelist())
        assert '000052' in data
        assert 'MUST_NOT_BE_PACKAGED' not in data and 'DO_NOT_READ' not in data
        meta = json.loads(archive.read('captures/001-completed/metadata.json'))
        assert meta['owner_draw_date_verified'] is False
        assert meta['source_http_response_captured'] is False
        assert len(meta['sanitized_dom_sha256']) == 64


@pytest.mark.parametrize('html', [
    '<table><tr><td>1st Prize</td><td>000052<script>secret</script></td></tr></table>',
    '<table data-token="secret"><tr><td>1st Prize</td></tr></table>',
    '<table><tr><td>1st Prize<img src="https://www.hongkongpools.com/1.png?token=secret"></td></tr></table>',
    '<table><tr><td>1st Prize</td><td>cf_clearance secret</td></tr></table>',
    '<table><tr><td>Just a moment... 1st Prize</td></tr></table>',
])
def test_unsafe_or_challenge_capture_is_rejected(tmp_path, html):
    path = capture(tmp_path, html=html)
    with pytest.raises(ValueError):
        read_capture(path)
    output, summary = package_captures(tmp_path)
    assert summary['accepted_count'] == 0
    assert summary['diagnostic_status'] == 'CAPTURE_FAILED_NO_VALID_DOM'
    with zipfile.ZipFile(output) as archive:
        assert not any(name.endswith('.html') for name in archive.namelist())


def test_empty_capture_directory_returns_failure_zip(tmp_path):
    output, summary = package_captures(tmp_path)
    assert output.is_file()
    assert summary['diagnostic_status'] == 'CAPTURE_FAILED_NO_VALID_DOM'


def test_completed_label_does_not_relax_finality_or_source_checks(tmp_path):
    path = capture(tmp_path, finality_verified=True)
    with pytest.raises(ValueError, match='INVALID_CAPTURE_CONTRACT'):
        read_capture(path)
    path = capture(tmp_path, source_url='https://example.com/live.html')
    with pytest.raises(ValueError, match='WRONG_SOURCE_PAGE'):
        read_capture(path)


def test_kit_is_offline_and_contains_full_instructions(tmp_path):
    output = tmp_path / 'kit.zip'
    build(output)
    with zipfile.ZipFile(output) as archive:
        names = archive.namelist()
        assert len(names) == 4
        assert all(not name.endswith('.apk') for name in names)
        code = archive.read('AdiPredictor_HK_DiagnosticKit/bookmarklet.txt').decode()
        assert code.startswith('javascript:') and code.count('\n') == 1
        assert code == bookmarklet()
        assert 'document.cookie' not in code and 'localStorage' not in code
        assert 'fetch(' not in code and 'XMLHttpRequest' not in code
