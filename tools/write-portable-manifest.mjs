import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const files = [
  'package.json',
  'index.html',
  'src/main.js',
  'src/shaders.js',
  'src/style.css',
  'src/diagnostic-budget.js',
  'electron/main.cjs',
  'electron/preload.cjs',
  'chrysalis-standalone-autostart.html',
  'chrysalis-standalone-manual.html'
];

function sha256(file) {
  const data = readFileSync(path.join(root, file));
  return createHash('sha256').update(data).digest('hex');
}

const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const manifest = {
  schema: 'chrysalis-portable-manifest-v1',
  name: packageJson.name,
  version: packageJson.version,
  createdAt: new Date().toISOString(),
  platformCreatedOn: process.platform,
  archCreatedOn: process.arch,
  note: 'Critical runtime hashes only. This is for verifying Mac/Windows portable envelopes use the same organism source.',
  files: Object.fromEntries(files.filter(file => existsSync(path.join(root, file))).map(file => [file, sha256(file)]))
};

writeFileSync(path.join(root, 'portable-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('Wrote portable-manifest.json');
for (const [file, hash] of Object.entries(manifest.files)) {
  console.log(`${hash}  ${file}`);
}
