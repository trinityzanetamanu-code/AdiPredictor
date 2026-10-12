import test from 'node:test';
import assert from 'node:assert/strict';
import { exportLegacyStorage } from '../src/legacyNativeMigration.js';
test('legacy export preserves zeroes and exports only inventoried keys without mutation', () => {
  const data = new Map([['CANONICAL_CACHE_V1:data/hk.json', '{"data":[{"nomor":"0000"}]}'], ['adipredictor:notification-preferences:v1', '{"master":true}'], ['unrelated-token', 'private']]);
  const before = [...data];
  const exported = exportLegacyStorage({ getItem: (key) => data.get(key) ?? null });
  assert.equal(exported.schema_version, 1);
  assert.deepEqual(Object.keys(exported.localStorage).sort(), ['CANONICAL_CACHE_V1:data/hk.json', 'adipredictor:notification-preferences:v1']);
  assert.match(exported.localStorage['CANONICAL_CACHE_V1:data/hk.json'], /0000/);
  assert.deepEqual([...data], before);
});
