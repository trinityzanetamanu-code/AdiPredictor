import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  createRuntimeLatestResult,
  effectiveLatestResult,
  predictionMayDisplay,
  runtimeResultSyncState,
  RUNTIME_SYNC_STATE,
} from '../src/runtimeResultSync.js';
import { collectorHealth, datasetFreshness, COLLECTOR_HEALTH, DATASET_FRESHNESS } from '../src/collectorHealth.js';
import {
  buildRuntimeNotificationEvents,
  claimEventOnce,
  permissionAllowsNotifications,
  stableUpdateAvailable,
} from '../src/notificationService.js';
import { PLAYER_STATES } from '../src/liveDrawConfig.js';
import { watchdogPlayerState } from '../src/youtubePlayerService.js';

const liveBoard = {
  market: 'HK', source: 'KocokHK Mirror', source_url: 'https://rankcrack.com/hk.php',
  draw_date: '2026-09-21', first: '219608', second: '341526', third: '740005',
  starter: ['337753'], consolation: ['504891'], derived_4d: '9608',
  retrieved_at: '2026-09-21T18:46:00Z',
};
const datasetOld = { result_date: '2026-09-20', nomor: '2036', periode: 'HK-3550' };
const datasetNew = { result_date: '2026-09-21', nomor: '9608', periode: 'HK-3551' };

test('LiveDraw result immediately overlays Analysis while persistent prediction waits', () => {
  const runtime = createRuntimeLatestResult({ market: 'HK', board: liveBoard });
  const effective = effectiveLatestResult(datasetOld, runtime);
  assert.equal(effective.result.nomor, '9608');
  assert.equal(effective.source, 'LIVE_DRAW_RUNTIME');
  assert.equal(effective.sync.state, RUNTIME_SYNC_STATE.LIVE_AHEAD_OF_DATASET);
  assert.equal(datasetOld.nomor, '2036');
  assert.equal(predictionMayDisplay({
    prediction: { prediction_basis_date: '2026-09-20', prediction_basis_result: '2036' },
    dataset: datasetOld,
    runtime,
  }).visible, false);
});

test('runtime result reconciles without duplicate when dataset catches up', () => {
  const runtime = createRuntimeLatestResult({ market: 'HK', board: liveBoard });
  const sync = runtimeResultSyncState(runtime, datasetNew);
  assert.equal(sync.state, RUNTIME_SYNC_STATE.DATASET_SYNCED);
  assert.equal(sync.reconciled, true);
  assert.equal(effectiveLatestResult(datasetNew, runtime).source, 'DATASET');
  assert.equal(predictionMayDisplay({
    prediction: { prediction_basis_date: '2026-09-21', prediction_basis_result: '9608' },
    dataset: datasetNew,
    runtime,
  }).visible, true);
});

test('same-date disagreement is explicit conflict and dataset remains historical authority', () => {
  const runtime = createRuntimeLatestResult({ market: 'HK', board: liveBoard });
  const conflictDataset = { result_date: '2026-09-21', nomor: '1111' };
  assert.equal(runtimeResultSyncState(runtime, conflictDataset).state, RUNTIME_SYNC_STATE.LIVE_DATASET_CONFLICT);
  assert.equal(effectiveLatestResult(conflictDataset, runtime).result.nomor, '1111');
});

test('collector health distinguishes fresh delayed stale and dataset staleness', () => {
  const now = new Date('2026-09-21T20:00:00Z');
  const status = (minutes) => ({ collected_at: new Date(now.getTime() - minutes * 60_000).toISOString(), markets: {} });
  assert.equal(collectorHealth(status(8), now).state, COLLECTOR_HEALTH.HEALTHY);
  assert.equal(collectorHealth(status(47), now).state, COLLECTOR_HEALTH.DELAYED);
  assert.equal(collectorHealth(status(121), now).state, COLLECTOR_HEALTH.STALE);
  const stale = datasetFreshness({ market: 'HK', latest: datasetOld, collectorStatus: status(121), now: new Date('2026-09-22T17:00:00Z') });
  assert.equal(stale.state, DATASET_FRESHNESS.STALE);
});

test('YouTube API ready or iframe load alone never proves playback', () => {
  assert.equal(watchdogPlayerState({ playbackObserved: false, apiReady: true, error: false }), PLAYER_STATES.TIMEOUT);
  assert.equal(watchdogPlayerState({ playbackObserved: false, apiReady: false, error: false }), PLAYER_STATES.BLOCKED);
  assert.equal(watchdogPlayerState({ playbackObserved: true, apiReady: true, error: false }), PLAYER_STATES.PLAYING);
});

test('SGP player timeout is fail-safe and official result boards render independently', async () => {
  const [player, app] = await Promise.all([
    readFile(new URL('../src/components/LiveDrawPlayer.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/App.jsx', import.meta.url), 'utf8'),
  ]);
  assert.doesNotMatch(player, /onLoad=\{\(\) => setPlayerState/);
  assert.match(player, /PLAYBACK_EVIDENCE_TIMEOUT/);
  assert.match(player, /Buka Live Resmi/);
  assert.match(app, /<LiveDrawPlayer[\s\S]*<LiveDrawFourDigitBoard/);
  assert.match(app, /<LiveDrawPlayer[\s\S]*<TotoBoard/);
});

test('notification events require verified result and deterministic keys dedupe', () => {
  const preferences = { master: true, result: true, prediction: true, liveDraw: true, audit: true, appUpdate: true };
  const previous = { marketData: { HK: [datasetOld] }, predictions: {}, histories: {} };
  const current = {
    marketData: { HK: [{ ...datasetNew, verification: 'CONFIRMED_3_SOURCES' }] },
    predictions: { HK: { target_period: 'HK-3552', dataset_fingerprint: 'new', prediction_basis_date: '2026-09-21', prediction_basis_result: '9608' } },
    histories: { HK: { records: [{ target_date: '2026-09-21', actual_result: { number: '9608' } }] } },
  };
  const events = buildRuntimeNotificationEvents({ previous, current, installedVersionCode: 100008, preferences });
  assert.ok(events.some((event) => event.key === 'RESULT:HK:2026-09-21:9608'));
  const storage = { values: new Map(), getItem(key) { return this.values.get(key) || null; }, setItem(key, value) { this.values.set(key, value); } };
  assert.equal(claimEventOnce(events[0].key, storage), true);
  assert.equal(claimEventOnce(events[0].key, storage), false);
  current.marketData.HK[0].verification = 'unverified';
  assert.equal(buildRuntimeNotificationEvents({ previous, current, installedVersionCode: 100008, preferences }).some((event) => event.category === 'result'), false);
});

test('notification permission and stable version comparison are conservative', () => {
  assert.equal(permissionAllowsNotifications({ display: 'denied' }), false);
  assert.equal(permissionAllowsNotifications({ display: 'granted' }), true);
  assert.equal(stableUpdateAvailable({ channel: 'stable', update_channel_ready: true, version_code: 100009 }, 100008), true);
  assert.equal(stableUpdateAvailable({ channel: 'stable', update_channel_ready: true, version_code: 100008 }, 100008), false);
});

test('Capacitor 6 local notification settings and deep-link categories are present', async () => {
  const [pkg, settings, service] = await Promise.all([
    readFile(new URL('../package.json', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/NotificationSettingsPanel.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/notificationService.js', import.meta.url), 'utf8'),
  ]);
  assert.match(pkg, /"@capacitor\/local-notifications": "\^6\.1\.3"/);
  for (const label of ['Hasil Keluaran', 'Prediksi Baru', 'LiveDraw', 'Audit Prediksi', 'Update Aplikasi']) assert.match(settings, new RegExp(label));
  assert.match(service, /localNotificationActionPerformed/);
  assert.match(service, /target === 'results'/);
  assert.match(service, /target === 'audit'/);
});

test('HK verification UI is absent while open source, refresh, diagnostics and structural guards remain', async () => {
  const [app, board, service] = await Promise.all([
    readFile(new URL('../src/App.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/LiveDrawSixDigitBoard.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/liveDrawService.js', import.meta.url), 'utf8'),
  ]);
  assert.doesNotMatch(app, /openHKManualVerification|Verifikasi Sumber HK/);
  assert.doesNotMatch(board, /VERIFIKASI SUMBER HK|Verifikasi Sumber HK|Status verifikasi|MENUNGGU TANGGAL DRAW YANG DAPAT DIBANDINGKAN|\bVERIFIED\b/);
  assert.match(board, /Derived last-four/);
  assert.match(board, /Buka sumber/);
  assert.match(board, /Perbarui data/);
  assert.match(board, /Live board diagnostics/);
  assert.match(service, /isSecurityChallengeHtml/);
  assert.match(service, /harus exact 6 digit/);
});

test('P1-P8 engine methodology remains untouched by runtime plumbing', async () => {
  const runtime = await readFile(new URL('../src/runtimeResultSync.js', import.meta.url), 'utf8');
  assert.doesNotMatch(runtime, /reliability_weight|weighted_consensus|candidate_rankings|P9/);
});

test('runtime display plumbing cannot persist a historical result', async () => {
  const [runtime, config] = await Promise.all([
    readFile(new URL('../src/runtimeResultSync.js', import.meta.url), 'utf8'),
    readFile(new URL('../config/collector_sources.json', import.meta.url), 'utf8'),
  ]);
  assert.doesNotMatch(runtime, /public\/data|collector\.py|writeFile|setMarketData/);
  assert.match(config, /crosscheck_or_qualified_primary/);
  assert.match(config, /nexipools_hk/);
  assert.match(config, /livenomor_hk/);
});
