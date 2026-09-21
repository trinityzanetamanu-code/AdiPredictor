export const HISTORY_HASH = '#prediction-history';

export function resolvedHistoryRecords(history) {
  return (history?.records || []).filter((record) =>
    /^\d{4}$/.test(String(record?.actual_result?.number || '')),
  );
}

export function replaceInternalPage(historyApi, locationLike, page) {
  const base = `${locationLike.pathname || ''}${locationLike.search || ''}`;
  const url = page === 'prediction-history' ? `${base}${HISTORY_HASH}` : base;
  historyApi.replaceState({ adipredictorPage: page }, '', url);
}
