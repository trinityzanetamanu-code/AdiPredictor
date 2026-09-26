#!/usr/bin/env python3
"""Reproduce the P1-P8 v2 4D consensus without publishing predictions.

This is an audit-only replay.  Every prediction for a historical target is
built from rows strictly before that target; the target result is used only
afterward to update walk-forward statistics.  It intentionally imports the
production model, ranking, and consensus functions and never writes under
``public/``.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from collections import Counter
from pathlib import Path
from statistics import mean

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.prediction_engine import (
    ENGINE_VERSION,
    MINIMUM_TRAINING_RECORDS,
    MODELS,
    P7_NO_EDGE_MULTIPLIER,
    consensus_candidates,
    dataset_fingerprint,
    empty_walk_forward,
    evaluate_prediction,
    finalize_walk_forward,
    model_matrix,
    model_p7,
    number_of,
    p8_instinct,
    ranked_combinations,
    rnd,
    target_date_for,
    topk_summary,
)

def load_rows(path: Path):
    rows = json.loads(path.read_text(encoding="utf-8"))
    rows = [dict(row) for row in rows if row.get("result_date")]
    rows.sort(key=lambda row: row["result_date"])
    return rows


def reliability_from_prior_stats(stats, history):
    """Match production walk_forward_reliability for already-evaluated rows."""
    results = {name: finalize_walk_forward(value) for name, value in stats.items()}
    metrics = {}
    for name, result in results.items():
        metrics[name] = {
            "2d_top5": mean(result[f"2d_{slot}_top5"]["rate"] for slot in ("front", "middle", "back")),
            "3d_top5": mean(result[f"3d_{slot}_top5"]["rate"] for slot in ("front", "back")),
            "bbfs6_full": result["bbfs6_full_draw_coverage"]["rate"],
            "bbfs5_full": result["bbfs5_full_draw_coverage"]["rate"],
            "4d_top3": result["4d_top3"]["rate"],
        }
    best = {key: max(value[key] for value in metrics.values()) for key in next(iter(metrics.values()))}
    low_4d = max(results[name]["4d_top3"]["hits"] for name in MODELS) < 5
    contributions = {"2d_top5": .30, "3d_top5": .25, "bbfs6_full": .25, "bbfs5_full": .10, "4d_top3": .10}
    if low_4d:
        contributions.pop("4d_top3")
        total = sum(contributions.values())
        contributions = {key: value / total for key, value in contributions.items()}
    raw_scores = {}
    for name in MODELS:
        normalized = {key: metrics[name][key] / best[key] if best[key] else 1.0 for key in contributions}
        raw_scores[name] = sum(contributions[key] * normalized[key] for key in contributions)
    best_score = max(raw_scores.values()) or 1.0
    weights = {name: raw_scores[name] / best_score for name in MODELS}
    _, p7 = model_p7(history, details=True)
    if not p7["cycle_edge_confirmed"]:
        weights["P7"] *= P7_NO_EDGE_MULTIPLIER
    return results, {name: rnd(value) for name, value in weights.items()}


def pearson(left, right):
    left_mean, right_mean = mean(left), mean(right)
    numerator = sum((a - left_mean) * (b - right_mean) for a, b in zip(left, right))
    left_sum = sum((a - left_mean) ** 2 for a in left)
    right_sum = sum((b - right_mean) ** 2 for b in right)
    denominator = math.sqrt(left_sum * right_sum)
    return numerator / denominator if denominator else 0.0


def model_log_scores(matrix, numbers):
    ranked = dict((number, score) for score, number in ranked_combinations(matrix, (0, 1, 2, 3), 625, 5))
    return {number: rnd(ranked[number]) if number in ranked else None for number in numbers}


def tie_choices(tied, summaries, previous_main=None):
    """Counterfactual choices within an *exact* production leader tie only."""
    ascending = min(tied, key=lambda item: item["number"])["number"]
    descending = max(tied, key=lambda item: item["number"])["number"]
    ranked = min(tied, key=lambda item: (
        sum(summaries[name]["4d_top3"].index(item["number"]) + 1 for name in item["supported_by"]),
        item["number"],
    ))["number"]
    fresh = min(tied, key=lambda item: (item["number"] == previous_main, item["number"]))["number"]
    return {"published_ascending": ascending, "descending": descending,
            "rank_sensitive": ranked, "avoid_previous_on_tie": fresh}


def subcategory_hits(candidate, actual):
    return {
        "exact_4d": candidate == actual,
        "3d_front": candidate[:3] == actual[:3],
        "3d_back": candidate[1:] == actual[1:],
        "2d_front": candidate[:2] == actual[:2],
        "2d_middle": candidate[1:3] == actual[1:3],
        "2d_back": candidate[2:] == actual[2:],
    }


def make_forecast(market, train, weights):
    matrices, summaries = {}, {}
    for name in MODELS:
        matrices[name], _ = model_matrix(name, train)
        summaries[name] = topk_summary(name, matrices[name], train)
    p8 = p8_instinct(train)
    consensus = consensus_candidates(
        "4d_top3",
        summaries,
        weights,
        (p8["four_d_main"], p8["four_d_reserve"]),
    )
    leader = consensus[0]
    tied = [
        item for item in consensus
        if item["reliability_weighted_score"] == leader["reliability_weighted_score"]
        and item["raw_support_count"] == leader["raw_support_count"]
    ]
    choices = tie_choices(tied, summaries)
    return {
        "market": market,
        "training_end": train[-1]["result_date"],
        "training_records": len(train),
        "dataset_fingerprint": dataset_fingerprint(market, train),
        "weights": weights,
        "matrices": matrices,
        "models": summaries,
        "consensus": consensus,
        "main": leader["number"],
        "rank_sensitive_tie_choice": choices["rank_sensitive"],
        "leader_tie": [item["number"] for item in tied],
    }


def trace_record(forecast, target_date, actual=None):
    interesting = sorted(set(forecast["leader_tie"]) | {"0094", "9094"})
    rows = []
    by_number = {item["number"]: item for item in forecast["consensus"]}
    for number in interesting:
        item = by_number.get(number)
        rows.append({
            "number": number,
            "consensus": item,
            "model_top3_rank": {
                name: (forecast["models"][name]["4d_top3"].index(number) + 1 if number in forecast["models"][name]["4d_top3"] else None)
                for name in MODELS
            },
            "P1_log_score": model_log_scores(forecast["matrices"]["P1"], [number])[number],
            "P4_log_score": model_log_scores(forecast["matrices"]["P4"], [number])[number],
        })
    return {
        "target_date": target_date,
        "actual_result": actual,
        "training_end": forecast["training_end"],
        "training_records": forecast["training_records"],
        "dataset_fingerprint": forecast["dataset_fingerprint"],
        "model_top3": {name: forecast["models"][name]["4d_top3"] for name in MODELS},
        "walk_forward_weights": forecast["weights"],
        "selected_main": forecast["main"],
        "leader_tie": forecast["leader_tie"],
        "rank_sensitive_tie_choice_hypothesis": forecast["rank_sensitive_tie_choice"],
        "candidate_trace": rows,
    }


def published_summary(path: Path):
    if not path.exists():
        return {"available": False, "path": str(path)}
    payload = json.loads(path.read_text(encoding="utf-8"))
    records = payload.get("records", [])
    selected = []
    for record in records:
        main = record.get("four_d", {}).get("main")
        main_record = main if isinstance(main, dict) else {}
        if isinstance(main, dict):
            main = main.get("number")
        selected.append({
            "target_date": record.get("target_date"),
            "engine_version": record.get("engine_version", record.get("engine")),
            "basis_latest_date": record.get("basis_latest_date", record.get("prediction_basis_date")),
            "basis_latest_result": record.get("basis_latest_result", record.get("prediction_basis_result")),
            "published_main": main,
            "published_main_score": main_record.get("reliability_weighted_score"),
            "published_main_support": main_record.get("supported_by"),
        })
    return {"available": True, "path": str(path), "count": len(records), "records": selected}


def replay(market, rows, start_date, end_date, trace_dates):
    stats = {name: empty_walk_forward() for name in MODELS}
    traces, mains, correlations, overlaps, tie_count, p1p4_ties = {}, [], [], [], 0, 0
    exact_hits = rank_sensitive_hits = alternative_changes = 0
    policy_mains = {name: [] for name in ("published_ascending", "descending", "rank_sensitive", "avoid_previous_on_tie")}
    policy_hits = {name: Counter() for name in policy_mains}
    previous_published_main = None

    for index in range(MINIMUM_TRAINING_RECORDS, len(rows)):
        train, actual_row = rows[:index], rows[index]
        actual = number_of(actual_row)
        _, weights = reliability_from_prior_stats(stats, train)
        forecast = make_forecast(market, train, weights)
        target = actual_row["result_date"]
        tied = [item for item in forecast["consensus"] if item["number"] in forecast["leader_tie"]]
        choices = tie_choices(tied, forecast["models"], previous_published_main)
        previous_published_main = forecast["main"]

        if start_date <= target <= end_date:
            for policy, candidate in choices.items():
                policy_mains[policy].append(candidate)
                policy_hits[policy].update({key: int(hit) for key, hit in subcategory_hits(candidate, actual).items()})
            mains.append((target, forecast["main"]))
            tie_count += len(forecast["leader_tie"]) > 1
            p1p4_ties += any(
                set(item["supported_by"]) == {"P1", "P4"}
                for item in forecast["consensus"]
                if item["number"] in forecast["leader_tie"]
            ) and len(forecast["leader_tie"]) > 1
            correlations.append(pearson(
                [value for row in forecast["matrices"]["P1"] for value in row],
                [value for row in forecast["matrices"]["P4"] for value in row],
            ))
            p1, p4 = set(forecast["models"]["P1"]["4d_top3"]), set(forecast["models"]["P4"]["4d_top3"])
            overlaps.append((len(p1 & p4), len(p1 & p4) / len(p1 | p4)))
            exact_hits += actual == forecast["main"]
            rank_sensitive_hits += actual == forecast["rank_sensitive_tie_choice"]
            alternative_changes += forecast["main"] != forecast["rank_sensitive_tie_choice"]
        if target in trace_dates:
            traces[target] = trace_record(forecast, target, actual)

        for name in MODELS:
            evaluate_prediction(stats[name], forecast["models"][name], actual)

    # Produce the next forecast after all historical outcomes have updated stats.
    _, weights = reliability_from_prior_stats(stats, rows)
    forward = make_forecast(market, rows, weights)
    forward_date = target_date_for(market, __import__("datetime").date.fromisoformat(rows[-1]["result_date"])).isoformat()
    if forward_date in trace_dates:
        traces[forward_date] = trace_record(forward, forward_date)

    counts = Counter(main for _, main in mains)
    transitions = sum(mains[index][1] == mains[index - 1][1] for index in range(1, len(mains)))
    runs, current_number, current_start, current_length = [], None, None, 0
    for target, main in mains:
        if main == current_number:
            current_length += 1
        else:
            if current_number is not None:
                runs.append((current_length, current_number, current_start, previous_target))
            current_number, current_start, current_length = main, target, 1
        previous_target = target
    if current_number is not None:
        runs.append((current_length, current_number, current_start, previous_target))
    longest_0094 = max((run for run in runs if run[1] == "0094"), default=(0, "0094", None, None))

    points = len(mains)
    policy_comparison = {
        name: {
            "changes_from_published": sum(candidate != baseline for candidate, baseline in zip(selected, policy_mains["published_ascending"])),
            "same_main_transitions": sum(selected[i] == selected[i - 1] for i in range(1, len(selected))),
            "0094_main_count": selected.count("0094"),
            "hits": dict(policy_hits[name]),
        }
        for name, selected in policy_mains.items()
    }
    return {
        "out_of_sample": {
            "start_date": start_date,
            "end_date": end_date,
            "points": points,
            "leader_ties": {"count": tie_count, "rate": rnd(tie_count / points if points else 0)},
            "leader_ties_with_P1_P4_support": {"count": p1p4_ties, "rate": rnd(p1p4_ties / points if points else 0)},
            "same_main_transitions": {"count": transitions, "trials": max(0, points - 1), "rate": rnd(transitions / (points - 1) if points > 1 else 0)},
            "unique_mains": len(counts),
            "0094_main": {"count": counts["0094"], "rate": rnd(counts["0094"] / points if points else 0)},
            "longest_0094_run": {"length": longest_0094[0], "start": longest_0094[2], "end": longest_0094[3]},
            "P1_P4_matrix_pearson_mean": rnd(mean(correlations)) if correlations else None,
            "P1_P4_top3_intersection_mean": rnd(mean(value[0] for value in overlaps)) if overlaps else None,
            "P1_P4_top3_jaccard_mean": rnd(mean(value[1] for value in overlaps)) if overlaps else None,
            "published_tie_break_exact_hits": exact_hits,
            "rank_sensitive_hypothesis_exact_hits": rank_sensitive_hits,
            "rank_sensitive_hypothesis_changes": alternative_changes,
            "tie_policy_comparison": policy_comparison,
        },
        "traces": [traces[key] for key in sorted(traces)],
    }


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--market", default="HK", choices=("HK", "SDY", "SGP"))
    parser.add_argument("--data-file", type=Path)
    parser.add_argument("--start", default="2024-01-01")
    parser.add_argument("--end", default="9999-12-31")
    parser.add_argument("--trace-dates", default="2026-09-20,2026-09-21,2026-09-22,2026-09-23")
    parser.add_argument("--published-history", type=Path)
    parser.add_argument("--output", type=Path)
    return parser.parse_args()


def main():
    args = parse_args()
    data_file = args.data_file or ROOT / "public" / "data" / f"{args.market.lower()}.json"
    published_history = args.published_history or ROOT / "public" / "predictions" / args.market.lower() / "history.json"
    rows = load_rows(data_file)
    end = min(args.end, rows[-1]["result_date"])
    result = {
        "audit_kind": "RETROSPECTIVE_WALK_FORWARD_REPLAY_NOT_PUBLISHED_PREDICTIONS",
        "engine_version": ENGINE_VERSION,
        "market": args.market,
        "dataset": {
            "path": str(data_file),
            "records": len(rows),
            "start": rows[0]["result_date"],
            "end": rows[-1]["result_date"],
            "fingerprint": dataset_fingerprint(args.market, rows),
        },
        "leakage_guard": "For target index i, train=rows[:i]; rows[i] is evaluated only after prediction.",
        "score_semantics": "Sum of supporting models' relative walk-forward reliability weights; not a calibrated 4D probability.",
        "star_semantics": "Threshold label derived from support count and weighted score; not a calibrated probability or guarantee.",
        **replay(args.market, rows, args.start, end, set(filter(None, args.trace_dates.split(",")))),
        "published_archive": published_summary(published_history),
    }
    rendered = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.write_text(rendered, encoding="utf-8")
    else:
        print(rendered, end="")


if __name__ == "__main__":
    main()
