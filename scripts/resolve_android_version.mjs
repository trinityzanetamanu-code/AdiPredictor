import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const packagePath = path.join(projectRoot, 'package.json');
const metadataPath = process.env.ANDROID_RELEASE_METADATA_PATH
  ? path.resolve(process.env.ANDROID_RELEASE_METADATA_PATH)
  : path.join(projectRoot, 'public', 'app-release.json');

function nonNegativeInteger(value, label, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback;
  if (!/^\d+$/.test(String(value))) throw new Error(`${label} must be a non-negative integer`);
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`${label} is out of range`);
  return parsed;
}

const runNumber = nonNegativeInteger(process.env.GITHUB_RUN_NUMBER, 'GITHUB_RUN_NUMBER');
const variableCode = nonNegativeInteger(
  process.env.ANDROID_LAST_RELEASE_VERSION_CODE,
  'ANDROID_LAST_RELEASE_VERSION_CODE',
);
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const releaseMetadata = fs.existsSync(metadataPath)
  ? JSON.parse(fs.readFileSync(metadataPath, 'utf8'))
  : {};
const fileCode = nonNegativeInteger(releaseMetadata.version_code, 'public app-release version_code');
const previousStableVersionCode = Math.max(fileCode, variableCode);
const workflowCode = 100000 + runNumber;
const versionCode = Math.max(workflowCode, previousStableVersionCode + 1);
if (versionCode <= previousStableVersionCode) {
  throw new Error('Resolved versionCode is not greater than the previous stable versionCode');
}
const versionName = `${packageJson.version}+build.${versionCode}`;
const outputs = {
  package_version: packageJson.version,
  previous_stable_version_code: previousStableVersionCode,
  version_code: versionCode,
  version_name: versionName,
};

if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(
    process.env.GITHUB_OUTPUT,
    Object.entries(outputs).map(([key, value]) => `${key}=${value}`).join('\n') + '\n',
    'utf8',
  );
}
console.log(JSON.stringify(outputs));
