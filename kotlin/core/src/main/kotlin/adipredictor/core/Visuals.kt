package adipredictor.core

import kotlin.math.pow

data class Cell(val row: Int, val position: Int)

data class Occurrence(val start: Int, val end: Int, val cells: List<Cell>)

fun visualOccurrences(h: History): Map<String, List<Occurrence>> {
    val out = linkedMapOf<String, MutableList<Occurrence>>()
    fun add(name: String, start: Int, end: Int, vararg cells: Cell) {
        out.getOrPut(name) { mutableListOf() }.add(Occurrence(start, end, cells.toList()))
    }
    for (i in 1 until h.size) {
        val before = h[i - 1].digits
        val after = h[i].digits
        for (source in 0..3) for (target in 0..3) if (
            source != target && before[source] == after[target]
        ) {
            val name =
                if (target == source + 1) "DIAGONAL_TURUN"
                else if (target == source - 1) "DIAGONAL_NAIK" else "SAME_DIGIT_TRAVELLING"
            add(name, i - 1, i, Cell(i - 1, source), Cell(i, target))
        }
        if (before[0] == after[3] && before[3] == after[0])
            add("CROSSING", i - 1, i, Cell(i - 1, 0), Cell(i - 1, 3), Cell(i, 0), Cell(i, 3))
        for (p in 0..3) if (before[p] == after[p])
            add("REPEAT_PATH", i - 1, i, Cell(i - 1, p), Cell(i, p))
        for (a in 0..3) for (b in a + 1..3) if (
            before[a] != before[b] && before[a] == after[b] && before[b] == after[a]
        )
            add("BOX_FRAME", i - 1, i, Cell(i - 1, a), Cell(i - 1, b), Cell(i, b), Cell(i, a))
        for (source in 0..2) for (target in 0..2) if (
            source != target &&
                before[source] == after[target] &&
                before[source + 1] == after[target + 1]
        ) {
            val cells =
                arrayOf(
                    Cell(i - 1, source),
                    Cell(i - 1, source + 1),
                    Cell(i, target),
                    Cell(i, target + 1),
                )
            add("2D_CHAIN", i - 1, i, *cells)
            add("POSITION_SHIFT", i - 1, i, *cells)
        }
        for (source in 0..1) for (target in 0..1) if (
            source != target && (0..2).all { before[source + it] == after[target + it] }
        ) {
            val cells =
                (0..2).map { Cell(i - 1, source + it) } + (0..2).map { Cell(i, target + it) }
            add("3D_CHAIN", i - 1, i, *cells.toTypedArray())
        }
        if (i >= 2) {
            val older = h[i - 2].digits
            for (p in 0..3) if (older[p] == after[p] && before[p] != after[p])
                add("BOUNCE_PANTULAN", i - 2, i, Cell(i - 2, p), Cell(i, p))
            for (origin in 0..3) for (middle in 0..3) if (
                origin != middle &&
                    older[origin] == before[middle] &&
                    before[middle] == after[origin]
            )
                add("ZIG_ZAG", i - 2, i, Cell(i - 2, origin), Cell(i - 1, middle), Cell(i, origin))
        }
    }
    return out
}

val MULTI_DIGIT_PATTERNS = setOf("CROSSING", "BOX_FRAME", "2D_CHAIN", "POSITION_SHIFT", "3D_CHAIN")

fun expectedContinuation(h: History, name: String, occurrence: Occurrence): List<Pair<Int, Int>> {
    val ends =
        occurrence.cells
            .filter { it.row == occurrence.end }
            .map { it.position to h[it.row].digits[it.position] }
    if (ends.isEmpty()) return emptyList()
    if (name in MULTI_DIGIT_PATTERNS) return ends.distinct()
    val (last, digit) = ends.last()
    var target = last
    if (name == "ZIG_ZAG" && occurrence.cells.size >= 2)
        target = occurrence.cells[occurrence.cells.size - 2].position
    else if (name in setOf("DIAGONAL_NAIK", "DIAGONAL_TURUN", "SAME_DIGIT_TRAVELLING")) {
        val earlier =
            occurrence.cells.dropLast(1).asReversed().firstOrNull { it.row < occurrence.end }
        if (earlier != null) {
            val shifted = last + (last - earlier.position)
            if (shifted in 0..3) target = shifted
        }
    }
    return listOf(target to digit)
}

fun visualPatternBacktest(h: History, name: String, occurrences: List<Occurrence>): Obj {
    var hits = 0
    var trials = 0
    for (occurrence in occurrences) {
        if (occurrence.end + 1 >= h.size) continue
        val expected = expectedContinuation(h, name, occurrence)
        if (expected.isEmpty()) continue
        trials++
        if (expected.all { (position, digit) -> h[occurrence.end + 1].digits[position] == digit })
            hits++
    }
    val width =
        if (name in MULTI_DIGIT_PATTERNS)
            occurrences.maxOfOrNull { o ->
                o.cells.filter { it.row == o.end }.map { it.position }.toSet().size
            } ?: 1
        else 1
    val baseline = .1.pow(maxOf(1, width))
    val interval = wilsonInterval(hits, trials)
    val edge = trials >= 30 && interval[0] > baseline
    return obj(
        "hits" to hits,
        "trials" to trials,
        "hit_rate" to rnd(rate(hits, trials)),
        "baseline" to rnd(baseline),
        "wilson_95_ci" to interval,
        "visual_predictive_edge_confirmed" to edge,
        "definition" to "Exact next-draw continuation at the pattern endpoint position(s).",
    )
}

fun visualTargetSignal(h: History, name: String, occurrence: Occurrence, targetDate: String): Obj? {
    val expected = expectedContinuation(h, name, occurrence)
    if (expected.isEmpty()) return null
    val rule =
        if (name in MULTI_DIGIT_PATTERNS)
            "Semua digit endpoint pola berlanjut pada posisi endpoint yang sama di draw target."
        else "Digit endpoint pola berlanjut tepat pada posisi target yang dibekukan sebelum result."
    return obj(
        "target_date" to targetDate,
        "target_positions" to expected.map { POSITIONS[it.first] },
        "predicted_digits" to expected.map { it.second.toString() },
        "predicted_values" to
            expected.map { (p, d) ->
                obj("position" to POSITIONS[p], "position_index" to p, "digit" to d.toString())
            },
        "evaluation_rule" to rule,
        "frozen_before_result" to true,
    )
}

fun htmlEscape(s: String) =
    s.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\"", "&quot;")
        .replace("'", "&#x27;")

// Pure renderer: returns text; the CLI adapter owns all filesystem writes.
fun renderSvg(
    market: String,
    h: History,
    name: String,
    occurrence: Occurrence,
    metadata: Obj,
): String {
    val first = maxOf(0, occurrence.end - 7)
    val rows = h.subList(first, minOf(h.size, occurrence.end + 2))
    val height = 100 + rows.size * 34
    val parts =
        mutableListOf(
            "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"680\" height=\"$height\" viewBox=\"0 0 680 $height\">",
            "<defs><marker id=\"arrow\" markerWidth=\"8\" markerHeight=\"8\" refX=\"6\" refY=\"3\" orient=\"auto\"><path d=\"M0,0 L0,6 L7,3 z\" fill=\"#f59e0b\"/></marker></defs>",
            "<rect width=\"100%\" height=\"100%\" fill=\"#07111f\" rx=\"16\"/>",
            "<text x=\"24\" y=\"30\" fill=\"#34d399\" font-size=\"18\" font-family=\"sans-serif\" font-weight=\"700\">${htmlEscape(name.replace('_',' '))} · $market</text>",
            "<text x=\"24\" y=\"52\" fill=\"#94a3b8\" font-size=\"11\" font-family=\"sans-serif\">${htmlEscape(metadata["source_period"] as String)} · occurrences ${metadata["number_of_occurrences"]}</text>",
        )
    val xs = listOf(24, 310, 390, 470, 550)
    for ((x, label) in xs.zip(listOf("DATE / DRAW") + POSITIONS)) parts +=
        "<text x=\"$x\" y=\"78\" fill=\"#64748b\" font-size=\"11\" font-family=\"sans-serif\" font-weight=\"700\">$label</text>"
    val centers = linkedMapOf<Cell, Pair<Int, Int>>()
    val active = occurrence.cells.toSet()
    for ((offset, row) in rows.withIndex()) {
        val absolute = first + offset
        val y = 96 + offset * 34
        val fill = if (offset % 2 == 0) "#0f1e31" else "#0b1728"
        parts +=
            "<rect x=\"16\" y=\"${y-20}\" width=\"648\" height=\"29\" rx=\"6\" fill=\"$fill\"/>"
        parts +=
            "<text x=\"24\" y=\"$y\" fill=\"#cbd5e1\" font-size=\"11\" font-family=\"monospace\">${htmlEscape("${row.date} · ${if(row.periodPresent) pyString(row.period) else "-"}")}</text>"
        for (p in 0..3) {
            val x = xs[p + 1]
            val marked = Cell(absolute, p) in active
            if (marked)
                parts +=
                    "<rect x=\"${x-12}\" y=\"${y-19}\" width=\"30\" height=\"27\" rx=\"7\" fill=\"#059669\"/>"
            val color = if (marked) "#ffffff" else "#cbd5e1"
            parts +=
                "<text x=\"$x\" y=\"$y\" fill=\"$color\" font-size=\"15\" font-family=\"monospace\" font-weight=\"700\">${row.digits[p]}</text>"
            centers[Cell(absolute, p)] = x + 4 to y - 6
        }
    }
    val points = occurrence.cells.mapNotNull(centers::get)
    for ((a, b) in points.zipWithNext()) parts +=
        "<line x1=\"${a.first}\" y1=\"${a.second}\" x2=\"${b.first}\" y2=\"${b.second}\" stroke=\"#f59e0b\" stroke-width=\"3\" marker-end=\"url(#arrow)\"/>"
    parts +=
        "<text x=\"24\" y=\"${height-14}\" fill=\"#94a3b8\" font-size=\"10\" font-family=\"sans-serif\">${htmlEscape(metadata["visual_note"] as String)}</text>"
    parts += "</svg>"
    return parts.joinToString("\n") + "\n"
}

data class VisualResult(val patterns: List<Obj>, val svgs: Map<String, String>)

fun generateVisualPatterns(market: String, h: History, targetDate: String, p5: Obj): VisualResult {
    val patterns =
        visualOccurrences(h)
            .entries
            .filter { it.value.isNotEmpty() }
            .sortedWith(
                compareBy<Map.Entry<String, List<Occurrence>>> { -it.value.size }.thenBy { it.key }
            )
            .take(6)
    val output = mutableListOf<Obj>()
    val svgs = linkedMapOf<String, String>()
    for ((i, item) in patterns.withIndex()) {
        val name = item.key
        val values = item.value
        val occurrence = values.last()
        val backtest = visualPatternBacktest(h, name, values)
        val edge = backtest["visual_predictive_edge_confirmed"] as Boolean
        val relative =
            "predictions/${market.lowercase()}/visuals/$targetDate/pattern-%02d.svg".format(i + 1)
        val metadata =
            obj(
                "pattern_name" to name,
                "market" to market,
                "source_period" to "${h[occurrence.start].date}..${h[occurrence.end].date}",
                "start_point" to h[occurrence.start].date,
                "end_point" to h[occurrence.end].date,
                "digits_used" to
                    occurrence.cells
                        .map { h[it.row].digits[it.position].toString() }
                        .distinct()
                        .sorted(),
                "number_of_occurrences" to values.size,
                "backtest_samples" to backtest["trials"],
                "historical_hit_rate" to backtest["hit_rate"],
                "baseline" to backtest["baseline"],
                "wilson_95_ci" to backtest["wilson_95_ci"],
                "visual_pattern_confirmed" to true,
                "visual_predictive_edge_confirmed" to edge,
                "edge_confirmed" to edge,
                "visual_note" to
                    if (edge) "Visual pattern ditemukan; predictive edge terkonfirmasi."
                    else "Visual pattern ditemukan — predictive edge belum terbukti.",
                "backtest_definition" to backtest["definition"],
                "target_signal" to visualTargetSignal(h, name, occurrence, targetDate),
                "image_path" to relative,
            )
        svgs[relative] = renderSvg(market, h, name, occurrence, metadata)
        output += metadata
    }
    p5["visual_pattern_evaluation"] =
        obj(
            "any_svg_edge_confirmed" to
                output.any { it["visual_predictive_edge_confirmed"] == true },
            "pattern_count" to output.size,
            "evaluation" to "per_pattern_svg_backtest",
        )
    return VisualResult(output, svgs)
}
