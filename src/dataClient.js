const REMOTE_ROOT =
  'https://raw.githubusercontent.com/trinityzanetamanu-code/AdiPredictor/main/public';

const MARKET_FILES = {
  HK: 'hk',
  SGP: 'sgp',
  SDY: 'sdy',
};

async function fetchJson(url, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const separator = url.includes('?') ? '&' : '?';
    const response = await fetch(url + separator + '_=' + Date.now(), {
      cache: 'no-store',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error('HTTP ' + response.status + ' for ' + url);
    }

    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function remoteFirst(relativePath, localPath, optional = false) {
  try {
    return await fetchJson(REMOTE_ROOT + '/' + relativePath);
  } catch (remoteError) {
    if (!localPath) {
      if (optional) return null;
      throw remoteError;
    }

    try {
      return await fetchJson(localPath);
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
