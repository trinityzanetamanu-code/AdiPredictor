// Controlled browser rehearsal. It never fetches a real draw or publishes data.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { datasetRevision } from '../src/datasetRevision.js';

const port = 5206;
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: 'pipe' });
const failures = [];
let browser;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
try {
  for (let i = 0; i < 50; i += 1) {
    try { if ((await fetch(origin)).ok) break; } catch { /* waiting for dev server */ }
    if (i === 49) throw new Error('VITE_START_TIMEOUT');
    await wait(200);
  }
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE, args: ['--no-sandbox', '--disable-gpu'] } : {}) });
  const context = await browser.newContext({ viewport: { width: 412, height: 915 }, timezoneId: 'Asia/Jayapura' });
  const data = {}, predictions = {};
  for (const market of ['hk', 'sgp', 'sdy']) {
    data[market] = JSON.parse(await readFile(`public/data/${market}.json`, 'utf8'));
    predictions[market] = JSON.parse(await readFile(`public/predictions/${market}/latest.json`, 'utf8'));
    predictions[market].dataset_revision = await datasetRevision(market.toUpperCase(), data[market]);
  }
  let phase = 'baseline';
  let snapshotChecks = 0;
  const previousHK = data.hk;
  const newer = { ...previousHK[0], result_date: '2026-10-11', tanggal: '11 Okt 2026', nomor: '0052', periode: 'HK-3571', verification: 'CONTROLLED_BROWSER_FIXTURE' };
  const advanced = [newer, ...previousHK];
  const advancedPrediction = { ...predictions.hk, prediction_basis_date: newer.result_date, prediction_basis_result: newer.nomor,
    latest_result: { date: newer.result_date, number: newer.nomor }, dataset_revision: await datasetRevision('HK', advanced),
    target_date: '2026-10-12', target_period: 'HK-3572' };
  await context.route('https://raw.githubusercontent.com/**', async (route) => {
    const path = new URL(route.request().url()).pathname.split('/public/')[1] || '';
    let value = {};
    const marketFile = path.match(/^data\/(hk|sgp|sdy)\.json$/);
    const predFile = path.match(/^predictions\/(hk|sgp|sdy)\/latest\.json$/);
    if (marketFile) value = marketFile[1] === 'hk' && phase !== 'baseline' ? advanced : data[marketFile[1]];
    if (predFile) value = predFile[1] === 'hk' && phase === 'predicted' ? advancedPrediction : predictions[predFile[1]];
    if (path.endsWith('history.json')) value = { records: [] };
    if (path === 'data/live-draw.json') {
      snapshotChecks += 1;
      value = { schema_version: 2, markets: { HK: { market: 'HK', draw_date: '2026-09-30', first: '123456', second: '111111', third: '222222', starter: ['333333'], consolation: ['444444'], derived_4d: '3456' } }, status: { HK: { health: 'FAILED', cache_status: 'cache', source_draw_date: '2026-10-10', result_status: 'unknown', fetch_errors: [{ error: 'CONTROLLED_HTTP_403' }] } } };
    }
    if (path === 'data/collector-status.json') value = { markets: {}, collected_at: '2026-10-10T19:00:00Z' };
    if (path.endsWith('.svg')) return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(value) });
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => failures.push(error.message));
  await page.clock.install({ time: new Date('2026-10-10T19:00:00Z') });
  await page.goto(origin);
  await page.waitForFunction(() => document.querySelector('[data-analysis-latest-number]')?.getAttribute('data-analysis-latest-number') === '3534');
  await page.waitForFunction(() => document.body.textContent.includes('PREDIKSI SELARAS DENGAN DATASET REMOTE'));
  const coldStartChecks = snapshotChecks;
  assert.ok(coldStartChecks > 0);
  phase = 'dataset_advanced';
  await page.clock.fastForward(61000);
  await page.waitForFunction(() => document.querySelector('[data-analysis-latest-number]')?.getAttribute('data-analysis-latest-number') === '0052');
  assert.ok(snapshotChecks > coldStartChecks, 'foreground Analisis polling must fetch LiveDraw snapshot');
  assert.equal(await page.getByText('PREDIKSI SELARAS DENGAN DATASET REMOTE', { exact: false }).count(), 0, 'torn dataset/prediction pair cannot display aligned');
  phase = 'predicted';
  await page.clock.fastForward(61000);
  await page.waitForFunction(() => document.body.textContent.includes('PREDIKSI SELARAS DENGAN DATASET REMOTE'));
  const beforeResume = snapshotChecks;
  await page.clock.fastForward(11000);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForFunction(() => document.querySelector('[data-market-live-health]')?.textContent.includes('CONTROLLED_HTTP_403'));
  for (let i = 0; i < 30 && snapshotChecks === beforeResume; i += 1) await wait(100);
  assert.ok(snapshotChecks > beforeResume, 'window focus must reconcile');
  assert.deepEqual(failures, []);
  await page.reload();
  await page.waitForFunction(() => document.querySelector('[data-analysis-latest-number]')?.getAttribute('data-analysis-latest-number') === '0052');
  assert.deepEqual(failures, []);
  await page.getByRole('button', { name: 'Data', exact: true }).last().click();
  await page.waitForFunction(() => document.querySelector('[data-results-latest-source]')?.textContent.includes('0052'));
  await page.getByRole('button', { name: 'LiveDraw', exact: true }).last().click();
  await page.waitForFunction(() => document.querySelector('[data-live-canonical-result]')?.textContent.includes('0052'));
  assert.match(await page.locator('[data-live-canonical-result]').innerText(), /2026-10-11/);
  assert.deepEqual(failures, []);
  console.log(JSON.stringify({ canonical_analysis_data_livedraw: 'PASS', type: 'CONTROLLED_BROWSER_FIXTURE_NOT_DEVICE_TEST', cold_start: 'PASS', foreground_analisis: 'PASS', torn_pair_hidden: 'PASS', prediction_catchup: 'PASS', focus_resume: 'PASS', reload: 'PASS', page_errors: failures, snapshot_checks: snapshotChecks }));
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
