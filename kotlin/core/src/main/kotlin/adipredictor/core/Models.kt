package adipredictor.core

import kotlin.math.ln

data class ModelResult(val matrix: Matrix, val diagnostics: Obj = obj())

fun modelP1(h: History, details: Boolean): ModelResult {
    val pos = positionFrequency(h)
    val global = globalFrequency(h)
    val matrix =
        normalizeMatrix(List(4) { p -> DoubleArray(10) { d -> .72 * pos[p][d] + .28 * global[d] } })
    if (!details) return ModelResult(matrix)
    val raw = Counter<Int>()
    val years = linkedMapOf<String, Counter<Int>>()
    for (row in h) for (d in row.digits) {
        raw.add(d)
        years.getOrPut(row.date.take(4)) { Counter() }.add(d)
    }
    val rank = (0..9).sortedWith(compareBy<Int> { -raw.count(it) }.thenBy { it })
    val positions = rawPositions(h)
    fun ds(items: List<Int>) = items.map(Int::toString)
    return ModelResult(
        matrix,
        obj(
            "global_digit_frequency" to (0..9).associate { it.toString() to raw.count(it) },
            "position_frequency" to
                POSITIONS.mapIndexed { p, name ->
                        name to (0..9).associate { it.toString() to positions[p][it] }
                    }
                    .toMap(),
            "temperature" to
                obj(
                    "hot" to ds(rank.take(2)),
                    "warm" to ds(rank.subList(2, 4)),
                    "neutral" to ds(rank.subList(4, 7)),
                    "cold" to ds(rank.drop(7)),
                ),
            "year_by_year_distribution" to
                years.toSortedMap().mapValues { (_, c) ->
                    (0..9).associate { it.toString() to c.count(it) }
                },
            "historical_pairs" to pairCounts(h).mapValues { it.value.common(10) },
            "digit_cooccurrence" to cooccurrence(h),
        ),
    )
}

fun digitGaps(h: History): Pair<IntArray, IntArray> {
    val current = IntArray(10)
    val maximum = IntArray(10)
    for (d in 0..9) {
        val seen = h.indices.filter { d in h[it].digits }
        current[d] = if (seen.isEmpty()) h.size else h.size - 1 - seen.last()
        val boundaries = listOf(-1) + seen + listOf(h.size)
        maximum[d] = boundaries.zipWithNext { a, b -> b - a - 1 }.max()
    }
    return current to maximum
}

fun modelP2(h: History, details: Boolean): ModelResult {
    val sizes = listOf(10, 20, 30, 60, 90)
    val weights = listOf(.25, .20, .20, .18, .17)
    val positions = sizes.associateWith { positionFrequency(h.takeLast(it)) }
    val globals = sizes.associateWith { globalFrequency(h.takeLast(it)) }
    val (gaps, maxGaps) = digitGaps(h)
    val matrix =
        normalizeMatrix(
            List(4) { p ->
                DoubleArray(10) { d ->
                    val trend =
                        sum(sizes.indices.map { weights[it] * positions.getValue(sizes[it])[p][d] })
                    val accel =
                        (positions.getValue(10)[p][d] - positions.getValue(60)[p][d]).coerceIn(
                            -.05,
                            .05,
                        )
                    trend +
                        .12 * globals.getValue(30)[d] +
                        .06 * accel +
                        .02 * gaps[d] / maxOf(1, maxGaps[d])
                }
            }
        )
    if (!details) return ModelResult(matrix)
    return ModelResult(
        matrix,
        obj(
            "windows" to
                sizes.associate { s ->
                    "last_$s" to
                        obj(
                            "global" to
                                (0..9).associate { it.toString() to rnd(globals.getValue(s)[it]) },
                            "position" to
                                (0..3).map { p ->
                                    (0..9).associate {
                                        it.toString() to rnd(positions.getValue(s)[p][it])
                                    }
                                },
                        )
                },
            "acceleration" to
                (0..9).associate {
                    it.toString() to rnd(globals.getValue(10)[it] - globals.getValue(60)[it])
                },
            "cooling" to
                (0..9).associate {
                    it.toString() to (globals.getValue(10)[it] < globals.getValue(60)[it])
                },
            "current_digit_gap" to (0..9).associate { it.toString() to gaps[it] },
            "historical_maximum_gap" to (0..9).associate { it.toString() to maxGaps[it] },
            "gap_interpretation" to "Relative evidence only; a long gap is not certainty.",
        ),
    )
}

data class Transitions(val same: List<List<IntArray>>, val cross: Map<String, List<IntArray>>)

fun transitionTables(h: History): Transitions {
    val same = List(4) { List(10) { IntArray(10) } }
    val cross = linkedMapOf<String, List<IntArray>>()
    for (a in 0..3) for (b in 0..3) if (a != b)
        cross["${POSITIONS[a]}->${POSITIONS[b]}"] = List(10) { IntArray(10) }
    for (i in 1 until h.size) {
        val before = h[i - 1].digits
        val after = h[i].digits
        for (p in 0..3) same[p][before[p]][after[p]]++
        for (a in 0..3) for (b in 0..3) if (a != b)
            cross.getValue("${POSITIONS[a]}->${POSITIONS[b]}")[before[a]][after[b]]++
    }
    return Transitions(same, cross)
}

fun modelP3(h: History, details: Boolean): ModelResult {
    val fallback = positionFrequency(h)
    val latest = h.last().digits
    val (same, cross) = transitionTables(h)
    val matrix =
        normalizeMatrix(
            List(4) { target ->
                val counts = DoubleArray(10) { d -> 1.0 + same[target][latest[target]][d] }
                for (source in 0..3) if (source != target)
                    for (d in 0..9) counts[d] +=
                        .22 *
                            cross
                                .getValue("${POSITIONS[source]}->${POSITIONS[target]}")[
                                    latest[source]][d]
                val trans = normalize(counts)
                DoubleArray(10) { .78 * trans[it] + .22 * fallback[target][it] }
            }
        )
    if (!details) return ModelResult(matrix)
    val pairs = pairCounts(h)
    val pt = pairs.keys.associateWith { linkedMapOf<String, Counter<String>>() }
    for (i in 1 until h.size) {
        val before = pairs(h[i - 1].number)
        val after = pairs(h[i].number)
        for (name in pairs.keys) pt.getValue(name)
            .getOrPut(before.getValue(name)) { Counter() }
            .add(after.getValue(name))
    }
    val origins = pairs(h.last().number)
    val reverse =
        (1 until h.size).count {
            h[it].number.take(2) == h[it - 1].number.take(2).reversed() ||
                h[it].number.takeLast(2) == h[it - 1].number.takeLast(2).reversed()
        }
    return ModelResult(
        matrix,
        obj(
            "transition_origin" to h.last().number,
            "same_position_transition_matrix" to
                POSITIONS.mapIndexed { p, n -> n to same[p] }.toMap(),
            "cross_position_transition_matrix" to cross,
            "pairs" to pairs.mapValues { it.value.common(12) },
            "rare_pairs" to
                pairs.mapValues { (_, c) ->
                    c.entries
                        .sortedWith(
                            compareBy<Map.Entry<String, Int>> { it.value }.thenBy { it.key }
                        )
                        .take(10)
                        .map { listOf(it.key, it.value) }
                },
            "next_draw_pair_behaviour" to
                origins.mapValues { (name, origin) ->
                    obj(
                        "origin" to origin,
                        "top_successors" to (pt.getValue(name)[origin] ?: Counter()).common(10),
                    )
                },
            "reverse_pair_next_draw_occurrences" to reverse,
            "digit_cooccurrence" to cooccurrence(h),
        ),
    )
}

fun duplicateClass(n: String): String =
    when (n.groupingBy { it }.eachCount().values.sortedDescending()) {
        listOf(1, 1, 1, 1) -> "NO_DUPLICATE"
        listOf(2, 1, 1) -> "SINGLE_PAIR"
        listOf(2, 2) -> "DOUBLE_PAIR"
        listOf(3, 1) -> "TRIPLE"
        listOf(4) -> "QUADRUPLE"
        else -> error("Invalid structure")
    }

data class Duplicates(
    val classes: Counter<String>,
    val repeats: Counter<String>,
    val positions: Counter<String>,
    val digits: Map<String, Counter<String>>,
    val structures: Map<String, Counter<String>>,
)

fun duplicateDiagnostics(h: History): Duplicates {
    val classes = Counter<String>()
    val repeats = Counter<String>()
    val positions = Counter<String>()
    val digits = linkedMapOf<String, Counter<String>>()
    val structures = linkedMapOf<String, Counter<String>>()
    fun addNext(key: String, next: String) {
        for (d in next) digits.getOrPut(key) { Counter() }.add(d.toString())
        structures.getOrPut(key) { Counter() }.add(duplicateClass(next))
    }
    for ((i, row) in h.withIndex()) {
        val n = row.number
        val cls = duplicateClass(n)
        classes.add(cls)
        val repeated = n.groupingBy { it.toString() }.eachCount().filterValues { it >= 2 }.keys
        for (d in repeated) repeats.add(d)
        for (a in 0..3) for (b in a + 1..3) if (n[a] == n[b])
            positions.add("${POSITIONS[a]}-${POSITIONS[b]}")
        if (i + 1 < h.size) {
            val next = h[i + 1].number
            addNext(cls, next)
            if (n[0] == n[3]) addNext("AS-EKOR_PAIR", next)
            for (d in repeated) addNext("REPEATED_DIGIT_$d", next)
        }
    }
    return Duplicates(classes, repeats, positions, digits, structures)
}

fun modelP4(h: History, details: Boolean): ModelResult {
    val (classes, repeats, positions, conditional, structures) = duplicateDiagnostics(h)
    val pos = positionFrequency(h)
    val repeatScore = normalize(DoubleArray(10) { repeats.count(it.toString()) + 1.0 })
    val next = conditional[duplicateClass(h.last().number)] ?: Counter()
    val nextScore = normalize(DoubleArray(10) { next.count(it.toString()) + 1.0 })
    val matrix =
        normalizeMatrix(
            List(4) { p ->
                DoubleArray(10) { d -> .48 * pos[p][d] + .37 * repeatScore[d] + .15 * nextScore[d] }
            }
        )
    if (!details) return ModelResult(matrix)
    val ranked = rankedCombinations(matrix, listOf(0, 1, 2, 3), 625, 5).map { it.second }
    val candidates =
        listOf("SINGLE_PAIR", "DOUBLE_PAIR", "TRIPLE", "QUADRUPLE").associateWith { name ->
            ranked.firstOrNull { duplicateClass(it) == name }
        }
    val positionKeys =
        listOf("AS-KOP", "AS-KEPALA", "AS-EKOR", "KOP-KEPALA", "KOP-EKOR", "KEPALA-EKOR")
    var sameRepeat = 0
    for (i in 1 until h.size) for (p in 0..3) if (h[i].digits[p] == h[i - 1].digits[p]) sameRepeat++
    return ModelResult(
        matrix,
        obj(
            "within_draw_duplicate" to
                listOf("NO_DUPLICATE", "SINGLE_PAIR", "DOUBLE_PAIR", "TRIPLE", "QUADRUPLE")
                    .associateWith(classes::count),
            "repeat_digit_counts" to
                (0..9).associate { it.toString() to repeats.count(it.toString()) },
            "preferred_repeat_positions" to positionKeys.associateWith(positions::count),
            "conditional_next_draw" to
                (conditional.keys + structures.keys).sorted().associateWith { key ->
                    obj(
                        "digit_frequency" to (conditional[key] ?: emptyMap<String, Int>()),
                        "structure_frequency" to (structures[key] ?: emptyMap<String, Int>()),
                    )
                },
            "single_pair_candidate" to candidates["SINGLE_PAIR"],
            "double_pair_diagnostic" to candidates["DOUBLE_PAIR"],
            "triple_diagnostic" to candidates["TRIPLE"],
            "quadruple_diagnostic" to candidates["QUADRUPLE"],
            "same_position_next_draw_repeat" to sameRepeat,
            "diagnostic_note" to
                "Within-draw duplicate and same-position next-draw repeat are separate denominators.",
        ),
    )
}

fun visualBacktests(h: History): Obj {
    var vh = 0
    var vt = 0
    var fh = 0
    var hh = 0
    var ht = 0
    for (i in MINIMUM_TRAINING_RECORDS until h.size) {
        val actual = h[i].digits
        val previous = h[i - 1].digits
        val fallback = positionFrequency(h.subList(maxOf(0, i - 180), i))
        for (target in 0..3) {
            val neighbors = listOf(target - 1, target + 1).filter { it in 0..3 }
            for (source in neighbors) {
                vt++
                if (actual[target] == previous[source]) vh++
            }
            val d = topDigits(fallback[target], 1).first()
            if (actual[target] == d) fh++
            ht++
            if (neighbors.any { actual[target] == previous[it] } || actual[target] == d) hh++
        }
    }
    val ci = wilsonInterval(vh, vt)
    val edge = vt >= 30 && ci[0] > .10
    return obj(
        "visual_only_backtest" to
            obj(
                "hits" to vh,
                "trials" to vt,
                "hit_rate" to rnd(rate(vh, vt)),
                "baseline" to .10,
                "wilson_95_ci" to ci,
            ),
        "fallback_backtest" to obj("hits" to fh, "trials" to ht, "hit_rate" to rnd(rate(fh, ht))),
        "hybrid_backtest" to
            obj(
                "hits" to hh,
                "trials" to ht,
                "hit_rate" to rnd(rate(hh, ht)),
                "note" to "Hybrid performance is not evidence for visual-only edge.",
            ),
        "visual_pattern_confirmed" to (vh > 0),
        "visual_predictive_edge_confirmed" to edge,
        "visual_vote_weight" to if (edge) 1.0 else 0.0,
    )
}

fun visualOnlyEdge(h: History): Boolean {
    var hits = 0
    var trials = 0
    for (i in MINIMUM_TRAINING_RECORDS until h.size) for (target in 0..3) for (source in
        listOf(target - 1, target + 1)) if (source in 0..3) {
        trials++
        if (h[i].digits[target] == h[i - 1].digits[source]) hits++
    }
    return trials >= 30 && wilsonInterval(hits, trials)[0] > .10
}

fun modelP5(h: History, details: Boolean): ModelResult {
    val fallback = normalizeMatrix(positionFrequency(h.takeLast(180)))
    val tests = if (details) visualBacktests(h) else null
    val edge = tests?.get("visual_predictive_edge_confirmed") as? Boolean ?: visualOnlyEdge(h)
    val matrix =
        if (!edge) fallback
        else
            normalizeMatrix(
                List(4) { target ->
                    val hits = DoubleArray(10) { .5 }
                    val trials = DoubleArray(10) { 1.0 }
                    val neighbors = listOf(target - 1, target + 1).filter { it in 0..3 }
                    for (i in 1 until h.size) for (source in neighbors) {
                        val d = h[i - 1].digits[source]
                        trials[d]++
                        if (h[i].digits[target] == d) hits[d]++
                    }
                    val bumps = DoubleArray(10)
                    for (source in neighbors) bumps[h.last().digits[source]] += .06
                    DoubleArray(10) { d ->
                        .64 * fallback[target][d] + .30 * hits[d] / trials[d] + bumps[d]
                    }
                }
            )
    if (!details) return ModelResult(matrix)
    val t = tests!!
    val mode = if (edge) "hybrid" else "fallback"
    return ModelResult(
        matrix,
        obj(
                "P5_MODE" to mode,
                "p5_mode" to mode,
                "visual_contribution_enabled" to edge,
                "model_visual_gate" to
                    obj(
                        "enabled" to edge,
                        "mode" to mode,
                        "vote_weight" to t["visual_vote_weight"],
                        "evaluation" to "visual_only_backtest",
                        "backtest" to t["visual_only_backtest"],
                    ),
                "visual_only" to t["visual_only_backtest"],
                "fallback" to t["fallback_backtest"],
                "hybrid" to t["hybrid_backtest"],
            )
            .also { it.putAll(t) },
    )
}

fun structureSignature(n: String): String {
    val mapping = linkedMapOf<Char, Char>()
    return n.map { mapping.getOrPut(it) { ('A'.code + mapping.size).toChar() } }.joinToString("")
}

fun structuralDiagnostics(h: History): Obj {
    val sig = Counter<String>()
    val sums = Counter<Int>()
    val unique = Counter<Int>()
    val oe = Counter<String>()
    val sb = Counter<String>()
    val largest = Counter<String>()
    val smallest = Counter<String>()
    val repeats = Counter<Int>()
    val allSums = mutableListOf<Int>()
    for (row in h) {
        val n = row.number
        val ds = row.digits
        val total = ds.sum()
        allSums += total
        sig.add(structureSignature(n))
        sums.add(total)
        unique.add(ds.toSet().size)
        oe.add(ds.joinToString("") { if (it % 2 != 0) "O" else "E" })
        sb.add(ds.joinToString("") { if (it < 5) "S" else "B" })
        largest.add(POSITIONS[ds.indexOf(ds.max())])
        smallest.add(POSITIONS[ds.indexOf(ds.min())])
        repeats.add(4 - ds.toSet().size)
    }
    val ordered = allSums.sorted()
    val recent = h.takeLast(90).map { it.digits.sum() }
    fun numeric(c: Map<Int, Int>) = c.mapKeys { it.key.toString() }
    return obj(
        "structure_profile" to sig,
        "sum_distribution" to numeric(sums.toSortedMap()),
        "preferred_historical_sum_range" to
            listOf(ordered[ordered.size / 4], ordered[3 * ordered.size / 4]),
        "preferred_recent_sum_range" to listOf(recent.min(), recent.max()),
        "digital_range" to listOf(allSums.min(), allSums.max()),
        "unique_digit_count" to numeric(unique),
        "odd_even" to oe.common(12).associate { it[0].toString() to it[1] },
        "small_big" to sb.common(12).associate { it[0].toString() to it[1] },
        "largest_digit_position" to largest,
        "smallest_digit_position" to smallest,
        "repeat_count" to numeric(repeats),
        "small_definition" to "0,1,2,3,4",
        "big_definition" to "5,6,7,8,9",
    )
}

fun modelP6(h: History, details: Boolean): ModelResult {
    val recent = h.takeLast(365)
    val pos = positionFrequency(recent)
    val parity = Counter<List<Int>>()
    val size = Counter<List<Boolean>>()
    for (row in recent) {
        parity.add(row.digits.map { it % 2 })
        size.add(row.digits.map { it >= 5 })
    }
    val pa = parity.entries.maxBy { it.value }.key
    val sz = size.entries.maxBy { it.value }.key
    val matrix =
        normalizeMatrix(
            List(4) { p ->
                DoubleArray(10) { d ->
                    .72 * pos[p][d] +
                        .28 *
                            (.5 * (if (d % 2 == pa[p]) 1 else 0) +
                                .5 * (if ((d >= 5) == sz[p]) 1 else 0))
                }
            }
        )
    return ModelResult(matrix, if (details) structuralDiagnostics(h) else obj())
}

data class LagDiagnostics(val stats: Obj, val edge: Boolean, val intervals: Obj)

fun lagDiagnostics(h: History, includeIntervals: Boolean): LagDiagnostics {
    val output = obj()
    var confirmed = false
    for (lag in LAGS) {
        var same = 0
        var shifted = 0
        var pairHits = 0
        var trials = 0
        var pairTrials = 0
        for (i in lag until h.size) {
            val cur = h[i].digits
            val old = h[i - lag].digits
            for (p in 0..3) {
                trials++
                if (cur[p] == old[p]) same++
                if ((0..3).any { it != p && cur[p] == old[it] }) shifted++
            }
            for (a in 0..2) {
                pairTrials++
                if (cur[a] == old[a] && cur[a + 1] == old[a + 1]) pairHits++
            }
        }
        val ci = wilsonInterval(same, trials)
        val edge = trials >= 100 && ci[0] > .10
        confirmed = confirmed || edge
        val r = rate(same, trials)
        output[lag.toString()] =
            obj(
                "same_position_hits" to same,
                "same_position_trials" to trials,
                "same_position_rate" to rnd(r),
                "same_position_baseline" to .10,
                "same_position_wilson_95_ci" to ci,
                "autocorrelation_above_baseline" to rnd(r - .10),
                "shifted_position_rate" to rnd(rate(shifted, trials)),
                "pair_recurrence_rate" to rnd(rate(pairHits, pairTrials)),
                "statistical_edge" to edge,
            )
    }
    val intervals = obj()
    if (includeIntervals)
        for (d in 0..9) {
            val appearances = h.indices.filter { d in h[it].digits }
            val values = appearances.zipWithNext { a, b -> b - a }
            val counts = Counter<Int>()
            for (v in values) counts.add(v)
            intervals[d.toString()] =
                obj(
                    "samples" to values.size,
                    "mean_draw_interval" to
                        if (values.isNotEmpty()) rnd(mean(values.map(Int::toDouble))) else null,
                    "most_common_intervals" to counts.common(5),
                )
        }
    return LagDiagnostics(output, confirmed, intervals)
}

fun modelP7(h: History, details: Boolean): ModelResult {
    val fallback = positionFrequency(h.takeLast(180))
    val (stats, edge, intervals) = lagDiagnostics(h, details)
    val matrix = List(4) { p -> DoubleArray(10) { .28 * fallback[p][it] } }
    for (lag in LAGS) if (lag < h.size) {
        val strength = maxOf(.005, stats[lag.toString()].map()["same_position_rate"].num() - .08)
        for (p in 0..3) matrix[p][h[h.size - lag].digits[p]] += strength
    }
    val normalized = normalizeMatrix(matrix)
    if (!details) return ModelResult(normalized)
    val best = LAGS.maxBy { stats[it.toString()].map()["same_position_rate"].num() }
    return ModelResult(
        normalized,
        obj(
            "lags" to stats,
            "lag_signal" to
                obj(
                    "best_exploratory_lag" to best,
                    "rate" to stats[best.toString()].map()["same_position_rate"],
                ),
            "repeat_intervals" to intervals,
            "statistical_edge" to edge,
            "cycle_edge_confirmed" to edge,
            "no_edge_multiplier" to if (edge) 1.0 else .85,
            "note" to "Cycle terminology requires Wilson-confirmed edge above the 10% baseline.",
        ),
    )
}

fun modelMatrix(name: String, h: History, details: Boolean = false): ModelResult =
    when (name) {
        "P1" -> modelP1(h, details)
        "P2" -> modelP2(h, details)
        "P3" -> modelP3(h, details)
        "P4" -> modelP4(h, details)
        "P5" -> modelP5(h, details)
        "P6" -> modelP6(h, details)
        "P7" -> modelP7(h, details)
        else -> error("Unknown model")
    }

fun rankedCombinations(
    matrix: Matrix,
    positions: List<Int>,
    limit: Int = 10,
    poolSize: Int = 5,
): List<Pair<Double, String>> {
    val pools = positions.map { topDigits(matrix[it], poolSize) }
    val ranked = mutableListOf<Pair<Double, String>>()
    fun visit(index: Int, combo: List<Int>) {
        if (index == positions.size) {
            val score =
                sum(positions.indices.map { ln(maxOf(matrix[positions[it]][combo[it]], 1e-15)) })
            ranked += score to combo.joinToString("")
            return
        }
        for (d in pools[index]) visit(index + 1, combo + listOf(d))
    }
    visit(0, emptyList())
    return ranked
        .sortedWith(compareBy<Pair<Double, String>> { -it.first }.thenBy { it.second })
        .take(limit)
}

fun exactlyOnePair(n: String) = n.groupingBy { it }.eachCount().values.sorted() == listOf(1, 1, 2)

fun specializedSinglePairs(matrix: Matrix, limit: Int = 3): List<String> {
    val ranked = rankedCombinations(matrix, listOf(0, 1, 2, 3), 625, 5).map { it.second }
    return ranked.filter(::exactlyOnePair).ifEmpty { listOf(ranked.first()) }.take(limit)
}

fun topkSummary(name: String, matrix: Matrix, h: History, diagnostics: Obj? = null): Obj {
    val pairs = if (name == "P4") specializedSinglePairs(matrix) else emptyList()
    val four =
        if (pairs.isNotEmpty()) pairs
        else rankedCombinations(matrix, listOf(0, 1, 2, 3), 3).map { it.second }
    val out =
        obj(
            "bbfs6" to topDigits(aggregate(matrix), 6).joinToString(""),
            "bbfs5" to topDigits(aggregate(matrix), 5).joinToString(""),
            "4d_top3" to four,
        )
    for ((field, positions) in
        linkedMapOf(
            "3d_front_top5" to listOf(0, 1, 2),
            "3d_back_top5" to listOf(1, 2, 3),
            "2d_front_top5" to listOf(0, 1),
            "2d_middle_top5" to listOf(1, 2),
            "2d_back_top5" to listOf(2, 3),
        )) out[field] = rankedCombinations(matrix, positions, 5).map { it.second }
    if (pairs.isNotEmpty()) {
        out["single_pair_candidate"] = pairs.first()
        out["single_pair_candidates"] = pairs
    }
    if (!diagnostics.isNullOrEmpty()) out["analysis"] = diagnostics
    return out
}
