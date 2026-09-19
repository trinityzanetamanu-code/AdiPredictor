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
    normalize_day,
    normalize_cell,
    candidate_tables,
)

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "public" / "data"
REPORT_PATH = DATA_DIR / "historical-verification.json"
REFERENCE_DIR = ROOT / "data" / "reference"
YEARS = [2023, 2024, 2025, 2026]

LOCAL_REFERENCE_FILES = {
    "HK": {
        "id": "user_archive_hk_angkeluar",
        "name": "User HK archive snapshot (AngkaKeluarHariIni)",
        "path": REFERENCE_DIR / "hk_user_archive_2023_2026.json",
        "url": "https://angkakeluarhariini.com/",
        "years": [2023, 2024, 2025, 2026],
        "priority": 3,
    },
    "SDY": {
        "id": "user_archive_sdy_datasdywp",
        "name": "User SDY archive snapshot (DataSDYWP)",
        "path": REFERENCE_DIR / "sdy_user_archive_2024_2026.json",
        "url": "https://www.datasdywp.com/",
        "years": [2024, 2025, 2026],
        "priority": 3,
    },
}

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
            "id": "condor_hk_archive",
            "name": "Condor HK Archive",
            "url": "https://condor-airpictures.de/",
            "parser": "text_forward_weekday7",
            "heading_regex": r"TAHUN\s+{year}",
            "years": [2023],
            "priority": 8,
        },
        {
            "id": "serbialadies_hk_archive",
            "name": "SerbiaLadiesOpen HK Archive",
            "url": "https://serbialadiesopen.org/",
            "parser": "text_forward_weekday7",
            "heading_regex": r"TAHUN\s+{year}",
            "years": [2023],
            "priority": 9,
        },
        {
            "id": "datahkpro_archive",
            "name": "DataHKPro Archive",
            "url": "https://datahkpro.site/",
            "parser": "reverse_weekday7",
            "heading_regex": r"(?:Data Keluaran HK|Data HK|Rekap Keluaran HK|Pengeluaran HK).*{year}",
            "priority": 12,
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
            "id": "saltwind_sdy_2023",
            "name": "Saltwind Sydney 2023 Archive",
            "url": "https://saltwind.co.uk/",
            "parser": "text_forward_weekday7",
            "heading_regex": r"TAHUN\s+{year}",
            "years": [2023],
            "priority": 4,
        },
        {
            "id": "datatogel_sdy_archive",
            "name": "Datatogel Sydney Archive",
            "url": "https://w2.datatogel.fit/data-sdy/",
            "parser": "weekday4",
            "heading_regex": r"(?:Data Sydney|Data SDY|Data Pengeluaran Sydney)\s+{year}",
            "priority": 10,
        },
    ],
}

SGP_HISTORICAL_SOURCES = [
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
        "parser": "text_weekday5",
        "heading_regex": r"DATA SGP TAHUN\s+{year}",
        "priority": 30,
    },
    {
        "id": "buzzbike_sgp_2023",
        "name": "MKTOTO SGP 2023 Archive",
        "url": "https://www.buzzbike.cc/data-sgp-2023/",
        "parser": "text_weekday5",
        "heading_regex": r"(?:Tabel Keluaran SGP|Data SGP)\s+{year}",
        "years": [2023],
        "priority": 35,
    },
    {
        "id": "datasingap_archive",
        "name": "DataSingap Archive",
        "url": "https://datasingap.com/",
        "parser": "text_weekday5",
        "heading_regex": r"DATA SGP TAHUN\s+{year}",
        "priority": 36,
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

DAILY_PERIOD_RULES = {
    "HK": {
        "prefix": "HK",
        "anchor_date": date(2026, 9, 17),
        "anchor_number": 3547,
    },
    "SDY": {
        "prefix": "SD",
        "anchor_date": date(2026, 9, 17),
        "anchor_number": 3547,
    },
}


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
        re.sub(r"\s+", " ", line).strip()
        for line in soup.get_text("\n", strip=True).splitlines()
        if line.strip()
    ]

    start_patterns = [
        rf"Data Sydney\s+{year}",
        rf"Data SDY Pools\s+{year}",
        rf"Data SDY\s+{year}",
    ]
    start_idx = None
    for idx, line in enumerate(raw_lines):
        if any(
            re.search(pattern, line, flags=re.I)
            for pattern in start_patterns
        ):
            start_idx = idx
            break

    if start_idx is None:
        raise CollectorError(
            f"Split weekday: heading {year} tidak ditemukan"
        )

    end_idx = len(raw_lines)
    for idx in range(start_idx + 1, len(raw_lines)):
        line = raw_lines[idx]
        if re.search(
            rf"(?:Data Sydney|Data SDY Pools|Data SDY)\s+{year + 1}",
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

    # Sydney Pools appears before Sydney Lotto. Keep the first occurrence
    # of each weekday, which selects the target Sydney Pools section.
    unique = {}
    for idx, day_idx in headings:
        unique.setdefault(day_idx, idx)
    headings = sorted(
        (idx, day_idx)
        for day_idx, idx in unique.items()
    )

    if len(headings) < 7:
        raise CollectorError(
            f"Split weekday: hanya {len(headings)} weekday heading ditemukan"
        )

    results = []
    for pos, (idx, day_idx) in enumerate(headings):
        section_end = (
            headings[pos + 1][0]
            if pos + 1 < len(headings)
            else len(segment)
        )
        values = []
        for line in segment[idx + 1:section_end]:
            if re.fullmatch(r"(?:xxxx|xxx|\d{4})", line, flags=re.I):
                values.append(
                    None if line.lower().startswith("xxx") else line
                )

        jan1 = date(year, 1, 1)
        first_monday = jan1 - timedelta(days=jan1.weekday())

        for week_index, number in enumerate(values):
            if not number:
                continue
            d = first_monday + timedelta(
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

    dedup = {item.result_date: item for item in results}
    out = [dedup[d] for d in sorted(dedup)]
    minimum = 200 if year == 2026 else 350
    if len(out) < minimum:
        raise CollectorError(
            f"Split weekday parser {year} hanya menemukan {len(out)} result"
        )
    return out


def parse_text_weekday5(html: str, market: str, source: dict, year: int):
    soup = BeautifulSoup(html, "html.parser")
    lines = [
        re.sub(r"\s+", " ", line).strip()
        for line in soup.get_text("\n", strip=True).splitlines()
        if line.strip()
    ]

    heading_pattern = source.get(
        "heading_regex",
        r"DATA SGP TAHUN\s+{year}",
    ).replace("{year}", str(year))

    start_idx = None
    for idx, line in enumerate(lines):
        if re.search(heading_pattern, line, flags=re.I):
            start_idx = idx
            break
    if start_idx is None:
        raise CollectorError(
            f"Text weekday5: heading {year} tidak ditemukan"
        )

    # Find the five-column header. Some sites put all labels in one node;
    # others put each label in a separate table cell.
    required_days = {"sen", "rab", "kam", "sab", "min"}
    seen_days = set()
    data_start = None
    for idx in range(start_idx + 1, min(len(lines), start_idx + 80)):
        tokens = re.findall(
            r"\b(?:sen(?:in)?|rab(?:u)?|kam(?:is)?|sab(?:tu)?|min(?:ggu)?)\b",
            lines[idx].lower(),
        )
        for token in tokens:
            if token.startswith("sen"):
                seen_days.add("sen")
            elif token.startswith("rab"):
                seen_days.add("rab")
            elif token.startswith("kam"):
                seen_days.add("kam")
            elif token.startswith("sab"):
                seen_days.add("sab")
            elif token.startswith("min"):
                seen_days.add("min")
        if required_days.issubset(seen_days):
            data_start = idx + 1
            break

    if data_start is None:
        raise CollectorError(
            f"Text weekday5: header 5 hari {year} tidak ditemukan"
        )

    values = []
    heading_any_year = re.compile(
        r"(?:DATA\s+SGP\s+TAHUN|TAHUN|Data\s+SGP|"
        r"Tabel\s+Keluaran\s+SGP)[^0-9]*(20\d{2})",
        flags=re.I,
    )

    for line in lines[data_start:]:
        year_match = heading_any_year.search(line)
        if year_match and int(year_match.group(1)) != year:
            break

        for token in re.findall(
            r"(?<!\d)(\d{4}|XXXX|XXX)(?!\d)",
            line,
            flags=re.I,
        ):
            values.append(None if token.upper().startswith("XXX") else token)

    if len(values) < 5:
        raise CollectorError(
            f"Text weekday5 {year}: token data terlalu sedikit {len(values)}"
        )

    # Keep complete five-column rows only. Placeholder cells are intentionally
    # preserved so partial first/last calendar weeks do not shift dates.
    row_count = len(values) // 5
    values = values[: row_count * 5]

    target_weekdays = [0, 2, 3, 5, 6]
    jan1 = date(year, 1, 1)
    first_monday = jan1 - timedelta(days=jan1.weekday())
    results = []

    for week_index in range(row_count):
        row_values = values[week_index * 5:(week_index + 1) * 5]
        for col, number in enumerate(row_values):
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

    dedup = {item.result_date: item for item in results}
    out = [dedup[d] for d in sorted(dedup)]

    minimum = 180 if year == 2026 else 250
    if len(out) < minimum:
        raise CollectorError(
            f"Text weekday5 {year}: hanya {len(out)} result "
            f"dari {len(values)} token"
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


def parse_reverse_weekday7(html: str, market: str, source: dict, year: int):
    soup = BeautifulSoup(html, "html.parser")
    tables = list(
        candidate_tables(
            soup,
            source["heading_regex"],
            year,
        )
    )
    if not tables:
        raise CollectorError(
            f"Reverse weekday7: table {year} tidak ditemukan"
        )

    scored = []
    for table in tables:
        cells = table.find_all(["td", "th"])
        four_count = sum(
            1
            for cell in cells
            if normalize_cell(cell.get_text(" ", strip=True))
        )
        day_count = 0
        for row in table.find_all("tr")[:20]:
            mapped = [
                normalize_day(cell.get_text(" ", strip=True))
                for cell in row.find_all(["td", "th"])
            ]
            day_count = max(
                day_count,
                sum(day is not None for day in mapped),
            )
        scored.append((day_count * 1000 + four_count, table))

    scored.sort(key=lambda item: item[0], reverse=True)
    _, table = scored[0]
    rows = table.find_all("tr")

    header_idx = None
    for idx, row in enumerate(rows[:20]):
        mapped = [
            normalize_day(cell.get_text(" ", strip=True))
            for cell in row.find_all(["td", "th"])
        ]
        if sum(day is not None for day in mapped) >= 5:
            header_idx = idx
            break

    if header_idx is None:
        raise CollectorError(
            f"Reverse weekday7: header {year} tidak ditemukan"
        )

    # Completed years start from the final calendar week. The current year
    # starts from the current week because its top row is still partial.
    today = date.today()
    if year < today.year:
        reference = date(year, 12, 31)
    else:
        reference = min(today, date(year, 12, 31))

    top_monday = reference - timedelta(days=reference.weekday())
    results = []
    week_index = 0

    for row in rows[header_idx + 1:]:
        cells = row.find_all(["td", "th"])
        if not cells:
            continue

        # Preserve blank columns. These pages normally render seven weekday
        # cells even when the first/last week is partial.
        values = [
            normalize_cell(cell.get_text(" ", strip=True))
            for cell in cells
        ]

        if len(values) < 7:
            # Rows with fewer than seven cells cannot be positioned safely.
            # Skip obvious non-data rows without advancing the week.
            if not any(values):
                continue
            values = values + [""] * (7 - len(values))
        elif len(values) > 7:
            values = values[-7:]

        if not any(values):
            # A current-week placeholder row still represents a calendar week.
            text = row.get_text(" ", strip=True).lower()
            if any(token in text for token in ("tunggu", "wait", "xxxx")):
                week_index += 1
            continue

        monday = top_monday - timedelta(days=week_index * 7)
        for col, number in enumerate(values[:7]):
            if not number:
                continue
            d = monday + timedelta(days=col)
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
    minimum = 200 if year == 2026 else 350
    if len(out) < minimum:
        raise CollectorError(
            f"Reverse weekday7 {year}: hanya {len(out)} result"
        )
    return out


def parse_forward_weekday7(html: str, market: str, source: dict, year: int):
    soup = BeautifulSoup(html, "html.parser")
    tables = list(
        candidate_tables(
            soup,
            source["heading_regex"],
            year,
        )
    )
    if not tables:
        raise CollectorError(
            f"Forward weekday7: table {year} tidak ditemukan"
        )

    scored = []
    for table in tables:
        four_count = sum(
            1
            for cell in table.find_all(["td", "th"])
            if normalize_cell(cell.get_text(" ", strip=True))
        )
        day_count = 0
        for row in table.find_all("tr")[:20]:
            mapped = [
                normalize_day(cell.get_text(" ", strip=True))
                for cell in row.find_all(["td", "th"])
            ]
            day_count = max(
                day_count,
                sum(day is not None for day in mapped),
            )
        scored.append((day_count * 1000 + four_count, table))

    scored.sort(key=lambda item: item[0], reverse=True)
    _, table = scored[0]
    rows = table.find_all("tr")

    header_idx = None
    for idx, row in enumerate(rows[:20]):
        mapped = [
            normalize_day(cell.get_text(" ", strip=True))
            for cell in row.find_all(["td", "th"])
        ]
        if sum(day is not None for day in mapped) >= 5:
            header_idx = idx
            break

    if header_idx is None:
        raise CollectorError(
            f"Forward weekday7: header {year} tidak ditemukan"
        )

    jan1 = date(year, 1, 1)
    first_monday = jan1 - timedelta(days=jan1.weekday())
    first_full_monday = (
        jan1
        if jan1.weekday() == 0
        else jan1 + timedelta(days=7 - jan1.weekday())
    )

    data_rows = []
    for row in rows[header_idx + 1:]:
        cells = row.find_all(["td", "th"])
        if not cells:
            continue
        values = [
            normalize_cell(cell.get_text(" ", strip=True))
            for cell in cells
        ]
        if not any(values):
            continue
        if len(values) > 7:
            values = values[-7:]
        elif len(values) < 7:
            values = values + [""] * (7 - len(values))
        data_rows.append(values[:7])

    if not data_rows:
        raise CollectorError(
            f"Forward weekday7 {year}: tidak ada data rows"
        )

    # If the first row has values only in the weekdays that belong to the
    # opening partial calendar week, anchor it at first_monday. Otherwise,
    # the archive starts from the first full Monday (common for HK mirrors).
    opening_valid_cols = {
        idx
        for idx in range(7)
        if (first_monday + timedelta(days=idx)).year == year
    }
    first_nonempty = {
        idx for idx, value in enumerate(data_rows[0]) if value
    }
    has_partial_opening_row = bool(first_nonempty) and first_nonempty.issubset(
        opening_valid_cols
    ) and len(opening_valid_cols) < 7

    start_monday = (
        first_monday if has_partial_opening_row else first_full_monday
    )

    results = []
    for week_index, values in enumerate(data_rows):
        monday = start_monday + timedelta(days=week_index * 7)
        for col, number in enumerate(values):
            if not number:
                continue
            d = monday + timedelta(days=col)
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

    dedup = {item.result_date: item for item in results}
    out = [dedup[d] for d in sorted(dedup)]
    minimum = 200 if year == 2026 else 350
    if len(out) < minimum:
        raise CollectorError(
            f"Forward weekday7 {year}: hanya {len(out)} result"
        )
    return out


def parse_text_forward_weekday7(html: str, market: str, source: dict, year: int):
    soup = BeautifulSoup(html, "html.parser")
    lines = [
        re.sub(r"\s+", " ", line).strip()
        for line in soup.get_text("\n", strip=True).splitlines()
        if line.strip()
    ]

    heading_pattern = source.get(
        "heading_regex",
        r"TAHUN\s+{year}",
    ).replace("{year}", str(year))

    start_idx = None
    for idx, line in enumerate(lines):
        if re.search(heading_pattern, line, flags=re.I):
            start_idx = idx
            break

    if start_idx is None:
        raise CollectorError(
            f"Text forward weekday7: heading {year} tidak ditemukan"
        )

    # Find the weekday header, allowing one label per line or one combined row.
    day_hits = set()
    data_start = None
    aliases = {
        "sen": 0, "senin": 0,
        "sel": 1, "selasa": 1,
        "rab": 2, "rabu": 2,
        "kam": 3, "kamis": 3,
        "jum": 4, "jumat": 4, "jum'at": 4,
        "sab": 5, "sabtu": 5,
        "min": 6, "minggu": 6,
    }

    for idx in range(start_idx + 1, min(len(lines), start_idx + 50)):
        tokens = re.findall(r"[A-Za-z']+", lines[idx].lower())
        for token in tokens:
            if token in aliases:
                day_hits.add(aliases[token])
        if len(day_hits) >= 5:
            data_start = idx + 1
            break

    if data_start is None:
        raise CollectorError(
            f"Text forward weekday7: header {year} tidak ditemukan"
        )

    # These mirrors start at the first full Monday week. This intentionally
    # omits an opening Sunday such as 01-Jan-2023; another source may cover it.
    jan1 = date(year, 1, 1)
    first_full_monday = (
        jan1
        if jan1.weekday() == 0
        else jan1 + timedelta(days=7 - jan1.weekday())
    )
    max_slots = (date(year, 12, 31) - first_full_monday).days + 1

    values = []
    for line in lines[data_start:]:
        if re.search(
            r"\bTAHUN\s+20\d{2}\b",
            line,
            flags=re.I,
        ) and str(year) not in line:
            break

        for token in re.findall(
            r"(?<!\d)(\d{4}|XXXX|XXX)(?!\d)",
            line,
            flags=re.I,
        ):
            values.append(
                None if token.upper().startswith("XXX") else token
            )
            if len(values) >= max_slots:
                break
        if len(values) >= max_slots:
            break

    if len(values) < min(300, max_slots - 20):
        raise CollectorError(
            f"Text forward weekday7 {year}: token terlalu sedikit "
            f"{len(values)}"
        )

    results = []
    for offset, number in enumerate(values[:max_slots]):
        if not number:
            continue
        d = first_full_monday + timedelta(days=offset)
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

    dedup = {item.result_date: item for item in results}
    out = [dedup[d] for d in sorted(dedup)]
    minimum = 200 if year == 2026 else 340
    if len(out) < minimum:
        raise CollectorError(
            f"Text forward weekday7 {year}: hanya {len(out)} result"
        )
    return out


def parse_source_year(html: str, market: str, source: dict, year: int):
    parser = source.get("parser", "weekday4")

    if parser == "weekday4":
        return parse_weekday_grid(html, market, source, year)
    if parser == "reverse_weekday7":
        return parse_reverse_weekday7(html, market, source, year)
    if parser == "forward_weekday7":
        return parse_forward_weekday7(html, market, source, year)
    if parser == "text_forward_weekday7":
        return parse_text_forward_weekday7(html, market, source, year)
    if parser == "weekday6_last4":
        return parse_weekday_grid_6_last4(html, market, source, year)
    if parser == "hk_anchor_sequence":
        return parse_hk_anchor_sequence(html, market, source, year)
    if parser == "split_weekday4":
        return parse_split_weekday4(html, market, source, year)
    if parser == "fixed_weekday5":
        return parse_fixed_weekday5(html, market, source, year)
    if parser == "text_weekday5":
        return parse_text_weekday5(html, market, source, year)
    if parser == "date_result4":
        return parse_date_result_table(html, market, source, year)
    if parser == "archive_digits4":
        return parse_archive_rows(html, market, source["url"], year)

    raise CollectorError(f"Parser historis tidak dikenal: {parser}")

def load_local_reference(market: str, year: int):
    cfg = LOCAL_REFERENCE_FILES.get(market)
    if not cfg or year not in cfg.get("years", []):
        return None

    path = cfg["path"]
    if not path.exists():
        raise CollectorError(
            f"{market} local reference tidak ditemukan: {path}"
        )

    payload = json.loads(path.read_text(encoding="utf-8"))
    rows = []
    for row in payload.get("records", []):
        result_date = date.fromisoformat(row["result_date"])
        if result_date.year != year:
            continue
        number = str(row["nomor"]).zfill(4)
        if not re.fullmatch(r"\d{4}", number):
            continue
        rows.append(ParsedResult(
            market=market,
            result_date=result_date,
            number=number,
            source_id=cfg["id"],
            source_name=cfg["name"],
            source_url=cfg["url"],
        ))

    rows.sort(key=lambda item: item.result_date)
    if not rows:
        return None

    return (
        {
            "id": cfg["id"],
            "name": cfg["name"],
            "url": cfg["url"],
            "priority": cfg.get("priority", 3),
            "local_reference": True,
        },
        rows,
    )


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

        local_reference = load_local_reference(market, year)
        if local_reference is not None:
            local_source, local_rows = local_reference
            parsed.append((local_source, local_rows))
            print(
                f"[{market}] {year} {local_source['id']} "
                f"rows={len(local_rows)}"
            )

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

        # Audit all source pairs, but do not require an entire source to be
        # perfect. Historical mirrors can contain isolated transcription errors.
        # A draw is stored only when at least two independent sources agree
        # exactly on that date and 4D result.
        pair_reports = []
        source_priority = {
            source["id"]: source.get("priority", 999)
            for source, _ in parsed
        }
        maps = {
            source["id"]: {
                item.result_date: item
                for item in rows
            }
            for source, rows in parsed
        }

        source_ids = list(maps)
        for i in range(len(source_ids)):
            a_id = source_ids[i]
            a = maps[a_id]
            for j in range(i + 1, len(source_ids)):
                b_id = source_ids[j]
                b = maps[b_id]
                common_dates = sorted(set(a) & set(b))
                matches = sum(
                    a[d].number == b[d].number
                    for d in common_dates
                )
                pair_reports.append({
                    "source_a": a_id,
                    "source_b": b_id,
                    "common": len(common_dates),
                    "matches": matches,
                    "mismatches": len(common_dates) - matches,
                    "match_ratio": (
                        matches / len(common_dates)
                        if common_dates else 0.0
                    ),
                })

        all_dates = sorted(
            set().union(*(set(item_map) for item_map in maps.values()))
        )
        year_verified = 0
        used_sources = set()
        unresolved_dates = []

        for d in all_dates:
            by_number = {}
            for source_id, item_map in maps.items():
                item = item_map.get(d)
                if item is None:
                    continue
                by_number.setdefault(item.number, []).append(
                    (source_id, item)
                )

            if not by_number:
                continue

            ranked = sorted(
                by_number.items(),
                key=lambda pair: (
                    -len(pair[1]),
                    min(
                        source_priority.get(source_id, 999)
                        for source_id, _ in pair[1]
                    ),
                    pair[0],
                ),
            )
            number, agreeing = ranked[0]
            agreeing_ids = sorted(
                {source_id for source_id, _ in agreeing},
                key=lambda source_id: source_priority.get(source_id, 999),
            )

            if len(agreeing_ids) < 2:
                unresolved_dates.append(d.isoformat())
                continue

            chosen_id = agreeing_ids[0]
            chosen = next(
                item
                for source_id, item in agreeing
                if source_id == chosen_id
            )
            period = resolve_daily_period(market, d)
            combined[d] = make_record(
                chosen,
                f"crosschecked_{len(agreeing_ids)}_sources",
                agreeing_ids,
                period=period,
            )
            year_verified += 1
            used_sources.update(agreeing_ids)

        minimum = 350 if year < 2026 else 200
        if year_verified < minimum:
            raise CollectorError(
                f"{market} {year}: verified coverage terlalu rendah "
                f"{year_verified} draws; "
                f"parsed_sources={[entry[0]['id'] for entry in parsed]}; "
                f"unresolved_sample={unresolved_dates[:10]}"
            )

        verification_years[str(year)] = {
            "verified_rows": year_verified,
            "consensus_sources": sorted(used_sources),
            "all_parsed_sources": [
                {"id": source["id"], "rows": len(rows)}
                for source, rows in parsed
            ],
            "pair_reports": pair_reports,
            "unresolved_dates": unresolved_dates[:50],
            "verification_rule": "exact agreement from >=2 independent sources per date",
        }

        print(
            f"[{market}] {year}: VERIFIED={year_verified} "
            f"consensus_sources={sorted(used_sources)}"
        )

    rows = [combined[d] for d in sorted(combined, reverse=True)]
    return rows, verification_years

def resolve_daily_period(market: str, d: date) -> str:
    rule = DAILY_PERIOD_RULES[market]
    delta = (d - rule["anchor_date"]).days
    return f"{rule['prefix']}-{rule['anchor_number'] + delta}"


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
