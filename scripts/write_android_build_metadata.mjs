import fs from 'node:fs';
import path from 'node:path';

const expectedApplicationId = 'com.adipredictor.app';
const applicationId = process.env.ANDROID_APPLICATION_ID || '';
const versionCode = Number.parseInt(process.env.ANDROID_VERSION_CODE || '', 10);
const versionName = process.env.ANDROID_VERSION_NAME || '';
const artifactName = process.env.ANDROID_ARTIFACT_NAME || '';
const channel = process.env.ANDROID_BUILD_CHANNEL || '';
const outputPath = process.env.ANDROID_METADATA_PATH || '';
const buildDate = process.env.ANDROID_BUILD_DATE || new Date().toISOString();

function fingerprint(value) {
  return String(value || '').replace(/[^0-9a-f]/gi, '').toLowerCase();
}

if (applicationId !== expectedApplicationId) {
  throw new Error(`Unexpected Android application ID: ${applicationId}`);
}
if (!Number.isSafeInteger(versionCode) || versionCode < 1) {
  throw new Error('ANDROID_VERSION_CODE must be a positive integer');
}
if (!versionName || !artifactName || !outputPath) {
  throw new Error('Version name, artifact name, and metadata path are required');
}
if (!['stable', 'release-candidate', 'ci-debug'].includes(channel)) {
  throw new Error('ANDROID_BUILD_CHANNEL must be stable, release-candidate or ci-debug');
}

const actualCertificate = fingerprint(process.env.ANDROID_CERT_SHA256);
const expectedCertificate = fingerprint(process.env.ANDROID_EXPECTED_CERT_SHA256);
const releaseVerified = process.env.RELEASE_SIGNING_RUNTIME_VERIFIED === 'true';

if (channel === 'stable' || channel === 'release-candidate') {
  if (!actualCertificate || !expectedCertificate) {
    throw new Error('Release signing requires actual and expected certificate SHA-256');
  }
  if (actualCertificate !== expectedCertificate) {
    throw new Error(`Stable signer mismatch: actual=${actualCertificate} expected=${expectedCertificate}`);
  }
  if (!releaseVerified) {
    throw new Error('Release metadata requires runtime signing verification');
  }
}

const payload = {
  schema_version: 1,
  channel,
  application_id: applicationId,
  version_name: versionName,
  version_code: versionCode,
  certificate_sha256: actualCertificate || null,
  expected_certificate_sha256: expectedCertificate || null,
  release_signing_runtime_verified: channel !== 'ci-debug' && releaseVerified,
  update_channel_ready: channel === 'stable' && releaseVerified && actualCertificate === expectedCertificate,
  source_commit: process.env.ANDROID_SOURCE_COMMIT || null,
  apk_sha256: fingerprint(process.env.ANDROID_APK_SHA256) || null,
  legacy_signing_key_recoverable: false,
  one_time_reinstall_required: channel !== 'release-candidate',
  artifact_name: artifactName,
  build_date: buildDate,
};

fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
console.log(`Wrote Android ${channel} metadata: ${outputPath}`);
