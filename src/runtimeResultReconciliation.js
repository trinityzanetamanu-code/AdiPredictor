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

function runtimeFromBoard(market, board, updatedAt) {
  if (!board) return { runtime: null, error: null };
  try {
    return {
      runtime: createRuntimeLatestResult({ market, board, updatedAt }),
      error: null,
    };
  } catch (error) {
    return {
      runtime: null,
      error: error?.message || 'RUNTIME_BOARD_INVALID',
    };
  }
}

function validRuntime(runtime) {
  return runtimeResultSyncState(runtime, null).state === RUNTIME_SYNC_STATE.LIVE_AHEAD_OF_DATASET;
}

function chooseRuntimeCandidate({ dataset, current, snapshot, local }) {
  const inputs = [
    { runtime: current, source: 'IN_MEMORY_RUNTIME' },
    { runtime: snapshot, source: 'LIVE_DRAW_SNAPSHOT' },
    { runtime: local, source: 'DEVICE_LOCAL_BOARD' },
  ].filter(({ runtime }) => validRuntime(runtime));
  let selected = inputs[0] || { runtime: null, source: 'DATASET_ONLY' };
  const conflicts = [];

  for (const incoming of inputs.slice(1)) {
    if (incoming.runtime.result_date > selected.runtime.result_date) {
      selected = incoming;
      continue;
    }
    if (incoming.runtime.result_date < selected.runtime.result_date) continue;
    if (String(incoming.runtime.nomor) === String(selected.runtime.nomor)) continue;

    conflicts.push({
      result_date: incoming.runtime.result_date,
      kept_source: selected.source,
      kept_result: selected.runtime.nomor,
      conflicting_source: incoming.source,
      conflicting_result: incoming.runtime.nomor,
    });

    // On an equal-date disagreement, canonical data may select the candidate
    // that agrees with it. Without that proof, retain the already selected
    // candidate so a late network response cannot flip runtime state.
    if (
      dataset?.result_date === incoming.runtime.result_date
      && String(dataset?.nomor || '') === String(incoming.runtime.nomor)
      && String(dataset?.nomor || '') !== String(selected.runtime.nomor)
    ) {
      selected = incoming;
    }
  }

  return { ...selected, conflicts };
}

/**
 * Reconciles ephemeral runtime candidates without ever modifying the canonical
 * market arrays. A missing/invalid snapshot may not erase a still-valid
 * in-memory candidate, but canonical catch-up or a newer dataset clears it.
 */
export function reconcileRuntimeCandidates({
  marketData,
  snapshot,
  localBoards = {},
  currentRuntimeResults = {},
  updatedAt = new Date().toISOString(),
}) {
  const runtimeLatestResults = { ...currentRuntimeResults };
  const decisions = {};

  for (const market of RUNTIME_RECONCILIATION_MARKETS) {
    const parsed = runtimeFromSnapshot(market, snapshot, updatedAt);
    const parsedLocal = runtimeFromBoard(market, localBoards[market], updatedAt);
    const dataset = marketData?.[market]?.[0] || null;
    const selected = chooseRuntimeCandidate({
      dataset,
      current: currentRuntimeResults[market],
      snapshot: parsed.runtime,
      local: parsedLocal.runtime,
    });
    const candidate = selected.runtime;
    const sync = runtimeResultSyncState(candidate, dataset);
    const keepOverlay = Boolean(candidate) && (
      sync.state === RUNTIME_SYNC_STATE.LIVE_AHEAD_OF_DATASET || sync.conflict
    );

    runtimeLatestResults[market] = keepOverlay ? candidate : null;
    decisions[market] = {
      ...sync,
      candidate: keepOverlay ? candidate : null,
      snapshot_error: parsed.error,
      local_board_error: parsedLocal.error,
      runtime_conflict: selected.conflicts.length > 0,
      runtime_conflicts: selected.conflicts,
      source: selected.source,
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
