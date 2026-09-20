import json
import os
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "write_android_build_metadata.mjs"


def run_metadata(tmp_path, *, channel, actual="aa:bb", expected="aabb", verified="true"):
    output = tmp_path / "metadata.json"
    env = {
        **os.environ,
        "ANDROID_APPLICATION_ID": "com.adipredictor.app",
        "ANDROID_VERSION_CODE": "100123",
        "ANDROID_VERSION_NAME": "2.0.0+build.100123",
        "ANDROID_ARTIFACT_NAME": "AdiPredictor.apk",
        "ANDROID_BUILD_CHANNEL": channel,
        "ANDROID_CERT_SHA256": actual,
        "ANDROID_EXPECTED_CERT_SHA256": expected,
        "RELEASE_SIGNING_RUNTIME_VERIFIED": verified,
        "ANDROID_METADATA_PATH": str(output),
        "ANDROID_BUILD_DATE": "2026-09-20T00:00:00Z",
    }
    completed = subprocess.run(
        ["node", str(SCRIPT)],
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    return completed, output


def test_stable_release_metadata_requires_matching_certificate(tmp_path):
    completed, output = run_metadata(tmp_path, channel="stable")
    assert completed.returncode == 0, completed.stderr
    payload = json.loads(output.read_text())
    assert payload["application_id"] == "com.adipredictor.app"
    assert payload["certificate_sha256"] == "aabb"
    assert payload["update_channel_ready"] is True


def test_stable_release_metadata_rejects_signer_mismatch(tmp_path):
    completed, output = run_metadata(tmp_path, channel="stable", actual="aabb", expected="ccdd")
    assert completed.returncode != 0
    assert "signer mismatch" in completed.stderr.lower()
    assert not output.exists()


def test_debug_metadata_is_never_an_update_channel(tmp_path):
    completed, output = run_metadata(
        tmp_path,
        channel="ci-debug",
        actual="b30327",
        expected="",
        verified="false",
    )
    assert completed.returncode == 0, completed.stderr
    payload = json.loads(output.read_text())
    assert payload["channel"] == "ci-debug"
    assert payload["release_signing_runtime_verified"] is False
    assert payload["update_channel_ready"] is False
