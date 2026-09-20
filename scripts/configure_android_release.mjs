import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const gradlePath = process.env.ANDROID_GRADLE_PATH
  ? path.resolve(process.env.ANDROID_GRADLE_PATH)
  : path.join(projectRoot, 'android', 'app', 'build.gradle');
const applicationId = 'com.adipredictor.app';
const versionCode = Number.parseInt(process.env.ANDROID_VERSION_CODE || '', 10);
const versionName = process.env.ANDROID_VERSION_NAME || '';

if (!Number.isSafeInteger(versionCode) || versionCode < 1) {
  throw new Error('ANDROID_VERSION_CODE must be a positive integer');
}
if (!/^[0-9A-Za-z][0-9A-Za-z.+_-]*$/.test(versionName)) {
  throw new Error('ANDROID_VERSION_NAME contains unsupported characters');
}
if (!fs.existsSync(gradlePath)) {
  throw new Error('android/app/build.gradle is missing; run npx cap add android first');
}

let gradle = fs.readFileSync(gradlePath, 'utf8');
const applicationPattern = new RegExp(`applicationId\\s+["']${applicationId.replaceAll('.', '\\.')}["']`);
if (!applicationPattern.test(gradle)) {
  throw new Error(`Refusing to configure unexpected applicationId; expected ${applicationId}`);
}

gradle = gradle
  .replace(/versionCode\s+\d+/, `versionCode ${versionCode}`)
  .replace(/versionName\s+["'][^"']+["']/, `versionName "${versionName}"`);

const signingHeader = `
def releaseKeystorePath = System.getenv("ANDROID_KEYSTORE_PATH")
def releaseSigningAvailable = releaseKeystorePath &&
        System.getenv("ANDROID_KEYSTORE_PASSWORD") &&
        System.getenv("ANDROID_KEY_ALIAS") &&
        System.getenv("ANDROID_KEY_PASSWORD")
`;

const signingConfig = `    signingConfigs {
        release {
            if (releaseSigningAvailable) {
                storeFile file(releaseKeystorePath)
                storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
                keyAlias System.getenv("ANDROID_KEY_ALIAS")
                keyPassword System.getenv("ANDROID_KEY_PASSWORD")
            }
        }
    }
`;

if (!gradle.includes('def releaseKeystorePath')) {
  gradle = gradle.replace("apply plugin: 'com.android.application'\n", `apply plugin: 'com.android.application'\n${signingHeader}\n`);
}
if (!gradle.includes('signingConfigs {')) {
  gradle = gradle.replace('android {\n', `android {\n${signingConfig}`);
}
if (!gradle.includes('signingConfig signingConfigs.release')) {
  gradle = gradle.replace(
    /(buildTypes\s*\{\s*release\s*\{\n)/,
    '$1            if (releaseSigningAvailable) signingConfig signingConfigs.release\n',
  );
}

if (!gradle.includes(`versionCode ${versionCode}`) || !gradle.includes(`versionName "${versionName}"`)) {
  throw new Error('Failed to apply Android version metadata');
}
for (const required of [
  `applicationId "${applicationId}"`,
  'def releaseKeystorePath',
  'signingConfigs {',
  'signingConfig signingConfigs.release',
]) {
  if (!gradle.includes(required)) {
    throw new Error(`Generated Gradle structure was not patched correctly: ${required}`);
  }
}

fs.writeFileSync(gradlePath, gradle, 'utf8');
console.log(`Configured ${applicationId} versionName=${versionName} versionCode=${versionCode}`);
