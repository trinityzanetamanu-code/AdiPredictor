import assert from 'node:assert/strict';
import test from 'node:test';
import { getDataProvenance, loadMarketData, loadPrediction, loadPredictionHistory, loadLiveDrawSnapshot } from '../src/dataClient.js';
import { predictionFreshness } from '../src/predictionFreshness.js';
import { createLatestRefreshCoordinator } from '../src/refreshDataCoordinator.js';
import { reconcileRuntimeObservation } from '../src/runtimeResultReconciliation.js';
import { createPlaybackWatchdog, loadYouTubeIframeAPI } from '../src/youtubePlayerService.js';

const row = (date, number) => ({ result_date: date, nomor: number });
const prediction = (date, number) => ({ prediction_basis_date: date, prediction_basis_result: number, target_date: '2026-09-26' });
const response = (data, status = 200) => ({ ok: status === 200, status, json: async () => data });

test('remote failure reports APK fallback and old matching pair cannot count as remotely verified', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => url.startsWith('https:')
    ? response({}, 503)
    : response(url.includes('latest.json') ? prediction('2026-09-23', '0217') : [row('2026-09-23', '0217')]);
  try {
    const dataset = await loadMarketData('SDY');
    const latest = await loadPrediction('SDY');
    assert.equal(predictionFreshness(latest, dataset[0]).fresh, true);
    assert.equal(getDataProvenance(dataset).source, 'FALLBACK');
    assert.equal(getDataProvenance(latest).source, 'FALLBACK');
    assert.match(getDataProvenance(dataset).fallback_reason, /HTTP 503/);
    assert.equal(getDataProvenance(dataset).result_date, '2026-09-23');
    assert.equal(getDataProvenance(dataset).status, 200);
    assert.ok(getDataProvenance(dataset).fingerprint);
  } finally { globalThis.fetch = original; }
});

test('remote dataset with old remote prediction remains stale; leading zeroes are preserved', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => response(url.includes('latest.json')
    ? prediction('2026-09-23', '0217') : [row('2026-09-24', '0052')]);
  try {
    const dataset = await loadMarketData('SDY');
    const latest = await loadPrediction('SDY');
    assert.equal(dataset[0].nomor, '0052');
    assert.equal(getDataProvenance(dataset).source, 'REMOTE');
    assert.equal(predictionFreshness(latest, dataset[0]).fresh, false);
    assert.equal(predictionFreshness(prediction('2026-09-24', '0052'), dataset[0]).fresh, true);
    assert.equal(predictionFreshness(prediction('2026-09-24', '0052'), row('2026-09-24', '0053')).fresh, false);
  } finally { globalThis.fetch = original; }
});

test('an aborted remote URL reports its failure and falls back without claiming remote success', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (url.startsWith('https:')) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    return response([row('2026-09-23', '0217')]);
  };
  try {
    const data = await loadMarketData('SDY');
    assert.equal(getDataProvenance(data).source, 'FALLBACK');
    assert.equal(getDataProvenance(data).url, './data/sdy.json');
    assert.match(getDataProvenance(data).fallback_reason, /aborted/);
  } finally { globalThis.fetch = original; }
});

test('each history and snapshot fetch carries origin and version evidence', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => response(url.includes('history.json')
    ? { records: [], generated_at: '2026-09-24T11:24:00Z' }
    : { retrieved_at: '2026-09-24T11:24:00Z', markets: {} });
  try {
    assert.equal(getDataProvenance(await loadPredictionHistory('SDY')).source, 'REMOTE');
    assert.equal(getDataProvenance(await loadLiveDrawSnapshot()).version, '2026-09-24T11:24:00Z');
  } finally { globalThis.fetch = original; }
});

test('reversed refresh completions cannot replace newer observation', async () => {
  const coordinator = createLatestRefreshCoordinator();
  const older = coordinator.begin();
  const newer = coordinator.begin();
  let displayed = null;
  await Promise.resolve().then(() => coordinator.applyIfLatest(newer, () => { displayed = row('2026-09-24', '4152'); }));
  await Promise.resolve().then(() => coordinator.applyIfLatest(older, () => { displayed = row('2026-09-23', '0217'); }));
  assert.equal(displayed.nomor, '4152');
});

test('a newer SDY live board remains unverified and cannot overwrite canonical data', () => {
  const dataset = [row('2026-09-23', '0217')];
  const board = { draw_date: '2026-09-24', first: '304152', second: '123456', third: '654321', derived_4d: '4152' };
  const result = reconcileRuntimeObservation({ market: 'SDY', board, marketData: { SDY: dataset } });
  assert.equal(result.decision.state, 'LIVE_AHEAD_OF_DATASET');
  assert.equal(result.runtimeLatestResults.SDY.nomor, '4152');
  assert.equal(dataset[0].nomor, '0217');
});

test('playback timeout starts at click, cancels on PLAYING and retains errors', () => {
  const timers = new Map();
  let next = 0;
  let timedOut = 0;
  const watchdog = createPlaybackWatchdog({
    setTimer: (callback) => { timers.set(++next, callback); return next; },
    clearTimer: (id) => timers.delete(id),
    onTimeout: () => { timedOut += 1; },
  });
  assert.equal(timers.size, 0);
  watchdog.request();
  assert.equal(timers.size, 1);
  watchdog.playing();
  assert.equal(timers.size, 0);
  watchdog.request();
  timers.get(next)();
  timers.delete(next);
  assert.equal(timedOut, 1);
  assert.equal(watchdog.ready(), false);
  watchdog.request();
  watchdog.error();
  assert.equal(timers.size, 0);
  assert.equal(watchdog.ready(), false);
});

test('YouTube API script failure allows a fresh script retry', async () => {
  const scripts = [];
  const documentLike = {
    querySelector: () => scripts.find((script) => !script.removed),
    createElement: () => ({ dataset: {}, remove() { this.removed = true; } }),
    head: { appendChild(script) { scripts.push(script); } },
  };
  const windowLike = { setTimeout: () => 1, clearTimeout() {} };
  const first = loadYouTubeIframeAPI(windowLike, documentLike);
  scripts[0].onerror();
  await assert.rejects(first, /YOUTUBE_API_BLOCKED/);
  const second = loadYouTubeIframeAPI(windowLike, documentLike);
  assert.equal(scripts.length, 2);
  windowLike.YT = { Player() {} };
  windowLike.onYouTubeIframeAPIReady();
  assert.equal(await second, windowLike.YT);
});
