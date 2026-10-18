# Stage 4A recovery and validation — 18 October 2026

## Recovery

`MAIN_BEFORE=f9a413cf2ae84b5f347cbe01313b1d7fc670dc85`.
The earlier scratch checkout is not present in the available workspace. A search of available workspace paths and saved checkpoint titles found no recoverable local native project. Current `main`, however, already contains checkpoint A (`031e517`) and checkpoint B (`3e995c8`). These were recovered by cloning existing main; no scaffold was recreated, no local work was deleted, and no branch or PR was created.

`LOCAL_COMMITS_NOT_PUSHED=0` at recovery. Checkpoint B's 23 passing JVM tests and partial screenshots were independently recovered from native CI run 38308701572. That run timed out in Android UI tests; it was not a successful native validation.

`IMPLEMENTATION_CHECKPOINT=b50d2ab8f8dd7cda24a009cb41f777f223eae0a4` stores cache, migration, concurrent notification-claim and consumed-route guards. That checkpoint explicitly leaves UI/lint/release validation pending.

## Changes being validated

- Preserve per-page/per-market input and scroll state when switching screens; retain restored navigation after consuming a deep link.
- Consume incoming notification routes without replacing the Activity launch identity. ActivityScenario had spun while waiting for recreation after the launch intent changed; a thread dump localized this to the test lifecycle, not the prediction engine. The targeted double-recreation/deep-link/back test now passes.
- Read document imports on the IO dispatcher; reject caches for the wrong market and retain newer native runtime observations after legacy import.
- Use a concurrent retained cache and one cross-instance notification delivery lock; choose a dataset head by actual maximum draw date rather than array position.
- Display original schema-v1 string candidates as well as schema-v2 candidate objects, with original leading zeros and copy actions. Use the v1 original latest-result basis when newer basis fields do not exist.
- Show each selected archive's original SVG before expandable pattern diagnostics, fit the available phone width at 1× with horizontal panning on zoom, and report parsing failures explicitly.
- Separate data tests, controlled Android UI tests, and lint/unsigned build in CI. Bound the Gradle test task without moving Robolectric tests away from their main looper.

## Verification

Local native validation: PASS — 26 JVM data/contract tests and 8 controlled Android UI tests, 0 failures/skips; lint 0 errors and 4 warnings; unsigned release compilation passed. The owner-facing completion report must additionally identify and inspect the native CI run on the final implementation commit containing these changes.

- JVM data/contract tests: 26 passed, 0 failed.
- Controlled Android UI tests: 8 passed, 0 failed (phone layout plus 2× font scale, all markets, same-page refresh, search/statistics, state restoration, v1/v2 history, original SVG, copy, notifications/deep links).
- Lint: 0 errors; 4 warnings: two pinned lifecycle dependency update notices, backup XML recommendation, and missing preview application icon. No suppression or baseline was added.
- Build: `:app:assembleRelease`, no signing configuration; unsigned artifact is compile evidence only.
- Legacy JavaScript tests: 94 passed, 0 failed.
- Python regression suite: 110 passed, 0 failed.
- Web production build: passed.
- Protected production inputs: all 583 tracked files unchanged (datasets/SVGs, engine, collector, publisher and stable release workflow).
- Local browser rehearsals: blocked by Chromium `socket() failed: Operation not permitted`; no browser/device pass is inferred.
- Emulator: NOT_RUN; local `/dev/kvm` unavailable.
- Physical Android device / real same-signer upgrade: NOT_RUN.

Native CI publishes test reports and screenshots under `native-validation-<commit SHA>`. Screenshots are controlled Robolectric rendering, not emulator or physical-device screenshots.

## Production boundaries

`NATIVE_PROJECT_PATH=android-native/`; applicationId remains `com.adipredictor.app`, label `AdiPredictor`. The client consumes the existing production Kotlin payloads and never recalculates backtests on the UI thread. Python oracle, React/Capacitor, collector and production publisher remain available and unchanged.

`STABLE_DISTRIBUTION_SWITCHED=NO`. No signing secret was read; no signed release, debug APK delivery or release publication is part of this work. An unsigned release APK is compile evidence only.

The pre-existing collector failure at run 39116388761 reports `SOURCE_EXIT=1`, `ENGINE_EXIT=0`, and successful data publication. This is separate from native validation and does not certify HK canonical access. Collector changes are outside Stage 4A.

Legacy data transfer remains explicit read-only export plus native JSON import. It does not assume Chromium localStorage is native SharedPreferences, does not erase either store, and does not require uninstall. Deterministic migration/restart tests are distinct from an actual device upgrade.

## Result fields and review boundary

| Field | Result |
| --- | --- |
| RECOVERED_LOCAL_WORK | No earlier local checkout; existing remote A/B checkpoints recovered intact |
| NATIVE_PROJECT_PATH | `android-native/` |
| FEATURE_MIGRATION_MATRIX | [feature-migration.md](feature-migration.md) — source implementation and tested limits per page |
| DATA_SYNC_AND_REVISION_RESULT | PASS controlled: HK/SDY/SGP full dataset revision/fingerprint/basis, zero preservation, overlap exclusion, timeout/403/offline/restart, stale-cache rejection and runtime separation |
| HISTORY_AND_SVG_RESULT | PASS controlled: real archive identities, original v1 string candidates/copy, selected v2 SVG, original SVG bytes across offline restart |
| NOTIFICATION_RESULT | PASS controlled: preferences, cross-instance claims, persistent dedup, Android notification deep link and reminder cancellation; real OS delivery/permission prompt NOT_RUN |
| LEGACY_DATA_MIGRATION_STATUS | Explicit export/import and restart guards PASS; wrong market/corrupt data rejected, newer cache retained; physical same-signer upgrade NOT_RUN |
| NATIVE_BUILD_RESULT | PASS unsigned release compile; no owner-installable signed APK produced |
| NATIVE_TEST_RESULTS | 26 JVM + 8 controlled Android UI tests PASS; not emulator/device evidence |
| LINT_RESULT | PASS, 0 errors / 4 warnings |
| UI_EVIDENCE | `app/build/reports/ui/*.png` in the native CI report artifact; original SVG and v1 candidate screenshots visually inspected |
| EMULATOR_TEST_STATUS | NOT_RUN, `/dev/kvm` unavailable locally |
| PHYSICAL_DEVICE_TEST_STATUS | NOT_RUN, no attached physical Android device |
| EXISTING_CI_RESULTS | Local Python 110, JS 94 and web build PASS; inspect Code Validation / Kotlin Engine Parity / Kotlin Production Lifecycle on the final implementation SHA. Collector source failure is separately documented above. |
| STABLE_DISTRIBUTION_SWITCHED | NO |
| BLOCKERS | No source/build blocker after native checks; emulator/physical validation unavailable in this environment. HK canonical verification remains unclaimed. |
| REMAINING_WORK | Owner review; later device and same-signer migration verification before any separately authorized signed build/distribution switch. No next stage started. |

No tests were removed or weakened, and lint severity/production inputs were not relaxed. Controlled UI fixtures establish a known route and preserve a real v1 archive even when it ages out of the live 30-draw index. They seed only startup caches; archives/SVG are fetched through the controlled transport rather than copying every historical archive into SharedPreferences on every test.

## Files changed from recovery baseline

- `.github/workflows/android-native-validation.yml`
- `android-native/README.md`
- `android-native/app/build.gradle.kts`
- `android-native/app/src/main/java/com/adipredictor/app/AppViewModel.kt`
- `android-native/app/src/main/java/com/adipredictor/app/MainActivity.kt`
- `android-native/app/src/main/java/com/adipredictor/app/Screens.kt`
- `android-native/app/src/test/java/com/adipredictor/app/NativeUiTest.kt`
- `android-native/data/src/main/kotlin/com/adipredictor/data/Contracts.kt`
- `android-native/data/src/main/kotlin/com/adipredictor/data/Preferences.kt`
- `android-native/data/src/main/kotlin/com/adipredictor/data/Repository.kt`
- `android-native/data/src/test/kotlin/com/adipredictor/data/DataTest.kt`
- `android-native/docs/feature-migration.md`
- `android-native/docs/validation-2026-10-18.md`

## Continuation on 19 October 2026

The workspace retained the native sources, unsigned build and XML/UI reports, but temporary SDK/build-tool downloads and shell logs were no longer present. Preserved reports independently show 26 JVM tests and 8 Android UI tests, with zero failures/errors/skips, plus lint with 0 errors/4 warnings. The latest unsigned release build had passed and `apksigner verify` reported `DOES NOT VERIFY / Missing META-INF/MANIFEST.MF` as expected for the unsigned artifact.

`RESUME_MAIN_BEFORE=efbb796a45d1c85cc6f9ea32d77e05206288beee`. Between checkpoint b50d2ab and this continuation, the existing collector advanced main through data-only commits. Those 24 public data/prediction file updates were integrated fast-forward and are not native implementation changes. Native CI must validate the final source against those newer datasets. The 583-file unchanged-input result above describes the first local validation baseline; CI captures and compares its own current production inputs.

A local incremental ART-profile packaging task once failed with `Failed requirement`; rerunning `:app:compileReleaseArtProfile` with unchanged source succeeded, followed by a successful `:app:assembleRelease`. No ART-profile setting, test or lint gate was disabled. A fresh native CI build is the final remote compile check.
