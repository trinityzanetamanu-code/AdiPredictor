package adipredictor.core

import java.time.LocalDate

data class PredictionInputs(
    val market: String,
    val history: History,
    val config: Map<String, Any?>,
    val generatedAt: String,
    val previousPrediction: Map<String, Any?>? = null,
    val priorArchive: Map<String, Any?>? = null,
    val priorArchivePath: String? = null,
)

data class PredictionResult(
    val payload: Obj,
    val svgs: Map<String, String>,
    val matrices: Map<String, Matrix>,
)

fun predictionSections(payload: Map<String, Any?>?): Obj {
    val quick = payload?.get("quick_view").map()
    val bbfs = quick["bbfs"].map()
    val four = quick["four_d"].map()
    val three = quick["three_d"].map()
    val two = quick["two_d"].map()
    val p8 = payload?.get("p8_ai_instinct").map()
    return obj(
        "bbfs6" to bbfs["main6"],
        "bbfs5" to bbfs["main5"],
        "four_d" to
            listOf("main", "alternative", "reserve", "single_pair").map { extractNumber(four[it]) },
        "three_d_front" to three["front"].list().map(::extractNumber),
        "three_d_back" to three["back"].list().map(::extractNumber),
        "two_d_front" to two["front"].list().map(::extractNumber),
        "two_d_middle" to two["middle"].list().map(::extractNumber),
        "two_d_back" to two["back"].list().map(::extractNumber),
        "p8" to P8_FIELDS.associateWith { p8[it] },
    )
}

fun buildPrediction(input: PredictionInputs): PredictionResult {
    val market = input.market
    val h = input.history
    val config = input.config
    val previous = input.previousPrediction
    val validation = validateDataset(market, h, config)
    require(validation["data_validation_status"] == "VALID") { "$market: invalid dataset" }
    val latest = h.last()
    val target = targetDateFor(market, LocalDate.parse(latest.date), config).toString()
    val models = obj()
    val matrices = linkedMapOf<String, Matrix>()
    for (name in MODELS) {
        val result = modelMatrix(name, h, true)
        matrices[name] = result.matrix
        models[name] = topkSummary(name, result.matrix, h, result.diagnostics)
    }
    val (walk, weights) = walkForwardReliability(h)
    for (name in MODELS) {
        models[name].mutable()["walk_forward"] = walk[name]
        models[name].mutable()["reliability_weight"] = weights[name]
    }
    val p8 = p8Instinct(h)
    val frozen = p8["fingerprint"]
    val (rawDigits, weightedDigits) = digitConsensus(models, weights)
    val fields =
        linkedMapOf(
            "4d_top3" to listOf(p8["four_d_main"] as String, p8["four_d_reserve"] as String),
            "3d_front_top5" to listOf(p8["three_d_front"] as String),
            "3d_back_top5" to listOf(p8["three_d_back"] as String),
            "2d_front_top5" to listOf(p8["two_d_front"] as String),
            "2d_middle_top5" to listOf(p8["two_d_middle"] as String),
            "2d_back_top5" to listOf(p8["two_d_back"] as String),
        )
    val rankings =
        fields.mapValues { (field, values) -> consensusCandidates(field, models, weights, values) }
    val four = selectFourD(models, weights, p8)
    val three =
        obj(
            "front" to rankings.getValue("3d_front_top5").take(5),
            "back" to rankings.getValue("3d_back_top5").take(5),
        )
    val two =
        obj(
            "front" to rankings.getValue("2d_front_top5").take(5),
            "middle" to rankings.getValue("2d_middle_top5").take(5),
            "back" to rankings.getValue("2d_back_top5").take(5),
            "kembar" to selectKembar(h),
        )
    val weightedRank = weightedDigits.map { it["digit"] as String }
    val rawRank = rawDigits.map { it["digit"] as String }
    val bbfs =
        obj(
            "main6" to weightedRank.take(6).joinToString(""),
            "reserve6" to (weightedRank.take(5) + weightedRank[6]).joinToString(""),
            "main5" to weightedRank.take(5).joinToString(""),
            "reserve5" to (weightedRank.take(4) + weightedRank[5]).joinToString(""),
        )
    val repeatCounts = models["P4"].map()["analysis"].map()["repeat_digit_counts"].map()
    val repeatDigit =
        repeatCounts.keys.maxWith(
            compareBy<String> { repeatCounts[it].int() }.thenBy { -it.toInt() }
        )
    bbfs["repeat_pattern"] =
        repeatDigit.repeat(2) + weightedRank.filter { it != repeatDigit }.joinToString("").take(4)
    val visuals =
        generateVisualPatterns(market, h, target, models["P5"].map()["analysis"].mutable())
    models["P5"].map()["analysis"].mutable()["visual_patterns"] = visuals.patterns
    models["P5"].mutable()["visual_patterns"] = visuals.patterns
    val counts =
        obj(
            "data_4d" to 4,
            "p8_4d" to 2,
            "total_4d_candidates" to 6,
            "data_3d" to 10,
            "p8_3d" to 2,
            "total_3d_candidates" to 12,
            "regular_data_2d" to 15,
            "data_kembar_2d" to 2,
            "p8_2d" to 3,
            "total_2d_candidates" to 20,
            "total_direct_number_candidates" to 38,
            "total_bbfs_scenarios" to 7,
            "total_repeat_digit_signals" to 2,
        )
    val final =
        obj(
            "bbfs" to bbfs,
            "four_d" to four,
            "three_d" to three,
            "two_d" to two,
            "repeat_signal" to obj("data_digit" to repeatDigit, "p8_digit" to p8["repeat_digit"]),
        )
    val quick = LinkedHashMap(final)
    quick["p8_ai_instinct"] = P8_FIELDS.associateWith { p8[it] }
    quick["model_comparison"] =
        MODELS.sortedWith(compareBy<String> { -weights.getValue(it) }.thenBy { it }).map {
            obj("model" to it, "reliability_weight" to weights[it])
        }
    quick["candidate_counts"] = counts
    val prior =
        input.priorArchive
            ?.takeIf { it["target_date"] == latest.date }
            ?.let {
                auditPredictionPayload(it, latest.number).also { audit ->
                    audit["archive_path"] = input.priorArchivePath
                }
            }
    val payload =
        obj(
            "schema_version" to 2,
            "engine" to ENGINE_VERSION,
            "engine_version" to ENGINE_VERSION,
            "market" to market,
            "generated_at" to input.generatedAt,
            "dataset_fingerprint" to datasetFingerprint(market, h),
            "dataset_revision" to datasetRevision(market, h),
            "metadata_revision" to 3,
            "prediction_basis_date" to latest.date,
            "prediction_basis_result" to latest.number,
            "latest_result" to
                obj(
                    "date" to latest.date,
                    "period" to latest.period,
                    "number" to latest.number,
                    "collected_at" to latest.collectedAt,
                ),
            "target_date" to target,
            "target_period" to incrementPeriod(latest.period),
            "dataset" to
                obj("count" to h.size, "first_date" to h.first().date, "last_date" to latest.date),
            "dataset_validation" to validation,
            "prior_prediction_audit" to prior,
            "models" to models,
            "p8_ai_instinct" to p8,
            "raw_consensus" to
                obj(
                    "raw_consensus_digit_ranking" to rawDigits,
                    "digit_ranking" to rawRank,
                    "candidate_rankings" to rankings.mapValues { it.value.sortedWith(RAW_ORDER) },
                    "p8_included" to false,
                ),
            "weighted_consensus" to
                obj(
                    "weighted_consensus_digit_ranking" to weightedDigits,
                    "digit_ranking" to weightedRank,
                    "reliability_weights" to weights,
                    "candidate_rankings" to rankings,
                    "p8_included" to false,
                ),
            "final_candidates" to final,
            "visual_patterns" to visuals.patterns,
            "quick_view" to quick,
            "confidence" to
                obj(
                    "model_confidence" to "RELATIVE",
                    "data_quality" to
                        if (validation["missing_expected_draws"].list().isEmpty()) "HIGH"
                        else "MODERATE",
                    "sample_size" to h.size,
                    "backtest_strength" to rnd(mean(weights.values)),
                    "consensus_strength" to rnd(weights.values.max()),
                    "relative_confidence" to if (mean(weights.values) >= .70) "MODERATE" else "LOW",
                    "disclaimer" to DISCLAIMER,
                ),
            "candidate_counts" to counts,
            "disclaimer" to DISCLAIMER,
        )
    val fingerprint = previous?.get("dataset_fingerprint")
    payload["previous_dataset_fingerprint"] =
        if (!previous.isNullOrEmpty()) {
            if (fingerprint != payload["dataset_fingerprint"]) fingerprint
            else previous["previous_dataset_fingerprint"]
        } else null
    payload["recalculated_after_new_result"] =
        !previous.isNullOrEmpty() && fingerprint != payload["dataset_fingerprint"]
    val oldSections = predictionSections(previous)
    val newSections = predictionSections(payload)
    payload["changed_from_previous"] =
        newSections.mapValues { (key, value) ->
            if (!previous.isNullOrEmpty()) oldSections[key] != value else null
        }
    payload["audit_snapshot"] = compactAuditSnapshot(payload)
    check(p8["fingerprint"] == frozen) { "P8 changed after consensus" }
    return PredictionResult(payload, visuals.svgs, matrices)
}
