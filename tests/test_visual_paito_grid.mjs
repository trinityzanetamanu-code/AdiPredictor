import assert from 'node:assert/strict';
import test from 'node:test';
import { buildHistoricalPaitoDataset, buildPaitoGrid, PAITO_GEOMETRY, PAITO_LAGS, paitoCellCenter } from '../src/visualPaito.js';

const rows = [
  ['2026-09-20', '0094'], ['2026-09-21', '1234'], ['2026-09-22', '0094'],
  ['2026-09-23', '4012'], ['2026-09-24', '5094'], ['2026-09-25', '2771'],
].map(([result_date, nomor], i) => ({ result_date, nomor, periode: `HK-${3550 + i}`, source_ids: ['independent-a', 'independent-b'], verification: 'confirmed_2_sources' }));

test('wide grid has five dated 4D draw groups and never reads a future draw', () => {
  const bounded = buildHistoricalPaitoDataset(rows, { target_date: '2026-09-26', dataset: { last_date: '2026-09-25' } }).rows;
  const grid = buildPaitoGrid(bounded, { count: 3 });
  assert.equal(PAITO_LAGS.length * 4, 20);
  assert.deepEqual(grid.map((row) => row.date), ['2026-09-23', '2026-09-24', '2026-09-25']);
  assert.equal(grid[0].cells.length, 20);
  assert.equal(grid[0].cells[0].sourceDate, null); // D−4 is absent at the start of this archive.
  assert.deepEqual(grid[1].cells.slice(16).map((cell) => cell.digit).join(''), '5094');
  assert.equal(grid[2].cells[19].sourceDate, '2026-09-25');
  assert.ok(grid.every((row) => row.cells.every((cell) => !cell.sourceDate || cell.sourceDate <= row.date)));
  assert.equal(grid[2].verification, 'confirmed_2_sources');
});

test('repeated 2D blocks use actual KEPALA+EKOR, preserving zeroes and dates', () => {
  const bounded = buildHistoricalPaitoDataset(rows, { target_date: '2026-09-26' }).rows;
  const grid = buildPaitoGrid(bounded, { count: 2, endDate: '2026-09-24' });
  assert.deepEqual(grid.map((row) => row.date), ['2026-09-23', '2026-09-24']);
  const latest = grid[1];
  assert.equal(latest.number, '5094');
  assert.equal(latest.cells[18].digit + latest.cells[19].digit, '94');
  assert.ok(latest.repeatedPairColumns.has(18));
  assert.ok(latest.repeatedPairColumns.has(2)); // 0094 on 20 September.
  assert.ok(latest.repeatedPairColumns.has(10)); // 0094 on 22 September.
  assert.equal(latest.cells[0].sourceDate, '2026-09-20');
});

test('line endpoints share the exact coordinates of their grid cell centers', () => {
  assert.deepEqual(paitoCellCenter(0, 0), {
    x: PAITO_GEOMETRY.labelWidth + PAITO_GEOMETRY.cellWidth / 2,
    y: PAITO_GEOMETRY.headerHeight + PAITO_GEOMETRY.rowHeight / 2,
  });
  assert.equal(paitoCellCenter(3, 19).x - paitoCellCenter(3, 18).x, PAITO_GEOMETRY.cellWidth);
  assert.equal(paitoCellCenter(3, 19).y - paitoCellCenter(2, 19).y, PAITO_GEOMETRY.rowHeight);
});

test('archive target result cannot leak into its historical paito window', () => {
  const bounded = buildHistoricalPaitoDataset(rows, { target_date: '2026-09-25', dataset: { last_date: '2026-09-24' } }).rows;
  const grid = buildPaitoGrid(bounded, { count: 120 });
  assert.equal(grid.at(-1).date, '2026-09-24');
  assert.ok(grid.every((row) => row.cells.every((cell) => cell.sourceDate !== '2026-09-25')));
});
