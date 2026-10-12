# Tahap 3B — production adapter and controlled activation

The independent calculation core is shared by two distinct executors: the guarded
shadow CLI and the production adapter. Production uses the repository backend in
`config/prediction_backend.txt`. The adapter implementation commit retains `python`;
activation to `kotlin` happens in a later commit only after Code Validation, Kotlin
Engine Parity and Kotlin Production Lifecycle all pass. Python remains the live
oracle and an explicit rollback. Collectors/backfill remain Python; UI remains
React/Capacitor. No Android build, signing, notifications or release is introduced.

## Commands from repository root

Prerequisites: complete JDK 17 (CI Temurin 17.0.16+8), CPython 3.11 for oracle or
rollback, Git, Bash and first-build dependency access. All commands below are real
entry points; use fresh staging/report destinations.

```sh
# Compile and test core, shadow and production adapter (22 Kotlin tests).
./kotlin/gradlew -p kotlin --no-daemon test :cli:installDist :production:installDist

# Full calculation parity, with the Stage 3A frozen SHA and hashed inputs.
python3.11 kotlin/parity/compare.py --output kotlin/parity-runs/calculation-01

# Live original Python lifecycle versus Kotlin on isolated identical copies.
python3.11 kotlin/lifecycle/compare_lifecycle.py --output kotlin/parity-runs/lifecycle-01

# Read generated Kotlin output through unchanged frontend wire readers.
node kotlin/lifecycle/check_frontend.mjs --root kotlin/parity-runs/lifecycle-01/kotlin

# Real shell publisher against isolated LOCAL Git remotes, including source/data retry.
python3.11 kotlin/lifecycle/publisher_retry.py --output kotlin/parity-runs/publisher-01

# Simulate all current real inputs; no owner public files or Git refs are changed.
PREDICTION_BACKEND=kotlin bash scripts/run_prediction_engine.sh --market ALL --simulate --staging "$PWD/kotlin/parity-runs/simulation-01"

# Deliberate production file generation only, bounded to this root/public/predictions.
# This command does not collect, commit, push or notify.
bash scripts/run_prediction_engine.sh --market ALL --staging "$PWD/kotlin/parity-runs/production-01"
```

The backend wrapper defaults to the repository configuration. An override is
explicit and logged. `--market HK|SDY|SGP|ALL`, `--force`, `--simulate`, `--clock`
and `--root` are supported. An injected clock is for isolated tests; normal
production uses Asia/Jakarta and assigns timestamps after computation, like Python.
Force is opt-in; an unchanged production run is valid evidence of Kotlin execution.
The separate `:cli:run` shadow commands in [README](../README.md) retain fresh-output
and public-path rejection; no production flag is added to shadow.

## Explicit Python rollback

Test rollback on a COPY, never by changing production just for evidence:

```sh
# Example copy under a fresh isolated directory. No publisher is invoked.
mkdir -p kotlin/parity-runs/rollback-copy
cp -a config public kotlin/parity-runs/rollback-copy/
PREDICTION_BACKEND=python bash scripts/run_prediction_engine.sh --root "$PWD/kotlin/parity-runs/rollback-copy" --market ALL --staging "$PWD/kotlin/parity-runs/rollback-stage-01"
```

Logs state `PYTHON_ROLLBACK_EXPLICIT NO_AUTOMATIC_FALLBACK`. Rollback stages the
unaltered original `prediction_engine.run()` and validates before applying changed
files. A failure never invokes the other backend. For a real operator-approved
rollback, set the backend file to `python` in a normal reviewed commit; the next
pipeline reads it after synchronizing main. Tests do not change production backend.

## Publication and retry

`publish_generated_data.sh` runs only in a disposable GitHub Actions checkout
(`GITHUB_ACTIONS=true`, workspace equal to Git root and an existing runner temp).
Do not fake these variables in an owner workspace. It fetches/reset-syncs main,
collects/backfills if requested, then invokes the selected adapter for ALL markets.
All calculations, history, archive, SVG and status writes finish and validate in a
fresh stage before any production prediction file changes. Old files are never
deleted, resolved archive hashes must remain identical, and input/output hashes
must still match the snapshot. A failed multi-file apply restores original bytes.
This is a publication transaction, not a claim of crash-atomic filesystem swapping;
Git publication cannot occur on adapter failure.

The publisher commits only validated generated data/predictions, uses ordinary
fast-forward push and retries at most three times. A rejected push discards its
stage and generated checkout changes, fetches current source/data, validates the
installed distribution against both source and binary content hashes and rebuilds
when either differs. Every retry recalculates using fresh inputs. No force push,
stale output, stale binary or automatic Python fallback is permitted. The shell
alone owns Git orchestration; Kotlin has no Git/network/process calls.

Collector/source exit and engine exit are logged separately. Valid diagnostic/data
publication retains the prior collector policy, while source failure remains a
nonzero workflow exit even if prediction/push succeeds. HTTP 403 HK remains a
separate source issue. The historical backfill now uses the same guarded retry
publisher. All three production writers retain `adipredictor-data-writer-main`.

## Lifecycle contract and evidence

`kotlin/lifecycle/compare_lifecycle.py` reads the original Python and every fixture
input using Git at `d22097ffc4772d0436b4deb9bb647a82c77ffed1`, verifies the same
70 calculation SHA-256 manifest entries as Stage 3A, also freezes every original
archived SVG at that SHA, and invokes original Python `run()` live.
Current Python must still match that frozen oracle. Both copies receive identical
config/datasets/archives and an identical injected clock for each phase. Synthetic
`0000` additions exist only in isolated copies. Owner public hashes are verified
before/after both harnesses.

Sixteen scenarios compare complete JSON paths with zero numeric tolerance,
SVG structure AND bytes, changed file sets, exit codes, run summaries, retained
status markets and resolved archive hashes: initialization, two unchanged runs,
new draw `0000`, unchanged after draw, force, force/prior archive selection,
metadata-only, history repair/single market, unchanged/single market, simulation,
explicit rollback, malformed dataset, short dataset, malformed config and malformed
output. The Kotlin tests additionally delete history, fail after the first market,
invalidate generated output, move input, reject symlinks and fail partway through
file application. Legacy archive payloads are read through the unchanged core audit
contract. Unchanged runs preserve existing timestamps/SVG/latest bytes and perform
no repeated commit.

Metadata-only updates preserve numeric fingerprints. Force preserves Python's
previous-prediction/prior-archive selection even when it references an older basis.
The core history-record insertion order now matches Python serialization, preventing
unnecessary history writes; prediction values and hashing contracts are unchanged.

A separately reported **safety-policy difference** is deliberate: native Python's
fingerprint/version/metadata shortcut accepts a cached payload with a missing
`models` field; Kotlin rejects it. Native Python may also write an earlier market
before a later market fails. Kotlin discards the entire staged package. These are
required malformed-output/transaction guards, not prediction business-logic changes.
They are not hidden in valid lifecycle parity or treated as equivalent failure-side
filesystem behavior. Python's original unsafe behavior remains available to the
oracle; explicit rollback wraps it with staging and basic payload validation.

Local reports are under [lifecycle/reports](../lifecycle/reports/); authoritative CI
artifacts include report JSON, all input hashes, scenario timings, per-market logs, archived asset hashes, unchanged frontend reader checks,
retry/build evidence and JUnit results. Kotlin Engine Parity has a 30-minute timeout;
Kotlin Production Lifecycle has a separate 30-minute timeout based on measured
local runs. Code Validation and frontend/browser/signed-release guards remain.

## Activation gates

All gates succeeded on `4edf6bb186169ed2148693c2f5c71de5a2b27697` before the
backend switch. Only collector public data advanced afterward; those updates are retained.

- [Code Validation](https://github.com/trinityzanetamanu-code/AdiPredictor/actions/runs/38278972868): SUCCESS.
- [Kotlin Engine Parity](https://github.com/trinityzanetamanu-code/AdiPredictor/actions/runs/38278972833): SUCCESS.
- [Kotlin Production Lifecycle](https://github.com/trinityzanetamanu-code/AdiPredictor/actions/runs/38278972837): SUCCESS.

The repository default is now Kotlin. A normal production run after this commit
provides executor/source/build/fingerprint and publication/no-change evidence in
GitHub Actions logs. Force remains false by default. Parity report `production_engine`
records the configured repository backend and that shadow left it unchanged;
it is not a claim of production execution. Production logs provide that proof.
