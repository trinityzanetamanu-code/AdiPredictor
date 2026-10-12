package adipredictor.cli

import adipredictor.core.*
import com.google.gson.GsonBuilder
import com.google.gson.ToNumberPolicy
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardOpenOption.CREATE_NEW
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import kotlin.io.path.*
import kotlin.system.exitProcess

val gson =
    GsonBuilder()
        .serializeNulls()
        .disableHtmlEscaping()
        .setObjectToNumberStrategy(ToNumberPolicy.LONG_OR_DOUBLE)
        .create()

fun readJson(path: String): Any? =
    gson.fromJson(Path.of(path).readText(Charsets.UTF_8), Any::class.java)

fun jsonText(value: Any?) = gson.toJson(value) + "\n"

fun readableArchive(path: String): Map<String, Any?>? =
    try {
        readJson(path).map()
    } catch (e: java.io.IOException) {
        null
    } catch (e: com.google.gson.JsonParseException) {
        null
    }

fun history(path: String, minimum: Boolean = true): History {
    val rows =
        readJson(path)
            .list()
            .map { it.map() }
            .filter { truth(it["result_date"]) }
            .sortedBy { it["result_date"] as String }
            .map(Draw::from)
    if (minimum)
        require(rows.size > MINIMUM_TRAINING_RECORDS) { "dataset too short (${rows.size})" }
    return rows
}

fun canonical(path: Path): Path {
    val absolute = path.toAbsolutePath().normalize()
    return if (absolute.exists()) absolute.toRealPath()
    else absolute.parent?.let { canonical(it).resolve(absolute.fileName) } ?: absolute
}

fun guardOutput(path: Path) {
    val target = canonical(path)
    require(target.none { it.toString() == "public" }) {
        "Shadow output must not target a public directory"
    }
    require(!target.exists()) {
        "Output already exists; choose a fresh directory/file. Archives are never overwritten."
    }
}

fun writeNew(path: Path, value: String) {
    path.parent?.createDirectories()
    Files.writeString(path, value, Charsets.UTF_8, CREATE_NEW)
}

fun options(args: List<String>): Map<String, String> {
    require(args.size % 2 == 0) { "Options require explicit values" }
    return args.chunked(2).associate {
        require(it[0].startsWith("--"))
        it[0].drop(2) to it[1]
    }
}

fun generatedAt(clock: String?): String =
    if (clock != null)
        OffsetDateTime.parse(clock)
            .atZoneSameInstant(ZoneId.of("Asia/Jakarta"))
            .format(DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ssXXX"))
    else
        ZonedDateTime.now(ZoneId.of("Asia/Jakarta"))
            .format(DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ssXXX"))

fun compute(request: Map<String, Any?>, output: Path): Obj {
    val market = request["market"] as String
    require(market in listOf("HK", "SDY", "SGP"))
    val h = history(request["input"] as String)
    val config = readJson(request["config"] as String).map()
    val previous = (request["previous"] as? String)?.let { readJson(it).map() }
    val prior = (request["prior_archive"] as? String)?.let(::readableArchive)
    val started = System.nanoTime()
    val result =
        buildPrediction(
            PredictionInputs(
                market,
                h,
                config,
                generatedAt(request["clock"] as? String),
                previous,
                prior,
                request["prior_archive_path"] as? String,
            )
        )
    for ((relative, svg) in result.svgs) writeNew(output.resolve("public").resolve(relative), svg)
    val seconds = (System.nanoTime() - started) / 1e9
    writeNew(output.resolve("prediction.json"), jsonText(result.payload))
    writeNew(output.resolve("model-matrices.json"), jsonText(result.matrices))
    (request["archives"] as? String)?.let { directory ->
        val archives = linkedMapOf<String, Map<String, Any?>>()
        Files.list(Path.of(directory)).use { files ->
            files
                .filter { it.fileName.toString().endsWith(".json") }
                .sorted()
                .forEach { file ->
                    readableArchive(file.toString())?.let {
                        archives[
                            "public/predictions/${market.lowercase()}/archive/${file.fileName}"] =
                            it
                    }
                }
        }
        writeNew(output.resolve("history-index.json"), jsonText(historyIndex(market, h, archives)))
    }
    val actual = request["actual"] as? String
    if (actual != null) {
        writeNew(
            output.resolve("outcome-audit.json"),
            jsonText(auditPredictionPayload(result.payload, actual)),
        )
        val row =
            Draw(
                request["actual_date"] as? String ?: result.payload["target_date"] as String,
                actual,
                request["actual_period"] as? String ?: result.payload["target_period"] as? String,
            )
        writeNew(
            output.resolve("history-record.json"),
            jsonText(
                historyRecord(
                    market,
                    result.payload,
                    row,
                    "public/predictions/${market.lowercase()}/archive/${result.payload["target_date"]}.json",
                )
            ),
        )
    }
    writeNew(
        output.resolve("runtime.json"),
        jsonText(
            obj(
                "compute_seconds" to seconds,
                "records" to h.size,
                "market" to market,
                "engine" to "KOTLIN",
            )
        ),
    )
    return obj(
        "market" to market,
        "records" to h.size,
        "compute_seconds" to seconds,
        "dataset_fingerprint" to result.payload["dataset_fingerprint"],
    )
}

fun probes(request: Map<String, Any?>): Obj {
    val config = readJson(request["config"] as String).map()
    val rows = request["rows"].list()
    val output = obj()
    val normalization =
        request["normalization"].list().map { value ->
            try {
                obj("valid" to true, "number" to numberOf(value))
            } catch (e: IllegalArgumentException) {
                obj("valid" to false)
            }
        }
    output["normalization"] = normalization
    val h = rows.map { Draw.from(it.map()) }
    output["validation"] = validateDataset(request["market"] as String, h, config)
    output["dataset_fingerprint"] = datasetFingerprint(request["market"] as String, h)
    output["dataset_revision"] = datasetRevision(request["market"] as String, h)
    output["targets"] =
        request["targets"].list().map { value ->
            val target = value.map()
            obj(
                "market" to target["market"],
                "basis" to target["basis"],
                "target" to
                    targetDateFor(
                            target["market"] as String,
                            java.time.LocalDate.parse(target["basis"] as String),
                            config,
                        )
                        .toString(),
            )
        }
    output["periods"] = request["periods"].list().map { incrementPeriod(it as? String) }
    output["rounding"] = request["rounding"].list().map { rnd(it.num()) }
    output["p8"] = p8Instinct(h)
    output["p8_repeat"] = p8Instinct(h)
    output["stars"] =
        request["stars"].list().map {
            val v = it.list()
            starsFor(v[0].int(), v[1].num())
        }
    val duplicate = h + listOf(h.last())
    output["duplicate_validation"] = validateDataset(request["market"] as String, duplicate, config)
    val conflict =
        h + listOf(h.last().copy(number = if (h.last().number == "0000") "0001" else "0000"))
    output["conflict_validation"] = validateDataset(request["market"] as String, conflict, config)
    for ((name, invalid) in
        listOf("duplicate_build" to duplicate, "conflict_build" to conflict)) output[name] =
        try {
            buildPrediction(
                PredictionInputs(
                    request["market"] as String,
                    invalid,
                    config,
                    "2026-10-12T12:00:00+07:00",
                )
            )
            "ACCEPTED"
        } catch (e: IllegalArgumentException) {
            "REJECTED"
        }
    output["short_loader"] = if (h.size <= MINIMUM_TRAINING_RECORDS) "REJECTED" else "ACCEPTED"
    output["legacy_audits"] =
        request["legacy_archives"].list().map { value ->
            val entry = value.map()
            auditPredictionPayload(
                readJson(entry["path"] as String).map(),
                entry["actual"] as String,
            )
        }
    return output
}

fun main(args: Array<String>) {
    try {
        require(args.isNotEmpty()) {
            "Usage: shadow|batch|probe --input FILE --output FRESH_PATH [--market HK --config FILE --clock ISO --previous FILE --archives DIR]"
        }
        val opts = options(args.drop(1))
        val input = opts["input"] ?: error("--input required")
        val output = Path.of(opts["output"] ?: error("--output required"))
        guardOutput(output)
        when (args[0]) {
            "shadow" -> {
                val request =
                    obj(
                        "input" to input,
                        "market" to (opts["market"] ?: error("--market required")),
                        "config" to (opts["config"] ?: error("--config required")),
                        "clock" to opts["clock"],
                        "previous" to opts["previous"],
                    )
                val h = history(input)
                opts["archives"]?.let { directory ->
                    request["archives"] = directory
                    val path = Path.of(directory).resolve("${h.last().date}.json")
                    if (path.exists()) {
                        request["prior_archive"] = path.toString()
                        request["prior_archive_path"] =
                            "public/predictions/${(request["market"] as String).lowercase()}/archive/${h.last().date}.json"
                    }
                }
                println(jsonText(compute(request, output)))
            }
            "batch" -> {
                val requests = readJson(input).list()
                val times =
                    requests.map { v ->
                        val r = v.map()
                        val id = r["id"] as String
                        require(id.matches(Regex("[A-Za-z0-9_-]+")))
                        val result = compute(r, output.resolve(id))
                        result["id"] = id
                        result
                    }
                writeNew(output.resolve("runtimes.json"), jsonText(times))
                println("Computed ${times.size} independent Kotlin predictions")
            }
            "probe" -> writeNew(output, jsonText(probes(readJson(input).map())))
            else -> error("Unknown command")
        }
    } catch (e: Exception) {
        System.err.println("SHADOW_FAILED: ${e.message}")
        exitProcess(1)
    }
}
