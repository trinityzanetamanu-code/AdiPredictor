import { getDataProvenance } from './dataClient.js';
import { predictionFreshness } from './predictionFreshness.js';
import { effectiveLatestResult, predictionMayDisplay } from './runtimeResultSync.js';

/** Data-only export for a phone owner who cannot collect WebView logcat.
 * Never include raw network headers, source HTML, device IDs or app secrets. */
export function buildRuntimeDiagnostics({
  marketData = {}, predictions = {}, histories = {}, runtimeResults = {},
  collectorStatus = null, lastRefresh = null, dataError = null,
  fetchEvents = [], playerEvents = [], installedVersionCode = null,
} = {}) {
  const markets = Object.fromEntries(['HK', 'SDY', 'SGP'].map((market) => {
    const dataset = marketData[market];
    const row = dataset?.[0] || null;
    const prediction = predictions[market];
    const runtime = runtimeResults[market] || null;
    const dataOrigin = getDataProvenance(dataset);
    const predictionOrigin = getDataProvenance(prediction);
    const history = histories[market];
    const freshness = predictionFreshness(prediction, row);
    const guard = predictionMayDisplay({ prediction, dataset: row, runtime });
    const effective = effectiveLatestResult(row, runtime);
    return [market, {
      dataset: { date: row?.result_date || null, result: row?.nomor || null,
        collected_at: row?.collected_at || null, verification: row?.verification || null,
        origin: dataOrigin?.source || 'UNKNOWN', fingerprint: dataOrigin?.fingerprint || null,
        fetched_at: dataOrigin?.finished_at || null },
      prediction: { target: prediction?.target_date || null,
        basis_date: prediction?.prediction_basis_date || null,
        basis_result: prediction?.prediction_basis_result || null,
        dataset_fingerprint: prediction?.dataset_fingerprint || null,
        generated_at: prediction?.generated_at || null,
        origin: predictionOrigin?.source || 'UNKNOWN',
        fetched_at: predictionOrigin?.finished_at || null,
        display_allowed: Boolean(freshness.fresh && guard.visible
          && dataOrigin?.source === 'REMOTE' && predictionOrigin?.source === 'REMOTE'),
        freshness_reason: freshness.reason, runtime_guard_reason: guard.reason },
      history: { count: history?.records?.length || 0,
        origin: getDataProvenance(history)?.source || 'UNKNOWN' },
      live: { date: runtime?.result_date || null, result: runtime?.nomor || null,
        observed_at: runtime?.updated_at || null, verification: runtime?.verification || null,
        state: effective.sync.state, shown: effective.source },
    }];
  }));
  return {
    schema_version: 1, kind: 'DEVICE_DIAGNOSTIC_NOT_PROOF_OF_BACKEND_HEALTH',
    generated_at: new Date().toISOString(), installed_version_code: installedVersionCode,
    last_app_refresh: lastRefresh, app_error: dataError || null,
    collector_status: {
      origin: getDataProvenance(collectorStatus)?.source || 'UNKNOWN',
      published_at: collectorStatus?.collected_at || null,
      last_source_check_in_published_status: collectorStatus?.last_source_check || null,
      note: 'Status publik tidak mencatat setiap run no_change.',
    },
    markets, fetch_events: fetchEvents.slice(-80), player_events: playerEvents.slice(-40),
  };
}
