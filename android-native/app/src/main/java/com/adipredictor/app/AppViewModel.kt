package com.adipredictor.app

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.adipredictor.data.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.sync.Mutex
import kotlinx.serialization.json.JsonElement

class AppViewModel(application: Application) : AndroidViewModel(application) {
    private val store = DiskStore(application)
    val preferences = Preferences(store)
    private val repository = Repository(NativeServices.transport(application), store, AssetsTransport(application))
    val snapshot = repository.state
    private val _archive = MutableStateFlow<JsonElement?>(null)
    val archive = _archive.asStateFlow()
    private val _svg = MutableStateFlow<Map<String, String>>(emptyMap())
    val svgs = _svg.asStateFlow()
    private val _message = MutableStateFlow("")
    val message = _message.asStateFlow()
    private var foregroundJob: Job? = null
    private var archiveJob: Job? = null
    private var archiveGeneration = 0L
    private val refreshMutex = Mutex()
    fun foreground(active: Boolean) {
        foregroundJob?.cancel()
        foregroundJob = if (active) viewModelScope.launch(Dispatchers.IO) {
            scheduleReminders(getApplication())
            while (isActive) { refreshNow(); delay(if (drawWindow("HK", java.time.Instant.now()) == "LIVE_WINDOW") 10000 else 30000) }
        } else null
    }
    fun refresh() { viewModelScope.launch(Dispatchers.IO) { refreshNow() } }
    private suspend fun refreshNow() {
        if (!refreshMutex.tryLock()) return
        val prior = snapshot.value.takeIf { it.bundles.values.any { b -> b.rows.isNotEmpty() } }
        try {
            if (repository.refresh()) notices(prior, snapshot.value, preferences.notifications(), BuildConfig.VERSION_CODE).forEach { notice -> notify(getApplication(), notice, preferences) }
            coroutineScope { listOf("HK", "SDY").map { market -> async {
                try {
                    val board = NativeServices.boards().load(market, snapshot.value.bundles[market]?.rows?.firstOrNull()?.date ?: "")
                    repository.observe(market, board)
                } catch (e: CancellationException) { throw e }
                catch (e: Exception) { repository.observe(market, null, e.message?.take(400) ?: "RUNTIME_FETCH_FAILED") }
            } }.awaitAll() }
        } catch (e: CancellationException) { throw e }
        catch (e: Exception) { _message.value = e.message ?: "Refresh gagal" }
        finally { refreshMutex.unlock() }
    }
    fun selectArchive(market: String, record: JsonElement) {
        archiveJob?.cancel(); val generation = ++archiveGeneration
        _archive.value = null; _svg.value = emptyMap(); _message.value = "Memuat arsip ${record.string("target_date")}"
        archiveJob = viewModelScope.launch(Dispatchers.IO) {
            try {
                val selected = repository.archive(market, record)
                if (generation != archiveGeneration) return@launch
                _archive.value = selected; _message.value = ""
                selected.field("visual_patterns").arr().forEach { pattern ->
                    val path = pattern.string("image_path")
                    try {
                        val xml = repository.svg(market, selected.string("target_date"), path)
                        if (generation == archiveGeneration) _svg.update { it + (path to xml) }
                    } catch (e: CancellationException) { throw e }
                    catch (e: Exception) { if (generation == archiveGeneration) _message.value = "SVG $path: ${e.message}" }
                }
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) { if (generation == archiveGeneration) _message.value = "Arsip: ${e.message}" }
        }
    }
    fun clearArchive() { archiveJob?.cancel(); archiveGeneration++; _archive.value = null; _svg.value = emptyMap(); _message.value = "" }
    fun importLegacyDocument(uri: android.net.Uri) { viewModelScope.launch(Dispatchers.IO) {
        runCatching {
            getApplication<Application>().contentResolver.openInputStream(uri)?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }
                ?: error("Dokumen tidak dapat dibaca")
        }.onSuccess(::importLegacy).onFailure { _message.value = "Impor gagal: ${it.message}" }
    } }
    fun importLegacy(text: String) { viewModelScope.launch(Dispatchers.IO) {
        runCatching { migrateLegacy(text, store) }.onSuccess { _message.value = "Migrasi: ${it.imported.size} diimpor, ${it.skipped.size} dilewati, ${it.errors.joinToString()}" }
            .onFailure { _message.value = "Migrasi gagal: ${it.message}" }
        repository.reloadCacheAfterMigration(); scheduleReminders(getApplication()); refreshNow()
    } }
}
