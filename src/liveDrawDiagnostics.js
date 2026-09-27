export const LIVE_DRAW_DIAGNOSTIC_EVENTS = Object.freeze({
  PLAYER_MOUNT: 'PLAYER_MOUNT',
  YOUTUBE_API_LOADING: 'YOUTUBE_API_LOADING',
  YOUTUBE_API_READY: 'YOUTUBE_API_READY',
  PLAYER_READY: 'PLAYER_READY',
  PLAY_REQUESTED: 'PLAY_REQUESTED',
  PLAYER_PLAYING: 'PLAYER_PLAYING',
  PLAYER_PAUSED: 'PLAYER_PAUSED',
  PLAYER_ENDED: 'PLAYER_ENDED',
  PLAYER_ERROR: 'PLAYER_ERROR',
  WATCHDOG_TIMEOUT: 'WATCHDOG_TIMEOUT',
  TAB_HIDDEN: 'TAB_HIDDEN',
  TAB_VISIBLE: 'TAB_VISIBLE',
  APP_BACKGROUND: 'APP_BACKGROUND',
  APP_RESUME: 'APP_RESUME',
  PLAYER_DESTROYED: 'PLAYER_DESTROYED',
  PLAYER_REMOUNTED: 'PLAYER_REMOUNTED',
  ANDROID_EMBED_CONTAINED: 'ANDROID_EMBED_CONTAINED',
});

const MAX_EVENTS = 40;
const listeners = new Set();
let recentEvents = [];

function safeDetails(details) {
  return Object.fromEntries(Object.entries(details || {})
    .filter(([key, value]) => {
      const sensitive = /url|cookie|token|authorization|header/i.test(key);
      return !sensitive && ['string', 'number', 'boolean'].includes(typeof value);
    })
    .map(([key, value]) => [key, String(value).slice(0, 120)]));
}

export function recordLiveDrawDiagnostic(type, details = {}) {
  const event = {
    at: new Date().toISOString(),
    type: String(type || 'UNKNOWN_EVENT').slice(0, 80),
    details: safeDetails(details),
  };
  recentEvents = [...recentEvents, event].slice(-MAX_EVENTS);
  for (const listener of listeners) listener(getLiveDrawDiagnostics());
  return event;
}

export function getLiveDrawDiagnostics() {
  return recentEvents.map((event) => ({ ...event, details: { ...event.details } }));
}

export function subscribeLiveDrawDiagnostics(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function formatLiveDrawDiagnostics() {
  return JSON.stringify({
    schema_version: 1,
    generated_at: new Date().toISOString(),
    events: getLiveDrawDiagnostics(),
  }, null, 2);
}

export function resetLiveDrawDiagnosticsForTest() {
  recentEvents = [];
  for (const listener of listeners) listener([]);
}
