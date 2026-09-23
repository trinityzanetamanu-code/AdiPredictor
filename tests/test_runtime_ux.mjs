import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { replaceInternalPage, resolvedHistoryRecords } from '../src/historyNavigation.js';
import { predictionFreshness } from '../src/predictionFreshness.js';
import { deriveHKLiveState, parseSixDigitBoard, selectBoardForLiveDisplay, selectCurrentHKFastResult } from '../src/liveDrawService.js';

test('History exposes resolved records only and excludes pending count', () => {
  const resolved = { target_date: '2026-09-20', actual_result: { number: '2036' } };
  const pending = { target_date: '2026-09-21', actual_result: null };
  assert.deepEqual(resolvedHistoryRecords({ records: [pending, resolved] }), [resolved]);
});

test('internal History navigation replaces one URL entry and never pushes another root entry', () => {
  const calls = [];
  const history = { replaceState: (...args) => calls.push(args) };
  const location = { pathname: '/app', search: '?x=1' };
  replaceInternalPage(history, location, 'prediction-history');
  replaceInternalPage(history, { ...location, hash: '#prediction-history' }, 'main');
  assert.deepEqual(calls.map((call) => call[2]), ['/app?x=1#prediction-history', '/app?x=1']);
});

test('prediction stale guard validates basis result and a later target date', () => {
  const latest = { result_date: '2026-09-20', nomor: '2036' };
  assert.equal(predictionFreshness({ latest_result: { date: '2026-09-20', number: '2036' }, target_date: '2026-09-21' }, latest).fresh, true);
  assert.equal(predictionFreshness({ latest_result: { date: '2026-09-19', number: '0860' }, target_date: '2026-09-20' }, latest).reason, 'BASIS_DOES_NOT_MATCH_LATEST_DATASET');
  assert.equal(predictionFreshness({ latest_result: { date: '2026-09-20', number: '2036' }, target_date: '2026-09-20' }, latest).reason, 'TARGET_NOT_AFTER_BASIS_DATE');
});

test('HK rowspan/multirow sections retain every starter and consolation number', async () => {
  const html = await readFile(new URL('./fixtures/hk-live-board-rowspan.html', import.meta.url), 'utf8');
  const board = parseSixDigitBoard(html, 'HK');
  assert.deepEqual(board.starter, ['723774', '690434', '862686', '926244']);
  assert.deepEqual(board.consolation, ['157877', '375609', '471066', '998450']);
  assert.equal(board.derived_4d, '2036');
});

test('HK live state waits with spinners and resolves independently at 4D/full-6D layers', () => {
  const old = { result_date: '2026-09-20', nomor: '2036', is_current_draw: 0 };
  const waiting = deriveHKLiveState({ scheduleState: 'LIVE_WINDOW', datasetRow: old });
  assert.equal(waiting.state, 'LIVE_WAITING');
  assert.equal(selectCurrentHKFastResult({
    datasetRow: old,
    marketDrawDate: '2026-09-21',
    liveState: waiting.state,
  }), null, 'yesterday result must be hidden while current draw is waiting');
  const current = { ...old, result_date: '2026-09-21', nomor: '9912', is_current_draw: 1 };
  const verified = deriveHKLiveState({ scheduleState: 'LIVE_WINDOW', datasetRow: current });
  assert.equal(verified.state, 'RESULT_4D_VERIFIED');
  assert.deepEqual(selectCurrentHKFastResult({
    datasetRow: current,
    marketDrawDate: '2026-09-21',
    liveState: verified.state,
  }), current);
  const fullBoard = { draw_date: '2026-09-21', first: '789912', second: '123456', third: '654321', starter: ['111111'], consolation: ['222222'] };
  assert.equal(deriveHKLiveState({ scheduleState: 'RESULT_POSTED', datasetRow: current, fullBoard }).state, 'RESULT_FINAL');
  assert.equal(deriveHKLiveState({ scheduleState: 'RESULT_POSTED', datasetRow: current, fullBoard: { ...fullBoard, draw_date: '2026-09-20', first: '782036' } }).state, 'FULL_6D_AVAILABLE');
  assert.equal(deriveHKLiveState({ scheduleState: 'LIVE_WINDOW', datasetRow: current, fullBoard: { first: '789912', second: '' } }).state, 'PARTIAL_RESULT');
});

test('stale full board is filtered during a new live window before state derivation', async () => {
  const stale = { market: 'HK', draw_date: '2026-09-20', first: '782036' };
  assert.equal(selectBoardForLiveDisplay({ board: stale, market: 'HK', scheduleState: 'LIVE_WINDOW', marketDrawDate: '2026-09-21' }), null);
  assert.equal(selectBoardForLiveDisplay({ board: { ...stale, draw_date: '2026-09-21' }, market: 'HK', scheduleState: 'LIVE_WINDOW', marketDrawDate: '2026-09-21' })?.draw_date, '2026-09-21');
});

test('spinner UX contains rotating rings and no generated or random digit animation', async () => {
  const component = await readFile(new URL('../src/components/LiveDrawSixDigitBoard.jsx', import.meta.url), 'utf8');
  assert.match(component, /data-spinner-digits/);
  assert.match(component, /animate-spin/);
  assert.doesNotMatch(component, /Math\.random|setInterval\([^)]*digit|rolling/i);
});

test('Android History back closes internally and root back exits without browser stack pop', async () => {
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /history\.pushState|history\.back\(/);
  assert.match(app, /replaceInternalPage/);
  assert.match(app, /App\.exitApp\(\)/);
});

test('Results latest card may use runtime overlay while canonical history remains separate', async () => {
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(app, /data-results-latest-source=\{effective\.source\}/);
  assert.match(app, /SUMBER LIVE · BELUM TERVERIFIKASI DATASET/);
  assert.match(app, /SUMBER BERUBAH \/ KONFLIK/);
  assert.match(app, /data-canonical-history-list/);
  assert.match(app, /Angka ini hanya terlihat pada sumber live dan belum dimasukkan ke arsip/);
  assert.match(app, /KONFLIK RUNTIME · DATASET TETAP ACUAN/);
});

test('runtime prediction copy never claims an unverified backend synchronization is running', async () => {
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(app, /Menunggu dataset dan prediksi terverifikasi/);
  assert.match(app, /dataset canonical belum mengonfirmasinya/);
  assert.doesNotMatch(app, /Prediksi sedang disinkronkan|Dataset analisis sedang sinkron/);
});

test('cold start and native resume use one bounded runtime reconciliation path', async () => {
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(app, /runForegroundReconciliation\('COLD_START'/);
  assert.match(app, /App\.addListener\('appStateChange'/);
  assert.match(app, /runForegroundReconciliation\('APP_RESUME'\)/);
  assert.match(app, /createBoundedReconciliationRunner/);
  assert.match(app, /loadLiveDrawSnapshot\(\)/);
  assert.match(app, /shouldProbeNativeRuntimeBoard/);
});

test('manual bridge reports explicit extraction diagnostics', async () => {
  const activity = await readFile(new URL('../scripts/android/HKVerificationActivity.java', import.meta.url), 'utf8');
  const service = await readFile(new URL('../src/hkVerificationService.js', import.meta.url), 'utf8');
  for (const code of ['TABLE_NOT_FOUND', 'DATE_NOT_FOUND', 'BRIDGE_FAILED']) assert.match(activity, new RegExp(code));
  assert.match(service, /FIRST_PRIZE_INVALID|error\?\.code/);
  assert.doesNotMatch(activity, /cf_clearance|captcha solver|challenge token/i);
});
