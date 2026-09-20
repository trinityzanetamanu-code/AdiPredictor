# Android stable release signing

AdiPredictor permanently uses application ID `com.adipredictor.app`. Pull requests and ordinary CI builds produce `ci-debug` artifacts only. A stable distribution APK is built exclusively by the manually dispatched `Build Stable Android Release` workflow through the protected `android-release` GitHub Environment.

Never commit, upload to an issue, or send the keystore, passwords, or base64 keystore through chat.

## Create the one persistent keystore in Termux

Install the required local tools:

```bash
pkg update
pkg install openjdk-17 openssl-tool coreutils
```

Create a private directory and generate one long-lived RSA signing key. Passwords are entered interactively so they are not stored in shell history:

```bash
umask 077
mkdir -p "$HOME/adipredictor-signing"
keytool -genkeypair -v \
  -keystore "$HOME/adipredictor-signing/adipredictor-release.jks" \
  -storetype JKS \
  -alias adipredictor \
  -keyalg RSA \
  -keysize 4096 \
  -sigalg SHA256withRSA \
  -validity 10000
chmod 600 "$HOME/adipredictor-signing/adipredictor-release.jks"
```

Keep at least one encrypted offline backup. Losing this keystore or either password prevents future in-place updates for every installation signed by it.

## Obtain the public certificate fingerprint

This command prints only the public SHA-256 certificate fingerprint, normalized to lowercase without colons:

```bash
keytool -exportcert -rfc \
  -keystore "$HOME/adipredictor-signing/adipredictor-release.jks" \
  -alias adipredictor \
| openssl x509 -noout -fingerprint -sha256 \
| sed 's/^sha256 Fingerprint=//I; s/://g' \
| tr '[:upper:]' '[:lower:]'
```

Use that public value as the environment variable `ANDROID_EXPECTED_CERT_SHA256`.

## Create the private base64 secret locally

```bash
umask 077
base64 -w 0 "$HOME/adipredictor-signing/adipredictor-release.jks" \
  > "$HOME/adipredictor-signing/adipredictor-release.jks.base64"
chmod 600 "$HOME/adipredictor-signing/adipredictor-release.jks.base64"
wc -c "$HOME/adipredictor-signing/adipredictor-release.jks.base64"
```

The contents of the `.base64` file are the `ANDROID_KEYSTORE_BASE64` secret. Treat that file as private-key material and delete the temporary base64 copy after GitHub is configured; retain the original `.jks` and encrypted backup.

## Configure the protected GitHub Environment

In the repository, open **Settings → Environments → New environment**, name it exactly `android-release`, and configure:

- deployment branch/tag rule: `main` only;
- required reviewer/approval protection if available;
- prevent administrators bypassing protection if appropriate for the account.

Add these **Environment secrets**:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS` with value `adipredictor`
- `ANDROID_KEY_PASSWORD`

Add these **Environment variables**:

- `ANDROID_EXPECTED_CERT_SHA256` with the normalized public fingerprint;
- `ANDROID_LAST_RELEASE_VERSION_CODE`, initially `0` before the first stable release.

## Run and verify two stable releases

After this workflow exists on `main`, open **Actions → Build Stable Android Release → Run workflow**, select `main`, enable `confirm_release`, and run release A. Record only its workflow run ID, public certificate SHA-256, versionCode, and artifact name.

For the first stable installation, uninstall the unrecoverable legacy/debug-signed app once, then install release A. Do not uninstall it again.

Run the workflow a second time from the updated `main` to create release B. Confirm:

- package A and B are both `com.adipredictor.app`;
- `versionCode_B > versionCode_A`;
- `certificate_SHA256_B == certificate_SHA256_A`;
- Android installs B over A without uninstalling A.

Only that device test establishes `ANDROID_UPDATE_IN_PLACE_TEST=PASS`.
