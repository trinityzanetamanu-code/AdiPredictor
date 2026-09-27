import assert from 'node:assert/strict';
import test from 'node:test';
import { createLatestRefreshCoordinator } from '../src/refreshDataCoordinator.js';

test('a late response from an older refresh cannot replace newer state', () => {
  const coordinator = createLatestRefreshCoordinator();
  const applied = [];
  const olderRequest = coordinator.begin();
  const newerRequest = coordinator.begin();

  assert.equal(coordinator.applyIfLatest(newerRequest, () => applied.push('2026-09-22/4659')), true);
  assert.equal(coordinator.applyIfLatest(olderRequest, () => applied.push('2026-09-21/9608')), false);
  assert.deepEqual(applied, ['2026-09-22/4659']);
});

test('the latest request remains applicable when it is the only request', () => {
  const coordinator = createLatestRefreshCoordinator();
  const request = coordinator.begin();
  let applied = false;
  assert.equal(coordinator.isLatest(request), true);
  assert.equal(coordinator.applyIfLatest(request, () => { applied = true; }), true);
  assert.equal(applied, true);
});
