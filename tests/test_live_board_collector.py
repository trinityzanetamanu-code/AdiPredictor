import json
from pathlib import Path

import pytest

from scripts.live_board_collector import (
    LiveBoardError,
    attach_dataset_validation,
    parse_six_digit_board,
    update_snapshot,
)


FIXTURES = Path(__file__).parent / "fixtures"


def fixture(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


def test_hk_full_six_digit_parser_and_derived_last_four():
    board = parse_six_digit_board(
        fixture("hk-live-board.html"),
        "HK",
        "HongkongPools Market Source",
        "https://www.hongkongpools.com/live",
    )
    assert board["first"] == "510860"
    assert board["second"] == "431651"
    assert board["third"] == "338178"
    assert board["starter"] == ["104235", "665901"]
    assert board["consolation"] == ["990124", "226780"]
    assert board["full_first_prize_6d"] == "510860"
    assert board["derived_4d"] == "0860"
    assert board["draw_date"] == "2026-09-19"


def test_kocokhk_public_mirror_parser_handles_multirow_prizes():
    board = parse_six_digit_board(
        fixture("kocokhk-public-board.html"),
        "HK",
        "KocokHK Mirror",
        "https://rankcrack.com/hk.php",
    )
    assert board["draw_date"] == "2026-09-21"
    assert board["first"] == "219608"
    assert board["derived_4d"] == "9608"
    assert board["starter"] == ["337753", "024355", "318386", "835920"]
    assert len(board["consolation"]) == 8


def test_hk_malformed_board_is_rejected():
    malformed = fixture("hk-live-board.html").replace("510860", "51086", 1)
    with pytest.raises(LiveBoardError, match="first harus exact 6 digit"):
        parse_six_digit_board(malformed, "HK", "source", "https://example.invalid")


def test_sdy_image_filename_digit_parser_and_derived_last_four():
    board = parse_six_digit_board(
        fixture("sdy-live-board-image.html"),
        "SDY",
        "SydneyPoolsToday Market Source",
        "https://www.sydneypoolstoday.com/live.html",
    )
    assert board["first"] == "708748"
    assert board["second"] == "123456"
    assert board["third"] == "654321"
    assert board["starter"] == ["901234"]
    assert board["consolation"] == ["432109"]
    assert board["derived_4d"] == "8748"


def test_sdy_malformed_image_sequence_is_rejected():
    malformed = fixture("sdy-live-board-image.html").replace(
        '<img src="sydney/images/bola2/biru_8.jpg">', "", 1
    )
    with pytest.raises(LiveBoardError, match="first harus exact 6 digit"):
        parse_six_digit_board(malformed, "SDY", "source", "https://example.invalid")


def test_live_board_dataset_match_and_mismatch_are_explicit():
    board = parse_six_digit_board(
        fixture("hk-live-board.html"), "HK", "source", "https://example.invalid"
    )
    matching = attach_dataset_validation(
        board, {"result_date": "2026-09-19", "nomor": "0860"}
    )
    mismatch = attach_dataset_validation(
        board, {"result_date": "2026-09-19", "nomor": "9999"}
    )
    assert matching["matches_dataset"] is True
    assert matching["verification"] == "matches_prediction_dataset"
    assert mismatch["matches_dataset"] is False
    assert mismatch["verification"] == "source_dataset_mismatch"


def test_live_snapshot_is_idempotent_when_only_retrieval_time_changes(tmp_path):
    board = parse_six_digit_board(
        fixture("hk-live-board.html"), "HK", "source", "https://example.invalid"
    )
    path = tmp_path / "live-draw.json"
    assert update_snapshot(path, {"HK": board}, "2026-09-20T10:00:00+07:00") is True
    original = path.read_text(encoding="utf-8")
    assert update_snapshot(path, {"HK": board}, "2026-09-20T10:10:00+07:00") is False
    assert path.read_text(encoding="utf-8") == original
    payload = json.loads(original)
    assert payload["markets"]["HK"]["retrieved_at"] == "2026-09-20T10:00:00+07:00"
