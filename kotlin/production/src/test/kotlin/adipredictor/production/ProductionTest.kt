package adipredictor.production

import adipredictor.core.*
import adipredictor.io.Json
import java.nio.file.Files
import java.nio.file.Path
import kotlin.io.path.*
import kotlin.test.*
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir

class ProductionTest {
    @TempDir lateinit var temp: Path
    private val fixture by lazy {
        Json.objectAt(Path.of("../core/src/test/resources/python-oracle-hk-380.json"))
    }

    private fun prepare(): ProductionOptions {
        val root = temp.resolve("root")
        root.createDirectories()
        Json.write(root.resolve("public/data/hk.json"), fixture["rows"])
        Json.write(root.resolve("config/collector_sources.json"), fixture["config"])
        val prediction = LinkedHashMap(fixture["prediction"].map())
        prediction["metadata_revision"] = 2
        Json.write(root.resolve("public/predictions/hk/latest.json"), prediction)
        for ((relative, svg) in fixture["svgs"].map()) writeText(
            root.resolve("public").resolve(relative),
            svg as String,
        )
        return ProductionOptions(
            root,
            root.resolve("public/data"),
            root.resolve("config/collector_sources.json"),
            root.resolve("public/predictions"),
            temp.resolve("stage"),
            listOf("HK"),
        )
    }

    @Test
    fun malformedGeneratedOutputIsRejectedBeforeAnyRealWrite() {
        val options = prepare()
        val before = treeHashes(options.output)
        val adapter =
            ProductionAdapter(
                now = { fixture["clock"] as String },
                beforeValidation = { working ->
                    working.resolve("hk/latest.json").writeText("{broken")
                },
            )
        assertFails { adapter.run(options) }
        assertEquals(before, treeHashes(options.output))
    }

    @Test
    fun failureInSecondMarketDiscardsSuccessfulFirstMarketCalculation() {
        val options = prepare()
        Json.write(options.data.resolve("sdy.json"), emptyList<Any?>())
        val before = treeHashes(options.output)
        assertFails {
            ProductionAdapter(now = { fixture["clock"] as String })
                .run(options.copy(markets = listOf("HK", "SDY")))
        }
        assertEquals(before, treeHashes(options.output))
        assertTrue(options.staging.resolve("working/public/predictions/hk/latest.json").exists())
    }

    @Test
    fun simulationNeverAppliesStagedFiles() {
        val options = prepare()
        val before = treeHashes(options.output)
        val report =
            ProductionAdapter(now = { fixture["clock"] as String })
                .run(options.copy(simulate = true))
        assertEquals(false, report["applied"])
        assertTrue(report["changed_files"].list().isNotEmpty())
        assertEquals(before, treeHashes(options.output))
    }

    @Test
    fun inputMovingDuringCalculationPreventsApply() {
        val options = prepare()
        val before = treeHashes(options.output)
        val adapter =
            ProductionAdapter(
                now = { fixture["clock"] as String },
                beforeValidation = { options.data.resolve("hk.json").writeText("[]") },
            )
        assertFails { adapter.run(options) }
        assertEquals(before, treeHashes(options.output))
    }

    @Test
    fun outputSymlinksCannotRedirectProductionWrites() {
        val options = prepare()
        val real = temp.resolve("outside")
        real.createDirectories()
        val alias = options.root.resolve("public/alias")
        Files.createSymbolicLink(alias, real)
        assertFails { ProductionAdapter().run(options.copy(output = alias)) }
        assertTrue(files(real).isEmpty())
    }

    @Test
    fun failedMultiFileApplicationRestoresOriginalFiles() {
        val output = temp.resolve("output")
        output.createDirectories()
        output.resolve("a.txt").writeText("OLD")
        output.resolve("blocked").writeText("REGULAR FILE")
        val stage = temp.resolve("content")
        writeText(stage.resolve("a.txt"), "NEW")
        writeText(stage.resolve("blocked/b.txt"), "SECOND")
        val before = treeHashes(output)
        assertFails {
            applyTransaction(
                stage,
                output,
                listOf("a.txt", "blocked/b.txt"),
                temp.resolve("backup"),
            )
        }
        assertEquals(before, treeHashes(output))
    }

    @Test
    fun productionJsonPreservesPythonFloatNotationAndUtf8() {
        assertEquals("1e-06", Json.encode(0.000001))
        assertEquals("0.0001", Json.encode(0.0001))
        assertEquals("1e+16", Json.encode(1e16))
        assertEquals("-0.0", Json.encode(-0.0))
        assertEquals("\"⭐\u2028x\"", Json.encode("⭐\u2028x"))
    }

    @Test
    fun missingHistoryIsRebuiltOnCachedRunWithoutRewritingLatestOrSvg() {
        val options = prepare()
        Json.write(options.output.resolve("hk/latest.json"), fixture["prediction"])
        val before = treeHashes(options.output)
        val report = ProductionAdapter(now = { fixture["clock"] as String }).run(options)
        val changes = report["changed_files"].strings()
        assertEquals(listOf("hk/history.json", "status.json"), changes)
        val after = treeHashes(options.output)
        for ((path, hash) in before) assertEquals(hash, after[path])
        assertEquals("unchanged", report["markets"].map()["HK"].map()["status"])
    }
}
