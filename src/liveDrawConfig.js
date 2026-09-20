export const PLAYER_MODES = Object.freeze({
  VIDEO: 'VIDEO',
  IFRAME: 'IFRAME',
  OFFICIAL_PAGE: 'OFFICIAL_PAGE',
  RESULT_ONLY: 'RESULT_ONLY',
});

export const PLAYER_STATES = Object.freeze({
  LOADING: 'LOADING',
  READY: 'READY',
  PLAYING: 'PLAYING',
  WAITING: 'WAITING',
  OFFLINE: 'OFFLINE',
  BLOCKED_EMBED: 'BLOCKED_EMBED',
  ERROR: 'ERROR',
});

export function scheduleBadgeLabel(status) {
  if (status === 'LIVE_WINDOW') return 'DRAW WINDOW';
  return String(status || 'OFFLINE').replaceAll('_', ' ');
}

export const SGP_COMPOSITE_SOURCE_LABEL = 'Third-party cross-checked market result';

const singaporeSchedule = (days) => ({
  timezone: 'Asia/Singapore',
  days,
  startHour: 18,
  startMinute: 30,
  liveLeadMinutes: 15,
  liveTailMinutes: 60,
});

export const LIVE_DRAW_SOURCES = Object.freeze({
  SGP_4D: {
    id: 'SGP_4D',
    market: 'SGP',
    title: 'Singapore 4D Official',
    sourceLabel: 'Official · Singapore Pools',
    official: true,
    mode: PLAYER_MODES.IFRAME,
    pageUrl: 'https://www.singaporepools.com.sg/ms/lotteryhomepage/4d/index.html',
    resultUrl: 'https://www.singaporepools.com.sg/DataFileArchive/Lottery/Output/fourd_result_top_draws_en.html',
    playlistId: 'PLaXhIWKbyl3U-lDz1iRRZ8-rabk_uZbCY',
    embedUrl: 'https://www.youtube-nocookie.com/embed/videoseries?list=PLaXhIWKbyl3U-lDz1iRRZ8-rabk_uZbCY&rel=0&playsinline=1',
    schedule: singaporeSchedule([0, 3, 6]),
  },
  SGP_TOTO: {
    id: 'SGP_TOTO',
    market: 'SGP',
    title: 'Singapore TOTO Official',
    sourceLabel: 'Official · Singapore Pools',
    official: true,
    mode: PLAYER_MODES.IFRAME,
    pageUrl: 'https://www.singaporepools.com.sg/ms/lotteryhomepage/toto/index.html',
    resultUrl: 'https://www.singaporepools.com.sg/DataFileArchive/Lottery/Output/toto_result_top_draws_en.html',
    playlistId: 'PLaXhIWKbyl3VHtnNcMwG6KOg04q6QQXge',
    embedUrl: 'https://www.youtube-nocookie.com/embed/videoseries?list=PLaXhIWKbyl3VHtnNcMwG6KOg04q6QQXge&rel=0&playsinline=1',
    schedule: singaporeSchedule([1, 4]),
  },
  HK: {
    id: 'HK',
    market: 'HK',
    title: 'HK Market Live',
    sourceLabel: 'HongkongPools Market Source',
    official: false,
    mode: PLAYER_MODES.OFFICIAL_PAGE,
    pageUrl: 'https://www.hongkongpools.com/live',
    schedule: null,
    note: 'HKJC Mark Six is a different official Hong Kong lottery and is not the dataset used by this prediction market.',
  },
  SDY: {
    id: 'SDY',
    market: 'SDY',
    title: 'SDY Live Result Monitor',
    sourceLabel: 'Market Source · Cross-checked result',
    official: false,
    mode: PLAYER_MODES.RESULT_ONLY,
    pageUrl: null,
    schedule: null,
    note: 'No public embeddable live broadcast matching the configured SDY market source has been verified.',
  },
});

function zonedParts(now, timezone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    day: dayMap[values.weekday],
    minuteOfDay: Number(values.hour) * 60 + Number(values.minute),
  };
}

export function calculateLiveState(schedule, now = new Date()) {
  if (!schedule) {
    return { status: 'OFFLINE', minutesUntil: null, message: 'Jadwal live belum terverifikasi' };
  }
  const local = zonedParts(now, schedule.timezone);
  const start = schedule.startHour * 60 + schedule.startMinute;
  const liveStart = start - schedule.liveLeadMinutes;
  const liveEnd = start + schedule.liveTailMinutes;
  if (schedule.days.includes(local.day)) {
    if (local.minuteOfDay >= liveStart && local.minuteOfDay <= liveEnd) {
      return { status: 'LIVE_WINDOW', minutesUntil: 0, message: 'Live window aktif' };
    }
    if (local.minuteOfDay > liveEnd) {
      return { status: 'RESULT_POSTED', minutesUntil: null, message: 'Draw selesai · hasil tersedia setelah verifikasi' };
    }
    return { status: 'UPCOMING', minutesUntil: start - local.minuteOfDay, message: 'Live dimulai dalam ' + (start - local.minuteOfDay) + ' menit' };
  }
  const offsets = schedule.days.map((day) => (day - local.day + 7) % 7).filter(Boolean);
  const dayOffset = Math.min(...offsets);
  const minutesUntil = dayOffset * 1440 + start - local.minuteOfDay;
  return { status: 'UPCOMING', minutesUntil, message: 'Live berikutnya dalam ' + Math.ceil(minutesUntil / 60) + ' jam' };
}

export function selectSingaporeMode(now = new Date()) {
  const fourD = calculateLiveState(LIVE_DRAW_SOURCES.SGP_4D.schedule, now);
  const toto = calculateLiveState(LIVE_DRAW_SOURCES.SGP_TOTO.schedule, now);
  if (fourD.status === 'LIVE_WINDOW' || fourD.status === 'RESULT_POSTED') return 'SGP_4D';
  if (toto.status === 'LIVE_WINDOW' || toto.status === 'RESULT_POSTED') return 'SGP_TOTO';
  return (fourD.minutesUntil ?? Infinity) <= (toto.minutesUntil ?? Infinity) ? 'SGP_4D' : 'SGP_TOTO';
}
