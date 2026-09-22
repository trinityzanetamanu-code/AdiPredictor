import { LIVE_DRAW_SOURCES } from './liveDrawConfig.js';

export const NOTIFICATION_STORAGE_KEY = 'adipredictor:notification-preferences:v1';
export const DELIVERED_EVENTS_KEY = 'adipredictor:delivered-notification-events:v1';

export const DEFAULT_NOTIFICATION_PREFERENCES = Object.freeze({
  master: false,
  result: true,
  prediction: true,
  liveDraw: true,
  audit: true,
  appUpdate: true,
  collector: false,
});

const memoryStore = new Map();

function storageLike(storage) {
  if (storage) return storage;
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  return {
    getItem: (key) => memoryStore.get(key) ?? null,
    setItem: (key, value) => memoryStore.set(key, String(value)),
    removeItem: (key) => memoryStore.delete(key),
  };
}

export function loadNotificationPreferences(storage) {
  try {
    const parsed = JSON.parse(storageLike(storage).getItem(NOTIFICATION_STORAGE_KEY) || '{}');
    return { ...DEFAULT_NOTIFICATION_PREFERENCES, ...parsed };
  } catch {
    return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  }
}

export function saveNotificationPreferences(preferences, storage) {
  const normalized = { ...DEFAULT_NOTIFICATION_PREFERENCES, ...preferences };
  storageLike(storage).setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function permissionAllowsNotifications(permission) {
  return permission?.display === 'granted';
}

export function isVerifiedResult(row) {
  return /^\d{4}$/.test(String(row?.nomor || '')) && /^(confirmed_|official_|primary_source|provisional_primary)/i.test(String(row?.verification || ''));
}

export function stableUpdateAvailable(remote, installedVersionCode) {
  return remote?.channel === 'stable'
    && remote?.update_channel_ready === true
    && Number(remote?.version_code || 0) > Number(installedVersionCode || 0);
}

export function eventKey(type, ...parts) {
  return [type, ...parts].map((part) => String(part ?? '')).join(':');
}

function resultEvent(market, row) {
  return {
    key: eventKey('RESULT', market, row.result_date, row.nomor),
    category: 'result', title: `${market} terbaru: ${row.nomor}`,
    body: `${row.result_date} · hasil telah terverifikasi.`,
    extra: { target: 'results', market },
  };
}

function predictionEvent(market, prediction) {
  return {
    key: eventKey('PREDICTION', market, prediction.target_period, prediction.dataset_fingerprint),
    category: 'prediction', title: `Prediksi ${market} sudah siap`,
    body: `Target ${prediction.target_period || prediction.target_date} selesai dihitung.`,
    extra: { target: 'prediction', market },
  };
}

function auditEvent(market, record) {
  return {
    key: eventKey('AUDIT', market, record.target_date, record.actual_result?.number),
    category: 'audit', title: `Audit prediksi ${market} tersedia`,
    body: `${record.target_period || record.target_date} sudah memiliki hasil aktual.`,
    extra: { target: 'audit', market },
  };
}

export function buildRuntimeNotificationEvents({ previous, current, installedVersionCode, preferences = DEFAULT_NOTIFICATION_PREFERENCES }) {
  if (!preferences.master) return [];
  const events = [];
  for (const market of ['HK', 'SDY', 'SGP']) {
    const currentRow = current?.marketData?.[market]?.[0];
    const previousRow = previous?.marketData?.[market]?.[0];
    if (previous && preferences.result && isVerifiedResult(currentRow)
      && `${currentRow.result_date}:${currentRow.nomor}` !== `${previousRow?.result_date}:${previousRow?.nomor}`) {
      events.push(resultEvent(market, currentRow));
    }

    const currentPrediction = current?.predictions?.[market];
    const previousPrediction = previous?.predictions?.[market];
    if (previous && preferences.prediction && currentPrediction?.dataset_fingerprint
      && currentPrediction.dataset_fingerprint !== previousPrediction?.dataset_fingerprint
      && currentPrediction.prediction_basis_date === currentRow?.result_date
      && String(currentPrediction.prediction_basis_result).padStart(4, '0') === String(currentRow?.nomor).padStart(4, '0')) {
      events.push(predictionEvent(market, currentPrediction));
    }

    const currentResolved = (current?.histories?.[market]?.records || []).find((record) => /^\d{4}$/.test(String(record?.actual_result?.number || '')));
    const previousResolved = (previous?.histories?.[market]?.records || []).find((record) => /^\d{4}$/.test(String(record?.actual_result?.number || '')));
    if (previous && preferences.audit && currentResolved
      && `${currentResolved.target_date}:${currentResolved.actual_result.number}` !== `${previousResolved?.target_date}:${previousResolved?.actual_result?.number}`) {
      events.push(auditEvent(market, currentResolved));
    }
  }
  if (preferences.appUpdate && stableUpdateAvailable(current?.releaseMetadata, installedVersionCode)) {
    const versionCode = current.releaseMetadata.version_code;
    events.push({
      key: eventKey('UPDATE', versionCode), category: 'appUpdate',
      title: 'Versi AdiPredictor terbaru tersedia',
      body: `${current.releaseMetadata.version_name || `Build ${versionCode}`} siap diperiksa.`,
      extra: { target: 'update', versionCode },
    });
  }
  return events;
}

function deliveredSet(storage) {
  try { return new Set(JSON.parse(storageLike(storage).getItem(DELIVERED_EVENTS_KEY) || '[]')); }
  catch { return new Set(); }
}

export function claimEventOnce(key, storage) {
  const target = storageLike(storage);
  const delivered = deliveredSet(target);
  if (delivered.has(key)) return false;
  delivered.add(key);
  target.setItem(DELIVERED_EVENTS_KEY, JSON.stringify([...delivered].slice(-500)));
  return true;
}

export function notificationId(key) {
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) hash = ((hash << 5) - hash + key.charCodeAt(index)) | 0;
  return Math.abs(hash || 1);
}

export async function checkNotificationPermission() {
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    return await LocalNotifications.checkPermissions();
  } catch {
    return { display: 'unavailable' };
  }
}

export async function requestNotificationPermission() {
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  const current = await LocalNotifications.checkPermissions();
  return permissionAllowsNotifications(current) ? current : LocalNotifications.requestPermissions();
}

export async function disableNativeNotifications() {
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const pending = await LocalNotifications.getPending();
    if (pending.notifications?.length) await LocalNotifications.cancel({ notifications: pending.notifications.map(({ id }) => ({ id })) });
  } catch { /* Web/unsupported platform has nothing to cancel. */ }
}

export async function getInstalledVersionCode() {
  try {
    const [{ App }, { Capacitor }] = await Promise.all([import('@capacitor/app'), import('@capacitor/core')]);
    if (!Capacitor.isNativePlatform()) return null;
    const info = await App.getInfo();
    return Number(info.build || 0) || null;
  } catch { return null; }
}

export async function deliverRuntimeNotifications(snapshot, previous, storage) {
  const preferences = loadNotificationPreferences(storage);
  if (!preferences.master) return [];
  const permission = await checkNotificationPermission();
  if (!permissionAllowsNotifications(permission)) return [];
  const installedVersionCode = await getInstalledVersionCode();
  const events = buildRuntimeNotificationEvents({ previous, current: snapshot, installedVersionCode, preferences });
  const claimed = events.filter((event) => claimEventOnce(event.key, storage));
  if (!claimed.length) return [];
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  await LocalNotifications.schedule({
    notifications: claimed.map((event) => ({ id: notificationId(event.key), title: event.title, body: event.body, extra: { ...event.extra, eventKey: event.key } })),
  });
  return claimed;
}

function offsetString(offsetMinutes) {
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absolute = Math.abs(offsetMinutes);
  return `${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`;
}

function localISODate(now, timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { date: `${value.year}-${value.month}-${value.day}`, day: { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[value.weekday] };
}

export function nextDrawStart(source, now = new Date()) {
  if (!Number.isFinite(source?.schedule?.utcOffsetMinutes)) return null;
  const local = localISODate(now, source.schedule.timezone);
  for (let offset = 0; offset <= 7; offset += 1) {
    const day = (local.day + offset) % 7;
    if (!source.schedule.days.includes(day)) continue;
    const date = new Date(`${local.date}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + offset);
    const isoDate = date.toISOString().slice(0, 10);
    const candidate = new Date(`${isoDate}T${String(source.schedule.startHour).padStart(2, '0')}:${String(source.schedule.startMinute).padStart(2, '0')}:00${offsetString(source.schedule.utcOffsetMinutes)}`);
    if (candidate > now) return candidate;
  }
  return null;
}

export async function scheduleLiveDrawReminders(storage) {
  const preferences = loadNotificationPreferences(storage);
  if (!preferences.master || !preferences.liveDraw) return [];
  const permission = await checkNotificationPermission();
  if (!permissionAllowsNotifications(permission)) return [];
  const now = new Date();
  const notifications = [];
  for (const [sourceId, source] of Object.entries(LIVE_DRAW_SOURCES)) {
    if (!source.schedule || sourceId === 'SDY') continue;
    const drawStart = nextDrawStart(source, now);
    if (!drawStart) continue;
    const marketLabel = sourceId.replace('SGP_', 'SGP ');
    for (const [kind, at, body] of [
      ['LIVE_REMINDER', new Date(drawStart.getTime() - 10 * 60_000), `LiveDraw ${marketLabel} dimulai 10 menit lagi.`],
      ['LIVE_START', drawStart, `LiveDraw ${marketLabel} sudah dimulai.`],
    ]) {
      const key = eventKey(kind, sourceId, drawStart.toISOString().slice(0, 10));
      if (at > now && claimEventOnce(key, storage)) notifications.push({ id: notificationId(key), title: 'AdiPredictor LiveDraw', body, schedule: { at }, extra: { target: 'livedraw', market: source.market, sourceId, eventKey: key } });
    }
  }
  if (notifications.length) {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await LocalNotifications.schedule({ notifications });
  }
  return notifications;
}

export function notificationNavigation(extra = {}) {
  const market = ['HK', 'SDY', 'SGP'].includes(extra.market) ? extra.market : 'HK';
  if (extra.target === 'results') return { tab: 'results', market, internalPage: 'main' };
  if (extra.target === 'livedraw') return { tab: 'livedraw', market, internalPage: 'main' };
  if (extra.target === 'audit') return { tab: 'generator', market, internalPage: 'prediction-history' };
  if (extra.target === 'update') return { tab: 'generator', market, internalPage: 'main', showUpdate: true };
  return { tab: 'generator', market, internalPage: 'main' };
}

export async function registerNotificationActionListener(callback) {
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    return LocalNotifications.addListener('localNotificationActionPerformed', (action) => callback(notificationNavigation(action.notification?.extra)));
  } catch { return null; }
}
