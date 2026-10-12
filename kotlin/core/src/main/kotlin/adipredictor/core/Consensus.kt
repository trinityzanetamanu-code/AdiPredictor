package adipredictor.core

import java.security.MessageDigest

class WalkStats {
    var trials = 0
    val hits = linkedMapOf<String, Int>()
    var bbfs5 = 0
    var bbfs6 = 0
    var digitOccurrences = 0

    init {
        for (d in listOf("2d_front", "2d_middle", "2d_back", "3d_front", "3d_back")) for (k in
            listOf(1, 3, 5)) hits["${d}_top$k"] = 0
        for (k in listOf("4d_main", "4d_top3", "bbfs5_full_draw", "bbfs6_full_draw")) hits[k] = 0
    }
}

fun evaluatePrediction(stats: WalkStats, summary: Obj, actual: String) {
    stats.trials++
    val values =
        linkedMapOf(
            "2d_front" to actual.take(2),
            "2d_middle" to actual.substring(1, 3),
            "2d_back" to actual.takeLast(2),
            "3d_front" to actual.take(3),
            "3d_back" to actual.takeLast(3),
        )
    for ((dim, target) in values) for (k in listOf(1, 3, 5)) if (
        target in summary["${dim}_top5"].strings().take(k)
    )
        stats.hits["${dim}_top$k"] = stats.hits.getValue("${dim}_top$k") + 1
    if (actual == summary["4d_top3"].strings().first())
        stats.hits["4d_main"] = stats.hits.getValue("4d_main") + 1
    if (actual in summary["4d_top3"].strings())
        stats.hits["4d_top3"] = stats.hits.getValue("4d_top3") + 1
    for (size in listOf(5, 6)) {
        val bbfs = (summary["bbfs$size"] as String).toSet()
        val captured = actual.count { it in bbfs }
        if (size == 5) stats.bbfs5 += captured else stats.bbfs6 += captured
        if (bbfs.containsAll(actual.toSet()))
            stats.hits["bbfs${size}_full_draw"] = stats.hits.getValue("bbfs${size}_full_draw") + 1
    }
    stats.digitOccurrences += 4
}

fun finalizeWalkForward(stats: WalkStats): Obj {
    val out =
        obj(
            "minimum_training_records" to MINIMUM_TRAINING_RECORDS,
            "out_of_sample_points" to stats.trials,
        )
    for ((key, hits) in stats.hits) out[key] =
        obj("hits" to hits, "trials" to stats.trials, "rate" to rnd(rate(hits, stats.trials)))
    for (size in listOf(5, 6)) {
        val captured = if (size == 5) stats.bbfs5 else stats.bbfs6
        out["bbfs${size}_digit_coverage"] =
            obj(
                "occurrences_captured" to captured,
                "total_occurrences" to stats.digitOccurrences,
                "rate" to rnd(rate(captured, stats.digitOccurrences)),
            )
        out["bbfs${size}_full_draw_coverage"] = out.remove("bbfs${size}_full_draw")
    }
    return out
}

fun walkForwardReliability(h: History): Pair<Obj, Map<String, Double>> {
    val stats = MODELS.associateWith { WalkStats() }
    for (i in MINIMUM_TRAINING_RECORDS until h.size) {
        val train = h.subList(0, i)
        for (name in MODELS) {
            val m = modelMatrix(name, train)
            evaluatePrediction(
                stats.getValue(name),
                topkSummary(name, m.matrix, train),
                h[i].number,
            )
        }
    }
    val results = MODELS.associateWith { finalizeWalkForward(stats.getValue(it)) }
    val metrics =
        results.mapValues { (_, r) ->
            linkedMapOf(
                "2d_top5" to
                    mean(
                        listOf("front", "middle", "back").map {
                            r["2d_${it}_top5"].map()["rate"].num()
                        }
                    ),
                "3d_top5" to
                    mean(listOf("front", "back").map { r["3d_${it}_top5"].map()["rate"].num() }),
                "bbfs6_full" to r["bbfs6_full_draw_coverage"].map()["rate"].num(),
                "bbfs5_full" to r["bbfs5_full_draw_coverage"].map()["rate"].num(),
                "4d_top3" to r["4d_top3"].map()["rate"].num(),
            )
        }
    val best =
        metrics.values.first().keys.associateWith { key ->
            metrics.values.maxOf { it.getValue(key) }
        }
    val low4d = results.values.maxOf { it["4d_top3"].map()["hits"].int() } < 5
    var contributions =
        linkedMapOf(
            "2d_top5" to .30,
            "3d_top5" to .25,
            "bbfs6_full" to .25,
            "bbfs5_full" to .10,
            "4d_top3" to .10,
        )
    if (low4d) {
        contributions.remove("4d_top3")
        val total = sum(contributions.values)
        contributions = LinkedHashMap(contributions.mapValues { it.value / total })
    }
    val raw = linkedMapOf<String, Double>()
    for (name in MODELS) {
        val normalized =
            contributions.keys.associateWith { key ->
                if (best.getValue(key) != 0.0)
                    metrics.getValue(name).getValue(key) / best.getValue(key)
                else 1.0
            }
        raw[name] = sum(contributions.map { (key, value) -> value * normalized.getValue(key) })
        results.getValue(name)["reliability_components"] =
            obj(
                "rates" to metrics.getValue(name).mapValues { rnd(it.value) },
                "normalized" to normalized.mapValues { rnd(it.value) },
                "contributions" to contributions.mapValues { rnd(it.value) },
                "low_sample_size_4d" to low4d,
            )
    }
    val bestScore = raw.values.max().let { if (it != 0.0) it else 1.0 }
    val weights = MODELS.associateWith { raw.getValue(it) / bestScore }.toMutableMap()
    val p7 = modelP7(h, true).diagnostics
    val edge = p7["cycle_edge_confirmed"] as Boolean
    if (!edge) weights["P7"] = weights.getValue("P7") * .85
    val rounded = weights.mapValues { rnd(it.value) }
    for (name in MODELS) {
        results.getValue(name)["reliability_weight"] = rounded.getValue(name)
        results.getValue(name)["best_model_weight"] = 1.0
        if (name == "P7") results.getValue(name)["p7_no_edge_multiplier_applied"] = !edge
    }
    return obj().also { it.putAll(results) } to rounded
}

fun p8Instinct(h: History): Obj {
    val recent = h.takeLast(32)
    val material = recent.joinToString("|") { "${it.date}:${it.number}" }
    val digest =
        MessageDigest.getInstance("SHA-256").digest(material.toByteArray(Charsets.UTF_8)).map {
            it.toInt() and 255
        }
    val positions = rawPositions(recent)
    val global = Counter<Int>()
    for (row in recent) for (d in row.digits) global.add(d)
    val chosen = mutableListOf<Int>()
    val reserve = mutableListOf<Int>()
    for (p in 0..3) {
        val rank = (0..9).sortedWith(compareBy<Int> { -positions[p][it] }.thenBy { it })
        chosen += rank[digest[p] % 5]
        reserve += rank[(digest[p + 4] % 5 + 1) % 5]
    }
    val globalRank = (0..9).sortedWith(compareBy<Int> { -global.count(it) }.thenBy { it })
    val rotate = digest[10] % 10
    val rank = globalRank.drop(rotate) + globalRank.take(rotate)
    val main = chosen.joinToString("")
    val backup = reserve.joinToString("")
    val out =
        obj(
            "bbfs6" to rank.take(6).joinToString(""),
            "bbfs5" to rank.take(5).joinToString(""),
            "four_d_main" to main,
            "four_d_reserve" to backup,
            "three_d_front" to main.take(3),
            "three_d_back" to main.takeLast(3),
            "two_d_front" to main.take(2),
            "two_d_middle" to main.substring(1, 3),
            "two_d_back" to main.takeLast(2),
            "repeat_digit" to rank[digest[12] % 4].toString(),
            "frozen" to true,
            "method" to
                "Deterministic intuition heuristic from raw recent sequence; not statistical evidence.",
            "statistical_consensus_member" to false,
        )
    out["fingerprint"] = sha256(pythonJson(out))
    return out
}

fun exactSupport(number: String, field: String, models: Map<String, Any?>) =
    MODELS.filter { number in models[it].map()[field].strings() }

fun starsFor(raw: Int, score: Double) =
    when {
        raw >= 3 && score >= 2.35 -> 3
        raw >= 2 && score >= 1.55 -> 2
        raw >= 2 && score >= 1.20 -> 1
        else -> 0
    }

fun candidateRecord(
    number: String,
    field: String,
    models: Map<String, Any?>,
    weights: Map<String, Double>,
    p8: List<String> = emptyList(),
): Obj {
    val support = exactSupport(number, field, models)
    val score = sum(support.map(weights::getValue))
    val stars = starsFor(support.size, score)
    return obj(
        "number" to number,
        "supported_by" to support,
        "raw_support_count" to support.size,
        "supporting_model_wf_score" to support.associateWith(weights::getValue),
        "reliability_weighted_score" to rnd(score),
        "weighted_rank" to null,
        "star" to stars,
        "stars" to stars,
        "star_label" to "⭐".repeat(stars),
        "p8_agrees" to (number in p8),
    )
}

val WEIGHTED_ORDER =
    compareBy<Obj> { -it["reliability_weighted_score"].num() }
        .thenBy { -it["raw_support_count"].int() }
        .thenBy { it["number"] as String }
val RAW_ORDER =
    compareBy<Obj> { -it["raw_support_count"].int() }
        .thenBy { -it["reliability_weighted_score"].num() }
        .thenBy { it["number"] as String }

fun consensusCandidates(
    field: String,
    models: Map<String, Any?>,
    weights: Map<String, Double>,
    p8: List<String> = emptyList(),
): List<Obj> {
    val universe = MODELS.flatMap { models[it].map()[field].strings() }.distinct().sorted()
    val records =
        universe.map { candidateRecord(it, field, models, weights, p8) }.sortedWith(WEIGHTED_ORDER)
    records.forEachIndexed { i, item -> item["weighted_rank"] = i + 1 }
    return records
}

fun digitConsensus(
    models: Map<String, Any?>,
    weights: Map<String, Double>,
): Pair<List<Obj>, List<Obj>> {
    val records =
        (0..9).map { digit ->
            val d = digit.toString()
            val support = MODELS.filter { d in (models[it].map()["bbfs6"] as String) }
            obj(
                "digit" to d,
                "supported_by_bbfs6" to support,
                "raw_support_count" to support.size,
                "reliability_weighted_score" to rnd(sum(support.map(weights::getValue))),
            )
        }
    val rawOrder =
        compareBy<Obj> { -it["raw_support_count"].int() }
            .thenBy { -it["reliability_weighted_score"].num() }
            .thenBy { it["digit"] as String }
    val weightedOrder =
        compareBy<Obj> { -it["reliability_weighted_score"].num() }
            .thenBy { -it["raw_support_count"].int() }
            .thenBy { it["digit"] as String }
    val raw = records.map { LinkedHashMap(it) as Obj }.sortedWith(rawOrder)
    val weighted = records.map { LinkedHashMap(it) as Obj }.sortedWith(weightedOrder)
    raw.forEachIndexed { i, r -> r["raw_rank"] = i + 1 }
    weighted.forEachIndexed { i, r -> r["weighted_rank"] = i + 1 }
    return raw to weighted
}

fun diversityMetrics(
    main: String,
    reserve: String,
    mainModel: Any? = null,
    reserveModel: Any? = null,
): Obj {
    val union = main.toSet() + reserve.toSet()
    return obj(
        "main_reserve_position_overlap" to
            rnd(main.zip(reserve).count { it.first == it.second } / 4.0),
        "digit_set_overlap" to
            rnd(
                if (union.isNotEmpty())
                    main.toSet().intersect(reserve.toSet()).size.toDouble() / union.size
                else 0.0
            ),
        "structural_difference" to (structureSignature(main) != structureSignature(reserve)),
        "model_difference" to (mainModel != reserveModel),
        "main_structure" to structureSignature(main),
        "reserve_structure" to structureSignature(reserve),
    )
}

fun selectFourD(models: Map<String, Any?>, weights: Map<String, Double>, p8: Obj): Obj {
    val p8Numbers = listOf(p8["four_d_main"] as String, p8["four_d_reserve"] as String)
    val ranked = consensusCandidates("4d_top3", models, weights, p8Numbers)
    val main = ranked.first()
    val mainN = main["number"] as String
    val p4 = models["P4"].map()
    val pairs =
        if ("single_pair_candidates" in p4) p4["single_pair_candidates"].strings()
        else listOf(p4["single_pair_candidate"] as String)
    val pairN = pairs.firstOrNull { it != mainN } ?: pairs.first()
    val best = MODELS.maxWith(compareBy<String> { weights.getValue(it) }.thenBy { it })
    val altN =
        models[best].map()["4d_top3"].strings().firstOrNull { it != mainN && it != pairN }
            ?: ranked.first { it["number"] != mainN && it["number"] != pairN }["number"] as String
    val alternative =
        ranked.firstOrNull { it["number"] == altN }
            ?: candidateRecord(altN, "4d_top3", models, weights, p8Numbers)
    val remaining = ranked.filter { it["number"] !in listOf(mainN, altN, pairN) }
    val structural =
        remaining.filter {
            val n = it["number"] as String
            structureSignature(n) != structureSignature(mainN) && n.toSet() != mainN.toSet()
        }
    val diverse = structural.filter { it["supported_by"] != main["supported_by"] }
    val reserve = diverse.ifEmpty { structural }.ifEmpty { remaining }.first()
    val pair =
        ranked.firstOrNull { it["number"] == pairN }
            ?: candidateRecord(pairN, "4d_top3", models, weights, p8Numbers)
    val slots = listOf(mainN, altN, reserve["number"], pairN)
    return obj(
        "main" to main,
        "alternative" to alternative,
        "reserve" to reserve,
        "single_pair" to pair,
        "all_slots_distinct" to (slots.size == slots.toSet().size),
        "diversity" to
            diversityMetrics(
                mainN,
                reserve["number"] as String,
                main["supported_by"],
                reserve["supported_by"],
            ),
        "alternative_source_model" to best,
    )
}

fun kembarBacktest(h: History): Obj {
    val draws = h.size
    val slots = draws * 3
    val out = obj()
    for (d in 0..9) {
        val pair = d.toString().repeat(2)
        val front = h.count { it.number.take(2) == pair }
        val middle = h.count { it.number.substring(1, 3) == pair }
        val back = h.count { it.number.takeLast(2) == pair }
        val any =
            h.count {
                pair in listOf(it.number.take(2), it.number.substring(1, 3), it.number.takeLast(2))
            }
        fun count(hits: Int) =
            obj("hits" to hits, "draws" to draws, "rate" to rnd(rate(hits, draws)))
        out[pair] =
            obj(
                "front" to count(front),
                "middle" to count(middle),
                "back" to count(back),
                "any_position" to
                    obj(
                        "hits" to any,
                        "draws" to draws,
                        "per_draw_any_position_rate" to rnd(rate(any, draws)),
                    ),
                "per_slot" to
                    obj(
                        "occurrences" to front + middle + back,
                        "total_adjacent_slots" to slots,
                        "rate" to rnd(rate(front + middle + back, slots)),
                    ),
            )
    }
    return out
}

fun selectKembar(h: History): Obj {
    val stats = kembarBacktest(h)
    val rank =
        stats.keys.sortedWith(
            compareBy<String> {
                    -stats[it].map()["any_position"].map()["per_draw_any_position_rate"].num()
                }
                .thenBy { it }
        )
    return obj("main" to rank[0], "reserve" to rank[1], "backtest" to stats)
}
