package com.adipredictor.data

import java.io.File
import kotlin.test.*
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.*
import org.junit.Test

class LiveBoardTest {
    private val root = File(System.getProperty("repo.root"))
    @Test fun realLegacyHtmlFixturesMatchOriginalJavascriptOracle() {
        val oracle = wireJson.parseToJsonElement(javaClass.getResource("/legacy-live-board-oracle.json")!!.readText())
        oracle.field("cases").arr().forEach { case ->
            val html = File(root, "tests/fixtures/${case.string("file")}").readText()
            assertEquals(case.string("hash"), sha256(html))
            val expected = case.field("result")!!
            if (expected.string("error").isNotEmpty()) {
                val error = assertFails { parseLiveBoard(html, case.string("market"), "fixture") }
                assertEquals(expected.string("error"), error.message)
            } else {
                val actual = parseLiveBoard(html, case.string("market"), "fixture")
                listOf("draw_date", "first", "second", "third", "starter", "consolation", "derived_4d", "result_status", "finality_evidence", "verification").forEach { key -> assertEquals(expected.field(key), actual.field(key), "${case.string("file")}.$key") }
            }
        }
    }
    @Test fun runtimeAheadHoldsPredictionAndConflictSurvivesRestart() = runTest {
        val store = MemoryStore()
        store.write("canonical:data/hk.json", """[{"result_date":"2026-10-12","nomor":"0000"}]""")
        val repository = Repository(Transport { error("HTTP_403") }, store)
        val first = wireJson.parseToJsonElement("""{"draw_date":"2026-10-13","first":"120012","derived_4d":"0012"}""")
        repository.observe("HK", first)
        assertEquals("RUNTIME_RESULT_AHEAD_CANONICAL", repository.state.value.bundles["HK"]!!.alignment)
        assertEquals("0000", repository.state.value.bundles["HK"]!!.rows.first().number)
        repository.observe("HK", JsonObject(first.obj() + ("first" to JsonPrimitive("129999"))))
        assertEquals(1, repository.state.value.files["runtime/board/HK"].field("runtime_conflicts").arr().size)
        val restart = Repository(Transport { error("OFFLINE") }, store)
        assertEquals("120012", restart.state.value.files["runtime/board/HK"].string("first"))
        assertEquals("RUNTIME_RESULT_AHEAD_CANONICAL", restart.state.value.bundles["HK"]!!.alignment)
    }
    @Test fun selectedArchiveCacheRetainsIdentityAfterBadResponseAndRestart() = runTest {
        val index = wireJson.parseToJsonElement(File(root, "public/predictions/hk/history.json").readText()).field("records").arr().first()
        val path = archivePath("HK", index); val text = File(root, "public/$path").readText().trim()
        val store = MemoryStore(); val first = Repository(Transport { text }, store)
        assertEquals(text, first.archive("HK", index).toString())
        val broken = Repository(Transport { "{\"market\":\"SGP\",\"target_date\":\"1900-01-01\"}" }, store)
        assertEquals(text, broken.archive("HK", index).toString())
        assertEquals(text, store.read("canonical:$path"))
    }
}
