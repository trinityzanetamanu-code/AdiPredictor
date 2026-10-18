package com.adipredictor.app

import android.Manifest
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.graphics.Canvas as AndroidCanvas
import android.graphics.Picture
import android.view.View
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.adipredictor.data.*
import com.caverock.androidsvg.SVG
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.*

val pages = listOf("Analisis", "Data", "LiveDraw", "Statistik", "Tafsir", "Pengaturan", "Histori")
private val theme = darkColorScheme(primary = Color(0xff34d399), background = Color(0xff0f172a), surface = Color(0xff1e293b))

@Composable fun NativeApp(model: AppViewModel, route: Pair<String, String>?, consumeRoute: () -> Unit) {
    val snapshot by model.snapshot.collectAsStateWithLifecycle()
    val archive by model.archive.collectAsStateWithLifecycle()
    val svgs by model.svgs.collectAsStateWithLifecycle()
    val message by model.message.collectAsStateWithLifecycle()
    var page by rememberSaveable { mutableStateOf(model.preferences.get("page", "Analisis")) }
    var market by rememberSaveable { mutableStateOf(model.preferences.get("market", "HK")) }
    var selectedDate by rememberSaveable { mutableStateOf("") }
    val pageState = rememberSaveableStateHolder()
    LaunchedEffect(route) { route?.let { market = it.first; page = it.second; selectedDate = ""; model.clearArchive(); consumeRoute() } }
    LaunchedEffect(page, market) { model.preferences.set("page", page); model.preferences.set("market", market) }
    LaunchedEffect(selectedDate, market, snapshot.bundles[market]?.history) {
        if (selectedDate.isNotEmpty() && archive == null) snapshot.bundles[market]?.history.field("records").arr().find { it.string("target_date") == selectedDate }?.let { model.selectArchive(market, it) }
    }
    BackHandler(enabled = page != "Analisis" || selectedDate.isNotEmpty()) {
        if (selectedDate.isNotEmpty()) { selectedDate = ""; model.clearArchive() } else page = "Analisis"
    }
    MaterialTheme(colorScheme = theme) {
        Surface(Modifier.fillMaxSize()) {
            Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
                Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("AdiPredictor", style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f).padding(top = 12.dp))
                    TextButton(onClick = model::refresh, enabled = !snapshot.refreshing) { Text(if (snapshot.refreshing) "Memuat…" else "Refresh") }
                }
                Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 8.dp)) {
                    pages.forEach { name -> FilterChip(page == name, onClick = { page = name; selectedDate = ""; model.clearArchive() }, label = { Text(name) }, modifier = Modifier.padding(end = 8.dp)) }
                }
                if (page !in listOf("Tafsir", "Pengaturan")) Row(Modifier.padding(horizontal = 12.dp)) {
                    markets.forEach { code -> FilterChip(market == code, onClick = { market = code; selectedDate = ""; model.clearArchive() }, label = { Text(code) }, modifier = Modifier.padding(end = 8.dp)) }
                }
                if (message.isNotEmpty()) Text(message, Modifier.padding(12.dp), color = MaterialTheme.colorScheme.primary)
                val bundle = snapshot.bundles[market] ?: Bundle()
                pageState.SaveableStateProvider("$page:$market") { when (page) {
                    "Analisis" -> Analysis(market, bundle, snapshot) { page = "Histori" }
                    "Data" -> DataScreen(bundle)
                    "LiveDraw" -> LiveScreen(market, bundle, snapshot)
                    "Statistik" -> StatisticsScreen(bundle)
                    "Tafsir" -> TafsirScreen(snapshot.files["data/tafsir.json"])
                    "Pengaturan" -> SettingsScreen(model, snapshot)
                    "Histori" -> HistoryScreen(bundle, archive, svgs, selectedDate, onSelect = { selectedDate = it.string("target_date"); model.selectArchive(market, it) }, onBack = { selectedDate = ""; model.clearArchive() })
                } }
            }
        }
    }
}

@Composable private fun CardSection(title: String, content: @Composable ColumnScope.() -> Unit) {
    Card(Modifier.fillMaxWidth().padding(vertical = 5.dp)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary)
            content()
        }
    }
}
@Composable private fun CopyText(value: String, label: String = "Salin", tag: String = "") {
    val clipboard = LocalClipboardManager.current
    TextButton(onClick = { clipboard.setText(AnnotatedString(value)) }, modifier = if (tag.isEmpty()) Modifier else Modifier.testTag(tag)) { Text(label) }
}
// All published diagnostics remain accessible, including fields introduced by the backend.
@Composable private fun Details(title: String, value: JsonElement?) {
    if (value == null || value == JsonNull) return
    var open by rememberSaveable(title) { mutableStateOf(false) }
    CardSection(title) {
        TextButton(onClick = { open = !open }) { Text(if (open) "Tutup detail" else "Lihat detail") }
        if (open) SelectionContainer { Column { Fields(value) } }
    }
}
@Composable private fun Fields(value: JsonElement?, prefix: String = "") {
    when (value) {
        is JsonObject -> value.forEach { (key, item) ->
            if (item is JsonObject || item is JsonArray) {
                Text(key.replace('_', ' '), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
                Column(Modifier.padding(start = 8.dp)) { Fields(item, key) }
            } else Text("${key.replace('_', ' ')}: ${item.text().ifEmpty { "—" }}", style = MaterialTheme.typography.bodyMedium)
        }
        is JsonArray -> value.forEachIndexed { index, item ->
            if (item is JsonObject || item is JsonArray) { Text("${prefix.replace('_', ' ')} ${index + 1}"); Fields(item) }
            else Text(item.text(), style = MaterialTheme.typography.bodyMedium)
        }
        else -> Text(value.text().ifEmpty { "—" })
    }
}
@Composable private fun Analysis(market: String, bundle: Bundle, snapshot: Snapshot, history: () -> Unit) {
    val p = bundle.prediction
    LazyColumn(Modifier.testTag("content").padding(horizontal = 12.dp), contentPadding = PaddingValues(bottom = 24.dp)) {
        item { CardSection("Hasil terakhir $market") {
            bundle.rows.firstOrNull()?.let { row -> Text(row.number, style = MaterialTheme.typography.headlineLarge); Text("${row.date} · ${row.period}"); Text("${row.wire.string("source_name")} · ${row.wire.string("verification")}"); CopyText(row.number) } ?: Text("Belum ada dataset")
            Text("Data: ${snapshot.observations["data/${market.lowercase()}.json"]?.origin ?: "UNAVAILABLE"}")
            Text("Prediksi: ${bundle.alignment}")
            snapshot.files["runtime/board/$market"]?.let { Text("Observasi runtime: ${it.string("draw_date")} · ${it.string("derived_4d")} · belum canonical") }
            snapshot.observations["predictions/${market.lowercase()}/latest.json"]?.let { Text("${it.origin} · ${it.reason}") }
            Text("Diperiksa: ${snapshot.checkedAt}")
            Button(onClick = history) { Text("Buka Histori") }
        } }
        if (p != null) {
            item { CardSection("Target ${p.string("target_period")}") { Text(p.string("target_date")); Text("Basis ${p.string("prediction_basis_date")} · ${p.string("prediction_basis_result")}"); Text("Dihitung ${p.string("generated_at")}"); if (bundle.alignment != "MATCH") Text("Prediksi ini belum cocok dengan dataset canonical. Kandidat ditahan sampai sinkron.") } }
            if (bundle.alignment == "MATCH") {
                item { CandidateCards(p.field("final_candidates")) }
                item { Details("P1–P7 · model, diagnostic dan P5", p.field("models")) }
                item { Details("P8 · deterministik, di luar voting", p.field("p8_ai_instinct")) }
                item { Details("Konsensus raw", p.field("raw_consensus")) }
                item { Details("Konsensus weighted", p.field("weighted_consensus")) }
                item { Details("Konsensus seri · tie-break nomor naik", consensusTie(p)) }
                item { Details("Confidence dan jumlah kandidat", JsonObject(mapOf("confidence" to (p.field("confidence") ?: JsonNull), "candidate_counts" to (p.field("candidate_counts") ?: JsonNull)))) }
            }
            item { Details("Audit hasil sebelumnya", p.field("prior_prediction_audit")) }
            item { Details("Pola Visual · evaluasi terpisah dari gate P5", p.field("visual_patterns")) }
            item { Details("Revision dan validasi dataset", JsonObject(p.obj().filterKeys { it in listOf("dataset_revision", "dataset_fingerprint", "metadata_revision", "dataset_validation", "previous_dataset_fingerprint", "changed_from_previous") })) }
            item { Text(p.string("disclaimer"), Modifier.padding(vertical = 16.dp), style = MaterialTheme.typography.bodySmall) }
        }
    }
}
@Composable private fun CandidateCards(candidates: JsonElement?) {
    if (candidates == null) return
    CardSection("BBFS") { Fields(candidates.field("bbfs")); CopyText(candidates.field("bbfs").toString()) }
    CardSection("Kandidat 4D") {
        candidates.field("four_d").obj().filterKeys { it in listOf("main", "alternative", "reserve", "single_pair") }.forEach { (slot, candidate) ->
            val number = candidateNumber(candidate)
            Text("${slot.replace('_', ' ')}: $number ${candidate.string("star_label")}", style = MaterialTheme.typography.titleLarge)
            if (candidate is JsonObject) Text("Model ${candidate.field("supported_by").arr().joinToString { it.text() }} · skor ${candidate.string("reliability_weighted_score")} · rank ${candidate.string("weighted_rank")}")
            CopyText(number, tag = "copy4d:$slot")
        }
    }
    Details("3D · depan dan belakang", candidates.field("three_d"))
    Details("2D · depan, tengah, belakang dan kembar", candidates.field("two_d"))
    Details("Kandidat lengkap", candidates)
}
@Composable private fun DataScreen(bundle: Bundle) {
    var query by rememberSaveable { mutableStateOf("") }; var from by rememberSaveable { mutableStateOf("") }; var to by rememberSaveable { mutableStateOf("") }
    val rows = remember(bundle.rows, query, from, to) { searchRows(bundle.rows, query, from, to) }
    LazyColumn(Modifier.testTag("content").padding(horizontal = 12.dp), contentPadding = PaddingValues(bottom = 24.dp)) {
        item { OutlinedTextField(query, { query = it }, label = { Text("Cari nomor, tanggal atau periode") }, modifier = Modifier.fillMaxWidth()) }
        item { OutlinedTextField(from, { from = it }, label = { Text("Dari tanggal YYYY-MM-DD") }, modifier = Modifier.fillMaxWidth()) }
        item { OutlinedTextField(to, { to = it }, label = { Text("Sampai tanggal YYYY-MM-DD") }, modifier = Modifier.fillMaxWidth()) }
        item { Text("${rows.size} dari ${bundle.rows.size} hasil", Modifier.padding(12.dp)) }
        items(rows, key = { it.date }) { row -> CardSection("${row.date} · ${row.period}") { Text(row.number, style = MaterialTheme.typography.headlineMedium); Text("${row.wire.string("source_name")} · ${row.wire.string("verification")}"); CopyText(row.number) } }
    }
}
@Composable private fun StatisticsScreen(bundle: Bundle) {
    val counts = remember(bundle.rows) { digitCounts(bundle.rows) }; val maximum = counts.maxOrNull()?.coerceAtLeast(1) ?: 1
    LazyColumn(Modifier.testTag("content").padding(horizontal = 12.dp)) {
        item { CardSection("Matriks Frekuensi Digit (0–9)") { Text("${bundle.rows.size} hasil · ${bundle.rows.size * 4} digit") } }
        items((0..9).toList()) { digit -> CardSection("Digit $digit") { Text("${counts[digit]}x"); LinearProgressIndicator(progress = { counts[digit].toFloat() / maximum }, modifier = Modifier.fillMaxWidth()) } }
    }
}
@Composable private fun TafsirScreen(data: JsonElement?) {
    var query by rememberSaveable { mutableStateOf("") }; val found = remember(data, query) { searchTafsir(data, query) }
    LazyColumn(Modifier.testTag("content").padding(horizontal = 12.dp)) {
        item { Text("Tafsir tradisional untuk hiburan", Modifier.padding(12.dp)); OutlinedTextField(query, { query = it }, label = { Text("Cari tafsir") }, modifier = Modifier.fillMaxWidth()); Text("${found.size} tafsir", Modifier.padding(12.dp)) }
        items(found) { item -> CardSection(item.string("kataKunci")) { Text(item.string("angka"), style = MaterialTheme.typography.titleLarge); Text(item.string("deskripsi")); CopyText(item.string("angka")) } }
    }
}
@Composable private fun LiveScreen(market: String, bundle: Bundle, snapshot: Snapshot) {
    var mode by rememberSaveable { mutableStateOf("4D") }
    val live = snapshot.files["data/live-draw.json"]
    val runtime = snapshot.files["runtime/board/$market"]
    val shared = live.field("markets").field(market)
    val board = if (runtime != null && runtime.string("draw_date") >= shared.string("draw_date")) runtime else shared
    val health = live.field("status").field(market)
    val official = snapshot.files["data/singapore-official.json"].field(if (mode == "TOTO") "official_toto" else "official_4d")
    LazyColumn(Modifier.testTag("content").padding(horizontal = 12.dp)) {
        item { CardSection("LiveDraw $market · sumber dan cache") {
            Text("${snapshot.observations["data/live-draw.json"]?.origin} · ${snapshot.observations["data/live-draw.json"]?.reason}")
            snapshot.observations["runtime/board/$market"]?.let { Text("${it.origin} · ${it.reason}") }
            Text("Canonical: ${bundle.rows.firstOrNull()?.date ?: "—"} · ${bundle.rows.firstOrNull()?.number ?: "—"}")
            Text("Papan runtime tidak mengganti dataset canonical.")
            Text("Jadwal: ${drawWindow(if (market == "SGP") "SGP_$mode" else market, java.time.Instant.now())}")
            if (market == "SGP") Row { listOf("4D", "TOTO").forEach { label -> FilterChip(mode == label, { mode = label }, label = { Text(label) }, modifier = Modifier.padding(end = 8.dp)) } }
        } }
        item { CardSection("Papan angka") {
            if (board == null) Text("Papan sumber belum tersedia. Periksa status sumber di bawah.") else Fields(board)
        } }
        item { Details("Status sumber / konflik / cache", health) }
        if (market == "SGP") {
            item { CardSection("Singapore resmi · $mode") { Fields(official) } }
            item { ExternalLink("Buka hasil resmi", "https://www.singaporepools.com.sg/en/product/pages/${if (mode == "TOTO") "toto" else "4d"}_results.aspx") }
            item { ExternalLink("Putar rekaman draw terakhir · YouTube", "https://www.youtube.com/playlist?list=${if (mode == "TOTO") "PLaXhIWKbyl3VHtnNcMwG6KOg04q6QQXge" else "PLaXhIWKbyl3U-lDz1iRRZ8-rabk_uZbCY"}") }
        } else item { ExternalLink("Buka halaman sumber $market", if (market == "HK") "https://www.hongkongpools.com/live.html" else "https://www.sydneypoolstoday.com/live.html") }
    }
}
@Composable private fun ExternalLink(label: String, url: String) {
    val context = LocalContext.current
    TextButton(onClick = { runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) } }) { Text(label) }
}
@Composable private fun HistoryScreen(bundle: Bundle, archive: JsonElement?, svgs: Map<String, String>, date: String, onSelect: (JsonElement) -> Unit, onBack: () -> Unit) {
    var query by rememberSaveable { mutableStateOf("") }
    val records = bundle.history.field("records").arr().filter { query.isBlank() || "${it.string("target_date")} ${it.string("target_period")}".contains(query, true) }
    LazyColumn(Modifier.testTag("content").padding(horizontal = 12.dp), contentPadding = PaddingValues(bottom = 24.dp)) {
        item { Text("Histori · ${bundle.history.string("schema_version").ifEmpty { "v1" }}", style = MaterialTheme.typography.titleLarge) }
        if (date.isEmpty()) {
            item { OutlinedTextField(query, { query = it }, label = { Text("Cari arsip") }, modifier = Modifier.fillMaxWidth()) }
            items(records) { record -> CardSection("${record.string("target_date")} · ${record.string("target_period")}") {
                Text("Basis ${record.string("basis_latest_date")} · ${record.string("basis_latest_result")}")
                Text("Aktual ${record.field("actual_result").string("number").ifEmpty { "menunggu" }}")
                Button(onClick = { onSelect(record) }) { Text("Buka arsip ${record.string("target_date")}") }
            } }
        } else {
            item { TextButton(onClick = onBack) { Text("Kembali ke daftar") } }
            if (archive != null) {
                item { CardSection("Arsip ${archive.string("target_date")}") {
                    Text("${archive.string("target_period")} · basis ${archive.string("prediction_basis_date").ifEmpty { archive.field("latest_result").string("date") }} ${archive.string("prediction_basis_result").ifEmpty { archive.field("latest_result").string("number") }}")
                    Text("Fingerprint ${archive.string("dataset_fingerprint").ifEmpty { "tidak tersedia pada arsip asli" }}")
                } }
                item { CandidateCards(archive.field("final_candidates") ?: archive.field("quick_view")) }
                item { Details("Quick View", archive.field("quick_view")) }
                item { Details("Model P1–P7 dan P5", archive.field("models")) }
                item { Details("P8", archive.field("p8_ai_instinct")) }
                item { Details("Konsensus raw", archive.field("raw_consensus")) }
                item { Details("Konsensus weighted", archive.field("weighted_consensus")) }
                item { Details("Outcome audit", bundle.history.field("records").arr().find { it.string("target_date") == date }.field("outcome_audit") ?: archive.field("outcome_audit")) }
                items(archive.field("visual_patterns").arr()) { pattern -> CardSection("Pola Visual · ${pattern.string("pattern_name")}") {
                    val xml = svgs[pattern.string("image_path")]
                    if (xml == null) Text("SVG asli belum tersedia") else OriginalSvg(xml, pattern.string("image_path"))
                    Details("Detail pola ${pattern.string("pattern_name")}", pattern)
                } }
                item { Details("Payload arsip lengkap", archive) }
            }
        }
    }
}
@Composable private fun OriginalSvg(xml: String, path: String) {
    var zoom by rememberSaveable { mutableFloatStateOf(1f) }
    var picture by remember(xml) { mutableStateOf<Picture?>(null) }
    var renderError by remember(xml) { mutableStateOf<String?>(null) }
    LaunchedEffect(xml) {
        val parsed = withContext(Dispatchers.Default) { runCatching { SVG.getFromString(xml).renderToPicture() } }
        picture = parsed.getOrNull(); renderError = parsed.exceptionOrNull()?.let { "${it.javaClass.simpleName}: ${it.message}" }
    }
    if (picture == null) Text(renderError?.let { "SVG gagal dirender: $it" } ?: "Memuat SVG…")
    else {
        Text("SVG asli · zoom ${"%.1f".format(zoom)}×")
        Slider(zoom, { zoom = it }, valueRange = 1f..3f)
        BoxWithConstraints(Modifier.fillMaxWidth()) {
            val imageWidth = maxWidth * zoom
            Box(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState())) {
            AndroidView(factory = { context -> object : View(context) {
                var source: Picture? = null
                override fun onDraw(canvas: AndroidCanvas) { super.onDraw(canvas); source?.let { canvas.save(); canvas.scale(width.toFloat() / it.width, height.toFloat() / it.height); canvas.drawPicture(it); canvas.restore() } }
            } }, update = { view -> view.source = picture; view.invalidate() }, modifier = Modifier.testTag("svg:$path").width(imageWidth).height(imageWidth * (picture!!.height.toFloat() / picture!!.width)))
            }
        }
    }
}
@Composable private fun SettingsScreen(model: AppViewModel, snapshot: Snapshot) {
    val context = LocalContext.current
    var notifications by remember { mutableStateOf(model.preferences.notifications()) }
    val migrationMessage by model.message.collectAsStateWithLifecycle()
    LaunchedEffect(migrationMessage) { notifications = model.preferences.notifications() }
    val clipboard = LocalClipboardManager.current
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        notifications = notifications + ("master" to granted); model.preferences.notifications(notifications); scheduleReminders(context)
    }
    val import = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        uri?.let(model::importLegacyDocument)
    }
    LazyColumn(Modifier.testTag("content").padding(horizontal = 12.dp), contentPadding = PaddingValues(bottom = 24.dp)) {
        item { CardSection("Notifikasi") {
            notificationDefaults.keys.forEach { key -> Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(key, Modifier.weight(1f).padding(top = 12.dp))
                Switch(notifications[key] == true, onCheckedChange = { enabled ->
                    if (key == "master" && enabled && Build.VERSION.SDK_INT >= 33) permission.launch(Manifest.permission.POST_NOTIFICATIONS)
                    else { notifications = notifications + (key to enabled); model.preferences.notifications(notifications); scheduleReminders(context) }
                })
            } }
            Text("Preferensi dan deduplikasi tersimpan setelah restart.")
        } }
        item { CardSection("Data pengguna lama") {
            Text("Penyimpanan Capacitor terpisah. Impor ekspor localStorage JSON; cache native yang lebih baru dipertahankan.")
            Button(onClick = { import.launch(arrayOf("application/json", "text/plain")) }) { Text("Impor preferensi/cache lama") }
            TextButton(onClick = { clipboard.getText()?.text?.let(model::importLegacy) }) { Text("Impor JSON dari clipboard") }
        } }
        item { CardSection("Versi") { Text("${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE}) · Android native preview"); Text("Backend produksi Kotlin · stable React/Capacitor tetap tersedia"); Fields(snapshot.files["app-release.json"]) } }
        item { Details("Diagnostic collector", snapshot.files["data/collector-status.json"]) }
        item { CardSection("Diagnostic sinkronisasi") { snapshot.observations.forEach { (path, observation) -> Text("$path\n${observation.origin}: ${observation.reason}\n${observation.checkedAt}") }; CopyText(snapshot.observations.toString(), "Salin diagnostic") } }
    }
}
