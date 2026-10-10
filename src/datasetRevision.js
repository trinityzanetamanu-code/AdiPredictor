// Shared wire definition: SHA256("MARKET|date:4D|...") in ascending date order.
// Engine version belongs to the legacy prediction fingerprint, not this data identity.
function datasetMaterial(market, rows) {
  if (!Array.isArray(rows) || !rows.length) return null;
  const ordered = rows.filter((row) => row.result_date).slice()
    .sort((a, b) => a.result_date.localeCompare(b.result_date));
  if (!ordered.length || ordered.some((r) => !/^\d{4}$/.test(String(r.nomor || '')))) return null;
  return `${market}|${ordered.map((r) => `${r.result_date}:${r.nomor}`).join('|')}`;
}

async function sha256(material) {
  if (material == null) return null;
  const bytes = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(material));
  return [...new Uint8Array(bytes)].map((n) => n.toString(16).padStart(2, '0')).join('');
}

export async function datasetRevision(market, rows) {
  return sha256(datasetMaterial(market, rows));
}

export async function legacyDatasetFingerprint(market, rows, engineVersion) {
  // Only this repository's known v2 wire contract can validate old current payloads.
  if (engineVersion !== 'AdiPredictor-P1-P8-v2') return null;
  const material = datasetMaterial(market, rows);
  return material == null ? null : sha256(`${engineVersion}|${material}`);
}

export async function alignPredictionWithDataset(market, rows, prediction) {
  if (!prediction) return null;
  let reason = 'DATASET_VERSION_UNAVAILABLE';
  try {
    if (prediction.dataset_revision) {
      const revision = await datasetRevision(market, rows);
      if (revision) reason = revision === prediction.dataset_revision ? 'MATCH' : 'DATASET_VERSION_MISMATCH';
    } else if (prediction.dataset_fingerprint) {
      const fingerprint = await legacyDatasetFingerprint(market, rows, prediction.engine_version || prediction.engine);
      if (fingerprint) reason = fingerprint === prediction.dataset_fingerprint ? 'MATCH' : 'DATASET_VERSION_MISMATCH';
    }
    // Archives keep their compatibility guard. A current payload with neither
    // recognized whole-dataset identity cannot claim alignment.
  } catch { reason = 'DATASET_VERSION_CHECK_FAILED'; }
  return { ...prediction, dataset_alignment: reason };
}
