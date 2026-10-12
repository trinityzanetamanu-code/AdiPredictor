package adipredictor.production

import adipredictor.core.*
import adipredictor.io.Json
import java.nio.file.*
import java.time.*
import java.time.format.DateTimeFormatter
import kotlin.io.path.*

data class ProductionOptions(
    val root: Path,
    val data: Path,
    val config: Path,
    val output: Path,
    val staging: Path,
    val markets: List<String>,
    val force: Boolean = false,
    val simulate: Boolean = false,
    val sourceId: String = "direct-cli",
    val buildId: String = "direct-cli",
)

class ProductionAdapter(
    private val now: () -> String = {
        ZonedDateTime.now(ZoneId.of("Asia/Jakarta"))
            .format(DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ssXXX"))
    },
    private val beforeValidation: (Path) -> Unit = {},
) {
    private fun objectOrMissing(path: Path): Map<String, Any?>? {
        if (!path.exists()) return null
        return try {
            Json.objectAt(path)
        } catch (e: com.google.gson.JsonParseException) {
            emptyMap()
        }
    }

    private fun archive(path: Path): Map<String, Any?>? =
        try {
            Json.objectAt(path)
        } catch (e: java.io.IOException) {
            null
        } catch (e: com.google.gson.JsonParseException) {
            null
        }

    private fun equalRevision(value: Any?) = value is Number && value.toDouble() == 3.0

    private fun engine(existing: Map<String, Any?>) =
        existing.getOrDefault("engine_version", existing["engine"])

    private fun history(path: Path): History {
        val value = Json.read(path)
        require(value is List<*>) { "Dataset must be an array: $path" }
        val rows =
            value
                .map {
                    require(it is Map<*, *>) { "Dataset row must be an object" }
                    it.map()
                }
                .filter { truth(it["result_date"]) }
                .sortedBy { it["result_date"] as String }
                .map(Draw::from)
        require(rows.size > MINIMUM_TRAINING_RECORDS) { "Dataset too short (${rows.size})" }
        return rows
    }

    private fun index(market: String, history: History, directory: Path): Boolean {
        val archives = linkedMapOf<String, Map<String, Any?>>()
        val archiveDir = directory.resolve("archive")
        if (archiveDir.exists())
            Files.list(archiveDir).use { entries ->
                entries
                    .filter { it.name.endsWith(".json") }
                    .sorted()
                    .forEach { p ->
                        archive(p)?.let {
                            archives["public/predictions/${market.lowercase()}/archive/${p.name}"] =
                                it
                        }
                    }
            }
        val text = Json.text(historyIndex(market, history, archives))
        val path = directory.resolve("history.json")
        if (path.exists() && path.readText(Charsets.UTF_8) == text) return false
        writeText(path, text)
        return true
    }

    private fun writePrediction(
        market: String,
        payload: Obj,
        directory: Path,
        force: Boolean,
    ): Pair<Boolean, String> {
        val latestPath = directory.resolve("latest.json")
        val existing = objectOrMissing(latestPath)
        if (
            !force &&
                !existing.isNullOrEmpty() &&
                equalRevision(existing["metadata_revision"]) &&
                existing["dataset_fingerprint"] == payload["dataset_fingerprint"] &&
                engine(existing) == ENGINE_VERSION &&
                existing["latest_result"].map()["date"] == payload["latest_result"].map()["date"] &&
                numberOf(existing["latest_result"].map().getOrDefault("number", "")) ==
                    payload["latest_result"].map()["number"]
        )
            return false to "unchanged"
        val text = Json.text(payload)
        writeText(latestPath, text)
        val target = payload["target_date"] as String
        val archivePath = directory.resolve("archive/$target.json")
        if (!archivePath.exists() || target > (payload["latest_result"].map()["date"] as String))
            writeText(archivePath, text)
        return true to "written"
    }

    private fun validatePayload(payload: Map<String, Any?>, market: String, history: History) {
        require(payload["market"] == market && payload["engine_version"] == ENGINE_VERSION)
        require(
            payload["schema_version"].num() == 2.0 && equalRevision(payload["metadata_revision"])
        )
        OffsetDateTime.parse(payload["generated_at"] as String)
        require(payload["dataset_fingerprint"] == datasetFingerprint(market, history))
        require(payload["dataset_revision"] == datasetRevision(market, history))
        require(
            payload["latest_result"].map()["date"] == history.last().date &&
                payload["latest_result"].map()["number"] == history.last().number
        )
        require((payload["target_date"] as String) > history.last().date)
        require(
            payload["models"].map().keys.containsAll(MODELS) &&
                payload["audit_snapshot"].map().isNotEmpty()
        )
        for (name in MODELS) {
            val model = payload["models"].map()[name].map()
            for (size in listOf(5, 6)) require((model["bbfs$size"] as String).length == size)
            require(
                model["4d_top3"].strings().size == 3 &&
                    model["4d_top3"].strings().all { it.length == 4 && it.all(Char::isDigit) }
            )
            for (field in
                listOf(
                    "3d_front_top5",
                    "3d_back_top5",
                    "2d_front_top5",
                    "2d_middle_top5",
                    "2d_back_top5",
                )) require(model[field].strings().size == 5)
        }
        require(payload["candidate_counts"].map()["total_direct_number_candidates"].int() == 38)
        val p8 = payload["p8_ai_instinct"].map()
        require(p8["fingerprint"] == sha256(pythonJson(p8.filterKeys { it != "fingerprint" })))
        Json.text(payload) // also rejects NaN/infinity and unsupported output values
    }

    fun run(options: ProductionOptions): Obj {
        val root = options.root.toRealPath()
        val expected = root.resolve("public/predictions")
        require(
            options.output.toAbsolutePath().normalize() == expected &&
                canonical(options.output) == expected
        ) {
            "Production output must be exactly ROOT/public/predictions, without symlinks"
        }
        require(
            options.data.toAbsolutePath().normalize() == root.resolve("public/data") &&
                canonical(options.data) == root.resolve("public/data")
        )
        require(
            options.config.toAbsolutePath().normalize() ==
                root.resolve("config/collector_sources.json") &&
                canonical(options.config) == root.resolve("config/collector_sources.json")
        )
        val staging = canonical(options.staging)
        require(!staging.startsWith(root.resolve("public")) && !root.startsWith(staging)) {
            "Staging must be outside public and may not contain ROOT"
        }
        require(!options.staging.exists()) { "Choose a fresh staging directory" }
        require(
            options.markets.isNotEmpty() &&
                options.markets.all { it in listOf("HK", "SDY", "SGP") } &&
                options.markets.distinct() == options.markets
        )
        val before = treeHashes(options.output)
        files(options.data)
        require(!Files.isSymbolicLink(options.config))
        val inputFiles =
            options.markets.associateWith { options.data.resolve("${it.lowercase()}.json") }
        val inputHashes =
            inputFiles.mapValues { digest(it.value.readBytes()) } +
                ("config" to digest(options.config.readBytes()))
        staging.createDirectories()
        val snapshotData = staging.resolve("inputs/data")
        snapshotData.createDirectories()
        for ((market, path) in inputFiles) Files.copy(
            path,
            snapshotData.resolve("${market.lowercase()}.json"),
        )
        val snapshotConfig = staging.resolve("inputs/config.json")
        Files.copy(options.config, snapshotConfig)
        require(
            inputFiles.keys.associateWith {
                digest(snapshotData.resolve("${it.lowercase()}.json").readBytes())
            } + ("config" to digest(snapshotConfig.readBytes())) == inputHashes
        ) {
            "Input moved while snapshotting"
        }
        val working = staging.resolve("working/public/predictions")
        copyTree(options.output, working)
        val config = Json.objectAt(snapshotConfig)
        val summaries = obj()
        val histories = linkedMapOf<String, History>()
        var changedAny = false
        for (market in options.markets) {
            val h = history(snapshotData.resolve("${market.lowercase()}.json"))
            histories[market] = h
            val fingerprint = datasetFingerprint(market, h)
            val dir = working.resolve(market.lowercase())
            val latestPath = dir.resolve("latest.json")
            val existing = objectOrMissing(latestPath)
            if (
                !options.force &&
                    existing != null &&
                    equalRevision(existing["metadata_revision"]) &&
                    existing["dataset_fingerprint"] == fingerprint &&
                    engine(existing) == ENGINE_VERSION
            ) {
                // Python skips at this point. Validate the cached output before accepting it.
                validatePayload(existing, market, h)
                changedAny = index(market, h, dir) || changedAny
                summaries[market] =
                    obj(
                        "status" to "unchanged",
                        "latest" to existing["latest_result"],
                        "target_date" to existing["target_date"],
                        "dataset_fingerprint" to fingerprint,
                    )
                println(
                    "EXECUTOR=KOTLIN PHASE=staged MARKET=$market INPUT_FINGERPRINT=$fingerprint STATUS=unchanged COMPUTE=skipped"
                )
                continue
            }
            // Validate schedule/data before calculation; prevent an invalid package being applied.
            require(config["markets"].map()[market] is Map<*, *>) {
                "Missing market configuration: $market"
            }
            if (market == "SGP")
                require(
                    marketWeekdays(market, config).isNotEmpty() &&
                        marketWeekdays(market, config).all { it in 0..6 }
                )
            var previous = existing
            if (
                options.force &&
                    !existing.isNullOrEmpty() &&
                    existing["dataset_fingerprint"] == fingerprint &&
                    !truth(existing["previous_dataset_fingerprint"])
            ) {
                val path =
                    dir.resolve("archive/${existing["latest_result"].map()["date"] ?: ""}.json")
                if (path.exists())
                    archive(path)?.let {
                        if (it["dataset_fingerprint"] != fingerprint) previous = it
                    }
            }
            val priorPath = dir.resolve("archive/${h.last().date}.json")
            val prior = if (priorPath.exists()) archive(priorPath) else null
            val result =
                buildPrediction(
                    PredictionInputs(
                        market,
                        h,
                        config,
                        "",
                        previous,
                        prior,
                        "public/predictions/${market.lowercase()}/archive/${h.last().date}.json",
                    )
                )
            result.payload["generated_at"] = now()
            validatePayload(result.payload, market, h)
            for ((relative, svg) in result.svgs) writeText(
                working.resolve(relative.removePrefix("predictions/")),
                svg,
            )
            val (changed, status) = writePrediction(market, result.payload, dir, options.force)
            changedAny = changed || changedAny
            changedAny = index(market, h, dir) || changedAny
            val q = result.payload["quick_view"].map()
            summaries[market] =
                obj(
                    "status" to status,
                    "latest" to result.payload["latest_result"],
                    "target_date" to result.payload["target_date"],
                    "target_period" to result.payload["target_period"],
                    "four_d_main" to q["four_d"].map()["main"].map()["number"],
                    "bbfs6" to q["bbfs"].map()["main6"],
                    "dataset_count" to h.size,
                    "dataset_fingerprint" to fingerprint,
                )
            println(
                "EXECUTOR=KOTLIN PHASE=staged MARKET=$market INPUT_FINGERPRINT=$fingerprint STATUS=$status"
            )
        }
        val statusPath = working.resolve("status.json")
        if (changedAny || options.force || !statusPath.exists()) {
            val old = objectOrMissing(statusPath)?.get("markets").map()
            Json.write(
                statusPath,
                obj(
                    "generated_at" to now(),
                    "engine" to ENGINE_VERSION,
                    "markets" to (old + summaries),
                ),
            )
        }
        beforeValidation(working)
        for ((market, h) in histories) {
            val dir = working.resolve(market.lowercase())
            val payload = Json.objectAt(dir.resolve("latest.json"))
            validatePayload(payload, market, h)
            Json.objectAt(dir.resolve("history.json"))
            for (value in payload["visual_patterns"].list()) {
                val relative = value.map()["image_path"] as String
                val p = working.resolve(relative.removePrefix("predictions/")).normalize()
                require(p.startsWith(working) && p.exists()) { "Missing or unsafe SVG: $relative" }
                val factory = javax.xml.parsers.DocumentBuilderFactory.newInstance()
                factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true)
                require(
                    factory.newDocumentBuilder().parse(p.toFile()).documentElement.tagName == "svg"
                )
            }
        }
        Json.objectAt(statusPath)
        val after = treeHashes(working)
        require(after.keys.containsAll(before.keys)) { "Existing archive/SVG would be deleted" }
        for ((market, h) in histories) {
            for ((relative, hash) in before) {
                val prefix = "${market.lowercase()}/archive/"
                if (relative.startsWith(prefix) && relative.endsWith(".json")) {
                    val date = relative.removePrefix(prefix).removeSuffix(".json")
                    if (date <= h.last().date)
                        require(after[relative] == hash) { "Resolved archive changed: $relative" }
                }
            }
        }
        val currentOutput = treeHashes(options.output)
        require(currentOutput == before) {
            "Prediction input changed during staging; no output applied: ${currentOutput.keys.filter { currentOutput[it] != before[it] }}"
        }
        val currentInputs =
            inputFiles.mapValues { digest(it.value.readBytes()) } +
                ("config" to digest(options.config.readBytes()))
        require(currentInputs == inputHashes) {
            "Dataset/config input changed during staging; no output applied"
        }
        val changed = after.keys.filter { after[it] != before[it] }.sorted()
        val report =
            obj(
                "backend" to "KOTLIN",
                "source_id" to options.sourceId,
                "build_identity" to options.buildId,
                "input_sha256" to inputHashes,
                "markets" to summaries,
                "changed_files" to changed,
                "before" to before,
                "after" to after,
                "simulate" to options.simulate,
                "applied" to !options.simulate,
            )
        Json.write(staging.resolve("report.json"), report)
        if (!options.simulate)
            applyTransaction(working, options.output, changed, staging.resolve("backups"))
        println(
            "EXECUTOR=KOTLIN SOURCE_ID=${options.sourceId} BUILD_ID=${options.buildId} FILES_CHANGED=${changed.size} APPLIED=${!options.simulate}"
        )
        return report
    }
}
