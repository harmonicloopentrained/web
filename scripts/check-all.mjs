import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const files = [
  'index.html',
  'src/main.js',
  'src/shaders.js',
  'src/style.css',
  'README.md',
  'docs/CHRYSALIS_CORE.md',
  'CHANGELOG.md',
  'QC_HANDOFF_REPORT.md'
];
const loaded = await Promise.all(files.map(read));
const corpus = loaded.join('\n');

function need(source, pattern, message) { if (!pattern.test(source)) throw new Error(message); }
function forbid(source, pattern, message) { if (pattern.test(source)) throw new Error(message); }

const removedTerms = new RegExp(`${'liv'}${'ing'}|${'vau'}${'lt'}`, 'i');
forbid(corpus, removedTerms, 'Reduced ship branch contains removed public terminology.');
need(loaded[0], /id="autonomousResetBtn"/, 'Autonomous reset button must remain.');
need(loaded[0], /id="worldDigOpenBtn"/, 'World Dig controls must remain.');
need(loaded[0], /id="reticleBtn"/, 'Reticle toggle must remain.');
need(loaded[0], /id="saveStateBtn"/, 'Save control must remain.');
forbid(loaded[0], new RegExp(`id=\"${'rec'}${'ord'}Btn\"|Arm ${'Rec'}${'ord'}|Stop ${'Rec'}${'ord'}`), 'Frame capture controls must not be exposed.');
forbid(loaded[0], /id="exportSyntaxBtn"|id="coldBankPanelBtn"|id="residentSignalResetMode"|id="coldBankResetMode"/, 'Removed controls must not be exposed.');
need(loaded[1], /function runAutonomousChunkingReset\(/, 'Autonomous reset implementation missing.');
need(loaded[1], /const AUTONOMY_STEP_CAP_SUBSTEPS = 13;/, 'Full Autonomy must remain capped at 13 substeps.');
need(loaded[1], /function maybeAdaptAutonomy\(/, 'Autonomy adapter missing.');
need(loaded[1], /function startWorldDig\(/, 'World Dig open/dwell function missing.');
need(loaded[1], /function promoteSubspaceChunkToParent\(/, 'World Dig promotion function missing.');
need(loaded[1], /function openProjectiveSubspace\(/, 'Projective Subspace open action missing.');
need(loaded[1], /function saveState\(/, 'Save function missing.');
need(loaded[1], /async function loadStateFromFile\(/, 'Load function missing.');
forbid(loaded[1], new RegExp(`function begin${'Rec'}${'ording'}\\(|function maybeCapture${'Rec'}${'ord'}Frame\\(|function stop${'Rec'}${'ording'}AndDownload\\(|toggle${'Rec'}${'ording'}|${'REC'}${'ORD'}_SCHEMA|CZ${'REC'}001`), 'Frame capture runtime must be absent.');
need(loaded[1], /function resetZero\(options = \{\}\) \{[\s\S]*coldBankActiveMode = 'off';[\s\S]*residentSignal = false;/, 'Reset must force stripped switches off.');
need(loaded[2], /applyAutonomyQuestion/, 'Autonomy shader path missing.');
need(loaded[2], /vec2 escherZoomUv\(/, 'Escher shader lens missing.');
need(loaded[2], /export const promoteChildGLSL/, 'World Dig promotion shader missing.');
const captureTerms = new RegExp(`${'rec'}${'ording'}|Arm ${'Rec'}${'ord'}|Stop ${'Rec'}${'ord'}|\\.${'cz'}${'rec'}|Media${'Rec'}${'order'}`, 'i');
forbid(corpus, captureTerms, 'Frame capture public/runtime terminology must be absent.');
console.log('reduced Pages + macOS branch checks passed');
