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

function latestMarketTimestamp(status, field) {
  const values = [];
  for (const market of Object.values(status?.markets || {})) {
    values.push(market?.[field]);
  }
  return values.map(validDate).filter(Boolean).sort((a, b) => b - a)[0] || null;
}

export function collectorTimestampEvidence(status) {
  const publishedStatus = validDate(status?.collected_at)
    || latestMarketTimestamp(status, 'last_source_check');
  const publishedSourceCheck = latestMarketTimestamp(status, 'last_source_check');
  const resultUpdate = latestMarketTimestamp(status, 'last_successful_data_update');
  // Never infer a backend check from a workflow schedule or a no-change data
  // file. It is available to the app only if a future public payload publishes
  // that explicit evidence.
  const backendCheck = validDate(status?.backend_last_check);
  return {
    publishedStatusAt: publishedStatus?.toISOString() || null,
    publishedSourceCheckAt: publishedSourceCheck?.toISOString() || null,
    latestResultUpdateAt: resultUpdate?.toISOString() || null,
    backendLastCheckAt: backendCheck?.toISOString() || null,
    backendCheckAvailable: Boolean(backendCheck),
  };
}

function ageText(ageMinutes) {
  return ageMinutes < 60
    ? `${ageMinutes} menit lalu`
    : `${Math.floor(ageMinutes / 60)} jam lalu`;
}

export function collectorHealth(status, now = new Date(), cadenceMinutes = 10) {
  const evidence = collectorTimestampEvidence(status);
  const publishedAt = validDate(evidence.publishedStatusAt);
  if (!publishedAt) {
    return {
      ...evidence,
      state: COLLECTOR_HEALTH.UNKNOWN,
      ageMinutes: null,
      lastCheck: null,
      label: 'Status publik collector belum tersedia',
    };
  }
  const ageMinutes = Math.max(0, Math.floor((now.getTime() - publishedAt.getTime()) / MINUTE_MS));
  const common = {
    ...evidence,
    ageMinutes,
    // Compatibility alias. This is the timestamp represented by the public
    // status document, not proof of the latest backend workflow execution.
    lastCheck: evidence.publishedSourceCheckAt || evidence.publishedStatusAt,
  };
  if (ageMinutes <= cadenceMinutes * 2.5) {
    return { ...common, state: COLLECTOR_HEALTH.HEALTHY, label: `Status publik baru · diterbitkan ${ageText(ageMinutes)}` };
  }
  if (ageMinutes <= cadenceMinutes * 9) {
    return { ...common, state: COLLECTOR_HEALTH.DELAYED, label: `Status publik tertunda · diterbitkan ${ageText(ageMinutes)}` };
  }
  return { ...common, state: COLLECTOR_HEALTH.STALE, label: `Status publik lama · diterbitkan ${ageText(ageMinutes)}` };
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
    return { state: DATASET_FRESHNESS.WAITING_FOR_SOURCE, expectedDrawDate: expected, latestDate, scheduleVerified: true, collectorHealth: health.state, minutesAfterDraw, reason: 'PUBLIC_STATUS_NOT_RECENT' };
  }
  return { state: DATASET_FRESHNESS.WAITING_FOR_SOURCE, expectedDrawDate: expected, latestDate, scheduleVerified: true, collectorHealth: health.state, minutesAfterDraw };
}

export function datasetFreshnessMessage(result) {
  if (!result) return '';
  if (result.state === DATASET_FRESHNESS.CURRENT) return 'Dataset sesuai jadwal hasil terakhir.';
  if (result.state === DATASET_FRESHNESS.WAITING_FOR_DRAW) return 'Menunggu jadwal draw berikutnya.';
  if (result.state === DATASET_FRESHNESS.WAITING_FOR_SOURCE) return 'Prediksi sesuai dataset terakhir, tetapi hasil terbaru masih menunggu sumber.';
  if (result.state === DATASET_FRESHNESS.COLLECTOR_DELAYED) return 'Status publik collector belum diperbarui; pemeriksaan backend terbaru tidak tersedia di aplikasi.';
  return 'Dataset melewati tanggal hasil yang diharapkan. Prediksi terakhir tidak boleh disebut current.';
}
