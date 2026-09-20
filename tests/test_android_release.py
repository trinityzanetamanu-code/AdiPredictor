import json
import os
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "write_android_build_metadata.mjs"
VERSION_SCRIPT = ROOT / "scripts" / "resolve_android_version.mjs"


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


def test_version_code_is_greater_than_previous_stable_metadata(tmp_path):
    metadata = tmp_path / "app-release.json"
    metadata.write_text(json.dumps({"version_code": 100250}))
    output = tmp_path / "github-output.txt"
    env = {
        **os.environ,
        "GITHUB_RUN_NUMBER": "100",
        "ANDROID_RELEASE_METADATA_PATH": str(metadata),
        "GITHUB_OUTPUT": str(output),
    }
    completed = subprocess.run(
        ["node", str(VERSION_SCRIPT)],
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    assert completed.returncode == 0, completed.stderr
    resolved = json.loads(completed.stdout)
    assert resolved["previous_stable_version_code"] == 100250
    assert resolved["version_code"] == 100251
    assert "version_code=100251" in output.read_text()


def test_version_code_honours_environment_last_release_guard(tmp_path):
    metadata = tmp_path / "app-release.json"
    metadata.write_text(json.dumps({"version_code": 100250}))
    env = {
        **os.environ,
        "GITHUB_RUN_NUMBER": "100",
        "ANDROID_RELEASE_METADATA_PATH": str(metadata),
        "ANDROID_LAST_RELEASE_VERSION_CODE": "100400",
    }
    completed = subprocess.run(
        ["node", str(VERSION_SCRIPT)],
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    assert completed.returncode == 0, completed.stderr
    resolved = json.loads(completed.stdout)
    assert resolved["previous_stable_version_code"] == 100400
    assert resolved["version_code"] == 100401


def test_pr_android_workflow_is_debug_only_and_secret_free():
    workflow = (ROOT / ".github" / "workflows" / "deploy.yml").read_text()
    assert "pull_request:" in workflow
    assert "assembleDebug" in workflow
    assert "ci-debug" in workflow
    assert "UPDATE_CHANNEL_READY=false" in workflow
    assert "RELEASE_SIGNING_RUNTIME_VERIFIED=false" in workflow
    assert "assembleRelease" not in workflow
    assert "ANDROID_KEYSTORE_BASE64" not in workflow
    assert "secrets." not in workflow
    assert "Publish Verified Stable Release Metadata" not in workflow


def test_stable_release_workflow_is_manual_and_environment_protected():
    workflow = (ROOT / ".github" / "workflows" / "android-release.yml").read_text()
    assert "workflow_dispatch:" in workflow
    assert "pull_request:" not in workflow
    assert "inputs.confirm_release == true && github.ref == 'refs/heads/main'" in workflow
    assert "environment: android-release" in workflow
    assert '"refs/heads/main"' in workflow
    assert "ref: ${{ github.sha }}" in workflow
    assert "./gradlew assembleRelease" in workflow
    assert "apksigner" in workflow
    assert "ANDROID_EXPECTED_CERT_SHA256" in workflow
    assert "Stable signer certificate mismatch; refusing to publish." in workflow
    assert "apk_version_code > PREVIOUS_STABLE_VERSION_CODE" in workflow
    assert "Publish Verified Stable Release Metadata" in workflow


def test_public_release_metadata_is_either_waiting_or_verified_stable_never_debug():
    metadata = json.loads((ROOT / "public" / "app-release.json").read_text())
    assert metadata["channel"] == "stable"
    if metadata["version_code"] is None:
        assert metadata["certificate_sha256"] is None
        assert metadata["release_signing_runtime_verified"] is False
        assert metadata["update_channel_ready"] is False
    else:
        assert metadata["version_code"] > 0
        assert len(metadata["certificate_sha256"]) == 64
        assert metadata["certificate_sha256"] == metadata["expected_certificate_sha256"]
        assert metadata["release_signing_runtime_verified"] is True
        assert metadata["update_channel_ready"] is True
        assert metadata["artifact_name"].endswith("-stable.apk")
        assert "debug" not in metadata["artifact_name"].lower()


def test_metadata_publisher_rejects_version_rollback_and_cert_rotation():
    publisher = (ROOT / "scripts" / "publish_release_metadata.sh").read_text()
    assert "new_version_code <= current_version_code" in publisher
    assert "new_certificate" in publisher
    assert "current_certificate" in publisher
    assert "Refusing stable certificate rotation" in publisher
