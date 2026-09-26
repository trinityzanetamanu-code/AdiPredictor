#!/usr/bin/env python3
"""Isolated SDY pipeline rehearsal; never fetches or publishes a real result."""

import hashlib
import json
import subprocess
import tempfile
from datetime import date
from pathlib import Path

from scripts import collector, live_board_collector, prediction_engine

ROOT = Path(__file__).resolve().parents[1]
DRAW_DATE = "2026-09-26"
DRAW_NUMBER = "0052"  # Last four of synthetic first prize 120052.
OBSERVED = "2026-09-26T17:20:00+07:00"


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def run_fixture(workspace: Path, publish_commit: bool = False) -> dict:
    """Run real parsers, verification, merge, engine, archive and optional local git publication."""
    config = collector.load_config()
    cfg = config["markets"]["SDY"]
    sources = {source["id"]: source for source in cfg["sources"]}
    old_rows = json.loads((ROOT / "public/data/sdy.json").read_text())
    old_prediction = json.loads((ROOT / "public/predictions/sdy/latest.json").read_text())
    assert old_rows[0]["result_date"] == "2026-09-25"
    assert old_rows[0]["nomor"] == "1559"

    # The 6D board is deliberately one source, and cannot become canonical.
    board_html = "<main><h2>2026-09-26</h2><table>" + "".join(
        f"<tr><td>{label}</td><td>{number}</td></tr>"
        for label, number in [
            ("1st Prize", "120052"), ("2nd Prize", "100013"),
            ("3rd Prize", "000091"), ("Starter Prize", "004401"),
            ("Consolation Prize", "000002"),
        ]
    ) + "</table></main>"
    board = live_board_collector.parse_six_digit_board(
        board_html, "SDY", "Synthetic single live source", "https://fixture.invalid/live"
    )
    assert board["derived_4d"] == DRAW_NUMBER
    snapshot = {"markets": {"SDY": {**board, "retrieved_at": OBSERVED}}, "retrieved_at": OBSERVED}

    source_a = sources["lomba4d_sdy"]
    source_b = sources["waroengtogel_sdy"]
    samples = old_rows[:5]
    table = "<table>" + "".join(
        f"<tr><td>{date.fromisoformat(row['result_date']).strftime('%d/%m/%Y')}</td><td>{row['nomor']}</td></tr>"
        for row in samples
    ) + f"<tr><td>26/09/2026</td><td>{DRAW_NUMBER}</td></tr></table>"
    long_dates = "<table>" + "".join(
        f"<tr><td>{date.fromisoformat(row['result_date']).day} September 2026 {row['nomor']}</td></tr>"
        for row in samples
    ) + "<tr><td>26 September 2026 0052</td></tr></table>"
    parsed_a = collector.parse_source(table, "SDY", source_a, 2026)
    parsed_b = collector.parse_source(long_dates, "SDY", source_b, 2026)
    assert parsed_a[-1].number == parsed_b[-1].number == DRAW_NUMBER
    def unconfirmed(results):
        try:
            return collector.verify_results(cfg, results)
        except collector.CollectorError as exc:
            assert "cross-check" in str(exc)
            return []

    solo = unconfirmed({source_a["id"]: parsed_a})
    assert not any(item.item.result_date.isoformat() == DRAW_DATE for item in solo)
    conflicting = [*parsed_b]
    conflicting[-1] = collector.ParsedResult(
        "SDY", date.fromisoformat(DRAW_DATE), "0099", source_b["id"],
        source_b["name"], source_b["url"],
    )
    disagreement = unconfirmed({source_a["id"]: parsed_a, source_b["id"]: conflicting})
    assert not any(item.item.result_date.isoformat() == DRAW_DATE for item in disagreement)
    # A denied HTTP response and a parser failure likewise cannot supply confirmation.
    assert not any(item.item.result_date.isoformat() == DRAW_DATE for item in solo)  # 403: no second body
    try:
        collector.parse_source("<html>invalid</html>", "SDY", source_b, 2026)
    except collector.CollectorError:
        pass
    else:
        raise AssertionError("Malformed comparator unexpectedly parsed")

    verified = collector.verify_results(cfg, {source_a["id"]: parsed_a, source_b["id"]: parsed_b})
    newest = next(item for item in verified if item.item.result_date.isoformat() == DRAW_DATE)
    assert newest.confirmations == 2 and newest.verification == "confirmed_2_sources"

    data_dir = workspace / "public/data"
    pred_dir = workspace / "public/predictions"
    data_dir.mkdir(parents=True, exist_ok=True)
    pred_dir.mkdir(parents=True, exist_ok=True)
    (data_dir / "sdy.json").write_text(json.dumps(old_rows))
    (data_dir / "live-draw.json").write_text(json.dumps(snapshot))
    previous_data_dir, previous_pred_dir = collector.DATA_DIR, prediction_engine.PRED_DIR
    try:
        collector.DATA_DIR = data_dir
        prediction_engine.PRED_DIR = pred_dir
        rows, new_rows, _ = collector.merge_records("SDY", [newest], OBSERVED)
        assert len(new_rows) == 1 and rows[0]["nomor"] == DRAW_NUMBER
        collector.write_market("SDY", rows)
        prediction = prediction_engine.build_prediction(
            "SDY", list(reversed(rows)), previous_prediction=old_prediction
        )
        assert prediction["prediction_basis_date"] == DRAW_DATE
        assert prediction["prediction_basis_result"] == DRAW_NUMBER
        assert prediction["dataset_fingerprint"] != old_prediction["dataset_fingerprint"]
        written, _ = prediction_engine.write_prediction("SDY", prediction)
        assert written
        assert prediction_engine.update_history_index("SDY", list(reversed(rows)))
    finally:
        collector.DATA_DIR, prediction_engine.PRED_DIR = previous_data_dir, previous_pred_dir

    published = None
    if publish_commit:
        subprocess.run(["git", "init", "-q"], cwd=workspace, check=True)
        subprocess.run(["git", "add", "public"], cwd=workspace, check=True)
        subprocess.run(["git", "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid",
                        "commit", "-qm", "Isolated verified fixture publication"], cwd=workspace, check=True)
        published = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=workspace, text=True).strip()

    trace = {
        "type": "CONTROLLED_FIXTURE_NOT_REAL_DRAW", "market": "SDY",
        "old": {"date": old_rows[0]["result_date"], "number": old_rows[0]["nomor"],
                "dataset_fingerprint": old_prediction["dataset_fingerprint"],
                "prediction_target": old_prediction["target_date"]},
        "live": {"date": board["draw_date"], "six_digits": board["first"],
                 "number": board["derived_4d"], "observed_at": OBSERVED,
                 "source": board["source"], "state": "BELUM TERVERIFIKASI"},
        "single_source": {"canonical_date": old_rows[0]["result_date"], "new_prediction": False},
        "source_conflict": {"canonical_date": old_rows[0]["result_date"], "new_prediction": False},
        "source_403": {"canonical_date": old_rows[0]["result_date"], "new_prediction": False},
        "parser_failure": {"canonical_date": old_rows[0]["result_date"], "new_prediction": False},
        "verified": {"date": new_rows[0]["result_date"], "number": new_rows[0]["nomor"],
                     "source_ids": new_rows[0]["source_ids"], "verification": new_rows[0]["verification"]},
        "published": {"commit": published, "dataset_sha256": digest(rows),
                      "prediction_basis_date": prediction["prediction_basis_date"],
                      "prediction_basis_result": prediction["prediction_basis_result"],
                      "dataset_fingerprint": prediction["dataset_fingerprint"],
                      "prediction_target": prediction["target_date"],
                      "history_target": json.loads((pred_dir / "sdy/history.json").read_text())["records"][0]["target_date"]},
        "files": ["public/data/live-draw.json", "public/data/sdy.json",
                  "public/predictions/sdy/latest.json", "public/predictions/sdy/history.json"],
    }
    (workspace / "trace.json").write_text(json.dumps(trace, indent=2) + "\n")
    return trace


if __name__ == "__main__":
    with tempfile.TemporaryDirectory(prefix="adipredictor-live-fixture-") as directory:
        report = run_fixture(Path(directory), publish_commit=True)
        print(json.dumps(report, indent=2))
