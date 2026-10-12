# AdiPredictor

AdiPredictor is a mobile-first React/Vite application with a Capacitor Android shell, Python collectors, and an independent Kotlin/JVM prediction pipeline for HK, SDY, and SGP. It stores verified results in `public/data/*.json` and publishes reproducible prediction payloads to `public/predictions/<market>/latest.json` plus immutable target archives.

Historical analysis does not guarantee a future result. Confidence and stars are relative model/backtest measures, not win probabilities.

## Architecture

- `scripts/collector.py` collects and validates new results from the configured sources.
- `scripts/historical_backfill.py` maintains cross-checked historical archives.
- `kotlin/core` independently computes unchanged P1–P8; `kotlin/production` stages and validates schema-v2 predictions, archives, history, SVG and status.
- `scripts/run_prediction_engine.sh` selects the controlled backend (repository default Kotlin); `scripts/prediction_engine.py` remains the unchanged Python oracle and explicit rollback.
- `scripts/publish_generated_data.sh` owns disposable-Actions synchronization, source/binary identity checks, collector failure propagation and ordinary push retry.
- `src/` is the React/Vite UI; it loads fresh public JSON and SVG assets remotely with cache busting, so data updates do not require reinstalling the APK.
- `public/predictions/<market>/history.json` is a generated newest-first index of immutable target archives for the in-app Prediction History view.
- `.github/workflows/auto-scraper.yml` performs the atomic result-to-prediction update.

SGP follows the configured Monday/Wednesday/Thursday/Saturday/Sunday schedule. HK and SDY are daily. Existing source and period anchors remain controlled by `config/collector_sources.json`.

## P1-P8 methodology

P1-P7 are data models and always expose BBFS6, BBFS5, 4D Top 3, 3D front/back Top 5, and 2D front/middle/back Top 5:

- P1: historical, positional, yearly, pair, and co-occurrence distributions.
- P2: separate 10/20/30/60/90-draw trend, acceleration, cooling, and relative gap evidence.
- P3: same-position and cross-position transitions, pairs, reverse pairs, rare pairs, and co-occurrence.
- P4: within-draw duplicate classes, repeat digits/positions, and conditional next-draw diagnostics.
- P5: visual-only, fallback, and hybrid analysis. Visual-only uses a 10% baseline and Wilson 95% interval. Its vote is zero when an edge is not confirmed.
- P6: ABCD/repeat structures, sums, unique digits, odd/even, small/big, extremes, and repeat counts.
- P7: lag 1/2/3/4/5/7/10/14/21/30 signals with sample sizes and Wilson intervals. A 0.85 reliability multiplier applies when cycle edge is not confirmed.
- P8: a deterministic intuition heuristic made only from the raw recent sequence. It is generated and fingerprinted before consensus and is excluded from statistical support, weights, and stars.

## Walk-forward and consensus

Expanding-window out-of-sample evaluation begins after 365 training records and uses every remaining historical target. Each P1-P7 model records Top 1/3/5 2D and 3D metrics, 4D main/Top 3, and BBFS5/6 digit and full-draw coverage.

Market-specific reliability weights normalize 2D Top 5, 3D Top 5, BBFS6 full coverage, BBFS5 full coverage, and 4D Top 3. Raw consensus counts exact model Top-K membership. Weighted consensus sums those model weights. No hidden per-position support is used.

Visual patterns are rendered as SVG from actual archive rows under `public/predictions/<market>/visuals/<target-date>/`. Every image carries its source period, occurrence count, historical rate, baseline, and edge status.

## Application views and refresh

The mobile navigation order is Analisis, Data, LiveDraw, Statistik, and Tafsir. LiveDraw embeds the public official Singapore Pools 4D/TOTO YouTube playlists, keeps official 4D/TOTO results separate from the cross-checked SGP composite market, and opens exact source pages through Capacitor Browser when embedding cannot be verified. HK is labelled `HongkongPools Market Source`, not an official Hong Kong lottery; SDY remains a cross-checked result monitor because no matching public broadcast has been verified. See `docs/live-source-investigation.md` for evidence and limitations.

The player never proxies video, strips CSP/frame policy, bypasses access controls, or invents a live feed. Singapore schedule badges show **DRAW WINDOW**, not a claim that the embedded playlist is actively broadcasting. Player readiness/playback is reported separately, and a collapsible diagnostics panel exposes the source mode/host, schedule state, player state, refresh/reload times, and non-secret errors.

`scripts/collector.py` also refreshes `public/data/singapore-official.json` from Singapore Pools' public 4D result archive and TOTO result page. The TOTO snapshot is preserved when its official page is between publication windows. This auxiliary official metadata never replaces or relabels the separate cross-checked SGP composite prediction dataset, and an unchanged result never creates a timestamp-only commit.

Prediction History reads `history.json` and archived Quick Views; it never recreates old predictions in the browser.

The UI distinguishes three timestamps:

- **Data collected at** comes from the collector payload.
- **Prediction generated at** comes from the matching prediction payload.
- **App last checked at** is the browser/app refresh time.

The installed APK checks remote public JSON and SVG files every 60 seconds and when the app regains focus. A data-only commit therefore remains visible without reinstalling the APK.

## Automatic update and archive rules

The collector and engine flow is:

`verified result → append/validate → previous audit → P1-P7 → walk-forward → freeze P8 → raw/weighted consensus → candidates/SVG → latest/archive/history index`

The engine hashes the market, ordered date/result pairs, and engine version. An unchanged fingerprint is skipped unless `--force` is supplied. Collector status is also preserved on no-change polling runs, preventing timestamp-only commits. A target archive is not rewritten after that target result is available; `history.json` is an index, not a replacement archive.

## Android identity, versioning, and signing

The Android application ID is permanently `com.adipredictor.app`. The protected release workflow generates the Capacitor Android project and applies:

- `versionName`: package version plus CI build code, for example `2.0.0+build.100123`.
- `versionCode`: the greatest of `100000 + github.run_number` and the last stable release code plus one. `ANDROID_LAST_RELEASE_VERSION_CODE` can pin the last distributed code if workflow history is migrated.
- verified stable artifact: `AdiPredictor-v<package-version>-build<versionCode>-stable.apk`.

Stable release signing uses only GitHub Actions secrets:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

Pull requests and main code changes use `.github/workflows/validation.yml`: full Python tests, JavaScript tests, web build, controlled foreground synchronization, diagnostic capture checks and Android viewport checks for prediction history/archived visual SVGs. It has read-only permissions, no signing secrets and no APK compilation or release publication. The former `Build Android Debug APK` workflow (`deploy.yml`) was removed in Stage 1B; historical runs/artifacts are retained.

Stable releases use the separate `.github/workflows/android-release.yml`. It is triggered only by `workflow_dispatch`, requires `confirm_release`, is restricted to `main`, and runs through the protected GitHub Environment `android-release`. The four keystore values are Environment secrets. `ANDROID_EXPECTED_CERT_SHA256` and `ANDROID_LAST_RELEASE_VERSION_CODE` are Environment variables.

The expected certificate fingerprint is mandatory for a stable build. The workflow normalizes case and colon formatting, verifies the signed APK with `apksigner`, and fails before publication if the actual signer differs. The version resolver uses the workflow run number, `public/app-release.json`, and `ANDROID_LAST_RELEASE_VERSION_CODE`, then requires the new stable versionCode to be strictly greater than every recorded previous stable code.

The keystore is decoded into the runner temporary directory only inside the protected release job, never committed, and removed after the build. Historical CI debug metadata has `UPDATE_CHANNEL_READY=false` and `RELEASE_SIGNING_RUNTIME_VERIFIED=false`; no workflow produces new debug APKs. Only a certificate-verified stable artifact has both values set to `true`; only that workflow can publish non-secret metadata to `public/app-release.json`.

Android can update an installed app in place only when the application ID and signing certificate match and the new version code is higher. Historical workflow builds used a runner-generated debug key and this repository contains neither that private key nor an old APK certificate. If that legacy key cannot be recovered outside the repository, one uninstall/reinstall is required to migrate to the stable release certificate. After that migration, retaining the same GitHub release keystore enables future in-place updates and preserves app data.

Exact Termux keystore-generation commands, GitHub Environment setup, and the required two-release update test are documented in [`docs/android-release-signing.md`](docs/android-release-signing.md).

## Commands

```bash
python -m pip install pytest requests beautifulsoup4
python -m pytest -q

./kotlin/gradlew -p kotlin --no-daemon test :cli:installDist :production:installDist
bash scripts/run_prediction_engine.sh --market ALL --simulate
# Deliberate generation; no automatic commit/push/notification.
bash scripts/run_prediction_engine.sh --market ALL

npm install
npm run test:live
npm run build

# Controlled browser validation (no APK).
npx playwright install chromium
node scripts/check_foreground_sync.mjs
node scripts/check_hk_diagnostic.mjs
node scripts/check_history_visuals.mjs
```

The prediction JSON includes dataset validation, prior-prediction audit, P1-P7 Top-K and walk-forward results, frozen P8 with fingerprint, raw and reliability-weighted consensus, visual metadata, final candidates, confidence, candidate counts, and a UI-aligned Quick View.

## Stage 1B HK evidence capture

Cloud source access and canonical acceptance remain separate gates. No production
finality rule is enabled without actual result evidence. The Android-only capture
kit and complete instructions are in [`docs/hk-android-diagnostic.md`](docs/hk-android-diagnostic.md).
Owner DOM captures are diagnostic evidence only; they never update canonical data.

Stage 2 removes the former Pola Paito viewer, grid/selection/zoom logic and its
CI capture job. Histori Prediksi, Pola Visual, original archived SVGs, outcome
audits and P5 remain available. Collector sources whose name or URL contains
`paito` remain because they supply historical draw data, independently of the viewer.

Rincian penghapusan, validasi dan referensi historis yang dipertahankan: [laporan Tahap 2](docs/stage2-paito-removal.md).

Stage 3B production/simulation/rollback commands and lifecycle safety evidence:
[kotlin/docs/production.md](kotlin/docs/production.md). Python collectors/backfill
and the React/Capacitor UI remain; no Android UI migration or debug APK workflow is introduced.
