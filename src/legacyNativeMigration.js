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

// Injected transport makes the real export envelope testable without a device.
// Native uses SAF; a multi-megabyte export must never depend on clipboard limits.
export async function saveLegacyStorageFile(storage, { isNative, isAvailable, save, download } = {}) {
  const { Capacitor, registerPlugin } = await import('@capacitor/core');
  const json = JSON.stringify(exportLegacyStorage(storage));
  if ((isNative || (() => Capacitor.isNativePlatform()))()) {
    if (!(isAvailable || (() => Capacitor.isPluginAvailable('LegacyExport')))()) throw new Error('LEGACY_EXPORTER_NOT_INSTALLED');
    const result = await (save || ((args) => registerPlugin('LegacyExport').save(args)))({ json });
    if (!['SAVED', 'CANCELLED'].includes(result?.status) || result.status === 'SAVED' && (!Number.isInteger(result.bytes) || result.bytes < 1)) throw new Error('INVALID_EXPORT_RESULT');
    return result;
  }
  const browserDownload = download || ((text) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'adipredictor-legacy.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  });
  browserDownload(json);
  return { status: 'DOWNLOAD_REQUESTED' };
}
