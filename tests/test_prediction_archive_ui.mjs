import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  archiveResultState,
  createArchiveRequestCoordinator,
  normalizeArchivePath,
  publishedHistoryRecords,
  validatePredictionArchive,
} from '../src/predictionArchive.js';
import { buildHistoricalPaitoRows, deriveArchivedPatternPath } from '../src/visualPaito.js';
import { panViewport, pinchViewport, resetViewport, zoomViewport } from '../src/visualViewport.js';
import { loadNotificationPreferences, saveNotificationPreferences } from '../src/notificationService.js';

const indexRecord = {
  market: 'HK', target_date: '2026-09-24', target_period: 'HK-3554',
  dataset_fingerprint: 'fingerprint-9540',
  archive_path: 'public/predictions/hk/archive/2026-09-24.json',
  actual_result: null,
};
const archive = {
  market: 'HK', target_date: '2026-09-24', target_period: 'HK-3554',
  dataset_fingerprint: 'fingerprint-9540',
};

test('published prediction dropdown retains resolved and pending archives', () => {
  const resolved = { ...indexRecord, target_date: '2026-09-23', target_period: 'HK-3553', archive_path: 'public/predictions/hk/archive/2026-09-23.json', actual_result: { number: '9540' } };
  const records = publishedHistoryRecords({ market: 'HK', records: [indexRecord, resolved, { target_date: 'invalid' }] });
  assert.deepEqual(records, [indexRecord, resolved]);
  assert.deepEqual(archiveResultState(indexRecord), { resolved: false, label: 'Menunggu hasil' });
  assert.equal(archiveResultState(resolved).label, 'Hasil 9540');
});

test('archive path, market, date, period, and fingerprint are validated before display', () => {
  assert.equal(normalizeArchivePath(indexRecord, 'HK'), 'predictions/hk/archive/2026-09-24.json');
  assert.equal(validatePredictionArchive(archive, indexRecord, 'HK'), archive);
  assert.throws(() => normalizeArchivePath({ ...indexRecord, archive_path: 'public/predictions/sgp/archive/2026-09-24.json' }, 'HK'), /Lokasi arsip/);
  assert.throws(() => validatePredictionArchive({ ...archive, market: 'SGP' }, indexRecord, 'HK'), /Pasaran/);
  assert.throws(() => validatePredictionArchive({ ...archive, target_date: '2026-09-23' }, indexRecord, 'HK'), /Tanggal/);
  assert.throws(() => validatePredictionArchive({ ...archive, dataset_fingerprint: 'stale' }, indexRecord, 'HK'), /Fingerprint/);
});

test('late archive response cannot replace the newest dropdown selection', async () => {
  const coordinator = createArchiveRequestCoordinator();
  let visible = null;
  const first = coordinator.begin();
  const second = coordinator.begin();
  await Promise.resolve();
  if (coordinator.isLatest(second)) visible = '2026-09-24';
  if (coordinator.isLatest(first)) visible = '2026-09-23';
  assert.equal(visible, '2026-09-24');
});

test('derived paito excludes target/future draws and reconstructs only archived path cells', () => {
  const rows = buildHistoricalPaitoRows([
    { result_date: '2026-09-24', periode: 'HK-3554', nomor: '1111' },
    { result_date: '2026-09-23', periode: 'HK-3553', nomor: '9540' },
    { result_date: '2026-09-22', periode: 'HK-3552', nomor: '4659' },
    { result_date: '2026-09-21', periode: 'HK-3551', nomor: '9608' },
    { result_date: '2026-09-20', periode: 'HK-3550', nomor: '2036' },
  ], '2026-09-24');
  assert.deepEqual(rows.map((row) => row.date), ['2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23']);
  const path = deriveArchivedPatternPath(rows, {
    pattern_name: 'DIAGONAL_TURUN', start_point: '2026-09-20', end_point: '2026-09-21', digits_used: ['0'],
  });
  assert.deepEqual(path.map(({ rowIndex, columnIndex, digit }) => [rowIndex, columnIndex, digit]), [[0, 1, '0'], [1, 2, '0']]);
  assert.deepEqual(deriveArchivedPatternPath(rows, {
    pattern_name: 'DIAGONAL_TURUN', start_point: '2026-09-22', end_point: '2026-09-23', digits_used: ['7'],
  }), [], 'UI must not invent a line when archived metadata cannot reconstruct one');
});

test('zoom supports controls, pinch, pan, and deterministic reset', () => {
  const zoomed = zoomViewport(resetViewport(), 2, { x: 100, y: 100 });
  assert.equal(zoomed.scale, 2);
  const pinched = pinchViewport(zoomed, [{ x: 0, y: 0 }, { x: 100, y: 0 }], [{ x: 0, y: 0 }, { x: 150, y: 0 }]);
  assert.equal(pinched.scale, 3);
  assert.deepEqual(panViewport(pinched, 12, -4), { ...pinched, x: pinched.x + 12, y: pinched.y - 4 });
  assert.deepEqual(zoomViewport(pinched, 0.01), resetViewport());
});

test('notification master and all six category choices survive reload storage', () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  saveNotificationPreferences({ master: true, result: false, prediction: true, liveDraw: false, audit: true, appUpdate: false, collector: true }, storage);
  assert.deepEqual(loadNotificationPreferences(storage), {
    master: true, result: false, prediction: true, liveDraw: false, audit: true, appUpdate: false, collector: true,
  });
});

test('settings owns notification UI and history remains lazy and device-scroll safe', async () => {
  const [app, historyPage, viewer] = await Promise.all([
    readFile(new URL('../src/App.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/PredictionHistoryPage.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/VisualPaitoViewer.jsx', import.meta.url), 'utf8'),
  ]);
  assert.match(app, /id: 'dreams'[\s\S]*id: 'settings', label: 'Pengaturan'/);
  assert.match(app, /function SettingsPanel\(\)[\s\S]*<NotificationSettingsPanel/);
  assert.doesNotMatch(app.match(/function GeneratorPanel[\s\S]*?function ResultsPanel/)?.[0] || '', /NotificationSettingsPanel/);
  assert.match(historyPage, /loadPredictionArchive\(marketCode, selectedRecord/);
  assert.match(historyPage, /controller\.abort\(\)/);
  assert.match(viewer, /touchAction: 'none'/);
  assert.match(viewer, /document\.body\.style\.overflow = previous/);
});
