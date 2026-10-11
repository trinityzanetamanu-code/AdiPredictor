// Controlled Android viewport against original repository archives/SVGs.
// No real source access, regenerated candidates, or physical device claim.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { datasetRevision } from '../src/datasetRevision.js';
import { publishedHistoryRecords } from '../src/predictionArchive.js';

const origin = 'http://127.0.0.1:5207';
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5207', '--strictPort'], { stdio: 'pipe' });
let browser;
const errors = [], svgRequests = new Set(), checked = [];
const json = async (path) => JSON.parse(await readFile(`public/${path}`, 'utf8'));
try {
  for (let attempt = 0; ; attempt += 1) {
    try { if ((await fetch(origin)).ok) break; } catch { /* server startup */ }
    assert.ok(attempt < 50, 'Vite startup timeout');
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  const predictions = {}, histories = {};
  for (const market of ['hk', 'sdy', 'sgp']) {
    predictions[market] = await json(`predictions/${market}/latest.json`);
    // Align only the in-memory transport fixture, as in foreground rehearsal.
    predictions[market].dataset_revision = await datasetRevision(market.toUpperCase(), await json(`data/${market}.json`));
    histories[market] = publishedHistoryRecords(await json(`predictions/${market}/history.json`));
  }
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE, args: ['--no-sandbox', '--disable-gpu'] } : {}) });
  const context = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, timezoneId: 'Asia/Jayapura' });
  await context.route('https://raw.githubusercontent.com/**', async (route) => {
    const path = new URL(route.request().url()).pathname.split('/public/')[1] || '';
    assert.ok(!path.includes('..'), 'Unexpected asset traversal');
    try {
      const latest = path.match(/^predictions\/(hk|sdy|sgp)\/latest\.json$/);
      const body = latest ? JSON.stringify(predictions[latest[1]]) : await readFile(`public/${path}`);
      if (path.endsWith('.svg')) svgRequests.add(path);
      await route.fulfill({ contentType: path.endsWith('.svg') ? 'image/svg+xml' : 'application/json', body });
    } catch (error) {
      errors.push(`Missing original fixture: ${path}: ${error.message}`);
      await route.fulfill({ status: 404, body: 'Missing repository fixture' });
    }
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(origin);
  await page.locator('[data-analysis-latest-number]').waitFor();
  await page.getByRole('button', { name: 'Histori Prediksi', exact: true }).click();
  const history = page.locator('[data-page="prediction-history"]');
  await history.waitFor();
  const loaded = history.locator('[data-loaded-prediction-archive]');
  for (const market of ['hk', 'sdy', 'sgp']) {
    await history.locator('select').nth(0).selectOption(market.toUpperCase());
    const records = histories[market].filter((record) => record.actual_result && record.outcome_audit).slice(0, 2);
    assert.equal(records.length, 2, `${market}: require two original resolved archives`);
    for (const record of records) {
      const archive = JSON.parse(await readFile(record.archive_path, 'utf8'));
      await history.locator('select').nth(1).selectOption(`${record.target_date}|${record.target_period}`);
      await loaded.getByText(`${archive.market} · ${archive.target_date} · ${archive.target_period}`, { exact: true }).waitFor();
      assert.ok(await loaded.getByText('QUICK VIEW — ANGKA KANDIDAT', { exact: true }).isVisible());
      await loaded.getByText('Konsensus raw / weighted, skor, dukungan, dan seri', { exact: true }).click();
      assert.ok(await loaded.getByText('Weighted 4D', { exact: true }).isVisible());
      const models = loaded.locator('details').filter({ has: page.locator(':scope > summary', { hasText: 'Detail P1–P7 dan Top-K asli' }) });
      await models.locator(':scope > summary').click();
      await models.getByText('P5', { exact: true }).click();
      assert.ok(archive.models.P5, 'P5 original model remains available');
      await loaded.getByText('Audit prediksi tanggal ini', { exact: true }).click();
      assert.ok(await loaded.locator('[data-testid="prediction-outcome-audit"]').first().isVisible());
      await loaded.getByText('AUDIT POLA VISUAL P5', { exact: true }).first().click();
      const visual = loaded.locator('[data-section="pola-visual"]');
      await visual.locator(':scope > summary').click();
      assert.ok(archive.visual_patterns.length > 0);
      for (let index = 0; index < archive.visual_patterns.length; index += 1) {
        const pattern = archive.visual_patterns[index];
        const details = visual.locator(':scope > div > details').nth(index);
        await details.locator(':scope > summary').click();
        await details.getByText('SVG historis asli (tetap dibekukan)', { exact: true }).click();
        const img = details.getByRole('img', { name: `SVG historis ${pattern.pattern_name}`, exact: true });
        await img.scrollIntoViewIfNeeded();
        await img.evaluate((element) => new Promise((resolve, reject) => {
          if (element.complete) return element.naturalWidth > 0 ? resolve() : reject(new Error('Original SVG failed to load'));
          element.addEventListener('load', resolve, { once: true });
          element.addEventListener('error', () => reject(new Error('Original SVG failed to load')), { once: true });
        }));
        const url = new URL(await img.getAttribute('src'));
        assert.ok(url.pathname.endsWith(`/public/${pattern.image_path}`));
        assert.equal(url.searchParams.get('v'), archive.dataset_fingerprint.slice(0, 16));
        assert.ok(svgRequests.has(pattern.image_path));
      }
      assert.equal(await history.locator('[data-pola-paito], [data-section="pola-paito"], [role="dialog"]').count(), 0);
      assert.doesNotMatch(await history.innerText(), /Pola Paito|Jumlah draw|Perbesar|Perkecil/i);
      checked.push({ market: archive.market, date: archive.target_date, original_svgs: archive.visual_patterns.length });
    }
  }
  await history.locator('select').nth(0).selectOption('HK');
  const legacy = histories.hk.find((record) => record.target_date === '2026-09-19');
  assert.ok(legacy);
  await history.locator('select').nth(1).selectOption(`${legacy.target_date}|${legacy.target_period}`);
  await loaded.getByText(`HK · ${legacy.target_date} · ${legacy.target_period}`, { exact: true }).waitFor();
  assert.ok(await loaded.getByText(/Pola Visual: tidak tersedia pada arsip asli/).isVisible());
  assert.ok(await loaded.getByText('QUICK VIEW — ANGKA KANDIDAT', { exact: true }).isVisible());
  await page.reload();
  await history.waitFor();
  await loaded.waitFor();
  await history.getByRole('button', { name: 'Kembali', exact: true }).click();
  await page.locator('[data-analysis-latest-number]').waitFor();
  await page.getByRole('button', { name: 'Data', exact: true }).last().click();
  await page.locator('[data-results-latest-source]').waitFor();
  await page.getByRole('button', { name: 'Analisis', exact: true }).last().click();
  await page.getByRole('button', { name: 'Histori Prediksi', exact: true }).click();
  await loaded.waitFor();
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ type: 'CONTROLLED_ANDROID_VIEWPORT_NOT_PHYSICAL_DEVICE', viewport: '412x915', history_navigation: 'PASS', selected_original_archive_svgs: checked, outcome_audit: 'PASS', models_consensus_quick_view: 'PASS', legacy_archive: 'PASS', reload_and_tab_return: 'PASS', paito_absent: 'PASS', page_errors: errors }));
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
