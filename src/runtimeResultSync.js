const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const FOUR_DIGITS = /^\d{4}$/;
const SIX_DIGITS = /^\d{6}$/;

export const RUNTIME_SYNC_STATE = Object.freeze({
  DATASET_ONLY: 'DATASET_ONLY',
  LIVE_AHEAD_OF_DATASET: 'LIVE_AHEAD_OF_DATASET',
  DATASET_SYNCED: 'DATASET_SYNCED',
  LIVE_DATASET_CONFLICT: 'LIVE_DATASET_CONFLICT',
  DATASET_NEWER: 'DATASET_NEWER',
});

function normalizeFour(value) {
  const text = String(value ?? '');
  return FOUR_DIGITS.test(text) ? text : null;
}

export function createRuntimeLatestResult({ market, board, updatedAt = new Date().toISOString() }) {
  const code = String(market || '').toUpperCase();
  if (!['HK', 'SDY'].includes(code)) throw new Error('RUNTIME_MARKET_INVALID');
  if (!board || !ISO_DATE.test(String(board.draw_date || ''))) throw new Error('RUNTIME_DRAW_DATE_INVALID');
  for (const field of ['first', 'second', 'third']) {
    if (!SIX_DIGITS.test(String(board[field] || ''))) throw new Error(`RUNTIME_${field.toUpperCase()}_INVALID`);
  }
  const derived = normalizeFour(board.derived_4d);
  if (!derived || derived !== String(board.first).slice(-4)) throw new Error('RUNTIME_DERIVED_4D_INVALID');
  return {
    market: code,
    result_date: board.draw_date,
    nomor: derived,
    periode: `LiveDraw ${code}`,
    source: 'live_draw_runtime',
    source_name: board.source || `${code} LiveDraw Source`,
    source_url: board.source_url || null,
    source_draw_6d: board.first,
    updated_at: board.retrieved_at || updatedAt,
    verification: board.verification || 'structurally_valid_single_source',
    runtime_conflict: Boolean(board.runtime_conflict),
    runtime_conflicts: Array.isArray(board.runtime_conflicts) ? board.runtime_conflicts.slice(-8) : [],
    runtime_observations: Array.isArray(board.runtime_observations) ? board.runtime_observations.slice(-8) : [],
  };
}

export function runtimeResultSyncState(runtime, dataset) {
  if (!runtime || !ISO_DATE.test(String(runtime.result_date || '')) || !normalizeFour(runtime.nomor)) {
    return { state: RUNTIME_SYNC_STATE.DATASET_ONLY, reconciled: false, conflict: false };
  }
  if (!dataset || !ISO_DATE.test(String(dataset.result_date || '')) || !normalizeFour(dataset.nomor)) {
    return { state: RUNTIME_SYNC_STATE.LIVE_AHEAD_OF_DATASET, reconciled: false, conflict: false };
  }
  if (runtime.result_date > dataset.result_date) {
    return { state: RUNTIME_SYNC_STATE.LIVE_AHEAD_OF_DATASET, reconciled: false, conflict: false };
  }
  if (runtime.result_date < dataset.result_date) {
    return { state: RUNTIME_SYNC_STATE.DATASET_NEWER, reconciled: true, conflict: false };
  }
  if (String(runtime.nomor) === String(dataset.nomor)) {
    return { state: RUNTIME_SYNC_STATE.DATASET_SYNCED, reconciled: true, conflict: false };
  }
  return { state: RUNTIME_SYNC_STATE.LIVE_DATASET_CONFLICT, reconciled: false, conflict: true };
}

export function effectiveLatestResult(dataset, runtime) {
  const sync = runtimeResultSyncState(runtime, dataset);
  if (sync.state === RUNTIME_SYNC_STATE.LIVE_AHEAD_OF_DATASET) {
    return { result: runtime, source: 'LIVE_DRAW_RUNTIME', sync };
  }
  return { result: dataset, source: 'DATASET', sync };
}

export function predictionMayDisplay({ prediction, dataset, runtime }) {
  const sync = runtimeResultSyncState(runtime, dataset);
  if (sync.state === RUNTIME_SYNC_STATE.LIVE_AHEAD_OF_DATASET || sync.conflict) {
    return { visible: false, reason: sync.state };
  }
  const basisDate = prediction?.prediction_basis_date || prediction?.latest_result?.date;
  const basisResult = String(prediction?.prediction_basis_result || prediction?.latest_result?.number || '');
  return {
    visible: Boolean(dataset && basisDate === dataset.result_date && basisResult === String(dataset.nomor || '')),
    reason: 'PERSISTENT_DATASET_GUARD',
  };
}
