export const PLAYER_MODES = Object.freeze({
  VIDEO: 'VIDEO',
  IFRAME: 'IFRAME',
  OFFICIAL_PAGE: 'OFFICIAL_PAGE',
  RESULT_ONLY: 'RESULT_ONLY',
  NATIVE_BOARD: 'NATIVE_BOARD',
});

export const PLAYER_STATES = Object.freeze({
  LOADING: 'PLAYER_LOADING',
  READY: 'PLAYER_READY',
  PLAYING: 'PLAYER_PLAYING',
  WAITING: 'PLAYER_WAITING',
  BLOCKED: 'PLAYER_BLOCKED',
  BLOCKED_EMBED: 'PLAYER_BLOCKED',
  ERROR: 'PLAYER_ERROR',
  TIMEOUT: 'PLAYER_TIMEOUT',
  UNAVAILABLE: 'PLAYER_UNAVAILABLE',
  OFFLINE: 'PLAYER_UNAVAILABLE',
});

export const MEDIA_STATES = Object.freeze({
  UPCOMING: 'UPCOMING',
  LIVE: 'LIVE',
  LAST_COMPLETED_DRAW: 'LAST_COMPLETED_DRAW',
  RESULT_POSTED: 'RESULT_POSTED',
  UNAVAILABLE: 'UNAVAILABLE',
});

export function scheduleBadgeLabel(status) {
  if (status === 'LIVE_WINDOW') return 'DRAW WINDOW';
  return String(status || 'OFFLINE').replaceAll('_', ' ');
}

export function resolveMediaPresentation({ scheduleStatus, hasPlaylist, verifiedLive = false }) {
  const drawState = scheduleStatus === 'LIVE_WINDOW'
    ? MEDIA_STATES.LIVE
    : scheduleStatus === 'RESULT_POSTED'
      ? MEDIA_STATES.RESULT_POSTED
      : scheduleStatus === 'UPCOMING'
        ? MEDIA_STATES.UPCOMING
        : MEDIA_STATES.UNAVAILABLE;

  if (drawState === MEDIA_STATES.LIVE && verifiedLive) {
    return {
      drawState,
      mediaState: MEDIA_STATES.LIVE,
      label: 'Siaran live terverifikasi',
      playLabel: 'Putar siaran live',
    };
  }
  if (hasPlaylist) {
    return {
      drawState,
      mediaState: MEDIA_STATES.LAST_COMPLETED_DRAW,
      label: 'Rekaman draw terakhir',
      playLabel: 'Putar rekaman draw terakhir',
    };
  }
  return {
    drawState,
    mediaState: MEDIA_STATES.UNAVAILABLE,
    label: 'Media tidak tersedia',
    playLabel: 'Buka Live Resmi',
  };
}

export const SGP_COMPOSITE_SOURCE_LABEL = 'Third-party cross-checked market result';

const singaporeSchedule = (days) => ({
  timezone: 'Asia/Singapore',
  utcOffsetMinutes: 480,
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
    pageUrl: 'https://www.singaporepools.com.sg/ms/lotteryhomepage/4d/index.html#draw-video',
    resultUrl: 'https://www.singaporepools.com.sg/DataFileArchive/Lottery/Output/fourd_result_top_draws_en.html',
    playlistId: 'PLaXhIWKbyl3U-lDz1iRRZ8-rabk_uZbCY',
    currentVideoId: 'SByHDTZjxEI',
    embedUrl: 'https://www.youtube.com/embed/videoseries?list=PLaXhIWKbyl3U-lDz1iRRZ8-rabk_uZbCY&rel=0&playsinline=1&enablejsapi=1',
    runtimePlaybackStatus: 'ANDROID_RUNTIME_TEST_REQUIRED',
    schedule: singaporeSchedule([0, 3, 6]),
  },
  SGP_TOTO: {
    id: 'SGP_TOTO',
    market: 'SGP',
    title: 'Singapore TOTO Official',
    sourceLabel: 'Official · Singapore Pools',
    official: true,
    mode: PLAYER_MODES.IFRAME,
    pageUrl: 'https://www.singaporepools.com.sg/ms/lotteryhomepage/toto/index.html#draw-video',
    resultUrl: 'https://www.singaporepools.com.sg/DataFileArchive/Lottery/Output/toto_result_top_draws_en.html',
    playlistId: 'PLaXhIWKbyl3VHtnNcMwG6KOg04q6QQXge',
    currentVideoId: '1xc5gepZWQU',
    embedUrl: 'https://www.youtube.com/embed/videoseries?list=PLaXhIWKbyl3VHtnNcMwG6KOg04q6QQXge&rel=0&playsinline=1&enablejsapi=1',
    runtimePlaybackStatus: 'ANDROID_RUNTIME_TEST_REQUIRED',
    schedule: singaporeSchedule([1, 4]),
  },
  HK: {
    id: 'HK',
    market: 'HK',
    title: 'HK Market Live',
    sourceLabel: 'HongkongPools Market Source',
    liveSourceLabel: 'KocokHK Mirror',
    publicMirrorUrl: 'https://rankcrack.com/hk.php',
    official: false,
    mode: PLAYER_MODES.NATIVE_BOARD,
    pageUrl: 'https://www.hongkongpools.com/live',
    fallbackUrl: 'https://www.hongkongpools.com/live.html',
    schedule: {
      timezone: 'Asia/Jakarta',
      utcOffsetMinutes: 420,
      days: [0, 1, 2, 3, 4, 5, 6],
      startHour: 22,
      startMinute: 45,
      liveLeadMinutes: 15,
      liveTailMinutes: 60,
    },
    note: 'HKJC Mark Six is a different official Hong Kong lottery and is not the dataset used by this prediction market.',
  },
  SDY: {
    id: 'SDY',
    market: 'SDY',
    title: 'Sydney Market Live',
    sourceLabel: 'SydneyPoolsToday Market Source',
    official: false,
    mode: PLAYER_MODES.NATIVE_BOARD,
    pageUrl: 'https://www.sydneypoolstoday.com/live.html',
    dataUrl: 'https://www.sydneypoolstoday.com/getLiveContent',
    schedule: null,
    note: 'Data tabel diparsing sebagai teks/gambar digit dan dirender native; script serta iklan sumber tidak dijalankan.',
  },
});

export function resolveLiveDrawSource(market, singaporeMode = 'SGP_4D') {
  if (market === 'SGP') {
    return LIVE_DRAW_SOURCES[singaporeMode] || LIVE_DRAW_SOURCES.SGP_4D;
  }
  return LIVE_DRAW_SOURCES[market] || null;
}

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
