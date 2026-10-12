package adipredictor.core

val AUDIT_MODEL_FIELDS =
    listOf(
        "bbfs6",
        "bbfs5",
        "4d_top3",
        "3d_front_top5",
        "3d_back_top5",
        "2d_front_top5",
        "2d_middle_top5",
        "2d_back_top5",
    )
val P8_FIELDS =
    listOf(
        "bbfs6",
        "bbfs5",
        "four_d_main",
        "four_d_reserve",
        "three_d_front",
        "three_d_back",
        "two_d_front",
        "two_d_middle",
        "two_d_back",
        "repeat_digit",
    )

fun extractNumber(value: Any?): Any? = if (value is Map<*, *>) value["number"] else value

fun auditMatch(actual: String, value: Any?): Obj {
    val candidate = if (truth(value)) pyString(value) else ""
    val exact = candidate == actual
    val permutation =
        candidate.length == actual.length &&
            candidate != actual &&
            candidate.toList().sorted() == actual.toList().sorted()
    return obj(
        "candidate" to candidate.ifEmpty { null },
        "exact" to exact,
        "permutation" to permutation,
        "status" to if (exact) "EXACT" else if (permutation) "PERMUTATION" else "MISS",
    )
}

fun auditList(actual: String, candidates: Any?, allowReverse: Boolean = false): Obj {
    val values = candidates.list().map(::extractNumber)
    val exact = actual in values
    val reverse =
        if (allowReverse)
            values.filter { pyString(it) == actual.reversed() && pyString(it) != actual }
        else emptyList()
    val permutation =
        if (!allowReverse)
            values.filter {
                pyString(it) != actual &&
                    pyString(it).length == actual.length &&
                    pyString(it).toList().sorted() == actual.toList().sorted()
            }
        else emptyList()
    return obj(
        "actual" to actual,
        "candidates" to values,
        "exact" to exact,
        "exact_candidates" to values.filter { pyString(it) == actual },
        "reverse" to (reverse.isNotEmpty() && !exact),
        "reverse_candidates" to reverse,
        "permutation" to permutation.isNotEmpty(),
        "permutation_candidates" to permutation,
        "status" to
            if (exact) "EXACT"
            else if (reverse.isNotEmpty()) "REVERSE"
            else if (permutation.isNotEmpty()) "PERMUTATION" else "MISS",
    )
}

fun bbfsAudit(actual: String, bbfs: Any?): Obj {
    val digits = (if (truth(bbfs)) pyString(bbfs) else "").toSet()
    val distinct = actual.toSet()
    val captured = actual.count { it in digits }
    val full = digits.containsAll(distinct)
    return obj(
        "bbfs" to bbfs,
        "distinct_digits_captured" to distinct.intersect(digits).sorted().map(Char::toString),
        "distinct_digits_missed" to distinct.minus(digits).sorted().map(Char::toString),
        "occurrence_coverage" to
            obj("captured" to captured, "total" to 4, "rate" to rnd(captured / 4.0)),
        "full_draw_coverage" to full,
        "status" to if (full) "FULL" else "PARTIAL",
    )
}

fun repeatSignalAudit(actual: String, value: Any?): Obj {
    val digit = if (truth(value)) pyString(value) else ""
    val occurrences = if (digit.length == 1) actual.count { it == digit[0] } else 0
    return obj(
        "digit" to digit.ifEmpty { null },
        "actual_occurrences" to occurrences,
        "hit" to (occurrences > 0),
        "status" to if (occurrences > 0) "DIGIT_APPEARED" else "MISS",
        "definition" to
            "Signal digit repeat dianggap tembus bila digit muncul minimal satu kali pada draw aktual.",
    )
}

fun kembarCandidateAudit(actual: String, value: Any?): Obj {
    val candidate = if (truth(value)) pyString(value) else ""
    val front = actual.take(2) == candidate
    val middle = actual.substring(1, 3) == candidate
    val back = actual.takeLast(2) == candidate
    val any = front || middle || back
    return obj(
        "candidate" to candidate.ifEmpty { null },
        "front" to front,
        "middle" to middle,
        "back" to back,
        "any_position" to any,
        "status" to if (any) "EXACT" else "MISS",
    )
}

fun compactAuditSnapshot(prediction: Map<String, Any?>): Obj {
    val models = obj()
    for (name in MODELS) {
        val source = prediction["models"].map()[name].map()
        if (AUDIT_MODEL_FIELDS.all { it in source })
            models[name] = AUDIT_MODEL_FIELDS.associateWith { source[it] }
    }
    val visuals =
        prediction["visual_patterns"].list().map { pattern ->
            val p = pattern.map()
            obj(
                "pattern_name" to p["pattern_name"],
                "visual_predictive_edge_confirmed" to
                    p.getOrDefault("visual_predictive_edge_confirmed", false),
                "target_signal" to p["target_signal"],
            )
        }
    val final =
        (if (truth(prediction["final_candidates"])) prediction["final_candidates"]
            else prediction["quick_view"])
            .map()
    return obj(
        "snapshot_version" to 1,
        "created_before_result" to true,
        "models" to models,
        "p8_ai_instinct" to prediction.getOrDefault("p8_ai_instinct", obj()),
        "final_candidates" to
            listOf("bbfs", "four_d", "three_d", "two_d", "repeat_signal").associateWith {
                final.getOrDefault(it, obj())
            },
        "visual_patterns" to visuals,
    )
}

fun firstAuditCandidate(item: Map<String, Any?>): Any? =
    listOf("exact_candidates", "reverse_candidates", "permutation_candidates")
        .firstNotNullOfOrNull { key -> item[key].list().firstOrNull() }

fun modelOutcomeAudit(snapshot: Map<String, Any?>, actual: String): Obj {
    val output = obj()
    for (name in MODELS) {
        val model = snapshot["models"].map()[name].map()
        if (model.isEmpty() || !AUDIT_MODEL_FIELDS.all { it in model }) {
            output[name] =
                obj(
                    "available" to false,
                    "reason" to "AUDIT MODEL RINCI TIDAK TERSEDIA PADA ARSIP LAMA",
                )
            continue
        }
        val audits =
            obj(
                "available" to true,
                "bbfs6" to bbfsAudit(actual, model["bbfs6"]),
                "bbfs5" to bbfsAudit(actual, model["bbfs5"]),
                "4d_top3" to auditList(actual, model["4d_top3"]),
                "3d_front_top5" to auditList(actual.take(3), model["3d_front_top5"]),
                "3d_back_top5" to auditList(actual.takeLast(3), model["3d_back_top5"]),
                "2d_front_top5" to auditList(actual.take(2), model["2d_front_top5"], true),
                "2d_middle_top5" to
                    auditList(actual.substring(1, 3), model["2d_middle_top5"], true),
                "2d_back_top5" to auditList(actual.takeLast(2), model["2d_back_top5"], true),
            )
        val direct =
            listOf(
                    "4d_top3",
                    "3d_front_top5",
                    "3d_back_top5",
                    "2d_front_top5",
                    "2d_middle_top5",
                    "2d_back_top5",
                )
                .mapNotNull { field ->
                    val item = audits[field].map()
                    if (item["status"] != "MISS")
                        obj(
                            "field" to field,
                            "status" to item["status"],
                            "candidate" to firstAuditCandidate(item),
                        )
                    else null
                }
        val coverage =
            listOf("bbfs6", "bbfs5").filter { audits[it].map()["full_draw_coverage"] == true }
        audits["model_summary"] =
            obj("direct_number_hits" to direct, "support_coverage_hits" to coverage)
        output[name] = audits
    }
    return output
}

fun p8OutcomeAudit(snapshot: Map<String, Any?>, actual: String): Obj {
    val p8 = snapshot["p8_ai_instinct"].map()
    if (!P8_FIELDS.all { it in p8 })
        return obj("available" to false, "reason" to "AUDIT P8 TIDAK TERSEDIA PADA ARSIP LAMA")
    return obj(
        "available" to true,
        "bbfs6" to bbfsAudit(actual, p8["bbfs6"]),
        "bbfs5" to bbfsAudit(actual, p8["bbfs5"]),
        "4d_main" to auditMatch(actual, p8["four_d_main"]),
        "4d_reserve" to auditMatch(actual, p8["four_d_reserve"]),
        "3d_front" to auditMatch(actual.take(3), p8["three_d_front"]),
        "3d_back" to auditMatch(actual.takeLast(3), p8["three_d_back"]),
        "2d_front" to auditList(actual.take(2), listOf(p8["two_d_front"]), true),
        "2d_middle" to auditList(actual.substring(1, 3), listOf(p8["two_d_middle"]), true),
        "2d_back" to auditList(actual.takeLast(2), listOf(p8["two_d_back"]), true),
        "repeat_digit" to repeatSignalAudit(actual, p8["repeat_digit"]),
        "statistical_consensus_member" to false,
    )
}

fun visualOutcomeAudit(snapshot: Map<String, Any?>, actual: String): List<Obj> =
    snapshot["visual_patterns"].list().map { value ->
        val pattern = value.map()
        val signal = pattern["target_signal"].map()
        val predicted = signal["predicted_values"].list()
        if (signal.isEmpty() || predicted.isEmpty())
            obj(
                "pattern_name" to pattern["pattern_name"],
                "target_signal" to pattern["target_signal"],
                "actual" to actual,
                "status" to "VISUAL_ONLY_NO_TARGET",
                "matched_positions" to emptyList<String>(),
                "hit_count" to 0,
                "reason" to "SINYAL TARGET POLA VISUAL TIDAK TERSIMPAN PADA VERSI INI",
            )
        else {
            val matches =
                predicted.mapNotNull { v ->
                    val p = v.map()
                    val index = p["position_index"].int()
                    if (index in actual.indices && actual[index].toString() == pyString(p["digit"]))
                        p["position"]
                    else null
                }
            obj(
                "pattern_name" to pattern["pattern_name"],
                "target_signal" to pattern["target_signal"],
                "actual" to actual,
                "status" to
                    if (matches.size == predicted.size) "EXACT"
                    else if (matches.isNotEmpty()) "PARTIAL" else "MISS",
                "matched_positions" to matches,
                "hit_count" to matches.size,
                "visual_predictive_edge_confirmed" to
                    pattern.getOrDefault("visual_predictive_edge_confirmed", false),
            )
        }
    }

fun auditPredictionPayload(prediction: Map<String, Any?>, actual: String): Obj {
    val snapshot =
        if (truth(prediction["audit_snapshot"])) prediction["audit_snapshot"].map()
        else compactAuditSnapshot(prediction)
    val final = snapshot["final_candidates"].map()
    val four = final["four_d"].map()
    val three = final["three_d"].map()
    val two = final["two_d"].map()
    val bbfs = final["bbfs"].map()
    val kembar = two["kembar"].map()
    val repeat = final["repeat_signal"].map()
    val output =
        obj(
            "target_date" to prediction["target_date"],
            "archive_generated_at" to prediction["generated_at"],
            "actual" to actual,
        )
    for (slot in listOf("main", "alternative", "reserve", "single_pair")) output[
        "previous_4d_$slot"] = auditMatch(actual, extractNumber(four[slot]))
    output.putAll(
        obj(
            "3d_front" to auditList(actual.take(3), three["front"]),
            "3d_back" to auditList(actual.takeLast(3), three["back"]),
            "2d_front" to auditList(actual.take(2), two["front"], true),
            "2d_middle" to auditList(actual.substring(1, 3), two["middle"], true),
            "2d_back" to auditList(actual.takeLast(2), two["back"], true),
            "bbfs6" to bbfsAudit(actual, bbfs["main6"]),
            "bbfs5" to bbfsAudit(actual, bbfs["main5"]),
            "kembar" to
                obj(
                    "main" to kembarCandidateAudit(actual, kembar["main"]),
                    "reserve" to kembarCandidateAudit(actual, kembar["reserve"]),
                ),
            "repeat_signals" to
                obj(
                    "data_model" to repeatSignalAudit(actual, repeat["data_digit"]),
                    "p8" to repeatSignalAudit(actual, repeat["p8_digit"]),
                ),
            "models" to modelOutcomeAudit(snapshot, actual),
            "p8" to p8OutcomeAudit(snapshot, actual),
            "visual_patterns" to visualOutcomeAudit(snapshot, actual),
            "audit_snapshot_version" to snapshot["snapshot_version"],
            "created_before_result" to snapshot.getOrDefault("created_before_result", false),
            "definitions" to
                obj(
                    "exact" to "Same digits in the same order.",
                    "reverse" to "2D reverse is never exact.",
                    "permutation" to "Same digit multiset in another order is never exact.",
                ),
        )
    )
    val slots =
        linkedMapOf(
            "4D MAIN" to "previous_4d_main",
            "4D ALTERNATIF" to "previous_4d_alternative",
            "4D CADANGAN" to "previous_4d_reserve",
            "4D SINGLE PAIR" to "previous_4d_single_pair",
            "3D DEPAN" to "3d_front",
            "3D BELAKANG" to "3d_back",
            "2D DEPAN" to "2d_front",
            "2D TENGAH" to "2d_middle",
            "2D BELAKANG" to "2d_back",
        )
    val hits =
        slots.mapNotNull { (label, key) ->
            val entry = output[key].map()
            if (entry["status"] != "MISS")
                obj(
                    "category" to label,
                    "candidate" to (firstAuditCandidate(entry) ?: entry["candidate"]),
                    "status" to entry["status"],
                )
            else null
        }
    output["summary"] =
        obj(
            "direct_number_hits" to hits,
            "support_coverage_hits" to
                listOf("bbfs6", "bbfs5")
                    .filter { output[it].map()["full_draw_coverage"] == true }
                    .map(String::uppercase),
            "ambiguous_direct_hit_removed" to true,
        )
    return output
}

fun historyHitSummary(audit: Map<String, Any?>?): Obj? {
    if (audit.isNullOrEmpty()) return null
    val direct = audit["summary"].map().getOrDefault("direct_number_hits", emptyList<Any?>())
    return obj(
        "4d" to
            listOf("main", "alternative", "reserve", "single_pair").associateWith {
                audit["previous_4d_$it"].map().getOrDefault("exact", false)
            },
        "3d" to
            obj(
                "front_exact" to audit["3d_front"].map().getOrDefault("exact", false),
                "back_exact" to audit["3d_back"].map().getOrDefault("exact", false),
            ),
        "2d" to
            listOf("front", "middle", "back").associateWith {
                val a = audit["2d_$it"].map()
                obj(
                    "exact" to a.getOrDefault("exact", false),
                    "reverse" to a.getOrDefault("reverse", false),
                )
            },
        "bbfs6_full_coverage" to audit["bbfs6"].map().getOrDefault("full_draw_coverage", false),
        "bbfs5_full_coverage" to audit["bbfs5"].map().getOrDefault("full_draw_coverage", false),
        "direct_number_hits" to direct,
        "support_coverage_hits" to
            audit["summary"].map().getOrDefault("support_coverage_hits", emptyList<Any?>()),
        "direct_number_hit_count" to direct.list().size,
    )
}

fun historyRecord(
    market: String,
    prediction: Map<String, Any?>,
    actual: Draw? = null,
    archivePath: String? = null,
): Obj {
    val quick = prediction["quick_view"].map()
    val basis = prediction["latest_result"].map()
    val audit = actual?.let { auditPredictionPayload(prediction, it.number) }
    val out = obj("market" to market)
    for (key in listOf("target_date", "target_period", "generated_at")) out[key] = prediction[key]
    // Match Python's insertion order too: unchanged history files must remain byte-identical.
    out["engine_version"] = prediction.getOrDefault("engine_version", prediction["engine"])
    out["schema_version"] = prediction.getOrDefault("schema_version", 1)
    for (key in
        listOf(
            "dataset_fingerprint",
            "previous_dataset_fingerprint",
            "recalculated_after_new_result",
            "changed_from_previous",
        )) out[key] = prediction[key]
    out.putAll(
        obj(
            "basis_latest_date" to basis["date"],
            "basis_latest_result" to basis["number"],
            "bbfs6" to quick["bbfs"].map()["main6"],
            "bbfs5" to quick["bbfs"].map()["main5"],
            "four_d" to quick.getOrDefault("four_d", obj()),
            "three_d" to quick.getOrDefault("three_d", obj()),
            "two_d" to quick.getOrDefault("two_d", obj()),
            "p8_ai_instinct" to prediction.getOrDefault("p8_ai_instinct", obj()),
            "actual_result" to
                actual?.let {
                    obj("date" to it.date, "period" to it.period, "number" to it.number)
                },
            "previous_prediction_audit" to prediction["prior_prediction_audit"],
            "outcome_audit" to audit,
            "hit_miss_summary" to historyHitSummary(audit),
            "detailed_model_audit_available" to
                (audit != null &&
                    audit["models"].map().values.any { truth(it.map()["available"]) }),
            "archive_path" to archivePath,
        )
    )
    return out
}

/** Pure equivalent of update_history_index; adapters supply readable archives only. */
fun historyIndex(market: String, history: History, archives: Map<String, Map<String, Any?>>): Obj {
    val actualByDate = history.associateBy { it.date }
    val records =
        archives
            .toSortedMap(reverseOrder())
            .mapNotNull { (path, prediction) ->
                val target = prediction["target_date"] as? String
                if (target.isNullOrEmpty()) null
                else historyRecord(market, prediction, actualByDate[target], path)
            }
            .sortedWith(
                compareByDescending<Obj> { it["target_date"] as? String ?: "" }
                    .thenByDescending { it["generated_at"] as? String ?: "" }
            )
    return obj(
        "schema_version" to 2,
        "index_engine" to ENGINE_VERSION,
        "market" to market,
        "count" to records.size,
        "records" to records,
    )
}
