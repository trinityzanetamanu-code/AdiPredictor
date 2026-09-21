#!/usr/bin/env python3
"""Deterministic, auditable AdiPredictor P1-P8 engine (schema v2)."""

from __future__ import annotations

import argparse
import hashlib
import html
import itertools
import json
import math
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path
from statistics import mean
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "public" / "data"
PRED_DIR = ROOT / "public" / "predictions"
CONFIG_PATH = ROOT / "config" / "collector_sources.json"
MARKETS = ("HK", "SDY", "SGP")
MODELS = tuple(f"P{i}" for i in range(1, 8))
ENGINE_VERSION = "AdiPredictor-P1-P8-v2"
SCHEMA_VERSION = 2
MINIMUM_TRAINING_RECORDS = 365
P7_NO_EDGE_MULTIPLIER = 0.85
POSITIONS = ("AS", "KOP", "KEPALA", "EKOR")
LAGS = (1, 2, 3, 4, 5, 7, 10, 14, 21, 30)
JAKARTA = ZoneInfo("Asia/Jakarta")
DISCLAIMER = (
    "Analisis historis tidak dapat memastikan hasil berikutnya. Confidence dan "
    "rating bintang merupakan ukuran relatif terhadap model, consensus, dan "
    "backtest, bukan jaminan hasil."
)


def rate(hits, total):
    return hits / total if total else 0.0


def rnd(value):
    return round(float(value), 6)


def digits_of(row):
    value = str(row.get("nomor", "")).zfill(4)
    if len(value) != 4 or not value.isdigit():
        raise ValueError(f"Invalid 4D result: {row!r}")
    return tuple(map(int, value))


def number_of(row):
    return "".join(map(str, digits_of(row)))


def load_config():
    return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))


def load_history(market):
    rows = json.loads((DATA_DIR / f"{market.lower()}.json").read_text(encoding="utf-8"))
    rows = [dict(row) for row in rows if row.get("result_date")]
    rows.sort(key=lambda row: row["result_date"])
    for row in rows:
        digits_of(row)
    if len(rows) <= MINIMUM_TRAINING_RECORDS:
        raise RuntimeError(f"{market}: dataset too short ({len(rows)})")
    return rows


def market_weekdays(market, config=None):
    if market != "SGP":
        return set(range(7))
    config = config or load_config()
    return set(config["markets"]["SGP"]["period_rule"]["weekdays"])


def target_date_for(market, latest_date, config=None):
    candidate = latest_date + timedelta(days=1)
    allowed = market_weekdays(market, config)
    while candidate.weekday() not in allowed:
        candidate += timedelta(days=1)
    return candidate


def increment_period(period):
    if not period or "-" not in str(period):
        return None
    prefix, value = str(period).rsplit("-", 1)
    return f"{prefix}-{int(value) + 1}" if value.isdigit() else None


def dataset_fingerprint(market, history):
    rows = "|".join(f"{r['result_date']}:{number_of(r)}" for r in history)
    return hashlib.sha256(f"{ENGINE_VERSION}|{market}|{rows}".encode()).hexdigest()


def validate_dataset(market, history, config=None):
    config = config or load_config()
    by_date = defaultdict(set)
    for row in history:
        by_date[row["result_date"]].add(number_of(row))
    counts = Counter(row["result_date"] for row in history)
    duplicates = sorted(d for d, count in counts.items() if count > 1)
    conflicts = [
        {"date": d, "numbers": sorted(values)}
        for d, values in sorted(by_date.items()) if len(values) > 1
    ]
    start = date.fromisoformat(history[0]["result_date"])
    end = date.fromisoformat(history[-1]["result_date"])
    present = set(by_date)
    missing = []
    cursor = start
    allowed = market_weekdays(market, config)
    while cursor <= end:
        if cursor.weekday() in allowed and cursor.isoformat() not in present:
            missing.append(cursor.isoformat())
        cursor += timedelta(days=1)
    return {
        "total_records": len(history), "start_date": start.isoformat(),
        "end_date": end.isoformat(), "latest_result": number_of(history[-1]),
        "latest_result_date": end.isoformat(),
        "next_target": target_date_for(market, end, config).isoformat(),
        "missing_expected_draws": missing, "duplicate_dates": duplicates,
        "conflicting_results": conflicts,
        "period_continuity": "CONTINUOUS" if not missing else "GAPS_PRESENT",
        "data_validation_status": "VALID" if not duplicates and not conflicts else "INVALID",
        "schedule": config["markets"][market].get("schedule", "daily"),
    }


def normalize(values):
    total = float(sum(values))
    return [v / total for v in values] if total else [0.1] * 10


def normalize_matrix(matrix):
    return [normalize(row) for row in matrix]


def top_digits(values, count):
    return sorted(range(10), key=lambda d: (-values[d], d))[:count]


def aggregate(matrix):
    return [sum(matrix[p][d] for p in range(4)) for d in range(10)]


def position_frequency(history, alpha=1.0):
    counts = [[alpha] * 10 for _ in range(4)]
    for row in history:
        for p, d in enumerate(digits_of(row)):
            counts[p][d] += 1
    return normalize_matrix(counts)


def global_frequency(history, alpha=1.0):
    counts = [alpha] * 10
    for row in history:
        for d in digits_of(row):
            counts[d] += 1
    return normalize(counts)


def raw_positions(history):
    counts = [[0] * 10 for _ in range(4)]
    for row in history:
        for p, d in enumerate(digits_of(row)):
            counts[p][d] += 1
    return counts


def pair_counts(history):
    out = {name: Counter() for name in ("front", "middle", "back", "cross")}
    for row in history:
        n = number_of(row)
        out["front"][n[:2]] += 1; out["middle"][n[1:3]] += 1
        out["back"][n[2:]] += 1; out["cross"][n[0] + n[3]] += 1
    return out


def cooccurrence(history):
    counts = [[0] * 10 for _ in range(10)]
    for row in history:
        unique = set(digits_of(row))
        for a in unique:
            for b in unique - {a}:
                counts[a][b] += 1
    return counts


def wilson_interval(hits, total, z=1.959963984540054):
    if not total:
        return [0.0, 1.0]
    p = hits / total; denominator = 1 + z * z / total
    center = (p + z * z / (2 * total)) / denominator
    margin = z * math.sqrt((p * (1 - p) + z * z / (4 * total)) / total) / denominator
    return [rnd(max(0, center - margin)), rnd(min(1, center + margin))]


def model_p1(history, details=False):
    pos, glob = position_frequency(history), global_frequency(history)
    matrix = normalize_matrix([[.72 * pos[p][d] + .28 * glob[d] for d in range(10)] for p in range(4)])
    if not details:
        return matrix, {}
    raw = Counter(d for row in history for d in digits_of(row))
    rank = sorted(range(10), key=lambda d: (-raw[d], d))
    years = defaultdict(Counter)
    for row in history:
        years[row["result_date"][:4]].update(digits_of(row))
    pairs = pair_counts(history)
    return matrix, {
        "global_digit_frequency": {str(d): raw[d] for d in range(10)},
        "position_frequency": {POSITIONS[p]: {str(d): raw_positions(history)[p][d] for d in range(10)} for p in range(4)},
        "temperature": {"hot": list(map(str, rank[:2])), "warm": list(map(str, rank[2:4])), "neutral": list(map(str, rank[4:7])), "cold": list(map(str, rank[7:]))},
        "year_by_year_distribution": {y: {str(d): c[d] for d in range(10)} for y, c in sorted(years.items())},
        "historical_pairs": {name: counter.most_common(10) for name, counter in pairs.items()},
        "digit_cooccurrence": cooccurrence(history),
    }


def digit_gaps(history):
    current, maximum = {}, {}
    for d in range(10):
        seen = [i for i, row in enumerate(history) if d in digits_of(row)]
        current[d] = len(history) - 1 - seen[-1] if seen else len(history)
        boundaries = [-1] + seen + [len(history)]
        maximum[d] = max(boundaries[i + 1] - boundaries[i] - 1 for i in range(len(boundaries) - 1))
    return current, maximum


def model_p2(history, details=False):
    sizes = (10, 20, 30, 60, 90); weights = (.25, .20, .20, .18, .17)
    positions = {s: position_frequency(history[-s:]) for s in sizes}
    globals_ = {s: global_frequency(history[-s:]) for s in sizes}
    gaps, max_gaps = digit_gaps(history)
    matrix = []
    for p in range(4):
        row = []
        for d in range(10):
            trend = sum(w * positions[s][p][d] for s, w in zip(sizes, weights))
            accel = max(-.05, min(.05, positions[10][p][d] - positions[60][p][d]))
            row.append(trend + .12 * globals_[30][d] + .06 * accel + .02 * gaps[d] / max(1, max_gaps[d]))
        matrix.append(row)
    matrix = normalize_matrix(matrix)
    if not details:
        return matrix, {}
    return matrix, {
        "windows": {f"last_{s}": {"global": {str(d): rnd(globals_[s][d]) for d in range(10)}, "position": [{str(d): rnd(positions[s][p][d]) for d in range(10)} for p in range(4)]} for s in sizes},
        "acceleration": {str(d): rnd(globals_[10][d] - globals_[60][d]) for d in range(10)},
        "cooling": {str(d): globals_[10][d] < globals_[60][d] for d in range(10)},
        "current_digit_gap": {str(d): gaps[d] for d in range(10)},
        "historical_maximum_gap": {str(d): max_gaps[d] for d in range(10)},
        "gap_interpretation": "Relative evidence only; a long gap is not certainty.",
    }


def transition_tables(history):
    same = [[[0] * 10 for _ in range(10)] for _ in range(4)]
    cross = {f"{POSITIONS[a]}->{POSITIONS[b]}": [[0] * 10 for _ in range(10)] for a in range(4) for b in range(4) if a != b}
    for i in range(1, len(history)):
        before, after = digits_of(history[i - 1]), digits_of(history[i])
        for p in range(4): same[p][before[p]][after[p]] += 1
        for a in range(4):
            for b in range(4):
                if a != b: cross[f"{POSITIONS[a]}->{POSITIONS[b]}"][before[a]][after[b]] += 1
    return same, cross


def model_p3(history, details=False):
    fallback, latest = position_frequency(history), digits_of(history[-1])
    same, cross = transition_tables(history)
    matrix = []
    for target in range(4):
        counts = [1.0 + same[target][latest[target]][d] for d in range(10)]
        for source in range(4):
            if source != target:
                table = cross[f"{POSITIONS[source]}->{POSITIONS[target]}"]
                for d in range(10): counts[d] += .22 * table[latest[source]][d]
        trans = normalize(counts)
        matrix.append([.78 * trans[d] + .22 * fallback[target][d] for d in range(10)])
    matrix = normalize_matrix(matrix)
    if not details: return matrix, {}
    pairs = pair_counts(history)
    pair_names = {
        "front": lambda n: n[:2], "middle": lambda n: n[1:3],
        "back": lambda n: n[2:], "cross": lambda n: n[0] + n[3],
    }
    pair_transitions = {name: defaultdict(Counter) for name in pair_names}
    for i in range(1, len(history)):
        previous, current = number_of(history[i - 1]), number_of(history[i])
        for name, getter in pair_names.items():
            pair_transitions[name][getter(previous)][getter(current)] += 1
    latest_number = number_of(history[-1])
    return matrix, {
        "transition_origin": "".join(map(str, latest)),
        "same_position_transition_matrix": {POSITIONS[p]: same[p] for p in range(4)},
        "cross_position_transition_matrix": cross,
        "pairs": {name: counter.most_common(12) for name, counter in pairs.items()},
        "rare_pairs": {name: sorted(counter.items(), key=lambda x: (x[1], x[0]))[:10] for name, counter in pairs.items()},
        "next_draw_pair_behaviour": {
            name: {
                "origin": getter(latest_number),
                "top_successors": pair_transitions[name][getter(latest_number)].most_common(10),
            }
            for name, getter in pair_names.items()
        },
        "reverse_pair_next_draw_occurrences": sum(number_of(history[i])[:2] == number_of(history[i-1])[:2][::-1] or number_of(history[i])[2:] == number_of(history[i-1])[2:][::-1] for i in range(1, len(history))),
        "digit_cooccurrence": cooccurrence(history),
    }


def duplicate_class(number):
    groups = sorted(Counter(number).values(), reverse=True)
    return {tuple([1,1,1,1]): "NO_DUPLICATE", tuple([2,1,1]): "SINGLE_PAIR", tuple([2,2]): "DOUBLE_PAIR", tuple([3,1]): "TRIPLE", tuple([4]): "QUADRUPLE"}[tuple(groups)]


def duplicate_diagnostics(history):
    classes, repeat_digits, positions = Counter(), Counter(), Counter()
    conditional_digits, conditional_structures = defaultdict(Counter), defaultdict(Counter)
    for i, row in enumerate(history):
        n = number_of(row); cls = duplicate_class(n); classes[cls] += 1
        repeated = [d for d, count in Counter(n).items() if count >= 2]; repeat_digits.update(repeated)
        for a in range(4):
            for b in range(a + 1, 4):
                if n[a] == n[b]: positions[f"{POSITIONS[a]}-{POSITIONS[b]}"] += 1
        if i + 1 < len(history):
            nxt = number_of(history[i + 1])
            conditional_digits[cls].update(nxt)
            conditional_structures[cls].update([duplicate_class(nxt)])
            if n[0] == n[3]:
                conditional_digits["AS-EKOR_PAIR"].update(nxt)
                conditional_structures["AS-EKOR_PAIR"].update([duplicate_class(nxt)])
            for d in repeated:
                key = f"REPEATED_DIGIT_{d}"
                conditional_digits[key].update(nxt)
                conditional_structures[key].update([duplicate_class(nxt)])
    return classes, repeat_digits, positions, conditional_digits, conditional_structures


def model_p4(history, details=False):
    classes, repeat_digits, positions, conditional_digits, conditional_structures = duplicate_diagnostics(history)
    pos = position_frequency(history); repeats = normalize([repeat_digits[str(d)] + 1 for d in range(10)])
    nxt = conditional_digits.get(duplicate_class(number_of(history[-1])), Counter())
    next_score = normalize([nxt[str(d)] + 1 for d in range(10)])
    matrix = normalize_matrix([[.48 * pos[p][d] + .37 * repeats[d] + .15 * next_score[d] for d in range(10)] for p in range(4)])
    if not details: return matrix, {}
    ranked = [number for _, number in ranked_combinations(matrix, (0, 1, 2, 3), 625, 5)]
    structure_candidates = {
        name: next((number for number in ranked if duplicate_class(number) == name), None)
        for name in ("SINGLE_PAIR", "DOUBLE_PAIR", "TRIPLE", "QUADRUPLE")
    }
    position_keys = (
        "AS-KOP", "AS-KEPALA", "AS-EKOR", "KOP-KEPALA", "KOP-EKOR", "KEPALA-EKOR",
    )
    return matrix, {
        "within_draw_duplicate": {name: classes[name] for name in ("NO_DUPLICATE", "SINGLE_PAIR", "DOUBLE_PAIR", "TRIPLE", "QUADRUPLE")},
        "repeat_digit_counts": {str(d): repeat_digits[str(d)] for d in range(10)},
        "preferred_repeat_positions": {key: positions[key] for key in position_keys},
        "conditional_next_draw": {
            key: {
                "digit_frequency": dict(conditional_digits[key]),
                "structure_frequency": dict(conditional_structures[key]),
            }
            for key in sorted(set(conditional_digits) | set(conditional_structures))
        },
        "single_pair_candidate": structure_candidates["SINGLE_PAIR"],
        "double_pair_diagnostic": structure_candidates["DOUBLE_PAIR"],
        "triple_diagnostic": structure_candidates["TRIPLE"],
        "quadruple_diagnostic": structure_candidates["QUADRUPLE"],
        "same_position_next_draw_repeat": sum(digits_of(history[i])[p] == digits_of(history[i-1])[p] for i in range(1, len(history)) for p in range(4)),
        "diagnostic_note": "Within-draw duplicate and same-position next-draw repeat are separate denominators.",
    }


def visual_backtests(history):
    vh = vt = fh = hh = ht = 0
    for i in range(MINIMUM_TRAINING_RECORDS, len(history)):
        train, actual = history[:i], digits_of(history[i]); previous = digits_of(train[-1])
        fallback = position_frequency(train[-180:])
        for target in range(4):
            neighbors = [p for p in (target - 1, target + 1) if 0 <= p < 4]
            for source in neighbors: vt += 1; vh += actual[target] == previous[source]
            fallback_digit = top_digits(fallback[target], 1)[0]
            fh += actual[target] == fallback_digit; ht += 1
            hh += actual[target] in [previous[p] for p in neighbors] or actual[target] == fallback_digit
    ci = wilson_interval(vh, vt); edge = vt >= 30 and ci[0] > .10
    return {
        "visual_only_backtest": {"hits": vh, "trials": vt, "hit_rate": rnd(rate(vh, vt)), "baseline": .10, "wilson_95_ci": ci},
        "fallback_backtest": {"hits": fh, "trials": ht, "hit_rate": rnd(rate(fh, ht))},
        "hybrid_backtest": {"hits": hh, "trials": ht, "hit_rate": rnd(rate(hh, ht)), "note": "Hybrid performance is not evidence for visual-only edge."},
        "visual_pattern_confirmed": vh > 0, "visual_predictive_edge_confirmed": edge,
        "visual_vote_weight": 1.0 if edge else 0.0,
    }


def visual_only_edge(history):
    hits = trials = 0
    for i in range(MINIMUM_TRAINING_RECORDS, len(history)):
        actual, previous = digits_of(history[i]), digits_of(history[i - 1])
        for target in range(4):
            for source in (target - 1, target + 1):
                if 0 <= source < 4:
                    trials += 1
                    hits += actual[target] == previous[source]
    interval = wilson_interval(hits, trials)
    return trials >= 30 and interval[0] > .10


def model_p5(history, details=False):
    fallback = normalize_matrix(position_frequency(history[-180:]))
    tests = visual_backtests(history) if details else None
    edge_confirmed = tests["visual_predictive_edge_confirmed"] if tests else visual_only_edge(history)

    # Locked P5 gate: an unconfirmed visual signal cannot change any P5 rank.
    # In that case P5 is the positional fallback model, without a transition
    # term and without the former latest-neighbour bump.
    if not edge_confirmed:
        matrix = fallback
        p5_mode = "fallback"
    else:
        latest = digits_of(history[-1]); matrix = []
        for target in range(4):
            hits, trials = [.5] * 10, [1.] * 10
            neighbors = [p for p in (target - 1, target + 1) if 0 <= p < 4]
            for i in range(1, len(history)):
                before, after = digits_of(history[i-1]), digits_of(history[i])
                for source in neighbors:
                    d = before[source]; trials[d] += 1; hits[d] += after[target] == d
            bumps = [0.] * 10
            for source in neighbors: bumps[latest[source]] += .06
            matrix.append([.64 * fallback[target][d] + .30 * hits[d] / trials[d] + bumps[d] for d in range(10)])
        matrix = normalize_matrix(matrix)
        p5_mode = "hybrid"

    if not details: return matrix, {}
    return matrix, {
        "P5_MODE": p5_mode,
        "p5_mode": p5_mode,
        "visual_contribution_enabled": edge_confirmed,
        "visual_only": tests["visual_only_backtest"],
        "fallback": tests["fallback_backtest"],
        "hybrid": tests["hybrid_backtest"],
        **tests,
    }


def structure_signature(number):
    mapping, output = {}, []
    for digit in number:
        if digit not in mapping: mapping[digit] = chr(65 + len(mapping))
        output.append(mapping[digit])
    return "".join(output)


def structural_diagnostics(history):
    sig, sums, unique, oe, sb, largest, smallest, repeats = (Counter() for _ in range(8))
    all_sums = []
    for row in history:
        n, ds = number_of(row), digits_of(row); total = sum(ds); all_sums.append(total)
        sig[structure_signature(n)] += 1; sums[total] += 1; unique[len(set(ds))] += 1
        oe["".join("O" if d % 2 else "E" for d in ds)] += 1
        sb["".join("S" if d < 5 else "B" for d in ds)] += 1
        largest[POSITIONS[ds.index(max(ds))]] += 1; smallest[POSITIONS[ds.index(min(ds))]] += 1
        repeats[4 - len(set(ds))] += 1
    ordered = sorted(all_sums); recent = [sum(digits_of(row)) for row in history[-90:]]
    return {
        "structure_profile": dict(sig), "sum_distribution": {str(k): v for k, v in sorted(sums.items())},
        "preferred_historical_sum_range": [ordered[len(ordered)//4], ordered[3*len(ordered)//4]],
        "preferred_recent_sum_range": [min(recent), max(recent)],
        "digital_range": [min(all_sums), max(all_sums)], "unique_digit_count": dict(unique),
        "odd_even": dict(oe.most_common(12)), "small_big": dict(sb.most_common(12)),
        "largest_digit_position": dict(largest), "smallest_digit_position": dict(smallest),
        "repeat_count": dict(repeats), "small_definition": "0,1,2,3,4", "big_definition": "5,6,7,8,9",
    }


def model_p6(history, details=False):
    recent = history[-365:]; pos = position_frequency(recent)
    parity = Counter(tuple(d % 2 for d in digits_of(row)) for row in recent).most_common(1)[0][0]
    size = Counter(tuple(d >= 5 for d in digits_of(row)) for row in recent).most_common(1)[0][0]
    matrix = normalize_matrix([[.72 * pos[p][d] + .28 * (.5 * (d % 2 == parity[p]) + .5 * ((d >= 5) == size[p])) for d in range(10)] for p in range(4)])
    return matrix, structural_diagnostics(history) if details else {}


def lag_diagnostics(history, include_repeat_intervals=True):
    output, confirmed = {}, False
    for lag in LAGS:
        same = shifted = pair_hits = trials = pair_trials = 0
        for i in range(lag, len(history)):
            cur, old = digits_of(history[i]), digits_of(history[i-lag])
            for p in range(4):
                trials += 1; same += cur[p] == old[p]; shifted += cur[p] in {old[x] for x in range(4) if x != p}
            for a, b in ((0,1), (1,2), (2,3)):
                pair_trials += 1; pair_hits += (cur[a], cur[b]) == (old[a], old[b])
        ci = wilson_interval(same, trials); edge = trials >= 100 and ci[0] > .10; confirmed |= edge
        same_rate = rate(same, trials)
        output[str(lag)] = {
            "same_position_hits": same, "same_position_trials": trials,
            "same_position_rate": rnd(same_rate), "same_position_baseline": .10,
            "same_position_wilson_95_ci": ci,
            "autocorrelation_above_baseline": rnd(same_rate - .10),
            "shifted_position_rate": rnd(rate(shifted, trials)),
            "pair_recurrence_rate": rnd(rate(pair_hits, pair_trials)),
            "statistical_edge": edge,
        }
    repeat_intervals = {}
    if include_repeat_intervals:
        for digit in range(10):
            appearances = [index for index, row in enumerate(history) if digit in digits_of(row)]
            intervals = [b - a for a, b in zip(appearances, appearances[1:])]
            repeat_intervals[str(digit)] = {
                "samples": len(intervals),
                "mean_draw_interval": rnd(mean(intervals)) if intervals else None,
                "most_common_intervals": Counter(intervals).most_common(5),
            }
    return output, confirmed, repeat_intervals


def model_p7(history, details=False):
    fallback = position_frequency(history[-180:]); stats, edge, repeat_intervals = lag_diagnostics(history, details)
    matrix = [[.28 * fallback[p][d] for d in range(10)] for p in range(4)]
    for lag in LAGS:
        if lag < len(history):
            strength = max(.005, stats[str(lag)]["same_position_rate"] - .08)
            for p, d in enumerate(digits_of(history[-lag])): matrix[p][d] += strength
    matrix = normalize_matrix(matrix)
    if not details: return matrix, {}
    best = max(LAGS, key=lambda lag: stats[str(lag)]["same_position_rate"])
    return matrix, {
        "lags": stats,
        "lag_signal": {"best_exploratory_lag": best, "rate": stats[str(best)]["same_position_rate"]},
        "repeat_intervals": repeat_intervals,
        "statistical_edge": edge, "cycle_edge_confirmed": edge,
        "no_edge_multiplier": 1.0 if edge else P7_NO_EDGE_MULTIPLIER,
        "note": "Cycle terminology requires Wilson-confirmed edge above the 10% baseline.",
    }


MODEL_FUNCS = {"P1": model_p1, "P2": model_p2, "P3": model_p3, "P4": model_p4, "P5": model_p5, "P6": model_p6, "P7": model_p7}


def model_matrix(name, history, details=False):
    return MODEL_FUNCS[name](history, details=details)


def ranked_combinations(matrix, positions, limit=10, pool_size=5):
    pools = [top_digits(matrix[p], pool_size) for p in positions]
    ranked = []
    for combo in itertools.product(*pools):
        score = sum(math.log(max(matrix[p][d], 1e-15)) for p, d in zip(positions, combo))
        ranked.append((score, "".join(map(str, combo))))
    ranked.sort(key=lambda item: (-item[0], item[1]))
    return ranked[:limit]


def exactly_one_pair(number):
    return sorted(Counter(number).values()) == [1, 1, 2]


def specialized_single_pairs(matrix, limit=3):
    ranked = ranked_combinations(matrix, (0, 1, 2, 3), 625, 5)
    pairs = [number for _, number in ranked if exactly_one_pair(number)]
    return (pairs or [ranked[0][1]])[:limit]


def topk_summary(name, matrix, history, diagnostics=None):
    four = [n for _, n in ranked_combinations(matrix, (0, 1, 2, 3), 3)]
    pairs = specialized_single_pairs(matrix, 3) if name == "P4" else []
    if pairs:
        # P4 is the duplicate specialist. Its auditable 4D Top-3 therefore
        # consists of its three strongest single-pair scenarios.
        four = pairs
    out = {
        "bbfs6": "".join(map(str, top_digits(aggregate(matrix), 6))),
        "bbfs5": "".join(map(str, top_digits(aggregate(matrix), 5))),
        "4d_top3": four,
        "3d_front_top5": [n for _, n in ranked_combinations(matrix, (0, 1, 2), 5)],
        "3d_back_top5": [n for _, n in ranked_combinations(matrix, (1, 2, 3), 5)],
        "2d_front_top5": [n for _, n in ranked_combinations(matrix, (0, 1), 5)],
        "2d_middle_top5": [n for _, n in ranked_combinations(matrix, (1, 2), 5)],
        "2d_back_top5": [n for _, n in ranked_combinations(matrix, (2, 3), 5)],
    }
    if pairs:
        out["single_pair_candidate"] = pairs[0]
        out["single_pair_candidates"] = pairs
    if diagnostics:
        out["analysis"] = diagnostics
    return out


def empty_walk_forward():
    metric_names = []
    for dimension in ("2d_front", "2d_middle", "2d_back", "3d_front", "3d_back"):
        metric_names.extend(f"{dimension}_top{k}" for k in (1, 3, 5))
    metric_names.extend(("4d_main", "4d_top3", "bbfs5_full_draw", "bbfs6_full_draw"))
    return {"trials": 0, "hits": {key: 0 for key in metric_names}, "bbfs5_occurrences": 0, "bbfs6_occurrences": 0, "digit_occurrences": 0}


def evaluate_prediction(stats, summary, actual):
    stats["trials"] += 1
    values = {
        "2d_front": actual[:2], "2d_middle": actual[1:3], "2d_back": actual[2:],
        "3d_front": actual[:3], "3d_back": actual[1:],
    }
    for dimension, target in values.items():
        candidates = summary[f"{dimension}_top5"]
        for k in (1, 3, 5):
            stats["hits"][f"{dimension}_top{k}"] += target in candidates[:k]
    stats["hits"]["4d_main"] += actual == summary["4d_top3"][0]
    stats["hits"]["4d_top3"] += actual in summary["4d_top3"]
    unique = set(actual)
    for size in (5, 6):
        bbfs = set(summary[f"bbfs{size}"])
        stats[f"bbfs{size}_occurrences"] += sum(d in bbfs for d in actual)
        stats["hits"][f"bbfs{size}_full_draw"] += unique.issubset(bbfs)
    stats["digit_occurrences"] += 4


def finalize_walk_forward(stats):
    trials = stats["trials"]
    out = {"minimum_training_records": MINIMUM_TRAINING_RECORDS, "out_of_sample_points": trials}
    for key, hits in stats["hits"].items():
        out[key] = {"hits": hits, "trials": trials, "rate": rnd(rate(hits, trials))}
    for size in (5, 6):
        captured = stats[f"bbfs{size}_occurrences"]
        out[f"bbfs{size}_digit_coverage"] = {"occurrences_captured": captured, "total_occurrences": stats["digit_occurrences"], "rate": rnd(rate(captured, stats["digit_occurrences"]))}
        out[f"bbfs{size}_full_draw_coverage"] = out.pop(f"bbfs{size}_full_draw")
    return out


def walk_forward_reliability(history):
    stats = {name: empty_walk_forward() for name in MODELS}
    for index in range(MINIMUM_TRAINING_RECORDS, len(history)):
        train, actual = history[:index], number_of(history[index])
        for name in MODELS:
            matrix, _ = model_matrix(name, train)
            evaluate_prediction(stats[name], topk_summary(name, matrix, train), actual)
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
        contributions.pop("4d_top3"); total = sum(contributions.values())
        contributions = {key: value / total for key, value in contributions.items()}
    raw_scores = {}
    for name in MODELS:
        normalized = {key: metrics[name][key] / best[key] if best[key] else 1.0 for key in contributions}
        raw_scores[name] = sum(contributions[key] * normalized[key] for key in contributions)
        results[name]["reliability_components"] = {
            "rates": {key: rnd(value) for key, value in metrics[name].items()},
            "normalized": {key: rnd(value) for key, value in normalized.items()},
            "contributions": {key: rnd(value) for key, value in contributions.items()},
            "low_sample_size_4d": low_4d,
        }
    best_score = max(raw_scores.values()) or 1.0
    weights = {name: raw_scores[name] / best_score for name in MODELS}
    _, p7 = model_p7(history, details=True)
    if not p7["cycle_edge_confirmed"]:
        weights["P7"] *= P7_NO_EDGE_MULTIPLIER
    weights = {name: rnd(value) for name, value in weights.items()}
    for name in MODELS:
        results[name]["reliability_weight"] = weights[name]
        results[name]["best_model_weight"] = 1.0
        if name == "P7": results[name]["p7_no_edge_multiplier_applied"] = not p7["cycle_edge_confirmed"]
    return results, weights


def p8_instinct(history):
    """P8 only accepts raw history, making consensus leakage impossible."""
    recent = history[-32:]
    material = "|".join(f"{row['result_date']}:{number_of(row)}" for row in recent)
    digest = hashlib.sha256(material.encode()).digest()
    position, global_counts = raw_positions(recent), Counter(d for row in recent for d in digits_of(row))
    chosen, reserve = [], []
    for p in range(4):
        rank = sorted(range(10), key=lambda d: (-position[p][d], d))
        chosen.append(rank[digest[p] % 5]); reserve.append(rank[(digest[p+4] % 5 + 1) % 5])
    global_rank = sorted(range(10), key=lambda d: (-global_counts[d], d))
    rotate = digest[10] % 10; global_rank = global_rank[rotate:] + global_rank[:rotate]
    main, backup = "".join(map(str, chosen)), "".join(map(str, reserve))
    payload = {
        "bbfs6": "".join(map(str, global_rank[:6])), "bbfs5": "".join(map(str, global_rank[:5])),
        "four_d_main": main, "four_d_reserve": backup, "three_d_front": main[:3],
        "three_d_back": main[1:], "two_d_front": main[:2], "two_d_middle": main[1:3],
        "two_d_back": main[2:], "repeat_digit": str(global_rank[digest[12] % 4]),
        "frozen": True, "method": "Deterministic intuition heuristic from raw recent sequence; not statistical evidence.",
        "statistical_consensus_member": False,
    }
    payload["fingerprint"] = hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    return payload


def exact_support(number, field, models):
    return [name for name in MODELS if number in models[name][field]]


def stars_for(raw_support, weighted_score):
    if raw_support >= 3 and weighted_score >= 2.35: return 3
    if raw_support >= 2 and weighted_score >= 1.55: return 2
    if raw_support >= 2 and weighted_score >= 1.20: return 1
    return 0


def candidate_record(number, field, models, weights, p8_numbers=()):
    support = exact_support(number, field, models); score = sum(weights[name] for name in support)
    stars = stars_for(len(support), score)
    return {
        "number": number, "supported_by": support, "raw_support_count": len(support),
        "supporting_model_wf_score": {name: weights[name] for name in support},
        "reliability_weighted_score": rnd(score), "weighted_rank": None,
        "star": stars, "stars": stars, "star_label": "⭐" * stars,
        "p8_agrees": number in set(p8_numbers),
    }


def consensus_candidates(field, models, weights, p8_numbers=()):
    universe = sorted({number for name in MODELS for number in models[name][field]})
    records = [candidate_record(number, field, models, weights, p8_numbers) for number in universe]
    records.sort(key=lambda item: (-item["reliability_weighted_score"], -item["raw_support_count"], item["number"]))
    for index, item in enumerate(records, 1): item["weighted_rank"] = index
    return records


def digit_consensus(models, weights):
    records = []
    for digit in map(str, range(10)):
        support = [name for name in MODELS if digit in models[name]["bbfs6"]]
        records.append({"digit": digit, "supported_by_bbfs6": support, "raw_support_count": len(support), "reliability_weighted_score": rnd(sum(weights[name] for name in support))})
    raw = sorted((dict(item) for item in records), key=lambda item: (-item["raw_support_count"], -item["reliability_weighted_score"], item["digit"]))
    weighted = sorted((dict(item) for item in records), key=lambda item: (-item["reliability_weighted_score"], -item["raw_support_count"], item["digit"]))
    for i, item in enumerate(raw, 1): item["raw_rank"] = i
    for i, item in enumerate(weighted, 1): item["weighted_rank"] = i
    return raw, weighted


def diversity_metrics(main, reserve, main_model=None, reserve_model=None):
    union = set(main) | set(reserve)
    return {
        "main_reserve_position_overlap": rnd(sum(a == b for a, b in zip(main, reserve)) / 4),
        "digit_set_overlap": rnd(len(set(main) & set(reserve)) / len(union) if union else 0),
        "structural_difference": structure_signature(main) != structure_signature(reserve),
        "model_difference": main_model != reserve_model,
        "main_structure": structure_signature(main), "reserve_structure": structure_signature(reserve),
    }


def select_four_d(models, weights, p8):
    p8_numbers = (p8["four_d_main"], p8["four_d_reserve"])
    ranked = consensus_candidates("4d_top3", models, weights, p8_numbers); main = ranked[0]
    p4_pairs = models["P4"].get("single_pair_candidates", [models["P4"]["single_pair_candidate"]])
    pair_number = next((number for number in p4_pairs if number != main["number"]), p4_pairs[0])
    best_model = max(MODELS, key=lambda name: (weights[name], name))
    alt_number = next(
        (number for number in models[best_model]["4d_top3"] if number not in {main["number"], pair_number}),
        next(item["number"] for item in ranked if item["number"] not in {main["number"], pair_number}),
    )
    alternative = next((item for item in ranked if item["number"] == alt_number), candidate_record(alt_number, "4d_top3", models, weights, p8_numbers))
    remaining = [item for item in ranked if item["number"] not in {main["number"], alternative["number"], pair_number}]
    diverse = [
        item for item in remaining
        if structure_signature(item["number"]) != structure_signature(main["number"])
        and set(item["number"]) != set(main["number"])
        and item["supported_by"] != main["supported_by"]
    ]
    structurally_diverse = [
        item for item in remaining
        if structure_signature(item["number"]) != structure_signature(main["number"])
        and set(item["number"]) != set(main["number"])
    ]
    reserve = (diverse or structurally_diverse or remaining)[0]
    pair = next((item for item in ranked if item["number"] == pair_number), candidate_record(pair_number, "4d_top3", models, weights, p8_numbers))
    slots = [main["number"], alternative["number"], reserve["number"], pair["number"]]
    return {
        "main": main, "alternative": alternative, "reserve": reserve,
        "single_pair": pair,
        "all_slots_distinct": len(slots) == len(set(slots)),
        "diversity": diversity_metrics(main["number"], reserve["number"], main["supported_by"], reserve["supported_by"]),
        "alternative_source_model": best_model,
    }


def kembar_backtest(history):
    draws, slots, output = len(history), len(history) * 3, {}
    for digit in map(str, range(10)):
        pair = digit * 2
        front = sum(number_of(row)[:2] == pair for row in history)
        middle = sum(number_of(row)[1:3] == pair for row in history)
        back = sum(number_of(row)[2:] == pair for row in history)
        any_pos = sum(pair in (number_of(row)[:2], number_of(row)[1:3], number_of(row)[2:]) for row in history)
        output[pair] = {
            "front": {"hits": front, "draws": draws, "rate": rnd(rate(front, draws))},
            "middle": {"hits": middle, "draws": draws, "rate": rnd(rate(middle, draws))},
            "back": {"hits": back, "draws": draws, "rate": rnd(rate(back, draws))},
            "any_position": {"hits": any_pos, "draws": draws, "per_draw_any_position_rate": rnd(rate(any_pos, draws))},
            "per_slot": {"occurrences": front + middle + back, "total_adjacent_slots": slots, "rate": rnd(rate(front + middle + back, slots))},
        }
    return output


def select_kembar(history):
    stats = kembar_backtest(history)
    ranking = sorted(stats, key=lambda pair: (-stats[pair]["any_position"]["per_draw_any_position_rate"], pair))
    return {"main": ranking[0], "reserve": ranking[1], "backtest": stats}


def extract_number(value):
    return value.get("number") if isinstance(value, dict) else value


def audit_match(actual, candidate):
    candidate = str(candidate or "")
    exact = candidate == actual
    permutation = len(candidate) == len(actual) and candidate != actual and Counter(candidate) == Counter(actual)
    return {
        "candidate": candidate or None,
        "exact": exact,
        "permutation": permutation,
        "status": "EXACT" if exact else "PERMUTATION" if permutation else "MISS",
    }


def audit_list(actual, candidates, allow_reverse=False):
    values = [extract_number(item) for item in (candidates or [])]
    exact = actual in values
    reverse_values = [value for value in values if str(value) == actual[::-1] and str(value) != actual] if allow_reverse else []
    permutation_values = [
        value for value in values
        if str(value) != actual and len(str(value)) == len(actual) and Counter(str(value)) == Counter(actual)
    ] if not allow_reverse else []
    return {
        "actual": actual, "candidates": values, "exact": exact,
        "exact_candidates": [value for value in values if str(value) == actual],
        "reverse": bool(reverse_values) and not exact,
        "reverse_candidates": reverse_values,
        "permutation": bool(permutation_values),
        "permutation_candidates": permutation_values,
        "status": "EXACT" if exact else "REVERSE" if reverse_values else "PERMUTATION" if permutation_values else "MISS",
    }


def bbfs_audit(actual, bbfs):
    digits, distinct = set(str(bbfs or "")), set(actual)
    occurrences = sum(d in digits for d in actual)
    return {
        "bbfs": bbfs, "distinct_digits_captured": sorted(distinct & digits),
        "distinct_digits_missed": sorted(distinct - digits),
        "occurrence_coverage": {"captured": occurrences, "total": 4, "rate": rnd(occurrences / 4)},
        "full_draw_coverage": distinct.issubset(digits),
        "status": "FULL" if distinct.issubset(digits) else "PARTIAL",
    }


def repeat_signal_audit(actual, digit):
    digit = str(digit or "")
    occurrences = actual.count(digit) if len(digit) == 1 else 0
    return {
        "digit": digit or None,
        "actual_occurrences": occurrences,
        "hit": occurrences > 0,
        "status": "DIGIT_APPEARED" if occurrences else "MISS",
        "definition": "Signal digit repeat dianggap tembus bila digit muncul minimal satu kali pada draw aktual.",
    }


def kembar_candidate_audit(actual, candidate):
    candidate = str(candidate or "")
    positions = {
        "front": actual[:2] == candidate,
        "middle": actual[1:3] == candidate,
        "back": actual[2:] == candidate,
    }
    return {
        "candidate": candidate or None,
        "front": positions["front"],
        "middle": positions["middle"],
        "back": positions["back"],
        "any_position": any(positions.values()),
        "status": "EXACT" if any(positions.values()) else "MISS",
    }


def compact_audit_snapshot(prediction):
    """Copy only pre-result signals required for a future audit."""
    models = {}
    required = (
        "bbfs6", "bbfs5", "4d_top3", "3d_front_top5", "3d_back_top5",
        "2d_front_top5", "2d_middle_top5", "2d_back_top5",
    )
    for name in MODELS:
        source = prediction.get("models", {}).get(name, {})
        if all(key in source for key in required):
            models[name] = {key: source.get(key) for key in required}
    visuals = []
    for pattern in prediction.get("visual_patterns", []):
        visuals.append({
            "pattern_name": pattern.get("pattern_name"),
            "visual_predictive_edge_confirmed": pattern.get("visual_predictive_edge_confirmed", False),
            "target_signal": pattern.get("target_signal"),
        })
    final = prediction.get("final_candidates") or prediction.get("quick_view") or {}
    return {
        "snapshot_version": 1,
        "created_before_result": True,
        "models": models,
        "p8_ai_instinct": prediction.get("p8_ai_instinct", {}),
        "final_candidates": {
            "bbfs": final.get("bbfs", {}),
            "four_d": final.get("four_d", {}),
            "three_d": final.get("three_d", {}),
            "two_d": final.get("two_d", {}),
            "repeat_signal": final.get("repeat_signal", {}),
        },
        "visual_patterns": visuals,
    }


def model_outcome_audit(snapshot, actual):
    output = {}
    for name in MODELS:
        model = snapshot.get("models", {}).get(name)
        required = (
            "bbfs6", "bbfs5", "4d_top3", "3d_front_top5", "3d_back_top5",
            "2d_front_top5", "2d_middle_top5", "2d_back_top5",
        )
        if not model or not all(key in model for key in required):
            output[name] = {
                "available": False,
                "reason": "AUDIT MODEL RINCI TIDAK TERSEDIA PADA ARSIP LAMA",
            }
            continue
        audits = {
            "available": True,
            "bbfs6": bbfs_audit(actual, model.get("bbfs6")),
            "bbfs5": bbfs_audit(actual, model.get("bbfs5")),
            "4d_top3": audit_list(actual, model.get("4d_top3")),
            "3d_front_top5": audit_list(actual[:3], model.get("3d_front_top5")),
            "3d_back_top5": audit_list(actual[1:], model.get("3d_back_top5")),
            "2d_front_top5": audit_list(actual[:2], model.get("2d_front_top5"), True),
            "2d_middle_top5": audit_list(actual[1:3], model.get("2d_middle_top5"), True),
            "2d_back_top5": audit_list(actual[2:], model.get("2d_back_top5"), True),
        }
        direct = []
        for field in ("4d_top3", "3d_front_top5", "3d_back_top5", "2d_front_top5", "2d_middle_top5", "2d_back_top5"):
            item = audits[field]
            if item["status"] != "MISS":
                direct.append({"field": field, "status": item["status"], "candidate": (item.get("exact_candidates") or item.get("reverse_candidates") or item.get("permutation_candidates") or [None])[0]})
        coverage = [field for field in ("bbfs6", "bbfs5") if audits[field]["full_draw_coverage"]]
        audits["model_summary"] = {"direct_number_hits": direct, "support_coverage_hits": coverage}
        output[name] = audits
    return output


def p8_outcome_audit(snapshot, actual):
    p8 = snapshot.get("p8_ai_instinct", {})
    required = ("bbfs6", "bbfs5", "four_d_main", "four_d_reserve", "three_d_front", "three_d_back", "two_d_front", "two_d_middle", "two_d_back", "repeat_digit")
    if not all(key in p8 for key in required):
        return {"available": False, "reason": "AUDIT P8 TIDAK TERSEDIA PADA ARSIP LAMA"}
    return {
        "available": True,
        "bbfs6": bbfs_audit(actual, p8["bbfs6"]),
        "bbfs5": bbfs_audit(actual, p8["bbfs5"]),
        "4d_main": audit_match(actual, p8["four_d_main"]),
        "4d_reserve": audit_match(actual, p8["four_d_reserve"]),
        "3d_front": audit_match(actual[:3], p8["three_d_front"]),
        "3d_back": audit_match(actual[1:], p8["three_d_back"]),
        "2d_front": audit_list(actual[:2], [p8["two_d_front"]], True),
        "2d_middle": audit_list(actual[1:3], [p8["two_d_middle"]], True),
        "2d_back": audit_list(actual[2:], [p8["two_d_back"]], True),
        "repeat_digit": repeat_signal_audit(actual, p8["repeat_digit"]),
        "statistical_consensus_member": False,
    }


def visual_outcome_audit(snapshot, actual):
    output = []
    for pattern in snapshot.get("visual_patterns", []):
        signal = pattern.get("target_signal")
        if not signal or not signal.get("predicted_values"):
            output.append({
                "pattern_name": pattern.get("pattern_name"),
                "target_signal": signal,
                "actual": actual,
                "status": "VISUAL_ONLY_NO_TARGET",
                "matched_positions": [],
                "hit_count": 0,
                "reason": "SINYAL TARGET POLA VISUAL TIDAK TERSIMPAN PADA VERSI INI",
            })
            continue
        matches = []
        for predicted in signal["predicted_values"]:
            index = int(predicted["position_index"])
            if 0 <= index < len(actual) and actual[index] == str(predicted["digit"]):
                matches.append(predicted["position"])
        output.append({
            "pattern_name": pattern.get("pattern_name"),
            "target_signal": signal,
            "actual": actual,
            "status": "EXACT" if len(matches) == len(signal["predicted_values"]) else "PARTIAL" if matches else "MISS",
            "matched_positions": matches,
            "hit_count": len(matches),
            "visual_predictive_edge_confirmed": pattern.get("visual_predictive_edge_confirmed", False),
        })
    return output


def audit_prediction_payload(prediction, actual):
    snapshot = prediction.get("audit_snapshot") or compact_audit_snapshot(prediction)
    final = snapshot.get("final_candidates", {})
    four, three, two, bbfs = final.get("four_d", {}), final.get("three_d", {}), final.get("two_d", {}), final.get("bbfs", {})
    kembar = two.get("kembar", {})
    repeat = final.get("repeat_signal", {})
    output = {
        "target_date": prediction.get("target_date"),
        "archive_generated_at": prediction.get("generated_at"), "actual": actual,
        "previous_4d_main": audit_match(actual, extract_number(four.get("main"))),
        "previous_4d_alternative": audit_match(actual, extract_number(four.get("alternative"))),
        "previous_4d_reserve": audit_match(actual, extract_number(four.get("reserve"))),
        "previous_4d_single_pair": audit_match(actual, extract_number(four.get("single_pair"))),
        "3d_front": audit_list(actual[:3], three.get("front")), "3d_back": audit_list(actual[1:], three.get("back")),
        "2d_front": audit_list(actual[:2], two.get("front"), True), "2d_middle": audit_list(actual[1:3], two.get("middle"), True), "2d_back": audit_list(actual[2:], two.get("back"), True),
        "bbfs6": bbfs_audit(actual, bbfs.get("main6")), "bbfs5": bbfs_audit(actual, bbfs.get("main5")),
        "kembar": {
            "main": kembar_candidate_audit(actual, kembar.get("main")),
            "reserve": kembar_candidate_audit(actual, kembar.get("reserve")),
        },
        "repeat_signals": {
            "data_model": repeat_signal_audit(actual, repeat.get("data_digit")),
            "p8": repeat_signal_audit(actual, repeat.get("p8_digit")),
        },
        "models": model_outcome_audit(snapshot, actual),
        "p8": p8_outcome_audit(snapshot, actual),
        "visual_patterns": visual_outcome_audit(snapshot, actual),
        "audit_snapshot_version": snapshot.get("snapshot_version"),
        "created_before_result": snapshot.get("created_before_result", False),
        "definitions": {"exact": "Same digits in the same order.", "reverse": "2D reverse is never exact.", "permutation": "Same digit multiset in another order is never exact."},
    }
    direct_hits = []
    final_slots = (
        ("4D MAIN", output["previous_4d_main"]),
        ("4D ALTERNATIF", output["previous_4d_alternative"]),
        ("4D CADANGAN", output["previous_4d_reserve"]),
        ("4D SINGLE PAIR", output["previous_4d_single_pair"]),
        ("3D DEPAN", output["3d_front"]), ("3D BELAKANG", output["3d_back"]),
        ("2D DEPAN", output["2d_front"]), ("2D TENGAH", output["2d_middle"]), ("2D BELAKANG", output["2d_back"]),
    )
    for label, entry in final_slots:
        if entry.get("status") != "MISS":
            values = entry.get("exact_candidates") or entry.get("reverse_candidates") or entry.get("permutation_candidates") or [entry.get("candidate")]
            direct_hits.append({"category": label, "candidate": values[0], "status": entry.get("status")})
    output["summary"] = {
        "direct_number_hits": direct_hits,
        "support_coverage_hits": [name.upper() for name in ("bbfs6", "bbfs5") if output[name]["full_draw_coverage"]],
        "ambiguous_direct_hit_removed": True,
    }
    return output


def prior_audit(market, latest_row):
    target = latest_row["result_date"]
    path = PRED_DIR / market.lower() / "archive" / f"{target}.json"
    if not path.exists(): return None
    try: old = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError): return None
    if old.get("target_date") != target: return None
    audit = audit_prediction_payload(old, number_of(latest_row))
    audit["archive_path"] = str(path.relative_to(ROOT))
    return audit


def visual_occurrences(history):
    patterns = defaultdict(list)
    for i in range(1, len(history)):
        before, after = digits_of(history[i-1]), digits_of(history[i])
        for source in range(4):
            for target in range(4):
                if source == target or before[source] != after[target]: continue
                name = "DIAGONAL_TURUN" if target == source + 1 else "DIAGONAL_NAIK" if target == source - 1 else "SAME_DIGIT_TRAVELLING"
                patterns[name].append((i-1, i, [(i-1, source), (i, target)]))
        if before[0] == after[3] and before[3] == after[0]:
            patterns["CROSSING"].append((i-1, i, [(i-1,0), (i-1,3), (i,0), (i,3)]))
        for p in range(4):
            if before[p] == after[p]:
                patterns["REPEAT_PATH"].append((i-1, i, [(i-1,p), (i,p)]))
        for a in range(4):
            for b in range(a + 1, 4):
                if before[a] != before[b] and before[a] == after[b] and before[b] == after[a]:
                    patterns["BOX_FRAME"].append((i-1, i, [(i-1,a), (i-1,b), (i,b), (i,a)]))
        for source in range(3):
            for target in range(3):
                if source != target and before[source:source+2] == after[target:target+2]:
                    patterns["2D_CHAIN"].append((i-1, i, [(i-1,source), (i-1,source+1), (i,target), (i,target+1)]))
                    patterns["POSITION_SHIFT"].append((i-1, i, [(i-1,source), (i-1,source+1), (i,target), (i,target+1)]))
        for source in range(2):
            for target in range(2):
                if source != target and before[source:source+3] == after[target:target+3]:
                    patterns["3D_CHAIN"].append((i-1, i, [(i-1,source+j) for j in range(3)] + [(i,target+j) for j in range(3)]))
        if i >= 2:
            older = digits_of(history[i-2])
            for p in range(4):
                if older[p] == after[p] and before[p] != after[p]:
                    patterns["BOUNCE_PANTULAN"].append((i-2, i, [(i-2,p), (i,p)]))
            for origin in range(4):
                for middle in range(4):
                    if origin != middle and older[origin] == before[middle] == after[origin]:
                        patterns["ZIG_ZAG"].append((i-2, i, [(i-2,origin), (i-1,middle), (i,origin)]))
    return patterns


def render_svg(market, history, name, occurrence, metadata):
    start, end, highlighted = occurrence; first = max(0, end - 7); rows = history[first:min(len(history), end + 2)]
    row_height, width, height = 34, 680, 100 + len(rows) * 34
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">', '<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#f59e0b"/></marker></defs>', '<rect width="100%" height="100%" fill="#07111f" rx="16"/>', f'<text x="24" y="30" fill="#34d399" font-size="18" font-family="sans-serif" font-weight="700">{html.escape(name.replace("_", " "))} · {market}</text>', f'<text x="24" y="52" fill="#94a3b8" font-size="11" font-family="sans-serif">{html.escape(metadata["source_period"])} · occurrences {metadata["number_of_occurrences"]}</text>']
    xs = [24, 310, 390, 470, 550]
    for x, label in zip(xs, ("DATE / DRAW", *POSITIONS)):
        parts.append(f'<text x="{x}" y="78" fill="#64748b" font-size="11" font-family="sans-serif" font-weight="700">{label}</text>')
    centers, active = {}, set(highlighted)
    for offset, row in enumerate(rows):
        absolute, y = first + offset, 96 + offset * row_height
        parts.append(f'<rect x="16" y="{y-20}" width="648" height="29" rx="6" fill="{"#0f1e31" if offset % 2 == 0 else "#0b1728"}"/>')
        label = f'{row["result_date"]} · {row.get("periode", "-")}'
        parts.append(f'<text x="24" y="{y}" fill="#cbd5e1" font-size="11" font-family="monospace">{html.escape(label)}</text>')
        for p, digit in enumerate(digits_of(row)):
            x, marked = xs[p+1], (absolute, p) in active
            if marked: parts.append(f'<rect x="{x-12}" y="{y-19}" width="30" height="27" rx="7" fill="#059669"/>')
            color = "#ffffff" if marked else "#cbd5e1"
            parts.append(f'<text x="{x}" y="{y}" fill="{color}" font-size="15" font-family="monospace" font-weight="700">{digit}</text>')
            centers[(absolute,p)] = (x+4, y-6)
    points = [centers[cell] for cell in highlighted if cell in centers]
    for a, b in zip(points, points[1:]):
        parts.append(f'<line x1="{a[0]}" y1="{a[1]}" x2="{b[0]}" y2="{b[1]}" stroke="#f59e0b" stroke-width="3" marker-end="url(#arrow)"/>')
    parts.extend([f'<text x="24" y="{height-14}" fill="#94a3b8" font-size="10" font-family="sans-serif">{html.escape(metadata["visual_note"])}</text>', '</svg>'])
    return "\n".join(parts) + "\n"


def visual_pattern_backtest(history, name, occurrences):
    """Backtest continuation for one visual pattern type only."""
    hits = trials = 0
    multi_digit = name in {"CROSSING", "BOX_FRAME", "2D_CHAIN", "POSITION_SHIFT", "3D_CHAIN"}
    for _, end, highlighted in occurrences:
        if end + 1 >= len(history):
            continue
        next_digits = digits_of(history[end + 1])
        end_cells = [(position, digits_of(history[row])[position]) for row, position in highlighted if row == end]
        if not end_cells:
            continue
        if multi_digit:
            expected = list(dict.fromkeys(end_cells))
        else:
            last_position, digit = end_cells[-1]
            target_position = last_position
            if name == "ZIG_ZAG" and len(highlighted) >= 2:
                target_position = highlighted[-2][1]
            elif name in {"DIAGONAL_NAIK", "DIAGONAL_TURUN", "SAME_DIGIT_TRAVELLING"}:
                earlier = next(((row, pos) for row, pos in reversed(highlighted[:-1]) if row < end), None)
                if earlier:
                    shifted = last_position + (last_position - earlier[1])
                    if 0 <= shifted < 4:
                        target_position = shifted
            expected = [(target_position, digit)]
        trials += 1
        hits += all(next_digits[position] == digit for position, digit in expected)

    width = max((len({position for position, _ in [
        (cell[1], digits_of(history[cell[0]])[cell[1]])
        for cell in occurrence[2] if cell[0] == occurrence[1]
    ]}) for occurrence in occurrences), default=1) if multi_digit else 1
    baseline = 0.1 ** max(1, width)
    interval = wilson_interval(hits, trials)
    edge = trials >= 30 and interval[0] > baseline
    return {
        "hits": hits,
        "trials": trials,
        "hit_rate": rnd(rate(hits, trials)),
        "baseline": rnd(baseline),
        "wilson_95_ci": interval,
        "visual_predictive_edge_confirmed": edge,
        "definition": "Exact next-draw continuation at the pattern endpoint position(s).",
    }


def visual_target_signal(history, name, occurrence, target_date):
    """Freeze the pattern continuation target before the result exists."""
    _, end, highlighted = occurrence
    end_cells = [(position, digits_of(history[row])[position]) for row, position in highlighted if row == end]
    if not end_cells:
        return None
    multi_digit = name in {"CROSSING", "BOX_FRAME", "2D_CHAIN", "POSITION_SHIFT", "3D_CHAIN"}
    if multi_digit:
        expected = list(dict.fromkeys(end_cells))
        rule = "Semua digit endpoint pola berlanjut pada posisi endpoint yang sama di draw target."
    else:
        last_position, digit = end_cells[-1]
        target_position = last_position
        if name == "ZIG_ZAG" and len(highlighted) >= 2:
            target_position = highlighted[-2][1]
        elif name in {"DIAGONAL_NAIK", "DIAGONAL_TURUN", "SAME_DIGIT_TRAVELLING"}:
            earlier = next(((row, pos) for row, pos in reversed(highlighted[:-1]) if row < end), None)
            if earlier:
                shifted = last_position + (last_position - earlier[1])
                if 0 <= shifted < 4:
                    target_position = shifted
        expected = [(target_position, digit)]
        rule = "Digit endpoint pola berlanjut tepat pada posisi target yang dibekukan sebelum result."
    return {
        "target_date": target_date,
        "target_positions": [POSITIONS[position] for position, _ in expected],
        "predicted_digits": [str(digit) for _, digit in expected],
        "predicted_values": [
            {"position": POSITIONS[position], "position_index": position, "digit": str(digit)}
            for position, digit in expected
        ],
        "evaluation_rule": rule,
        "frozen_before_result": True,
    }


def generate_visual_patterns(market, history, target_date, p5):
    patterns = sorted(((name, values) for name, values in visual_occurrences(history).items() if values), key=lambda item: (-len(item[1]), item[0]))[:6]
    directory = PRED_DIR / market.lower() / "visuals" / target_date; directory.mkdir(parents=True, exist_ok=True)
    output = []
    for index, (name, values) in enumerate(patterns, 1):
        occurrence = values[-1]; start, end, highlighted = occurrence
        backtest = visual_pattern_backtest(history, name, values)
        filename = f"pattern-{index:02d}.svg"; relative = f"predictions/{market.lower()}/visuals/{target_date}/{filename}"
        metadata = {
            "pattern_name": name, "market": market,
            "source_period": f"{history[start]['result_date']}..{history[end]['result_date']}",
            "start_point": history[start]["result_date"], "end_point": history[end]["result_date"],
            "digits_used": sorted({str(digits_of(history[row])[p]) for row, p in highlighted}),
            "number_of_occurrences": len(values), "backtest_samples": backtest["trials"],
            "historical_hit_rate": backtest["hit_rate"],
            "baseline": backtest["baseline"], "wilson_95_ci": backtest["wilson_95_ci"],
            "visual_pattern_confirmed": True,
            "visual_predictive_edge_confirmed": backtest["visual_predictive_edge_confirmed"],
            "edge_confirmed": backtest["visual_predictive_edge_confirmed"],
            "visual_note": "Visual pattern ditemukan; predictive edge terkonfirmasi." if backtest["visual_predictive_edge_confirmed"] else "Visual pattern ditemukan — predictive edge belum terbukti.",
            "backtest_definition": backtest["definition"],
            "target_signal": visual_target_signal(history, name, occurrence, target_date),
            "image_path": relative,
        }
        (directory / filename).write_text(render_svg(market, history, name, occurrence, metadata), encoding="utf-8")
        output.append(metadata)
    p5["visual_predictive_edge_confirmed"] = any(item["visual_predictive_edge_confirmed"] for item in output)
    p5["visual_vote_weight"] = 1.0 if p5["visual_predictive_edge_confirmed"] else 0.0
    return output


def _candidate_number(value):
    return value.get("number") if isinstance(value, dict) else value


def prediction_sections(payload):
    quick = payload.get("quick_view", {}) if payload else {}
    bbfs, four = quick.get("bbfs", {}), quick.get("four_d", {})
    three, two = quick.get("three_d", {}), quick.get("two_d", {})
    p8 = payload.get("p8_ai_instinct", {}) if payload else {}
    numbers = lambda values: [_candidate_number(value) for value in (values or [])]
    return {
        "bbfs6": bbfs.get("main6"),
        "bbfs5": bbfs.get("main5"),
        "four_d": [_candidate_number(four.get(key)) for key in ("main", "alternative", "reserve", "single_pair")],
        "three_d_front": numbers(three.get("front")),
        "three_d_back": numbers(three.get("back")),
        "two_d_front": numbers(two.get("front")),
        "two_d_middle": numbers(two.get("middle")),
        "two_d_back": numbers(two.get("back")),
        "p8": {key: p8.get(key) for key in (
            "bbfs6", "bbfs5", "four_d_main", "four_d_reserve", "three_d_front",
            "three_d_back", "two_d_front", "two_d_middle", "two_d_back", "repeat_digit",
        )},
    }


def build_prediction(market, history, config=None, previous_prediction=None):
    config = config or load_config(); validation = validate_dataset(market, history, config)
    if validation["data_validation_status"] != "VALID": raise RuntimeError(f"{market}: invalid dataset")
    latest = history[-1]; target = target_date_for(market, date.fromisoformat(latest["result_date"]), config)
    models = {}
    for name in MODELS:
        matrix, diagnostics = model_matrix(name, history, details=True)
        models[name] = topk_summary(name, matrix, history, diagnostics)
    walk_forward, weights = walk_forward_reliability(history)
    for name in MODELS:
        models[name]["walk_forward"] = walk_forward[name]; models[name]["reliability_weight"] = weights[name]

    # Freeze P8 before either consensus is calculated.
    p8 = p8_instinct(history); frozen_fingerprint = p8["fingerprint"]
    raw_digits, weighted_digits = digit_consensus(models, weights)
    p8_fields = {
        "4d_top3": (p8["four_d_main"], p8["four_d_reserve"]),
        "3d_front_top5": (p8["three_d_front"],), "3d_back_top5": (p8["three_d_back"],),
        "2d_front_top5": (p8["two_d_front"],), "2d_middle_top5": (p8["two_d_middle"],), "2d_back_top5": (p8["two_d_back"],),
    }
    rankings = {field: consensus_candidates(field, models, weights, p8_values) for field, p8_values in p8_fields.items()}
    four = select_four_d(models, weights, p8)
    three = {"front": rankings["3d_front_top5"][:5], "back": rankings["3d_back_top5"][:5]}
    two = {"front": rankings["2d_front_top5"][:5], "middle": rankings["2d_middle_top5"][:5], "back": rankings["2d_back_top5"][:5], "kembar": select_kembar(history)}
    weighted_rank, raw_rank = [item["digit"] for item in weighted_digits], [item["digit"] for item in raw_digits]
    bbfs = {"main6": "".join(weighted_rank[:6]), "reserve6": "".join(weighted_rank[:5] + [weighted_rank[6]]), "main5": "".join(weighted_rank[:5]), "reserve5": "".join(weighted_rank[:4] + [weighted_rank[5]])}
    repeat_counts = models["P4"]["analysis"]["repeat_digit_counts"]
    repeat_digit = max(repeat_counts, key=lambda d: (repeat_counts[d], -int(d)))
    bbfs["repeat_pattern"] = repeat_digit * 2 + "".join(d for d in weighted_rank if d != repeat_digit)[:4]
    visuals = generate_visual_patterns(market, history, target.isoformat(), models["P5"]["analysis"])
    models["P5"]["analysis"]["visual_patterns"] = visuals; models["P5"]["visual_patterns"] = visuals
    counts = {
        "data_4d": 4, "p8_4d": 2, "total_4d_candidates": 6,
        "data_3d": 10, "p8_3d": 2, "total_3d_candidates": 12,
        "regular_data_2d": 15, "data_kembar_2d": 2, "p8_2d": 3,
        "total_2d_candidates": 20, "total_direct_number_candidates": 38,
        "total_bbfs_scenarios": 7, "total_repeat_digit_signals": 2,
    }
    final = {"bbfs": bbfs, "four_d": four, "three_d": three, "two_d": two, "repeat_signal": {"data_digit": repeat_digit, "p8_digit": p8["repeat_digit"]}}
    quick = {**final, "p8_ai_instinct": {key: p8[key] for key in ("bbfs6", "bbfs5", "four_d_main", "four_d_reserve", "three_d_front", "three_d_back", "two_d_front", "two_d_middle", "two_d_back", "repeat_digit")}, "model_comparison": [{"model": name, "reliability_weight": weights[name]} for name in sorted(MODELS, key=lambda name: (-weights[name], name))], "candidate_counts": counts}
    payload = {
        "schema_version": SCHEMA_VERSION, "engine": ENGINE_VERSION, "engine_version": ENGINE_VERSION,
        "market": market, "generated_at": datetime.now(JAKARTA).isoformat(timespec="seconds"),
        "dataset_fingerprint": dataset_fingerprint(market, history),
        "prediction_basis_date": latest["result_date"],
        "prediction_basis_result": number_of(latest),
        "latest_result": {"date": latest["result_date"], "period": latest.get("periode"), "number": number_of(latest), "collected_at": latest.get("collected_at")},
        "target_date": target.isoformat(), "target_period": increment_period(latest.get("periode")),
        "dataset": {"count": len(history), "first_date": history[0]["result_date"], "last_date": latest["result_date"]},
        "dataset_validation": validation, "prior_prediction_audit": prior_audit(market, latest),
        "models": models, "p8_ai_instinct": p8,
        "raw_consensus": {"raw_consensus_digit_ranking": raw_digits, "digit_ranking": raw_rank, "candidate_rankings": {field: sorted(values, key=lambda item: (-item["raw_support_count"], -item["reliability_weighted_score"], item["number"])) for field, values in rankings.items()}, "p8_included": False},
        "weighted_consensus": {"weighted_consensus_digit_ranking": weighted_digits, "digit_ranking": weighted_rank, "reliability_weights": weights, "candidate_rankings": rankings, "p8_included": False},
        "final_candidates": final, "visual_patterns": visuals, "quick_view": quick,
        "confidence": {"model_confidence": "RELATIVE", "data_quality": "HIGH" if not validation["missing_expected_draws"] else "MODERATE", "sample_size": len(history), "backtest_strength": rnd(mean(weights.values())), "consensus_strength": rnd(max(weights.values())), "relative_confidence": "MODERATE" if mean(weights.values()) >= .70 else "LOW", "disclaimer": DISCLAIMER},
        "candidate_counts": counts, "disclaimer": DISCLAIMER,
    }
    previous_fingerprint = None
    if previous_prediction:
        candidate = previous_prediction.get("dataset_fingerprint")
        previous_fingerprint = candidate if candidate != payload["dataset_fingerprint"] else previous_prediction.get("previous_dataset_fingerprint")
    payload["previous_dataset_fingerprint"] = previous_fingerprint
    payload["recalculated_after_new_result"] = bool(
        previous_prediction and previous_prediction.get("dataset_fingerprint") != payload["dataset_fingerprint"]
    )
    previous_sections = prediction_sections(previous_prediction)
    current_sections = prediction_sections(payload)
    payload["changed_from_previous"] = {
        key: (previous_sections[key] != value if previous_prediction else None)
        for key, value in current_sections.items()
    }
    payload["audit_snapshot"] = compact_audit_snapshot(payload)
    if p8["fingerprint"] != frozen_fingerprint: raise AssertionError("P8 changed after consensus")
    return payload


def write_prediction(market, payload, force=False):
    market_dir = PRED_DIR / market.lower(); archive_dir = market_dir / "archive"; archive_dir.mkdir(parents=True, exist_ok=True)
    latest_path, archive_path = market_dir / "latest.json", archive_dir / f"{payload['target_date']}.json"
    try: existing = json.loads(latest_path.read_text(encoding="utf-8")) if latest_path.exists() else None
    except json.JSONDecodeError: existing = None
    if not force and existing and existing.get("dataset_fingerprint") == payload["dataset_fingerprint"] and existing.get("engine_version", existing.get("engine")) == ENGINE_VERSION and existing.get("latest_result", {}).get("date") == payload["latest_result"]["date"] and str(existing.get("latest_result", {}).get("number", "")).zfill(4) == payload["latest_result"]["number"]:
        return False, "unchanged"
    text = json.dumps(payload, ensure_ascii=False, allow_nan=False, separators=(",", ":")) + "\n"; latest_path.write_text(text, encoding="utf-8")
    if not archive_path.exists(): archive_path.write_text(text, encoding="utf-8")
    else:
        try: archived = json.loads(archive_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError: archived = {}
        # A not-yet-drawn target may be refreshed explicitly (for example
        # after a methodology upgrade). Once its actual date has arrived, the
        # archive becomes evidence and is never rewritten.
        if payload["target_date"] > payload["latest_result"]["date"]:
            archive_path.write_text(text, encoding="utf-8")
    return True, "written"


def history_hit_summary(audit):
    if not audit:
        return None
    summary = {
        "4d": {
            slot: audit.get(f"previous_4d_{slot}", {}).get("exact", False)
            for slot in ("main", "alternative", "reserve", "single_pair")
        },
        "3d": {
            "front_exact": audit.get("3d_front", {}).get("exact", False),
            "back_exact": audit.get("3d_back", {}).get("exact", False),
        },
        "2d": {
            slot: {
                "exact": audit.get(f"2d_{slot}", {}).get("exact", False),
                "reverse": audit.get(f"2d_{slot}", {}).get("reverse", False),
            }
            for slot in ("front", "middle", "back")
        },
        "bbfs6_full_coverage": audit.get("bbfs6", {}).get("full_draw_coverage", False),
        "bbfs5_full_coverage": audit.get("bbfs5", {}).get("full_draw_coverage", False),
        "direct_number_hits": audit.get("summary", {}).get("direct_number_hits", []),
        "support_coverage_hits": audit.get("summary", {}).get("support_coverage_hits", []),
    }
    summary["direct_number_hit_count"] = len(summary["direct_number_hits"])
    return summary


def history_record(market, prediction, actual_row=None, archive_path=None):
    quick = prediction.get("quick_view", {})
    actual = number_of(actual_row) if actual_row else None
    outcome_audit = audit_prediction_payload(prediction, actual) if actual else None
    basis = prediction.get("latest_result", {})
    return {
        "market": market,
        "target_date": prediction.get("target_date"),
        "target_period": prediction.get("target_period"),
        "generated_at": prediction.get("generated_at"),
        "engine_version": prediction.get("engine_version", prediction.get("engine")),
        "schema_version": prediction.get("schema_version", 1),
        "dataset_fingerprint": prediction.get("dataset_fingerprint"),
        "previous_dataset_fingerprint": prediction.get("previous_dataset_fingerprint"),
        "recalculated_after_new_result": prediction.get("recalculated_after_new_result"),
        "changed_from_previous": prediction.get("changed_from_previous"),
        "basis_latest_date": basis.get("date"),
        "basis_latest_result": basis.get("number"),
        "bbfs6": quick.get("bbfs", {}).get("main6"),
        "bbfs5": quick.get("bbfs", {}).get("main5"),
        "four_d": quick.get("four_d", {}),
        "three_d": quick.get("three_d", {}),
        "two_d": quick.get("two_d", {}),
        "p8_ai_instinct": prediction.get("p8_ai_instinct", {}),
        "actual_result": ({
            "date": actual_row.get("result_date"),
            "period": actual_row.get("periode"),
            "number": actual,
        } if actual_row else None),
        "previous_prediction_audit": prediction.get("prior_prediction_audit"),
        "outcome_audit": outcome_audit,
        "hit_miss_summary": history_hit_summary(outcome_audit),
        "detailed_model_audit_available": bool(outcome_audit and any(
            item.get("available") for item in outcome_audit.get("models", {}).values()
        )),
        "archive_path": archive_path,
    }


def update_history_index(market, history):
    market_dir = PRED_DIR / market.lower()
    archive_dir = market_dir / "archive"
    actual_by_date = {row["result_date"]: row for row in history}
    records = []
    for path in sorted(archive_dir.glob("*.json"), reverse=True):
        try:
            prediction = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        target = prediction.get("target_date")
        if not target:
            continue
        try:
            indexed_path = str(path.relative_to(ROOT))
        except ValueError:
            indexed_path = str(path.relative_to(PRED_DIR.parent))
        records.append(history_record(
            market,
            prediction,
            actual_by_date.get(target),
            indexed_path,
        ))
    records.sort(key=lambda item: (item.get("target_date") or "", item.get("generated_at") or ""), reverse=True)
    payload = {
        "schema_version": 2,
        "index_engine": ENGINE_VERSION,
        "market": market,
        "count": len(records),
        "records": records,
    }
    history_path = market_dir / "history.json"
    text = json.dumps(payload, ensure_ascii=False, allow_nan=False, separators=(",", ":")) + "\n"
    if history_path.exists() and history_path.read_text(encoding="utf-8") == text:
        return False
    history_path.write_text(text, encoding="utf-8")
    return True


def run(markets, force=False):
    config, summary, changed_any = load_config(), {}, False
    for market in markets:
        history = load_history(market); fingerprint = dataset_fingerprint(market, history); latest_path = PRED_DIR / market.lower() / "latest.json"
        existing = None
        if latest_path.exists():
            try: existing = json.loads(latest_path.read_text(encoding="utf-8"))
            except json.JSONDecodeError: existing = {}
        if not force and existing is not None:
            if existing.get("dataset_fingerprint") == fingerprint and existing.get("engine_version", existing.get("engine")) == ENGINE_VERSION:
                print(f"[{market}] unchanged fingerprint={fingerprint[:12]}; skipped")
                changed_any |= update_history_index(market, history)
                summary[market] = {"status": "unchanged", "latest": existing.get("latest_result"), "target_date": existing.get("target_date"), "dataset_fingerprint": fingerprint}
                continue
        comparison_previous = existing
        # A one-time metadata upgrade may force the current deterministic
        # prediction without a new dataset. In that case compare against the
        # immutable prediction whose target became the current basis draw.
        if force and existing and existing.get("dataset_fingerprint") == fingerprint and not existing.get("previous_dataset_fingerprint"):
            prior_path = latest_path.parent / "archive" / f"{existing.get('latest_result', {}).get('date', '')}.json"
            if prior_path.exists():
                try:
                    prior_candidate = json.loads(prior_path.read_text(encoding="utf-8"))
                    if prior_candidate.get("dataset_fingerprint") != fingerprint:
                        comparison_previous = prior_candidate
                except json.JSONDecodeError:
                    pass
        payload = build_prediction(market, history, config, previous_prediction=comparison_previous); changed, status = write_prediction(market, payload, force)
        changed_any |= changed; q = payload["quick_view"]
        changed_any |= update_history_index(market, history)
        summary[market] = {"status": status, "latest": payload["latest_result"], "target_date": payload["target_date"], "target_period": payload["target_period"], "four_d_main": q["four_d"]["main"]["number"], "bbfs6": q["bbfs"]["main6"], "dataset_count": len(history), "dataset_fingerprint": fingerprint}
        print(f"[{market}] target={payload['target_date']} {payload['target_period']} 4D={q['four_d']['main']['number']} BBFS6={q['bbfs']['main6']} n={len(history)} status={status}")
    status_path = PRED_DIR / "status.json"
    if changed_any or force or not status_path.exists():
        existing_markets = {}
        if status_path.exists():
            try:
                existing_markets = json.loads(status_path.read_text(encoding="utf-8")).get("markets", {})
            except json.JSONDecodeError:
                pass
        status_path.write_text(json.dumps({"generated_at": datetime.now(JAKARTA).isoformat(timespec="seconds"), "engine": ENGINE_VERSION, "markets": {**existing_markets, **summary}}, ensure_ascii=False, allow_nan=False, separators=(",", ":")) + "\n", encoding="utf-8")
    return summary


def main():
    parser = argparse.ArgumentParser(description="AdiPredictor deterministic P1-P8 v2 engine")
    parser.add_argument("--market", choices=[*MARKETS, "ALL"], default="ALL")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args(); run(MARKETS if args.market == "ALL" else (args.market,), args.force)


if __name__ == "__main__":
    main()
