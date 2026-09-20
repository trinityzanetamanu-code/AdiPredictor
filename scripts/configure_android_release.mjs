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

if (!process.env.ANDROID_GRADLE_PATH) {
const javaDirectory = path.join(projectRoot, 'android', 'app', 'src', 'main', 'java', 'com', 'adipredictor', 'app');
const mainActivityPath = path.join(javaDirectory, 'MainActivity.java');
const manifestPath = path.join(projectRoot, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
const templateDirectory = path.join(projectRoot, 'scripts', 'android');
if (!fs.existsSync(mainActivityPath) || !fs.existsSync(manifestPath)) {
  throw new Error('Generated Android MainActivity/Manifest is missing');
}
fs.mkdirSync(javaDirectory, { recursive: true });
for (const filename of ['HKVerificationPlugin.java', 'HKVerificationActivity.java']) {
  const source = path.join(templateDirectory, filename);
  if (!fs.existsSync(source)) throw new Error(`Android verification template missing: ${filename}`);
  fs.copyFileSync(source, path.join(javaDirectory, filename));
}

let mainActivity = fs.readFileSync(mainActivityPath, 'utf8');
if (!mainActivity.includes('registerPlugin(HKVerificationPlugin.class)')) {
  mainActivity = mainActivity.replace(
    /public class MainActivity extends BridgeActivity \{\s*\}/,
    `public class MainActivity extends BridgeActivity {\n    @Override\n    public void onCreate(android.os.Bundle savedInstanceState) {\n        registerPlugin(HKVerificationPlugin.class);\n        super.onCreate(savedInstanceState);\n    }\n}`,
  );
}
if (!mainActivity.includes('registerPlugin(HKVerificationPlugin.class)')) {
  throw new Error('Failed to register HKVerificationPlugin in MainActivity');
}
fs.writeFileSync(mainActivityPath, mainActivity, 'utf8');

let manifest = fs.readFileSync(manifestPath, 'utf8');
if (!manifest.includes('.HKVerificationActivity')) {
  manifest = manifest.replace(
    '</application>',
    '        <activity android:name=".HKVerificationActivity" android:exported="false" android:screenOrientation="portrait" />\n    </application>',
  );
}
if (!manifest.includes('.HKVerificationActivity')) throw new Error('Failed to register HKVerificationActivity');
fs.writeFileSync(manifestPath, manifest, 'utf8');
}
console.log(`Configured ${applicationId} versionName=${versionName} versionCode=${versionCode}`);
