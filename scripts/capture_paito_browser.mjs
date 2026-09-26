#!/usr/bin/env node
// Browser viewport rehearsal with local published JSON fixtures, never live endpoints.
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { chromium } from 'playwright';

const appDir = resolve(process.env.PAITO_APP_DIR || '.');
const outDir = resolve(process.env.PAITO_OUTPUT_DIR || 'artifacts/paito-browser');
const port = Number(process.env.PAITO_PORT || 5197);
const baseURL = `http://127.0.0.1:${port}`;
await mkdir(outDir, { recursive: true });
const server = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  cwd: appDir, stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
for (const stream of [server.stdout, server.stderr]) stream.on('data', (chunk) => { serverLog += chunk.toString().slice(0, 500); });
let browser;
const diagnostics = { viewport: { width: 393, height: 852 }, markets: {}, actions: [] };
try {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try { if ((await fetch(baseURL)).ok) break; } catch { /* wait for Vite */ }
    if (attempt === 79) throw new Error(`Vite did not start: ${serverLog.slice(-800)}`);
    await new Promise((done) => setTimeout(done, 350));
  }
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: diagnostics.viewport, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await page.route('https://raw.githubusercontent.com/trinityzanetamanu-code/AdiPredictor/main/public/**', async (route) => {
    const relative = new URL(route.request().url()).pathname.split('/main/public/')[1];
    try {
      const payload = await readFile(join(appDir, 'public', relative));
      await route.fulfill({ status: 200, body: payload, contentType: 'application/json' });
    } catch { await route.fulfill({ status: 404, body: '{}' }); }
  });
  await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
  const openHistory = page.getByRole('button', { name: /Buka arsip dan bidang Pola Paito/ });
  await openHistory.waitFor({ timeout: 60000 });
  await openHistory.click();
  await page.locator('[data-page="prediction-history"]').waitFor();
  for (const market of ['HK', 'SDY', 'SGP']) {
    await page.locator('[data-page="prediction-history"] select').first().selectOption(market);
    const section = page.locator('[data-section="pola-paito"]');
    await section.waitFor({ timeout: 60000 });
    if (!await section.evaluate((el) => el.open)) await section.locator('summary').click();
    const board = section.locator('[data-pola-paito]').first();
    await board.waitFor({ timeout: 60000 });
    const first = board.getByRole('button', { name: /Baris/ }).first();
    const second = board.getByRole('button', { name: /Baris/ }).nth(6);
    await first.click();
    await second.click();
    // Expand the document solely for the full-field evidence capture.
    await section.locator('[tabindex="0"]').first().evaluate((el) => {
      el.style.maxHeight = 'none'; el.style.overflow = 'visible';
    });
    await board.screenshot({ path: join(outDir, `${market.toLowerCase()}-full-field.png`) });
    const field = await board.boundingBox();
    if (!field || field.width < 900 || field.height < 1000) throw new Error(`${market}: grid too small`);
    await section.locator('[tabindex="0"]').first().evaluate((el) => {
      el.style.maxHeight = ''; el.style.overflow = '';
    });
    diagnostics.markets[market] = { field: { width: field.width, height: field.height }, selected: await board.locator('[aria-pressed="true"]').count() };
    const fullscreen = section.getByRole('button', { name: /Buka Pola Paito layar penuh/ });
    await fullscreen.click();
    const dialog = page.getByRole('dialog', { name: new RegExp(`Pola Paito ${market}`) });
    await dialog.waitFor();
    await dialog.screenshot({ path: join(outDir, `${market.toLowerCase()}-viewport.png`) });
    const scroller = dialog.locator('[tabindex="0"]');
    await scroller.evaluate((el) => { el.scrollLeft = 330; el.scrollTop = 520; });
    const before = await scroller.evaluate((el) => [el.scrollLeft, el.scrollTop]);
    if (before[0] < 200 || before[1] < 400) throw new Error(`${market}: two-axis scroll failed`);
    await dialog.getByRole('button', { name: 'Perbesar' }).click();
    if (!await dialog.getByText('125%', { exact: false }).count()) throw new Error(`${market}: zoom failed`);
    await dialog.screenshot({ path: join(outDir, `${market.toLowerCase()}-zoom.png`) });
    // Two independent touch pointers exercise the same pointer handlers as Android pinch.
    const rect = await scroller.boundingBox();
    const x = rect.x + rect.width / 2; const y = rect.y + Math.min(190, rect.height / 2);
    if (process.env.PAITO_BASELINE !== '1') {
      await scroller.dispatchEvent('pointerdown', { pointerId: 11, clientX: x - 40, clientY: y, pointerType: 'touch' });
      await scroller.dispatchEvent('pointerdown', { pointerId: 12, clientX: x + 40, clientY: y, pointerType: 'touch' });
      await scroller.dispatchEvent('pointermove', { pointerId: 12, clientX: x + 90, clientY: y, pointerType: 'touch' });
      const zoomLabel = await dialog.locator('div.text-xs.font-bold').first().innerText();
      if (Number(/(\d+)%/.exec(zoomLabel)?.[1] || 0) <= 125) throw new Error(`${market}: simulated pinch did not zoom`);
      await scroller.dispatchEvent('pointerup', { pointerId: 11, pointerType: 'touch' });
      await scroller.dispatchEvent('pointerup', { pointerId: 12, pointerType: 'touch' });
    }
    await dialog.getByRole('button', { name: /Reset/ }).click();
    const after = await scroller.evaluate((el) => [el.scrollLeft, el.scrollTop]);
    if (after[0] || after[1] || !await dialog.getByText('100%', { exact: false }).count()) throw new Error(`${market}: reset failed`);
    await dialog.getByRole('button', { name: 'Tutup' }).click();
    diagnostics.actions.push(`${market}: full field, selection, two-axis scroll, fullscreen, zoom, ${process.env.PAITO_BASELINE === '1' ? 'baseline (pinch skipped)' : 'pinch pointer'}, reset, close`);
  }
  await writeFile(join(outDir, 'diagnostics.json'), JSON.stringify(diagnostics, null, 2));
  console.log(JSON.stringify(diagnostics));
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
}
