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

test('large actual cache uses native file transport without mutation or clipboard', async () => {
  const { readFile } = await import('node:fs/promises');
  const { saveLegacyStorageFile } = await import('../src/legacyNativeMigration.js');
  const data = new Map();
  for (const market of ['hk', 'sdy', 'sgp']) for (const path of [`data/${market}.json`, `predictions/${market}/latest.json`]) {
    data.set(`CANONICAL_CACHE_V1:${path}`, JSON.stringify({ data: JSON.parse(await readFile(`public/${path}`, 'utf8')), meta: { source: 'REMOTE' } }));
  }
  data.set('unrelated-token', 'private');
  const before = [...data]; let captured;
  const result = await saveLegacyStorageFile({ getItem: (key) => data.get(key) ?? null }, {
    isNative: () => true, isAvailable: () => true,
    save: async ({ json }) => { captured = json; return { status: 'SAVED', bytes: Buffer.byteLength(json) }; },
    download: () => { throw new Error('NATIVE_MUST_NOT_USE_BLOB_DOWNLOAD'); },
  });
  assert.equal(result.status, 'SAVED'); assert.ok(result.bytes > 2_000_000);
  assert.equal(Object.keys(JSON.parse(captured).localStorage).length, 6);
  assert.ok(!captured.includes('unrelated-token')); assert.deepEqual([...data], before);
});
test('native file export distinguishes cancellation, unavailable plugin and failures', async () => {
  const { saveLegacyStorageFile } = await import('../src/legacyNativeMigration.js');
  const store = { getItem: () => null };
  assert.equal((await saveLegacyStorageFile(store, { isNative: () => true, isAvailable: () => true, save: async () => ({ status: 'CANCELLED' }) })).status, 'CANCELLED');
  await assert.rejects(saveLegacyStorageFile(store, { isNative: () => true, isAvailable: () => false }), /NOT_INSTALLED/);
  await assert.rejects(saveLegacyStorageFile(store, { isNative: () => true, isAvailable: () => true, save: async () => { throw new Error('WRITE_FAILED'); } }), /WRITE_FAILED/);
  let downloaded;
  assert.equal((await saveLegacyStorageFile(store, { isNative: () => false, download: (json) => { downloaded = json; } })).status, 'DOWNLOAD_REQUESTED');
  assert.equal(JSON.parse(downloaded).schema_version, 1);
});
