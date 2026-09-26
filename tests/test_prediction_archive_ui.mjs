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
import {
  archivedPatternPathProvenance,
  buildHistoricalPaitoDataset,
  buildHistoricalPaitoRows,
  deriveArchivedPatternPath,
  normalizePaitoNumber,
} from '../src/visualPaito.js';
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

test('derived paito uses archive creation boundary and excludes target/future draws', () => {
  const rows = buildHistoricalPaitoRows([
    { result_date: '2026-09-24', periode: 'HK-3554', nomor: '1111' },
    { result_date: '2026-09-23', periode: 'HK-3553', nomor: '9540' },
    { result_date: '2026-09-22', periode: 'HK-3552', nomor: '4659' },
    { result_date: '2026-09-21', periode: 'HK-3551', nomor: '9608' },
    { result_date: '2026-09-20', periode: 'HK-3550', nomor: '2036' },
  ], {
    target_date: '2026-09-24', generated_at: '2026-09-23T23:54:41+07:00',
    dataset: { first_date: '2023-01-01', last_date: '2026-09-23', count: 1362 },
  });
  assert.deepEqual(rows.map((row) => row.date), ['2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23']);
  const path = deriveArchivedPatternPath(rows, {
    pattern_name: 'DIAGONAL_TURUN', start_point: '2026-09-20', end_point: '2026-09-21', digits_used: ['0'],
  });
  assert.deepEqual(path.map(({ rowIndex, columnIndex, digit }) => [rowIndex, columnIndex, digit]), [[0, 1, '0'], [1, 2, '0']]);
  assert.deepEqual(deriveArchivedPatternPath(rows, {
    pattern_name: 'DIAGONAL_TURUN', start_point: '2026-09-22', end_point: '2026-09-23', digits_used: ['7'],
  }), [], 'UI must not invent a line when archived metadata cannot reconstruct one');
});

test('blank result never becomes 0000 while genuine zero and leading zero remain valid', () => {
  assert.equal(normalizePaitoNumber({ nomor: '' }), null);
  assert.equal(normalizePaitoNumber({ nomor: '   ' }), null);
  assert.equal(normalizePaitoNumber({ nomor: null }), null);
  assert.equal(normalizePaitoNumber({ nomor: '0000' }), '0000');
  assert.equal(normalizePaitoNumber({ nomor: 0 }), '0000');
  assert.equal(normalizePaitoNumber({ nomor: '094' }), '0094');

  const dataset = buildHistoricalPaitoDataset([
    { result_date: '2026-09-19', nomor: '' },
    { result_date: '2026-09-20', nomor: '0000' },
    { result_date: '2026-09-21', nomor: '094' },
  ], { target_date: '2026-09-22', generated_at: '2026-09-21T23:00:00Z', dataset: { last_date: '2026-09-21' } });
  assert.deepEqual(dataset.rows.map((row) => row.number), ['0000', '0094']);
  assert.equal(dataset.diagnostics.invalidNumberRows, 1);
});

test('late collection, corrected conflict, and data beyond frozen boundary are not visualized', () => {
  const dataset = buildHistoricalPaitoDataset([
    { result_date: '2026-09-19', nomor: '0860', collected_at: '2026-09-19T22:00:00Z' },
    { result_date: '2026-09-20', nomor: '2036', collected_at: '2026-09-21T00:00:01Z' },
    { result_date: '2026-09-21', nomor: '9608', collected_at: '2026-09-20T20:00:00Z' },
    { result_date: '2026-09-21', nomor: '9999', collected_at: '2026-09-20T20:01:00Z' },
    { result_date: '2026-09-22', nomor: '4659', collected_at: '2026-09-20T19:00:00Z' },
  ], {
    target_date: '2026-09-22', generated_at: '2026-09-20T23:00:00Z',
    dataset: { first_date: '2023-01-01', last_date: '2026-09-21', count: 100 },
  });
  assert.deepEqual(dataset.rows.map((row) => row.date), ['2026-09-19']);
  assert.equal(dataset.diagnostics.collectedAfterPredictionRows, 1);
  assert.deepEqual(dataset.diagnostics.conflictDates, ['2026-09-21']);
  assert.equal(dataset.diagnostics.outsideArchiveBoundaryRows, 1);
  assert.equal(dataset.exactSnapshotProven, false);
});

test('paito line is marked illustrative when archive lacks frozen cell coordinates', () => {
  const rows = buildHistoricalPaitoRows([
    { result_date: '2026-09-20', nomor: '0000' },
    { result_date: '2026-09-21', nomor: '0000' },
  ], { target_date: '2026-09-22', dataset: { last_date: '2026-09-21' } });
  const provenance = archivedPatternPathProvenance(rows, {
    pattern_name: 'REPEAT_PATH', start_point: '2026-09-20', end_point: '2026-09-21', digits_used: ['0'],
  });
  assert.equal(provenance.exact, false);
  assert.equal(provenance.status, 'ILLUSTRATIVE_RECONSTRUCTION');
  assert.equal(provenance.alternatives, 4);
  assert.match(provenance.reason, /bukan bukti lintasan prediksi asli/);
});

test('HK, SDY, and SGP latest archives respect their own frozen dataset boundaries', async () => {
  for (const market of ['hk', 'sdy', 'sgp']) {
    const [dataText, archiveText] = await Promise.all([
      readFile(new URL(`../public/data/${market}.json`, import.meta.url), 'utf8'),
      readFile(new URL(`../public/predictions/${market}/latest.json`, import.meta.url), 'utf8'),
    ]);
    const data = JSON.parse(dataText);
    const prediction = JSON.parse(archiveText);
    const dataset = buildHistoricalPaitoDataset(Array.isArray(data) ? data : data.results, prediction, 30);
    assert.ok(dataset.rows.length > 0, `${market} must yield bounded paito rows`);
    assert.ok(dataset.rows.every((row) => /^\d{4}$/.test(row.number)));
    assert.ok(dataset.rows.every((row) => row.date <= prediction.dataset.last_date));
    assert.ok(dataset.rows.every((row) => row.date < prediction.target_date));
  }
});

test('v1 archive without visual metadata remains usable without inventing a path', async () => {
  const [dataText, oldArchiveText] = await Promise.all([
    readFile(new URL('../public/data/hk.json', import.meta.url), 'utf8'),
    readFile(new URL('../public/predictions/hk/archive/2026-09-19.json', import.meta.url), 'utf8'),
  ]);
  const parsed = JSON.parse(dataText);
  const dataset = buildHistoricalPaitoDataset(Array.isArray(parsed) ? parsed : parsed.results, JSON.parse(oldArchiveText));
  assert.ok(dataset.rows.length > 0);
  assert.deepEqual(deriveArchivedPatternPath(dataset.rows, null), []);
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
  assert.match(historyPage, /data-section="pola-visual"/);
  assert.match(historyPage, /data-section="pola-paito"/);
  assert.match(historyPage, /Pola Visual — bukti dan SVG arsip asli/);
  assert.match(historyPage, /Pola Paito — tabel historis untuk belajar/);
  assert.match(viewer, /touchAction: 'none'/);
  assert.match(viewer, /document\.body\.style\.overflow = previous/);
});
