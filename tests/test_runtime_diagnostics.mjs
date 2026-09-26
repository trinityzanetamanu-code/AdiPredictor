import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getDataFetchDiagnostics, getDataProvenance, loadMarketData, loadPrediction,
} from '../src/dataClient.js';
import { buildRuntimeDiagnostics } from '../src/runtimeDiagnostics.js';

const reply = (data, status = 200) => ({ ok: status === 200, status, json: async () => data });

test('copied phone diagnostics distinguish a matching old APK pair from remote data, without secrets', async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async (url) => String(url).startsWith('https:')
    ? reply({}, 503)
    : reply(String(url).includes('latest.json')
      ? { prediction_basis_date: '2026-09-23', prediction_basis_result: '0217', target_date: '2026-09-24', dataset_fingerprint: 'old-fixture' }
      : [{ result_date: '2026-09-23', nomor: '0217' }]);
  try {
    const dataset = await loadMarketData('SDY');
    const prediction = await loadPrediction('SDY');
    const report = buildRuntimeDiagnostics({
      marketData: { SDY: dataset }, predictions: { SDY: prediction },
      fetchEvents: getDataFetchDiagnostics(), installedVersionCode: 100125,
    });
    assert.equal(getDataProvenance(dataset).source, 'FALLBACK');
    assert.equal(report.markets.SDY.prediction.display_allowed, false);
    assert.equal(report.markets.SDY.dataset.origin, 'FALLBACK');
    assert.equal(report.installed_version_code, 100125);
    assert.ok(report.fetch_events.some((item) => item.origin === 'APK_FALLBACK' && item.reason === 'REMOTE_HTTP_503'));
    assert.ok(report.fetch_events.some((item) => item.origin === 'FAILED' && item.reason === 'HTTP_503'));
    assert.ok(report.fetch_events.every((item) => !item.cookie && !item.headers && !item.url));
    assert.equal(report.markets.SDY.dataset.result, '0217');
  } finally { globalThis.fetch = previous; }
});
