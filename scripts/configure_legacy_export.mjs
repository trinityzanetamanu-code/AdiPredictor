// Candidate-only adapter. The stable release workflow/configurator is unchanged.
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const project = path.resolve(process.env.ANDROID_LEGACY_PROJECT_PATH || path.join(root, 'android'));
const java = path.join(project, 'app/src/main/java/com/adipredictor/app');
const gradle = fs.readFileSync(path.join(project, 'app/build.gradle'), 'utf8');
if (!/applicationId\s+["']com\.adipredictor\.app["']/.test(gradle)) throw new Error('Unexpected legacy applicationId');
const main = path.join(java, 'MainActivity.java');
let source = fs.readFileSync(main, 'utf8');
if (!source.includes('extends BridgeActivity') || !source.includes('registerPlugin(HKVerificationPlugin.class);')) throw new Error('Unexpected legacy MainActivity');
for (const file of ['LegacyExportDocument.java', 'LegacyExportPlugin.java']) fs.copyFileSync(path.join(root, 'scripts/android', file), path.join(java, file));
if (!source.includes('registerPlugin(LegacyExportPlugin.class);')) source = source.replace('registerPlugin(HKVerificationPlugin.class);', 'registerPlugin(HKVerificationPlugin.class);\n        registerPlugin(LegacyExportPlugin.class);');
fs.writeFileSync(main, source);
console.log('Configured candidate-only SAF legacy exporter');
