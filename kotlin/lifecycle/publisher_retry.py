#!/usr/bin/env python3
"""Run the real publisher against isolated local Git remotes, never GitHub or owner checkout."""

import argparse
import json
import os
import re
import shlex
import shutil
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "kotlin/parity"))
from compare import dump, public_hashes, sha


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    out = args.output.resolve()
    assert (
        not out.exists() and "public" not in out.parts and not REPO.is_relative_to(out)
    )
    out.mkdir(parents=True)
    owner_before = public_hashes()
    git = shutil.which("git")

    def command(a, cwd=None, **kw):
        return subprocess.run(a, cwd=cwd, check=True, **kw)

    # Build a content-addressed distribution first, then reuse it only if source matches.
    command(
        ["bash", "scripts/build_prediction_engine.sh"],
        cwd=REPO,
        stdout=subprocess.PIPE,
        text=True,
    )
    seed = out / "seed"
    seed.mkdir()
    paths = subprocess.check_output(
        [git, "ls-files", "-co", "--exclude-standard"], cwd=REPO, text=True
    ).splitlines()
    for relative in sorted(set(paths)):
        source = REPO / relative
        if source.is_file():
            target = seed / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
    full = {
        m: sorted(
            json.loads((REPO / f"public/data/{m.lower()}.json").read_text()),
            key=lambda r: r["result_date"],
        )
        for m in ("HK", "SDY", "SGP")
    }
    for m, rows in full.items():
        dump(seed / f"public/data/{m.lower()}.json", rows[:380])
    command([git, "init", "--initial-branch=main"], cwd=seed, stdout=subprocess.PIPE)
    command([git, "config", "user.name", "Lifecycle fixture"], cwd=seed)
    command([git, "config", "user.email", "fixture@example.invalid"], cwd=seed)
    command([git, "add", "."], cwd=seed)
    command(
        [git, "commit", "-m", "isolated lifecycle fixture"],
        cwd=seed,
        stdout=subprocess.PIPE,
    )
    origin = out / "origin.git"
    command(
        [git, "init", "--bare", "--initial-branch=main", str(origin)],
        stdout=subprocess.PIPE,
    )
    command([git, "remote", "add", "origin", str(origin)], cwd=seed)
    command([git, "push", "origin", "main"], cwd=seed, stdout=subprocess.PIPE)

    def clone(name, distribution=REPO):
        root = out / name
        command(
            [git, "clone", "--branch", "main", str(origin), str(root)],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        target = root / "kotlin/production/build/install/production"
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(
            distribution / "kotlin/production/build/install/production", target
        )
        shutil.copyfile(
            distribution / "kotlin/production/build/source-identity.txt",
            root / "kotlin/production/build/source-identity.txt",
        )
        return root

    writer = clone("writer")
    actor = clone("actor")
    command([git, "config", "user.name", "Concurrent actor"], cwd=actor)
    command([git, "config", "user.email", "actor@example.invalid"], cwd=actor)
    new_rows = full["SDY"][:381]
    new_rows[-1] = dict(new_rows[-1], nomor="0000")
    dump(actor / "public/data/sdy.json", new_rows)
    source = actor / "kotlin/production/src/main/kotlin/adipredictor/production/Main.kt"
    source.write_text(
        source.read_text() + "\n// Controlled retry: source advanced concurrently.\n"
    )
    bins = out / "bin"
    bins.mkdir()
    marker = out / "remote-moved"
    q = shlex.quote
    proxy = f"""#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" == push && "$PWD" == {q(str(writer))} && ! -f {q(str(marker))} ]]; then
  {q(git)} -C {q(str(actor))} add public/data/sdy.json kotlin/production/src/main/kotlin/adipredictor/production/Main.kt
  {q(git)} -C {q(str(actor))} commit -m 'controlled concurrent source/data advance' >/dev/null
  {q(git)} -C {q(str(actor))} push origin main
  touch {q(str(marker))}
fi
exec {q(git)} "$@"
"""
    (bins / "git").write_text(proxy)
    (bins / "git").chmod(0o755)
    runner_temp = out / "runner-temp"
    runner_temp.mkdir()

    def publish(root, name, extra=None, path=bins):
        env = {
            **os.environ,
            "PATH": str(path) + os.pathsep + os.environ["PATH"],
            "GITHUB_ACTIONS": "true",
            "GITHUB_WORKSPACE": str(root),
            "RUNNER_TEMP": str(runner_temp),
            "PREDICTION_BACKEND": "kotlin",
            "INCLUDE_COLLECTOR": "0",
            "PREDICTION_FORCE": "0",
            "MAX_PUSH_ATTEMPTS": "3",
            **(extra or {}),
        }
        result = subprocess.run(
            ["bash", "scripts/publish_generated_data.sh"],
            cwd=root,
            env=env,
            capture_output=True,
            text=True,
        )
        (out / f"{name}.log").write_text(result.stdout + result.stderr)
        return result

    result = publish(writer, "retry")
    assert result.returncode == 0, result.stdout + result.stderr
    assert marker.exists() and "discarding stale output" in result.stdout
    identities = re.findall(
        r"EXECUTOR=KOTLIN SOURCE_ID=\S+ BUILD_ID=(\w+)", result.stdout
    )
    assert len(identities) == 2 and identities[0] != identities[1], (
        "Retry must rebuild changed source; not reuse old binary"
    )
    assert "KOTLIN_BUILD SOURCE_IDENTITY=" in result.stderr
    remote = out / "remote-result"
    command(
        [git, "clone", str(origin), str(remote)],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    payload = json.loads((remote / "public/predictions/sdy/latest.json").read_text())
    assert (
        payload["dataset"]["count"] == 381
        and payload["latest_result"]["number"] == "0000"
    )
    assert (
        "Controlled retry"
        in (
            remote / "kotlin/production/src/main/kotlin/adipredictor/production/Main.kt"
        ).read_text()
    )
    for attempt in (1, 2):
        report = json.loads(
            (
                writer / f"prediction-run-reports/attempt-{attempt}/engine-report.json"
            ).read_text()
        )
        assert report["backend"] == "KOTLIN" and report["applied"]
    one = json.loads(
        (writer / "prediction-run-reports/attempt-1/engine-report.json").read_text()
    )
    two = json.loads(
        (writer / "prediction-run-reports/attempt-2/engine-report.json").read_text()
    )
    assert one["input_sha256"]["SDY"] != two["input_sha256"]["SDY"]
    assert "PYTHON_ROLLBACK" not in result.stdout
    # Actual engine error after a collector-created bad dataset must stop all publication.
    failed = clone("failed-engine", writer)
    fake = out / "collector-bin"
    fake.mkdir()
    (fake / "python").write_text(f"""#!/usr/bin/env bash
if [[ "$1" == scripts/collector.py ]]; then printf '[]\\n' > public/data/sdy.json; exit 0; fi
exec {q(sys.executable)} "$@"
""")
    (fake / "python").chmod(0o755)
    before = subprocess.check_output(
        [git, "rev-parse", "main"], cwd=origin, text=True
    ).strip()
    error = publish(failed, "engine-failure", {"INCLUDE_COLLECTOR": "1"}, fake)
    assert error.returncode != 0 and "ENGINE_EXIT=1 SOURCE_EXIT=0" in error.stdout
    assert (
        subprocess.check_output(
            [git, "rev-parse", "main"], cwd=origin, text=True
        ).strip()
        == before
    )
    assert (
        "PUBLICATION=published" not in error.stdout
        and "PYTHON_ROLLBACK" not in error.stdout
    )
    # Source error survives successful engine/publication; diagnostic policy is retained.
    source_failed = clone("failed-source", writer)
    (fake / "python").write_text(f"""#!/usr/bin/env bash
if [[ "$1" == scripts/collector.py ]]; then
  printf '{{"fixture":"HTTP 403 source failure"}}\\n' > public/data/collector-status.json
  echo 'SOURCE_FIXTURE HK HTTP 403' >&2
  exit 1
fi
exec {q(sys.executable)} "$@"
""")
    source_result = publish(
        source_failed, "source-failure", {"INCLUDE_COLLECTOR": "1"}, fake
    )
    assert (
        source_result.returncode == 1
        and "ENGINE_EXIT=0 SOURCE_EXIT=1" in source_result.stdout
    )
    assert (
        "PUBLICATION=published" in source_result.stdout
        and "HTTP 403" in source_result.stderr
    )
    # Already-current predictions do not create another commit, and no force is used.
    unchanged = clone("unchanged", writer)
    before = subprocess.check_output(
        [git, "rev-parse", "main"], cwd=origin, text=True
    ).strip()
    no_change = publish(unchanged, "unchanged")
    assert no_change.returncode == 0 and "PUBLICATION=no-change" in no_change.stdout
    assert (
        subprocess.check_output(
            [git, "rev-parse", "main"], cwd=origin, text=True
        ).strip()
        == before
    )
    assert public_hashes() == owner_before, "Owner repository must remain untouched"
    report = dict(
        result="PASS",
        remote_retry="PASS",
        new_source_rebuilt=True,
        new_data_recalculated=True,
        build_identities=identities,
        stale_output_not_published=True,
        engine_failure_blocks_publication=True,
        source_failure_exit_preserved=True,
        no_change_no_commit=True,
        rollback_automatic=False,
        owner_public_unchanged=True,
        fixture_origin="isolated local bare Git repository; never production GitHub",
    )
    dump(out / "report.json", report)
    print("PUBLISHER_RETRY PASS", flush=True)


if __name__ == "__main__":
    main()
