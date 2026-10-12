// Explicit transfer; Capacitor's Chromium storage is not native SharedPreferences.
export function exportLegacyStorage(storage) {
  const keys = [
    'adipredictor:notification-preferences:v1',
    'adipredictor:delivered-notification-events:v1',
    'HK_LAST_VERIFIED_BOARD',
    ...['hk', 'sdy', 'sgp'].flatMap((market) => [
      `CANONICAL_CACHE_V1:data/${market}.json`,
      `CANONICAL_CACHE_V1:predictions/${market}/latest.json`,
    ]),
  ];
  const localStorage = {};
  for (const key of keys) {
    const value = storage.getItem(key);
    if (value !== null) localStorage[key] = value;
  }
  return { schema_version: 1, origin: 'AdiPredictor-Capacitor', localStorage };
}
