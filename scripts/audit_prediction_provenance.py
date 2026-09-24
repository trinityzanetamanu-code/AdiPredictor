#!/usr/bin/env python3
"""Compare one published prediction artifact with a read-only P1 replay.

The command never writes predictions.  It records enough information to show
whether the artifact's P1 walk-forward classifications can be reproduced from
the committed engine and the dataset fingerprint stored in that artifact.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.prediction_engine import (
    MINIMUM_TRAINING_RECORDS,
    dataset_fingerprint,
    empty_walk_forward,
    evaluate_prediction,
    finalize_walk_forward,
    load_history,
    model_p1,
    number_of,
    topk_summary,
)

FIELDS = (
    "bbfs5_digit_coverage",
    "bbfs5_full_draw_coverage",
    "bbfs6_digit_coverage",
    "bbfs6_full_draw_coverage",
)


def p1_walk_forward_trace(history):
    stats = empty_walk_forward()
    trace = []
    for index in range(MINIMUM_TRAINING_RECORDS, len(history)):
        train, actual_row = history[:index], history[index]
        matrix, _ = model_p1(train)
        summary = topk_summary("P1", matrix, train)
        actual = number_of(actual_row)
        evaluate_prediction(stats, summary, actual)
        trace.append({
            "target_date": actual_row["result_date"],
            "actual": actual,
            "bbfs5": summary["bbfs5"],
            "bbfs6": summary["bbfs6"],
            "bbfs5_full_draw": set(actual).issubset(set(summary["bbfs5"])),
            "bbfs6_full_draw": set(actual).issubset(set(summary["bbfs6"])),
        })
    material = json.dumps(trace, sort_keys=True, separators=(",", ":"))
    return finalize_walk_forward(stats), trace, hashlib.sha256(material.encode()).hexdigest()


def compare_artifact(market, artifact, history):
    boundary = artifact.get("dataset", {}).get("last_date")
    bounded = [row for row in history if not boundary or row["result_date"] <= boundary]
    replay, trace, trace_digest = p1_walk_forward_trace(bounded)
    published = artifact.get("models", {}).get("P1", {}).get("walk_forward", {})
    fields = {
        field: {
            "artifact": published.get(field),
            "replay": replay.get(field),
            "match": published.get(field) == replay.get(field),
        }
        for field in FIELDS
    }
    fingerprint = dataset_fingerprint(market, bounded)
    engine_source = (ROOT / "scripts" / "prediction_engine.py").read_bytes()
    return {
        "status": "MATCH" if all(item["match"] for item in fields.values()) else "MISMATCH",
        "market": market,
        "target_date": artifact.get("target_date"),
        "generated_at": artifact.get("generated_at"),
        "engine_version": artifact.get("engine_version", artifact.get("engine")),
        "replay_engine_source_sha256": hashlib.sha256(engine_source).hexdigest(),
        "artifact_has_engine_source_sha256": bool(artifact.get("engine_source_sha256")),
        "dataset_rows": len(bounded),
        "dataset_last_date": bounded[-1]["result_date"] if bounded else None,
        "artifact_fingerprint": artifact.get("dataset_fingerprint"),
        "replay_fingerprint": fingerprint,
        "fingerprint_match": artifact.get("dataset_fingerprint") == fingerprint,
        "classification_trace_sha256": trace_digest,
        "artifact_has_per_target_classification_trace": False,
        "fields": fields,
        "last_replay_classifications": trace[-5:],
        "limitation": (
            "The artifact stores aggregate counts but no per-target BBFS classification "
            "trace or engine source hash. A mismatch cannot identify the unpublished "
            "evaluator variant that produced it."
        ),
    }


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--market", default="HK", choices=("HK", "SDY", "SGP"))
    parser.add_argument("--target-date", default="2026-09-23")
    parser.add_argument("--archive", type=Path)
    return parser.parse_args()


def main():
    args = parse_args()
    archive = args.archive or ROOT / "public" / "predictions" / args.market.lower() / "archive" / f"{args.target_date}.json"
    artifact = json.loads(archive.read_text(encoding="utf-8"))
    print(json.dumps(compare_artifact(args.market, artifact, load_history(args.market)), indent=2))


if __name__ == "__main__":
    main()
