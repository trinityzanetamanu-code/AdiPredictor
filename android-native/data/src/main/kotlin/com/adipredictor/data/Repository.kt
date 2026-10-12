package com.adipredictor.data

import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.*

interface Store { fun read(key: String): String?; fun write(key: String, value: String) }
fun interface Transport { suspend fun get(path: String): String }
data class Observation(val origin: String, val reason: String = "", val checkedAt: String = "")
data class Bundle(val rows: List<Draw> = emptyList(), val prediction: JsonElement? = null,
    val alignment: String = "DATASET_VERSION_UNAVAILABLE", val history: JsonElement? = null)
data class Snapshot(val bundles: Map<String, Bundle> = emptyMap(), val files: Map<String, JsonElement> = emptyMap(),
    val observations: Map<String, Observation> = emptyMap(), val refreshing: Boolean = false, val checkedAt: String = "")

class Repository(private val remote: Transport, private val store: Store, private val fallback: Transport? = null,
    private val clock: () -> String = { java.time.Instant.now().toString() }) {
    private val mutex = Mutex()
    private val retained = mutableMapOf<String, JsonElement>()
    private val _state = MutableStateFlow(Snapshot())
    val state: StateFlow<Snapshot> = _state.asStateFlow()
    init {
        // A process restart rebuilds alignment from retained complete datasets.
        val files = mutableMapOf<String, JsonElement>(); val observations = mutableMapOf<String, Observation>()
        paths().forEach { path -> runCatching { store.read("canonical:$path")?.let { wireJson.parseToJsonElement(it) } }.getOrNull()?.let {
            if (valid(path, it)) { retained[path] = it; files[path] = it; observations[path] = Observation("CACHE") }
        } }
        _state.value = assemble(files, observations)
    }
    private fun paths(): List<String> = markets.flatMap { listOf("data/${it.lowercase()}.json", "predictions/${it.lowercase()}/latest.json", "predictions/${it.lowercase()}/history.json") } +
        listOf("data/live-draw.json", "data/collector-status.json", "data/singapore-official.json", "data/tafsir.json", "app-release.json")
    private fun valid(path: String, value: JsonElement): Boolean = runCatching {
        val market = markets.find { path == "data/${it.lowercase()}.json" }
        if (market != null) { dataset(value).forEach { require(it.wire.string("market").ifEmpty { market } == market) } }
        else if (path.endsWith("/latest.json")) {
            require(value.string("market").lowercase() == path.split('/')[1])
            require(value.field("final_candidates") is JsonObject && value.string("dataset_fingerprint").matches(Regex("[a-f0-9]{64}")))
        } else require(value is JsonObject || value is JsonArray)
        true
    }.getOrDefault(false)
    private fun assemble(files: Map<String, JsonElement>, observations: Map<String, Observation>, refreshing: Boolean = false): Snapshot {
        val bundles = markets.associateWith { market ->
            val code = market.lowercase()
            val rows = files["data/$code.json"]?.let { runCatching { dataset(it) }.getOrNull() } ?: emptyList()
            val prediction = files["predictions/$code/latest.json"]
            Bundle(rows, prediction, alignment(market, rows, prediction), files["predictions/$code/history.json"])
        }
        return Snapshot(bundles, files.toMap(), observations.toMap(), refreshing, clock())
    }
    suspend fun refresh(): Boolean {
        if (!mutex.tryLock()) return false
        try {
            _state.value = _state.value.copy(refreshing = true)
            val fetched = coroutineScope { paths().map { path -> async { path to fetch(path) } }.awaitAll() }
            val files = _state.value.files.toMutableMap(); val observations = _state.value.observations.toMutableMap()
            fetched.forEach { (path, pair) -> pair.first?.let { files[path] = it }; observations[path] = pair.second }
            _state.value = assemble(files, observations)
            return true
        } finally { _state.value = _state.value.copy(refreshing = false); mutex.unlock() }
    }
    private suspend fun fetch(path: String): Pair<JsonElement?, Observation> {
        val old = retained[path]
        try {
            val value = wireJson.parseToJsonElement(withTimeout(12000) { remote.get(path) })
            require(valid(path, value)) { "INVALID_WIRE_PAYLOAD" }
            if (old != null && (path.endsWith("/latest.json") || path.matches(Regex("data/(hk|sdy|sgp)\\.json"))) && regression(value, old))
                return old to Observation("CACHE", "REMOTE_REGRESSION_OR_DRAW_CONFLICT", clock())
            if (old != null && path == "data/live-draw.json") {
                // Runtime observations are never promoted into a canonical dataset.
                val boards = old.field("markets").obj().toMutableMap()
                value.field("markets").obj().forEach { (market, board) ->
                    val prior = boards[market]
                    if (prior == null || board.string("draw_date") > prior.string("draw_date") ||
                        board.string("draw_date") == prior.string("draw_date") && board.string("first") == prior.string("first")) boards[market] = board
                }
                val merged = JsonObject(value.obj() + ("markets" to JsonObject(boards)))
                retain(path, merged)
                return merged to Observation("REMOTE", if (merged != value) "RETAINED_NEWER_OR_CONFLICTING_RUNTIME_BOARD" else "", clock())
            }
            retain(path, value)
            return value to Observation("REMOTE", checkedAt = clock())
        } catch (e: CancellationException) {
            if (e !is TimeoutCancellationException) throw e
            return cachedOrFallback(path, old, "TIMEOUT")
        } catch (e: Exception) { return cachedOrFallback(path, old, e.message?.take(120) ?: e.javaClass.simpleName) }
    }
    private suspend fun cachedOrFallback(path: String, old: JsonElement?, reason: String): Pair<JsonElement?, Observation> {
        if (old != null) return old to Observation("CACHE", reason, clock())
        val value = runCatching { fallback?.get(path)?.let { wireJson.parseToJsonElement(it) }?.takeIf { valid(path, it) } }.getOrNull()
        return value to Observation(if (value == null) "UNAVAILABLE" else "BUNDLED", reason, clock())
    }
    private fun retain(path: String, value: JsonElement) { retained[path] = value; store.write("canonical:$path", value.toString()) }
    suspend fun archive(market: String, record: JsonElement): JsonElement = mutex.withLock {
        val path = archivePath(market, record)
        val value = fetch(path).first ?: error("ARCHIVE_UNAVAILABLE")
        validateArchive(market, record, value)
        value
    }
    suspend fun svg(market: String, date: String, path: String): String {
        val safe = svgPath(market, date, path)
        val key = "svg:$safe"
        return try {
            val text = withTimeout(12000) { remote.get(safe) }
            require(text.contains("<svg") && !Regex("<(script|foreignObject)|<!ENTITY", RegexOption.IGNORE_CASE).containsMatchIn(text)) { "INVALID_SVG" }
            store.write(key, text); text
        } catch (e: CancellationException) {
            if (e !is TimeoutCancellationException) throw e
            store.read(key) ?: error("SVG_TIMEOUT")
        } catch (e: Exception) { store.read(key) ?: fallback?.get(safe) ?: throw e }
    }
}
