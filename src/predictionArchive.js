const MARKETS = new Set(['HK', 'SDY', 'SGP']);

export function publishedHistoryRecords(history) {
  return (history?.records || []).filter((record) => (
    MARKETS.has(String(record?.market || history?.market || '').toUpperCase())
    && /^\d{4}-\d{2}-\d{2}$/.test(String(record?.target_date || ''))
    && typeof record?.archive_path === 'string'
  ));
}

export function normalizeArchivePath(record, marketCode) {
  const market = String(marketCode || '').toLowerCase();
  if (!MARKETS.has(market.toUpperCase())) throw new Error('Pasaran arsip tidak dikenal.');

  const path = String(record?.archive_path || '').replace(/^\/+/, '');
  const expected = new RegExp(`^public/predictions/${market}/archive/\\d{4}-\\d{2}-\\d{2}\\.json$`);
  if (!expected.test(path)) throw new Error('Lokasi arsip tidak valid untuk pasaran terpilih.');
  return path.replace(/^public\//, '');
}

export function validatePredictionArchive(payload, indexRecord, marketCode) {
  if (!payload || typeof payload !== 'object') throw new Error('Arsip prediksi kosong atau rusak.');
  const market = String(marketCode || '').toUpperCase();
  if (String(payload.market || '').toUpperCase() !== market) {
    throw new Error('Pasaran arsip tidak cocok dengan pilihan.');
  }
  if (payload.target_date !== indexRecord?.target_date) {
    throw new Error('Tanggal arsip tidak cocok dengan indeks publikasi.');
  }
  if (indexRecord?.target_period && payload.target_period !== indexRecord.target_period) {
    throw new Error('Periode arsip tidak cocok dengan indeks publikasi.');
  }
  if (
    indexRecord?.dataset_fingerprint
    && payload.dataset_fingerprint !== indexRecord.dataset_fingerprint
  ) {
    throw new Error('Fingerprint arsip tidak cocok dengan indeks publikasi.');
  }
  return payload;
}

export function createArchiveRequestCoordinator() {
  let latest = 0;
  return {
    begin() {
      latest += 1;
      return latest;
    },
    isLatest(requestId) {
      return requestId === latest;
    },
    invalidate() {
      latest += 1;
    },
  };
}

export function archiveResultState(record) {
  const number = String(record?.actual_result?.number || '');
  return /^\d{4}$/.test(number)
    ? { resolved: true, label: `Hasil ${number}` }
    : { resolved: false, label: 'Menunggu hasil' };
}
