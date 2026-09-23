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
