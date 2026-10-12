#!/usr/bin/env python3
"""Explicit Python rollback only; stage the original engine, never silently fall back."""

import argparse
import hashlib
import json
import os
import shutil
import sys
import tempfile
from datetime import datetime
from pathlib import Path

import prediction_engine as pe


def hashes(directory):
    if not directory.exists():
        return {}
    result = {}
    for path in sorted(directory.rglob("*")):
        if path.is_symlink():
            raise ValueError(f"Symlink forbidden: {path}")
        if path.is_file():
            result[str(path.relative_to(directory))] = hashlib.sha256(
                path.read_bytes()
            ).hexdigest()
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("root", "data", "config", "output", "staging"):
        parser.add_argument("--" + name, required=True, type=Path)
    parser.add_argument("--market", choices=["ALL", *pe.MARKETS], default="ALL")
    parser.add_argument("--force", choices=["true", "false"], default="false")
    parser.add_argument("--simulate", choices=["true", "false"], default="false")
    parser.add_argument("--clock")
    parser.add_argument("--source-id", default="direct-cli")
    parser.add_argument("--build-id", default="direct-cli")
    args = parser.parse_args()
    root = args.root.resolve(strict=True)
    for path, expected in (
        (args.data, root / "public/data"),
        (args.output, root / "public/predictions"),
        (args.config, root / "config/collector_sources.json"),
    ):
        if path.absolute() != expected or path.resolve() != expected:
            raise ValueError(
                "Explicit input/output path is outside the authorized root or uses a symlink"
            )
    staging = args.staging.resolve()
    if (
        args.staging.exists()
        or staging.is_relative_to(root / "public")
        or root.is_relative_to(staging)
    ):
        raise ValueError("Choose fresh staging outside public")
    before = hashes(args.output)
    hashes(args.data)
    markets = pe.MARKETS if args.market == "ALL" else (args.market,)
    inputs = {
        m: hashlib.sha256((args.data / f"{m.lower()}.json").read_bytes()).hexdigest()
        for m in markets
    }
    inputs["config"] = hashlib.sha256(args.config.read_bytes()).hexdigest()
    staging.mkdir(parents=True)
    snapshot_data = staging / "inputs/data"
    shutil.copytree(args.data, snapshot_data)
    snapshot_config = staging / "inputs/config.json"
    shutil.copyfile(args.config, snapshot_config)
    working = staging / "working/public/predictions"
    if args.output.exists():
        shutil.copytree(args.output, working)
    else:
        working.mkdir(parents=True)
    assert inputs == {
        m: hashlib.sha256(
            (snapshot_data / f"{m.lower()}.json").read_bytes()
        ).hexdigest()
        for m in markets
    } | {"config": hashlib.sha256(snapshot_config.read_bytes()).hexdigest()}, (
        "Input moved while snapshotting"
    )
    pe.ROOT = staging / "working"
    pe.DATA_DIR, pe.PRED_DIR, pe.CONFIG_PATH = snapshot_data, working, snapshot_config
    if args.clock:

        class FrozenDateTime(datetime):
            @classmethod
            def now(cls, tz=None):
                result = datetime.fromisoformat(args.clock)
                return result.astimezone(tz) if tz else result.replace(tzinfo=None)

        pe.datetime = FrozenDateTime
    summary = pe.run(markets, force=args.force == "true")
    for market in markets:
        payload = json.loads((working / market.lower() / "latest.json").read_text())
        history = pe.load_history(market)
        assert payload["dataset_fingerprint"] == pe.dataset_fingerprint(market, history)
        assert payload["latest_result"]["number"] == pe.number_of(history[-1])
        assert set(pe.MODELS).issubset(payload["models"])
    after = hashes(working)
    assert set(before).issubset(after), "Rollback may never delete evidence"
    for market in markets:
        basis = pe.load_history(market)[-1]["result_date"]
        prefix = f"{market.lower()}/archive/"
        for relative, digest in before.items():
            if relative.startswith(prefix) and relative.endswith(".json"):
                if Path(relative).stem <= basis:
                    assert after[relative] == digest, (
                        f"Resolved archive changed: {relative}"
                    )
    assert hashes(args.output) == before, "Input output tree moved during staging"
    assert inputs == {
        **{
            m: hashlib.sha256(
                (args.data / f"{m.lower()}.json").read_bytes()
            ).hexdigest()
            for m in markets
        },
        "config": hashlib.sha256(args.config.read_bytes()).hexdigest(),
    }, "Input moved during staging"
    changed = sorted(path for path in after if before.get(path) != after[path])
    originals = {
        path: (args.output / path).read_bytes()
        if (args.output / path).exists()
        else None
        for path in changed
    }
    applied = []
    if args.simulate == "false":
        try:
            for relative in changed:
                target = args.output / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                fd, name = tempfile.mkstemp(prefix=".rollback-", dir=target.parent)
                temporary = Path(name)
                try:
                    with os.fdopen(fd, "wb") as handle:
                        handle.write((working / relative).read_bytes())
                        handle.flush()
                        os.fsync(handle.fileno())
                    os.replace(temporary, target)
                finally:
                    temporary.unlink(missing_ok=True)
                applied.append(relative)
        except Exception:
            for relative in reversed(applied):
                target = args.output / relative
                if originals[relative] is None:
                    target.unlink()
                else:
                    target.write_bytes(originals[relative])
            raise
    report = dict(
        backend="PYTHON_EXPLICIT_ROLLBACK",
        source_id=args.source_id,
        build_identity=args.build_id,
        input_sha256=inputs,
        markets=summary,
        changed_files=changed,
        before=before,
        after=after,
        simulate=args.simulate == "true",
        applied=args.simulate == "false",
    )
    (staging / "report.json").write_text(
        json.dumps(report, ensure_ascii=False, allow_nan=False) + "\n"
    )
    print(
        f"EXECUTOR=PYTHON_EXPLICIT_ROLLBACK SOURCE_ID={args.source_id} FILES_CHANGED={len(changed)} APPLIED={args.simulate == 'false'}"
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(
            f"ENGINE_FAILURE BACKEND=PYTHON_EXPLICIT_ROLLBACK OUTPUT_NOT_PUBLISHED REASON={error}",
            file=sys.stderr,
        )
        sys.exit(1)
