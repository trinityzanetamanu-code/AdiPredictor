#!/usr/bin/env python3
"""Frozen-input, live CPython 3.11 ↔ Kotlin full engine comparison. No publisher."""

from __future__ import annotations
import argparse
import hashlib
import importlib.util
import json
import math
import os
import shutil
import subprocess
import sys
import time
import traceback
import xml.etree.ElementTree as ET
from datetime import date, datetime
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
MANIFEST = Path(__file__).parent / "fixtures/manifest.json"
CLOCK = "2026-10-12T12:00:00+07:00"
MATRIX_ABS_TOLERANCE = 1e-13
sys.dont_write_bytecode = True


def sha(data):
    return hashlib.sha256(data).hexdigest()


def dump(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
        + "\n",
        encoding="utf-8",
    )


def public_hashes():
    return {
        str(p.relative_to(REPO)): sha(p.read_bytes())
        for p in sorted((REPO / "public").rglob("*"))
        if p.is_file()
    }


def input_hashes(output):
    # Interpreter bytecode is derived from source and contains filesystem timestamps;
    # it is never an engine input. Hash source/config/dataset/archive/request bytes.
    return {
        str(p.relative_to(output)): sha(p.read_bytes())
        for p in sorted((output / "inputs").rglob("*"))
        if p.is_file() and "__pycache__" not in p.parts and p.suffix != ".pyc"
    }


def freeze(output):
    manifest = json.loads(MANIFEST.read_text())
    if (
        sha((REPO / "scripts/prediction_engine.py").read_bytes())
        != manifest["sha256"]["scripts/prediction_engine.py"]
    ):
        raise RuntimeError(
            "Current Python engine differs from the frozen oracle; review and regenerate the parity manifest"
        )
    snapshot = output / "inputs/source"
    for path, expected in manifest["sha256"].items():
        data = subprocess.check_output(
            ["git", "show", f"{manifest['source_sha']}:{path}"], cwd=REPO
        )
        if sha(data) != expected:
            raise RuntimeError(f"Frozen input checksum mismatch: {path}")
        target = snapshot / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    dump(output / "inputs/manifest.json", manifest)
    return manifest, snapshot


def cases(snapshot, output, quick=False):
    config = snapshot / "config/collector_sources.json"
    spec = importlib.util.spec_from_file_location(
        "frozen_prediction_engine", snapshot / "scripts/prediction_engine.py"
    )
    pe = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(pe)
    histories = {}
    requests = []

    def add(market, name, rows, previous=None):
        input_path = output / f"inputs/cases/{name}.json"
        dump(input_path, rows)
        basis = rows[-1]["result_date"]
        prior = snapshot / f"public/predictions/{market.lower()}/archive/{basis}.json"
        target = pe.target_date_for(
            market, date.fromisoformat(basis), json.loads(config.read_text())
        ).isoformat()
        actual = next(
            (r for r in histories[market] if r["result_date"] == target), None
        )
        request = dict(
            id=name,
            market=market,
            input=str(input_path),
            config=str(config),
            clock=CLOCK,
            input_sha256=sha(input_path.read_bytes()),
            cutoff=basis,
            records=len(rows),
            target_date=target,
            archives=str(snapshot / f"public/predictions/{market.lower()}/archive"),
        )
        if previous:
            request["previous"] = str(previous)
        if prior.exists():
            request.update(
                prior_archive=str(prior),
                prior_archive_path=f"public/predictions/{market.lower()}/archive/{basis}.json",
            )
        if actual:
            request.update(
                actual=pe.number_of(actual),
                actual_date=actual["result_date"],
                actual_period=actual.get("periode"),
            )
        requests.append(request)

    for market in pe.MARKETS:
        rows = json.loads((snapshot / f"public/data/{market.lower()}.json").read_text())
        rows = sorted(
            (r for r in rows if r.get("result_date")), key=lambda r: r["result_date"]
        )
        histories[market] = rows
        if quick:
            add(market, market.lower() + "-quick", rows[:380])
        else:
            add(
                market,
                market.lower() + "-latest",
                rows,
                snapshot / f"public/predictions/{market.lower()}/latest.json",
            )
            for cutoff in ("2026-09-30", "2026-10-10"):
                add(
                    market,
                    market.lower() + "-" + cutoff,
                    [r for r in rows if r["result_date"] <= cutoff],
                )
    if not quick:
        tied = None
        for market in pe.MARKETS:
            for path in sorted(
                (snapshot / f"public/predictions/{market.lower()}/archive").glob(
                    "*.json"
                ),
                reverse=True,
            ):
                archived = json.loads(path.read_text())
                candidates = (
                    archived.get("weighted_consensus", {})
                    .get("candidate_rankings", {})
                    .get("4d_top3", [])
                )
                if (
                    len(candidates) >= 2
                    and candidates[0]["reliability_weighted_score"]
                    == candidates[1]["reliability_weighted_score"]
                    and candidates[0]["raw_support_count"]
                    == candidates[1]["raw_support_count"]
                ):
                    basis = archived.get("latest_result", {}).get("date")
                    training = [
                        r for r in histories[market] if r["result_date"] <= basis
                    ]
                    if len(training) > pe.MINIMUM_TRAINING_RECORDS:
                        add(market, "archive-tie-regression", training, path)
                        tied = dict(
                            archive=str(path.relative_to(snapshot)),
                            basis=basis,
                            numbers=[c["number"] for c in candidates[:2]],
                            score=candidates[0]["reliability_weighted_score"],
                        )
                        break
            if tied:
                break
        if not tied:
            raise RuntimeError(
                "No real archived consensus tie found; do not substitute invented tie"
            )
        first = dict(requests[0])
        first["id"] = "hk-identical-repeat"
        requests.append(first)
        zero_rows = [dict(r) for r in histories["HK"][:380]]
        zero_rows[-1]["nomor"] = "0000"
        add("HK", "hk-zero-result", zero_rows)
        dump(output / "inputs/tie-evidence.json", tied)
    dump(output / "inputs/requests.json", requests)
    return pe, requests


def oracle(pe, requests, output):
    class FrozenDateTime(datetime):
        @classmethod
        def now(cls, tz=None):
            return (
                datetime.fromisoformat(CLOCK).astimezone(tz)
                if tz
                else datetime.fromisoformat(CLOCK).replace(tzinfo=None)
            )

    pe.datetime = FrozenDateTime
    runtimes = []
    for request in requests:
        directory = output / "python" / request["id"]
        directory.mkdir(parents=True, exist_ok=True)
        pe.ROOT = directory
        pe.PRED_DIR = directory / "public/predictions"
        shutil.copytree(
            request["archives"], pe.PRED_DIR / request["market"].lower() / "archive"
        )
        if request.get("prior_archive"):
            target = directory / request["prior_archive_path"]
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(request["prior_archive"], target)
        rows = json.loads(Path(request["input"]).read_text())
        config = json.loads(Path(request["config"]).read_text())
        previous = (
            json.loads(Path(request["previous"]).read_text())
            if request.get("previous")
            else None
        )
        started = time.perf_counter()
        prediction = pe.build_prediction(
            request["market"], rows, config, previous_prediction=previous
        )
        seconds = time.perf_counter() - started
        dump(directory / "prediction.json", prediction)
        pe.update_history_index(request["market"], rows)
        shutil.copyfile(
            pe.PRED_DIR / request["market"].lower() / "history.json",
            directory / "history-index.json",
        )
        dump(
            directory / "model-matrices.json",
            {name: pe.model_matrix(name, rows, details=True)[0] for name in pe.MODELS},
        )
        if request.get("actual"):
            actual = dict(
                result_date=request["actual_date"],
                periode=request.get("actual_period"),
                nomor=request["actual"],
            )
            dump(
                directory / "outcome-audit.json",
                pe.audit_prediction_payload(prediction, request["actual"]),
            )
            dump(
                directory / "history-record.json",
                pe.history_record(
                    request["market"],
                    prediction,
                    actual,
                    f"public/predictions/{request['market'].lower()}/archive/{prediction['target_date']}.json",
                ),
            )
        timing = dict(
            id=request["id"],
            market=request["market"],
            records=len(rows),
            compute_seconds=seconds,
            engine="PYTHON",
        )
        runtimes.append(timing)
        dump(directory / "runtime.json", timing)
        print(f"PYTHON {request['id']} {seconds:.3f}s", flush=True)
    dump(output / "python/runtimes.json", runtimes)


def diff(a, b, path="$", tolerance=0.0):
    errors = []
    if isinstance(a, dict) and isinstance(b, dict):
        for key in sorted(a.keys() | b.keys()):
            if key not in a or key not in b:
                errors.append(
                    dict(
                        path=f"{path}.{key}",
                        reason="missing field",
                        python=a.get(key),
                        kotlin=b.get(key),
                    )
                )
            else:
                errors.extend(diff(a[key], b[key], f"{path}.{key}", tolerance))
    elif isinstance(a, list) and isinstance(b, list):
        if len(a) != len(b):
            errors.append(
                dict(path=path, reason="length", python=len(a), kotlin=len(b))
            )
        for i, (x, y) in enumerate(zip(a, b)):
            errors.extend(diff(x, y, f"{path}[{i}]", tolerance))
    elif (
        isinstance(a, (int, float))
        and not isinstance(a, bool)
        and isinstance(b, (int, float))
        and not isinstance(b, bool)
    ):
        if not math.isfinite(a) or not math.isfinite(b) or abs(a - b) > tolerance:
            errors.append(
                dict(
                    path=path,
                    reason="numeric",
                    python=a,
                    kotlin=b,
                    absolute_error=abs(a - b),
                )
            )
    elif type(a) is not type(b) or a != b:
        errors.append(dict(path=path, reason="value", python=a, kotlin=b))
    return errors


def svg_structure(path):
    def node(element):
        return dict(
            tag=element.tag,
            attributes=dict(sorted(element.attrib.items())),
            text=element.text or "",
            children=[node(child) for child in element],
        )

    return node(ET.parse(path).getroot())


def compare(requests, output, kotlin_output):
    mismatches = []
    checks = []
    for request in requests:
        name = request["id"]
        python_dir, kotlin_dir = output / "python" / name, kotlin_output / name
        for filename in (
            "prediction.json",
            "model-matrices.json",
            "outcome-audit.json",
            "history-record.json",
            "history-index.json",
        ):
            if filename.startswith(("outcome", "history")) and not request.get(
                "actual"
            ):
                continue
            a = json.loads((python_dir / filename).read_text())
            b = json.loads((kotlin_dir / filename).read_text())
            errors = diff(
                a,
                b,
                tolerance=MATRIX_ABS_TOLERANCE
                if filename == "model-matrices.json"
                else 0.0,
            )
            for error in errors:
                error.update(case=name, file=filename)
            mismatches.extend(errors)
            checks.append(dict(case=name, file=filename, mismatches=len(errors)))
        prediction = json.loads((python_dir / "prediction.json").read_text())
        for pattern in prediction["visual_patterns"]:
            relative = "public/" + pattern["image_path"]
            errors = diff(
                svg_structure(python_dir / relative),
                svg_structure(kotlin_dir / relative),
            )
            mismatches.extend(dict(error, case=name, file=relative) for error in errors)
            checks.append(
                dict(
                    case=name,
                    file=relative,
                    mismatches=len(errors),
                    byte_identical=sha((python_dir / relative).read_bytes())
                    == sha((kotlin_dir / relative).read_bytes()),
                )
            )
    if any(r["id"] == "hk-identical-repeat" for r in requests):
        for engine in ("python", "kotlin"):
            directory = output / "python" if engine == "python" else kotlin_output
            a = json.loads((directory / "hk-latest/prediction.json").read_text())
            b = json.loads(
                (directory / "hk-identical-repeat/prediction.json").read_text()
            )
            mismatches.extend(
                dict(error, case="identical-repeat", file=engine)
                for error in diff(a, b)
            )
    return checks, mismatches


def safety_checks(cli, output, snapshot):
    """Exercise output containment and no-overwrite guards with the real executable."""
    common = [
        str(cli.resolve()),
        "shadow",
        "--input",
        str(snapshot / "public/data/hk.json"),
        "--market",
        "HK",
        "--config",
        str(snapshot / "config/collector_sources.json"),
    ]
    output = output / f"output-guards-{time.time_ns()}"
    output.mkdir()
    existing = output / "existing-output"
    existing.mkdir()
    (existing / "sentinel.txt").write_text("KEEP\n")
    public = output / "containment/public"
    public.mkdir(parents=True)
    alias = output / "public-alias"
    alias.symlink_to(public, target_is_directory=True)
    checks = []
    for name, destination in (
        ("existing-output", existing),
        ("direct-public", public / "new"),
        ("symlink-public", alias / "new"),
    ):
        run = subprocess.run(
            common + ["--output", str(destination)],
            cwd=REPO,
            capture_output=True,
            text=True,
        )
        checks.append(
            dict(
                case=name,
                rejected=run.returncode != 0,
                wrote_output=(destination / "prediction.json").exists(),
            )
        )
    if (existing / "sentinel.txt").read_text() != "KEEP\n":
        raise RuntimeError("CLI overwrote existing output")
    return checks


def probe_request(snapshot, output):
    rows = sorted(
        json.loads((snapshot / "public/data/hk.json").read_text()),
        key=lambda r: r["result_date"],
    )[:10]
    rows[-1] = dict(rows[-1], nomor="0000")
    request = dict(
        config=str(snapshot / "config/collector_sources.json"),
        market="HK",
        rows=rows,
        normalization=[
            "0000",
            "0052",
            "0",
            "",
            0,
            52,
            "٠١٢٣",
            None,
            "12345",
            "abcd",
            -1,
            " 12",
            52.0,
        ],
        targets=[
            dict(market=m, basis=d)
            for m in ("HK", "SDY", "SGP")
            for d in ("2026-09-21", "2026-10-10", "2026-12-31", "2027-01-31")
        ],
        periods=["HK-0099", "SGP-9999", "SDY-0", "", None, "HK-bad", "bad"],
        rounding=[1.2345645, 1.2345655, -1.2345645, 0.0000005, -0.0000001, 2.675],
        stars=[[3, 2.35], [2, 1.55], [2, 1.2], [1, 5.0], [3, 1.19]],
        legacy_archives=[
            dict(
                path=str(snapshot / "public/predictions/hk/archive/2026-09-19.json"),
                actual="0000",
            ),
            dict(
                path=str(snapshot / "public/predictions/sgp/archive/2026-10-11.json"),
                actual="0000",
            ),
        ],
    )
    dump(output / "inputs/probes.json", request)
    return request


def oracle_probe(pe, request):
    config = json.loads(Path(request["config"]).read_text())
    rows = request["rows"]
    normalization = []
    for value in request["normalization"]:
        try:
            normalization.append(
                dict(valid=True, number=pe.number_of(dict(nomor=value)))
            )
        except (ValueError, TypeError):
            normalization.append(dict(valid=False))
    duplicate = rows + [dict(rows[-1])]
    conflict = rows + [dict(rows[-1], nomor="0001")]
    result = dict(
        normalization=normalization,
        validation=pe.validate_dataset("HK", rows, config),
        dataset_fingerprint=pe.dataset_fingerprint("HK", rows),
        dataset_revision=pe.dataset_revision("HK", rows),
        targets=[
            dict(
                entry,
                target=pe.target_date_for(
                    entry["market"], date.fromisoformat(entry["basis"]), config
                ).isoformat(),
            )
            for entry in request["targets"]
        ],
        periods=[pe.increment_period(p) for p in request["periods"]],
        rounding=[pe.rnd(x) for x in request["rounding"]],
        p8=pe.p8_instinct(rows),
        p8_repeat=pe.p8_instinct(rows),
        stars=[pe.stars_for(*s) for s in request["stars"]],
        duplicate_validation=pe.validate_dataset("HK", duplicate, config),
        conflict_validation=pe.validate_dataset("HK", conflict, config),
        short_loader="REJECTED",
        legacy_audits=[
            pe.audit_prediction_payload(
                json.loads(Path(a["path"]).read_text()), a["actual"]
            )
            for a in request["legacy_archives"]
        ],
    )
    for name, invalid in (("duplicate_build", duplicate), ("conflict_build", conflict)):
        try:
            pe.build_prediction("HK", invalid, config)
            result[name] = "ACCEPTED"
        except RuntimeError:
            result[name] = "REJECTED"
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument(
        "--kotlin-cli", type=Path, default=REPO / "kotlin/cli/build/install/cli/bin/cli"
    )
    parser.add_argument("--quick", action="store_true")
    parser.add_argument(
        "--oracle-only",
        action="store_true",
        help="Build live oracle outputs for subsequent --resume comparison",
    )
    parser.add_argument(
        "--resume",
        action="store_true",
        help="Reuse live oracle outputs with identical frozen input hashes",
    )
    args = parser.parse_args()
    if sys.version_info[:2] != (3, 11):
        parser.error(
            "Parity oracle must use CPython 3.11, matching production CI (float sum contract)"
        )
    output = args.output.resolve()
    if "public" in output.parts or output == REPO or REPO.is_relative_to(output):
        parser.error("Output must be a fresh shadow directory, never production public")
    if output.exists() and not args.resume:
        parser.error("Output exists; choose a fresh path or explicit --resume")
    output.mkdir(parents=True, exist_ok=True)
    original_before = (
        json.loads((output / "public-before.json").read_text()) if args.resume else None
    )
    before = public_hashes()
    dump(output / "public-before.json", before)
    if original_before is not None and original_before != before:
        raise RuntimeError("Production public files changed since the oracle run")
    manifest, snapshot = freeze(output)
    pe, requests = cases(snapshot, output, args.quick)
    if args.resume:
        for request in requests:
            if not (output / "python" / request["id"] / "prediction.json").exists():
                raise RuntimeError(
                    "Resume requires previously calculated live oracle for every case"
                )
    else:
        oracle(pe, requests, output)
    probe = probe_request(snapshot, output)
    expected_probe = oracle_probe(pe, probe)
    dump(output / "python/probes.json", expected_probe)
    for name, rows in (
        ("short", probe["rows"]),
        ("invalid", [dict(probe["rows"][0], nomor="abcd")] + probe["rows"][1:]),
    ):
        dump(output / f"inputs/{name}-loader.json", rows)
    if args.oracle_only:
        dump(output / "oracle-input-hashes.json", input_hashes(output))
        print("Live oracle complete; Kotlin comparison still REQUIRED", flush=True)
        return
    if args.resume:
        expected = json.loads((output / "oracle-input-hashes.json").read_text())
        expected = {
            p: h
            for p, h in expected.items()
            if "__pycache__" not in Path(p).parts and Path(p).suffix != ".pyc"
        }
        current = input_hashes(output)
        if expected != current:
            raise RuntimeError(
                "Resume input hashes differ from live oracle input; do not reuse"
            )
        # Seal native oracle output hashes before comparison; never edit expected values.
        dump(
            output / "oracle-output-hashes.json",
            {
                str(p.relative_to(output)): sha(p.read_bytes())
                for p in sorted((output / "python").rglob("*"))
                if p.is_file()
            },
        )
    kotlin_output = output / "kotlin"
    attempt = 1
    while kotlin_output.exists():
        kotlin_output = output / f"kotlin-attempt-{attempt}"
        attempt += 1
    subprocess.run(
        [
            str(args.kotlin_cli.resolve()),
            "batch",
            "--input",
            str(output / "inputs/requests.json"),
            "--output",
            str(kotlin_output),
        ],
        check=True,
        cwd=REPO,
    )
    subprocess.run(
        [
            str(args.kotlin_cli.resolve()),
            "probe",
            "--input",
            str(output / "inputs/probes.json"),
            "--output",
            str(kotlin_output / "probes.json"),
        ],
        check=True,
        cwd=REPO,
    )
    checks, mismatches = compare(requests, output, kotlin_output)
    mismatches.extend(
        dict(error, case="compatibility-probes", file="probes.json")
        for error in diff(
            expected_probe, json.loads((kotlin_output / "probes.json").read_text())
        )
    )
    safety = safety_checks(args.kotlin_cli, output, snapshot)
    for check in safety:
        if not check["rejected"] or check["wrote_output"]:
            mismatches.append(
                dict(
                    case=check["case"], path="$output", reason="CLI output guard failed"
                )
            )
    # Exercise real CLI rejections; no output may be created by invalid/short requests.
    config = str(snapshot / "config/collector_sources.json")
    for name, rows in (
        ("short", probe["rows"]),
        ("invalid", [dict(probe["rows"][0], nomor="abcd")] + probe["rows"][1:]),
    ):
        input_path = output / f"inputs/{name}-loader.json"
        dump(input_path, rows)
        destination = output / f"rejected-{name}"
        run = subprocess.run(
            [
                str(args.kotlin_cli.resolve()),
                "shadow",
                "--input",
                str(input_path),
                "--market",
                "HK",
                "--config",
                config,
                "--output",
                str(destination),
            ],
            cwd=REPO,
            capture_output=True,
            text=True,
        )
        original_data_dir = pe.DATA_DIR
        isolated_data = output / f"python-loader-{name}"
        isolated_data.mkdir(exist_ok=True)
        dump(isolated_data / "hk.json", rows)
        pe.DATA_DIR = isolated_data
        try:
            pe.load_history("HK")
            python_rejected = False
        except (RuntimeError, ValueError):
            python_rejected = True
        finally:
            pe.DATA_DIR = original_data_dir
        if not python_rejected or run.returncode == 0 or destination.exists():
            mismatches.append(
                dict(
                    case=name,
                    path="$loader",
                    reason="original Python / Kotlin loaders must both reject without output",
                )
            )
    # P5 SGP regression verifies separation of model gate from SVG evaluation.
    p5_case = next((r for r in requests if r["id"] == "sgp-2026-10-10"), None)
    p5_evidence = None
    if p5_case:
        payload = json.loads(
            (kotlin_output / "sgp-2026-10-10/prediction.json").read_text()
        )
        p5 = payload["models"]["P5"]["analysis"]
        p5_evidence = {
            key: p5[key] for key in ("model_visual_gate", "visual_pattern_evaluation")
        }
        oracle_p5 = json.loads(
            (output / "python/sgp-2026-10-10/prediction.json").read_text()
        )["models"]["P5"]["analysis"]
        for engine, analysis in (("python", oracle_p5), ("kotlin", p5)):
            backtest = analysis["visual_only_backtest"]
            expected_gate = (
                backtest["trials"] >= 30 and backtest["wilson_95_ci"][0] > 0.10
            )
            expected_svg = any(
                p["visual_predictive_edge_confirmed"]
                for p in analysis["visual_patterns"]
            )
            if (
                analysis["model_visual_gate"]["enabled"] != expected_gate
                or analysis["visual_contribution_enabled"] != expected_gate
                or analysis["P5_MODE"] != ("hybrid" if expected_gate else "fallback")
                or analysis["visual_pattern_evaluation"]["any_svg_edge_confirmed"]
                != expected_svg
            ):
                mismatches.append(
                    dict(
                        case="sgp-2026-10-10",
                        path="$.models.P5.analysis",
                        reason=f"{engine}: model gate / SVG evaluation not consistent with their independent backtests",
                    )
                )
    after = public_hashes()
    dump(output / "public-after.json", after)
    if before != after:
        mismatches.append(
            dict(
                case="production-safety",
                path="$public",
                reason="Production public files changed during shadow",
            )
        )
    timings = dict(
        python=json.loads((output / "python/runtimes.json").read_text()),
        kotlin=json.loads((kotlin_output / "runtimes.json").read_text()),
    )
    tie_evidence = (
        json.loads((output / "inputs/tie-evidence.json").read_text())
        if not args.quick
        else None
    )
    if tie_evidence:
        live = json.loads(
            (kotlin_output / "archive-tie-regression/prediction.json").read_text()
        )["weighted_consensus"]["candidate_rankings"]["4d_top3"][:2]
        if [r["number"] for r in live] != tie_evidence["numbers"] or any(
            r["reliability_weighted_score"] != tie_evidence["score"] for r in live
        ):
            mismatches.append(
                dict(
                    case="archive-tie-regression",
                    path="$.weighted_consensus.candidate_rankings.4d_top3",
                    reason="real archived tie was not reproduced",
                )
            )
    report = dict(
        full_engine_parity="PASS"
        if not mismatches and not args.quick
        else "QUICK_PASS"
        if not mismatches
        else "FAIL",
        source_sha=manifest["source_sha"],
        python_version=sys.version,
        clock=CLOCK,
        input_sha256=manifest["sha256"],
        run_input_sha256=input_hashes(output),
        cases=[
            {
                k: r[k]
                for k in (
                    "id",
                    "market",
                    "cutoff",
                    "target_date",
                    "records",
                    "input_sha256",
                )
            }
            for r in requests
        ],
        model_matrix_absolute_tolerance=MATRIX_ABS_TOLERANCE,
        published_payload_tolerance=0,
        checks=checks,
        mismatches=mismatches,
        p5_sgp_2026_10_10=p5_evidence,
        output_safety_checks=safety,
        kotlin_output_directory=str(kotlin_output.relative_to(output)),
        archived_tie=tie_evidence,
        oracle_output_sha256={
            str(p.relative_to(output)): sha(p.read_bytes())
            for p in sorted((output / "python").rglob("*"))
            if p.is_file()
        },
        runtimes=timings,
        production_engine="PYTHON_UNCHANGED",
        public_data_modified_by_shadow_run=before != after,
        production_manifest_sha256=sha(
            json.dumps(before, sort_keys=True, separators=(",", ":")).encode()
        ),
    )
    dump(output / "report.json", report)
    lines = [
        "# Python ↔ Kotlin parity",
        f"Status: {report['full_engine_parity']}",
        f"Frozen source: {manifest['source_sha']}",
        f"Mismatch count: {len(mismatches)}",
        "",
        "| Case | Records | Python seconds | Kotlin seconds |",
        "|---|---:|---:|---:|",
    ]
    kotlin_times = {r["id"]: r for r in timings["kotlin"]}
    for r in timings["python"]:
        lines.append(
            f"| {r['id']} | {r['records']} | {r['compute_seconds']:.3f} | {kotlin_times[r['id']]['compute_seconds']:.3f} |"
        )
    lines += [
        "",
        "All published JSON fields compare exactly; only unpublished matrices permit 1e-13 absolute error.",
        "SVG tags, attributes, coordinates, digits, labels and path order compare exactly.",
        "Measurements are sequential compute wall times on the same host; JVM warmup and host load affect timings.",
        "Production files: " + ("UNCHANGED" if before == after else "MODIFIED"),
        "",
        "Mismatch paths:",
    ]
    lines += [
        f"- {m['case']} / {m.get('file', '')} / {m.get('path', '')}: {m['reason']}"
        for m in mismatches[:200]
    ]
    (output / "report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(
        f"{report['full_engine_parity']} mismatches={len(mismatches)} report={output / 'report.json'}",
        flush=True,
    )
    return 1 if mismatches else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:
        # Preserve a reviewable artifact even when compilation/CLI/input setup fails
        # before the structured JSON comparison is reached.
        if "--output" in sys.argv:
            destination = Path(sys.argv[sys.argv.index("--output") + 1]).resolve()
            if (
                "public" not in destination.parts
                and destination != REPO
                and not REPO.is_relative_to(destination)
            ):
                after = public_hashes()
                before = (
                    json.loads((destination / "public-before.json").read_text())
                    if (destination / "public-before.json").exists()
                    else after
                )
                dump(destination / "public-after.json", after)
                dump(
                    destination / "report.json",
                    dict(
                        full_engine_parity="FAIL",
                        blocker=str(error),
                        mismatches=[dict(case="harness", path="$", reason=str(error))],
                        production_engine="PYTHON_UNCHANGED",
                        public_data_modified_by_shadow_run=before != after,
                    ),
                )
                (destination / "report.md").write_text(
                    f"# Python ↔ Kotlin parity\n\nStatus: FAIL\n\nBlocker: {error}\n",
                    encoding="utf-8",
                )
        traceback.print_exc()
        sys.exit(1)
