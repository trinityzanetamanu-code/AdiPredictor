# AdiPredictor native — Stage 4A checkpoints

Separate Kotlin/Compose application, `com.adipredictor.app`. Production calculations still run in the existing Kotlin publisher. This client reads its wire payloads; it never recalculates backtests. React/Capacitor remains the stable distribution and rollback. Release builds in this project have no signing configuration.

Requirements: JDK 17, Android SDK platform 35 and build tools 35.0.0. AGP 8.7.3, Kotlin/Compose compiler 2.0.21, Gradle 8.10.2 with checksum pinned. SDK location is local `ANDROID_HOME` or an ignored `local.properties`.

From repository root:

```sh
./android-native/gradlew -p android-native :data:test :app:testReleaseUnitTest
./android-native/gradlew -p android-native :app:lintRelease :app:assembleRelease
```

`app-release-unsigned.apk` is compile evidence, not an installable owner build. No signing keys, release publishing, stable switch or debug APK delivery is part of this stage.

Recovery baseline: c97961a908a912e6662c41050b0734343f930d1c. Available scratch checkout was clean at local 478c192 (Stage 3A). Searches found no native project or recoverable Stage 4A artifact. The local commit was preserved while upstream Stage 3B was integrated, and obsolete local validation edits were replaced with current upstream source. No reset/clean was used.

Checkpoint A: data module and Compose application compile. Screens are implemented but their behavior/UI verification remains in progress. Do not interpret checkpoint A as Stage 4A completion.

Checkpoint B: all pages/actions, direct runtime boards, selected-target audit/SVG, reminder scheduling and explicit legacy export/import are implemented. Release compilation and 23 data/contract tests pass. Controlled Android UI tests are being debugged; lint/release/CI need final re-verification. This checkpoint is not Stage 4A completion.

Architecture: `data` is a pure JVM wire/cache/identity/migration/notification-policy module; `app` supplies HTTP, persistent SharedPreferences, lifecycle/ViewModel, notification delivery, and native Compose screens. SVG is parsed from the selected archive's original markup on a worker and drawn natively with AndroidSVG. Only canonical whole-dataset validation may authorize latest prediction display. Runtime boards remain separate observations.

Legacy storage migration is explicit JSON import, not assumed automatic. Original Capacitor preferences/cache stay intact; native does not read LevelDB or delete app data. Recovery and verification details will be recorded in `docs/` as checks complete.
