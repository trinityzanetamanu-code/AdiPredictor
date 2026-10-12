#!/usr/bin/env bash
set -euo pipefail
root="$(git rev-parse --show-toplevel)"
if [[ "${GITHUB_ACTIONS:-}" != "true" || "${GITHUB_WORKSPACE:-}" != "$root" || ! -d "${RUNNER_TEMP:-/not-a-runner}" ]]; then
  echo "This publisher is restricted to a disposable GitHub Actions checkout." >&2
  exit 2
fi
cd "$root"
market="${MARKET:-ALL}"
include_collector="${INCLUDE_COLLECTOR:-0}"
include_backfill="${INCLUDE_BACKFILL:-0}"
prediction_force="${PREDICTION_FORCE:-0}"
max_attempts="${MAX_PUSH_ATTEMPTS:-3}"
[[ "$market" =~ ^(ALL|HK|SDY|SGP)$ && "$max_attempts" =~ ^[1-9][0-9]*$ ]] || exit 2
[[ "$include_collector" =~ ^[01]$ && "$include_backfill" =~ ^[01]$ && "$prediction_force" =~ ^[01]$ ]] || exit 2
git config --local user.email "github-actions[bot]@users.noreply.github.com"
git config --local user.name "github-actions[bot]"
mkdir -p prediction-run-reports
for attempt in $(seq 1 "$max_attempts"); do
  echo "Publish attempt ${attempt}/${max_attempts}: synchronizing origin/main"
  git fetch --no-tags origin main
  git reset --hard origin/main
  source_exit=0
  if [[ "$include_collector" == "1" ]]; then
    python scripts/collector.py --market "$market" || source_exit=$?
  fi
  if [[ "$include_backfill" == "1" ]]; then
    python scripts/historical_backfill.py || source_exit=$?
  fi
  echo "SOURCE_EXIT=$source_exit ATTEMPT=$attempt SOURCE_SHA=$(git rev-parse HEAD)"
  attempt_stage_parent="$(mktemp -d "$RUNNER_TEMP/prediction-attempt.XXXXXX")"
  trap 'rm -rf -- "$attempt_stage_parent"' EXIT
  args=(--market ALL --staging "$attempt_stage_parent/result")
  [[ "$prediction_force" != "1" ]] || args+=(--force)
  engine_exit=0
  PREDICTION_REPORT_DIR="$root/prediction-run-reports/attempt-$attempt" bash scripts/run_prediction_engine.sh "${args[@]}" || engine_exit=$?
  echo "ENGINE_EXIT=$engine_exit SOURCE_EXIT=$source_exit ATTEMPT=$attempt"
  rm -rf -- "$attempt_stage_parent"
  trap - EXIT
  if [[ "$engine_exit" != "0" ]]; then
    echo "Engine failure: package not published; collector failure was $source_exit." >&2
    exit "$engine_exit"
  fi
  git add public/data/hk.json public/data/sgp.json public/data/sdy.json
  git add public/data/singapore-official.json
  if [[ -f public/data/hk-conflicts.json ]]; then git add public/data/hk-conflicts.json; fi
  if [[ -f public/data/historical-verification.json ]]; then git add public/data/historical-verification.json; fi
  git add public/data/live-draw.json
  git add public/data/collector-status.json public/predictions
  if git diff --cached --quiet; then
    echo "PUBLICATION=no-change SOURCE_EXIT=$source_exit ENGINE_EXIT=0"
    exit "$source_exit"
  fi
  git commit -m "data: refresh verified results and P1-P8 v2 [skip ci]"
  if git push origin HEAD:main; then
    echo "PUBLICATION=published ATTEMPT=$attempt SOURCE_EXIT=$source_exit ENGINE_EXIT=0"
    exit "$source_exit"
  fi
  echo "origin/main moved during generation; discarding stale output and retrying with current source/data/binary."
done
echo "Remote main kept moving; no force push was attempted." >&2
exit 1
