# AdiPredictor

AdiPredictor is a mobile-first React/Vite application with a Capacitor Android shell and a Python data pipeline for HK, SDY, and SGP. It stores verified results in `public/data/*.json` and publishes reproducible prediction payloads to `public/predictions/<market>/latest.json` plus immutable target archives.

Historical analysis does not guarantee a future result. Confidence and stars are relative model/backtest measures, not win probabilities.

## Architecture

- `scripts/collector.py` collects and validates new results from the configured sources.
- `scripts/historical_backfill.py` maintains cross-checked historical archives.
- `scripts/prediction_engine.py` validates each dataset and generates schema-v2 P1-P8 output.
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

The player never proxies video, strips CSP/frame policy, bypasses access controls, or invents a live feed. Singapore LIVE badges follow the published 18:30 Singapore draw schedules (4D Wednesday/Saturday/Sunday and TOTO Monday/Thursday), with upcoming/result-posted states outside the live window.

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

The Android application ID is permanently `com.adipredictor.app`. The CI workflow generates the Capacitor Android project and applies:

- `versionName`: package version plus CI build code, for example `2.0.0+build.100123`.
- `versionCode`: `100000 + github.run_number`, which increases monotonically for this workflow.
- artifact name: `AdiPredictor-v<package-version>-build<versionCode>.apk`.

Stable release signing uses only GitHub Actions secrets:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

The keystore is decoded into the runner temporary directory, never committed, and removed after the build. When any signing secret is unavailable (including untrusted pull requests), CI compiles and labels a debug APK for build verification instead of pretending it is release-signed.

Android can update an installed app in place only when the application ID and signing certificate match and the new version code is higher. Historical workflow builds used a runner-generated debug key and this repository contains neither that private key nor an old APK certificate. If that legacy key cannot be recovered outside the repository, one uninstall/reinstall is required to migrate to the stable release certificate. After that migration, retaining the same GitHub release keystore enables future in-place updates and preserves app data.

## Commands

```bash
python -m pip install pytest requests beautifulsoup4
python -m pytest -q

python scripts/prediction_engine.py --market HK
python scripts/prediction_engine.py --market ALL
python scripts/prediction_engine.py --force --market ALL

npm install
npm run test:live
npm run build

# Local Android compilation check; release signing remains a CI-secret operation.
npx cap add android
npx cap copy android
ANDROID_VERSION_CODE=100001 ANDROID_VERSION_NAME=2.0.0+build.100001 node scripts/configure_android_release.mjs
cd android && ./gradlew assembleDebug
```

The prediction JSON includes dataset validation, prior-prediction audit, P1-P7 Top-K and walk-forward results, frozen P8 with fingerprint, raw and reliability-weighted consensus, visual metadata, final candidates, confidence, candidate counts, and a UI-aligned Quick View.
