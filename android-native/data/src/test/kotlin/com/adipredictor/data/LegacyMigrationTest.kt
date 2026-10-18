package com.adipredictor.data

import java.io.File
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.*
import kotlin.test.*
import org.junit.Test

class LegacyMigrationTest {
    private val public = File(System.getProperty("repo.root"), "public")
    private fun published(path: String) = wireJson.parseToJsonElement(File(public, path).readText())
    private fun wrapper(data: JsonElement) = buildJsonObject { put("data", data); put("meta", buildJsonObject { put("source", "REMOTE") }) }
    @Test fun exportedStringsImportAllMarketsAndRestartWithAlignedPredictionAndPreferences() = runTest {
        val store = MemoryStore()
        val entries = markets.flatMap { market ->
            val key = market.lowercase()
            listOf("data/$key.json", "predictions/$key/latest.json").map { path ->
                "CANONICAL_CACHE_V1:$path" to JsonPrimitive(wrapper(published(path)).toString())
            }
        }.toMap() + mapOf(
            "adipredictor:notification-preferences:v1" to JsonPrimitive("""{"master":true,"liveDraw":false,"result":false,"unrelated":true}"""),
            "adipredictor:delivered-notification-events:v1" to JsonPrimitive("""["RESULT:HK:2026-10-12:0000"]"""),
            "HK_LAST_VERIFIED_BOARD" to JsonPrimitive("""{"market":"HK","first":"001234","draw_date":"2026-10-12","derived_4d":"1234"}""")
        )
        val export = buildJsonObject { put("schema_version", 1); put("origin", "AdiPredictor-Capacitor"); put("localStorage", JsonObject(entries)) }.toString()
        assertEquals(9, migrateLegacy(export, store).imported.size)
        val prefs = Preferences(store)
        assertEquals(true, prefs.notifications()["master"])
        assertEquals(false, prefs.notifications()["liveDraw"])
        assertEquals(false, prefs.notifications()["result"])
        assertFalse(store.read("preferences:notifications")!!.contains("unrelated"))
        assertFalse(prefs.claim("RESULT:HK:2026-10-12:0000"))
        val restarted = Repository(Transport { error("OFFLINE") }, store)
        markets.forEach { assertEquals("MATCH", restarted.state.value.bundles[it]!!.alignment) }
        assertEquals("001234", restarted.state.value.files["runtime/board/HK"].string("first"))
        assertFalse(restarted.state.value.bundles["HK"]!!.rows.any { it.number == "001234" })
        val before = store.values.toMap()
        assertTrue(migrateLegacy(export, store).errors.isEmpty())
        assertEquals(before, store.values)
        assertFalse(Preferences(store).claim("RESULT:HK:2026-10-12:0000"))
    }
    @Test fun newerNativePredictionAndExplicitPreferencesSurviveRepeatedImport() {
        val store = MemoryStore()
        val path = "predictions/hk/latest.json"
        val incoming = published(path).obj()
        val newer = JsonObject(incoming + ("metadata_revision" to JsonPrimitive(999999)))
        store.write("canonical:$path", newer.toString())
        Preferences(store).notifications(notificationDefaults + ("master" to false))
        val export = JsonObject(mapOf("CANONICAL_CACHE_V1:$path" to wrapper(incoming), "adipredictor:notification-preferences:v1" to buildJsonObject { put("master", true) })).toString()
        repeat(2) {
            val report = migrateLegacy(export, store)
            assertEquals(2, report.skipped.size)
            assertEquals(newer.toString(), store.read("canonical:$path"))
            assertEquals(false, Preferences(store).notifications()["master"])
        }
    }
    @Test fun corruptDedupWrongRuntimeMarketAndInvalidExportAreRejectedWithoutWrites() {
        val store = MemoryStore(); assertTrue(Preferences(store).claim("existing"))
        val before = store.values.toMap()
        val export = """{"adipredictor:delivered-notification-events:v1":{"bad":true},"HK_LAST_VERIFIED_BOARD":{"market":"SGP","first":"001234","draw_date":"2026-10-12"}}"""
        assertEquals(2, migrateLegacy(export, store).errors.size)
        assertEquals(before, store.values)
        assertFails { migrateLegacy("{\"localStorage\":[]}", store) }
        assertFails { migrateLegacy("{broken", store) }
        assertEquals(before, store.values)
    }
    @Test fun wrongMarketPredictionCannotReplaceNativeCache() {
        val store = MemoryStore(); val path = "predictions/hk/latest.json"
        val data = published(path); store.write("canonical:$path", data.toString())
        val wrong = JsonObject(data.obj() + ("market" to JsonPrimitive("SGP")))
        val report = migrateLegacy(JsonObject(mapOf("CANONICAL_CACHE_V1:$path" to wrapper(wrong))).toString(), store)
        assertEquals(1, report.errors.size)
        assertEquals(data.toString(), store.read("canonical:$path"))
    }
    @Test fun newerImportedRuntimeSurvivesRestartAndSameDrawConflictRetainsNative() = runTest {
        val store = MemoryStore()
        store.write("runtime:board:HK", """{"draw_date":"2026-10-11","first":"000111","derived_4d":"0111"}""")
        val export = """{"HK_LAST_VERIFIED_BOARD":{"market":"HK","draw_date":"2026-10-12","first":"001234"}}"""
        val repository = Repository(Transport { error("OFFLINE") }, store)
        migrateLegacy(export, store); repository.reloadCacheAfterMigration()
        assertEquals("001234", repository.state.value.files["runtime/board/HK"].string("first"))
        val restarted = Repository(Transport { error("OFFLINE") }, store)
        assertEquals("001234", restarted.state.value.files["runtime/board/HK"].string("first"))
        assertEquals("1234", restarted.state.value.files["runtime/board/HK"].string("derived_4d"))
        store.write("runtime:board:HK", """{"draw_date":"2026-10-12","first":"009999","derived_4d":"9999"}""")
        val conflict = Repository(Transport { error("OFFLINE") }, store)
        assertEquals("009999", conflict.state.value.files["runtime/board/HK"].string("first"))
        assertEquals("001234", conflict.state.value.files["runtime/board/HK"].field("runtime_conflicts").arr().single().string("incoming_first"))
        assertNull(store.read("canonical:data/hk.json"))
    }
}
