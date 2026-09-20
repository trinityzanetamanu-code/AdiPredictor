import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  attachDatasetValidation,
  LIVE_BOARD_URLS,
  parseSixDigitBoard,
  validateSixDigitBoard,
} from '../src/liveDrawService.js';

const fixture = async (name) => readFile(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

test('HK text board parses full 6D and derives last four', async () => {
  const board = parseSixDigitBoard(await fixture('hk-live-board.html'), 'HK');
  assert.equal(board.first, '510860');
  assert.equal(board.second, '431651');
  assert.equal(board.third, '338178');
  assert.deepEqual(board.starter, ['104235', '665901']);
  assert.deepEqual(board.consolation, ['990124', '226780']);
  assert.equal(board.derived_4d, '0860');
});

test('SDY image filenames map deterministically to six digits', async () => {
  const board = parseSixDigitBoard(await fixture('sdy-live-board-image.html'), 'SDY');
  assert.equal(board.first, '708748');
  assert.equal(board.second, '123456');
  assert.equal(board.third, '654321');
  assert.equal(board.derived_4d, '8748');
});

test('malformed boards are rejected instead of partially rendered', () => {
  assert.throws(() => validateSixDigitBoard({
    market: 'HK', draw_date: '2026-09-19', first: '12345', second: '123456',
    third: '123456', starter: [], consolation: [], derived_4d: '2345',
  }), /first harus exact 6 digit/);
});

test('dataset comparison reports match and mismatch without overwriting either value', async () => {
  const board = parseSixDigitBoard(await fixture('sdy-live-board-image.html'), 'SDY');
  const match = attachDatasetValidation(board, { result_date: '2026-09-19', nomor: '8748' });
  const mismatch = attachDatasetValidation(board, { result_date: '2026-09-19', nomor: '0000' });
  assert.equal(match.matches_dataset, true);
  assert.equal(match.dataset_4d, '8748');
  assert.equal(mismatch.matches_dataset, false);
  assert.equal(mismatch.derived_4d, '8748');
  assert.equal(mismatch.dataset_4d, '0000');
});

test('source URLs are exact HTTPS market pages with no ad endpoints', () => {
  assert.equal(LIVE_BOARD_URLS.HK.pageUrl, 'https://www.hongkongpools.com/live');
  assert.equal(LIVE_BOARD_URLS.SDY.pageUrl, 'https://www.sydneypoolstoday.com/live.html');
  assert.equal(LIVE_BOARD_URLS.SDY.dataUrl, 'https://www.sydneypoolstoday.com/getLiveContent');
});

test('history is a dedicated internal page and not inline under GeneratorPanel', async () => {
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const historyPage = await readFile(new URL('../src/components/PredictionHistoryPage.jsx', import.meta.url), 'utf8');
  assert.match(app, /internalPage === 'prediction-history'/);
  assert.match(app, /window\.history\.pushState/);
  assert.match(app, /window\.addEventListener\('popstate'/);
  assert.doesNotMatch(app, /showHistory/);
  assert.doesNotMatch(app, /function PredictionHistoryPanel/);
  assert.match(historyPage, /data-page="prediction-history"/);
  assert.match(historyPage, /onClick=\{onBack\}/);
  assert.match(historyPage, /Kembali/);
});

test('native six-digit board never injects or executes source HTML', async () => {
  const boardComponent = await readFile(new URL('../src/components/LiveDrawSixDigitBoard.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(boardComponent, /dangerouslySetInnerHTML/);
  assert.doesNotMatch(boardComponent, /<iframe/);
  assert.doesNotMatch(boardComponent, /<script/);
});
