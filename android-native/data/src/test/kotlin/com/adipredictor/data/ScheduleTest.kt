package com.adipredictor.data

import java.time.*
import kotlin.test.*
import org.junit.Test

class ScheduleTest {
    @Test fun sgpWeekdayAndYearRolloverMatchSourceContract() {
        val items = upcomingReminders(Instant.parse("2026-12-31T00:00:00Z"))
        assertTrue(items.any { it.key == "LIVE:SGP_TOTO:2026-12-31" })
        assertTrue(items.any { it.key == "LIVE:SGP_4D:2027-01-02" })
        assertFalse(items.any { it.key == "LIVE:SGP_4D:2027-01-01" })
        assertTrue(items.all { it.at > Instant.parse("2026-12-31T00:00:00Z") })
        assertEquals(items.size, items.map { it.key }.distinct().size)
    }
    @Test fun liveWindowIsScheduleOnlyNotCanonicalFinality() {
        assertEquals("LIVE_WINDOW", drawWindow("HK", Instant.parse("2026-10-12T15:35:00Z")))
        assertEquals("NO_DRAW_TODAY", drawWindow("SGP_4D", Instant.parse("2026-10-12T10:35:00Z")))
        assertEquals("SCHEDULE_UNAVAILABLE", drawWindow("SDY", Instant.parse("2026-10-12T10:35:00Z")))
        assertEquals("RESULT_POSTED", drawWindow("SGP_TOTO", Instant.parse("2026-10-12T12:00:00Z")))
    }
}
