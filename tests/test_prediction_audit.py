import importlib.util
from pathlib import Path

from scripts.prediction_engine import (
    MINIMUM_TRAINING_RECORDS,
    MODELS,
    empty_walk_forward,
    evaluate_prediction,
    load_history,
    model_matrix,
    number_of,
    topk_summary,
    walk_forward_reliability,
)


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "audit_prediction_consensus.py"
SPEC = importlib.util.spec_from_file_location("audit_prediction_consensus", SCRIPT)
AUDIT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(AUDIT)
PROVENANCE_SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "audit_prediction_provenance.py"
PROVENANCE_SPEC = importlib.util.spec_from_file_location("audit_prediction_provenance", PROVENANCE_SCRIPT)
PROVENANCE = importlib.util.module_from_spec(PROVENANCE_SPEC)
PROVENANCE_SPEC.loader.exec_module(PROVENANCE)


def test_incremental_audit_weights_match_production_walk_forward():
    history = load_history("HK")[:390]
    stats = {name: empty_walk_forward() for name in MODELS}
    for index in range(MINIMUM_TRAINING_RECORDS, len(history)):
        train, actual = history[:index], number_of(history[index])
        for name in MODELS:
            matrix, _ = model_matrix(name, train)
            evaluate_prediction(stats[name], topk_summary(name, matrix, train), actual)

    _, audit_weights = AUDIT.reliability_from_prior_stats(stats, history)
    _, production_weights = walk_forward_reliability(history)
    assert audit_weights == production_weights


def test_trace_exposes_numeric_tie_without_calling_score_probability():
    models = {
        name: {"4d_top3": ["0094", "9094", f"{index:04d}"]}
        for index, name in enumerate(MODELS)
    }
    # The production consensus adds a model weight once for Top-3 membership;
    # candidate position does not alter the score.
    from scripts.prediction_engine import consensus_candidates

    weights = {name: 1.0 for name in MODELS}
    ranked = consensus_candidates("4d_top3", models, weights)
    assert ranked[0]["number"] == "0094"
    assert ranked[0]["reliability_weighted_score"] == ranked[1]["reliability_weighted_score"]
    assert "probability" not in AUDIT.__doc__.lower()


def test_audit_tie_hypotheses_consider_only_current_leader_tie_and_subcategories():
    tied = [{"number": "0094", "supported_by": ["P1", "P4"]},
            {"number": "9094", "supported_by": ["P1", "P4"]}]
    summaries = {name: {"4d_top3": ["9094", "0094", "0000"]} for name in MODELS}
    choices = AUDIT.tie_choices(tied, summaries, previous_main="0094")
    assert choices == {"published_ascending": "0094", "descending": "9094",
                       "rank_sensitive": "9094", "avoid_previous_on_tie": "9094"}
    assert AUDIT.subcategory_hits("0094", "0095") == {
        "exact_4d": False, "3d_front": True, "3d_back": False,
        "2d_front": True, "2d_middle": True, "2d_back": False,
    }
    assert AUDIT.tie_choices(tied[:1], summaries, previous_main="0094")["avoid_previous_on_tie"] == "0094"


def test_published_0094_artifact_keeps_provenance_mismatch_visible():
    import json
    import sys

    root = Path(__file__).resolve().parents[1]
    artifact = json.loads((root / "public/predictions/hk/archive/2026-09-23.json").read_text())
    report = PROVENANCE.compare_artifact("HK", artifact, load_history("HK"))
    assert report["fingerprint_match"] is True
    assert report["fields"]["bbfs5_full_draw_coverage"]["artifact"]["hits"] == 51
    assert report["fields"]["bbfs6_full_draw_coverage"]["artifact"]["hits"] == 114
    if sys.version_info[:2] == (3, 11):
        assert report["status"] == "MATCH"
        assert report["replay_p1_weight_with_artifact_peers"] == 0.854575
        assert report["replay_0094_p1_p4_score_with_artifact_p4"] == 1.704213
    else:
        assert report["status"] == "MISMATCH"
        assert report["fields"]["bbfs5_full_draw_coverage"]["replay"]["hits"] == 49
        assert report["fields"]["bbfs6_full_draw_coverage"]["replay"]["hits"] == 116
