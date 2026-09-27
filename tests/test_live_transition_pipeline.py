import json
from datetime import date

import pytest

from scripts.simulate_live_transition import run_fixture
from scripts import collector


def test_live_to_verified_dataset_prediction_archive_and_local_publication(tmp_path):
    trace = run_fixture(tmp_path, publish_commit=True)
    assert trace["type"] == "CONTROLLED_FIXTURE_NOT_REAL_DRAW"
    assert trace["live"]["six_digits"] == "120052"
    assert trace["live"]["number"] == "0052"
    for phase in ("single_source", "source_conflict", "source_403", "parser_failure"):
        assert trace[phase] == {"canonical_date": "2026-09-25", "new_prediction": False}
    assert trace["verified"]["verification"] == "confirmed_2_sources"
    assert trace["published"]["prediction_basis_result"] == "0052"
    assert trace["published"]["history_target"] == trace["published"]["prediction_target"]
    assert len(trace["published"]["commit"]) == 40
    assert json.loads((tmp_path / "trace.json").read_text()) == trace
    assert not (tmp_path / "public/data/sgp.json").exists()  # TOTO/SGP are excluded.


def test_same_date_correction_requires_explicit_review(tmp_path, monkeypatch):
    old = [{"result_date": "2026-09-26", "nomor": "0052", "verification": "confirmed_2_sources"}]
    (tmp_path / "sdy.json").write_text(json.dumps(old))
    monkeypatch.setattr(collector, "DATA_DIR", tmp_path)
    correction = collector.VerifiedResult(
        collector.ParsedResult("SDY", date(2026, 9, 26), "0099",
                               "source_a", "Independent Source", "https://fixture.invalid"),
        "confirmed_2_sources", 2, ["source_a", "source_b"],
    )
    with pytest.raises(collector.CollectorError, match="CONFLICT SDY 2026-09-26"):
        collector.merge_records("SDY", [correction], "2026-09-26T17:21:00+07:00")
    assert json.loads((tmp_path / "sdy.json").read_text()) == old


def test_equal_conflicting_source_quorums_never_pick_iteration_order():
    cfg = {"verification_mode": "crosscheck", "min_confirmations": 2,
           "sources": [{"id": source, "priority": index} for index, source in enumerate("abcd")]}
    reports = {
        source: [collector.ParsedResult("SDY", date(2026, 9, 26),
                                        "0052" if source in "ab" else "0099",
                                        source, source, "https://fixture.invalid")]
        for source in "abcd"
    }
    with pytest.raises(collector.CollectorError, match="cross-check"):
        collector.verify_results(cfg, reports)
