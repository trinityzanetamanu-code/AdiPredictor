import { normalizeArchivePath, validatePredictionArchive } from './predictionArchive.js';

const REMOTE_ROOT =
  'https://raw.githubusercontent.com/trinityzanetamanu-code/AdiPredictor/main/public';

const MARKET_FILES = {
  HK: 'hk',
  SGP: 'sgp',
  SDY: 'sdy',
};

const provenance = new WeakMap();
const fetchEvents = [];
const MAX_FETCH_EVENTS = 80;
export const getDataProvenance = (value) => value && typeof value === 'object'
  ? provenance.get(value) || null : null;
export const getDataFetchDiagnostics = () => fetchEvents.map((event) => ({ ...event }));

function recordFetchEvent(meta, outcome, reason = null) {
  // Only the fixed data paths are fetched here. Strip query strings and never
  // copy response headers, cookies, or arbitrary exception text to diagnostics.
  let host = 'invalid-url';
  let path = '';
  try {
    const parsed = new URL(meta.url, 'https://apk.local');
    host = parsed.host;
    path = parsed.pathname;
  } catch { /* The URL is already sanitized to these two fields. */ }
  const item = {
    host, path, status: meta.status ?? null,
    started_at: meta.started_at, finished_at: meta.finished_at,
    origin: outcome, result_date: meta.result_date || null,
    fingerprint: meta.fingerprint || null, version: meta.version || null,
    reason,
  };
  fetchEvents.push(item);
  if (fetchEvents.length > MAX_FETCH_EVENTS) fetchEvents.shift();
}

function safeFailureReason(error, status) {
  if (status) return `HTTP_${status}`;
  if (error?.name === 'AbortError') return 'TIMEOUT_OR_ABORT';
  return 'NETWORK_OR_PARSE_ERROR';
}

function fingerprint(value) {
  const payload = JSON.stringify(value);
  let hash = 2166136261;
  for (let i = 0; i < payload.length; i += 1) hash = Math.imul(hash ^ payload.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function describePayload(value) {
  const latest = Array.isArray(value) ? value[0] : value;
  return {
    result_date: latest?.result_date || latest?.prediction_basis_date || latest?.latest_result?.date || null,
    version: latest?.dataset_fingerprint || latest?.generated_at || latest?.retrieved_at || null,
    fingerprint: fingerprint(value),
  };
}

async function fetchJson(url, timeoutMs = 12000, externalSignal = null) {
  const startedAt = new Date().toISOString();
  let status = null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const abortFromCaller = () => controller.abort();
  if (externalSignal?.aborted) controller.abort();
  externalSignal?.addEventListener?.('abort', abortFromCaller, { once: true });

  try {
    const separator = url.includes('?') ? '&' : '?';
    const response = await fetch(url + separator + '_=' + Date.now(), {
      cache: 'no-store',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    status = response.status;

    if (!response.ok) {
      throw new Error('HTTP ' + response.status + ' for ' + url);
    }

    const data = await response.json();
    return { data, meta: { url, status, started_at: startedAt, finished_at: new Date().toISOString(), ...describePayload(data) } };
  } catch (error) {
    recordFetchEvent({ url, status, started_at: startedAt, finished_at: new Date().toISOString() },
      'FAILED', safeFailureReason(error, status));
    console.info('AdiPredictor fetch', { url, status, started_at: startedAt,
      finished_at: new Date().toISOString(), outcome: 'FAILED', reason: error?.name === 'AbortError' ? 'TIMEOUT_OR_ABORT' : String(error?.message || error) });
    throw error;
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener?.('abort', abortFromCaller);
  }
}

async function remoteFirst(relativePath, localPath, optional = false, signal = null) {
  const select = ({ data, meta }, source, reason = null) => {
    const observation = { ...meta, source, fallback_reason: reason };
    const remoteHttp = /^HTTP (\d+)/.exec(reason || '');
    recordFetchEvent(meta, source === 'REMOTE' ? 'REMOTE' : 'APK_FALLBACK',
      source === 'REMOTE' ? null : remoteHttp ? `REMOTE_HTTP_${remoteHttp[1]}` : 'REMOTE_UNAVAILABLE');
    console.info('AdiPredictor fetch', observation);
    if (data && typeof data === 'object') provenance.set(data, observation);
    return data;
  };
  try {
    return select(await fetchJson(REMOTE_ROOT + '/' + relativePath, 12000, signal), 'REMOTE');
  } catch (remoteError) {
    if (signal?.aborted) throw remoteError;
    if (!localPath) {
      if (optional) return null;
      throw remoteError;
    }

    try {
      return select(await fetchJson(localPath, 12000, signal), 'FALLBACK', remoteError?.message || 'REMOTE_FAILED');
    } catch (localError) {
      if (optional) return null;
      throw new Error(
        'Remote dan local fallback gagal: ' +
          remoteError.message +
          '; ' +
          localError.message,
      );
    }
  }
}

export async function loadMarketData(marketCode) {
  const file = MARKET_FILES[marketCode];
  if (!file) throw new Error('Market tidak dikenal: ' + marketCode);

  const data = await remoteFirst(
    'data/' + file + '.json',
    './data/' + file + '.json',
  );

  return Array.isArray(data) ? data : [];
}

export async function loadCollectorStatus() {
  return remoteFirst(
    'data/collector-status.json',
    './data/collector-status.json',
    true,
  );
}

export async function loadPrediction(marketCode) {
  const code = marketCode.toLowerCase();

  return remoteFirst(
    'predictions/' + code + '/latest.json',
    './predictions/' + code + '/latest.json',
    true,
  );
}

export async function loadPredictionHistory(marketCode) {
  const code = marketCode.toLowerCase();

  const data = await remoteFirst(
    'predictions/' + code + '/history.json',
    './predictions/' + code + '/history.json',
    true,
  );

  return data && Array.isArray(data.records)
    ? data
    : { schema_version: 1, market: marketCode, count: 0, records: [] };
}

export async function loadPredictionArchive(marketCode, indexRecord, { signal } = {}) {
  const relativePath = normalizeArchivePath(indexRecord, marketCode);
  const payload = await remoteFirst(
    relativePath,
    './' + relativePath,
    false,
    signal,
  );
  return validatePredictionArchive(payload, indexRecord, marketCode);
}

export function predictionAssetUrl(imagePath, fingerprint = '') {
  if (!imagePath) return '';
  if (/^https?:\/\//i.test(imagePath)) return imagePath;
  const cleanPath = String(imagePath).replace(/^\/+/, '');
  const version = fingerprint ? encodeURIComponent(fingerprint.slice(0, 16)) : Date.now();
  return REMOTE_ROOT + '/' + cleanPath + '?v=' + version;
}

export async function loadOfficial4DResult() {
  const data = await remoteFirst(
    'data/singapore-official.json',
    './data/singapore-official.json',
    true,
  );
  return data?.official_4d || null;
}

export async function loadOfficialTotoResult() {
  const data = await remoteFirst(
    'data/singapore-official.json',
    './data/singapore-official.json',
    true,
  );
  return data?.official_toto || null;
}

export async function loadLiveDrawSnapshot() {
  const data = await remoteFirst(
    'data/live-draw.json',
    './data/live-draw.json',
    true,
  );
  return data?.markets
    ? data
    : { schema_version: 1, retrieved_at: null, markets: {} };
}

export async function loadAppReleaseMetadata() {
  return remoteFirst(
    'app-release.json',
    './app-release.json',
    true,
  );
}


export async function loadTafsir() {
  const data = await remoteFirst(
    'data/tafsir.json',
    './data/tafsir.json',
    true,
  );

  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}
