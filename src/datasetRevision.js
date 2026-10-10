// Shared wire definition: SHA256("MARKET|date:4D|...") in ascending date order.
// Engine version belongs to the prediction fingerprint, not this data identity.
export async function datasetRevision(market, rows) {
  if (!Array.isArray(rows) || !rows.length) return null;
  const ordered = rows.filter((row) => row.result_date).slice()
    .sort((a, b) => a.result_date.localeCompare(b.result_date));
  if (!ordered.length || ordered.some((r) => !/^\d{4}$/.test(String(r.nomor || '')))) return null;
  const material = `${market}|${ordered.map((r) => `${r.result_date}:${r.nomor}`).join('|')}`;
  const bytes = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(material));
  return [...new Uint8Array(bytes)].map((n) => n.toString(16).padStart(2, '0')).join('');
}

export async function alignPredictionWithDataset(market, rows, prediction) {
  if (!prediction) return null;
  let reason = 'DATASET_VERSION_UNAVAILABLE';
  try {
    const revision = await datasetRevision(market, rows);
    if (revision && prediction.dataset_revision) reason = revision === prediction.dataset_revision ? 'MATCH' : 'DATASET_VERSION_MISMATCH';
    // Archives still use the date/number guard. Current legacy payloads remain
    // readable but cannot claim whole-dataset alignment without a revision.
  } catch { reason = 'DATASET_VERSION_CHECK_FAILED'; }
  return { ...prediction, dataset_alignment: reason };
}
