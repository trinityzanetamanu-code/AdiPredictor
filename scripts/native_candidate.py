#!/usr/bin/env python3
"""Native RC guards, durable version reservation, and APK verification. No secret values logged."""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import struct
import subprocess
import urllib.error
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
LEDGER = "android-native/release/version-ledger.json"
MAX_CODE = 2_100_000_000
REPO = "trinityzanetamanu-code/AdiPredictor"


def code(value):
    if not re.fullmatch(r"\d+", str(value)) or not 0 <= int(value) <= MAX_CODE:
        raise ValueError("Invalid Android version code")
    return int(value)


def allocation(ledger, stable, artifact_codes, installed, run_id, attempt, source):
    assert re.fullmatch(r"[0-9a-f]{40}", source), "Exact source SHA required"
    identity = f"{run_id}:{attempt}"
    assert not any(x["id"] == identity for x in ledger["reservations"]), "Reservation already exists; dispatch a new run"
    floor = max(code(ledger["last_reserved_code"]), code(stable["version_code"]), code(installed), *[code(x) for x in artifact_codes], 100141)
    assert floor + 2 <= MAX_CODE, "Android versionCode exhausted"
    record = {"id": identity, "source_sha": source, "floor": floor, "legacy_export_code": floor + 1, "native_code": floor + 2}
    return {**ledger, "last_reserved_code": floor + 2, "reservations": [*ledger["reservations"], record]}, record


def api(method, path, body=None):
    # Never include response bodies, request headers or tokens in exceptions/logs.
    request = urllib.request.Request(
        f"https://api.github.com/repos/{REPO}/{path}",
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Authorization": f"Bearer {os.environ['GH_TOKEN']}", "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"},
        method=method,
    )
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"GitHub {method} {path.split('?')[0]} HTTP {error.code}") from None


def paginated(path, key):
    items = []
    for page in range(1, 1001):
        result = api("GET", f"{path}{'&' if '?' in path else '?'}per_page=100&page={page}")
        batch = result[key]
        items.extend(batch)
        if len(batch) < 100:
            return items
    raise RuntimeError("Pagination limit reached; refusing incomplete version inventory")


def read_content(path):
    result = api("GET", f"contents/{path}?ref=main")
    return result, json.loads(base64.b64decode(result["content"]))


def require_green(source):
    assert os.environ["GITHUB_REF"] == "refs/heads/main", "Only main is allowed"
    assert re.fullmatch(r"[0-9a-f]{40}", source), "Exact source SHA required"
    assert subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip() == os.environ["GITHUB_SHA"], "Trusted dispatch checkout mismatch"
    subprocess.run(["git", "merge-base", "--is-ancestor", source, "origin/main"], check=True)
    # An older verified commit is allowed after data-only collector updates, but
    # cannot bypass newly reviewed packaging guards in the dispatched workflow.
    subprocess.run(["git", "diff", "--exit-code", source, os.environ["GITHUB_SHA"], "--",
                    ".github/workflows/android-native-candidate.yml", "scripts/native_candidate.py"], check=True)
    runs = paginated(f"actions/runs?head_sha={source}", "workflow_runs")
    # Parity/lifecycle run on integration changes; when present they must pass too.
    required = {"Android Native Validation", "Code Validation"}
    optional = {"Kotlin Engine Parity", "Kotlin Production Lifecycle"}
    for name in required | optional:
        matching = [r for r in runs if r["name"] == name and r["head_sha"] == source and r["head_branch"] == "main"]
        if not matching and name in optional:
            continue
        assert matching, f"Required CI missing: {name}"
        latest = max(matching, key=lambda r: (r["id"], r.get("run_attempt", 1)))
        assert latest["status"] == "completed" and latest["conclusion"] == "success", f"Required CI not green: {name}"
    print(f"Verified prerequisite CI for {source}")


def reserve(source, installed):
    assert os.environ["GITHUB_REPOSITORY"] == REPO
    artifacts = paginated("actions/artifacts", "artifacts")
    artifact_codes = [int(m[1]) for a in artifacts if (m := re.search(r"-build(\d+)-", a["name"]))]
    package_version = json.loads(subprocess.check_output(["git", "show", f"{source}:package.json"], text=True))["version"]
    assert re.fullmatch(r"[0-9A-Za-z][0-9A-Za-z.+_-]*", package_version), "Invalid package version"
    for _ in range(5):
        content, ledger = read_content(LEDGER)
        _, stable = read_content("public/app-release.json")
        assert stable["channel"] == "stable" and stable["release_signing_runtime_verified"] is True
        updated, record = allocation(ledger, stable, artifact_codes, installed, os.environ["GITHUB_RUN_ID"], os.environ["GITHUB_RUN_ATTEMPT"], source)
        try:
            result = api("PUT", f"contents/{LEDGER}", {
                "message": f"build: reserve native RC versions {record['legacy_export_code']}/{record['native_code']} [skip ci]",
                "content": base64.b64encode((json.dumps(updated, indent=2) + "\n").encode()).decode(),
                "sha": content["sha"], "branch": "main",
            })
        except RuntimeError as error:
            if "HTTP 409" in str(error) or "HTTP 422" in str(error):
                continue
            raise
        outputs = {
            "legacy_code": record["legacy_export_code"], "native_code": record["native_code"],
            "legacy_name": f"{package_version}-legacy-export-rc{record['legacy_export_code']}",
            "native_name": f"{package_version}-native-rc{record['native_code']}",
            "source_sha": source, "reservation_commit": result["commit"]["sha"], "attempt": os.environ["GITHUB_RUN_ATTEMPT"],
        }
        with open(os.environ["GITHUB_OUTPUT"], "a") as output:
            output.write("".join(f"{k}={v}\n" for k, v in outputs.items()))
        print(json.dumps({**outputs, "source_sha": source, "artifact_floor_count": len(artifact_codes)}))
        return
    raise RuntimeError("Version reservation conflict after five safe attempts")


def dex_superclass(data, wanted):
    """Read actual class_defs superclass from a DEX, rather than trusting string presence."""
    assert data[:4] == b"dex\n", "Unexpected DEX"
    string_count, string_offset, type_count, type_offset = struct.unpack_from("<4I", data, 56)
    class_count, class_offset = struct.unpack_from("<2I", data, 96)
    strings = []
    for index in range(string_count):
        position = struct.unpack_from("<I", data, string_offset + 4 * index)[0]
        while data[position] & 0x80:
            position += 1
        position += 1
        strings.append(data[position:data.index(b"\0", position)].decode("utf-8", errors="replace"))
    types = [strings[struct.unpack_from("<I", data, type_offset + 4 * i)[0]] for i in range(type_count)]
    for index in range(class_count):
        this, _, parent = struct.unpack_from("<3I", data, class_offset + 32 * index)
        if types[this] == wanted:
            return types[parent] if parent != 0xFFFFFFFF else None
    return None


def validate_badging(badging, expected_code, expected_name, kind):
    def field(name):
        found = re.search(rf"\b{name}='([^']*)'", badging.splitlines()[0])
        assert found, f"Missing package {name}"
        return found[1]
    assert field("name") == "com.adipredictor.app", "Wrong applicationId"
    assert field("versionCode") == str(code(expected_code)), "Version code mismatch"
    assert field("versionName") == expected_name, "Version name mismatch"
    assert "application-debuggable" not in badging, "Debuggable release rejected"
    minimum = re.search(r"^sdkVersion:'(\d+)'", badging, re.M)
    assert minimum, "Missing minSdk"
    min_sdk = int(minimum[1])
    assert min_sdk == (26 if kind == "native" else 22), "Unexpected minSdk change"
    assert "launchable-activity: name='com.adipredictor.app.MainActivity'" in badging, "Wrong main activity"
    return min_sdk


def verify(args):
    apk = Path(args.apk)
    build_tools = Path(os.environ["ANDROID_HOME"]) / "build-tools/35.0.0"
    certs = subprocess.check_output([str(build_tools / "apksigner"), "verify", "--verbose", "--print-certs", str(apk)], text=True)
    actuals = re.findall(r"^Signer #\d+ certificate SHA-256 digest: ([0-9a-fA-F]+)$", certs, re.M)
    normalize = lambda s: re.sub(r"[:\s]", "", s).lower()
    expected = normalize(os.environ["EXPECTED_CERT_SHA256"])
    stable = json.loads((ROOT / "public/app-release.json").read_text())
    assert re.fullmatch(r"[0-9a-f]{64}", expected), "Invalid protected certificate fingerprint"
    assert actuals == [expected], "APK signer mismatch or multiple signers"
    assert expected == normalize(stable["certificate_sha256"]) == normalize(stable["expected_certificate_sha256"]), "Stable certificate mismatch"
    assert stable["release_signing_runtime_verified"] and stable["channel"] == "stable"
    badging = subprocess.check_output([str(build_tools / "aapt"), "dump", "badging", str(apk)], text=True)
    min_sdk = validate_badging(badging, args.code, args.name, args.kind)
    with zipfile.ZipFile(apk) as archive:
        entries = archive.namelist()
        assert not any(re.search(r"\.(jks|keystore|p12|pfx|pem|key)$", p, re.I) for p in entries), "Signing material in APK"
        abis = sorted({p.split('/')[1] for p in entries if p.startswith("lib/")})
        if args.kind == "native":
            assert abis == ["arm64-v8a", "armeabi-v7a", "x86", "x86_64"], "Unexpected native ABI coverage"
            assert not any(p.startswith("assets/") and re.search(r"\.(html|[cm]?js)$", p) for p in entries), "Web main UI assets in native APK"
            supers = [dex_superclass(archive.read(p), "Lcom/adipredictor/app/MainActivity;") for p in entries if re.fullmatch(r"classes\d*\.dex", p)]
            assert [x for x in supers if x] == ["Landroidx/activity/ComponentActivity;"], "MainActivity is not native ComponentActivity"
            assert any(b"Landroidx/compose/" in archive.read(p) for p in entries if re.fullmatch(r"classes\d*\.dex", p)), "Compose missing"
            dex_bytes = [archive.read(p) for p in entries if re.fullmatch(r"classes\d*\.dex", p)]
            assert all(any(value.encode() in data for data in dex_bytes) for value in (args.source, args.name, "release-candidate")), "Installed build identity missing from actual DEX"
        else:
            assert "assets/public/index.html" in entries, "Legacy export intermediary must retain Capacitor storage origin"
            assert any(b"Tampilkan ekspor data lama" in archive.read(p) for p in entries if p.startswith("assets/public/") and p.endswith(".js")), "Legacy exporter missing from actual APK"
    metadata = {
        "schema_version": 1, "channel": "release-candidate", "package_kind": args.kind,
        "application_id": "com.adipredictor.app", "version_code": code(args.code), "version_name": args.name,
        "source_commit": args.source, "artifact_name": apk.name, "debuggable": False,
        "certificate_sha256": expected, "expected_certificate_match": True, "release_signing_runtime_verified": True,
        "apk_sha256": hashlib.sha256(apk.read_bytes()).hexdigest(), "min_sdk": min_sdk,
        "supported_abis": abis or ["universal (no native libraries)"], "update_channel_ready": False,
        "device_upgrade_status": "NOT_TESTED", "physical_device_test_status": "NOT_TESTED",
        "legacy_signing_key_recoverable": stable["legacy_signing_key_recoverable"],
        "legacy_one_time_reinstall_history": stable["one_time_reinstall_required"],
        "stable_metadata_changed": False, "stable_distribution_switched": False,
    }
    Path(args.output).write_text(json.dumps(metadata, indent=2) + "\n")
    print(json.dumps(metadata))


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    gate = sub.add_parser("gate"); gate.add_argument("--source", required=True)
    reservation = sub.add_parser("reserve"); reservation.add_argument("--source", required=True); reservation.add_argument("--installed", default="0")
    check = sub.add_parser("verify")
    for flag in ("apk", "code", "name", "source", "output"):
        check.add_argument(f"--{flag}", required=True)
    check.add_argument("--kind", choices=["native", "legacy-export"], required=True)
    args = parser.parse_args()
    if args.command == "gate": require_green(args.source)
    elif args.command == "reserve": reserve(args.source, args.installed)
    else: verify(args)


if __name__ == "__main__":
    main()
