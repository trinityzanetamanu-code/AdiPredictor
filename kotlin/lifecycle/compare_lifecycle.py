#!/usr/bin/env python3
"""Live original-Python versus Kotlin lifecycle on isolated identical directories."""

import argparse
import copy
import importlib.util
import json
import shutil
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "kotlin/parity"))
from compare import diff, dump, freeze, sha, svg_structure, public_hashes


def hashes(path):
    return {
        str(p.relative_to(path)): sha(p.read_bytes())
        for p in sorted(path.rglob("*"))
        if p.is_file()
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument(
        "--cli",
        type=Path,
        default=REPO / "kotlin/production/build/install/production/bin/production",
    )
    args = parser.parse_args()
    assert sys.version_info[:2] == (3, 11), "Use original CPython 3.11 numeric contract"
    out = args.output.resolve()
    assert (
        not out.exists() and "public" not in out.parts and not REPO.is_relative_to(out)
    )
    out.mkdir(parents=True)
    owner_before = public_hashes()
    manifest, frozen = freeze(out)
    spec = importlib.util.spec_from_file_location(
        "lifecycle_original", frozen / "scripts/prediction_engine.py"
    )
    pe = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(pe)
    native, kotlin = out / "python", out / "kotlin"
    full = {
        m: sorted(
            json.loads((frozen / f"public/data/{m.lower()}.json").read_text()),
            key=lambda r: r["result_date"],
        )
        for m in pe.MARKETS
    }
    for root in (native, kotlin):
        (root / "config").mkdir(parents=True)
        shutil.copyfile(
            frozen / "config/collector_sources.json",
            root / "config/collector_sources.json",
        )
        for market, rows in full.items():
            dump(root / f"public/data/{market.lower()}.json", rows[:380])
        shutil.copytree(frozen / "public/predictions", root / "public/predictions")
    clock = "2026-10-13T00:00:00+07:00"

    class FrozenDateTime(datetime):
        @classmethod
        def now(cls, tz=None):
            value = datetime.fromisoformat(clock)
            return value.astimezone(tz) if tz else value.replace(tzinfo=None)

    pe.datetime = FrozenDateTime
    scenarios, mismatches = [], []

    def native_run(root, markets, force):
        pe.ROOT, pe.DATA_DIR, pe.PRED_DIR, pe.CONFIG_PATH = (
            root,
            root / "public/data",
            root / "public/predictions",
            root / "config/collector_sources.json",
        )
        try:
            return 0, pe.run(markets, force=force)
        except Exception as error:
            return 1, dict(error=str(error))

    def kotlin_run(root, name, markets, force=False, simulate=False):
        staging = out / "stages" / name
        command = [
            str(args.cli.resolve()),
            "--root",
            str(root),
            "--data",
            str(root / "public/data"),
            "--config",
            str(root / "config/collector_sources.json"),
            "--output",
            str(root / "public/predictions"),
            "--staging",
            str(staging),
            "--market",
            "ALL" if len(markets) == 3 else markets[0],
            "--force",
            str(force).lower(),
            "--simulate",
            str(simulate).lower(),
            "--clock",
            clock,
        ]
        process = subprocess.run(command, cwd=REPO, capture_output=True, text=True)
        (out / f"logs/{name}.txt").parent.mkdir(exist_ok=True)
        (out / f"logs/{name}.txt").write_text(process.stdout + process.stderr)
        return process.returncode, staging

    def compare_dirs(a, b, name):
        ah, bh = hashes(a), hashes(b)
        if ah.keys() != bh.keys():
            mismatches.append(dict(case=name, path="$files", reason="file set differs"))
        for file in sorted(ah.keys() & bh.keys()):
            if file.endswith(".json"):
                errors = diff(
                    json.loads((a / file).read_text()),
                    json.loads((b / file).read_text()),
                )
            elif file.endswith(".svg"):
                errors = diff(svg_structure(a / file), svg_structure(b / file))
                if ah[file] != bh[file]:
                    errors.append(dict(path="$svg_bytes", reason="SVG bytes differ"))
            else:
                errors = (
                    []
                    if ah[file] == bh[file]
                    else [dict(path="$", reason="bytes differ")]
                )
            mismatches.extend(dict(error, case=name, file=file) for error in errors)

    def resolved(root):
        evidence = {}
        for m in pe.MARKETS:
            rows = sorted(
                json.loads((root / f"public/data/{m.lower()}.json").read_text()),
                key=lambda r: r["result_date"],
            )
            basis = rows[-1]["result_date"]
            for p in (root / f"public/predictions/{m.lower()}/archive").glob("*.json"):
                if p.stem <= basis:
                    evidence[str(p.relative_to(root / "public/predictions"))] = sha(
                        p.read_bytes()
                    )
        return evidence

    def run(name, markets=pe.MARKETS, force=False, expect_error=False):
        nonlocal clock
        clock = f"2026-10-13T00:{len(scenarios):02d}:00+07:00"
        before_a, before_b = (
            hashes(native / "public/predictions"),
            hashes(kotlin / "public/predictions"),
        )
        resolved_a, resolved_b = resolved(native), resolved(kotlin)
        start = time.perf_counter()
        code_a, summary = native_run(native, markets, force)
        python_seconds = time.perf_counter() - start
        if hashes(kotlin / "public/predictions") != before_b:
            raise RuntimeError(
                f"Original Python run unexpectedly changed the Kotlin input copy: {name}; ROOT={pe.ROOT}, PRED_DIR={pe.PRED_DIR}"
            )
        start = time.perf_counter()
        code_b, stage = kotlin_run(kotlin, name, markets, force)
        kotlin_seconds = time.perf_counter() - start
        changed_a, changed_b = [], []
        if code_a != code_b:
            mismatches.append(
                dict(
                    case=name,
                    path="$exit",
                    reason="exit differs",
                    python=code_a,
                    kotlin=code_b,
                )
            )
        if expect_error:
            if (
                not code_a
                or not code_b
                or hashes(kotlin / "public/predictions") != before_b
            ):
                mismatches.append(
                    dict(
                        case=name,
                        path="$failure",
                        reason="failure must not apply a Kotlin package",
                    )
                )
        else:
            compare_dirs(
                native / "public/predictions", kotlin / "public/predictions", name
            )
            after_a, after_b = (
                hashes(native / "public/predictions"),
                hashes(kotlin / "public/predictions"),
            )
            changed_a = sorted(
                p
                for p in before_a.keys() | after_a.keys()
                if before_a.get(p) != after_a.get(p)
            )
            changed_b = sorted(
                p
                for p in before_b.keys() | after_b.keys()
                if before_b.get(p) != after_b.get(p)
            )
            if changed_a != changed_b:
                mismatches.append(
                    dict(
                        case=name,
                        path="$changed_files",
                        reason="changed set differs",
                        python=changed_a,
                        kotlin=changed_b,
                    )
                )
            for files_before, files_after in (
                (resolved_a, after_a),
                (resolved_b, after_b),
            ):
                if any(files_after.get(p) != h for p, h in files_before.items()):
                    mismatches.append(
                        dict(
                            case=name,
                            path="$evidence",
                            reason="resolved archive rewritten",
                        )
                    )
            if name.startswith("unchanged") and (changed_a or changed_b):
                mismatches.append(
                    dict(
                        case=name,
                        path="$idempotence",
                        reason="unchanged run wrote files",
                    )
                )
            expected = summary
            actual = json.loads((stage / "report.json").read_text())["markets"]
            mismatches.extend(
                dict(error, case=name, file="run-summary")
                for error in diff(expected, actual)
            )
        scenarios.append(
            dict(
                name=name,
                markets=list(markets),
                force=force,
                python_exit=code_a,
                kotlin_exit=code_b,
                clock=clock,
                python_seconds=python_seconds,
                kotlin_seconds=kotlin_seconds,
                python_changed_files=changed_a,
                kotlin_changed_files=changed_b,
                resolved_archive_sha256=resolved_b,
            )
        )
        print(f"LIFECYCLE {name} Python={code_a} Kotlin={code_b}", flush=True)

    run("initialization")
    run("unchanged-1")
    run("unchanged-2")
    for root in (native, kotlin):
        for m in pe.MARKETS:
            rows = copy.deepcopy(full[m][:381])
            rows[-1]["nomor"] = "0000"
            dump(root / f"public/data/{m.lower()}.json", rows)
    run("new-draw-zero")
    run("unchanged-after-draw")
    run("force", force=True)
    for root in (native, kotlin):
        for m in pe.MARKETS:
            p = root / f"public/predictions/{m.lower()}/latest.json"
            v = json.loads(p.read_text())
            v["previous_dataset_fingerprint"] = None
            dump(p, v)
    run("force-prior-selection", force=True)
    for root in (native, kotlin):
        for m in pe.MARKETS:
            p = root / f"public/predictions/{m.lower()}/latest.json"
            v = json.loads(p.read_text())
            v["metadata_revision"] = 2
            dump(p, v)
    run("metadata-only")
    for root in (native, kotlin):
        (root / "public/predictions/hk/history.json").write_text("{}\n")
    run("history-repair-single-market", markets=("HK",))
    run("unchanged-single-market", markets=("HK",))
    # Simulation compares a real original-Python run on a third clone to staging only.
    sim = out / "simulation-oracle"
    shutil.copytree(native, sim)
    before = hashes(kotlin / "public")
    clock = "2026-10-13T02:00:00+07:00"
    code_a, _ = native_run(sim, pe.MARKETS, True)
    code_b, stage = kotlin_run(kotlin, "simulation", pe.MARKETS, True, True)
    compare_dirs(
        sim / "public/predictions", stage / "working/public/predictions", "simulation"
    )
    if code_a != code_b or hashes(kotlin / "public") != before:
        mismatches.append(
            dict(case="simulation", path="$", reason="simulation changed original tree")
        )
    scenarios.append(dict(name="simulation", python_exit=code_a, kotlin_exit=code_b))
    # Explicit rollback is tested against original Python, never used as a fallback.
    rollback = out / "rollback"
    shutil.copytree(kotlin, rollback)
    clock = "2026-10-13T03:00:00+07:00"
    code_a, _ = native_run(native, pe.MARKETS, True)
    command = [
        sys.executable,
        str(REPO / "scripts/python_prediction_production.py"),
        "--root",
        str(rollback),
        "--data",
        str(rollback / "public/data"),
        "--config",
        str(rollback / "config/collector_sources.json"),
        "--output",
        str(rollback / "public/predictions"),
        "--staging",
        str(out / "rollback-stage"),
        "--market",
        "ALL",
        "--force",
        "true",
        "--clock",
        clock,
    ]
    code_b = subprocess.run(command, cwd=REPO).returncode
    compare_dirs(
        native / "public/predictions",
        rollback / "public/predictions",
        "explicit-python-rollback",
    )
    scenarios.append(
        dict(name="explicit-python-rollback", python_exit=code_a, kotlin_exit=code_b)
    )
    if code_a != code_b:
        mismatches.append(
            dict(
                case="explicit-python-rollback",
                path="$exit",
                reason="rollback exit differs",
            )
        )
    # Failures occur on extra clones; a first-market successful calculation is discarded.
    for kind in (
        "dataset-malformed",
        "dataset-short",
        "config-malformed",
        "output-malformed",
    ):
        a, b = out / f"fail-python-{kind}", out / f"fail-kotlin-{kind}"
        shutil.copytree(kotlin, a)
        shutil.copytree(kotlin, b)
        for root in (a, b):
            if kind == "dataset-malformed":
                (root / "public/data/sdy.json").write_text("{broken")
            elif kind == "dataset-short":
                dump(root / "public/data/sdy.json", [])
            elif kind == "config-malformed":
                (root / "config/collector_sources.json").write_text("{broken")
            else:
                dump(root / "public/predictions/sdy/latest.json", [])
        forced = kind != "output-malformed"
        before = hashes(b / "public/predictions")
        ca, _ = native_run(a, pe.MARKETS, forced)
        cb, _ = kotlin_run(b, kind, pe.MARKETS, forced)
        if ca != cb or ca == 0 or hashes(b / "public/predictions") != before:
            mismatches.append(
                dict(
                    case=kind,
                    path="$failure",
                    reason="failure exit or transactional safety",
                )
            )
        scenarios.append(dict(name=kind, python_exit=ca, kotlin_exit=cb))
    # Required package validation exposes a native Python cached-output gap.
    # Keep this safety-policy difference separate from valid lifecycle/math parity.
    a, b = out / "cached-gap-python", out / "cached-gap-kotlin"
    for root in (a, b):
        shutil.copytree(kotlin, root)
        path = root / "public/predictions/hk/latest.json"
        payload = json.loads(path.read_text())
        del payload["models"]
        dump(path, payload)
    before = hashes(b / "public/predictions")
    ca, _ = native_run(a, ("HK",), False)
    cb, _ = kotlin_run(b, "cached-output-validation-gap", ("HK",))
    policy_difference = dict(
        name="cached-output-validation-gap",
        python_exit=ca,
        kotlin_exit=cb,
        native_behavior="accepts fingerprint/version-matching cache with missing models",
        adapter_behavior="rejects malformed cached package before publication",
        kotlin_public_unchanged=before == hashes(b / "public/predictions"),
        rationale="Stage 3B requires malformed output never be published; prediction business logic is unchanged",
    )
    if ca != 0 or cb != 1 or not policy_difference["kotlin_public_unchanged"]:
        mismatches.append(
            dict(
                case=policy_difference["name"],
                path="$safety",
                reason="unexpected cached-validation policy result",
            )
        )
    after_owner = public_hashes()
    if owner_before != after_owner:
        mismatches.append(
            dict(case="owner-safety", path="$public", reason="real repository changed")
        )
    report = dict(
        lifecycle_parity="PASS" if not mismatches else "FAIL",
        source_sha=manifest["source_sha"],
        input_sha256=manifest["sha256"],
        scenarios=scenarios,
        mismatches=mismatches,
        owner_public_unchanged=owner_before == after_owner,
        oracle="live original scripts/prediction_engine.py; no manually written expected payloads",
        numerical_tolerance=0,
        rollback_explicit=True,
        safety_policy_differences=[policy_difference],
    )
    dump(out / "report.json", report)
    (out / "report.md").write_text(
        "# Production lifecycle parity\n\nStatus: "
        + report["lifecycle_parity"]
        + "\n\n"
        + "\n".join(
            f"- {s['name']}: Python {s['python_exit']}, Kotlin {s['kotlin_exit']}"
            for s in scenarios
        )
        + "\n\nMismatches: "
        + str(len(mismatches))
        + "\n"
    )
    print(report["lifecycle_parity"], "mismatches=", len(mismatches), flush=True)
    return bool(mismatches)


if __name__ == "__main__":
    sys.exit(main())
