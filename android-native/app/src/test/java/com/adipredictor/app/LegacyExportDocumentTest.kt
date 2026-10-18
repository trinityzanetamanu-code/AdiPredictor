package com.adipredictor.app

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.test.core.app.ApplicationProvider
import com.adipredictor.data.*
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.IOException
import java.io.OutputStream
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class LegacyExportDocumentTest {
    private fun envelope(storage: JsonObject) = buildJsonObject {
        put("schema_version", 1); put("origin", "AdiPredictor-Capacitor"); put("localStorage", storage)
    }.toString()
    @Test fun actualMultiMegabyteCacheWritesExactBytesAndImportsAlignedAcrossMarkets() {
        val public = File(System.getProperty("repo.root"), "public")
        val storage = buildJsonObject {
            markets.forEach { market ->
                val code = market.lowercase()
                for (path in listOf("data/$code.json", "predictions/$code/latest.json")) {
                    val wrapper = buildJsonObject {
                        put("data", wireJson.parseToJsonElement(File(public, path).readText()))
                        put("meta", buildJsonObject { put("source", "REMOTE") })
                    }
                    put("CANONICAL_CACHE_V1:$path", wrapper.toString())
                }
            }
        }
        val json = envelope(storage)
        val bytes = LegacyExportDocument.encode(json)
        assertTrue(bytes.size > 2_000_000)
        val context = ApplicationProvider.getApplicationContext<Context>()
        val uri = Uri.parse("content://controlled.export/large.json")
        val output = ByteArrayOutputStream()
        shadowOf(context.contentResolver).registerOutputStream(uri, output)
        assertEquals(bytes.size, LegacyExportDocument.write(context.contentResolver, uri, bytes))
        assertArrayEquals(bytes, output.toByteArray())
        val values = mutableMapOf<String, String>()
        val store = object : Store {
            override fun read(key: String) = values[key]
            override fun write(key: String, value: String) { values[key] = value }
        }
        val report = migrateLegacy(output.toString("UTF-8"), store)
        assertEquals(6, report.imported.size); assertTrue(report.errors.isEmpty())
        val restarted = Repository(Transport { error("OFFLINE") }, store)
        markets.forEach { assertEquals("MATCH", restarted.state.value.bundles[it]!!.alignment) }
    }
    @Test fun pickerContainsOnlySmallMetadataAndCancellationDoesNotSelectAFile() {
        val intent = LegacyExportDocument.createIntent()
        assertEquals(Intent.ACTION_CREATE_DOCUMENT, intent.action)
        assertEquals("application/json", intent.type)
        assertTrue(intent.categories.contains(Intent.CATEGORY_OPENABLE))
        assertEquals(setOf(Intent.EXTRA_TITLE), intent.extras!!.keySet())
        assertEquals("adipredictor-legacy.json", intent.getStringExtra(Intent.EXTRA_TITLE))
        assertNull(LegacyExportDocument.selectedUri(Activity.RESULT_CANCELED, Intent()))
        assertThrows(IOException::class.java) { LegacyExportDocument.selectedUri(Activity.RESULT_OK, Intent()) }
        assertThrows(IOException::class.java) { LegacyExportDocument.selectedUri(Activity.RESULT_OK, Intent().setData(Uri.parse("file:///private"))) }
    }
    @Test fun writeFailureIsReportedAndUnknownStorageKeysNeverExport() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val uri = Uri.parse("content://controlled.export/fail.json")
        shadowOf(context.contentResolver).registerOutputStream(uri, object : OutputStream() {
            override fun write(value: Int) { throw IOException("CONTROLLED_WRITE_FAILURE") }
        })
        val valid = LegacyExportDocument.encode(envelope(buildJsonObject { put("HK_LAST_VERIFIED_BOARD", "{\"first\":\"000052\"}") }))
        assertThrows(IOException::class.java) { LegacyExportDocument.write(context.contentResolver, uri, valid) }
        assertThrows(IOException::class.java) { LegacyExportDocument.encode(envelope(buildJsonObject { put("unrelated-token", "private") })) }
        assertThrows(IOException::class.java) { LegacyExportDocument.encode("{broken") }
        assertTrue(String(valid, Charsets.UTF_8).contains("000052"))
    }
}
