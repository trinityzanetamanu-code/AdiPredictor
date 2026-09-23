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
import { collectorHealth, collectorTimestampEvidence, datasetFreshness, COLLECTOR_HEALTH, DATASET_FRESHNESS } from '../src/collectorHealth.js';
import {
  buildRuntimeNotificationEvents,
  claimEventOnce,
  permissionAllowsNotifications,
  stableUpdateAvailable,
} from '../src/notificationService.js';
import { PLAYER_STATES } from '../src/liveDrawConfig.js';
import { watchdogPlayerState } from '../src/youtubePlayerService.js';
import {
  createBoundedReconciliationRunner,
  reconcileRuntimeCandidates,
  shouldProbeNativeRuntimeBoard,
} from '../src/runtimeResultReconciliation.js';
import {
  formatLiveDrawDiagnostics,
  getLiveDrawDiagnostics,
  recordLiveDrawDiagnostic,
  resetLiveDrawDiagnosticsForTest,
} from '../src/liveDrawDiagnostics.js';

const liveBoard = {
  market: 'HK', source: 'KocokHK Mirror', source_url: 'https://rankcrack.com/hk.php',
  draw_date: '2026-09-21', first: '219608', second: '341526', third: '740005',
  starter: ['337753'], consolation: ['504891'], derived_4d: '9608',
  retrieved_at: '2026-09-21T18:46:00Z',
};
const datasetOld = { result_date: '2026-09-20', nomor: '2036', periode: 'HK-3550' };
const datasetNew = { result_date: '2026-09-21', nomor: '9608', periode: 'HK-3551' };

const phaseOneBoard = {
  market: 'HK', source: 'KocokHK Mirror', source_url: 'https://rankcrack.com/hk.php',
  draw_date: '2026-09-22', first: '394659', second: '626462', third: '382671',
  starter: ['840151'], consolation: ['763573'], derived_4d: '4659',
  retrieved_at: '2026-09-22T16:20:00Z',
};

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

test('cold-start snapshot publishes D1 without mutating persistent D0 history', () => {
  const persistent = {
    HK: [{ result_date: '2026-09-21', nomor: '9608', periode: 'HK-3551' }],
    SDY: [],
    SGP: [],
  };
  const before = structuredClone(persistent);
  const reconciled = reconcileRuntimeCandidates({
    marketData: persistent,
    snapshot: { markets: { HK: phaseOneBoard } },
    currentRuntimeResults: { HK: null, SDY: null, SGP: null },
  });
  const runtime = reconciled.runtimeLatestResults.HK;
  assert.equal(runtime.nomor, '4659');
  assert.equal(effectiveLatestResult(persistent.HK[0], runtime).result.nomor, '4659');
  assert.equal(predictionMayDisplay({
    prediction: { prediction_basis_date: '2026-09-21', prediction_basis_result: '9608' },
    dataset: persistent.HK[0],
    runtime,
  }).visible, false);
  assert.deepEqual(persistent, before, 'runtime reconciliation must not append to canonical history');
});

test('stale snapshot cannot regress a newer in-memory runtime result', () => {
  const persistent = { HK: [datasetNew], SDY: [], SGP: [] };
  const newerRuntime = createRuntimeLatestResult({ market: 'HK', board: phaseOneBoard });
  const reconciled = reconcileRuntimeCandidates({
    marketData: persistent,
    snapshot: { markets: { HK: liveBoard } },
    currentRuntimeResults: { HK: newerRuntime },
  });
  assert.equal(reconciled.runtimeLatestResults.HK.result_date, '2026-09-22');
  assert.equal(reconciled.runtimeLatestResults.HK.nomor, '4659');
  assert.equal(reconciled.decisions.HK.source, 'IN_MEMORY_RUNTIME');
});

test('invalid or out-of-order snapshot response cannot erase runtime progress', () => {
  const persistent = { HK: [datasetNew], SDY: [], SGP: [] };
  const newerRuntime = createRuntimeLatestResult({ market: 'HK', board: phaseOneBoard });
  const invalid = reconcileRuntimeCandidates({
    marketData: persistent,
    snapshot: { markets: { HK: { ...phaseOneBoard, first: 'invalid' } } },
    currentRuntimeResults: { HK: newerRuntime },
  });
  assert.equal(invalid.runtimeLatestResults.HK.nomor, '4659');
  assert.equal(invalid.decisions.HK.snapshot_error, 'RUNTIME_FIRST_INVALID');

  const firstResponse = reconcileRuntimeCandidates({
    marketData: persistent,
    snapshot: { markets: { HK: phaseOneBoard } },
    currentRuntimeResults: {},
  });
  const lateOlderResponse = reconcileRuntimeCandidates({
    marketData: persistent,
    snapshot: { markets: { HK: liveBoard } },
    currentRuntimeResults: firstResponse.runtimeLatestResults,
  });
  assert.equal(lateOlderResponse.runtimeLatestResults.HK.nomor, '4659');
});

test('validated local HK board participates in cold-start reconciliation outside fetch windows', () => {
  const persistent = { HK: [datasetNew], SDY: [], SGP: [] };
  const before = structuredClone(persistent);
  const reconciled = reconcileRuntimeCandidates({
    marketData: persistent,
    snapshot: { markets: { HK: liveBoard } },
    localBoards: { HK: phaseOneBoard },
    currentRuntimeResults: {},
  });
  assert.equal(reconciled.runtimeLatestResults.HK.nomor, '4659');
  assert.equal(reconciled.decisions.HK.source, 'DEVICE_LOCAL_BOARD');
  assert.deepEqual(persistent, before);
});

test('same-date runtime disagreement is diagnostic and does not override canonical authority', () => {
  const conflictingBoard = { ...phaseOneBoard, first: '391111', derived_4d: '1111' };
  const runtime = createRuntimeLatestResult({ market: 'HK', board: phaseOneBoard });
  const reconciled = reconcileRuntimeCandidates({
    marketData: { HK: [{ result_date: '2026-09-22', nomor: '1111' }], SDY: [], SGP: [] },
    snapshot: { markets: { HK: conflictingBoard } },
    currentRuntimeResults: { HK: runtime },
  });
  assert.equal(reconciled.decisions.HK.runtime_conflict, true);
  assert.equal(reconciled.decisions.HK.source, 'LIVE_DRAW_SNAPSHOT');
  assert.equal(reconciled.decisions.HK.state, RUNTIME_SYNC_STATE.DATASET_SYNCED);
  assert.equal(reconciled.runtimeLatestResults.HK, null);
});

test('persistent catch-up clears runtime overlay and same-date disagreement remains conflict', () => {
  const runtime = createRuntimeLatestResult({ market: 'HK', board: phaseOneBoard });
  const caughtUp = reconcileRuntimeCandidates({
    marketData: { HK: [{ result_date: '2026-09-22', nomor: '4659' }], SDY: [], SGP: [] },
    snapshot: { markets: { HK: phaseOneBoard } },
    currentRuntimeResults: { HK: runtime },
  });
  assert.equal(caughtUp.decisions.HK.state, RUNTIME_SYNC_STATE.DATASET_SYNCED);
  assert.equal(caughtUp.runtimeLatestResults.HK, null);

  const conflict = reconcileRuntimeCandidates({
    marketData: { HK: [{ result_date: '2026-09-22', nomor: '1111' }], SDY: [], SGP: [] },
    snapshot: { markets: { HK: phaseOneBoard } },
    currentRuntimeResults: { HK: null },
  });
  assert.equal(conflict.decisions.HK.state, RUNTIME_SYNC_STATE.LIVE_DATASET_CONFLICT);
  assert.equal(conflict.runtimeLatestResults.HK.nomor, '4659');
  assert.equal(effectiveLatestResult({ result_date: '2026-09-22', nomor: '1111' }, conflict.runtimeLatestResults.HK).result.nomor, '1111');
});

test('native probing is limited to HK draw freshness windows', () => {
  const dataset = { result_date: '2026-09-21', nomor: '9608' };
  assert.equal(shouldProbeNativeRuntimeBoard({
    market: 'HK', scheduleState: 'LIVE_WINDOW', marketDrawDate: '2026-09-22', dataset, snapshotRuntime: null,
  }), true);
  assert.equal(shouldProbeNativeRuntimeBoard({
    market: 'HK', scheduleState: 'UPCOMING', marketDrawDate: '2026-09-22', dataset, snapshotRuntime: null,
  }), false);
  assert.equal(shouldProbeNativeRuntimeBoard({
    market: 'SDY', scheduleState: 'LIVE_WINDOW', marketDrawDate: '2026-09-22', dataset, snapshotRuntime: null,
  }), false);
  assert.equal(shouldProbeNativeRuntimeBoard({
    market: 'HK', scheduleState: 'LIVE_WINDOW', marketDrawDate: '2026-09-22', dataset,
    snapshotRuntime: { result_date: '2026-09-22', nomor: '4659' },
  }), false);
  assert.equal(shouldProbeNativeRuntimeBoard({
    market: 'HK', scheduleState: 'LIVE_WINDOW', marketDrawDate: '2026-09-22',
    dataset: { result_date: '2026-09-22', nomor: '4659' },
    snapshotRuntime: { result_date: '2026-09-22', nomor: '4659' },
  }), false);
});

test('resume reconciliation gate coalesces overlap and throttles duplicate foreground events', async () => {
  let clock = 10_000;
  let calls = 0;
  let release;
  const runner = createBoundedReconciliationRunner({ minIntervalMs: 3000, now: () => clock });
  const task = () => {
    calls += 1;
    return new Promise((resolve) => { release = resolve; });
  };
  const first = runner(task, { force: true });
  const overlapping = runner(task);
  await Promise.resolve();
  assert.equal(calls, 1);
  release({ cycle: 1 });
  assert.deepEqual(await first, { cycle: 1 });
  assert.deepEqual(await overlapping, { cycle: 1 });
  assert.equal((await runner(task)).reason, 'RECONCILIATION_THROTTLED');
  clock += 3001;
  const second = runner(() => { calls += 1; return { cycle: 2 }; });
  assert.deepEqual(await second, { cycle: 2 });
  assert.equal(calls, 2);
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

test('collector timestamps distinguish published evidence from unavailable backend checks', () => {
  const now = new Date('2026-09-23T09:38:54Z');
  const status = {
    collected_at: '2026-09-22T17:38:54Z',
    markets: {
      HK: {
        last_source_check: '2026-09-22T17:38:54Z',
        last_successful_data_update: '2026-09-22T17:10:00Z',
      },
    },
  };
  const evidence = collectorTimestampEvidence(status);
  assert.equal(evidence.publishedStatusAt, '2026-09-22T17:38:54.000Z');
  assert.equal(evidence.publishedSourceCheckAt, '2026-09-22T17:38:54.000Z');
  assert.equal(evidence.latestResultUpdateAt, '2026-09-22T17:10:00.000Z');
  assert.equal(evidence.backendCheckAvailable, false);
  assert.equal(evidence.backendLastCheckAt, null);
  const health = collectorHealth(status, now);
  assert.equal(health.state, COLLECTOR_HEALTH.STALE);
  assert.match(health.label, /^Status publik lama · diterbitkan/);
  assert.doesNotMatch(health.label, /cek publik|backend|Collector stale/);
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
  assert.match(app, /<LiveDrawFourDigitBoard[\s\S]*<LiveDrawPlayerBoundary/);
  assert.match(app, /<TotoBoard[\s\S]*<LiveDrawPlayerBoundary/);
  assert.match(app, /<LiveDrawResultBoard[\s\S]*<LiveDrawPlayerBoundary/);
  assert.match(player, /data-sgp-android-embed-containment/);
  assert.match(player, /Pemutaran video dibuka melalui halaman resmi untuk menjaga kestabilan aplikasi/);
});

test('LiveDraw diagnostics keep a bounded sanitized event ring', () => {
  resetLiveDrawDiagnosticsForTest();
  for (let index = 0; index < 45; index += 1) {
    recordLiveDrawDiagnostic('PLAYER_PLAYING', {
      source: 'SGP_4D',
      index,
      url: 'https://sensitive.example/path',
      token: 'secret',
    });
  }
  const events = getLiveDrawDiagnostics();
  assert.equal(events.length, 40);
  assert.equal(events[0].details.index, '5');
  assert.equal(Object.hasOwn(events[0].details, 'url'), false);
  assert.equal(Object.hasOwn(events[0].details, 'token'), false);
  assert.doesNotMatch(formatLiveDrawDiagnostics(), /sensitive|secret/);
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
  const [runtime, reconciliation, config] = await Promise.all([
    readFile(new URL('../src/runtimeResultSync.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/runtimeResultReconciliation.js', import.meta.url), 'utf8'),
    readFile(new URL('../config/collector_sources.json', import.meta.url), 'utf8'),
  ]);
  assert.doesNotMatch(runtime, /public\/data|collector\.py|writeFile|setMarketData/);
  assert.doesNotMatch(reconciliation, /public\/data|collector\.py|writeFile|setMarketData/);
  assert.match(config, /crosscheck_or_qualified_primary/);
  assert.match(config, /nexipools_hk/);
  assert.match(config, /livenomor_hk/);
});
