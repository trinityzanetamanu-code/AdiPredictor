package com.adipredictor.data

import java.io.File
import kotlinx.coroutines.*
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.*
import kotlin.test.*
import org.junit.Test

class MemoryStore : Store {
    val values = mutableMapOf<String, String>()
    override fun read(key: String) = values[key]
    override fun write(key: String, value: String) { values[key] = value }
}
class DataTest {
    private val root = File(System.getProperty("repo.root"))
    private fun published(path: String) = File(root, "public/$path").readText()
    private fun rows(date: String = "2026-10-12", number: String = "0000") = wireJson.parseToJsonElement("""[{"result_date":"$date","nomor":"$number","market":"HK","periode":"HK-1","verification":"confirmed_2_sources"}]""")
    @Test fun allMarketsVerifyWholeDatasetIdentity() {
        for (market in markets) {
            val code = market.lowercase(); val p = wireJson.parseToJsonElement(published("predictions/$code/latest.json"))
            val draws = dataset(wireJson.parseToJsonElement(published("data/$code.json")))
            assertEquals(p.string("dataset_revision"), revision(market, draws))
            assertEquals(p.string("dataset_fingerprint"), revision(market, draws, "AdiPredictor-P1-P8-v2"))
            assertEquals("MATCH", alignment(market, draws, p))
            val mutated = draws.toMutableList(); mutated[mutated.lastIndex] = mutated.last().copy(number = "0000")
            assertEquals("DATASET_VERSION_MISMATCH", alignment(market, mutated, p))
        }
    }
    @Test fun zeroIsPreservedAndStatisticsAndSearchUseActualRows() {
        val draws = dataset(rows()); assertEquals("0000", draws.first().number)
        assertEquals(listOf(4,0,0,0,0,0,0,0,0,0), digitCounts(draws))
        assertEquals(1, searchRows(draws, "0000").size); assertEquals(0, searchRows(draws, "", "2026-10-13").size)
        assertEquals(0, searchRows(draws, "", to = "2026-10-11").size)
    }
    @Test fun invalidAndDuplicateDatasetsFail() {
        assertFails { dataset(rows(number = "000")) }; assertFails { dataset(rows(date = "2026-02-30")) }
        assertFails { dataset(JsonArray(rows().arr() + rows().arr())) }
        assertFails { dataset(JsonArray(emptyList())) }
    }
    @Test fun regressionAndSameDrawConflictCannotAdvanceCache() {
        assertTrue(regression(rows("2026-10-11"), rows()))
        assertTrue(regression(rows(number = "1234"), rows()))
        assertFalse(regression(rows("2026-10-13"), rows()))
        assertFalse(regression(JsonArray(rows("2026-10-11").arr() + rows("2026-10-13").arr()), rows()))
    }
    @Test fun olderMetadataCannotOverwritePrediction() {
        val p = wireJson.parseToJsonElement(published("predictions/hk/latest.json")).obj()
        val older = JsonObject(p + ("metadata_revision" to JsonPrimitive(0)))
        assertTrue(regression(older, p))
    }
    @Test fun refreshOffline403AndTimeoutRetainCanonicalAcrossRestart() = runTest {
        for (reason in listOf("OFFLINE", "HTTP_403", "TIMEOUT")) {
            val store = MemoryStore(); store.write("canonical:data/hk.json", rows().toString())
            val r = Repository(Transport { throw IllegalStateException(reason) }, store, Transport { rows("2025-01-01").toString() })
            r.refresh(); assertEquals("2026-10-12", r.state.value.bundles["HK"]!!.rows.first().date)
            assertEquals("CACHE", r.state.value.observations["data/hk.json"]!!.origin)
            val restarted = Repository(Transport { error("OFFLINE") }, store)
            assertEquals("0000", restarted.state.value.bundles["HK"]!!.rows.first().number)
        }
    }
    @Test fun networkTimeoutUsesInjectableClockAndNoOverlap() = runTest {
        val gate = CompletableDeferred<Unit>(); val store = MemoryStore()
        store.write("canonical:data/hk.json", rows().toString())
        val r = Repository(Transport { gate.await(); error("HTTP_403") }, store, clock = { "frozen" })
        val first = async { r.refresh() }; yield()
        assertFalse(r.refresh()); gate.complete(Unit); assertTrue(first.await())
        assertEquals("frozen", r.state.value.checkedAt); assertFalse(r.state.value.refreshing)
    }
    @Test fun realTimeoutIsNotReportedAsCancellation() = runTest {
        val store = MemoryStore(); store.write("canonical:data/hk.json", rows().toString())
        val r = Repository(Transport { delay(20000); "{}" }, store)
        r.refresh(); assertEquals("TIMEOUT", r.state.value.observations["data/hk.json"]!!.reason)
    }
    @Test fun staleRemoteCannotReplacePersistentLatest() = runTest {
        val store = MemoryStore(); store.write("canonical:data/hk.json", rows().toString())
        val r = Repository(Transport { rows("2025-01-01").toString() }, store)
        r.refresh(); assertEquals("0000", r.state.value.bundles["HK"]!!.rows.first().number)
        assertEquals("REMOTE_REGRESSION_OR_DRAW_CONFLICT", r.state.value.observations["data/hk.json"]!!.reason)
    }
    @Test fun runtimeConflictCannotPolluteCanonical() = runTest {
        val store = MemoryStore(); store.write("canonical:data/hk.json", rows().toString())
        val live = """{"markets":{"HK":{"draw_date":"2026-10-12","first":"0000"}}}"""
        store.write("canonical:data/live-draw.json", live)
        val r = Repository(Transport { path -> if (path == "data/live-draw.json") live.replace("0000", "9999") else error("HTTP_403") }, store)
        r.refresh(); assertEquals("0000", r.state.value.files["data/live-draw.json"].field("markets").field("HK").string("first"))
        assertEquals("0000", r.state.value.bundles["HK"]!!.rows.first().number)
    }
    @Test fun historiesV1V2AndAllSvgPathsAreBoundToSelectedArchive() {
        var schemas = mutableSetOf<String>()
        for (market in markets) {
            val history = wireJson.parseToJsonElement(published("predictions/${market.lowercase()}/history.json"))
            history.field("records").arr().forEach { record ->
                val p = wireJson.parseToJsonElement(published(archivePath(market, record)))
                schemas += p.string("schema_version").ifEmpty { "1" }
                validateArchive(market, record, p)
                p.field("visual_patterns").arr().forEach { pattern ->
                    val path = svgPath(market, p.string("target_date"), pattern.string("image_path"))
                    assertTrue(published(path).contains("<svg"))
                    assertFails { svgPath(market, "2000-01-01", path) }
                }
            }
        }
        assertTrue("2" in schemas)
        // Real archives may age out v1; schema is optional and is deliberately not a gate.
        val record = wireJson.parseToJsonElement("""{"market":"HK","target_date":"2026-01-01","archive_path":"public/predictions/hk/archive/2026-01-01.json"}""")
        validateArchive("HK", record, wireJson.parseToJsonElement("""{"market":"HK","target_date":"2026-01-01"}"""))
    }
    @Test fun wrongArchiveIdentityAndUnsafePathsFail() {
        val record = wireJson.parseToJsonElement("""{"market":"HK","target_date":"2026-01-01","archive_path":"../secret"}""")
        assertFails { archivePath("HK", record) }
        assertFails { validateArchive("HK", record, rows()) }
        assertFails { svgPath("HK", "2026-01-01", "https://example.com/pattern-01.svg") }
    }
    @Test fun originalSvgSurvivesOfflineRestartByteForByte() = runTest {
        val text = published("predictions/hk/visuals/2026-10-12/pattern-01.svg")
        val store = MemoryStore(); val r = Repository(Transport { text }, store)
        val path = "predictions/hk/visuals/2026-10-12/pattern-01.svg"
        assertEquals(text, r.svg("HK", "2026-10-12", path))
        assertEquals(text, Repository(Transport { error("HTTP_403") }, store).svg("HK", "2026-10-12", path))
    }
    @Test fun tafsirIsRealDatasetAndSearchable() {
        val tafsir = wireJson.parseToJsonElement(published("data/tafsir.json"))
        val full = searchTafsir(tafsir, ""); assertTrue(full.size >= 50)
        assertTrue(searchTafsir(tafsir, "Kucing").isNotEmpty()); assertEquals(0, searchTafsir(tafsir, "not-a-real-word").size)
    }
    @Test fun preferencesAndDedupSurviveRestart() {
        val store = MemoryStore(); val p = Preferences(store)
        p.notifications(notificationDefaults + ("master" to true)); assertTrue(Preferences(store).notifications()["master"] == true)
        assertTrue(p.claim("RESULT:HK:2026-10-12:0000")); assertFalse(Preferences(store).claim("RESULT:HK:2026-10-12:0000"))
        p.set("market", "SGP"); assertEquals("SGP", Preferences(store).get("market", "HK"))
    }
    @Test fun metadataOnlyPredictionDoesNotNotify() {
        val p = wireJson.parseToJsonElement(published("predictions/hk/latest.json"))
        val bundle = Bundle(dataset(wireJson.parseToJsonElement(published("data/hk.json"))), p, "MATCH")
        val a = Snapshot(mapOf("HK" to bundle)); val b = a.copy(bundles = mapOf("HK" to bundle.copy(prediction = JsonObject(p.obj() + ("metadata_revision" to JsonPrimitive(999))))))
        assertTrue(notices(a, b, notificationDefaults + ("master" to true), 1).isEmpty())
    }
    @Test fun migrationPreservesNewerNativeAndZeroAndDedup() {
        val store = MemoryStore(); store.write("canonical:data/hk.json", rows().toString())
        val legacy = JsonObject(mapOf(
            "CANONICAL_CACHE_V1:data/hk.json" to JsonObject(mapOf("data" to rows("2025-01-01"), "meta" to JsonObject(mapOf("source" to JsonPrimitive("REMOTE"))))),
            "adipredictor:notification-preferences:v1" to JsonObject(mapOf("master" to JsonPrimitive(true))),
            "adipredictor:delivered-notification-events:v1" to JsonArray(listOf(JsonPrimitive("RESULT:HK:2026-10-12:0000")))))
        val report = migrateLegacy(legacy.toString(), store)
        assertEquals(2, report.imported.size); assertEquals(1, report.skipped.size); assertEquals(0, report.errors.size)
        assertEquals("2026-10-12", dataset(wireJson.parseToJsonElement(store.read("canonical:data/hk.json")!!)).first().date)
        assertFalse(Preferences(store).claim("RESULT:HK:2026-10-12:0000")); assertTrue(Preferences(store).notifications()["master"] == true)
    }
    @Test fun malformedMigrationDoesNotEraseData() {
        val store = MemoryStore(); store.write("preferences:notifications", "{\"master\":true}")
        val report = migrateLegacy("{\"adipredictor:notification-preferences:v1\":\"bad\"}", store)
        assertEquals(1, report.errors.size); assertTrue(Preferences(store).notifications()["master"] == true)
    }
    @Test fun simultaneousDeliveryClaimsFromSeparateInstancesOnlyDeliverOnce() {
        val store = MemoryStore()
        val pool = java.util.concurrent.Executors.newFixedThreadPool(8)
        try {
            val results = pool.invokeAll(List(40) { java.util.concurrent.Callable { Preferences(store).claim("RESULT:HK:concurrent:0000") } })
            assertEquals(1, results.count { it.get() })
        } finally { pool.shutdownNow() }
    }
    @Test fun legacyImportCannotOverwriteNewerNativeRuntimeBoard() = runTest {
        val store = MemoryStore()
        val native = """{"draw_date":"2026-10-13","first":"001234","derived_4d":"1234"}"""
        store.write("runtime:board:HK", native)
        val r = Repository(Transport { error("OFFLINE") }, store)
        migrateLegacy("""{"HK_LAST_VERIFIED_BOARD":{"draw_date":"2026-10-12","first":"009999"}}""", store)
        r.reloadCacheAfterMigration()
        assertEquals("001234", r.state.value.files["runtime/board/HK"].string("first"))
        assertEquals(native, store.read("runtime:board:HK"))
    }
    @Test fun wrongMarketLegacyCacheIsRejectedWithoutReplacingExistingData() {
        val store = MemoryStore(); store.write("canonical:data/hk.json", rows().toString())
        val wrapper = JsonObject(mapOf("data" to rows("2026-10-13").toString().replace("HK", "SGP").let { wireJson.parseToJsonElement(it) },
            "meta" to JsonObject(mapOf("source" to JsonPrimitive("REMOTE")))))
        val report = migrateLegacy(JsonObject(mapOf("CANONICAL_CACHE_V1:data/hk.json" to wrapper)).toString(), store)
        assertEquals(1, report.errors.size)
        assertEquals("2026-10-12", dataset(wireJson.parseToJsonElement(store.read("canonical:data/hk.json")!!)).first().date)
    }
}
