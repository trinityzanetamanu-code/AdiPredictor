package com.adipredictor.data

import java.security.MessageDigest
import java.time.LocalDate
import kotlinx.serialization.json.*

val wireJson = Json { ignoreUnknownKeys = true }
fun JsonElement?.obj(): JsonObject = this as? JsonObject ?: JsonObject(emptyMap())
fun JsonElement?.arr(): JsonArray = this as? JsonArray ?: JsonArray(emptyList())
fun JsonElement?.text(): String = (this as? JsonPrimitive)?.contentOrNull ?: ""
fun JsonElement?.field(key: String): JsonElement? = obj()[key]
fun JsonElement?.string(key: String): String = field(key).text()
fun sha256(value: String): String = MessageDigest.getInstance("SHA-256").digest(value.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
val markets = listOf("HK", "SDY", "SGP")

data class Draw(val date: String, val number: String, val period: String, val wire: JsonObject)
fun dataset(value: JsonElement): List<Draw> {
    require(value is JsonArray && value.isNotEmpty()) { "DATASET_EMPTY_OR_INVALID" }
    val rows = value.map {
        val date = it.string("result_date")
        LocalDate.parse(date)
        val number = it.string("nomor")
        require(number.matches(Regex("[0-9]{4}"))) { "INVALID_NUMBER" }
        Draw(date, number, it.string("periode"), it.obj())
    }
    require(rows.map { it.date }.distinct().size == rows.size) { "DUPLICATE_OR_CONFLICTING_DRAW" }
    return rows.sortedByDescending { it.date }
}
fun revision(market: String, rows: List<Draw>, engine: String? = null): String {
    require(market in markets && rows.isNotEmpty())
    val material = market + "|" + rows.sortedBy { it.date }.joinToString("|") { "${it.date}:${it.number}" }
    return sha256(if (engine == null) material else "$engine|$material")
}
fun alignment(market: String, rows: List<Draw>, p: JsonElement?): String {
    if (p == null || rows.isEmpty()) return "DATASET_VERSION_UNAVAILABLE"
    if (p.string("market") != market) return "MARKET_MISMATCH"
    val actual = p.string("dataset_revision")
    val aligned = if (actual.isNotEmpty()) actual == revision(market, rows)
    else if (p.string("engine_version").ifEmpty { p.string("engine") } == "AdiPredictor-P1-P8-v2")
        p.string("dataset_fingerprint") == revision(market, rows, "AdiPredictor-P1-P8-v2") else false
    if (!aligned) return "DATASET_VERSION_MISMATCH"
    val fingerprint = p.string("dataset_fingerprint")
    val engine = p.string("engine_version").ifEmpty { p.string("engine") }
    if (fingerprint.isNotEmpty() && (engine != "AdiPredictor-P1-P8-v2" || fingerprint != revision(market, rows, engine))) return "DATASET_FINGERPRINT_MISMATCH"
    if (p.string("prediction_basis_date") != rows.first().date || p.string("prediction_basis_result") != rows.first().number)
        return "BASIS_MISMATCH"
    if (p.string("target_date") <= rows.first().date) return "TARGET_NOT_AFTER_BASIS"
    return "MATCH"
}
fun head(value: JsonElement?): Pair<String, String> = when (value) {
    is JsonArray -> value.firstOrNull().let { it.string("result_date") to it.string("nomor") }
    else -> value.field("latest_result").let { it.string("date") to it.string("number") }
}
fun regression(incoming: JsonElement, old: JsonElement): Boolean {
    val (date, number) = head(incoming); val (oldDate, oldNumber) = head(old)
    return oldDate.isNotEmpty() && (date < oldDate || date == oldDate && (number != oldNumber ||
        (incoming.string("metadata_revision").toIntOrNull() ?: 0) < (old.string("metadata_revision").toIntOrNull() ?: 0)))
}
fun archivePath(market: String, record: JsonElement): String {
    require(market in markets && record.string("market").ifEmpty { market } == market)
    val date = record.string("target_date"); LocalDate.parse(date)
    val expected = "predictions/${market.lowercase()}/archive/$date.json"
    val supplied = record.string("archive_path").removePrefix("public/").removePrefix("/")
    require(supplied.isEmpty() || supplied == expected) { "INVALID_ARCHIVE_PATH" }
    return expected
}
fun validateArchive(market: String, record: JsonElement, archive: JsonElement) {
    require(archive.string("market") == market && archive.string("target_date") == record.string("target_date")) { "ARCHIVE_IDENTITY_MISMATCH" }
    for (field in listOf("target_period", "dataset_fingerprint")) {
        require(record.string(field).isEmpty() || record.string(field) == archive.string(field)) { "ARCHIVE_${field.uppercase()}_MISMATCH" }
    }
}
fun svgPath(market: String, date: String, path: String): String {
    LocalDate.parse(date); require(market in markets)
    val normalized = path.removePrefix("public/").removePrefix("/")
    require(Regex("predictions/${market.lowercase()}/visuals/$date/pattern-[0-9]{2}\\.svg").matches(normalized)) { "SVG_ARCHIVE_PATH_MISMATCH" }
    return normalized
}
fun digitCounts(rows: List<Draw>): List<Int> = List(10) { digit -> rows.sumOf { row -> row.number.count { it == ('0' + digit) } } }
fun searchRows(rows: List<Draw>, query: String, from: String = "", to: String = ""): List<Draw> = rows.filter {
    (query.isBlank() || "${it.date} ${it.number} ${it.period}".contains(query.trim(), true)) &&
        (from.isEmpty() || it.date >= from) && (to.isEmpty() || it.date <= to)
}
fun searchTafsir(items: JsonElement?, query: String): List<JsonElement> = (if (items is JsonArray) items else items.field("items")).arr().filter {
    query.isBlank() || "${it.string("kataKunci")} ${it.string("angka")} ${it.string("deskripsi")}".contains(query.trim(), true)
}
