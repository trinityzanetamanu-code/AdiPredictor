#!/usr/bin/env bash
set -euo pipefail

if [[ "${GITHUB_ACTIONS:-}" != "true" || "${GITHUB_REF:-}" != "refs/heads/main" ]]; then
  echo "Stable release metadata publishing is restricted to GitHub Actions on main." >&2
  exit 2
fi

source_path="${RELEASE_METADATA_SOURCE:?RELEASE_METADATA_SOURCE is required}"
max_attempts="${MAX_PUSH_ATTEMPTS:-3}"
temp_metadata="${RUNNER_TEMP:?RUNNER_TEMP is required}/adipredictor-app-release.json"
cp "$source_path" "$temp_metadata"

node -e "const p=require(process.argv[1]); if(p.channel!=='stable'||p.update_channel_ready!==true||p.application_id!=='com.adipredictor.app') process.exit(1)" "$temp_metadata"

git config --local user.email "github-actions[bot]@users.noreply.github.com"
git config --local user.name "github-actions[bot]"

for attempt in $(seq 1 "$max_attempts"); do
  git fetch --no-tags origin main
  git reset --hard origin/main
  cp "$temp_metadata" public/app-release.json
  git add public/app-release.json
  if git diff --cached --quiet; then
    echo "Stable release metadata is already current."
    exit 0
  fi
  git commit -m "build: record verified stable Android release [skip ci]"
  if git push origin HEAD:main; then
    echo "Verified stable release metadata published."
    exit 0
  fi
  echo "origin/main moved; retrying release metadata publication."
done

echo "Could not publish stable release metadata without force push." >&2
exit 1
