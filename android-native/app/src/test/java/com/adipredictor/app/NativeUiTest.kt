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
import org.junit.Rule
import org.junit.Test
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
    @get:Rule(order = 0) val setup = object : ExternalResource() {
        override fun before() {
            val context = ApplicationProvider.getApplicationContext<Context>()
            context.getSharedPreferences("adipredictor.native.v1", Context.MODE_PRIVATE).edit().clear().commit()
            val store = DiskStore(context)
            public.walkTopDown().filter { it.isFile && it.extension == "json" && it.relativeTo(public).path.let { p -> p.startsWith("data/") || p.startsWith("predictions/") || p == "app-release.json" } }.forEach { file ->
                store.write("canonical:${file.relativeTo(public).invariantSeparatorsPath}", file.readText())
            }
            NativeServices.transport = { Transport { path -> requests.incrementAndGet(); File(public, path).readText() } }
            NativeServices.boards = { DirectBoardSource { _, _ -> error("HTTP_403_CONTROLLED") } }
        }
        override fun after() { NativeServices.transport = { RemoteTransport() }; NativeServices.boards = { DirectBoards() } }
    }
    @get:Rule(order = 1) val ui = createAndroidComposeRule<MainActivity>()
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
        ui.onNodeWithText("Cari nomor, tanggal atau periode").performTextInput("0000")
        val rows = dataset(wireJson.parseToJsonElement(File(public, "data/hk.json").readText()))
        val total = rows.count { it.number.contains("0000") }
        ui.onNodeWithText("$total dari ${rows.size} hasil").assertExists()
        page("Statistik"); ui.onNodeWithText("Matriks Frekuensi Digit (0–9)").assertExists(); screenshot("statistics-phone")
        page("Tafsir"); ui.onNodeWithText("Cari tafsir").performTextInput("Kucing"); ui.onNodeWithText("42 - 08 - 93").assertExists(); screenshot("tafsir-search-phone")
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
        ui.onNodeWithText("Kembali ke daftar").performClick(); ui.onNodeWithText("Cari arsip").assertExists()
    }
    @Test fun preferenceAndNavigationRestorationAndDeepLink() {
        page("Pengaturan")
        ui.onNodeWithText("Notifikasi").assertExists()
        screenshot("settings-phone")
        ui.activityRule.scenario.recreate(); ui.waitForIdle(); ui.onNodeWithText("Notifikasi").assertExists()
        ui.runOnUiThread { ui.activity.onNewIntent(Intent(Intent.ACTION_VIEW, Uri.parse("adipredictor://open?market=SGP&target=Data"))) }
        ui.waitForIdle(); ui.onNodeWithText("Cari nomor, tanggal atau periode").assertExists()
        ui.runOnUiThread { ui.activity.onBackPressedDispatcher.onBackPressed() }; ui.waitForIdle(); ui.onNodeWithText("Hasil terakhir SGP").assertExists()
    }
    @Test @Config(qualifiers = "w360dp-h800dp-xhdpi", fontScale = 2f) fun largeFontLayoutAndBackRemainUsable() {
        ui.onNodeWithText("Hasil terakhir HK").assertExists(); screenshot("analysis-hk-large-font")
        page("Tafsir"); ui.onNodeWithText("Cari tafsir").performTextInput("Ular"); ui.onNodeWithText("32 - 44 - 76").assertExists(); screenshot("tafsir-large-font")
        ui.runOnUiThread { ui.activity.onBackPressedDispatcher.onBackPressed() }; ui.waitForIdle(); ui.onNodeWithText("Hasil terakhir HK").assertExists()
    }
    @Test fun persistentNotificationDeliveryAndReminderCancellation() {
        val context = ui.activity
        val preferences = Preferences(DiskStore(context)); preferences.notifications(notificationDefaults + ("master" to true))
        val notice = Notice("RESULT:HK:test:0000", "result", "HK 0000", "test")
        ui.runOnUiThread { notify(context, notice, preferences); notify(context, notice, preferences) }
        assertEquals(1, shadowOf(context.getSystemService(android.app.NotificationManager::class.java)).allNotifications.size)
        assertFalse(Preferences(DiskStore(context)).claim(notice.key))
        ui.runOnUiThread { scheduleReminders(context) }
        assertTrue(DiskStore(context).read("reminders:scheduled")!!.contains("LIVE:"))
        preferences.notifications(notificationDefaults)
        ui.runOnUiThread { scheduleReminders(context) }
        assertEquals("", DiskStore(context).read("reminders:scheduled"))
    }
}
