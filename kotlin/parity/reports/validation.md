# Tahap 3A local validation

Baseline / frozen parity inputs:
`d22097ffc4772d0436b4deb9bb647a82c77ffed1`.

| Check | Result |
|---|---|
| Gradle wrapper build, core and CLI | PASS |
| Kotlin regression tests | 12 passed, 0 failed, 0 skipped |
| Live full Python ↔ Kotlin comparison | PASS, 12 cases, 120 file checks, 0 mismatches |
| SVG output | 72/72 structurally and byte identical |
| Original-Python fixture regeneration | Byte identical to tracked fast fixture |
| Python suite (`python -m pytest -q`) | 110 passed |
| JavaScript/LiveDraw (`npm run test:live`) | 93 passed |
| Web (`npm run build`) | PASS |
| Controlled foreground synchronization | PASS |
| Controlled HK diagnostic DOM | PASS |
| History/SVG at controlled Android viewport | PASS |
| Production dataset/archive/asset hashing | 444 files unchanged before/after |
| Fresh-output, direct-public, symlink-public guards | All rejected correctly |
| Duplicate/conflicting datasets, invalid and short loader input | Python/Kotlin rejection agreement |
| Signed release guards | Included in unchanged full Python suite; no release run |

Commands, runtime measurements, hashes, JSON paths and Python→Kotlin coverage are
in `kotlin/README.md`, `report.json`, `report.md`, and `kotlin/docs/coverage.md`.
The documented root Gradle `:cli:run` shadow command was executed successfully.

The real HK 30 September tie is `0094` / `9094`, both score `1.707421`, ordered
exactly by the existing rules. The SGP 10 October P5 model gate is enabled
(`hybrid`), with no confirmed per-SVG edge; each follows its own backtest and
matches native Python. An obsolete opposite Boolean assertion was corrected in
the harness without changing either engine's prediction formulas.

Local Python is CPython 3.11.17. Build/test JDK is 17.0.16+8; CLI measurement JVM
is OpenJDK 17.0.20. The browser checks used Chromium 133 after the environment's
Playwright browser download failed; CI keeps the original Playwright install.
Browser checks are controlled rehearsals, not physical-device or real-source
tests. HK HTTP 403 was not investigated or changed.

Production Python/React/collector/publisher/signing/secrets/applicationId remain
unchanged. All shadow output went into fresh isolated directories. No branch,
PR, force push, paito, debug APK or signed release was introduced.
