"""HongkongPools acceptance boundary. No guessed finality rule is enabled.

The current automatic response is a 403 challenge. Register a source-specific
finality contract only after a successful response and partial/final captures
prove its semantics. Device observations are never passed to this boundary.
"""
from datetime import date, datetime
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo

HK_CANONICAL_URL = "https://www.hongkongpools.com/live.html"
HK_SOURCE_TIMEZONE = "Asia/Hong_Kong"
HK_MARKET_TIMEZONE = "Asia/Hong_Kong"
# Intentionally empty: no actual partial/final HTML has been obtained.
HK_FINALITY_CONTRACTS = frozenset()


def validate_hk_canonical(board, checked_at):
    import re
    if board.get("market") != "HK":
        raise ValueError("HK_MARKET_IDENTITY_INVALID")
    if board.get("source_url") != HK_CANONICAL_URL or urlsplit(board.get("response_url", HK_CANONICAL_URL)).hostname != "www.hongkongpools.com":
        raise ValueError("HK_CANONICAL_SOURCE_INVALID")
    if not isinstance(board.get("first"), str) or not re.fullmatch(r"[0-9]{6}", board["first"]):
        raise ValueError("HK_FIRST_PRIZE_INVALID")
    if board.get("derived_4d") != board["first"][-4:]:
        raise ValueError("HK_DERIVED_4D_INVALID")
    draw_date = date.fromisoformat(board["draw_date"])
    if draw_date.isoformat() != board["draw_date"]:
        raise ValueError("HK_DRAW_DATE_INVALID")
    checked = datetime.fromisoformat(checked_at)
    if checked.tzinfo is None:
        raise ValueError("HK_CHECK_TIMEZONE_MISSING")
    if draw_date > checked.astimezone(ZoneInfo(HK_SOURCE_TIMEZONE)).date():
        raise ValueError("HK_FUTURE_DRAW_DATE")
    evidence = board.get("finality_evidence") or {}
    if (board.get("result_status") != "final" or
            evidence.get("contract_id") not in HK_FINALITY_CONTRACTS or
            not re.fullmatch(r"[a-f0-9]{64}", str(evidence.get("response_sha256", ""))) or
            not evidence.get("source_marker")):
        raise ValueError("HK_FINALITY_UNVERIFIED")
    return {"draw_id": f"HK:{draw_date.isoformat()}", "result_date": draw_date.isoformat(),
            "nomor": board["first"][-4:], "source_draw_6d": board["first"],
            "source_timezone": HK_SOURCE_TIMEZONE, "market_timezone": HK_MARKET_TIMEZONE,
            "verification": "validated_final_hongkongpools", "finality_evidence": dict(evidence)}
