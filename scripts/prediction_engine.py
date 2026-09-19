#!/usr/bin/env python3
"""AdiPredictor deterministic P1-P8 prediction engine.

This engine is intentionally reproducible. P1-P7 are data-driven heuristic
models; P8 is a deterministic "AI instinct" layer and is excluded from the
statistical consensus. Predictions are not guarantees.
"""

from __future__ import annotations

import hashlib
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
MARKETS = ("HK", "SGP", "SDY")
JAKARTA = ZoneInfo("Asia/Jakarta")

BASE_WEIGHTS = {
    "P1": 1.00,
    "P2": 0.80,
    "P3": 1.10,
    "P4": 0.85,
    "P5": 0.45,
    "P6": 0.95,
    "P7": 0.60,
}
MODEL_NAMES = tuple(BASE_WEIGHTS)

SGP_WEEKDAYS = {0, 2, 3, 5, 6}  # Mon, Wed, Thu, Sat, Sun


def clamp(value, lo, hi):
    return max(lo, min(hi, value))


def digits_of(row):
    value = str(row.get("nomor", "")).zfill(4)
    if len(value) != 4 or not value.isdigit():
        raise ValueError(f"Invalid 4D result: {row!r}")
    return tuple(int(ch) for ch in value)


def load_history(market):
    path = DATA_DIR / f"{market.lower()}.json"
    rows = json.loads(path.read_text(encoding="utf-8"))
    clean = [
        row for row in rows
        if row.get("result_date") and str(row.get("nomor", "")).zfill(4).isdigit()
    ]
    clean.sort(key=lambda row: row["result_date"])
    if len(clean) < 120:
        raise RuntimeError(f"{market}: dataset too short ({len(clean)})")
    return clean


def normalize(values):
    total = float(sum(values))
    if total <= 0:
        return [0.1] * 10
    return [float(v) / total for v in values]


def normalize_matrix(matrix):
    return [normalize(row) for row in matrix]


def aggregate_digits(matrix):
    return [sum(matrix[p][d] for p in range(4)) for d in range(10)]


def top_digits(values, n):
    return sorted(range(10), key=lambda d: (-values[d], d))[:n]


def position_frequency(history, alpha=1.0):
    counts = [[alpha] * 10 for _ in range(4)]
    for row in history:
        ds = digits_of(row)
        for p, d in enumerate(ds):
            counts[p][d] += 1.0
    return normalize_matrix(counts)


def global_frequency(history, alpha=1.0):
    counts = [alpha] * 10
    for row in history:
        for d in digits_of(row):
            counts[d] += 1.0
    return normalize(counts)


def model_p1(history):
    pos = position_frequency(history)
    glob = global_frequency(history)
    return normalize_matrix([
        [0.72 * pos[p][d] + 0.28 * glob[d] for d in range(10)]
        for p in range(4)
    ])


def model_p2(history):
    recent = history[-90:]
    recent30 = history[-30:]
    p90 = position_frequency(recent)
    p30 = position_frequency(recent30)
    g90 = global_frequency(recent)

    gaps = []
    for digit in range(10):
        gap = len(history)
        for idx, row in enumerate(reversed(history)):
            if digit in digits_of(row):
                gap = idx
                break
        gaps.append(gap)
    max_gap = max(gaps) or 1
    gap_score = [g / max_gap for g in gaps]

    return normalize_matrix([
        [
            0.42 * p30[p][d]
            + 0.34 * p90[p][d]
            + 0.14 * g90[d]
            + 0.10 * gap_score[d]
            for d in range(10)
        ]
        for p in range(4)
    ])


def model_p3(history):
    fallback = position_frequency(history)
    latest = digits_of(history[-1])
    matrix = []
    for p in range(4):
        counts = [1.0] * 10
        prev_digit = latest[p]
        for i in range(1, len(history)):
            before = digits_of(history[i - 1])
            after = digits_of(history[i])
            if before[p] == prev_digit:
                counts[after[p]] += 1.0
        trans = normalize(counts)
        matrix.append([
            0.78 * trans[d] + 0.22 * fallback[p][d]
            for d in range(10)
        ])
    return normalize_matrix(matrix)


def duplicate_profile(history):
    repeat_counts = [1.0] * 10
    pair_pos = [[1.0] * 4 for _ in range(4)]
    for row in history:
        ds = digits_of(row)
        cnt = Counter(ds)
        for d, c in cnt.items():
            if c >= 2:
                repeat_counts[d] += 1.0
        for a in range(4):
            for b in range(a + 1, 4):
                if ds[a] == ds[b]:
                    pair_pos[a][b] += 1.0
                    pair_pos[b][a] += 1.0
    return normalize(repeat_counts), pair_pos


def model_p4(history):
    dup, pair_pos = duplicate_profile(history)
    pos = position_frequency(history)
    matrix = []
    for p in range(4):
        equality_strength = sum(pair_pos[p][q] for q in range(4) if q != p)
        scale = equality_strength / max(1.0, len(history))
        matrix.append([
            0.58 * dup[d] + 0.42 * pos[p][d] + 0.02 * scale
            for d in range(10)
        ])
    return normalize_matrix(matrix)


def model_p5(history):
    # Visual/diagonal continuation: if a digit moves from a neighboring column
    # into the target column on the next draw, measure that continuation rate.
    fallback = position_frequency(history[-180:])
    latest = digits_of(history[-1])
    matrix = []
    for target in range(4):
        counts = [0.5] * 10
        opportunities = [1.0] * 10
        neighbors = [x for x in (target - 1, target + 1) if 0 <= x < 4]
        for i in range(1, len(history)):
            prev = digits_of(history[i - 1])
            cur = digits_of(history[i])
            for source in neighbors:
                d = prev[source]
                opportunities[d] += 1.0
                if cur[target] == d:
                    counts[d] += 1.0
        rates = [counts[d] / opportunities[d] for d in range(10)]

        # Give an extra continuation bump to digits visually adjacent in the
        # latest row; P5 stays low-weight in the final consensus.
        bumps = [0.0] * 10
        for source in neighbors:
            bumps[latest[source]] += 0.08

        matrix.append([
            0.58 * fallback[target][d] + 0.34 * rates[d] + bumps[d]
            for d in range(10)
        ])
    return normalize_matrix(matrix)


def model_p6(history):
    recent = history[-365:]
    pos = position_frequency(recent)

    parity_patterns = Counter(tuple(d % 2 for d in digits_of(r)) for r in recent)
    size_patterns = Counter(tuple(int(d >= 5) for d in digits_of(r)) for r in recent)
    parity = parity_patterns.most_common(1)[0][0]
    size = size_patterns.most_common(1)[0][0]

    matrix = []
    for p in range(4):
        row = []
        for d in range(10):
            structure = 0.0
            if d % 2 == parity[p]:
                structure += 0.5
            if int(d >= 5) == size[p]:
                structure += 0.5
            row.append(0.70 * pos[p][d] + 0.30 * structure)
        matrix.append(row)
    return normalize_matrix(matrix)


def lag_rates(history, lags=(1, 2, 3, 7, 14, 21, 30)):
    out = {}
    n = len(history)
    for lag in lags:
        if n <= lag + 20:
            continue
        hits = 0
        total = 0
        for i in range(lag, n):
            a = digits_of(history[i])
            b = digits_of(history[i - lag])
            for p in range(4):
                total += 1
                hits += int(a[p] == b[p])
        out[lag] = hits / total if total else 0.0
    return out


def model_p7(history):
    fallback = position_frequency(history[-180:])
    rates = lag_rates(history)
    matrix = [[0.18 * fallback[p][d] for d in range(10)] for p in range(4)]

    for lag, rate in rates.items():
        if lag >= len(history):
            continue
        ds = digits_of(history[-lag])
        edge = max(0.02, rate - 0.075)
        for p, d in enumerate(ds):
            matrix[p][d] += edge
    return normalize_matrix(matrix)


MODEL_FUNCS = {
    "P1": model_p1,
    "P2": model_p2,
    "P3": model_p3,
    "P4": model_p4,
    "P5": model_p5,
    "P6": model_p6,
    "P7": model_p7,
}


def model_matrix(name, history):
    return MODEL_FUNCS[name](history)


def bbfs_from_matrix(matrix, n):
    agg = aggregate_digits(matrix)
    return "".join(str(d) for d in top_digits(agg, n))


def model_summary(name, matrix, history):
    agg = aggregate_digits(matrix)
    return {
        "bbfs6": "".join(str(d) for d in top_digits(agg, 6)),
        "bbfs5": "".join(str(d) for d in top_digits(agg, 5)),
        "four_d": "".join(str(top_digits(matrix[p], 1)[0]) for p in range(4)),
        "three_d_front": "".join(str(top_digits(matrix[p], 1)[0]) for p in range(3)),
        "three_d_back": "".join(str(top_digits(matrix[p], 1)[0]) for p in range(1, 4)),
        "two_d_front": "".join(str(top_digits(matrix[p], 1)[0]) for p in range(2)),
        "two_d_middle": "".join(str(top_digits(matrix[p], 1)[0]) for p in range(1, 3)),
        "two_d_back": "".join(str(top_digits(matrix[p], 1)[0]) for p in range(2, 4)),
    }


def walk_forward_reliability(history, window=180):
    start = max(120, len(history) - window)
    stats = {
        name: {"trials": 0, "bbfs6_full": 0, "position_top2_hits": 0, "positions": 0}
        for name in MODEL_NAMES
    }

    for idx in range(start, len(history)):
        train = history[:idx]
        actual = digits_of(history[idx])
        actual_unique = set(actual)
        for name in MODEL_NAMES:
            matrix = model_matrix(name, train)
            agg = aggregate_digits(matrix)
            top6 = set(top_digits(agg, 6))
            top2_pos = [set(top_digits(matrix[p], 2)) for p in range(4)]

            s = stats[name]
            s["trials"] += 1
            if actual_unique.issubset(top6):
                s["bbfs6_full"] += 1
            for p in range(4):
                s["positions"] += 1
                if actual[p] in top2_pos[p]:
                    s["position_top2_hits"] += 1

    reliability_raw = {}
    for name, s in stats.items():
        trials = max(1, s["trials"])
        positions = max(1, s["positions"])
        full_rate = s["bbfs6_full"] / trials
        pos_rate = s["position_top2_hits"] / positions
        # Weighted evaluation score; not a probability of a future draw.
        metric = 0.70 * full_rate + 0.30 * pos_rate
        reliability_raw[name] = metric
        s["bbfs6_full_rate"] = round(full_rate, 6)
        s["position_top2_rate"] = round(pos_rate, 6)
        s["metric"] = round(metric, 6)

    avg = mean(reliability_raw.values()) if reliability_raw else 1.0
    weights = {}
    for name in MODEL_NAMES:
        rel_index = reliability_raw[name] / avg if avg > 0 else 1.0
        weights[name] = round(
            BASE_WEIGHTS[name] * clamp(rel_index, 0.65, 1.35),
            6,
        )
        stats[name]["reliability_index"] = round(rel_index, 6)
        stats[name]["base_weight"] = BASE_WEIGHTS[name]
        stats[name]["final_weight"] = weights[name]
    return stats, weights


def combine_models(matrices, weights=None):
    combined = [[0.0] * 10 for _ in range(4)]
    for name, matrix in matrices.items():
        w = 1.0 if weights is None else float(weights[name])
        for p in range(4):
            for d in range(10):
                combined[p][d] += w * matrix[p][d]
    return normalize_matrix(combined)


def ranked_combinations(matrix, positions, limit=10):
    pools = [top_digits(matrix[p], 4) for p in positions]
    candidates = []
    for combo in itertools.product(*pools):
        score = sum(math.log(max(matrix[p][d], 1e-12)) for p, d in zip(positions, combo))
        number = "".join(str(d) for d in combo)
        candidates.append((score, number))
    candidates.sort(key=lambda item: (-item[0], item[1]))
    out = []
    seen = set()
    for score, number in candidates:
        if number in seen:
            continue
        seen.add(number)
        out.append((score, number))
        if len(out) >= limit:
            break
    return out


def exactly_one_pair(number):
    counts = sorted(Counter(number).values())
    return counts == [1, 1, 2]


def candidate_support(number, positions, matrices):
    support = []
    for name, matrix in matrices.items():
        ok = True
        for ch, p in zip(number, positions):
            if int(ch) not in top_digits(matrix[p], 2):
                ok = False
                break
        if ok:
            support.append(name)
    return support


def decorate_candidates(candidates, positions, matrices, n=5):
    out = []
    for _, number in candidates[:n]:
        support = candidate_support(number, positions, matrices)
        stars = max(0, min(3, len(support) - 1))
        out.append({
            "number": number,
            "stars": stars,
            "star_label": "⭐" * stars,
            "support": support,
        })
    return out


def target_date_for(market, latest_date):
    d = latest_date + timedelta(days=1)
    if market != "SGP":
        return d
    while d.weekday() not in SGP_WEEKDAYS:
        d += timedelta(days=1)
    return d


def increment_period(period):
    if not period or "-" not in period:
        return None
    prefix, value = period.rsplit("-", 1)
    if not value.isdigit():
        return None
    return f"{prefix}-{int(value) + 1}"


def p8_instinct(history, weighted):
    seed_text = "|".join(str(row["nomor"]).zfill(4) for row in history[-16:])
    digest = hashlib.sha256(seed_text.encode("utf-8")).digest()
    top3 = [top_digits(weighted[p], 3) for p in range(4)]
    chosen = []
    for p in range(4):
        chosen.append(top3[p][digest[p] % len(top3[p])])

    agg = aggregate_digits(weighted)
    rank = top_digits(agg, 10)
    rotate = digest[8] % 10
    rank = rank[rotate:] + rank[:rotate]
    bbfs6 = "".join(str(d) for d in rank[:6])
    bbfs5 = "".join(str(d) for d in rank[:5])
    four_d = "".join(str(d) for d in chosen)
    reserve = "".join(str(top3[p][(digest[p + 4] + 1) % 3]) for p in range(4))

    repeat_digit = str(rank[digest[12] % min(4, len(rank))])
    return {
        "bbfs6": bbfs6,
        "bbfs5": bbfs5,
        "four_d_main": four_d,
        "four_d_reserve": reserve,
        "three_d_front": four_d[:3],
        "three_d_back": four_d[1:],
        "two_d_front": four_d[:2],
        "two_d_middle": four_d[1:3],
        "two_d_back": four_d[2:],
        "repeat_digit": repeat_digit,
        "note": "Deterministic AI-instinct heuristic; excluded from P1-P7 weighted consensus.",
    }


def prior_audit(market, latest_row):
    latest_date = latest_row["result_date"]
    archive = PRED_DIR / market.lower() / "archive" / f"{latest_date}.json"
    if not archive.exists():
        return None
    try:
        old = json.loads(archive.read_text(encoding="utf-8"))
    except Exception:
        return None

    actual = str(latest_row["nomor"]).zfill(4)
    quick = old.get("quick_view", {})
    four = quick.get("four_d", {})
    three = quick.get("three_d", {})
    two = quick.get("two_d", {})

    def numbers(items):
        out = []
        for item in items or []:
            if isinstance(item, dict):
                out.append(str(item.get("number", "")))
            else:
                out.append(str(item))
        return out

    return {
        "target_date": latest_date,
        "actual": actual,
        "previous_four_d_main": four.get("main"),
        "four_d_exact": four.get("main") == actual,
        "three_d_front_hit": actual[:3] in numbers(three.get("front")),
        "three_d_back_hit": actual[1:] in numbers(three.get("back")),
        "two_d_front_hit": actual[:2] in numbers(two.get("front")),
        "two_d_middle_hit": actual[1:3] in numbers(two.get("middle")),
        "two_d_back_hit": actual[2:] in numbers(two.get("back")),
    }


def build_prediction(market, history):
    latest = history[-1]
    latest_date = date.fromisoformat(latest["result_date"])
    target_date = target_date_for(market, latest_date)
    target_period = increment_period(latest.get("periode"))

    matrices = {name: model_matrix(name, history) for name in MODEL_NAMES}
    backtest, weights = walk_forward_reliability(history)
    raw = combine_models(matrices)
    weighted = combine_models(matrices, weights)

    raw_agg = aggregate_digits(raw)
    weighted_agg = aggregate_digits(weighted)
    raw_rank = top_digits(raw_agg, 10)
    weighted_rank = top_digits(weighted_agg, 10)

    four_ranked = ranked_combinations(weighted, (0, 1, 2, 3), 40)
    main = four_ranked[0][1]
    alternative = next(n for _, n in four_ranked[1:] if n != main)
    reserve = next(n for _, n in four_ranked[2:] if n not in {main, alternative})
    pair = next((n for _, n in four_ranked if exactly_one_pair(n)), main)

    front3 = ranked_combinations(weighted, (0, 1, 2), 5)
    back3 = ranked_combinations(weighted, (1, 2, 3), 5)
    front2 = ranked_combinations(weighted, (0, 1), 5)
    middle2 = ranked_combinations(weighted, (1, 2), 5)
    back2 = ranked_combinations(weighted, (2, 3), 5)

    bbfs6 = "".join(str(d) for d in weighted_rank[:6])
    bbfs6_reserve = "".join(str(d) for d in weighted_rank[:5] + [weighted_rank[6]])
    bbfs5 = "".join(str(d) for d in weighted_rank[:5])
    bbfs5_reserve = "".join(str(d) for d in weighted_rank[:4] + [weighted_rank[5]])

    dup_scores, _ = duplicate_profile(history)
    repeat_digit = top_digits(dup_scores, 1)[0]
    repeat_rest = [d for d in weighted_rank if d != repeat_digit][:4]
    repeat_pattern = str(repeat_digit) * 2 + "".join(str(d) for d in repeat_rest)

    kembar_scores = []
    for d in range(10):
        score = (
            weighted[0][d] + weighted[1][d]
            + weighted[1][d] + weighted[2][d]
            + weighted[2][d] + weighted[3][d]
        )
        kembar_scores.append((score, f"{d}{d}"))
    kembar_scores.sort(key=lambda item: (-item[0], item[1]))

    p8 = p8_instinct(history, weighted)
    models = {
        name: {
            **model_summary(name, matrices[name], history),
            "backtest": backtest[name],
            "weight": weights[name],
        }
        for name in MODEL_NAMES
    }

    full_rates = [backtest[name]["bbfs6_full_rate"] for name in MODEL_NAMES]
    avg_rate = mean(full_rates)
    confidence = "moderate" if avg_rate >= 0.10 else "low"

    now = datetime.now(JAKARTA).isoformat(timespec="seconds")
    payload = {
        "schema_version": 1,
        "engine": "AdiPredictor-P1-P8-v1",
        "market": market,
        "generated_at": now,
        "latest_result": {
            "date": latest["result_date"],
            "period": latest.get("periode"),
            "number": str(latest["nomor"]).zfill(4),
        },
        "target_date": target_date.isoformat(),
        "target_period": target_period,
        "dataset": {
            "count": len(history),
            "first_date": history[0]["result_date"],
            "last_date": history[-1]["result_date"],
        },
        "prior_prediction_audit": prior_audit(market, latest),
        "models": models,
        "raw_consensus": {
            "digit_ranking": [str(d) for d in raw_rank],
        },
        "weighted_consensus": {
            "digit_ranking": [str(d) for d in weighted_rank],
            "weights": weights,
        },
        "p8_ai_instinct": p8,
        "quick_view": {
            "bbfs": {
                "main6": bbfs6,
                "reserve6": bbfs6_reserve,
                "main5": bbfs5,
                "reserve5": bbfs5_reserve,
                "repeat_pattern": repeat_pattern,
            },
            "four_d": {
                "main": main,
                "alternative": alternative,
                "reserve": reserve,
                "single_pair": pair,
            },
            "three_d": {
                "front": decorate_candidates(front3, (0, 1, 2), matrices),
                "back": decorate_candidates(back3, (1, 2, 3), matrices),
            },
            "two_d": {
                "front": decorate_candidates(front2, (0, 1), matrices),
                "middle": decorate_candidates(middle2, (1, 2), matrices),
                "back": decorate_candidates(back2, (2, 3), matrices),
                "kembar": {
                    "main": kembar_scores[0][1],
                    "reserve": kembar_scores[1][1],
                },
            },
            "repeat_signal": {
                "data_digit": str(repeat_digit),
                "p8_digit": p8["repeat_digit"],
            },
            "candidate_counts": {
                "four_d": 4,
                "three_d": 10,
                "two_d_regular": 15,
                "two_d_kembar": 2,
            },
        },
        "confidence": {
            "overall": confidence,
            "note": "Heuristic confidence from retrospective model reliability; not a guarantee or win probability.",
        },
    }
    return payload


def write_prediction(market, payload):
    market_dir = PRED_DIR / market.lower()
    archive_dir = market_dir / "archive"
    archive_dir.mkdir(parents=True, exist_ok=True)

    latest_path = market_dir / "latest.json"
    archive_path = archive_dir / f"{payload['target_date']}.json"
    text = json.dumps(payload, indent=2, ensure_ascii=False) + "\n"
    latest_path.write_text(text, encoding="utf-8")
    archive_path.write_text(text, encoding="utf-8")


def main():
    summary = {}
    for market in MARKETS:
        history = load_history(market)
        payload = build_prediction(market, history)
        write_prediction(market, payload)
        q = payload["quick_view"]
        summary[market] = {
            "latest": payload["latest_result"],
            "target_date": payload["target_date"],
            "target_period": payload["target_period"],
            "four_d_main": q["four_d"]["main"],
            "bbfs6": q["bbfs"]["main6"],
            "dataset_count": payload["dataset"]["count"],
        }
        print(
            f"[{market}] target={payload['target_date']} "
            f"{payload['target_period']} 4D={q['four_d']['main']} "
            f"BBFS6={q['bbfs']['main6']} n={payload['dataset']['count']}"
        )

    (PRED_DIR / "status.json").write_text(
        json.dumps(
            {
                "generated_at": datetime.now(JAKARTA).isoformat(timespec="seconds"),
                "engine": "AdiPredictor-P1-P8-v1",
                "markets": summary,
            },
            indent=2,
            ensure_ascii=False,
        ) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
