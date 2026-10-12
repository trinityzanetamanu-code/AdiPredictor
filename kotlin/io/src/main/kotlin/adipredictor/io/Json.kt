package adipredictor.io

import com.google.gson.GsonBuilder
import com.google.gson.Strictness
import com.google.gson.ToNumberPolicy
import java.nio.file.Files
import java.nio.file.Path

/** JSON file boundary only; the calculation core has no codec or filesystem. */
object Json {
    private val gson =
        GsonBuilder()
            .serializeNulls()
            .disableHtmlEscaping()
            .setStrictness(Strictness.STRICT)
            .setObjectToNumberStrategy(ToNumberPolicy.LONG_OR_DOUBLE)
            .create()

    fun read(path: Path): Any? =
        gson.fromJson(Files.readString(path, Charsets.UTF_8), Any::class.java)

    @Suppress("UNCHECKED_CAST")
    fun objectAt(path: Path): Map<String, Any?> {
        val value = read(path)
        require(value is Map<*, *>) { "Expected JSON object: $path" }
        return value as Map<String, Any?>
    }

    fun encode(value: Any?): String =
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
                            else -> if (c.code < 32) "\\u%04x".format(c.code) else c.toString()
                        }
                    )
                    append('"')
                }
            is Map<*, *> ->
                value.entries.joinToString(",", "{", "}") {
                    encode(it.key.toString()) + ":" + encode(it.value)
                }
            is Iterable<*> -> value.joinToString(",", "[", "]", transform = ::encode)
            is Double -> floating(value)
            is Float -> floating(value.toDouble())
            is Number -> value.toString()
            is IntArray -> encode(value.toList())
            is DoubleArray -> encode(value.toList())
            else -> error("Unsupported output type: ${value.javaClass}")
        }

    private fun floating(value: Double): String {
        require(value.isFinite()) { "Nonfinite prediction value" }
        if (value == 0.0)
            return if (java.lang.Double.doubleToRawLongBits(value) < 0) "-0.0" else "0.0"
        val decimal = java.math.BigDecimal.valueOf(value).stripTrailingZeros()
        val exponent = decimal.precision() - decimal.scale() - 1
        if (exponent in -4..15) {
            val text = decimal.toPlainString()
            return if ('.' in text) text else "$text.0"
        }
        val mantissa = decimal.movePointLeft(exponent).toPlainString()
        return mantissa +
            "e" +
            (if (exponent >= 0) "+" else "-") +
            kotlin.math.abs(exponent).toString().padStart(2, '0')
    }

    fun text(value: Any?) = encode(value) + "\n"

    fun write(path: Path, value: Any?) {
        Files.createDirectories(path.parent)
        Files.writeString(path, text(value), Charsets.UTF_8)
    }
}
