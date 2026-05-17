import { readFileSync, writeFileSync } from 'node:fs';

function transformDiagnostics(source) {
  return source
    .replace(/export\s+const\s+DEFAULT_DIAGNOSTIC_BUDGET\s+=/, 'const DEFAULT_DIAGNOSTIC_BUDGET =')
    .replace(/export\s+function\s+computeDiagnosticsBudget/, 'function computeDiagnosticsBudget');
}

function transformShaders(source) {
  return source.replace(/^export\s+const\s+/gm, 'const ');
}

function transformMain(source) {
  return source
    .replace(/^import\s+\{[\s\S]*?\}\s+from\s+'\.\/shaders\.js';\n/, '')
    .replace(/^import\s+\{[\s\S]*?\}\s+from\s+'\.\/diagnostic-budget\.js';\n/, '');
}

function buildStandalone({ autostart }) {
  const html = readFileSync('index.html', 'utf8');
  const css = readFileSync('src/style.css', 'utf8');
  const diagnostic = transformDiagnostics(readFileSync('src/diagnostic-budget.js', 'utf8'));
  const shaders = transformShaders(readFileSync('src/shaders.js', 'utf8'));
  const main = transformMain(readFileSync('src/main.js', 'utf8'));

  const script = `<script>\nwindow.CHRYSALIS_OFFLINE_AUTOSTART = ${JSON.stringify(autostart ? 'auto' : '')};\n${diagnostic}\n${shaders}\n${main}\n</script>`;
  return html
    .replace(/\s*<link rel="stylesheet" href="src\/style\.css" \/>/, `\n  <style>\n${css}\n  </style>`)
    .replace(/\s*<script type="module" src="src\/main\.js"><\/script>\s*/, `\n  ${script}\n`);
}

writeFileSync('chrysalis-standalone-autostart.html', buildStandalone({ autostart: true }));
writeFileSync('chrysalis-standalone-manual.html', buildStandalone({ autostart: false }));
console.log('Wrote chrysalis-standalone-autostart.html');
console.log('Wrote chrysalis-standalone-manual.html');
