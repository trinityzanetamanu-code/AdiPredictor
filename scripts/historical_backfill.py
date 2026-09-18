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

ARCHIVE_URLS = {
    "HK": "https://tarikanpaito.net/data/hk/{year}",
    "SDY": "https://tarikanpaito.net/data/sdy/{year}",
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

    results = [out[d] for d in sorted(out)]
    return results

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
    live_source = LIVE_SOURCES[market]

    live_html = fetch_html(live_source["url"])

    for year in YEARS:
        live_results = []
        try:
            live_results = parse_weekday_grid(live_html, market, live_source, year)
        except Exception as exc:
            print(f"[{market}] LiveNomor {year} unavailable: {exc}")

        archive_url = ARCHIVE_URLS[market].format(year=year)
        archive_html = fetch_html(archive_url)
        archive_results = parse_archive_rows(archive_html, market, archive_url, year)

        if not archive_results:
            raise CollectorError(f"{market} {year}: archive source returned 0 rows")

        verification = verify_pair(live_results, archive_results, market, year) if live_results else {
            "common": 0, "matches": 0, "mismatches": [], "match_ratio": 0.0
        }

        # If LiveNomor exposes the same year, use only records that agree where overlap exists.
        # Otherwise keep the archive records, while preserving explicit verification metadata.
        primary_by_date = {x.result_date: x for x in archive_results}
        live_by_date = {x.result_date: x for x in live_results}

        for d, item in primary_by_date.items():
            source_ids = [item.source_id]
            status = "historical_archive"
            if d in live_by_date and live_by_date[d].number == item.number:
                source_ids = [live_by_date[d].source_id, item.source_id]
                status = "crosschecked_2_sources"
                item = live_by_date[d]

            old = existing.get(d.isoformat())
            period = old.get("periode") if old and old.get("nomor") == item.number else None
            combined[d] = make_record(item, status, source_ids, period=period)

        verification_years[str(year)] = {
            "archive_rows": len(archive_results),
            "live_rows": len(live_results),
            **verification,
        }
        print(
            f"[{market}] {year}: archive={len(archive_results)} "
            f"live={len(live_results)} matches={verification['matches']}"
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

    hk_rows, hk_ver = backfill_hk_sdy("HK")
    sdy_rows, sdy_ver = backfill_hk_sdy("SDY")
    sgp_rows, sgp_counts = backfill_sgp()

    write_json(DATA_DIR / "hk.json", hk_rows)
    write_json(DATA_DIR / "sdy.json", sdy_rows)
    write_json(DATA_DIR / "sgp.json", sgp_rows)

    report["markets"]["HK"] = {
        "rows": len(hk_rows),
        "period": [hk_rows[-1]["result_date"], hk_rows[0]["result_date"]] if hk_rows else [],
        "verification_by_year": hk_ver,
    }
    report["markets"]["SDY"] = {
        "rows": len(sdy_rows),
        "period": [sdy_rows[-1]["result_date"], sdy_rows[0]["result_date"]] if sdy_rows else [],
        "verification_by_year": sdy_ver,
    }
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
