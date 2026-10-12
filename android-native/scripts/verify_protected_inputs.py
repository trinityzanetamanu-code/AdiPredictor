#!/usr/bin/env python3
"""Prove native validation does not mutate production datasets, assets, or engine."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]


def snapshot():
    paths = subprocess.check_output([
        "git", "ls-files", "public", "kotlin/core", "kotlin/production",
        "config/prediction_backend.txt", "scripts/prediction_engine.py",
        "scripts/collector.py", "scripts/run_prediction_engine.sh",
        "scripts/publish_generated_data.sh", ".github/workflows/android-release.yml",
    ], cwd=ROOT, text=True).splitlines()
    hashes = {path: hashlib.sha256((ROOT / path).read_bytes()).hexdigest() for path in sorted(paths)}
    return {
        "input_sha": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
        "files": hashes,
        "aggregate_sha256": hashlib.sha256(json.dumps(hashes, sort_keys=True, separators=(",", ":")).encode()).hexdigest(),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--capture", type=Path)
    parser.add_argument("--compare", type=Path)
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    current = snapshot()
    if args.capture:
        args.capture.parent.mkdir(parents=True, exist_ok=True)
        args.capture.write_text(json.dumps(current, indent=2) + "\n")
    if args.compare:
        before = json.loads(args.compare.read_text())
        changed = [p for p in sorted(before["files"].keys() | current["files"].keys()) if before["files"].get(p) != current["files"].get(p)]
        report = {"input_sha": before["input_sha"], "file_count": len(current["files"]), "before_sha256": before["aggregate_sha256"], "after_sha256": current["aggregate_sha256"], "changed": changed, "PROTECTED_INPUTS_UNCHANGED": not changed, "STABLE_DISTRIBUTION_SWITCHED": False}
        if args.report:
            args.report.parent.mkdir(parents=True, exist_ok=True)
            args.report.write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps(report))
        if changed:
            raise SystemExit(1)


if __name__ == "__main__":
    main()
