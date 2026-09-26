import { Capacitor, registerPlugin } from '@capacitor/core';
import { parseSixDigitBoard } from './liveDrawService.js';

const HKVerification = registerPlugin('HKVerification');
export const HK_BOARD_CACHE_KEY = 'HK_LAST_VERIFIED_BOARD';
const MAX_RUNTIME_OBSERVATIONS = 8;

export const HK_VERIFICATION_STATES = Object.freeze({
  DIRECT_FETCH_OK: 'DIRECT_FETCH_OK',
  CHALLENGE_REQUIRED: 'CHALLENGE_REQUIRED',
  MANUAL_VERIFICATION_OPEN: 'MANUAL_VERIFICATION_OPEN',
  RESULT_PAGE_READY: 'RESULT_PAGE_READY',
  NORMALIZED_BOARD_READY: 'NORMALIZED_BOARD_READY',
  VERIFICATION_CANCELLED: 'VERIFICATION_CANCELLED',
  VERIFICATION_FAILED: 'VERIFICATION_FAILED',
});

export function loadLocalHKBoard() {
  try {
    const value = JSON.parse(localStorage.getItem(HK_BOARD_CACHE_KEY) || 'null');
    return value?.first && /^\d{6}$/.test(value.first) ? value : null;
  } catch { return null; }
}

function observationFromBoard(board) {
  if (!board?.draw_date || !/^\d{4}$/.test(String(board.derived_4d || ''))) return null;
  return {
    draw_date: board.draw_date,
    result: board.derived_4d,
    first: board.first,
    source: board.source || 'HK LiveDraw Source',
    source_url: board.source_url || null,
    observed_at: board.retrieved_at || null,
  };
}

function observedTime(board) {
  const parsed = Date.parse(String(board?.retrieved_at || ''));
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

export function mergeHKRuntimeBoardCache({
  current,
  incoming,
  provenance = 'structurally_valid_single_source',
  observedAt = new Date().toISOString(),
}) {
  const normalized = {
    market: 'HK', source: incoming.source, source_url: incoming.source_url,
    draw_date: incoming.draw_date, first: incoming.first, second: incoming.second, third: incoming.third,
    starter: incoming.starter, consolation: incoming.consolation,
    full_first_prize_6d: incoming.first, derived_4d: incoming.derived_4d,
    retrieved_at: incoming.retrieved_at || observedAt,
    verification: provenance,
  };
  const currentValid = current?.first && /^\d{6}$/.test(String(current.first));
  let selected = normalized;
  if (currentValid) {
    if (String(current.draw_date || '') > String(normalized.draw_date || '')) selected = current;
    else if (current.draw_date === normalized.draw_date && observedTime(current) > observedTime(normalized)) selected = current;
  }

  const observations = [
    ...(Array.isArray(current?.runtime_observations) ? current.runtime_observations : []),
    observationFromBoard(current),
    observationFromBoard(normalized),
  ].filter(Boolean);
  const unique = [];
  const keys = new Set();
  for (const observation of observations) {
    const key = [observation.draw_date, observation.result, observation.source_url, observation.observed_at].join('|');
    if (keys.has(key)) continue;
    keys.add(key);
    unique.push(observation);
  }
  unique.sort((left, right) => Date.parse(left.observed_at || '') - Date.parse(right.observed_at || ''));
  const bounded = unique.slice(-MAX_RUNTIME_OBSERVATIONS);
  const sameDateResults = new Set(
    bounded.filter((item) => item.draw_date === selected.draw_date).map((item) => item.result),
  );
  const existingConflicts = Array.isArray(current?.runtime_conflicts) ? current.runtime_conflicts : [];
  const newConflict = sameDateResults.size > 1 ? {
    result_date: selected.draw_date,
    observed_results: [...sameDateResults].sort(),
    selected_result: selected.derived_4d,
    detected_at: observedAt,
    resolution: 'LATEST_OBSERVATION_DISPLAYED_UNVERIFIED',
  } : null;
  const runtimeConflicts = [];
  const conflictKeys = new Set();
  for (const conflict of [...existingConflicts, newConflict].filter(Boolean)) {
    const key = [
      conflict.result_date,
      ...(conflict.observed_results || []),
      conflict.selected_result,
    ].join('|');
    if (conflictKeys.has(key)) continue;
    conflictKeys.add(key);
    runtimeConflicts.push(conflict);
  }

  return {
    ...selected,
    verification: selected.verification || provenance,
    runtime_conflict: runtimeConflicts.length > 0,
    runtime_conflicts: runtimeConflicts.slice(-MAX_RUNTIME_OBSERVATIONS),
    runtime_observations: bounded,
  };
}

export function storeLocalHKBoard(board, provenance = 'structurally_valid_single_source', observedAt = new Date().toISOString()) {
  const merged = mergeHKRuntimeBoardCache({
    current: loadLocalHKBoard(),
    incoming: board,
    provenance,
    observedAt,
  });
  localStorage.setItem(HK_BOARD_CACHE_KEY, JSON.stringify(merged));
  return merged;
}

export async function openHKManualVerification() {
  if (!Capacitor.isNativePlatform()) return { state: HK_VERIFICATION_STATES.VERIFICATION_FAILED, error: 'Verifikasi WebView hanya tersedia di aplikasi Android.' };
  try {
    const response = await HKVerification.open();
    if (response?.status === HK_VERIFICATION_STATES.VERIFICATION_CANCELLED) return { state: response.status };
    if (response?.status === HK_VERIFICATION_STATES.VERIFICATION_FAILED) {
      throw Object.assign(new Error(response.error || 'BRIDGE_FAILED'), { code: response.error || 'BRIDGE_FAILED' });
    }
    if (response?.status !== HK_VERIFICATION_STATES.RESULT_PAGE_READY || !response.html) {
      throw Object.assign(new Error('BRIDGE_FAILED'), { code: 'BRIDGE_FAILED' });
    }
    const board = parseSixDigitBoard(response.html, 'HK', response.url);
    return { state: HK_VERIFICATION_STATES.NORMALIZED_BOARD_READY, board: storeLocalHKBoard(board, 'manual_source_session'), error: null };
  } catch (error) {
    const code = error?.code || error?.message || 'BRIDGE_FAILED';
    return { state: HK_VERIFICATION_STATES.VERIFICATION_FAILED, error: code };
  }
}
