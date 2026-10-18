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

The shipped stable build 100010 (8434ef3) does **not** contain this exporter; it was introduced later in checkpoint 3e995c8. Do not infer installed availability from current source. Stage 4B prepares a separate same-current-stable-signer Capacitor export intermediary with a lower reserved versionCode than the paired native RC. If the installed signer differs, stop on Android's install rejection; do not uninstall or clear data.

Before native installation, use the exporter-capable legacy app's Pengaturan → Tampilkan ekspor data lama, copy the JSON text and save it outside the app. Use the candidate-only native SAF exporter (Simpan JSON ke file) for full backups: the six actual canonical/prediction caches serialize to more than 2 MB. The Android picker receives only small filename/MIME extras, never the payload. The payload is removed from Capacitor pending-call state before launching the picker. File writing runs on the bridge worker, reports success only after close, and retains all legacy data on cancellation, process interruption or I/O failure. Clipboard/text remains available for inspection and small exports. In native Pengaturan → Impor JSON dari clipboard, or save that JSON and use the document picker. Native reloads imported caches and notification/reminder preferences; corrupt records are reported and do not erase existing data. Repeat imports preserve newer native caches. Android notification permission must still be checked separately after upgrade.

The exporter is read-only. It is not a production distribution switch. Actual native upgrade on a physical device has NOT_TESTED status; unit and controlled UI tests do not establish device migration. Clipboard/document transfer is explicit; automatic LevelDB recovery is not claimed. See owner-rc-test.md for the phone-only sequence and stage4b-packaging.md for the baseline audit.
