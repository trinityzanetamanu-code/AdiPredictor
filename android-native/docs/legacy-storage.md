# Legacy data transfer

The stable Capacitor application uses Chromium localStorage, while native uses `adipredictor.native.v1` SharedPreferences. Sharing applicationId does not make these stores interchangeable. The native app never deletes or rewrites Chromium storage and no uninstall is required.

Inventory from current legacy source:

| Key | Transfer behavior |
| --- | --- |
| `CANONICAL_CACHE_V1:data/{hk,sdy,sgp}.json` | Accept only REMOTE wrapper + valid full dataset; preserve newer native date and same-draw conflicts |
| `CANONICAL_CACHE_V1:predictions/{hk,sdy,sgp}/latest.json` | Preserve full published payload as cache; latest display still requires current whole-dataset identity/basis |
| `adipredictor:notification-preferences:v1` | Import known boolean preferences only if native preferences are absent |
| `adipredictor:delivered-notification-events:v1` | Merge bounded dedup keys; prevent re-delivery after transfer/restart |
| `HK_LAST_VERIFIED_BOARD` | Import into separate legacy runtime storage, validate six digits/date; never turn it into canonical data |
| Unrelated keys | Not exported/imported |

Before a future owner-approved upgrade, use stable Pengaturan → Tampilkan ekspor data lama, copy the JSON text. In native Pengaturan → Impor JSON dari clipboard, or save that JSON and use the document picker. Native reloads imported caches and notification/reminder preferences; corrupt records are reported and do not erase existing data. Repeat imports preserve newer native caches.

The exporter is read-only and the only legacy UI change in this stage. It is not a production distribution switch. Actual same-signer upgrade on a physical device has NOT_RUN status; this stage performs deterministic export/import and restart tests. Clipboard/document transfer is explicit; automatic LevelDB recovery is not claimed.
