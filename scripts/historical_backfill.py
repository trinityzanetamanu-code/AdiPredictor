#!/usr/bin/env python3
import base64
import json
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime
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
            re.sub(r"\\s+", " ", line).strip()
            for line in soup.get_text("\\n", strip=True).splitlines()
            if line.strip()
        ]
        for i, line in enumerate(lines):
            m = re.search(
                r"(?:(?:Min|Sen|Sel|Rab|Kam|Jum|Sab)\\s+)?"
                r"(?<!\\d)(\\d{1,2})/(\\d{1,2})(?!\\d)",
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
                if re.fullmatch(r"\\d", nxt):
                    digits.append(nxt)
                    if len(digits) == 4:
                        break
                elif digits and re.search(r"\\d{1,2}/\\d{1,2}", nxt):
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
    if not tables:
        raise CollectorError("Angkaweb tidak memiliki table")

    def four_digit_tokens(table):
        tokens = []
        for cell in table.find_all(["td", "th"]):
            text = cell.get_text(" ", strip=True)
            tokens.extend(re.findall(r"(?<!\\d)(\\d{4})(?!\\d)", text))
        return tokens

    table_tokens = [(four_digit_tokens(table), table) for table in tables]
    tokens, _ = max(table_tokens, key=lambda pair: len(pair[0]))
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


def parse_source_year(html: str, market: str, source: dict, year: int):
    parser = source.get("parser", "weekday4")

    if parser == "weekday4":
        return parse_weekday_grid(html, market, source, year)
    if parser == "weekday6_last4":
        return parse_weekday_grid_6_last4(html, market, source, year)
    if parser == "hk_anchor_sequence":
        return parse_hk_anchor_sequence(html, market, source, year)
    if parser == "date_result4":
        return parse_date_result_table(html, market, source, year)

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
                if len(common_dates) >= min_overlap and ratio >= 0.995:
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

def sgp_token(draw_number):
    raw = f"DrawNumber={draw_number}".encode("utf-8")
    return base64.b64encode(raw).decode("ascii")

def parse_sgp_official_page(html, draw_number):
    soup = BeautifulSoup(html, "html.parser")
    text = re.sub(r"\s+", " ", soup.get_text(" ", strip=True))

    m = re.search(
        r"(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s*"
        r"(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})\s*"
        r".{0,160}?Draw\s+No\.\s*(\d+)\s*"
        r".{0,220}?1st\s+Prize\D{0,40}(\d{4})",
        text,
        flags=re.I,
    )
    if not m:
        return None

    month_map = {
        "jan":1,"feb":2,"mar":3,"apr":4,"may":5,"jun":6,
        "jul":7,"aug":8,"sep":9,"oct":10,"nov":11,"dec":12,
    }
    month = month_map.get(m.group(2).lower())
    if not month:
        return None

    try:
        d = date(int(m.group(3)), month, int(m.group(1)))
    except ValueError:
        return None

    if int(m.group(4)) != draw_number:
        return None

    return {
        "date": d,
        "draw": draw_number,
        "number": m.group(5),
    }

def fetch_sgp_draw(draw_number):
    token = sgp_token(draw_number)
    url = SGP_OFFICIAL_URL.format(token=token)
    headers = {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-SG,en;q=0.9",
    }
    for attempt in range(3):
        try:
            r = requests.get(url, headers=headers, timeout=25)
            if r.status_code == 200 and len(r.text) > 500:
                parsed = parse_sgp_official_page(r.text, draw_number)
                if parsed:
                    parsed["url"] = url
                    return parsed
        except Exception:
            pass
        time.sleep(0.5 * (attempt + 1))
    return None

def backfill_sgp():
    current_path = DATA_DIR / "sgp.json"
    if current_path.exists():
        try:
            current_rows = json.loads(current_path.read_text(encoding="utf-8"))
            official_rows = [
                row for row in current_rows
                if row.get("source_id") == "singaporepools_official"
                and str(row.get("result_date", ""))[:4] in {"2023", "2024", "2025", "2026"}
            ]
            dates = sorted(row.get("result_date") for row in official_rows if row.get("result_date"))
            if (
                len(official_rows) >= 550
                and dates
                and dates[0] <= "2023-01-01"
                and dates[-1] >= "2026-09-16"
            ):
                year_counts = {}
                for row in official_rows:
                    year = str(row["result_date"])[:4]
                    year_counts[year] = year_counts.get(year, 0) + 1
                official_rows.sort(key=lambda row: row["result_date"], reverse=True)
                print(f"[SGP] reuse verified official archive rows={len(official_rows)} counts={year_counts}")
                return official_rows, year_counts
        except Exception as exc:
            print(f"[SGP] existing official archive reuse failed: {exc}")

    results = []
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {
            pool.submit(fetch_sgp_draw, draw): draw
            for draw in range(SGP_DRAW_MIN, SGP_DRAW_MAX + 1)
        }
        for future in as_completed(futures):
            item = future.result()
            if item and item["date"].year in YEARS:
                results.append(item)

    results.sort(key=lambda x: x["date"])
    by_date = {}
    for item in results:
        by_date[item["date"]] = item

    rows = []
    year_counts = {}
    for d in sorted(by_date, reverse=True):
        item = by_date[d]
        year_counts[str(d.year)] = year_counts.get(str(d.year), 0) + 1
        rows.append({
            "id": int(d.strftime("%Y%m%d")),
            "tanggal": format_date_id(d),
            "periode": f"SGP-{item['draw']}",
            "nomor": item["number"],
            "result_date": d.isoformat(),
            "market": "SGP",
            "source_id": "singaporepools_official",
            "source_name": "Singapore Pools Official 4D",
            "source_url": item["url"],
            "source_ids": ["singaporepools_official"],
            "verification": "official_primary",
            "confirmations": 1,
        })

    if len(rows) < 500:
        raise CollectorError(f"SGP official historical fetch terlalu sedikit: {len(rows)}")

    print(f"[SGP] official rows={len(rows)} counts={year_counts}")
    return rows, year_counts

def write_json(path, data):
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

def main():
    now = datetime.now(ZoneInfo("Asia/Jakarta")).isoformat(timespec="seconds")
    report = {
        "generated_at": now,
        "target_years": YEARS,
        "markets": {},
    }

    # SGP uses Singapore Pools official individual draw pages and is required.
    sgp_rows, sgp_counts = backfill_sgp()
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
        "verification": "Singapore Pools official individual draw pages",
        "year_counts": sgp_counts,
        "draw_range_scanned": [SGP_DRAW_MIN, SGP_DRAW_MAX],
    }

    write_json(REPORT_PATH, report)
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
