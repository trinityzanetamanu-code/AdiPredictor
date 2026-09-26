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

function runtimeTimestamp(runtime) {
  const parsed = Date.parse(String(runtime?.updated_at || ''));
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function conflictKey(conflict) {
  return [
    conflict.result_date,
    conflict.first_result,
    conflict.second_result,
    conflict.first_observed_at,
    conflict.second_observed_at,
  ].join('|');
}

function mergeRuntimeConflicts(...collections) {
  const merged = [];
  const seen = new Set();
  for (const conflict of collections.flat().filter(Boolean)) {
    const key = conflictKey(conflict);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(conflict);
  }
  return merged.slice(-8);
}

function chooseRuntimeCandidate({ dataset, current, snapshot, local }) {
  const inputs = [
    { runtime: current, source: 'IN_MEMORY_RUNTIME' },
    { runtime: snapshot, source: 'LIVE_DRAW_SNAPSHOT' },
    { runtime: local, source: 'DEVICE_LOCAL_BOARD' },
  ].filter(({ runtime }) => validRuntime(runtime));
  let selected = inputs[0] || { runtime: null, source: 'DATASET_ONLY' };
  let conflicts = mergeRuntimeConflicts(
    current?.runtime_conflicts,
    snapshot?.runtime_conflicts,
    local?.runtime_conflicts,
  );

  for (const incoming of inputs.slice(1)) {
    if (incoming.runtime.result_date > selected.runtime.result_date) {
      selected = incoming;
      continue;
    }
    if (incoming.runtime.result_date < selected.runtime.result_date) continue;
    if (String(incoming.runtime.nomor) === String(selected.runtime.nomor)) {
      if (runtimeTimestamp(incoming.runtime) > runtimeTimestamp(selected.runtime)) selected = incoming;
      continue;
    }

    const conflict = {
      result_date: incoming.runtime.result_date,
      first_source: selected.source,
      first_result: selected.runtime.nomor,
      first_observed_at: selected.runtime.updated_at || null,
      second_source: incoming.source,
      second_result: incoming.runtime.nomor,
      second_observed_at: incoming.runtime.updated_at || null,
      resolution: 'LATEST_OBSERVATION_DISPLAYED_UNVERIFIED',
    };

    // On an equal-date disagreement, canonical data may select the candidate
    // that agrees with it. Without canonical proof, display the newest
    // observation while retaining explicit conflict evidence. This prevents a
    // stale snapshot from resurrecting an earlier number after app restart.
    if (
      dataset?.result_date === incoming.runtime.result_date
      && String(dataset?.nomor || '') === String(incoming.runtime.nomor)
      && String(dataset?.nomor || '') !== String(selected.runtime.nomor)
    ) {
      selected = incoming;
      conflict.resolution = 'CANONICAL_DATASET_MATCH';
    } else if (runtimeTimestamp(incoming.runtime) > runtimeTimestamp(selected.runtime)) {
      selected = incoming;
    }
    conflict.selected_source = selected.source;
    conflict.selected_result = selected.runtime.nomor;
    conflicts = mergeRuntimeConflicts(conflicts, [conflict]);
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
    const candidate = selected.runtime
      ? {
          ...selected.runtime,
          verification: selected.runtime.verification || 'structurally_valid_single_source',
          runtime_conflict: Boolean(selected.runtime.runtime_conflict || selected.conflicts.length),
          runtime_conflicts: mergeRuntimeConflicts(
            selected.runtime.runtime_conflicts,
            selected.conflicts,
          ),
        }
      : null;
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

export function reconcileRuntimeObservation({
  market,
  board,
  marketData,
  currentRuntimeResults = {},
  updatedAt = new Date().toISOString(),
}) {
  const code = String(market || '').toUpperCase();
  const snapshot = { markets: { [code]: { ...board, retrieved_at: board?.retrieved_at || updatedAt } } };
  const reconciled = reconcileRuntimeCandidates({
    marketData,
    snapshot,
    currentRuntimeResults,
    updatedAt,
  });
  return {
    ...reconciled,
    decision: reconciled.decisions[code],
  };
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
