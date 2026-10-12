package adipredictor.production

import java.nio.file.Path
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlin.system.exitProcess

fun main(args: Array<String>) {
    try {
        require(args.size % 2 == 0) { "Every option requires an explicit value" }
        val opts =
            args.toList().chunked(2).associate {
                require(it[0].startsWith("--"))
                it[0].drop(2) to it[1]
            }
        require(
            opts.keys.all {
                it in
                    setOf(
                        "root",
                        "data",
                        "config",
                        "output",
                        "staging",
                        "market",
                        "force",
                        "simulate",
                        "clock",
                        "source-id",
                        "build-id",
                    )
            }
        )
        fun path(name: String) =
            Path.of(opts[name] ?: error("--$name is required")).toAbsolutePath().normalize()
        fun flag(name: String): Boolean {
            val value = opts[name] ?: "false"
            require(value in listOf("true", "false"))
            return value == "true"
        }
        val markets =
            when (val market = opts["market"] ?: "ALL") {
                "ALL" -> listOf("HK", "SDY", "SGP")
                "HK",
                "SDY",
                "SGP" -> listOf(market)
                else -> error("Invalid market")
            }
        val options =
            ProductionOptions(
                path("root"),
                path("data"),
                path("config"),
                path("output"),
                path("staging"),
                markets,
                flag("force"),
                flag("simulate"),
                opts["source-id"] ?: "direct-cli",
                opts["build-id"] ?: "direct-cli",
            )
        val adapter =
            opts["clock"]?.let { clock ->
                ProductionAdapter(
                    now = {
                        OffsetDateTime.parse(clock)
                            .atZoneSameInstant(ZoneId.of("Asia/Jakarta"))
                            .format(DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ssXXX"))
                    }
                )
            } ?: ProductionAdapter()
        adapter.run(options)
    } catch (error: Exception) {
        System.err.println(
            "ENGINE_FAILURE BACKEND=KOTLIN OUTPUT_NOT_PUBLISHED REASON=${error.message}"
        )
        exitProcess(1)
    }
}
