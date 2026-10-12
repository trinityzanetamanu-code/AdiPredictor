# Tahap 3A — independent Kotlin shadow engine

The production engine is **Python, unchanged**. This project is an isolated JVM
comparison implementation; it does not connect to collectors, publish predictions,
send notifications, build Android/APKs or change signing. Stop here for owner review.

## Reproduce from the repository root

Prerequisites: a complete JDK 17 (CI: Temurin 17.0.16+8), CPython 3.11, Git, and
network access for the first Gradle dependency download. No Python dependencies are
needed for parity. Kotlin 2.1.20, Gradle 8.10.2 (wrapper ZIP checksum), Gson 2.11.0
(CLI/test only) and JUnit 5.11.4 use explicit versions. The core uses only the Kotlin
standard library and JDK APIs, with no JSON codec, filesystem, network or platform
context dependency.

Compile and run Kotlin tests:

```sh
./kotlin/gradlew -p kotlin --no-daemon test :cli:installDist
```

Calculate HK shadow from explicit current inputs, archives and previous prediction:

```sh
./kotlin/gradlew -p kotlin --no-daemon :cli:run --args="shadow --market HK --input ../public/data/hk.json --config ../config/collector_sources.json --previous ../public/predictions/hk/latest.json --archives ../public/predictions/hk/archive --clock 2026-10-12T12:00:00+07:00 --output ../kotlin/parity-runs/hk-shadow-01"
```

Gradle `:cli:run` uses working directory `kotlin/`; its paths above are relative
to that directory. The installed CLI uses the caller's current directory.
Always use a **fresh** destination. Existing directories/files and destinations
under a `public` path (including symlinks) are rejected. There is no implicit
production output. The CLI writes `prediction.json`, `model-matrices.json`,
`runtime.json`, optional `history-index.json`, and SVGs under the fresh shadow
directory's own `public/predictions/...`. Batch requests can additionally supply
actual result/date/period to produce detailed outcome audits and history records.

Compile, test and compare the entire engine directly:

```sh
./kotlin/gradlew -p kotlin --no-daemon test :cli:installDist && python3.11 kotlin/parity/compare.py --output kotlin/parity-runs/full-01
```

Fast development comparison (does **not** establish full parity):

```sh
./kotlin/gradlew -p kotlin --no-daemon :cli:installDist && python3.11 kotlin/parity/compare.py --quick --output kotlin/parity-runs/quick-01
```

Generate a fresh fast-test fixture directly from original Python:

```sh
python3.11 kotlin/parity/generate_fixture.py --output kotlin/parity-runs/regenerated-hk-380.json
```

The tracked fixture is not a calculation input to Kotlin. Only regression tests
read expected values. Every full harness run recomputes Python and Kotlin live.

## Inputs and coverage

`parity/fixtures/manifest.json` freezes the Python engine, config, all three complete
datasets, previous predictions and every archive at
`d22097ffc4772d0436b4deb9bb647a82c77ffed1`. Each file is read with `git show` and
verified against SHA-256, independent of a collector advancing remote main. CI
checks out full Git history. If the current Python engine changes, comparison
fails until the manifest and oracle fixture are deliberately reviewed/regenerated.

The same explicit archives and previous predictions enter both engines; inputs
are hashed again after cutoff materialization. Clock is injected at
`2026-10-12T12:00:00+07:00`; Python's `PRED_DIR` and `ROOT` are redirected into the
run's temporary output, never production. Only the isolated history-index writer
is exercised; the production publisher and `run()` are never invoked.

Full cases: HK/SDY/SGP latest basis 11 October 2026; two historical cutoffs per
market, 30 September and 10 October; a real archived HK consensus tie; identical
HK recalculation; and a 380-row dataset with basis result `0000`. Training stops
at the basis date, strictly before target results. Actual results are supplied
only to post-computation audits. Probes cover missing/empty/null normalization,
Unicode decimal digits, leading zeros, invalid numbers, duplicate/conflicting
dates, short loaders, SGP weekdays, month/year transitions, period increment,
rounding, star thresholds, P8 determinism and legacy archive audit behavior.

See [coverage.md](docs/coverage.md) for every Python function's Kotlin mapping.
Prediction/backtest/audit/history/visual calculations are in `core`; clock and
archive reads and fresh output writes are in `cli`. Production-only overwrite,
skip, collector, status and publisher policies remain in Python and are not
activated in the adapter. Existing schema, engine version and metadata revision
are retained as compatibility contracts, not as claims that Kotlin is production.

## Numeric and visual contracts

* All draw and candidate numbers remain strings. Sorted numeric candidates use
  lexicographic order, preserving leading zeros.
* Python `Counter.most_common` insertion order is reproduced with ordered counters
  and stable sorting. Digit ties use ascending digit; model ties retain the exact
  original rules (including greatest model name for 4D alternative).
* `rnd` rounds the exact binary double using `BigDecimal(double)` and HALF_EVEN to
  six decimals, including signed zero. `statistics.mean` is reproduced by an
  exact binary-value sum and one final division. Other sums are left-to-right,
  matching **CPython 3.11** (3.12 changed float summation; the harness rejects it).
* Integer counts/division and Monday=0 weekday semantics match Python. The clock
  is converted to Asia/Jakarta with second precision.
* Fingerprint and revision use identical UTF-8 material and unchanged
  `AdiPredictor-P1-P8-v2`. P8's hash uses sorted-key compact CPython JSON, ASCII
  escaping and JSON Boolean literals; P8 is frozen before consensus and excluded
  from voting.
* Published JSON numbers, weights, rates, candidates, ranking, counts, stars,
  confidence, fingerprints and gate decisions compare **exactly**, with no float
  tolerance. Only unpublished model matrices permit absolute error **1e-13** for
  platform libm/log floating-point differences. This is below six-decimal output
  resolution and cannot excuse any ranking or published mismatch.
* SVG XML tag/attribute order-independent structure, child/path order,
  coordinates, colors, digits, labels and pattern information compare exactly.
  Byte equality is also recorded. P5's model visual gate and per-SVG backtest
  remain separate. The SGP 10 October regression validates each gate against its
  own backtest and the original Python output; at the frozen SHA the model gate
  is **true** and any-SVG edge is **false**. No stale Boolean expectation overrides
  the engine's measured evidence.

## Reports and safety

`report.json` contains JSON-path mismatches, every input hash, clock, cases,
runtimes, output containment checks, P5 evidence and production-file proof.
`report.md` presents timings. `public-before.json` / `public-after.json` cover
**all** datasets, predictions, archives and assets under repository `public`.
Any unexpected mismatch or production change gives a nonzero exit status.
JVM cold start / warmup and host load affect timings; these are single-run compute
wall times on identical inputs, not an accuracy claim or general benchmark.

The separate **Kotlin Engine Parity** workflow runs `kotlin-parity` with a
30-minute timeout, compiles/tests and performs the full live comparison. Its artifact contains
reports, manifest, runtime measurements, production hashes and JUnit results.
Code Validation and its Python/JavaScript/web/foreground/HK diagnostic/history/SVG/
signed-release guards are unchanged. Its Java/Android exclusion remains intact;
the JVM workflow has no Android, signing or secret steps. No APK or signed-release
task is introduced.
