function fourDigits(value) {
  const normalized = String(value ?? '').trim();
  return /^\d{1,4}$/.test(normalized) ? normalized.padStart(4, '0') : '';
}

export function predictionFreshness(prediction, latest) {
  if (!prediction || !latest) {
    return { fresh: false, stale: Boolean(prediction), reason: 'PREDICTION_OR_DATASET_MISSING' };
  }
  const basis = prediction.latest_result || {};
  const basisDate = prediction.prediction_basis_date || basis.date;
  const basisResult = fourDigits(prediction.prediction_basis_result || basis.number);
  const latestDate = latest.result_date;
  const latestResult = fourDigits(latest.nomor);
  if (basisDate !== latestDate || basisResult !== latestResult) {
    return { fresh: false, stale: true, reason: 'BASIS_DOES_NOT_MATCH_LATEST_DATASET' };
  }
  if (!prediction.target_date || prediction.target_date <= basisDate) {
    return { fresh: false, stale: true, reason: 'TARGET_NOT_AFTER_BASIS_DATE' };
  }
  return { fresh: true, stale: false, reason: 'CURRENT' };
}

export function predictionChangeNote(prediction) {
  const changes = prediction?.changed_from_previous || {};
  const values = Object.values(changes).filter((value) => typeof value === 'boolean');
  if (!values.length) return '';
  return values.some(Boolean)
    ? 'Kandidat diperbarui sesuai perhitungan data terbaru.'
    : 'Beberapa kandidat tetap sama setelah perhitungan ulang.';
}
