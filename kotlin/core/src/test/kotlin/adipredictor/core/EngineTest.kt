package adipredictor.core

import com.google.gson.GsonBuilder
import com.google.gson.ToNumberPolicy
import java.time.LocalDate
import kotlin.math.abs
import kotlin.test.*
import org.junit.jupiter.api.Test

class EngineTest {
    private val gson =
        GsonBuilder()
            .serializeNulls()
            .disableHtmlEscaping()
            .setObjectToNumberStrategy(ToNumberPolicy.LONG_OR_DOUBLE)
            .create()
    private val fixture =
        gson
            .fromJson(
                javaClass.getResource("/python-oracle-hk-380.json")!!.readText(Charsets.UTF_8),
                Any::class.java,
            )
            .map()
    private val h = fixture["rows"].list().map { Draw.from(it.map()) }
    private val config = fixture["config"].map()

    private fun equalJson(expected: Any?, actual: Any?) =
        assertEquals(gson.toJsonTree(expected), gson.toJsonTree(actual))

    private val prediction by lazy {
        buildPrediction(PredictionInputs("HK", h, config, fixture["clock"] as String))
    }

    @Test
    fun fullFastOraclePayloadMatchesEveryField() {
        equalJson(fixture["prediction"], prediction.payload)
    }

    @Test
    fun matrixAgreementHasOnlyUnpublishedTolerance() {
        for (name in MODELS) {
            val expected = fixture["model_matrices"].map()[name].list()
            val actual = prediction.matrices.getValue(name)
            for (p in 0..3) for (d in 0..9) assertTrue(
                abs(expected[p].list()[d].num() - actual[p][d]) <= 1e-13,
                "$name[$p][$d]",
            )
        }
    }

    @Test
    fun rendererMatchesOriginalOracleSvgByteForByte() {
        equalJson(fixture["svgs"], prediction.svgs)
    }

    @Test
    fun leadingZeroAndZeroResultsRemainStrings() {
        assertEquals("0000", numberOf(0L))
        assertEquals("0000", numberOf(""))
        assertEquals("0052", numberOf("52"))
        assertEquals("0123", numberOf("٠١٢٣"))
        assertFailsWith<IllegalArgumentException> { numberOf(null) }
        assertFailsWith<IllegalArgumentException> { numberOf("12xx") }
        assertFailsWith<IllegalArgumentException> { numberOf("12345") }
    }

    @Test
    fun schedulesUsePythonWeekdayOrderAndCrossBoundaries() {
        assertEquals(
            LocalDate.parse("2026-09-23"),
            targetDateFor("SGP", LocalDate.parse("2026-09-21"), config),
        )
        assertEquals(
            LocalDate.parse("2027-01-01"),
            targetDateFor("HK", LocalDate.parse("2026-12-31"), config),
        )
        assertEquals(
            LocalDate.parse("2027-01-02"),
            targetDateFor("SGP", LocalDate.parse("2026-12-31"), config),
        )
        assertEquals("HK-100", incrementPeriod("HK-0099"))
        assertNull(incrementPeriod(null))
        assertNull(incrementPeriod("HK-invalid"))
    }

    @Test
    fun duplicateAndConflictAreRejectedWithoutPrediction() {
        val duplicate = h + listOf(h.last())
        val conflict =
            h + listOf(h.last().copy(number = if (h.last().number == "0000") "0001" else "0000"))
        for (rows in listOf(duplicate, conflict)) {
            assertEquals("INVALID", validateDataset("HK", rows, config)["data_validation_status"])
            assertFailsWith<IllegalArgumentException> {
                buildPrediction(PredictionInputs("HK", rows, config, fixture["clock"] as String))
            }
        }
    }

    @Test
    fun p8IsDeterministicAndHashUsesPythonSerialization() {
        val first = p8Instinct(h)
        val second = p8Instinct(h)
        equalJson(first, second)
        equalJson(fixture["prediction"].map()["p8_ai_instinct"], first)
        val material = first.filterKeys { it != "fingerprint" }
        assertEquals(first["fingerprint"], sha256(pythonJson(material)))
        assertEquals(false, first["statistical_consensus_member"])
    }

    @Test
    fun identicalInputProducesIdenticalPayloadAndFrozenAssets() {
        val again = buildPrediction(PredictionInputs("HK", h, config, fixture["clock"] as String))
        equalJson(prediction.payload, again.payload)
        equalJson(prediction.svgs, again.svgs)
    }

    @Test
    fun countersAndTieBreaksPreserveOriginalOrder() {
        val c = Counter<String>()
        for (v in listOf("09", "01", "09", "01")) c.add(v)
        assertEquals(listOf(listOf("09", 2), listOf("01", 2)), c.common(2))
        val models = MODELS.associateWith { obj("2d_front_top5" to listOf("09", "01")) }
        val ranked = consensusCandidates("2d_front_top5", models, MODELS.associateWith { 1.0 })
        assertEquals(listOf("01", "09"), ranked.map { it["number"] })
    }

    @Test
    fun exactReverseAndPermutationHaveDistinctAuditStatuses() {
        assertEquals("EXACT", auditMatch("0000", "0000")["status"])
        assertEquals("PERMUTATION", auditMatch("0052", "5200")["status"])
        val reverse = auditList("05", listOf("50"), true)
        assertEquals("REVERSE", reverse["status"])
        assertEquals(false, reverse["exact"])
        assertEquals("FULL", bbfsAudit("0000", "01234")["status"])
    }

    @Test
    fun legacyArchiveAuditRemainsExplicitlyUnavailable() {
        val audit =
            auditPredictionPayload(
                obj("target_date" to "2026-09-19", "quick_view" to obj()),
                "0000",
            )
        for (name in MODELS) assertEquals(false, audit["models"].map()[name].map()["available"])
        assertEquals(false, audit["p8"].map()["available"])
    }

    @Test
    fun modelGateAndSvgEvaluationAreIndependentFields() {
        val analysis = prediction.payload["models"].map()["P5"].map()["analysis"].map()
        assertEquals("visual_only_backtest", analysis["model_visual_gate"].map()["evaluation"])
        assertEquals(
            "per_pattern_svg_backtest",
            analysis["visual_pattern_evaluation"].map()["evaluation"],
        )
        assertEquals(
            analysis["visual_predictive_edge_confirmed"],
            analysis["visual_contribution_enabled"],
        )
    }
}
