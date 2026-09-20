#!/usr/bin/env python3
"""Collect normalized HK/SDY six-digit boards without executing source scripts.

The live board is auxiliary UI data. It never writes the prediction datasets.
"""

from __future__ import annotations

import argparse
import json
import re
from datetime import date, datetime
from pathlib import Path
from typing import Iterable, Optional
from zoneinfo import ZoneInfo

import requests
from bs4 import BeautifulSoup, Tag

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "public" / "data"
SNAPSHOT_PATH = DATA_DIR / "live-draw.json"
HK_SOURCES = (
    ("https://www.hongkongpools.com/live", "HongkongPools Market Source"),
    ("https://www.hongkongpools.com/live.html", "HongkongPools Market Source"),
)
SDY_PAGE_URL = "https://www.sydneypoolstoday.com/live.html"
SDY_DATA_URL = "https://www.sydneypoolstoday.com/getLiveContent"
UA = (
    "Mozilla/5.0 (Linux; Android 13; Mobile) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/152.0.0.0 Mobile Safari/537.36"
)
MONTHS = {
    "jan": 1, "january": 1, "feb": 2, "february": 2, "mar": 3, "march": 3,
    "apr": 4, "april": 4, "may": 5, "jun": 6, "june": 6, "jul": 7,
    "july": 7, "aug": 8, "august": 8, "sep": 9, "september": 9,
    "oct": 10, "october": 10, "nov": 11, "november": 11,
    "dec": 12, "december": 12,
}
LABELS = {
    "first": re.compile(r"\b(?:1st|first)\s*prize\b", re.I),
    "second": re.compile(r"\b(?:2nd|second)\s*prize\b", re.I),
    "third": re.compile(r"\b(?:3rd|third)\s*prize\b", re.I),
    "starter": re.compile(r"\bstarter\s*(?:prize)?\b", re.I),
    "consolation": re.compile(r"\bconsolation\s*(?:prize)?\b", re.I),
}


class LiveBoardError(RuntimeError):
    pass


def _headers(extra: Optional[dict] = None) -> dict:
    values = {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
        "Cache-Control": "no-cache",
    }
    values.update(extra or {})
    return values


def _valid_response(response: requests.Response, url: str) -> str:
    if response.status_code != 200:
        raise LiveBoardError(f"HTTP {response.status_code} dari {url}")
    html = response.text
    if re.search(r"cf-mitigated|challenge-platform|<title>\s*Just a moment", html, re.I):
        raise LiveBoardError("Source dilindungi Cloudflare challenge; bypass tidak dicoba")
    if len(html) < 100:
        raise LiveBoardError(f"Body terlalu kecil dari {url}")
    return html


def _image_digit(image: Tag) -> str:
    for key in ("data-digit", "alt", "title"):
        value = str(image.get(key, "")).strip()
        if re.fullmatch(r"\d", value):
            return value
    filename = str(image.get("src", "")).rsplit("/", 1)[-1]
    match = re.search(r"(?:^|[_-])(\d)(?:\.[A-Za-z0-9]+)(?:\?.*)?$", filename)
    return match.group(1) if match else ""


def _numbers_from_container(container: Tag) -> list[str]:
    output = re.findall(r"(?<!\d)\d{6}(?!\d)", container.get_text(" ", strip=True))
    digits = [digit for image in container.find_all("img") if (digit := _image_digit(image))]
    output.extend("".join(digits[index:index + 6]) for index in range(0, len(digits) - 5, 6))
    return list(dict.fromkeys(number for number in output if re.fullmatch(r"\d{6}", number)))


def _draw_date(soup: BeautifulSoup) -> str:
    text = re.sub(r"\s+", " ", soup.get_text(" ", strip=True))
    match = re.search(
        r"(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)?\s*,?\s*"
        r"([A-Za-z]+)\s+(\d{1,2})\s*,?\s+(\d{4})",
        text,
        re.I,
    )
    if match and (month := MONTHS.get(match.group(1).lower())):
        return date(int(match.group(3)), month, int(match.group(2))).isoformat()
    match = re.search(r"(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)?\s*,?\s*(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})", text, re.I)
    if match and (month := MONTHS.get(match.group(2).lower())):
        return date(int(match.group(3)), month, int(match.group(1))).isoformat()
    match = re.search(r"(?<!\d)(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?!\d)", text)
    if match:
        return date(int(match.group(1)), int(match.group(2)), int(match.group(3))).isoformat()
    match = re.search(r"(?<!\d)(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?!\d)", text)
    if match:
        return date(int(match.group(3)), int(match.group(2)), int(match.group(1))).isoformat()
    raise LiveBoardError("Draw date tidak ditemukan")


def validate_board(board: dict) -> dict:
    for field in ("first", "second", "third"):
        if not re.fullmatch(r"\d{6}", str(board.get(field, ""))):
            raise LiveBoardError(f"{field} harus exact 6 digit")
    for field in ("starter", "consolation"):
        values = board.get(field)
        if not isinstance(values, list) or any(not re.fullmatch(r"\d{6}", str(value)) for value in values):
            raise LiveBoardError(f"{field} berisi nomor malformed")
    if board.get("derived_4d") != board["first"][-4:]:
        raise LiveBoardError("derived_4d bukan last-four Prize 1")
    try:
        date.fromisoformat(board["draw_date"])
    except (KeyError, TypeError, ValueError) as exc:
        raise LiveBoardError("Draw date tidak valid") from exc
    return board


def parse_six_digit_board(html: str, market: str, source: str, source_url: str) -> dict:
    if re.search(r"cf-mitigated|challenge-platform|<title>\s*Just a moment", html or "", re.I):
        raise LiveBoardError("Source dilindungi challenge; bypass tidak dicoba")
    soup = BeautifulSoup(html or "", "html.parser")
    buckets: dict[str, list[str]] = {key: [] for key in LABELS}
    for row in soup.find_all("tr"):
        text = re.sub(r"\s+", " ", row.get_text(" ", strip=True))
        matched = [key for key, pattern in LABELS.items() if pattern.search(text)]
        if len(matched) != 1:
            continue
        buckets[matched[0]].extend(_numbers_from_container(row))
    buckets = {key: list(dict.fromkeys(values)) for key, values in buckets.items()}
    first = (buckets["first"] or [""])[0]
    board = {
        "market": market,
        "source": source,
        "source_url": source_url,
        "draw_date": _draw_date(soup),
        "first": first,
        "second": (buckets["second"] or [""])[0],
        "third": (buckets["third"] or [""])[0],
        "starter": buckets["starter"],
        "consolation": buckets["consolation"],
        "full_first_prize_6d": first,
        "derived_4d": first[-4:],
    }
    return validate_board(board)


def _dataset_row(market: str) -> Optional[dict]:
    path = DATA_DIR / f"{market.lower()}.json"
    if not path.exists():
        return None
    rows = json.loads(path.read_text(encoding="utf-8"))
    return rows[0] if isinstance(rows, list) and rows else None


def attach_dataset_validation(board: dict, dataset_row: Optional[dict]) -> dict:
    dataset_number = str((dataset_row or {}).get("nomor", "")).zfill(4)
    dataset_date = (dataset_row or {}).get("result_date")
    same_date = not dataset_date or dataset_date == board["draw_date"]
    comparable = bool(re.fullmatch(r"\d{4}", dataset_number)) and same_date
    matches = board["derived_4d"] == dataset_number if comparable else None
    return {
        **board,
        "dataset_4d": dataset_number if re.fullmatch(r"\d{4}", dataset_number) else None,
        "matches_dataset": matches,
        "verification": (
            "dataset_date_mismatch" if not same_date else
            "dataset_unavailable" if not comparable else
            "matches_prediction_dataset" if matches else
            "source_dataset_mismatch"
        ),
    }


def collect_hk(session: requests.Session) -> dict:
    errors = []
    for url, source_name in HK_SOURCES:
        try:
            response = session.get(url, headers=_headers(), timeout=25)
            html = _valid_response(response, url)
            return parse_six_digit_board(html, "HK", source_name, url)
        except Exception as exc:  # preserve the last verified snapshot on any source failure
            errors.append(str(exc))
    raise LiveBoardError("; ".join(errors))


def collect_sdy(session: requests.Session) -> dict:
    page = session.get(SDY_PAGE_URL, headers=_headers(), timeout=25)
    _valid_response(page, SDY_PAGE_URL)
    response = session.get(
        SDY_DATA_URL,
        headers=_headers({"Referer": SDY_PAGE_URL, "X-Requested-With": "XMLHttpRequest"}),
        timeout=25,
    )
    html = _valid_response(response, SDY_DATA_URL)
    return parse_six_digit_board(html, "SDY", "SydneyPoolsToday Market Source", SDY_PAGE_URL)


def _comparable_markets(markets: dict) -> dict:
    return {
        market: {key: value for key, value in board.items() if key != "retrieved_at"}
        for market, board in sorted(markets.items())
    }


def update_snapshot(path: Path, boards: dict[str, dict], retrieved_at: str) -> bool:
    existing = {}
    if path.exists():
        existing = json.loads(path.read_text(encoding="utf-8"))
    merged = dict(existing.get("markets") or {})
    for market, board in boards.items():
        merged[market] = {**board, "retrieved_at": retrieved_at}
    if _comparable_markets(merged) == _comparable_markets(existing.get("markets") or {}):
        return False
    payload = {"schema_version": 1, "retrieved_at": retrieved_at, "markets": merged}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return True


def collect_live_boards(markets: Iterable[str], retrieved_at: str, path: Path = SNAPSHOT_PATH) -> dict:
    requested = [market for market in markets if market in {"HK", "SDY"}]
    session = requests.Session()
    boards: dict[str, dict] = {}
    errors: list[dict] = []
    collectors = {"HK": collect_hk, "SDY": collect_sdy}
    for market in requested:
        try:
            board = collectors[market](session)
            boards[market] = attach_dataset_validation(board, _dataset_row(market))
            print(f"[{market}-LIVE] {board['draw_date']} first={board['first']} derived={board['derived_4d']}")
        except Exception as exc:
            errors.append({"market": market, "error": str(exc)})
            print(f"[{market}-LIVE] WARNING: {exc}")
    changed = update_snapshot(path, boards, retrieved_at) if boards else False
    return {"status": "updated" if changed else "no_change", "markets": sorted(boards), "errors": errors}


def main() -> int:
    parser = argparse.ArgumentParser(description="AdiPredictor normalized six-digit live board collector")
    parser.add_argument("--market", choices=["HK", "SDY", "ALL"], default="ALL")
    parser.add_argument("--output", type=Path, default=SNAPSHOT_PATH)
    args = parser.parse_args()
    requested = ["HK", "SDY"] if args.market == "ALL" else [args.market]
    now = datetime.now(ZoneInfo("Asia/Jakarta")).isoformat(timespec="seconds")
    result = collect_live_boards(requested, now, args.output)
    print(f"[LIVE-BOARD] {result['status']} markets={','.join(result['markets']) or '-'} warnings={len(result['errors'])}")
    return 0 if result["markets"] or args.output.exists() else 1


if __name__ == "__main__":
    raise SystemExit(main())
