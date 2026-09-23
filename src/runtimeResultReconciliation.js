import {
  createRuntimeLatestResult,
  runtimeResultSyncState,
  RUNTIME_SYNC_STATE,
} from './runtimeResultSync.js';

export const RUNTIME_RECONCILIATION_MARKETS = Object.freeze(['HK', 'SDY']);

function runtimeFromSnapshot(market, snapshot, updatedAt) {
  const board = snapshot?.markets?.[market];
  if (!board) return { runtime: null, error: null };
  try {
    return {
      runtime: createRuntimeLatestResult({ market, board, updatedAt }),
      error: null,
    };
  } catch (error) {
    return {
      runtime: null,
      error: error?.message || 'RUNTIME_SNAPSHOT_INVALID',
    };
  }
}

/**
 * Reconciles ephemeral runtime candidates without ever modifying the canonical
 * market arrays. A missing/invalid snapshot may not erase a still-valid
 * in-memory candidate, but canonical catch-up or a newer dataset clears it.
 */
export function reconcileRuntimeCandidates({
  marketData,
  snapshot,
  currentRuntimeResults = {},
  updatedAt = new Date().toISOString(),
}) {
  const runtimeLatestResults = { ...currentRuntimeResults };
  const decisions = {};

  for (const market of RUNTIME_RECONCILIATION_MARKETS) {
    const parsed = runtimeFromSnapshot(market, snapshot, updatedAt);
    const candidate = parsed.runtime || currentRuntimeResults[market] || null;
    const dataset = marketData?.[market]?.[0] || null;
    const sync = runtimeResultSyncState(candidate, dataset);
    const keepOverlay = Boolean(candidate) && (
      sync.state === RUNTIME_SYNC_STATE.LIVE_AHEAD_OF_DATASET || sync.conflict
    );

    runtimeLatestResults[market] = keepOverlay ? candidate : null;
    decisions[market] = {
      ...sync,
      candidate: keepOverlay ? candidate : null,
      snapshot_error: parsed.error,
      source: parsed.runtime ? 'LIVE_DRAW_SNAPSHOT' : candidate ? 'IN_MEMORY_RUNTIME' : 'DATASET_ONLY',
    };
  }

  return { runtimeLatestResults, decisions };
}

export function shouldProbeNativeRuntimeBoard({
  market,
  scheduleState,
  marketDrawDate,
  dataset,
  snapshotRuntime,
}) {
  if (market !== 'HK') return false;
  if (!['LIVE_WINDOW', 'RESULT_POSTED'].includes(scheduleState)) return false;

  const datasetDate = String(dataset?.result_date || '');
  const snapshotDate = String(snapshotRuntime?.result_date || '');
  if (snapshotDate && snapshotDate > datasetDate) return false;
  const newestKnownDate = [datasetDate, snapshotDate].filter(Boolean).sort().at(-1) || '';
  if (marketDrawDate && newestKnownDate >= marketDrawDate) return false;
  if (scheduleState === 'LIVE_WINDOW') return true;

  return Boolean(marketDrawDate) && newestKnownDate < marketDrawDate;
}

export function createBoundedReconciliationRunner({ minIntervalMs = 3000, now = Date.now } = {}) {
  let inFlight = null;
  let lastStartedAt = Number.NEGATIVE_INFINITY;

  return async function run(task, { force = false } = {}) {
    if (inFlight) return inFlight;
    const startedAt = now();
    if (!force && startedAt - lastStartedAt < minIntervalMs) {
      return { skipped: true, reason: 'RECONCILIATION_THROTTLED' };
    }
    lastStartedAt = startedAt;
    inFlight = Promise.resolve()
      .then(task)
      .finally(() => { inFlight = null; });
    return inFlight;
  };
}
