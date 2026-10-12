package com.adipredictor.data

import java.time.*

data class DrawSchedule(val id: String, val market: String, val zone: ZoneId, val days: Set<DayOfWeek>, val time: LocalTime)
val drawSchedules = listOf(
    DrawSchedule("HK", "HK", ZoneId.of("Asia/Jakarta"), DayOfWeek.entries.toSet(), LocalTime.of(22, 45)),
    DrawSchedule("SGP_4D", "SGP", ZoneId.of("Asia/Singapore"), setOf(DayOfWeek.WEDNESDAY, DayOfWeek.SATURDAY, DayOfWeek.SUNDAY), LocalTime.of(18, 30)),
    DrawSchedule("SGP_TOTO", "SGP", ZoneId.of("Asia/Singapore"), setOf(DayOfWeek.MONDAY, DayOfWeek.THURSDAY), LocalTime.of(18, 30))
)
data class Reminder(val key: String, val market: String, val source: String, val at: Instant)
fun upcomingReminders(now: Instant): List<Reminder> = drawSchedules.flatMap { schedule ->
    val local = now.atZone(schedule.zone)
    (0L..7L).mapNotNull { offset ->
        val date = local.toLocalDate().plusDays(offset)
        if (date.dayOfWeek !in schedule.days) return@mapNotNull null
        val at = date.atTime(schedule.time).atZone(schedule.zone).minusMinutes(15).toInstant()
        if (at <= now) null else Reminder("LIVE:${schedule.id}:$date", schedule.market, schedule.id, at)
    }
}
fun drawWindow(source: String, now: Instant): String {
    val schedule = drawSchedules.find { it.id == source } ?: return "SCHEDULE_UNAVAILABLE"
    val local = now.atZone(schedule.zone)
    if (local.dayOfWeek !in schedule.days) return "NO_DRAW_TODAY"
    val start = local.toLocalDate().atTime(schedule.time).atZone(schedule.zone)
    return when { local < start.minusMinutes(15) -> "UPCOMING"; local <= start.plusMinutes(60) -> "LIVE_WINDOW"; else -> "RESULT_POSTED" }
}
