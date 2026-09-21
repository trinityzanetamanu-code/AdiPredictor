const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

export const COLLECTOR_HEALTH = Object.freeze({
  HEALTHY: 'COLLECTOR_HEALTHY',
  DELAYED: 'COLLECTOR_DELAYED',
  STALE: 'COLLECTOR_STALE',
  UNKNOWN: 'COLLECTOR_UNKNOWN',
});

export const DATASET_FRESHNESS = Object.freeze({
  CURRENT: 'DATASET_CURRENT',
  WAITING_FOR_DRAW: 'WAITING_FOR_DRAW',
  WAITING_FOR_SOURCE: 'WAITING_FOR_SOURCE',
  COLLECTOR_DELAYED: 'COLLECTOR_DELAYED',
  STALE: 'DATASET_STALE',
});

// Composite-market schedules, not Singapore Pools official 4D/TOTO schedules.
// SGP's date cadence is repository-verified. Its 20:00 WIB publication time is
// deliberately conservative because the two mirrors do not publish atomically.
export const MARKET_DATA_SCHEDULES = Object.freeze({
  HK: { timezone: 'Asia/Jakarta', days: [0, 1, 2, 3, 4, 5, 6], hour: 23, minute: 0, graceMinutes: 90 },
  SGP: { timezone: 'Asia/Jakarta', days: [0, 1, 3, 4, 6], hour: 20, minute: 0, graceMinutes: 120 },
  SDY: null,
});

function validDate(value) {
  const parsed = new Date(value || '');
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function latestCheckTimestamp(status) {
  const values = [status?.collected_at];
  for (const market of Object.values(status?.markets || {})) {
    values.push(market?.last_source_check);
  }
  return values.map(validDate).filter(Boolean).sort((a, b) => b - a)[0] || null;
}

export function collectorHealth(status, now = new Date(), cadenceMinutes = 10) {
  const lastCheck = latestCheckTimestamp(status);
  if (!lastCheck) {
    return { state: COLLECTOR_HEALTH.UNKNOWN, ageMinutes: null, lastCheck: null, label: 'Status collector belum diketahui' };
  }
  const ageMinutes = Math.max(0, Math.floor((now.getTime() - lastCheck.getTime()) / MINUTE_MS));
  if (ageMinutes <= cadenceMinutes * 2.5) {
    return { state: COLLECTOR_HEALTH.HEALTHY, ageMinutes, lastCheck: lastCheck.toISOString(), label: `Collector normal · cek publik ${ageMinutes} menit lalu` };
  }
  if (ageMinutes <= cadenceMinutes * 9) {
    return { state: COLLECTOR_HEALTH.DELAYED, ageMinutes, lastCheck: lastCheck.toISOString(), label: `Collector terlambat · cek publik ${ageMinutes} menit lalu` };
  }
  return { state: COLLECTOR_HEALTH.STALE, ageMinutes, lastCheck: lastCheck.toISOString(), label: `Collector stale · cek publik ${Math.floor(ageMinutes / 60)} jam lalu` };
}

function zonedParts(now, timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return {
    isoDate: `${values.year}-${values.month}-${values.day}`,
    weekday: { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[values.weekday],
    minuteOfDay: Number(values.hour) * 60 + Number(values.minute),
  };
}

function shiftISODate(isoDate, days) {
  const date = new Date(`${isoDate}T12:00:00Z`);
  return new Date(date.getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

function previousScheduledDate(today, weekday, days) {
  for (let offset = 1; offset <= 7; offset += 1) {
    const candidateDay = (weekday - offset + 7) % 7;
    if (days.includes(candidateDay)) return shiftISODate(today, -offset);
  }
  return null;
}

export function datasetFreshness({ market, latest, collectorStatus, now = new Date(), staleAfterMinutes = 240 }) {
  const latestDate = latest?.result_date || null;
  const schedule = MARKET_DATA_SCHEDULES[market] || null;
  const health = collectorHealth(collectorStatus, now);
  if (!schedule) {
    const today = zonedParts(now, 'Asia/Jakarta').isoDate;
    return latestDate === today
      ? { state: DATASET_FRESHNESS.CURRENT, expectedDrawDate: today, latestDate, scheduleVerified: false, collectorHealth: health.state }
      : { state: DATASET_FRESHNESS.WAITING_FOR_SOURCE, expectedDrawDate: null, latestDate, scheduleVerified: false, collectorHealth: health.state, reason: 'SCHEDULE_UNVERIFIED' };
  }

  const local = zonedParts(now, schedule.timezone);
  const scheduledToday = schedule.days.includes(local.weekday);
  const drawMinute = schedule.hour * 60 + schedule.minute;
  if (scheduledToday && local.minuteOfDay < drawMinute) {
    const expected = previousScheduledDate(local.isoDate, local.weekday, schedule.days);
    return latestDate === expected
      ? { state: DATASET_FRESHNESS.WAITING_FOR_DRAW, expectedDrawDate: expected, latestDate, scheduleVerified: true, collectorHealth: health.state }
      : { state: DATASET_FRESHNESS.STALE, expectedDrawDate: expected, latestDate, scheduleVerified: true, collectorHealth: health.state, reason: 'MISSED_PREVIOUS_DRAW' };
  }

  const expected = scheduledToday
    ? local.isoDate
    : previousScheduledDate(local.isoDate, local.weekday, schedule.days);
  if (latestDate === expected) {
    return { state: DATASET_FRESHNESS.CURRENT, expectedDrawDate: expected, latestDate, scheduleVerified: true, collectorHealth: health.state };
  }

  if (!scheduledToday) {
    return { state: DATASET_FRESHNESS.STALE, expectedDrawDate: expected, latestDate, scheduleVerified: true, collectorHealth: health.state, reason: 'MISSED_EXPECTED_DRAW' };
  }
  const minutesAfterDraw = local.minuteOfDay - drawMinute;
  if (minutesAfterDraw <= schedule.graceMinutes) {
    return { state: DATASET_FRESHNESS.WAITING_FOR_SOURCE, expectedDrawDate: expected, latestDate, scheduleVerified: true, collectorHealth: health.state, minutesAfterDraw };
  }
  if (minutesAfterDraw >= staleAfterMinutes) {
    return { state: DATASET_FRESHNESS.STALE, expectedDrawDate: expected, latestDate, scheduleVerified: true, collectorHealth: health.state, minutesAfterDraw };
  }
  if ([COLLECTOR_HEALTH.DELAYED, COLLECTOR_HEALTH.STALE, COLLECTOR_HEALTH.UNKNOWN].includes(health.state)) {
    return { state: DATASET_FRESHNESS.COLLECTOR_DELAYED, expectedDrawDate: expected, latestDate, scheduleVerified: true, collectorHealth: health.state, minutesAfterDraw };
  }
  return { state: DATASET_FRESHNESS.WAITING_FOR_SOURCE, expectedDrawDate: expected, latestDate, scheduleVerified: true, collectorHealth: health.state, minutesAfterDraw };
}

export function datasetFreshnessMessage(result) {
  if (!result) return '';
  if (result.state === DATASET_FRESHNESS.CURRENT) return 'Dataset sesuai jadwal hasil terakhir.';
  if (result.state === DATASET_FRESHNESS.WAITING_FOR_DRAW) return 'Menunggu jadwal draw berikutnya.';
  if (result.state === DATASET_FRESHNESS.WAITING_FOR_SOURCE) return 'Prediksi sesuai dataset terakhir, tetapi hasil terbaru masih menunggu sumber.';
  if (result.state === DATASET_FRESHNESS.COLLECTOR_DELAYED) return 'Prediksi sesuai dataset terakhir, tetapi pemeriksaan backend collector terlambat.';
  return 'Dataset melewati tanggal hasil yang diharapkan. Prediksi terakhir tidak boleh disebut current.';
}
