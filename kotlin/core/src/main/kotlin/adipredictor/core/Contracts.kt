package adipredictor.core

import java.math.BigDecimal
import java.math.MathContext
import java.math.RoundingMode
import java.security.MessageDigest
import java.time.LocalDate

typealias Obj = MutableMap<String, Any?>

typealias Matrix = List<DoubleArray>

typealias History = List<Draw>

val MODELS = (1..7).map { "P$it" }
val POSITIONS = listOf("AS", "KOP", "KEPALA", "EKOR")
val LAGS = listOf(1, 2, 3, 4, 5, 7, 10, 14, 21, 30)
const val ENGINE_VERSION = "AdiPredictor-P1-P8-v2"
const val MINIMUM_TRAINING_RECORDS = 365
const val DISCLAIMER =
    "Analisis historis tidak dapat memastikan hasil berikutnya. Confidence dan rating bintang merupakan ukuran relatif terhadap model, consensus, dan backtest, bukan jaminan hasil."

fun obj(vararg pairs: Pair<String, Any?>): Obj = linkedMapOf(*pairs)

@Suppress("UNCHECKED_CAST")
fun Any?.map(): Map<String, Any?> = this as? Map<String, Any?> ?: emptyMap()

@Suppress("UNCHECKED_CAST") fun Any?.mutable(): Obj = this as Obj

fun Any?.list(): List<Any?> = this as? List<Any?> ?: emptyList()

fun Any?.strings(): List<String> = list().map { it as String }

fun Any?.num(): Double = (this as Number).toDouble()

fun Any?.int(): Int = (this as Number).toInt()

fun truth(value: Any?): Boolean =
    when (value) {
        null -> false
        is Boolean -> value
        is String -> value.isNotEmpty()
        is Collection<*> -> value.isNotEmpty()
        is Map<*, *> -> value.isNotEmpty()
        is Number -> value.toDouble() != 0.0
        else -> true
    }

fun pyString(value: Any?): String =
    when (value) {
        null -> "None"
        true -> "True"
        false -> "False"
        else -> value.toString()
    }

fun numberOf(value: Any?): String {
    val original = pyString(value)
    val pad = maxOf(0, 4 - original.codePointCount(0, original.length))
    val n =
        if (original.startsWith('-') || original.startsWith('+'))
            original.take(1) + "0".repeat(pad) + original.drop(1)
        else "0".repeat(pad) + original
    val points = n.codePoints().toArray()
    require(
        points.size == 4 && points.all { Character.isDigit(it) && Character.digit(it, 10) >= 0 }
    ) {
        "Invalid 4D result"
    }
    return points.joinToString("") { Character.digit(it, 10).toString() }
}

data class Draw(
    val date: String,
    val number: String,
    val period: Any? = null,
    val collectedAt: Any? = null,
    val periodPresent: Boolean = true,
) {
    val digits: IntArray = number.map { it.digitToInt() }.toIntArray()

    init {
        require(number.length == 4 && number.all { it in '0'..'9' }) { "Invalid 4D result" }
    }

    companion object {
        fun from(row: Map<String, Any?>): Draw =
            Draw(
                row["result_date"] as String,
                numberOf(row.getOrDefault("nomor", "")),
                row["periode"],
                row["collected_at"],
                "periode" in row,
            )
    }
}

// Counter.most_common ties preserve first insertion, as in CPython.
class Counter<K> : LinkedHashMap<K, Int>() {
    fun add(key: K, amount: Int = 1) {
        this[key] = (this[key] ?: 0) + amount
    }

    fun count(key: K) = this[key] ?: 0

    fun common(limit: Int): List<List<Any?>> =
        entries.sortedByDescending { it.value }.take(limit).map { listOf(it.key, it.value) }
}

fun rate(hits: Int, total: Int) = if (total != 0) hits.toDouble() / total else 0.0

// BigDecimal(double), not valueOf(double), preserves the binary value for Python round.
fun rnd(value: Double): Double {
    val rounded = BigDecimal(value).setScale(6, RoundingMode.HALF_EVEN).toDouble()
    return if (rounded == 0.0 && java.lang.Double.doubleToRawLongBits(value) < 0) -0.0 else rounded
}

fun sum(values: Iterable<Double>): Double {
    var result = 0.0
    for (v in values) result += v
    return result
}

// statistics.mean uses an exact sum of the binary input values, then one division.
fun mean(values: Iterable<Double>): Double {
    val items = values.toList()
    require(items.isNotEmpty())
    val exact = items.fold(BigDecimal.ZERO) { acc, v -> acc.add(BigDecimal(v)) }
    return exact.divide(BigDecimal(items.size), MathContext(110, RoundingMode.HALF_EVEN)).toDouble()
}

fun normalize(values: DoubleArray): DoubleArray {
    val total = values.fold(0.0) { a, b -> a + b }
    return if (total != 0.0) DoubleArray(values.size) { values[it] / total }
    else DoubleArray(10) { 0.1 }
}

fun normalizeMatrix(matrix: Matrix): Matrix = matrix.map(::normalize)

fun topDigits(values: DoubleArray, count: Int) =
    (0..9).sortedWith(compareBy<Int> { -values[it] }.thenBy { it }).take(count)

fun aggregate(matrix: Matrix) = DoubleArray(10) { d -> sum((0..3).map { matrix[it][d] }) }

fun positionFrequency(history: History, alpha: Double = 1.0): Matrix {
    val counts = List(4) { DoubleArray(10) { alpha } }
    for (row in history) for (p in 0..3) counts[p][row.digits[p]] += 1.0
    return normalizeMatrix(counts)
}

fun globalFrequency(history: History, alpha: Double = 1.0): DoubleArray {
    val counts = DoubleArray(10) { alpha }
    for (row in history) for (d in row.digits) counts[d] += 1.0
    return normalize(counts)
}

fun rawPositions(history: History): List<IntArray> {
    val counts = List(4) { IntArray(10) }
    for (row in history) for (p in 0..3) counts[p][row.digits[p]]++
    return counts
}

fun pairs(number: String) =
    linkedMapOf(
        "front" to number.take(2),
        "middle" to number.substring(1, 3),
        "back" to number.takeLast(2),
        "cross" to "${number[0]}${number[3]}",
    )

fun pairCounts(history: History): Map<String, Counter<String>> {
    val out = listOf("front", "middle", "back", "cross").associateWith { Counter<String>() }
    for (row in history) for ((name, n) in pairs(row.number)) out.getValue(name).add(n)
    return out
}

fun cooccurrence(history: History): List<IntArray> {
    val out = List(10) { IntArray(10) }
    for (row in history) for (a in row.digits.toSet()) for (b in row.digits.toSet()) if (a != b)
        out[a][b]++
    return out
}

fun wilsonInterval(hits: Int, total: Int, z: Double = 1.959963984540054): List<Double> {
    if (total == 0) return listOf(0.0, 1.0)
    val p = rate(hits, total)
    val denominator = 1 + z * z / total
    val center = (p + z * z / (2 * total)) / denominator
    val margin = z * kotlin.math.sqrt((p * (1 - p) + z * z / (4 * total)) / total) / denominator
    return listOf(rnd(maxOf(0.0, center - margin)), rnd(minOf(1.0, center + margin)))
}

fun sha256(text: String) =
    MessageDigest.getInstance("SHA-256").digest(text.toByteArray(Charsets.UTF_8)).joinToString("") {
        "%02x".format(it.toInt() and 255)
    }

fun hashMaterial(market: String, history: History, engine: Boolean) =
    (if (engine) "$ENGINE_VERSION|" else "") +
        "$market|" +
        history.joinToString("|") { "${it.date}:${it.number}" }

fun datasetFingerprint(market: String, history: History) =
    sha256(hashMaterial(market, history, true))

fun datasetRevision(market: String, history: History) = sha256(hashMaterial(market, history, false))

fun marketWeekdays(market: String, config: Map<String, Any?>): Set<Int> =
    if (market != "SGP") (0..6).toSet()
    else
        config["markets"]
            .map()["SGP"]
            .map()["period_rule"]
            .map()["weekdays"]
            .list()
            .map { it.int() }
            .toSet()

fun targetDateFor(market: String, latest: LocalDate, config: Map<String, Any?>): LocalDate {
    var candidate = latest.plusDays(1)
    val allowed = marketWeekdays(market, config)
    require(allowed.isNotEmpty())
    while (candidate.dayOfWeek.value - 1 !in allowed) candidate = candidate.plusDays(1)
    return candidate
}

fun incrementPeriod(value: Any?): String? {
    if (!truth(value)) return null
    val period = pyString(value)
    if ('-' !in period) return null
    val n = period.substringAfterLast('-')
    val digits = n.codePoints().toArray()
    if (digits.isEmpty() || !digits.all { Character.isDigit(it) && Character.digit(it, 10) >= 0 })
        return null
    val integer = digits.joinToString("") { Character.digit(it, 10).toString() }.toBigInteger()
    return period.substringBeforeLast('-') + "-" + (integer + java.math.BigInteger.ONE)
}

fun validateDataset(market: String, history: History, config: Map<String, Any?>): Obj {
    require(history.isNotEmpty()) { "Empty dataset" }
    val byDate = history.groupBy { it.date }
    val start = LocalDate.parse(history.first().date)
    val end = LocalDate.parse(history.last().date)
    val missing = mutableListOf<String>()
    var cursor = start
    val allowed = marketWeekdays(market, config)
    while (cursor <= end) {
        if (cursor.dayOfWeek.value - 1 in allowed && cursor.toString() !in byDate)
            missing += cursor.toString()
        cursor = cursor.plusDays(1)
    }
    val duplicates = byDate.filterValues { it.size > 1 }.keys.sorted()
    val conflicts =
        byDate
            .toSortedMap()
            .filterValues { it.map(Draw::number).toSet().size > 1 }
            .map { (date, rows) ->
                obj("date" to date, "numbers" to rows.map(Draw::number).distinct().sorted())
            }
    return obj(
        "total_records" to history.size,
        "start_date" to start.toString(),
        "end_date" to end.toString(),
        "latest_result" to history.last().number,
        "latest_result_date" to end.toString(),
        "next_target" to targetDateFor(market, end, config).toString(),
        "missing_expected_draws" to missing,
        "duplicate_dates" to duplicates,
        "conflicting_results" to conflicts,
        "period_continuity" to if (missing.isEmpty()) "CONTINUOUS" else "GAPS_PRESENT",
        "data_validation_status" to
            if (duplicates.isEmpty() && conflicts.isEmpty()) "VALID" else "INVALID",
        "schedule" to config["markets"].map()[market].map().getOrDefault("schedule", "daily"),
    )
}

// Canonical CPython json.dumps(sort_keys=True,separators=(',',':'),ensure_ascii=True).
// Used for P8's string/Boolean contract; output JSON uses the CLI's separate codec.
fun pythonJson(value: Any?): String =
    when (value) {
        null -> "null"
        is Boolean -> value.toString()
        is String ->
            buildString {
                append('"')
                for (c in value) append(
                    when (c) {
                        '"' -> "\\\""
                        '\\' -> "\\\\"
                        '\b' -> "\\b"
                        '\u000c' -> "\\f"
                        '\n' -> "\\n"
                        '\r' -> "\\r"
                        '\t' -> "\\t"
                        else ->
                            if (c.code < 32 || c.code > 126) "\\u%04x".format(c.code)
                            else c.toString()
                    }
                )
                append('"')
            }
        is Map<*, *> ->
            value.entries
                .sortedBy { it.key.toString() }
                .joinToString(",", "{", "}") {
                    pythonJson(it.key.toString()) + ":" + pythonJson(it.value)
                }
        is List<*> -> value.joinToString(",", "[", "]", transform = ::pythonJson)
        is Number -> value.toString()
        else -> error("Unsupported Python JSON value: ${value.javaClass}")
    }
