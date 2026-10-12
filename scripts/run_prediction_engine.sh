#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd -P)"
cd "$root"
backend="${PREDICTION_BACKEND:-$(tr -d '\r\n' < config/prediction_backend.txt)}"
market=ALL; force=false; simulate=false; clock=""; staging=""; target_root="$root"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --market) market="$2"; shift 2;;
    --force) force=true; shift;;
    --simulate) simulate=true; shift;;
    --clock) clock="$2"; shift 2;;
    --staging) staging="$2"; shift 2;;
    --root) target_root="$2"; shift 2;;
    *) echo "Unknown engine option: $1" >&2; exit 2;;
  esac
done
[[ "$market" =~ ^(ALL|HK|SDY|SGP)$ ]] || exit 2
case "$backend" in kotlin|python) ;; *) echo "Invalid explicit backend: $backend" >&2; exit 2;; esac
if [[ -z "$staging" ]]; then
  stage_parent="$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/adipredictor-stage.XXXXXX")"
  staging="$stage_parent/result"
  trap 'rm -rf -- "$stage_parent"' EXIT
fi
source_sha="$(git rev-parse HEAD)"
selection=repository-default
[[ -z "${PREDICTION_BACKEND:-}" ]] || selection=explicit-override
echo "PREDICTION_BACKEND=$backend SELECTION=$selection SOURCE_SHA=$source_sha FORCE=$force SIMULATE=$simulate"
args=(--root "$target_root" --data "$target_root/public/data" --config "$target_root/config/collector_sources.json"
  --output "$target_root/public/predictions" --staging "$staging" --market "$market" --force "$force" --simulate "$simulate" --source-id "$source_sha")
[[ -z "$clock" ]] || args+=(--clock "$clock")
if [[ "$backend" == kotlin ]]; then
  identity="$(bash scripts/build_prediction_engine.sh)"
  kotlin/production/build/install/production/bin/production "${args[@]}" --build-id "$identity"
else
  echo "PYTHON_ROLLBACK_EXPLICIT NO_AUTOMATIC_FALLBACK"
  python scripts/python_prediction_production.py "${args[@]}" --build-id "$(sha256sum scripts/prediction_engine.py | cut -d' ' -f1)"
fi
if [[ -n "${PREDICTION_REPORT_DIR:-}" ]]; then
  mkdir -p "$PREDICTION_REPORT_DIR"
  cp "$staging/report.json" "$PREDICTION_REPORT_DIR/engine-report.json"
fi
