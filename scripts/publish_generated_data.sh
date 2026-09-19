#!/usr/bin/env bash
set -euo pipefail

if [[ "${GITHUB_ACTIONS:-}" != "true" ]]; then
  echo "This publisher is restricted to a disposable GitHub Actions checkout." >&2
  exit 2
fi

market="${MARKET:-ALL}"
include_collector="${INCLUDE_COLLECTOR:-0}"
prediction_force="${PREDICTION_FORCE:-0}"
max_attempts="${MAX_PUSH_ATTEMPTS:-3}"

git config --local user.email "github-actions[bot]@users.noreply.github.com"
git config --local user.name "github-actions[bot]"

for attempt in $(seq 1 "$max_attempts"); do
  echo "Publish attempt ${attempt}/${max_attempts}: synchronizing origin/main"
  git fetch --no-tags origin main
  git reset --hard origin/main

  if [[ "$include_collector" == "1" ]]; then
    python scripts/collector.py --market "$market"
  fi

  if [[ "$prediction_force" == "1" ]]; then
    python scripts/prediction_engine.py --market ALL --force
  else
    python scripts/prediction_engine.py --market ALL
  fi

  git add public/data/hk.json public/data/sgp.json public/data/sdy.json
  git add public/data/collector-status.json public/predictions

  if git diff --cached --quiet; then
    echo "No generated data changes to publish."
    exit 0
  fi

  git commit -m "data: refresh verified results and P1-P8 v2 [skip ci]"
  if git push origin HEAD:main; then
    echo "Generated data published safely on attempt ${attempt}."
    exit 0
  fi

  echo "origin/main moved during generation; discarding stale output and retrying."
done

echo "Remote main kept moving; no force push was attempted." >&2
exit 1
