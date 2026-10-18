# Stage 4B — signed owner candidate verification

Verified on 2026-10-18 UTC / 2026-10-19 WIT. Candidate preparation and signed artifact validation PASS. Stop for owner phone testing; no stable promotion is authorized or performed.

## Source and checkpoints

- MAIN_BEFORE: `28a0bfe458574322e0c4f853199135fa56d00d2d`.
- Clean existing native workspace was recovered intact; no local unpushed commit or native project was discarded. Stage 4A was already implemented and was not scaffolded again.
- Implementation commits: `9ba7a31c22221c427dfb942986eba5a0cd36f9f2`, `7fa5e9e6bd8b6edb6063d05c01656f5c1ff8e717`, `b428fb408a24a17564ae7026421fecb9fe333833`, `411aa6f8e99bdb1bcc6e8e290ed2588e9e20888a`, `cac5ef7fc690584d538383aa7c5ec8b5614206b2`.
- CANDIDATE_SOURCE_SHA: `cac5ef7fc690584d538383aa7c5ec8b5614206b2`. Source belongs to main and all prerequisite gates passed on this exact SHA.
- Workflow dispatch head: `46566ded080e59d0a519b4a24d575f7c4eb5c0bd`; its only change after the source is automated `public/data/live-draw.json`. The APK embeds the selected source, not the later dispatch head.
- Version reservation commit: `f0b3f5eca5cb5b37f8630c2a7f6de163208a81cb`; durable ledger reserves legacy 100144 then native 100145, above prior reservation 100143 and historical artifact 100141. Owner installed version remains unknown.
- First run 39173341097 passed signing but is superseded. Do not use builds 100142/100143: the final source adds a tested file exporter for the measured 2,236,069-byte legacy backup.
- Native project: `android-native/`. ApplicationId `com.adipredictor.app`; label AdiPredictor; native ComponentActivity/Compose verified in actual DEX. No web main UI assets in native APK.

## Completed CI

| Check | Result | Run |
| --- | --- | --- |
| Android Native Validation | PASS: 33 data + 8 Compose UI + 3 large-file SAF tests; zero failures/errors/skips; unsigned release compile PASS | https://github.com/trinityzanetamanu-code/AdiPredictor/actions/runs/39174147201 |
| Code Validation | PASS: 124 Python, 96 JavaScript, web build and 3 controlled browser checks | https://github.com/trinityzanetamanu-code/AdiPredictor/actions/runs/39174147204 |
| Kotlin Engine Parity | PASS | https://github.com/trinityzanetamanu-code/AdiPredictor/actions/runs/39174147195 |
| Kotlin Production Lifecycle | PASS | https://github.com/trinityzanetamanu-code/AdiPredictor/actions/runs/39174147175 |
| Signed Native Release Candidate | PASS: native tests, lint, native + legacy signed releases, actual APK checks, cleanup, protected-input comparison and both uploads | https://github.com/trinityzanetamanu-code/AdiPredictor/actions/runs/39175394749 |
| Auto Result Collector | Existing HK source HTTP 403; ENGINE_EXIT=0, separate source failure, not a native/engine failure | https://github.com/trinityzanetamanu-code/AdiPredictor/actions/runs/39174147265 |

Lint: 0 errors, 13 warnings, no suppression/baseline or severity relaxation. Controlled UI evidence: 13 PNGs in native-validation artifact 12153667866 (phone, 2× font, selected history/original SVG, markets/search/statistics/settings). Screenshots are Robolectric rendering; no emulator/physical PASS is inferred. Signed workflow additionally has nonblocking action deprecation/runner/cache notices.

## Actual signed APKs

| Field | Native candidate | Separate legacy export intermediary |
| --- | --- | --- |
| Filename | `AdiPredictor-build100145-native-release-candidate.apk` | `AdiPredictor-build100144-legacy-export-release-candidate.apk` |
| Bytes | 9,280,930 | 5,670,526 |
| versionCode | 100145 | 100144 |
| versionName | `2.0.0-native-rc100145` | `2.0.0-legacy-export-rc100144` |
| Channel | release-candidate | release-candidate |
| Debuggable | false | false |
| minSdk | 26 / Android 8.0 | 22 / Android 5.1 |
| ABIs | arm64-v8a, armeabi-v7a, x86, x86_64 | universal, no native libraries |
| Artifact ID | 12154008220 | 12154521489 |
| APK SHA-256 | `09e7c76b398a36c28218cabd8defa2cce9b9fae69e487fa503d8f8d77c98bec5` | `f0e8ee97a0a92a97b496173fc709cc9fd67ea2a58ed3c799f9f5940cedcd84ec` |

Both certificates: `58b36eaa357b65483d1adcc67321305b799f3b3283ad3ad7e13457cf96b8deb5`. EXPECTED_CERTIFICATE_MATCH=true: runner keytool matched protected expected fingerprint/current stable public metadata before build; apksigner verified each actual APK. Downloaded ZIP digests were checked against GitHub, then local official build-tools 35.0.0 independently verified the extracted APKs and reproduced both complete CI metadata reports exactly. APK file hash differs from the artifact ZIP hash.

Existing stable APK 100010 was independently verified with the same public certificate. No signing secret was downloaded/read locally, no replacement key was generated, no signing files occur in APKs. Temporary signing material cleanup PASS. Protected environment remains `android-release` with existing configuration.

## Migration, data and UI results

- LEGACY_EXPORT_AVAILABILITY: delivered separately as build 100144. Actual stable 100010 and historical debug 100141 lack the exporter. Intermediary preserves applicationId, Capacitor 6.2.2 and storage origin. Same-current-stable signing is proven; compatibility with unknown older/debug signer is not proven.
- SAF saves allowlisted localStorage JSON through Android's document picker and content stream; multi-MB data stays out of Intent extras/saved-state. Real 2+ MB writer-to-native importer, cancellation, invalid URI, I/O failure and zero preservation tests PASS. Do not clear/uninstall either app to migrate.
- MIGRATION_TEST_RESULTS: 7 LegacyMigrationTest + 3 LegacyExportDocumentTest PASS, plus JavaScript/configurator guards. Three-market full-cache import and restart align MATCH; corrupt/wrong-market data rejected, newer native canonical/revision retained, imported HK runtime survives restart, same-draw runtime conflict recorded, existing native notification claims survive bounded import.
- DATA_SYNC_AND_REVISION_RESULT: controlled HK/SDY/SGP offline/timeout/403, same-page refresh, overlap exclusion, fingerprint/full revision/basis and leading-zero checks PASS. No backtest is moved to the main thread. Canonical and observations remain separate; HK canonical success is not claimed.
- HISTORY_AND_SVG_RESULT: controlled v1/v2 identity, selected original SVG, copy/model/consensus/outcome audit PASS. Code browser check validated original 36 SVGs across markets. Original SVG assets and archives unchanged.
- NOTIFICATION_RESULT: persistent preference/dedup/claim import and controlled delivery/deep-link/cancellation/restoration PASS. Real OS alarm/permission behavior remains untested.
- ICON_STATUS: adaptive launcher uses existing emerald/slate Zap identity; actual release launcher resolves. Physical launcher appearance NOT_TESTED.
- Feature matrix remains [feature-migration.md](feature-migration.md); [phone-only owner guide](owner-rc-test.md) gives installation/export/import and page checks. The legacy intermediary intentionally retains Capacitor; native main UI is Compose.

## Boundaries and remaining work

`DEVICE_UPGRADE_STATUS=NOT_TESTED`.
`EMULATOR_TEST_STATUS=NOT_TESTED` (no local /dev/kvm).
`PHYSICAL_DEVICE_TEST_STATUS=NOT_TESTED`.
`STABLE_METADATA_CHANGED=NO`.
`STABLE_DISTRIBUTION_SWITCHED=NO`.
`UPDATE_CHANNEL_READY=false`.

597 protected production inputs have identical before/after aggregate SHA-256 `7675c520375ec9b6d99037fdf9c3e2107e97151df29c0f61644d44b698cc3a24`; changed list empty. Stable metadata/workflow/configurator, engine/P1–P8/P5, collector/publisher, original data/history/SVG are not edited by candidate packaging. Normal automatic collector commits on main are separate. No release/tag/stable publication, branch, PR or force push.

Historical `legacy_signing_key_recoverable=false` and `one_time_reinstall_required=true` remain unchanged as history, not installation advice. Owner must stop/report the installer message if upgrade is rejected, without uninstall or clearing data. Native API 26 means Android 5.1–7.1 cannot install this candidate.

BLOCKERS: no remaining build/signing/source-CI blocker. Actual owner installed version/signer and physical upgrade/export/import/notifier behavior remain unknown; HK source 403 persists independently. REMAINING_WORK: owner phone test/review only, followed by separately authorized decisions. No stable distribution or next implementation stage is started.
