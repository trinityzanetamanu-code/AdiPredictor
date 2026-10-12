package com.adipredictor.app

import com.adipredictor.data.*
import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.*

fun interface DirectBoardSource { suspend fun load(market: String, datasetDate: String): JsonElement }
class DirectBoards : DirectBoardSource {
    private suspend fun text(url: String, headers: Map<String, String> = emptyMap()): Pair<String, String> = withContext(Dispatchers.IO) {
        val connection = URL(url).openConnection() as HttpURLConnection
        try {
            connection.connectTimeout = 12000; connection.readTimeout = 15000; connection.useCaches = false
            headers.forEach { (key, value) -> connection.setRequestProperty(key, value) }
            check(connection.responseCode == 200) { "HTTP_${connection.responseCode}" }
            connection.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() } to
                connection.headerFields.filterKeys { it?.equals("Set-Cookie", true) == true }.values.flatten().joinToString("; ") { it.substringBefore(';') }
        } finally { connection.disconnect() }
    }
    override suspend fun load(market: String, datasetDate: String): JsonElement {
        if (market == "SDY") {
            val page = "https://www.sydneypoolstoday.com/live.html"
            val (_, cookie) = text(page)
            return parseLiveBoard(text("https://www.sydneypoolstoday.com/getLiveContent", mapOf("Referer" to page, "X-Requested-With" to "XMLHttpRequest", "Cookie" to cookie)).first, market, page)
        }
        require(market == "HK")
        val boards = mutableListOf<JsonObject>(); val errors = mutableListOf<JsonElement>()
        for (url in listOf("https://www.hongkongpools.com/live.html", "https://www.hongkongpools.com/live", "https://rankcrack.com/hk.php")) {
            try {
                val board = parseLiveBoard(text(url).first, market, url)
                check(board.string("draw_date") >= datasetDate) { "SOURCE_STALE" }; boards += board
            } catch (e: kotlinx.coroutines.CancellationException) { throw e }
            catch (e: Exception) { errors += JsonObject(mapOf("source_url" to JsonPrimitive(url), "error" to JsonPrimitive(e.message ?: "FETCH_FAILED"))) }
        }
        val selected = boards.sortedByDescending { it.string("draw_date") }.firstOrNull() ?: error("HK_FETCH_FAILED: $errors")
        return JsonObject(selected + mapOf("fetch_errors" to JsonArray(errors), "source_conflicts" to JsonArray(boards.filter { it.string("draw_date") == selected.string("draw_date") && it.string("first") != selected.string("first") })))
    }
}
