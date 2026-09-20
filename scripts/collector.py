#!/usr/bin/env python3
import argparse
import json
import re
import sys
import time
from collections import Counter
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
OFFICIAL_SGP_PATH = DATA_DIR / "singapore-official.json"
OFFICIAL_SGP_4D_URL = (
    "https://www.singaporepools.com.sg/DataFileArchive/Lottery/Output/"
    "fourd_result_top_draws_en.html"
)
OFFICIAL_SGP_TOTO_URL = (
    "https://www.singaporepools.com.sg/DataFileArchive/Lottery/Output/"
    "toto_result_top_draws_en.html"
)

DAY_INDEX = {
    "senin": 0, "sen": 0,
    "selasa": 1, "sel": 1,
    "rabu": 2, "rab": 2,
    "kamis": 3, "kam": 3,
    "jumat": 4, "jum'at": 4, "jum": 4,
    "sabtu": 5, "sab": 5,
    "minggu": 6, "min": 6,
    "monday": 0, "mon": 0,
    "tuesday": 1, "tue": 1,
    "wednesday": 2, "wed": 2,
    "thursday": 3, "thu": 3,
    "friday": 4, "fri": 4,
    "saturday": 5, "sat": 5,
    "sunday": 6, "sun": 6,
}

MONTHS_ID = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"]
MONTH_MAP = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "mei": 5, "may": 5, "jun": 6,
    "jul": 7, "ags": 8, "agu": 8, "aug": 8, "sep": 9, "okt": 10, "oct": 10,
    "nov": 11, "des": 12, "dec": 12,
}
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
    period: Optional[str] = None


@dataclass
class VerifiedResult:
    item: ParsedResult
    verification: str
    confirmations: int
    source_ids: List[str]


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
        "Pragma": "no-cache",
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
        time.sleep(1.25 * (attempt + 1))
    raise CollectorError(f"Fetch gagal untuk {url}: {last_error}")


def normalize_cell(text: str) -> str:
    text = re.sub(r"\s+", " ", text or "").strip()
    m = re.search(r"(?<!\d)(\d{4})(?!\d)", text)
    return m.group(1) if m else ""


def normalize_day(text: str) -> Optional[int]:
    raw_text = re.sub(r"\s+", " ", (text or "").lower()).strip()
    raw = re.sub(r"[^a-zA-Z']", "", raw_text)
    direct = DAY_INDEX.get(raw)
    if direct is not None:
        return direct

    tokens = re.findall(r"[a-zA-Z']+", raw_text)
    for token in tokens:
        day = DAY_INDEX.get(token)
        if day is not None:
            return day

    aliases = [
        ("senin", 0), ("sen", 0),
        ("selasa", 1), ("sel", 1),
        ("rabu", 2), ("rab", 2),
        ("kamis", 3), ("kam", 3),
        ("jumat", 4), ("jum'at", 4), ("jum", 4),
        ("sabtu", 5), ("sab", 5),
        ("minggu", 6), ("min", 6),
        ("monday", 0), ("mon", 0),
        ("tuesday", 1), ("tue", 1),
        ("wednesday", 2), ("wed", 2),
        ("thursday", 3), ("thu", 3),
        ("friday", 4), ("fri", 4),
        ("saturday", 5), ("sat", 5),
        ("sunday", 6), ("sun", 6),
    ]
    for label, day in aliases:
        if re.search(rf"\b{re.escape(label)}\b", raw_text):
            return day

    return None


def parse_date_flexible(text: str) -> Optional[date]:
    raw = re.sub(r"\s+", " ", text or "").strip()
    m = re.search(r"(\d{1,2})[-/](\d{1,2})[-/](\d{4})", raw)
    if m:
        try:
            return date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
        except ValueError:
            return None
    m = re.search(r"(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})", raw)
    if m:
        month = MONTH_MAP.get(m.group(2).lower())
        if month:
            try:
                return date(int(m.group(3)), month, int(m.group(1)))
            except ValueError:
                return None
    return None


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
    for row in rows[:20]:
        cells = row.find_all(["th", "td"])
        days = [normalize_day(c.get_text(" ", strip=True)) for c in cells]
        valid_days = [d for d in days if d is not None]
        if len(valid_days) > best_score:
            best_days = valid_days
            best_score = len(valid_days)
    four_digit_cells = sum(
        1 for c in table.find_all(["td", "th"])
        if normalize_cell(c.get_text(" ", strip=True))
    )
    return best_score * 100 + min(four_digit_cells, 99), best_days


def parse_weekday_grid(html: str, market: str, source: dict, year: int) -> List[ParsedResult]:
    soup = BeautifulSoup(html, "html.parser")
    scored = []
    for t in candidate_tables(soup, source["heading_regex"], year):
        score, days = score_weekday_table(t)
        scored.append((score, t, days))
    if not scored:
        raise CollectorError("Tidak ada table yang ditemukan")
    scored.sort(key=lambda x: x[0], reverse=True)
    score, table, _ = scored[0]
    if score < 200:
        raise CollectorError(f"Table target tidak meyakinkan, score={score}")

    rows = table.find_all("tr")
    header_idx = None
    column_days: List[Optional[int]] = []
    for idx, row in enumerate(rows[:20]):
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
        values = [normalize_cell(c.get_text(" ", strip=True)) for c in cells]
        if not any(values):
            continue
        for col, number in enumerate(values):
            if not number or col >= len(column_days):
                continue
            day_idx = column_days[col]
            if day_idx is None:
                continue
            d = first_monday + timedelta(days=week_index * 7 + day_idx)
            if d.year != year:
                continue
            results.append(ParsedResult(
                market=market, result_date=d, number=number,
                source_id=source["id"], source_name=source["name"], source_url=source["url"]
            ))
        week_index += 1

    dedup = {item.result_date: item for item in results}
    out = [dedup[d] for d in sorted(dedup)]
    if len(out) < 20:
        raise CollectorError(f"Hanya {len(out)} result valid; parser kemungkinan salah")
    return out


def parse_hk_six_digit_last4(html: str, market: str, source: dict, year: int) -> List[ParsedResult]:
    soup = BeautifulSoup(html, "html.parser")
    out: Dict[date, ParsedResult] = {}
    for row in soup.find_all("tr"):
        text = re.sub(r"\s+", " ", row.get_text(" ", strip=True))
        d = parse_date_flexible(text)
        if d is None or d.year != year:
            continue
        mdate = re.search(r"\d{1,2}[-/]\d{1,2}[-/]\d{4}", text)
        after = text[mdate.end():] if mdate else text
        m6 = re.search(r"(?<!\d)(\d{6})(?!\d)", after)
        if m6:
            number = m6.group(1)[-4:]
        else:
            digits = re.findall(r"(?<!\d)(\d)(?!\d)", after)
            if len(digits) < 6:
                continue
            number = "".join(digits[:6])[-4:]
        out[d] = ParsedResult(
            market=market, result_date=d, number=number,
            source_id=source["id"], source_name=source["name"], source_url=source["url"]
        )
    results = [out[d] for d in sorted(out)]
    if len(results) < 5:
        raise CollectorError(f"HK six-digit parser hanya menemukan {len(results)} result")
    return results


def parse_sgp_official_4d(html: str, market: str, source: dict, year: int) -> List[ParsedResult]:
    soup = BeautifulSoup(html, "html.parser")
    text = re.sub(r"\s+", " ", soup.get_text(" ", strip=True))
    pattern = re.compile(
        r"(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s*"
        r"(?P<day>\d{1,2})\s+(?P<month>[A-Za-z]{3})\s+(?P<year>\d{4})\s*"
        r".{0,120}?Draw\s+No\.\s*(?P<draw>\d+)\s*"
        r".{0,180}?1st\s+Prize\D{0,20}(?P<number>\d{4})",
        re.I,
    )
    out: Dict[date, ParsedResult] = {}
    for m in pattern.finditer(text):
        month = MONTH_MAP.get(m.group("month").lower())
        if not month:
            continue
        d = date(int(m.group("year")), month, int(m.group("day")))
        if d.year != year:
            continue
        out[d] = ParsedResult(
            market=market, result_date=d, number=m.group("number"),
            source_id=source["id"], source_name=source["name"], source_url=source["url"],
            period=f"SGP-{m.group('draw')}",
        )
    results = [out[d] for d in sorted(out)]
    if len(results) < 3:
        raise CollectorError(f"SGP official parser hanya menemukan {len(results)} result")
    return results


def _official_draw_header(text: str) -> re.Match:
    match = re.search(
        r"(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s*"
        r"(?P<day>\d{1,2})\s+(?P<month>[A-Za-z]{3})\s+(?P<year>\d{4})\s*"
        r"(?:\||[-–])?\s*Draw\s+No\.?\s*(?P<draw>\d+)",
        text,
        re.I,
    )
    if match is None:
        raise CollectorError("Official Singapore draw header tidak ditemukan")
    return match


def parse_official_singapore_4d_snapshot(html: str) -> dict:
    """Parse the newest official 4D draw, including all published prize rows."""
    text = re.sub(r"\s+", " ", BeautifulSoup(html, "html.parser").get_text(" ", strip=True))
    header = _official_draw_header(text)
    following = text[header.end():]
    next_header = re.search(
        r"(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s*\d{1,2}\s+[A-Za-z]{3}\s+\d{4}\s*"
        r"(?:\||[-–])?\s*Draw\s+No\.?",
        following,
        re.I,
    )
    block = following[:next_header.start()] if next_header else following

    def prize(label: str) -> str:
        match = re.search(rf"{label}\s+Prize\D{{0,30}}(\d{{4}})", block, re.I)
        if match is None:
            raise CollectorError(f"Official Singapore 4D {label} prize tidak ditemukan")
        return match.group(1)

    starter_match = re.search(r"Starter\s+Prizes(?P<body>.*?)Consolation\s+Prizes", block, re.I)
    consolation_match = re.search(r"Consolation\s+Prizes(?P<body>.*)$", block, re.I)
    starter = re.findall(r"(?<!\d)\d{4}(?!\d)", starter_match.group("body")) if starter_match else []
    consolation = re.findall(r"(?<!\d)\d{4}(?!\d)", consolation_match.group("body")) if consolation_match else []
    if len(starter) < 10 or len(consolation) < 10:
        raise CollectorError("Official Singapore 4D starter/consolation tidak lengkap")

    month = MONTH_MAP.get(header.group("month").lower())
    if month is None:
        raise CollectorError("Official Singapore 4D month tidak dikenali")
    draw_date = date(int(header.group("year")), month, int(header.group("day")))
    return {
        "draw_date": draw_date.isoformat(),
        "draw_no": header.group("draw"),
        "first": prize("1st"),
        "second": prize("2nd"),
        "third": prize("3rd"),
        "starter": starter[:10],
        "consolation": consolation[:10],
        "source_url": OFFICIAL_SGP_4D_URL,
    }


def parse_official_singapore_toto_snapshot(html: str) -> dict:
    """Parse TOTO only while the official result page is publishing a draw."""
    text = re.sub(r"\s+", " ", BeautifulSoup(html, "html.parser").get_text(" ", strip=True))
    header = _official_draw_header(text)
    winning_match = re.search(
        r"Winning\s+Numbers(?P<body>.*?)Additional\s+Number",
        text[header.end():],
        re.I,
    )
    additional_match = re.search(
        r"Additional\s+Number\D{0,40}(?P<number>\d{1,2})(?!\d)",
        text[header.end():],
        re.I,
    )
    if winning_match is None or additional_match is None:
        raise CollectorError("Official Singapore TOTO result belum dipublikasikan")
    winning = re.findall(r"(?<!\d)\d{1,2}(?!\d)", winning_match.group("body"))
    if len(winning) < 6:
        raise CollectorError("Official Singapore TOTO winning numbers tidak lengkap")
    month = MONTH_MAP.get(header.group("month").lower())
    if month is None:
        raise CollectorError("Official Singapore TOTO month tidak dikenali")
    draw_date = date(int(header.group("year")), month, int(header.group("day")))
    return {
        "draw_date": draw_date.isoformat(),
        "draw_no": header.group("draw"),
        "winning_numbers": [number.zfill(2) for number in winning[:6]],
        "additional_number": additional_match.group("number").zfill(2),
        "source_url": OFFICIAL_SGP_TOTO_URL,
    }


def collect_official_singapore(collected_at: str) -> dict:
    """Refresh auxiliary official result metadata without changing the composite SGP dataset."""
    existing = {}
    if OFFICIAL_SGP_PATH.exists():
        existing = json.loads(OFFICIAL_SGP_PATH.read_text(encoding="utf-8"))
    payload = {
        "source": "Singapore Pools",
        "retrieved_at": existing.get("retrieved_at"),
        "official_4d": existing.get("official_4d"),
        "official_toto": existing.get("official_toto"),
    }
    errors = []
    for key, url, parser in (
        ("official_4d", OFFICIAL_SGP_4D_URL, parse_official_singapore_4d_snapshot),
        ("official_toto", OFFICIAL_SGP_TOTO_URL, parse_official_singapore_toto_snapshot),
    ):
        try:
            payload[key] = parser(fetch_html(url))
        except Exception as exc:
            errors.append({"source": key, "error": str(exc)})
            print(f"[SGP-OFFICIAL] source={key} WARNING: {exc}", file=sys.stderr)

    before = {key: existing.get(key) for key in ("source", "official_4d", "official_toto")}
    after = {key: payload.get(key) for key in ("source", "official_4d", "official_toto")}
    changed = before != after
    if changed:
        payload["retrieved_at"] = collected_at
        OFFICIAL_SGP_PATH.parent.mkdir(parents=True, exist_ok=True)
        OFFICIAL_SGP_PATH.write_text(
            json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
    return {"status": "updated" if changed else "no_change", "errors": errors}


def parse_date_result_table(html: str, market: str, source: dict, year: int) -> List[ParsedResult]:
    soup = BeautifulSoup(html, "html.parser")
    out: Dict[date, ParsedResult] = {}
    for row in soup.find_all("tr"):
        cells = [re.sub(r"\s+", " ", c.get_text(" ", strip=True)).strip() for c in row.find_all(["td", "th"])]
        if not cells:
            continue
        d = None
        for c in cells:
            maybe = parse_date_flexible(c)
            if maybe:
                d = maybe
                break
        if d is None or d.year != year:
            continue
        number = ""
        period = None
        ignore_period = bool(source.get("ignore_period", False))
        for c in cells:
            if re.fullmatch(r"\d{4}", c):
                number = c
            if not ignore_period:
                pm = re.search(r"\b(?:HK|SD|SDY|SY|SGP)[-\s]*\d+\b", c, re.I)
                if pm:
                    period = re.sub(r"\s+", "", pm.group(0)).upper()
                    period = period.replace("SY-", "SD-").replace("SDY-", "SD-")
        if not number:
            continue
        out[d] = ParsedResult(
            market=market, result_date=d, number=number,
            source_id=source["id"], source_name=source["name"], source_url=source["url"],
            period=period,
        )
    results = [out[d] for d in sorted(out)]
    if len(results) < 5:
        raise CollectorError(f"Date/result parser hanya menemukan {len(results)} result")
    return results


def parse_indonesian_long_date_result4(
    html: str,
    market: str,
    source: dict,
    year: int,
) -> List[ParsedResult]:
    soup = BeautifulSoup(html, "html.parser")
    month_map = {
        "januari": 1, "februari": 2, "maret": 3, "april": 4,
        "mei": 5, "juni": 6, "juli": 7, "agustus": 8,
        "september": 9, "oktober": 10, "november": 11, "desember": 12,
    }
    out: Dict[date, ParsedResult] = {}

    nodes = soup.find_all("tr")
    if not nodes:
        nodes = soup.find_all(["p", "li", "div"])

    for node in nodes:
        text = re.sub(r"\s+", " ", node.get_text(" ", strip=True)).strip()
        if not text:
            continue

        m = re.search(
            r"(?<!\d)(\d{1,2})\s+"
            r"(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|"
            r"September|Oktober|November|Desember)\s+"
            r"(20\d{2})(?!\d)",
            text,
            flags=re.I,
        )
        if not m or int(m.group(3)) != year:
            continue

        try:
            d = date(
                year,
                month_map[m.group(2).lower()],
                int(m.group(1)),
            )
        except ValueError:
            continue

        tail = text[m.end():]
        numbers = re.findall(r"(?<!\d)(\d{4})(?!\d)", tail)
        if not numbers:
            continue

        out[d] = ParsedResult(
            market=market,
            result_date=d,
            number=numbers[-1],
            source_id=source["id"],
            source_name=source["name"],
            source_url=source["url"],
        )

    results = [out[d] for d in sorted(out)]
    if len(results) < 5:
        raise CollectorError(
            f"Indonesian long-date parser hanya menemukan {len(results)} result"
        )
    return results


PARSERS = {
    "weekday_grid": parse_weekday_grid,
    "hk_six_digit_last4": parse_hk_six_digit_last4,
    "sgp_official_4d": parse_sgp_official_4d,
    "date_result_table": parse_date_result_table,
    "id_long_date_result4": parse_indonesian_long_date_result4,
}


def parse_source(html: str, market: str, source: dict, year: int) -> List[ParsedResult]:
    parser_name = source.get("parser")
    fn = PARSERS.get(parser_name)
    if fn is None:
        raise CollectorError(f"Parser belum didukung: {parser_name}")
    return fn(html, market, source, year)


def verify_results(market_cfg: dict, source_results: Dict[str, List[ParsedResult]]) -> List[VerifiedResult]:
    mode = market_cfg.get("verification_mode", "primary_authoritative")
    sources = sorted(
        [s for s in market_cfg.get("sources", []) if s.get("enabled", True)],
        key=lambda s: s.get("priority", 999),
    )
    priority = {s["id"]: s.get("priority", 999) for s in sources}

    if mode == "primary_authoritative":
        primary_id = market_cfg.get("authoritative_source_id") or (sources[0]["id"] if sources else None)
        items = source_results.get(primary_id or "", [])
        if not items:
            raise CollectorError(f"Authoritative source gagal/tidak menghasilkan data: {primary_id}")
        primary_cfg = next((s for s in sources if s["id"] == primary_id), {})
        verification = "official_primary" if primary_cfg.get("authority") == "official" else "primary_source"
        return [
            VerifiedResult(item=i, verification=verification, confirmations=1, source_ids=[primary_id])
            for i in items
        ]

    min_confirmations = int(market_cfg.get("min_confirmations", 2))
    per_date: Dict[date, List[ParsedResult]] = {}
    for items in source_results.values():
        for item in items:
            per_date.setdefault(item.result_date, []).append(item)

    verified: List[VerifiedResult] = []
    for d, items in per_date.items():
        counts = Counter(i.number for i in items)
        number, count = counts.most_common(1)[0]
        if count < min_confirmations:
            continue
        agreeing = [i for i in items if i.number == number]
        agreeing.sort(key=lambda i: priority.get(i.source_id, 999))
        chosen = agreeing[0]
        verified.append(VerifiedResult(
            item=chosen,
            verification=f"confirmed_{count}_sources",
            confirmations=count,
            source_ids=[i.source_id for i in agreeing],
        ))
    verified.sort(key=lambda v: v.item.result_date)
    if not verified:
        raise CollectorError("Tidak ada result yang lolos cross-check")
    return verified


def resolve_period_from_rule(item: ParsedResult, market_cfg: dict) -> None:
    if item.period:
        return

    rule = market_cfg.get("period_rule")
    if not rule:
        return

    try:
        anchor_date = date.fromisoformat(rule["anchor_date"])
        anchor_number = int(rule["anchor_number"])
        weekdays = {int(x) for x in rule.get("weekdays", [])}
        valid_from = date.fromisoformat(rule.get("valid_from", rule["anchor_date"]))
    except Exception:
        return

    d = item.result_date
    if d < valid_from or not weekdays:
        return

    if d >= anchor_date:
        cursor = anchor_date + timedelta(days=1)
        offset = 0
        while cursor <= d:
            if cursor.weekday() in weekdays:
                offset += 1
            cursor += timedelta(days=1)
        number = anchor_number + offset
    else:
        cursor = d + timedelta(days=1)
        offset = 0
        while cursor <= anchor_date:
            if cursor.weekday() in weekdays:
                offset += 1
            cursor += timedelta(days=1)
        number = anchor_number - offset

    prefix = str(rule.get("prefix", item.market)).upper()
    item.period = f"{prefix}-{number}"


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


def canonical_record(v: VerifiedResult, collected_at: str) -> dict:
    item = v.item
    return {
        "id": int(item.result_date.strftime("%Y%m%d")),
        "tanggal": format_date_id(item.result_date),
        "periode": item.period or internal_period(item.market, item.result_date),
        "nomor": item.number,
        "result_date": item.result_date.isoformat(),
        "market": item.market,
        "source_id": item.source_id,
        "source_name": item.source_name,
        "source_url": item.source_url,
        "source_ids": v.source_ids,
        "collected_at": collected_at,
        "verification": v.verification,
        "confirmations": v.confirmations,
    }


def normalize_existing_date(row: dict) -> Optional[date]:
    raw = row.get("result_date")
    if raw:
        try:
            return date.fromisoformat(raw)
        except Exception:
            pass
    tanggal = row.get("tanggal")
    if tanggal:
        return parse_date_flexible(str(tanggal))
    return None


def merge_records(
    market: str,
    verified: List[VerifiedResult],
    collected_at: str,
    replace_existing_metadata: bool = False,
) -> Tuple[List[dict], List[dict], int]:
    existing = read_existing(market)
    existing_by_date: Dict[str, dict] = {}
    unparsed_legacy: List[dict] = []

    for row in existing:
        d = normalize_existing_date(row)
        if d is None:
            unparsed_legacy.append(row)
        else:
            existing_by_date[d.isoformat()] = row

    new_rows: List[dict] = []
    replaced_legacy = 0
    for v in verified:
        key = v.item.result_date.isoformat()
        rec = canonical_record(v, collected_at)
        old = existing_by_date.get(key)
        if old is None:
            existing_by_date[key] = rec
            new_rows.append(rec)
            continue

        old_is_canonical = bool(old.get("result_date"))
        if old_is_canonical:
            if str(old.get("nomor")) != rec["nomor"]:
                raise CollectorError(
                    f"CONFLICT {market} {key}: local={old.get('nomor')} verified_remote={rec['nomor']}"
                )

            if replace_existing_metadata:
                compare_fields = (
                    "periode",
                    "source_id",
                    "source_name",
                    "source_url",
                    "source_ids",
                    "verification",
                    "confirmations",
                )
                metadata_changed = any(
                    old.get(field) != rec.get(field) for field in compare_fields
                )
                if metadata_changed:
                    existing_by_date[key] = rec
                    new_rows.append(rec)
            continue

        if str(old.get("nomor")) != rec["nomor"]:
            replaced_legacy += 1
        existing_by_date[key] = rec
        new_rows.append(rec)

    dated = []
    for key, row in existing_by_date.items():
        row_copy = dict(row)
        if not row_copy.get("result_date"):
            row_copy["result_date"] = key
        dated.append(row_copy)
    dated.sort(key=lambda r: r["result_date"], reverse=True)
    return dated + unparsed_legacy, new_rows, replaced_legacy


def write_market(market: str, rows: List[dict]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    path = DATA_DIR / f"{market.lower()}.json"
    path.write_text(json.dumps(rows, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def latest_dated(rows: List[dict]) -> Optional[dict]:
    dated = [r for r in rows if r.get("result_date")]
    if not dated:
        return rows[0] if rows else None
    return max(dated, key=lambda r: r["result_date"])


def collect_market(config: dict, market: str, year: int, collected_at: str) -> dict:
    market_cfg = config["markets"][market]
    sources = sorted(
        [s for s in market_cfg.get("sources", []) if s.get("enabled", True)],
        key=lambda s: s.get("priority", 999),
    )
    if not sources:
        raise CollectorError(f"Tidak ada source aktif untuk {market}")

    source_results: Dict[str, List[ParsedResult]] = {}
    source_errors = []
    for source in sources:
        try:
            runtime_source = dict(source)
            runtime_source["url"] = source["url"].replace("{year}", str(year))
            html = fetch_html(runtime_source["url"])
            items = parse_source(html, market, runtime_source, year)
            source_results[source["id"]] = items
            latest = items[-1] if items else None
            print(
                f"[{market}] source={source['id']} parsed={len(items)} "
                f"latest={latest.result_date if latest else '-'}:{latest.number if latest else '-'}"
            )
        except Exception as exc:
            source_errors.append({"source": source["id"], "error": str(exc)})
            print(f"[{market}] source={source['id']} ERROR: {exc}", file=sys.stderr)

    verified = verify_results(market_cfg, source_results)

    for verified_item in verified:
        resolve_period_from_rule(verified_item.item, market_cfg)

    rows, new_rows, replaced_legacy = merge_records(
        market,
        verified,
        collected_at,
        replace_existing_metadata=bool(
            market_cfg.get("replace_existing_metadata", False)
        ),
    )
    write_market(market, rows)
    latest = latest_dated(rows)
    latest_verified = verified[-1]

    return {
        "market": market,
        "status": "updated" if new_rows else "no_change",
        "verification_mode": market_cfg.get("verification_mode", "primary_authoritative"),
        "successful_sources": list(source_results.keys()),
        "parsed_counts": {k: len(v) for k, v in source_results.items()},
        "verified_count": len(verified),
        "new_count": len(new_rows),
        "replaced_legacy_count": replaced_legacy,
        "new_results": [
            {"date": r["result_date"], "number": r["nomor"], "verification": r["verification"]}
            for r in sorted(new_rows, key=lambda x: x["result_date"])
        ],
        "latest": latest,
        "latest_verified": {
            "date": latest_verified.item.result_date.isoformat(),
            "number": latest_verified.item.number,
            "verification": latest_verified.verification,
            "source_ids": latest_verified.source_ids,
        },
        "source_errors": source_errors,
    }


def write_status(config: dict, results: List[dict], collected_at: str, year: int) -> bool:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    # A polling check is not a successful new collection. Preserve the last
    # meaningful collector timestamp so scheduled runs do not create commits
    # solely because the clock changed.
    if STATUS_PATH.exists() and not any(
        result.get("status") == "updated" for result in results
    ):
        return False
    payload = {
        "schema_version": 2,
        "collected_at": collected_at,
        "target_year": year,
        "timezone": config.get("timezone", "Asia/Jakarta"),
        "markets": {r["market"]: r for r in results},
    }
    STATUS_PATH.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return True


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
    if "SGP" in markets:
        official = collect_official_singapore(collected_at)
        print(
            f"[SGP-OFFICIAL] {official['status']} "
            f"warnings={len(official['errors'])}"
        )
    for market in markets:
        try:
            r = collect_market(cfg, market, year, collected_at)
            results.append(r)
            print(
                f"[{market}] {r['status']} verified={r['verified_count']} "
                f"new={r['new_count']} legacy_replaced={r['replaced_legacy_count']}"
            )
            for item in r["new_results"]:
                print(f"  + {item['date']} = {item['number']} ({item['verification']})")
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
