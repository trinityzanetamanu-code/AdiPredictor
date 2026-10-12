package com.adipredictor.data

import kotlinx.serialization.json.*

// Presentation of already-published rankings; never recompute voting or alter Main.
fun consensusTie(prediction: JsonElement?): JsonObject? {
    val rankings = prediction.field("weighted_consensus").field("candidate_rankings").field("4d_top3").arr()
    val leader = rankings.firstOrNull() ?: return null
    val score = leader.string("reliability_weighted_score").toDoubleOrNull() ?: return null
    fun support(item: JsonElement) = item.string("raw_support_count").toIntOrNull() ?: item.field("supported_by").arr().size
    val count = support(leader)
    val tied = rankings.filter { it.string("reliability_weighted_score").toDoubleOrNull() == score && support(it) == count }
    if (tied.size < 2) return null
    val models = prediction.field("models")
    return JsonObject(mapOf("score" to JsonPrimitive(score), "supportCount" to JsonPrimitive(count), "selected" to JsonPrimitive(leader.string("number")),
        "tieBreakRule" to JsonPrimitive("NUMBER_ASCENDING"), "modelRankAffectsScore" to JsonPrimitive(false),
        "candidates" to JsonArray(tied.map { candidate ->
            JsonObject(mapOf("number" to JsonPrimitive(candidate.string("number")), "modelRanks" to JsonObject(candidate.field("supported_by").arr().associate { name ->
                val rank = models.field(name.text()).field("4d_top3").arr().indexOfFirst { it.text() == candidate.string("number") }
                name.text() to if (rank < 0) JsonNull else JsonPrimitive(rank + 1)
            })))
        })))
}
