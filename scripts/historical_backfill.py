#!/usr/bin/env python3
import base64
import json
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import requests
from bs4 import BeautifulSoup

from collector import (
    ParsedResult,
    CollectorError,
    fetch_html,
    parse_weekday_grid,
    parse_date_result_table,
)

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "public" / "data"
REPORT_PATH = DATA_DIR / "historical-verification.json"
YEARS = [2023, 2024, 2025, 2026]

UA = (
    "Mozilla/5.0 (Linux; Android 13; Mobile) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/152.0.0.0 Mobile Safari/537.36"
)

MONTHS_ID = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"]

LIVE_SOURCES = {
    "HK": {
        "id": "livenomor_hk",
        "name": "LiveNomor Hongkong",
        "url": "https://livenomor.com/",
        "parser": "weekday_grid",
        "heading_regex": r"Data Pengeluaran Hongkong\s+{year}",
    },
    "SDY": {
        "id": "livenomor_sdy",
        "name": "LiveNomor Sydney",
        "url": "https://livenomor.com/data-pengeluaran-sydney-2021/",
        "parser": "weekday_grid",
        "heading_regex": r"Data Pengeluaran Sydney\s+{year}",
    },
}

HISTORICAL_SOURCES = {
    "HK": [
        {
            "id": "angkaweb_hk_archive",
            "name": "Angkaweb Data Hongkong",
            "url": "https://w22.angkaweb.net/data-hongkong/",
            "parser": "hk_anchor_sequence",
            "priority": 10,
        },
        {
            "id": "angkakeluarhariini_hk",
            "name": "AngkaKeluarHariIni HK",
            "url": "https://angkakeluarhariini.com/",
            "parser": "weekday4",
            "heading_regex": r"(?:Data HK|Data Hongkong|Data Pengeluaran HK)\s+{year}",
            "priority": 20,
        },
        {
            "id": "datahk2023_archive",
            "name": "DataHK2023 Archive",
            "url": "https://datahk2023.org/",
            "parser": "weekday4",
            "heading_regex": r"(?:Data Pengeluaran Hongkong|Data Pengeluaran HK|Data HK|Data Hongkong)\s+{year}",
            "years": [2023],
            "priority": 30,
        },
        {
            "id": "waroengtogel_hk_2024",
            "name": "WaroengTogel HK 2024",
            "url": "https://waroengtogel2.com/data-togel-hk-2024/",
            "parser": "date_result4",
            "years": [2024],
            "priority": 35,
        },
        {
            "id": "paitohklengkap_archive",
            "name": "PaitoHKLengkap Archive",
            "url": "https://paitohklengkap.net/data/{year}/",
            "parser": "date_result4",
            "years": [2025, 2026],
            "priority": 40,
        },
    ],
    "SDY": [
        {
            "id": "datatogel_sdy_archive",
            "name": "Datatogel Sydney Archive",
            "url": "https://w2.datatogel.fit/data-sdy/",
            "parser": "weekday4",
            "heading_regex": r"(?:Data Sydney|Data SDY|Data Pengeluaran Sydney)\s+{year}",
            "priority": 10,
        },
        {
            "id": "datasydtoday_archive",
            "name": "DataSydToday Archive",
            "url": "https://www.datasydtoday.com/",
            "parser": "split_weekday4",
            "priority": 15,
        },
        {
            "id": "sdy6_archive",
            "name": "Sydney Pools 6D Archive",
            "url": "https://datapengeluaransdy.club/data-sdy/",
            "parser": "weekday6_last4",
            "heading_regex": r"(?:Data SDY|Data Sydney)\s+{year}",
            "years": [2023, 2024, 2025],
            "priority": 20,
        },
        {
            "id": "datasdywp_archive",
            "name": "DataSDYWP Archive",
            "url": "https://www.datasdywp.com/",
            "parser": "weekday4",
            "heading_regex": r"(?:Data Sydney|Data SDY)\s+{year}",
            "years": [2024, 2025, 2026],
            "priority": 30,
        },
    ],
}

SGP_HISTORICAL_SOURCES = [
    {
        "id": "tarikanpaito_sgp",
        "name": "DataPaitoWarna Singapore",
        "url": "https://tarikanpaito.net/data/sgp/{year}",
        "parser": "archive_digits4",
        "priority": 10,
    },
    {
        "id": "paitosgplengkap",
        "name": "Paito SGP Lengkap",
        "url": "https://paitosgplengkap.org/data/{year}/",
        "parser": "date_result4",
        "priority": 20,
    },
    {
        "id": "datasgp2_archive",
        "name": "DataSGP2 Archive",
        "url": "https://datasgp2.org/",
        "parser": "fixed_weekday5",
        "heading_regex": r"DATA SGP TAHUN\s+{year}",
        "priority": 30,
    },
    {
        "id": "buzzbike_sgp_2023",
        "name": "MKTOTO SGP 2023 Archive",
        "url": "https://www.buzzbike.cc/data-sgp-2023/",
        "parser": "fixed_weekday5",
        "heading_regex": r"(?:Tabel Keluaran SGP|Data SGP)\s+{year}",
        "years": [2023],
        "priority": 35,
    },
    {
        "id": "gudangka_sgp_archive",
        "name": "Gudangka Singapore Archive",
        "url": "https://gudangka.net/datasgp.html",
        "parser": "fixed_weekday5",
        "heading_regex": r"TAHUN\s+{year}",
        "priority": 40,
    },
    {
        "id": "nexipools_sgp_recent",
        "name": "NexiPools Singapore Paito",
        "url": "https://www.nexipools.com/id/singapore/paito/",
        "parser": "date_result4",
        "years": [2026],
        "priority": 50,
    },
]

SGP_PERIOD_RULE = {
    "prefix": "SGP",
    "anchor_date": date(2026, 9, 12),
    "anchor_number": 2474,
    "weekdays": {0, 2, 3, 5, 6},
}


SGP_OFFICIAL_URL = "https://www.singaporepools.com.sg/en/product/pages/4d_results.aspx?sppl={token}"
SGP_DRAW_MIN = 4956
SGP_DRAW_MAX = 5536

def format_date_id(d: date) -> str:
    return f"{d.day:02d} {MONTHS_ID[d.month - 1]} {d.year}"

def internal_period(market: str, d: date) -> str:
    return f"{market}-{d.strftime('%Y%m%d')}"

def parse_archive_rows(html: str, market: str, source_url: str, year: int):
    soup = BeautifulSoup(html, "html.parser")
    out = {}

    for row in soup.find_all("tr"):
        cells = [re.sub(r"\s+", " ", c.get_text(" ", strip=True)).strip() for c in row.find_all(["td", "th"])]
        if not cells:
            continue

        date_match = None
        for cell in cells[:3]:
            m = re.search(r"(?<!\d)(\d{1,2})/(\d{1,2})(?!\d)", cell)
            if m:
                date_match = m
                break
        if not date_match:
            continue

        day, month = int(date_match.group(1)), int(date_match.group(2))
        try:
            d = date(year, month, day)
        except ValueError:
            continue

        digits = []
        for cell in cells:
            cell = cell.strip()
            if re.fullmatch(r"\d", cell):
                digits.append(cell)

        if len(digits) < 4:
            # Some layouts wrap digits in nested spans; try row text after the date.
            text = re.sub(r"\s+", " ", row.get_text(" ", strip=True))
            tail = text[date_match.end():]
            digits = re.findall(r"(?<!\d)(\d)(?!\d)", tail)

        if len(digits) < 4:
            continue

        number = "".join(digits[:4])
        out[d] = ParsedResult(
            market=market,
            result_date=d,
            number=number,
            source_id=f"tarikanpaito_{market.lower()}",
            source_name=f"DataPaitoWarna {market}",
            source_url=source_url,
        )

    # Fallback for responsive pages that render archive rows as divs instead of <tr>.
    if not out:
        lines = [
            re.sub(r"\s+", " ", line).strip()
            for line in soup.get_text("\n", strip=True).splitlines()
            if line.strip()
        ]
        for i, line in enumerate(lines):
            m = re.search(
                r"(?:(?:Min|Sen|Sel|Rab|Kam|Jum|Sab)\s+)?"
                r"(?<!\d)(\d{1,2})/(\d{1,2})(?!\d)",
                line,
                flags=re.I,
            )
            if not m:
                continue

            day, month = int(m.group(1)), int(m.group(2))
            try:
                d = date(year, month, day)
            except ValueError:
                continue

            digits = []
            for nxt in lines[i + 1:i + 16]:
                if re.fullmatch(r"\d", nxt):
                    digits.append(nxt)
                    if len(digits) == 4:
                        break
                elif digits and re.search(r"\d{1,2}/\d{1,2}", nxt):
                    break

            if len(digits) == 4:
                number = "".join(digits)
                out[d] = ParsedResult(
                    market=market,
                    result_date=d,
                    number=number,
                    source_id=f"tarikanpaito_{market.lower()}",
                    source_name=f"DataPaitoWarna {market}",
                    source_url=source_url,
                )

    results = [out[d] for d in sorted(out)]
    return results

def parse_weekday_grid_6_last4(html: str, market: str, source: dict, year: int):
    soup = BeautifulSoup(html, "html.parser")
    scored = []

    heading_regex = source.get("heading_regex", r"Data SDY\\s+{year}")
    pattern = heading_regex.replace("{year}", str(year))

    candidates = []
    yielded = set()
    for heading in soup.find_all(["h1", "h2", "h3", "h4", "strong"]):
        if re.search(pattern, heading.get_text(" ", strip=True), flags=re.I):
            table = heading.find_next("table")
            if table is not None and id(table) not in yielded:
                yielded.add(id(table))
                candidates.append(table)

    if not candidates:
        candidates = soup.find_all("table")

    for table in candidates:
        rows = table.find_all("tr")
        header_idx = None
        column_days = []
        for idx, row in enumerate(rows[:6]):
            cells = row.find_all(["th", "td"])
            mapped = []
            for cell in cells:
                raw = re.sub(r"[^a-zA-Z']", "", cell.get_text(" ", strip=True).lower())
                day_map = {
                    "senin": 0, "selasa": 1, "rabu": 2, "kamis": 3,
                    "jumat": 4, "jum'at": 4, "sabtu": 5, "minggu": 6,
                    "monday": 0, "tuesday": 1, "wednesday": 2,
                    "thursday": 3, "friday": 4, "saturday": 5, "sunday": 6,
                }
                mapped.append(day_map.get(raw))
            if sum(x is not None for x in mapped) >= 2:
                header_idx = idx
                column_days = mapped
                break

        six_count = len(re.findall(r"(?<!\\d)\\d{6}(?!\\d)", table.get_text(" ", strip=True)))
        if header_idx is not None:
            scored.append((six_count, table, header_idx, column_days))

    if not scored:
        raise CollectorError("Tidak ada weekday table 6D yang ditemukan")

    scored.sort(key=lambda x: x[0], reverse=True)
    _, table, header_idx, column_days = scored[0]

    jan1 = date(year, 1, 1)
    first_monday = jan1 - __import__("datetime").timedelta(days=jan1.weekday())
    rows = table.find_all("tr")
    results = []
    week_index = 0

    for row in rows[header_idx + 1:]:
        cells = row.find_all(["td", "th"])
        if not cells:
            continue
        values = []
        for cell in cells:
            m = re.search(r"(?<!\\d)(\\d{6})(?!\\d)", cell.get_text(" ", strip=True))
            values.append(m.group(1)[-4:] if m else "")

        if not any(values):
            continue

        for col, number in enumerate(values):
            if not number or col >= len(column_days):
                continue
            day_idx = column_days[col]
            if day_idx is None:
                continue
            d = first_monday + __import__("datetime").timedelta(
                days=week_index * 7 + day_idx
            )
            if d.year != year:
                continue
            results.append(ParsedResult(
                market=market,
                result_date=d,
                number=number,
                source_id=source["id"],
                source_name=source["name"],
                source_url=source["url"],
            ))
        week_index += 1

    dedup = {item.result_date: item for item in results}
    out = [dedup[d] for d in sorted(dedup)]
    if len(out) < 20:
        raise CollectorError(f"6D last4 parser hanya menemukan {len(out)} result")
    return out


def parse_hk_anchor_sequence(html: str, market: str, source: dict, year: int):
    soup = BeautifulSoup(html, "html.parser")
    tables = soup.find_all("table")

    def four_digit_tokens(node):
        tokens = []
        for cell in node.find_all(["td", "th"]):
            text = cell.get_text(" ", strip=True)
            tokens.extend(re.findall(r"(?<!\\d)(\\d{4})(?!\\d)", text))
        return tokens

    token_candidates = []
    for table in tables:
        tokens = four_digit_tokens(table)
        if tokens:
            token_candidates.append(tokens)

    # Angkaweb currently renders its historical sequence as text on some
    # clients/runners instead of a semantic table. Fall back to the full page.
    page_text = soup.get_text(" ", strip=True)
    text_tokens = re.findall(r"(?<!\\d)(\\d{4})(?!\\d)", page_text)
    if text_tokens:
        token_candidates.append(text_tokens)

    if not token_candidates:
        raise CollectorError("Angkaweb tidak memiliki sequence angka")

    tokens = max(token_candidates, key=len)
    if len(tokens) < 1000:
        raise CollectorError(f"Angkaweb sequence terlalu pendek: {len(tokens)}")

    anchor = ["5241", "7247", "8468", "2954", "4006", "6689", "4791", "0978"]
    start = None
    for i in range(0, len(tokens) - len(anchor) + 1):
        if tokens[i:i + len(anchor)] == anchor:
            start = i
            break
    if start is None:
        raise CollectorError("Anchor HK 2023 tidak ditemukan pada Angkaweb")

    start_date = date(2023, 1, 1)
    today_cap = date(2026, 12, 31)
    sequence = tokens[start:]
    results = []

    for offset, number in enumerate(sequence):
        d = start_date + __import__("datetime").timedelta(days=offset)
        if d > today_cap:
            break
        if d.year != year:
            continue
        results.append(ParsedResult(
            market=market,
            result_date=d,
            number=number,
            source_id=source["id"],
            source_name=source["name"],
            source_url=source["url"],
        ))

    if len(results) < (200 if year == 2026 else 350):
        raise CollectorError(
            f"Angkaweb anchor parser {year} hanya menemukan {len(results)} result"
        )
    return results


def parse_split_weekday4(html: str, market: str, source: dict, year: int):
    soup = BeautifulSoup(html, "html.parser")
    raw_lines = [
        re.sub(r"\\s+", " ", line).strip()
        for line in soup.get_text("\\n", strip=True).splitlines()
        if line.strip()
    ]

    start_idx = None
    start_patterns = [
        rf"Data SDY Pools\\s+{year}",
        rf"Data Sydney\\s+{year}",
        rf"Data SDY\\s+{year}",
    ]
    for idx, line in enumerate(raw_lines):
        if any(re.search(pattern, line, flags=re.I) for pattern in start_patterns):
            start_idx = idx
            break

    if start_idx is None:
        raise CollectorError(f"Split weekday: heading {year} tidak ditemukan")

    end_idx = len(raw_lines)
    next_year = year + 1
    for idx in range(start_idx + 1, len(raw_lines)):
        line = raw_lines[idx]
        if re.search(
            rf"(?:Data Sydney|Data SDY Pools|Data SDY)\\s+{next_year}",
            line,
            flags=re.I,
        ):
            end_idx = idx
            break

    segment = raw_lines[start_idx:end_idx]
    weekday_names = [
        ("senin", 0), ("selasa", 1), ("rabu", 2), ("kamis", 3),
        ("jumat", 4), ("jum'at", 4), ("sabtu", 5), ("minggu", 6),
    ]

    headings = []
    for idx, line in enumerate(segment):
        normalized = re.sub(r"[^a-zA-Z']", "", line.lower())
        for name, day_idx in weekday_names:
            if normalized == name:
                headings.append((idx, day_idx))
                break

    # One heading per weekday is expected. Ignore duplicated spelling aliases.
    unique = {}
    for idx, day_idx in headings:
        unique.setdefault(day_idx, idx)
    headings = sorted((idx, day_idx) for day_idx, idx in unique.items())

    if len(headings) < 7:
        raise CollectorError(
            f"Split weekday: hanya {len(headings)} weekday heading ditemukan"
        )

    results = []
    for pos, (idx, day_idx) in enumerate(headings):
        section_end = headings[pos + 1][0] if pos + 1 < len(headings) else len(segment)
        values = []
        for line in segment[idx + 1:section_end]:
            m = re.fullmatch(r"(?:xxxx|xxx|\\d{4})", line, flags=re.I)
            if not m:
                continue
            value = line.lower()
            if value in {"xxxx", "xxx"}:
                values.append(None)
            else:
                values.append(line)

        dates = []
        d = date(year, 1, 1)
        while d.year == year:
            if d.weekday() == day_idx:
                dates.append(d)
            d += __import__("datetime").timedelta(days=1)

        # Some pages include one explicit xxxx placeholder before the first
        # calendar occurrence. Align from the tail if there is one extra slot.
        if len(values) > len(dates):
            values = values[-len(dates):]
        if len(values) < len(dates):
            dates = dates[:len(values)]

        for d, number in zip(dates, values):
            if not number:
                continue
            results.append(ParsedResult(
                market=market,
                result_date=d,
                number=number,
                source_id=source["id"],
                source_name=source["name"],
                source_url=source["url"],
            ))

    dedup = {item.result_date: item for item in results}
    out = [dedup[d] for d in sorted(dedup)]
    if len(out) < 300:
        raise CollectorError(
            f"Split weekday parser {year} hanya menemukan {len(out)} result"
        )
    return out


def parse_fixed_weekday5(html: str, market: str, source: dict, year: int):
    soup = BeautifulSoup(html, "html.parser")
    target_weekdays = [0, 2, 3, 5, 6]  # Mon, Wed, Thu, Sat, Sun

    candidate_tables = []
    heading_regex = source.get("heading_regex")
    if heading_regex:
        pattern = heading_regex.replace("{year}", str(year))
        for heading in soup.find_all(
            ["h1", "h2", "h3", "h4", "h5", "strong", "b"]
        ):
            if re.search(
                pattern,
                heading.get_text(" ", strip=True),
                flags=re.I,
            ):
                table = heading.find_next("table")
                if table is not None:
                    candidate_tables.append(table)

    # Some archive pages do not expose semantic year headings. In that case
    # score every table and select the one with the largest 4D payload.
    if not candidate_tables:
        candidate_tables = soup.find_all("table")

    scored = []
    for table in candidate_tables:
        four_count = 0
        usable_rows = 0
        for row in table.find_all("tr"):
            cells = row.find_all(["td", "th"])
            values = []
            for cell in cells:
                text = re.sub(
                    r"\s+",
                    " ",
                    cell.get_text(" ", strip=True),
                ).strip()
                if re.fullmatch(r"\d{4}", text):
                    values.append(text)
                    four_count += 1
                elif re.fullmatch(r"(?:XXXX|XXX|-)", text, flags=re.I):
                    values.append(None)
            if len(values) >= 1:
                usable_rows += 1
        scored.append((four_count, usable_rows, table))

    if not scored:
        raise CollectorError(
            f"Fixed weekday5: tidak ada table untuk {year}"
        )

    scored.sort(key=lambda item: (item[0], item[1]), reverse=True)
    four_count, _, table = scored[0]
    if four_count < 100:
        raise CollectorError(
            f"Fixed weekday5: payload terlalu sedikit {four_count}"
        )

    jan1 = date(year, 1, 1)
    first_monday = jan1 - timedelta(days=jan1.weekday())
    week_index = 0
    results = []

    for row in table.find_all("tr"):
        cells = row.find_all(["td", "th"])
        raw_values = []
        for cell in cells:
            text = re.sub(
                r"\s+",
                " ",
                cell.get_text(" ", strip=True),
            ).strip()
            if re.fullmatch(r"\d{4}", text):
                raw_values.append(text)
            elif re.fullmatch(r"(?:XXXX|XXX|-)", text, flags=re.I):
                raw_values.append(None)

        if not raw_values:
            continue

        # Ignore numbering/metadata columns when present. Five market columns
        # are always Mon/Wed/Thu/Sat/Sun in these archives.
        if len(raw_values) > 5:
            raw_values = raw_values[-5:]

        # If HTML omitted blank leading cells, infer them from the first
        # calendar week's weekday position.
        if len(raw_values) < 5:
            if week_index == 0:
                valid_positions = [
                    idx
                    for idx, weekday in enumerate(target_weekdays)
                    if (
                        first_monday
                        + timedelta(days=weekday)
                    ).year == year
                ]
                if len(raw_values) == len(valid_positions):
                    values = [None] * 5
                    for idx, value in zip(valid_positions, raw_values):
                        values[idx] = value
                    raw_values = values
                else:
                    raw_values = raw_values + [None] * (5 - len(raw_values))
            else:
                raw_values = raw_values + [None] * (5 - len(raw_values))

        for col, number in enumerate(raw_values[:5]):
            if not number:
                continue
            d = first_monday + timedelta(
                days=week_index * 7 + target_weekdays[col]
            )
            if d.year != year:
                continue
            results.append(ParsedResult(
                market=market,
                result_date=d,
                number=number,
                source_id=source["id"],
                source_name=source["name"],
                source_url=source["url"],
            ))

        week_index += 1

    dedup = {item.result_date: item for item in results}
    out = [dedup[d] for d in sorted(dedup)]

    minimum = 180 if year == 2026 else 240
    if len(out) < minimum:
        raise CollectorError(
            f"Fixed weekday5 {year}: hanya {len(out)} result"
        )
    return out


def parse_source_year(html: str, market: str, source: dict, year: int):
    parser = source.get("parser", "weekday4")

    if parser == "weekday4":
        return parse_weekday_grid(html, market, source, year)
    if parser == "weekday6_last4":
        return parse_weekday_grid_6_last4(html, market, source, year)
    if parser == "hk_anchor_sequence":
        return parse_hk_anchor_sequence(html, market, source, year)
    if parser == "split_weekday4":
        return parse_split_weekday4(html, market, source, year)
    if parser == "fixed_weekday5":
        return parse_fixed_weekday5(html, market, source, year)
    if parser == "date_result4":
        return parse_date_result_table(html, market, source, year)
    if parser == "archive_digits4":
        return parse_archive_rows(html, market, source["url"], year)

    raise CollectorError(f"Parser historis tidak dikenal: {parser}")

def verify_pair(primary, secondary, market, year):
    a = {x.result_date: x.number for x in primary}
    b = {x.result_date: x.number for x in secondary}
    common = sorted(set(a) & set(b))
    matches = [d for d in common if a[d] == b[d]]
    mismatches = [
        {"date": d.isoformat(), "primary": a[d], "secondary": b[d]}
        for d in common if a[d] != b[d]
    ]

    if common and len(matches) / len(common) < 0.995:
        raise CollectorError(
            f"{market} {year}: cross-check ratio terlalu rendah "
            f"{len(matches)}/{len(common)}; mismatches={mismatches[:5]}"
        )

    return {
        "common": len(common),
        "matches": len(matches),
        "mismatches": mismatches[:20],
        "match_ratio": (len(matches) / len(common)) if common else 0.0,
    }

def load_existing_map(market):
    path = DATA_DIR / f"{market.lower()}.json"
    if not path.exists():
        return {}
    try:
        rows = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    return {
        r.get("result_date"): r
        for r in rows
        if isinstance(r, dict) and r.get("result_date")
    }

def make_record(item, verification, source_ids, period=None):
    return {
        "id": int(item.result_date.strftime("%Y%m%d")),
        "tanggal": format_date_id(item.result_date),
        "periode": period or internal_period(item.market, item.result_date),
        "nomor": item.number,
        "result_date": item.result_date.isoformat(),
        "market": item.market,
        "source_id": item.source_id,
        "source_name": item.source_name,
        "source_url": item.source_url,
        "source_ids": source_ids,
        "verification": verification,
        "confirmations": len(source_ids),
    }

def backfill_hk_sdy(market):
    existing = load_existing_map(market)
    combined = {}
    verification_years = {}

    configured = sorted(
        HISTORICAL_SOURCES[market],
        key=lambda source: source.get("priority", 999),
    )

    shared_html = {}
    source_errors = {}

    # Fetch fixed URLs once. Year-templated URLs are fetched only for the year
    # that needs them.
    for source in configured:
        if "{year}" in source["url"]:
            continue
        try:
            shared_html[source["id"]] = fetch_html(source["url"], timeout=15)
        except Exception as exc:
            source_errors[source["id"]] = str(exc)
            print(f"[{market}] {source['id']} fetch failed: {exc}")

    live_source = LIVE_SOURCES[market]
    try:
        shared_html[live_source["id"]] = fetch_html(live_source["url"], timeout=15)
    except Exception as exc:
        source_errors[live_source["id"]] = str(exc)
        print(f"[{market}] {live_source['id']} fetch failed: {exc}")

    for year in YEARS:
        parsed = []

        for source in configured:
            if source.get("years") and year not in source["years"]:
                continue

            source_for_year = dict(source)
            source_for_year["url"] = source["url"].replace("{year}", str(year))

            html = shared_html.get(source["id"])
            if html is None and "{year}" in source["url"]:
                try:
                    html = fetch_html(source_for_year["url"], timeout=15)
                except Exception as exc:
                    source_errors[f"{source['id']}:{year}"] = str(exc)
                    print(f"[{market}] {year} {source['id']} fetch failed: {exc}")
                    continue
            if html is None:
                continue

            try:
                rows = parse_source_year(html, market, source_for_year, year)
                parsed.append((source_for_year, rows))
                print(f"[{market}] {year} {source['id']} rows={len(rows)}")
            except Exception as exc:
                print(f"[{market}] {year} {source['id']} parse failed: {exc}")

        # LiveNomor is used only as an additional current-year check.
        if year == 2026:
            live_html = shared_html.get(live_source["id"])
            if live_html:
                try:
                    live_rows = parse_weekday_grid(
                        live_html, market, live_source, year
                    )
                    parsed.append((
                        {
                            **live_source,
                            "priority": 5,
                        },
                        live_rows,
                    ))
                    print(
                        f"[{market}] {year} {live_source['id']} "
                        f"rows={len(live_rows)}"
                    )
                except Exception as exc:
                    print(
                        f"[{market}] {year} {live_source['id']} "
                        f"parse failed: {exc}"
                    )

        if len(parsed) < 2:
            raise CollectorError(
                f"{market} {year}: butuh >=2 sumber historis independen, "
                f"berhasil={len(parsed)}, errors={source_errors}"
            )

        # Pairwise compatibility: only cluster sources that substantially
        # overlap and agree on at least 99.5% of the overlapping dates.
        pair_reports = []
        compatible = {source["id"]: set() for source, _ in parsed}

        for i in range(len(parsed)):
            source_a, rows_a = parsed[i]
            map_a = {item.result_date: item.number for item in rows_a}

            for j in range(i + 1, len(parsed)):
                source_b, rows_b = parsed[j]
                map_b = {item.result_date: item.number for item in rows_b}
                common_dates = sorted(set(map_a) & set(map_b))
                matches = sum(map_a[d] == map_b[d] for d in common_dates)
                ratio = matches / len(common_dates) if common_dates else 0.0

                report = {
                    "source_a": source_a["id"],
                    "source_b": source_b["id"],
                    "common": len(common_dates),
                    "matches": matches,
                    "mismatches": len(common_dates) - matches,
                    "match_ratio": ratio,
                }
                pair_reports.append(report)

                min_overlap = 100 if year < 2026 else 60
                if len(common_dates) >= min_overlap and ratio >= 0.99:
                    compatible[source_a["id"]].add(source_b["id"])
                    compatible[source_b["id"]].add(source_a["id"])

        ranked = sorted(
            parsed,
            key=lambda pair: (
                -len(compatible[pair[0]["id"]]),
                pair[0].get("priority", 999),
            ),
        )

        anchor_source, anchor_rows = ranked[0]
        peers = compatible[anchor_source["id"]]
        cluster = [
            (source, rows)
            for source, rows in parsed
            if source["id"] == anchor_source["id"] or source["id"] in peers
        ]

        if len(cluster) < 2:
            raise CollectorError(
                f"{market} {year}: tidak ada cluster >=2 sumber yang cocok; "
                f"pair_reports={pair_reports}"
            )

        maps = [
            (source, {item.result_date: item for item in rows})
            for source, rows in cluster
        ]
        anchor_map = maps[0][1]

        year_verified = 0
        for d, item in anchor_map.items():
            agreeing_ids = []
            for source, item_map in maps:
                other = item_map.get(d)
                if other and other.number == item.number:
                    agreeing_ids.append(source["id"])

            if len(agreeing_ids) < 2:
                continue

            old = existing.get(d.isoformat())
            period = (
                old.get("periode")
                if old and old.get("nomor") == item.number
                else None
            )
            combined[d] = make_record(
                item,
                f"crosschecked_{len(agreeing_ids)}_sources",
                agreeing_ids,
                period=period,
            )
            year_verified += 1

        minimum = 350 if year < 2026 else 200
        if year_verified < minimum:
            raise CollectorError(
                f"{market} {year}: verified coverage terlalu rendah "
                f"{year_verified} draws; "
                f"cluster={[entry[0]['id'] for entry in cluster]}"
            )

        verification_years[str(year)] = {
            "verified_rows": year_verified,
            "cluster_sources": [source["id"] for source, _ in cluster],
            "all_parsed_sources": [
                {"id": source["id"], "rows": len(rows)}
                for source, rows in parsed
            ],
            "pair_reports": pair_reports,
        }

        print(
            f"[{market}] {year}: VERIFIED={year_verified} "
            f"cluster={[entry[0]['id'] for entry in cluster]}"
        )

    rows = [combined[d] for d in sorted(combined, reverse=True)]
    return rows, verification_years

def resolve_sgp_period(d: date) -> str:
    anchor_date = SGP_PERIOD_RULE["anchor_date"]
    anchor_number = SGP_PERIOD_RULE["anchor_number"]
    weekdays = SGP_PERIOD_RULE["weekdays"]

    if d == anchor_date:
        number = anchor_number
    elif d > anchor_date:
        number = anchor_number
        cursor = anchor_date + timedelta(days=1)
        while cursor <= d:
            if cursor.weekday() in weekdays:
                number += 1
            cursor += timedelta(days=1)
    else:
        number = anchor_number
        cursor = d + timedelta(days=1)
        while cursor <= anchor_date:
            if cursor.weekday() in weekdays:
                number -= 1
            cursor += timedelta(days=1)

    return f"SGP-{number}"


def backfill_sgp_royaltoto():
    cache = {}
    all_rows = {}
    verification_years = {}

    for year in YEARS:
        parsed = []
        source_errors = {}

        for source in sorted(
            SGP_HISTORICAL_SOURCES,
            key=lambda item: item.get("priority", 999),
        ):
            if source.get("years") and year not in source["years"]:
                continue

            runtime = dict(source)
            runtime["url"] = source["url"].replace("{year}", str(year))
            url = runtime["url"]

            try:
                if url not in cache:
                    cache[url] = fetch_html(url, timeout=18)
                rows = parse_source_year(cache[url], "SGP", runtime, year)
                parsed.append((runtime, rows))
                print(
                    f"[SGP] {year} source={runtime['id']} "
                    f"rows={len(rows)}"
                )
            except Exception as exc:
                source_errors[runtime["id"]] = str(exc)
                print(
                    f"[SGP] {year} source={runtime['id']} "
                    f"ERROR: {exc}"
                )

        if len(parsed) < 2:
            raise CollectorError(
                f"SGP {year}: sumber historis berhasil <2; "
                f"errors={source_errors}"
            )

        maps = {
            source["id"]: {
                item.result_date: item
                for item in rows
            }
            for source, rows in parsed
        }
        source_meta = {
            source["id"]: source
            for source, _ in parsed
        }

        pair_reports = []
        compatible = {source_id: set() for source_id in maps}

        source_ids = list(maps)
        for i in range(len(source_ids)):
            a_id = source_ids[i]
            a = maps[a_id]

            for j in range(i + 1, len(source_ids)):
                b_id = source_ids[j]
                b = maps[b_id]
                common = sorted(set(a) & set(b))
                matches = sum(
                    a[d].number == b[d].number
                    for d in common
                )
                ratio = matches / len(common) if common else 0.0

                pair_reports.append({
                    "source_a": a_id,
                    "source_b": b_id,
                    "common": len(common),
                    "matches": matches,
                    "mismatches": len(common) - matches,
                    "match_ratio": ratio,
                })

                # Full-year archive pairs should overlap broadly.
                # For the running year, a recent-only checker such as
                # NexiPools is allowed when at least 20 dates overlap.
                min_overlap = 200 if year < 2026 else 20
                if len(common) >= min_overlap and ratio >= 0.995:
                    compatible[a_id].add(b_id)
                    compatible[b_id].add(a_id)

        # Every stored draw must have exact agreement from at least two
        # independent sources. We do not preserve the older 3-day-only
        # Singapore Pools archive in the target dataset.
        all_dates = sorted(
            set().union(*(set(item_map) for item_map in maps.values()))
        )
        verified_for_year = {}

        priority = {
            source["id"]: source.get("priority", 999)
            for source, _ in parsed
        }

        for d in all_dates:
            candidates = []
            for source_id, item_map in maps.items():
                item = item_map.get(d)
                if item:
                    candidates.append(item)

            by_number = {}
            for item in candidates:
                by_number.setdefault(item.number, []).append(item)

            ranked_numbers = sorted(
                by_number.items(),
                key=lambda pair: (
                    -len(pair[1]),
                    min(priority.get(x.source_id, 999) for x in pair[1]),
                ),
            )
            if not ranked_numbers:
                continue

            number, agreeing = ranked_numbers[0]
            agreeing_ids = sorted(
                {item.source_id for item in agreeing},
                key=lambda source_id: priority.get(source_id, 999),
            )
            if len(agreeing_ids) < 2:
                continue

            # Ignore impossible off-schedule dates for this target market.
            if d.weekday() not in SGP_PERIOD_RULE["weekdays"]:
                continue

            chosen_id = agreeing_ids[0]
            chosen = next(
                item for item in agreeing
                if item.source_id == chosen_id
            )
            chosen.period = resolve_sgp_period(d)

            verified_for_year[d] = make_record(
                chosen,
                f"crosschecked_{len(agreeing_ids)}_sources",
                agreeing_ids,
                period=chosen.period,
            )

        minimum = 250 if year < 2026 else 180
        if len(verified_for_year) < minimum:
            raise CollectorError(
                f"SGP {year}: verified RoyalToto-style coverage "
                f"terlalu rendah {len(verified_for_year)}; "
                f"sources={[(s['id'], len(r)) for s, r in parsed]}; "
                f"errors={source_errors}"
            )

        # Strong integrity guard: historic full years should be close to the
        # five-draw-per-week calendar, while 2026 is partial.
        weekdays_seen = sorted(
            {d.weekday() for d in verified_for_year}
        )
        if any(day not in SGP_PERIOD_RULE["weekdays"] for day in weekdays_seen):
            raise CollectorError(
                f"SGP {year}: ditemukan hari di luar kalender target "
                f"{weekdays_seen}"
            )

        all_rows.update(verified_for_year)
        verification_years[str(year)] = {
            "verified_rows": len(verified_for_year),
            "period_first": resolve_sgp_period(min(verified_for_year)),
            "period_last": resolve_sgp_period(max(verified_for_year)),
            "date_first": min(verified_for_year).isoformat(),
            "date_last": max(verified_for_year).isoformat(),
            "sources": [
                {
                    "id": source["id"],
                    "rows": len(rows),
                    "compatible_peers": sorted(
                        compatible.get(source["id"], set())
                    ),
                }
                for source, rows in parsed
            ],
            "pair_reports": pair_reports,
            "source_errors": source_errors,
        }

        print(
            f"[SGP] {year}: VERIFIED={len(verified_for_year)} "
            f"{min(verified_for_year)}..{max(verified_for_year)} "
            f"{resolve_sgp_period(min(verified_for_year))}.."
            f"{resolve_sgp_period(max(verified_for_year))}"
        )

    rows = [
        all_rows[d]
        for d in sorted(all_rows, reverse=True)
    ]

    # Explicit sanity checks against the RoyalToto-style target feed.
    expected_recent = {
        date(2026, 9, 17): ("SGP-2478", "2131"),
        date(2026, 9, 16): ("SGP-2477", "9224"),
        date(2026, 9, 14): ("SGP-2476", "5470"),
        date(2026, 9, 13): ("SGP-2475", "9400"),
        date(2026, 9, 12): ("SGP-2474", "2710"),
    }
    lookup = {
        date.fromisoformat(row["result_date"]): row
        for row in rows
    }
    for d, (period, number) in expected_recent.items():
        row = lookup.get(d)
        if not row:
            raise CollectorError(
                f"SGP sanity check missing {d}"
            )
        if row["periode"] != period or row["nomor"] != number:
            raise CollectorError(
                f"SGP sanity check mismatch {d}: "
                f"{row['periode']} {row['nomor']} != "
                f"{period} {number}"
            )

    return rows, verification_years

def write_json(path, data):
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

def main():
    now = datetime.now(ZoneInfo("Asia/Jakarta")).isoformat(timespec="seconds")
    report = {
        "generated_at": now,
        "target_years": YEARS,
        "markets": {},
    }

    # SGP target follows the RoyalToto-style five-day market
    # (Mon/Wed/Thu/Sat/Sun), cross-checked across independent archives.
    sgp_rows, sgp_ver = backfill_sgp_royaltoto()
    write_json(DATA_DIR / "sgp.json", sgp_rows)

    # HK/SDY historical mirrors are best-effort here. If a mirror blocks the
    # GitHub runner, keep the already verified current-year collector data and
    # record the archive gap instead of blocking the official SGP backfill.
    for market in ("HK", "SDY"):
        try:
            rows, ver = backfill_hk_sdy(market)
            write_json(DATA_DIR / f"{market.lower()}.json", rows)
            report["markets"][market] = {
                "rows": len(rows),
                "period": [rows[-1]["result_date"], rows[0]["result_date"]] if rows else [],
                "verification_by_year": ver,
                "historical_status": "complete_2023_2026",
            }
        except Exception as exc:
            current_path = DATA_DIR / f"{market.lower()}.json"
            current_rows = json.loads(current_path.read_text(encoding="utf-8"))
            report["markets"][market] = {
                "rows": len(current_rows),
                "period": [
                    current_rows[-1].get("result_date"),
                    current_rows[0].get("result_date"),
                ] if current_rows else [],
                "historical_status": "pending_external_archive",
                "error": str(exc),
            }
            print(f"[{market}] historical archive pending: {exc}")

    report["markets"]["SGP"] = {
        "rows": len(sgp_rows),
        "period": [sgp_rows[-1]["result_date"], sgp_rows[0]["result_date"]] if sgp_rows else [],
        "verification": "RoyalToto-style SGP, minimum two-source exact agreement",
        "schedule": "Monday, Wednesday, Thursday, Saturday, Sunday",
        "period_anchor": "SGP-2474 @ 2026-09-12",
        "verification_by_year": sgp_ver,
        "historical_status": "complete_2023_2026",
    }

    write_json(REPORT_PATH, report)
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
