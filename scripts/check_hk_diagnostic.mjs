// Controlled DOM/download tests only. This never accesses HongkongPools.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const source = await readFile('scripts/hk_diagnostic/capture.js', 'utf8');
const bookmarklet = 'javascript:' + source.split('\n').filter((line) => !line.trimStart().startsWith('//')).map((line) => line.trim()).join(' ');
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE, args: ['--no-sandbox', '--disable-gpu'] } : {}) });
try {
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  let html = '<title>CONTROLLED HK FIXTURE</title><meta http-equiv="refresh" content="30"><div>October 10, 2026</div><table id="prizes"><tr><th>1st Prize</th><td data-token="secret"><img src="https://www.hongkongpools.com/images/0.png?token=secret" alt="0"><span>000052</span></td></tr></table><input type="hidden" value="secret"><script>/*secret*/</script>';
  await context.route('**/*', (route) => route.request().isNavigationRequest() ?
    route.fulfill({contentType: 'text/html', body: html}) : route.abort());
  const messages = [];
  page.on('dialog', async (dialog) => {
    if (dialog.type() === 'prompt') await dialog.accept(dialog.message().startsWith('Label') ? 'completed' : '2026-10-10');
    else { messages.push(dialog.message()); await dialog.accept(); }
  });
  await page.goto('https://www.hongkongpools.com/live.html');
  await page.evaluate(() => {
    Object.defineProperty(document, 'cookie', {get() {throw new Error('COOKIE_ACCESS_FORBIDDEN');}});
    Object.defineProperty(window, 'localStorage', {get() {throw new Error('STORAGE_ACCESS_FORBIDDEN');}});
  });
  const downloaded = page.waitForEvent('download');
  downloaded.catch(() => {}); // Preserve a preceding script error during cleanup.
  // Exercise the exact one-line bookmarklet, not a separate copy of its logic.
  await page.evaluate((code) => { (0, eval)(code.slice('javascript:'.length)); }, bookmarklet);
  const download = await downloaded;
  const capture = JSON.parse(await readFile(await download.path(), 'utf8'));
  assert.equal(capture.capture_status, 'DOM_CAPTURED_REVIEW_REQUIRED');
  assert.equal(capture.finality_verified, false);
  assert.equal(capture.owner_draw_date_verified, false);
  assert.ok(capture.html.includes('000052'));
  for (const forbidden of ['secret', '<script', '<input', 'data-token', '?token=']) assert.ok(!capture.html.includes(forbidden), forbidden);
  assert.equal(capture.structure.meta_refresh_seconds, 30);
  assert.equal(capture.structure.prize_table_count, 1);
  assert.ok(capture.structure.date_candidates.includes('October 10, 2026'));
  assert.ok(capture.structure.six_digit_text_candidates.includes('000052'));
  assert.ok(messages.at(-1).startsWith('DOM_CAPTURED_REVIEW_REQUIRED'));
  html = '<title>Just a moment...</title><p>Verify you are human</p>';
  await page.reload();
  await page.evaluate(source);
  assert.ok(messages.at(-1).startsWith('CAPTURE_BLOCKED'));
  html = '<title>Loaded shell</title><p>No table here</p>';
  await page.reload();
  await page.evaluate(source);
  assert.ok(messages.at(-1).startsWith('CAPTURE_FAILED_NO_TABLE'));
  await page.goto('https://example.com/live.html');
  await page.evaluate(source);
  assert.ok(messages.at(-1).startsWith('CAPTURE_FAILED_WRONG_PAGE'));
  console.log(JSON.stringify({ type: 'CONTROLLED_DOM_NOT_OWNER_DEVICE_OR_REAL_SOURCE', bookmarklet_download: 'PASS', zeroes: 'PASS', sanitization: 'PASS', challenge_rejected: 'PASS', missing_table_rejected: 'PASS', wrong_page_rejected: 'PASS' }));
} finally {
  await browser.close();
}
