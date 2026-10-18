import copy
import importlib.util
import json
from pathlib import Path
import struct

import pytest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("native_candidate", ROOT / "scripts/native_candidate.py")
native = importlib.util.module_from_spec(spec)
spec.loader.exec_module(native)
SHA = "a" * 40


def test_versions_increase_across_workflows_attempts_and_owner_floor():
    ledger = {"last_reserved_code": 100141, "reservations": []}
    original = copy.deepcopy(ledger)
    ledger, first = native.allocation(ledger, {"version_code": 100010}, [100141, 100500], 100700, "1", "1", SHA)
    assert original == {"last_reserved_code": 100141, "reservations": []}
    assert (first["legacy_export_code"], first["native_code"]) == (100701, 100702)
    ledger, second = native.allocation(ledger, {"version_code": 100010}, [], 0, "1", "2", SHA)
    assert (second["legacy_export_code"], second["native_code"]) == (100703, 100704)
    with pytest.raises(AssertionError, match="already exists"):
        native.allocation(ledger, {"version_code": 1}, [], 0, "1", "2", SHA)


@pytest.mark.parametrize("value", ["-1", "1.5", "oops", "2100000001"])
def test_invalid_version_input_fails_closed(value):
    with pytest.raises(ValueError):
        native.code(value)


def test_exhausted_android_version_range_stops():
    with pytest.raises(AssertionError, match="exhausted"):
        native.allocation({"last_reserved_code": 2100000000, "reservations": []}, {"version_code": 100010}, [], 0, "2", "1", SHA)


def badging(code=100143, name="2.0.0-native-rc100143", package="com.adipredictor.app", sdk=26):
    return f"package: name='{package}' versionCode='{code}' versionName='{name}'\nsdkVersion:'{sdk}'\nlaunchable-activity: name='com.adipredictor.app.MainActivity'\n"


def test_actual_package_guards_reject_wrong_id_version_min_sdk_and_debuggable():
    assert native.validate_badging(badging(), 100143, "2.0.0-native-rc100143", "native") == 26
    for dump in [badging(package="other.app"), badging(code=1), badging(name="stable"), badging(sdk=27), badging() + "application-debuggable\n"]:
        with pytest.raises(AssertionError):
            native.validate_badging(dump, 100143, "2.0.0-native-rc100143", "native")


def test_dex_guard_reads_actual_superclass_not_unrelated_strings():
    strings = [b"Lcom/adipredictor/app/MainActivity;", b"Landroidx/activity/ComponentActivity;", b"Lcom/getcapacitor/BridgeActivity;"]
    data = bytearray(220)
    data[:8] = b"dex\n035\0"
    struct.pack_into("<4I", data, 56, 3, 112, 3, 124)
    struct.pack_into("<2I", data, 96, 1, 136)
    for i, string in enumerate(strings):
        struct.pack_into("<I", data, 112 + 4 * i, len(data))
        struct.pack_into("<I", data, 124 + 4 * i, i)
        data.extend(bytes([len(string)]) + string + b"\0")
    struct.pack_into("<3I", data, 136, 0, 1, 1)
    assert native.dex_superclass(data, strings[0].decode()) == strings[1].decode()
    struct.pack_into("<I", data, 144, 2)
    assert native.dex_superclass(data, strings[0].decode()) == strings[2].decode()


def test_workflow_is_manual_main_protected_exact_source_and_no_stable_publication():
    workflow = (ROOT / ".github/workflows/android-native-candidate.yml").read_text()
    assert "workflow_dispatch:" in workflow
    assert "push:" not in workflow and "pull_request:" not in workflow
    assert workflow.count("github.ref == 'refs/heads/main'") == 2
    assert "environment: android-release" in workflow
    assert "ref: ${{ needs.reserve.outputs.source_sha }}" in workflow
    assert "persist-credentials: false" in workflow
    assert "scripts/native_candidate.py gate" in workflow and "scripts/native_candidate.py reserve" in workflow
    assert "contents: write" in workflow.split("signed-candidate:")[0]
    assert "contents: write" not in workflow.split("signed-candidate:")[1]
    for ref in ["secrets.ANDROID_KEYSTORE_BASE64", "secrets.ANDROID_KEYSTORE_PASSWORD", "secrets.ANDROID_KEY_ALIAS", "secrets.ANDROID_KEY_PASSWORD", "vars.ANDROID_EXPECTED_CERT_SHA256"]:
        assert ref in workflow
    assert "umask 077" in workflow and 'mkdir -m 700 "$RUNNER_TEMP/native-rc-signing"' in workflow
    assert "if: always()" in workflow and "shred -u" in workflow
    assert "keytool -exportcert" in workflow and "-storepass:env" in workflow
    assert ":app:assembleRelease" in workflow and "working-directory: android-native" in workflow
    assert "scripts/native_candidate.py verify --kind native" in workflow
    assert "scripts/native_candidate.py verify --kind legacy-export" in workflow
    assert "verify_protected_inputs.py --compare" in workflow
    assert workflow.index("Verify stable metadata and protected inputs unchanged") < workflow.index("Upload verified native RC only")
    for forbidden in ["publish_release_metadata.sh", "gh release", "create-release", "-genkeypair", "set -x", "assembleDebug", "force:"]:
        assert forbidden not in workflow


def test_installed_identity_is_separate_from_remote_stable_and_signing_fails_closed():
    gradle = (ROOT / "android-native/app/build.gradle.kts").read_text()
    ui = (ROOT / "android-native/app/src/main/java/com/adipredictor/app/Screens.kt").read_text()
    for field in ["BUILD_CHANNEL", "SOURCE_COMMIT", "UPDATE_CHANNEL_READY"]:
        assert field in gradle and field in ui
    assert '"release-candidate"' in gradle and '"false"' in gradle
    assert "Protected signing unavailable" in gradle and "isDebuggable = false" in gradle
    assert "minSdk = 26" in gradle
    assert "Versi terpasang" in ui and "Metadata stable dari server" in ui
    ledger = json.loads((ROOT / "android-native/release/version-ledger.json").read_text())
    assert ledger["last_reserved_code"] >= 100141


def test_signed_apk_verification_rejects_certificate_and_web_main_ui(monkeypatch, tmp_path):
    import os
    import zipfile
    stable = json.loads((ROOT / 'public/app-release.json').read_text())
    fingerprint = stable['certificate_sha256']
    monkeypatch.setenv('ANDROID_HOME', str(tmp_path))
    monkeypatch.setenv('EXPECTED_CERT_SHA256', fingerprint)
    apk = tmp_path / 'candidate.apk'
    with zipfile.ZipFile(apk, 'w') as z:
        z.writestr('assets/public/index.html', '<html>React shell</html>')
        for abi in ('arm64-v8a', 'armeabi-v7a', 'x86', 'x86_64'):
            z.writestr(f'lib/{abi}/libtest.so', b'fixture')
    args = type('Args', (), dict(apk=str(apk), code='100143', name='2.0.0-native-rc100143', kind='native', source=SHA, output=str(tmp_path / 'report.json')))()
    monkeypatch.setattr(native.subprocess, 'check_output', lambda command, **kwargs: 'Signer #1 certificate SHA-256 digest: ' + '0' * 64 + '\n')
    with pytest.raises(AssertionError, match='signer mismatch'):
        native.verify(args)
    assert not Path(args.output).exists()
    monkeypatch.setattr(native.subprocess, 'check_output', lambda command, **kwargs: ('Signer #1 certificate SHA-256 digest: ' + fingerprint + '\n') if 'apksigner' in command[0] else badging())
    with pytest.raises(AssertionError, match='Web main UI'):
        native.verify(args)
    assert not Path(args.output).exists()


def test_ci_gate_rejects_incomplete_or_failed_exact_source(monkeypatch):
    monkeypatch.setenv('GITHUB_REF', 'refs/heads/main')
    monkeypatch.setenv('GITHUB_SHA', SHA)
    monkeypatch.setattr(native.subprocess, 'check_output', lambda *args, **kwargs: SHA + '\n')
    monkeypatch.setattr(native.subprocess, 'run', lambda *args, **kwargs: None)
    runs = [dict(id=1, name='Android Native Validation', head_sha=SHA, head_branch='main', status='completed', conclusion='success')]
    monkeypatch.setattr(native, 'paginated', lambda *args: runs)
    with pytest.raises(AssertionError, match='Required CI missing: Code Validation'):
        native.require_green(SHA)
    runs.append(dict(id=2, name='Code Validation', head_sha=SHA, head_branch='main', status='in_progress', conclusion=None))
    with pytest.raises(AssertionError, match='Required CI not green: Code Validation'):
        native.require_green(SHA)
    runs[-1].update(status='completed', conclusion='success')
    native.require_green(SHA)
    runs.append(dict(id=3, name='Kotlin Engine Parity', head_sha=SHA, head_branch='main', status='completed', conclusion='failure'))
    with pytest.raises(AssertionError, match='Required CI not green: Kotlin Engine Parity'):
        native.require_green(SHA)
