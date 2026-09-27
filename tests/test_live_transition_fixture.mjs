import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { loadMarketData, loadPrediction, loadPredictionHistory, loadLiveDrawSnapshot, getDataProvenance } from '../src/dataClient.js';
import { buildRuntimeNotificationEvents } from '../src/notificationService.js';
import { reconcileRuntimeCandidates } from '../src/runtimeResultReconciliation.js';
import { effectiveLatestResult, predictionMayDisplay } from '../src/runtimeResultSync.js';
import { predictionFreshness } from '../src/predictionFreshness.js';
import { createLatestRefreshCoordinator } from '../src/refreshDataCoordinator.js';
import { buildRuntimeDiagnostics } from '../src/runtimeDiagnostics.js';

const trace = JSON.parse(readFileSync(new URL('../docs/audits/live-transition-fixture.json', import.meta.url)));
const oldRow = { result_date: trace.old.date, nomor: trace.old.number, verification: 'confirmed_3_sources' };
const newRow = { result_date: trace.verified.date, nomor: trace.verified.number, verification: trace.verified.verification,
  source_ids: trace.verified.source_ids };
const oldPrediction = { prediction_basis_date: trace.old.date, prediction_basis_result: trace.old.number,
  target_date: trace.old.prediction_target, target_period: 'SD-3556', dataset_fingerprint: trace.old.dataset_fingerprint };
const newPrediction = { prediction_basis_date: trace.published.prediction_basis_date,
  prediction_basis_result: trace.published.prediction_basis_result,
  target_date: trace.published.prediction_target, target_period: 'SD-3557',
  dataset_fingerprint: trace.published.dataset_fingerprint };
const newHistory = { records: [{ target_date: trace.published.history_target,
  four_d: { main: { number: '0052' } } }] };
const board = { draw_date: trace.live.date, first: trace.live.six_digits, second: '100013', third: '000091',
  starter: ['004401'], consolation: ['000002'], derived_4d: trace.live.number,
  retrieved_at: trace.live.observed_at, source: trace.live.source };
const snapshot = { retrieved_at: trace.live.observed_at, markets: { SDY: board } };
const response = (payload, status = 200) => ({ ok: status === 200, status, json: async () => payload });
const pref = { master: true, result: true, prediction: true, audit: false, appUpdate: false };

test('controlled SDY publication flows through actual fetch, reconciliation, history, Analysis/Data and notifications', async () => {
  assert.equal(trace.type, 'CONTROLLED_FIXTURE_NOT_REAL_DRAW');
  assert.deepEqual(trace.verified.source_ids, ['lomba4d_sdy', 'waroengtogel_sdy']);
  const original = globalThis.fetch;
  let stage = 'observed';
  globalThis.fetch = async (url) => {
    const path = new URL(url, 'https://apk.local').pathname;
    if (path.endsWith('/live-draw.json')) return response(snapshot);
    if (path.endsWith('/data/sdy.json')) return response(stage === 'observed' ? [oldRow] : [newRow, oldRow]);
    if (path.endsWith('/latest.json')) return response(stage === 'predicted' ? newPrediction : oldPrediction);
    if (path.endsWith('/history.json')) return response(stage === 'predicted' ? newHistory : { records: [] });
    throw new Error(`Unexpected fixture URL ${path}`);
  };
  try {
    const incoming = await loadLiveDrawSnapshot();
    let dataset = await loadMarketData('SDY');
    let prediction = await loadPrediction('SDY');
    let history = await loadPredictionHistory('SDY');
    const runtime = reconcileRuntimeCandidates({ marketData: { SDY: dataset }, snapshot: incoming }).runtimeLatestResults.SDY;
    assert.equal(runtime.nomor, '0052');
    assert.equal(runtime.verification, 'structurally_valid_single_source');
    assert.equal(effectiveLatestResult(dataset[0], runtime).source, 'LIVE_DRAW_RUNTIME');
    assert.equal(dataset[0].nomor, '1559');
    assert.equal(predictionMayDisplay({ prediction, dataset: dataset[0], runtime }).visible, false);
    let previous = { marketData: { SDY: dataset }, predictions: { SDY: prediction }, histories: { SDY: history } };
    assert.deepEqual(buildRuntimeNotificationEvents({ previous, current: previous, preferences: pref }), []);

    for (const phase of ['single_source', 'source_conflict', 'source_403', 'parser_failure']) {
      assert.equal(trace[phase].canonical_date, dataset[0].result_date);
      assert.equal(trace[phase].new_prediction, false);
    }

    stage = 'verified';
    dataset = await loadMarketData('SDY');
    prediction = await loadPrediction('SDY');
    const canonical = reconcileRuntimeCandidates({ marketData: { SDY: dataset }, snapshot: incoming });
    assert.equal(canonical.runtimeLatestResults.SDY, null);
    assert.equal(dataset[0].nomor, '0052'); // Data and LiveDraw now agree.
    assert.equal(predictionFreshness(prediction, dataset[0]).fresh, false); // Analysis must wait.
    let current = { marketData: { SDY: dataset }, predictions: { SDY: prediction }, histories: { SDY: history } };
    assert.deepEqual(buildRuntimeNotificationEvents({ previous, current, preferences: pref }).map((event) => event.category), ['result']);
    previous = current;

    stage = 'predicted';
    prediction = await loadPrediction('SDY');
    history = await loadPredictionHistory('SDY');
    current = { marketData: { SDY: dataset }, predictions: { SDY: prediction }, histories: { SDY: history } };
    assert.equal(predictionFreshness(prediction, dataset[0]).fresh, true);
    assert.equal(predictionMayDisplay({ prediction, dataset: dataset[0] }).visible, true);
    assert.equal(history.records[0].target_date, '2026-09-27');
    assert.deepEqual(buildRuntimeNotificationEvents({ previous, current, preferences: pref }).map((event) => event.category), ['prediction']);
    const diagnostic = buildRuntimeDiagnostics({ marketData: current.marketData, predictions: current.predictions,
      histories: current.histories });
    assert.equal(diagnostic.markets.SDY.prediction.display_allowed, true);
    assert.equal(getDataProvenance(dataset).source, 'REMOTE');
    assert.equal(getDataProvenance(prediction).source, 'REMOTE');
  } finally { globalThis.fetch = original; }
});

test('old APK pair, network loss and reversed completion never claim a new canonical prediction', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => url.startsWith('https:') ? response({}, 403)
    : response(url.includes('latest.json') ? oldPrediction : [oldRow]);
  try {
    const dataset = await loadMarketData('SDY');
    const prediction = await loadPrediction('SDY');
    assert.equal(getDataProvenance(dataset).source, 'FALLBACK');
    assert.equal(getDataProvenance(prediction).source, 'FALLBACK');
    assert.equal(predictionFreshness(prediction, dataset[0]).fresh, true);
    assert.equal(buildRuntimeDiagnostics({ marketData: { SDY: dataset }, predictions: { SDY: prediction } })
      .markets.SDY.prediction.display_allowed, false);
    const coordinator = createLatestRefreshCoordinator();
    const first = coordinator.begin(); const second = coordinator.begin();
    let shown = newRow;
    assert.equal(coordinator.applyIfLatest(second, () => { shown = newRow; }), true);
    assert.equal(coordinator.applyIfLatest(first, () => { shown = oldRow; }), false);
    assert.equal(shown.nomor, '0052');
    assert.equal(predictionFreshness(newPrediction, { ...newRow, nomor: '0053' }).fresh, false);
  } finally { globalThis.fetch = original; }
});
