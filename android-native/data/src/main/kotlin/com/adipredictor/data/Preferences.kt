package com.adipredictor.data

import kotlinx.serialization.json.*

val notificationDefaults = mapOf("master" to false, "result" to true, "prediction" to true, "liveDraw" to true, "audit" to true, "appUpdate" to true, "collector" to false)
private val deliveredEventsLock = Any()
class Preferences(private val store: Store) {
    fun notifications(): Map<String, Boolean> {
        val value = runCatching { wireJson.parseToJsonElement(store.read("preferences:notifications") ?: "{}") }.getOrNull()
        return notificationDefaults.mapValues { (k, default) -> (value.field(k) as? JsonPrimitive)?.booleanOrNull ?: default }
    }
    fun notifications(values: Map<String, Boolean>) { store.write("preferences:notifications", JsonObject(notificationDefaults.mapValues { (key, default) -> JsonPrimitive(values[key] ?: default) }).toString()) }
    fun get(key: String, default: String): String = store.read("preference:$key") ?: default
    fun set(key: String, value: String) { store.write("preference:$key", value) }
    fun claim(key: String): Boolean = synchronized(deliveredEventsLock) {
        val previous = runCatching { wireJson.parseToJsonElement(store.read("notifications:delivered") ?: "[]").arr().map { it.text() } }.getOrDefault(emptyList())
        if (key in previous) return@synchronized false
        store.write("notifications:delivered", JsonArray((previous + key).takeLast(500).map { JsonPrimitive(it) }).toString())
        true
    }
}
data class Notice(val key: String, val category: String, val title: String, val body: String, val market: String = "HK", val target: String = "Analisis")
fun notices(previous: Snapshot?, current: Snapshot, preferences: Map<String, Boolean>, installedVersion: Int): List<Notice> {
    if (preferences["master"] != true) return emptyList()
    val output = mutableListOf<Notice>()
    if (previous != null) for (market in markets) {
        val old = previous.bundles[market]; val now = current.bundles[market] ?: continue
        val row = now.rows.firstOrNull(); val before = old?.rows?.firstOrNull()
        if (preferences["result"] == true && row != null && Regex("^(confirmed_|official_|primary_source|provisional_primary)", RegexOption.IGNORE_CASE).containsMatchIn(row.wire.string("verification")) && before != null && (row.date != before.date || row.number != before.number))
            output += Notice("RESULT:$market:${row.date}:${row.number}", "result", "$market terbaru: ${row.number}", row.date, market, "Data")
        val p = now.prediction
        if (preferences["prediction"] == true && now.alignment == "MATCH" && old?.prediction != null && p.string("dataset_fingerprint") != old.prediction.string("dataset_fingerprint"))
            output += Notice("PREDICTION:$market:${p.string("target_period")}:${p.string("dataset_fingerprint")}", "prediction", "Prediksi $market sudah siap", p.string("target_date"), market)
        val resolved = now.history.field("records").arr().firstOrNull { it.field("actual_result").string("number").matches(Regex("[0-9]{4}")) }
        val prior = old?.history.field("records").arr().firstOrNull { it.field("actual_result").string("number").matches(Regex("[0-9]{4}")) }
        if (preferences["audit"] == true && resolved != null && resolved != prior)
            output += Notice("AUDIT:$market:${resolved.string("target_date")}:${resolved.field("actual_result").string("number")}", "audit", "Audit $market tersedia", resolved.string("target_date"), market, "Histori")
        val health = current.files["data/collector-status.json"].field("markets").field(market)
        val oldHealth = previous.files["data/collector-status.json"].field("markets").field(market)
        if (preferences["collector"] == true && health.string("status").isNotEmpty() && health.string("status") != oldHealth.string("status"))
            output += Notice("COLLECTOR:$market:${health.string("status")}:${health.string("last_checked_at")}", "collector", "Collector $market: ${health.string("status")}", "Periksa diagnostic sumber", market, "Pengaturan")
    }
    val release = current.files["app-release.json"]
    val code = release.string("version_code").toIntOrNull() ?: 0
    if (preferences["appUpdate"] == true && release.string("channel") == "stable" && release.string("update_channel_ready") == "true" && code > installedVersion)
        output += Notice("UPDATE:$code", "appUpdate", "Versi terbaru tersedia", release.string("version_name"), target = "Pengaturan")
    return output
}

data class MigrationReport(val imported: List<String>, val skipped: List<String>, val errors: List<String>)
// Import only known exported localStorage keys. Never delete or overwrite a newer native cache.
fun migrateLegacy(export: String, store: Store): MigrationReport {
    val parsed = wireJson.parseToJsonElement(export)
    require(parsed is JsonObject) { "INVALID_LEGACY_EXPORT" }
    val value = parsed
    val source = if (value.containsKey("localStorage")) {
        require(value.field("localStorage") is JsonObject) { "INVALID_LOCAL_STORAGE_EXPORT" }
        value.field("localStorage").obj()
    } else value
    val imported = mutableListOf<String>(); val skipped = mutableListOf<String>(); val errors = mutableListOf<String>()
    source.forEach { (key, entry) ->
        val raw = if (entry is JsonPrimitive && entry.isString) entry.content else entry.toString()
        try {
            when {
                key == "adipredictor:notification-preferences:v1" -> {
                    val p = wireJson.parseToJsonElement(raw)
                    require(p is JsonObject) { "INVALID_PREFERENCES" }
                    require(p.values.all { (it as? JsonPrimitive)?.booleanOrNull != null })
                    val known = JsonObject(p.filterKeys { it in notificationDefaults })
                    if (store.read("preferences:notifications") == null) { store.write("preferences:notifications", known.toString()); imported += key } else skipped += key
                }
                key == "adipredictor:delivered-notification-events:v1" -> {
                    val parsedEvents = wireJson.parseToJsonElement(raw)
                    require(parsedEvents is JsonArray && parsedEvents.all { it is JsonPrimitive && it.isString && it.content.isNotBlank() && it.content.length <= 512 }) { "INVALID_DELIVERED_EVENTS" }
                    val incoming = parsedEvents.map { it.text() }
                    synchronized(deliveredEventsLock) {
                        val old = wireJson.parseToJsonElement(store.read("notifications:delivered") ?: "[]").arr().map { it.text() }
                        // Imported history must not evict more recent native claims.
                        val merged = (incoming.filterNot { it in old } + old).distinct().takeLast(500)
                        store.write("notifications:delivered", JsonArray(merged.map { JsonPrimitive(it) }).toString())
                    }
                    imported += key
                }
                key.startsWith("CANONICAL_CACHE_V1:") -> {
                    val path = key.removePrefix("CANONICAL_CACHE_V1:")
                    require(Regex("(data/(hk|sdy|sgp)\\.json|predictions/(hk|sdy|sgp)/latest\\.json)").matches(path))
                    val wrapper = wireJson.parseToJsonElement(raw)
                    require(wrapper.field("meta").string("source") == "REMOTE")
                    val data = wrapper.field("data") ?: error("NO_DATA")
                    val market = path.split('/')[1].removeSuffix(".json").uppercase()
                    if (path.startsWith("data/")) require(dataset(data).all { it.wire.string("market").ifEmpty { market } == market })
                    else require(data.string("market") == market && data.field("final_candidates") is JsonObject && data.string("dataset_fingerprint").matches(Regex("[a-f0-9]{64}")))
                    val prior = store.read("canonical:$path")?.let { wireJson.parseToJsonElement(it) }
                    // Equal latest draw does not prove an older exported whole
                    // dataset is the current revision. Retain native on ambiguity.
                    val ambiguousRevision = prior != null && head(data) == head(prior) && data != prior &&
                        (path.startsWith("data/") || (data.string("metadata_revision").toIntOrNull() ?: 0) <= (prior.string("metadata_revision").toIntOrNull() ?: 0))
                    if (prior == null || !regression(data, prior) && !ambiguousRevision) { store.write("canonical:$path", data.toString()); imported += key } else skipped += key
                }
                key == "HK_LAST_VERIFIED_BOARD" -> {
                    val board = wireJson.parseToJsonElement(raw)
                    require(board.string("market").ifEmpty { "HK" } == "HK") { "RUNTIME_MARKET_MISMATCH" }
                    require(board.string("first").matches(Regex("[0-9]{6}")))
                    require(board.string("derived_4d").ifEmpty { board.string("first").takeLast(4) } == board.string("first").takeLast(4)) { "RUNTIME_DERIVATION_MISMATCH" }
                    java.time.LocalDate.parse(board.string("draw_date"))
                    val prior = store.read("legacy:runtime:HK")?.let { wireJson.parseToJsonElement(it) }
                    if (prior == null || board.string("draw_date") > prior.string("draw_date")) {
                        store.write("legacy:runtime:HK", JsonObject(board.obj() + ("derived_4d" to JsonPrimitive(board.string("first").takeLast(4)))).toString()); imported += key
                    } else skipped += key
                }
                else -> skipped += key // Runtime boards remain separate and are not canonicalized.
            }
        } catch (e: Exception) { errors += "$key:${e.message}" }
    }
    return MigrationReport(imported, skipped, errors)
}
