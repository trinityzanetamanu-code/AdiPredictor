import copy
import hashlib
import inspect
import json
import os
import shutil
import subprocess
from datetime import date, timedelta

import pytest

from scripts import prediction_engine as pe


def make_history(count=390, market="HK", start=date(2025, 1, 1)):
    rows = []
    value = 1729
    cursor = start
    while len(rows) < count:
        if market != "SGP" or cursor.weekday() in {0, 2, 3, 5, 6}:
            value = (value * 73 + 41) % 10000
            rows.append({
                "result_date": cursor.isoformat(),
                "nomor": f"{value:04d}",
                "periode": f"{market}-{len(rows) + 1}",
                "market": market,
            })
        cursor += timedelta(days=1)
    return rows


@pytest.fixture(scope="module")
def history():
    return make_history()


@pytest.fixture(scope="module")
def built(history, tmp_path_factory):
    original = pe.PRED_DIR
    pe.PRED_DIR = tmp_path_factory.mktemp("built-predictions")
    try:
        return pe.build_prediction("HK", history)
    finally:
        pe.PRED_DIR = original


def stable_payload(payload):
    value = copy.deepcopy(payload)
    value.pop("generated_at", None)
    return value


def test_deterministic_same_data_same_prediction(history, tmp_path, monkeypatch):
    monkeypatch.setattr(pe, "PRED_DIR", tmp_path)
    first = pe.build_prediction("HK", history)
    second = pe.build_prediction("HK", history)
    assert stable_payload(first) == stable_payload(second)


def test_dataset_validation(history):
    result = pe.validate_dataset("HK", history)
    assert result["data_validation_status"] == "VALID"
    assert result["total_records"] == len(history)
    assert result["missing_expected_draws"] == []


def test_no_duplicate_dates_detected(history):
    duplicated = history + [dict(history[-1])]
    result = pe.validate_dataset("HK", duplicated)
    assert result["data_validation_status"] == "INVALID"
    assert result["duplicate_dates"] == [history[-1]["result_date"]]


def test_sgp_target_schedule():
    assert pe.target_date_for("SGP", date(2026, 9, 20)).isoformat() == "2026-09-21"
    assert pe.target_date_for("SGP", date(2026, 9, 21)).isoformat() == "2026-09-23"


def test_top_k_lengths_exact(built):
    for model in built["models"].values():
        assert len(model["4d_top3"]) == 3
        assert len(model["3d_front_top5"]) == 5
        assert len(model["3d_back_top5"]) == 5
        assert len(model["2d_front_top5"]) == 5
        assert len(model["2d_middle_top5"]) == 5
        assert len(model["2d_back_top5"]) == 5


def test_support_only_from_exact_top_k_membership(built):
    for field, candidates in built["weighted_consensus"]["candidate_rankings"].items():
        for candidate in candidates:
            expected = [name for name in pe.MODELS if candidate["number"] in built["models"][name][field]]
            assert candidate["supported_by"] == expected


def test_no_hidden_position_support():
    models = {name: {"2d_front_top5": ["12", "34", "56", "78", "90"]} for name in pe.MODELS}
    assert pe.exact_support("13", "2d_front_top5", models) == []


def test_reliability_weighted_ranking(built):
    rows = built["weighted_consensus"]["candidate_rankings"]["2d_front_top5"]
    scores = [row["reliability_weighted_score"] for row in rows]
    assert scores == sorted(scores, reverse=True)
    assert [row["weighted_rank"] for row in rows] == list(range(1, len(rows) + 1))


@pytest.mark.parametrize("raw,weighted,expected", [(3, 2.35, 3), (2, 1.55, 2), (2, 1.20, 1), (1, 5.0, 0), (3, 1.19, 0)])
def test_star_thresholds(raw, weighted, expected):
    assert pe.stars_for(raw, weighted) == expected


def test_p5_visual_only_weight_zero_when_edge_false(history):
    matrix, details = pe.model_p5(history, details=True)
    if not details["visual_predictive_edge_confirmed"]:
        assert details["visual_vote_weight"] == 0
        assert details["P5_MODE"] == "fallback"
        assert details["visual_contribution_enabled"] is False
        assert matrix == pe.normalize_matrix(pe.position_frequency(history[-180:]))


def test_p5_unconfirmed_visual_cannot_change_ranking(history, monkeypatch):
    baseline = pe.normalize_matrix(pe.position_frequency(history[-180:]))
    blocked = {
        "visual_only_backtest": {"hits": 0, "trials": 100, "hit_rate": 0, "baseline": .1, "wilson_95_ci": [0, .04]},
        "fallback_backtest": {"hits": 0, "trials": 100, "hit_rate": 0},
        "hybrid_backtest": {"hits": 0, "trials": 100, "hit_rate": 0},
        "visual_pattern_confirmed": True,
        "visual_predictive_edge_confirmed": False,
        "visual_vote_weight": 0.0,
    }
    monkeypatch.setattr(pe, "visual_backtests", lambda rows: blocked)
    matrix, details = pe.model_p5(history, details=True)
    assert matrix == baseline
    assert [pe.top_digits(row, 10) for row in matrix] == [pe.top_digits(row, 10) for row in baseline]
    assert details["P5_MODE"] == "fallback"


def test_p7_penalty_when_edge_false(built):
    p7 = built["models"]["P7"]
    if not p7["analysis"]["cycle_edge_confirmed"]:
        assert p7["walk_forward"]["p7_no_edge_multiplier_applied"] is True
        assert p7["analysis"]["no_edge_multiplier"] == pe.P7_NO_EDGE_MULTIPLIER


def test_p8_does_not_accept_or_read_consensus(history):
    assert list(inspect.signature(pe.p8_instinct).parameters) == ["history"]
    source = inspect.getsource(pe.p8_instinct)
    assert "weighted_consensus" not in source
    assert "raw_consensus" not in source


def test_p8_frozen_fingerprint_stable(history):
    first = pe.p8_instinct(history)
    second = pe.p8_instinct(history)
    assert first["frozen"] is True
    assert first["fingerprint"] == second["fingerprint"]
    payload = dict(first)
    fingerprint = payload.pop("fingerprint")
    assert fingerprint == hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def test_exact_vs_reverse_2d_audit():
    result = pe.audit_list("90", ["09", "12"], allow_reverse=True)
    assert result["exact"] is False
    assert result["reverse"] is True


def test_exact_vs_permutation_audit():
    result = pe.audit_match("1234", "4321")
    assert result["exact"] is False
    assert result["permutation"] is True


def test_bbfs_coverage():
    result = pe.bbfs_audit("9091", "90123")
    assert result["distinct_digits_missed"] == []
    assert result["occurrence_coverage"]["captured"] == 4
    assert result["full_draw_coverage"] is True


def test_kembar_denominator_separation(history):
    result = pe.kembar_backtest(history)["11"]
    assert result["any_position"]["draws"] == len(history)
    assert result["per_slot"]["total_adjacent_slots"] == len(history) * 3
    assert "per_draw_any_position_rate" in result["any_position"]


def test_candidate_diversity(built):
    diversity = built["final_candidates"]["four_d"]["diversity"]
    assert 0 <= diversity["main_reserve_position_overlap"] <= 1
    assert 0 <= diversity["digit_set_overlap"] <= 1
    assert diversity["structural_difference"] is True
    assert diversity["model_difference"] is True
    assert built["final_candidates"]["four_d"]["main"]["number"] != built["final_candidates"]["four_d"]["reserve"]["number"]
    slots = built["final_candidates"]["four_d"]
    numbers = [slots[name]["number"] for name in ("main", "alternative", "reserve", "single_pair")]
    assert slots["all_slots_distinct"] is True
    assert len(numbers) == len(set(numbers))


def test_candidate_counts(built):
    counts = built["candidate_counts"]
    assert counts["total_4d_candidates"] == 6
    assert counts["total_3d_candidates"] == 12
    assert counts["total_2d_candidates"] == 20
    assert counts["total_direct_number_candidates"] == 38
    assert counts["total_bbfs_scenarios"] == 7


def test_prediction_engine_idempotency(tmp_path, monkeypatch, built):
    monkeypatch.setattr(pe, "PRED_DIR", tmp_path)
    first, _ = pe.write_prediction("HK", built)
    latest = tmp_path / "hk" / "latest.json"
    before = latest.read_bytes()
    second, reason = pe.write_prediction("HK", copy.deepcopy(built))
    assert first is True
    assert second is False and reason == "unchanged"
    assert latest.read_bytes() == before


def test_archive_prediction_remains_immutable_after_actual(tmp_path, monkeypatch, built):
    monkeypatch.setattr(pe, "PRED_DIR", tmp_path)
    payload = copy.deepcopy(built)
    payload["target_date"] = payload["latest_result"]["date"]
    archive = tmp_path / "hk" / "archive" / f"{payload['target_date']}.json"
    archive.parent.mkdir(parents=True)
    archive.write_text('{"sentinel": true}\n', encoding="utf-8")
    pe.write_prediction("HK", payload, force=True)
    assert json.loads(archive.read_text()) == {"sentinel": True}


def test_pending_archive_can_refresh_before_actual(tmp_path, monkeypatch, built):
    monkeypatch.setattr(pe, "PRED_DIR", tmp_path)
    payload = copy.deepcopy(built)
    archive = tmp_path / "hk" / "archive" / f"{payload['target_date']}.json"
    archive.parent.mkdir(parents=True)
    archive.write_text('{"sentinel": true}\n', encoding="utf-8")
    pe.write_prediction("HK", payload, force=True)
    assert json.loads(archive.read_text())["dataset_fingerprint"] == payload["dataset_fingerprint"]


def test_visual_svg_uses_actual_rows(tmp_path, monkeypatch, history):
    monkeypatch.setattr(pe, "PRED_DIR", tmp_path)
    _, p5 = pe.model_p5(history, details=True)
    visuals = pe.generate_visual_patterns("HK", history, "2026-01-01", p5)
    assert visuals
    svg = (
        tmp_path
        / "hk"
        / "visuals"
        / "2026-01-01"
        / "pattern-01.svg"
    ).read_text(encoding="utf-8")
    assert "<svg" in svg
    assert visuals[0]["start_point"] in svg or visuals[0]["end_point"] in svg
    assert all(item["number_of_occurrences"] > 0 for item in visuals)
    assert all(item["visual_pattern_confirmed"] is True for item in visuals)
    assert all("visual_predictive_edge_confirmed" in item for item in visuals)
    assert all("wilson_95_ci" in item for item in visuals)
    assert all(item["backtest_samples"] <= item["number_of_occurrences"] for item in visuals)
    assert all(item["baseline"] in (0.1, 0.01, 0.001) for item in visuals)
    signatures = {
        (item["historical_hit_rate"], tuple(item["wilson_95_ci"]), item["baseline"])
        for item in visuals
    }
    assert len(signatures) > 1


def test_android_release_configurator_patches_generated_gradle(tmp_path):
    node = shutil.which("node")
    if not node:
        pytest.skip("Node is unavailable in this test environment")
    gradle = tmp_path / "build.gradle"
    gradle.write_text(
        "apply plugin: 'com.android.application'\n\n"
        "android {\n"
        "    namespace \"com.adipredictor.app\"\n"
        "    defaultConfig {\n"
        "        applicationId \"com.adipredictor.app\"\n"
        "        versionCode 1\n"
        "        versionName \"1.0\"\n"
        "    }\n"
        "    buildTypes {\n"
        "        release {\n"
        "            minifyEnabled false\n"
        "        }\n"
        "    }\n"
        "}\n",
        encoding="utf-8",
    )
    env = {
        **os.environ,
        "ANDROID_GRADLE_PATH": str(gradle),
        "ANDROID_VERSION_CODE": "100321",
        "ANDROID_VERSION_NAME": "2.0.0+build.100321",
    }
    subprocess.run(
        [node, str(pe.ROOT / "scripts" / "configure_android_release.mjs")],
        check=True,
        env=env,
        capture_output=True,
        text=True,
    )
    patched = gradle.read_text(encoding="utf-8")
    assert 'applicationId "com.adipredictor.app"' in patched
    assert "versionCode 100321" in patched
    assert 'versionName "2.0.0+build.100321"' in patched
    assert "signingConfig signingConfigs.release" in patched


def test_prediction_history_index_uses_archives_and_actuals(tmp_path, monkeypatch, built, history):
    monkeypatch.setattr(pe, "PRED_DIR", tmp_path)
    payload = copy.deepcopy(built)
    payload["target_date"] = history[-1]["result_date"]
    archive = tmp_path / "hk" / "archive" / f"{payload['target_date']}.json"
    archive.parent.mkdir(parents=True)
    archive.write_text(json.dumps(payload), encoding="utf-8")
    assert pe.update_history_index("HK", history) is True
    index = json.loads((tmp_path / "hk" / "history.json").read_text())
    assert index["count"] == 1
    record = index["records"][0]
    assert record["actual_result"]["number"] == history[-1]["nomor"]
    assert record["outcome_audit"]["target_date"] == history[-1]["result_date"]
    assert record["hit_miss_summary"] is not None
    assert pe.update_history_index("HK", history) is False


def test_walk_forward_uses_all_available_points(built, history):
    expected = len(history) - pe.MINIMUM_TRAINING_RECORDS
    assert all(model["walk_forward"]["out_of_sample_points"] == expected for model in built["models"].values())
