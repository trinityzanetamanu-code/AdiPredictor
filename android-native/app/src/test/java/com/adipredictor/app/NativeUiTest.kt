package com.adipredictor.app

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.net.Uri
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.core.app.ApplicationProvider
import com.adipredictor.data.*
import java.io.File
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.serialization.json.*
import org.junit.Rule
import org.junit.Test
import org.junit.Before
import org.junit.Assert.*
import org.junit.rules.ExternalResource
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h800dp-xhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class NativeUiTest {
    private val requests = AtomicInteger()
    private val public = File(System.getProperty("repo.root"), "public")
    // The published index retains 30 draws. Keep a real v1 archive reachable in
    // the controlled fixture even after it ages out of that rolling index.
    private val historyFixture by lazy {
        val original = wireJson.parseToJsonElement(File(public, "predictions/hk/history.json").readText())
        val legacy = File(public, "predictions/hk/archive").listFiles()!!.sortedBy { it.name }.asSequence().map { it to wireJson.parseToJsonElement(it.readText()) }.first { it.second.string("schema_version") == "1" }
        val records = original.field("records").arr()
        if (records.any { it.string("target_date") == legacy.second.string("target_date") }) original.toString()
        else {
            val record = buildJsonObject {
                put("market", "HK"); put("schema_version", 1)
                put("target_date", legacy.second.string("target_date")); put("target_period", legacy.second.string("target_period"))
                put("archive_path", "public/predictions/hk/archive/${legacy.first.name}")
            }
            JsonObject(original.obj() + mapOf("records" to JsonArray(records + record), "count" to JsonPrimitive(records.size + 1))).toString()
        }
    }
    @get:Rule(order = 0) val setup = object : ExternalResource() {
        override fun before() {
            val context = ApplicationProvider.getApplicationContext<Context>()
            context.getSharedPreferences("adipredictor.native.v1", Context.MODE_PRIVATE).edit().clear().commit()
            val store = DiskStore(context)
            store.write("preference:page", "Analisis"); store.write("preference:market", "HK")
            public.walkTopDown().filter { it.isFile && it.extension == "json" && it.relativeTo(public).invariantSeparatorsPath.let { p -> p.startsWith("data/") || Regex("predictions/(hk|sdy|sgp)/(latest|history)\\.json").matches(p) || p == "app-release.json" } }.forEach { file ->
                val path = file.relativeTo(public).invariantSeparatorsPath
                store.write("canonical:$path", if (path == "predictions/hk/history.json") historyFixture else file.readText())
            }
            NativeServices.transport = { Transport { path -> requests.incrementAndGet(); if (path == "predictions/hk/history.json") historyFixture else File(public, path).readText() } }
            NativeServices.boards = { DirectBoardSource { _, _ -> error("HTTP_403_CONTROLLED") } }
        }
        override fun after() { NativeServices.transport = { RemoteTransport() }; NativeServices.boards = { DirectBoards() } }
    }
    @get:Rule(order = 1) val ui = createAndroidComposeRule<MainActivity>()
    @Before fun startAtKnownRoute() {
        // Navigation deliberately survives recreation. Establish each test's
        // starting route through the same deep-link contract instead of relying
        // on the previous test's last selected page or market.
        ui.runOnUiThread { ui.activity.onNewIntent(Intent(ui.activity, MainActivity::class.java).setAction(Intent.ACTION_VIEW).setData(Uri.parse("adipredictor://open?market=HK&target=Analisis"))) }
        ui.waitForIdle()
    }
    private fun page(name: String) { ui.onNodeWithText(name, useUnmergedTree = true).performScrollTo().performClick(); ui.waitForIdle() }
    private fun screenshot(name: String) {
        ui.waitForIdle()
        ui.runOnUiThread {
            val view = ui.activity.window.decorView
            val bitmap = Bitmap.createBitmap(view.width.coerceAtLeast(1), view.height.coerceAtLeast(1), Bitmap.Config.ARGB_8888)
            view.draw(Canvas(bitmap))
            val file = File("build/reports/ui/$name.png"); file.parentFile!!.mkdirs()
            file.outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
            assertTrue(file.length() > 1000)
        }
    }
    @Test fun allMarketsAnalysisAndRefreshStayOnPage() {
        screenshot("startup-before-market-check")
        ui.onNodeWithText("Hasil terakhir HK").assertExists()
        listOf("SDY", "SGP", "HK").forEach { market -> ui.onNodeWithText(market).performClick(); ui.onNodeWithText("Hasil terakhir $market").assertExists() }
        val before = requests.get()
        ui.waitUntil(10000) { ui.onAllNodesWithText("Refresh").fetchSemanticsNodes().isNotEmpty() }
        ui.onNodeWithText("Refresh").performClick()
        ui.waitUntil(10000) { requests.get() > before }
        ui.onNodeWithText("Hasil terakhir HK").assertExists(); screenshot("analysis-hk-phone")
    }
    @Test fun dataSearchStatisticsAndTafsirUsePublishedData() {
        page("Data")
        ui.onNodeWithText("Cari nomor, tanggal atau periode").performTextReplacement("0000")
        val rows = dataset(wireJson.parseToJsonElement(File(public, "data/hk.json").readText()))
        val total = rows.count { it.number.contains("0000") }
        ui.onNodeWithTag("content").performScrollToNode(hasText("$total dari ${rows.size} hasil"))
        ui.onNodeWithText("$total dari ${rows.size} hasil").assertExists()
        page("Statistik"); ui.onNodeWithText("Matriks Frekuensi Digit (0–9)").assertExists(); screenshot("statistics-phone")
        page("Data"); ui.onNode(hasSetTextAction() and hasText("0000")).assertExists()
        page("Tafsir"); ui.onNodeWithText("Cari tafsir").performTextReplacement("Kucing"); ui.onNodeWithText("42 - 08 - 93").assertExists(); screenshot("tafsir-search-phone")
    }
    @Test fun liveBoardsAndOfficialModesRemainNative() {
        page("LiveDraw")
        ui.onNodeWithText("LiveDraw HK · sumber dan cache").assertExists()
        ui.onNodeWithText("SDY").performClick(); ui.onNodeWithText("LiveDraw SDY · sumber dan cache").assertExists(); screenshot("live-sdy-phone")
        ui.onNodeWithText("SGP").performClick(); ui.onNodeWithText("TOTO").performClick(); ui.onNodeWithText("LiveDraw SGP · sumber dan cache").assertExists()
    }
    @Test fun historySelectedArchiveQuickViewOutcomeAndSvg() {
        page("Histori")
        val history = wireJson.parseToJsonElement(File(public, "predictions/hk/history.json").readText())
        val date = history.field("records").arr().first().string("target_date")
        ui.onNodeWithText("Buka arsip $date").performScrollTo().performClick()
        ui.waitUntil(10000) { ui.onAllNodesWithText("Arsip $date").fetchSemanticsNodes().isNotEmpty() }
        screenshot("history-selected-phone")
        val selected = wireJson.parseToJsonElement(File(public, "predictions/hk/archive/$date.json").readText())
        val pattern = selected.field("visual_patterns").arr().first()
        ui.onNodeWithTag("content").performScrollToNode(hasText("Pola Visual · ${pattern.string("pattern_name")}"))
        screenshot("history-pattern-before-render")
        ui.waitUntil(10000) { ui.onAllNodesWithTag("svg:${pattern.string("image_path")}").fetchSemanticsNodes().isNotEmpty() }
        ui.onNodeWithTag("content").performScrollToNode(hasTestTag("svg:${pattern.string("image_path")}"))
        ui.onNodeWithTag("svg:${pattern.string("image_path")}").assertIsDisplayed()
        screenshot("history-original-svg-phone")
        ui.onNodeWithTag("content").performScrollToIndex(0)
        ui.onNodeWithText("Kembali ke daftar").performClick(); ui.onNodeWithText("Cari arsip").assertExists()
    }
    @Test fun preferenceAndNavigationRestorationAndDeepLink() {
        page("Pengaturan")
        ui.onNodeWithText("Notifikasi").assertExists()
        screenshot("settings-phone")
        ui.activityRule.scenario.recreate(); ui.waitForIdle(); ui.onNodeWithText("Notifikasi").assertExists()
        // Android resolves a component before delivering onNewIntent. Preserve
        // that contract so ActivityScenario can track the recreated Activity.
        ui.runOnUiThread { ui.activity.onNewIntent(Intent(ui.activity, MainActivity::class.java).setAction(Intent.ACTION_VIEW).setData(Uri.parse("adipredictor://open?market=SGP&target=Data"))) }
        ui.waitForIdle(); ui.onNodeWithText("Cari nomor, tanggal atau periode").assertExists()
        ui.activityRule.scenario.recreate(); ui.waitForIdle()
        ui.onNodeWithText("Cari nomor, tanggal atau periode").assertExists()
        ui.runOnUiThread { ui.activity.onBackPressedDispatcher.onBackPressed() }; ui.waitForIdle(); ui.onNodeWithText("Hasil terakhir SGP").assertExists()
    }
    @Test fun legacyV1ArchiveDisplaysAndCopiesOriginalStringCandidates() {
        val history = wireJson.parseToJsonElement(historyFixture)
        val record = history.field("records").arr().first { it.string("schema_version") == "1" }
        val date = record.string("target_date")
        val original = wireJson.parseToJsonElement(File(public, "predictions/hk/archive/$date.json").readText())
        val number = original.field("quick_view").field("four_d").field("main").text()
        assertTrue(number.matches(Regex("[0-9]{4}")))
        page("Histori"); ui.onNodeWithText("Cari arsip").performTextReplacement(date)
        ui.onNodeWithText("Buka arsip $date").performScrollTo().performClick()
        ui.waitUntil(10000) { ui.onAllNodesWithText("Arsip $date").fetchSemanticsNodes().isNotEmpty() }
        ui.onNodeWithTag("content").performScrollToNode(hasText("main: $number", substring = true))
        ui.onNodeWithText("main: $number", substring = true).assertIsDisplayed()
        ui.onNodeWithTag("content").performScrollToNode(hasTestTag("copy4d:main"))
        ui.onNodeWithTag("copy4d:main").performClick()
        val clipboard = ui.activity.getSystemService(android.content.ClipboardManager::class.java)
        assertEquals(number, clipboard.primaryClip!!.getItemAt(0).text.toString())
        screenshot("history-v1-original-candidates-phone")
    }
    @Test @Config(qualifiers = "w360dp-h800dp-xhdpi", fontScale = 2f) fun largeFontLayoutAndBackRemainUsable() {
        ui.onNodeWithText("Hasil terakhir HK").assertExists(); screenshot("analysis-hk-large-font")
        page("Tafsir"); ui.onNodeWithText("Cari tafsir").performTextReplacement("Ular"); ui.onNodeWithText("32 - 44 - 76").assertExists(); screenshot("tafsir-large-font")
        ui.runOnUiThread { ui.activity.onBackPressedDispatcher.onBackPressed() }; ui.waitForIdle(); ui.onNodeWithText("Hasil terakhir HK").assertExists()
    }
    @Test fun persistentNotificationDeliveryAndReminderCancellation() {
        val context = ui.activity
        val preferences = Preferences(DiskStore(context)); preferences.notifications(notificationDefaults + ("master" to true))
        val notice = Notice("RESULT:HK:test:0000", "result", "HK 0000", "test")
        ui.runOnUiThread { notify(context, notice, preferences); notify(context, notice, preferences) }
        assertEquals(1, shadowOf(context.getSystemService(android.app.NotificationManager::class.java)).allNotifications.size)
        val notification = shadowOf(context.getSystemService(android.app.NotificationManager::class.java)).allNotifications.single()
        assertEquals("adipredictor://open?market=HK&target=Analisis", shadowOf(notification.contentIntent).savedIntent.data.toString())
        assertFalse(Preferences(DiskStore(context)).claim(notice.key))
        ui.runOnUiThread { scheduleReminders(context) }
        assertTrue(DiskStore(context).read("reminders:scheduled")!!.contains("LIVE:"))
        preferences.notifications(notificationDefaults)
        ui.runOnUiThread { scheduleReminders(context) }
        assertEquals("", DiskStore(context).read("reminders:scheduled"))
    }
}
