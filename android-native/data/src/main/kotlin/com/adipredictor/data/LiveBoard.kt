package com.adipredictor.data

import java.time.LocalDate
import java.time.Month
import java.time.format.TextStyle
import java.util.Locale
import kotlinx.serialization.json.*

private fun plain(html: String) = html.replace(Regex("<(script|style)\\b[^>]*>[\\s\\S]*?</\\1>", RegexOption.IGNORE_CASE), " ")
    .replace(Regex("<[^>]+>"), " ").replace(Regex("&nbsp;|&#160;", RegexOption.IGNORE_CASE), " ").replace("&amp;", "&").replace(Regex("\\s+"), " ").trim()
fun boardDate(html: String): String {
    val text = plain(html)
    val months = Month.entries.associate { it.getDisplayName(TextStyle.SHORT, Locale.ENGLISH).lowercase() to it.value }
    val monthFirst = Regex("(January|February|March|April|May|June|July|August|September|October|November|December)\\s+(\\d{1,2})\\s*,?\\s+(\\d{4})", RegexOption.IGNORE_CASE).find(text)
    if (monthFirst != null) return LocalDate.of(monthFirst.groupValues[3].toInt(), months.getValue(monthFirst.groupValues[1].take(3).lowercase()), monthFirst.groupValues[2].toInt()).toString()
    val dayFirst = Regex("(\\d{1,2})\\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\\s+(\\d{4})", RegexOption.IGNORE_CASE).find(text)
    if (dayFirst != null) return LocalDate.of(dayFirst.groupValues[3].toInt(), months.getValue(dayFirst.groupValues[2].lowercase()), dayFirst.groupValues[1].toInt()).toString()
    val iso = Regex("(?<!\\d)(\\d{4})[-/](\\d{1,2})[-/](\\d{1,2})(?!\\d)").find(text)
    if (iso != null) return LocalDate.of(iso.groupValues[1].toInt(), iso.groupValues[2].toInt(), iso.groupValues[3].toInt()).toString()
    val numeric = Regex("(?<!\\d)(\\d{1,2})[-/](\\d{1,2})[-/](\\d{4})(?!\\d)").find(text) ?: error("DATE_NOT_FOUND")
    return LocalDate.of(numeric.groupValues[3].toInt(), numeric.groupValues[2].toInt(), numeric.groupValues[1].toInt()).toString()
}
private fun sixDigitNumbers(fragment: String): List<String> {
    val values = Regex("(?<!\\d)[0-9]{6}(?!\\d)").findAll(plain(fragment)).map { it.value }.toMutableList()
    val digits = Regex("<img\\b[^>]*>", RegexOption.IGNORE_CASE).findAll(fragment).mapNotNull { match ->
        fun attr(name: String) = Regex("$name\\s*=\\s*[\"']([^\"']*)[\"']", RegexOption.IGNORE_CASE).find(match.value)?.groupValues?.get(1) ?: ""
        listOf(attr("data-digit"), attr("alt"), attr("title")).firstOrNull { it.trim().matches(Regex("[0-9]")) }?.trim()
            ?: Regex("(?:^|[_-])([0-9])(?:\\.[a-z0-9]+)(?:\\?.*)?$", RegexOption.IGNORE_CASE).find(attr("src").substringAfterLast('/'))?.groupValues?.get(1)
    }.toList()
    values += digits.chunked(6).filter { it.size == 6 }.map { it.joinToString("") }
    values += plain(fragment).split(' ').filter { it.matches(Regex("[0-9]")) }.chunked(6).filter { it.size == 6 }.map { it.joinToString("") }
    return values.distinct()
}
fun parseLiveBoard(html: String, market: String, source: String, partial: Boolean = market == "HK"): JsonObject {
    require(market == "HK" || market == "SDY")
    check(html.isNotBlank()) { "TABLE_NOT_FOUND" }
    check(!Regex("cf-mitigated|challenge-platform|<title>\\s*Just a moment|melakukan verifikasi keamanan", RegexOption.IGNORE_CASE).containsMatchIn(html)) { "CHALLENGE_REQUIRED" }
    val labels = linkedMapOf("first" to "\\b(?:1st|first)\\s*prize\\b", "second" to "\\b(?:2nd|second)\\s*prize\\b", "third" to "\\b(?:3rd|third)\\s*prize\\b", "starter" to "\\bstarter\\s*(?:prize)?\\b", "consolation" to "\\bconsolation\\s*(?:prize)?\\b")
    val buckets = labels.keys.associateWith { mutableListOf<String>() }
    val rows = Regex("<tr\\b[^>]*>([\\s\\S]*?)</tr>", RegexOption.IGNORE_CASE).findAll(html).map { it.groupValues[1] }.toList()
    var active: String? = null
    for (row in rows) {
        val matched = labels.filterValues { Regex(it, RegexOption.IGNORE_CASE).containsMatchIn(plain(row)) }.keys
        if (matched.size == 1) { val key = matched.first(); buckets.getValue(key) += sixDigitNumbers(row); active = key.takeIf { it == "starter" || it == "consolation" } }
        else if (matched.isEmpty() && active != null) buckets.getValue(active) += sixDigitNumbers(row)
    }
    if (rows.isEmpty()) labels.forEach { (key, label) ->
        val fragment = Regex("$label([\\s\\S]{0,1200})", RegexOption.IGNORE_CASE).find(html)?.groupValues?.get(1) ?: ""
        val boundary = Regex(labels.filterKeys { it != key }.values.joinToString("|"), RegexOption.IGNORE_CASE).find(fragment)?.range?.first ?: fragment.length
        buckets.getValue(key) += sixDigitNumbers(fragment.take(boundary))
    }
    val complete = buckets.values.all { it.isNotEmpty() }
    check(partial || complete) { "BOARD_VALIDATION_FAILED" }
    val date = boardDate(html); val first = buckets.getValue("first").firstOrNull() ?: ""
    return JsonObject(buildMap {
        put("market", JsonPrimitive(market)); put("source_url", JsonPrimitive(source)); put("draw_date", JsonPrimitive(date))
        listOf("first", "second", "third").forEach { put(it, JsonPrimitive(buckets.getValue(it).firstOrNull() ?: "")) }
        listOf("starter", "consolation").forEach { put(it, JsonArray(buckets.getValue(it).distinct().map(::JsonPrimitive))) }
        put("derived_4d", JsonPrimitive(first.takeLast(4))); put("full_first_prize_6d", JsonPrimitive(first))
        put("result_status", JsonPrimitive(if (complete) "unknown" else "partial")); put("finality_evidence", JsonNull)
        put("verification", JsonPrimitive("structurally_valid_single_source"))
    })
}
fun runtimeGuard(rows: List<Draw>, board: JsonElement?): String? {
    if (rows.isEmpty() || board == null || !board.string("derived_4d").matches(Regex("[0-9]{4}"))) return null
    val latest = rows.first(); val date = board.string("draw_date")
    return when { date > latest.date -> "RUNTIME_RESULT_AHEAD_CANONICAL"; date == latest.date && board.string("derived_4d") != latest.number -> "RUNTIME_DRAW_CONFLICT"; else -> null }
}
