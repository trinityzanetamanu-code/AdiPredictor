#!/usr/bin/env python3
import argparse
import json
import os
import re
import sys
import time
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from zoneinfo import ZoneInfo

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT / "config" / "collector_sources.json"
DATA_DIR = ROOT / "public" / "data"
STATUS_PATH = DATA_DIR / "collector-status.json"

DAY_INDEX = {
    "senin": 0,
    "selasa": 1,
    "rabu": 2,
    "kamis": 3,
    "jumat": 4,
    "jum'at": 4,
    "sabtu": 5,
    "minggu": 6,
    "monday": 0,
    "tuesday": 1,
    "wednesday": 2,
    "thursday": 3,
    "friday": 4,
    "saturday": 5,
    "sunday": 6,
}

MONTHS_ID = [
    "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
    "Jul", "Ags", "Sep", "Okt", "Nov", "Des"
]

UA = (
    "Mozilla/5.0 (Linux; Android 13; Mobile) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/152.0.0.0 Mobile Safari/537.36"
)


@dataclass
class ParsedResult:
    market: str
    result_date: date
    number: str
    source_id: str
    source_name: str
    source_url: str


class CollectorError(RuntimeError):
    pass


def load_config() -> dict:
    with CONFIG_PATH.open("r", encoding="utf-8") as f:
        return json.load(f)


def fetch_html(url: str, timeout: int = 35) -> str:
    headers = {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
        "Cache-Control": "no-cache",
    }
    last_error = None
    for attempt in range(3):
        try:
            r = requests.get(url, headers=headers, timeout=timeout)
            if r.status_code == 200 and len(r.text) > 500:
                return r.text
            last_error = CollectorError(f"HTTP {r.status_code}, body={len(r.text)} bytes")
        except Exception as exc:
            last_error = exc
        time.sleep(1.5 * (attempt + 1))
    raise CollectorError(f"Fetch gagal untuk {url}: {last_error}")


def normalize_cell(text: str) -> str:
    text = re.sub(r"\s+", " ", text or "").strip()
    m = re.search(r"(?<!\d)(\d{4})(?!\d)", text)
    return m.group(1) if m else ""


def normalize_day(text: str) -> Optional[int]:
    raw = re.sub(r"[^a-zA-Z']", "", (text or "").lower())
    return DAY_INDEX.get(raw)


def heading_matches(text: str, heading_regex: str, year: int) -> bool:
    pattern = heading_regex.replace("{year}", str(year))
    return re.search(pattern, text or "", flags=re.I) is not None


def candidate_tables(soup: BeautifulSoup, heading_regex: str, year: int):
    yielded = set()
    for h in soup.find_all(["h1", "h2", "h3", "h4", "strong"]):
        if heading_matches(h.get_text(" ", strip=True), heading_regex, year):
            t = h.find_next("table")
            if t is not None and id(t) not in yielded:
                yielded.add(id(t))
                yield t
    for t in soup.find_all("table"):
        if id(t) not in yielded:
            yielded.add(id(t))
            yield t


def score_weekday_table(table) -> Tuple[int, List[int]]:
    rows = table.find_all("tr")
    if not rows:
        return 0, []
    best_days: List[int] = []
    best_score = 0
    for row in rows[:4]:
        cells = row.find_all(["th", "td"])
        days = [normalize_day(c.get_text(" ", strip=True)) for c in cells]
        valid_days = [d for d in days if d is not None]
        if len(valid_days) > best_score:
            best_days = valid_days
            best_score = len(valid_days)
    four_digit_cells = 0
    for c in table.find_all(["td", "th"]):
        if normalize_cell(c.get_text(" ", strip=True)):
            four_digit_cells += 1
    return best_score * 100 + min(four_digit_cells, 99), best_days


def parse_weekday_grid(
    html: str,
    market: str,
    source: dict,
    year: int,
) -> List[ParsedResult]:
    soup = BeautifulSoup(html, "html.parser")
    scored = []
    for t in candidate_tables(soup, source["heading_regex"], year):
        score, days = score_weekday_table(t)
        scored.append((score, t, days))
    if not scored:
        raise CollectorError("Tidak ada table yang ditemukan")
    scored.sort(key=lambda x: x[0], reverse=True)
    score, table, detected_days = scored[0]
    if score < 200:
        raise CollectorError(f"Table target tidak meyakinkan, score={score}")

    rows = table.find_all("tr")
    header_idx = None
    column_days: List[Optional[int]] = []
    for idx, row in enumerate(rows[:6]):
        cells = row.find_all(["th", "td"])
        mapped = [normalize_day(c.get_text(" ", strip=True)) for c in cells]
        if sum(d is not None for d in mapped) >= 2:
            header_idx = idx
            column_days = mapped
            break
    if header_idx is None:
        raise CollectorError("Header weekday tidak ditemukan")

    jan1 = date(year, 1, 1)
    first_monday = jan1 - timedelta(days=jan1.weekday())
    results: List[ParsedResult] = []
    week_index = 0

    for row in rows[header_idx + 1:]:
        cells = row.find_all(["td", "th"])
        if not cells:
            continue
        # Skip obvious non-data rows, but retain blanks because blanks matter for calendar position.
        values = [normalize_cell(c.get_text(" ", strip=True)) for c in cells]
        if not any(values):
            continue

        for col, number in enumerate(values):
            if not number:
                continue
            if col >= len(column_days):
                continue
            day_idx = column_days[col]
            if day_idx is None:
                continue
            d = first_monday + timedelta(days=week_index * 7 + day_idx)
            if d.year != year:
                continue
            results.append(
                ParsedResult(
                    market=market,
                    result_date=d,
                    number=number,
                    source_id=source["id"],
                    source_name=source["name"],
                    source_url=source["url"],
                )
            )
        week_index += 1

    # Deduplicate by date, keeping the last occurrence if a malformed page duplicates a row.
    dedup: Dict[date, ParsedResult] = {}
    for item in results:
        dedup[item.result_date] = item
    out = [dedup[d] for d in sorted(dedup)]
    if len(out) < 20:
        raise CollectorError(f"Hanya {len(out)} result valid; parser kemungkinan salah")
    return out


def read_existing(market: str) -> List[dict]:
    path = DATA_DIR / f"{market.lower()}.json"
    if not path.exists():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except Exception:
        return []


def format_date_id(d: date) -> str:
    return f"{d.day:02d} {MONTHS_ID[d.month - 1]} {d.year}"


def internal_period(market: str, d: date) -> str:
    return f"{market}-{d.strftime('%Y%m%d')}"


def canonical_record(item: ParsedResult, collected_at: str) -> dict:
    return {
        "id": int(item.result_date.strftime("%Y%m%d")),
        "tanggal": format_date_id(item.result_date),
        "periode": internal_period(item.market, item.result_date),
        "nomor": item.number,
        "result_date": item.result_date.isoformat(),
        "market": item.market,
        "source_id": item.source_id,
        "source_name": item.source_name,
        "source_url": item.source_url,
        "collected_at": collected_at,
        "verification": "single_source",
    }


def normalize_existing_date(row: dict) -> Optional[date]:
    raw = row.get("result_date")
    if raw:
        try:
            return date.fromisoformat(raw)
        except Exception:
            pass
    # Existing legacy files don't carry result_date. We intentionally do not guess locale dates here.
    return None


def merge_records(market: str, parsed: List[ParsedResult], collected_at: str) -> Tuple[List[dict], List[dict]]:
    existing = read_existing(market)
    by_date: Dict[str, dict] = {}
    legacy: List[dict] = []

    for row in existing:
        d = normalize_existing_date(row)
        if d is None:
            legacy.append(row)
        else:
            by_date[d.isoformat()] = row

    new_rows: List[dict] = []
    for item in parsed:
        key = item.result_date.isoformat()
        rec = canonical_record(item, collected_at)
        old = by_date.get(key)
        if old and old.get("nomor") != rec["nomor"]:
            raise CollectorError(
                f"CONFLICT {market} {key}: local={old.get('nomor')} remote={rec['nomor']}"
            )
        if old is None:
            new_rows.append(rec)
        by_date[key] = rec

    dated = list(by_date.values())
    dated.sort(key=lambda r: r["result_date"], reverse=True)

    # Keep legacy rows only if their number/date pair was not yet migrated. They stay below dated rows
    # until the historical-import stage replaces them with canonical 2023-2026 records.
    output = dated + legacy
    return output, new_rows


def write_market(market: str, rows: List[dict]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    path = DATA_DIR / f"{market.lower()}.json"
    path.write_text(json.dumps(rows, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def latest_dated(rows: List[dict]) -> Optional[dict]:
    for row in rows:
        if row.get("result_date"):
            return row
    return rows[0] if rows else None


def collect_market(config: dict, market: str, year: int, collected_at: str) -> dict:
    market_cfg = config["markets"][market]
    sources = sorted(
        [s for s in market_cfg.get("sources", []) if s.get("enabled", True)],
        key=lambda s: s.get("priority", 999),
    )
    if not sources:
        raise CollectorError(f"Tidak ada source aktif untuk {market}")

    source_errors = []
    parsed = None
    used_source = None
    for source in sources:
        try:
            html = fetch_html(source["url"])
            parser = source.get("parser")
            if parser != "weekday_grid":
                raise CollectorError(f"Parser belum didukung: {parser}")
            candidate = parse_weekday_grid(html, market, source, year)
            parsed = candidate
            used_source = source
            break
        except Exception as exc:
            source_errors.append({"source": source["id"], "error": str(exc)})

    if parsed is None or used_source is None:
        raise CollectorError(f"Semua source {market} gagal: {source_errors}")

    rows, new_rows = merge_records(market, parsed, collected_at)
    write_market(market, rows)
    latest = latest_dated(rows)
    return {
        "market": market,
        "status": "updated" if new_rows else "no_change",
        "source_id": used_source["id"],
        "source_url": used_source["url"],
        "parsed_count": len(parsed),
        "new_count": len(new_rows),
        "new_results": [
            {"date": r["result_date"], "number": r["nomor"]}
            for r in sorted(new_rows, key=lambda x: x["result_date"])
        ],
        "latest": latest,
        "source_errors": source_errors,
    }


def write_status(config: dict, results: List[dict], collected_at: str, year: int) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    payload = {
        "schema_version": 1,
        "collected_at": collected_at,
        "target_year": year,
        "timezone": config.get("timezone", "Asia/Jakarta"),
        "markets": {r["market"]: r for r in results},
    }
    STATUS_PATH.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="AdiPredictor automatic result collector")
    parser.add_argument("--market", choices=["HK", "SGP", "SDY", "ALL"], default="ALL")
    parser.add_argument("--year", type=int, default=None)
    parser.add_argument("--strict", action="store_true", help="Fail jika salah satu market gagal")
    args = parser.parse_args()

    cfg = load_config()
    tz = ZoneInfo(cfg.get("timezone", "Asia/Jakarta"))
    now = datetime.now(tz)
    year = args.year or now.year
    collected_at = now.isoformat(timespec="seconds")
    markets = list(cfg["markets"].keys()) if args.market == "ALL" else [args.market]

    results = []
    failures = []
    for market in markets:
        try:
            r = collect_market(cfg, market, year, collected_at)
            results.append(r)
            print(
                f"[{market}] {r['status']} source={r['source_id']} "
                f"parsed={r['parsed_count']} new={r['new_count']}"
            )
            for item in r["new_results"]:
                print(f"  + {item['date']} = {item['number']}")
        except Exception as exc:
            failures.append({"market": market, "error": str(exc)})
            print(f"[{market}] ERROR: {exc}", file=sys.stderr)

    write_status(cfg, results + [
        {"market": f["market"], "status": "error", "error": f["error"]}
        for f in failures
    ], collected_at, year)

    if failures and (args.strict or not results):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
