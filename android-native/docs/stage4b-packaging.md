# Stage 4B package and migration audit

Baseline: `28a0bfe458574322e0c4f853199135fa56d00d2d`. Working tree was clean, safely fast-forwarded from `d0bc53e`; no AGENTS.md found. No native work was discarded.

- Current stable metadata: build 100010, source run 35737227153 at 8434ef374e6fc749c106923ece32a43c8a771399. Certificate SHA-256: `58b36eaa357b65483d1adcc67321305b799f3b3283ad3ad7e13457cf96b8deb5`.
- All 677 existing workflow runs were inventoried. No prior signed owner candidate was found. Latest historical debug artifact is build 100141, run 38083141293. Its code is included in the version floor; no signer compatibility is claimed.
- The existing stable workflow uses protected `android-release`, four ANDROID signing secrets and the **environment variable** `ANDROID_EXPECTED_CERT_SHA256`. It remains byte-for-byte unchanged. No signing values were read locally.
- `resolve_android_version.mjs` only takes stable/variable floor and workflow-local run number. It cannot reserve codes across workflows. The native RC uses a separate durable ledger, with atomic contents-SHA compare-and-swap on main, current artifact inventory, current stable, and optional installed owner code. Each run reserves legacy/native codes in order. Failed reservations/builds are not reused. Re-running only the signing job with a different attempt is rejected; re-run all jobs to reserve a fresh pair.
- Reservation commits use `[skip ci]` and change only the ledger. They do not change selected source SHA. Candidate prerequisite CI must have passed on the exact dispatched main commit. Automatic data-only updates without CI cannot accidentally qualify; select a verified implementation commit from main before dispatch.
- Before signing, keytool checks the existing key's public DER certificate against protected expected/stable metadata. No replacement key is generated. apksigner then verifies both APKs. APK reports include actual package, versions, debug flag, minSdk, ABIs, certificate, hashes, source, native DEX superclass/Compose and absence of web main UI/signing files.
- Native minSdk remains 26 (Android 8.0); legacy intermediary remains Capacitor minSdk 22. Devices on Android 5.1–7.1 cannot install native. This is disclosed, not silently raised.
- Launcher/adaptive icon uses the existing slate Lucide Zap on emerald from App.jsx. No unrelated icon or redesign.
- Installed native BuildConfig identity separates release-candidate/source/UPDATE_CHANNEL_READY=false from remote stable metadata. Public `app-release.json` is never rewritten by the candidate.

## Legacy export availability

The current exporter was introduced in checkpoint `3e995c8`, after the shipped stable and historical debug baselines. `git show 8434ef3:src/App.jsx` has no exporter. Therefore source presence does **not** establish installed availability. The candidate workflow builds a separately named, same-current-stable-signer Capacitor intermediary from the reviewed source, retaining the original applicationId and WebView origin. It adds a download convenience action alongside the already available text-copy fallback. Then the higher-code native APK imports explicitly through clipboard/document picker. No Chromium DB recovery, uninstall or data clearing is required or recommended.

The historical metadata `legacy_signing_key_recoverable=false` and `one_time_reinstall_required=true` remains intact as history. APKs with a different legacy/debug signer cannot be claimed upgradeable. Owner installed signer/version are unknown. **DEVICE_UPGRADE_STATUS=NOT_TESTED; PHYSICAL_DEVICE_TEST_STATUS=NOT_TESTED.** Existing earlier stable-to-stable device evidence in signing docs does not establish native upgrade success.

No backend, engine formula, P5 gate, publisher, collector, datasets, histories or original SVGs are changed. Paito remains removed. HK canonical source 403 is independent of packaging and remains unresolved. Native LiveDraw external browser/YouTube navigation is retained. Follow [owner test instructions](owner-rc-test.md); signed APKs/CI conclusions must be recorded from actual completed runs.
