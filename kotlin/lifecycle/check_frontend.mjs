// Read real Kotlin adapter output through the unchanged application wire readers.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { alignPredictionWithDataset } from '../../src/datasetRevision.js';
import { predictionFreshness } from '../../src/predictionFreshness.js';
import { publishedHistoryRecords, normalizeArchivePath, validatePredictionArchive, archiveResultState } from '../../src/predictionArchive.js';
import { buildRuntimeNotificationEvents } from '../../src/notificationService.js';

assert.equal(process.argv[2], '--root');
assert.equal(process.argv.length, 4);
const root = resolve(process.argv[3]);
const json = async (relative) => JSON.parse(await readFile(resolve(root, relative), 'utf8'));
const checks = [];
for (const market of ['HK', 'SDY', 'SGP']) {
  const lower = market.toLowerCase();
  const rows = await json(`public/data/${lower}.json`);
  const payload = await json(`public/predictions/${lower}/latest.json`);
  const aligned = await alignPredictionWithDataset(market, rows, payload);
  assert.equal(aligned.dataset_alignment, 'MATCH');
  const latest = rows.slice().sort((a, b) => b.result_date.localeCompare(a.result_date))[0];
  assert.equal(predictionFreshness(aligned, latest).fresh, true);
  assert.match(payload.quick_view.four_d.main.number, /^\d{4}$/);
  assert.ok(payload.models.P5 && payload.p8_ai_instinct);
  assert.equal(payload.candidate_counts.total_direct_number_candidates, 38);
  const history = await json(`public/predictions/${lower}/history.json`);
  const records = publishedHistoryRecords(history);
  assert.equal(records.length, history.records.length);
  let svgCount = 0;
  for (const record of records) {
    const path = normalizeArchivePath(record, market);
    const archive = await json(`public/${path}`);
    assert.equal(validatePredictionArchive(archive, record, market), archive);
    const state = archiveResultState(record);
    assert.equal(state.resolved, Boolean(record.actual_result));
    if (record.actual_result?.number === '0000') assert.equal(state.label, 'Hasil 0000');
    for (const pattern of archive.visual_patterns || []) {
      assert.match(pattern.image_path, new RegExp(`^predictions/${lower}/visuals/\\d{4}-\\d{2}-\\d{2}/[^/]+\\.svg$`));
      assert.match(await readFile(resolve(root, 'public', pattern.image_path), 'utf8'), /<svg\b/);
      svgCount += 1;
    }
  }
  const previous = { marketData: { [market]: rows }, predictions: { [market]: payload } };
  const current = { ...previous, predictions: { [market]: { ...payload, metadata_revision: 4 } } };
  assert.deepEqual(buildRuntimeNotificationEvents({ previous, current, preferences: { result: true, prediction: true } }), []);
  checks.push({ market, alignment: 'MATCH', freshness: 'PASS', archives: records.length, svgCount, metadataNotificationDedupe: 'PASS' });
}
console.log(JSON.stringify({ result: 'PASS', input: 'actual Kotlin production-adapter output on isolated copy', checks }));
