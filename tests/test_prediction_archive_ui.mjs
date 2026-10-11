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

test('v1 archive without visual metadata remains readable through the archive validator', async () => {
  const [historyText, oldArchiveText] = await Promise.all([
    readFile(new URL('../public/predictions/hk/history.json', import.meta.url), 'utf8'),
    readFile(new URL('../public/predictions/hk/archive/2026-09-19.json', import.meta.url), 'utf8'),
  ]);
  const legacy = JSON.parse(oldArchiveText);
  const record = publishedHistoryRecords(JSON.parse(historyText)).find((item) => item.target_date === legacy.target_date);
  assert.ok(record, 'legacy archive must remain selectable from published history');
  assert.equal(validatePredictionArchive(legacy, record, 'HK'), legacy);
  assert.equal(normalizeArchivePath(record, 'HK'), 'predictions/hk/archive/2026-09-19.json');
  assert.ok(legacy.quick_view && legacy.models && legacy.weighted_consensus);
  assert.equal(legacy.visual_patterns, undefined, 'reader must not invent historical metadata');
});

test('notification master and all six category choices survive reload storage', () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  saveNotificationPreferences({ master: true, result: false, prediction: true, liveDraw: false, audit: true, appUpdate: false, collector: true }, storage);
  assert.deepEqual(loadNotificationPreferences(storage), {
    master: true, result: false, prediction: true, liveDraw: false, audit: true, appUpdate: false, collector: true,
  });
});

test('settings owns notification UI and history retains lazy archives and original visual SVGs', async () => {
  const [app, historyPage] = await Promise.all([
    readFile(new URL('../src/App.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/PredictionHistoryPage.jsx', import.meta.url), 'utf8'),
  ]);
  assert.match(app, /id: 'dreams'[\s\S]*id: 'settings', label: 'Pengaturan'/);
  assert.match(app, /function SettingsPanel\(\)[\s\S]*<NotificationSettingsPanel/);
  assert.doesNotMatch(app.match(/function GeneratorPanel[\s\S]*?function ResultsPanel/)?.[0] || '', /NotificationSettingsPanel/);
  assert.match(historyPage, /loadPredictionArchive\(marketCode, selectedRecord/);
  assert.match(historyPage, /controller\.abort\(\)/);
  assert.match(historyPage, /data-section="pola-visual"/);
  assert.match(historyPage, /Pola Visual — bukti dan SVG arsip asli/);
  assert.match(historyPage, /predictionAssetUrl\(pattern\.image_path, archive\.dataset_fingerprint\)/);
  assert.match(historyPage, /PredictionOutcomeAudit audit=\{record\.outcome_audit\}/);
});

test('published archives retain their visual metadata and original SVG assets for all markets', async () => {
  for (const market of ['hk', 'sdy', 'sgp']) {
    const history = JSON.parse(await readFile(new URL(`../public/predictions/${market}/history.json`, import.meta.url), 'utf8'));
    const record = publishedHistoryRecords(history).find((item) => item.actual_result && item.outcome_audit);
    assert.ok(record, `${market} needs a resolved published archive`);
    const archive = JSON.parse(await readFile(new URL(`../${record.archive_path}`, import.meta.url), 'utf8'));
    validatePredictionArchive(archive, record, market.toUpperCase());
    assert.ok(archive.visual_patterns?.length > 0);
    assert.ok(record.outcome_audit.visual_patterns?.length > 0);
    assert.ok(archive.models.P5);
    for (const pattern of archive.visual_patterns) {
      assert.match(pattern.image_path, new RegExp(`^predictions/${market}/visuals/`));
      const svg = await readFile(new URL(`../public/${pattern.image_path}`, import.meta.url), 'utf8');
      assert.match(svg, /<svg\b/);
    }
  }
});
