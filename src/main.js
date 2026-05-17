import { vsGLSL, simGLSL, ruptureGLSL, childInitGLSL, childSimGLSL, portalBackflowGLSL, promoteChildGLSL, renderGLSL } from './shaders.js';
import { DEFAULT_DIAGNOSTIC_BUDGET } from './diagnostic-budget.js';

const canvas = document.getElementById('view');
const panel = document.getElementById('panel');
const corner = document.getElementById('corner');
const uiToggleBtn = document.getElementById('uiToggleBtn');
const el = (id) => document.getElementById(id);
function makeDetachedUiNode() {
  return {
    textContent: '',
    className: '',
    classList: { add() {}, remove() {}, toggle() {} },
    setAttribute() {},
    removeAttribute() {}
  };
}
const statEl = (id) => el(id) || makeDetachedUiNode();
const stats = {
  engine: statEl('engineStat'), matrix: statEl('matrixStat'), tick: statEl('tickStat'), energy: statEl('energyStat'),
  coherence: statEl('coherenceStat'), quality: statEl('qualityStat'), subspace: statEl('subspaceStat'), cpu: statEl('cpuStat'), log: statEl('log')
};
const textureMipInfo = new WeakMap();

const BASE_PRESENT_WIDTH = 1280;
const BASE_PRESENT_HEIGHT = 720;
const BASE_MATRIX_SIZE = 512;
const MATRIX_SIZE = BASE_MATRIX_SIZE; // Legacy default. Active simulation size is selected at runtime.
const CHUNK_GRID = 4;
const MAX_CHUNKS = CHUNK_GRID * CHUNK_GRID;
const TARGET_CHILD_ATLAS_SIZE = 1024;
const TEXTURE_MIPMAPS_ALLOCATED = true;
const TEXTURE_MIPMAPS_DEFAULT_ENABLED = false;
const TEXTURE_MIPMAP_SAFE_LINEAR = true;
const TEXTURE_MIPMAP_MAX_PER_FRAME_BASE = 8;
const TEXTURE_MIPMAP_RENDER_STRENGTH = 0.46;
const TEXTURE_MIPMAP_RENDER_LOD_BASE = 1.35;
const TEXTURE_MIPMAP_PORTAL_LOD_GAIN = 1.15;
const DEPTH_DRAW_POLICY_BASE = 'opaque-discard-front-to-back-depth-v2';
const PORTAL_DEPTH_SORT_LEVEL_WEIGHT = 0.044;
const PORTAL_DEPTH_SORT_AGE_WEIGHT = 0.070;
const PORTAL_DEPTH_SORT_SCALE_WEIGHT = 0.055;
const PORTAL_DEPTH_VISUAL_STRENGTH = 0.62;
const SUBSPACE_BACKFLOW_RATE = 0.035;
const SUBSPACE_DENSITY_BUDGET = 1.0;
const SUBSPACE_SEED_RADIUS_CELLS = 2.0;
const ESCHER_PORTAL_PERIOD = Math.log(256);
const ESCHER_PORTAL_TWIST = 0.50;
const ESCHER_PORTAL_DEPTH_SPEED = 0.18;
const ESCHER_PORTAL_OPEN_DEPTH = ESCHER_PORTAL_PERIOD * 0.50;
const ESCHER_PORTAL_MAX_DEPTH = ESCHER_PORTAL_PERIOD * 1024;
const PORTAL_LADDER_VISIBLE_LIMIT = 2048;
const PORTAL_LADDER_STEP_JITTER = 0.073;
const PORTAL_LADDER_TRANSITION_SECONDS = 7.5;
const PORTAL_TRANSIT_SECONDS = 3.25;
const PORTAL_EXIT_SETTLE_SECONDS = 4.8;
const PORTAL_LATERAL_STEP_RADIUS = 0.062;
const PORTAL_RECENTER_STRENGTH = 0.065;
const PORTAL_ESTABLISH_SETTLE_SECONDS = 2.4;
const PORTAL_ESTABLISHED_CENTER_CAP = 12;
const PORTAL_ROUTE_COMPILE_INTERVAL_SECONDS = DEFAULT_DIAGNOSTIC_BUDGET.portalRouteInterval;
const PORTAL_ROUTE_COMPILE_CENTER_CAP = DEFAULT_DIAGNOSTIC_BUDGET.portalCenterCap;
const AUTONOMY_PLANNER_INTERVAL_SECONDS = DEFAULT_DIAGNOSTIC_BUDGET.autonomyPlannerInterval;
const AUTONOMY_PLANNER_HISTORY_CAP = 768;
const GPU_FEED_OPTIMIZER_INTERVAL_SECONDS = DEFAULT_DIAGNOSTIC_BUDGET.gpuFeedInterval;
const GPU_FEED_OPTIMIZER_HISTORY_CAP = 768;
const GPU_FEED_OPTIMIZER_CENTER_CAP = DEFAULT_DIAGNOSTIC_BUDGET.gpuFeedCenterCap;
const GPU_FEED_CACHE_QUARANTINE_FRAMES = 3;
const ASYNC_BACKFLOW_RING_SIZE = 56;
const ASYNC_BACKFLOW_MIN_INTERVAL_SECONDS = DEFAULT_DIAGNOSTIC_BUDGET.backflowMinInterval;
const ASYNC_BACKFLOW_READY_HISTORY_CAP = 512;
const ASYNC_BACKFLOW_MAX_COMPLETIONS_PER_FRAME = 1;
const RESIDENT_SYNTAX_MIN_INTERVAL_SECONDS = DEFAULT_DIAGNOSTIC_BUDGET.residentSyntaxMinInterval;
const RESIDENT_SYNTAX_WORKER_STRIDE = 3;
const RESIDENT_SYNTAX_POOL_CAP = 144;
const RESIDENT_SYNTAX_HISTORY_CAP = 512;
const RESIDENT_SYNTAX_RELATION_CAP = 768;
const RESIDENT_SYNTAX_AGGRESSIVE = true;
const RESIDENT_SYNTAX_WORKER_COUNT = 2;
const RESIDENT_RESIDENT_SIGNAL_FAST_PATH = true;
const RESIDENT_RESIDENT_SIGNAL_FULL_SCAN_EVERY = 4;
const RESIDENT_RESIDENT_SIGNAL_FULL_SCAN_MIN_SECONDS = 4.8;
const RESIDENT_RESIDENT_SIGNAL_MAX_AGE_TICKS = 384;
const COLD_BANK_LISTEN_REFRESH_MIN_SECONDS = 4.8;
const COLD_BANK_LISTEN_REFRESH_MIN_TICKS = 1024;
const COLD_BANK_SYNTHESIS_CACHE_ENABLED = true;
const COLD_BANK_INCREMENTAL_CONTINUUM_MERGE = true;


// MacBook Air 2019 performance branch: keep autonomy and maintenance work
// on a cheap prime-lane metronome so jobs do not all
// wake in the same render frame. This is cadence/padding only: it does not alter
// step regimes, resolution, mipmaps, shader sampling, or simulation math.
const RUNTIME_RHYTHM_ENABLED = true;
const RUNTIME_RHYTHM_BASE_SOFT_MS = 2.35;
const RUNTIME_RHYTHM_MAX_HEAVY_TASKS = 2;
const RUNTIME_RHYTHM_LANES = {
  gpuFeed: { period: 3, phase: 0 },
  autonomyPlanner: { period: 5, phase: 1 },
  portalRoutes: { period: 7, phase: 3 },
  residentSignal: { period: 11, phase: 5 },
  autonomyScan: { period: 11, phase: 8 },
  phaseLaw: { period: 17, phase: 10 }
};

const AUTONOMY_HYSTERESIS_BASE_CONFIRMATIONS = 2;
const AUTONOMY_HYSTERESIS_JUMP_CONFIRMATIONS = 3;
const AUTONOMY_HYSTERESIS_HIGH_CERTAINTY = 0.84;
const AUTONOMY_HYSTERESIS_SIGNAL_MARGIN = 0.065;
const AUTONOMY_HYSTERESIS_SWITCH_SECONDS = 2.35;
const AUTONOMY_HYSTERESIS_SWITCH_TICKS = 512;
const AUTONOMY_CERTAINTY_MIN_APPLY = 0.54;
const AUTONOMY_PORTAL_ENTER_THRESHOLD = 0.44;
const AUTONOMY_PORTAL_MOVE_THRESHOLD = 0.42;
const AUTONOMY_PORTAL_EXIT_THRESHOLD = 0.58;
const AUTONOMY_PORTAL_BASE_CONFIRMATIONS = 2;
const AUTONOMY_PORTAL_EXIT_CONFIRMATIONS = 3;
const AUTONOMY_PORTAL_HIGH_CERTAINTY = 0.70;
const AUTONOMY_PORTAL_COOLDOWN_SECONDS = 2.8;
const AUTONOMY_PORTAL_ENTER_COOLDOWN_SECONDS = 4.2;
const AUTONOMY_PORTAL_EXIT_COOLDOWN_SECONDS = 5.2;
const AUTONOMY_PORTAL_READY_BLEND = 0.42;
const AUTONOMY_PORTAL_READY_AMOUNT = 0.52;
const AUTONOMY_PORTAL_IDLE_PROBE_SECONDS = 34.0;
const AUTONOMY_PORTAL_FULL_PROBE_SECONDS = 72.0;
const AUTONOMY_PORTAL_STEP_PROBE_SECONDS = 18.0;
const AUTONOMY_PORTAL_PROBE_THRESHOLD = 0.46;
const AUTONOMY_PORTAL_REST_SECONDS = 60.0;
const AUTONOMY_PORTAL_REST_AFTER_ACTIONS = 5;
const AUTONOMY_PORTAL_REST_INTERVAL_SECONDS = 165.0;
const PORTAL_TRANSIT_CENTER_FLUSH_INTERVAL_SECONDS = 13.0;
const AUTONOMY_PORTAL_REST_FLUSH_INTERVAL_SECONDS = 1.0;
const WORLD_DIG_DEFAULT_RADIUS = 0.045;
const WORLD_DIG_HALF_ZOOM_RADIUS = 0.090;
const WORLD_DIG_FULL_SEED_RADIUS_CELLS = SUBSPACE_SEED_RADIUS_CELLS;
const WORLD_DIG_HALF_SEED_RADIUS_CELLS = SUBSPACE_SEED_RADIUS_CELLS * 2.0;
const WORLD_DIG_OPEN_THRESHOLD = 0.62;
const WORLD_DIG_PROMOTE_THRESHOLD = 0.62;
const WORLD_DIG_ABORT_THRESHOLD = 0.78;
const WORLD_DIG_DWELL_MIN_SECONDS = 3.0;
const WORLD_DIG_DWELL_MAX_SECONDS = 5.0;
const WORLD_DIG_SETTLE_SECONDS = 10.0;
const WORLD_DIG_BREAK_ACTIVE_MIN_SECONDS = 118.0;
const WORLD_DIG_BREAK_ACTIVE_JITTER_SECONDS = 44.0;
const WORLD_DIG_BREAK_SECONDS = 160.0;
const WORLD_DIG_BREAK_CLOCK_OFFSET = 37.389;
const CPU_INSTRUMENTATION_ALPHA = 0.12;
const CPU_LONG_FRAME_MS = 30.0;
const FIXED_SIM_DT = 1 / 60;
const MAX_SIM_STEPS_PER_FRAME = 10;
const MAX_SIM_ACCUMULATED_DT = 0.17;
const TAU = Math.PI * 2;
const SAVE_SCHEMA = 'chrysalis-zero-matrix-save-v1';
const ZERO_SYNTAX_SCHEMA = 'chrysalis-zero-syntax-v0.2';
const COLD_MEMORY_SCHEMA = 'chrysalis-syntax-coldBank-v0.1';
const SYNTHESIS_SYNTAX_SCHEMA = 'chrysalis-synthesis-syntax-v0.1';
const ZERO_PHASE_LAW_SCHEMA = 'chrysalis-zero-phase-law-v0.1';
const COMPILED_ZERO_SUM_SCHEMA = 'chrysalis-compiled-zero-sum-v0.2';
const SYMMETRIC_FRONTIER_SCHEMA = 'chrysalis-symmetric-frontier-v0.1';
const COMPILED_ZERO_SUM_TOKEN_CAP = 16;
const SYNTAX_BLOCK_BINDING_POINT = 0;
const SYNTAX_BLOCK_TOKEN_FLOATS = COMPILED_ZERO_SUM_TOKEN_CAP * 4;
const SYNTAX_BLOCK_META_FLOATS = COMPILED_ZERO_SUM_TOKEN_CAP * 4;
const SYNTAX_BLOCK_PORTAL_FLOATS = MAX_CHUNKS * 16;
const SYNTAX_BLOCK_AUTONOMY_OFFSET = SYNTAX_BLOCK_TOKEN_FLOATS + SYNTAX_BLOCK_META_FLOATS + SYNTAX_BLOCK_PORTAL_FLOATS;
const SYNTAX_BLOCK_PHASE_OFFSET = SYNTAX_BLOCK_AUTONOMY_OFFSET + 4;
const SYNTAX_BLOCK_HYSTERESIS_OFFSET = SYNTAX_BLOCK_PHASE_OFFSET + 4;
const SYNTAX_BLOCK_FLOATS = SYNTAX_BLOCK_HYSTERESIS_OFFSET + 4;
const RESIDENT_SIGNAL_SCAN_INTERVAL_TICKS = 1536;
const RESIDENT_SIGNAL_SCAN_INTERVAL_SECONDS = 1.15;
const RESIDENT_SIGNAL_MAX_TOKENS = 96;
const SUM_LAYER_TOKEN_LIMIT = 36;
const ONE_SUM_MAX_ADDRESSES = 80;
const TWO_SUM_MAX_ADDRESSES = 56;
const THREE_SUM_MAX_ADDRESSES = 40;
const COLD_BANK_CONTINUUM_ASSIMILATE_INTERVAL_TICKS = 768;
const COLD_BANK_CONTINUUM_ASSIMILATE_INTERVAL_SECONDS = 6.5;
const COLD_BANK_CONTINUUM_WORLD_LIMIT = 256;
const COLD_BANK_PROTECTED_SYNTHESIS_LIMIT = 48;
const AUTONOMY_COLD_BANK_WORK_DISTILL_INTERVAL_TICKS = 4096;
const AUTONOMY_COLD_BANK_WORK_DISTILL_INTERVAL_SECONDS = 24.0;
const PHASE_LAW_MACRO_COUNT = 12;
const PHASE_LAW_FULLNESS_START_THRESHOLD = 0.999;
const PHASE_LAW_NO_BIRTH_SECONDS = 30;
const PHASE_LAW_RECENT_ATTEMPT_LIMIT = 8;
const PHASE_LAW_DENSITY_MACRO_NAMES = [
  'nyquist-checkerboard',
  'crossed-parity',
  'four-phase-chiral',
  'nested-octave',
  'walsh-hadamard',
  'quasicrystal-pentagrid',
  'skyrmion-vortex',
  'coprime-moire',
  'chladni-eigenmode',
  'fresnel-focus',
  'golden-phyllotaxis',
  'hex-atomic'
];
const PERFORMANCE_UI_MINIMAL = true;
const RUNTIME_READOUTS_ENABLED = false;
const RUNTIME_HUD_ENABLED = false;
const CPU_PHASE_INSTRUMENTATION_ENABLED = false;
const UI_UPDATE_INTERVAL_MS = 5000;
const UI_UPDATE_INTERVAL_HIDDEN_MS = 5000;
const MAX_GPU_SUBSTEPS_PER_FRAME = 108;
const AUTONOMY_SCAN_INTERVAL_TICKS = 256;
const AUTONOMY_SCAN_INTERVAL_SECONDS = 0.85;
const AUTONOMY_ROUTE_MIN_TICKS = 384;
const AUTONOMY_ROUTE_MIN_SECONDS = 1.8;
const SYMMETRIC_FRONTIER_GLOBAL_INTERVAL_TICKS = 4608;
const SYMMETRIC_FRONTIER_GLOBAL_TIME_SCALE = 0.733038;
const SYMMETRIC_FRONTIER_GLOBAL_INTERVAL_LOCAL_SECONDS = 3.66519;
const SYMMETRIC_FRONTIER_GLOBAL_INTERVAL_SECONDS = SYMMETRIC_FRONTIER_GLOBAL_INTERVAL_LOCAL_SECONDS * SYMMETRIC_FRONTIER_GLOBAL_TIME_SCALE;
const SYMMETRIC_FRONTIER_MAX_SIGNATURES = 3072;
const SYMMETRIC_FRONTIER_MEMORY_LIMIT = 8192;
const FRONTIER_MEMORY_BANK_LIMIT = 512;
const FRONTIER_COMPILED_BINDING_LIMIT = 128;
const FRONTIER_SCAN_STRIDE_MIN = 4;
const FRONTIER_SCAN_STRIDE_MAX = 24;
const BASE_FRAME_BYTE_LENGTH = MATRIX_SIZE * MATRIX_SIZE * 4 * Float32Array.BYTES_PER_ELEMENT;
function matrixFrameByteLength(size = app?.size || currentMatrixSize()) {
  const n = Math.max(1, Math.floor(Number(size) || MATRIX_SIZE));
  return n * n * 4 * Float32Array.BYTES_PER_ELEMENT;
}
const CHURN_DEBUG = false;
const HOT_GL_ERROR_CHECKS = false;
const SUBSPACE_PATCH_OFFSETS = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];
const SUBSPACE_POINTER_CELLS = new Int32Array(MAX_CHUNKS * 2);
const SUBSPACE_POINTER_VALUES = new Float32Array(MAX_CHUNKS);
const SUBSPACE_PORTAL_FRAME_AXES = new Float32Array(MAX_CHUNKS * 4);
const SUBSPACE_PORTAL_FRAME_META = new Float32Array(MAX_CHUNKS * 4);
const HOT_SIM_TEXEL = new Float32Array(2);
const HOT_RENDER_TEXEL = new Float32Array(2);
const HOT_VIEWPORT_PX = new Float32Array(2);
const HOT_CHUNK_SCALE = new Float32Array([1 / CHUNK_GRID, 1 / CHUNK_GRID]);
const HOT_PORTAL_PARENT_CELL = new Int32Array(2);
const HOT_PORTAL_FRAME_PACKET = { axes: SUBSPACE_PORTAL_FRAME_AXES, meta: SUBSPACE_PORTAL_FRAME_META, tick: -1, epoch: -1 };
const HOT_CHUNK_ORIGINS = Array.from({ length: MAX_CHUNKS }, (_, id) => new Float32Array([(id % CHUNK_GRID) / CHUNK_GRID, Math.floor(id / CHUNK_GRID) / CHUNK_GRID]));
let subspacePointerUniformEpoch = -1;
let subspacePointerUniformCount = 0;
let frameSerial = 0;

function setHotVec2(out, x, y) {
  out[0] = x;
  out[1] = y;
  return out;
}
function simTexelUniform(size) {
  const inv = 1 / Math.max(1, Number(size) || 1);
  return setHotVec2(HOT_SIM_TEXEL, inv, inv);
}
function renderTexelUniform(size) {
  const inv = 1 / Math.max(1, Number(size) || 1);
  return setHotVec2(HOT_RENDER_TEXEL, inv, inv);
}
function viewportPxUniform() {
  return setHotVec2(HOT_VIEWPORT_PX, canvas.width || 0, canvas.height || 0);
}
function portalParentCellUniform(record) {
  HOT_PORTAL_PARENT_CELL[0] = record?.cell?.x || 0;
  HOT_PORTAL_PARENT_CELL[1] = record?.cell?.y || 0;
  return HOT_PORTAL_PARENT_CELL;
}

const subspace = {
  chunks: Array.from({ length: MAX_CHUNKS }, () => null),
  active: [],
  byKey: new Map(),
  pendingPointers: [],
  pendingInits: [],
  lastPortal: null,
  allocationEpoch: 0
};

const RESOLUTION_OPTIONS = [
  { name: 'lean', label: 'lean · 960×540', presentationScale: 0.75 },
  { name: 'native', label: 'native · 1280×720', presentationScale: 1.0 },
  { name: 'native-tall', label: 'native tall · 1440×900', width: 1440, height: 900 }
];
const SIMULATION_PIXEL_SCALE_OPTIONS = [
  { name: 'sim-1x', label: '1× · 512² organism pixels', shortLabel: '1× 512²', scale: 1.0, size: 512, dropdownOrder: 0 },
  { name: 'sim-1-25x', label: '1.25× · 640² organism pixels', shortLabel: '1.25× 640²', scale: 1.25, size: 640, dropdownOrder: 1 },
  { name: 'sim-1-5x', label: '1.5× · 768² organism pixels', shortLabel: '1.5× 768²', scale: 1.5, size: 768, dropdownOrder: 2 },
  { name: 'sim-1-75x', label: '1.75× · 896² organism pixels', shortLabel: '1.75× 896²', scale: 1.75, size: 896, dropdownOrder: 3 },
  { name: 'sim-2x', label: '2× · 1024² organism pixels', shortLabel: '2× 1024²', scale: 2.0, size: 1024, dropdownOrder: 4 },
  { name: 'sim-3x-experimental', label: '3× · 1536² organism pixels · experimental', shortLabel: '3× 1536² experimental', scale: 3.0, size: 1536, dropdownOrder: 5, experimental: true }
];
const VIEWING_MODES = [
  { name: 'native', label: 'native · current witness', visualMode: 0, topography: 0.0, sharpen: 0.00, contrast: 1.00 },
  { name: 'crisp', label: 'crisp · sharpened witness', visualMode: 0, topography: 0.0, sharpen: 0.35, contrast: 1.08 },
  { name: 'topographic', label: 'topographic · derivative normals', visualMode: 1, topography: 1.0, sharpen: 0.18, contrast: 1.06 },
  { name: 'oklch', label: 'OKLCH · phase/coherence topography', visualMode: 2, topography: 1.0, sharpen: 0.08, contrast: 1.02 }
];
const MIPMAP_RENDER_MODES = [
  { value: 'off', label: 'mipmaps off · level 0 only', shortLabel: 'mips off', strength: 0.00, lodBase: 0.00, portalGain: 0.00, maxPerFrame: 0 },
  { value: 'mild', label: 'mipmaps mild · light pyramid', shortLabel: 'mips mild', strength: 0.24, lodBase: 0.85, portalGain: 0.70, maxPerFrame: 4 },
  { value: 'strong', label: 'mipmaps strong · v0.3.21 look', shortLabel: 'mips strong', strength: TEXTURE_MIPMAP_RENDER_STRENGTH, lodBase: TEXTURE_MIPMAP_RENDER_LOD_BASE, portalGain: TEXTURE_MIPMAP_PORTAL_LOD_GAIN, maxPerFrame: TEXTURE_MIPMAP_MAX_PER_FRAME_BASE },
  { value: 'deep', label: 'mipmaps deep · heavy portal pyramid', shortLabel: 'mips deep', strength: 0.68, lodBase: 1.75, portalGain: 1.65, maxPerFrame: 12 }
];
const DEPTH_EFFECT_MODES = [
  { value: 'off', label: 'depth off · flat portal composite', shortLabel: 'depth off', strength: 0.00, policy: 'disabled-flat-composite' },
  { value: 'on', label: 'depth on · v0.3.21 ordering', shortLabel: 'depth on', strength: PORTAL_DEPTH_VISUAL_STRENGTH, policy: DEPTH_DRAW_POLICY_BASE },
  { value: 'strong', label: 'depth strong · deeper portal stack', shortLabel: 'depth strong', strength: 0.88, policy: 'opaque-front-transparent-back-depth-strong' }
];
const PIXEL_BLEND_MODES = [
  { value: 'off', label: 'pixel blend off · crisp texels', shortLabel: 'blend off', strength: 0.00, radius: 1.0 },
  { value: 'soft', label: 'pixel blend soft · 4-neighbor state mix', shortLabel: 'blend soft', strength: 0.18, radius: 1.0 },
  { value: 'wide', label: 'pixel blend wide · 8-neighbor state mix', shortLabel: 'blend wide', strength: 0.34, radius: 1.5 }
];
const STEP_REGIMES = [
  { name: 'q1-1', label: '1 full step · Q1 slow witness', substeps: 1 },
  { name: 'primordial-2', label: '2 full steps · primordial universe', substeps: 2 },
  { name: 'triad-3', label: '3 full steps · triad field', substeps: 3 },
  { name: 'four-4', label: '4 full steps · balanced bridge', substeps: 4 },
  { name: 'six-6', label: '6 full steps · single-fold chunk', substeps: 6 },
  { name: 'seven-7', label: '7 full steps · odd macro beat', substeps: 7 },
  { name: 'singularity-13', label: '13 full steps · singularity probe', substeps: 13 },
  { name: 'architecture-42', label: '42 full steps · 7×6 architecture', substeps: 42, chunkCount: 7, chunkSubsteps: 6 },
  { name: 'deep-108', label: '108 full steps · 18×6 deep probe', substeps: 108, chunkCount: 18, chunkSubsteps: 6 },
  { name: 'deep-112', label: '112 full steps · deep probe', substeps: 112 },
  { name: 'riemann-solver', label: 'Riemann Solver Mode · shock-tube world', substeps: 6, chunkCount: 1, chunkSubsteps: 6, riemannMode: true, dropdownOrder: -1 }
];
const VIEW_MODES = [
  { value: 7, name: 'inverted-light-lattice', label: 'inverted light lattice · boundary-carved color' },
  { value: 6, name: 'triune-chiral-pineal', label: 'triune chiral / pineal viewport' },
  { value: 0, name: 'pure-anatomy', label: 'pure anatomy' },
  { value: 1, name: 'difference-pressure', label: 'difference pressure' },
  { value: 2, name: 'coherence-cancellation', label: 'coherence / cancellation' },
  { value: 3, name: 'hidden-4d-axes', label: 'hidden 4D axes' },
  { value: 4, name: 'curvature-residue', label: 'curvature residue' },
  { value: 5, name: 'helix-curl-witness', label: 'helix / curl witness' }
];
const RESIDENT_SIGNAL_RESET_MODES = [
  { value: 'off', label: 'off · pristine reset', shortLabel: 'pristine' },
  { value: 'regular', label: 'regular Resident Signal · no pinned descent', shortLabel: 'regular Resident Signal' },
  { value: 'pinned', label: 'Pinned Descent + Resident Signal · current handshake build', shortLabel: 'Pinned Descent + Resident Signal' }
];
const COLD_BANK_RESET_MODES = [
  { value: 'off', label: 'off · fresh world only', shortLabel: 'coldBank off', activeLabel: 'coldBank off', shaderMode: 0 },
  { value: 'work', label: 'ColdBank Work Mode · compress imported syntax', shortLabel: 'ColdBank Work Mode', activeLabel: 'COLD_BANK WORK · syntax-on-syntax compression', shaderMode: 1 },
  { value: 'continuum', label: 'Continuum Mode · live world uses distilled syntax', shortLabel: 'Continuum Mode', activeLabel: 'CONTINUUM · distilled syntax bound to live fold', shaderMode: 2 }
];
const AUTONOMOUS_MODES = [
  { value: 'riemann', label: 'Riemann Autonomy', shortLabel: 'Riemann Autonomy' },
  { value: 'full1', label: 'Full Autonomy · 1 max step count', shortLabel: 'Full Autonomy · 1 max', stepCap: 1 },
  { value: 'full2', label: 'Full Autonomy · 2 max step count', shortLabel: 'Full Autonomy · 2 max', stepCap: 2 },
  { value: 'full3', label: 'Full Autonomy · 3 max step count', shortLabel: 'Full Autonomy · 3 max', stepCap: 3 },
  { value: 'full4', label: 'Full Autonomy · 4 max step count', shortLabel: 'Full Autonomy · 4 max', stepCap: 4 },
  { value: 'full7', label: 'Full Autonomy · 7 step regime cap', shortLabel: 'Full Autonomy · 7 cap', stepCap: 7 },
  { value: 'full', label: 'Full Autonomy · 13 step regime cap', shortLabel: 'Full Autonomy · 13 cap', stepCap: 13 }
];
const ESCHER_ZOOM_MODES = [
  { value: 'soft', label: 'soft · mirror wrapped witness', shaderMode: 0 },
  { value: 'hard', label: 'hard · fract hyperspace wrap', shaderMode: 1 }
];
const COLD_BANK_INFLUENCE_SOURCES = [
  { value: 'stack', label: 'stack · imported world evidence' },
  { value: 'distilled', label: 'distilled synthesis only' }
];

const FRONTIER_ROUTE_PORTS = [
  'compress',
  'explore',
  'audit',
  'rest',
  'syntax',
  'coldBank',
  'phaseLaw',
  'render',
  'zeroSum'
];
const FRONTIER_MEMORY_BANKS = {
  hot: { source: 'current-run', influence: 1.0, note: 'current scan signatures' },
  warm: { source: 'recent-erasure', influence: 0.55, note: 'recent erased signatures' },
  cold: { source: 'coldBank-imports', influence: 0.0, note: 'imported synthesis/save signatures' },
  failed: { source: 'retired', influence: 0.0, note: 'low-trust retired signatures' }
};
const FRONTIER_KIND_PATTERNS = {
  zeroSum: /zero|sum|compiled|cancel/,
  visual: /plateau|zero|phase-law/,
  coldBank: /plateau|coldBank|zero|sum|compiled|cancel/,
  phaseLaw: /phase-law/,
  autonomy: /autonomy/,
  plateau: /plateau/
};
const FRONTIER_GATE_MIX = {
  compiledZeroSum: { syntax: [1.0, 1.15], audit: [1.0, 0.86] },
  coldBankSignal: { coldBank: [1.0, 1.10], audit: [1.0, 0.92] },
  auditCadence: { audit: [1.0, 0.70], explore: [1.0, 0.86], rest: [1.0, 1.18] },
  scanStride: { audit: [1.0, 0.70], explore: [1.0, 0.78], compress: [1.0, 1.18], rest: [1.0, 1.28] },
  phaseLaw: { phaseLaw: [1.0, 1.20], audit: [1.0, 0.88] }
};
const FRONTIER_COLD_MEMORY_INFLUENCE = { off: 0.0, work: 0.18, continuum: 1.0 };
const FRONTIER_COMPILED_BINDING_BANKS = ['hot', 'warm', 'cold'];
const AUTONOMY_STEP_CAP_SUBSTEPS = 13;
const AUTONOMY_STEP_CAP_7_SUBSTEPS = 7;
const AUTONOMY_STEP_REGIME_NAMES = [
  'q1-1',
  'primordial-2',
  'triad-3',
  'four-4',
  'six-6',
  'seven-7',
  'singularity-13'
];
const AUTONOMY_SIGNAL_LADDER = [
  { ceiling: 0.12, regime: 'q1-1' },
  { ceiling: 0.24, regime: 'primordial-2' },
  { ceiling: 0.37, regime: 'triad-3' },
  { ceiling: 0.50, regime: 'four-4' },
  { ceiling: 0.65, regime: 'six-6' },
  { ceiling: 0.80, regime: 'seven-7' },
  { ceiling: Infinity, regime: 'singularity-13' }
];

const SIM_UNIFORMS = {
  uPrev: ['1i', () => 0],
  uTexel: ['2f', ({ size }) => simTexelUniform(size)],
  uDt: ['1f', ({ subDt }) => subDt],
  uPinnedDescent: ['1f', () => pinnedDescent ? 1.0 : 0.0],
  uResidentSignal: ['1f', () => residentSignal ? 1.0 : 0.0],
  uResidentSignalFullness: ['1f', () => residentSignalFullness],
  uResidentSignalEpoch: ['1f', () => residentSignalEpoch],
  uCompiledZeroSumActive: ['1f', () => residentSignal && compiledZeroSumLayer.active ? 1.0 : 0.0],
  uCompiledZeroSumCount: ['1i', () => residentSignal && compiledZeroSumLayer.active ? compiledZeroSumLayer.tokenCount : 0],
  uCompiledZeroSumGain: ['1f', () => residentSignal && compiledZeroSumLayer.active ? effectiveCompiledZeroSumGain() : 0.0],
  'uCompiledZeroSumTokens[0]': ['4fv', () => compiledZeroSumLayer.arrays.tokens],
  'uCompiledZeroSumMeta[0]': ['4fv', () => compiledZeroSumLayer.arrays.meta],
  uUseSyntaxBlock: ['1f', () => app?.syntaxHardware?.ready ? 1.0 : 0.0],
  uColdBankMode: ['1i', () => coldBankModeShaderValue(coldBankActiveMode)],
  uColdBankFullness: ['1f', () => effectiveColdBankSignal(coldBankFullness)],
  uColdBankTension: ['1f', () => effectiveColdBankSignal(coldBankTension)],
  uColdBankAxisPhase: ['1f', () => coldBankAxisPhase],
  uColdBankPlateauPressure: ['1f', () => effectiveColdBankSignal(coldBankPlateauPressure)],
  uColdBankTokenPressure: ['1f', () => effectiveColdBankSignal(coldBankTokenPressure)],
  uColdBankMarriagePressure: ['1f', () => effectiveColdBankSignal(coldBankMarriagePressure)],
  uRiemannMode: ['1f', () => currentStepRegime().riemannMode ? 1.0 : 0.0],
  uAutonomyActive: ['1f', () => autonomousActive && isFullAutonomyMode(autonomousMode) ? 1.0 : 0.0],
  uAutonomyPressure: ['1f', () => autonomyPressure],
  uAutonomyPhase: ['1f', () => autonomyPhase],
  uAutonomyNovelty: ['1f', () => autonomyNovelty],
  uAutonomyStagnation: ['1f', () => autonomyStagnation],
  uZeroPhaseLawEvent: ['1f', () => phaseLaw.eventActive ? 1.0 : 0.0],
  uZeroPhaseLawAxisPhase: ['1f', () => Number(phaseLaw.axisPhase || 0)],
  uZeroPhaseLawAmplitude: ['1f', () => Math.max(0.0001, Number(phaseLaw.amplitudeMean || 0.0001))],
  uZeroPhaseLawMacroIndex: ['1f', () => Math.max(0, Number(phaseLaw.eventMacroIndex || 0))],
  uZeroPhaseLawAttempt: ['1f', () => Math.max(0, Number(phaseLaw.eventAttempt || 0))],
  uSubspacePointerCount: ['1i', () => fillSubspacePointerUniforms()],
  'uSubspacePointerCells[0]': ['2iv', () => SUBSPACE_POINTER_CELLS],
  'uSubspacePointerValues[0]': ['1fv', () => SUBSPACE_POINTER_VALUES]
};
const SIM_SUBSTEP_UNIFORMS = {
  uTime: ['1f', () => simTime]
};
const RENDER_UNIFORMS = {
  uState: ['1i', () => 0],
  uChildState: ['1i', () => 1],
  uMipStrength: ['1f', () => Number(mipmapMode().strength || 0)],
  uMipLodBase: ['1f', () => Number(mipmapMode().lodBase || 0)],
  uMipPortalGain: ['1f', () => Number(mipmapMode().portalGain || 0)],
  uStateMipMaxLod: ['1f', ({ size }) => mipmapRenderingEnabled() ? Math.max(0, mipLevelCount(size) - 1) : 0],
  uChildMipMaxLod: ['1f', () => mipmapRenderingEnabled() ? (app?.childAtlasSize ? Math.max(0, mipLevelCount(app.childAtlasSize) - 1) : Math.max(0, mipLevelCount(MATRIX_SIZE) - 1)) : 0],
  uDepthEffectStrength: ['1f', () => Number(depthMode().strength || 0)],
  uPixelBlendStrength: ['1f', () => Number(pixelBlendModeEntry().strength || 0)],
  uPixelBlendRadius: ['1f', () => Number(pixelBlendModeEntry().radius || 1.0)],
  uTexel: ['2f', ({ size }) => renderTexelUniform(size)],
  uView: ['1i', () => viewMode],
  uVisualMode: ['1i', () => currentViewingMode().visualMode || 0],
  uTopography: ['1f', () => currentViewingMode().topography || 0],
  uSharpen: ['1f', () => currentViewingMode().sharpen || 0],
  uContrast: ['1f', () => currentViewingMode().contrast || 1],
  uTime: ['1f', () => simTime],
  uViewportPx: ['2f', () => viewportPxUniform()],
  uPinnedDescent: ['1f', () => pinnedDescent ? 1.0 : 0.0],
  uResidentSignal: ['1f', () => residentSignal ? 1.0 : 0.0],
  uResidentSignalFullness: ['1f', () => residentSignalFullness],
  uResidentSignalEpoch: ['1f', () => residentSignalEpoch],
  uColdBankMode: ['1i', () => coldBankModeShaderValue(coldBankActiveMode)],
  uColdBankFullness: ['1f', () => effectiveColdBankSignal(coldBankFullness)],
  uColdBankTension: ['1f', () => effectiveColdBankSignal(coldBankTension)],
  uColdBankAxisPhase: ['1f', () => coldBankAxisPhase],
  uColdBankPlateauPressure: ['1f', () => effectiveColdBankSignal(coldBankPlateauPressure)],
  uColdBankTokenPressure: ['1f', () => effectiveColdBankSignal(coldBankTokenPressure)],
  uColdBankMarriagePressure: ['1f', () => effectiveColdBankSignal(coldBankMarriagePressure)],
  uEscherActive: ['1f', () => portalRenderActive() ? 1.0 : 0.0],
  uEscherMode: ['1i', () => escherZoomModeIndex()],
  uEscherFocus: ['2f', () => escherZoomActive ? portalLadderRenderFocus() : escherZoomFocus],
  uEscherDepth: ['1f', () => escherZoomDepth],
  uEscherPeriod: ['1f', () => ESCHER_PORTAL_PERIOD],
  uEscherTwist: ['1f', () => ESCHER_PORTAL_TWIST],
  uPortalLadderLevel: ['1f', () => portalLadder.level],
  uPortalLadderDirection: ['1f', () => portalLadder.direction],
  uPortalLadderFocus: ['2f', () => portalLadderRenderFocus()],
  uPortalLadderPhase: ['1f', () => portalLadderRenderPhase()],
  uPortalLadderCrossings: ['1f', () => portalLadder.crossings],
  uPortalLadderBlend: ['1f', () => portalLadderTransitionSmooth()],
  uPortalTransitBlend: ['1f', () => portalTransitBlend()],
  uPortalFreedom: ['1f', () => portalFreedom()],
  uSubspaceActive: ['1f', () => activeChunkCount() > 0 ? 1.0 : 0.0],
  uWorldDigActive: ['1f', () => worldDig.active || worldDig.mode === 'dwell' || worldDig.mode === 'open' ? 1.0 : 0.0],
  uWorldDigFocus: ['2f', () => worldDigRenderFocus()],
  uWorldDigRadius: ['1f', () => worldDigRenderRadius()],
  uWorldDigDwell: ['1f', () => worldDigDwellSeconds()],
  uReticleVisible: ['1f', () => reticleVisible ? 1.0 : 0.0],
  uMacroSize: ['1f', ({ size }) => size],
  uChunkGrid: ['1f', () => CHUNK_GRID],
  'uPortalFrameAxes[0]': ['4fv', () => fillSubspacePortalFrameUniforms().axes],
  'uPortalFrameMeta[0]': ['4fv', () => fillSubspacePortalFrameUniforms().meta]
};
const RUPTURE_UNIFORMS = {
  uPrev: ['1i', () => 0],
  uParentCell: ['2i', ({ cell }) => [cell.x, cell.y]],
  uPointerValue: ['1f', ({ pointer }) => pointer],
  uEnable: ['1i', () => 1]
};
const CHILD_INIT_UNIFORMS = {
  uMacroState: ['1i', () => 0],
  uParentUv: ['2f', ({ record }) => record.parentUv],
  uMacroTexel: ['2f', ({ size }) => renderTexelUniform(size)],
  uSeedRadius: ['1f', ({ record }) => Math.max(0.25, Number(record?.seedRadiusCells) || SUBSPACE_SEED_RADIUS_CELLS)],
  uDensityBudget: ['1f', () => SUBSPACE_DENSITY_BUDGET],
  uTime: ['1f', () => simTime],
  uChunkId: ['1f', ({ record }) => record.chunkId],
  uPortalFrameAxes: ['4f', ({ record }) => portalFrameAxesUniform(record)],
  uPortalFrameMeta: ['4f', ({ record }) => portalFrameMetaUniform(record)]
};
const CHILD_SIM_UNIFORMS = {
  uPrevChild: ['1i', () => 0],
  uMacroState: ['1i', () => 1],
  uChunkOrigin: ['2f', ({ origin }) => origin],
  uChunkScale: ['2f', () => HOT_CHUNK_SCALE],
  uChildTexel: ['2f', ({ childAtlasSize }) => renderTexelUniform(childAtlasSize)],
  uParentUv: ['2f', ({ record }) => record.parentUv],
  uDensityBudget: ['1f', () => SUBSPACE_DENSITY_BUDGET],
  uTime: ['1f', () => simTime],
  uDt: ['1f', ({ dt }) => dt],
  uPortalFrameAxes: ['4f', ({ record }) => portalFrameAxesUniform(record)],
  uPortalFrameMeta: ['4f', ({ record }) => portalFrameMetaUniform(record)]
};
const PORTAL_BACKFLOW_UNIFORMS = {
  uPrev: ['1i', () => 0],
  uChildState: ['1i', () => 1],
  uParentCell: ['2i', ({ record }) => portalParentCellUniform(record)],
  uPointerValue: ['1f', ({ record }) => -(record.chunkId + 1.0)],
  uChunkOrigin: ['2f', ({ origin }) => origin],
  uChunkScale: ['2f', () => HOT_CHUNK_SCALE],
  uLeakRate: ['1f', () => SUBSPACE_BACKFLOW_RATE],
  uDensityBudget: ['1f', () => SUBSPACE_DENSITY_BUDGET],
  uPortalFrameAxes: ['4f', ({ record }) => portalFrameAxesUniform(record)],
  uPortalFrameMeta: ['4f', ({ record }) => portalFrameMetaUniform(record)]
};
const PROMOTE_CHILD_UNIFORMS = {
  uChildState: ['1i', () => 0],
  uChunkOrigin: ['2f', ({ origin }) => origin],
  uChunkScale: ['2f', () => HOT_CHUNK_SCALE],
  uDensityBudget: ['1f', () => SUBSPACE_DENSITY_BUDGET],
  uPromotionBlend: ['1f', ({ blend }) => Number.isFinite(Number(blend)) ? Number(blend) : 1.0],
  uSeed: ['1f', ({ seed }) => Number(seed) || 0.0]
};
const SIM_UNIFORM_NAMES = uniformDescriptorNames(SIM_UNIFORMS, SIM_SUBSTEP_UNIFORMS);
const RENDER_UNIFORM_NAMES = uniformDescriptorNames(RENDER_UNIFORMS);
const RUPTURE_UNIFORM_NAMES = uniformDescriptorNames(RUPTURE_UNIFORMS);
const CHILD_INIT_UNIFORM_NAMES = uniformDescriptorNames(CHILD_INIT_UNIFORMS);
const CHILD_SIM_UNIFORM_NAMES = uniformDescriptorNames(CHILD_SIM_UNIFORMS);
const PORTAL_BACKFLOW_UNIFORM_NAMES = uniformDescriptorNames(PORTAL_BACKFLOW_UNIFORMS);
const PROMOTE_CHILD_UNIFORM_NAMES = uniformDescriptorNames(PROMOTE_CHILD_UNIFORMS);

let app = null;
let paused = false;
let viewMode = 7;
let tick = 0;
let simTime = 0;
let lastNow = performance.now();
let fps = 0;
let simAccumulator = 0;
let uiHidden = false;
let reticleVisible = true;
let pinnedDescent = false;
let residentSignal = false;
let residentSignalResetMode = 'off';
let autonomousMode = 'riemann';
let mipmapRenderMode = TEXTURE_MIPMAPS_DEFAULT_ENABLED ? 'mild' : 'off';
let depthEffectMode = 'on';
let pixelBlendMode = 'off';
let compiledZeroSumLayer = makeEmptyCompiledZeroSumLayer();
let coldBankResetMode = 'off';
let coldBankActiveMode = 'off';
let coldBankInfluenceSource = 'stack';
let memoryBanks = makeEmptyFrontierMemoryBanks();
let symmetricFrontier = makeEmptySymmetricFrontierState();
let autonomousActive = false;
let autonomyLastScanTick = 0;
let autonomyLastScanTime = 0;
let autonomyLastRouteTick = 0;
let autonomyLastRouteTime = 0;
let autonomyPressure = 0.0;
let autonomyPhase = 0.0;
let autonomyNovelty = 0.0;
let autonomyStagnation = 0.0;
let autonomyDiagnostics = makeEmptyAutonomyDiagnostics();
let autonomyHysteresis = makeEmptyAutonomyHysteresis();
let autonomyPortalTransit = makeEmptyAutonomyPortalTransit();
let worldDig = makeEmptyWorldDigState();
let residentSignalEpoch = 0;
let residentSignalFullness = 0.0;
let residentSignalLastScanTick = 0;
let residentSignalLastScanTime = 0;
let residentSignalLastFullScanTick = -Infinity;
let residentSignalLastFullScanTime = -Infinity;
let residentSignalScanSerial = 0;
let residentSignalStableScans = 0;
let residentSignalLexicon = new Map();
let residentSignalManifest = makeEmptyResidentSignalManifest();
let phaseLaw = makeEmptyPhaseLawState();
let syntaxColdBank = makeEmptySyntaxColdBank();
let coldBankSynthesis = makeEmptyColdBankSynthesis();
let coldBankSynthesisCache = makeEmptyColdBankSynthesisCache();
let coldBankDistilledOnly = false;
let coldBankFullness = 0.0;
let coldBankTension = 0.0;
let coldBankAxisPhase = 0.0;
let coldBankPlateauPressure = 0.0;
let coldBankTokenPressure = 0.0;
let coldBankMarriagePressure = 0.0;
let coldBankPanelOpen = false;
let coldBankLastImportMessage = 'no imports yet';
let coldBankLastDistillMessage = 'not distilled yet';
let coldBankLastDiagnosticMessage = 'coldBank idle';
let coldBankListenLastRefreshTick = -Infinity;
let coldBankListenLastRefreshTime = -Infinity;
let coldBankContinuumLastAssimilateTick = -Infinity;
let coldBankContinuumLastAssimilateTime = -Infinity;
let coldBankContinuumAssimilationCount = 0;
let coldBankAutonomyWorkDistillLastTick = -Infinity;
let coldBankAutonomyWorkDistillLastTime = -Infinity;
let coldBankAutonomyWorkDistillCount = 0;
let lastUiUpdateNow = 0;
let uiNeedsUpdate = true;
let runtimeRhythm = makeEmptyRuntimeRhythm();
let churnStats = makeEmptyChurnStats();
let escherZoomActive = false;
let escherZoomMode = 'soft';
let escherZoomFocus = [0.5, 0.5];
let escherZoomDepth = 0.0;
let escherPortalTarget = null;
let escherPortalOpened = false;
let escherLastLadderPeriod = 0;
const portalLadder = {
  level: 0,
  direction: 1,
  focus: [0.5, 0.5],
  phase: 0.0,
  crossings: 0,
  downCrossings: 0,
  upCrossings: 0,
  recycleCount: 0,
  lastSource: 'seed',
  lastStepTime: 0,
  lastFrame: null,
  renderFocus: [0.5, 0.5],
  renderPhase: 0.0,
  focusFrom: [0.5, 0.5],
  focusTo: [0.5, 0.5],
  phaseFrom: 0.0,
  phaseTo: 0.0,
  transitionStart: 0.0,
  transitionDuration: PORTAL_LADDER_TRANSITION_SECONDS,
  transitFrom: 0.0,
  transitTo: 0.0,
  transitStart: 0.0,
  transitDuration: PORTAL_TRANSIT_SECONDS,
  transitIntent: 0,
  lateral: 0,
  sideCrossings: 0,
  leftCrossings: 0,
  rightCrossings: 0,
  freedom: 0.35,
  nearestCenter: [0.5, 0.5],
  nearestCenterSource: 'seed',
  homeCenter: [0.5, 0.5],
  establishedCenters: [],
  establishCount: 0,
  centerEpoch: 0,
  absoluteLevel: 0,
  absoluteLateral: 0,
  lastEstablishedAt: 0.0,
  lastRecenterTime: 0.0,
  lastTransitCenterFlushTime: 0.0,
  lastPortalRestFlushTime: -Infinity
};

const atlasAllocator = makeEmptyAtlasAllocator();
const portalRouteCompiler = makeEmptyPortalRouteCompiler();
const backgroundAutonomyPlanner = makeEmptyBackgroundAutonomyPlanner();
const gpuFeedOptimizer = makeEmptyGpuFeedOptimizer();
const syntaxResidency = makeEmptySyntaxResidency();
const syntaxScanTransferPool = [];
const syntaxBlockHistory = [];
const cpuInstrumentation = makeEmptyCpuInstrumentation();

const ui = {
  resolutionIndex: registryIndexByName(RESOLUTION_OPTIONS, 'native', 1),
  simulationPixelScaleIndex: registryIndexByName(SIMULATION_PIXEL_SCALE_OPTIONS, 'sim-1x', 0),
  viewingModeIndex: registryIndexByName(VIEWING_MODES, 'native', 0),
  stepRegimeIndex: registryIndexByName(STEP_REGIMES, 'primordial-2', 1),
  resolutionOptions: RESOLUTION_OPTIONS,
  simulationPixelScaleOptions: SIMULATION_PIXEL_SCALE_OPTIONS,
  viewingModes: VIEWING_MODES,
  stepRegimes: STEP_REGIMES
};


function registryIndexByName(registry, name, fallback = 0) {
  const idx = registry.findIndex(item => item.name === name);
  return idx >= 0 ? idx : fallback;
}
function registryValueSet(registry) {
  return new Set(registry.map(item => String(item.value)));
}
function registryValue(registry, value, fallback) {
  const set = registryValueSet(registry);
  const normalized = String(value ?? fallback);
  return set.has(normalized) ? normalized : String(fallback);
}
function registryEntryByValue(registry, value, fallbackValue) {
  const normalized = registryValue(registry, value, fallbackValue ?? registry[0]?.value);
  return registry.find(item => String(item.value) === normalized) || registry[0];
}
function registryLabel(registry, value, fallbackValue, field = 'label') {
  const entry = registryEntryByValue(registry, value, fallbackValue);
  return entry?.[field] || entry?.label || String(value);
}
function mipmapMode() { return registryEntryByValue(MIPMAP_RENDER_MODES, mipmapRenderMode, 'off') || MIPMAP_RENDER_MODES[0]; }
function depthMode() { return registryEntryByValue(DEPTH_EFFECT_MODES, depthEffectMode, 'on') || DEPTH_EFFECT_MODES[1]; }
function pixelBlendModeEntry() { return registryEntryByValue(PIXEL_BLEND_MODES, pixelBlendMode, 'off') || PIXEL_BLEND_MODES[0]; }
function mipmapRenderingEnabled() { return mipmapMode().value !== 'off'; }
function mipmapMaxPerFrame() { return Math.max(0, Math.floor(Number(mipmapMode().maxPerFrame) || 0)); }
function renderEffectsSummary() {
  return mipmapMode().shortLabel + ' · ' + depthMode().shortLabel + ' · ' + pixelBlendModeEntry().shortLabel;
}
function activeDepthDrawPolicy() { return depthMode().policy || DEPTH_DRAW_POLICY_BASE; }
function sortedRegistryForSelect(registry) {
  return registry
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => (a.entry.dropdownOrder ?? a.index) - (b.entry.dropdownOrder ?? b.index));
}
function populateIndexedSelect(id, registry, selectedIndex) {
  const node = el(id);
  if (!node) return;
  node.replaceChildren(...sortedRegistryForSelect(registry).map(({ entry, index }) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = entry.label;
    return option;
  }));
  node.value = String(clamp(Math.floor(selectedIndex), 0, registry.length - 1));
}
function populateValueSelect(id, registry, selectedValue) {
  const node = el(id);
  if (!node) return;
  node.replaceChildren(...registry.map(entry => {
    const option = document.createElement('option');
    option.value = String(entry.value);
    option.textContent = entry.label;
    return option;
  }));
  node.value = registryValue(registry, selectedValue, registry[0]?.value);
}
function hydrateRegistryControls() {
  populateIndexedSelect('resolutionQuality', RESOLUTION_OPTIONS, ui.resolutionIndex);
  populateIndexedSelect('simulationPixelScale', SIMULATION_PIXEL_SCALE_OPTIONS, ui.simulationPixelScaleIndex);
  populateIndexedSelect('viewingMode', VIEWING_MODES, ui.viewingModeIndex);
  populateIndexedSelect('stepRegimeOverride', STEP_REGIMES, ui.stepRegimeIndex);
  populateValueSelect('mipmapRenderMode', MIPMAP_RENDER_MODES, mipmapRenderMode);
  populateValueSelect('depthEffectMode', DEPTH_EFFECT_MODES, depthEffectMode);
  populateValueSelect('pixelBlendMode', PIXEL_BLEND_MODES, pixelBlendMode);
  populateValueSelect('viewMode', VIEW_MODES, viewMode);
  populateValueSelect('autonomousMode', AUTONOMOUS_MODES, autonomousMode);
  populateValueSelect('escherZoomMode', ESCHER_ZOOM_MODES, escherZoomMode);
}
function setSelectValue(id, value) {
  const node = el(id);
  if (node) node.value = String(value);
}
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function mix(a, b, t) { return a * (1 - clamp(Number(t) || 0, 0, 1)) + b * clamp(Number(t) || 0, 0, 1); }
function unit(v) { return clamp(Number(v) || 0, 0, 1); }
function round4(v) { return Number(unit(v).toFixed(4)); }
function routeMix(routes, spec) {
  return Object.entries(spec || {}).reduce((gain, [route, [lo, hi]]) => gain * mix(lo, hi, routes?.[route] || 0), 1);
}

function fract(v) { return v - Math.floor(v); }
function wrap01(v) { return fract((Number(v) || 0) + 1.0); }
function wrapIndex(v, size) { return ((Math.floor(v) % size) + size) % size; }
function smooth01(v) {
  const t = clamp(Number(v) || 0, 0, 1);
  return t * t * (3 - 2 * t);
}
function smoother01(v) {
  const t = clamp(Number(v) || 0, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}
function torusMix(a, b, t) {
  const k = smooth01(t);
  return [
    wrap01((Number(a?.[0]) || 0) + subspaceTorusDelta(Number(a?.[0]) || 0, Number(b?.[0]) || 0) * k),
    wrap01((Number(a?.[1]) || 0) + subspaceTorusDelta(Number(a?.[1]) || 0, Number(b?.[1]) || 0) * k)
  ];
}
function angleMix(a, b, t) {
  const k = smooth01(t);
  const da = Math.atan2(Math.sin((Number(b) || 0) - (Number(a) || 0)), Math.cos((Number(b) || 0) - (Number(a) || 0)));
  return (Number(a) || 0) + da * k;
}
function subspaceTorusDelta(a, b) {
  let d = (Number(b) || 0) - (Number(a) || 0);
  if (d > 0.5) d -= 1.0;
  if (d < -0.5) d += 1.0;
  return d;
}
function subspaceTorusMidpoint(a, b) {
  return [
    wrap01((Number(a?.[0]) || 0) + subspaceTorusDelta(Number(a?.[0]) || 0, Number(b?.[0]) || 0) * 0.5),
    wrap01((Number(a?.[1]) || 0) + subspaceTorusDelta(Number(a?.[1]) || 0, Number(b?.[1]) || 0) * 0.5)
  ];
}
function subspaceTorusDistance(a, b) {
  return Math.hypot(
    subspaceTorusDelta(Number(a?.[0]) || 0, Number(b?.[0]) || 0),
    subspaceTorusDelta(Number(a?.[1]) || 0, Number(b?.[1]) || 0)
  );
}
function activeChunkCount() { return subspace.active.length; }
function firstFreeChunk() { return subspace.chunks.findIndex(x => !x); }
function parentKey(cell) { return cell.x + ':' + cell.y; }
function parentCellForUv(size, uv) {
  return {
    x: wrapIndex((Number(uv?.[0]) || 0.5) * size, size),
    y: wrapIndex((Number(uv?.[1]) || 0.5) * size, size)
  };
}
function clearSubspaceQueuesAndRecords() {
  subspace.byKey.clear();
  subspace.active.length = 0;
  subspace.pendingPointers.length = 0;
  subspace.pendingInits.length = 0;
  subspace.lastPortal = null;
  subspace.allocationEpoch = 0;
  for (let i = 0; i < subspace.chunks.length; i++) subspace.chunks[i] = null;
  resetAtlasAllocatorState();
  clearPortalRouteCompilerCache();
  SUBSPACE_POINTER_CELLS.fill(0);
  SUBSPACE_POINTER_VALUES.fill(0);
  SUBSPACE_PORTAL_FRAME_AXES.fill(0);
  SUBSPACE_PORTAL_FRAME_META.fill(0);
  subspacePointerUniformEpoch = -1;
  subspacePointerUniformCount = 0;
  HOT_PORTAL_FRAME_PACKET.tick = -1;
  HOT_PORTAL_FRAME_PACKET.epoch = -1;
}

function hash01(n) {
  return fract(Math.sin((Number(n) || 0) * 12.9898 + 78.233) * 43758.5453123);
}
function portalTransitAmount() {
  const dur = Math.max(0.001, Number(portalLadder.transitDuration) || PORTAL_TRANSIT_SECONDS);
  return clamp(((Number(simTime) || 0) - (Number(portalLadder.transitStart) || 0)) / dur, 0, 1);
}
function portalTransitBlend() {
  const k = smoother01(portalTransitAmount());
  return mix(Number(portalLadder.transitFrom) || 0, Number(portalLadder.transitTo) || 0, k);
}
function portalRenderActive() {
  return escherZoomActive || portalTransitBlend() > 0.002 || Number(portalLadder.transitTo) > 0.0;
}
function beginPortalTransit(active, speed = 1.0, duration = PORTAL_TRANSIT_SECONDS) {
  const current = portalTransitBlend();
  const wasTransit = Boolean(portalLadder.transitIntent) || current > 0.02 || escherZoomActive;
  portalLadder.transitFrom = current;
  portalLadder.transitTo = active ? 1.0 : 0.0;
  portalLadder.transitStart = simTime;
  portalLadder.transitDuration = Math.max(0.35, Number(duration) || PORTAL_TRANSIT_SECONDS) / Math.max(0.25, Number(speed) || 1.0);
  portalLadder.transitIntent = active ? 1 : 0;
  if (active) {
    escherZoomActive = true;
    if (!wasTransit) portalLadder.lastTransitCenterFlushTime = simTime;
  }
}
function portalFreedom() {
  const open = activeChunkCount() / Math.max(1, MAX_CHUNKS);
  const transit = portalTransitBlend();
  const ladder = clamp(Math.log2(1 + Math.abs(Number(portalLadder.level) || 0)) / 8.0, 0, 1);
  const lateral = clamp(Math.abs(Number(portalLadder.lateral) || 0) / 13.0, 0, 1);
  const freedom = clamp(0.28 + open * 0.20 + transit * 0.26 + ladder * 0.14 + lateral * 0.12, 0.12, 1.0);
  portalLadder.freedom = freedom;
  return freedom;
}
function portalCandidateKey(center) {
  return center.map(v => Math.round(wrap01(v) * 2048)).join(':');
}
function addPortalReferenceCandidate(out, seen, center, score = 0.25, source = 'portal-reference', phase = null) {
  if (!Array.isArray(center) || center.length < 2) return;
  const c = [wrap01(center[0]), wrap01(center[1])];
  const key = portalCandidateKey(c);
  if (seen.has(key)) return;
  seen.add(key);
  out.push({ center: c, score: clamp(Number(score) || 0.25, 0, 1), source, phase: Number.isFinite(Number(phase)) ? Number(phase) : null });
}
function collectPortalReferenceCenters(options = {}) {
  const includeBetween = options.includeBetween !== false;
  const centers = [];
  const seen = new Set();
  addPortalReferenceCandidate(centers, seen, portalLadder.homeCenter || [0.5, 0.5], 0.88, 'established-home-center', portalLadder.phase);
  for (const item of portalLadder.establishedCenters || []) {
    const age = Math.max(0, (Number(simTime) || 0) - (Number(item.time) || 0));
    const ageFit = 1.0 / (1.0 + age * 0.018);
    addPortalReferenceCandidate(centers, seen, item.center, clamp((Number(item.score) || 0.45) * ageFit, 0.18, 0.96), item.source || 'established-center', item.phase);
  }
  addPortalReferenceCandidate(centers, seen, portalLadder.focus, 0.70, 'ladder-focus', portalLadder.phase);
  addPortalReferenceCandidate(centers, seen, portalLadderRenderFocus(), 0.75, 'render-focus', portalLadderRenderPhase());
  addPortalReferenceCandidate(centers, seen, escherZoomFocus, 0.55, 'escher-focus', portalLadder.phase);
  if (escherPortalTarget) {
    addPortalReferenceCandidate(centers, seen, escherPortalTarget.portal, Number(escherPortalTarget.score) || 0.55, 'escher-target', escherPortalTarget.phase);
    for (const item of escherPortalTarget.pair || []) addPortalReferenceCandidate(centers, seen, item.center, item.score, item.source, item.phase);
  }
  if (subspace.lastPortal?.uv) addPortalReferenceCandidate(centers, seen, subspace.lastPortal.uv, subspace.lastPortal.score || 0.45, 'last-opened-portal', portalLadder.phase);
  for (const record of subspace.active || []) {
    const sameEpoch = (record.portalEpoch ?? 0) === (portalLadder.centerEpoch ?? 0);
    const epochWeight = sameEpoch ? 1.0 : 0.28;
    addPortalReferenceCandidate(centers, seen, record.parentUv, (0.65 + 0.25 * smooth01((record.age || 0) / 5)) * epochWeight, (sameEpoch ? 'active-frame-' : 'prior-frame-') + record.chunkId, record.portalFrame?.twist);
    addPortalReferenceCandidate(centers, seen, record.portalFrame?.originUv, 0.60 * epochWeight, (sameEpoch ? 'frame-origin-' : 'prior-origin-') + record.chunkId, record.portalFrame?.twist);
  }
  for (const c of collectSubspaceCenterCandidates().slice(0, 12)) {
    addPortalReferenceCandidate(centers, seen, c.center, c.score, c.source, c.phase);
  }
  if (includeBetween) {
    const basis = centers.slice(0, Math.min(18, centers.length));
    for (let i = 0; i < basis.length; i++) {
      for (let j = i + 1; j < basis.length; j++) {
        const a = basis[i];
        const b = basis[j];
        const dist = subspaceTorusDistance(a.center, b.center);
        if (dist < 0.014 || dist > 0.34) continue;
        const center = subspaceTorusMidpoint(a.center, b.center);
        const phase = Math.atan2(
          subspaceTorusDelta(a.center[1], b.center[1]),
          subspaceTorusDelta(a.center[0], b.center[0])
        );
        addPortalReferenceCandidate(centers, seen, center, (a.score + b.score) * 0.5 * 0.92, 'between-centers:' + a.source + '↔' + b.source, phase);
      }
    }
  }
  return centers.sort((a, b) => b.score - a.score);
}
function nearestPortalReferenceCenter(focus = portalLadderRenderFocus(), options = {}) {
  const centers = collectPortalReferenceCenters({ includeBetween: options.includeBetween !== false });
  const freedom = portalFreedom();
  let best = null;
  const heading = Number.isFinite(Number(options.heading)) ? Number(options.heading) : null;
  for (const c of centers) {
    const dx = subspaceTorusDelta(focus[0], c.center[0]);
    const dy = subspaceTorusDelta(focus[1], c.center[1]);
    const dist = Math.hypot(dx, dy);
    let headingFit = 1.0;
    if (heading !== null && dist > 1e-6) {
      const ang = Math.atan2(dy, dx);
      headingFit = 0.5 + 0.5 * Math.cos(Math.atan2(Math.sin(ang - heading), Math.cos(ang - heading)));
    }
    const score = (1.0 / (0.012 + dist)) * (0.54 + 0.34 * c.score + 0.12 * headingFit) * (0.74 + 0.26 * freedom);
    if (!best || score > best.score) best = { ...c, distance: dist, score };
  }
  return best || { center: [0.5, 0.5], phase: 0.0, source: 'fallback-center', distance: 0, score: 0 };
}
function settlePortalToNearestCenter(reason = 'settle', speed = 0.72) {
  const currentFocus = portalLadderRenderFocus();
  const nearest = nearestPortalReferenceCenter(currentFocus, { includeBetween: true });
  const phase = Number.isFinite(Number(nearest.phase)) ? Number(nearest.phase) : portalLadderRenderPhase();
  beginPortalLadderTransition(nearest.center, phase, speed);
  portalLadder.focus = nearest.center.slice();
  portalLadder.phase = phase;
  portalLadder.nearestCenter = nearest.center.slice();
  portalLadder.nearestCenterSource = nearest.source;
  portalLadder.lastSource = reason + ' · nearest ' + nearest.source;
  escherZoomFocus = currentFocus.slice();
  return nearest;
}
function portalLadderTransitionAmount() {
  const dur = Math.max(0.001, Number(portalLadder.transitionDuration) || PORTAL_LADDER_TRANSITION_SECONDS);
  return clamp(((Number(simTime) || 0) - (Number(portalLadder.transitionStart) || 0)) / dur, 0, 1);
}
function portalLadderTransitionSmooth() {
  return smoother01(portalLadderTransitionAmount());
}
function portalLadderRenderFocus() {
  const t = portalLadderTransitionSmooth();
  const f = torusMix(portalLadder.focusFrom || portalLadder.focus, portalLadder.focusTo || portalLadder.focus, t);
  portalLadder.renderFocus = f;
  return f;
}
function portalLadderRenderPhase() {
  const t = portalLadderTransitionSmooth();
  const from = Number.isFinite(Number(portalLadder.phaseFrom)) ? Number(portalLadder.phaseFrom) : portalLadder.phase;
  const to = Number.isFinite(Number(portalLadder.phaseTo)) ? Number(portalLadder.phaseTo) : portalLadder.phase;
  const phase = angleMix(from, to, t);
  portalLadder.renderPhase = phase;
  return phase;
}
function beginPortalLadderTransition(nextFocus, nextPhase, speed = 1.0) {
  const currentFocus = portalLadderRenderFocus();
  const currentPhase = portalLadderRenderPhase();
  const distance = subspaceTorusDistance(currentFocus, nextFocus || currentFocus);
  const durScale = clamp(0.82 + distance * 7.0, 0.9, 1.6);
  portalLadder.focusFrom = currentFocus.slice();
  portalLadder.focusTo = (nextFocus || currentFocus).slice();
  portalLadder.phaseFrom = currentPhase;
  portalLadder.phaseTo = Number(nextPhase) || 0;
  portalLadder.transitionStart = simTime;
  portalLadder.transitionDuration = PORTAL_LADDER_TRANSITION_SECONDS * durScale / Math.max(0.25, Number(speed) || 1.0);
  portalLadder.renderFocus = currentFocus.slice();
  portalLadder.renderPhase = currentPhase;
}
function currentLadderFrameAngle() {
  const frame = portalLadder.lastFrame;
  const phase = Array.isArray(frame?.phaseAxis) ? frame.phaseAxis : null;
  const energy = Array.isArray(frame?.energyAxis) ? frame.energyAxis : null;
  if (phase) {
    const base = Math.atan2(Number(phase[1]) || 0, Number(phase[0]) || 0);
    const twist = Number(frame?.twist) || 0;
    return base - twist * 0.45;
  }
  if (energy) return Math.atan2(Number(energy[1]) || 0, Number(energy[0]) || 0);
  return portalLadderRenderPhase();
}
function resetPortalLadder() {
  portalLadder.level = 0;
  portalLadder.direction = 1;
  portalLadder.focus = [0.5, 0.5];
  portalLadder.phase = 0.0;
  portalLadder.crossings = 0;
  portalLadder.downCrossings = 0;
  portalLadder.upCrossings = 0;
  portalLadder.recycleCount = 0;
  portalLadder.lastSource = 'seed';
  portalLadder.lastStepTime = simTime;
  portalLadder.lastFrame = null;
  portalLadder.renderFocus = [0.5, 0.5];
  portalLadder.renderPhase = 0.0;
  portalLadder.focusFrom = [0.5, 0.5];
  portalLadder.focusTo = [0.5, 0.5];
  portalLadder.phaseFrom = 0.0;
  portalLadder.phaseTo = 0.0;
  portalLadder.transitionStart = simTime;
  portalLadder.transitionDuration = PORTAL_LADDER_TRANSITION_SECONDS;
  portalLadder.transitFrom = 0.0;
  portalLadder.transitTo = 0.0;
  portalLadder.transitStart = simTime;
  portalLadder.transitDuration = PORTAL_TRANSIT_SECONDS;
  portalLadder.transitIntent = 0;
  portalLadder.lateral = 0;
  portalLadder.sideCrossings = 0;
  portalLadder.leftCrossings = 0;
  portalLadder.rightCrossings = 0;
  portalLadder.freedom = 0.35;
  portalLadder.nearestCenter = [0.5, 0.5];
  portalLadder.nearestCenterSource = 'seed';
  portalLadder.homeCenter = [0.5, 0.5];
  portalLadder.establishedCenters = [];
  portalLadder.establishCount = 0;
  portalLadder.centerEpoch = 0;
  portalLadder.absoluteLevel = 0;
  portalLadder.absoluteLateral = 0;
  portalLadder.lastEstablishedAt = simTime;
  portalLadder.lastRecenterTime = simTime;
  portalLadder.lastTransitCenterFlushTime = simTime;
  portalLadder.lastPortalRestFlushTime = -Infinity;
  escherLastLadderPeriod = 0;
}
function resetPortalNavigationState(reason = 'reset') {
  escherZoomActive = false;
  escherZoomFocus = [0.5, 0.5];
  escherZoomDepth = 0.0;
  escherPortalTarget = null;
  escherPortalOpened = false;
  escherLastLadderPeriod = 0;
  resetPortalLadder();
  clearPortalRouteCompilerCache();
  if (app?.kind === 'webgl2') {
    clearUniformNamespace(app, 'render');
    clearUniformNamespace(app, 'simSubstep');
    clearUniformNamespace(app, 'rupture');
    clearUniformNamespace(app, 'childInit');
    clearUniformNamespace(app, 'childSim');
    clearUniformNamespace(app, 'portalBackflow');
    clearUniformNamespace(app, 'promoteChild');
    resetGlStateCache(app);
  }
  if (stats.log && reason !== 'silent') stats.log.textContent = 'Portal navigation reset authority: Escher depth, transit envelope, ladder focus, parent/child portal targets, and stale render uniforms were neutralized for ' + reason + '.';
  syncEscherZoomButtonLabel();
}
function makeEmptyAtlasAllocator() {
  return {
    schema: 'chrysalis-atlas-slot-allocator-v0.1',
    mode: 'fixed-rolling-window',
    slots: Array.from({ length: MAX_CHUNKS }, (_, chunkId) => ({
      chunkId,
      state: 'free',
      key: null,
      source: 'startup',
      bornTick: 0,
      bornTime: 0,
      lastTouchTick: 0,
      lastTouchTime: 0,
      recycleScore: 0,
      recycleReason: 'never-used',
      useCount: 0
    })),
    stats: {
      freeClaims: 0,
      recycleClaims: 0,
      releases: 0,
      rejected: 0,
      locksAvoided: 0,
      lastAllocated: -1,
      lastRecycled: -1,
      lastReason: 'startup'
    }
  };
}
function resetAtlasAllocatorState() {
  atlasAllocator.mode = 'fixed-rolling-window';
  atlasAllocator.stats.freeClaims = 0;
  atlasAllocator.stats.recycleClaims = 0;
  atlasAllocator.stats.releases = 0;
  atlasAllocator.stats.rejected = 0;
  atlasAllocator.stats.locksAvoided = 0;
  atlasAllocator.stats.lastAllocated = -1;
  atlasAllocator.stats.lastRecycled = -1;
  atlasAllocator.stats.lastReason = 'reset';
  for (let i = 0; i < atlasAllocator.slots.length; i++) {
    atlasAllocator.slots[i] = {
      chunkId: i,
      state: 'free',
      key: null,
      source: 'reset',
      bornTick: 0,
      bornTime: 0,
      lastTouchTick: 0,
      lastTouchTime: 0,
      recycleScore: 0,
      recycleReason: 'reset',
      useCount: 0
    };
  }
}
function touchAtlasSlot(record, source = 'touch') {
  if (!record) return;
  const slot = atlasAllocator.slots[record.chunkId | 0];
  if (!slot) return;
  slot.state = 'active';
  slot.key = record.key;
  slot.source = source || record.source || 'active';
  slot.lastTouchTick = tick;
  slot.lastTouchTime = simTime;
}
function markAtlasSlotActive(record, source = 'allocate') {
  if (!record) return;
  const slot = atlasAllocator.slots[record.chunkId | 0];
  if (!slot) return;
  slot.state = 'active';
  slot.key = record.key;
  slot.source = source || record.source || 'allocate';
  slot.bornTick = record.bornTick || tick;
  slot.bornTime = record.bornTime || simTime;
  slot.lastTouchTick = tick;
  slot.lastTouchTime = simTime;
  slot.recycleScore = 1;
  slot.recycleReason = 'hot-new-frame';
  slot.useCount = (slot.useCount || 0) + 1;
  atlasAllocator.stats.lastAllocated = record.chunkId | 0;
  atlasAllocator.stats.lastReason = source || 'allocate';
}
function releaseAtlasSlot(record, reason = 'release') {
  if (!record) return;
  const slot = atlasAllocator.slots[record.chunkId | 0];
  if (slot) {
    slot.state = 'free';
    slot.key = null;
    slot.source = reason;
    slot.lastTouchTick = tick;
    slot.lastTouchTime = simTime;
    slot.recycleScore = 0;
    slot.recycleReason = reason;
  }
  atlasAllocator.stats.releases++;
}
function atlasSlotKeepScore(record, reason = 'allocator') {
  if (!record) return -Infinity;
  const age = Math.max(0, (Number(simTime) || 0) - (Number(record.bornTime) || 0));
  const recentFit = 1.0 / (1.0 + age * 0.38);
  const focus = portalLadderRenderFocus();
  const focusFit = 1.0 / (1.0 + subspaceTorusDistance(focus, record.parentUv || [0.5, 0.5]) * 28.0);
  const sameEpoch = (record.portalEpoch ?? 0) === (portalLadder.centerEpoch ?? 0) ? 1.0 : 0.18;
  const scoreFit = clamp(Number(record.portalFrame?.score ?? record.portal?.frame?.score ?? 0.35) || 0.35, 0, 1);
  const visibleLock = record === portalLadder.lastFrame || record.portalFrame === portalLadder.lastFrame ? 1.0 : 0.0;
  const sourceLock = String(record.source || '').indexOf('establish') >= 0 ? 0.18 : 0.0;
  const keep = recentFit * 0.30 + focusFit * 0.24 + sameEpoch * 0.16 + scoreFit * 0.18 + visibleLock * 0.09 + sourceLock;
  const slot = atlasAllocator.slots[record.chunkId | 0];
  if (slot) {
    slot.recycleScore = keep;
    slot.recycleReason = reason + ' · age ' + age.toFixed(1) + ' · focus ' + focusFit.toFixed(2);
  }
  return keep;
}
function chooseAtlasRecycleRecord(reason = 'allocator', options = {}) {
  if (!subspace.active.length) return null;
  const protectedKey = options.protectedKey || null;
  const now = Number(simTime) || 0;
  let selected = null;
  let selectedKeep = Infinity;
  for (const record of subspace.active) {
    if (!record) continue;
    if (protectedKey && record.key === protectedKey) {
      atlasAllocator.stats.locksAvoided++;
      continue;
    }
    if (now - (Number(record.bornTime) || 0) < 0.33 && subspace.active.length > 1) {
      atlasAllocator.stats.locksAvoided++;
      continue;
    }
    const keep = atlasSlotKeepScore(record, reason);
    if (!selected || keep < selectedKeep || (keep === selectedKeep && (record.bornTick || 0) < (selected.bornTick || 0))) {
      selected = record;
      selectedKeep = keep;
    }
  }
  if (!selected) {
    selected = subspace.active.slice().sort((a, b) => (a.bornTick || 0) - (b.bornTick || 0))[0] || null;
  }
  return selected;
}
function recycleSubspaceChunk(reason = 'portal-ladder', options = {}) {
  const selected = chooseAtlasRecycleRecord(reason, options);
  if (!selected) return -1;
  subspace.byKey.delete(selected.key);
  const idx = subspace.active.indexOf(selected);
  if (idx >= 0) subspace.active.splice(idx, 1);
  subspace.chunks[selected.chunkId] = null;
  subspace.pendingPointers.push({ cell: selected.cell, pointer: 0.0 });
  releaseAtlasSlot(selected, 'recycled:' + reason);
  portalLadder.recycleCount++;
  atlasAllocator.stats.recycleClaims++;
  atlasAllocator.stats.lastRecycled = selected.chunkId | 0;
  atlasAllocator.stats.lastReason = reason;
  return selected.chunkId;
}
function allocateAtlasChunk(cell, target = {}, source = 'manual') {
  const key = parentKey(cell);
  let chunkId = firstFreeChunk();
  if (chunkId >= 0) {
    atlasAllocator.stats.freeClaims++;
    atlasAllocator.stats.lastReason = 'free:' + source;
    return chunkId;
  }
  if (target?.recycle) return recycleSubspaceChunk(target?.ladder ? 'portal-ladder' : source, { protectedKey: key });
  atlasAllocator.stats.rejected++;
  atlasAllocator.stats.lastReason = 'full:' + source;
  return -1;
}
function atlasAllocatorSummary() {
  const active = atlasAllocator.slots.filter(s => s.state === 'active').length;
  const free = MAX_CHUNKS - active;
  return 'alloc ' + active + '/' + MAX_CHUNKS + ' active · free ' + free + ' · rec ' + atlasAllocator.stats.recycleClaims + ' · last ' + atlasAllocator.stats.lastReason;
}
function makeEmptyPortalRouteCompiler() {
  return {
    schema: 'chrysalis-portal-route-compiler-v0.1',
    worker: null,
    supported: false,
    busy: false,
    seq: 0,
    jobs: 0,
    hits: 0,
    misses: 0,
    errors: 0,
    lastRequestTime: -Infinity,
    lastResponseTime: -Infinity,
    status: 'cold',
    error: '',
    cache: Object.create(null),
    snapshotKey: ''
  };
}
function clearPortalRouteCompilerCache() {
  portalRouteCompiler.cache = Object.create(null);
  portalRouteCompiler.snapshotKey = '';
  portalRouteCompiler.status = portalRouteCompiler.supported ? 'ready-empty' : portalRouteCompiler.status;
}
function portalRouteCompilerWorkerSource() {
  return `
const TAU = Math.PI * 2;
const PORTAL_LADDER_VISIBLE_LIMIT = ${PORTAL_LADDER_VISIBLE_LIMIT};
const PORTAL_LADDER_STEP_JITTER = ${PORTAL_LADDER_STEP_JITTER};
const PORTAL_LATERAL_STEP_RADIUS = ${PORTAL_LATERAL_STEP_RADIUS};
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, Number(v) || 0)); }
function fract(v) { return v - Math.floor(v); }
function wrap01(v) { return fract((Number(v) || 0) + 1.0); }
function hash01(n) { return fract(Math.sin((Number(n) || 0) * 12.9898 + 78.233) * 43758.5453123); }
function smooth01(v) { const t = clamp(v, 0, 1); return t * t * (3 - 2 * t); }
function delta(a, b) { let d = (Number(b) || 0) - (Number(a) || 0); if (d > 0.5) d -= 1.0; if (d < -0.5) d += 1.0; return d; }
function dist(a, b) { return Math.hypot(delta(a?.[0] || 0, b?.[0] || 0), delta(a?.[1] || 0, b?.[1] || 0)); }
function midpoint(a, b) { return [wrap01((a?.[0] || 0) + delta(a?.[0] || 0, b?.[0] || 0) * 0.5), wrap01((a?.[1] || 0) + delta(a?.[1] || 0, b?.[1] || 0) * 0.5)]; }
function torusMix(a, b, t) { const k = smooth01(t); return [wrap01((a?.[0] || 0) + delta(a?.[0] || 0, b?.[0] || 0) * k), wrap01((a?.[1] || 0) + delta(a?.[1] || 0, b?.[1] || 0) * k)]; }
function angleMix(a, b, t) { const k = smooth01(t); const da = Math.atan2(Math.sin((Number(b) || 0) - (Number(a) || 0)), Math.cos((Number(b) || 0) - (Number(a) || 0))); return (Number(a) || 0) + da * k; }
function compact(center, score, source, phase) { return { center: [wrap01(center?.[0] || 0.5), wrap01(center?.[1] || 0.5)], score: clamp(score, 0, 1), source: source || 'compiled', phase: Number(phase) || 0 }; }
function selectBase(candidates) {
  candidates = Array.isArray(candidates) ? candidates : [];
  if (!candidates.length) return { portal: [0.5, 0.5], source: 'compiler fallback', pair: [], score: 0 };
  if (candidates.length === 1) return { portal: candidates[0].center, source: candidates[0].source, pair: [candidates[0]], score: candidates[0].score };
  let best = null;
  const limit = Math.min(18, candidates.length);
  for (let i = 0; i < limit; i++) {
    for (let j = i + 1; j < limit; j++) {
      const a = candidates[i], b = candidates[j];
      const d = dist(a.center, b.center);
      if (d < 0.018) continue;
      const distanceFit = 1.0 - Math.min(1.0, Math.abs(d - 0.18) / 0.42);
      const phaseFit = 0.5 + 0.5 * Math.cos((Number(a.phase) || 0) - (Number(b.phase) || 0) - Math.PI);
      const score = (a.score + b.score) * 0.5 * (0.55 + 0.30 * distanceFit + 0.15 * phaseFit);
      if (!best || score > best.score) best = { portal: midpoint(a.center, b.center), source: a.source + ' × ' + b.source, pair: [a, b], score };
    }
  }
  return best || { portal: candidates[0].center, source: candidates[0].source, pair: [candidates[0]], score: candidates[0].score };
}
function nearest(refs, focus, heading, freedom) {
  refs = Array.isArray(refs) ? refs : [];
  let best = null;
  for (const c of refs) {
    const dx = delta(focus[0], c.center?.[0] || 0.5);
    const dy = delta(focus[1], c.center?.[1] || 0.5);
    const d = Math.hypot(dx, dy);
    let headingFit = 1.0;
    if (Number.isFinite(heading) && d > 1e-6) {
      const ang = Math.atan2(dy, dx);
      headingFit = 0.5 + 0.5 * Math.cos(Math.atan2(Math.sin(ang - heading), Math.cos(ang - heading)));
    }
    const score = (1.0 / (0.012 + d)) * (0.54 + 0.34 * (Number(c.score) || 0) + 0.12 * headingFit) * (0.74 + 0.26 * (Number(freedom) || 0.35));
    if (!best || score > best.score) best = { center: c.center, phase: c.phase, source: c.source, distance: d, score };
  }
  return best || { center: [0.5, 0.5], phase: 0, source: 'compiler fallback center', distance: 0, score: 0 };
}
function currentFrameAngle(state) {
  const frame = state.lastFrame || null;
  const phase = Array.isArray(frame?.phaseAxis) ? frame.phaseAxis : null;
  const energy = Array.isArray(frame?.energyAxis) ? frame.energyAxis : null;
  if (phase) return Math.atan2(Number(phase[1]) || 0, Number(phase[0]) || 0) - (Number(frame?.twist) || 0) * 0.45;
  if (energy) return Math.atan2(Number(energy[1]) || 0, Number(energy[0]) || 0);
  return Number(state.renderPhase ?? state.phase) || 0;
}
function compileLadder(snapshot, dir) {
  const state = snapshot.state || {};
  const nextLevel = (Number(state.level) || 0) + dir;
  const nextCrossings = (Number(state.crossings) || 0) + 1;
  const baseTarget = selectBase(snapshot.centerCandidates || []);
  const base = Array.isArray(state.focus) ? state.focus : baseTarget.portal;
  const levelAbs = Math.min(PORTAL_LADDER_VISIBLE_LIMIT, Math.abs(nextLevel) + 1);
  const seededPhase = wrap01((Number(state.phase) || 0) / TAU + dir * 0.38196601125 + hash01(nextCrossings + nextLevel) * 0.041) * TAU;
  const h0 = hash01(levelAbs * 17.0 + nextCrossings * 5.0 + dir * 101.0);
  const h1 = hash01(levelAbs * 31.0 + nextCrossings * 7.0 + dir * 211.0);
  const golden = 2.399963229728653;
  const wanderingAngle = seededPhase + dir * (golden + 0.23 * Math.log2(1 + levelAbs)) + h0 * TAU * 0.21;
  const meetAngle = currentFrameAngle(state) + (dir < 0 ? Math.PI : 0.0) - dir * (Number(state.lastFrame?.twist) || 0) * 0.33;
  const inverseMeet = dir < 0 && state.lastFrame ? 0.82 : 0.22;
  const angle = angleMix(wanderingAngle, meetAngle, inverseMeet);
  const radius = (dir < 0 && state.lastFrame ? 0.040 : 0.055) + PORTAL_LADDER_STEP_JITTER * h1 * (dir < 0 ? 0.55 : 1.0);
  const rawPortal = [wrap01((base?.[0] ?? 0.5) + Math.cos(angle) * radius), wrap01((base?.[1] ?? 0.5) + Math.sin(angle) * radius)];
  const freedom = Number(state.freedom) || 0.35;
  const relock = nearest(snapshot.referenceCenters || [], rawPortal, angle, freedom);
  const portal = relock.distance < 0.20 ? torusMix(rawPortal, relock.center, 0.18 + 0.28 * freedom) : rawPortal;
  const axis = [Math.cos(angle + Math.PI * 0.5), Math.sin(angle + Math.PI * 0.5)];
  const pair = [
    compact([portal[0] - axis[0] * 0.075, portal[1] - axis[1] * 0.075], 0.72 + 0.22 * h0, 'compiled-ladder-a', angle),
    compact([portal[0] + axis[0] * 0.075, portal[1] + axis[1] * 0.075], 0.72 + 0.22 * h1, 'compiled-ladder-b', angle + Math.PI)
  ];
  return { portal, pair, score: clamp(0.74 + 0.20 * (1.0 - Math.abs(h0 - h1)), 0, 1), phase: angle, source: 'route-compiler · ' + (dir > 0 ? 'down' : 'up') + ' L' + nextLevel + ' · ' + baseTarget.source, recycle: true, ladder: { level: nextLevel, direction: dir, crossings: nextCrossings, offMap: true }, compiler: true, snapshotKey: snapshot.key };
}
function compileSide(snapshot, sgn) {
  const state = snapshot.state || {};
  const freedom = Number(state.freedom) || 0.35;
  const levelAbs = Math.min(PORTAL_LADDER_VISIBLE_LIMIT, Math.abs(Number(state.level) || 0) + 1);
  const nextSideCrossings = (Number(state.sideCrossings) || 0) + 1;
  const h0 = hash01(levelAbs * 47.0 + nextSideCrossings * 11.0 + sgn * 307.0);
  const h1 = hash01(levelAbs * 59.0 + nextSideCrossings * 13.0 + sgn * 401.0);
  const frameAngle = currentFrameAngle(state);
  const heading = frameAngle + sgn * Math.PI * 0.5 + (h0 - 0.5) * (0.22 + 0.34 * freedom);
  const base = Array.isArray(state.renderFocus) ? state.renderFocus : (state.focus || [0.5, 0.5]);
  const radius = PORTAL_LATERAL_STEP_RADIUS * (0.72 + 0.90 * freedom) + PORTAL_LADDER_STEP_JITTER * 0.45 * h1;
  const rawPortal = [wrap01(base[0] + Math.cos(heading) * radius), wrap01(base[1] + Math.sin(heading) * radius)];
  const near = nearest(snapshot.referenceCenters || [], rawPortal, heading, freedom);
  const portal = near.distance < 0.28 ? torusMix(rawPortal, near.center, 0.32 + 0.42 * freedom) : rawPortal;
  const axis = [Math.cos(heading + Math.PI * 0.5), Math.sin(heading + Math.PI * 0.5)];
  const pair = [
    compact([portal[0] - axis[0] * 0.060, portal[1] - axis[1] * 0.060], 0.68 + 0.24 * freedom, sgn < 0 ? 'compiled-left-a' : 'compiled-right-a', heading),
    compact([portal[0] + axis[0] * 0.060, portal[1] + axis[1] * 0.060], 0.66 + 0.24 * h1, sgn < 0 ? 'compiled-left-b' : 'compiled-right-b', heading + Math.PI)
  ];
  return { portal, pair, score: clamp(0.70 + 0.22 * freedom + 0.08 * (1.0 - Math.abs(h0 - h1)), 0, 1), phase: heading, source: 'route-compiler · ' + (sgn < 0 ? 'left' : 'right') + ' S' + ((Number(state.lateral) || 0) + sgn) + ' · nearest ' + near.source, recycle: true, ladder: { level: Number(state.level) || 0, direction: Number(state.direction) || 1, lateral: (Number(state.lateral) || 0) + sgn, side: sgn, crossings: (Number(state.crossings) || 0) + 1, offMap: true, betweenCenters: true }, compiler: true, snapshotKey: snapshot.key };
}
self.onmessage = event => {
  const msg = event.data || {};
  if (msg.type !== 'compile') return;
  const snapshot = msg.snapshot || {};
  try {
    const plans = { down: compileLadder(snapshot, 1), up: compileLadder(snapshot, -1), left: compileSide(snapshot, -1), right: compileSide(snapshot, 1) };
    self.postMessage({ type: 'compiled', id: msg.id, key: snapshot.key, plans, stats: { refs: (snapshot.referenceCenters || []).length, centers: (snapshot.centerCandidates || []).length } });
  } catch (err) {
    self.postMessage({ type: 'error', id: msg.id, epoch: msg.epoch || 0, message: err && err.message ? err.message : String(err) });
  }
};`;
}
function startPortalRouteCompiler() {
  if (portalRouteCompiler.worker || typeof Worker === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined') {
    portalRouteCompiler.supported = Boolean(portalRouteCompiler.worker);
    return portalRouteCompiler.supported;
  }
  try {
    const blob = new Blob([portalRouteCompilerWorkerSource()], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url);
    URL.revokeObjectURL(url);
    worker.onmessage = (event) => {
      const msg = event.data || {};
      portalRouteCompiler.busy = false;
      if (msg.type === 'compiled') {
        portalRouteCompiler.cache = msg.plans || Object.create(null);
        portalRouteCompiler.snapshotKey = msg.key || '';
        portalRouteCompiler.lastResponseTime = simTime;
        portalRouteCompiler.status = 'ready ' + (msg.stats?.centers || 0) + '/' + (msg.stats?.refs || 0);
        uiNeedsUpdate = true;
      } else if (msg.type === 'error') {
        portalRouteCompiler.errors++;
        portalRouteCompiler.error = msg.message || 'unknown worker error';
        portalRouteCompiler.status = 'error';
      }
    };
    worker.onerror = (event) => {
      portalRouteCompiler.busy = false;
      portalRouteCompiler.errors++;
      portalRouteCompiler.error = event?.message || 'worker error';
      portalRouteCompiler.status = 'error';
    };
    portalRouteCompiler.worker = worker;
    portalRouteCompiler.supported = true;
    portalRouteCompiler.status = 'warm';
    return true;
  } catch (err) {
    portalRouteCompiler.supported = false;
    portalRouteCompiler.error = err && err.message ? err.message : String(err);
    portalRouteCompiler.status = 'disabled';
    return false;
  }
}
function compactRouteCenterForWorker(c) {
  if (!c || !Array.isArray(c.center)) return null;
  return { center: [wrap01(c.center[0]), wrap01(c.center[1])], score: clamp(Number(c.score) || 0, 0, 1), source: String(c.source || 'center'), phase: Number(c.phase) || 0 };
}
function portalRouteCompilerSnapshotKey() {
  return [portalLadder.level, portalLadder.lateral, portalLadder.crossings, portalLadder.sideCrossings, portalLadder.centerEpoch, subspace.allocationEpoch, Math.round(portalLadder.phase * 1000)].join(':');
}
function portalRouteCompilerSnapshot() {
  const budget = currentDiagnosticBudget();
  const centerCap = Math.max(8, Math.floor(Number(budget.portalCenterCap || PORTAL_ROUTE_COMPILE_CENTER_CAP)));
  const refs = collectPortalReferenceCenters({ includeBetween: true }).slice(0, centerCap).map(compactRouteCenterForWorker).filter(Boolean);
  const centers = collectSubspaceCenterCandidates().slice(0, centerCap).map(compactRouteCenterForWorker).filter(Boolean);
  const key = portalRouteCompilerSnapshotKey();
  return {
    key,
    state: {
      level: portalLadder.level,
      lateral: portalLadder.lateral,
      direction: portalLadder.direction,
      crossings: portalLadder.crossings,
      sideCrossings: portalLadder.sideCrossings,
      phase: portalLadder.phase,
      focus: portalLadder.focus.slice(),
      renderFocus: portalLadderRenderFocus().slice(),
      renderPhase: portalLadderRenderPhase(),
      lastFrame: portalLadder.lastFrame,
      freedom: portalFreedom()
    },
    referenceCenters: refs,
    centerCandidates: centers
  };
}
function maybeCompilePortalRoutes(force = false) {
  if (!startPortalRouteCompiler()) return false;
  if (portalRouteCompiler.busy) return false;
  const budget = currentDiagnosticBudget();
  const interval = Math.max(PORTAL_ROUTE_COMPILE_INTERVAL_SECONDS, Number(budget.portalRouteInterval || PORTAL_ROUTE_COMPILE_INTERVAL_SECONDS));
  if (!force && (Number(simTime) || 0) - portalRouteCompiler.lastRequestTime < interval) return false;
  const fastKey = portalRouteCompilerSnapshotKey();
  if (!force && fastKey === portalRouteCompiler.snapshotKey) {
    portalRouteCompiler.lastRequestTime = simTime;
    return false;
  }
  const snapshot = portalRouteCompilerSnapshot();
  if (!force && snapshot.key === portalRouteCompiler.snapshotKey) {
    portalRouteCompiler.lastRequestTime = simTime;
    return false;
  }
  portalRouteCompiler.seq++;
  portalRouteCompiler.jobs++;
  portalRouteCompiler.busy = true;
  portalRouteCompiler.lastRequestTime = simTime;
  portalRouteCompiler.status = 'compiling';
  try {
    portalRouteCompiler.worker.postMessage({ type: 'compile', id: portalRouteCompiler.seq, snapshot });
    return true;
  } catch (err) {
    portalRouteCompiler.busy = false;
    portalRouteCompiler.errors++;
    portalRouteCompiler.error = err && err.message ? err.message : String(err);
    portalRouteCompiler.status = 'post-failed';
    return false;
  }
}
function takeCompiledPortalTarget(kind) {
  const target = portalRouteCompiler.cache?.[kind];
  if (!target || target.snapshotKey !== portalRouteCompiler.snapshotKey) {
    portalRouteCompiler.misses++;
    return null;
  }
  portalRouteCompiler.hits++;
  return JSON.parse(JSON.stringify(target));
}
function portalRouteCompilerStatusText() {
  if (!portalRouteCompiler.supported) return 'compiler off';
  const busy = portalRouteCompiler.busy ? ' busy' : '';
  return 'compiler ' + portalRouteCompiler.status + busy + ' · hit ' + portalRouteCompiler.hits + ' miss ' + portalRouteCompiler.misses + ' job ' + portalRouteCompiler.jobs;
}
function portalRouteCompilerSummaryObject() {
  return {
    schema: portalRouteCompiler.schema,
    supported: portalRouteCompiler.supported,
    busy: portalRouteCompiler.busy,
    status: portalRouteCompiler.status,
    jobs: portalRouteCompiler.jobs,
    hits: portalRouteCompiler.hits,
    misses: portalRouteCompiler.misses,
    errors: portalRouteCompiler.errors,
    snapshotKey: portalRouteCompiler.snapshotKey,
    cachedRoutes: Object.keys(portalRouteCompiler.cache || {})
  };
}

function makeEmptyAutonomyHysteresis() {
  return {
    schema: 'chrysalis-autonomy-hysteresis-v0.1',
    currentName: '',
    pendingName: '',
    pendingIndex: -1,
    pendingConfirmations: 0,
    pendingFirstTick: 0,
    pendingFirstTime: 0,
    lastCandidateName: '',
    lastCandidateSignal: 0,
    lastCandidateCertainty: 0,
    lastAcceptedTick: 0,
    lastAcceptedTime: 0,
    accepted: 0,
    held: 0,
    rejected: 0,
    stableFrames: 0,
    validationJobs: 0,
    transitionPacket: null,
    lastDecision: null,
    lastReason: 'cold'
  };
}
function resetAutonomyHysteresis() {
  const fresh = makeEmptyAutonomyHysteresis();
  fresh.currentName = currentStepRegime().name;
  fresh.lastAcceptedTick = tick;
  fresh.lastAcceptedTime = simTime;
  autonomyHysteresis = fresh;
}
function makeEmptyAutonomyPortalTransit() {
  return {
    schema: 'chrysalis-autonomy-portal-transit-v0.1',
    pendingAction: '',
    pendingConfirmations: 0,
    pendingFirstTick: 0,
    pendingFirstTime: 0,
    lastAction: 'none',
    lastActionTick: 0,
    lastActionTime: -Infinity,
    cooldownUntilTick: 0,
    cooldownUntilTime: -Infinity,
    entered: 0,
    stepped: 0,
    exited: 0,
    held: 0,
    rejected: 0,
    considered: 0,
    forcedProbes: 0,
    restCount: 0,
    restUntilTick: 0,
    restUntilTime: -Infinity,
    restLastTick: 0,
    restLastTime: -Infinity,
    restLastActionTotal: 0,
    lastConsideredAction: 'hold',
    lastProbeTick: 0,
    lastProbeTime: -Infinity,
    lastScore: 0,
    lastThreshold: 0,
    lastReason: 'cold',
    lastTarget: null,
    decision: null
  };
}
function resetAutonomyPortalTransit() {
  const fresh = makeEmptyAutonomyPortalTransit();
  fresh.lastActionTick = tick;
  fresh.lastActionTime = simTime;
  fresh.lastProbeTick = tick;
  fresh.lastProbeTime = simTime;
  fresh.cooldownUntilTick = tick;
  fresh.cooldownUntilTime = simTime;
  fresh.restLastTick = tick;
  fresh.restLastTime = simTime;
  fresh.restLastActionTotal = 0;
  autonomyPortalTransit = fresh;
}
function autonomyPortalTransitSummaryObject() {
  return {
    schema: autonomyPortalTransit.schema,
    pendingAction: autonomyPortalTransit.pendingAction,
    pendingConfirmations: autonomyPortalTransit.pendingConfirmations,
    lastAction: autonomyPortalTransit.lastAction,
    lastActionTick: autonomyPortalTransit.lastActionTick,
    lastActionTime: Number.isFinite(Number(autonomyPortalTransit.lastActionTime)) ? Number(Number(autonomyPortalTransit.lastActionTime).toFixed(4)) : 0,
    cooldownUntilTick: autonomyPortalTransit.cooldownUntilTick,
    cooldownUntilTime: Number.isFinite(Number(autonomyPortalTransit.cooldownUntilTime)) ? Number(Number(autonomyPortalTransit.cooldownUntilTime).toFixed(4)) : 0,
    entered: autonomyPortalTransit.entered,
    stepped: autonomyPortalTransit.stepped,
    exited: autonomyPortalTransit.exited,
    held: autonomyPortalTransit.held,
    rejected: autonomyPortalTransit.rejected,
    considered: autonomyPortalTransit.considered,
    forcedProbes: autonomyPortalTransit.forcedProbes,
    restCount: autonomyPortalTransit.restCount,
    restUntilTick: autonomyPortalTransit.restUntilTick,
    restUntilTime: Number.isFinite(Number(autonomyPortalTransit.restUntilTime)) ? Number(Number(autonomyPortalTransit.restUntilTime).toFixed(4)) : 0,
    restLastTime: Number.isFinite(Number(autonomyPortalTransit.restLastTime)) ? Number(Number(autonomyPortalTransit.restLastTime).toFixed(4)) : 0,
    restLastActionTotal: autonomyPortalTransit.restLastActionTotal,
    lastConsideredAction: autonomyPortalTransit.lastConsideredAction,
    lastProbeTick: autonomyPortalTransit.lastProbeTick,
    lastProbeTime: Number.isFinite(Number(autonomyPortalTransit.lastProbeTime)) ? Number(Number(autonomyPortalTransit.lastProbeTime).toFixed(4)) : 0,
    lastScore: Number(Number(autonomyPortalTransit.lastScore || 0).toFixed(4)),
    lastThreshold: Number(Number(autonomyPortalTransit.lastThreshold || 0).toFixed(4)),
    lastReason: autonomyPortalTransit.lastReason,
    lastTarget: autonomyPortalTransit.lastTarget,
    decision: autonomyPortalTransit.decision
  };
}
function autonomyRegimeOrderIndex(name) {
  const idx = AUTONOMY_STEP_REGIME_NAMES.indexOf(name);
  return idx >= 0 ? idx : 0;
}
function autonomyRegimeDistance(aName, bName) {
  return Math.abs(autonomyRegimeOrderIndex(aName) - autonomyRegimeOrderIndex(bName));
}
function autonomyRegimeScore(name, signal = autonomyRoutingSignal(), routes = frontierRoutes(), diagnostics = autonomyDiagnostics) {
  const target = (autonomyRegimeOrderIndex(name) + 0.5) / Math.max(1, AUTONOMY_STEP_REGIME_NAMES.length);
  const distance = Math.abs(clamp(Number(signal) || 0, 0, 1) - target);
  const live = diagnostics || makeEmptyAutonomyDiagnostics();
  const pressure = Number(autonomyPressure || live.pressure || 0) || 0;
  const novelty = Number(autonomyNovelty || live.novelty || 0) || 0;
  const stagnation = Number(autonomyStagnation || live.stagnation || 0) || 0;
  const route = routes || {};
  const syntax = Number(route.syntax || 0) + Number(route.zeroSum || 0) * 0.65 + Number(route.phaseLaw || 0) * 0.45;
  const rest = Number(route.rest || 0) || 0;
  const base = 1.0 - Math.min(1, distance * 2.15);
  return clamp(0.40 * base + 0.18 * pressure + 0.16 * novelty + 0.12 * stagnation + 0.12 * syntax + 0.06 * rest, 0, 1);
}
function autonomyCandidateCertainty(candidate, signal = autonomyRoutingSignal(), routes = frontierRoutes()) {
  const plannedCertainty = Number(candidate?.certainty || 0);
  const score = autonomyRegimeScore(candidate?.name || currentStepRegime().name, signal, routes, autonomyDiagnostics);
  const live = autonomyDiagnostics || makeEmptyAutonomyDiagnostics();
  const zeroSyntax = Math.max(
    Number(routes?.zeroSum || 0) || 0,
    Number(live.zeroFit || 0) || 0,
    Number(live.closureMean || 0) || 0,
    Number(symmetricFrontier?.routes?.zeroSum || 0) || 0
  );
  return clamp(Math.max(plannedCertainty, 0.42 + score * 0.42 + zeroSyntax * 0.12), 0, 1);
}
function compileAutonomyTransitionPacket({ fromIndex, toIndex, candidate, signal, routes, accepted, reason, confirmations }) {
  const fromRegime = STEP_REGIMES[clamp(Math.floor(fromIndex), 0, STEP_REGIMES.length - 1)] || currentStepRegime();
  const toRegime = STEP_REGIMES[clamp(Math.floor(toIndex), 0, STEP_REGIMES.length - 1)] || fromRegime;
  return {
    schema: 'chrysalis-autonomy-transition-packet-v0.1',
    from: { index: fromIndex, name: fromRegime.name, label: fromRegime.label, substeps: fromRegime.substeps || 0 },
    to: { index: toIndex, name: toRegime.name, label: toRegime.label, substeps: toRegime.substeps || 0 },
    accepted: Boolean(accepted),
    reason,
    confirmations: Number(confirmations || 0),
    certainty: Number((candidate?.certainty || 0).toFixed ? candidate.certainty.toFixed(4) : Number(candidate?.certainty || 0).toFixed(4)),
    signal: Number((Number(signal) || 0).toFixed(5)),
    routes: {
      explore: Number(Number(routes?.explore || 0).toFixed(4)),
      compress: Number(Number(routes?.compress || 0).toFixed(4)),
      rest: Number(Number(routes?.rest || 0).toFixed(4)),
      syntax: Number(Number(routes?.syntax || 0).toFixed(4)),
      zeroSum: Number(Number(routes?.zeroSum || 0).toFixed(4)),
      phaseLaw: Number(Number(routes?.phaseLaw || 0).toFixed(4))
    },
    tick,
    simTime: Number(Number(simTime || 0).toFixed(4)),
    note: 'CPU-compiled certainty packet only; no state density, shader sampling, or substep definition was blended.'
  };
}
function stabilizeAutonomyRegimeCandidate(candidate, signal = autonomyRoutingSignal(), routes = frontierRoutes()) {
  const currentIndex = ui.stepRegimeIndex;
  const current = currentStepRegime();
  const cappedIndex = capAutonomousStepRegimeIndex(Number(candidate?.index ?? currentIndex), autonomousMode);
  const target = STEP_REGIMES[cappedIndex] || current;
  const targetName = target.name;
  const certainty = autonomyCandidateCertainty({ ...candidate, name: targetName }, signal, routes);
  const targetScore = autonomyRegimeScore(targetName, signal, routes, autonomyDiagnostics);
  const currentScore = autonomyRegimeScore(current.name, signal, routes, autonomyDiagnostics);
  const distance = autonomyRegimeDistance(current.name, targetName);
  const elapsedTicks = tick - Math.max(autonomyLastRouteTick, autonomyHysteresis.lastAcceptedTick || 0);
  const elapsedTime = simTime - Math.max(autonomyLastRouteTime, autonomyHysteresis.lastAcceptedTime || 0);
  const cooldown = elapsedTicks >= AUTONOMY_HYSTERESIS_SWITCH_TICKS || elapsedTime >= AUTONOMY_HYSTERESIS_SWITCH_SECONDS;
  const baseConfirmations = distance > 1 ? AUTONOMY_HYSTERESIS_JUMP_CONFIRMATIONS : AUTONOMY_HYSTERESIS_BASE_CONFIRMATIONS;
  const neededConfirmations = certainty >= AUTONOMY_HYSTERESIS_HIGH_CERTAINTY ? 1 : baseConfirmations;
  const scoreMargin = AUTONOMY_HYSTERESIS_SIGNAL_MARGIN + Math.max(0, distance - 1) * 0.025;

  autonomyHysteresis.currentName = current.name;
  autonomyHysteresis.lastCandidateName = targetName;
  autonomyHysteresis.lastCandidateSignal = Number(signal) || 0;
  autonomyHysteresis.lastCandidateCertainty = certainty;
  autonomyHysteresis.validationJobs++;

  if (targetName === current.name) {
    autonomyHysteresis.pendingName = '';
    autonomyHysteresis.pendingIndex = -1;
    autonomyHysteresis.pendingConfirmations = 0;
    autonomyHysteresis.stableFrames++;
    autonomyHysteresis.lastReason = 'stay current · candidate already matches active regime';
    autonomyHysteresis.transitionPacket = compileAutonomyTransitionPacket({ fromIndex: currentIndex, toIndex: currentIndex, candidate: { ...candidate, certainty, name: targetName }, signal, routes, accepted: false, reason: autonomyHysteresis.lastReason, confirmations: 0 });
    return { index: currentIndex, accepted: false, held: true, reason: autonomyHysteresis.lastReason, candidate: { ...candidate, name: targetName, index: cappedIndex, certainty } };
  }

  if (autonomyHysteresis.pendingName === targetName) {
    autonomyHysteresis.pendingConfirmations++;
  } else {
    autonomyHysteresis.pendingName = targetName;
    autonomyHysteresis.pendingIndex = cappedIndex;
    autonomyHysteresis.pendingConfirmations = 1;
    autonomyHysteresis.pendingFirstTick = tick;
    autonomyHysteresis.pendingFirstTime = simTime;
  }

  const confirmed = autonomyHysteresis.pendingConfirmations >= neededConfirmations;
  const strongEnough = certainty >= AUTONOMY_CERTAINTY_MIN_APPLY && (targetScore >= currentScore + scoreMargin || certainty >= AUTONOMY_HYSTERESIS_HIGH_CERTAINTY);
  const accepted = cooldown && confirmed && strongEnough;
  const reason = accepted
    ? 'accepted after hysteresis · conf ' + autonomyHysteresis.pendingConfirmations + '/' + neededConfirmations + ' · score +' + (targetScore - currentScore).toFixed(3)
    : !cooldown
      ? 'held for cooldown · ' + elapsedTicks + 't ' + elapsedTime.toFixed(2) + 's'
      : !confirmed
        ? 'held for confirmation · conf ' + autonomyHysteresis.pendingConfirmations + '/' + neededConfirmations
        : 'held for margin · target ' + targetScore.toFixed(3) + ' current ' + currentScore.toFixed(3);

  autonomyHysteresis.transitionPacket = compileAutonomyTransitionPacket({ fromIndex: currentIndex, toIndex: cappedIndex, candidate: { ...candidate, certainty, name: targetName }, signal, routes, accepted, reason, confirmations: autonomyHysteresis.pendingConfirmations });
  autonomyHysteresis.lastDecision = { targetName, cappedIndex, certainty, targetScore, currentScore, distance, confirmed, cooldown, strongEnough, reason, tick, simTime };
  autonomyHysteresis.lastReason = reason;
  if (accepted) {
    autonomyHysteresis.accepted++;
    autonomyHysteresis.pendingName = '';
    autonomyHysteresis.pendingIndex = -1;
    autonomyHysteresis.pendingConfirmations = 0;
    autonomyHysteresis.lastAcceptedTick = tick;
    autonomyHysteresis.lastAcceptedTime = simTime;
    return { index: cappedIndex, accepted: true, held: false, reason, candidate: { ...candidate, name: targetName, index: cappedIndex, certainty } };
  }
  autonomyHysteresis.held++;
  return { index: currentIndex, accepted: false, held: true, reason, candidate: { ...candidate, name: targetName, index: cappedIndex, certainty } };
}
function autonomyHysteresisStatusText() {
  const pending = autonomyHysteresis.pendingName ? (' · pending ' + autonomyHysteresis.pendingName + ' x' + autonomyHysteresis.pendingConfirmations) : ' · steady';
  return 'hys a' + autonomyHysteresis.accepted + ' h' + autonomyHysteresis.held + pending + ' · ' + autonomyHysteresis.lastReason;
}
function autonomyHysteresisSummaryObject() {
  return {
    schema: autonomyHysteresis.schema,
    currentName: autonomyHysteresis.currentName,
    pendingName: autonomyHysteresis.pendingName,
    pendingIndex: autonomyHysteresis.pendingIndex,
    pendingConfirmations: autonomyHysteresis.pendingConfirmations,
    lastCandidateName: autonomyHysteresis.lastCandidateName,
    lastCandidateSignal: Number(Number(autonomyHysteresis.lastCandidateSignal || 0).toFixed(5)),
    lastCandidateCertainty: Number(Number(autonomyHysteresis.lastCandidateCertainty || 0).toFixed(5)),
    accepted: autonomyHysteresis.accepted,
    held: autonomyHysteresis.held,
    rejected: autonomyHysteresis.rejected,
    stableFrames: autonomyHysteresis.stableFrames,
    validationJobs: autonomyHysteresis.validationJobs,
    lastReason: autonomyHysteresis.lastReason,
    transitionPacket: autonomyHysteresis.transitionPacket,
    lastDecision: autonomyHysteresis.lastDecision
  };
}

function makeEmptyBackgroundAutonomyPlanner() {
  return {
    schema: 'chrysalis-background-autonomy-planner-v0.2',
    worker: null,
    supported: false,
    busy: false,
    seq: 0,
    jobs: 0,
    hits: 0,
    misses: 0,
    errors: 0,
    applied: 0,
    validated: 0,
    heldByHysteresis: 0,
    lastRequestTime: -Infinity,
    lastResponseTime: -Infinity,
    status: 'cold',
    error: '',
    decision: null,
    snapshotKey: '',
    history: []
  };
}
function resetBackgroundAutonomyPlannerCache() {
  backgroundAutonomyPlanner.decision = null;
  backgroundAutonomyPlanner.snapshotKey = '';
  backgroundAutonomyPlanner.history.length = 0;
  backgroundAutonomyPlanner.status = backgroundAutonomyPlanner.supported ? 'ready-empty' : backgroundAutonomyPlanner.status;
}
function backgroundAutonomyPlannerWorkerSource() {
  return `
const AUTONOMY_SIGNAL_LADDER = ${JSON.stringify(AUTONOMY_SIGNAL_LADDER)};
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, Number(v) || 0)); }
function capRegimeName(name, regimes, cap) {
  const list = Array.isArray(regimes) ? regimes : [];
  const found = list.find(r => r.name === name);
  if (found && found.autonomy && Number(found.substeps || 0) <= cap) return name;
  const allowed = list.filter(r => r.autonomy && Number(r.substeps || 0) <= cap).sort((a, b) => Number(a.substeps || 0) - Number(b.substeps || 0));
  return (allowed[allowed.length - 1] || list[0] || { name: 'primordial-2' }).name;
}
function fallbackRegimeName(signal, regimes, cap) {
  const row = AUTONOMY_SIGNAL_LADDER.find(item => signal < Number(item.ceiling || 1)) || AUTONOMY_SIGNAL_LADDER[AUTONOMY_SIGNAL_LADDER.length - 1];
  return capRegimeName(row && row.regime ? row.regime : 'primordial-2', regimes, cap);
}
function frontierPressure(routes) {
  routes = routes || {};
  return clamp(
    0.10
    + 0.42 * (routes.compress || 0)
    + 0.70 * (routes.explore || 0)
    + 0.32 * (routes.phaseLaw || 0)
    + 0.22 * (routes.syntax || 0)
    + 0.18 * (routes.zeroSum || 0)
    - 0.30 * (routes.rest || 0)
    - 0.18 * (routes.audit || 0),
    0,
    1
  );
}
function regimeOrder(regimes) {
  return (Array.isArray(regimes) ? regimes : [])
    .filter(r => r.autonomy && !r.riemannMode)
    .sort((a, b) => Number(a.substeps || 0) - Number(b.substeps || 0));
}
function routeBiasForName(name, snapshot) {
  const routes = snapshot.routes || {};
  const live = snapshot.diagnostics || {};
  const rest = Number(routes.rest || 0);
  const compress = Number(routes.compress || 0);
  const explore = Number(routes.explore || 0);
  const audit = Number(routes.audit || 0);
  const phase = Number(routes.phaseLaw || 0);
  const syntax = Math.max(Number(routes.syntax || 0), Number(routes.zeroSum || 0), Number(live.zeroFit || 0), Number(live.closureMean || 0));
  const novelty = Number(live.novelty || 0);
  const stagnation = Number(live.stagnation || 0);
  const pressure = Number(live.pressure || live.complexity || 0);
  if (name === 'q1-1') return rest * 0.24 + audit * 0.06 - explore * 0.08;
  if (name === 'primordial-2') return rest * 0.16 + audit * 0.10 + pressure * 0.04;
  if (name === 'triad-3') return audit * 0.13 + syntax * 0.13 + novelty * 0.06;
  if (name === 'four-4') return audit * 0.07 + compress * 0.10 + syntax * 0.12 + novelty * 0.06;
  if (name === 'six-6') return compress * 0.17 + syntax * 0.10 + stagnation * 0.06;
  if (name === 'seven-7') return explore * 0.16 + phase * 0.13 + syntax * 0.08;
  if (name === 'singularity-13') return explore * 0.18 + phase * 0.17 + stagnation * 0.08;
  return 0;
}
function pingPongPenalty(name, snapshot, allowed) {
  const currentName = snapshot.currentName || '';
  const currentIdx = allowed.findIndex(r => r.name === currentName);
  const targetIdx = allowed.findIndex(r => r.name === name);
  if (currentIdx < 0 || targetIdx < 0) return 0;
  const distance = Math.abs(targetIdx - currentIdx);
  const endpointJump = (currentName === 'q1-1' && (name === 'seven-7' || name === 'singularity-13'))
    || ((currentName === 'seven-7' || currentName === 'singularity-13') && name === 'q1-1');
  const h = snapshot.hysteresis || {};
  const recent = h.lastCandidateName === name || h.pendingName === name;
  return (endpointJump ? 0.18 : 0) + (distance > 2 ? 0.035 * (distance - 2) : 0) + (recent && distance > 1 ? 0.035 : 0);
}
function scoreRegime(regime, snapshot, signal) {
  const cap = Number(snapshot.cap || 13);
  const allowed = regimeOrder(snapshot.regimes || []).filter(r => Number(r.substeps || 0) <= cap);
  const idx = Math.max(0, allowed.findIndex(r => r.name === regime.name));
  const currentIdx = Math.max(0, allowed.findIndex(r => r.name === snapshot.currentName));
  const center = (idx + 0.5) / Math.max(1, allowed.length);
  const fit = 1.0 - Math.min(1, Math.abs(Number(signal || 0) - center) * 1.72);
  const distance = Math.abs(idx - currentIdx);
  const bridgeBonus = distance === 1 ? 0.030 : distance === 2 ? 0.014 : 0;
  const dither = 0.024 * Math.sin(Number(snapshot.simTime || 0) * 0.37 + idx * 2.399963 + Number(signal || 0) * 6.283185307179586);
  return clamp(0.68 * fit + routeBiasForName(regime.name, snapshot) + bridgeBonus + dither - pingPongPenalty(regime.name, snapshot, allowed), 0, 1);
}
function scoreTable(snapshot, signal) {
  const cap = Number(snapshot.cap || 13);
  return regimeOrder(snapshot.regimes || [])
    .filter(r => Number(r.substeps || 0) <= cap)
    .map(r => ({ name: r.name, index: r.index, label: r.label, substeps: r.substeps, score: Number(scoreRegime(r, snapshot, signal).toFixed(5)) }))
    .sort((a, b) => b.score - a.score);
}
function selectRegimeName(snapshot) {
  const cap = Number(snapshot.cap || 13);
  const regimes = snapshot.regimes || [];
  const routes = snapshot.routes || {};
  const legacy = clamp(Number(snapshot.legacySignal || 0), 0, 1);
  const signal = clamp(0.70 * frontierPressure(routes) + 0.30 * legacy, 0, 1);
  if (snapshot.mode === 'riemann') return { name: snapshot.riemannName || 'riemann-shock', signal, reason: 'riemann exact branch', scores: [] };
  const scores = scoreTable(snapshot, signal);
  const name = scores[0]?.name || fallbackRegimeName(signal, regimes, cap);
  return { name: capRegimeName(name, regimes, cap), signal, reason: 'scored ladder · anti-ping-pong', scores };
}
self.onmessage = event => {
  const msg = event.data || {};
  if (msg.type !== 'plan') return;
  const snapshot = msg.snapshot || {};
  try {
    const choice = selectRegimeName(snapshot);
    const regimes = snapshot.regimes || [];
    const regime = regimes.find(r => r.name === choice.name) || null;
    const topScore = choice.scores && choice.scores.length ? choice.scores[0].score : 0;
    const chosenScore = (choice.scores || []).find(s => s.name === choice.name)?.score ?? topScore;
    const currentScore = (choice.scores || []).find(s => s.name === snapshot.currentName)?.score ?? 0;
    const live = snapshot.diagnostics || {};
    const routes = snapshot.routes || {};
    const zeroSyntax = Math.max(Number(routes.zeroSum || 0), Number(routes.syntax || 0), Number(live.zeroFit || 0), Number(live.closureMean || 0));
    const certainty = clamp(0.40 + Math.abs(choice.signal - 0.5) * 0.34 + chosenScore * 0.28 + zeroSyntax * 0.12 + (live.stagnation || 0) * 0.06, 0, 1);
    const decision = {
      schema: 'chrysalis-background-autonomy-decision-v0.2',
      snapshotKey: snapshot.key || '',
      index: regime ? regime.index : Number(snapshot.currentIndex || 0),
      name: choice.name,
      label: regime ? regime.label : choice.name,
      substeps: regime ? regime.substeps : 0,
      signal: Number(choice.signal.toFixed(5)),
      reason: choice.reason,
      certainty: Number(certainty.toFixed(4)),
      scores: (choice.scores || []).slice(0, 6),
      currentScore: Number(Number(currentScore || 0).toFixed(5)),
      chosenScore: Number(Number(chosenScore || 0).toFixed(5)),
      scoreMargin: Number(Number(chosenScore - currentScore).toFixed(5)),
      syntaxCertainty: Number(zeroSyntax.toFixed(5)),
      validation: {
        schema: 'chrysalis-autonomy-route-validation-v0.1',
        top: choice.scores?.[0] || null,
        chosenScore: Number(Number(chosenScore || 0).toFixed(5)),
        currentScore: Number(Number(currentScore || 0).toFixed(5)),
        zeroSyntax: Number(zeroSyntax.toFixed(5)),
        cap: snapshot.cap,
        note: 'worker-side certainty/score table; main thread hysteresis decides whether to apply.'
      },
      note: 'worker-planned autonomy route · ' + choice.reason
    };
    self.postMessage({ type: 'planned', id: msg.id, key: snapshot.key, decision, stats: { mode: snapshot.mode, cap: snapshot.cap, signal: decision.signal, certainty: decision.certainty } });
  } catch (err) {
    self.postMessage({ type: 'error', id: msg.id, epoch: msg.epoch || 0, message: err && err.message ? err.message : String(err) });
  }
};`;
}
function startBackgroundAutonomyPlanner() {
  if (backgroundAutonomyPlanner.worker || typeof Worker === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined') {
    backgroundAutonomyPlanner.supported = Boolean(backgroundAutonomyPlanner.worker);
    return backgroundAutonomyPlanner.supported;
  }
  try {
    const blob = new Blob([backgroundAutonomyPlannerWorkerSource()], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url);
    URL.revokeObjectURL(url);
    worker.onmessage = (event) => {
      const msg = event.data || {};
      backgroundAutonomyPlanner.busy = false;
      if (msg.type === 'planned') {
        cpuInstrumentation.workerResponses++;
        backgroundAutonomyPlanner.decision = msg.decision || null;
        backgroundAutonomyPlanner.snapshotKey = msg.key || '';
        backgroundAutonomyPlanner.lastResponseTime = simTime;
        backgroundAutonomyPlanner.status = 'ready ' + (msg.stats?.mode || 'mode') + '/' + (msg.stats?.cap || '?');
        backgroundAutonomyPlanner.history.unshift({ tick, simTime: Number(simTime.toFixed(3)), decision: backgroundAutonomyPlanner.decision });
        backgroundAutonomyPlanner.history.length = Math.min(AUTONOMY_PLANNER_HISTORY_CAP, backgroundAutonomyPlanner.history.length);
        uiNeedsUpdate = true;
      } else if (msg.type === 'error') {
        cpuInstrumentation.workerResponses++;
        backgroundAutonomyPlanner.errors++;
        backgroundAutonomyPlanner.error = msg.message || 'unknown worker error';
        backgroundAutonomyPlanner.status = 'error';
      }
    };
    worker.onerror = (event) => {
      backgroundAutonomyPlanner.busy = false;
      backgroundAutonomyPlanner.errors++;
      backgroundAutonomyPlanner.error = event?.message || 'worker error';
      backgroundAutonomyPlanner.status = 'error';
    };
    backgroundAutonomyPlanner.worker = worker;
    backgroundAutonomyPlanner.supported = true;
    backgroundAutonomyPlanner.status = 'warm';
    return true;
  } catch (err) {
    backgroundAutonomyPlanner.supported = false;
    backgroundAutonomyPlanner.error = err && err.message ? err.message : String(err);
    backgroundAutonomyPlanner.status = 'disabled';
    return false;
  }
}
function backgroundAutonomyPlannerSnapshot() {
  const routes = frontierRoutes();
  const live = autonomyDiagnostics || makeEmptyAutonomyDiagnostics();
  const key = [
    autonomousMode,
    ui.stepRegimeIndex,
    tick,
    Math.round(simTime * 10),
    Math.round((live.pressure || 0) * 1000),
    Math.round((live.novelty || 0) * 1000),
    Math.round((live.stagnation || 0) * 1000),
    Math.round((routes.explore || 0) * 1000),
    Math.round((routes.compress || 0) * 1000),
    Math.round((routes.rest || 0) * 1000),
    residentSignalEpoch,
    coldBankActiveMode
  ].join(':');
  return {
    key,
    active: autonomousActive,
    mode: autonomousMode,
    cap: autonomyStepCapForMode(autonomousMode),
    currentIndex: ui.stepRegimeIndex,
    currentName: currentStepRegime().name,
    riemannName: STEP_REGIMES[riemannStepRegimeIndex()]?.name || 'riemann-shock',
    tick,
    simTime,
    legacySignal: legacyAutonomyRoutingSignal(),
    routes,
    hysteresis: autonomyHysteresisSummaryObject(),
    cpu: {
      frameMs: Number(cpuInstrumentation.frameMs || 0),
      longFrames: Number(cpuInstrumentation.longFrames || 0),
      simStepsLast: Number(cpuInstrumentation.simStepsLast || 0)
    },
    residentSignal: {
      active: Boolean(residentSignal),
      epoch: residentSignalEpoch,
      fullness: Number(residentSignalFullness || 0),
      stableScans: Number(residentSignalStableScans || 0),
      compiledZeroSumActive: Boolean(compiledZeroSumLayer.active),
      compiledZeroSumCount: Number(compiledZeroSumLayer.tokenCount || 0),
      compiledZeroSumGain: Number(effectiveCompiledZeroSumGain ? effectiveCompiledZeroSumGain() : 0)
    },
    diagnostics: {
      complexity: Number(live.complexity || 0),
      pressure: Number(autonomyPressure || live.pressure || 0),
      novelty: Number(autonomyNovelty || live.novelty || 0),
      stagnation: Number(autonomyStagnation || live.stagnation || 0),
      zeroFit: Number(live.zeroFit || 0),
      closureMean: Number(live.closureMean || 0),
      phaseSpread: Number(live.phaseSpread || 0)
    },
    regimes: STEP_REGIMES.map((r, index) => ({ index, name: r.name, label: r.label, substeps: Number(r.substeps || 0), autonomy: AUTONOMY_STEP_REGIME_NAMES.includes(r.name) || Boolean(r.riemannMode), riemannMode: Boolean(r.riemannMode) }))
  };
}
function maybePlanAutonomy(force = false) {
  if (!autonomousActive || !isFullAutonomyMode(autonomousMode)) return false;
  if (!startBackgroundAutonomyPlanner()) return false;
  if (backgroundAutonomyPlanner.busy) return false;
  const budget = currentDiagnosticBudget();
  const interval = Math.max(AUTONOMY_PLANNER_INTERVAL_SECONDS, Number(budget.autonomyPlannerInterval || AUTONOMY_PLANNER_INTERVAL_SECONDS));
  if (!force && (Number(simTime) || 0) - backgroundAutonomyPlanner.lastRequestTime < interval) return false;
  const snapshot = backgroundAutonomyPlannerSnapshot();
  if (!force && snapshot.key === backgroundAutonomyPlanner.snapshotKey) return false;
  backgroundAutonomyPlanner.seq++;
  backgroundAutonomyPlanner.jobs++;
  cpuInstrumentation.workerJobs++;
  backgroundAutonomyPlanner.busy = true;
  backgroundAutonomyPlanner.lastRequestTime = simTime;
  backgroundAutonomyPlanner.status = 'planning';
  try {
    backgroundAutonomyPlanner.worker.postMessage({ type: 'plan', id: backgroundAutonomyPlanner.seq, snapshot });
    return true;
  } catch (err) {
    backgroundAutonomyPlanner.busy = false;
    backgroundAutonomyPlanner.errors++;
    backgroundAutonomyPlanner.error = err && err.message ? err.message : String(err);
    backgroundAutonomyPlanner.status = 'post-failed';
    return false;
  }
}
function takeBackgroundAutonomyDecision() {
  const decision = backgroundAutonomyPlanner.decision;
  if (!decision || decision.snapshotKey !== backgroundAutonomyPlanner.snapshotKey) {
    backgroundAutonomyPlanner.misses++;
    return null;
  }
  backgroundAutonomyPlanner.hits++;
  return { ...decision };
}
function backgroundAutonomyPlannerStatusText() {
  if (!backgroundAutonomyPlanner.supported) return 'planner off';
  const busy = backgroundAutonomyPlanner.busy ? ' busy' : '';
  const last = backgroundAutonomyPlanner.decision ? ' · next ' + backgroundAutonomyPlanner.decision.label : '';
  return 'planner ' + backgroundAutonomyPlanner.status + busy + ' · hit ' + backgroundAutonomyPlanner.hits + ' miss ' + backgroundAutonomyPlanner.misses + ' job ' + backgroundAutonomyPlanner.jobs + ' val ' + backgroundAutonomyPlanner.validated + ' held ' + backgroundAutonomyPlanner.heldByHysteresis + last;
}
function backgroundAutonomyPlannerSummaryObject() {
  return {
    schema: backgroundAutonomyPlanner.schema,
    supported: backgroundAutonomyPlanner.supported,
    busy: backgroundAutonomyPlanner.busy,
    status: backgroundAutonomyPlanner.status,
    jobs: backgroundAutonomyPlanner.jobs,
    hits: backgroundAutonomyPlanner.hits,
    misses: backgroundAutonomyPlanner.misses,
    errors: backgroundAutonomyPlanner.errors,
    applied: backgroundAutonomyPlanner.applied,
    validated: backgroundAutonomyPlanner.validated,
    heldByHysteresis: backgroundAutonomyPlanner.heldByHysteresis,
    snapshotKey: backgroundAutonomyPlanner.snapshotKey,
    decision: backgroundAutonomyPlanner.decision,
    history: backgroundAutonomyPlanner.history.slice(0, 16)
  };
}

function makeEmptySyntaxResidency() {
  return {
    schema: 'chrysalis-syntax-residency-v0.2',
    worker: null,
    workers: [],
    workerIndex: 0,
    workerCount: RESIDENT_SYNTAX_WORKER_COUNT,
    supported: false,
    status: 'cold',
    errors: 0,
    jobs: 0,
    responses: 0,
    transfers: 0,
    lastTransferTime: -Infinity,
    lastResponseTime: -Infinity,
    latestBlock: null,
    latestMetrics: null,
    latestTick: 0,
    latestAge: Infinity,
    blockBytes: SYNTAX_BLOCK_FLOATS * Float32Array.BYTES_PER_ELEMENT,
    transferredBytes: 0,
    returnedScanBuffers: 0,
    poolHits: 0,
    poolMisses: 0,
    inFlight: 0,
    droppedJobs: 0,
    residentRelations: 0,
    residentCandidates: 0,
    deepPasses: 0,
    historyDepth: 0
  };
}
function residentSyntaxWorkerSource() {
  return `
const TOKEN_CAP = ${COMPILED_ZERO_SUM_TOKEN_CAP};
const BLOCK_FLOATS = ${SYNTAX_BLOCK_FLOATS};
const META_OFFSET = ${SYNTAX_BLOCK_TOKEN_FLOATS};
const PORTAL_OFFSET = ${SYNTAX_BLOCK_TOKEN_FLOATS + SYNTAX_BLOCK_META_FLOATS};
const AUTONOMY_OFFSET = ${SYNTAX_BLOCK_AUTONOMY_OFFSET};
const PHASE_OFFSET = ${SYNTAX_BLOCK_PHASE_OFFSET};
const HYSTERESIS_OFFSET = ${SYNTAX_BLOCK_HYSTERESIS_OFFSET};
const RELATION_CAP = ${RESIDENT_SYNTAX_RELATION_CAP};
const AGGRESSIVE = ${RESIDENT_SYNTAX_AGGRESSIVE ? 'true' : 'false'};
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, Number(v) || 0)); }
function phaseOf(x, y, z, w) { return Math.atan2(y - w, x - z); }
function hashCandidate(x, y, phase, closure, residual) { return ((x * 73856093) ^ (y * 19349663) ^ (Math.floor((phase + Math.PI) * 1000) * 83492791) ^ Math.floor(closure * 4096) ^ Math.floor(residual * 8192)) >>> 0; }
function sampleAt(pixels, size, x, y) {
  const xm = (x + size) & (size - 1);
  const ym = (y + size) & (size - 1);
  const i = (ym * size + xm) * 4;
  return [pixels[i] || 0, pixels[i + 1] || 0, pixels[i + 2] || 0, pixels[i + 3] || 0];
}
function scanToSyntaxBlock(pixels, size, stride, meta) {
  const candidates = [];
  let sampleCount = 0;
  let energySum = 0;
  let residualSum = 0;
  let closureSum = 0;
  let infoSum = 0;
  let infoMax = 0;
  for (let y = 0; y < size; y += stride) {
    for (let x = 0; x < size; x += stride) {
      const i = (y * size + x) * 4;
      const sx = pixels[i] || 0, sy = pixels[i + 1] || 0, sz = pixels[i + 2] || 0, sw = pixels[i + 3] || 0;
      const n0 = sampleAt(pixels, size, x + stride, y);
      const n1 = sampleAt(pixels, size, x - stride, y);
      const n2 = sampleAt(pixels, size, x, y + stride);
      const n3 = sampleAt(pixels, size, x, y - stride);
      const e = sx*sx + sy*sy + sz*sz + sw*sw;
      const residual = Math.abs(sx + sy + sz + sw);
      const visibleLen = Math.hypot(sx, sy) + 1e-9;
      const hiddenLen = Math.hypot(-sz, -sw) + 1e-9;
      const closure = clamp(((sx * -sz + sy * -sw) / (visibleLen * hiddenLen)) * 0.5 + 0.5, 0, 1);
      const diff = Math.hypot(sx - n0[0], sy - n1[1], sz - n2[2], sw - n3[3]);
      const winding = clamp(Math.abs(Math.atan2(sy - sw, sx - sz)) / Math.PI, 0, 1);
      const info = clamp(Math.log2(1 + 28 * e + 90 * diff + 2.4 * winding) / 6, 0, 1) * (0.35 + 0.65 * closure);
      const score = info * (0.35 + 0.65 * closure) * (0.25 + 0.75 / (1 + residual * 90)) * (0.65 + 0.35 * winding);
      sampleCount++;
      energySum += e;
      residualSum += residual;
      closureSum += closure;
      infoSum += info;
      if (info > infoMax) infoMax = info;
      if (score > 0.22) {
        candidates.push({
          center: [x / size, y / size],
          phase: phaseOf(sx, sy, sz, sw),
          zeroResidual: residual,
          closure,
          winding,
          info,
          score,
          persistence: clamp(score * 1.4, 0.05, 1.0),
          hash: hashCandidate(x, y, phaseOf(sx, sy, sz, sw), closure, residual).toString(16)
        });
      }
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const relationWindow = candidates.slice(0, Math.min(candidates.length, AGGRESSIVE ? 64 : 24));
  let relationCount = 0;
  let relationPressure = 0;
  let bestRelation = 0;
  for (let a = 0; a < relationWindow.length && relationCount < RELATION_CAP; a++) {
    const ca = relationWindow[a];
    for (let b = a + 1; b < relationWindow.length && relationCount < RELATION_CAP; b++) {
      const cb = relationWindow[b];
      const dx = Math.abs(ca.center[0] - cb.center[0]);
      const dy = Math.abs(ca.center[1] - cb.center[1]);
      const torDx = Math.min(dx, 1 - dx);
      const torDy = Math.min(dy, 1 - dy);
      const dist = Math.hypot(torDx, torDy);
      const phaseLock = 0.5 + 0.5 * Math.cos(ca.phase - cb.phase);
      const zeroPair = 1.0 / (1.0 + 48.0 * Math.abs(ca.zeroResidual - cb.zeroResidual));
      const p = clamp((ca.score * cb.score) * (0.35 + 0.65 * phaseLock) * (0.35 + 0.65 * zeroPair) * (0.55 + 0.45 / (1 + dist * 18)), 0, 1);
      if (p > 0.035) {
        relationCount++;
        relationPressure += p;
        if (p > bestRelation) bestRelation = p;
      }
    }
  }
  const block = new Float32Array(BLOCK_FLOATS);
  const chosen = candidates.slice(0, TOKEN_CAP);
  for (let i = 0; i < chosen.length; i++) {
    const c = chosen[i];
    const j = i * 4;
    block[j] = c.center[0];
    block[j + 1] = c.center[1];
    block[j + 2] = c.phase;
    block[j + 3] = clamp(c.score, 0, 1);
    block[META_OFFSET + j] = Math.max(0, c.zeroResidual);
    block[META_OFFSET + j + 1] = clamp(c.closure, 0, 1);
    block[META_OFFSET + j + 2] = clamp(c.winding, 0, 1);
    block[META_OFFSET + j + 3] = clamp(c.persistence, 0, 1);
  }
  block[AUTONOMY_OFFSET] = Number(meta?.autonomyPressure) || 0;
  block[AUTONOMY_OFFSET + 1] = Number(meta?.autonomyNovelty) || 0;
  block[AUTONOMY_OFFSET + 2] = Number(meta?.autonomyStagnation) || 0;
  block[AUTONOMY_OFFSET + 3] = Number(meta?.residentSignalFullness) || 0;
  block[PHASE_OFFSET] = Number(meta?.phaseLawAxisPhase) || 0;
  block[PHASE_OFFSET + 1] = Number(meta?.phaseLawAmplitude) || 0;
  block[PHASE_OFFSET + 2] = Number(meta?.phaseLawMacroIndex) || 0;
  block[PHASE_OFFSET + 3] = Number(meta?.phaseLawAttempt) || 0;
  block[HYSTERESIS_OFFSET] = Number(meta?.hysteresisCertainty) || 0;
  block[HYSTERESIS_OFFSET + 1] = Number(meta?.hysteresisSignal) || 0;
  block[HYSTERESIS_OFFSET + 2] = Number(meta?.hysteresisConfirmations) || 0;
  block[HYSTERESIS_OFFSET + 3] = chosen.length / TOKEN_CAP;
  const metrics = {
    sampleCount,
    tokenCount: chosen.length,
    candidateCount: candidates.length,
    energyMean: energySum / Math.max(1, sampleCount),
    zeroResidualMean: residualSum / Math.max(1, sampleCount),
    closureMean: closureSum / Math.max(1, sampleCount),
    infoMean: infoSum / Math.max(1, sampleCount),
    infoMax,
    relationCount,
    relationPressure: relationPressure / Math.max(1, relationCount),
    bestRelation,
    stride,
    aggressive: AGGRESSIVE
  };
  return { block, metrics };
}
self.onmessage = function(event) {
  const msg = event.data || {};
  if (msg.type !== 'SCAN_DATA' || !msg.payload) return;
  try {
    const pixels = new Float32Array(msg.payload);
    const result = scanToSyntaxBlock(pixels, Number(msg.size) || 512, Math.max(1, Number(msg.stride) || 4), msg.meta || {});
    self.postMessage({ type: 'SYNTAX_COMPILED', id: msg.id || 0, tick: msg.tick || 0, simTime: msg.simTime || 0, metrics: result.metrics, payload: result.block.buffer, scanPayload: pixels.buffer }, [result.block.buffer, pixels.buffer]);
  } catch (err) {
    self.postMessage({ type: 'ERROR', message: err && err.message ? err.message : String(err) });
  }
};
`;
}

function residentSyntaxPoolCapForSize(size = MATRIX_SIZE) {
  const bytesPerBuffer = matrixFrameByteLength(size);
  const baseBudget = BASE_FRAME_BYTE_LENGTH * RESIDENT_SYNTAX_POOL_CAP;
  return Math.max(12, Math.min(RESIDENT_SYNTAX_POOL_CAP, Math.floor(baseBudget / Math.max(1, bytesPerBuffer))));
}
function prewarmSyntaxTransferPool(size = MATRIX_SIZE) {
  const floats = Math.max(1, Math.floor(size) * Math.floor(size) * 4);
  for (let i = syntaxScanTransferPool.length - 1; i >= 0; i--) {
    if (!syntaxScanTransferPool[i] || syntaxScanTransferPool[i].length !== floats) syntaxScanTransferPool.splice(i, 1);
  }
  const cap = residentSyntaxPoolCapForSize(size);
  while (syntaxScanTransferPool.length > cap) syntaxScanTransferPool.pop();
  while (syntaxScanTransferPool.length < cap) {
    syntaxScanTransferPool.push(new Float32Array(floats));
  }
  syntaxResidency.status = syntaxResidency.status === 'cold' ? 'pool-warm' : syntaxResidency.status;
  return syntaxScanTransferPool.length;
}

function handleSyntaxResidencyMessage(msg) {
  if (msg.type === 'SYNTAX_COMPILED' && msg.payload) {
    syntaxResidency.inFlight = Math.max(0, syntaxResidency.inFlight - 1);
    syntaxResidency.responses++;
    syntaxResidency.lastResponseTime = simTime;
    syntaxResidency.latestBlock = new Float32Array(msg.payload);
    syntaxResidency.latestMetrics = msg.metrics || null;
    syntaxResidency.latestTick = Number(msg.tick || 0);
    syntaxResidency.latestAge = Math.max(0, tick - syntaxResidency.latestTick);
    syntaxResidency.residentRelations = Number(msg.metrics?.relationCount || 0);
    syntaxResidency.residentCandidates = Number(msg.metrics?.candidateCount || 0);
    syntaxResidency.deepPasses += 1;
    syntaxBlockHistory.unshift({ tick: syntaxResidency.latestTick, simTime: Number(msg.simTime || 0), metrics: msg.metrics || null });
    syntaxBlockHistory.length = Math.min(RESIDENT_SYNTAX_HISTORY_CAP, syntaxBlockHistory.length);
    syntaxResidency.historyDepth = syntaxBlockHistory.length;
    if (msg.scanPayload && syntaxScanTransferPool.length < residentSyntaxPoolCapForSize(app?.size || MATRIX_SIZE)) {
      syntaxScanTransferPool.push(new Float32Array(msg.scanPayload));
      syntaxResidency.returnedScanBuffers++;
    }
    syntaxResidency.status = 'resident-ready';
    cpuInstrumentation.workerResponses++;
  } else if (msg.type === 'ERROR') {
    syntaxResidency.inFlight = Math.max(0, syntaxResidency.inFlight - 1);
    syntaxResidency.errors++;
    syntaxResidency.status = 'error';
  }
}
function compactLiveSyntaxWorkers() {
  syntaxResidency.workers = (syntaxResidency.workers || []).filter(worker => worker && !worker.__dead);
  syntaxResidency.worker = syntaxResidency.workers[0] || null;
  syntaxResidency.supported = syntaxResidency.workers.length > 0;
  return syntaxResidency.workers;
}
function pickSyntaxResidencyWorker() {
  const workers = compactLiveSyntaxWorkers();
  if (!workers.length) return null;
  const index = Math.abs(Math.floor(syntaxResidency.workerIndex || 0)) % workers.length;
  syntaxResidency.workerIndex = (index + 1) % workers.length;
  return workers[index];
}
function startSyntaxResidencyWorker() {
  if (typeof Worker === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined') {
    syntaxResidency.supported = Boolean(syntaxResidency.worker);
    return syntaxResidency.supported;
  }
  const liveWorkers = compactLiveSyntaxWorkers();
  if (liveWorkers.length >= RESIDENT_SYNTAX_WORKER_COUNT) {
    syntaxResidency.status = syntaxResidency.status === 'cold' ? 'resident-warm' : syntaxResidency.status;
    return true;
  }
  let url = '';
  try {
    const blob = new Blob([residentSyntaxWorkerSource()], { type: 'text/javascript' });
    url = URL.createObjectURL(blob);
    while (syntaxResidency.workers.length < RESIDENT_SYNTAX_WORKER_COUNT) {
      const worker = new Worker(url);
      worker.onmessage = (event) => handleSyntaxResidencyMessage(event.data || {});
      worker.onerror = () => {
        worker.__dead = true;
        syntaxResidency.inFlight = Math.max(0, syntaxResidency.inFlight - 1);
        syntaxResidency.errors++;
        compactLiveSyntaxWorkers();
        syntaxResidency.status = syntaxResidency.supported ? 'degraded' : 'error';
      };
      syntaxResidency.workers.push(worker);
    }
    URL.revokeObjectURL(url);
    syntaxResidency.worker = syntaxResidency.workers[0] || null;
    syntaxResidency.supported = syntaxResidency.workers.length > 0;
    syntaxResidency.status = 'resident-pool-warm';
  } catch (err) {
    if (url) { try { URL.revokeObjectURL(url); } catch (_) {} }
    syntaxResidency.supported = compactLiveSyntaxWorkers().length > 0;
    syntaxResidency.status = syntaxResidency.supported ? 'resident-pool-partial' : 'disabled';
    syntaxResidency.errors++;
  }
  return syntaxResidency.supported;
}
function syntaxResidencyStatusText() {
  const metrics = syntaxResidency.latestMetrics;
  const m = metrics ? ' · tok ' + metrics.tokenCount + ' cand ' + metrics.candidateCount + ' rel ' + Number(metrics.relationCount || 0) + ' stride ' + Number(metrics.stride || 0) : '';
  return 'syntax ' + syntaxResidency.status + ' · job ' + syntaxResidency.jobs + '/' + syntaxResidency.responses
    + ' · xfer ' + syntaxResidency.transfers
    + ' · workers ' + ((syntaxResidency.workers && syntaxResidency.workers.length) || (syntaxResidency.worker ? 1 : 0)) + '/' + RESIDENT_SYNTAX_WORKER_COUNT
    + ' · inflight ' + syntaxResidency.inFlight
    + ' · drop ' + syntaxResidency.droppedJobs
    + ' · pool ' + syntaxResidency.poolHits + '/' + syntaxResidency.poolMisses
    + ' · hist ' + syntaxResidency.historyDepth
    + m;
}

function makeEmptyRuntimeRhythm() {
  return {
    schema: 'chrysalis-runtime-prime-lane-metronome-v0.1',
    frame: 0,
    frameStartMs: 0,
    softBudgetMs: RUNTIME_RHYTHM_BASE_SOFT_MS,
    maxHeavyTasks: RUNTIME_RHYTHM_MAX_HEAVY_TASKS,
    heavyTasks: 0,
    ran: 0,
    deferred: 0,
    skippedLane: 0,
    lastTask: '',
    lastTaskMs: 0
  };
}
function beginRuntimeRhythmFrame() {
  if (!RUNTIME_RHYTHM_ENABLED) return;
  runtimeRhythm.frame = frameSerial;
  runtimeRhythm.frameStartMs = performance.now();
  runtimeRhythm.softBudgetMs = RUNTIME_RHYTHM_BASE_SOFT_MS;
  runtimeRhythm.maxHeavyTasks = RUNTIME_RHYTHM_MAX_HEAVY_TASKS;
  runtimeRhythm.heavyTasks = 0;
}
function runtimeRhythmLaneDue(name) {
  if (!RUNTIME_RHYTHM_ENABLED) return true;
  const lane = RUNTIME_RHYTHM_LANES[name];
  if (!lane) return true;
  const period = Math.max(1, Math.floor(lane.period));
  const phase = Math.max(0, Math.floor(lane.phase)) % period;
  return (frameSerial % period) === phase;
}
function runtimeRhythmHasBudget() {
  if (!RUNTIME_RHYTHM_ENABLED) return true;
  if (runtimeRhythm.heavyTasks >= runtimeRhythm.maxHeavyTasks) return false;
  if (runtimeRhythm.heavyTasks > 0 && performance.now() - runtimeRhythm.frameStartMs >= runtimeRhythm.softBudgetMs) return false;
  return true;
}
function runRhythmMaintenance(name, fn) {
  if (!runtimeRhythmLaneDue(name)) {
    runtimeRhythm.skippedLane++;
    return false;
  }
  if (!runtimeRhythmHasBudget()) {
    runtimeRhythm.deferred++;
    return false;
  }
  const start = performance.now();
  const didWork = Boolean(fn());
  if (didWork) {
    runtimeRhythm.heavyTasks++;
    runtimeRhythm.ran++;
    runtimeRhythm.lastTask = name;
    runtimeRhythm.lastTaskMs = performance.now() - start;
  }
  return didWork;
}

function currentDiagnosticBudget() {
  // Runtime performance self-diagnostics are disabled in this branch.
  // Keep the proven default resident/PBO/autonomy worker cadences intact instead
  // of continuously recomputing a UI-oriented adaptive budget from frame timing.
  return DEFAULT_DIAGNOSTIC_BUDGET;
}

function makeEmptyGpuFeedOptimizer() {
  return {
    schema: 'chrysalis-feed-freeze-guard-v0.1',
    worker: null,
    supported: false,
    busy: false,
    status: 'cold',
    seq: 0,
    jobs: 0,
    responses: 0,
    errors: 0,
    hits: 0,
    misses: 0,
    lastRequestTime: -Infinity,
    lastResponseTime: -Infinity,
    lastAppliedTick: 0,
    snapshotKey: '',
    plan: null,
    stats: null,
    history: [],
    stateSkips: 0,
    textureBindSkips: 0,
    programSkips: 0,
    viewportSkips: 0,
    uniformSkips: 0,
    uniformUploads: 0,
    uniformArrayChecks: 0,
    cacheQuarantineFrames: 0,
    cacheInvalidations: 0,
    epoch: 0,
    certainty: 0,
    error: ''
  };
}
function gpuFeedOptimizerWorkerSource() {
  return `
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, Number(x) || 0));
function fnv1a(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
function torusDist(a, b) {
  const ax = Number(a?.[0] ?? 0.5), ay = Number(a?.[1] ?? 0.5);
  const bx = Number(b?.[0] ?? 0.5), by = Number(b?.[1] ?? 0.5);
  const dx = Math.abs(ax - bx); const dy = Math.abs(ay - by);
  const wx = Math.min(dx, 1 - dx); const wy = Math.min(dy, 1 - dy);
  return Math.sqrt(wx * wx + wy * wy);
}
function centerPressure(centers) {
  if (!Array.isArray(centers) || !centers.length) return { mean: 0, nearest: 1, spread: 0, pairs: 0 };
  let nearest = 1, sum = 0, pairs = 0;
  const cap = Math.min(centers.length, 96);
  for (let i = 0; i < cap; i++) {
    for (let j = i + 1; j < cap; j++) {
      const d = torusDist(centers[i].uv, centers[j].uv);
      nearest = Math.min(nearest, d);
      sum += d;
      pairs++;
    }
  }
  const mean = pairs ? sum / pairs : 0;
  return { mean, nearest, spread: clamp(mean * 2.2), pairs };
}
function centerGraph(centers) {
  const cap = Math.min(Array.isArray(centers) ? centers.length : 0, 96);
  const nodes = [];
  let edgeWeight = 0;
  let edgeCount = 0;
  for (let i = 0; i < cap; i++) {
    const neighbors = [];
    for (let j = 0; j < cap; j++) {
      if (i === j) continue;
      const d = torusDist(centers[i].uv, centers[j].uv);
      const weight = clamp((Number(centers[j].weight || 0) + 0.2) / (0.05 + d));
      neighbors.push({ j, d, weight });
    }
    neighbors.sort((a, b) => b.weight - a.weight);
    const keep = neighbors.slice(0, 6).map(n => ({ index: n.j, distance: Number(n.d.toFixed(5)), weight: Number(n.weight.toFixed(4)) }));
    edgeWeight += keep.reduce((a, b) => a + b.weight, 0);
    edgeCount += keep.length;
    nodes.push({ index: i, source: centers[i].source || 'center', degree: keep.length, neighbors: keep });
  }
  return { nodeCount: nodes.length, edgeCount, meanEdgeWeight: edgeCount ? edgeWeight / edgeCount : 0, nodes: nodes.slice(0, 24) };
}
function atlasSlotAnalysis(slots, activeChunks) {
  const list = Array.isArray(slots) ? slots : [];
  const activeIds = new Set((Array.isArray(activeChunks) ? activeChunks : []).map(c => Math.floor(Number(c.id))));
  let free = 0, hot = 0, warm = 0, cold = 0, locked = 0;
  let recycleScore = 0;
  const scored = [];
  for (const slot of list) {
    const id = Math.floor(Number(slot.id));
    if (slot.locked) locked++;
    if (!slot.active) free++;
    else if (activeIds.has(id)) hot++;
    else if (Number(slot.keepScore || 0) > 0.45) warm++;
    else cold++;
    const score = clamp((slot.active ? 0.25 : 1.0) + (1 - Number(slot.keepScore || 0)) * 0.55 + Number(slot.age || 0) * 0.02 - (slot.locked ? 1.0 : 0));
    recycleScore += score;
    scored.push({ id, score: Number(score.toFixed(4)), active: Boolean(slot.active), locked: Boolean(slot.locked), source: slot.source || 'slot' });
  }
  scored.sort((a, b) => b.score - a.score);
  return { free, hot, warm, cold, locked, recycleMean: list.length ? recycleScore / list.length : 0, candidates: scored.slice(0, 8) };
}
function buildPassPlan(s) {
  const q = s.regime || {};
  const activeChunks = Array.isArray(s.activeChunks) ? s.activeChunks : [];
  const substeps = Math.max(1, Math.floor(Number(q.substeps) || 1));
  const simPasses = q.chunkCount && q.chunkSubsteps ? Math.max(1, Math.floor(Number(q.chunkCount) || 1)) * Math.max(1, Math.floor(Number(q.chunkSubsteps) || 1)) : substeps;
  const childPasses = activeChunks.length;
  const backflowPasses = activeChunks.length;
  const pointerWrites = Math.max(0, Math.floor(Number(s.pendingPointers) || 0));
  const childInits = Math.max(0, Math.floor(Number(s.pendingInits) || 0)) * 2;
  const totalDraws = simPasses + childPasses + backflowPasses + pointerWrites + childInits + 1;
  return {
    simPasses, childPasses, backflowPasses, pointerWrites, childInits, totalDraws,
    textureSequence: ['state-read', activeChunks.length ? 'child-read' : 'child-fallback', 'state-write', 'screen'],
    fboSequence: ['state-write', activeChunks.length ? 'child-write' : 'none', activeChunks.length ? 'state-backflow' : 'none', 'default'].filter(x => x !== 'none')
  };
}
function validateSnapshot(s, plan) {
  const activeChunks = Array.isArray(s.activeChunks) ? s.activeChunks : [];
  const seen = new Set();
  let invalidChunks = 0;
  for (const c of activeChunks) {
    const id = Math.floor(Number(c.id));
    if (!Number.isFinite(id) || id < 0 || id >= Number(s.maxChunks || 16) || seen.has(id)) invalidChunks++;
    seen.add(id);
  }
  const noRuntimeAttach = Number(s.churn?.liveAttachments || 0) === 0;
  const fboStable = Number(s.churn?.fboSwitches || 0) >= 0 && Number(s.churn?.startupAttachments || 0) >= 2;
  const statePingPongOk = s.pingPong?.sRead !== s.pingPong?.sWrite;
  const childPingPongOk = !activeChunks.length || s.pingPong?.cRead !== s.pingPong?.cWrite;
  const routeCert = clamp(Number(s.routeCertainty || 0));
  const syntaxCert = clamp(0.5 * Number(s.syntax?.zeroFit || 0) + 0.3 * Number(s.syntax?.closureMean || 0) + 0.2 * Number(s.syntax?.residentSignalFullness || 0));
  const passLoad = clamp(plan.totalDraws / 128);
  const certainty = clamp(
    0.20 * (invalidChunks ? 0 : 1) +
    0.18 * (statePingPongOk ? 1 : 0) +
    0.12 * (childPingPongOk ? 1 : 0) +
    0.14 * (fboStable ? 1 : 0) +
    0.08 * (noRuntimeAttach ? 1 : 0.65) +
    0.15 * routeCert +
    0.08 * syntaxCert +
    0.05 * (1 - passLoad)
  );
  return { invalidChunks, noRuntimeAttach, fboStable, statePingPongOk, childPingPongOk, routeCert, syntaxCert, passLoad, certainty };
}
self.onmessage = (event) => {
  const msg = event.data || {};
  if (msg.type !== 'optimize') return;
  try {
    const s = msg.snapshot || {};
    const centers = Array.isArray(s.centers) ? s.centers : [];
    const passPlan = buildPassPlan(s);
    const validation = validateSnapshot(s, passPlan);
    const centerStats = centerPressure(centers);
    const graph = centerGraph(centers);
    const atlas = atlasSlotAnalysis(s.atlasSlots, s.activeChunks);
    const keyPayload = {
      tick: s.tick, regime: s.regime?.name, mode: s.autonomyMode, active: (s.activeChunks || []).map(c => c.id + ':' + c.ageBucket).join(','),
      queue: [s.pendingPointers, s.pendingInits], level: s.portal?.level, lateral: s.portal?.lateral,
      route: s.routeCertainty, syntax: s.syntax, ping: s.pingPong, canvas: s.canvas
    };
    const key = fnv1a(JSON.stringify(keyPayload));
    const uniformGroups = {
      simStaticKey: fnv1a(JSON.stringify({ regime: s.regime?.name, pinned: s.pinnedDescent, resident: s.residentSignal, coldBank: s.coldBank, syntax: s.syntax, subspace: s.subspaceUniformKey })),
      renderStaticKey: fnv1a(JSON.stringify({ view: s.view, viewing: s.viewing, canvas: s.canvas, portal: s.portal, coldBank: s.coldBank, syntax: s.syntax, frames: s.portalFrameKey })),
      childStaticKey: fnv1a(JSON.stringify({ chunks: (s.activeChunks || []).map(c => c.id + ':' + c.frameKey), atlas: s.childAtlasSize }))
    };
    const plan = {
      schema: 'chrysalis-gpu-feed-plan-v0.1', key, createdAtTick: s.tick, simTime: s.simTime,
      passPlan, validation, centerStats, centerGraph: graph, atlas, uniformGroups,
      certainty: validation.certainty,
      note: 'CPU-only prevalidation and command staging; does not mutate sim state, density, sampling, or step regime.'
    };
    self.postMessage({ type: 'optimized', id: msg.id, epoch: msg.epoch || 0, key, plan, stats: { centers: centers.length, graphEdges: graph.edgeCount, totalDraws: passPlan.totalDraws, certainty: validation.certainty, freeSlots: atlas.free, recycleMean: atlas.recycleMean } });
  } catch (err) {
    self.postMessage({ type: 'error', id: msg.id, epoch: msg.epoch || 0, message: err && err.message ? err.message : String(err) });
  }
};
`;
}
function startGpuFeedOptimizer() {
  if (gpuFeedOptimizer.worker || typeof Worker === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined') {
    gpuFeedOptimizer.supported = Boolean(gpuFeedOptimizer.worker);
    return gpuFeedOptimizer.supported;
  }
  try {
    const blob = new Blob([gpuFeedOptimizerWorkerSource()], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url);
    URL.revokeObjectURL(url);
    worker.onmessage = (event) => {
      const msg = event.data || {};
      if (Number(msg.epoch || 0) !== Number(gpuFeedOptimizer.epoch || 0)) {
        gpuFeedOptimizer.busy = false;
        gpuFeedOptimizer.status = 'stale-dropped';
        return;
      }
      gpuFeedOptimizer.busy = false;
      gpuFeedOptimizer.responses++;
      cpuInstrumentation.workerResponses++;
      if (msg.type === 'optimized') {
        gpuFeedOptimizer.plan = msg.plan || null;
        gpuFeedOptimizer.stats = msg.stats || null;
        gpuFeedOptimizer.snapshotKey = msg.key || '';
        gpuFeedOptimizer.lastResponseTime = simTime;
        gpuFeedOptimizer.certainty = Number(msg.plan?.certainty || 0);
        gpuFeedOptimizer.status = 'ready';
        gpuFeedOptimizer.history.unshift({ tick, simTime: Number(simTime.toFixed(3)), plan: msg.plan });
        gpuFeedOptimizer.history.length = Math.min(GPU_FEED_OPTIMIZER_HISTORY_CAP, gpuFeedOptimizer.history.length);
      } else if (msg.type === 'error') {
        gpuFeedOptimizer.errors++;
        gpuFeedOptimizer.error = msg.message || 'unknown worker error';
        gpuFeedOptimizer.status = 'error';
      }
    };
    worker.onerror = (event) => {
      gpuFeedOptimizer.busy = false;
      gpuFeedOptimizer.errors++;
      gpuFeedOptimizer.error = event?.message || 'worker error';
      gpuFeedOptimizer.status = 'error';
    };
    gpuFeedOptimizer.worker = worker;
    gpuFeedOptimizer.supported = true;
    gpuFeedOptimizer.status = 'warm';
  } catch (err) {
    gpuFeedOptimizer.supported = false;
    gpuFeedOptimizer.error = err && err.message ? err.message : String(err);
    gpuFeedOptimizer.status = 'disabled';
  }
  return gpuFeedOptimizer.supported;
}
function invalidateGpuFeedOptimizer(reason = 'state-boundary', frames = GPU_FEED_CACHE_QUARANTINE_FRAMES) {
  gpuFeedOptimizer.cacheInvalidations++;
  gpuFeedOptimizer.cacheQuarantineFrames = Math.max(Number(gpuFeedOptimizer.cacheQuarantineFrames) || 0, Math.max(1, Math.floor(Number(frames) || GPU_FEED_CACHE_QUARANTINE_FRAMES)));
  gpuFeedOptimizer.snapshotKey = '';
  gpuFeedOptimizer.plan = null;
  gpuFeedOptimizer.stats = null;
  gpuFeedOptimizer.status = 'invalidated · ' + reason;
  gpuFeedOptimizer.busy = false;
  gpuFeedOptimizer.epoch++;
  if (app?.kind === 'webgl2') resetGlStateCache(app);
}
function gpuFeedCacheEnabled() {
  return !(Number(gpuFeedOptimizer.cacheQuarantineFrames) > 0);
}
function decayGpuFeedCacheQuarantine() {
  if (Number(gpuFeedOptimizer.cacheQuarantineFrames) > 0) {
    gpuFeedOptimizer.cacheQuarantineFrames = Math.max(0, Math.floor(gpuFeedOptimizer.cacheQuarantineFrames) - 1);
    if (app?.kind === 'webgl2') resetGlStateCache(app);
  }
}
function compactGpuFeedCenter(c) {
  if (!c) return null;
  const uv = Array.isArray(c.uv) ? c.uv : Array.isArray(c.center) ? c.center : null;
  if (!uv) return null;
  return { uv: [Number(uv[0]) || 0.5, Number(uv[1]) || 0.5], weight: Number(c.weight || c.score || 0), source: String(c.source || 'center') };
}
function gpuFeedOptimizerSnapshotKey() {
  const regime = currentStepRegime();
  const live = autonomyDiagnostics || makeEmptyAutonomyDiagnostics();
  let activeKey = '';
  const active = subspace.active || [];
  for (let i = 0; i < active.length; i++) {
    const record = active[i];
    if (!record) continue;
    if (activeKey) activeKey += '|';
    activeKey += record.chunkId + ':' + Math.floor(Number(record.age || 0) * 4);
  }
  const routeCertainty = Number(autonomyHysteresis?.transitionPacket?.certainty || backgroundAutonomyPlanner?.decision?.certainty || 0);
  return [regime.name, activeKey, subspace.pendingPointers.length, subspace.pendingInits.length, portalLadder.level, portalLadder.lateral, routeCertainty.toFixed(2), Number(live.zeroFit || 0).toFixed(2), coldBankActiveMode, compiledZeroSumLayer?.tokenCount || 0].join('~');
}
function compactFloatArrayKey(values, digits = 2) {
  if (!values || !values.length) return '';
  const scale = Math.pow(10, digits);
  let key = '';
  for (let i = 0; i < values.length; i++) {
    if (i) key += ',';
    key += Math.round((Number(values[i]) || 0) * scale);
  }
  return key;
}
function gpuFeedOptimizerSnapshot() {
  const regime = currentStepRegime();
  const live = autonomyDiagnostics || makeEmptyAutonomyDiagnostics();
  const budget = currentDiagnosticBudget();
  const centerCap = Math.max(8, Math.floor(Number(budget.gpuFeedCenterCap || GPU_FEED_OPTIMIZER_CENTER_CAP)));
  const centers = collectPortalReferenceCenters({ includeBetween: true })
    .concat(collectSubspaceCenterCandidates())
    .slice(0, centerCap)
    .map(compactGpuFeedCenter)
    .filter(Boolean);
  const activeChunks = subspace.active.map(record => ({
    id: record.chunkId,
    ageBucket: Math.floor(Number(record.age || 0) * 4),
    source: record.source || 'unknown',
    frameKey: [Number(record.portalFrame?.twist || 0).toFixed(3), Number(record.portalFrame?.scale || 1).toFixed(3), Number(record.portalFrame?.handedness || 1).toFixed(0)].join(':')
  }));
  const routeCertainty = Number(autonomyHysteresis?.transitionPacket?.certainty || backgroundAutonomyPlanner?.decision?.certainty || 0);
  const subspaceUniformKey = compactFloatArrayKey(SUBSPACE_POINTER_VALUES, 2);
  const portalFrameKey = compactFloatArrayKey(SUBSPACE_PORTAL_FRAME_META, 2);
  const snapshot = {
    tick, simTime,
    regime: { name: regime.name, substeps: regime.substeps, chunkCount: regime.chunkCount || 0, chunkSubsteps: regime.chunkSubsteps || 0, riemannMode: Boolean(regime.riemannMode) },
    pinnedDescent, residentSignal, autonomyMode, autonomousActive,
    routeCertainty,
    activeChunks,
    atlasSlots: atlasAllocator.slots.map(slot => ({ id: slot.id, active: Boolean(slot.active), locked: Boolean(slot.locked), source: slot.source || '', keepScore: Number(slot.keepScore || 0), age: Number(simTime || 0) - Number(slot.bornTime || 0) })),
    maxChunks: MAX_CHUNKS,
    pendingPointers: subspace.pendingPointers.length,
    pendingInits: subspace.pendingInits.length,
    childAtlasSize: app?.childAtlasSize || TARGET_CHILD_ATLAS_SIZE,
    pingPong: app ? { sRead: app.sRead, sWrite: app.sWrite, cRead: app.cRead, cWrite: app.cWrite } : {},
    churn: { liveAttachments: churnStats.liveAttachments, startupAttachments: churnStats.startupAttachments, fboSwitches: churnStats.fboSwitches, mipmapGenerates: churnStats.mipmapGenerates, mipmapDisabled: churnStats.mipmapDisabled, depthPolicy: churnStats.depthPolicy },
    canvas: { width: canvas.width, height: canvas.height },
    view: { mode: viewMode, escher: portalRenderActive() },
    viewing: currentViewingMode().name,
    portal: { level: portalLadder.level, lateral: portalLadder.lateral, transit: portalTransitBlend(), focus: portalLadderRenderFocus(), phase: portalLadderRenderPhase() },
    coldBank: { mode: coldBankActiveMode, fullness: coldBankFullness, tension: coldBankTension },
    syntax: { zeroFit: Number(live.zeroFit || 0), closureMean: Number(live.closureMean || 0), residentSignalFullness, compiledCount: compiledZeroSumLayer.tokenCount || 0 },
    centers,
    subspaceUniformKey,
    portalFrameKey
  };
  snapshot.key = gpuFeedOptimizerSnapshotKey();
  return snapshot;
}
function maybeOptimizeGpuFeed(force = false) {
  if (!app || app.kind !== 'webgl2') return false;
  if (!startGpuFeedOptimizer()) return false;
  if (gpuFeedOptimizer.busy) return false;
  const activeNeed = autonomousActive || portalRenderActive() || activeChunkCount() > 0;
  if (!force && !activeNeed) return false;
  const budget = currentDiagnosticBudget();
  const interval = Math.max(GPU_FEED_OPTIMIZER_INTERVAL_SECONDS, Number(budget.gpuFeedInterval || GPU_FEED_OPTIMIZER_INTERVAL_SECONDS));
  if (!force && (Number(simTime) || 0) - gpuFeedOptimizer.lastRequestTime < interval) return false;
  const fastKey = gpuFeedOptimizerSnapshotKey();
  if (!force && fastKey === gpuFeedOptimizer.snapshotKey) {
    gpuFeedOptimizer.hits++;
    gpuFeedOptimizer.lastRequestTime = simTime;
    return false;
  }
  let snapshot;
  try {
    snapshot = gpuFeedOptimizerSnapshot();
  } catch (err) {
    gpuFeedOptimizer.errors++;
    gpuFeedOptimizer.error = err && err.message ? err.message : String(err);
    gpuFeedOptimizer.status = 'snapshot-failed';
    invalidateGpuFeedOptimizer('snapshot-failed', 4);
    return false;
  }
  if (!force && snapshot.key === gpuFeedOptimizer.snapshotKey) {
    gpuFeedOptimizer.hits++;
    gpuFeedOptimizer.lastRequestTime = simTime;
    return false;
  }
  gpuFeedOptimizer.seq++;
  gpuFeedOptimizer.jobs++;
  gpuFeedOptimizer.misses++;
  cpuInstrumentation.workerJobs++;
  gpuFeedOptimizer.busy = true;
  gpuFeedOptimizer.lastRequestTime = simTime;
  gpuFeedOptimizer.status = 'optimizing';
  try {
    gpuFeedOptimizer.worker.postMessage({ type: 'optimize', id: gpuFeedOptimizer.seq, epoch: gpuFeedOptimizer.epoch, snapshot });
    return true;
  } catch (err) {
    gpuFeedOptimizer.busy = false;
    gpuFeedOptimizer.errors++;
    gpuFeedOptimizer.error = err && err.message ? err.message : String(err);
    gpuFeedOptimizer.status = 'post-failed';
    invalidateGpuFeedOptimizer('post-failed', 4);
    return false;
  }
}
function gpuFeedOptimizerStatusText() {
  if (!gpuFeedOptimizer.supported) return 'feed off';
  const busy = gpuFeedOptimizer.busy ? ' busy' : '';
  const draws = gpuFeedOptimizer.plan?.passPlan?.totalDraws ?? 0;
  return 'feed ' + gpuFeedOptimizer.status + busy
    + ' · cert ' + Number(gpuFeedOptimizer.certainty || 0).toFixed(2)
    + ' · draws ' + draws
    + ' · job ' + gpuFeedOptimizer.jobs + '/' + gpuFeedOptimizer.responses
    + (gpuFeedOptimizer.cacheQuarantineFrames ? ' · cache cool ' + gpuFeedOptimizer.cacheQuarantineFrames : '')
    + ' · skip u' + gpuFeedOptimizer.uniformSkips + ' p' + gpuFeedOptimizer.programSkips + ' t' + gpuFeedOptimizer.textureBindSkips + ' v' + gpuFeedOptimizer.viewportSkips;
}
function gpuFeedOptimizerSummaryObject() {
  return {
    schema: gpuFeedOptimizer.schema,
    supported: gpuFeedOptimizer.supported,
    busy: gpuFeedOptimizer.busy,
    status: gpuFeedOptimizer.status,
    jobs: gpuFeedOptimizer.jobs,
    responses: gpuFeedOptimizer.responses,
    hits: gpuFeedOptimizer.hits,
    misses: gpuFeedOptimizer.misses,
    errors: gpuFeedOptimizer.errors,
    certainty: Number(Number(gpuFeedOptimizer.certainty || 0).toFixed(4)),
    stateSkips: gpuFeedOptimizer.stateSkips,
    programSkips: gpuFeedOptimizer.programSkips,
    textureBindSkips: gpuFeedOptimizer.textureBindSkips,
    viewportSkips: gpuFeedOptimizer.viewportSkips,
    uniformSkips: gpuFeedOptimizer.uniformSkips,
    uniformUploads: gpuFeedOptimizer.uniformUploads,
    cacheQuarantineFrames: gpuFeedOptimizer.cacheQuarantineFrames,
    cacheInvalidations: gpuFeedOptimizer.cacheInvalidations,
    epoch: gpuFeedOptimizer.epoch,
    plan: gpuFeedOptimizer.plan,
    history: gpuFeedOptimizer.history.slice(0, 12),
    note: 'CPU-side GPU feed staging only; no density, shader sampling, state evolution, or step-regime semantics are changed.'
  };
}
function portalLadderSourceTarget(direction = portalLadder.direction, source = 'portal-ladder') {
  const dir = direction >= 0 ? 1 : -1;
  const baseTarget = selectSubspacePortal();
  const base = Array.isArray(portalLadder.focus) ? portalLadder.focus : baseTarget.portal;
  const levelAbs = Math.min(PORTAL_LADDER_VISIBLE_LIMIT, Math.abs(portalLadder.level) + 1);
  const h0 = hash01(levelAbs * 17.0 + portalLadder.crossings * 5.0 + dir * 101.0);
  const h1 = hash01(levelAbs * 31.0 + portalLadder.crossings * 7.0 + dir * 211.0);
  const golden = 2.399963229728653;
  const wanderingAngle = portalLadder.phase + dir * (golden + 0.23 * Math.log2(1 + levelAbs)) + h0 * TAU * 0.21;
  const meetAngle = currentLadderFrameAngle() + (dir < 0 ? Math.PI : 0.0) - dir * (Number(portalLadder.lastFrame?.twist) || 0) * 0.33;
  const inverseMeet = dir < 0 && portalLadder.lastFrame ? 0.82 : 0.22;
  const angle = angleMix(wanderingAngle, meetAngle, inverseMeet);
  const radius = (dir < 0 && portalLadder.lastFrame ? 0.040 : 0.055) + PORTAL_LADDER_STEP_JITTER * h1 * (dir < 0 ? 0.55 : 1.0);
  const rawPortal = [
    wrap01((base?.[0] ?? 0.5) + Math.cos(angle) * radius),
    wrap01((base?.[1] ?? 0.5) + Math.sin(angle) * radius)
  ];
  const freedom = portalFreedom();
  const relock = nearestPortalReferenceCenter(rawPortal, { includeBetween: true, heading: angle });
  const portal = relock.distance < 0.20 ? torusMix(rawPortal, relock.center, 0.18 + 0.28 * freedom) : rawPortal;
  const axis = [Math.cos(angle + Math.PI * 0.5), Math.sin(angle + Math.PI * 0.5)];
  const pair = [
    compactSubspaceCenterCandidate([portal[0] - axis[0] * 0.075, portal[1] - axis[1] * 0.075], 0.72 + 0.22 * h0, 'ladder-a', angle),
    compactSubspaceCenterCandidate([portal[0] + axis[0] * 0.075, portal[1] + axis[1] * 0.075], 0.72 + 0.22 * h1, 'ladder-b', angle + Math.PI)
  ].filter(Boolean);
  return {
    portal,
    pair,
    score: clamp(0.74 + 0.20 * (1.0 - Math.abs(h0 - h1)), 0, 1),
    phase: angle,
    source: source + ' · ' + (dir > 0 ? 'down' : 'up') + ' L' + portalLadder.level + ' · ' + baseTarget.source,
    recycle: true,
    ladder: { level: portalLadder.level, direction: dir, crossings: portalLadder.crossings, offMap: true }
  };
}
function portalLateralSourceTarget(side = 1, source = 'portal-side') {
  const sgn = side >= 0 ? 1 : -1;
  const base = portalLadderRenderFocus();
  const freedom = portalFreedom();
  const levelAbs = Math.min(PORTAL_LADDER_VISIBLE_LIMIT, Math.abs(portalLadder.level) + 1);
  const h0 = hash01(levelAbs * 47.0 + portalLadder.sideCrossings * 11.0 + sgn * 307.0);
  const h1 = hash01(levelAbs * 59.0 + portalLadder.sideCrossings * 13.0 + sgn * 401.0);
  const frameAngle = currentLadderFrameAngle();
  const heading = frameAngle + sgn * Math.PI * 0.5 + (h0 - 0.5) * (0.22 + 0.34 * freedom);
  const radius = PORTAL_LATERAL_STEP_RADIUS * (0.72 + 0.90 * freedom) + PORTAL_LADDER_STEP_JITTER * 0.45 * h1;
  const rawPortal = [
    wrap01(base[0] + Math.cos(heading) * radius),
    wrap01(base[1] + Math.sin(heading) * radius)
  ];
  const nearest = nearestPortalReferenceCenter(rawPortal, { includeBetween: true, heading });
  const portal = nearest.distance < 0.28 ? torusMix(rawPortal, nearest.center, 0.32 + 0.42 * freedom) : rawPortal;
  const axis = [Math.cos(heading + Math.PI * 0.5), Math.sin(heading + Math.PI * 0.5)];
  const pair = [
    compactSubspaceCenterCandidate([portal[0] - axis[0] * 0.060, portal[1] - axis[1] * 0.060], 0.68 + 0.24 * freedom, sgn < 0 ? 'left-frame-a' : 'right-frame-a', heading),
    compactSubspaceCenterCandidate([portal[0] + axis[0] * 0.060, portal[1] + axis[1] * 0.060], 0.66 + 0.24 * h1, sgn < 0 ? 'left-frame-b' : 'right-frame-b', heading + Math.PI)
  ].filter(Boolean);
  return {
    portal,
    pair,
    score: clamp(0.70 + 0.22 * freedom + 0.08 * (1.0 - Math.abs(h0 - h1)), 0, 1),
    phase: heading,
    source: source + ' · ' + (sgn < 0 ? 'left' : 'right') + ' S' + portalLadder.lateral + ' · freedom ' + freedom.toFixed(2) + ' · nearest ' + nearest.source,
    recycle: true,
    ladder: { level: portalLadder.level, direction: portalLadder.direction, lateral: portalLadder.lateral, side: sgn, crossings: portalLadder.crossings, offMap: true, betweenCenters: true }
  };
}
function stepPortalLadder(direction = portalLadder.direction, source = 'portal-ladder') {
  const dir = direction >= 0 ? 1 : -1;
  const compiledTarget = takeCompiledPortalTarget(dir > 0 ? 'down' : 'up');
  if (portalTransitBlend() < 0.99 || !escherZoomActive) beginPortalTransit(true, source.indexOf('manual') >= 0 ? 1.05 : 0.85);
  portalLadder.direction = dir;
  portalLadder.level = portalLadder.level + dir;
  portalLadder.absoluteLevel = (Number(portalLadder.absoluteLevel) || 0) + dir;
  portalLadder.crossings++;
  if (dir > 0) portalLadder.downCrossings++; else portalLadder.upCrossings++;
  portalLadder.phase = wrap01(portalLadder.phase / TAU + dir * 0.38196601125 + hash01(portalLadder.crossings + portalLadder.level) * 0.041) * TAU;
  const target = compiledTarget || portalLadderSourceTarget(dir, source);
  if (compiledTarget) target.source = source + ' · ' + target.source;
  beginPortalLadderTransition(target.portal, target.phase, source.indexOf('manual') >= 0 ? 1.15 : 0.85);
  portalLadder.focus = target.portal.slice();
  portalLadder.phase = Number(target.phase) || portalLadder.phase;
  portalLadder.lastSource = target.source;
  portalLadder.lastStepTime = simTime;
  const made = openProjectiveSubspace(target, { source: target.source, silent: true, recycle: true });
  portalLadder.lastFrame = subspace.lastPortal?.frame || portalLadder.lastFrame;
  escherZoomFocus = portalLadderRenderFocus().slice();
  escherPortalTarget = target;
  escherPortalOpened = true;
  if (stats.log && (source.indexOf('manual') >= 0 || made > 0)) {
    stats.log.textContent = 'Portal ladder ' + (dir > 0 ? 'descended' : 'ascended') + ' to L' + portalLadder.level + ': opened/recycled ' + made + ' framed gate(s). Physical atlas is a 16-chunk rolling window; address depth is virtual/unbounded.';
  }
  return made;
}
function stepPortalSideways(side = 1, source = 'manual-side') {
  const sgn = side >= 0 ? 1 : -1;
  const compiledTarget = takeCompiledPortalTarget(sgn < 0 ? 'left' : 'right');
  if (portalTransitBlend() < 0.99 || !escherZoomActive) beginPortalTransit(true, source.indexOf('manual') >= 0 ? 1.05 : 0.85);
  portalLadder.lateral += sgn;
  portalLadder.absoluteLateral = (Number(portalLadder.absoluteLateral) || 0) + sgn;
  portalLadder.sideCrossings++;
  if (sgn < 0) portalLadder.leftCrossings++; else portalLadder.rightCrossings++;
  portalLadder.crossings++;
  const target = compiledTarget || portalLateralSourceTarget(sgn, source);
  if (compiledTarget) target.source = source + ' · ' + target.source;
  beginPortalLadderTransition(target.portal, target.phase, source.indexOf('manual') >= 0 ? 1.20 : 0.92);
  portalLadder.focus = target.portal.slice();
  portalLadder.phase = Number(target.phase) || portalLadder.phase;
  portalLadder.lastSource = target.source;
  portalLadder.lastStepTime = simTime;
  const made = openProjectiveSubspace(target, { source: target.source, silent: true, recycle: true });
  portalLadder.lastFrame = subspace.lastPortal?.frame || portalLadder.lastFrame;
  escherZoomFocus = portalLadderRenderFocus().slice();
  escherPortalTarget = target;
  escherPortalOpened = true;
  if (stats.log && (source.indexOf('manual') >= 0 || made > 0)) {
    stats.log.textContent = 'Portal ladder moved ' + (sgn < 0 ? 'left' : 'right') + ' to side ' + portalLadder.lateral + ': opened/recycled ' + made + ' framed gate(s). Between-centers are valid PortalFrame references; route freedom is ' + portalFreedom().toFixed(2) + '.';
  }
  return made;
}
function portalLadderStatusText() {
  const dir = portalLadder.direction >= 0 ? 'down' : 'up';
  const transit = portalTransitBlend();
  const side = portalLadder.lateral ? ' · side ' + portalLadder.lateral : '';
  const center = portalLadder.establishCount ? ' · C' + portalLadder.establishCount + ' absL' + (Number(portalLadder.absoluteLevel) || 0) : '';
  return 'L' + portalLadder.level + ' ' + dir + side + center + ' · t' + transit.toFixed(2) + ' · free ' + portalFreedom().toFixed(2) + ' · x' + portalLadder.crossings + ' · recycled ' + portalLadder.recycleCount;
}
function fillSubspacePointerUniforms() {
  if (subspacePointerUniformEpoch === subspace.allocationEpoch) return subspacePointerUniformCount;
  SUBSPACE_POINTER_CELLS.fill(0);
  SUBSPACE_POINTER_VALUES.fill(0);
  const active = subspace.active || [];
  const count = Math.min(MAX_CHUNKS, active.length);
  for (let i = 0; i < count; i++) {
    const record = active[i];
    SUBSPACE_POINTER_CELLS[i * 2] = record?.cell?.x || 0;
    SUBSPACE_POINTER_CELLS[i * 2 + 1] = record?.cell?.y || 0;
    SUBSPACE_POINTER_VALUES[i] = -(Number(record?.chunkId) + 1.0);
  }
  subspacePointerUniformEpoch = subspace.allocationEpoch;
  subspacePointerUniformCount = count;
  return count;
}
function normalize2(v, fallback = [1, 0]) {
  const x = Number(v?.[0]) || 0;
  const y = Number(v?.[1]) || 0;
  const m = Math.hypot(x, y);
  if (m < 1e-9) return fallback ? fallback.slice() : null;
  return [x / m, y / m];
}
function rotate2(v, angle) {
  const c = Math.cos(Number(angle) || 0);
  const s = Math.sin(Number(angle) || 0);
  return [v[0] * c - v[1] * s, v[0] * s + v[1] * c];
}
function portalPairAxis(pair, fallbackPhase = 0) {
  if (Array.isArray(pair) && pair.length >= 2) {
    const dx = subspaceTorusDelta(pair[0].center?.[0] || 0, pair[1].center?.[0] || 0);
    const dy = subspaceTorusDelta(pair[0].center?.[1] || 0, pair[1].center?.[1] || 0);
    const axis = normalize2([dx, dy], null);
    if (axis) return axis;
  }
  return [Math.cos(fallbackPhase), Math.sin(fallbackPhase)];
}
function makePortalFrame(target = {}, parentUv = [0.5, 0.5], chunkId = 0) {
  const pair = Array.isArray(target.pair) ? target.pair : [];
  const p0 = Number(pair[0]?.phase ?? target.phase ?? 0) || 0;
  const p1 = Number(pair[1]?.phase ?? (p0 + Math.PI)) || (p0 + Math.PI);
  const relationPhase = p0 + Math.atan2(Math.sin(p1 - p0), Math.cos(p1 - p0)) * 0.5;
  const phaseAxis = normalize2([Math.cos(relationPhase), Math.sin(relationPhase)]);
  const routeAxis = portalPairAxis(pair, relationPhase + Math.PI * 0.5);
  const routeNormal = normalize2([-routeAxis[1], routeAxis[0]]);
  const phaseRouteDot = phaseAxis[0] * routeAxis[0] + phaseAxis[1] * routeAxis[1];
  const energyAxis = normalize2([
    routeAxis[0] * 0.60 + routeNormal[0] * 0.25 + phaseAxis[0] * 0.15,
    routeAxis[1] * 0.60 + routeNormal[1] * 0.25 + phaseAxis[1] * 0.15
  ], routeNormal);
  const cross = phaseAxis[0] * energyAxis[1] - phaseAxis[1] * energyAxis[0];
  const dot = phaseAxis[0] * energyAxis[0] + phaseAxis[1] * energyAxis[1];
  const handedness = cross >= 0 ? 1 : -1;
  const twistBase = Math.atan2(cross, dot);
  const score = clamp(Number(target.score) || 0, 0, 1);
  const twist = clamp(twistBase + handedness * (0.18 + 0.32 * score + 0.07 * (chunkId % CHUNK_GRID)), -Math.PI, Math.PI);
  const scale = 1.0;
  return {
    schema: 'chrysalis-portal-frame-v0.1',
    contract: 'reversible-parent-child-local-frame',
    phaseAxis: phaseAxis.map(v => Number(v.toFixed(6))),
    energyAxis: energyAxis.map(v => Number(v.toFixed(6))),
    routeAxis: routeAxis.map(v => Number(v.toFixed(6))),
    originUv: parentUv.map(v => Number(v.toFixed(6))),
    twist: Number(twist.toFixed(6)),
    scale,
    handedness,
    score: Number(score.toFixed(6)),
    parentToChild: 'project-centered parent uv -> phase/energy portal basis -> child local uv',
    childToParent: 'child local uv -> inverse portal basis -> parent uv/backflow'
  };
}
function writePortalFrameAxesUniform(record, target, offset = 0) {
  const frame = record?.portalFrame || record?.portal?.frame || {};
  const phase = normalize2(frame.phaseAxis, [1, 0]);
  const energy = normalize2(frame.energyAxis, [0, 1]);
  target[offset] = phase[0]; target[offset + 1] = phase[1]; target[offset + 2] = energy[0]; target[offset + 3] = energy[1];
  return target;
}
function writePortalFrameMetaUniform(record, target, offset = 0) {
  const frame = record?.portalFrame || record?.portal?.frame || {};
  target[offset] = Number(frame.twist) || 0;
  target[offset + 1] = Math.max(0.001, Number(frame.scale) || 1);
  target[offset + 2] = (Number(frame.handedness) || 1) >= 0 ? 1 : -1;
  target[offset + 3] = clamp((Number(frame.score ?? 1) || 1) * smooth01((Number(record?.age) || 0) / 3.0), 0, 1);
  return target;
}
function portalFrameAxesUniform(record, out = null) {
  const target = out || record?._portalAxesUniform || new Float32Array(4);
  writePortalFrameAxesUniform(record, target, 0);
  if (record && !out) record._portalAxesUniform = target;
  return target;
}
function portalFrameMetaUniform(record, out = null) {
  const target = out || record?._portalMetaUniform || new Float32Array(4);
  writePortalFrameMetaUniform(record, target, 0);
  if (record && !out) record._portalMetaUniform = target;
  return target;
}
function fillSubspacePortalFrameUniforms() {
  if (HOT_PORTAL_FRAME_PACKET.tick === tick && HOT_PORTAL_FRAME_PACKET.epoch === subspace.allocationEpoch) return HOT_PORTAL_FRAME_PACKET;
  SUBSPACE_PORTAL_FRAME_AXES.fill(0);
  SUBSPACE_PORTAL_FRAME_META.fill(0);
  for (let i = 0; i < MAX_CHUNKS; i++) {
    SUBSPACE_PORTAL_FRAME_AXES[i * 4] = 1;
    SUBSPACE_PORTAL_FRAME_AXES[i * 4 + 3] = 1;
    SUBSPACE_PORTAL_FRAME_META[i * 4 + 1] = 1;
    SUBSPACE_PORTAL_FRAME_META[i * 4 + 2] = 1;
    SUBSPACE_PORTAL_FRAME_META[i * 4 + 3] = 1;
  }
  const active = subspace.active || [];
  for (let i = 0, n = Math.min(MAX_CHUNKS, active.length); i < n; i++) {
    const record = active[i];
    const idx = Math.max(0, Math.min(MAX_CHUNKS - 1, record.chunkId | 0));
    writePortalFrameAxesUniform(record, SUBSPACE_PORTAL_FRAME_AXES, idx * 4);
    writePortalFrameMetaUniform(record, SUBSPACE_PORTAL_FRAME_META, idx * 4);
  }
  HOT_PORTAL_FRAME_PACKET.tick = tick;
  HOT_PORTAL_FRAME_PACKET.epoch = subspace.allocationEpoch;
  return HOT_PORTAL_FRAME_PACKET;
}

function makeEmptyWorldDigState() {
  return {
    schema: 'chrysalis-world-dig-v0.1',
    active: false,
    mode: 'idle',
    depth: 0,
    candidate: null,
    target: null,
    anchorRecord: null,
    dwellStartTime: 0,
    dwellTargetSeconds: 4.0,
    lastPromotionTime: -Infinity,
    cooldownUntilTime: -Infinity,
    settleUntilTime: -Infinity,
    lineage: [],
    ancestryLimit: 64,
    lastScore: 0,
    lastReason: 'idle',
    stats: { opened: 0, promoted: 0, collapsed: 0, rejected: 0 },
    autonomy: {
      enabled: false,
      allowPromotion: false,
      minDwellSeconds: WORLD_DIG_DWELL_MIN_SECONDS,
      maxDwellSeconds: WORLD_DIG_DWELL_MAX_SECONDS,
      promotionThreshold: WORLD_DIG_PROMOTE_THRESHOLD,
      abortThreshold: 0.22,
      cooldownSeconds: WORLD_DIG_SETTLE_SECONDS,
      breakDurationSeconds: WORLD_DIG_BREAK_SECONDS,
      activeWindowSeconds: WORLD_DIG_BREAK_ACTIVE_MIN_SECONDS,
      breakJitterSeconds: WORLD_DIG_BREAK_ACTIVE_JITTER_SECONDS,
      nextBreakTime: -Infinity,
      breakUntilTime: -Infinity,
      breakCount: 0
    }
  };
}
function worldDigDwellSeconds() {
  if (!worldDig.active && worldDig.mode !== 'settle') return 0;
  return Math.max(0, (Number(simTime) || 0) - (Number(worldDig.dwellStartTime) || Number(simTime) || 0));
}
function worldDigClockSeconds() {
  return ((typeof performance !== 'undefined' && performance.now) ? performance.now() * 0.001 : (Number(simTime) || 0)) + WORLD_DIG_BREAK_CLOCK_OFFSET;
}
function deterministicWorldDigJitter(seed = 0) {
  const safeSeed = Number.isFinite(Number(seed)) ? Number(seed) : 0;
  return hash01(safeSeed * 17.13 + worldDig.depth * 3.71 + worldDig.stats.opened * 1.37 + worldDig.stats.promoted * 2.91 + worldDig.stats.rejected * 0.73);
}
function chooseWorldDigDwellSeconds(target = null, kind = 'manual') {
  const uv = target?.uv || target?.portal || [0.5, 0.5];
  const seed = (Number(uv?.[0]) || 0.5) * 131.0 + (Number(uv?.[1]) || 0.5) * 197.0 + tick * 0.011 + (String(kind).indexOf('half') >= 0 ? 19.0 : 0.0);
  const f = deterministicWorldDigJitter(seed);
  return WORLD_DIG_DWELL_MIN_SECONDS + (WORLD_DIG_DWELL_MAX_SECONDS - WORLD_DIG_DWELL_MIN_SECONDS) * f;
}
function normalizeWorldDigAutonomySettings() {
  const a = worldDig.autonomy;
  a.minDwellSeconds = clamp(Number(a.minDwellSeconds) || WORLD_DIG_DWELL_MIN_SECONDS, WORLD_DIG_DWELL_MIN_SECONDS, WORLD_DIG_DWELL_MAX_SECONDS);
  a.maxDwellSeconds = clamp(Number(a.maxDwellSeconds) || WORLD_DIG_DWELL_MAX_SECONDS, a.minDwellSeconds, WORLD_DIG_DWELL_MAX_SECONDS);
  a.promotionThreshold = clamp(Number(a.promotionThreshold) || WORLD_DIG_PROMOTE_THRESHOLD, 0.05, 0.98);
  a.abortThreshold = clamp(Number(a.abortThreshold) || 0.22, 0.02, 0.95);
  a.cooldownSeconds = Math.max(WORLD_DIG_SETTLE_SECONDS, Number(a.cooldownSeconds) || WORLD_DIG_SETTLE_SECONDS);
  a.breakDurationSeconds = Math.max(WORLD_DIG_BREAK_SECONDS, Number(a.breakDurationSeconds) || WORLD_DIG_BREAK_SECONDS);
  a.activeWindowSeconds = clamp(Number(a.activeWindowSeconds) || WORLD_DIG_BREAK_ACTIVE_MIN_SECONDS, 90.0, 240.0);
  a.breakJitterSeconds = clamp(Number(a.breakJitterSeconds) || WORLD_DIG_BREAK_ACTIVE_JITTER_SECONDS, 0.0, 90.0);
  if (!Number.isFinite(Number(a.nextBreakTime))) a.nextBreakTime = -Infinity;
  if (!Number.isFinite(Number(a.breakUntilTime))) a.breakUntilTime = -Infinity;
  a.breakCount = Math.max(0, Math.floor(Number(a.breakCount) || 0));
  a.allowPromotion = Boolean(a.allowPromotion);
}
function scheduleNextWorldDigBreak(fromClock = worldDigClockSeconds()) {
  normalizeWorldDigAutonomySettings();
  const a = worldDig.autonomy;
  const seedBase = Number.isFinite(Number(a.nextBreakTime)) ? Number(a.nextBreakTime) : fromClock;
  const jitter = deterministicWorldDigJitter(a.breakCount + worldDig.depth + seedBase) * a.breakJitterSeconds;
  a.nextBreakTime = fromClock + a.activeWindowSeconds + jitter;
  a.breakUntilTime = -Infinity;
  return a.nextBreakTime;
}
function worldDigBreakSecondsRemaining() {
  const until = Number(worldDig.autonomy.breakUntilTime);
  if (!Number.isFinite(until)) return 0;
  return Math.max(0, until - worldDigClockSeconds());
}
function updateWorldDigBreakClock() {
  normalizeWorldDigAutonomySettings();
  const a = worldDig.autonomy;
  const now = worldDigClockSeconds();
  if (!Number.isFinite(Number(a.nextBreakTime))) scheduleNextWorldDigBreak(now);
  if (Number.isFinite(Number(a.breakUntilTime)) && now < a.breakUntilTime) return true;
  if (Number.isFinite(Number(a.breakUntilTime)) && now >= a.breakUntilTime) {
    a.breakUntilTime = -Infinity;
    scheduleNextWorldDigBreak(now);
    worldDig.lastReason = 'world dig long-break ended · next independent break in ' + Math.max(0, a.nextBreakTime - now).toFixed(0) + 's';
    return false;
  }
  if (now >= a.nextBreakTime) {
    if (worldDig.active || worldDig.mode === 'dwell' || worldDig.mode === 'open' || worldDig.mode === 'promote') return false;
    a.breakCount += 1;
    a.breakUntilTime = now + a.breakDurationSeconds;
    worldDig.lastReason = 'world dig long-break active for ' + a.breakDurationSeconds.toFixed(0) + 's on independent clock';
    syncWorldDigControls();
    return true;
  }
  return false;
}
function worldDigDwellReady() {
  return worldDigDwellSeconds() >= (Number(worldDig.dwellTargetSeconds) || WORLD_DIG_DWELL_MIN_SECONDS);
}
function worldDigRenderFocus() {
  const uv = worldDig.target?.uv || worldDig.target?.portal || worldDig.anchorRecord?.parentUv || portalLadderRenderFocus();
  return [wrap01(Number(uv?.[0]) || 0.5), wrap01(Number(uv?.[1]) || 0.5)];
}
function worldDigRenderRadius() {
  return clamp(Number(worldDig.target?.radius) || WORLD_DIG_DEFAULT_RADIUS, 0.008, 0.16);
}
function worldDigSummaryObject() {
  return {
    schema: worldDig.schema,
    active: Boolean(worldDig.active),
    mode: worldDig.mode,
    depth: worldDig.depth,
    target: worldDig.target ? { uv: worldDigRenderFocus(), source: worldDig.target.source || 'unknown', variant: worldDig.target.variant || 'full', score: Number(worldDig.target.score || 0) } : null,
    anchorChunkId: worldDig.anchorRecord?.chunkId ?? null,
    dwellSeconds: Number(worldDigDwellSeconds().toFixed(3)),
    dwellTargetSeconds: Number(Number(worldDig.dwellTargetSeconds || WORLD_DIG_DWELL_MIN_SECONDS).toFixed(3)),
    lastScore: Number(Number(worldDig.lastScore || 0).toFixed(4)),
    lastReason: worldDig.lastReason,
    cooldownUntilTime: Number.isFinite(Number(worldDig.cooldownUntilTime)) ? Number(Number(worldDig.cooldownUntilTime).toFixed(4)) : 0,
    stats: { ...worldDig.stats },
    autonomy: { ...worldDig.autonomy },
    lineage: worldDig.lineage.slice(-worldDig.ancestryLimit)
  };
}
function worldDigStatusText() {
  const cool = simTime < (worldDig.cooldownUntilTime || -Infinity) ? ' · settle/cd ' + Math.max(0, worldDig.cooldownUntilTime - simTime).toFixed(1) + 's' : '';
  const breakRemain = worldDigBreakSecondsRemaining();
  const brk = breakRemain > 0 ? ' · break ' + breakRemain.toFixed(0) + 's' : '';
  const score = Number(worldDig.lastScore || 0).toFixed(2);
  const target = Number(worldDig.dwellTargetSeconds || WORLD_DIG_DWELL_MIN_SECONDS).toFixed(1);
  const variant = worldDig.target?.variant === 'half' ? 'half' : 'full';
  return 'WorldDig ' + worldDig.mode + '/' + variant + ' d' + worldDig.depth + ' · open ' + worldDig.stats.opened + ' promote ' + worldDig.stats.promoted + ' reject ' + worldDig.stats.rejected + ' · score ' + score + ' · dwell ' + worldDigDwellSeconds().toFixed(1) + '/' + target + 's' + cool + brk;
}
function syncWorldDigControls() {
  const open = el('worldDigOpenBtn');
  const half = el('worldDigHalfOpenBtn');
  const commit = el('worldDigCommitBtn');
  const abort = el('worldDigAbortBtn');
  const auto = el('worldDigAutonomyBtn');
  const status = el('worldDigStatus');
  if (open) open.textContent = 'Begin World Dig G';
  if (half) half.textContent = 'Half Zoom Dig B';
  if (commit) {
    commit.textContent = worldDig.active && !worldDigDwellReady() ? 'Commit waits ' + Math.max(0, (Number(worldDig.dwellTargetSeconds) || WORLD_DIG_DWELL_MIN_SECONDS) - worldDigDwellSeconds()).toFixed(1) + 's' : 'Commit Dig Shift+G';
    commit.disabled = !(worldDig.active && worldDigDwellReady() && (worldDig.anchorRecord || activeChunkCount() > 0));
  }
  if (abort) {
    abort.textContent = 'Abort Dig Alt+G';
    abort.disabled = !worldDig.active;
  }
  if (auto) {
    auto.textContent = 'Auto Dig Probe: ' + (worldDig.autonomy.enabled ? 'On' : 'Off');
    auto.classList.toggle('active', Boolean(worldDig.autonomy.enabled));
  }
  if (status) status.textContent = worldDigStatusText();
}
function resetWorldDigTransient(reason = 'world-dig-reset') {
  worldDig.active = false;
  worldDig.mode = 'idle';
  worldDig.candidate = null;
  worldDig.target = null;
  worldDig.anchorRecord = null;
  worldDig.dwellStartTime = Number(simTime) || 0;
  worldDig.dwellTargetSeconds = 4.0;
  worldDig.settleUntilTime = -Infinity;
  if (/reset|load/.test(String(reason || ''))) worldDig.cooldownUntilTime = -Infinity;
  normalizeWorldDigAutonomySettings();
  if (!Number.isFinite(Number(worldDig.autonomy.nextBreakTime))) scheduleNextWorldDigBreak(worldDigClockSeconds());
  worldDig.lastReason = reason;
  syncWorldDigControls();
}
function restoreWorldDigFromSave(saved = null) {
  if (!saved || saved.schema !== 'chrysalis-world-dig-v0.1') {
    worldDig.depth = 0;
    worldDig.lineage = [];
    worldDig.stats = { opened: 0, promoted: 0, collapsed: 0, rejected: 0 };
    resetWorldDigTransient('load-no-world-dig');
    return;
  }
  worldDig.depth = Math.max(0, Math.floor(Number(saved.depth) || 0));
  worldDig.lineage = Array.isArray(saved.lineage) ? saved.lineage.slice(-worldDig.ancestryLimit) : [];
  worldDig.stats = { opened: 0, promoted: 0, collapsed: 0, rejected: 0, ...(saved.stats || {}) };
  Object.assign(worldDig.autonomy, saved.autonomy || {});
  normalizeWorldDigAutonomySettings();
  resetWorldDigTransient('load-world-dig-lineage');
}
function resetPortalNavigationForNewParent(reason = 'world-dig-reset') {
  escherZoomActive = false;
  escherZoomDepth = 0.0;
  escherZoomFocus = worldDigRenderFocus();
  escherPortalTarget = null;
  escherPortalOpened = false;
  portalLadder.level = 0;
  portalLadder.direction = 1;
  portalLadder.lateral = 0;
  portalLadder.sideCrossings = 0;
  portalLadder.leftCrossings = 0;
  portalLadder.rightCrossings = 0;
  portalLadder.crossings = 0;
  portalLadder.downCrossings = 0;
  portalLadder.upCrossings = 0;
  portalLadder.focus = [0.5, 0.5];
  portalLadder.renderFocus = [0.5, 0.5];
  portalLadder.focusFrom = [0.5, 0.5];
  portalLadder.focusTo = [0.5, 0.5];
  portalLadder.phase = 0.0;
  portalLadder.renderPhase = 0.0;
  portalLadder.phaseFrom = 0.0;
  portalLadder.phaseTo = 0.0;
  portalLadder.transitFrom = 0.0;
  portalLadder.transitTo = 0.0;
  portalLadder.transitIntent = 0;
  portalLadder.transitionStart = simTime;
  portalLadder.transitStart = simTime;
  portalLadder.lastFrame = null;
  portalLadder.nearestCenter = [0.5, 0.5];
  portalLadder.nearestCenterSource = reason;
  portalLadder.centerEpoch++;
  clearPortalRouteCompilerCache();
  clearUniformNamespace(app, 'render');
  clearUniformNamespace(app, 'simSubstep');
  clearUniformNamespace(app, 'rupture');
  clearUniformNamespace(app, 'childInit');
  clearUniformNamespace(app, 'childSim');
  clearUniformNamespace(app, 'portalBackflow');
  clearUniformNamespace(app, 'promoteChild');
  resetGlStateCache(app);
  syncEscherZoomButtonLabel();
}
function recordWorldDigLineage(record, reason) {
  const entry = {
    schema: 'world-dig-lineage-v0.1',
    depth: worldDig.depth,
    reason,
    time: Number(simTime) || 0,
    tick,
    parentUv: record?.parentUv ? record.parentUv.slice() : null,
    chunkId: record?.chunkId ?? null,
    source: record?.source || 'unknown',
    score: Number(worldDig.lastScore || record?.portalFrame?.score || 0),
    frame: record?.portalFrame || record?.portal?.frame || null,
    stats: { activeChunks: activeChunkCount(), allocationEpoch: subspace.allocationEpoch }
  };
  worldDig.lineage.push(entry);
  while (worldDig.lineage.length > worldDig.ancestryLimit) worldDig.lineage.shift();
  return entry;
}
function clearSubspaceAfterWorldDigPromotion(reason = 'world-dig-collapse-old-parent') {
  const records = subspace.active.slice();
  for (const record of records) releaseAtlasSlot(record, reason + ':released');
  clearSubspaceQueuesAndRecords();
  clearChildAtlasTextures(app);
  subspace.lastPortal = null;
  return records.length;
}
function promoteSubspaceChunkToParent(record = worldDig.anchorRecord, reason = 'world-dig-promote') {
  if (!app || app.kind !== 'webgl2') return false;
  if (!record || record.chunkId == null || !app.child) {
    worldDig.lastReason = 'promotion failed: no active child chunk';
    syncWorldDigControls();
    return false;
  }
  ensureChildAtlas(app);
  processSubspaceQueues(app);
  const gl = app.gl;
  const origin = chunkOrigin(record.chunkId);
  gl.bindVertexArray(app.vao);
  bindTargetFramebuffer(app, app.stateTargets[app.sWrite]);
  viewportCached(app, 0, 0, app.size, app.size);
  useProgramCached(app, app.promoteChildProgram);
  activeTextureCached(app, gl.TEXTURE0);
  bindTexture2DCached(app, app.child[app.cRead]);
  applyUniformsCached(app, 'promoteChild', app.uniforms.promoteChild, PROMOTE_CHILD_UNIFORMS, { origin, blend: 1.0, seed: (Number(simTime) || 0) + (Number(tick) || 0) * 0.0001 });
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  markTextureMipsDirty(app, app.state[app.sWrite]);
  swapState(app);
  recordWorldDigLineage(record, reason);
  const collapsed = clearSubspaceAfterWorldDigPromotion(reason);
  resetPortalNavigationForNewParent(reason);
  worldDig.depth += 1;
  worldDig.stats.promoted += 1;
  worldDig.stats.collapsed += collapsed;
  worldDig.lastPromotionTime = Number(simTime) || 0;
  worldDig.settleUntilTime = worldDig.lastPromotionTime + WORLD_DIG_SETTLE_SECONDS;
  worldDig.cooldownUntilTime = Math.max(worldDig.lastPromotionTime + worldDig.autonomy.cooldownSeconds, worldDig.settleUntilTime);
  worldDig.active = false;
  worldDig.mode = 'settle';
  worldDig.anchorRecord = null;
  worldDig.target = null;
  worldDig.candidate = null;
  worldDig.lastReason = reason + ' · promoted child chunk #' + record.chunkId + ' and collapsed ' + collapsed + ' old gate(s)';
  invalidateGpuFeedOptimizer('world-dig-promote', 12);
  updateStats();
  syncWorldDigControls();
  if (stats.log) stats.log.textContent = 'World Dig promotion complete: child chunk #' + record.chunkId + ' became the new parent reality; old parent/subspace state collapsed into lineage depth ' + worldDig.depth + '. ' + worldDigStatusText();
  return true;
}
function normalizeWorldDigTarget(target = null, kind = 'manual') {
  const fallback = currentPortalParentTarget?.() || selectSubspacePortal();
  const src = target || fallback;
  const uv = src?.uv || src?.portal || src?.center || portalLadderRenderFocus();
  const variant = src?.variant || src?.zoomVariant || (String(kind).indexOf('half') >= 0 ? 'half' : 'full');
  const defaultRadius = variant === 'half' ? WORLD_DIG_HALF_ZOOM_RADIUS : WORLD_DIG_DEFAULT_RADIUS;
  const defaultSeedRadius = variant === 'half' ? WORLD_DIG_HALF_SEED_RADIUS_CELLS : WORLD_DIG_FULL_SEED_RADIUS_CELLS;
  return {
    ...src,
    uv: [wrap01(Number(uv?.[0]) || 0.5), wrap01(Number(uv?.[1]) || 0.5)],
    portal: [wrap01(Number(uv?.[0]) || 0.5), wrap01(Number(uv?.[1]) || 0.5)],
    variant,
    radius: Number(src?.radius) || defaultRadius,
    seedRadiusCells: Math.max(0.25, Number(src?.seedRadiusCells) || defaultSeedRadius),
    score: Number(src?.score ?? 0.5) || 0.5,
    source: src?.source || kind
  };
}
function startWorldDig(target = null, kind = 'manual') {
  if (!app || app.kind !== 'webgl2') {
    if (stats.log) stats.log.textContent = 'World Dig unavailable: WebGL2 state is not live.';
    return false;
  }
  const now = Number(simTime) || 0;
  if (worldDig.active || (worldDig.mode !== 'idle' && worldDig.mode !== 'settle')) return false;
  if (now < (worldDig.cooldownUntilTime || -Infinity)) {
    if (stats.log) stats.log.textContent = 'World Dig is cooling down for ' + Math.max(0, worldDig.cooldownUntilTime - now).toFixed(1) + 's.';
    return false;
  }
  const resolved = normalizeWorldDigTarget(target, kind);
  worldDig.active = true;
  worldDig.mode = 'open';
  worldDig.target = resolved;
  worldDig.candidate = { kind, target: resolved, openedAt: now };
  worldDig.dwellStartTime = now;
  worldDig.dwellTargetSeconds = chooseWorldDigDwellSeconds(resolved, kind);
  worldDig.lastReason = 'opening ' + kind + ' dig at ' + resolved.uv.map(v => v.toFixed(3)).join(',') + ' · dwell target ' + worldDig.dwellTargetSeconds.toFixed(1) + 's';

  // World Dig deliberately does not arm Escher Portal or portal transit. It only
  // allocates a child atlas patch under the selected boxed region; the commit
  // step decides whether that child becomes the new full parent reality.
  escherPortalTarget = null;
  const made = requestUnfoldPatchAtUv(app.size, resolved.uv, 'world-dig:' + kind, { ...resolved, recycle: true });
  processSubspaceQueues(app);
  const active = nearestActivePortalRecordTo(resolved.uv, { maxDistance: Math.max(0.12, resolved.radius * 4.0) });
  const anchor = resolved.record && subspace.active.includes(resolved.record) ? resolved.record : active?.record;
  if (!made && !anchor) {
    abortWorldDig('world-dig-open-failed');
    return false;
  }
  worldDig.anchorRecord = anchor || subspace.active[subspace.active.length - 1] || null;
  worldDig.stats.opened += Math.max(1, made || 0);
  worldDig.mode = 'dwell';
  worldDig.lastScore = scoreActiveChildWorld(worldDig.anchorRecord);
  subspace.lastPortal = {
    uv: resolved.uv.map(v => Number(v.toFixed(5))),
    source: 'world-dig:' + kind + ' · ' + resolved.source,
    score: Number((resolved.score || 0).toFixed(4)),
    opened: made,
    frame: worldDig.anchorRecord?.portalFrame || null,
    tick,
    via: 'world-dig'
  };
  updateStats();
  syncWorldDigControls();
  if (stats.log) stats.log.textContent = 'World Dig opened (' + resolved.variant + ' zoom): selected box at ' + resolved.uv.map(v => v.toFixed(3)).join(', ') + ', spawned ' + made + ' child gate(s), and began a hysteresis dwell for ' + worldDig.dwellTargetSeconds.toFixed(1) + 's. Escher Portal was not armed. Commit unlocks after the dwell window, or autonomy can score it.';
  return true;
}
function abortWorldDig(reason = 'world-dig-abort') {
  if (!worldDig.active) return false;
  const flushed = flushProjectiveSubspacePortals(reason);
  worldDig.active = false;
  worldDig.mode = 'idle';
  worldDig.anchorRecord = null;
  worldDig.target = null;
  worldDig.candidate = null;
  worldDig.stats.rejected += 1;
  worldDig.cooldownUntilTime = (Number(simTime) || 0) + Math.max(WORLD_DIG_DWELL_MIN_SECONDS, worldDig.autonomy.cooldownSeconds * 0.5);
  worldDig.lastReason = reason + ' · flushed ' + flushed + ' child gate(s)';
  updateStats();
  syncWorldDigControls();
  if (stats.log) stats.log.textContent = 'World Dig aborted: discarded child world without touching the parent. ' + worldDigStatusText();
  return true;
}
function manualStartWorldDig() { return startWorldDig(selectWorldDigTarget({ source: 'manual' }), 'manual'); }
function manualStartHalfWorldDig() {
  const target = selectWorldDigTarget({ source: 'manual-half' });
  if (target) {
    target.variant = 'half';
    target.zoomVariant = 'half';
    target.radius = WORLD_DIG_HALF_ZOOM_RADIUS;
    target.seedRadiusCells = WORLD_DIG_HALF_SEED_RADIUS_CELLS;
  }
  return startWorldDig(target, 'manual-half');
}
function commitWorldDig() {
  const fallback = worldDig.anchorRecord
    || nearestActivePortalRecordTo(worldDigRenderFocus(), { maxDistance: Math.max(0.12, worldDigRenderRadius() * 4.0) })?.record
    || subspace.active[subspace.active.length - 1]
    || null;
  if (!worldDig.active || !fallback) {
    worldDig.lastReason = 'commit ignored: no active World Dig child is available';
    syncWorldDigControls();
    if (stats.log) stats.log.textContent = 'World Dig commit ignored: no active child world is available. Press Begin World Dig G first.';
    return false;
  }
  if (!worldDigDwellReady()) {
    const remaining = Math.max(0, (Number(worldDig.dwellTargetSeconds) || WORLD_DIG_DWELL_MIN_SECONDS) - worldDigDwellSeconds());
    worldDig.lastReason = 'commit held by dwell hysteresis · ' + remaining.toFixed(1) + 's remaining';
    syncWorldDigControls();
    if (stats.log) stats.log.textContent = 'World Dig commit is intentionally held for ' + remaining.toFixed(1) + ' more seconds so the child selection can fill/stabilize before promotion.';
    return false;
  }
  worldDig.anchorRecord = fallback;
  return promoteSubspaceChunkToParent(fallback, 'manual-world-dig');
}
function toggleWorldDigAutonomy() {
  worldDig.autonomy.enabled = !worldDig.autonomy.enabled;
  worldDig.lastReason = 'autonomy ' + (worldDig.autonomy.enabled ? 'enabled' : 'disabled');
  syncWorldDigControls();
  if (stats.log) stats.log.textContent = 'World Dig autonomy is now ' + (worldDig.autonomy.enabled ? 'enabled' : 'disabled') + '. ' + worldDigStatusText();
}
function recentWorldDigReusePenalty(candidate, now = Number(simTime) || 0) {
  const uv = candidate?.uv || candidate?.portal || candidate?.center;
  if (!uv || !worldDig.lineage.length) return 0;
  let penalty = 0;
  for (const entry of worldDig.lineage.slice(-12)) {
    const d = subspaceTorusDistance(uv, entry.parentUv || [0.5, 0.5]);
    const age = Math.max(0, now - (Number(entry.time) || 0));
    penalty = Math.max(penalty, smooth01((0.16 - d) / 0.16) * Math.exp(-age / 90));
  }
  return penalty;
}
function selectWorldDigTarget(context = {}) {
  const candidates = [];
  const portalTarget = currentPortalParentTarget?.();
  if (portalTarget) candidates.push({ ...portalTarget, uv: portalTarget.portal, source: 'portal-focus:' + portalTarget.source });
  const compiled = takeCompiledPortalTarget?.('down');
  if (compiled) candidates.push({ ...compiled, uv: compiled.portal, source: 'compiled-frontier:' + compiled.source });
  const subspaceTarget = selectSubspacePortal?.();
  if (subspaceTarget) candidates.push({ ...subspaceTarget, uv: subspaceTarget.portal, source: 'subspace-frontier:' + subspaceTarget.source });
  const nearest = nearestPortalReferenceCenter?.(portalLadderRenderFocus(), { includeBetween: true });
  if (nearest?.center) candidates.push({ uv: nearest.center, portal: nearest.center, phase: nearest.phase, score: nearest.score, source: 'nearest-reference:' + nearest.source });
  candidates.push({ uv: portalLadderRenderFocus(), portal: portalLadderRenderFocus(), phase: portalLadderRenderPhase(), score: 0.42, source: 'render-focus-fallback' });
  return rankWorldDigTargets(candidates, context)[0] || null;
}
function rankWorldDigTargets(candidates, context = {}) {
  const routes = context.routes || frontierRoutes?.() || {};
  const metrics = context.metrics || autonomyDiagnostics || {};
  const now = Number(simTime) || 0;
  return (candidates || []).filter(Boolean).map(candidate => {
    const uv = candidate.uv || candidate.portal || candidate.center || [0.5, 0.5];
    const novelty = clamp(Number(candidate.novelty ?? metrics.novelty ?? autonomyNovelty ?? 0.5), 0, 1);
    const pressure = clamp(Number(candidate.pressure ?? routes.explore ?? metrics.pressure ?? autonomyPressure ?? 0.5), 0, 1);
    const stability = clamp(1.0 - 0.55 * Number(metrics.stagnation ?? autonomyStagnation ?? 0), 0, 1);
    const asymmetry = clamp(0.45 + 0.35 * Math.abs(Math.sin((Number(candidate.phase) || portalLadderRenderPhase()) + now * 0.733038)), 0, 1);
    const filament = clamp(Math.max(Number(routes.render || 0), Number(routes.phaseLaw || 0), Number(routes.zeroSum || 0)) || 0.0, 0, 1);
    const reusePenalty = recentWorldDigReusePenalty({ ...candidate, uv }, now);
    const sourceBoost = String(candidate.source || '').indexOf('portal') >= 0 ? 0.05 : 0.0;
    const score = clamp(0.26 * novelty + 0.24 * pressure + 0.18 * stability + 0.16 * asymmetry + 0.12 * filament + sourceBoost - 0.20 * reusePenalty, 0, 1);
    const variant = candidate.variant || candidate.zoomVariant || (String(context.source || '').indexOf('half') >= 0 ? 'half' : 'full');
    return { ...candidate, uv: [wrap01(uv[0]), wrap01(uv[1])], portal: [wrap01(uv[0]), wrap01(uv[1])], score, variant, radius: candidate.radius || (variant === 'half' ? WORLD_DIG_HALF_ZOOM_RADIUS : WORLD_DIG_DEFAULT_RADIUS), seedRadiusCells: candidate.seedRadiusCells || (variant === 'half' ? WORLD_DIG_HALF_SEED_RADIUS_CELLS : WORLD_DIG_FULL_SEED_RADIUS_CELLS) };
  }).sort((a, b) => b.score - a.score);
}
function scoreActiveChildWorld(record = worldDig.anchorRecord, metrics = autonomyDiagnostics || {}) {
  if (!record) return 0;
  const age = Math.max(0, (Number(simTime) || 0) - (Number(record.bornTime) || Number(simTime) || 0));
  const novelty = clamp(Number(metrics.novelty ?? autonomyNovelty ?? worldDig.target?.score ?? 0.5), 0, 1);
  const coherence = clamp(Number(record.portalFrame?.score ?? record.portal?.frame?.score ?? 0.55), 0, 1);
  const flow = clamp(0.35 + 0.45 * smooth01(age / Math.max(0.1, worldDig.autonomy.minDwellSeconds)) + 0.20 * Number(frontierRoutes?.().explore || 0), 0, 1);
  const stability = clamp(1.0 - 0.45 * Number(metrics.stagnation ?? autonomyStagnation ?? 0), 0, 1);
  const parentCoupling = clamp(1.0 / (1.0 + subspaceTorusDistance(record.parentUv || [0.5, 0.5], worldDigRenderFocus()) * 12.0), 0, 1);
  const saturationGuard = activeChunkCount() > MAX_CHUNKS ? 0.55 : 1.0;
  const score = (0.26 * novelty + 0.22 * coherence + 0.20 * flow + 0.18 * stability + 0.14 * parentCoupling) * saturationGuard;
  worldDig.lastScore = clamp(score, 0, 1);
  return worldDig.lastScore;
}
function autonomyWorldDigScores(routes = frontierRoutes(), signal = autonomyRoutingSignal(), metrics = autonomyDiagnostics || {}) {
  const boredom = clamp(Number(metrics.stagnation ?? autonomyStagnation ?? 0), 0, 1);
  const novelty = clamp(Math.max(Number(routes?.explore || 0), Number(metrics.novelty ?? autonomyNovelty ?? 0)), 0, 1);
  const pressure = clamp(Math.max(Number(routes?.phaseLaw || 0), Number(metrics.pressure ?? autonomyPressure ?? 0), Number(signal || 0)), 0, 1);
  const stability = clamp(1.0 - 0.50 * boredom, 0, 1);
  const transitBias = portalRenderActive() ? 0.12 + 0.18 * portalTransitBlend() : 0.0;
  const childQuality = worldDig.anchorRecord ? scoreActiveChildWorld(worldDig.anchorRecord, metrics) : 0.0;
  return {
    open: clamp(0.32 * pressure + 0.24 * novelty + 0.20 * boredom + 0.14 * stability + 0.10 * autonomyPortalCuriosityEnvelope() + transitBias, 0, 1),
    commit: childQuality,
    abort: clamp(1.0 - childQuality, 0, 1),
    components: { boredom, novelty, pressure, stability, transitBias, childQuality }
  };
}
function maybeAutonomyWorldDig(routes = frontierRoutes(), signal = autonomyRoutingSignal(), metrics = autonomyDiagnostics || {}) {
  const now = Number(simTime) || 0;
  if (!autonomousActive || !isFullAutonomyMode(autonomousMode) || paused) return { accepted: false, reason: 'world dig autonomy inactive' };
  if (!worldDig.autonomy.enabled) return { accepted: false, reason: 'world dig autonomy disabled' };
  const onBreak = updateWorldDigBreakClock();
  if (worldDig.mode === 'settle') {
    if (now < (worldDig.settleUntilTime || -Infinity)) return { accepted: false, action: 'digSettle', reason: 'new parent settling for ' + Math.max(0, worldDig.settleUntilTime - now).toFixed(1) + 's' };
    worldDig.mode = 'idle';
  }
  if (onBreak) return { accepted: false, action: 'digBreak', reason: 'world dig independent long break ' + worldDigBreakSecondsRemaining().toFixed(0) + 's' };
  if (now < (worldDig.cooldownUntilTime || -Infinity)) return { accepted: false, reason: 'world dig cooldown' };
  const scores = autonomyWorldDigScores(routes, signal, metrics);
  if (worldDig.mode === 'idle') {
    if (scores.open > WORLD_DIG_OPEN_THRESHOLD) {
      const target = selectWorldDigTarget({ source: 'autonomy', routes, signal, metrics });
      if (target && startWorldDig(target, 'autonomy')) {
        worldDig.lastReason = 'autonomy opened world dig · score ' + scores.open.toFixed(3) + ' · dwell target ' + worldDig.dwellTargetSeconds.toFixed(1) + 's';
        return { accepted: true, action: 'digOpen', score: scores.open, reason: worldDig.lastReason, scores };
      }
    }
    worldDig.lastScore = scores.open;
    return { accepted: false, action: 'digHold', score: scores.open, reason: 'below world dig open threshold', scores };
  }
  if (worldDig.mode === 'dwell') {
    const dwellAge = worldDigDwellSeconds();
    const dwellTarget = Number(worldDig.dwellTargetSeconds) || WORLD_DIG_DWELL_MIN_SECONDS;
    const dwellMax = Math.max(dwellTarget, Number(worldDig.autonomy.maxDwellSeconds) || WORLD_DIG_DWELL_MAX_SECONDS);
    if (dwellAge >= dwellTarget && scores.commit >= worldDig.autonomy.promotionThreshold) {
      if (worldDig.autonomy.allowPromotion) {
        const ok = promoteSubspaceChunkToParent(worldDig.anchorRecord, 'autonomy-world-dig');
        return { accepted: ok, action: 'digCommit', score: scores.commit, reason: worldDig.lastReason, scores };
      }
      worldDig.lastReason = 'safe autonomy hold · child world scored ' + scores.commit.toFixed(2) + ' but destructive promotion is manual-only in this branch';
      return { accepted: false, action: 'digHoldManualCommit', score: scores.commit, reason: worldDig.lastReason, scores };
    }
    if (dwellAge >= dwellMax || (dwellAge >= dwellTarget && scores.abort > WORLD_DIG_ABORT_THRESHOLD)) {
      const ok = abortWorldDig('autonomy-world-dig-reject');
      return { accepted: ok, action: 'digAbort', score: scores.abort, reason: worldDig.lastReason, scores };
    }
    worldDig.lastReason = 'dwell hysteresis · ' + dwellAge.toFixed(1) + '/' + dwellTarget.toFixed(1) + 's · commit ' + scores.commit.toFixed(2) + ' abort ' + scores.abort.toFixed(2);
    return { accepted: false, action: 'digDwell', score: scores.commit, reason: worldDig.lastReason, scores };
  }
  return { accepted: false, reason: 'world dig mode ' + worldDig.mode, scores };
}

function compactSubspaceCenterCandidate(center, score = 0.1, source = 'fallback', phase = 0) {
  if (!Array.isArray(center) || center.length < 2) return null;
  const x = Number(center[0]);
  const y = Number(center[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { center: [wrap01(x), wrap01(y)], score: clamp(Number(score) || 0, 0, 1), source, phase: Number(phase) || 0 };
}
function collectSubspaceCenterCandidates() {
  const candidates = [];
  for (const token of (residentSignalManifest?.tokens || []).slice(0, 48)) {
    const support = clamp(Number(token.support ?? token.info ?? 0.25) || 0, 0, 1);
    const persistence = clamp((Number(token.persistence || 1) || 1) / 6, 0, 1);
    const closure = clamp(Number(token.closure ?? token.closed ?? 0.35) || 0, 0, 1);
    const score = clamp(0.45 * support + 0.30 * persistence + 0.25 * closure, 0, 1);
    const c = compactSubspaceCenterCandidate(token.center, score, 'resident-signal', token.phase);
    if (c) candidates.push(c);
  }
  for (const bankName of ['hot', 'warm', 'cold']) {
    const influence = clamp(Number(memoryBanks?.[bankName]?.influence || 0) || 0, 0, 1);
    for (const rec of (memoryBanks?.[bankName]?.records || []).slice(0, 32)) {
      const score = clamp((Number(rec.trust ?? rec.support ?? 0.2) || 0.2) * (0.45 + 0.55 * influence) * (0.6 + 0.4 * Number(rec.closure ?? 0.5)), 0, 1);
      const c = compactSubspaceCenterCandidate(rec.center, score, bankName + '-memory', rec.phase);
      if (c) candidates.push(c);
    }
  }
  if (compiledZeroSumLayer?.active) {
    const tokens = compiledZeroSumLayer.arrays?.tokens;
    const count = Math.min(COMPILED_ZERO_SUM_TOKEN_CAP, compiledZeroSumLayer.tokenCount || 0);
    for (let i = 0; tokens && i < count; i++) {
      const j = i * 4;
      const c = compactSubspaceCenterCandidate([tokens[j], tokens[j + 1]], Number(tokens[j + 3]) || 0.25, 'compiled-zero-sum', tokens[j + 2]);
      if (c) candidates.push(c);
    }
  }
  return candidates.sort((a, b) => b.score - a.score);
}
function selectSubspacePortal() {
  const candidates = collectSubspaceCenterCandidates();
  if (candidates.length === 0) {
    return { portal: [0.5, 0.5], source: 'center fallback', pair: [], score: 0.0 };
  }
  if (candidates.length === 1) {
    return { portal: candidates[0].center, source: candidates[0].source, pair: [candidates[0]], score: candidates[0].score };
  }
  let best = null;
  const limit = Math.min(18, candidates.length);
  for (let i = 0; i < limit; i++) {
    for (let j = i + 1; j < limit; j++) {
      const a = candidates[i];
      const b = candidates[j];
      const dist = subspaceTorusDistance(a.center, b.center);
      if (dist < 0.018) continue;
      const distanceFit = 1.0 - Math.min(1.0, Math.abs(dist - 0.18) / 0.42);
      const phaseFit = 0.5 + 0.5 * Math.cos((Number(a.phase) || 0) - (Number(b.phase) || 0) - Math.PI);
      const score = (a.score + b.score) * 0.5 * (0.55 + 0.30 * distanceFit + 0.15 * phaseFit);
      if (!best || score > best.score) best = { portal: subspaceTorusMidpoint(a.center, b.center), source: a.source + ' × ' + b.source, pair: [a, b], score };
    }
  }
  return best || { portal: candidates[0].center, source: candidates[0].source, pair: [candidates[0]], score: candidates[0].score };
}
function subspaceSummary() {
  return {
    activeChunks: activeChunkCount(),
    maxChunks: MAX_CHUNKS,
    chunkGrid: CHUNK_GRID,
    childAtlasSize: app?.childAtlasSize || TARGET_CHILD_ATLAS_SIZE,
    lastPortal: subspace.lastPortal,
    portalLadder: { ...portalLadder, focus: portalLadder.focus.slice(), lastFrame: portalLadder.lastFrame },
    densityBudget: SUBSPACE_DENSITY_BUDGET,
    invariant: 'same density budget at every scale',
    portalFrames: subspace.active.map(r => ({ chunkId: r.chunkId, cell: r.cell, frame: r.portalFrame })),
    atlasAllocator: { schema: atlasAllocator.schema, mode: atlasAllocator.mode, stats: { ...atlasAllocator.stats }, slots: atlasAllocator.slots.map(slot => ({ ...slot })) },
    portalRouteCompiler: portalRouteCompilerSummaryObject(),
    backgroundAutonomyPlanner: backgroundAutonomyPlannerSummaryObject(),
    gpuFeedOptimizer: gpuFeedOptimizerSummaryObject(),
    autonomyHysteresis: autonomyHysteresisSummaryObject(),
    autonomyPortalTransit: autonomyPortalTransitSummaryObject(),
    worldDig: worldDigSummaryObject(),
    cpuInstrumentation: cpuInstrumentationSummaryObject(),
    portalMappings: subspace.active.map(r => r.portal),
    note: 'Projective Subspace Lattice uses PortalFrame bidirectional parent/child mappings; descent is framed parent sample to child seed and ascent/backflow is bounded mix backflow, never summation.'
  };
}
function makeEmptyAutonomyDiagnostics() {
  return {
    active: false,
    mode: 'idle',
    scanCount: 0,
    lastScanTick: 0,
    complexity: 0,
    pressure: 0,
    novelty: 0,
    stagnation: 0,
    zeroFit: 1,
    closureMean: 0,
    phaseSpread: 0,
    diffBand: 0,
    energyBand: 0,
    routed: false,
    lastRoute: 'none',
    symmetricFrontier: symmetricFrontierSummary(),
    note: 'idle'
  };
}
function makeEmptyResidentSignalManifest() {
  return {
    schema: ZERO_SYNTAX_SCHEMA,
    createdAt: new Date().toISOString(),
    epoch: 0,
    compressionPhase: 0,
    boundStable: 0,
    tick: 0,
    simTime: 0,
    stepRegime: null,
    metrics: {
      fullness: 0,
      saturation: 0,
      closureMean: 0,
      zeroResidualMean: 1,
      tokenCount: 0,
      persistentTokenCount: 0,
      oneSumCount: 0,
      twoSumCount: 0,
      threeSumCount: 0,
      sumSyntaxFullness: 0,
      symmetricFrontier: symmetricFrontierSummary(),
      sumLayerMetrics: {
        zeroCount: 0,
        oneSumCount: 0,
        twoSumCount: 0,
        threeSumCount: 0,
        oneSumPackingMean: 0,
        twoSumPackingMean: 0,
        threeSumPackingMean: 0,
        sumSyntaxFullness: 0
      }
    },
    tokens: [],
    relations: [],
    sumLayers: makeEmptySumLayers(),
    sumLayerMetrics: {
      zeroCount: 0,
      oneSumCount: 0,
      twoSumCount: 0,
      threeSumCount: 0,
      oneSumPackingMean: 0,
      twoSumPackingMean: 0,
      threeSumPackingMean: 0,
      sumSyntaxFullness: 0
    },
    note: 'Resident Signal zero-syntax manifest: compact resonance-token graph plus zero/two/three sum syntax layers. It is continuous compression state, not a screenshot and not a reseed.'
  };
}

function makeEmptyCompiledZeroSumLayer() {
  return {
    schema: COMPILED_ZERO_SUM_SCHEMA,
    active: false,
    source: 'none',
    compiledAt: null,
    compiledTick: 0,
    tokenCount: 0,
    sourceTokenCount: 0,
    tokenBindingCount: 0,
    frontierBindingCount: 0,
    coldBindingCount: 0,
    gain: 0,
    coverage: 0,
    supportMean: 0,
    fullness: 0,
    zeroFit: 1,
    arrays: {
      tokens: new Float32Array(COMPILED_ZERO_SUM_TOKEN_CAP * 4),
      meta: new Float32Array(COMPILED_ZERO_SUM_TOKEN_CAP * 4)
    },
    summary: 'compiled zero-sum syntax idle'
  };
}


function makeEmptyRoutePressure() {
  return Object.fromEntries(FRONTIER_ROUTE_PORTS.map(port => [port, 0]));
}
function makeEmptySymmetricFrontierState() {
  return {
    schema: SYMMETRIC_FRONTIER_SCHEMA,
    previousLocal: new Set(),
    previousGlobal: new Set(),
    localFrontier: new Set(),
    globalFrontier: new Set(),
    activeFrontier: new Set(),
    signatureMemory: new Map(),
    lastGlobalTick: 0,
    lastGlobalClock: 0,
    lastScanTick: 0,
    lastLocalClock: 0,
    lastGlobalTime: 0,
    lastScanTime: 0,
    scanCount: 0,
    source: 'none',
    currentCount: 0,
    frontierCount: 0,
    localFrontierCount: 0,
    globalFrontierCount: 0,
    activeFrontierCount: 0,
    erasedCount: 0,
    zeroSumCount: 0,
    kindCounts: {},
    activeKindCounts: {},
    erasedKindCounts: {},
    memoryStats: makeEmptyFrontierMemoryStats(),
    routes: makeEmptyRoutePressure(),
    previousRoutes: makeEmptyRoutePressure(),
    previousFrontierCount: 0,
    summary: 'frontier idle · waiting for scan signatures'
  };
}
function makeEmptyFrontierMemoryStats() {
  return {
    activeTrust: 0,
    erasedTrust: 0,
    repeatedTrust: 0,
    frontierRise: 0,
    stableEraseRatio: 0,
    phasePersistence: 0,
    syntaxSurvival: 0,
    coldBankErasure: 0,
    visualDensity: 0,
    contradiction: 0,
    memorySize: 0
  };
}

function makeEmptyFrontierMemoryBanks() {
  return Object.fromEntries(Object.entries(FRONTIER_MEMORY_BANKS).map(([name, bank]) => [
    name,
    { ...bank, records: [] }
  ]));
}
function summarizeMemoryBank(bank) {
  const records = Array.isArray(bank?.records) ? bank.records : [];
  const trust = records.reduce((sum, r) => sum + (Number(r.trust) || 0), 0) / Math.max(1, records.length);
  const zeroSumCount = records.filter(r => r.zeroSum).length;
  return {
    source: bank?.source || 'unknown',
    count: records.length,
    zeroSumCount,
    influence: Number(clamp(Number(bank?.influence) || 0, 0, 1).toFixed(4)),
    trustMean: Number(trust.toFixed(4)),
    note: bank?.note || ''
  };
}
function memoryBanksSummary() {
  return {
    hot: summarizeMemoryBank(memoryBanks.hot),
    warm: summarizeMemoryBank(memoryBanks.warm),
    cold: summarizeMemoryBank(memoryBanks.cold),
    failed: summarizeMemoryBank(memoryBanks.failed),
    mode: coldBankActiveMode,
    note: 'ColdBank is folded into memory banks: hot=current run, warm=recent erasures, cold=imported syntax, failed=retired low-trust signatures.'
  };
}
function pseudoUnitFromHash(text, salt = 0) {
  const h = hashString32(String(text || 'frontier') + ':' + salt);
  return (h % 1000003) / 1000003;
}
function pseudoCenterForSignature(signature) {
  return [pseudoUnitFromHash(signature, 17), pseudoUnitFromHash(signature, 53)];
}
function phaseFromSignature(signature) {
  const parts = String(signature || '').split(':');
  const raw = Number(parts[3]);
  return Number.isFinite(raw) ? (raw / 24) * TAU : pseudoUnitFromHash(signature, 91) * TAU;
}
function fitFromSignature(signature) {
  const parts = String(signature || '').split(':');
  const raw = Number(parts[4]);
  return Number.isFinite(raw) ? clamp(raw / 7, 0, 1) : 0.5;
}
function trustFromSignature(signature) {
  const parts = String(signature || '').split(':');
  const raw = Number(parts[5]);
  return Number.isFinite(raw) ? clamp(raw / 7, 0, 1) : 0.5;
}
function closureFromSignature(signature) {
  const parts = String(signature || '').split(':');
  const raw = Number(parts[6]);
  return Number.isFinite(raw) ? clamp(raw / 7, 0, 1) : 0.5;
}
function compactMemoryRecord(record, source = 'memory') {
  const signature = String(record?.signature || record?.hash || record?.token || source + ':' + hashString32(JSON.stringify(record || {})));
  const center = Array.isArray(record?.center) ? [clamp(Number(record.center[0]) || 0, 0, 1), clamp(Number(record.center[1]) || 0, 0, 1)] : pseudoCenterForSignature(signature);
  const phase = Number.isFinite(Number(record?.phase)) ? Number(record.phase) : phaseFromSignature(signature);
  const trust = clamp(Number(record?.trust ?? record?.support ?? record?.info ?? trustFromSignature(signature)) || 0, 0, 1);
  const survivalCount = Math.max(0, Number(record?.survivalCount ?? record?.active ?? record?.seen ?? 0) || 0);
  const erasureCount = Math.max(0, Number(record?.erasureCount ?? record?.erased ?? 0) || 0);
  const zeroFit = Number.isFinite(Number(record?.zeroFit)) ? clamp(Number(record.zeroFit), 0, 1) : fitFromSignature(signature);
  const residual = Number.isFinite(Number(record?.zeroResidual)) ? Math.max(0, Number(record.zeroResidual)) : Math.max(0, (1 / Math.max(0.08, zeroFit) - 1) / 120);
  return {
    signature,
    kind: String(record?.kind || 'memory'),
    route: String(record?.route || 'syntax'),
    source,
    center,
    phase,
    trust,
    zeroFit,
    zeroResidual: residual,
    closure: clamp(Number(record?.closure ?? closureFromSignature(signature)) || 0, 0, 1),
    winding: clamp(Number(record?.winding ?? 0.5) || 0, 0, 1),
    zeroSum: Boolean(record?.zeroSum || /zero|sum|compiled|cancel|phase-law|plateau/.test(String(record?.kind || signature))),
    seen: Math.max(0, Number(record?.seen ?? 0) || 0),
    survivalCount,
    erasureCount,
    lastSeenTick: Number(record?.lastSeenTick ?? tick) || 0
  };
}
function coldBankColdInfluence(mode = coldBankActiveMode) {
  return FRONTIER_COLD_MEMORY_INFLUENCE[mode] ?? 0.0;
}
function refreshMemoryBankInfluence() {
  if (!memoryBanks) memoryBanks = makeEmptyFrontierMemoryBanks();
  memoryBanks.hot.influence = 1.0;
  memoryBanks.warm.influence = 0.55;
  memoryBanks.cold.influence = coldBankColdInfluence();
  memoryBanks.failed.influence = 0.0;
}
function updateFrontierMemoryBanks(indexed, activeFrontier, erasedSet) {
  if (!memoryBanks) memoryBanks = makeEmptyFrontierMemoryBanks();
  const memory = symmetricFrontier.signatureMemory instanceof Map ? symmetricFrontier.signatureMemory : new Map();
  memoryBanks.hot.records = Array.from(indexed.values())
    .map(rec => compactMemoryRecord({ ...rec, source: 'hot', survivalCount: activeFrontier.has(rec.signature) ? 1 : 0, erasureCount: erasedSet.has(rec.signature) ? 1 : 0 }, 'hot'))
    .sort((a, b) => b.trust - a.trust)
    .slice(0, FRONTIER_MEMORY_BANK_LIMIT);
  memoryBanks.warm.records = Array.from(memory.values())
    .filter(rec => Number(rec.erased || 0) >= 2 && Number(rec.trust || 0) >= 0.18)
    .map(rec => compactMemoryRecord(rec, 'warm'))
    .sort((a, b) => (b.erasureCount * b.trust + b.lastSeenTick * 0.000001) - (a.erasureCount * a.trust + a.lastSeenTick * 0.000001))
    .slice(0, FRONTIER_MEMORY_BANK_LIMIT);
  memoryBanks.failed.records = Array.from(memory.values())
    .filter(rec => Number(rec.seen || 0) >= 3 && Number(rec.trust || 0) < 0.14)
    .map(rec => compactMemoryRecord(rec, 'failed'))
    .sort((a, b) => b.seen - a.seen)
    .slice(0, FRONTIER_MEMORY_BANK_LIMIT);
  refreshMemoryBankInfluence();
}
function coldMemoryRecordsFromSynthesis(syn) {
  const out = [];
  const dict = syn?.dictionary || {};
  for (const [hash, token] of Object.entries(dict).slice(0, 128)) {
    out.push(compactMemoryRecord({
      signature: makeFrontierSignature({ kind: 'cold-zero-token', detail: token.role || 'zero', bucket: hash, phaseBin: phaseBin(Number(token.phase) || 0, 24), fitBin: frontierBin(1 / (1 + (Number(token.zeroResidual) || 0) * 120), 8), trustBin: frontierBin(Number(token.info) || 0, 8), zeroBin: frontierBin(Number(token.closure) || 0, 8) }),
      kind: 'cold-zero-token', route: 'syntax', phase: Number(token.phase) || 0,
      trust: clamp(Number(token.info) || 0, 0, 1), zeroResidual: Number(token.zeroResidual) || 0,
      closure: Number(token.closure) || 0, zeroSum: true, seen: Number(token.count) || 1,
      survivalCount: Number(token.count) || 1, erasureCount: Math.max(1, Math.floor((Number(token.count) || 1) * 0.5))
    }, 'cold'));
  }
  for (const [layerName, classes] of Object.entries(syn?.sumLayerClasses || {})) {
    for (const [hash, item] of Object.entries(classes || {}).slice(0, 96)) {
      out.push(compactMemoryRecord({
        signature: makeFrontierSignature({ kind: 'cold-' + layerName + '-sum', detail: item.relation || item.role || layerName, bucket: hash, phaseBin: phaseBin(Number(item.axisPhase) || 0, 24), fitBin: frontierBin(Number(item.packingMean) || 0, 8), trustBin: frontierBin(Number(item.packingMean) || 0, 8), zeroBin: 7 }),
        kind: 'cold-' + layerName + '-sum', route: 'syntax', phase: Number(item.axisPhase) || 0,
        trust: clamp(Number(item.packingMean) || 0, 0, 1), zeroResidual: Number(item.residualMean) || 0,
        closure: Number(item.packingMean) || 0, zeroSum: true, seen: Number(item.count) || 1,
        survivalCount: Number(item.count) || 1, erasureCount: Math.max(1, Math.floor((Number(item.count) || 1) * 0.5))
      }, 'cold'));
    }
  }
  for (const [hash, item] of Object.entries(syn?.plateauClasses || {}).slice(0, 64)) {
    out.push(compactMemoryRecord({
      signature: makeFrontierSignature({ kind: 'cold-plateau', detail: item.role || 'plateau', bucket: hash, phaseBin: phaseBin(Number(item.phase) || 0, 24), fitBin: frontierBin(1 / (1 + (Number(item.zeroResidual) || 0) * 120), 8), trustBin: frontierBin(Number(item.coverage) || 0, 8), zeroBin: frontierBin(Number(item.closure) || 0, 8) }),
      kind: 'cold-plateau', route: 'coldBank', phase: Number(item.phase) || 0,
      trust: clamp((Number(item.coverage) || 0) * 3, 0, 1), zeroResidual: Number(item.zeroResidual) || 0,
      closure: Number(item.closure) || 0, zeroSum: true, seen: Number(item.count) || 1,
      survivalCount: Number(item.count) || 1, erasureCount: Number(item.count) || 1
    }, 'cold'));
  }
  return out.sort((a, b) => b.trust - a.trust).slice(0, FRONTIER_MEMORY_BANK_LIMIT);
}
function updateColdMemoryBankFromSynthesis(syn) {
  if (!memoryBanks) memoryBanks = makeEmptyFrontierMemoryBanks();
  memoryBanks.cold.records = coldMemoryRecordsFromSynthesis(syn);
  memoryBanks.cold.source = syntaxColdBank?.distilledOnly ? 'distilled-synthesis' : 'coldBank-stack';
  memoryBanks.cold.note = coldBankActiveMode === 'continuum'
    ? 'cold memory contributes route pressure through gates'
    : coldBankActiveMode === 'work'
      ? 'cold memory visible with low work-mode influence'
      : 'cold memory loaded but gated off';
  refreshMemoryBankInfluence();
}
function memoryBankRouteInfluence() {
  refreshMemoryBankInfluence();
  const cold = summarizeMemoryBank(memoryBanks.cold);
  const coldTrust = cold.trustMean * cold.influence;
  const coldZero = cold.count ? cold.zeroSumCount / Math.max(1, cold.count) : 0;
  const warm = summarizeMemoryBank(memoryBanks.warm);
  const warmTrust = warm.trustMean * warm.influence;
  return {
    coldTrust,
    coldZero,
    warmTrust,
    syntax: clamp(coldTrust * coldZero * (coldBankActiveMode === 'continuum' ? 0.16 : 0.035), 0, 0.16),
    coldBank: clamp(coldTrust * (coldBankActiveMode === 'continuum' ? 0.18 : 0.045) + warmTrust * 0.05, 0, 0.20),
    zeroSum: clamp(coldTrust * coldZero * 0.12, 0, 0.12)
  };
}
function frontierClockState() {
  return {
    tick,
    localClock: simTime,
    globalClock: simTime * SYMMETRIC_FRONTIER_GLOBAL_TIME_SCALE
  };
}
function symmetricDifferenceSet(a, b) {
  if (a && typeof a.symmetricDifference === 'function') return a.symmetricDifference(b);
  const out = new Set(a || []);
  for (const x of b || []) {
    if (out.has(x)) out.delete(x);
    else out.add(x);
  }
  return out;
}
function frontierBin(value, bins = 8) {
  return clamp(Math.floor(clamp(Number(value) || 0, 0, 1) * bins), 0, bins - 1);
}
function signedFrontierBin(value, scale = 1, bins = 16) {
  const normalized = clamp((Number(value) || 0) * scale * 0.5 + 0.5, 0, 1);
  return frontierBin(normalized, bins);
}
function signatureTrust(sample) {
  const zeroFit = 1 / (1 + Math.max(0, Number(sample.zeroResidual) || 0) * 120);
  return clamp(0.34 * (Number(sample.closure) || 0) + 0.33 * zeroFit + 0.33 * clamp(Number(sample.winding) || 0, 0, 1), 0, 1);
}
function signatureOfScanSample(sample, kind = 'cell', detail = '') {
  const parts = [
    kind,
    detail || 'scan',
    sample.cellX,
    sample.cellY,
    phaseBin(Number(sample.phase) || 0, 24),
    frontierBin(sample.closure, 8),
    frontierBin(1 / (1 + Math.max(0, Number(sample.zeroResidual) || 0) * 120), 8),
    frontierBin(sample.winding, 8),
    signedFrontierBin(sample.axisX, 0.5, 12),
    signedFrontierBin(sample.axisY, 0.5, 12)
  ];
  return parts.join(':');
}
function makeFrontierSignature(entry) {
  return [
    String(entry.kind || 'event'),
    String(entry.detail || 'generic'),
    String(entry.bucket || 'all'),
    String(entry.phaseBin ?? 0),
    String(entry.fitBin ?? 0),
    String(entry.trustBin ?? 0),
    String(entry.zeroBin ?? 0)
  ].join(':');
}
function emitFrontierSignature(context, entry) {
  if (!context || !Array.isArray(context.signatures)) return null;
  if (context.signatures.length >= SYMMETRIC_FRONTIER_MAX_SIGNATURES) return null;
  const signature = entry.signature || makeFrontierSignature(entry);
  const kind = String(entry.kind || 'generic');
  const item = {
    signature,
    kind,
    trust: clamp(Number(entry.trust) || 0, 0, 1),
    zeroSum: Boolean(entry.zeroSum || /zero|sum|compiled|cancel/.test(kind)),
    route: entry.route || 'observe',
    center: Array.isArray(entry.center) ? [clamp(Number(entry.center[0]) || 0, 0, 1), clamp(Number(entry.center[1]) || 0, 0, 1)] : null,
    phase: Number.isFinite(Number(entry.phase)) ? Number(entry.phase) : null,
    zeroResidual: Number.isFinite(Number(entry.zeroResidual)) ? Math.max(0, Number(entry.zeroResidual)) : null,
    closure: Number.isFinite(Number(entry.closure)) ? clamp(Number(entry.closure), 0, 1) : null,
    winding: Number.isFinite(Number(entry.winding)) ? clamp(Number(entry.winding), 0, 1) : null
  };
  context.signatures.push(item);
  context.signatureKinds[kind] = (context.signatureKinds[kind] || 0) + 1;
  if (item.zeroSum) context.zeroSumSignatureCount += 1;
  return item;
}
function emitScanSampleSignature(context, sample, kind, detail = '', trust = signatureTrust(sample), route = 'observe') {
  return emitFrontierSignature(context, {
    signature: signatureOfScanSample(sample, kind, detail),
    kind,
    detail,
    trust,
    route,
    center: [sample.u, sample.v],
    phase: sample.phase,
    zeroResidual: sample.zeroResidual,
    closure: sample.closure,
    winding: sample.winding,
    zeroSum: /zero|sum|cancel/.test(kind + ':' + detail)
  });
}
function summarizeSignatureKinds(signatures, activeSet = null) {
  const counts = {};
  for (const entry of signatures || []) {
    if (activeSet && !activeSet.has(entry.signature)) continue;
    counts[entry.kind] = (counts[entry.kind] || 0) + 1;
  }
  return counts;
}
function indexFrontierSignatures(signatures) {
  const indexed = new Map();
  for (const entry of signatures || []) {
    if (!entry || !entry.signature) continue;
    let rec = indexed.get(entry.signature);
    if (!rec) {
      rec = { signature: entry.signature, kind: entry.kind || 'generic', route: entry.route || 'observe', trust: 0, count: 0, zeroSum: false, center: null, phase: null, zeroResidual: null, closure: null, winding: null };
      indexed.set(entry.signature, rec);
    }
    rec.count += 1;
    rec.trust = Math.max(rec.trust, clamp(Number(entry.trust) || 0, 0, 1));
    rec.zeroSum = rec.zeroSum || Boolean(entry.zeroSum);
    if (entry.kind) rec.kind = entry.kind;
    if (entry.route) rec.route = entry.route;
    if (Array.isArray(entry.center)) rec.center = entry.center;
    if (Number.isFinite(Number(entry.phase))) rec.phase = Number(entry.phase);
    if (Number.isFinite(Number(entry.zeroResidual))) rec.zeroResidual = Number(entry.zeroResidual);
    if (Number.isFinite(Number(entry.closure))) rec.closure = Number(entry.closure);
    if (Number.isFinite(Number(entry.winding))) rec.winding = Number(entry.winding);
  }
  return indexed;
}
function frontierKindCount(kindCounts, pattern) {
  return Object.entries(kindCounts || {}).reduce((sum, [kind, count]) => sum + (pattern.test(kind) ? count : 0), 0);
}
function updateFrontierSignatureMemory(indexed, activeFrontier, erasedSet) {
  const memory = symmetricFrontier.signatureMemory instanceof Map ? symmetricFrontier.signatureMemory : new Map();
  let activeTrustSum = 0;
  let activeTrustCount = 0;
  let erasedTrustSum = 0;
  let erasedTrustCount = 0;
  let repeatedTrustSum = 0;
  let repeatedTrustCount = 0;
  let stableEraseCount = 0;
  let phasePersistSum = 0;
  let phasePersistCount = 0;
  let syntaxSurvivalSum = 0;
  let syntaxSurvivalCount = 0;
  let coldBankEraseSum = 0;
  let coldBankEraseCount = 0;
  let visualTrustSum = 0;
  let visualTrustCount = 0;
  let contradictionSum = 0;
  let contradictionCount = 0;

  for (const [signature, meta] of indexed) {
    const prior = memory.get(signature) || {
      signature,
      kind: meta.kind,
      route: meta.route,
      seen: 0,
      active: 0,
      erased: 0,
      trust: 0,
      zeroSum: false,
      center: null,
      phase: null,
      zeroResidual: null,
      closure: null,
      winding: null,
      lastSeenTick: 0
    };
    const trust = clamp(meta.trust || prior.trust || 0, 0, 1);
    const isActive = activeFrontier.has(signature);
    const isErased = erasedSet.has(signature) || !isActive;
    prior.kind = meta.kind || prior.kind;
    prior.route = meta.route || prior.route;
    prior.zeroSum = prior.zeroSum || Boolean(meta.zeroSum);
    if (Array.isArray(meta.center)) prior.center = meta.center;
    if (Number.isFinite(Number(meta.phase))) prior.phase = Number(meta.phase);
    if (Number.isFinite(Number(meta.zeroResidual))) prior.zeroResidual = Number(meta.zeroResidual);
    if (Number.isFinite(Number(meta.closure))) prior.closure = Number(meta.closure);
    if (Number.isFinite(Number(meta.winding))) prior.winding = Number(meta.winding);
    prior.seen += 1;
    prior.trust = prior.trust ? (prior.trust * 0.72 + trust * 0.28) : trust;
    prior.lastSeenTick = tick;
    if (isActive) prior.active += 1;
    if (isErased) prior.erased += 1;
    memory.set(signature, prior);

    if (isActive) {
      activeTrustSum += prior.trust;
      activeTrustCount += 1;
      if (prior.seen > 1) {
        repeatedTrustSum += prior.trust * clamp(prior.seen / 6, 0, 1);
        repeatedTrustCount += 1;
      }
      if (FRONTIER_KIND_PATTERNS.phaseLaw.test(prior.kind)) {
        phasePersistSum += clamp(prior.active / Math.max(1, prior.seen), 0, 1) * prior.trust;
        phasePersistCount += 1;
      }
      if (FRONTIER_KIND_PATTERNS.zeroSum.test(prior.kind)) {
        syntaxSurvivalSum += clamp(prior.active / Math.max(1, prior.seen), 0, 1) * prior.trust;
        syntaxSurvivalCount += 1;
      }
      if (FRONTIER_KIND_PATTERNS.visual.test(prior.kind)) {
        visualTrustSum += prior.trust;
        visualTrustCount += 1;
      }
      if (!prior.zeroSum && FRONTIER_KIND_PATTERNS.autonomy.test(prior.kind)) {
        contradictionSum += 1 - prior.trust;
        contradictionCount += 1;
      }
    } else if (isErased) {
      erasedTrustSum += prior.trust;
      erasedTrustCount += 1;
      if (prior.erased >= 3) stableEraseCount += 1;
      if (FRONTIER_KIND_PATTERNS.coldBank.test(prior.kind)) {
        coldBankEraseSum += clamp(prior.erased / Math.max(1, prior.seen), 0, 1) * prior.trust;
        coldBankEraseCount += 1;
      }
    }
  }

  // Keep the memory bounded and bias retention toward recently seen or repeatedly erased signatures.
  if (memory.size > SYMMETRIC_FRONTIER_MEMORY_LIMIT) {
    const survivors = Array.from(memory.values())
      .sort((a, b) => (b.lastSeenTick + b.erased * 2 + b.active) - (a.lastSeenTick + a.erased * 2 + a.active))
      .slice(0, SYMMETRIC_FRONTIER_MEMORY_LIMIT);
    memory.clear();
    for (const rec of survivors) memory.set(rec.signature, rec);
  }

  const frontierRise = clamp(
    ((activeFrontier.size || 0) - Number(symmetricFrontier.previousFrontierCount || 0)) / Math.max(1, indexed.size),
    0,
    1
  );
  return {
    activeTrust: Number((activeTrustSum / Math.max(1, activeTrustCount)).toFixed(4)),
    erasedTrust: Number((erasedTrustSum / Math.max(1, erasedTrustCount)).toFixed(4)),
    repeatedTrust: Number((repeatedTrustSum / Math.max(1, repeatedTrustCount)).toFixed(4)),
    frontierRise: Number(frontierRise.toFixed(4)),
    stableEraseRatio: Number((stableEraseCount / Math.max(1, erasedTrustCount)).toFixed(4)),
    phasePersistence: Number((phasePersistSum / Math.max(1, phasePersistCount)).toFixed(4)),
    syntaxSurvival: Number((syntaxSurvivalSum / Math.max(1, syntaxSurvivalCount)).toFixed(4)),
    coldBankErasure: Number((coldBankEraseSum / Math.max(1, coldBankEraseCount)).toFixed(4)),
    visualDensity: Number((visualTrustSum / Math.max(1, visualTrustCount)).toFixed(4)),
    contradiction: Number((contradictionSum / Math.max(1, contradictionCount)).toFixed(4)),
    memorySize: memory.size
  };
}
function frontierKindRatio(kindCounts, patternName, total) {
  return unit(frontierKindCount(kindCounts, FRONTIER_KIND_PATTERNS[patternName]) / Math.max(1, total));
}
function frontierRouteFeatures(currentCount, activeFrontier, erasedCount, signatures, memoryStats, previousRoutes, erasedSet) {
  const active = activeFrontier?.size || 0;
  const total = Math.max(1, currentCount);
  const activeKinds = summarizeSignatureKinds(signatures, activeFrontier);
  const erasedKinds = summarizeSignatureKinds(signatures, erasedSet);
  const frontierRatio = unit(active / total);
  const erasedRatio = unit(erasedCount / total);
  const zeroRatio = frontierKindRatio(activeKinds, 'zeroSum', active);
  const zeroErasedRatio = frontierKindRatio(erasedKinds, 'zeroSum', erasedCount);
  const plateauErasedRatio = frontierKindRatio(erasedKinds, 'plateau', erasedCount);
  const phaseRatio = frontierKindRatio(activeKinds, 'phaseLaw', active);
  const autonomyRatio = frontierKindRatio(activeKinds, 'autonomy', active);
  const visualRatio = frontierKindRatio(activeKinds, 'visual', active);
  const trustedCompression = unit(previousRoutes.compress);
  const bankInfluence = memoryBankRouteInfluence();
  const contradiction = unit(memoryStats.contradiction + autonomyRatio * 0.25 + frontierRatio * (1 - zeroRatio) * 0.25);
  return {
    active, total, activeKinds, erasedKinds, frontierRatio, erasedRatio, zeroRatio, zeroErasedRatio,
    plateauErasedRatio, phaseRatio, autonomyRatio, visualRatio, trustedCompression, bankInfluence, contradiction
  };
}
const FRONTIER_ROUTE_FORMULAS = {
  compress: f => f.erasedRatio * (1 - 0.65 * f.frontierRatio) * (0.35 + 0.45 * f.memory.erasedTrust + 0.20 * f.memory.repeatedTrust)
    + f.plateauErasedRatio * 0.16 + f.zeroErasedRatio * 0.12,
  explore: f => f.frontierRatio * (1 - 0.35 * f.erasedRatio) * (0.55 + 0.45 * (1 - f.memory.repeatedTrust))
    + f.autonomyRatio * 0.18,
  audit: f => f.memory.frontierRise * (0.35 + 0.65 * f.trustedCompression)
    + f.frontierRatio * (1 - f.memory.activeTrust) * 0.28 + f.contradiction * 0.18,
  rest: f => (1 - f.frontierRatio) * f.erasedRatio * (0.42 + 0.58 * f.memory.erasedTrust),
  syntax: f => f.zeroRatio * (0.35 + 0.40 * f.memory.repeatedTrust + 0.25 * f.memory.syntaxSurvival)
    + f.zeroErasedRatio * f.erasedRatio * 0.18 + f.bankInfluence.syntax,
  coldBank: f => f.erasedRatio * (0.32 + 0.42 * f.memory.coldBankErasure + 0.26 * f.memory.stableEraseRatio)
    + f.plateauErasedRatio * 0.20 + f.bankInfluence.coldBank,
  phaseLaw: f => f.phaseRatio * (0.45 + 0.55 * f.memory.phasePersistence)
    + (f.memory.phasePersistence > 0 ? f.frontierRatio * 0.08 : 0),
  render: f => f.frontierRatio * (0.45 + 0.35 * f.memory.visualDensity + 0.20 * f.memory.activeTrust) * (1 - 0.55 * f.contradiction)
    + f.visualRatio * 0.20,
  zeroSum: f => f.zeroRatio + f.bankInfluence.zeroSum
};
function routePressureFromFrontier(currentCount, activeFrontier, erasedCount, signatures, memoryStats = makeEmptyFrontierMemoryStats(), previousRoutes = makeEmptyRoutePressure(), erasedSet = new Set()) {
  const features = {
    ...frontierRouteFeatures(currentCount, activeFrontier, erasedCount, signatures, memoryStats, previousRoutes, erasedSet),
    memory: memoryStats
  };
  return Object.fromEntries(FRONTIER_ROUTE_PORTS.map(port => [port, round4(FRONTIER_ROUTE_FORMULAS[port](features))]));
}

function frontierRoutes() {
  return symmetricFrontier?.routes || makeEmptyRoutePressure();
}
function frontierRoutesReady() {
  return Boolean(symmetricFrontier && symmetricFrontier.scanCount > 0 && symmetricFrontier.currentCount > 0);
}
function frontierRouteGate(routeName, lo = 1.0, hi = 1.0) {
  return mix(lo, hi, frontierRoutes()[routeName] || 0);
}
function effectiveCompiledZeroSumGain() {
  return Number(compiledZeroSumLayer?.gain || 0) * routeMix(frontierRoutes(), FRONTIER_GATE_MIX.compiledZeroSum);
}
function effectiveColdBankSignal(value) {
  return unit(value) * routeMix(frontierRoutes(), FRONTIER_GATE_MIX.coldBankSignal);
}
function frontierAuditCadenceScale() {
  return clamp(routeMix(frontierRoutes(), FRONTIER_GATE_MIX.auditCadence), 0.50, 1.25);
}
function routeAdjustedStride(baseStride, routes = frontierRoutes()) {
  const base = Math.max(1, Number(baseStride) || 8);
  const scanStride = base * routeMix(routes, FRONTIER_GATE_MIX.scanStride);
  return clamp(Math.max(1, Math.round(scanStride / 2) * 2), FRONTIER_SCAN_STRIDE_MIN, FRONTIER_SCAN_STRIDE_MAX);
}
function frontierPhaseLawGate() {
  return routeMix(frontierRoutes(), FRONTIER_GATE_MIX.phaseLaw);
}
function effectivePhaseLawStartSignal() {
  return residentSignalFullness * frontierPhaseLawGate();
}
function frontierGateSummary() {
  const routes = frontierRoutes();
  return {
    slopeOnly: true,
    compiledZeroSumGain: Number(effectiveCompiledZeroSumGain().toExponential(4)),
    auditCadenceScale: Number(frontierAuditCadenceScale().toFixed(4)),
    scanStride8: routeAdjustedStride(8, routes),
    scanStride16: routeAdjustedStride(16, routes),
    phaseLawGate: Number(frontierPhaseLawGate().toFixed(4)),
    coldBankInfluence: Number(frontierRouteGate('coldBank', 1.0, 1.10).toFixed(4)),
    note: 'Frontier route pressure changes slopes only: gains, scan cadence, scan stride, phase-law gate, and coldBank pressure. It does not reset, reseed, hard-switch modes, or write raw state.'
  };
}

function makeFrontierBraid(current, clocks = frontierClockState()) {
  const localFrontier = symmetricDifferenceSet(current, symmetricFrontier.previousLocal);
  const erasedLocalSet = new Set([...current].filter(signature => symmetricFrontier.previousLocal.has(signature)));
  const globalDue = (tick - symmetricFrontier.lastGlobalTick >= SYMMETRIC_FRONTIER_GLOBAL_INTERVAL_TICKS)
    || (clocks.globalClock - Number(symmetricFrontier.lastGlobalClock || 0) >= SYMMETRIC_FRONTIER_GLOBAL_INTERVAL_SECONDS)
    || !symmetricFrontier.previousGlobal.size;
  const globalFrontier = symmetricDifferenceSet(current, symmetricFrontier.previousGlobal);
  const erasedGlobalSet = new Set([...current].filter(signature => symmetricFrontier.previousGlobal.has(signature)));
  const activeFrontier = symmetricDifferenceSet(localFrontier, globalFrontier);
  const erasedSet = new Set([...erasedLocalSet, ...erasedGlobalSet].filter(signature => !activeFrontier.has(signature)));
  return { localFrontier, globalFrontier, activeFrontier, erasedSet, erasedCount: erasedSet.size, globalDue };
}
function updateSymmetricFrontierFromScan(scan, options = {}) {
  const signatures = Array.isArray(scan?.signatures) ? scan.signatures : [];
  const indexed = indexFrontierSignatures(signatures);
  const current = new Set(indexed.keys());
  const clocks = frontierClockState();
  const { localFrontier, globalFrontier, activeFrontier, erasedSet, erasedCount, globalDue } = makeFrontierBraid(current, clocks);
  const memoryStats = updateFrontierSignatureMemory(indexed, activeFrontier, erasedSet);
  updateFrontierMemoryBanks(indexed, activeFrontier, erasedSet);
  const routes = routePressureFromFrontier(current.size, activeFrontier, erasedCount, signatures, memoryStats, symmetricFrontier.routes, erasedSet);
  symmetricFrontier = {
    ...symmetricFrontier,
    previousLocal: current,
    previousGlobal: globalDue ? current : symmetricFrontier.previousGlobal,
    localFrontier,
    globalFrontier,
    activeFrontier,
    lastGlobalTick: globalDue ? tick : symmetricFrontier.lastGlobalTick,
    lastGlobalClock: globalDue ? clocks.globalClock : symmetricFrontier.lastGlobalClock,
    lastGlobalTime: globalDue ? simTime : symmetricFrontier.lastGlobalTime,
    lastScanTick: tick,
    lastLocalClock: clocks.localClock,
    lastScanTime: simTime,
    scanCount: symmetricFrontier.scanCount + 1,
    source: options.source || 'scan',
    currentCount: current.size,
    frontierCount: activeFrontier.size,
    localFrontierCount: localFrontier.size,
    globalFrontierCount: globalFrontier.size,
    activeFrontierCount: activeFrontier.size,
    erasedCount,
    zeroSumCount: signatures.filter(s => s.zeroSum).length,
    kindCounts: summarizeSignatureKinds(signatures),
    activeKindCounts: summarizeSignatureKinds(signatures, activeFrontier),
    erasedKindCounts: summarizeSignatureKinds(signatures, erasedSet),
    memoryStats,
    previousRoutes: symmetricFrontier.routes,
    routes,
    previousFrontierCount: activeFrontier.size,
    summary: 'frontier L' + localFrontier.size + ' △ G' + globalFrontier.size + ' → ' + activeFrontier.size + '/' + current.size
      + ' · erased ' + erasedCount
      + ' · zΣ ' + routes.zeroSum.toFixed(2)
      + ' · C/E/A/R ' + routes.compress.toFixed(2) + '/' + routes.explore.toFixed(2) + '/' + routes.audit.toFixed(2) + '/' + routes.rest.toFixed(2)
      + ' · banks H/W/C ' + memoryBanks.hot.records.length + '/' + memoryBanks.warm.records.length + '/' + memoryBanks.cold.records.length
      + ' · slope-only'
  };
  updateFrontierStats();
  return symmetricFrontierSummary();
}
function symmetricFrontierSummary() {
  return {
    schema: SYMMETRIC_FRONTIER_SCHEMA,
    source: symmetricFrontier.source,
    scanCount: symmetricFrontier.scanCount,
    tick: symmetricFrontier.lastScanTick,
    localClock: Number((symmetricFrontier.lastLocalClock || 0).toFixed ? symmetricFrontier.lastLocalClock.toFixed(4) : symmetricFrontier.lastLocalClock),
    globalClock: Number((symmetricFrontier.lastGlobalClock || 0).toFixed ? symmetricFrontier.lastGlobalClock.toFixed(4) : symmetricFrontier.lastGlobalClock),
    globalScale: SYMMETRIC_FRONTIER_GLOBAL_TIME_SCALE,
    simTime: Number(symmetricFrontier.lastScanTime.toFixed ? symmetricFrontier.lastScanTime.toFixed(4) : symmetricFrontier.lastScanTime),
    currentCount: symmetricFrontier.currentCount,
    frontierCount: symmetricFrontier.frontierCount,
    localFrontierCount: symmetricFrontier.localFrontierCount,
    globalFrontierCount: symmetricFrontier.globalFrontierCount,
    activeFrontierCount: symmetricFrontier.activeFrontierCount,
    erasedCount: symmetricFrontier.erasedCount,
    zeroSumCount: symmetricFrontier.zeroSumCount,
    kindCounts: { ...symmetricFrontier.kindCounts },
    activeKindCounts: { ...symmetricFrontier.activeKindCounts },
    erasedKindCounts: { ...symmetricFrontier.erasedKindCounts },
    memoryStats: { ...symmetricFrontier.memoryStats },
    memoryBanks: memoryBanksSummary(),
    routes: { ...symmetricFrontier.routes },
    gateMix: frontierGateSummary(),
    note: 'Slope-only symmetric frontier: local and slower global memory are braided by symmetric difference. Agreement cancels; one-scale disagreement survives as route pressure. Routes modulate safe gates/cadences but do not reset, reseed, hard-switch modes, or write raw state.'
  };
}
function updateFrontierStats() {
  const node = el('frontierStat');
  if (node) node.textContent = symmetricFrontier.summary;
}
function appendResidentSignalStructureSignatures(scan, tokens, relations, sumLayers) {
  if (!scan || !Array.isArray(scan.signatures)) return;
  for (const token of tokens.slice(0, 48)) {
    emitFrontierSignature(scan, {
      kind: 'zero-token',
      detail: token.role || 'token',
      bucket: token.hash || token.token,
      phaseBin: phaseBin(Number(token.phase) || 0, 24),
      fitBin: frontierBin(1 / (1 + (Number(token.zeroResidual) || 0) * 120), 8),
      trustBin: frontierBin(Number(token.info) || 0, 8),
      zeroBin: frontierBin(Number(token.closure) || 0, 8),
      trust: Number(token.info) || 0,
      route: 'syntax',
      center: token.center,
      phase: Number(token.phase) || 0,
      zeroResidual: Number(token.zeroResidual) || 0,
      closure: Number(token.closure) || 0,
      winding: Number(token.winding) || 0,
      zeroSum: true
    });
  }
  for (const addr of (sumLayers?.one?.addresses || []).slice(0, 32)) {
    const token = addr.token || {};
    emitFrontierSignature(scan, {
      kind: 'one-sum', detail: addr.role || 'one', bucket: addr.hash || addr.members?.[0] || 'one',
      phaseBin: phaseBin(Number(addr.axisPhase || addr.phase) || 0, 24), fitBin: frontierBin(Number(addr.packingScore || addr.support) || 0, 8),
      trustBin: frontierBin(Number(addr.support || addr.packingScore) || 0, 8), zeroBin: frontierBin(Number(token.closure || addr.packingScore) || 0, 8),
      trust: Number(addr.support || addr.packingScore) || 0.5,
      route: 'coldBank',
      center: addr.center || token.center,
      phase: Number(addr.axisPhase || addr.phase || token.phase) || 0,
      zeroResidual: Number(addr.combinedResidual || token.zeroResidual) || 0,
      closure: Number(token.closure || addr.packingScore) || 0,
      winding: Number(token.winding || 0),
      zeroSum: false
    });
  }
  for (const rel of relations.slice(0, 32)) {
    emitFrontierSignature(scan, {
      kind: rel.relation === 'zero_cancel' ? 'zero-cancel' : 'syntax-relation',
      detail: rel.relation || 'relation',
      bucket: String(rel.from || '').slice(-4) + ':' + String(rel.to || '').slice(-4),
      phaseBin: phaseBin(Number(rel.phaseDelta) || 0, 24),
      fitBin: frontierBin(Number(rel.support) || 0, 8),
      trustBin: frontierBin(Number(rel.support) || 0, 8),
      zeroBin: rel.relation === 'zero_cancel' ? 7 : 0,
      trust: Number(rel.support) || 0,
      route: 'syntax',
      zeroSum: rel.relation === 'zero_cancel'
    });
  }
  for (const addr of (sumLayers?.two?.addresses || []).slice(0, 24)) {
    emitFrontierSignature(scan, {
      kind: 'two-sum', detail: addr.role || 'two', bucket: addr.hash || addr.address || 'two',
      phaseBin: phaseBin(Number(addr.axisPhase || addr.phaseDelta || addr.phase || addr.phaseMean) || 0, 24), fitBin: frontierBin(Number(addr.packingScore || addr.packing || addr.support) || 0, 8),
      trustBin: frontierBin(Number(addr.support || addr.packingScore || addr.packing) || 0, 8), zeroBin: 7, trust: Number(addr.support || addr.packingScore || addr.packing) || 0.5,
      route: 'syntax', zeroSum: true
    });
  }
  for (const addr of (sumLayers?.three?.addresses || []).slice(0, 16)) {
    emitFrontierSignature(scan, {
      kind: 'three-sum', detail: addr.role || 'three', bucket: addr.hash || addr.address || 'three',
      phaseBin: phaseBin(Number(addr.axisPhase || addr.phaseDelta || addr.phase || addr.phaseMean) || 0, 24), fitBin: frontierBin(Number(addr.packingScore || addr.packing || addr.support) || 0, 8),
      trustBin: frontierBin(Number(addr.support || addr.packingScore || addr.packing) || 0, 8), zeroBin: 7, trust: Number(addr.support || addr.packingScore || addr.packing) || 0.5,
      route: 'syntax', zeroSum: true
    });
  }
  if (compiledZeroSumLayer?.active) {
    emitFrontierSignature(scan, {
      kind: 'compiled-zero-sum', detail: compiledZeroSumLayer.source || 'compiled', bucket: compiledZeroSumLayer.tokenCount,
      phaseBin: frontierBin(compiledZeroSumLayer.coverage, 8), fitBin: frontierBin(compiledZeroSumLayer.zeroFit, 8),
      trustBin: frontierBin(compiledZeroSumLayer.supportMean, 8), zeroBin: 7, trust: compiledZeroSumLayer.supportMean,
      route: 'syntax', zeroSum: true
    });
  }
}

function compiledZeroSumStatusText() {
  if (!compiledZeroSumLayer?.active) return 'compiled zero idle';
  return 'compiled zero ' + compiledZeroSumLayer.tokenCount + '/' + compiledZeroSumLayer.sourceTokenCount
    + ' · bindings ' + (compiledZeroSumLayer.frontierBindingCount || 0) + 'F/' + (compiledZeroSumLayer.coldBindingCount || 0) + 'C'
    + ' · gain ' + Number(compiledZeroSumLayer.gain || 0).toExponential(2)
    + ' · support ' + Number(compiledZeroSumLayer.supportMean || 0).toFixed(3);
}

function normalizeTokenPhase(phase) {
  const p = Number(phase);
  return Number.isFinite(p) ? p : 0;
}

function scoreCompiledZeroToken(token, relationSupport = 0) {
  const info = clamp(Number(token?.info) || 0, 0, 1);
  const closure = clamp(Number(token?.closure) || 0, 0, 1);
  const winding = clamp(Number(token?.winding) || 0, 0, 1);
  const residual = Math.max(0, Number(token?.zeroResidual) || 0);
  const persistence = Math.max(1, Number(token?.persistence) || 1);
  const count = Math.max(1, Number(token?.count) || 1);
  const zeroFit = 1 / (1 + residual * 120);
  const persistenceGate = clamp(Math.log2(1 + persistence + 0.25 * count) / 4, 0.28, 1);
  const relationGate = clamp(Number(relationSupport) || 0, 0, 1);
  const role = String(token?.role || '');
  const roleGate = role === 'zero_axis' ? 1.0 : role === 'winding_axis' ? 0.86 : role === 'closed_boundary_lock' ? 0.78 : 0.60;
  return clamp((0.38 * info + 0.32 * closure + 0.18 * zeroFit + 0.12 * winding)
    * persistenceGate
    * (0.72 + 0.28 * relationGate)
    * roleGate, 0, 1);
}

const COMPILED_BINDING_ROUTE_WEIGHTS = { syntax: 1.0, coldBank: 0.88, phaseLaw: 0.82, render: 0.62 };
function routeWeightForCompiledBinding(route) {
  return COMPILED_BINDING_ROUTE_WEIGHTS[route] ?? 0.72;
}
function tokenToCompiledBinding(token, relationSupport = 0, source = 'resident-signal-token') {
  const support = scoreCompiledZeroToken(token, relationSupport);
  if (!(support > 0.12) || !Array.isArray(token?.center) || token.center.length < 2) return null;
  return {
    source,
    signature: token.hash || token.token || source,
    kind: token.role || 'zero-token',
    route: 'syntax',
    center: [clamp(Number(token.center[0]) || 0, 0, 1), clamp(Number(token.center[1]) || 0, 0, 1)],
    phase: normalizeTokenPhase(token.phase),
    zeroResidual: Math.max(0, Number(token.zeroResidual) || 0),
    closure: clamp(Number(token.closure) || 0, 0, 1),
    winding: clamp(Number(token.winding) || 0, 0, 1),
    persistence: clamp(Math.log2(1 + Math.max(1, Number(token.persistence) || 1)) / 4, 0.25, 1),
    support,
    survivalCount: Math.max(1, Number(token.persistence) || 1),
    erasureCount: 0,
    zeroSum: true
  };
}
function frontierRecordToCompiledBinding(record, bankName = 'frontier') {
  const rec = compactMemoryRecord(record, bankName);
  if (!rec.zeroSum && !(FRONTIER_KIND_PATTERNS.zeroSum.test(rec.kind) || FRONTIER_KIND_PATTERNS.phaseLaw.test(rec.kind) || FRONTIER_KIND_PATTERNS.plateau.test(rec.kind))) return null;
  const influence = clamp(Number(memoryBanks?.[bankName]?.influence ?? (bankName === 'cold' ? coldBankColdInfluence() : 0.55)) || 0, 0, 1);
  if (bankName === 'cold' && influence <= 0) return null;
  const routeWeight = routeWeightForCompiledBinding(rec.route);
  const survival = clamp(Math.log2(1 + rec.survivalCount + rec.seen) / 5, 0.18, 1);
  const erasure = clamp(Math.log2(1 + rec.erasureCount) / 5, 0, 1);
  const support = clamp(rec.trust * (0.42 + 0.38 * survival + 0.20 * erasure) * routeWeight * (bankName === 'cold' ? (0.45 + 0.55 * influence) : 1.0), 0, 1);
  if (support <= 0.11) return null;
  return {
    source: bankName,
    signature: rec.signature,
    kind: rec.kind,
    route: rec.route,
    center: rec.center,
    phase: rec.phase,
    zeroResidual: rec.zeroResidual,
    closure: rec.closure,
    winding: rec.winding,
    persistence: clamp(0.25 + 0.40 * survival + 0.35 * erasure, 0, 1),
    support,
    survivalCount: rec.survivalCount,
    erasureCount: rec.erasureCount,
    zeroSum: rec.zeroSum
  };
}
function trustedFrontierCompiledBindings() {
  refreshMemoryBankInfluence();
  const out = [];
  for (const bankName of FRONTIER_COMPILED_BINDING_BANKS) {
    for (const rec of (memoryBanks?.[bankName]?.records || []).slice(0, FRONTIER_COMPILED_BINDING_LIMIT)) {
      const binding = frontierRecordToCompiledBinding(rec, bankName);
      if (binding) out.push(binding);
    }
  }
  const bySignature = new Map();
  for (const binding of out) {
    const prior = bySignature.get(binding.signature);
    if (!prior || binding.support > prior.support) bySignature.set(binding.signature, binding);
  }
  return Array.from(bySignature.values()).sort((a, b) => b.support - a.support).slice(0, FRONTIER_COMPILED_BINDING_LIMIT);
}
function compileZeroSumSyntaxFromManifest(manifest, source = 'resident-signal') {
  const next = makeEmptyCompiledZeroSumLayer();
  const tokens = Array.isArray(manifest?.tokens) ? manifest.tokens : [];
  const relationSupport = new Map();
  for (const rel of Array.isArray(manifest?.relations) ? manifest.relations : []) {
    const support = clamp(Number(rel?.support) || 0, 0, 1);
    if (rel?.from) relationSupport.set(rel.from, Math.max(relationSupport.get(rel.from) || 0, support));
    if (rel?.to) relationSupport.set(rel.to, Math.max(relationSupport.get(rel.to) || 0, support));
  }

  const tokenBindings = tokens
    .map(token => tokenToCompiledBinding(token, relationSupport.get(token?.hash) || 0))
    .filter(Boolean);
  const frontierBindings = trustedFrontierCompiledBindings();
  const combined = [...tokenBindings, ...frontierBindings]
    .filter(binding => binding.support > 0.11 && Array.isArray(binding.center) && binding.center.length >= 2)
    .sort((a, b) => b.support - a.support)
    .slice(0, COMPILED_ZERO_SUM_TOKEN_CAP);

  if (!combined.length) {
    compiledZeroSumLayer = next;
    return compiledZeroSumLayer;
  }

  let supportSum = 0;
  let zeroFitSum = 0;
  let tokenBindingCount = 0;
  let frontierBindingCount = 0;
  let coldBindingCount = 0;
  for (let i = 0; i < combined.length; i++) {
    const binding = combined[i];
    const j = i * 4;
    const cx = clamp(Number(binding.center[0]) || 0, 0, 1);
    const cy = clamp(Number(binding.center[1]) || 0, 0, 1);
    const phase = normalizeTokenPhase(binding.phase);
    const residual = Math.max(0, Number(binding.zeroResidual) || 0);
    const closure = clamp(Number(binding.closure) || 0, 0, 1);
    const winding = clamp(Number(binding.winding) || 0, 0, 1);
    const persistence = clamp(Number(binding.persistence) || 0.25, 0.0, 1.0);
    const zeroFit = 1 / (1 + residual * 120);
    next.arrays.tokens[j] = cx;
    next.arrays.tokens[j + 1] = cy;
    next.arrays.tokens[j + 2] = phase;
    next.arrays.tokens[j + 3] = binding.support;
    next.arrays.meta[j] = residual;
    next.arrays.meta[j + 1] = closure;
    next.arrays.meta[j + 2] = winding;
    next.arrays.meta[j + 3] = persistence;
    supportSum += binding.support;
    zeroFitSum += zeroFit;
    if (binding.source === 'resident-signal-token') tokenBindingCount += 1;
    else frontierBindingCount += 1;
    if (binding.source === 'cold') coldBindingCount += 1;
  }

  const metrics = manifest?.metrics || {};
  const fullness = clamp(Number(metrics.fullness ?? residentSignalFullness) || 0, 0, 1);
  const manifestZeroFit = Number.isFinite(Number(metrics.zeroFit)) ? clamp(Number(metrics.zeroFit), 0, 1) : clamp(zeroFitSum / combined.length, 0, 1);
  const coverage = clamp(combined.length / COMPILED_ZERO_SUM_TOKEN_CAP, 0, 1);
  const supportMean = clamp(supportSum / combined.length, 0, 1);
  const frontierSupport = clamp(frontierBindingCount / COMPILED_ZERO_SUM_TOKEN_CAP, 0, 1);
  next.active = true;
  next.source = source + '+frontier-bindings';
  next.compiledAt = new Date().toISOString();
  next.compiledTick = tick;
  next.tokenCount = combined.length;
  next.sourceTokenCount = tokens.length + frontierBindings.length;
  next.tokenBindingCount = tokenBindingCount;
  next.frontierBindingCount = frontierBindingCount;
  next.coldBindingCount = coldBindingCount;
  next.gain = 0.00010 * (0.40 + 1.15 * fullness) * (0.58 + 0.42 * coverage) * (0.55 + 0.45 * supportMean) * (0.70 + 0.30 * manifestZeroFit) * (0.92 + 0.08 * frontierSupport);
  next.coverage = Number(coverage.toFixed(4));
  next.supportMean = Number(supportMean.toFixed(4));
  next.fullness = Number(fullness.toFixed(4));
  next.zeroFit = Number(manifestZeroFit.toFixed(4));
  next.summary = 'compiled zero-sum v0.2 · ' + combined.length + '/' + next.sourceTokenCount + ' bindings · live ' + tokenBindingCount + ' · frontier ' + frontierBindingCount + ' · cold ' + coldBindingCount + ' · gain ' + next.gain.toExponential(3);
  compiledZeroSumLayer = next;
  return compiledZeroSumLayer;
}

function makePhaseLawMacroStack(axisPhase = 0, amplitude = 0) {
  return PHASE_LAW_DENSITY_MACRO_NAMES.map((name, index) => ({
    index,
    name,
    axisPhase: Number((axisPhase + (index / PHASE_LAW_MACRO_COUNT) * TAU).toFixed(6)),
    amplitude: Number(Math.max(0, amplitude).toExponential(4)),
    phaseOffset: Number(((index / PHASE_LAW_MACRO_COUNT) * TAU).toFixed(6)),
    envelopeMode: index % 4,
    lastAttemptTick: null,
    lastResult: 'untried'
  }));
}
function makeEmptyPhaseLawState() {
  return {
    schema: ZERO_PHASE_LAW_SCHEMA,
    createdAt: new Date().toISOString(),
    axisPhase: 0,
    amplitudeMean: 0,
    amplitudeSpread: 0,
    residual: 1,
    closure: 0,
    phaseSpread: 1,
    scans: 0,
    lastRefinedTick: 0,
    lastRefinedSimTime: 0,
    macroStack: makePhaseLawMacroStack(),
    recentAttempts: [],
    eventActive: false,
    eventMacroIndex: -1,
    eventAttempt: 0,
    eventStartedTick: 0,
    eventStartedPerf: 0,
    birthReadback: false,
    lastMessage: 'empty 12-density macro stack · waiting for Resident Signal fullness'
  };
}
function resetResidentSignalState({ keepSeed = false } = {}) {
  residentSignalFullness = 0.0;
  residentSignalLastScanTick = 0;
  residentSignalLastScanTime = 0;
  residentSignalLastFullScanTick = -Infinity;
  residentSignalLastFullScanTime = -Infinity;
  residentSignalScanSerial = 0;
  residentSignalStableScans = 0;
  residentSignalLexicon = new Map();
  if (!keepSeed) {
    residentSignalEpoch = 0;
  }
  residentSignalManifest = makeEmptyResidentSignalManifest();
  compiledZeroSumLayer = makeEmptyCompiledZeroSumLayer();
  if (memoryBanks) {
    memoryBanks.hot.records = [];
    memoryBanks.warm.records = [];
    memoryBanks.failed.records = [];
    refreshMemoryBankInfluence();
  }
  residentSignalManifest.epoch = residentSignalEpoch;
  residentSignalManifest.compressionPhase = 0;
  residentSignalManifest.boundStable = residentSignalStableScans;
}

function makeEmptySyntaxColdBank() {
  return {
    schema: COLD_MEMORY_SCHEMA,
    createdAt: new Date().toISOString(),
    importedAt: null,
    distilledOnly: false,
    worlds: [],
    protectedSyntheses: [],
    activeSynthesis: null,
    liveSequence: 0,
    liveAssimilations: 0,
    note: 'Cold Memory stores read-only syntax evidence. It never loads old matrix worlds into the live simulation. Synthesis files are distilled syntax, not ordinary world-cards. Legacy invariant: synthesis loaded as distilled syntax only. Many synthesis files stack as protected distilled syntax; autonomy may merge but not overwrite them.'
  };
}
function makeEmptyColdBankSynthesis() {
  return {
    schema: SYNTHESIS_SYNTAX_SCHEMA,
    createdAt: new Date().toISOString(),
    sourceWorldCount: 0,
    regimes: [],
    dictionary: {},
    sumLayerClasses: { one: {}, two: {}, three: {} },
    plateauClasses: {},
    crossWorldRelations: [],
    hiddenAxes: [],
    marriages: [],
    tensions: [],
    compression: {
      coldBankZeroFit: 0,
      coldBankClosure: 0,
      syntaxDiversity: 0,
      sumSyntaxFullness: 0,
      synthesisFullness: 0,
      coldBankTension: 0,
      axisPhase: 0,
      plateauPressure: 0,
      tokenPressure: 0,
      oneSumPressure: 0,
      twoSumPressure: 0,
      threeSumPressure: 0,
      marriagePressure: 0
    },
    note: 'Compressed synthesis syntax: many imported worlds folded into one read-only zero-language object.'
  };
}
function quantizeStateValue(v) {
  return Math.round(v * 4096) / 4096;
}
function stateTupleHash(tuple) {
  return 'plateau_' + hash32(tuple.map(v => Math.floor((v + 2) * 4096))).toString(16).padStart(8, '0');
}
function phaseFromStateTuple(tuple) {
  return Math.atan2(tuple[1] - tuple[3], tuple[0] - tuple[2] + 1e-12);
}
function regimeNameFrom(obj) {
  return obj?.stepRegime?.name || obj?.stepRegimeName || obj?.regime || 'unknown-regime';
}
function regimeLabelFrom(obj) {
  return obj?.stepRegime?.label || obj?.stepRegimeLabel || regimeNameFrom(obj);
}

function makeEmptyColdBankSynthesisCache() {
  return {
    dirty: true,
    dirtyEpoch: 0,
    sourceKey: '',
    stackKey: '',
    merged: null,
    stack: null,
    lastHit: false,
    fastHits: 0,
    builds: 0,
    lastBuildTick: -Infinity,
    lastBuildTime: -Infinity,
    lastReason: 'cold-start'
  };
}
function coldBankSynthesisLightFootprint(syn) {
  if (!syn || typeof syn !== 'object') return 'none';
  const c = syn.compression || {};
  return [
    syn.schema || 'syn',
    syn.createdAt || '',
    syn.sourceWorldCount || 0,
    Object.keys(syn.dictionary || {}).length,
    Object.keys(syn.sumLayerClasses?.one || {}).length,
    Object.keys(syn.sumLayerClasses?.two || {}).length,
    Object.keys(syn.sumLayerClasses?.three || {}).length,
    Object.keys(syn.plateauClasses || {}).length,
    Number(c.synthesisFullness || 0).toFixed(4),
    Number(c.coldBankTension || 0).toFixed(4),
    Number(c.axisPhase || 0).toFixed(5)
  ].join(':');
}
function coldBankWorldStackKey(includeCurrent = false) {
  const worlds = Array.isArray(syntaxColdBank?.worlds) ? syntaxColdBank.worlds : [];
  const first = worlds[0]?.worldId || '';
  const last = worlds[worlds.length - 1]?.worldId || '';
  const mid = worlds.length > 2 ? worlds[Math.floor(worlds.length / 2)]?.worldId || '' : '';
  const live = includeCurrent && residentSignalManifest?.schema === ZERO_SYNTAX_SCHEMA
    ? [residentSignalManifest.tick || 0, residentSignalEpoch || 0, residentSignalManifest.tokens?.length || 0, residentSignalManifest.relations?.length || 0, residentSignalManifest.sumLayers?.two?.addresses?.length || 0, residentSignalManifest.sumLayers?.three?.addresses?.length || 0].join('/')
    : 'cold';
  return [worlds.length, first, mid, last, Number(syntaxColdBank?.liveSequence || 0), Number(syntaxColdBank?.liveAssimilations || 0), live].join('|');
}
function coldBankSourceStackKey(includeCurrent = false) {
  const protectedItems = Array.isArray(syntaxColdBank?.protectedSyntheses) ? syntaxColdBank.protectedSyntheses : [];
  const protectedKey = protectedItems.map(item => item?.protectedKey || coldBankSynthesisLightFootprint(item)).join(',');
  return [
    coldBankWorldStackKey(includeCurrent),
    protectedItems.length,
    protectedKey,
    syntaxColdBank?.distilledOnly ? 'distilled' : 'stack',
    syntaxColdBank?.activeSynthesis && !(syntaxColdBank.worlds?.length || protectedItems.length) ? coldBankSynthesisLightFootprint(syntaxColdBank.activeSynthesis) : ''
  ].join('||');
}
function markColdBankSynthesisDirty(reason = 'coldBank-change') {
  if (!coldBankSynthesisCache || typeof coldBankSynthesisCache !== 'object') coldBankSynthesisCache = makeEmptyColdBankSynthesisCache();
  coldBankSynthesisCache.dirty = true;
  coldBankSynthesisCache.dirtyEpoch += 1;
  coldBankSynthesisCache.lastReason = reason;
}

function compactToken(t) {
  const phase = Number.isFinite(t.phase) ? t.phase : 0;
  const zeroResidual = Number.isFinite(t.zeroResidual) ? Number(t.zeroResidual) : 0;
  const closure = Number.isFinite(t.closure) ? Number(t.closure) : 0;
  const info = Number.isFinite(t.info) ? Number(t.info) : 0;
  return {
    token: String(t.token || (t.mode || 'z') + '_' + String(t.hash || 'unknown').slice(-4)),
    hash: String(t.hash || ('zsig_' + hash32([phase, zeroResidual, closure, info]).toString(16).padStart(8, '0'))),
    role: String(t.role || 'residue_word'),
    mode: String(t.mode || 'iota'),
    center: Array.isArray(t.center) ? [Number(t.center[0]) || 0, Number(t.center[1]) || 0] : [0, 0],
    phase: Number(phase.toFixed ? phase.toFixed(5) : phase),
    zeroResidual: Number(zeroResidual.toExponential ? zeroResidual.toExponential(3) : zeroResidual),
    closure: Number(closure.toFixed ? closure.toFixed(4) : closure),
    winding: Number.isFinite(t.winding) ? Number(Number(t.winding).toFixed(4)) : 0,
    info: Number(info.toFixed ? info.toFixed(4) : info),
    persistence: Number.isFinite(t.persistence) ? Number(t.persistence) : 1,
    count: Number.isFinite(t.count) ? Number(t.count) : 1
  };
}
function compactRelation(r) {
  return {
    from: String(r.from || ''),
    to: String(r.to || ''),
    relation: String(r.relation || 'phase_route'),
    phaseDelta: Number.isFinite(r.phaseDelta) ? Number(Number(r.phaseDelta).toFixed(5)) : 0,
    distance: Number.isFinite(r.distance) ? Number(Number(r.distance).toFixed(5)) : 0,
    wrap: String(r.wrap || 'unknown'),
    support: Number.isFinite(r.support) ? Number(Number(r.support).toFixed(5)) : 0
  };
}
function hashString32(text) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
function makeEmptySumLayers(tokens = []) {
  return {
    zero: { tokens: Array.isArray(tokens) ? tokens.map(compactToken).slice(0, RESIDENT_SIGNAL_MAX_TOKENS) : [] },
    one: { addresses: [], axes: [], classes: [] },
    two: { addresses: [], axes: [], classes: [] },
    three: { addresses: [], axes: [], classes: [] }
  };
}
function phaseBin(phase, bins = 24) {
  return ((Math.floor((((phase % TAU) + TAU) % TAU) / TAU * bins) % bins) + bins) % bins;
}
function addToPhaseBins(map, token, bins = 24) {
  const key = phaseBin(Number(token.phase || 0), bins);
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(token);
}
function phaseBinCandidates(map, phase, bins = 24) {
  const center = phaseBin(phase, bins);
  const out = [];
  for (const d of [-1, 0, 1]) {
    const key = (center + d + bins) % bins;
    if (map.has(key)) out.push(...map.get(key));
  }
  return out;
}
function addressWrapForMembers(members) {
  let wrapX = false;
  let wrapY = false;
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      wrapX = wrapX || Math.abs(Number(members[j].center?.[0] || 0) - Number(members[i].center?.[0] || 0)) > 0.5;
      wrapY = wrapY || Math.abs(Number(members[j].center?.[1] || 0) - Number(members[i].center?.[1] || 0)) > 0.5;
    }
  }
  if (wrapX && wrapY) return 'torus_xy';
  if (wrapX) return 'torus_x';
  if (wrapY) return 'torus_y';
  return 'local';
}
function classifyTwoSumAddress(score, phaseComplement, windingBalance, distanceFit) {
  if (phaseComplement > 0.82 && windingBalance > 0.72) return { relation: 'counterwound_pair', role: 'mirror_gate' };
  if (distanceFit > 0.62 && score > 0.68) return { relation: 'phase_lock_pair', role: 'root_walkway_segment' };
  if (phaseComplement > 0.72) return { relation: 'cancel_pair', role: 'balanced_bridge' };
  return { relation: 'sum_pair', role: 'wrap_pair' };
}
function classifyThreeSumAddress(score, phaseClosure, geometryFit, chirality) {
  if (phaseClosure > 0.72 && geometryFit > 0.34) return { relation: 'closed_phase_triangle', role: 'junction_clause' };
  if (score > 0.68) return { relation: 'braid_completion', role: chirality === 'ccw' ? 'ccw_braid' : 'cw_braid' };
  return { relation: 'triad_relock', role: 'tri_gate' };
}
function buildSumAxes(addresses, kind) {
  const groups = new Map();
  for (const a of addresses) {
    const key = a.relation || a.role || kind;
    let g = groups.get(key);
    if (!g) g = { kind, axis: key, count: 0, score: 0, phaseX: 0, phaseY: 0 };
    const phase = Number.isFinite(a.axisPhase) ? a.axisPhase : Number(a.phaseDelta || a.phaseCycle || 0);
    const score = Number(a.packingScore || 0);
    g.count++;
    g.score += score;
    g.phaseX += Math.cos(phase) * (0.25 + score);
    g.phaseY += Math.sin(phase) * (0.25 + score);
    groups.set(key, g);
  }
  return Array.from(groups.values())
    .sort((a, b) => (b.count * b.score) - (a.count * a.score))
    .slice(0, 8)
    .map(g => ({
      kind,
      axis: g.axis,
      count: g.count,
      phase: Number(Math.atan2(g.phaseY, g.phaseX).toFixed(5)),
      support: Number((g.score / Math.max(1, g.count)).toFixed(4))
    }));
}
function buildSumClasses(addresses, kind) {
  const groups = new Map();
  for (const a of addresses) {
    const key = (a.relation || kind) + '|' + (a.role || 'address');
    let g = groups.get(key);
    if (!g) g = { kind, relation: a.relation || kind, role: a.role || 'address', count: 0, score: 0, residual: 0 };
    g.count++;
    g.score += Number(a.packingScore || 0);
    g.residual += Number(a.combinedResidual || 0);
    groups.set(key, g);
  }
  return Array.from(groups.values())
    .sort((a, b) => (b.count * b.score) - (a.count * a.score))
    .slice(0, 10)
    .map(g => ({
      kind,
      relation: g.relation,
      role: g.role,
      count: g.count,
      packingMean: Number((g.score / Math.max(1, g.count)).toFixed(4)),
      residualMean: Number((g.residual / Math.max(1, g.count)).toExponential(3))
    }));
}
function classifyOneSumAddress(token) {
  const closure = clamp(Number(token?.closure || 0), 0, 1);
  const winding = clamp(Number(token?.winding || 0), 0, 1);
  const info = clamp(Number(token?.info || 0), 0, 1);
  if (closure > 0.72 && winding > 0.42) return { relation: 'self_closed_vector', role: 'one_sum_portal_key' };
  if (info > 0.68) return { relation: 'single_phase_anchor', role: 'one_sum_axis' };
  return { relation: 'self_phase_vector', role: 'one_sum_token' };
}
function buildOneSumAddresses(tokens) {
  const nodes = (Array.isArray(tokens) ? tokens : [])
    .slice(0, SUM_LAYER_TOKEN_LIMIT)
    .sort((a, b) => ((b.persistence || 1) * (b.info || 0) * (0.5 + b.closure || 0.5)) - ((a.persistence || 1) * (a.info || 0) * (0.5 + a.closure || 0.5)));
  const addresses = [];
  const seen = new Set();
  for (const token of nodes) {
    if (!token?.hash || seen.has(token.hash)) continue;
    seen.add(token.hash);
    const cls = classifyOneSumAddress(token);
    const closure = clamp(Number(token.closure || 0), 0, 1);
    const info = clamp(Number(token.info || 0), 0, 1);
    const residualFit = 1 / (1 + (Number(token.zeroResidual || 0)) * 90);
    const persistence = clamp(Math.log2(1 + Math.max(1, Number(token.persistence || 1))) / 4, 0.25, 1);
    const packingScore = clamp(0.34 * info + 0.26 * closure + 0.22 * residualFit + 0.18 * persistence, 0, 1);
    if (packingScore < 0.22) continue;
    const phase = Number(token.phase || 0);
    const hash = 'onesig_' + hashString32(['one', token.hash, cls.relation, Math.round(phase * 1000)].join('|')).toString(16).padStart(8, '0');
    addresses.push({
      kind: 'one_sum',
      hash,
      members: [token.hash],
      relation: cls.relation,
      role: cls.role,
      token,
      center: token.center,
      axisPhase: Number(phase.toFixed(5)),
      phase: Number(phase.toFixed(5)),
      combinedResidual: Number((Number(token.zeroResidual || 0)).toExponential(3)),
      packingScore: Number(packingScore.toFixed(4)),
      wrap: 'local',
      support: Number((packingScore * persistence).toFixed(4))
    });
  }
  return addresses.sort((a, b) => b.packingScore - a.packingScore).slice(0, ONE_SUM_MAX_ADDRESSES);
}
function buildLatentTwoSumAddresses(tokens, minCount = 12) {
  const nodes = (Array.isArray(tokens) ? tokens : [])
    .slice(0, Math.min(40, SUM_LAYER_TOKEN_LIMIT))
    .sort((a, b) => ((b.persistence || 1) * (b.info || 0) * (0.5 + Number(b.closure || 0))) - ((a.persistence || 1) * (a.info || 0) * (0.5 + Number(a.closure || 0))));
  const addresses = [];
  const seen = new Set();
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      if (!a?.hash || !b?.hash || a.hash === b.hash) continue;
      const members = [a.hash, b.hash].sort();
      const seenKey = members.join('|');
      if (seen.has(seenKey)) continue;
      seen.add(seenKey);
      const pd = phaseDelta(Number(b.phase || 0), Number(a.phase || 0));
      const antiPhase = 0.5 + 0.5 * Math.cos(phaseDelta(Number(b.phase || 0), Number(a.phase || 0) + Math.PI));
      const resonance = 0.5 + 0.5 * Math.cos(pd);
      const residualFit = 1 / (1 + (Number(a.zeroResidual || 0) + Number(b.zeroResidual || 0)) * 65);
      const closureMean = clamp((Number(a.closure || 0) + Number(b.closure || 0)) * 0.5, 0, 1);
      const infoMean = clamp((Number(a.info || 0) + Number(b.info || 0)) * 0.5, 0, 1);
      const dx = torusDelta(Number(a.center?.[0] || 0), Number(b.center?.[0] || 0));
      const dy = torusDelta(Number(a.center?.[1] || 0), Number(b.center?.[1] || 0));
      const distanceFit = 1 - Math.min(1, Math.hypot(dx, dy) * 1.35);
      const packingScore = clamp(0.24 * antiPhase + 0.14 * resonance + 0.22 * residualFit + 0.18 * closureMean + 0.12 * infoMean + 0.10 * distanceFit, 0, 1);
      if (packingScore < 0.31) continue;
      const relation = antiPhase > 0.66 ? 'latent_counterpair' : resonance > 0.70 ? 'latent_parallel_pair' : 'latent_bridge_pair';
      const role = antiPhase > 0.66 ? 'counterfold_bridge' : 'two_sum_scaffold';
      const axisPhase = Math.atan2(Math.sin(Number(a.phase || 0)) + Math.sin(Number(b.phase || 0)), Math.cos(Number(a.phase || 0)) + Math.cos(Number(b.phase || 0)));
      const hash = 'twosig_' + hashString32(['latent-two', members.join(','), relation, Math.round(axisPhase * 1000)].join('|')).toString(16).padStart(8, '0');
      addresses.push({
        kind: 'two_sum',
        hash,
        members,
        relation,
        role,
        phaseDelta: Number(pd.toFixed(5)),
        axisPhase: Number(axisPhase.toFixed(5)),
        combinedResidual: Number(((Number(a.zeroResidual || 0) + Number(b.zeroResidual || 0)) * 0.5).toExponential(3)),
        packingScore: Number(packingScore.toFixed(4)),
        wrap: addressWrapForMembers([a, b]),
        support: Number((packingScore * Math.min(Number(a.persistence || 1), Number(b.persistence || 1))).toFixed(4))
      });
    }
  }
  return addresses.sort((a, b) => b.packingScore - a.packingScore).slice(0, Math.min(TWO_SUM_MAX_ADDRESSES, Math.max(minCount, addresses.length)));
}
function buildLatentThreeSumAddresses(tokens, minCount = 8) {
  const nodes = (Array.isArray(tokens) ? tokens : [])
    .slice(0, Math.min(30, SUM_LAYER_TOKEN_LIMIT))
    .sort((a, b) => ((b.persistence || 1) * (b.info || 0) * (0.5 + Number(b.closure || 0))) - ((a.persistence || 1) * (a.info || 0) * (0.5 + Number(a.closure || 0))));
  const addresses = [];
  const seen = new Set();
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      for (let k = j + 1; k < nodes.length; k++) {
        const a = nodes[i];
        const b = nodes[j];
        const c = nodes[k];
        if (!a?.hash || !b?.hash || !c?.hash) continue;
        const memberHashes = [a.hash, b.hash, c.hash].sort();
        const seenKey = memberHashes.join('|');
        if (seen.has(seenKey)) continue;
        seen.add(seenKey);
        const phaseVector = Math.hypot(
          Math.cos(Number(a.phase || 0)) + Math.cos(Number(b.phase || 0)) + Math.cos(Number(c.phase || 0)),
          Math.sin(Number(a.phase || 0)) + Math.sin(Number(b.phase || 0)) + Math.sin(Number(c.phase || 0))
        ) / 3;
        const phaseClosure = 1 - clamp(phaseVector, 0, 1);
        const residualFit = 1 / (1 + (Number(a.zeroResidual || 0) + Number(b.zeroResidual || 0) + Number(c.zeroResidual || 0)) * 55);
        const closureMean = clamp((Number(a.closure || 0) + Number(b.closure || 0) + Number(c.closure || 0)) / 3, 0, 1);
        const infoMean = clamp((Number(a.info || 0) + Number(b.info || 0) + Number(c.info || 0)) / 3, 0, 1);
        const ax = torusDelta(a.center?.[0] || 0, b.center?.[0] || 0);
        const ay = torusDelta(a.center?.[1] || 0, b.center?.[1] || 0);
        const bx = torusDelta(a.center?.[0] || 0, c.center?.[0] || 0);
        const by = torusDelta(a.center?.[1] || 0, c.center?.[1] || 0);
        const signedArea = ax * by - ay * bx;
        const geometryFit = clamp(Math.abs(signedArea) * 6.0, 0, 1);
        const packingScore = clamp(0.22 * phaseClosure + 0.24 * residualFit + 0.18 * closureMean + 0.16 * geometryFit + 0.20 * infoMean, 0, 1);
        if (packingScore < 0.29) continue;
        const chirality = signedArea >= 0 ? 'ccw' : 'cw';
        const relation = phaseClosure > 0.55 ? 'latent_phase_triangle' : 'latent_tri_bridge';
        const role = phaseClosure > 0.55 ? 'triadic_fold_lock' : 'three_sum_scaffold';
        const phaseCycle = Math.abs(phaseDelta(Number(b.phase || 0), Number(a.phase || 0))) + Math.abs(phaseDelta(Number(c.phase || 0), Number(b.phase || 0))) + Math.abs(phaseDelta(Number(a.phase || 0), Number(c.phase || 0)));
        const axisPhase = Math.atan2(
          Math.sin(Number(a.phase || 0)) + Math.sin(Number(b.phase || 0)) + Math.sin(Number(c.phase || 0)),
          Math.cos(Number(a.phase || 0)) + Math.cos(Number(b.phase || 0)) + Math.cos(Number(c.phase || 0))
        );
        const hash = 'threesig_' + hashString32(['latent-three', memberHashes.join(','), relation, chirality, Math.round(axisPhase * 1000)].join('|')).toString(16).padStart(8, '0');
        addresses.push({
          kind: 'three_sum',
          hash,
          members: memberHashes,
          relation,
          role,
          phaseCycle: Number(phaseCycle.toFixed(5)),
          axisPhase: Number(axisPhase.toFixed(5)),
          combinedResidual: Number(((Number(a.zeroResidual || 0) + Number(b.zeroResidual || 0) + Number(c.zeroResidual || 0)) / 3).toExponential(3)),
          packingScore: Number(packingScore.toFixed(4)),
          chirality,
          wrap: addressWrapForMembers([a, b, c]),
          support: Number((packingScore * Math.min(Number(a.persistence || 1), Number(b.persistence || 1), Number(c.persistence || 1))).toFixed(4))
        });
      }
    }
  }
  return addresses.sort((a, b) => b.packingScore - a.packingScore).slice(0, Math.min(THREE_SUM_MAX_ADDRESSES, Math.max(minCount, addresses.length)));
}

function buildTwoSumAddresses(tokens) {
  const nodes = tokens
    .slice(0, SUM_LAYER_TOKEN_LIMIT)
    .sort((a, b) => ((b.persistence || 1) * (b.info || 0)) - ((a.persistence || 1) * (a.info || 0)));
  const bins = new Map();
  for (const token of nodes) addToPhaseBins(bins, token);
  const addresses = [];
  const seen = new Set();
  for (const a of nodes) {
    for (const b of phaseBinCandidates(bins, Number(a.phase || 0) + Math.PI)) {
      if (!b || a.hash === b.hash) continue;
      const members = [a.hash, b.hash].sort();
      const seenKey = members.join('|');
      if (seen.has(seenKey)) continue;
      seen.add(seenKey);
      const dx = torusDelta(Number(a.center?.[0] || 0), Number(b.center?.[0] || 0));
      const dy = torusDelta(Number(a.center?.[1] || 0), Number(b.center?.[1] || 0));
      const dist = Math.hypot(dx, dy);
      const pd = phaseDelta(Number(b.phase || 0), Number(a.phase || 0));
      const phaseComplement = 0.5 + 0.5 * Math.cos(phaseDelta(Number(b.phase || 0), Number(a.phase || 0) + Math.PI));
      const residualFit = 1 / (1 + (Number(a.zeroResidual || 0) + Number(b.zeroResidual || 0)) * 80);
      const closureMean = clamp((Number(a.closure || 0) + Number(b.closure || 0)) * 0.5, 0, 1);
      const windingBalance = 1 / (1 + Math.abs(Number(a.winding || 0) - Number(b.winding || 0)) * 0.85);
      const distanceFit = 1 - Math.min(1, dist * 1.85);
      const infoMean = clamp((Number(a.info || 0) + Number(b.info || 0)) * 0.5, 0, 1);
      const packingScore = clamp(0.28 * phaseComplement + 0.22 * residualFit + 0.20 * closureMean + 0.15 * windingBalance + 0.10 * distanceFit + 0.05 * infoMean, 0, 1);
      if (packingScore < 0.44) continue;
      const c = classifyTwoSumAddress(packingScore, phaseComplement, windingBalance, distanceFit);
      const hash = 'twosig_' + hashString32(['two', members.join(','), c.relation, Math.round(pd * 1000)].join('|')).toString(16).padStart(8, '0');
      addresses.push({
        kind: 'two_sum',
        hash,
        members,
        relation: c.relation,
        role: c.role,
        phaseDelta: Number(pd.toFixed(5)),
        axisPhase: Number(Math.atan2(Math.sin(a.phase) + Math.sin(b.phase), Math.cos(a.phase) + Math.cos(b.phase)).toFixed(5)),
        combinedResidual: Number(((Number(a.zeroResidual || 0) + Number(b.zeroResidual || 0)) * 0.5).toExponential(3)),
        packingScore: Number(packingScore.toFixed(4)),
        wrap: addressWrapForMembers([a, b]),
        support: Number((packingScore * Math.min(Number(a.persistence || 1), Number(b.persistence || 1))).toFixed(4))
      });
    }
  }
  return addresses.sort((a, b) => b.packingScore - a.packingScore).slice(0, TWO_SUM_MAX_ADDRESSES);
}
function buildThreeSumAddresses(tokens) {
  const nodes = tokens
    .slice(0, Math.min(24, SUM_LAYER_TOKEN_LIMIT))
    .sort((a, b) => ((b.persistence || 1) * (b.info || 0)) - ((a.persistence || 1) * (a.info || 0)));
  const bins = new Map();
  for (const token of nodes) addToPhaseBins(bins, token);
  const addresses = [];
  const seen = new Set();
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      const wanted = Math.atan2(-(Math.sin(a.phase) + Math.sin(b.phase)), -(Math.cos(a.phase) + Math.cos(b.phase)));
      for (const c of phaseBinCandidates(bins, wanted)) {
        if (!c || c.hash === a.hash || c.hash === b.hash) continue;
        const memberHashes = [a.hash, b.hash, c.hash].sort();
        const seenKey = memberHashes.join('|');
        if (seen.has(seenKey)) continue;
        seen.add(seenKey);
        const phaseVector = Math.hypot(
          Math.cos(a.phase) + Math.cos(b.phase) + Math.cos(c.phase),
          Math.sin(a.phase) + Math.sin(b.phase) + Math.sin(c.phase)
        ) / 3;
        const phaseClosure = 1 - clamp(phaseVector, 0, 1);
        const residualFit = 1 / (1 + (Number(a.zeroResidual || 0) + Number(b.zeroResidual || 0) + Number(c.zeroResidual || 0)) * 70);
        const closureMean = clamp((Number(a.closure || 0) + Number(b.closure || 0) + Number(c.closure || 0)) / 3, 0, 1);
        const ax = torusDelta(a.center[0], b.center[0]);
        const ay = torusDelta(a.center[1], b.center[1]);
        const bx = torusDelta(a.center[0], c.center[0]);
        const by = torusDelta(a.center[1], c.center[1]);
        const signedArea = ax * by - ay * bx;
        const geometryFit = clamp(Math.abs(signedArea) * 8.0, 0, 1);
        const infoMean = clamp((Number(a.info || 0) + Number(b.info || 0) + Number(c.info || 0)) / 3, 0, 1);
        const packingScore = clamp(0.30 * phaseClosure + 0.22 * residualFit + 0.20 * closureMean + 0.16 * geometryFit + 0.12 * infoMean, 0, 1);
        if (packingScore < 0.46) continue;
        const chirality = signedArea >= 0 ? 'ccw' : 'cw';
        const cls = classifyThreeSumAddress(packingScore, phaseClosure, geometryFit, chirality);
        const phaseCycle = Math.abs(phaseDelta(b.phase, a.phase)) + Math.abs(phaseDelta(c.phase, b.phase)) + Math.abs(phaseDelta(a.phase, c.phase));
        const hash = 'threesig_' + hashString32(['three', memberHashes.join(','), cls.relation, chirality, Math.round(phaseCycle * 1000)].join('|')).toString(16).padStart(8, '0');
        addresses.push({
          kind: 'three_sum',
          hash,
          members: memberHashes,
          relation: cls.relation,
          role: cls.role,
          phaseCycle: Number(phaseCycle.toFixed(5)),
          axisPhase: Number(wanted.toFixed(5)),
          combinedResidual: Number(((Number(a.zeroResidual || 0) + Number(b.zeroResidual || 0) + Number(c.zeroResidual || 0)) / 3).toExponential(3)),
          packingScore: Number(packingScore.toFixed(4)),
          chirality,
          wrap: addressWrapForMembers([a, b, c]),
          support: Number((packingScore * Math.min(Number(a.persistence || 1), Number(b.persistence || 1), Number(c.persistence || 1))).toFixed(4))
        });
      }
    }
  }
  return addresses.sort((a, b) => b.packingScore - a.packingScore).slice(0, THREE_SUM_MAX_ADDRESSES);
}
function compactOneSumAddress(address) {
  const token = address?.token ? compactToken(address.token) : compactToken(address || {});
  const phase = Number.isFinite(address?.axisPhase) ? Number(address.axisPhase) : Number(token.phase || 0);
  const packingScore = clamp(Number(address?.packingScore ?? address?.support ?? token.info ?? 0.35) || 0, 0, 1);
  return {
    kind: 'one_sum',
    hash: String(address?.hash || ('onesig_' + hashString32(['one', token.hash, token.role, Math.round(phase * 1000)].join('|')).toString(16).padStart(8, '0'))),
    members: Array.isArray(address?.members) && address.members.length ? address.members.map(String).slice(0, 1) : [token.hash],
    relation: String(address?.relation || 'self_phase_vector'),
    role: String(address?.role || token.role || 'single_token_address'),
    token,
    center: Array.isArray(address?.center) ? [wrap01(Number(address.center[0]) || 0), wrap01(Number(address.center[1]) || 0)] : token.center,
    axisPhase: Number(phase.toFixed(5)),
    phase: Number(phase.toFixed(5)),
    combinedResidual: Number.isFinite(address?.combinedResidual) ? Number(Number(address.combinedResidual).toExponential(3)) : Number((Number(token.zeroResidual || 0)).toExponential(3)),
    packingScore: Number(packingScore.toFixed(4)),
    wrap: String(address?.wrap || 'local'),
    support: Number(clamp(Number(address?.support ?? packingScore) || 0, 0, 1).toFixed(4))
  };
}
function compactSumLayerAddress(kind, address) {
  const normalizedKind = kind === 'one' || address?.kind === 'one_sum'
    ? 'one_sum'
    : kind === 'three' || address?.kind === 'three_sum'
      ? 'three_sum'
      : 'two_sum';
  if (normalizedKind === 'one_sum') return compactOneSumAddress(address);
  const members = Array.isArray(address?.members) ? address.members.map(String).slice(0, normalizedKind === 'three_sum' ? 3 : 2) : [];
  const relation = String(address?.relation || (normalizedKind === 'three_sum' ? 'triad_relock' : 'sum_pair'));
  const role = String(address?.role || (normalizedKind === 'three_sum' ? 'tri_gate' : 'balanced_bridge'));
  const phaseDeltaValue = Number(address?.phaseDelta || 0);
  const phaseCycleValue = Number(address?.phaseCycle || 0);
  return {
    kind: normalizedKind,
    hash: String(address?.hash || ((normalizedKind === 'three_sum' ? 'threesig_' : 'twosig_') + hashString32([normalizedKind, members.join(','), relation, role].join('|')).toString(16).padStart(8, '0'))),
    members,
    relation,
    role,
    ...(normalizedKind === 'three_sum'
      ? { phaseCycle: Number(Number(phaseCycleValue).toFixed(5)) }
      : { phaseDelta: Number(Number(phaseDeltaValue).toFixed(5)) }),
    axisPhase: Number.isFinite(address?.axisPhase) ? Number(Number(address.axisPhase).toFixed(5)) : 0,
    combinedResidual: Number.isFinite(address?.combinedResidual) ? Number(Number(address.combinedResidual).toExponential(3)) : 0,
    packingScore: Number.isFinite(address?.packingScore) ? Number(Number(address.packingScore).toFixed(4)) : 0,
    wrap: String(address?.wrap || 'local'),
    ...(normalizedKind === 'three_sum' ? { chirality: String(address?.chirality || 'neutral') } : {}),
    support: Number.isFinite(address?.support) ? Number(Number(address.support).toFixed(4)) : 0
  };
}
function normalizeSumLayers(sumLayers, tokens = []) {
  const zeroTokens = Array.isArray(sumLayers?.zero?.tokens)
    ? sumLayers.zero.tokens.map(compactToken).slice(0, RESIDENT_SIGNAL_MAX_TOKENS)
    : Array.isArray(tokens) ? tokens.map(compactToken).slice(0, RESIDENT_SIGNAL_MAX_TOKENS) : [];
  const oneAddresses = Array.isArray(sumLayers?.one?.addresses)
    ? sumLayers.one.addresses.map(a => compactSumLayerAddress('one', a)).slice(0, 256)
    : buildOneSumAddresses(zeroTokens);
  let twoAddresses = Array.isArray(sumLayers?.two?.addresses)
    ? sumLayers.two.addresses.map(a => compactSumLayerAddress('two', a)).slice(0, 256)
    : buildTwoSumAddresses(zeroTokens);
  let threeAddresses = Array.isArray(sumLayers?.three?.addresses)
    ? sumLayers.three.addresses.map(a => compactSumLayerAddress('three', a)).slice(0, 192)
    : buildThreeSumAddresses(zeroTokens);
  if (zeroTokens.length >= 2 && twoAddresses.length < 4) twoAddresses = mergeSumAddressLists('two', twoAddresses, buildLatentTwoSumAddresses(zeroTokens), TWO_SUM_MAX_ADDRESSES);
  if (zeroTokens.length >= 3 && threeAddresses.length < 3) threeAddresses = mergeSumAddressLists('three', threeAddresses, buildLatentThreeSumAddresses(zeroTokens), THREE_SUM_MAX_ADDRESSES);
  return {
    zero: { tokens: zeroTokens },
    one: {
      addresses: oneAddresses,
      axes: Array.isArray(sumLayers?.one?.axes) ? sumLayers.one.axes.slice(0, 24) : buildSumAxes(oneAddresses, 'one'),
      classes: Array.isArray(sumLayers?.one?.classes) ? sumLayers.one.classes.slice(0, 24) : buildSumClasses(oneAddresses, 'one')
    },
    two: {
      addresses: twoAddresses,
      axes: Array.isArray(sumLayers?.two?.axes) ? sumLayers.two.axes.slice(0, 24) : buildSumAxes(twoAddresses, 'two'),
      classes: Array.isArray(sumLayers?.two?.classes) ? sumLayers.two.classes.slice(0, 24) : buildSumClasses(twoAddresses, 'two')
    },
    three: {
      addresses: threeAddresses,
      axes: Array.isArray(sumLayers?.three?.axes) ? sumLayers.three.axes.slice(0, 24) : buildSumAxes(threeAddresses, 'three'),
      classes: Array.isArray(sumLayers?.three?.classes) ? sumLayers.three.classes.slice(0, 24) : buildSumClasses(threeAddresses, 'three')
    }
  };
}
function mergeSumAddressLists(kind, primary, fallback, cap) {
  const map = new Map();
  for (const raw of [...(primary || []), ...(fallback || [])]) {
    const item = compactSumLayerAddress(kind, raw);
    const key = item.hash || (item.members || []).join('|') || JSON.stringify(item).slice(0, 80);
    const prior = map.get(key);
    if (!prior || Number(item.packingScore || item.support || 0) > Number(prior.packingScore || prior.support || 0)) map.set(key, item);
  }
  return Array.from(map.values()).sort((a, b) => Number(b.packingScore || b.support || 0) - Number(a.packingScore || a.support || 0)).slice(0, cap);
}
function buildSumSyntaxLayers(tokens) {
  const zeroTokens = Array.isArray(tokens) ? tokens.map(compactToken).slice(0, RESIDENT_SIGNAL_MAX_TOKENS) : [];
  const oneAddresses = buildOneSumAddresses(zeroTokens);
  let twoAddresses = buildTwoSumAddresses(zeroTokens);
  let threeAddresses = buildThreeSumAddresses(zeroTokens);
  if (zeroTokens.length >= 2 && twoAddresses.length < 4) twoAddresses = mergeSumAddressLists('two', twoAddresses, buildLatentTwoSumAddresses(zeroTokens), TWO_SUM_MAX_ADDRESSES);
  if (zeroTokens.length >= 3 && threeAddresses.length < 3) threeAddresses = mergeSumAddressLists('three', threeAddresses, buildLatentThreeSumAddresses(zeroTokens), THREE_SUM_MAX_ADDRESSES);
  return {
    zero: { tokens: zeroTokens },
    one: {
      addresses: oneAddresses,
      axes: buildSumAxes(oneAddresses, 'one'),
      classes: buildSumClasses(oneAddresses, 'one')
    },
    two: {
      addresses: twoAddresses,
      axes: buildSumAxes(twoAddresses, 'two'),
      classes: buildSumClasses(twoAddresses, 'two')
    },
    three: {
      addresses: threeAddresses,
      axes: buildSumAxes(threeAddresses, 'three'),
      classes: buildSumClasses(threeAddresses, 'three')
    }
  };
}
function summarizeSumLayers(sumLayers) {
  const zeroCount = sumLayers?.zero?.tokens?.length || 0;
  const one = sumLayers?.one?.addresses || [];
  const two = sumLayers?.two?.addresses || [];
  const three = sumLayers?.three?.addresses || [];
  const oneMean = one.reduce((n, a) => n + Number(a.packingScore || 0), 0) / Math.max(1, one.length);
  const twoMean = two.reduce((n, a) => n + Number(a.packingScore || 0), 0) / Math.max(1, two.length);
  const threeMean = three.reduce((n, a) => n + Number(a.packingScore || 0), 0) / Math.max(1, three.length);
  const sumSyntaxFullness = clamp(
    0.24 * clamp(zeroCount / 32, 0, 1)
    + 0.22 * clamp(one.length / 24, 0, 1) * (0.40 + 0.60 * oneMean)
    + 0.27 * clamp(two.length / 18, 0, 1) * (0.45 + 0.55 * twoMean)
    + 0.27 * clamp(three.length / 8, 0, 1) * (0.45 + 0.55 * threeMean),
    0,
    1
  );
  return {
    zeroCount,
    oneSumCount: one.length,
    twoSumCount: two.length,
    threeSumCount: three.length,
    oneSumPackingMean: Number(oneMean.toFixed(4)),
    twoSumPackingMean: Number(twoMean.toFixed(4)),
    threeSumPackingMean: Number(threeMean.toFixed(4)),
    sumSyntaxFullness: Number(sumSyntaxFullness.toFixed(4))
  };
}
function inferPlateausFromManifest(manifest) {
  const m = manifest?.metrics || {};
  const zeroFit = Number(m.zeroFit || 0);
  const closure = Number(m.closureMean || 0);
  const tokenCount = Number(m.tokenCount || 0);
  if (tokenCount > 0 || zeroFit < 0.85 || closure < 0.92) return [];
  const phase = Number(manifest?.compressionPhase || 0) * TAU;
  const hash = 'plateau_' + hash32([zeroFit, closure, Number(m.zeroResidualMean || 0), Number(m.fullness || 0), phase]).toString(16).padStart(8, '0');
  return [{
    hash,
    role: 'global_zero_lock',
    coverage: Number(clamp(0.45 + 0.45 * Number(m.fullness || 0), 0, 1).toFixed(4)),
    meanState: null,
    phase: Number(phase.toFixed(5)),
    zeroResidual: Number(Number(m.zeroResidualMean || 0).toExponential(3)),
    closure: Number(closure.toFixed(4)),
    source: 'manifest-inferred'
  }];
}
function extractPlateausFromPixels(pixels, size = MATRIX_SIZE, stride = 8, maxPlateaus = 8) {
  try {
    const scan = scanMatrix(pixels, {
      size,
      stride,
      reducers: [createPlateauReducer(maxPlateaus)]
    });
    return scan.results.plateaus || [];
  } catch (err) {
    return [];
  }
}
function extractPlateausFromSavePayload(payload, maxPlateaus = 8) {
  try {
    const saveSize = Math.max(1, Math.floor(Number(payload?.matrixSize) || 0));
    if (payload?.dataType !== 'float32-little-endian-base64' || !payload.state || !saveSize) return [];
    const bytes = base64ToBytes(payload.state);
    const expectedBytes = matrixFrameByteLength(saveSize);
    if (bytes.byteLength !== expectedBytes) return [];
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const pixels = new Float32Array(buffer);
    return extractPlateausFromPixels(pixels, saveSize, 8, maxPlateaus).map(p => ({ ...p, source: 'save-state-sampled' }));
  } catch (err) {
    return [];
  }
}
function worldIdFromPayload(payload, filename) {
  const regime = regimeNameFrom(payload?.residentSignalManifest || payload || {});
  const t = Number.isFinite(payload?.tick) ? payload.tick : Number.isFinite(payload?.residentSignalManifest?.tick) ? payload.residentSignalManifest.tick : Number.isFinite(payload?.tick) ? payload.tick : 0;
  const base = String(filename || regime || 'world').replace(/\.json$/i, '').replace(/[^a-z0-9-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 90) || 'world';
  return base + '-t' + Math.max(0, Math.floor(t));
}
function normalizeWorldCard(card) {
  return {
    worldId: String(card.worldId || ('world-' + hash32([Date.now(), Math.random()]).toString(16))),
    sourceType: String(card.sourceType || 'syntax'),
    importedAt: card.importedAt || new Date().toISOString(),
    stepRegime: card.stepRegime || { name: regimeNameFrom(card), label: regimeLabelFrom(card) },
    pinnedDescent: Boolean(card.pinnedDescent),
    residentSignal: Boolean(card.residentSignal),
    tick: Number.isFinite(card.tick) ? Math.floor(card.tick) : 0,
    simTime: Number.isFinite(card.simTime) ? Number(card.simTime) : 0,
    metrics: { ...(card.metrics || {}) },
    tokens: Array.isArray(card.tokens) ? card.tokens.map(compactToken).slice(0, 256) : [],
    relations: Array.isArray(card.relations) ? card.relations.map(compactRelation).slice(0, 256) : [],
    sumLayers: normalizeSumLayers(card.sumLayers, card.tokens || []),
    globalPlateaus: Array.isArray(card.globalPlateaus) ? card.globalPlateaus.slice(0, 32) : []
  };
}
function extractWorldCardsFromPayload(payload, filename = 'import.json') {
  if (!payload || typeof payload !== 'object') throw new Error('not a JSON object');
  const result = { cards: [], syntheses: [], synthesisLoaded: false, archiveLoaded: false };
  if (payload.schema === COLD_MEMORY_SCHEMA) {
    result.cards = Array.isArray(payload.worlds) ? payload.worlds.map(normalizeWorldCard) : [];
    if (Array.isArray(payload.protectedSyntheses)) {
      for (const syn of payload.protectedSyntheses) result.syntheses.push(normalizeSynthesis(syn));
      if (payload.protectedSyntheses.length) result.synthesisLoaded = true;
    }
    if (payload.activeSynthesis) {
      result.syntheses.push(normalizeSynthesis(payload.activeSynthesis));
      result.synthesisLoaded = true;
    }
    result.archiveLoaded = true;
    return result;
  }
  if (payload.schema === SYNTHESIS_SYNTAX_SCHEMA) {
    // Critical guardrail: a synthesis object is distilled syntax, not another
    // ordinary world-card. Treating synthesis as a world creates recursive
    // self-rhyme and between-mode drift unless explicitly enabled later.
    result.syntheses.push(normalizeSynthesis(payload));
    result.synthesisLoaded = true;
    return result;
  }
  if (payload.schema === SAVE_SCHEMA) {
    const manifest = payload.residentSignalManifest && typeof payload.residentSignalManifest === 'object' ? payload.residentSignalManifest : makeEmptyResidentSignalManifest();
    let plateaus = Array.isArray(manifest.globalPlateaus) ? manifest.globalPlateaus.slice() : [];
    const sampled = extractPlateausFromSavePayload(payload);
    plateaus = sampled.length ? sampled : plateaus.concat(inferPlateausFromManifest(manifest));
    result.cards = [normalizeWorldCard({
      worldId: worldIdFromPayload(payload, filename),
      sourceType: 'save-state-syntax-evidence',
      stepRegime: payload.stepRegime || manifest.stepRegime,
      pinnedDescent: Boolean(payload.pinnedDescent || manifest.pinnedDescent),
      residentSignal: Boolean(payload.residentSignal || manifest.residentSignal),
      tick: Number.isFinite(payload.tick) ? payload.tick : manifest.tick,
      simTime: Number.isFinite(payload.simTime) ? payload.simTime : manifest.simTime,
      metrics: manifest.metrics || {},
      tokens: manifest.tokens || [],
      relations: manifest.relations || [],
      sumLayers: manifest.sumLayers,
      globalPlateaus: plateaus
    })];
    return result;
  }
  if (payload.schema === ZERO_SYNTAX_SCHEMA || Array.isArray(payload.tokens) || payload.metrics) {
    const plateaus = Array.isArray(payload.globalPlateaus) ? payload.globalPlateaus : inferPlateausFromManifest(payload);
    result.cards = [normalizeWorldCard({
      worldId: worldIdFromPayload(payload, filename),
      sourceType: 'zero-syntax',
      stepRegime: payload.stepRegime,
      pinnedDescent: Boolean(payload.pinnedDescent),
      residentSignal: Boolean(payload.residentSignal),
      tick: payload.tick,
      simTime: payload.simTime,
      metrics: payload.metrics || {},
      tokens: payload.tokens || [],
      relations: payload.relations || [],
      sumLayers: payload.sumLayers,
      globalPlateaus: plateaus
    })];
    return result;
  }
  throw new Error('unsupported syntax/save schema');
}
function normalizeSynthesis(syn) {
  const empty = makeEmptyColdBankSynthesis();
  const compression = { ...empty.compression, ...(syn?.compression || {}) };
  return {
    ...empty,
    ...syn,
    schema: SYNTHESIS_SYNTAX_SCHEMA,
    createdAt: syn?.createdAt || new Date().toISOString(),
    sourceWorldCount: Number.isFinite(syn?.sourceWorldCount) ? syn.sourceWorldCount : 0,
    regimes: Array.isArray(syn?.regimes) ? syn.regimes : [],
    dictionary: syn?.dictionary || {},
    sumLayerClasses: {
      one: syn?.sumLayerClasses?.one || {},
      two: syn?.sumLayerClasses?.two || {},
      three: syn?.sumLayerClasses?.three || {}
    },
    plateauClasses: syn?.plateauClasses || {},
    crossWorldRelations: Array.isArray(syn?.crossWorldRelations) ? syn.crossWorldRelations : [],
    hiddenAxes: Array.isArray(syn?.hiddenAxes) ? syn.hiddenAxes : [],
    marriages: Array.isArray(syn?.marriages) ? syn.marriages : [],
    tensions: Array.isArray(syn?.tensions) ? syn.tensions : [],
    compression
  };
}
function synthesisFootprint(syn) {
  const n = normalizeSynthesis(syn);
  return [
    n.createdAt || '',
    n.sourceWorldCount || 0,
    Object.keys(n.dictionary || {}).length,
    Object.keys(n.sumLayerClasses?.one || {}).length,
    Object.keys(n.sumLayerClasses?.two || {}).length,
    Object.keys(n.sumLayerClasses?.three || {}).length,
    Object.keys(n.plateauClasses || {}).length
  ].join('|');
}
function addProtectedSynthesis(syn, source = 'imported-synthesis') {
  const normalized = { ...normalizeSynthesis(syn), protectedSource: source, protectedAt: new Date().toISOString() };
  normalized.protectedKey = synthesisFootprint(normalized);
  if (!Array.isArray(syntaxColdBank.protectedSyntheses)) syntaxColdBank.protectedSyntheses = [];
  syntaxColdBank.protectedSyntheses = syntaxColdBank.protectedSyntheses.filter(item => item?.protectedKey !== normalized.protectedKey);
  syntaxColdBank.protectedSyntheses.push(normalized);
  syntaxColdBank.protectedSyntheses = syntaxColdBank.protectedSyntheses.slice(-COLD_BANK_PROTECTED_SYNTHESIS_LIMIT);
  markColdBankSynthesisDirty('protected-synthesis-added');
  return normalized;
}
function protectedColdBankSyntheses() {
  return Array.isArray(syntaxColdBank?.protectedSyntheses) ? syntaxColdBank.protectedSyntheses.map(normalizeSynthesis) : [];
}
function mergeUniqueArrays(a = [], b = [], cap = 64) {
  const out = [];
  const seen = new Set();
  for (const item of [...a, ...b]) {
    const key = typeof item === 'string' ? item : JSON.stringify(item).slice(0, 240);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= cap) break;
  }
  return out;
}
function mergeSynthesisObjects(items) {
  const sources = (Array.isArray(items) ? items : []).filter(Boolean).map(normalizeSynthesis).filter(syn => syn.sourceWorldCount || Object.keys(syn.dictionary || {}).length || Object.keys(syn.sumLayerClasses?.one || {}).length || Object.keys(syn.sumLayerClasses?.two || {}).length || Object.keys(syn.sumLayerClasses?.three || {}).length || Object.keys(syn.plateauClasses || {}).length);
  if (!sources.length) return makeEmptyColdBankSynthesis();
  if (sources.length === 1) return normalizeSynthesis(sources[0]);
  const regimes = [];
  const dictionary = new Map();
  const sumLayerClasses = { one: new Map(), two: new Map(), three: new Map() };
  const plateauClasses = new Map();
  let sourceWorldCount = 0;
  let zeroFitWeighted = 0, closureWeighted = 0, weightTotal = 0;
  let axisX = 0, axisY = 0;
  let priorFullness = 0, priorTension = 0, priorSumFullness = 0, priorTokenPressure = 0, priorPlateauPressure = 0, priorMarriagePressure = 0;
  let priorOnePressure = 0, priorTwoPressure = 0, priorThreePressure = 0;
  let crossWorldRelations = [], hiddenAxes = [], marriages = [], tensions = [];
  for (const syn of sources) {
    const weight = Math.max(1, Number(syn.sourceWorldCount || 0), Math.log2(2 + Object.keys(syn.dictionary || {}).length));
    sourceWorldCount += Math.max(0, Number(syn.sourceWorldCount || 0));
    for (const r of syn.regimes || []) if (!regimes.includes(r)) regimes.push(r);
    const c = syn.compression || {};
    zeroFitWeighted += Number(c.coldBankZeroFit || 0) * weight;
    closureWeighted += Number(c.coldBankClosure || 0) * weight;
    weightTotal += weight;
    priorFullness = Math.max(priorFullness, Number(c.synthesisFullness || 0));
    priorTension = Math.max(priorTension, Number(c.coldBankTension || 0));
    priorSumFullness = Math.max(priorSumFullness, Number(c.sumSyntaxFullness || 0));
    priorTokenPressure = Math.max(priorTokenPressure, Number(c.tokenPressure || 0));
    priorPlateauPressure = Math.max(priorPlateauPressure, Number(c.plateauPressure || 0));
    priorMarriagePressure = Math.max(priorMarriagePressure, Number(c.marriagePressure || 0));
    priorOnePressure = Math.max(priorOnePressure, Number(c.oneSumPressure || 0));
    priorTwoPressure = Math.max(priorTwoPressure, Number(c.twoSumPressure || 0));
    priorThreePressure = Math.max(priorThreePressure, Number(c.threeSumPressure || 0));
    axisX += Math.cos(Number(c.axisPhase || 0)) * weight;
    axisY += Math.sin(Number(c.axisPhase || 0)) * weight;
    for (const [hash, token] of Object.entries(syn.dictionary || {})) {
      let d = dictionary.get(hash);
      const count = Math.max(1, Number(token.count || 1));
      if (!d) d = { ...token, hash, count: 0, phaseX: 0, phaseY: 0, zeroResidual: 0, closure: 0, info: 0, regimes: [], worlds: [] };
      d.count += count;
      d.phaseX += Math.cos(Number(token.phase || 0)) * count;
      d.phaseY += Math.sin(Number(token.phase || 0)) * count;
      d.zeroResidual += Number(token.zeroResidual || 0) * count;
      d.closure += Number(token.closure || 0) * count;
      d.info += Number(token.info || 0) * count;
      d.regimes = mergeUniqueArrays(d.regimes || [], token.regimes || [], 32);
      d.worlds = mergeUniqueArrays(d.worlds || [], token.worlds || [], 48);
      dictionary.set(hash, d);
    }
    for (const layerName of ['one', 'two', 'three']) {
      for (const [hash, item] of Object.entries(syn.sumLayerClasses?.[layerName] || {})) {
        let sc = sumLayerClasses[layerName].get(hash);
        const count = Math.max(1, Number(item.count || 1));
        if (!sc) sc = { ...item, hash, count: 0, packingScore: 0, combinedResidual: 0, phaseX: 0, phaseY: 0, regimes: [], worlds: [] };
        sc.count += count;
        sc.packingScore += Number(item.packingMean ?? item.packingScore ?? 0) * count;
        sc.combinedResidual += Number(item.residualMean ?? item.combinedResidual ?? 0) * count;
        sc.phaseX += Math.cos(Number(item.axisPhase || 0)) * (0.35 + Number(item.packingMean ?? item.packingScore ?? 0)) * count;
        sc.phaseY += Math.sin(Number(item.axisPhase || 0)) * (0.35 + Number(item.packingMean ?? item.packingScore ?? 0)) * count;
        sc.regimes = mergeUniqueArrays(sc.regimes || [], item.regimes || [], 32);
        sc.worlds = mergeUniqueArrays(sc.worlds || [], item.worlds || [], 48);
        sumLayerClasses[layerName].set(hash, sc);
      }
    }
    for (const [hash, item] of Object.entries(syn.plateauClasses || {})) {
      let pc = plateauClasses.get(hash);
      const count = Math.max(1, Number(item.count || 1));
      if (!pc) pc = { ...item, hash, count: 0, coverage: 0, zeroResidual: 0, closure: 0, phaseX: 0, phaseY: 0, regimes: [], worlds: [] };
      pc.count += count;
      pc.coverage += Number(item.coverage || 0) * count;
      pc.zeroResidual += Number(item.zeroResidual || 0) * count;
      pc.closure += Number(item.closure || 0) * count;
      pc.phaseX += Math.cos(Number(item.phase || 0)) * count;
      pc.phaseY += Math.sin(Number(item.phase || 0)) * count;
      pc.regimes = mergeUniqueArrays(pc.regimes || [], item.regimes || [], 32);
      pc.worlds = mergeUniqueArrays(pc.worlds || [], item.worlds || [], 48);
      plateauClasses.set(hash, pc);
    }
    crossWorldRelations = mergeUniqueArrays(crossWorldRelations, syn.crossWorldRelations || [], 192);
    hiddenAxes = mergeUniqueArrays(hiddenAxes, syn.hiddenAxes || [], 64);
    marriages = mergeUniqueArrays(marriages, syn.marriages || [], 160);
    tensions = mergeUniqueArrays(tensions, syn.tensions || [], 80);
  }
  const dictObj = {};
  for (const [hash, d] of dictionary) {
    const phase = Math.atan2(d.phaseY, d.phaseX);
    dictObj[hash] = {
      hash,
      token: d.token,
      role: d.role,
      mode: d.mode,
      count: d.count,
      regimes: d.regimes || [],
      worlds: (d.worlds || []).slice(0, 48),
      phase: Number(phase.toFixed(5)),
      zeroResidual: Number((d.zeroResidual / Math.max(1, d.count)).toExponential(3)),
      closure: Number((d.closure / Math.max(1, d.count)).toFixed(4)),
      info: Number((d.info / Math.max(1, d.count)).toFixed(4))
    };
  }
  const sumLayerObj = { one: {}, two: {}, three: {} };
  for (const layerName of ['one', 'two', 'three']) {
    for (const [hash, s] of sumLayerClasses[layerName]) {
      const phase = Math.atan2(s.phaseY, s.phaseX);
      sumLayerObj[layerName][hash] = {
        hash,
        kind: s.kind || (layerName + '_sum'),
        relation: s.relation,
        role: s.role,
        count: s.count,
        regimes: s.regimes || [],
        worlds: (s.worlds || []).slice(0, 48),
        members: s.members || [],
        ...(s.chirality ? { chirality: s.chirality } : {}),
        axisPhase: Number(phase.toFixed(5)),
        packingMean: Number((s.packingScore / Math.max(1, s.count)).toFixed(4)),
        residualMean: Number((s.combinedResidual / Math.max(1, s.count)).toExponential(3))
      };
    }
  }
  const plateauObj = {};
  for (const [hash, p] of plateauClasses) {
    const phase = Math.atan2(p.phaseY, p.phaseX);
    plateauObj[hash] = {
      hash,
      role: p.role || 'plateau',
      count: p.count,
      regimes: p.regimes || [],
      worlds: (p.worlds || []).slice(0, 48),
      coverage: Number((p.coverage / Math.max(1, p.count)).toFixed(4)),
      phase: Number(phase.toFixed(5)),
      zeroResidual: Number((p.zeroResidual / Math.max(1, p.count)).toExponential(3)),
      closure: Number((p.closure / Math.max(1, p.count)).toFixed(4)),
      meanState: p.meanState || null
    };
  }
  sourceWorldCount = Math.max(sourceWorldCount, sources.length);
  const dictCount = Object.keys(dictObj).length;
  const oneCount = Object.keys(sumLayerObj.one).length;
  const twoCount = Object.keys(sumLayerObj.two).length;
  const threeCount = Object.keys(sumLayerObj.three).length;
  const plateauCount = Object.keys(plateauObj).length;
  const coldBankZeroFit = clamp(zeroFitWeighted / Math.max(1, weightTotal), 0, 1);
  const coldBankClosure = clamp(closureWeighted / Math.max(1, weightTotal), 0, 1);
  const syntaxDiversity = clamp(Math.log2(dictCount + oneCount + twoCount + threeCount + plateauCount + 1) / 10, 0, 1);
  const oneSumPressure = Math.max(priorOnePressure, clamp(oneCount / Math.max(1, sourceWorldCount * 18), 0, 1));
  const twoSumPressure = Math.max(priorTwoPressure, clamp(twoCount / Math.max(1, sourceWorldCount * 10), 0, 1));
  const threeSumPressure = Math.max(priorThreePressure, clamp(threeCount / Math.max(1, sourceWorldCount * 5), 0, 1));
  const sumSyntaxFullness = Math.max(priorSumFullness, clamp(0.22 * oneSumPressure + 0.36 * twoSumPressure + 0.42 * threeSumPressure, 0, 1));
  const tokenPressure = Math.max(priorTokenPressure, clamp((dictCount + oneCount * 0.25 + twoCount * 0.40 + threeCount * 0.65) / Math.max(1, sourceWorldCount * 32), 0, 1));
  const plateauPressure = Math.max(priorPlateauPressure, clamp(plateauCount / Math.max(1, sourceWorldCount * 4), 0, 1));
  const marriagePressure = Math.max(priorMarriagePressure, clamp((marriages.length + twoCount * 0.22 + threeCount * 0.45) / Math.max(1, sourceWorldCount * 8), 0, 1));
  const coldBankTensionMetric = Math.max(priorTension, clamp(0.32 * syntaxDiversity + 0.20 * sumSyntaxFullness + 0.16 * plateauPressure + 0.20 * tokenPressure + 0.12 * marriagePressure, 0, 1));
  const synthesisFullness = Math.max(priorFullness, clamp(0.22 * coldBankZeroFit + 0.18 * coldBankClosure + 0.18 * syntaxDiversity + 0.17 * sumSyntaxFullness + 0.15 * marriagePressure + 0.10 * clamp(Math.log2(sourceWorldCount + 1) / 5, 0, 1), 0, 1));
  const axisPhase = Math.atan2(axisY, axisX);
  return normalizeSynthesis({
    schema: SYNTHESIS_SYNTAX_SCHEMA,
    createdAt: new Date().toISOString(),
    sourceWorldCount,
    regimes,
    dictionary: dictObj,
    sumLayerClasses: sumLayerObj,
    plateauClasses: plateauObj,
    crossWorldRelations,
    hiddenAxes,
    marriages: marriages.slice(0, 128),
    tensions,
    compression: {
      coldBankZeroFit: Number(coldBankZeroFit.toFixed(4)),
      coldBankClosure: Number(coldBankClosure.toFixed(4)),
      syntaxDiversity: Number(syntaxDiversity.toFixed(4)),
      sumSyntaxFullness: Number(sumSyntaxFullness.toFixed(4)),
      synthesisFullness: Number(synthesisFullness.toFixed(4)),
      coldBankTension: Number(coldBankTensionMetric.toFixed(4)),
      axisPhase: Number(axisPhase.toFixed(5)),
      plateauPressure: Number(plateauPressure.toFixed(4)),
      tokenPressure: Number(tokenPressure.toFixed(4)),
      oneSumPressure: Number(oneSumPressure.toFixed(4)),
      twoSumPressure: Number(twoSumPressure.toFixed(4)),
      threeSumPressure: Number(threeSumPressure.toFixed(4)),
      marriagePressure: Number(marriagePressure.toFixed(4))
    },
    note: 'Merged protected/imported synthesis plus live coldBank syntax. Protected synthesis is cold evidence and is not overwritten by autonomous continuum distillation.'
  });
}
function buildMergedColdBankSynthesis({ includeCurrent = false, force = false, reason = 'merge' } = {}) {
  const sourceKey = coldBankSourceStackKey(includeCurrent);
  if (COLD_BANK_SYNTHESIS_CACHE_ENABLED && !force && !includeCurrent && !coldBankSynthesisCache.dirty && coldBankSynthesisCache.sourceKey === sourceKey && coldBankSynthesisCache.merged) {
    coldBankSynthesisCache.lastHit = true;
    coldBankSynthesisCache.fastHits += 1;
    return coldBankSynthesisCache.merged;
  }

  coldBankSynthesisCache.lastHit = false;
  const protectedSyntheses = protectedColdBankSyntheses();
  const stackKey = coldBankWorldStackKey(includeCurrent);
  let stackSynthesis = null;
  if (COLD_BANK_SYNTHESIS_CACHE_ENABLED && !force && !includeCurrent && coldBankSynthesisCache.stackKey === stackKey && coldBankSynthesisCache.stack) {
    stackSynthesis = coldBankSynthesisCache.stack;
  } else {
    stackSynthesis = buildSynthesisFromWorlds(syntaxColdBank.worlds || [], { includeCurrent });
    if (!includeCurrent) {
      coldBankSynthesisCache.stackKey = stackKey;
      coldBankSynthesisCache.stack = stackSynthesis;
    }
  }
  const stackUseful = stackSynthesis.sourceWorldCount || Object.keys(stackSynthesis.dictionary || {}).length || Object.keys(stackSynthesis.sumLayerClasses?.one || {}).length || Object.keys(stackSynthesis.sumLayerClasses?.two || {}).length || Object.keys(stackSynthesis.sumLayerClasses?.three || {}).length;
  const sources = [...protectedSyntheses];
  if (stackUseful) sources.push(stackSynthesis);
  if (!sources.length && syntaxColdBank.activeSynthesis) sources.push(syntaxColdBank.activeSynthesis);
  const merged = mergeSynthesisObjects(sources);
  if (!includeCurrent) {
    coldBankSynthesisCache.sourceKey = sourceKey;
    coldBankSynthesisCache.merged = merged;
    coldBankSynthesisCache.dirty = false;
    coldBankSynthesisCache.builds += 1;
    coldBankSynthesisCache.lastBuildTick = tick;
    coldBankSynthesisCache.lastBuildTime = simTime;
    coldBankSynthesisCache.lastReason = reason;
  }
  return merged;
}
function buildSynthesisFromWorlds(worlds, { includeCurrent = false } = {}) {
  const cards = worlds.slice();
  if (includeCurrent && residentSignalManifest && residentSignalManifest.schema === ZERO_SYNTAX_SCHEMA && residentSignalManifest.tick > 0) {
    cards.push(normalizeWorldCard({
      worldId: 'current-run-t' + tick,
      sourceType: 'current-run-syntax',
      stepRegime: currentStepRegime(),
      pinnedDescent,
      residentSignal,
      tick,
      simTime,
      metrics: residentSignalManifest.metrics || {},
      tokens: residentSignalManifest.tokens || [],
      relations: residentSignalManifest.relations || [],
      sumLayers: residentSignalManifest.sumLayers,
      globalPlateaus: residentSignalManifest.globalPlateaus || inferPlateausFromManifest(residentSignalManifest)
    }));
  }
  if (!cards.length) return makeEmptyColdBankSynthesis();
  const regimes = Array.from(new Set(cards.map(c => c.stepRegime?.name || 'unknown-regime')));
  const dictionary = new Map();
  const sumLayerClasses = { one: new Map(), two: new Map(), three: new Map() };
  const plateauClasses = new Map();
  const relationClasses = new Map();
  let zeroFitSum = 0, closureSum = 0, metricCount = 0;
  let axisX = 0, axisY = 0;
  let tokenTotal = 0, plateauTotal = 0;
  let oneSumTotal = 0, twoSumTotal = 0, threeSumTotal = 0, sumScoreTotal = 0, sumScoreCount = 0;
  for (const card of cards) {
    const m = card.metrics || {};
    const zeroFit = Number.isFinite(m.zeroFit) ? Number(m.zeroFit) : (Number.isFinite(m.zeroResidualMean) ? 1 / (1 + Number(m.zeroResidualMean) * 70) : 0);
    const closure = Number.isFinite(m.closureMean) ? Number(m.closureMean) : 0;
    if (zeroFit || closure) { zeroFitSum += zeroFit; closureSum += closure; metricCount++; }
    for (const t of card.tokens || []) {
      tokenTotal++;
      let d = dictionary.get(t.hash);
      if (!d) d = { hash: t.hash, token: t.token, role: t.role, mode: t.mode, count: 0, regimes: [], worlds: [], phaseX: 0, phaseY: 0, zeroResidual: 0, closure: 0, info: 0 };
      d.count++;
      if (!d.regimes.includes(card.stepRegime?.name || 'unknown-regime')) d.regimes.push(card.stepRegime?.name || 'unknown-regime');
      if (!d.worlds.includes(card.worldId)) d.worlds.push(card.worldId);
      d.phaseX += Math.cos(Number(t.phase || 0));
      d.phaseY += Math.sin(Number(t.phase || 0));
      d.zeroResidual += Number(t.zeroResidual || 0);
      d.closure += Number(t.closure || 0);
      d.info += Number(t.info || 0);
      dictionary.set(t.hash, d);
      axisX += Math.cos(Number(t.phase || 0)) * (0.35 + Number(t.info || 0));
      axisY += Math.sin(Number(t.phase || 0)) * (0.35 + Number(t.info || 0));
    }
    const sumLayers = normalizeSumLayers(card.sumLayers, card.tokens || []);
    for (const layerName of ['one', 'two', 'three']) {
      const addresses = sumLayers?.[layerName]?.addresses || [];
      if (layerName === 'one') oneSumTotal += addresses.length;
      if (layerName === 'two') twoSumTotal += addresses.length;
      if (layerName === 'three') threeSumTotal += addresses.length;
      for (const rawAddress of addresses) {
        const address = compactSumLayerAddress(layerName, rawAddress);
        const key = address.hash || [layerName, address.relation, address.role, address.members.join('+')].join('|');
        let sc = sumLayerClasses[layerName].get(key);
        if (!sc) sc = {
          hash: address.hash,
          kind: address.kind,
          relation: address.relation,
          role: address.role,
          count: 0,
          regimes: [],
          worlds: [],
          packingScore: 0,
          combinedResidual: 0,
          phaseX: 0,
          phaseY: 0,
          members: address.members,
          chirality: address.chirality || null
        };
        sc.count++;
        if (!sc.regimes.includes(card.stepRegime?.name || 'unknown-regime')) sc.regimes.push(card.stepRegime?.name || 'unknown-regime');
        if (!sc.worlds.includes(card.worldId)) sc.worlds.push(card.worldId);
        sc.packingScore += Number(address.packingScore || 0);
        sc.combinedResidual += Number(address.combinedResidual || 0);
        const ph = Number.isFinite(address.axisPhase) ? address.axisPhase : Number(address.phaseDelta || address.phaseCycle || 0);
        sc.phaseX += Math.cos(ph) * (0.35 + Number(address.packingScore || 0));
        sc.phaseY += Math.sin(ph) * (0.35 + Number(address.packingScore || 0));
        sumScoreTotal += Number(address.packingScore || 0);
        sumScoreCount++;
        axisX += Math.cos(ph) * (0.18 + Number(address.packingScore || 0) * (layerName === 'three' ? 0.50 : layerName === 'two' ? 0.34 : 0.24));
        axisY += Math.sin(ph) * (0.18 + Number(address.packingScore || 0) * (layerName === 'three' ? 0.50 : layerName === 'two' ? 0.34 : 0.24));
        sumLayerClasses[layerName].set(key, sc);
      }
    }
    for (const p of card.globalPlateaus || []) {
      plateauTotal++;
      const key = p.hash || ('plateau_' + hash32([p.phase || 0, p.coverage || 0, p.closure || 0]).toString(16).padStart(8, '0'));
      let q = plateauClasses.get(key);
      if (!q) q = { hash: key, role: p.role || 'global_plateau', count: 0, regimes: [], worlds: [], coverage: 0, phaseX: 0, phaseY: 0, zeroResidual: 0, closure: 0, meanState: p.meanState || null };
      q.count++;
      if (!q.regimes.includes(card.stepRegime?.name || 'unknown-regime')) q.regimes.push(card.stepRegime?.name || 'unknown-regime');
      if (!q.worlds.includes(card.worldId)) q.worlds.push(card.worldId);
      q.coverage += Number(p.coverage || 0);
      const ph = Number.isFinite(p.phase) ? p.phase : (p.meanState ? phaseFromStateTuple(p.meanState) : 0);
      q.phaseX += Math.cos(ph) * (0.35 + Number(p.coverage || 0));
      q.phaseY += Math.sin(ph) * (0.35 + Number(p.coverage || 0));
      q.zeroResidual += Number(p.zeroResidual || 0);
      q.closure += Number(p.closure || 0);
      plateauClasses.set(key, q);
      axisX += Math.cos(ph) * (0.5 + Number(p.coverage || 0));
      axisY += Math.sin(ph) * (0.5 + Number(p.coverage || 0));
    }
    for (const r of card.relations || []) {
      const key = [r.relation || 'phase_route', r.wrap || 'unknown', r.from || '', r.to || ''].join('|');
      let rc = relationClasses.get(key);
      if (!rc) rc = { relation: r.relation || 'phase_route', wrap: r.wrap || 'unknown', count: 0, support: 0, regimes: [], worlds: [] };
      rc.count++;
      rc.support += Number(r.support || 0);
      if (!rc.regimes.includes(card.stepRegime?.name || 'unknown-regime')) rc.regimes.push(card.stepRegime?.name || 'unknown-regime');
      if (!rc.worlds.includes(card.worldId)) rc.worlds.push(card.worldId);
      relationClasses.set(key, rc);
    }
  }
  const dictObj = {};
  for (const [hash, d] of dictionary) {
    const phase = Math.atan2(d.phaseY, d.phaseX);
    dictObj[hash] = {
      hash, token: d.token, role: d.role, mode: d.mode, count: d.count, regimes: d.regimes, worlds: d.worlds.slice(0, 24),
      phase: Number(phase.toFixed(5)), zeroResidual: Number((d.zeroResidual / Math.max(1, d.count)).toExponential(3)), closure: Number((d.closure / Math.max(1, d.count)).toFixed(4)), info: Number((d.info / Math.max(1, d.count)).toFixed(4))
    };
  }
  const sumLayerObj = { one: {}, two: {}, three: {} };
  for (const layerName of ['one', 'two', 'three']) {
    for (const [hash, s] of sumLayerClasses[layerName]) {
      const phase = Math.atan2(s.phaseY, s.phaseX);
      sumLayerObj[layerName][hash] = {
        hash,
        kind: s.kind,
        relation: s.relation,
        role: s.role,
        count: s.count,
        regimes: s.regimes,
        worlds: s.worlds.slice(0, 24),
        members: s.members,
        ...(s.chirality ? { chirality: s.chirality } : {}),
        axisPhase: Number(phase.toFixed(5)),
        packingMean: Number((s.packingScore / Math.max(1, s.count)).toFixed(4)),
        residualMean: Number((s.combinedResidual / Math.max(1, s.count)).toExponential(3))
      };
    }
  }
  const plateauObj = {};
  for (const [hash, q] of plateauClasses) {
    const phase = Math.atan2(q.phaseY, q.phaseX);
    plateauObj[hash] = {
      hash, role: q.role, count: q.count, regimes: q.regimes, worlds: q.worlds.slice(0, 24), coverage: Number((q.coverage / Math.max(1, q.count)).toFixed(4)),
      phase: Number(phase.toFixed(5)), zeroResidual: Number((q.zeroResidual / Math.max(1, q.count)).toExponential(3)), closure: Number((q.closure / Math.max(1, q.count)).toFixed(4)), meanState: q.meanState
    };
  }
  const crossWorldRelations = Array.from(relationClasses.values())
    .sort((a, b) => (b.count * b.support) - (a.count * a.support))
    .slice(0, 96)
    .map(r => ({ relation: r.relation, wrap: r.wrap, count: r.count, regimes: r.regimes, worlds: r.worlds.slice(0, 24), support: Number((r.support / Math.max(1, r.count)).toFixed(5)) }));
  const hiddenAxes = [];
  if (plateauTotal > 0 && tokenTotal > 0) hiddenAxes.push({ axis: 'plateau-token', role: 'global plateau can be opened by local token grammar', support: Number(clamp(Math.min(tokenTotal, plateauTotal) / Math.max(1, cards.length * 8), 0, 1).toFixed(4)) });
  if (regimes.includes('architecture-42') && (regimes.includes('seven-7') || regimes.includes('six-6'))) hiddenAxes.push({ axis: '7x6-marriage', role: 'architecture-42 can compare against six/seven crystal-root lenses', support: 0.618 });
  if (regimes.some(r => /108|112/.test(r)) && regimes.includes('architecture-42')) hiddenAxes.push({ axis: 'routing-plateau', role: 'deep routing syntax can test the architecture-42 highway', support: 0.577 });
  const marriages = [];
  const tokenValues = Object.values(dictObj).slice(0, 48);
  const plateauValues = Object.values(plateauObj).slice(0, 32);
  for (const t of tokenValues) {
    for (const p of plateauValues) {
      const pd = Math.abs(phaseDelta(Number(t.phase || 0), Number(p.phase || 0)));
      const support = (0.45 + 0.55 * Math.cos(pd) * 0.5 + 0.5) * Math.min(1, (Number(t.info || 0) + Number(p.coverage || 0)) * 0.9);
      if (support > 0.36) marriages.push({ type: 'token-plateau', token: t.hash, plateau: p.hash, phaseDelta: Number(pd.toFixed(5)), support: Number(clamp(support, 0, 1).toFixed(4)) });
    }
  }
  marriages.sort((a, b) => b.support - a.support);
  const tensions = regimes.map(name => {
    const related = cards.filter(c => c.stepRegime?.name === name);
    const localTokens = related.reduce((n, c) => n + (c.tokens?.length || 0), 0);
    const plateaus = related.reduce((n, c) => n + (c.globalPlateaus?.length || 0), 0);
    return { regime: name, tokenCount: localTokens, plateauCount: plateaus, tension: Number(clamp(Math.abs(localTokens - plateaus * 4) / Math.max(1, localTokens + plateaus * 4), 0, 1).toFixed(4)) };
  });
  const uniqueTokens = Object.keys(dictObj).length;
  const uniqueOneSums = Object.keys(sumLayerObj.one).length;
  const uniqueTwoSums = Object.keys(sumLayerObj.two).length;
  const uniqueThreeSums = Object.keys(sumLayerObj.three).length;
  const uniquePlateaus = Object.keys(plateauObj).length;
  if (uniqueOneSums > 0 && tokenTotal > 0) hiddenAxes.push({ axis: 'one-sum-portal-geometry', role: 'single-token geometry preserves portal/source-center knowledge across continuum transit', support: Number(clamp(uniqueOneSums / Math.max(1, cards.length * 12), 0, 1).toFixed(4)) });
  const coldBankZeroFit = metricCount ? zeroFitSum / metricCount : 0;
  const coldBankClosure = metricCount ? closureSum / metricCount : 0;
  const sumSyntaxFullness = clamp(
    0.20 * clamp(oneSumTotal / Math.max(1, cards.length * 24), 0, 1)
    + 0.30 * clamp(twoSumTotal / Math.max(1, cards.length * 14), 0, 1)
    + 0.30 * clamp(threeSumTotal / Math.max(1, cards.length * 7), 0, 1)
    + 0.20 * clamp(sumScoreTotal / Math.max(1, sumScoreCount), 0, 1),
    0,
    1
  );
  const syntaxDiversity = clamp((uniqueTokens + uniqueOneSums * 0.9 + uniqueTwoSums * 1.4 + uniqueThreeSums * 2.1 + uniquePlateaus * 2 + crossWorldRelations.length * 0.25) / Math.max(8, cards.length * 34), 0, 1);
  const plateauPressure = clamp(uniquePlateaus / Math.max(1, cards.length * 4), 0, 1);
  const oneSumPressure = clamp(uniqueOneSums / Math.max(1, cards.length * 18), 0, 1);
  const twoSumPressure = clamp(uniqueTwoSums / Math.max(1, cards.length * 10), 0, 1);
  const threeSumPressure = clamp(uniqueThreeSums / Math.max(1, cards.length * 5), 0, 1);
  const tokenPressure = clamp((uniqueTokens + uniqueOneSums * 0.8 + uniqueTwoSums * 1.2 + uniqueThreeSums * 1.8) / Math.max(1, cards.length * 32), 0, 1);
  const marriagePressure = clamp((marriages.length + uniqueOneSums * 0.10 + uniqueTwoSums * 0.20 + uniqueThreeSums * 0.42) / Math.max(1, cards.length * 8), 0, 1);
  const coldBankTensionMetric = clamp(0.34 * syntaxDiversity + 0.18 * sumSyntaxFullness + 0.18 * plateauPressure + 0.20 * tokenPressure + 0.10 * (tensions.reduce((a, b) => a + b.tension, 0) / Math.max(1, tensions.length)), 0, 1);
  const synthesisFullness = clamp(0.26 * coldBankZeroFit + 0.21 * coldBankClosure + 0.17 * syntaxDiversity + 0.15 * sumSyntaxFullness + 0.11 * marriagePressure + 0.10 * clamp(Math.log2(cards.length + 1) / 5, 0, 1), 0, 1);
  const axisPhase = Math.atan2(axisY, axisX);
  return normalizeSynthesis({
    schema: SYNTHESIS_SYNTAX_SCHEMA,
    createdAt: new Date().toISOString(),
    sourceWorldCount: cards.length,
    regimes,
    dictionary: dictObj,
    sumLayerClasses: sumLayerObj,
    plateauClasses: plateauObj,
    crossWorldRelations,
    hiddenAxes,
    marriages: marriages.slice(0, 96),
    tensions,
    compression: {
      coldBankZeroFit: Number(coldBankZeroFit.toFixed(4)),
      coldBankClosure: Number(coldBankClosure.toFixed(4)),
      syntaxDiversity: Number(syntaxDiversity.toFixed(4)),
      sumSyntaxFullness: Number(sumSyntaxFullness.toFixed(4)),
      synthesisFullness: Number(synthesisFullness.toFixed(4)),
      coldBankTension: Number(coldBankTensionMetric.toFixed(4)),
      axisPhase: Number(axisPhase.toFixed(5)),
      plateauPressure: Number(plateauPressure.toFixed(4)),
      tokenPressure: Number(tokenPressure.toFixed(4)),
      oneSumPressure: Number(oneSumPressure.toFixed(4)),
      twoSumPressure: Number(twoSumPressure.toFixed(4)),
      threeSumPressure: Number(threeSumPressure.toFixed(4)),
      marriagePressure: Number(marriagePressure.toFixed(4))
    }
  });
}
function selectedColdBankInfluenceSource() {
  const node = el('coldBankInfluenceSource');
  return registryValue(COLD_BANK_INFLUENCE_SOURCES, node ? node.value : coldBankInfluenceSource, 'stack');
}
function setColdBankInfluenceSource(source) {
  coldBankInfluenceSource = registryValue(COLD_BANK_INFLUENCE_SOURCES, source, 'stack');
  setSelectValue('coldBankInfluenceSource', coldBankInfluenceSource);
  syntaxColdBank.distilledOnly = coldBankInfluenceSource === 'distilled';
  coldBankDistilledOnly = syntaxColdBank.distilledOnly;
}
function continuumColdBankEnabled() {
  return coldBankActiveMode === 'continuum';
}
function portalGeometryPhase(center) {
  const x = Array.isArray(center) ? Number(center[0]) || 0.5 : 0.5;
  const y = Array.isArray(center) ? Number(center[1]) || 0.5 : 0.5;
  return Math.atan2(y - 0.5, x - 0.5);
}
function portalGeometryTokens(maxTokens = 12) {
  const tokens = [];
  const pushToken = (center, role, support = 0.55, salt = '') => {
    if (!Array.isArray(center) || center.length < 2) return;
    const cx = wrap01(Number(center[0]) || 0);
    const cy = wrap01(Number(center[1]) || 0);
    const phase = portalGeometryPhase([cx, cy]);
    const transit = clamp(portalTransitBlend ? portalTransitBlend() : 0, 0, 1);
    tokens.push(compactToken({
      token: 'portal_' + tokens.length,
      hash: 'portal_' + hashString32(['portal', role, salt, Math.round(cx * 65535), Math.round(cy * 65535), Math.round(phase * 1000)].join('|')).toString(16).padStart(8, '0'),
      role,
      mode: 'portal',
      center: [cx, cy],
      phase,
      zeroResidual: 0.010 + 0.035 * (1 - support),
      closure: clamp(0.50 + 0.36 * support + 0.14 * transit, 0, 1),
      winding: clamp(0.28 + 0.55 * Math.abs(Math.sin(phase + Number(portalLadder?.level || 0) * 0.37)), 0, 1),
      info: clamp(support, 0, 1),
      persistence: 2 + Math.max(0, Math.abs(Number(portalLadder?.level || 0))) * 0.25,
      count: 1
    }));
  };
  try { pushToken(portalLadderRenderFocus(), 'portal_current_focus', portalRenderActive() ? 0.84 : 0.62, 'focus'); } catch (_) {}
  for (const record of (subspace?.active || []).slice(0, Math.max(0, maxTokens - tokens.length))) {
    const uv = record?.portal?.uv || record?.parentUV || record?.center || null;
    pushToken(uv, 'portal_frame_geometry', clamp(Number(record?.portalFrame?.score ?? record?.score ?? 0.55) || 0.55, 0, 1), String(record?.chunkId ?? tokens.length));
  }
  return tokens.slice(0, maxTokens);
}
function portalGeometryPlateaus(maxPlateaus = 8) {
  return portalGeometryTokens(maxPlateaus).map((token, idx) => ({
    hash: 'portal_plateau_' + token.hash.slice(-8),
    role: idx === 0 ? 'current_portal_parent_focus' : 'portal_frame_trace',
    coverage: Number(clamp(0.10 + Number(token.info || 0) * 0.36, 0, 1).toFixed(4)),
    meanState: null,
    phase: Number(Number(token.phase || 0).toFixed(5)),
    zeroResidual: Number(Number(token.zeroResidual || 0).toExponential(3)),
    closure: Number(Number(token.closure || 0).toFixed(4)),
    source: 'continuum-portal-geometry'
  }));
}
function currentResidentSignalColdBankCard(sourceType = 'continuum-live-syntax') {
  if (!residentSignalManifest || residentSignalManifest.schema !== ZERO_SYNTAX_SCHEMA || !(Number(residentSignalManifest.tick) > 0)) return null;
  const portalTokens = portalGeometryTokens();
  const tokens = [...(residentSignalManifest.tokens || []), ...portalTokens]
    .map(compactToken)
    .sort((a, b) => ((b.persistence || 1) * (b.info || 0)) - ((a.persistence || 1) * (a.info || 0)))
    .slice(0, 256);
  const sumLayers = buildSumSyntaxLayers(tokens);
  const plateaus = [
    ...(Array.isArray(residentSignalManifest.globalPlateaus) ? residentSignalManifest.globalPlateaus : []),
    ...portalGeometryPlateaus()
  ].slice(0, 32);
  return normalizeWorldCard({
    worldId: 'continuum-live-' + (syntaxColdBank.liveSequence || 0) + '-t' + Math.max(0, Math.floor(Number(tick) || 0)),
    sourceType,
    stepRegime: currentStepRegime(),
    pinnedDescent,
    residentSignal,
    tick,
    simTime,
    metrics: {
      ...(residentSignalManifest.metrics || {}),
      oneSumCount: sumLayers.one?.addresses?.length || 0,
      twoSumCount: sumLayers.two?.addresses?.length || 0,
      threeSumCount: sumLayers.three?.addresses?.length || 0,
      portalGeometryTokenCount: portalTokens.length
    },
    tokens,
    relations: residentSignalManifest.relations || [],
    sumLayers,
    globalPlateaus: plateaus
  });
}
function trimSyntaxColdBankWorlds() {
  const seen = new Set();
  const unique = [];
  for (const card of (syntaxColdBank.worlds || []).slice().reverse()) {
    const id = String(card.worldId || '');
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    unique.push(card);
  }
  syntaxColdBank.worlds = unique.reverse().slice(-COLD_BANK_CONTINUUM_WORLD_LIMIT);
}
function maybeAssimilateContinuumColdBank(reason = 'continuum') {
  if (!continuumColdBankEnabled() || !residentSignal || !residentSignalManifest || residentSignalManifest.schema !== ZERO_SYNTAX_SCHEMA) return false;
  const cadenceReady = !(
    tick - coldBankContinuumLastAssimilateTick < COLD_BANK_CONTINUUM_ASSIMILATE_INTERVAL_TICKS
    && simTime - coldBankContinuumLastAssimilateTime < COLD_BANK_CONTINUUM_ASSIMILATE_INTERVAL_SECONDS
  );
  if (!cadenceReady) return false;
  const metrics = residentSignalManifest.metrics || {};
  if (!(Number(metrics.tokenCount || 0) > 0 || portalRenderActive())) return false;
  const card = currentResidentSignalColdBankCard(reason);
  if (!card) return false;
  syntaxColdBank.liveSequence = (Number(syntaxColdBank.liveSequence) || 0) + 1;
  syntaxColdBank.liveAssimilations = (Number(syntaxColdBank.liveAssimilations) || 0) + 1;
  syntaxColdBank.worlds.push(card);
  trimSyntaxColdBankWorlds();
  markColdBankSynthesisDirty('continuum-live-card');
  coldBankContinuumLastAssimilateTick = tick;
  coldBankContinuumLastAssimilateTime = simTime;
  coldBankContinuumAssimilationCount++;
  if (COLD_BANK_INCREMENTAL_CONTINUUM_MERGE && coldBankSynthesis && (coldBankSynthesis.sourceWorldCount || Object.keys(coldBankSynthesis.dictionary || {}).length || Object.keys(coldBankSynthesis.sumLayerClasses?.one || {}).length)) {
    const liveSyn = buildSynthesisFromWorlds([card], { includeCurrent: false });
    coldBankSynthesis = normalizeSynthesis(mergeSynthesisObjects([coldBankSynthesis, liveSyn]));
    syntaxColdBank.activeSynthesis = coldBankSynthesis;
    coldBankSynthesisCache.merged = coldBankSynthesis;
    coldBankSynthesisCache.sourceKey = coldBankSourceStackKey(false);
    coldBankSynthesisCache.stackKey = coldBankWorldStackKey(false);
    coldBankSynthesisCache.stack = null;
    coldBankSynthesisCache.dirty = false;
    coldBankSynthesisCache.builds += 1;
    coldBankSynthesisCache.lastBuildTick = tick;
    coldBankSynthesisCache.lastBuildTime = simTime;
    coldBankSynthesisCache.lastReason = 'incremental-continuum-merge';
  } else {
    refreshColdBankSynthesis({ includeCurrent: false, force: true, reason: 'continuum-live-card' });
  }
  applyColdBankCompression(coldBankSynthesis);
  compileZeroSumSyntaxFromManifest(residentSignalManifest, 'resident-signal+continuum-coldBank');
  coldBankLastDistillMessage = 'continuum distilled live syntax #' + syntaxColdBank.liveAssimilations + ' · one/two/three ' + (card.sumLayers.one?.addresses?.length || 0) + '/' + (card.sumLayers.two?.addresses?.length || 0) + '/' + (card.sumLayers.three?.addresses?.length || 0) + ' · ' + reason;
  coldBankLastDiagnosticMessage = 'Continuum ColdBank merged live Resident Signal + protected imported synthesis, then fed cold syntax back into compiler';
  updateColdBankStats();
  return true;
}
function maybeAutonomyColdBankWorkDistill(reason = 'autonomy-coldBank-work') {
  if (!autonomousActive || !isFullAutonomyMode(autonomousMode) || coldBankActiveMode !== 'continuum') return false;
  if (!coldBankHasImportOrSynthesisEvidence()) return false;
  const cadenceReady = !(
    tick - coldBankAutonomyWorkDistillLastTick < AUTONOMY_COLD_BANK_WORK_DISTILL_INTERVAL_TICKS
    && simTime - coldBankAutonomyWorkDistillLastTime < AUTONOMY_COLD_BANK_WORK_DISTILL_INTERVAL_SECONDS
  );
  if (!cadenceReady) return false;
  coldBankAutonomyWorkDistillLastTick = tick;
  coldBankAutonomyWorkDistillLastTime = simTime;
  coldBankAutonomyWorkDistillCount++;
  refreshColdBankSynthesis({ includeCurrent: false, reason: 'autonomy-coldBank-work-distill' });
  compileZeroSumSyntaxFromManifest(residentSignalManifest, 'resident-signal+autonomy-coldBank-work-distill');
  coldBankLastDistillMessage = 'autonomy work pulse #' + coldBankAutonomyWorkDistillCount + ' · deep-distilled protected stack without changing mode · ' + reason;
  coldBankLastDiagnosticMessage = 'Continuum default stayed active; autonomy borrowed ColdBank Work compression for a deep distillation pulse';
  updateColdBankStats();
  return true;
}
function refreshColdBankSynthesis({ includeCurrent = false, force = false, reason = 'refresh' } = {}) {
  const merged = buildMergedColdBankSynthesis({ includeCurrent, force, reason });
  const cacheHit = Boolean(coldBankSynthesisCache?.lastHit && !includeCurrent && !force);
  if (cacheHit && coldBankSynthesis === merged) {
    return coldBankSynthesis;
  }
  coldBankSynthesis = normalizeSynthesis(merged);
  syntaxColdBank.activeSynthesis = coldBankSynthesis;
  applyColdBankCompression(coldBankSynthesis);
  const protectedCount = Array.isArray(syntaxColdBank.protectedSyntheses) ? syntaxColdBank.protectedSyntheses.length : 0;
  coldBankLastDiagnosticMessage = cacheHit
    ? 'protected/cold syntax retained from resident synthesis cache · no rebuild'
    : protectedCount
      ? 'protected imported synthesis merged with live/stack syntax · no autonomous overwrite'
      : includeCurrent
        ? 'synthesized imported stack + current run for explicit export'
        : 'synthesized imported stack only';
  updateColdBankStats();
  return coldBankSynthesis;
}
function applyColdBankCompression(syn) {
  const c = syn?.compression || {};
  coldBankFullness = clamp(Number(c.synthesisFullness || 0), 0, 1);
  coldBankTension = clamp(Number(c.coldBankTension || 0), 0, 1);
  coldBankAxisPhase = Number.isFinite(c.axisPhase) ? Number(c.axisPhase) : 0;
  coldBankPlateauPressure = clamp(Number(c.plateauPressure || 0), 0, 1);
  coldBankTokenPressure = clamp(Number(c.tokenPressure || 0) + 0.12 * Number(c.oneSumPressure || 0) + 0.20 * Number(c.twoSumPressure || 0) + 0.28 * Number(c.threeSumPressure || 0), 0, 1);
  coldBankMarriagePressure = clamp(Number(c.marriagePressure || 0) + 0.08 * Number(c.oneSumPressure || 0) + 0.16 * Number(c.twoSumPressure || 0) + 0.24 * Number(c.threeSumPressure || 0), 0, 1);
  updateColdMemoryBankFromSynthesis(syn);
}
function coldBankRunModeLabel(mode = selectedColdBankResetMode()) {
  return registryLabel(COLD_BANK_RESET_MODES, mode, 'off', 'shortLabel');
}
function selectedColdBankResetMode() {
  return 'off';
}
function coldBankModeShaderValue(mode = coldBankActiveMode) {
  return 0;
}
function activeColdBankLabel() {
  return 'off';
}
function updateColdBankStats() {
  return;
}
async function importSyntaxColdBankFiles(fileList) {
  return;
}
function clearSyntaxColdBank() {
  return;
}
function distillColdBank() {
  return;
}
function exportSynthesisSyntax() {
  return;
}
function hash32(parts) {
  let h = 2166136261 >>> 0;
  for (const p of parts) {
    let v = Math.floor(Math.abs(p) * 1000003) >>> 0;
    h ^= v;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
function phaseOfPixel(pixels, idx) {
  const x = pixels[idx];
  const y = pixels[idx + 1];
  const z = -pixels[idx + 2];
  const w = -pixels[idx + 3];
  return Math.atan2(y + w, x + z + 1e-12);
}
function phaseDelta(a, b) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}
function matrixIndexAt(size, x, y) {
  return ((y & (size - 1)) * size + (x & (size - 1))) * 4;
}
function matrixEnergyAt(pixels, idx) {
  return pixels[idx] * pixels[idx]
    + pixels[idx + 1] * pixels[idx + 1]
    + pixels[idx + 2] * pixels[idx + 2]
    + pixels[idx + 3] * pixels[idx + 3];
}
function makeMatrixScanSample(pixels, size, stride, x, y) {
  const i = matrixIndexAt(size, x, y);
  const sx = pixels[i], sy = pixels[i + 1], sz = pixels[i + 2], sw = pixels[i + 3];
  const energy = sx * sx + sy * sy + sz * sz + sw * sw;
  const zeroResidual = Math.abs(sx + sy + sz + sw);
  const visibleLen = Math.hypot(sx, sy) + 1e-12;
  const hiddenLen = Math.hypot(-sz, -sw) + 1e-12;
  const closure = clamp((sx * -sz + sy * -sw) / (visibleLen * hiddenLen) * 0.5 + 0.5, 0, 1);
  const ixp = matrixIndexAt(size, x + stride, y);
  const ixm = matrixIndexAt(size, x - stride, y);
  const iyp = matrixIndexAt(size, x, y + stride);
  const iym = matrixIndexAt(size, x, y - stride);
  const ex = matrixEnergyAt(pixels, ixp) - matrixEnergyAt(pixels, ixm);
  const ey = matrixEnergyAt(pixels, iyp) - matrixEnergyAt(pixels, iym);
  const diff = Math.hypot(ex, ey);
  const phase = phaseOfPixel(pixels, i);
  const winding = Math.hypot(
    phaseDelta(phaseOfPixel(pixels, ixp), phaseOfPixel(pixels, ixm)),
    phaseDelta(phaseOfPixel(pixels, iyp), phaseOfPixel(pixels, iym))
  ) / Math.PI;
  return {
    x,
    y,
    i,
    ixp,
    ixm,
    iyp,
    iym,
    u: x / size,
    v: y / size,
    cellX: Math.floor(x / stride),
    cellY: Math.floor(y / stride),
    sx,
    sy,
    sz,
    sw,
    energy,
    zeroResidual,
    closure,
    diff,
    phase,
    winding,
    axisX: sx - sz,
    axisY: sy - sw
  };
}
function scanMatrix(pixels, options = {}) {
  if (!pixels || !pixels.length) throw new Error('scanMatrix requires a state pixel buffer');
  const size = Number(options.size || MATRIX_SIZE);
  const stride = Math.max(1, Math.floor(Number(options.stride || 8)));
  const reducers = (options.reducers || []).filter(Boolean);
  const context = {
    pixels,
    size,
    stride,
    sampleCount: 0,
    meta: options.meta || {},
    signatures: [],
    signatureKinds: {},
    zeroSumSignatureCount: 0,
    results: {}
  };
  for (const reducer of reducers) {
    if (typeof reducer.begin === 'function') reducer.begin(context);
  }
  for (let y = 0; y < size; y += stride) {
    for (let x = 0; x < size; x += stride) {
      const sample = makeMatrixScanSample(pixels, size, stride, x, y);
      context.sampleCount += 1;
      for (const reducer of reducers) {
        if (typeof reducer.sample === 'function') reducer.sample(sample, context);
      }
    }
  }
  for (const reducer of reducers) {
    const name = reducer.name || 'anonymous';
    if (typeof reducer.finalize === 'function') context.results[name] = reducer.finalize(context);
  }
  return context;
}
function readAndScanMatrix(a, options = {}) {
  const pixels = options.pixels || readCurrentStatePixels(a);
  return scanMatrix(pixels, { ...options, size: options.size || a.size });
}
function createPlateauReducer(maxPlateaus = 8) {
  const buckets = new Map();
  let sampleCount = 0;
  return {
    name: 'plateaus',
    sample(sample) {
      const tuple = [
        quantizeStateValue(sample.sx),
        quantizeStateValue(sample.sy),
        quantizeStateValue(sample.sz),
        quantizeStateValue(sample.sw)
      ];
      const key = tuple.join(',');
      let b = buckets.get(key);
      if (!b) {
        b = { tuple, count: 0, zeroResidual: 0, closure: 0, phaseX: 0, phaseY: 0 };
        buckets.set(key, b);
      }
      const zeroResidual = Math.abs(tuple[0] + tuple[1] + tuple[2] + tuple[3]);
      const visibleLen = Math.hypot(tuple[0], tuple[1]) + 1e-12;
      const hiddenLen = Math.hypot(-tuple[2], -tuple[3]) + 1e-12;
      const closure = clamp((tuple[0] * -tuple[2] + tuple[1] * -tuple[3]) / (visibleLen * hiddenLen) * 0.5 + 0.5, 0, 1);
      const phase = phaseFromStateTuple(tuple);
      b.count += 1;
      b.zeroResidual += zeroResidual;
      b.closure += closure;
      b.phaseX += Math.cos(phase);
      b.phaseY += Math.sin(phase);
      sampleCount += 1;
    },
    finalize(context) {
      const plateaus = Array.from(buckets.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, maxPlateaus)
        .map((b, idx) => {
          const phase = Math.atan2(b.phaseY, b.phaseX);
          return {
            hash: stateTupleHash(b.tuple),
            role: idx === 0 ? 'dominant_global_plateau' : 'support_plateau',
            coverage: Number((b.count / Math.max(1, sampleCount)).toFixed(4)),
            meanState: b.tuple.map(v => Number(v.toFixed(6))),
            phase: Number(phase.toFixed(5)),
            zeroResidual: Number((b.zeroResidual / Math.max(1, b.count)).toExponential(3)),
            closure: Number((b.closure / Math.max(1, b.count)).toFixed(4)),
            source: 'matrix-sampled'
          };
        }).filter(p => p.coverage >= 0.015 || p.role === 'dominant_global_plateau');
      for (const p of plateaus) {
        emitFrontierSignature(context, {
          kind: 'plateau', detail: p.role, bucket: p.hash, phaseBin: phaseBin(p.phase, 24),
          fitBin: frontierBin(1 / (1 + Number(p.zeroResidual || 0) * 120), 8),
          trustBin: frontierBin(p.coverage, 8), zeroBin: frontierBin(p.closure, 8),
          trust: clamp(Number(p.coverage || 0) * 4, 0, 1), route: 'coldBank', zeroSum: true
        });
      }
      return plateaus;
    }
  };
}
function createResidentSignalReducer() {
  const candidates = [];
  let sampleCount = 0;
  let energySum = 0;
  let residualSum = 0;
  let closureSum = 0;
  let infoSum = 0;
  let infoMax = 0;
  return {
    name: 'residentSignal',
    sample(sample, context) {
      const info = clamp(Math.log2(1 + 28 * sample.energy + 90 * sample.diff + 2.4 * sample.winding) / 6, 0, 1) * (0.35 + 0.65 * sample.closure);
      const closed = info * sample.closure * (1 / (1 + sample.zeroResidual * 120));
      sampleCount += 1;
      energySum += sample.energy;
      residualSum += sample.zeroResidual;
      closureSum += sample.closure;
      infoSum += info;
      infoMax = Math.max(infoMax, info);
      const score = info * (0.35 + 0.65 * sample.closure) * (0.25 + 0.75 / (1 + sample.zeroResidual * 90)) * (0.65 + 0.35 * Math.min(1, sample.winding));
      if (score > 0.20) {
        const h = hash32([
          Math.floor(sample.phase * 64),
          Math.floor(sample.closure * 32),
          Math.floor(sample.zeroResidual * 4096),
          Math.floor(sample.winding * 64),
          sample.cellX,
          sample.cellY
        ]).toString(16).padStart(8, '0');
        const cand = {
          hash: 'zsig_' + h,
          center: [Number(sample.u.toFixed(5)), Number(sample.v.toFixed(5))],
          phase: sample.phase,
          zeroResidual: sample.zeroResidual,
          energy: sample.energy,
          diff: sample.diff,
          closure: sample.closure,
          winding: sample.winding,
          closed,
          info,
          score,
          role: 'residue_word',
          mode: 'iota'
        };
        cand.role = classifyZeroToken(cand);
        cand.mode = tokenModeForRole(cand.role);
        emitScanSampleSignature(context, sample, cand.role === 'zero_axis' ? 'zero-axis' : cand.role, cand.mode, cand.info, 'syntax');
        candidates.push(cand);
      }
    },
    finalize() {
      candidates.sort((a, b) => b.score - a.score);
      const inv = 1 / Math.max(1, sampleCount);
      return {
        candidates,
        sampleCount,
        energyMeanRaw: energySum * inv,
        zeroResidualMeanRaw: residualSum * inv,
        closureMeanRaw: closureSum * inv,
        infoMeanRaw: infoSum * inv,
        infoMax
      };
    }
  };
}
function createPhaseLawReducer() {
  let sampleCount = 0;
  let axisX = 0;
  let axisY = 0;
  let closureSum = 0;
  let zeroResidualSum = 0;
  let phaseX = 0;
  let phaseY = 0;
  let energySum = 0;
  return {
    name: 'phaseLaw',
    sample(sample) {
      const phase = Math.atan2(sample.axisY, sample.axisX + 1e-12);
      sampleCount += 1;
      axisX += sample.axisX;
      axisY += sample.axisY;
      phaseX += Math.cos(phase);
      phaseY += Math.sin(phase);
      closureSum += sample.closure;
      zeroResidualSum += sample.zeroResidual;
      energySum += sample.energy;
    },
    finalize(context) {
      if (!sampleCount) return phaseLaw;
      const axisPhase = Math.atan2(axisY, axisX + 1e-12);
      const ux = Math.cos(axisPhase);
      const uy = Math.sin(axisPhase);
      let amplitudeSum = 0;
      let amplitudeSqSum = 0;
      let residualSqSum = 0;
      let totalSqSum = 0;
      const { pixels, size, stride } = context;
      for (let y = 0; y < size; y += stride) {
        for (let x = 0; x < size; x += stride) {
          const i = matrixIndexAt(size, x, y);
          const sx = pixels[i], sy = pixels[i + 1], sz = pixels[i + 2], sw = pixels[i + 3];
          const amplitude = (sx * ux + sy * uy - sz * ux - sw * uy) * 0.5;
          const px = amplitude * ux;
          const py = amplitude * uy;
          const pz = -amplitude * ux;
          const pw = -amplitude * uy;
          residualSqSum += (sx - px) * (sx - px) + (sy - py) * (sy - py) + (sz - pz) * (sz - pz) + (sw - pw) * (sw - pw);
          totalSqSum += sx * sx + sy * sy + sz * sz + sw * sw;
          const absAmplitude = Math.abs(amplitude);
          amplitudeSum += absAmplitude;
          amplitudeSqSum += absAmplitude * absAmplitude;
        }
      }
      const inv = 1 / Math.max(1, sampleCount);
      const amplitudeMean = amplitudeSum * inv;
      const amplitudeVariance = Math.max(0, amplitudeSqSum * inv - amplitudeMean * amplitudeMean);
      const phaseSpread = clamp(1 - Math.hypot(phaseX * inv, phaseY * inv), 0, 1);
      const residual = Math.sqrt(residualSqSum / Math.max(1e-12, totalSqSum));
      emitFrontierSignature(context, {
        kind: 'phase-law', detail: 'axis-fit', bucket: phaseBin(axisPhase, 24), phaseBin: phaseBin(axisPhase, 24),
        fitBin: frontierBin(1 / (1 + residual * 12), 8), trustBin: frontierBin(1 - phaseSpread, 8),
        zeroBin: frontierBin(1 / (1 + (zeroResidualSum * inv) * 120), 8), trust: clamp(1 - residual, 0, 1),
        route: 'phaseLaw', phase: axisPhase, zeroResidual: zeroResidualSum * inv, closure: closureSum * inv, winding: 1 - phaseSpread, zeroSum: true
      });
      phaseLaw = {
        ...phaseLaw,
        axisPhase: Number(axisPhase.toFixed(6)),
        amplitudeMean: Number(amplitudeMean.toExponential(4)),
        amplitudeSpread: Number(Math.sqrt(amplitudeVariance).toExponential(4)),
        residual: Number(residual.toExponential(4)),
        closure: Number((closureSum * inv).toFixed(6)),
        phaseSpread: Number(phaseSpread.toExponential(4)),
        zeroResidualMean: Number((zeroResidualSum * inv).toExponential(4)),
        energyMean: Number((energySum * inv).toExponential(4)),
        scans: Number(phaseLaw.scans || 0) + 1,
        lastRefinedTick: tick,
        lastRefinedSimTime: Number(simTime.toFixed(4)),
        macroStack: makePhaseLawMacroStack(axisPhase, amplitudeMean),
        lastMessage: 'law refined · axis ' + axisPhase.toFixed(3) + ' · residual ' + residual.toExponential(2)
      };
      return phaseLaw;
    }
  };
}
function createAutonomyReducer(options = {}) {
  const cellEvery = Math.max(1, Math.floor(Number(options.cellEvery || 1)));
  let sampleCount = 0;
  let energySum = 0;
  let residualSum = 0;
  let closureSum = 0;
  let diffSum = 0;
  let cosSum = 0;
  let sinSum = 0;
  let axisX = 0;
  let axisY = 0;
  return {
    name: 'autonomy',
    sample(sample) {
      if ((sample.cellX % cellEvery) !== 0 || (sample.cellY % cellEvery) !== 0) return;
      sampleCount += 1;
      energySum += sample.energy;
      residualSum += sample.zeroResidual;
      closureSum += sample.closure;
      diffSum += sample.diff;
      cosSum += Math.cos(sample.phase);
      sinSum += Math.sin(sample.phase);
      axisX += sample.axisX;
      axisY += sample.axisY;
    },
    finalize(context) {
      const inv = 1 / Math.max(1, sampleCount);
      const energyMean = energySum * inv;
      const zeroResidualMean = residualSum * inv;
      const closureMean = closureSum * inv;
      const diffMean = diffSum * inv;
      const resultant = Math.hypot(cosSum * inv, sinSum * inv);
      const phaseSpread = clamp(1 - resultant, 0, 1);
      const zeroFit = 1 / (1 + zeroResidualMean * 70);
      const energyBand = clamp(Math.log2(1 + energyMean * 420) / 6, 0, 1);
      const diffBand = clamp(Math.log2(1 + diffMean * 1400) / 6, 0, 1);
      const prev = autonomyDiagnostics || makeEmptyAutonomyDiagnostics();
      const complexity = clamp(
        0.18 * zeroFit
        + 0.19 * closureMean
        + 0.24 * energyBand
        + 0.24 * diffBand
        + 0.15 * phaseSpread,
        0,
        1
      );
      const noveltyRaw = clamp(
        Math.abs(complexity - Number(prev.complexity || 0)) * 3.5
        + Math.abs(diffBand - Number(prev.diffBand || 0)) * 1.4
        + Math.abs(phaseSpread - Number(prev.phaseSpread || 0)) * 1.2
        + Math.abs(energyBand - Number(prev.energyBand || 0)) * 1.1,
        0,
        1
      );
      const lowNovelty = noveltyRaw < 0.028 && diffBand < 0.36 && phaseSpread < 0.50;
      const nextStagnation = clamp((Number(prev.stagnation || 0) * 0.86) + (lowNovelty ? 0.15 : -0.08), 0, 1);
      const pressureRaw = clamp(complexity * 0.74 + noveltyRaw * 0.18 + nextStagnation * 0.30, 0, 1);
      autonomyPressure = clamp(autonomyPressure * 0.65 + pressureRaw * 0.35, 0, 1);
      autonomyNovelty = clamp(autonomyNovelty * 0.55 + noveltyRaw * 0.45, 0, 1);
      autonomyStagnation = nextStagnation;
      autonomyPhase = Math.atan2(axisY, axisX + 1e-12);
      emitFrontierSignature(context, {
        kind: 'autonomy', detail: lowNovelty ? 'low-novelty' : 'live-pressure', bucket: phaseBin(autonomyPhase, 24),
        phaseBin: phaseBin(autonomyPhase, 24), fitBin: frontierBin(zeroFit, 8), trustBin: frontierBin(complexity, 8),
        zeroBin: frontierBin(closureMean, 8), trust: complexity, route: 'explore', zeroSum: false
      });
      return {
        active: autonomousActive,
        mode: autonomousMode,
        scanCount: (Number(prev.scanCount || 0) + 1),
        lastScanTick: tick,
        complexity: Number(complexity.toFixed(4)),
        pressure: Number(autonomyPressure.toFixed(4)),
        novelty: Number(autonomyNovelty.toFixed(4)),
        stagnation: Number(autonomyStagnation.toFixed(4)),
        zeroFit: Number(zeroFit.toFixed(4)),
        closureMean: Number(closureMean.toFixed(4)),
        phaseSpread: Number(phaseSpread.toFixed(4)),
        diffBand: Number(diffBand.toFixed(4)),
        energyBand: Number(energyBand.toFixed(4)),
        routed: false,
        lastRoute: prev.lastRoute || 'none',
        note: 'live matrix feedback'
      };
    }
  };
}
function refineZeroPhaseLawFromPixels(pixels, size = MATRIX_SIZE, stride = 8) {
  if (!pixels || !pixels.length) return phaseLaw;
  const scan = scanMatrix(pixels, {
    size,
    stride,
    reducers: [createPhaseLawReducer()]
  });
  updateSymmetricFrontierFromScan(scan, { source: 'phase-law-refine' });
  return scan.results.phaseLaw || phaseLaw;
}
function phaseLawAttemptKey(macro) {
  return [
    macro.index,
    phaseBin(Number(phaseLaw.axisPhase || 0), PHASE_LAW_MACRO_COUNT * 2),
    macro.envelopeMode
  ].join(':');
}
function selectUnrecentPhaseLawMacro() {
  const recent = new Set((phaseLaw.recentAttempts || []).slice(0, PHASE_LAW_RECENT_ATTEMPT_LIMIT).map(a => a.key));
  const untried = (phaseLaw.macroStack || []).find(m => !recent.has(phaseLawAttemptKey(m)));
  if (untried) return untried;
  return (phaseLaw.macroStack || [])[Number(phaseLaw.eventAttempt || 0) % PHASE_LAW_MACRO_COUNT] || null;
}
function updatePhaseLawAttemptResult(result) {
  const attempts = (phaseLaw.recentAttempts || []).slice();
  if (attempts[0]) attempts[0] = { ...attempts[0], result, completedTick: tick, completedSimTime: Number(simTime.toFixed(4)) };
  phaseLaw = { ...phaseLaw, recentAttempts: attempts };
}
function startZeroPhaseLawEvent(macro) {
  if (!app?.kind || app.kind !== 'webgl2' || !macro) return false;
  const key = phaseLawAttemptKey(macro);
  const attempt = Number(phaseLaw.eventAttempt || 0) + 1;
  phaseLaw = {
    ...phaseLaw,
    eventActive: true,
    eventMacroIndex: macro.index,
    eventAttempt: attempt,
    eventStartedTick: tick,
    eventStartedPerf: performance.now(),
    birthReadback: false,
    recentAttempts: [{
      key,
      macroIndex: macro.index,
      macroName: macro.name,
      axisPhase: phaseLaw.axisPhase,
      tick,
      simTime: Number(simTime.toFixed(4)),
      result: 'attempting'
    }, ...(phaseLaw.recentAttempts || [])].slice(0, PHASE_LAW_RECENT_ATTEMPT_LIMIT),
    macroStack: (phaseLaw.macroStack || []).map(m => m.index === macro.index ? { ...m, lastAttemptTick: tick, lastResult: 'attempting' } : m),
    lastMessage: 'Zero phase-law start · macro ' + macro.index + ' ' + macro.name + ' · carrying Resident Signal fullness ' + residentSignalFullness.toFixed(3)
  };
  autonomousActive = true;
  autonomousMode = 'full';
  residentSignal = true;
  setActiveStepRegimeIndex(stepRegimeIndexByName('q1-1'));
  tick = 0;
  simTime = 0;
  simAccumulator = 0;
  lastNow = performance.now();
  clearRenderTargets(app, app.stateTargets, app.size);
  stats.matrix.textContent = app.fmt.label + ' · ' + app.size + '² zero phase-law start';
  stats.log.textContent = phaseLaw.lastMessage + '. Classic neighbor-difference computation is bypassed inside the simulation shader until birth readback or no-birth fallback.';
  updateStats();
  return true;
}
function maybeAttemptZeroPhaseLawStart() {
  if (!(autonomousActive && autonomousMode === 'full' && residentSignal)) return false;
  if (phaseLaw.eventActive) return false;
  if (!(effectivePhaseLawStartSignal() >= PHASE_LAW_FULLNESS_START_THRESHOLD)) return false;
  return startZeroPhaseLawEvent(selectUnrecentPhaseLawMacro());
}
function phaseLawBirthStarted(metrics) {
  return Boolean(metrics && metrics.sampleCount > 0 && (
    Number(metrics.energyMean || 0) > 0.000001
    || Number(metrics.infoMean || 0) > 0.0005
    || Number(metrics.tokenCount || 0) > 0
  ));
}
function markPhaseLawBirthReadback(metrics) {
  if (!phaseLaw.eventActive || phaseLaw.birthReadback || !phaseLawBirthStarted(metrics)) return;
  updatePhaseLawAttemptResult('birth-readback');
  phaseLaw = {
    ...phaseLaw,
    birthReadback: true,
    lastMessage: 'phase-law universe started · readback energy ' + Number(metrics.energyMean || 0).toExponential(2) + ' · info ' + Number(metrics.infoMean || 0).toFixed(4)
  };
}
function restartClassicWithPhaseLawCarry(reason) {
  if (!app?.kind || app.kind !== 'webgl2') return;
  updatePhaseLawAttemptResult(reason);
  phaseLaw = {
    ...phaseLaw,
    eventActive: false,
    birthReadback: false,
    macroStack: (phaseLaw.macroStack || []).map(m => m.index === phaseLaw.eventMacroIndex ? { ...m, lastAttemptTick: tick, lastResult: reason } : m),
    lastMessage: 'classic restart after ' + reason + ' · carrying zero-sum phase law'
  };
  autonomousActive = true;
  autonomousMode = 'full';
  residentSignal = true;
  setActiveStepRegimeIndex(selectAutonomousStepRegime('full', autonomyRoutingSignal()));
  resetAutonomyController('full');
  tick = 0;
  simTime = 0;
  simAccumulator = 0;
  lastNow = performance.now();
  clearRenderTargets(app, app.stateTargets, app.size);
  stats.matrix.textContent = app.fmt.label + ' · ' + app.size + '² classic carry restart';
  stats.log.textContent = phaseLaw.lastMessage + '. The next full Resident Signal condition will choose a not-recently-tried macro.';
  updateStats();
}
function maybeRecoverFailedPhaseLawStart() {
  if (!phaseLaw.eventActive || phaseLaw.birthReadback || !phaseLaw.eventStartedPerf) return false;
  const elapsed = (performance.now() - phaseLaw.eventStartedPerf) / 1000;
  if (elapsed >= PHASE_LAW_NO_BIRTH_SECONDS) {
    restartClassicWithPhaseLawCarry('no-birth-readback-30s');
    return true;
  }
  return false;
}
function classifyZeroToken(t) {
  if (t.closed > 0.78 && t.info > 0.72) return 'closed_boundary_lock';
  if (Math.abs(t.winding) > 0.90) return 'winding_axis';
  if (t.zeroResidual < 0.012 && t.closure > 0.62) return 'zero_axis';
  if (t.diff > 0.060) return 'gate_edge';
  if (t.energy > 0.38 && t.closure > 0.45) return 'root_store';
  return 'residue_word';
}
function tokenModeForRole(role) {
  if (role === 'closed_boundary_lock') return 'theta';
  if (role === 'winding_axis') return 'digamma';
  if (role === 'zero_axis') return 'alpha';
  if (role === 'gate_edge') return 'beta';
  if (role === 'root_store') return 'gamma';
  return 'iota';
}
function updateLexiconToken(candidate) {
  const existing = residentSignalLexicon.get(candidate.hash);
  if (!existing) {
    residentSignalLexicon.set(candidate.hash, {
      ...candidate,
      count: 1,
      persistence: 1,
      firstTick: tick,
      lastTick: tick
    });
    return;
  }
  const k = 1 / (existing.count + 1);
  existing.count += 1;
  existing.persistence += tick - existing.lastTick > 0 ? 1 : 0;
  existing.lastTick = tick;
  existing.center[0] = existing.center[0] * (1 - k) + candidate.center[0] * k;
  existing.center[1] = existing.center[1] * (1 - k) + candidate.center[1] * k;
  existing.phase = Math.atan2(
    Math.sin(existing.phase) * (1 - k) + Math.sin(candidate.phase) * k,
    Math.cos(existing.phase) * (1 - k) + Math.cos(candidate.phase) * k
  );
  for (const key of ['zeroResidual', 'energy', 'diff', 'closure', 'winding', 'closed', 'info', 'score']) {
    existing[key] = existing[key] * (1 - k) + candidate[key] * k;
  }
  existing.role = classifyZeroToken(existing);
  existing.mode = tokenModeForRole(existing.role);
}
function torusDelta(a, b) {
  let d = b - a;
  if (d > 0.5) d -= 1.0;
  if (d < -0.5) d += 1.0;
  return d;
}
function buildResidentSignalRelations(tokens) {
  const nodes = tokens.slice(0, 32);
  const relations = [];
  for (let i = 0; i < nodes.length; i++) {
    let best = null;
    for (let j = 0; j < nodes.length; j++) {
      if (i === j) continue;
      const a = nodes[i];
      const b = nodes[j];
      const dx = torusDelta(a.center[0], b.center[0]);
      const dy = torusDelta(a.center[1], b.center[1]);
      const dist = Math.hypot(dx, dy);
      const pd = phaseDelta(b.phase, a.phase);
      const cancel = 1 / (1 + Math.abs(a.zeroResidual + b.zeroResidual) * 80);
      const support = (0.45 * cancel + 0.35 * (1 - Math.min(1, dist * 2.2)) + 0.20 * (0.5 + 0.5 * Math.cos(pd))) * Math.min(a.info, b.info);
      if (!best || support > best.support) {
        const wrap = Math.abs(b.center[0] - a.center[0]) > 0.5 ? 'torus_x' : Math.abs(b.center[1] - a.center[1]) > 0.5 ? 'torus_y' : 'local';
        best = { from: a.hash, to: b.hash, relation: cancel > 0.72 ? 'zero_cancel' : Math.abs(pd) > Math.PI * 0.72 ? 'counterwound' : 'phase_route', phaseDelta: Number(pd.toFixed(5)), distance: Number(dist.toFixed(5)), wrap, support };
      }
    }
    if (best && best.support > 0.035) relations.push({ ...best, support: Number(best.support.toFixed(5)) });
  }
  return relations.slice(0, 48);
}

function residentSyntaxBlockFresh(maxAgeTicks = RESIDENT_RESIDENT_SIGNAL_MAX_AGE_TICKS) {
  const block = syntaxResidency.latestBlock;
  if (!block || block.length < SYNTAX_BLOCK_FLOATS) return false;
  if (!(Number(syntaxResidency.latestTick) > 0)) return false;
  return (tick - Number(syntaxResidency.latestTick || 0)) <= maxAgeTicks;
}
function residentSyntaxTokensFromBlock(block, maxTokens = RESIDENT_SIGNAL_MAX_TOKENS) {
  const out = [];
  if (!block || block.length < SYNTAX_BLOCK_FLOATS) return out;
  const cap = Math.min(COMPILED_ZERO_SUM_TOKEN_CAP, Math.max(1, Math.floor(Number(maxTokens) || COMPILED_ZERO_SUM_TOKEN_CAP)));
  for (let i = 0; i < cap; i++) {
    const j = i * 4;
    const score = clamp(Number(block[j + 3]) || 0, 0, 1);
    if (!(score > 0.001)) continue;
    const cx = wrap01(Number(block[j]) || 0);
    const cy = wrap01(Number(block[j + 1]) || 0);
    const phase = Number(block[j + 2]) || 0;
    const residual = Math.max(0, Number(block[SYNTAX_BLOCK_TOKEN_FLOATS + j]) || 0);
    const closure = clamp(Number(block[SYNTAX_BLOCK_TOKEN_FLOATS + j + 1]) || 0, 0, 1);
    const winding = clamp(Number(block[SYNTAX_BLOCK_TOKEN_FLOATS + j + 2]) || 0, 0, 1);
    const persistence = Math.max(1, Math.round(1 + 5 * clamp(Number(block[SYNTAX_BLOCK_TOKEN_FLOATS + j + 3]) || score, 0, 1)));
    const info = clamp(score * (0.55 + 0.45 * closure), 0, 1);
    const energy = score;
    const diff = score * (0.30 + 0.70 * winding);
    const closed = info * closure * (1 / (1 + residual * 120));
    const hash = 'rsig_' + hashString32(['resident', i, Math.round(cx * 65535), Math.round(cy * 65535), Math.round(phase * 1000), Math.round(residual * 8192)].join('|')).toString(16).padStart(8, '0');
    const token = { hash, token: 'rs_' + hash.slice(-4), role: 'residue_word', mode: 'iota', center: [cx, cy], phase, zeroResidual: residual, energy, diff, closure, winding, closed, info, score, persistence, count: persistence };
    token.role = classifyZeroToken(token);
    token.mode = tokenModeForRole(token.role);
    out.push(token);
  }
  return out.sort((a, b) => b.score - a.score).slice(0, maxTokens);
}
function shouldUseResidentResidentSignalScan() {
  if (!RESIDENT_RESIDENT_SIGNAL_FAST_PATH || !residentSyntaxBlockFresh()) return false;
  if (!(Number(residentSignalLastFullScanTick) > 0)) return false;
  const scansSinceFull = Math.max(0, Number(residentSignalScanSerial || 0));
  const fullDueByCount = scansSinceFull > 0 && (scansSinceFull % RESIDENT_RESIDENT_SIGNAL_FULL_SCAN_EVERY) === 0;
  const fullDueByTime = (simTime - residentSignalLastFullScanTime) >= RESIDENT_RESIDENT_SIGNAL_FULL_SCAN_MIN_SECONDS
    && (tick - residentSignalLastFullScanTick) >= Math.floor(RESIDENT_RESIDENT_SIGNAL_FULL_SCAN_MIN_SECONDS * 60);
  return !(fullDueByCount && fullDueByTime);
}
function applyResidentResidentSignalScan() {
  const block = syntaxResidency.latestBlock;
  const residentMetrics = syntaxResidency.latestMetrics || {};
  const candidates = residentSyntaxTokensFromBlock(block, RESIDENT_SIGNAL_MAX_TOKENS);
  for (const c of candidates.slice(0, 40)) updateLexiconToken(c);
  const tokens = Array.from(residentSignalLexicon.values())
    .filter(t => tick - t.lastTick < RESIDENT_SIGNAL_SCAN_INTERVAL_TICKS * 5)
    .sort((a, b) => (b.persistence * b.score) - (a.persistence * a.score))
    .slice(0, RESIDENT_SIGNAL_MAX_TOKENS)
    .map(t => ({
      token: t.mode + '_' + t.hash.slice(-4),
      hash: t.hash,
      role: t.role,
      mode: t.mode,
      center: [Number(t.center[0].toFixed(5)), Number(t.center[1].toFixed(5))],
      phase: Number(t.phase.toFixed(5)),
      zeroResidual: Number(t.zeroResidual.toExponential(3)),
      closure: Number(t.closure.toFixed(4)),
      winding: Number(t.winding.toFixed(4)),
      info: Number(t.info.toFixed(4)),
      persistence: t.persistence,
      count: t.count
    }));
  residentSignalLexicon = new Map(Array.from(residentSignalLexicon.entries()).filter(([, t]) => tick - t.lastTick < RESIDENT_SIGNAL_SCAN_INTERVAL_TICKS * 5));
  const persistentTokenCount = tokens.filter(t => t.persistence >= 2).length;
  const sumLayers = buildSumSyntaxLayers(tokens);
  const sumLayerMetrics = summarizeSumLayers(sumLayers);
  const closureMean = clamp(Number(residentMetrics.closureMean || 0), 0, 1);
  const zeroResidualMean = Math.max(0, Number(residentMetrics.zeroResidualMean || 0));
  const infoMean = clamp(Number(residentMetrics.infoMean || 0), 0, 1);
  const infoMax = clamp(Number(residentMetrics.infoMax || 0), 0, 1);
  const saturation = clamp(0.42 * infoMean + 0.32 * infoMax + 0.26 * clamp(persistentTokenCount / 28, 0, 1), 0, 1);
  const zeroFit = 1 / (1 + zeroResidualMean * 70);
  const syntaxStability = clamp(persistentTokenCount / Math.max(8, Math.sqrt(Math.max(1, tokens.length)) * 5), 0, 1);
  const fullnessRaw = clamp((0.36 * saturation + 0.28 * closureMean + 0.22 * zeroFit + 0.14 * syntaxStability), 0, 1);
  residentSignalFullness = residentSignalFullness * 0.78 + fullnessRaw * 0.22;
  const metrics = {
    sampleCount: Number(residentMetrics.sampleCount || 0),
    energyMean: Number((Number(residentMetrics.energyMean || 0)).toExponential(3)),
    zeroResidualMean: Number(zeroResidualMean.toExponential(3)),
    closureMean: Number(closureMean.toFixed(4)),
    infoMean: Number(infoMean.toFixed(4)),
    infoMax: Number(infoMax.toFixed(4)),
    saturation: Number(saturation.toFixed(4)),
    zeroFit: Number(zeroFit.toFixed(4)),
    syntaxStability: Number(syntaxStability.toFixed(4)),
    fullness: Number(residentSignalFullness.toFixed(4)),
    tokenCount: tokens.length,
    persistentTokenCount,
    oneSumCount: sumLayerMetrics.oneSumCount,
    twoSumCount: sumLayerMetrics.twoSumCount,
    threeSumCount: sumLayerMetrics.threeSumCount,
    sumSyntaxFullness: sumLayerMetrics.sumSyntaxFullness,
    sumLayerMetrics,
    residentFastPath: true,
    residentRelations: Number(residentMetrics.relationCount || 0),
    residentCandidates: Number(residentMetrics.candidateCount || candidates.length)
  };
  const relations = buildResidentSignalRelations(tokens);
  const globalPlateaus = residentSignalManifest?.globalPlateaus || [];
  residentSignalManifest = {
    schema: ZERO_SYNTAX_SCHEMA,
    createdAt: new Date().toISOString(),
    epoch: residentSignalEpoch,
    compressionPhase: Number((residentSignalFullness * (0.5 + 0.5 * Math.sin(simTime * 0.31830988618 + residentSignalEpoch * 0.38196601125))).toFixed(8)),
    boundStable: residentSignalStableScans,
    tick,
    simTime: Number(simTime.toFixed(4)),
    stepRegime: currentStepRegime(),
    pinnedDescent,
    residentSignal,
    metrics,
    tokens,
    relations,
    sumLayers,
    sumLayerMetrics,
    globalPlateaus,
    note: 'Resident Resident Signal pass: syntax worker fed the compiler without forcing a main-thread matrix scan.'
  };
  const scan = { sampleCount: metrics.sampleCount, signatures: [], signatureKinds: {}, zeroSumSignatureCount: 0, results: {} };
  appendResidentSignalStructureSignatures(scan, tokens, relations, sumLayers);
  const frontierSummary = updateSymmetricFrontierFromScan(scan, { source: 'resident-resident-signal-scan' });
  compileZeroSumSyntaxFromManifest(residentSignalManifest, 'resident-resident-signal-scan');
  metrics.symmetricFrontier = frontierSummary;
  residentSignalManifest.symmetricFrontier = frontierSummary;
  if (residentSignal && metrics.fullness > 0.735 && metrics.persistentTokenCount >= 10 && metrics.closureMean > 0.50 && metrics.zeroFit > 0.70) {
    residentSignalStableScans += 1;
  } else {
    residentSignalStableScans = Math.max(0, residentSignalStableScans - 1);
  }
  return metrics;
}
function maybeRefreshContinuumListenSynthesis(reason = 'continuum-listen') {
  if (coldBankActiveMode !== 'continuum') return false;
  const ready = !(
    tick - coldBankListenLastRefreshTick < COLD_BANK_LISTEN_REFRESH_MIN_TICKS
    && simTime - coldBankListenLastRefreshTime < COLD_BANK_LISTEN_REFRESH_MIN_SECONDS
  );
  if (!ready) return false;
  coldBankListenLastRefreshTick = tick;
  coldBankListenLastRefreshTime = simTime;
  refreshColdBankSynthesis({ includeCurrent: false, reason });
  coldBankLastDiagnosticMessage = coldBankSynthesisCache?.lastHit
    ? 'Continuum ColdBank listening: resident cold syntax cache retained · ' + reason
    : 'Continuum ColdBank listening: staggered cold syntax refresh · ' + reason;
  return true;
}
function scanResidentSignalState(a, options = {}) {
  const reducers = [
    createResidentSignalReducer(),
    createPlateauReducer(8),
    createPhaseLawReducer()
  ];
  if (options.includeAutonomy) reducers.push(createAutonomyReducer({ cellEvery: 2 }));
  const scan = readAndScanMatrix(a, {
    stride: routeAdjustedStride(8),
    reducers,
    pixels: options.pixels
  });
  const lwScan = scan.results.residentSignal || createResidentSignalReducer().finalize();
  const candidates = lwScan.candidates || [];
  for (const c of candidates.slice(0, 40)) updateLexiconToken(c);
  const tokens = Array.from(residentSignalLexicon.values())
    .filter(t => tick - t.lastTick < RESIDENT_SIGNAL_SCAN_INTERVAL_TICKS * 5)
    .sort((a, b) => (b.persistence * b.score) - (a.persistence * a.score))
    .slice(0, RESIDENT_SIGNAL_MAX_TOKENS)
    .map(t => ({
      token: t.mode + '_' + t.hash.slice(-4),
      hash: t.hash,
      role: t.role,
      mode: t.mode,
      center: [Number(t.center[0].toFixed(5)), Number(t.center[1].toFixed(5))],
      phase: Number(t.phase.toFixed(5)),
      zeroResidual: Number(t.zeroResidual.toExponential(3)),
      closure: Number(t.closure.toFixed(4)),
      winding: Number(t.winding.toFixed(4)),
      info: Number(t.info.toFixed(4)),
      persistence: t.persistence,
      count: t.count
  }));
  residentSignalLexicon = new Map(Array.from(residentSignalLexicon.entries()).filter(([, t]) => tick - t.lastTick < RESIDENT_SIGNAL_SCAN_INTERVAL_TICKS * 5));
  const persistentTokenCount = tokens.filter(t => t.persistence >= 2).length;
  const sumLayers = buildSumSyntaxLayers(tokens);
  const sumLayerMetrics = summarizeSumLayers(sumLayers);
  const globalPlateaus = scan.results.plateaus || [];
  const closureMean = lwScan.closureMeanRaw || 0;
  const zeroResidualMean = lwScan.zeroResidualMeanRaw || 0;
  const infoMean = lwScan.infoMeanRaw || 0;
  const infoMax = lwScan.infoMax || 0;
  const saturation = clamp(0.42 * infoMean + 0.32 * infoMax + 0.26 * clamp(persistentTokenCount / 28, 0, 1), 0, 1);
  const zeroFit = 1 / (1 + zeroResidualMean * 70);
  const syntaxStability = clamp(persistentTokenCount / Math.max(8, Math.sqrt(Math.max(1, tokens.length)) * 5), 0, 1);
  const fullnessRaw = clamp((0.36 * saturation + 0.28 * closureMean + 0.22 * zeroFit + 0.14 * syntaxStability), 0, 1);
  residentSignalFullness = residentSignalFullness * 0.72 + fullnessRaw * 0.28;
  const metrics = {
    sampleCount: lwScan.sampleCount || scan.sampleCount,
    energyMean: Number((lwScan.energyMeanRaw || 0).toExponential(3)),
    zeroResidualMean: Number(zeroResidualMean.toExponential(3)),
    closureMean: Number(closureMean.toFixed(4)),
    infoMean: Number(infoMean.toFixed(4)),
    infoMax: Number(infoMax.toFixed(4)),
    saturation: Number(saturation.toFixed(4)),
    zeroFit: Number(zeroFit.toFixed(4)),
    syntaxStability: Number(syntaxStability.toFixed(4)),
    fullness: Number(residentSignalFullness.toFixed(4)),
    tokenCount: tokens.length,
    persistentTokenCount,
    oneSumCount: sumLayerMetrics.oneSumCount,
    twoSumCount: sumLayerMetrics.twoSumCount,
    threeSumCount: sumLayerMetrics.threeSumCount,
    sumSyntaxFullness: sumLayerMetrics.sumSyntaxFullness,
    sumLayerMetrics
  };
  const relations = buildResidentSignalRelations(tokens);
  residentSignalManifest = {
    schema: ZERO_SYNTAX_SCHEMA,
    createdAt: new Date().toISOString(),
    epoch: residentSignalEpoch,
    compressionPhase: Number((residentSignalFullness * (0.5 + 0.5 * Math.sin(simTime * 0.31830988618 + residentSignalEpoch * 0.38196601125))).toFixed(8)),
    boundStable: residentSignalStableScans,
    tick,
    simTime: Number(simTime.toFixed(4)),
    stepRegime: currentStepRegime(),
    pinnedDescent,
    residentSignal,
    metrics,
    tokens,
    relations,
    sumLayers,
    sumLayerMetrics,
    globalPlateaus,
    note: 'Zero-syntax manifest: compacted resonance addresses, graph relations, two-sum bonds, and three-sum clauses. It continuously binds to the witness; it does not clear, inject, or reseed the world.'
  };
  appendResidentSignalStructureSignatures(scan, tokens, relations, sumLayers);
  const frontierSummary = updateSymmetricFrontierFromScan(scan, { source: 'resident-signal-scan' });
  compileZeroSumSyntaxFromManifest(residentSignalManifest, 'resident-signal-scan');
  metrics.symmetricFrontier = frontierSummary;
  residentSignalManifest.symmetricFrontier = frontierSummary;
  if (residentSignal && metrics.fullness > 0.735 && metrics.persistentTokenCount >= 10 && metrics.closureMean > 0.50 && metrics.zeroFit > 0.70) {
    residentSignalStableScans += 1;
  } else {
    residentSignalStableScans = Math.max(0, residentSignalStableScans - 1);
  }
  return scan.results.autonomy ? { ...metrics, autonomyDiagnostics: scan.results.autonomy } : metrics;
}
function maybeScanResidentSignal() {
  return false;
}

function exportZeroSyntax() {
  if (!residentSignalManifest || !residentSignalManifest.schema) residentSignalManifest = makeEmptyResidentSignalManifest();
  const payload = { ...residentSignalManifest, exportedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const regime = currentStepRegime().name.replace(/[^a-z0-9-]+/gi, '-');
  link.href = href;
  link.download = 'chrysalis-zero-syntax-' + regime + '-epoch' + residentSignalEpoch + '-t' + tick + '.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
  const twoCount = payload.sumLayers?.two?.addresses?.length || 0;
  const threeCount = payload.sumLayers?.three?.addresses?.length || 0;
  stats.log.textContent = 'Exported Zero Syntax manifest: epoch ' + residentSignalEpoch + ' · zero tokens ' + (payload.tokens ? payload.tokens.length : 0) + ' · two-sum bonds ' + twoCount + ' · three-sum clauses ' + threeCount + ' · relations ' + (payload.relations ? payload.relations.length : 0) + ' · plateaus ' + (payload.globalPlateaus ? payload.globalPlateaus.length : 0) + '.';
}
function currentResolution() { return ui.resolutionOptions[ui.resolutionIndex]; }
function currentSimulationPixelScale() { return ui.simulationPixelScaleOptions[ui.simulationPixelScaleIndex] || SIMULATION_PIXEL_SCALE_OPTIONS[0]; }
function currentMatrixSize() { return Math.max(1, Math.floor(Number(currentSimulationPixelScale().size) || MATRIX_SIZE)); }
function simulationPixelSummary(size = app?.size || currentMatrixSize()) {
  const option = SIMULATION_PIXEL_SCALE_OPTIONS.find(o => Number(o.size) === Number(size)) || currentSimulationPixelScale();
  return option.shortLabel || (String(option.scale || 1) + '× ' + size + '²');
}
function childAtlasTargetSizeFor(size = currentMatrixSize()) {
  const relative = TARGET_CHILD_ATLAS_SIZE / MATRIX_SIZE;
  return Math.max(TARGET_CHILD_ATLAS_SIZE, Math.round(Math.max(1, size) * relative));
}
function currentViewingMode() { return ui.viewingModes[ui.viewingModeIndex]; }
function currentStepRegime() { return ui.stepRegimes[ui.stepRegimeIndex]; }
function currentViewLabel() {
  return registryLabel(VIEW_MODES, viewMode, VIEW_MODES[0].value);
}
function presentationSize() {
  const resolution = currentResolution();
  if (resolution.width && resolution.height) {
    return { width: resolution.width, height: resolution.height };
  }
  const scale = resolution.presentationScale || 1;
  return {
    width: Math.max(1, Math.round(BASE_PRESENT_WIDTH * scale)),
    height: Math.max(1, Math.round(BASE_PRESENT_HEIGHT * scale))
  };
}
function selectedResetRegimeIndex() {
  const node = el('stepRegimeOverride');
  const raw = node ? Number(node.value) : ui.stepRegimeIndex;
  return clamp(Number.isFinite(raw) ? raw : ui.stepRegimeIndex, 0, STEP_REGIMES.length - 1);
}
function stepRegimeIndexByName(name) {
  const idx = STEP_REGIMES.findIndex(r => r.name === name);
  return idx >= 0 ? idx : ui.stepRegimeIndex;
}
function riemannStepRegimeIndex() {
  const idx = STEP_REGIMES.findIndex(r => r.riemannMode);
  return idx >= 0 ? idx : stepRegimeIndexByName('six-6');
}
function setStepRegimeDropdownIndex(idx) {
  const node = el('stepRegimeOverride');
  if (node) node.value = String(clamp(Math.floor(idx), 0, STEP_REGIMES.length - 1));
}
function setActiveStepRegimeIndex(idx) {
  ui.stepRegimeIndex = clamp(Math.floor(idx), 0, STEP_REGIMES.length - 1);
}
function selectedAutonomousMode() {
  const node = el('autonomousMode');
  return registryValue(AUTONOMOUS_MODES, node ? node.value : autonomousMode, 'riemann');
}
function isFullAutonomyMode(mode = selectedAutonomousMode()) {
  const entry = registryEntryByValue(AUTONOMOUS_MODES, mode, 'riemann');
  return Boolean(entry && Number(entry.stepCap || 0) > 0);
}
function autonomyStepCapForMode(mode = selectedAutonomousMode()) {
  const entry = registryEntryByValue(AUTONOMOUS_MODES, mode, 'riemann');
  return Number(entry?.stepCap || AUTONOMY_STEP_CAP_SUBSTEPS);
}
function autonomyAllowedRegimeNamesForMode(mode = selectedAutonomousMode()) {
  const cap = autonomyStepCapForMode(mode);
  return AUTONOMY_STEP_REGIME_NAMES.filter(name => {
    const r = STEP_REGIMES[stepRegimeIndexByName(name)];
    return r && Number(r.substeps || 0) <= cap;
  });
}
function autonomyMaxRegimeNameForMode(mode = selectedAutonomousMode()) {
  const allowed = autonomyAllowedRegimeNamesForMode(mode);
  return allowed[allowed.length - 1] || 'q1-1';
}
function autonomyModeLabel(mode = selectedAutonomousMode()) {
  return registryLabel(AUTONOMOUS_MODES, mode, 'riemann', 'shortLabel');
}
function autonomyComplexitySignal() {
  const metrics = residentSignalManifest?.metrics || {};
  const sumMetrics = metrics.sumLayerMetrics || residentSignalManifest?.sumLayerMetrics || {};
  const compression = coldBankSynthesis?.compression || {};
  const live = autonomyDiagnostics || makeEmptyAutonomyDiagnostics();
  const signals = [
    residentSignalFullness,
    Number(metrics.fullness || 0),
    Number(metrics.saturation || 0) * 0.90,
    Number(metrics.syntaxStability || 0) * 0.95,
    Number(metrics.sumSyntaxFullness || 0),
    Number(sumMetrics.sumSyntaxFullness || 0),
    coldBankFullness,
    coldBankTension * 0.85,
    coldBankTokenPressure * 0.75,
    coldBankMarriagePressure * 0.85,
    Number(compression.sumSyntaxFullness || 0),
    Number(compression.synthesisFullness || 0),
    Number(compression.coldBankTension || 0) * 0.85,
    Number(live.complexity || 0),
    Number(live.pressure || 0) * 0.94,
    Number(live.stagnation || 0) * 0.72,
    Number(live.novelty || 0) * 0.62
  ].filter(Number.isFinite);
  return clamp(signals.length ? Math.max(...signals) : 0, 0, 1);
}
function legacyAutonomyRoutingSignal() {
  const cached = autonomyComplexitySignal();
  const live = autonomyDiagnostics || makeEmptyAutonomyDiagnostics();
  const explorationBoost = 0.22 * Number(live.stagnation || 0) + 0.12 * Number(live.novelty || 0);
  return clamp(0.58 * cached + 0.42 * Number(live.pressure || live.complexity || 0) + explorationBoost, 0, 1);
}
function frontierComputePressure(routes = frontierRoutes()) {
  if (!frontierRoutesReady()) return null;
  return clamp(
    0.10
    + 0.42 * (routes.compress || 0)
    + 0.70 * (routes.explore || 0)
    + 0.32 * (routes.phaseLaw || 0)
    + 0.22 * (routes.syntax || 0)
    - 0.30 * (routes.rest || 0)
    - 0.18 * (routes.audit || 0),
    0,
    1
  );
}
function autonomyRoutingSignal() {
  const fallback = legacyAutonomyRoutingSignal();
  const frontierPressure = frontierComputePressure();
  if (frontierPressure === null) return fallback;
  return clamp(0.72 * frontierPressure + 0.28 * fallback, 0, 1);
}
function autonomyStepRegimeIndexByName(name) {
  const fallbackName = AUTONOMY_STEP_REGIME_NAMES[AUTONOMY_STEP_REGIME_NAMES.length - 1];
  const safeName = AUTONOMY_STEP_REGIME_NAMES.includes(name) ? name : fallbackName;
  return stepRegimeIndexByName(safeName);
}
function capAutonomousStepRegimeIndex(idx, mode = selectedAutonomousMode()) {
  const cap = autonomyStepCapForMode(mode);
  const regime = STEP_REGIMES[clamp(Math.floor(idx), 0, STEP_REGIMES.length - 1)];
  if (regime && AUTONOMY_STEP_REGIME_NAMES.includes(regime.name) && Number(regime.substeps || 0) <= cap) {
    return stepRegimeIndexByName(regime.name);
  }
  return autonomyStepRegimeIndexByName(autonomyMaxRegimeNameForMode(mode));
}
function selectAutonomyFallbackStepRegime(signal = legacyAutonomyRoutingSignal()) {
  const fullness = clamp(Number(signal), 0, 1);
  const entry = AUTONOMY_SIGNAL_LADDER.find(row => fullness < row.ceiling) || AUTONOMY_SIGNAL_LADDER[AUTONOMY_SIGNAL_LADDER.length - 1];
  return autonomyStepRegimeIndexByName(entry.regime);
}
function autonomyRouteBiasForName(name, routes = frontierRoutes(), live = autonomyDiagnostics || makeEmptyAutonomyDiagnostics()) {
  const rest = Number(routes.rest || 0);
  const compress = Number(routes.compress || 0);
  const explore = Number(routes.explore || 0);
  const audit = Number(routes.audit || 0);
  const phase = Number(routes.phaseLaw || 0);
  const syntax = Math.max(Number(routes.syntax || 0), Number(routes.zeroSum || 0), Number(live.zeroFit || 0), Number(live.closureMean || 0));
  const novelty = Number(live.novelty || 0);
  const stagnation = Number(live.stagnation || 0);
  const pressure = Number(live.pressure || live.complexity || 0);
  if (name === 'q1-1') return rest * 0.24 + audit * 0.06 - explore * 0.08;
  if (name === 'primordial-2') return rest * 0.16 + audit * 0.10 + pressure * 0.04;
  if (name === 'triad-3') return audit * 0.13 + syntax * 0.13 + novelty * 0.06;
  if (name === 'four-4') return audit * 0.07 + compress * 0.10 + syntax * 0.12 + novelty * 0.06;
  if (name === 'six-6') return compress * 0.17 + syntax * 0.10 + stagnation * 0.06;
  if (name === 'seven-7') return explore * 0.16 + phase * 0.13 + syntax * 0.08;
  if (name === 'singularity-13') return explore * 0.18 + phase * 0.17 + stagnation * 0.08;
  return 0;
}
function autonomyPingPongPenalty(name, allowedNames = AUTONOMY_STEP_REGIME_NAMES) {
  const currentName = currentStepRegime().name;
  const currentIdx = allowedNames.indexOf(currentName);
  const targetIdx = allowedNames.indexOf(name);
  if (currentIdx < 0 || targetIdx < 0) return 0;
  const distance = Math.abs(targetIdx - currentIdx);
  const endpointJump = (currentName === 'q1-1' && (name === 'seven-7' || name === 'singularity-13'))
    || ((currentName === 'seven-7' || currentName === 'singularity-13') && name === 'q1-1');
  const recent = autonomyHysteresis?.lastCandidateName === name || autonomyHysteresis?.pendingName === name;
  return (endpointJump ? 0.18 : 0) + (distance > 2 ? 0.035 * (distance - 2) : 0) + (recent && distance > 1 ? 0.035 : 0);
}
function selectFrontierBiasedStepRegime(routes = frontierRoutes(), signal = autonomyRoutingSignal(), mode = selectedAutonomousMode()) {
  const allowedNames = autonomyAllowedRegimeNamesForMode(mode);
  if (!allowedNames.length) return selectAutonomyFallbackStepRegime(signal);
  const live = autonomyDiagnostics || makeEmptyAutonomyDiagnostics();
  const safeSignal = clamp(Number(signal), 0, 1);
  const currentName = currentStepRegime().name;
  const currentAllowedIndex = Math.max(0, allowedNames.indexOf(currentName));
  const frontierReady = frontierRoutesReady();
  const scores = allowedNames.map((name, idx) => {
    const center = (idx + 0.5) / Math.max(1, allowedNames.length);
    const fit = 1.0 - Math.min(1, Math.abs(safeSignal - center) * 1.72);
    const routeBias = frontierReady ? autonomyRouteBiasForName(name, routes, live) : 0;
    const distance = Math.abs(idx - currentAllowedIndex);
    const bridgeBonus = distance === 1 ? 0.030 : distance === 2 ? 0.014 : 0;
    const antiPingPong = autonomyPingPongPenalty(name, allowedNames);
    const explorationDither = 0.024 * Math.sin(simTime * 0.37 + idx * 2.399963 + safeSignal * TAU);
    const score = 0.68 * fit + routeBias + bridgeBonus + explorationDither - antiPingPong;
    return { name, score, idx };
  }).sort((a, b) => b.score - a.score);
  const chosen = scores[0]?.name || autonomyMaxRegimeNameForMode(mode);
  return autonomyStepRegimeIndexByName(chosen);
}
function selectAutonomousStepRegime(mode = selectedAutonomousMode(), signal = autonomyRoutingSignal()) {
  if (mode === 'riemann') return riemannStepRegimeIndex();
  return capAutonomousStepRegimeIndex(selectFrontierBiasedStepRegime(frontierRoutes(), signal, mode), mode);
}
function autonomyPortalIdleSeconds() {
  const last = Number.isFinite(Number(autonomyPortalTransit.lastActionTime)) ? Number(autonomyPortalTransit.lastActionTime) : simTime;
  return Math.max(0, (Number(simTime) || 0) - last);
}
function autonomyPortalStepIdleSeconds() {
  const lastStep = Number.isFinite(Number(portalLadder.lastStepTime)) ? Number(portalLadder.lastStepTime) : (Number(autonomyPortalTransit.lastActionTime) || simTime);
  return Math.max(0, (Number(simTime) || 0) - lastStep);
}
function autonomyPortalCuriosityEnvelope() {
  const idle = autonomyPortalIdleSeconds();
  return smoother01((idle - AUTONOMY_PORTAL_IDLE_PROBE_SECONDS) / Math.max(1, AUTONOMY_PORTAL_FULL_PROBE_SECONDS - AUTONOMY_PORTAL_IDLE_PROBE_SECONDS));
}
function autonomyPortalStepCuriosityEnvelope() {
  const idle = autonomyPortalStepIdleSeconds();
  return smoother01((idle - AUTONOMY_PORTAL_STEP_PROBE_SECONDS) / Math.max(1, AUTONOMY_PORTAL_FULL_PROBE_SECONDS - AUTONOMY_PORTAL_STEP_PROBE_SECONDS));
}
function autonomyPortalActionTotal() {
  return (Number(autonomyPortalTransit.entered) || 0) + (Number(autonomyPortalTransit.stepped) || 0) + (Number(autonomyPortalTransit.exited) || 0);
}
function autonomyPortalRestRemainingSeconds() {
  return Math.max(0, Math.max(
    (Number(autonomyPortalTransit.restUntilTime) || -Infinity) - (Number(simTime) || 0),
    ((Number(autonomyPortalTransit.restUntilTick) || 0) - (Number(tick) || 0)) / 60
  ));
}
function autonomyPortalRestDueReason() {
  if (autonomyPortalRestRemainingSeconds() > 0) return 'active-rest';
  const total = autonomyPortalActionTotal();
  const sinceActionRest = total - (Number(autonomyPortalTransit.restLastActionTotal) || 0);
  const sinceRest = (Number(simTime) || 0) - (Number.isFinite(Number(autonomyPortalTransit.restLastTime)) ? Number(autonomyPortalTransit.restLastTime) : 0);
  if (sinceActionRest >= AUTONOMY_PORTAL_REST_AFTER_ACTIONS) return 'action-budget';
  if (total > (Number(autonomyPortalTransit.restLastActionTotal) || 0) && sinceRest >= AUTONOMY_PORTAL_REST_INTERVAL_SECONDS) return 'periodic';
  return '';
}
function armAutonomyPortalRest(reason = 'periodic') {
  if (portalRenderActive()) beginPortalTransit(false, 0.74, PORTAL_EXIT_SETTLE_SECONDS);
  const flushed = clearAllPortalsForRest('autonomy-portal-rest-arm-' + reason);
  autonomyPortalTransit.restUntilTime = (Number(simTime) || 0) + AUTONOMY_PORTAL_REST_SECONDS;
  autonomyPortalTransit.restUntilTick = (Number(tick) || 0) + Math.ceil(AUTONOMY_PORTAL_REST_SECONDS * 60);
  autonomyPortalTransit.restLastTime = Number(simTime) || 0;
  autonomyPortalTransit.restLastTick = Number(tick) || 0;
  autonomyPortalTransit.restLastActionTotal = autonomyPortalActionTotal();
  autonomyPortalTransit.restCount = (Number(autonomyPortalTransit.restCount) || 0) + 1;
  autonomyPortalTransit.pendingAction = '';
  autonomyPortalTransit.pendingConfirmations = 0;
  autonomyPortalTransit.lastReason = 'portal sabbath armed · ' + reason + ' · cleared ' + flushed + ' portal gate(s) · no autonomous portals for ' + AUTONOMY_PORTAL_REST_SECONDS.toFixed(0) + 's';
  return autonomyPortalRestRemainingSeconds();
}
function autonomyPortalProbeAction(scores) {
  const cycle = Math.floor(((Number(simTime) || 0) + (Number(tick) || 0) * 0.001) / 19.0) % 4;
  if (!portalRenderActive()) return 'enter';
  if (scores?.exit > AUTONOMY_PORTAL_EXIT_THRESHOLD + 0.10 && Math.abs(Number(portalLadder.level) || 0) > 1) return 'exit';
  return ['down', 'right', 'down', 'left'][cycle] || 'down';
}
function autonomyPortalActionScores(routes = frontierRoutes(), signal = autonomyRoutingSignal(), live = autonomyDiagnostics || makeEmptyAutonomyDiagnostics()) {
  const route = routes || {};
  const pressure = Number(live.pressure || autonomyPressure || 0) || 0;
  const novelty = Number(live.novelty || autonomyNovelty || 0) || 0;
  const stagnation = Number(live.stagnation || autonomyStagnation || 0) || 0;
  const explore = Number(route.explore || 0) || 0;
  const compress = Number(route.compress || 0) || 0;
  const rest = Number(route.rest || 0) || 0;
  const audit = Number(route.audit || 0) || 0;
  const phase = Number(route.phaseLaw || 0) || 0;
  const syntax = Math.max(Number(route.syntax || 0) || 0, Number(route.zeroSum || 0) || 0);
  const render = Number(route.render || 0) || 0;
  const freedom = portalFreedom();
  const active = portalRenderActive();
  const transit = portalTransitBlend();
  const idleProbe = autonomyPortalCuriosityEnvelope();
  const stepProbe = autonomyPortalStepCuriosityEnvelope();
  const capacity = clamp(1.0 - activeChunkCount() / Math.max(1, MAX_CHUNKS), 0, 1);
  const safeSignal = clamp(Number(signal) || 0, 0, 1);
  const levelDepth = clamp(Math.log2(1 + Math.abs(Number(portalLadder.level) || 0)) / 5.0, 0, 1);
  const lateralDepth = clamp(Math.log2(1 + Math.abs(Number(portalLadder.lateral) || 0)) / 5.0, 0, 1);
  const enter = clamp(
    0.20 * safeSignal + 0.19 * explore + 0.14 * phase + 0.11 * novelty + 0.11 * pressure
    + 0.09 * freedom + 0.05 * render + 0.05 * capacity + 0.34 * idleProbe - (active ? 0.18 * transit : 0.0),
    0, 1
  );
  const down = clamp(
    0.19 * explore + 0.17 * phase + 0.14 * pressure + 0.12 * novelty + 0.11 * freedom
    + 0.08 * safeSignal + 0.06 * syntax + 0.05 * capacity + 0.22 * stepProbe - 0.07 * rest,
    0, 1
  );
  const up = clamp(
    0.18 * rest + 0.16 * compress + 0.13 * stagnation + 0.10 * syntax + 0.09 * levelDepth
    + 0.06 * audit + 0.04 * freedom + 0.10 * stepProbe - 0.06 * explore,
    0, 1
  );
  const sideways = clamp(
    0.19 * syntax + 0.13 * audit + 0.12 * phase + 0.11 * novelty + 0.09 * lateralDepth
    + 0.08 * render + 0.06 * freedom + 0.04 * pressure + 0.18 * stepProbe - 0.03 * rest,
    0, 1
  );
  const sideSign = Math.sin(autonomyPhase + portalLadder.crossings * 0.73 + tick * 0.0017) >= 0 ? 1 : -1;
  const exit = clamp(
    0.24 * rest + 0.20 * compress + 0.18 * stagnation + 0.08 * levelDepth + 0.08 * lateralDepth
    + 0.06 * syntax - 0.12 * explore - 0.10 * phase,
    0, 1
  );
  return {
    enter, down, up, left: sideSign < 0 ? sideways : sideways * 0.92, right: sideSign >= 0 ? sideways : sideways * 0.92, exit,
    components: { pressure, novelty, stagnation, explore, compress, rest, audit, phase, syntax, render, freedom, transit, capacity, signal: safeSignal, levelDepth, lateralDepth, idleProbe, stepProbe }
  };
}
function selectAutonomyPortalTransitCandidate(routes = frontierRoutes(), signal = autonomyRoutingSignal(), live = autonomyDiagnostics || makeEmptyAutonomyDiagnostics()) {
  if (!autonomousActive || !isFullAutonomyMode(autonomousMode) || paused) {
    return { action: 'hold', score: 0, threshold: 1, reason: 'portal autonomy inactive', scores: null };
  }
  const scores = autonomyPortalActionScores(routes, signal, live);
  const active = portalRenderActive();
  const transitAmount = portalTransitAmount();
  const transitBlend = portalTransitBlend();
  const entering = Boolean(portalLadder.transitIntent);
  const idleProbe = Number(scores?.components?.idleProbe || 0);
  const stepProbe = Number(scores?.components?.stepProbe || 0);
  const restRemaining = autonomyPortalRestRemainingSeconds();
  const restDue = autonomyPortalRestDueReason();
  if (restRemaining > 0) {
    const flushed = enforceAutonomyPortalRestClear('autonomy-portal-rest-active');
    return { action: 'hold', score: 0, threshold: 1, reason: 'portal sabbath active · cleared ' + flushed + ' portal gate(s) · no autonomous portals for ' + restRemaining.toFixed(1) + 's', scores, rest: true };
  }
  if (restDue && restDue !== 'active-rest') {
    if (active) {
      return { action: 'exit', score: Math.max(scores.exit, AUTONOMY_PORTAL_HIGH_CERTAINTY + 0.05), threshold: Math.min(AUTONOMY_PORTAL_EXIT_THRESHOLD, AUTONOMY_PORTAL_HIGH_CERTAINTY), reason: 'portal sabbath requested · exiting before 60s no-portal rest · ' + restDue, scores, restDue: true };
    }
    armAutonomyPortalRest(restDue);
    return { action: 'hold', score: 0, threshold: 1, reason: 'portal sabbath armed while outside portal · no autonomous portals for ' + AUTONOMY_PORTAL_REST_SECONDS.toFixed(0) + 's', scores, rest: true };
  }
  if (!active) {
    const probeScore = Math.max(scores.enter, AUTONOMY_PORTAL_PROBE_THRESHOLD + idleProbe * 0.20);
    return scores.enter >= AUTONOMY_PORTAL_ENTER_THRESHOLD || idleProbe >= 0.55
      ? { action: 'enter', score: probeScore, threshold: Math.min(AUTONOMY_PORTAL_ENTER_THRESHOLD, AUTONOMY_PORTAL_PROBE_THRESHOLD), reason: idleProbe >= 0.55 ? 'autonomous portal curiosity probe armed' : 'sustained route pressure wants portal transit', scores }
      : { action: 'hold', score: scores.enter, threshold: AUTONOMY_PORTAL_ENTER_THRESHOLD, reason: 'below portal enter threshold · probe ' + idleProbe.toFixed(2), scores };
  }
  if (!entering && scores.enter > Math.max(scores.exit, AUTONOMY_PORTAL_ENTER_THRESHOLD)) {
    return { action: 'enter', score: scores.enter, threshold: AUTONOMY_PORTAL_ENTER_THRESHOLD, reason: 're-enter from settling envelope', scores };
  }
  if (entering && (transitBlend < AUTONOMY_PORTAL_READY_BLEND || transitAmount < AUTONOMY_PORTAL_READY_AMOUNT)) {
    return { action: 'hold', score: Math.max(scores.down, scores.up, scores.left, scores.right), threshold: AUTONOMY_PORTAL_MOVE_THRESHOLD, reason: 'waiting for portal transit envelope before stepping', scores };
  }
  const stepOptions = [
    { action: 'down', score: scores.down, threshold: AUTONOMY_PORTAL_MOVE_THRESHOLD },
    { action: 'up', score: scores.up, threshold: AUTONOMY_PORTAL_MOVE_THRESHOLD },
    { action: 'left', score: scores.left, threshold: AUTONOMY_PORTAL_MOVE_THRESHOLD },
    { action: 'right', score: scores.right, threshold: AUTONOMY_PORTAL_MOVE_THRESHOLD },
    { action: 'exit', score: scores.exit, threshold: AUTONOMY_PORTAL_EXIT_THRESHOLD }
  ].sort((a, b) => b.score - a.score);
  const best = stepOptions[0];
  if (!best || best.score < best.threshold) {
    if (stepProbe >= 0.52) {
      const probeAction = autonomyPortalProbeAction(scores);
      const probeThreshold = probeAction === 'exit' ? AUTONOMY_PORTAL_EXIT_THRESHOLD : Math.min(AUTONOMY_PORTAL_MOVE_THRESHOLD, AUTONOMY_PORTAL_PROBE_THRESHOLD);
      const probeScore = Math.max(best ? best.score : 0, probeThreshold + Math.min(0.22, stepProbe * 0.20));
      return { action: probeAction, score: probeScore, threshold: probeThreshold, reason: 'autonomous portal step curiosity probe · ' + probeAction, scores, probe: true };
    }
    return { action: 'hold', score: best ? best.score : 0, threshold: best ? best.threshold : AUTONOMY_PORTAL_MOVE_THRESHOLD, reason: 'portal route below movement threshold · step probe ' + stepProbe.toFixed(2), scores };
  }
  return { ...best, reason: 'portal route candidate ' + best.action, scores };
}
function autonomyPortalCooldownSeconds(action) {
  if (action === 'enter') return AUTONOMY_PORTAL_ENTER_COOLDOWN_SECONDS;
  if (action === 'exit') return AUTONOMY_PORTAL_EXIT_COOLDOWN_SECONDS;
  return AUTONOMY_PORTAL_COOLDOWN_SECONDS;
}
function stabilizeAutonomyPortalTransitCandidate(candidate) {
  const action = candidate?.action || 'hold';
  const score = Number(candidate?.score || 0) || 0;
  const threshold = Number(candidate?.threshold || 0) || 0;
  autonomyPortalTransit.lastScore = score;
  autonomyPortalTransit.lastThreshold = threshold;
  autonomyPortalTransit.lastConsideredAction = action;
  autonomyPortalTransit.considered++;

  if (action === 'hold') {
    autonomyPortalTransit.pendingAction = '';
    autonomyPortalTransit.pendingConfirmations = 0;
    autonomyPortalTransit.held++;
    autonomyPortalTransit.lastReason = candidate?.reason || 'hold';
    autonomyPortalTransit.decision = { action, accepted: false, score: Number(score.toFixed(4)), reason: autonomyPortalTransit.lastReason, tick, simTime: Number(simTime.toFixed(4)) };
    return { accepted: false, held: true, reason: autonomyPortalTransit.lastReason, candidate };
  }

  const cooldownReady = tick >= (autonomyPortalTransit.cooldownUntilTick || 0) && simTime >= (autonomyPortalTransit.cooldownUntilTime || -Infinity);
  if (autonomyPortalTransit.pendingAction === action) {
    autonomyPortalTransit.pendingConfirmations++;
  } else {
    autonomyPortalTransit.pendingAction = action;
    autonomyPortalTransit.pendingConfirmations = 1;
    autonomyPortalTransit.pendingFirstTick = tick;
    autonomyPortalTransit.pendingFirstTime = simTime;
  }
  const needed = score >= AUTONOMY_PORTAL_HIGH_CERTAINTY
    ? 1
    : action === 'exit'
      ? AUTONOMY_PORTAL_EXIT_CONFIRMATIONS
      : AUTONOMY_PORTAL_BASE_CONFIRMATIONS;
  const confirmed = autonomyPortalTransit.pendingConfirmations >= needed;
  const aboveThreshold = score >= threshold;
  const accepted = cooldownReady && confirmed && aboveThreshold;
  const reason = accepted
    ? 'accepted portal ' + action + ' after hysteresis · conf ' + autonomyPortalTransit.pendingConfirmations + '/' + needed
    : !cooldownReady
      ? 'held portal ' + action + ' for cooldown · until ' + (autonomyPortalTransit.cooldownUntilTime || 0).toFixed(2) + 's'
      : !confirmed
        ? 'held portal ' + action + ' for confirmation · conf ' + autonomyPortalTransit.pendingConfirmations + '/' + needed
        : 'held portal ' + action + ' below threshold · ' + score.toFixed(3) + '/' + threshold.toFixed(3);

  autonomyPortalTransit.lastReason = reason;
  autonomyPortalTransit.decision = {
    action, accepted, confirmed, cooldownReady, aboveThreshold,
    confirmations: autonomyPortalTransit.pendingConfirmations, needed,
    score: Number(score.toFixed(4)), threshold: Number(threshold.toFixed(4)),
    reason, tick, simTime: Number(simTime.toFixed(4))
  };
  if (!accepted) {
    autonomyPortalTransit.held++;
    return { accepted: false, held: true, reason, candidate };
  }
  autonomyPortalTransit.pendingAction = '';
  autonomyPortalTransit.pendingConfirmations = 0;
  autonomyPortalTransit.lastAction = action;
  autonomyPortalTransit.lastActionTick = tick;
  autonomyPortalTransit.lastActionTime = simTime;
  autonomyPortalTransit.lastProbeTick = tick;
  autonomyPortalTransit.lastProbeTime = simTime;
  if (candidate?.probe || String(candidate?.reason || '').indexOf('curiosity probe') >= 0) autonomyPortalTransit.forcedProbes++;
  autonomyPortalTransit.cooldownUntilTick = tick + Math.ceil(autonomyPortalCooldownSeconds(action) * 60);
  autonomyPortalTransit.cooldownUntilTime = simTime + autonomyPortalCooldownSeconds(action);
  return { accepted: true, held: false, reason, candidate };
}
function applyAutonomyPortalTransitAction(candidate) {
  const action = candidate?.action || 'hold';
  if (action === 'hold') return 0;
  invalidateGpuFeedOptimizer('autonomy-portal-' + action, 10);
  escherZoomMode = selectedEscherZoomMode();
  let made = 0;
  if (action === 'enter') {
    armEscherPortalNavigation();
    autonomyPortalTransit.entered++;
    autonomyPortalTransit.lastTarget = { action, focus: portalLadderRenderFocus().map(v => Number(v.toFixed(4))), level: portalLadder.level, lateral: portalLadder.lateral };
    stats.log.textContent = 'Full Autonomy entered portal transit after hysteresis: ' + candidate.reason + ' · score ' + Number(candidate.score || 0).toFixed(3) + '. Manual E/]/[/,/./= controls remain available.';
  } else if (action === 'down') {
    portalLadder.direction = 1;
    if (!portalRenderActive()) armEscherPortalNavigation();
    made = stepPortalLadder(1, 'autonomy-down');
    autonomyPortalTransit.stepped++;
  } else if (action === 'up') {
    portalLadder.direction = -1;
    if (!portalRenderActive()) armEscherPortalNavigation();
    made = stepPortalLadder(-1, 'autonomy-up');
    autonomyPortalTransit.stepped++;
  } else if (action === 'left') {
    if (!portalRenderActive()) armEscherPortalNavigation();
    made = stepPortalSideways(-1, 'autonomy-left');
    autonomyPortalTransit.stepped++;
  } else if (action === 'right') {
    if (!portalRenderActive()) armEscherPortalNavigation();
    made = stepPortalSideways(1, 'autonomy-right');
    autonomyPortalTransit.stepped++;
  } else if (action === 'exit') {
    const nearest = settlePortalToNearestCenter('autonomy-hysteresis-exit', 0.52);
    beginPortalTransit(false, 0.66, PORTAL_EXIT_SETTLE_SECONDS);
    autonomyPortalTransit.exited++;
    autonomyPortalTransit.lastTarget = { action, focus: nearest.center.map(v => Number(v.toFixed(4))), level: portalLadder.level, lateral: portalLadder.lateral };
    if (candidate?.restDue) {
      armAutonomyPortalRest(candidate.restDue);
      stats.log.textContent = 'Full Autonomy exited portal transit for portal sabbath: resolving to ' + nearest.center.map(v => v.toFixed(3)).join(', ') + ' (' + nearest.source + '). No autonomous portals for ' + AUTONOMY_PORTAL_REST_SECONDS.toFixed(0) + 's.';
    } else {
      stats.log.textContent = 'Full Autonomy requested smooth portal exit after hysteresis: resolving to ' + nearest.center.map(v => v.toFixed(3)).join(', ') + ' (' + nearest.source + ').';
    }
  } else {
    autonomyPortalTransit.rejected++;
    return 0;
  }
  if (action !== 'enter' && action !== 'exit') {
    autonomyPortalTransit.lastTarget = { action, opened: made, focus: portalLadderRenderFocus().map(v => Number(v.toFixed(4))), level: portalLadder.level, lateral: portalLadder.lateral };
    stats.log.textContent = 'Full Autonomy stepped portal ' + action + ' after hysteresis: opened/recycled ' + made + ' gate(s) · score ' + Number(candidate.score || 0).toFixed(3) + ' · ' + portalLadderStatusText() + '.';
  }
  syncEscherZoomButtonLabel();
  updateStats();
  return made;
}
function maybeAutonomyPortalTransit(routes = frontierRoutes(), signal = autonomyRoutingSignal(), live = autonomyDiagnostics || makeEmptyAutonomyDiagnostics()) {
  const candidate = selectAutonomyPortalTransitCandidate(routes, signal, live);
  const stabilized = stabilizeAutonomyPortalTransitCandidate(candidate);
  if (stabilized.accepted) applyAutonomyPortalTransitAction(stabilized.candidate);
  return stabilized;
}
function autonomyPortalTransitStatusText() {
  const pending = autonomyPortalTransit.pendingAction ? (' pending ' + autonomyPortalTransit.pendingAction + ' x' + autonomyPortalTransit.pendingConfirmations) : ' steady';
  const cool = simTime < (autonomyPortalTransit.cooldownUntilTime || -Infinity) ? (' cd ' + Math.max(0, autonomyPortalTransit.cooldownUntilTime - simTime).toFixed(1) + 's') : '';
  const rest = autonomyPortalRestRemainingSeconds() > 0 ? (' rest ' + autonomyPortalRestRemainingSeconds().toFixed(1) + 's') : '';
  const probe = portalRenderActive() ? autonomyPortalStepCuriosityEnvelope() : autonomyPortalCuriosityEnvelope();
  return 'portal' + pending + cool + rest + ' · considered ' + autonomyPortalTransit.lastConsideredAction + ' · last ' + autonomyPortalTransit.lastAction + ' · score ' + Number(autonomyPortalTransit.lastScore || 0).toFixed(2) + ' · probe ' + Number(probe || 0).toFixed(2) + ' · forced ' + Number(autonomyPortalTransit.forcedProbes || 0) + ' · rests ' + Number(autonomyPortalTransit.restCount || 0);
}
function scanAutonomyState(a) {
  const asyncPixels = takeAsyncBackflowPixels(a);
  const usedAsync = Boolean(asyncPixels && asyncPixels.length);
  const scan = readAndScanMatrix(a, {
    pixels: usedAsync ? asyncPixels : undefined,
    stride: routeAdjustedStride(16),
    reducers: [createAutonomyReducer()],
    meta: { asyncBackflow: usedAsync }
  });
  const frontierSummary = updateSymmetricFrontierFromScan(scan, { source: usedAsync ? 'autonomy-async-backflow-scan' : 'autonomy-sync-fallback-scan' });
  const diagnostics = scan.results.autonomy || makeEmptyAutonomyDiagnostics();
  diagnostics.symmetricFrontier = frontierSummary;
  diagnostics.asyncBackflow = usedAsync;
  diagnostics.note = usedAsync ? 'async PBO autonomy scan · no main-thread readback stall' : 'sync fallback autonomy scan';
  return diagnostics;
}
function shouldScanAutonomyMatrix() {
  if (!autonomousActive || !isFullAutonomyMode(autonomousMode) || !app?.kind || app.kind !== 'webgl2') return false;
  const auditCadence = frontierAuditCadenceScale();
  const cadenceReady = !(tick - autonomyLastScanTick < AUTONOMY_SCAN_INTERVAL_TICKS * auditCadence && simTime - autonomyLastScanTime < AUTONOMY_SCAN_INTERVAL_SECONDS * auditCadence);
  if (!cadenceReady) return false;

  // v0.3.18: double-turbo autonomous routing should not force a synchronous readPixels stall.
  // Prefer the resident PBO backflow ring; if the browser/GPU path supports it,
  // defer the route scan until a completed async frame is already in RAM.
  const rb = ensureAsyncBackflow(app);
  if (rb?.enabled) {
    if (rb.latestPixels && rb.latestSeq !== rb.consumedSeq) return true;
    enqueueAsyncBackflowRead(app, true);
    autonomyDiagnostics.note = 'waiting for async autonomy pixels';
    return false;
  }
  return true;
}
function applyAutonomyDiagnostics(metrics) {
  autonomyDiagnostics = metrics;
  const planned = takeBackgroundAutonomyDecision();
  const signal = planned ? Number(planned.signal || autonomyRoutingSignal()) : autonomyRoutingSignal();
  const syncIndex = selectAutonomousStepRegime(autonomousMode, signal);
  const rawCandidate = planned && Number.isFinite(Number(planned.index))
    ? { ...planned, index: capAutonomousStepRegimeIndex(Number(planned.index), autonomousMode) }
    : {
        schema: 'chrysalis-sync-autonomy-decision-v0.1',
        index: syncIndex,
        name: STEP_REGIMES[syncIndex]?.name || currentStepRegime().name,
        label: STEP_REGIMES[syncIndex]?.label || currentStepRegime().label,
        signal,
        reason: 'sync fallback',
        certainty: 0.52
      };
  const routes = frontierRoutes();
  if (coldBankActiveMode === 'continuum' && residentSignal) {
    const assimilatedColdBank = maybeAssimilateContinuumColdBank('continuum-autonomy-route');
    if (!assimilatedColdBank) maybeAutonomyColdBankWorkDistill('autonomy-route');
  } else if (coldBankActiveMode === 'work' && residentSignal) {
    refreshColdBankSynthesis({ includeCurrent: false, reason: 'autonomy-coldBank-work' });
    compileZeroSumSyntaxFromManifest(residentSignalManifest, 'resident-signal+autonomy-coldBank-work');
    coldBankLastDiagnosticMessage = 'Full Autonomy is using ColdBank Work Mode: cold syntax deep distillation without live-card assimilation';
    updateColdBankStats();
  }
  const stabilized = stabilizeAutonomyRegimeCandidate(rawCandidate, signal, routes);
  const worldDigStabilized = maybeAutonomyWorldDig(routes, signal, metrics);
  const portalStabilized = worldDig.mode === 'dwell' ? { accepted: false, reason: 'world dig dwell holds portal stepping' } : maybeAutonomyPortalTransit(routes, signal, metrics);
  const nextIndex = stabilized.index;
  if (planned) {
    backgroundAutonomyPlanner.validated++;
    autonomyDiagnostics.planner = {
      name: planned.name,
      label: planned.label,
      signal: planned.signal,
      reason: planned.reason,
      certainty: planned.certainty,
      scoreMargin: planned.scoreMargin,
      syntaxCertainty: planned.syntaxCertainty,
      validation: planned.validation
    };
  }
  autonomyDiagnostics.hysteresis = autonomyHysteresisSummaryObject();
  autonomyDiagnostics.portalTransit = autonomyPortalTransitSummaryObject();
  autonomyDiagnostics.worldDig = worldDigSummaryObject();
  if (worldDigStabilized?.accepted) autonomyDiagnostics.lastWorldDig = worldDigStabilized.reason;
  if (portalStabilized?.accepted) autonomyDiagnostics.lastPortalTransit = portalStabilized.reason;
  if (nextIndex !== ui.stepRegimeIndex && stabilized.accepted) {
    const previous = currentStepRegime().label;
    setActiveStepRegimeIndex(nextIndex);
    simAccumulator = 0;
    autonomyLastRouteTick = tick;
    autonomyLastRouteTime = simTime;
    autonomyDiagnostics.routed = true;
    autonomyDiagnostics.lastRoute = previous + ' → ' + currentStepRegime().label;
    if (planned) backgroundAutonomyPlanner.applied++;
    stats.log.textContent = autonomyModeLabel(autonomousMode) + ' live route: ' + autonomyDiagnostics.lastRoute
      + (planned ? ' · worker ' + planned.reason : ' · sync fallback')
      + ' · hysteresis ' + stabilized.reason
      + ' · cap ' + autonomyStepCapForMode(autonomousMode)
      + ' · signal ' + signal.toFixed(3)
      + ' · certainty ' + Number(stabilized.candidate?.certainty || 0).toFixed(3)
      + ' · pressure ' + autonomyPressure.toFixed(3)
      + ' · novelty ' + autonomyNovelty.toFixed(3)
      + ' · stagnation ' + autonomyStagnation.toFixed(3) + '.';
    updateStats();
  } else if (stabilized.held) {
    if (planned) backgroundAutonomyPlanner.heldByHysteresis++;
    autonomyDiagnostics.routed = false;
    autonomyDiagnostics.lastRoute = 'held · ' + stabilized.reason;
  }
}
function resetAutonomyController(mode = selectedAutonomousMode()) {
  autonomyLastScanTick = tick;
  autonomyLastScanTime = simTime;
  autonomyLastRouteTick = tick;
  autonomyLastRouteTime = simTime;
  autonomyPressure = 0.0;
  autonomyPhase = 0.0;
  autonomyNovelty = 0.0;
  autonomyStagnation = 0.0;
  autonomyDiagnostics = makeEmptyAutonomyDiagnostics();
  autonomyDiagnostics.active = autonomousActive;
  resetAutonomyHysteresis();
  resetAutonomyPortalTransit();
  coldBankListenLastRefreshTick = -Infinity;
  coldBankListenLastRefreshTime = -Infinity;
  coldBankAutonomyWorkDistillLastTick = -Infinity;
  coldBankAutonomyWorkDistillLastTime = -Infinity;
  resetBackgroundAutonomyPlannerCache();
  autonomyDiagnostics.mode = mode;
  autonomyDiagnostics.note = autonomousActive
    ? (isFullAutonomyMode(mode) ? 'arming live adaptive feedback with ' + autonomyStepCapForMode(mode) + '-step cap' : 'Riemann autonomy exact branch armed')
    : 'idle';
  resetBackgroundAutonomyPlannerCache();
}
function maybeAdaptAutonomy() {
  if (!shouldScanAutonomyMatrix()) return false;
  autonomyLastScanTick = tick;
  autonomyLastScanTime = simTime;
  try {
    applyAutonomyDiagnostics(scanAutonomyState(app));
    return true;
  } catch (err) {
    autonomyDiagnostics.note = 'matrix feedback readback failed: ' + (err && err.message ? err.message : String(err));
    return false;
  }
}
function autonomyStatusText() {
  if (!autonomousActive) return 'idle · press A for autonomous run';
  if (autonomousMode === 'riemann') return 'Riemann Autonomy · exact branch · live freedom disabled for validation';
  const d = autonomyDiagnostics || makeEmptyAutonomyDiagnostics();
  return autonomyModeLabel(autonomousMode) + ' live · cap ' + autonomyStepCapForMode(autonomousMode) + ' · pressure ' + Number(autonomyPressure || 0).toFixed(3)
    + ' · route ' + autonomyRoutingSignal().toFixed(3)
    + ' · novelty ' + Number(autonomyNovelty || 0).toFixed(3)
    + ' · stagnation ' + Number(autonomyStagnation || 0).toFixed(3)
    + ' · scans ' + Number(d.scanCount || 0)
    + ' · ' + backgroundAutonomyPlannerStatusText()
    + ' · ' + autonomyHysteresisStatusText()
    + ' · ' + autonomyPortalTransitStatusText()
    + (d.lastRoute && d.lastRoute !== 'none' ? ' · ' + d.lastRoute : '');
}
function phaseLawStatusText() {
  const full = residentSignalFullness.toFixed(3);
  if (phaseLaw.eventActive) {
    const elapsed = phaseLaw.eventStartedPerf ? ((performance.now() - phaseLaw.eventStartedPerf) / 1000).toFixed(1) : '0.0';
    return 'event macro ' + phaseLaw.eventMacroIndex
      + ' · birth ' + (phaseLaw.birthReadback ? 'read' : 'waiting')
      + ' · ' + elapsed + '/' + PHASE_LAW_NO_BIRTH_SECONDS + 's'
      + ' · full ' + full;
  }
  const next = selectUnrecentPhaseLawMacro();
  return 'law scans ' + Number(phaseLaw.scans || 0)
    + ' · axis ' + Number(phaseLaw.axisPhase || 0).toFixed(3)
    + ' · residual ' + Number(phaseLaw.residual || 1).toExponential(2)
    + ' · full ' + full + '×gate ' + frontierPhaseLawGate().toFixed(2) + '/' + PHASE_LAW_FULLNESS_START_THRESHOLD
    + ' · next macro ' + (next ? next.index + ' ' + next.name : 'none');
}
function selectedResolutionIndex() {
  const node = el('resolutionQuality');
  const raw = node ? Number(node.value) : ui.resolutionIndex;
  return clamp(Number.isFinite(raw) ? raw : ui.resolutionIndex, 0, RESOLUTION_OPTIONS.length - 1);
}
function selectedSimulationPixelScaleIndex() {
  const node = el('simulationPixelScale');
  const raw = node ? Number(node.value) : ui.simulationPixelScaleIndex;
  return clamp(Number.isFinite(raw) ? raw : ui.simulationPixelScaleIndex, 0, SIMULATION_PIXEL_SCALE_OPTIONS.length - 1);
}
function selectedViewingModeIndex() {
  const node = el('viewingMode');
  const raw = node ? Number(node.value) : ui.viewingModeIndex;
  return clamp(Number.isFinite(raw) ? raw : ui.viewingModeIndex, 0, VIEWING_MODES.length - 1);
}
function selectedMipmapRenderMode() {
  const node = el('mipmapRenderMode');
  return registryValue(MIPMAP_RENDER_MODES, node ? node.value : mipmapRenderMode, 'off');
}
function selectedDepthEffectMode() {
  const node = el('depthEffectMode');
  return registryValue(DEPTH_EFFECT_MODES, node ? node.value : depthEffectMode, 'on');
}
function selectedPixelBlendMode() {
  const node = el('pixelBlendMode');
  return registryValue(PIXEL_BLEND_MODES, node ? node.value : pixelBlendMode, 'off');
}
function selectedEscherZoomMode() {
  const node = el('escherZoomMode');
  return registryValue(ESCHER_ZOOM_MODES, node ? node.value : escherZoomMode, 'soft');
}
function escherZoomModeIndex() {
  return registryEntryByValue(ESCHER_ZOOM_MODES, escherZoomMode, 'soft')?.shaderMode || 0;
}
function syncEscherZoomButtonLabel() {
  const btn = el('escherZoomBtn');
  if (!btn) return;
  const transit = portalTransitBlend();
  const entering = Number(portalLadder.transitTo) > transit + 0.01;
  const exiting = Number(portalLadder.transitTo) < transit - 0.01;
  btn.textContent = exiting ? 'Settling Portal Exit E/J' : portalRenderActive() ? 'Exit Escher Portal E/J' : 'Initiate Escher Portal E/J';
  btn.classList.toggle('active', portalRenderActive());
  btn.classList.toggle('settling', exiting || entering);
}
function syncReticleButtonLabel() {
  const btn = el('reticleBtn');
  if (!btn) return;
  btn.textContent = reticleVisible ? 'Hide Reticle Q' : 'Show Reticle Q';
  btn.classList.toggle('active', reticleVisible);
  btn.setAttribute('aria-pressed', String(reticleVisible));
  document.body.classList.toggle('reticle-hidden', !reticleVisible);
}
function toggleReticle() {
  reticleVisible = !reticleVisible;
  syncReticleButtonLabel();
  if (stats.log) stats.log.textContent = 'Reticle ' + (reticleVisible ? 'shown' : 'hidden') + '. Q toggles the World Dig/portal guide overlay without changing the running simulation.';
}
function escherDepthPhase() {
  return ESCHER_PORTAL_PERIOD > 0 ? (escherZoomDepth % ESCHER_PORTAL_PERIOD) / ESCHER_PORTAL_PERIOD : 0;
}
function escherStatusText() {
  if (!portalRenderActive()) return 'off · ' + escherZoomMode + ' wrap · portal navigator · ' + portalLadderStatusText();
  const focus = portalLadderRenderFocus().map(v => Number(v).toFixed(3)).join(',');
  const envelope = portalTransitBlend().toFixed(2);
  const mode = portalLadder.transitIntent ? 'transit' : 'settling';
  return mode + ' · ' + escherZoomMode + ' wrap · envelope ' + envelope + ' · depth ' + escherDepthPhase().toFixed(2) + ' · ' + portalLadderStatusText() + ' · focus ' + focus + (escherPortalOpened ? ' · portal open' : ' · approaching portal') + ' · center ' + portalLadder.nearestCenterSource;
}
function armEscherPortalNavigation() {
  invalidateGpuFeedOptimizer('escher-transit-arm', 10);
  const target = selectSubspacePortal();
  const current = portalLadderRenderFocus();
  escherPortalTarget = target;
  escherZoomFocus = current.slice();
  escherZoomDepth = Math.max(0.0, escherZoomDepth * portalTransitBlend());
  escherLastLadderPeriod = Math.floor(escherZoomDepth / ESCHER_PORTAL_PERIOD);
  escherPortalOpened = false;
  beginPortalLadderTransition(target.portal, Number(target.phase) || portalLadder.phase, 0.72);
  portalLadder.focus = target.portal.slice();
  portalLadder.phase = Number(target.phase) || portalLadder.phase;
  portalLadder.lastSource = 'armed · smooth transit · ' + target.source;
  beginPortalTransit(true, 0.80, PORTAL_TRANSIT_SECONDS);
  subspace.lastPortal = {
    uv: target.portal.map(v => Number(v.toFixed(5))),
    source: 'escher-target · ' + target.source,
    score: Number((target.score || 0).toFixed(4)),
    opened: 0,
    tick
  };
}
function toggleEscherZoom() {
  invalidateGpuFeedOptimizer('escher-toggle', 10);
  escherZoomMode = selectedEscherZoomMode();
  if (!portalLadder.transitIntent && !portalRenderActive()) {
    armEscherPortalNavigation();
    stats.log.textContent = 'Escher Portal entering smoothly: the non-transit view is being enveloped into the nearest PortalFrame route instead of snapping to a new lens.';
  } else if (!portalLadder.transitIntent && portalRenderActive()) {
    armEscherPortalNavigation();
    stats.log.textContent = 'Escher Portal re-entering from settle: continuing through a smooth transit envelope.';
  } else {
    const nearest = settlePortalToNearestCenter('mid-transit exit', 0.58);
    beginPortalTransit(false, 0.72, PORTAL_EXIT_SETTLE_SECONDS);
    stats.log.textContent = 'Escher Portal exit requested mid-transit: resolving smoothly to nearest valid frame center ' + nearest.center.map(v => v.toFixed(3)).join(', ') + ' (' + nearest.source + ').';
  }
  syncEscherZoomButtonLabel();
  updateStats();
}
function updatePortalContinuousRecentering(dt) {
  if (!portalRenderActive() || paused) return;
  const envelope = portalTransitBlend();
  if (envelope < 0.04) return;
  const current = portalLadderRenderFocus();
  const nearest = nearestPortalReferenceCenter(current, { includeBetween: true });
  portalLadder.nearestCenter = nearest.center.slice();
  portalLadder.nearestCenterSource = nearest.source;
  const freedom = portalFreedom();
  const transitionDone = portalLadderTransitionAmount() > 0.66;
  if (!transitionDone || nearest.distance < 0.003 || nearest.distance > 0.24) return;
  const pull = clamp(dt * PORTAL_RECENTER_STRENGTH * (0.35 + freedom) * smoother01(envelope), 0, 0.018);
  const phase = Number.isFinite(Number(nearest.phase)) ? Number(nearest.phase) : portalLadder.phase;
  portalLadder.focus = torusMix(portalLadder.focus, nearest.center, pull);
  portalLadder.focusTo = torusMix(portalLadder.focusTo, nearest.center, pull * 1.6);
  portalLadder.phase = angleMix(portalLadder.phase, phase, pull);
  portalLadder.phaseTo = angleMix(portalLadder.phaseTo, phase, pull * 1.25);
  portalLadder.lastRecenterTime = simTime;
}
function advanceEscherPortalNavigation(dt) {
  updatePortalContinuousRecentering(dt);
  if (!portalRenderActive() || paused) return;
  const envelope = portalTransitBlend();
  if (!portalLadder.transitIntent) {
    if (envelope <= 0.003 && portalTransitAmount() >= 1.0) {
      escherZoomActive = false;
      escherPortalOpened = false;
      escherZoomDepth = 0.0;
    }
    return;
  }
  escherZoomActive = true;
  const priorDepth = escherZoomDepth;
  const priorPeriod = Math.floor(priorDepth / ESCHER_PORTAL_PERIOD);
  escherZoomDepth = (escherZoomDepth + dt * ESCHER_PORTAL_DEPTH_SPEED * clamp(envelope, 0.08, 1.0)) % ESCHER_PORTAL_MAX_DEPTH;
  const currentPeriod = Math.floor(escherZoomDepth / ESCHER_PORTAL_PERIOD);
  if (!escherPortalOpened && envelope > 0.55 && escherZoomDepth >= ESCHER_PORTAL_OPEN_DEPTH) {
    const target = escherPortalTarget || selectSubspacePortal();
    const made = openProjectiveSubspace(target, { source: 'escher-portal · ' + target.source, silent: true, recycle: true });
    escherPortalOpened = true;
    stats.log.textContent = made
      ? 'Escher Portal crossed halfway depth: opened ' + made + ' PortalFrame W-pointer gate(s), carrying the upper world down through a reversible phase/energy frame into child seed density.'
      : 'Escher Portal crossed halfway depth: existing portal reused or child atlas is full; the ladder will recycle old atlas windows on deeper crossings.';
  }
  if (envelope > 0.72 && (currentPeriod !== priorPeriod || escherZoomDepth < priorDepth)) {
    escherLastLadderPeriod = currentPeriod;
    stepPortalLadder(portalLadder.direction, 'escher-period-crossing');
  }
  maybeEstablishPortalTransitCenterFlush();
}
function ensurePortalTransitForManualStep() {
  escherZoomMode = selectedEscherZoomMode();
  if (!portalRenderActive()) {
    armEscherPortalNavigation();
  } else if (!portalLadder.transitIntent) {
    beginPortalTransit(true, 0.92, PORTAL_TRANSIT_SECONDS);
  }
  escherZoomActive = true;
  syncEscherZoomButtonLabel();
}
function descendPortalLadder() {
  portalLadder.direction = 1;
  ensurePortalTransitForManualStep();
  stepPortalLadder(1, 'manual-down');
  updateStats();
}
function ascendPortalLadder() {
  portalLadder.direction = -1;
  ensurePortalTransitForManualStep();
  stepPortalLadder(-1, 'manual-up');
  updateStats();
}
function portalLeft() {
  ensurePortalTransitForManualStep();
  stepPortalSideways(-1, 'manual-left');
  updateStats();
}
function portalRight() {
  ensurePortalTransitForManualStep();
  stepPortalSideways(1, 'manual-right');
  updateStats();
}

function establishCurrentViewPortalCenter(options = {}) {
  const current = portalLadderRenderFocus().map(v => wrap01(v));
  const phase = portalLadderRenderPhase();
  const wasActive = portalRenderActive();
  const sourceLabel = options.sourceLabel || 'current-view-parent';
  const flushReason = options.flushReason || 'establish-center-current-view';
  const refreshTransitEnvelope = options.refreshTransitEnvelope !== false;
  portalLadder.establishCount = (Number(portalLadder.establishCount) || 0) + 1;
  portalLadder.centerEpoch = (Number(portalLadder.centerEpoch) || 0) + 1;
  portalLadder.homeCenter = current.slice();
  portalLadder.nearestCenter = current.slice();
  portalLadder.nearestCenterSource = sourceLabel;
  portalLadder.lastEstablishedAt = simTime;
  portalLadder.lastTransitCenterFlushTime = simTime;
  portalLadder.level = 0;
  portalLadder.lateral = 0;
  portalLadder.sideCrossings = 0;
  portalLadder.leftCrossings = 0;
  portalLadder.rightCrossings = 0;
  portalLadder.absoluteLevel = 0;
  portalLadder.absoluteLateral = 0;
  portalLadder.establishedCenters = [];
  portalLadder.lastFrame = null;
  portalLadder.focus = current.slice();
  portalLadder.focusFrom = current.slice();
  portalLadder.focusTo = current.slice();
  portalLadder.renderFocus = current.slice();
  portalLadder.phase = phase;
  portalLadder.phaseFrom = phase;
  portalLadder.phaseTo = phase;
  portalLadder.renderPhase = phase;
  portalLadder.transitionStart = simTime;
  portalLadder.transitionDuration = PORTAL_ESTABLISH_SETTLE_SECONDS;
  portalLadder.lastSource = (options.reason || 'establish-center') + ' · current view became the new parent';
  escherZoomFocus = current.slice();
  escherPortalTarget = {
    portal: current.slice(),
    pair: [
      compactSubspaceCenterCandidate([current[0] - Math.cos(phase) * 0.045, current[1] - Math.sin(phase) * 0.045], 0.94, sourceLabel + '-left', phase),
      compactSubspaceCenterCandidate([current[0] + Math.cos(phase) * 0.045, current[1] + Math.sin(phase) * 0.045], 0.94, sourceLabel + '-right', phase + Math.PI)
    ].filter(Boolean),
    score: 1.0,
    phase,
    source: sourceLabel + ' #' + portalLadder.establishCount,
    recycle: true,
    ladder: { level: 0, direction: portalLadder.direction, lateral: 0, crossings: portalLadder.crossings, offMap: true, establishedCenter: portalLadder.establishCount, currentViewTransfer: true }
  };
  escherPortalOpened = options.suppressImmediatePortalOpen ? true : false;
  if (wasActive && refreshTransitEnvelope) {
    beginPortalTransit(true, 1.0, Math.max(PORTAL_TRANSIT_SECONDS, PORTAL_ESTABLISH_SETTLE_SECONDS));
  } else if (wasActive) {
    escherZoomActive = true;
    portalLadder.transitIntent = 1;
    portalLadder.transitTo = 1.0;
  }
  const flushed = flushProjectiveSubspacePortals(flushReason);
  if (options.log !== false && stats.log) {
    stats.log.textContent = 'Established new center #' + portalLadder.establishCount + ' exactly at the current rendered focus ' + current.map(v => v.toFixed(3)).join(', ') + '. Cleared ' + flushed + ' portal gate(s) after establishing the new parent, neutralized all W-pointers, discarded old parent ancestry, and reset local/absolute ladder coordinates so the next portal transfer starts from right here.';
  }
  if (options.updateStats !== false) updateStats();
  return { current, phase, flushed, count: portalLadder.establishCount };
}
function establishNewPortalCenter() {
  return establishCurrentViewPortalCenter({
    reason: 'manual-establish-center',
    sourceLabel: 'current-view-parent',
    flushReason: 'manual-establish-center-current-view',
    log: true,
    updateStats: true
  });
}
function maybeEstablishPortalTransitCenterFlush() {
  if (!portalRenderActive() || !portalLadder.transitIntent || paused) return 0;
  if (portalTransitBlend() < AUTONOMY_PORTAL_READY_BLEND) return 0;
  const last = Number.isFinite(Number(portalLadder.lastTransitCenterFlushTime)) ? Number(portalLadder.lastTransitCenterFlushTime) : (Number(simTime) || 0);
  if ((Number(simTime) || 0) - last < PORTAL_TRANSIT_CENTER_FLUSH_INTERVAL_SECONDS) return 0;
  const result = establishCurrentViewPortalCenter({
    reason: 'portal-transit-13s-transfer',
    sourceLabel: 'transit-13s-parent',
    flushReason: 'portal-transit-13s-center-flush',
    refreshTransitEnvelope: false,
    suppressImmediatePortalOpen: true,
    log: false,
    updateStats: false
  });
  if (stats.log) {
    stats.log.textContent = 'Portal transit 13s transfer: established the current rendered focus as parent #' + result.count + ' first, then cleared ' + result.flushed + ' portal gate(s) so transit continues from the new center only.';
  }
  return result.flushed;
}
function selectedResidentSignalResetMode() {
  return 'off';
}
function residentSignalResetLabel(mode = selectedResidentSignalResetMode()) {
  return 'off';
}
function isPinnedResidentSignalResetSelected() {
  return false;
}
function activeMasterLabel() {
  const coldBankSuffix = coldBankActiveMode !== 'off' ? ' · ' + activeColdBankLabel() : '';
  if (residentSignal && pinnedDescent) return 'PINNED DESCENT · continuous fold' + coldBankSuffix;
  if (residentSignal) return 'CONTINUOUS FOLD' + coldBankSuffix;
  if (pinnedDescent) return 'PINNED DESCENT · counterwound handshake active' + coldBankSuffix;
  return 'pure passive · no observer coupling' + coldBankSuffix;
}
function activeMasterShort() {
  const coldBankSuffix = coldBankActiveMode !== 'off' ? ' + ' + coldBankRunModeLabel(coldBankActiveMode) : '';
  if (residentSignal && pinnedDescent) return 'Resident Signal + Pinned Descent' + coldBankSuffix;
  if (residentSignal) return 'Regular Resident Signal' + coldBankSuffix;
  if (pinnedDescent) return 'Pinned Descent' + coldBankSuffix;
  return 'pure passive' + coldBankSuffix;
}
function syncResetRegimeLabel() {
  const idx = selectedResetRegimeIndex();
  const mode = selectedResidentSignalResetMode();
  const reset = el('resetBtn');
  if (reset) reset.textContent = 'Reset at ' + ui.stepRegimes[idx].label + ' · primordial universe';
  const autonomy = el('autonomousResetBtn');
  if (autonomy) {
    autonomy.textContent = 'Autonomous Chunking Reset A';
    autonomy.title = 'Reset using ' + autonomyModeLabel() + ': Riemann Autonomy forces shock-tube single-fold chunking; Full Autonomy keeps live feedback and capped 1→7 or 1→13 step-regime routing active after reset.';
  }
  syncPinnedDescentResetControls();
}
function syncPinnedDescentResetControls() {
  const pinnedResidentSignalResetSelected = isPinnedResidentSignalResetSelected();
  const reset = el('resetBtn');
  if (reset) {
    reset.disabled = pinnedResidentSignalResetSelected;
    reset.setAttribute('aria-disabled', String(pinnedResidentSignalResetSelected));
    reset.title = pinnedResidentSignalResetSelected
      ? 'Pinned Descent + Resident Signal is armed. Use Pinned Descent Reset P.'
      : 'Reset using the selected step regime and Resident Signal preset.';
  }
  const pinnedButton = el('pinnedDescentBtn');
  if (pinnedButton) {
    pinnedButton.textContent = pinnedResidentSignalResetSelected ? 'Pinned Descent Reset P' : 'Pinned Descent Reset P';
    pinnedButton.setAttribute('aria-label', pinnedResidentSignalResetSelected ? 'Pinned Descent Reset P' : 'Pinned Descent Reset P');
    pinnedButton.title = pinnedResidentSignalResetSelected
      ? 'Run the selected Resident Signal + Pinned Descent reset.'
      : 'Run a pristine Pinned Descent reset with Resident Signal off.';
  }
}
function runSelectedReset() {
  if (isPinnedResidentSignalResetSelected()) {
    syncPinnedDescentResetControls();
    stats.log.textContent = 'Pinned Descent + Resident Signal reset is armed. Use Pinned Descent Reset P so the pinned descent path owns this reset.';
    return;
  }
  resetZero({ usePreset: true });
}
function runPinnedDescentReset() {
  if (isPinnedResidentSignalResetSelected()) {
    resetZero({ usePreset: true });
  } else {
    resetZero({ pinnedDescent: true });
  }
}
function coldBankHasImportOrSynthesisEvidence() {
  return Boolean((syntaxColdBank.worlds && syntaxColdBank.worlds.length)
    || (syntaxColdBank.protectedSyntheses && syntaxColdBank.protectedSyntheses.length)
    || syntaxColdBank.activeSynthesis);
}
function prepareColdBankForAutonomyReset(mode = selectedAutonomousMode()) {
  return 'off';
}
function runAutonomousChunkingReset() {
  invalidateGpuFeedOptimizer('autonomous-reset', 12);
  autonomousMode = selectedAutonomousMode();
  const routeSignal = autonomyRoutingSignal();
  const nextIndex = selectAutonomousStepRegime(autonomousMode, routeSignal);
  syncResetRegimeLabel();
  resetZero({
    usePreset: true,
    stepRegimeIndex: nextIndex,
    autonomousMode,
    autonomyComplexity: routeSignal
  });
  stats.log.textContent = 'Autonomous Chunking reset: ' + autonomyModeLabel(autonomousMode)
    + ' selected ' + currentStepRegime().label
    + ' from route signal ' + routeSignal.toFixed(3)
    + '. ' + (currentStepRegime().riemannMode
      ? 'Riemann mode stays exact/validation-oriented and does not add live freedom pressure.'
      : '' + autonomyModeLabel(autonomousMode) + ' is now armed: it will scan the live matrix, update D-channel pressure, and reroute only through the capped 1→' + autonomyStepCapForMode(autonomousMode) + ' ladder without resetting. The manual 42/108/112 regimes remain available from the dropdown only.');
}
function compactAutonomyStatusText() {
  if (!autonomousActive) return 'idle · A starts autonomy';
  if (autonomousMode === 'riemann') return 'Riemann autonomy · validation branch';
  const asyncMark = autonomyDiagnostics?.asyncBackflow ? 'async' : 'armed';
  return autonomyModeLabel(autonomousMode)
    + ' · cap ' + autonomyStepCapForMode(autonomousMode)
    + ' · route ' + autonomyRoutingSignal().toFixed(2)
    + ' · ' + asyncMark
    + ' · ' + autonomyPortalTransitStatusText()
    + ' · ' + worldDigStatusText()
    + (autonomyDiagnostics?.lastRoute && autonomyDiagnostics.lastRoute !== 'none' ? ' · ' + autonomyDiagnostics.lastRoute : '');
}
function compactCpuStatusText() {
  return 'turbo · frame ' + cpuInstrumentation.frameMs.toFixed(2) + 'ms'
    + ' · sim ' + phaseMs('sim') + 'ms'
    + ' · workers ' + cpuInstrumentation.workerJobs + '/' + cpuInstrumentation.workerResponses
    + ' · steps ' + cpuInstrumentation.simStepsLast
    + ' · PBO ' + (app?.asyncBackflow?.enabled ? (app.asyncBackflow.pending + ' pending') : 'off')
    + ' · syntax pool ' + syntaxScanTransferPool.length + '/' + RESIDENT_SYNTAX_POOL_CAP;
}
function compactSubspaceStatusText() {
  return activeChunkCount() + '/' + MAX_CHUNKS
    + ' chunks · atlas ' + (app?.child ? app.childAtlasSize + '²' : 'lazy')
    + ' · route ' + portalLadderStatusText()
    + ' · feed ' + (gpuFeedOptimizer.supported ? gpuFeedOptimizer.status : 'off')
    + ' · backflow ' + (app?.asyncBackflow?.status || 'cold');
}
function updateStats() {
  const resolution = currentResolution();
  const viewing = currentViewingMode();
  const viewLabel = currentViewLabel();
  const regime = currentStepRegime();
  const present = presentationSize();
  if (RUNTIME_READOUTS_ENABLED) {
    if (stats.tick) stats.tick.textContent = tick + ' / ' + simTime.toFixed(1) + 's · ' + Math.round(fps || 0) + ' fps';
    if (stats.quality) stats.quality.textContent = resolution.label + ' · sim ' + simulationPixelSummary(app?.size || currentMatrixSize()) + ' · ' + viewing.label + ' · ' + renderEffectsSummary() + ' · ' + present.width + '×' + present.height;
    const visualStat = el('visualStat');
    if (visualStat) visualStat.textContent = resolution.label + ' · sim ' + simulationPixelSummary(app?.size || currentMatrixSize()) + ' · ' + viewLabel + ' · ' + viewing.label + ' · ' + renderEffectsSummary();
    const regimeStat = el('regimeStat');
    if (regimeStat) regimeStat.textContent = regime.label + ' · next reset ' + ui.stepRegimes[selectedResetRegimeIndex()].label;
    const genesis = el('genesisStat');
    if (genesis && !PERFORMANCE_UI_MINIMAL) genesis.textContent = regime.riemannMode ? 'shock-tube core · HLLC flux · densities 1–12 floor' : 'autonomous core · densities 1–12 active';
    const autonomyStat = el('autonomyStat');
    if (autonomyStat) autonomyStat.textContent = PERFORMANCE_UI_MINIMAL ? compactAutonomyStatusText() : autonomyStatusText();
    if (stats.cpu) stats.cpu.textContent = PERFORMANCE_UI_MINIMAL ? compactCpuStatusText() : cpuInstrumentationStatusText();
    const phaseLawStat = el('phaseLawStat');
    if (phaseLawStat && !PERFORMANCE_UI_MINIMAL) phaseLawStat.textContent = phaseLawStatusText();
    if (!PERFORMANCE_UI_MINIMAL) updateFrontierStats();
    const escherStat = el('escherStat');
    if (escherStat) escherStat.textContent = escherStatusText();
    if (stats.subspace) {
      stats.subspace.textContent = PERFORMANCE_UI_MINIMAL ? compactSubspaceStatusText() : activeChunkCount() + '/' + MAX_CHUNKS + ' chunks · atlas ' + (app?.child ? app.childAtlasSize + '² rolling' : 'lazy') + ' · ' + portalLadderStatusText() + ' · density×' + SUBSPACE_DENSITY_BUDGET.toFixed(1) + ' · ' + atlasAllocatorSummary() + ' · ' + portalRouteCompilerStatusText() + ' · ' + backgroundAutonomyPlannerStatusText() + ' · ' + gpuFeedOptimizerStatusText() + ' · ' + syntaxHardwareStatusText() + ' · ' + asyncBackflowStatusText() + ' · ' + churnSummary() + (subspace.lastPortal ? ' · portal ' + subspace.lastPortal.uv.join(',') : '');
    }
    const master = el('masterStat');
    if (master && !PERFORMANCE_UI_MINIMAL) master.textContent = activeMasterLabel();
    const lw = el('residentSignalStat');
    if (lw && !residentSignal && !PERFORMANCE_UI_MINIMAL) lw.textContent = 'off · no zero-syntax scan';
    if (app?.fmt && stats.engine) stats.engine.textContent = 'WebGL2 ' + app.fmt.label + ' · ' + present.width + '×' + present.height + ' · mip-depth CPU/RAM turbo';
  }
  syncEscherZoomButtonLabel();
  syncReticleButtonLabel();
  syncWorldDigControls();
  updateColdBankStats();
  syncResetRegimeLabel();
}
function updateCorner() {
  // Runtime HUD was intentionally stripped from this branch.
}
function updateFrameUi(now, force = false) {
  if (!force && !uiNeedsUpdate && !RUNTIME_READOUTS_ENABLED && !RUNTIME_HUD_ENABLED) return;
  const interval = uiHidden ? UI_UPDATE_INTERVAL_HIDDEN_MS : UI_UPDATE_INTERVAL_MS;
  if (!force && !uiNeedsUpdate && now - lastUiUpdateNow < interval) return;
  updateStats();
  if (RUNTIME_HUD_ENABLED) updateCorner();
  lastUiUpdateNow = now;
  uiNeedsUpdate = false;
}
function resizeCanvas() {
  const present = presentationSize();
  if (canvas.width !== present.width || canvas.height !== present.height) {
    canvas.width = present.width;
    canvas.height = present.height;
  }
}


function makeEmptyCpuInstrumentation() {
  return {
    schema: 'chrysalis-cpu-side-instrumentation-v0.1',
    frame: 0,
    lastFrameMs: 0,
    frameMs: 0,
    maxFrameMs: 0,
    longFrames: 0,
    simStepsLast: 0,
    phases: Object.create(null),
    lastPhases: Object.create(null),
    phaseCounts: Object.create(null),
    workerJobs: 0,
    workerResponses: 0,
    lastSummaryTick: 0
  };
}
function cpuEma(previous, value, alpha = CPU_INSTRUMENTATION_ALPHA) {
  const v = Math.max(0, Number(value) || 0);
  const p = Number(previous) || 0;
  return p ? p * (1 - alpha) + v * alpha : v;
}
function cpuRecordPhase(name, ms) {
  if (!CPU_PHASE_INSTRUMENTATION_ENABLED || !name) return;
  const v = Math.max(0, Number(ms) || 0);
  cpuInstrumentation.lastPhases[name] = v;
  cpuInstrumentation.phases[name] = cpuEma(cpuInstrumentation.phases[name], v);
  cpuInstrumentation.phaseCounts[name] = (cpuInstrumentation.phaseCounts[name] || 0) + 1;
}
function measureCpuPhase(name, fn) {
  if (!CPU_PHASE_INSTRUMENTATION_ENABLED) return fn();
  const start = performance.now();
  try {
    return fn();
  } finally {
    cpuRecordPhase(name, performance.now() - start);
  }
}
function beginCpuFrame() {
  if (CPU_PHASE_INSTRUMENTATION_ENABLED) {
    cpuInstrumentation.frame++;
    cpuInstrumentation.lastPhases = Object.create(null);
    cpuInstrumentation.simStepsLast = 0;
    return performance.now();
  }
  cpuInstrumentation.simStepsLast = 0;
  return 0;
}
function finishCpuFrame(startMs) {
  if (!CPU_PHASE_INSTRUMENTATION_ENABLED) return;
  const frameMs = Math.max(0, performance.now() - startMs);
  cpuInstrumentation.lastFrameMs = frameMs;
  cpuInstrumentation.frameMs = cpuEma(cpuInstrumentation.frameMs, frameMs);
  cpuInstrumentation.maxFrameMs = Math.max(Number(cpuInstrumentation.maxFrameMs) || 0, frameMs);
  if (frameMs > CPU_LONG_FRAME_MS) cpuInstrumentation.longFrames++;
}
function phaseMs(name) {
  return Number(cpuInstrumentation.phases[name] || 0).toFixed(2);
}
function cpuInstrumentationStatusText() {
  return CPU_PHASE_INSTRUMENTATION_ENABLED
    ? 'frame ' + cpuInstrumentation.frameMs.toFixed(2) + 'ms'
      + ' · sim ' + phaseMs('sim')
      + ' · render ' + phaseMs('render')
      + ' · syntax ' + phaseMs('residentSignal')
      + ' · auto ' + phaseMs('autonomy')
      + ' · plan ' + phaseMs('autonomyPlanner')
      + ' · route ' + phaseMs('routeCompiler')
      + ' · feed ' + phaseMs('gpuFeed')
      + ' · backflow ' + phaseMs('backflow')
      + ' · UI ' + phaseMs('ui')
      + ' · steps ' + cpuInstrumentation.simStepsLast
      + ' · workers ' + cpuInstrumentation.workerJobs + '/' + cpuInstrumentation.workerResponses
      + ' · long ' + cpuInstrumentation.longFrames
    : 'runtime readouts disabled';
}
function cpuInstrumentationSummaryObject() {
  return {
    schema: 'chrysalis-mac-air-reset-hotpath-v0.1',
    enabled: CPU_PHASE_INSTRUMENTATION_ENABLED,
    workerJobs: cpuInstrumentation.workerJobs,
    workerResponses: cpuInstrumentation.workerResponses,
    note: 'Performance phase instrumentation and runtime diagnostic readouts are disabled in this branch.'
  };
}
function makeEmptyChurnStats() {
  return {
    textureCreates: 0,
    textureUploads: 0,
    framebufferCreates: 0,
    startupAttachments: 0,
    liveAttachments: 0,
    fboBinds: 0,
    fboSwitches: 0,
    clears: 0,
    mipmapGenerates: 0,
    mipmapSkips: 0,
    mipmapDisabled: 0,
    depthOrderedDraws: 0,
    depthPolicy: activeDepthDrawPolicy(),
    lastFbo: null,
    lastSummaryTick: 0
  };
}
function churnSummary() {
  return 'bounded FBO · tex ' + churnStats.textureCreates
    + ' · fb ' + churnStats.framebufferCreates
    + ' · startup attach ' + churnStats.startupAttachments
    + ' · live attach ' + churnStats.liveAttachments
    + ' · binds ' + churnStats.fboBinds
    + ' · uploads ' + churnStats.textureUploads
    + ' · mips ' + churnStats.mipmapGenerates + '/' + churnStats.mipmapDisabled
    + ' · depth ' + activeDepthDrawPolicy();
}
function bindTargetFramebuffer(a, target) {
  const gl = a.gl;
  const fbo = target && target.fbo ? target.fbo : null;
  if (!a.glState) a.glState = makeGlStateCache();
  if (churnStats.lastFbo !== fbo) {
    churnStats.fboSwitches++;
    churnStats.lastFbo = fbo;
  }
  if (gpuFeedCacheEnabled() && a.glState.framebuffer === fbo) {
    gpuFeedOptimizer.stateSkips++;
    return;
  }
  churnStats.fboBinds++;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  a.glState.framebuffer = fbo;
}
function bindDefaultFramebuffer(a) {
  bindTargetFramebuffer(a, null);
}

function makeSyntaxHardware(gl) {
  const hardware = {
    supported: false,
    ready: false,
    status: 'cold',
    buffer: null,
    reservoir: new Float32Array(SYNTAX_BLOCK_FLOATS),
    uploads: 0,
    uploadBytes: 0,
    blockIndices: [],
    lastUploadTick: -1,
    errors: 0
  };
  if (!gl || typeof gl.createBuffer !== 'function') return hardware;
  try {
    hardware.buffer = gl.createBuffer();
    gl.bindBuffer(gl.UNIFORM_BUFFER, hardware.buffer);
    gl.bufferData(gl.UNIFORM_BUFFER, hardware.reservoir.byteLength, gl.DYNAMIC_DRAW);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, SYNTAX_BLOCK_BINDING_POINT, hardware.buffer);
    gl.bindBuffer(gl.UNIFORM_BUFFER, null);
    hardware.supported = true;
    hardware.status = 'allocated';
  } catch (err) {
    hardware.errors++;
    hardware.status = 'ubo-disabled';
  }
  return hardware;
}
function bindSyntaxHardwareBlock(gl, shaderProgram, hardware, name = 'program') {
  if (!gl || !shaderProgram || !hardware?.supported) return false;
  try {
    const idx = gl.getUniformBlockIndex(shaderProgram, 'ZeroSumSyntaxBlock');
    if (idx === gl.INVALID_INDEX || idx === 0xFFFFFFFF) return false;
    gl['uniformBlockBinding'](shaderProgram, idx, SYNTAX_BLOCK_BINDING_POINT);
    hardware.blockIndices.push({ name, index: idx });
    hardware.ready = true;
    hardware.status = 'bound';
    return true;
  } catch (err) {
    hardware.errors++;
    hardware.status = 'bind-failed';
    return false;
  }
}
function packPortalFrameIntoSyntaxBlock(out, chunkId, record) {
  if (!out || chunkId < 0 || chunkId >= MAX_CHUNKS) return;
  const base = SYNTAX_BLOCK_TOKEN_FLOATS + SYNTAX_BLOCK_META_FLOATS + chunkId * 16;
  const axes = record ? portalFrameAxesUniform(record) : [1, 0, 0, 1];
  const meta = record ? portalFrameMetaUniform(record) : [0, 1, 1, 0];
  const uv = record?.parentUv || [0.5, 0.5];
  out[base] = axes[0]; out[base + 1] = axes[1]; out[base + 2] = axes[2]; out[base + 3] = axes[3];
  out[base + 4] = meta[0]; out[base + 5] = meta[1]; out[base + 6] = meta[2]; out[base + 7] = meta[3];
  out[base + 8] = uv[0]; out[base + 9] = uv[1]; out[base + 10] = record ? 1 : 0; out[base + 11] = record ? -(chunkId + 1.0) : 0;
  out[base + 12] = Number(record?.age || 0); out[base + 13] = Number(record?.routeScore || 0); out[base + 14] = Number(record?.portalFrame?.twist || 0); out[base + 15] = Number(record?.portalFrame?.scale || 1);
}
function packSyntaxHardwareReservoir(a) {
  const hardware = a?.syntaxHardware;
  if (!hardware?.supported) return null;
  const out = hardware.reservoir;
  out.fill(0);
  // Authoritative compiled Zero-Sum syntax remains the main source so this pass does not alter sim semantics.
  if (compiledZeroSumLayer?.arrays?.tokens) out.set(compiledZeroSumLayer.arrays.tokens.subarray(0, SYNTAX_BLOCK_TOKEN_FLOATS), 0);
  if (compiledZeroSumLayer?.arrays?.meta) out.set(compiledZeroSumLayer.arrays.meta.subarray(0, SYNTAX_BLOCK_META_FLOATS), SYNTAX_BLOCK_TOKEN_FLOATS);
  // If the resident worker has a fresher block, use only its empty-slot suggestions, not to override existing compiled tokens.
  const resident = syntaxResidency.latestBlock;
  if (resident && resident.length >= SYNTAX_BLOCK_FLOATS && (!compiledZeroSumLayer.active || compiledZeroSumLayer.tokenCount <= 0)) {
    out.set(resident.subarray(0, SYNTAX_BLOCK_TOKEN_FLOATS), 0);
    out.set(resident.subarray(SYNTAX_BLOCK_TOKEN_FLOATS, SYNTAX_BLOCK_TOKEN_FLOATS + SYNTAX_BLOCK_META_FLOATS), SYNTAX_BLOCK_TOKEN_FLOATS);
  }
  for (let i = 0; i < MAX_CHUNKS; i++) packPortalFrameIntoSyntaxBlock(out, i, subspace.chunks[i]);
  out[SYNTAX_BLOCK_AUTONOMY_OFFSET] = autonomyPressure;
  out[SYNTAX_BLOCK_AUTONOMY_OFFSET + 1] = autonomyNovelty;
  out[SYNTAX_BLOCK_AUTONOMY_OFFSET + 2] = autonomyStagnation;
  out[SYNTAX_BLOCK_AUTONOMY_OFFSET + 3] = residentSignalFullness;
  out[SYNTAX_BLOCK_PHASE_OFFSET] = Number(phaseLaw.axisPhase || 0);
  out[SYNTAX_BLOCK_PHASE_OFFSET + 1] = Number(phaseLaw.amplitudeMean || 0);
  out[SYNTAX_BLOCK_PHASE_OFFSET + 2] = Number(phaseLaw.eventMacroIndex || 0);
  out[SYNTAX_BLOCK_PHASE_OFFSET + 3] = Number(phaseLaw.eventAttempt || 0);
  const packet = autonomyHysteresis?.transitionPacket || {};
  out[SYNTAX_BLOCK_HYSTERESIS_OFFSET] = Number(packet.certainty || backgroundAutonomyPlanner?.decision?.certainty || 0);
  out[SYNTAX_BLOCK_HYSTERESIS_OFFSET + 1] = Number(packet.signal || autonomyRoutingSignal());
  out[SYNTAX_BLOCK_HYSTERESIS_OFFSET + 2] = Number(autonomyHysteresis?.confirmations || 0);
  out[SYNTAX_BLOCK_HYSTERESIS_OFFSET + 3] = Math.min(1, Number(compiledZeroSumLayer?.tokenCount || 0) / COMPILED_ZERO_SUM_TOKEN_CAP);
  return out;
}
function uploadSyntaxHardware(a, force = false) {
  const gl = a?.gl;
  const hardware = a?.syntaxHardware;
  if (!gl || !hardware?.supported || !hardware.buffer) return false;
  if (!force && hardware.lastUploadTick === tick && gpuFeedCacheEnabled()) return false;
  const reservoir = packSyntaxHardwareReservoir(a);
  if (!reservoir) return false;
  try {
    gl.bindBuffer(gl.UNIFORM_BUFFER, hardware.buffer);
    gl.bufferSubData(gl.UNIFORM_BUFFER, 0, reservoir);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, SYNTAX_BLOCK_BINDING_POINT, hardware.buffer);
    gl.bindBuffer(gl.UNIFORM_BUFFER, null);
    hardware.uploads++;
    hardware.uploadBytes += reservoir.byteLength;
    hardware.lastUploadTick = tick;
    hardware.ready = true;
    hardware.status = 'streaming';
    return true;
  } catch (err) {
    hardware.errors++;
    hardware.ready = false;
    hardware.status = 'upload-failed';
    return false;
  }
}
function syntaxHardwareStatusText() {
  const h = app?.syntaxHardware;
  if (!h?.supported) return 'ubo off';
  return 'ubo ' + h.status + ' · ' + h.uploads + ' up · ' + formatBytes(h.uploadBytes || 0) + ' · ' + syntaxResidencyStatusText();
}

function compile(gl, type, src) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader) || 'shader compile failed';
    gl.deleteShader(shader);
    throw new Error(info);
  }
  return shader;
}
function program(gl, vs, fs) {
  const p = gl.createProgram();
  const v = compile(gl, gl.VERTEX_SHADER, vs);
  const f = compile(gl, gl.FRAGMENT_SHADER, fs);
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(p) || 'program link failed';
    gl.deleteProgram(p);
    throw new Error(info);
  }
  return p;
}
function uniformDescriptorNames(...registries) {
  const names = [];
  const seen = new Set();
  for (const registry of registries) {
    for (const name of Object.keys(registry)) {
      if (seen.has(name)) continue;
      seen.add(name);
      names.push(name);
    }
  }
  return names;
}
function makeUniformMap(gl, shaderProgram, names) {
  const locations = {};
  for (const name of names) locations[name] = gl.getUniformLocation(shaderProgram, name);
  return locations;
}
function makeGlStateCache() {
  return {
    program: null,
    framebuffer: undefined,
    activeTexture: null,
    texture2D: new Map(),
    viewportX: NaN,
    viewportY: NaN,
    viewportW: NaN,
    viewportH: NaN,
    uniforms: Object.create(null)
  };
}
const UNIFORM_REGISTRY_ENTRIES = new WeakMap();
function uniformRegistryEntries(registry) {
  let entries = UNIFORM_REGISTRY_ENTRIES.get(registry);
  if (!entries) {
    entries = Object.entries(registry);
    UNIFORM_REGISTRY_ENTRIES.set(registry, entries);
  }
  return entries;
}
function resetGlStateCache(a) {
  if (!a) return;
  a.glState = makeGlStateCache();
}
function clearUniformNamespace(a, namespace) {
  if (!a?.glState?.uniforms || !namespace) return;
  delete a.glState.uniforms[namespace];
}
function uniformScalarEqual(a, b) {
  return Object.is(a, b) || (Number.isFinite(a) && Number.isFinite(b) && Math.abs(Number(a) - Number(b)) <= 1e-8);
}
function uniformArrayLength(value) {
  return value && Number.isFinite(Number(value.length)) ? Math.max(0, Math.floor(Number(value.length))) : 0;
}
function uniformArrayEqual(previous, value) {
  const length = uniformArrayLength(value);
  if (!previous || previous.length !== length) return false;
  gpuFeedOptimizer.uniformArrayChecks++;
  for (let i = 0; i < length; i++) {
    if (!uniformScalarEqual(previous[i], value[i])) return false;
  }
  return true;
}
function isUniformArrayKind(kind) {
  return kind === '2f' || kind === '2i' || kind === '4f' || kind === '1fv' || kind === '2iv' || kind === '4fv';
}
function copyUniformArrayCache(previous, kind, value) {
  const length = uniformArrayLength(value);
  let out = previous && previous.length === length ? previous : null;
  if (!out) out = (kind === '2i' || kind === '2iv') ? new Int32Array(length) : new Float32Array(length);
  for (let i = 0; i < length; i++) out[i] = Number(value[i]) || 0;
  return out;
}
function uniformCacheValue(kind, value) {
  if (kind === '1i') return Math.trunc(Number(value) || 0);
  if (kind === '1f') return Number(value) || 0;
  return value;
}
function shouldUploadUniform(namespaceCache, name, kind, value) {
  const prev = namespaceCache[name];
  if (isUniformArrayKind(kind)) {
    if (uniformArrayEqual(prev, value)) {
      gpuFeedOptimizer.uniformSkips++;
      return false;
    }
    namespaceCache[name] = copyUniformArrayCache(prev, kind, value);
    gpuFeedOptimizer.uniformUploads++;
    return true;
  }
  const next = uniformCacheValue(kind, value);
  if (uniformScalarEqual(prev, next)) {
    gpuFeedOptimizer.uniformSkips++;
    return false;
  }
  namespaceCache[name] = next;
  gpuFeedOptimizer.uniformUploads++;
  return true;
}
function applyUniforms(gl, locations, registry, context = {}) {
  for (const [name, descriptor] of uniformRegistryEntries(registry)) {
    const location = locations[name];
    if (location === null || location === undefined) continue;
    const [kind, read] = descriptor;
    const value = typeof read === 'function' ? read(context) : read;
    applyUniformValue(gl, location, kind, value);
  }
}
function applyUniformValue(gl, location, kind, value) {
  switch (kind) {
    case '1i': gl.uniform1i(location, value); break;
    case '1f': gl.uniform1f(location, value); break;
    case '2f': gl.uniform2f(location, value[0], value[1]); break;
    case '2i': gl.uniform2i(location, value[0], value[1]); break;
    case '4f': gl.uniform4f(location, value[0], value[1], value[2], value[3]); break;
    case '1fv': gl.uniform1fv(location, value); break;
    case '2iv': gl.uniform2iv(location, value); break;
    case '4fv': gl.uniform4fv(location, value); break;
    default: throw new Error('unsupported uniform binding kind: ' + kind);
  }
}
function applyUniformsCached(a, namespace, locations, registry, context = {}) {
  const gl = a.gl;
  if (!gpuFeedCacheEnabled()) {
    applyUniforms(gl, locations, registry, context);
    return;
  }
  if (!a.glState) a.glState = makeGlStateCache();
  const root = a.glState.uniforms;
  const namespaceCache = root[namespace] || (root[namespace] = Object.create(null));
  for (const [name, descriptor] of uniformRegistryEntries(registry)) {
    const location = locations[name];
    if (location === null || location === undefined) continue;
    const [kind, read] = descriptor;
    const value = typeof read === 'function' ? read(context) : read;
    if (!shouldUploadUniform(namespaceCache, name, kind, value)) continue;
    applyUniformValue(gl, location, kind, value);
  }
}
function useProgramCached(a, shaderProgram) {
  if (!a.glState) a.glState = makeGlStateCache();
  if (gpuFeedCacheEnabled() && a.glState.program === shaderProgram) {
    gpuFeedOptimizer.programSkips++;
    return;
  }
  a.gl.useProgram(shaderProgram);
  a.glState.program = shaderProgram;
}
function activeTextureCached(a, unit) {
  if (!a.glState) a.glState = makeGlStateCache();
  if (gpuFeedCacheEnabled() && a.glState.activeTexture === unit) return;
  a.gl.activeTexture(unit);
  a.glState.activeTexture = unit;
}
function bindTexture2DCached(a, texture) {
  if (!a.glState) a.glState = makeGlStateCache();
  const unit = a.glState.activeTexture ?? a.gl.TEXTURE0;
  if (gpuFeedCacheEnabled() && a.glState.texture2D.get(unit) === texture) {
    gpuFeedOptimizer.textureBindSkips++;
    return;
  }
  a.gl.bindTexture(a.gl.TEXTURE_2D, texture);
  a.glState.texture2D.set(unit, texture);
}
function viewportCached(a, x, y, w, h) {
  if (!a.glState) a.glState = makeGlStateCache();
  if (gpuFeedCacheEnabled() && a.glState.viewportX === x && a.glState.viewportY === y && a.glState.viewportW === w && a.glState.viewportH === h) {
    gpuFeedOptimizer.viewportSkips++;
    return;
  }
  a.gl.viewport(x, y, w, h);
  a.glState.viewportX = x;
  a.glState.viewportY = y;
  a.glState.viewportW = w;
  a.glState.viewportH = h;
}
function mipLevelCount(size) {
  const n = Math.max(1, Math.floor(Number(size) || 1));
  return Math.floor(Math.log2(n)) + 1;
}
function mipmapFilterFor(gl, fmt = {}) {
  if (!TEXTURE_MIPMAPS_ALLOCATED) return gl.NEAREST;
  const linearOk = TEXTURE_MIPMAP_SAFE_LINEAR && Boolean(gl.getExtension('OES_texture_float_linear'));
  if (linearOk && fmt && (fmt.type === gl.FLOAT || fmt.type === gl.HALF_FLOAT)) return gl.LINEAR_MIPMAP_LINEAR;
  return gl.NEAREST_MIPMAP_NEAREST;
}
function textureFilterLabel(gl, value) {
  const labels = new Map([
    [gl.NEAREST, 'NEAREST'],
    [gl.LINEAR, 'LINEAR'],
    [gl.NEAREST_MIPMAP_NEAREST, 'NEAREST_MIPMAP_NEAREST'],
    [gl.NEAREST_MIPMAP_LINEAR, 'NEAREST_MIPMAP_LINEAR'],
    [gl.LINEAR_MIPMAP_NEAREST, 'LINEAR_MIPMAP_NEAREST'],
    [gl.LINEAR_MIPMAP_LINEAR, 'LINEAR_MIPMAP_LINEAR']
  ]);
  return labels.get(value) || String(value);
}
function makeTexture(gl, size, fmt, options = {}) {
  const tex = gl.createTexture();
  const mipCapable = options.mipmapped !== false && TEXTURE_MIPMAPS_ALLOCATED;
  const levels = mipCapable ? mipLevelCount(size) : 1;
  const mipActive = mipCapable && mipmapRenderingEnabled();
  const minFilter = mipActive ? mipmapFilterFor(gl, fmt) : gl.NEAREST;
  const maxLevel = mipActive ? levels - 1 : 0;
  churnStats.textureCreates++;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minFilter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  if (mipCapable && typeof gl.TEXTURE_BASE_LEVEL === 'number') gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_BASE_LEVEL, 0);
  if (mipCapable && typeof gl.TEXTURE_MAX_LEVEL === 'number') gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, maxLevel);
  if (mipCapable && typeof gl.TEXTURE_MIN_LOD === 'number') gl.texParameterf(gl.TEXTURE_2D, gl.TEXTURE_MIN_LOD, 0.0);
  if (mipCapable && typeof gl.TEXTURE_MAX_LOD === 'number') gl.texParameterf(gl.TEXTURE_2D, gl.TEXTURE_MAX_LOD, Math.max(0, maxLevel));
  if (typeof gl.texStorage2D === 'function') {
    gl.texStorage2D(gl.TEXTURE_2D, levels, fmt.internalFormat, size, size);
  } else {
    gl.texImage2D(gl.TEXTURE_2D, 0, fmt.internalFormat, size, size, 0, gl.RGBA, fmt.type, null);
  }
  textureMipInfo.set(tex, {
    label: options.label || 'texture',
    size, levels, minFilter, mipCapable, mipActive, dirty: mipActive, failed: false, generations: 0,
    filterLabel: textureFilterLabel(gl, minFilter)
  });
  return tex;
}
function markTextureMipsDirty(a, texture) {
  const info = textureMipInfo.get(texture);
  if (!info || !info.mipCapable || !info.mipActive || info.failed) return;
  info.dirty = true;
  if (a?.mipmapDirty) a.mipmapDirty.add(texture);
}
function disableTextureMips(a, texture, reason = 'generateMipmap failed') {
  const gl = a.gl;
  const info = textureMipInfo.get(texture);
  if (!info || info.failed) return;
  activeTextureCached(a, a.mipmapUnit || gl.TEXTURE0);
  bindTexture2DCached(a, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  if (typeof gl.TEXTURE_MAX_LEVEL === 'number') gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, 0);
  info.failed = true;
  info.mipActive = false;
  info.dirty = false;
  info.failReason = reason;
  if (a.mipmapDirty) a.mipmapDirty.delete(texture);
  churnStats.mipmapDisabled++;
}
function refreshTextureMipmap(a, texture) {
  if (!a || a.kind !== 'webgl2' || !texture) return false;
  const info = textureMipInfo.get(texture);
  if (!info || !info.mipCapable || !info.mipActive || info.failed || !info.dirty) {
    churnStats.mipmapSkips++;
    return false;
  }
  const gl = a.gl;
  activeTextureCached(a, a.mipmapUnit || gl.TEXTURE0);
  bindTexture2DCached(a, texture);
  gl.generateMipmap(gl.TEXTURE_2D);
  if (HOT_GL_ERROR_CHECKS) {
    const err = gl.getError();
    if (err !== gl.NO_ERROR) {
      disableTextureMips(a, texture, 'WebGL error 0x' + err.toString(16));
      return false;
    }
  }
  info.dirty = false;
  info.generations++;
  churnStats.mipmapGenerates++;
  return true;
}
function refreshRenderMipmaps(a) {
  if (!a || a.kind !== 'webgl2' || !a.mipmapDirty || !a.mipmapDirty.size || !mipmapRenderingEnabled()) return;
  bindDefaultFramebuffer(a);
  let refreshed = 0;
  const maxRefresh = mipmapMaxPerFrame();
  if (maxRefresh <= 0) return;
  for (const texture of a.mipmapDirty) {
    if (refreshed >= maxRefresh) break;
    if (refreshTextureMipmap(a, texture)) refreshed++;
    const info = textureMipInfo.get(texture);
    if (!info || !info.dirty || info.failed || !info.mipActive) a.mipmapDirty.delete(texture);
  }
}
function applyMipmapModeToTextures(a, forceDirty = false) {
  if (!a || a.kind !== 'webgl2') return;
  const gl = a.gl;
  const textures = [...(a.state || []), ...(a.child || [])].filter(Boolean);
  const enabled = mipmapRenderingEnabled();
  for (const tex of textures) {
    const info = textureMipInfo.get(tex);
    if (!info || info.failed) continue;
    activeTextureCached(a, a.mipmapUnit || gl.TEXTURE0);
    bindTexture2DCached(a, tex);
    const mipActive = enabled && info.mipCapable;
    const maxLevel = mipActive ? Math.max(0, Number(info.levels || 1) - 1) : 0;
    const minFilter = mipActive ? mipmapFilterFor(gl, a.fmt) : gl.NEAREST;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minFilter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    if (info.mipCapable && typeof gl.TEXTURE_BASE_LEVEL === 'number') gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_BASE_LEVEL, 0);
    if (info.mipCapable && typeof gl.TEXTURE_MAX_LEVEL === 'number') gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, maxLevel);
    if (info.mipCapable && typeof gl.TEXTURE_MIN_LOD === 'number') gl.texParameterf(gl.TEXTURE_2D, gl.TEXTURE_MIN_LOD, 0.0);
    if (info.mipCapable && typeof gl.TEXTURE_MAX_LOD === 'number') gl.texParameterf(gl.TEXTURE_2D, gl.TEXTURE_MAX_LOD, Math.max(0, maxLevel));
    info.mipActive = mipActive;
    info.dirty = mipActive && (forceDirty || info.dirty);
    info.minFilter = minFilter;
    info.filterLabel = textureFilterLabel(gl, minFilter);
    if (a.mipmapDirty && !mipActive) a.mipmapDirty.delete(tex);
    if (forceDirty && mipActive) markTextureMipsDirty(a, tex);
  }
}
function mipmapStatusText(a) {
  if (!a || a.kind !== 'webgl2' || !mipmapRenderingEnabled()) return 'mips off';
  const parts = [];
  for (const tex of [...(a.state || []), ...(a.child || [])]) {
    const info = textureMipInfo.get(tex);
    if (!info) continue;
    parts.push((info.label || 'tex') + ':' + (info.mipActive && !info.failed ? info.filterLabel : 'NEAREST') + ' g' + Number(info.generations || 0));
  }
  return parts.length ? 'mips ' + parts.join(' ') : 'mips off';
}
function makeAttachedFramebuffer(gl, texture, label = 'target') {
  const fbo = gl.createFramebuffer();
  churnStats.framebufferCreates++;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  churnStats.startupAttachments++;
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  if (CHURN_DEBUG) {
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    if (!ok) throw new Error('framebuffer incomplete for ' + label);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fbo, texture, label };
}
function makeTextureTargets(gl, textures, label) {
  return textures.map((texture, index) => makeAttachedFramebuffer(gl, texture, label + '[' + index + ']'));
}
function tryFormat(gl, size) {
  const half = gl.getExtension('EXT_color_buffer_float');
  if (!half) throw new Error('EXT_color_buffer_float unavailable');

  const candidates = [
    { label: 'RGBA16F', internalFormat: gl.RGBA16F, type: gl.HALF_FLOAT },
    { label: 'RGBA32F', internalFormat: gl.RGBA32F, type: gl.FLOAT }
  ];
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  for (const fmt of candidates) {
    const tex = makeTexture(gl, size, fmt, { mipmapped: false, label: 'format-probe-' + fmt.label });
    churnStats.startupAttachments++;
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.deleteTexture(tex);
    if (ok) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteFramebuffer(fbo);
      return fmt;
    }
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.deleteFramebuffer(fbo);
  throw new Error('no float render target available');
}
function clearRenderTargets(a, targets, size) {
  const gl = a.gl;
  viewportCached(a, 0, 0, size, size);
  gl.clearColor(0, 0, 0, 0);
  for (const target of targets) {
    bindTargetFramebuffer(a, target);
    gl.clear(gl.COLOR_BUFFER_BIT);
    churnStats.clears++;
    markTextureMipsDirty(a, target.texture);
  }
  bindDefaultFramebuffer(a);
}
function clearTextures(gl, fbo, textures, size) {
  // Compatibility helper kept for older call-sites/guards. Hot paths use
  // preattached framebuffer targets so attachment churn stays bounded.
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.viewport(0, 0, size, size);
  gl.clearColor(0, 0, 0, 0);
  for (const tex of textures) {
    churnStats.liveAttachments++;
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}


function bytesToBase64(bytes) {
  let out = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    out += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(out);
}
function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function saveFileName() {
  const regime = currentStepRegime().name.replace(/[^a-z0-9-]+/gi, '-');
  const mode = residentSignal ? 'resident-signal' : pinnedDescent ? 'pinned-descent' : 'pure-passive';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return 'chrysalis-state-' + regime + '-' + mode + '-t' + tick + '-' + stamp + '.json';
}
function asyncBackflowRingSizeFor(size = MATRIX_SIZE) {
  const bytesPerSlot = matrixFrameByteLength(size);
  const baseBudget = BASE_FRAME_BYTE_LENGTH * ASYNC_BACKFLOW_RING_SIZE;
  return Math.max(8, Math.min(ASYNC_BACKFLOW_RING_SIZE, Math.floor(baseBudget / Math.max(1, bytesPerSlot))));
}
function makeAsyncBackflowReadback(gl, size) {
  const state = {
    schema: 'chrysalis-async-backflow-pbo-v0.1',
    supported: false,
    enabled: false,
    status: 'cold',
    size,
    byteLength: size * size * 4 * Float32Array.BYTES_PER_ELEMENT,
    slots: [],
    seq: 0,
    enqueued: 0,
    completed: 0,
    pending: 0,
    errors: 0,
    lastEnqueueTime: -Infinity,
    lastCompleteTime: -Infinity,
    latestPixels: null,
    latestSeq: 0,
    consumedSeq: 0,
    pendingQueue: [],
    history: []
  };
  if (!gl || typeof gl.createBuffer !== 'function' || typeof gl.fenceSync !== 'function' || typeof gl.clientWaitSync !== 'function' || typeof gl.getBufferSubData !== 'function') {
    state.status = 'unsupported';
    return state;
  }
  try {
    const ringSize = asyncBackflowRingSizeFor(size);
    for (let i = 0; i < ringSize; i++) {
      const pbo = gl.createBuffer();
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
      gl.bufferData(gl.PIXEL_PACK_BUFFER, state.byteLength, gl.STREAM_READ);
      state.slots.push({ index: i, pbo, sync: null, pending: false, seq: 0, tick: 0, simTime: 0, pixels: new Float32Array(size * size * 4) });
    }
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    state.supported = true;
    state.enabled = true;
    state.status = 'ready';
  } catch (err) {
    state.errors++;
    state.status = 'init-failed';
  }
  return state;
}
function ensureAsyncBackflow(a) {
  if (!a || a.kind !== 'webgl2') return null;
  if (!a.asyncBackflow) a.asyncBackflow = makeAsyncBackflowReadback(a.gl, a.size);
  return a.asyncBackflow;
}
function asyncBackflowNeedActive() {
  return Boolean(residentSignal || autonomousActive || portalRenderActive() || activeChunkCount() > 0);
}
function enqueueAsyncBackflowRead(a, force = false) {
  const gl = a?.gl;
  const rb = ensureAsyncBackflow(a);
  if (!gl || !rb?.enabled) return false;
  const budget = currentDiagnosticBudget();
  const interval = Math.max(ASYNC_BACKFLOW_MIN_INTERVAL_SECONDS, Number(budget.backflowMinInterval || ASYNC_BACKFLOW_MIN_INTERVAL_SECONDS));
  if (!force && (Number(simTime) || 0) - rb.lastEnqueueTime < interval) return false;
  if (!force && Number(rb.pending || 0) >= Math.max(1, Math.floor(Number(budget.maxPendingReadbacks || 1)))) {
    rb.status = 'throttled';
    return false;
  }
  const slot = rb.slots.find(s => !s.pending);
  if (!slot) {
    rb.status = 'ring-full';
    return false;
  }
  try {
    bindTargetFramebuffer(a, a.stateTargets[a.sRead]);
    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    gl.pixelStorei(gl.PACK_ALIGNMENT, 1);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, slot.pbo);
    gl.readPixels(0, 0, rb.size, rb.size, gl.RGBA, gl.FLOAT, 0);
    slot.sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    if (typeof gl.flush === 'function') gl.flush();
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    bindDefaultFramebuffer(a);
    slot.pending = true;
    if (Array.isArray(rb.pendingQueue)) rb.pendingQueue.push(slot.index);
    slot.seq = ++rb.seq;
    slot.tick = tick;
    slot.simTime = simTime;
    rb.pending++;
    rb.enqueued++;
    rb.lastEnqueueTime = simTime;
    rb.status = 'queued';
    return true;
  } catch (err) {
    rb.errors++;
    rb.status = 'enqueue-failed';
    try { gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null); bindDefaultFramebuffer(a); } catch (_) {}
    return false;
  }
}
function sendResidentSyntaxScan(pixels, seq) {
  if (!pixels || !startSyntaxResidencyWorker()) return false;
  const budget = currentDiagnosticBudget();
  const maxInFlight = Math.max(1, Math.floor(Number(budget.maxInFlightSyntax || 1)));
  const minInterval = Math.max(RESIDENT_SYNTAX_MIN_INTERVAL_SECONDS, Number(budget.residentSyntaxMinInterval || RESIDENT_SYNTAX_MIN_INTERVAL_SECONDS));
  if ((Number(syntaxResidency.inFlight || 0) >= maxInFlight) || ((Number(simTime) || 0) - Number(syntaxResidency.lastTransferTime || -Infinity) < minInterval)) {
    syntaxResidency.droppedJobs++;
    return false;
  }
  let copy = null;
  try {
    copy = syntaxScanTransferPool.pop();
    if (copy && copy.length !== pixels.length) copy = null;
    if (copy) {
      syntaxResidency.poolHits++;
    } else {
      syntaxResidency.poolMisses++;
      copy = new Float32Array(pixels.length);
    }
    copy.set(pixels);
    const meta = {
      autonomyPressure,
      autonomyNovelty,
      autonomyStagnation,
      residentSignalFullness,
      phaseLawAxisPhase: Number(phaseLaw.axisPhase || 0),
      phaseLawAmplitude: Number(phaseLaw.amplitudeMean || 0),
      phaseLawMacroIndex: Number(phaseLaw.eventMacroIndex || 0),
      phaseLawAttempt: Number(phaseLaw.eventAttempt || 0),
      hysteresisCertainty: Number(autonomyHysteresis?.transitionPacket?.certainty || 0),
      hysteresisSignal: Number(autonomyHysteresis?.transitionPacket?.signal || autonomyRoutingSignal()),
      hysteresisConfirmations: Number(autonomyHysteresis?.confirmations || 0)
    };
    syntaxResidency.jobs++;
    syntaxResidency.transfers++;
    syntaxResidency.transferredBytes += copy.byteLength;
    syntaxResidency.lastTransferTime = simTime;
    const worker = pickSyntaxResidencyWorker();
    if (!worker) {
      syntaxResidency.droppedJobs++;
      if (copy && syntaxScanTransferPool.length < residentSyntaxPoolCapForSize(app?.size || MATRIX_SIZE)) syntaxScanTransferPool.push(copy);
      return false;
    }
    syntaxResidency.status = 'resident-scanning';
    syntaxResidency.inFlight++;
    cpuInstrumentation.workerJobs++;
    worker.postMessage({ type: 'SCAN_DATA', id: seq, tick, simTime, size: app?.size || MATRIX_SIZE, stride: RESIDENT_SYNTAX_WORKER_STRIDE, meta, payload: copy.buffer }, [copy.buffer]);
    return true;
  } catch (err) {
    syntaxResidency.inFlight = Math.max(0, syntaxResidency.inFlight - 1);
    if (copy && syntaxScanTransferPool.length < residentSyntaxPoolCapForSize(app?.size || MATRIX_SIZE)) syntaxScanTransferPool.push(copy);
    syntaxResidency.errors++;
    syntaxResidency.status = 'transfer-failed';
    return false;
  }
}
function pollAsyncBackflowReadback(a) {
  const gl = a?.gl;
  const rb = ensureAsyncBackflow(a);
  if (!gl || !rb?.enabled) return null;
  let latest = null;
  const queue = Array.isArray(rb.pendingQueue) ? rb.pendingQueue : [];
  let completedThisFrame = 0;
  const maxCompletions = Math.max(1, Math.floor(Number(ASYNC_BACKFLOW_MAX_COMPLETIONS_PER_FRAME) || 1));
  for (let qi = 0; qi < queue.length && completedThisFrame < maxCompletions;) {
    const slot = rb.slots[queue[qi]];
    if (!slot || !slot.pending || !slot.sync) {
      queue.splice(qi, 1);
      continue;
    }
    let status = gl.TIMEOUT_EXPIRED;
    try {
      status = gl.clientWaitSync(slot.sync, 0, 0);
    } catch (err) {
      rb.errors++;
      rb.status = 'poll-failed';
      qi++;
      continue;
    }
    if (status !== gl.ALREADY_SIGNALED && status !== gl.CONDITION_SATISFIED) {
      qi++;
      continue;
    }
    queue.splice(qi, 1);
    try {
      const pixels = slot.pixels || new Float32Array(rb.size * rb.size * 4);
      slot.pixels = pixels;
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, slot.pbo);
      gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, pixels);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      gl.deleteSync(slot.sync);
      slot.sync = null;
      slot.pending = false;
      rb.pending = Math.max(0, rb.pending - 1);
      rb.completed++;
      rb.latestPixels = pixels;
      rb.latestSeq = slot.seq;
      rb.lastCompleteTime = simTime;
      rb.status = 'ready seq ' + slot.seq;
      rb.history.unshift({ seq: slot.seq, tick: slot.tick, simTime: Number(slot.simTime).toFixed(3) });
      rb.history.length = Math.min(ASYNC_BACKFLOW_READY_HISTORY_CAP, rb.history.length);
      sendResidentSyntaxScan(pixels, slot.seq);
      completedThisFrame++;
      latest = pixels;
    } catch (err) {
      rb.errors++;
      rb.status = 'readback-failed';
      try { gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null); } catch (_) {}
    }
  }
  return latest;
}
function pumpAsyncBackflow(a, force = false) {
  const rb = ensureAsyncBackflow(a);
  if (!rb?.enabled) return null;
  const ready = pollAsyncBackflowReadback(a);
  if (force || asyncBackflowNeedActive()) enqueueAsyncBackflowRead(a, force);
  return ready;
}
function takeAsyncBackflowPixels(a) {
  const rb = ensureAsyncBackflow(a);
  if (!rb?.enabled || !rb.latestPixels || rb.latestSeq === rb.consumedSeq) return null;
  rb.consumedSeq = rb.latestSeq;
  return rb.latestPixels;
}
function asyncBackflowStatusText() {
  const rb = app?.asyncBackflow;
  if (!rb?.supported) return 'pbo off';
  return 'pbo ' + rb.status + ' · q ' + rb.enqueued + '/' + rb.completed + ' pend ' + rb.pending + ' · ' + formatBytes((rb.completed || 0) * (rb.byteLength || 0));
}

function readCurrentStatePixels(a) {
  const gl = a.gl;
  const pixels = new Float32Array(a.size * a.size * 4);
  bindTargetFramebuffer(a, a.stateTargets[a.sRead]);
  gl.readBuffer(gl.COLOR_ATTACHMENT0);
  gl.pixelStorei(gl.PACK_ALIGNMENT, 1);
  gl.readPixels(0, 0, a.size, a.size, gl.RGBA, gl.FLOAT, pixels);
  if (CHURN_DEBUG) {
    const err = gl.getError();
    if (err !== gl.NO_ERROR) {
      bindDefaultFramebuffer(a);
      throw new Error('state readback failed with WebGL error 0x' + err.toString(16));
    }
  }
  bindDefaultFramebuffer(a);
  return pixels;
}
function writeStatePixels(a, pixels) {
  const gl = a.gl;
  if (!(pixels instanceof Float32Array) || pixels.length !== a.size * a.size * 4) {
    throw new Error('loaded state has the wrong matrix payload length');
  }
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  for (const tex of a.state) {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, a.size, a.size, gl.RGBA, gl.FLOAT, pixels);
    churnStats.textureUploads++;
    markTextureMipsDirty(a, tex);
    if (CHURN_DEBUG) {
      const err = gl.getError();
      if (err !== gl.NO_ERROR) throw new Error('state upload failed with WebGL error 0x' + err.toString(16));
    }
  }
  a.sRead = 0;
  a.sWrite = 1;
  resetGlStateCache(a);
}
function saveState() {
  if (!app?.kind || app.kind !== 'webgl2') {
    stats.log.textContent = 'Save State unavailable: WebGL2 state is not live.';
    return;
  }
  try {
    const pixels = readCurrentStatePixels(app);
    const bytes = new Uint8Array(pixels.buffer);
    const payload = {
      schema: SAVE_SCHEMA,
      createdAt: new Date().toISOString(),
      matrixSize: app.size,
      channels: 4,
      dataType: 'float32-little-endian-base64',
      tick,
      simTime,
      pinnedDescent,
      residentSignal,
      residentSignalEpoch,
      residentSignalFullness,
      residentSignalManifest,
      compiledZeroSumSyntax: {
        schema: compiledZeroSumLayer.schema,
        active: Boolean(compiledZeroSumLayer.active),
        source: compiledZeroSumLayer.source,
        compiledTick: compiledZeroSumLayer.compiledTick,
        tokenCount: compiledZeroSumLayer.tokenCount,
        sourceTokenCount: compiledZeroSumLayer.sourceTokenCount,
        gain: compiledZeroSumLayer.gain,
        coverage: compiledZeroSumLayer.coverage,
        supportMean: compiledZeroSumLayer.supportMean,
        tokenBindingCount: compiledZeroSumLayer.tokenBindingCount || 0,
        frontierBindingCount: compiledZeroSumLayer.frontierBindingCount || 0,
        coldBindingCount: compiledZeroSumLayer.coldBindingCount || 0,
        fullness: compiledZeroSumLayer.fullness,
        zeroFit: compiledZeroSumLayer.zeroFit,
        summary: compiledZeroSumLayer.summary
      },
      memoryBanks: memoryBanksSummary(),
      symmetricFrontier: symmetricFrontierSummary(),
      projectiveSubspace: subspaceSummary(),
      worldDig: worldDigSummaryObject(),
      autonomy: {
        active: autonomousActive,
        mode: autonomousMode,
        pressure: autonomyPressure,
        novelty: autonomyNovelty,
        stagnation: autonomyStagnation,
        diagnostics: autonomyDiagnostics
      },
      syntaxColdBankEvidence: {
        activeMode: coldBankActiveMode,
        importedWorldCount: syntaxColdBank.worlds.length,
        distilledOnly: syntaxColdBank.distilledOnly,
        synthesisSummary: coldBankSynthesis ? {
          sourceWorldCount: coldBankSynthesis.sourceWorldCount,
          compression: coldBankSynthesis.compression
        } : null
      },
      paused,
      viewMode,
      resolutionIndex: ui.resolutionIndex,
      simulationPixelScaleIndex: ui.simulationPixelScaleIndex,
      simulationPixelScale: currentSimulationPixelScale(),
      viewingModeIndex: ui.viewingModeIndex,
      mipmapRenderMode,
      depthEffectMode,
      pixelBlendMode,
      stepRegimeIndex: ui.stepRegimeIndex,
      stepRegime: currentStepRegime(),
      resolution: currentResolution(),
      viewingMode: currentViewingMode(),
      state: bytesToBase64(bytes)
    };
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = saveFileName();
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(href);
    stats.log.textContent = 'Saved live matrix state: ' + link.download + ' · ' + app.size + '² RGBA float payload · tick ' + tick + ' · ' + currentStepRegime().label + ' · ' + (residentSignal ? 'Resident Signal' : pinnedDescent ? 'Pinned Descent' : 'pure passive') + '. Metadata is evidence only; loading will not change master modes or reset dropdowns.';
  } catch (err) {
    stats.log.textContent = 'Save State failed: ' + (err && err.message ? err.message : String(err));
  }
}
async function loadStateFromFile(file) {
  if (!file) return;
  if (!app?.kind || app.kind !== 'webgl2') {
    stats.log.textContent = 'Load State unavailable: WebGL2 state is not live.';
    return;
  }
  try {
    const payload = JSON.parse(await file.text());
    if (payload.schema !== SAVE_SCHEMA) throw new Error('unsupported save schema');
    if (payload.channels !== 4) throw new Error('save does not match RGBA matrix format');
    const saveSize = Math.max(1, Math.floor(Number(payload.matrixSize) || 0));
    if (saveSize !== app.size) throw new Error('save is ' + saveSize + '² but active simulation pixels are ' + app.size + '²; change the simulation pixels dropdown first, then load again');
    if (payload.dataType !== 'float32-little-endian-base64') throw new Error('unsupported save payload type');
    const bytes = base64ToBytes(payload.state || '');
    const expectedBytes = matrixFrameByteLength(app.size);
    if (bytes.byteLength !== expectedBytes) throw new Error('save payload byte length mismatch');
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const pixels = new Float32Array(buffer);
    for (let i = 3; i < pixels.length; i += 4) {
      if (pixels[i] < -0.5) pixels[i] = 0.0;
    }
    invalidateGpuFeedOptimizer('load-state', 10);
    clearSubspaceQueuesAndRecords();
    clearChildAtlasTextures(app);
    restoreWorldDigFromSave(payload.worldDig);
    writeStatePixels(app, pixels);
    invalidateGpuFeedOptimizer('load-state-post-upload', 10);
    tick = Number.isFinite(payload.tick) ? Math.max(0, Math.floor(payload.tick)) : tick;
    simTime = Number.isFinite(payload.simTime) ? Math.max(0, payload.simTime) : simTime;
    // Loading a saved outcome restores the matrix texture only. Master modes, the
    // Resident Signal reset dropdown, pinned descent, coldBank contents, and zero-syntax compression state
    // remain exactly as the current/manual run configured them. Save files are
    // evidence and handoff data, not carryover presets.
    if (Number.isFinite(payload.viewMode)) {
      viewMode = Number(registryValue(VIEW_MODES, Math.floor(payload.viewMode), VIEW_MODES[0].value));
      setSelectValue('viewMode', viewMode);
    }
    if (Number.isFinite(payload.resolutionIndex)) {
      ui.resolutionIndex = clamp(Math.floor(payload.resolutionIndex), 0, RESOLUTION_OPTIONS.length - 1);
      setSelectValue('resolutionQuality', ui.resolutionIndex);
    }
    const matchingSimPixelIndex = SIMULATION_PIXEL_SCALE_OPTIONS.findIndex(option => Number(option.size) === app.size);
    if (matchingSimPixelIndex >= 0) {
      ui.simulationPixelScaleIndex = matchingSimPixelIndex;
      setSelectValue('simulationPixelScale', ui.simulationPixelScaleIndex);
    }
    if (Number.isFinite(payload.viewingModeIndex)) {
      ui.viewingModeIndex = clamp(Math.floor(payload.viewingModeIndex), 0, VIEWING_MODES.length - 1);
      setSelectValue('viewingMode', ui.viewingModeIndex);
    }
    if (payload.mipmapRenderMode) {
      mipmapRenderMode = registryValue(MIPMAP_RENDER_MODES, payload.mipmapRenderMode, 'off');
      setSelectValue('mipmapRenderMode', mipmapRenderMode);
      applyMipmapModeToTextures(app, mipmapRenderMode !== 'off');
    }
    if (payload.depthEffectMode) {
      depthEffectMode = registryValue(DEPTH_EFFECT_MODES, payload.depthEffectMode, 'on');
      setSelectValue('depthEffectMode', depthEffectMode);
    }
    if (payload.pixelBlendMode) {
      pixelBlendMode = registryValue(PIXEL_BLEND_MODES, payload.pixelBlendMode, 'off');
      setSelectValue('pixelBlendMode', pixelBlendMode);
    }
    if (Number.isFinite(payload.stepRegimeIndex)) {
      ui.stepRegimeIndex = clamp(Math.floor(payload.stepRegimeIndex), 0, STEP_REGIMES.length - 1);
    }
    simAccumulator = 0;
    resizeCanvas();
    updateStats();
    stats.log.textContent = 'Loaded saved matrix texture from ' + file.name + ' · tick ' + tick + ' · ' + currentStepRegime().label + ' · current master remains ' + activeMasterShort() + '. Save metadata was not applied as a preset, coldBank import, or carryover.';
  } catch (err) {
    stats.log.textContent = 'Load State failed: ' + (err && err.message ? err.message : String(err));
  } finally {
    const input = el('loadStateFile');
    if (input) input.value = '';
  }
}
function disposeWebGLRuntime(a) {
  if (!a || a.kind !== 'webgl2' || !a.gl) return;
  const gl = a.gl;
  try {
    if (a.asyncBackflow?.slots) {
      for (const slot of a.asyncBackflow.slots) {
        if (slot.sync) { try { gl.deleteSync(slot.sync); } catch (_) {} }
        if (slot.pbo) gl.deleteBuffer(slot.pbo);
      }
    }
    for (const target of [...(a.stateTargets || []), ...(a.childTargets || [])]) {
      if (target?.fbo) gl.deleteFramebuffer(target.fbo);
    }
    for (const tex of [...(a.state || []), ...(a.child || [])]) {
      if (tex) gl.deleteTexture(tex);
    }
    if (a.syntaxHardware?.buffer) gl.deleteBuffer(a.syntaxHardware.buffer);
    for (const shaderProgram of [a.simProgram, a.ruptureProgram, a.childInitProgram, a.childSimProgram, a.portalBackflowProgram, a.promoteChildProgram, a.renderProgram]) {
      if (shaderProgram) gl.deleteProgram(shaderProgram);
    }
  } catch (_) {
    // Disposal is best-effort; a fresh runtime rebuild follows immediately.
  }
}
function rebuildSimulationPixelRuntime(reason = 'simulation pixel resolution changed') {
  const wasPaused = paused;
  disposeWebGLRuntime(app);
  app = initWebGL();
  tick = 0;
  simTime = 0;
  simAccumulator = 0;
  lastNow = performance.now();
  resetPortalNavigationState(reason);
  resetAutonomyController(autonomousMode);
  clearSubspaceQueuesAndRecords();
  invalidateGpuFeedOptimizer('simulation-pixel-runtime-rebuild', 10);
  applyMipmapModeToTextures(app, true);
  paused = wasPaused;
  resizeCanvas();
  updateStats();
  const present = presentationSize();
  stats.engine.textContent = 'WebGL2 ' + app.fmt.label + ' · screen ' + present.width + '×' + present.height + ' · sim ' + app.size + '²';
  stats.matrix.textContent = app.fmt.label + ' · ' + app.size + '² zero · ' + simulationPixelSummary(app.size);
  stats.log.textContent = reason + '. Rebuilt GPU state textures/framebuffers at ' + app.size + '² organism pixels. Screen resolution, step regime semantics, mipmaps, autonomy, and PBO backflow remain wired.';
}
function initWebGL() {
  resizeCanvas();
  const gl = canvas.getContext('webgl2', {
    antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false,
    powerPreference: 'high-performance'
  });
  if (!gl) throw new Error('WebGL2 unavailable');

  const matrixSize = currentMatrixSize();
  const fmt = tryFormat(gl, matrixSize);
  const simProgram = program(gl, vsGLSL, simGLSL);
  const ruptureProgram = program(gl, vsGLSL, ruptureGLSL);
  const childInitProgram = program(gl, vsGLSL, childInitGLSL);
  const childSimProgram = program(gl, vsGLSL, childSimGLSL);
  const portalBackflowProgram = program(gl, vsGLSL, portalBackflowGLSL);
  const promoteChildProgram = program(gl, vsGLSL, promoteChildGLSL);
  const renderProgram = program(gl, vsGLSL, renderGLSL);
  const syntaxHardware = makeSyntaxHardware(gl);
  bindSyntaxHardwareBlock(gl, simProgram, syntaxHardware, 'sim');
  startSyntaxResidencyWorker();
  prewarmSyntaxTransferPool(matrixSize);
  const uniforms = {
    sim: makeUniformMap(gl, simProgram, SIM_UNIFORM_NAMES),
    rupture: makeUniformMap(gl, ruptureProgram, RUPTURE_UNIFORM_NAMES),
    childInit: makeUniformMap(gl, childInitProgram, CHILD_INIT_UNIFORM_NAMES),
    childSim: makeUniformMap(gl, childSimProgram, CHILD_SIM_UNIFORM_NAMES),
    portalBackflow: makeUniformMap(gl, portalBackflowProgram, PORTAL_BACKFLOW_UNIFORM_NAMES),
    promoteChild: makeUniformMap(gl, promoteChildProgram, PROMOTE_CHILD_UNIFORM_NAMES),
    render: makeUniformMap(gl, renderProgram, RENDER_UNIFORM_NAMES)
  };
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const state = [makeTexture(gl, matrixSize, fmt, { label: 'state[0]' }), makeTexture(gl, matrixSize, fmt, { label: 'state[1]' })];
  const stateTargets = makeTextureTargets(gl, state, 'state');
  const childAtlasSize = Math.min(childAtlasTargetSizeFor(matrixSize), gl.getParameter(gl.MAX_TEXTURE_SIZE));
  const chunkSize = Math.max(1, Math.floor(childAtlasSize / CHUNK_GRID));
  const fbo = stateTargets[0].fbo;
  const runtime = {
    kind: 'webgl2', gl, fmt, simProgram, ruptureProgram, childInitProgram, childSimProgram, portalBackflowProgram, promoteChildProgram, renderProgram,
    uniforms, vao, state, stateTargets, child: null, childTargets: null, fbo, sRead: 0, sWrite: 1, cRead: 0, cWrite: 1,
    size: matrixSize, childAtlasSize, chunkSize, glState: makeGlStateCache(),
    syntaxHardware, asyncBackflow: null, mipmapDirty: mipmapRenderingEnabled() ? new Set(state) : new Set(), mipmapUnit: gl.TEXTURE0 + Math.max(0, Math.min(15, gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS) - 1))
  };
  clearRenderTargets(runtime, stateTargets, matrixSize);
  ensureChildAtlas(runtime);
  ensureAsyncBackflow(runtime);
  uploadSyntaxHardware(runtime, true);

  return runtime;
}

function ensureChildAtlas(a) {
  if (!a || a.kind !== 'webgl2' || a.child) return;
  const gl = a.gl;
  a.child = [makeTexture(gl, a.childAtlasSize, a.fmt, { label: 'childAtlas[0]' }), makeTexture(gl, a.childAtlasSize, a.fmt, { label: 'childAtlas[1]' })];
  if (mipmapRenderingEnabled()) for (const tex of a.child) markTextureMipsDirty(a, tex);
  a.childTargets = makeTextureTargets(gl, a.child, 'childAtlas');
  clearRenderTargets(a, a.childTargets, a.childAtlasSize);
  resetGlStateCache(a);
}
function clearChildAtlasTextures(a) {
  if (!a || a.kind !== 'webgl2' || !a.child) return;
  invalidateGpuFeedOptimizer('child-atlas-clear', 6);
  clearRenderTargets(a, a.childTargets, a.childAtlasSize);
  resetGlStateCache(a);
}
function swapState(a) { const t = a.sRead; a.sRead = a.sWrite; a.sWrite = t; }
function swapChild(a) { const t = a.cRead; a.cRead = a.cWrite; a.cWrite = t; }
function chunkViewport(a, chunkId) {
  const cx = chunkId % CHUNK_GRID;
  const cy = Math.floor(chunkId / CHUNK_GRID);
  return { x: cx * a.chunkSize, y: cy * a.chunkSize, w: a.chunkSize, h: a.chunkSize };
}
function chunkOrigin(chunkId) {
  return HOT_CHUNK_ORIGINS[Math.max(0, Math.min(MAX_CHUNKS - 1, chunkId | 0))];
}
function makePortalMapping(chunkId, cell, parentUv, source, target = {}) {
  const origin = chunkOrigin(chunkId);
  const scale = [1 / CHUNK_GRID, 1 / CHUNK_GRID];
  const frame = makePortalFrame(target, parentUv, chunkId);
  return {
    invariant: 'same-density-budget-at-every-scale',
    densityBudget: SUBSPACE_DENSITY_BUDGET,
    source,
    frame,
    parent: { cell: { x: cell.x, y: cell.y }, uv: parentUv.slice(), sampleRadiusCells: Math.max(0.25, Number(target.seedRadiusCells) || SUBSPACE_SEED_RADIUS_CELLS) },
    child: { chunkId, origin, scale, localSeedUv: [0.5, 0.5] },
    descent: { mode: 'parent-sample-to-child-seed', normalized: true, framed: true },
    ascent: { mode: 'child-sample-to-parent-backflow', normalized: true, framed: true, leakRate: SUBSPACE_BACKFLOW_RATE },
    portalFrame: {
      parentToChild: frame.parentToChild,
      childToParent: frame.childToParent,
      axes: { phase: frame.phaseAxis, energy: frame.energyAxis, route: frame.routeAxis },
      twist: frame.twist,
      scale: frame.scale,
      handedness: frame.handedness
    }
  };
}
function requestUnfoldCell(size, cell, source = 'manual', target = {}) {
  if (!app || app.kind !== 'webgl2') return false;
  const safeCell = { x: wrapIndex(cell.x, size), y: wrapIndex(cell.y, size) };
  const key = parentKey(safeCell);
  if (subspace.byKey.has(key)) return false;
  let chunkId = allocateAtlasChunk(safeCell, target, source);
  if (chunkId < 0) return false;
  const parentUv = [(safeCell.x + 0.5) / size, (safeCell.y + 0.5) / size];
  const portal = makePortalMapping(chunkId, safeCell, parentUv, source, target);
  const record = { chunkId, key, cell: safeCell, parentUv, source, portal, portalFrame: portal.frame, portalEpoch: portalLadder.centerEpoch || 0, densityBudget: SUBSPACE_DENSITY_BUDGET, seedRadiusCells: portal.parent.sampleRadiusCells, zoomVariant: target?.variant || target?.zoomVariant || 'full', ladder: target?.ladder || null, age: 0, bornTick: tick, bornTime: simTime };

  subspace.chunks[chunkId] = record;
  markAtlasSlotActive(record, source);
  subspace.allocationEpoch++;
  subspace.active.push(record);
  subspace.byKey.set(key, record);
  subspace.pendingPointers.push({ cell: safeCell, pointer: -(chunkId + 1.0) });
  subspace.pendingInits.push(record);
  return true;
}
function requestUnfoldPatchAtUv(size, uv, source = 'manual', target = {}) {
  const center = parentCellForUv(size, uv);
  const seen = new Set();
  let made = 0;
  for (const [dx, dy] of SUBSPACE_PATCH_OFFSETS) {
    const cell = { x: wrapIndex(center.x + dx, size), y: wrapIndex(center.y + dy, size) };
    const key = parentKey(cell);
    if (seen.has(key)) continue;
    seen.add(key);
    const framedTarget = { ...target, portal: uv, patchOffset: [dx, dy], recycle: Boolean(target?.recycle) };
    if (requestUnfoldCell(size, cell, source, framedTarget)) made++;
  }
  return made;
}
function applyParentPointer(a, cell, pointer) {
  const gl = a.gl;
  gl.bindVertexArray(a.vao);
  bindTargetFramebuffer(a, a.stateTargets[a.sWrite]);
  viewportCached(a, 0, 0, a.size, a.size);
  useProgramCached(a, a.ruptureProgram);
  activeTextureCached(a, gl.TEXTURE0);
  bindTexture2DCached(a, a.state[a.sRead]);
  applyUniformsCached(a, 'rupture', a.uniforms.rupture, RUPTURE_UNIFORMS, { cell, pointer });
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  swapState(a);
}
function initChildChunk(a, record) {
  ensureChildAtlas(a);
  const gl = a.gl;
  const vp = chunkViewport(a, record.chunkId);
  const targets = [a.childTargets[a.cRead], a.childTargets[a.cWrite]];
  for (const target of targets) {
    bindTargetFramebuffer(a, target);
    viewportCached(a, vp.x, vp.y, vp.w, vp.h);
    useProgramCached(a, a.childInitProgram);
    activeTextureCached(a, gl.TEXTURE0);
    bindTexture2DCached(a, a.state[a.sRead]);
    applyUniformsCached(a, 'childInit', a.uniforms.childInit, CHILD_INIT_UNIFORMS, { record, size: a.size });
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    markTextureMipsDirty(a, target.texture);
  }
}
function processSubspaceQueues(a) {
  if (!a || a.kind !== 'webgl2') return;
  if (subspace.pendingPointers.length) {
    const pending = subspace.pendingPointers.splice(0);
    for (const item of pending) applyParentPointer(a, item.cell, item.pointer);
  }
  if (subspace.pendingInits.length) {
    ensureChildAtlas(a);
    const pending = subspace.pendingInits.splice(0);
    for (const record of pending) initChildChunk(a, record);
  }
  glBindDefaultFramebuffer(a);
}
function glBindDefaultFramebuffer(a) {
  bindDefaultFramebuffer(a);
}
function portalRecordDepth(record) {
  if (!record) return 0;
  const focus = portalLadderRenderFocus();
  const dx = torusDelta(Number(record.parentUv?.[0]) || 0.5, Number(focus?.[0]) || 0.5);
  const dy = torusDelta(Number(record.parentUv?.[1]) || 0.5, Number(focus?.[1]) || 0.5);
  const cameraAxis = [Math.cos(portalLadderRenderPhase()), Math.sin(portalLadderRenderPhase())];
  const routeDepth = dx * cameraAxis[0] + dy * cameraAxis[1];
  const levelBias = (Number(record.ladder?.level ?? portalLadder.level) || 0) * PORTAL_DEPTH_SORT_LEVEL_WEIGHT;
  const ageBias = Math.min(1, Number(record.age || 0) * 0.02) * PORTAL_DEPTH_SORT_AGE_WEIGHT;
  const frameScale = Number(record.portalFrame?.scale || 1);
  const scaleBias = Math.log2(Math.max(0.25, frameScale)) * PORTAL_DEPTH_SORT_SCALE_WEIGHT;
  return routeDepth + levelBias + ageBias + scaleBias;
}
const chunkGridOrderCache = new Map();
const activeDrawOrderScratch = [];
const activeDrawOrderTransparentScratch = [];
function chunkGridWalkOrder(backToFront = false) {
  const phase = portalLadderRenderPhase();
  const ax = Math.cos(phase);
  const ay = Math.sin(phase);
  const xMajor = Math.abs(ax) >= Math.abs(ay);
  const key = (backToFront ? 'b' : 'f') + ':' + (xMajor ? 'x' : 'y') + ':' + (ax >= 0 ? '+' : '-') + ':' + (ay >= 0 ? '+' : '-');
  const cached = chunkGridOrderCache.get(key);
  if (cached) return cached;
  const ids = [];
  if (xMajor) {
    const xStart = ((ax >= 0) !== backToFront) ? CHUNK_GRID - 1 : 0;
    const xEnd = ((ax >= 0) !== backToFront) ? -1 : CHUNK_GRID;
    const xStep = ((ax >= 0) !== backToFront) ? -1 : 1;
    const yStart = ((ay >= 0) !== backToFront) ? CHUNK_GRID - 1 : 0;
    const yEnd = ((ay >= 0) !== backToFront) ? -1 : CHUNK_GRID;
    const yStep = ((ay >= 0) !== backToFront) ? -1 : 1;
    for (let x = xStart; x !== xEnd; x += xStep) for (let y = yStart; y !== yEnd; y += yStep) ids.push(y * CHUNK_GRID + x);
  } else {
    const yStart = ((ay >= 0) !== backToFront) ? CHUNK_GRID - 1 : 0;
    const yEnd = ((ay >= 0) !== backToFront) ? -1 : CHUNK_GRID;
    const yStep = ((ay >= 0) !== backToFront) ? -1 : 1;
    const xStart = ((ax >= 0) !== backToFront) ? CHUNK_GRID - 1 : 0;
    const xEnd = ((ax >= 0) !== backToFront) ? -1 : CHUNK_GRID;
    const xStep = ((ax >= 0) !== backToFront) ? -1 : 1;
    for (let y = yStart; y !== yEnd; y += yStep) for (let x = xStart; x !== xEnd; x += xStep) ids.push(y * CHUNK_GRID + x);
  }
  chunkGridOrderCache.set(key, ids);
  return ids;
}
function activeRecordsInDrawOrder(mode = activeDepthDrawPolicy()) {
  const transparent = String(mode).includes('transparent') || String(mode).includes('back-to-front');
  if (!transparent) {
    const ids = chunkGridWalkOrder(false);
    activeDrawOrderScratch.length = 0;
    for (let i = 0; i < ids.length; i++) {
      const record = subspace.chunks[ids[i]];
      if (record) activeDrawOrderScratch.push(record);
    }
    return activeDrawOrderScratch;
  }
  // Non-binary alpha/composition still requires true far-to-near sorting. Keep
  // the array resident so the driver path is not fed by fresh JS allocations.
  activeDrawOrderTransparentScratch.length = 0;
  const active = subspace.active || [];
  for (let i = 0; i < active.length; i++) if (active[i]) activeDrawOrderTransparentScratch.push(active[i]);
  activeDrawOrderTransparentScratch.sort((a, b) => portalRecordDepth(b) - portalRecordDepth(a));
  return activeDrawOrderTransparentScratch;
}
function stepActiveChunks(a, dt) {
  const active = activeRecordsInDrawOrder(activeDepthDrawPolicy());
  if (!a || a.kind !== 'webgl2' || !active.length) return;
  ensureChildAtlas(a);
  const gl = a.gl;
  gl.bindVertexArray(a.vao);
  bindTargetFramebuffer(a, a.childTargets[a.cWrite]);
  useProgramCached(a, a.childSimProgram);
  activeTextureCached(a, gl.TEXTURE0);
  bindTexture2DCached(a, a.child[a.cRead]);
  activeTextureCached(a, gl.TEXTURE1);
  bindTexture2DCached(a, a.state[a.sRead]);
  for (const record of active) {
    const vp = chunkViewport(a, record.chunkId);
    const origin = chunkOrigin(record.chunkId);
    viewportCached(a, vp.x, vp.y, vp.w, vp.h);
    applyUniformsCached(a, 'childSim', a.uniforms.childSim, CHILD_SIM_UNIFORMS, { childAtlasSize: a.childAtlasSize, origin, record, dt });
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    record.age += dt;
    touchAtlasSlot(record, 'child-step');
    churnStats.depthOrderedDraws++;
  }
  markTextureMipsDirty(a, a.child[a.cWrite]);
  swapChild(a);
}
function applyPortalBackflow(a) {
  const active = activeRecordsInDrawOrder('transparent-back-to-front');
  if (!a || a.kind !== 'webgl2' || !active.length || !a.child) return;
  const gl = a.gl;
  gl.bindVertexArray(a.vao);
  for (const record of active) {
    const origin = chunkOrigin(record.chunkId);
    bindTargetFramebuffer(a, a.stateTargets[a.sWrite]);
    viewportCached(a, 0, 0, a.size, a.size);
    useProgramCached(a, a.portalBackflowProgram);
    activeTextureCached(a, gl.TEXTURE0);
    bindTexture2DCached(a, a.state[a.sRead]);
    activeTextureCached(a, gl.TEXTURE1);
    bindTexture2DCached(a, a.child[a.cRead]);
    applyUniformsCached(a, 'portalBackflow', a.uniforms.portalBackflow, PORTAL_BACKFLOW_UNIFORMS, { record, origin });
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    markTextureMipsDirty(a, a.state[a.sWrite]);
    churnStats.depthOrderedDraws++;
    swapState(a);
  }
}
function flushProjectiveSubspacePortals(reason = 'subspace-flush') {
  const records = subspace.active.slice();
  subspace.pendingPointers.length = 0;
  subspace.pendingInits.length = 0;
  if (records.length && app?.kind === 'webgl2') {
    for (const record of records) if (record?.cell) subspace.pendingPointers.push({ cell: record.cell, pointer: 0.0 });
    processSubspaceQueues(app);
  }
  for (const record of records) releaseAtlasSlot(record, reason + ':flushed');
  clearSubspaceQueuesAndRecords();
  clearChildAtlasTextures(app);
  clearPortalRouteCompilerCache();
  subspace.lastPortal = null;
  return records.length;
}
function clearAllPortalsForRest(reason = 'autonomy-portal-rest') {
  const flushed = flushProjectiveSubspacePortals(reason);
  portalLadder.lastFrame = null;
  portalLadder.nearestCenter = portalLadderRenderFocus().slice();
  portalLadder.nearestCenterSource = reason + ' · cleared';
  portalLadder.lastPortalRestFlushTime = Number(simTime) || 0;
  escherPortalTarget = null;
  escherPortalOpened = true;
  clearPortalRouteCompilerCache();
  return flushed;
}
function enforceAutonomyPortalRestClear(reason = 'autonomy-portal-rest-active') {
  const restRemaining = autonomyPortalRestRemainingSeconds();
  if (restRemaining <= 0) return 0;
  const sinceLast = (Number(simTime) || 0) - (Number.isFinite(Number(portalLadder.lastPortalRestFlushTime)) ? Number(portalLadder.lastPortalRestFlushTime) : -Infinity);
  const needsFlush = activeChunkCount() > 0 || (subspace.pendingPointers?.length || 0) > 0 || (subspace.pendingInits?.length || 0) > 0;
  if (!needsFlush && sinceLast < AUTONOMY_PORTAL_REST_FLUSH_INTERVAL_SECONDS) return 0;
  return clearAllPortalsForRest(reason);
}
function resetProjectiveSubspace() {
  const flushed = flushProjectiveSubspacePortals('manual-subspace-reset');
  updateStats();
  stats.log.textContent = 'Projective Subspace reset: cleared ' + flushed + ' portal gate(s), restored parent W-pointers to neutral, cleared child atlas, and preserved the macro field.';
}

function nearestActivePortalRecordTo(uv = portalLadderRenderFocus(), options = {}) {
  const focus = Array.isArray(uv) && uv.length >= 2 ? [wrap01(uv[0]), wrap01(uv[1])] : portalLadderRenderFocus();
  let best = null;
  for (const record of subspace.active || []) {
    if (!record) continue;
    const parentDist = subspaceTorusDistance(focus, record.parentUv || [0.5, 0.5]);
    const originDist = subspaceTorusDistance(focus, record.portalFrame?.originUv || record.parentUv || [0.5, 0.5]);
    const dist = Math.min(parentDist, originDist);
    const lastLock = (record === portalLadder.lastFrame || record.portalFrame === portalLadder.lastFrame || record.portalFrame === subspace.lastPortal?.frame) ? 0.006 : 0.0;
    const epochLock = (record.portalEpoch ?? 0) === (portalLadder.centerEpoch ?? 0) ? 0.002 : 0.0;
    const score = dist - lastLock - epochLock;
    if (!best || score < best.score) best = { record, distance: dist, score };
  }
  const maxDistance = Number.isFinite(Number(options.maxDistance)) ? Number(options.maxDistance) : Infinity;
  return best && best.distance <= maxDistance ? best : null;
}
function portalPatchRecordsNear(uv = portalLadderRenderFocus(), anchorRecord = null) {
  const focus = Array.isArray(uv) && uv.length >= 2 ? [wrap01(uv[0]), wrap01(uv[1])] : portalLadderRenderFocus();
  const size = app?.size || MATRIX_SIZE;
  const centerCell = parentCellForUv(size, focus);
  const anchorTick = Number(anchorRecord?.bornTick);
  const anchorSource = String(anchorRecord?.source || '');
  const maxDist = 2.75 / Math.max(1, size);
  return (subspace.active || []).filter(record => {
    if (!record) return false;
    if (record === anchorRecord) return true;
    const cellDx = Math.abs(wrapIndex((record.cell?.x ?? 0) - centerCell.x, size));
    const cellDy = Math.abs(wrapIndex((record.cell?.y ?? 0) - centerCell.y, size));
    const wrappedDx = Math.min(cellDx, size - cellDx);
    const wrappedDy = Math.min(cellDy, size - cellDy);
    const nearCell = wrappedDx <= 1 && wrappedDy <= 1 && (wrappedDx + wrappedDy <= 1 || record === anchorRecord);
    const nearUv = subspaceTorusDistance(focus, record.parentUv || [0.5, 0.5]) <= maxDist;
    const samePatch = Number.isFinite(anchorTick) && record.bornTick === anchorTick && anchorSource && String(record.source || '') === anchorSource;
    return nearCell || nearUv || samePatch;
  });
}
function collapseSubspaceToPortalParent(parentUv, anchorRecord = null, reason = 'establish-center') {
  if (!app || app.kind !== 'webgl2') return { kept: 0, flushed: 0, anchor: null };
  const keep = portalPatchRecordsNear(parentUv, anchorRecord);
  const keepSet = new Set(keep);
  const stale = (subspace.active || []).filter(record => !keepSet.has(record));
  subspace.pendingPointers.length = 0;
  subspace.pendingInits.length = 0;
  for (const record of stale) {
    if (record?.cell) subspace.pendingPointers.push({ cell: record.cell, pointer: 0.0 });
  }
  for (const record of keep) {
    if (record?.cell) {
      record.portalEpoch = portalLadder.centerEpoch || 0;
      record.lastTouchTick = tick;
      record.lastTouchTime = simTime;
      subspace.pendingPointers.push({ cell: record.cell, pointer: -(record.chunkId + 1.0) });
      touchAtlasSlot(record, reason + ':kept-parent');
    }
  }
  if (subspace.pendingPointers.length) processSubspaceQueues(app);
  subspace.byKey.clear();
  subspace.active.length = 0;
  for (let i = 0; i < subspace.chunks.length; i++) subspace.chunks[i] = null;
  for (const record of stale) {
    if (record) releaseAtlasSlot(record, reason + ':flushed');
  }
  for (const record of keep) {
    if (!record) continue;
    subspace.chunks[record.chunkId] = record;
    subspace.active.push(record);
    subspace.byKey.set(record.key, record);
    markAtlasSlotActive(record, reason + ':parent');
  }
  subspace.allocationEpoch++;
  if (keep.length) {
    const anchor = anchorRecord && keepSet.has(anchorRecord) ? anchorRecord : keep[0];
    subspace.lastPortal = {
      uv: (parentUv || anchor.parentUv || [0.5, 0.5]).map(v => Number(wrap01(v).toFixed(5))),
      source: reason + ' · retained current portal parent',
      score: 1.0,
      opened: keep.length,
      frame: anchor.portalFrame || null,
      tick,
      via: 'establish-center-transfer'
    };
    portalLadder.lastFrame = anchor.portalFrame || portalLadder.lastFrame;
  } else {
    subspace.lastPortal = null;
  }
  clearPortalRouteCompilerCache();
  return { kept: keep.length, flushed: stale.length, anchor: keep[0] || null };
}
function currentPortalParentTarget() {
  const renderFocus = portalLadderRenderFocus();
  const transitFocus = portalRenderActive() && escherPortalTarget?.portal ? escherPortalTarget.portal : renderFocus;
  const active = nearestActivePortalRecordTo(transitFocus, { maxDistance: 0.12 }) || nearestActivePortalRecordTo(renderFocus, { maxDistance: 0.12 });
  if (active?.record) {
    const uv = active.record.parentUv || transitFocus;
    return {
      portal: [wrap01(uv[0]), wrap01(uv[1])],
      phase: Number(active.record.portalFrame?.twist ?? portalLadderRenderPhase()) || portalLadderRenderPhase(),
      source: 'nearest-active-portal-parent #' + active.record.chunkId,
      score: 1.0,
      record: active.record,
      pair: [],
      recycle: true,
      ladder: { level: 0, direction: portalLadder.direction, lateral: 0, crossings: portalLadder.crossings, offMap: true, establishTransfer: true }
    };
  }
  const nearest = nearestPortalReferenceCenter(transitFocus, { includeBetween: true });
  const phase = Number.isFinite(Number(nearest.phase)) ? nearest.phase : portalLadderRenderPhase();
  return {
    portal: nearest.center.slice(),
    phase,
    source: 'nearest-reference-parent · ' + nearest.source,
    score: clamp(Number(nearest.score || 0.72) / 36.0, 0.72, 1.0),
    record: null,
    pair: [],
    recycle: true,
    ladder: { level: 0, direction: portalLadder.direction, lateral: 0, crossings: portalLadder.crossings, offMap: true, establishTransfer: true }
  };
}

function openProjectiveSubspace(target = null, options = {}) {
  if (!app?.kind || app.kind !== 'webgl2') {
    if (!options.silent) stats.log.textContent = 'Projective Subspace unavailable: WebGL2 state is not live.';
    return 0;
  }
  const resolved = target || selectSubspacePortal();
  const source = options.source || resolved.source;
  const made = requestUnfoldPatchAtUv(app.size, resolved.portal, source, { ...resolved, recycle: Boolean(options.recycle || resolved.recycle) });
  subspace.lastPortal = {
    uv: resolved.portal.map(v => Number(v.toFixed(5))),
    source,
    score: Number((resolved.score || 0).toFixed(4)),
    opened: made,
    frame: subspace.active.find(r => subspaceTorusDistance(r.parentUv, resolved.portal) < (2.5 / app.size))?.portalFrame || null,
    tick,
    via: options.source ? 'escher-portal-navigation' : 'manual'
  };
  processSubspaceQueues(app);
  if (!options.silent) {
    updateStats();
    stats.log.textContent = made
      ? 'Projective Subspace opened: ' + made + ' PortalFrame W-pointer gate(s) at portal ' + subspace.lastPortal.uv.join(', ') + ' from ' + source + '. Mapping is bidirectional: framed parent sample → child seed, child local frame → bounded parent backflow, same density budget at every scale.'
      : 'Projective Subspace unchanged: portal ' + resolved.portal.map(v => v.toFixed(3)).join(', ') + ' already open or child atlas is full (' + activeChunkCount() + '/' + MAX_CHUNKS + ').';
  }
  return made;
}

function resetZero(options = {}) {
  phaseLaw.eventActive = false;
  phaseLaw.birthReadback = false;
  const requestedStepRegimeIndex = Number.isFinite(options.stepRegimeIndex)
    ? clamp(Math.floor(options.stepRegimeIndex), 0, STEP_REGIMES.length - 1)
    : selectedResetRegimeIndex();
  autonomousActive = Boolean(options.autonomousMode);
  if (options.autonomousMode) autonomousMode = isFullAutonomyMode(options.autonomousMode) ? options.autonomousMode : 'riemann';
  residentSignalResetMode = 'off';
  coldBankResetMode = 'off';
  coldBankActiveMode = 'off';
  residentSignal = false;
  pinnedDescent = Boolean(options.pinnedDescent);
  resetResidentSignalState({ keepSeed: false });
  setActiveStepRegimeIndex(requestedStepRegimeIndex);
  resizeCanvas();
  tick = 0;
  simTime = 0;
  resetPortalNavigationState(options.autonomousMode ? 'autonomous reset' : options.pinnedDescent ? 'pinned reset' : 'manual reset');
  resetWorldDigTransient('simulation-reset');
  resetAutonomyController(autonomousMode);
  simAccumulator = 0;
  lastNow = performance.now();
  clearSubspaceQueuesAndRecords();
  if (app?.kind === 'webgl2') {
    invalidateGpuFeedOptimizer('reset-zero-preclear', 10);
    clearRenderTargets(app, app.stateTargets, app.size);
    clearChildAtlasTextures(app);
    invalidateGpuFeedOptimizer('reset-zero-postclear', 10);
  }
  stats.matrix.textContent = app?.fmt ? app.fmt.label + ' · ' + app.size + '² zero' : 'zero';
  stats.energy.textContent = 'no live readback';
  stats.coherence.textContent = 'no live readback';
  const autonomyNote = options.autonomousMode
    ? 'Autonomous Chunking reset used ' + autonomyModeLabel(options.autonomousMode) + ' with route signal ' + Number(options.autonomyComplexity || 0).toFixed(3) + (isFullAutonomyMode(options.autonomousMode) ? ' and armed live matrix feedback. ' : '. ')
    : '';
  stats.log.textContent = (pinnedDescent
    ? 'Pinned Descent reset: pristine counterwound witness/simulation handshake is active through D only. '
    : 'Reset to exact zero. Pure passive mode restored. ')
    + autonomyNote
    + 'Active step regime: ' + currentStepRegime().label
    + '. Projective Subspace child atlas cleared for the new run.'
    + ' Screen resolution/viewing remain render-only: ' + currentResolution().label + ' · ' + currentViewingMode().label + '. Simulation pixels: ' + simulationPixelSummary(app?.size || currentMatrixSize()) + '.';
  updateStats();
}

function setUiHidden(hidden) {
  uiHidden = hidden;
  document.body.classList.toggle('ui-hidden', uiHidden);
  panel.classList.toggle('hidden', uiHidden);
  panel.toggleAttribute('inert', uiHidden);
  panel.setAttribute('aria-hidden', String(uiHidden));
  el('hideBtn').textContent = 'Hide UI H';
  el('hideBtn').setAttribute('aria-pressed', String(uiHidden));
  uiToggleBtn.classList.toggle('visible', uiHidden);
  uiToggleBtn.setAttribute('aria-hidden', String(!uiHidden));
  uiToggleBtn.setAttribute('aria-pressed', String(uiHidden));
  uiToggleBtn.textContent = uiHidden ? 'Show UI H' : 'Hide UI H';
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else if (document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen();
    } else {
      stats.log.textContent = 'Fullscreen API is unavailable in this browser.';
    }
  } catch (err) {
    stats.log.textContent = 'Fullscreen request failed: ' + (err && err.message ? err.message : String(err));
  }
}

function syncFullscreenLabel() {
  const fullscreenBtn = el('fullscreenBtn');
  if (fullscreenBtn) fullscreenBtn.textContent = document.fullscreenElement ? 'Exit Fullscreen F' : 'Fullscreen F';
}

function maxSimStepsForFrame() {
  if (currentStepRegime().riemannMode) return 1;
  const substeps = Math.max(1, currentStepRegime().substeps || 1);
  return Math.max(1, Math.min(MAX_SIM_STEPS_PER_FRAME, Math.floor(MAX_GPU_SUBSTEPS_PER_FRAME / substeps)));
}

function setSimulationUniforms(a, subDt) {
  uploadSyntaxHardware(a);
  applyUniformsCached(a, 'simStatic', a.uniforms.sim, SIM_UNIFORMS, { size: a.size, subDt });
}

function runSimulationSubstep(a) {
  const gl = a.gl;
  bindTargetFramebuffer(a, a.stateTargets[a.sWrite]);
  activeTextureCached(a, gl.TEXTURE0);
  bindTexture2DCached(a, a.state[a.sRead]);
  applyUniformsCached(a, 'simSubstep', a.uniforms.sim, SIM_SUBSTEP_UNIFORMS, { size: a.size });
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  markTextureMipsDirty(a, a.state[a.sWrite]);
  const t = a.sRead; a.sRead = a.sWrite; a.sWrite = t;
  tick++;
}

function simStep(a, dt) {
  const gl = a.gl;
  const q = currentStepRegime();
  const subDt = dt / q.substeps;
  useProgramCached(a, a.simProgram);
  viewportCached(a, 0, 0, a.size, a.size);
  setSimulationUniforms(a, subDt);

  if (q.chunkCount && q.chunkSubsteps) {
    for (let chunk = 0; chunk < q.chunkCount; chunk++) {
      for (let i = 0; i < q.chunkSubsteps; i++) {
        runSimulationSubstep(a);
        simTime += subDt;
      }
    }
  } else {
    for (let i = 0; i < q.substeps; i++) {
      runSimulationSubstep(a);
      simTime += subDt;
    }
  }
  processSubspaceQueues(a);
  stepActiveChunks(a, dt);
  applyPortalBackflow(a);
  bindDefaultFramebuffer(a);
}
function render(a) {
  const gl = a.gl;
  bindDefaultFramebuffer(a);
  refreshRenderMipmaps(a);
  viewportCached(a, 0, 0, canvas.width, canvas.height);
  useProgramCached(a, a.renderProgram);
  activeTextureCached(a, gl.TEXTURE0);
  bindTexture2DCached(a, a.state[a.sRead]);
  activeTextureCached(a, gl.TEXTURE1);
  bindTexture2DCached(a, a.child ? a.child[a.cRead] : a.state[a.sRead]);
  applyUniformsCached(a, 'render', a.uniforms.render, RENDER_UNIFORMS, { size: a.size });
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
function runFixedSimulationFrame(rawDt) {
  if (!paused) {
    simAccumulator = Math.min(simAccumulator + rawDt, MAX_SIM_ACCUMULATED_DT);
    let steps = 0;
    const maxSteps = maxSimStepsForFrame();
    while (simAccumulator >= FIXED_SIM_DT && steps < maxSteps) {
      simStep(app, FIXED_SIM_DT);
      simAccumulator -= FIXED_SIM_DT;
      steps++;
    }
    cpuInstrumentation.simStepsLast = steps;
    if (steps === maxSteps && simAccumulator >= FIXED_SIM_DT) simAccumulator = 0;
  }
}
function runRuntimeServices(rawDt) {
  beginRuntimeRhythmFrame();

  // Always keep the low-level GPU/RAM pump moving; it already caps large
  // completions per frame. Heavy interpretive systems ride the prime lanes
  // below so they do not bunch into a one-second stall.
  pumpAsyncBackflow(app);
  advanceEscherPortalNavigation(rawDt);

  runRhythmMaintenance('gpuFeed', () => maybeOptimizeGpuFeed());
  runRhythmMaintenance('autonomyPlanner', () => maybePlanAutonomy());
  runRhythmMaintenance('portalRoutes', () => maybeCompilePortalRoutes());
  runRhythmMaintenance('autonomyScan', () => maybeAdaptAutonomy());
  runRhythmMaintenance('phaseLaw', () => maybeRecoverFailedPhaseLawStart());

  if (worldDig.mode === 'settle' && (Number(simTime) || 0) >= (worldDig.settleUntilTime || -Infinity)) worldDig.mode = 'idle';
  processSubspaceQueues(app);
  render(app);
  decayGpuFeedCacheQuarantine();
}
function frame(now) {
  frameSerial++;
  const rawDt = Math.max(0.001, Math.min(MAX_SIM_ACCUMULATED_DT, (now - lastNow) / 1000));
  lastNow = now;
  fps = fps ? fps * 0.92 + (1 / rawDt) * 0.08 : (1 / rawDt);

  if (!CPU_PHASE_INSTRUMENTATION_ENABLED) {
    cpuInstrumentation.simStepsLast = 0;
    if (app?.kind === 'webgl2') {
      runFixedSimulationFrame(rawDt);
      runRuntimeServices(rawDt);
    }
    updateFrameUi(now);
    requestAnimationFrame(frame);
    return;
  }

  const cpuFrameStart = beginCpuFrame();
  if (app?.kind === 'webgl2') {
    measureCpuPhase('sim', () => runFixedSimulationFrame(rawDt));
    measureCpuPhase('backflow', () => pumpAsyncBackflow(app));
    measureCpuPhase('escher', () => advanceEscherPortalNavigation(rawDt));
    measureCpuPhase('autonomy', () => maybeAdaptAutonomy());
    measureCpuPhase('autonomyPlanner', () => maybePlanAutonomy());
    measureCpuPhase('routeCompiler', () => maybeCompilePortalRoutes());
    measureCpuPhase('gpuFeed', () => maybeOptimizeGpuFeed());
    measureCpuPhase('phaseLaw', () => maybeRecoverFailedPhaseLawStart());
    measureCpuPhase('subspaceQueue', () => processSubspaceQueues(app));
    measureCpuPhase('render', () => render(app));
    decayGpuFeedCacheQuarantine();
  }
  measureCpuPhase('ui', () => updateFrameUi(now));
  finishCpuFrame(cpuFrameStart);
  requestAnimationFrame(frame);
}

function togglePause() {
  paused = !paused;
  el('pauseBtn').textContent = paused ? 'Resume' : 'Pause';
}
function toggleColdBankPanel() {
  return;
}
function applySelectedStepRegimeLive() {
  setActiveStepRegimeIndex(selectedResetRegimeIndex());
  simAccumulator = 0;
  updateStats();
  stats.log.textContent = 'Applied step regime live without resetting: ' + currentStepRegime().label + '.';
}
function nextRegistryValue(registry, currentValue, fallbackValue) {
  const values = registry.map(entry => String(entry.value));
  const current = registryValue(registry, currentValue, fallbackValue);
  const idx = values.indexOf(current);
  return values[(idx + 1 + values.length) % values.length];
}
function cycleResidentSignalResetMode() {
  return;
}
function cycleColdBankResetMode() {
  return;
}
function cycleViewMode() {
  const next = Number(nextRegistryValue(VIEW_MODES, viewMode, VIEW_MODES[0].value));
  viewMode = Number.isFinite(next) ? next : VIEW_MODES[0].value;
  setSelectValue('viewMode', viewMode);
}
function onEscherZoomModeChange() {
  escherZoomMode = selectedEscherZoomMode();
  updateStats();
  stats.log.textContent = 'Escher Zoom mode changed to ' + escherZoomMode + ' wrap. This is render-only and does not reset or step the organism.';
}
function onViewModeChange() {
  viewMode = Number(registryValue(VIEW_MODES, el('viewMode')?.value, VIEW_MODES[0].value));
}
function onResolutionQualityChange() {
  ui.resolutionIndex = selectedResolutionIndex();
  resizeCanvas();
  updateStats();
  stats.log.textContent = 'Screen resolution changed immediately. This is presentation-only and does not reset or step the organism.';
}
function onSimulationPixelScaleChange() {
  const next = selectedSimulationPixelScaleIndex();
  if (next === ui.simulationPixelScaleIndex) return;
  const previous = currentSimulationPixelScale();
  ui.simulationPixelScaleIndex = next;
  const selected = currentSimulationPixelScale();
  rebuildSimulationPixelRuntime('simulation pixel resolution changed from ' + (previous.shortLabel || previous.label) + ' to ' + (selected.shortLabel || selected.label));
}
function onViewingModeChange() {
  ui.viewingModeIndex = selectedViewingModeIndex();
  updateStats();
  stats.log.textContent = 'Viewing mode changed immediately. This is render-only and does not reset or step the organism.';
}
function onMipmapRenderModeChange() {
  const previous = mipmapRenderMode;
  mipmapRenderMode = selectedMipmapRenderMode();
  applyMipmapModeToTextures(app, previous === 'off' && mipmapRenderMode !== 'off');
  updateStats();
  stats.log.textContent = 'Mipmap render mode changed to ' + registryLabel(MIPMAP_RENDER_MODES, mipmapRenderMode, 'off', 'shortLabel') + '. This is render-only and does not reset the organism.';
}
function onDepthEffectModeChange() {
  depthEffectMode = selectedDepthEffectMode();
  churnStats.depthPolicy = activeDepthDrawPolicy();
  updateStats();
  stats.log.textContent = 'Depth effect changed to ' + registryLabel(DEPTH_EFFECT_MODES, depthEffectMode, 'on', 'shortLabel') + '. Opaque/discard work stays front-to-back; transparent portal composition stays back-to-front when depth is on.';
}
function onPixelBlendModeChange() {
  pixelBlendMode = selectedPixelBlendMode();
  updateStats();
  stats.log.textContent = 'Pixel blend changed to ' + registryLabel(PIXEL_BLEND_MODES, pixelBlendMode, 'off', 'shortLabel') + '. This blends neighbor state samples in the render witness only.';
}
function onStepRegimeOverrideChange() {
  syncResetRegimeLabel();
  updateStats();
  stats.log.textContent = 'Step regime selection changed for next reset only. Current organism keeps running at ' + currentStepRegime().label + '.';
}
function onAutonomousModeChange() {
  autonomousMode = selectedAutonomousMode();
  syncResetRegimeLabel();
  updateStats();
  stats.log.textContent = 'Autonomous Chunking mode changed to ' + autonomyModeLabel(autonomousMode) + '. Press A or the Autonomous Chunking reset button to enter that autonomous reset path.';
}
function onResidentSignalResetModeChange() {
  return;
}
function onColdBankResetModeChange() {
  return;
}
function onColdBankInfluenceSourceChange() {
  return;
}
function onColdBankIncludeCurrentOnExportChange() {
  return;
}
function onLoadStateFileChange() {
  const input = el('loadStateFile');
  loadStateFromFile(input.files && input.files[0]);
}
function onImportColdBankFileChange() {
  return;
}

const ACTIONS = {
  pause: { button: 'pauseBtn', key: ' ', run: togglePause },
  reset: { button: 'resetBtn', key: 'r', run: runSelectedReset },
  pinnedDescent: { button: 'pinnedDescentBtn', key: 'p', run: runPinnedDescentReset },
  autonomousReset: { button: 'autonomousResetBtn', key: 'a', run: runAutonomousChunkingReset },
  saveState: { button: 'saveStateBtn', key: 's', run: saveState },
  escherZoom: { button: 'escherZoomBtn', key: 'e', run: toggleEscherZoom },
  portalDown: { button: 'portalDownBtn', key: ']', run: descendPortalLadder },
  portalUp: { button: 'portalUpBtn', key: '[', run: ascendPortalLadder },
  portalLeft: { button: 'portalLeftBtn', key: ',', run: portalLeft },
  portalRight: { button: 'portalRightBtn', key: '.', run: portalRight },
  establishCenter: { button: 'establishCenterBtn', key: '=', run: establishNewPortalCenter },
  openSubspace: { button: 'openSubspaceBtn', key: 'u', run: openProjectiveSubspace },
  worldDigOpen: { button: 'worldDigOpenBtn', key: 'g', run: manualStartWorldDig },
  worldDigHalfOpen: { button: 'worldDigHalfOpenBtn', key: 'b', run: manualStartHalfWorldDig },
  worldDigCommit: { button: 'worldDigCommitBtn', run: commitWorldDig },
  worldDigAbort: { button: 'worldDigAbortBtn', run: () => abortWorldDig('manual-world-dig-abort') },
  worldDigAutonomy: { button: 'worldDigAutonomyBtn', run: toggleWorldDigAutonomy },
  resetSubspace: { button: 'resetSubspaceBtn', key: 'o', run: resetProjectiveSubspace },
  loadState: { button: 'loadStateBtn', run: () => el('loadStateFile').click() },
  toggleReticle: { button: 'reticleBtn', key: 'q', run: toggleReticle },
  hideUi: { button: 'hideBtn', key: 'h', run: () => setUiHidden(!uiHidden) },
  showUi: { button: 'uiToggleBtn', run: () => setUiHidden(false) },
  fullscreen: { button: 'fullscreenBtn', key: 'f', run: toggleFullscreen },
  applyRegime: { button: 'applyRegimeBtn', run: applySelectedStepRegimeLive },
  cycleViewMode: { key: 'v', run: cycleViewMode }
};
const CHANGE_ACTIONS = {
  loadStateFile: onLoadStateFileChange,
  escherZoomMode: onEscherZoomModeChange,
  viewMode: onViewModeChange,
  resolutionQuality: onResolutionQualityChange,
  simulationPixelScale: onSimulationPixelScaleChange,
  viewingMode: onViewingModeChange,
  mipmapRenderMode: onMipmapRenderModeChange,
  depthEffectMode: onDepthEffectModeChange,
  pixelBlendMode: onPixelBlendModeChange,
  stepRegimeOverride: onStepRegimeOverrideChange,
  autonomousMode: onAutonomousModeChange
};
const ACTION_KEY_MAP = new Map(
  Object.entries(ACTIONS)
    .filter(([, action]) => action.key)
    .map(([id, action]) => [action.key, id])
);
ACTION_KEY_MAP.set('j', 'escherZoom');
function runAction(actionId, event) {
  const action = ACTIONS[actionId];
  if (!action || typeof action.run !== 'function') return;
  action.run(event);
}
function bindActionRegistry() {
  for (const [id, action] of Object.entries(ACTIONS)) {
    if (!action.button) continue;
    const node = el(action.button);
    if (node) node.onclick = (event) => runAction(id, event);
  }
  for (const [id, handler] of Object.entries(CHANGE_ACTIONS)) {
    const node = el(id);
    if (node) node.onchange = handler;
  }
  window.addEventListener('resize', resizeCanvas);
  document.addEventListener('fullscreenchange', syncFullscreenLabel);
  window.addEventListener('keydown', handleActionKeydown);
}
function handleActionKeydown(ev) {
  if (ev.repeat) return;
  const k = ev.key === ' ' ? ' ' : ev.key.toLowerCase();
  if (ev.shiftKey && 'g' === k) {
    ev.preventDefault();
    ev.stopPropagation();
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    commitWorldDig();
    return;
  }
  if (ev.altKey && 'g' === k) {
    ev.preventDefault();
    ev.stopPropagation();
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    abortWorldDig('manual-world-dig-abort');
    return;
  }
  const actionId = ACTION_KEY_MAP.get(k);
  if (!actionId) return;
  ev.preventDefault();
  ev.stopPropagation();
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  runAction(actionId, ev);
}

function maybeRunOfflineAutostart() {
  const mode = String(window.CHRYSALIS_OFFLINE_AUTOSTART || '').toLowerCase();
  if (mode !== 'auto' && mode !== 'autonomy') return;
  window.CHRYSALIS_OFFLINE_AUTOSTART = 'armed-once';
  window.setTimeout(() => {
    if (!app || autonomousActive) return;
    try {
      runAutonomousChunkingReset();
      if (stats.log) stats.log.textContent = 'Standalone autostart triggered Autonomous Chunking Reset A. Manual controls remain available.';
    } catch (err) {
      if (stats.log) stats.log.textContent = 'Standalone autostart failed: ' + (err && err.message ? err.message : String(err));
    }
  }, 180);
}

hydrateRegistryControls();
bindActionRegistry();

(function boot() {
  try {
    app = initWebGL();
    const present = presentationSize();
    stats.engine.textContent = 'WebGL2 ' + app.fmt.label + ' · screen ' + present.width + '×' + present.height + ' · sim ' + app.size + '²';
    stats.engine.className = 'good';
    stats.matrix.textContent = app.fmt.label + ' · ' + app.size + '² zero';
    startPortalRouteCompiler();
    maybeCompilePortalRoutes(true);
    stats.log.textContent = 'Chrysalis Zero Matrix running. The simulation is the substrate and the loop: local 4D phase bends its own sampling space; densities 1–12 active. Default view is Inverted Light Lattice. Riemann Solver Mode maps x/y/z/w to density/velocity/pressure/entropy and runs a GPU-local HLLC shock-tube flux. Pinned Descent Reset P remains a pristine pinned descent branch. Autonomous Chunking Reset A can force Riemann Autonomy or let Full Autonomy adapt live from matrix feedback and enter/step/exit portal transit after hysteresis. Save State exports the current matrix texture and metadata for permanent-outcome handoff/restoration. Escher Zoom is an active portal navigator, Projective Subspace opens bounded child-world W-pointer gates, and World Dig sits above that portal layer for boxed child-world promotion. Subspace is lazy, manual or Escher-triggered, and uses bounded mix backflow, not summation.';
  } catch (err) {
    stats.engine.textContent = 'boot failed';
    stats.engine.className = 'warn';
    stats.matrix.textContent = 'unavailable';
    stats.log.textContent = 'Boot failed: ' + (err && err.message ? err.message : String(err));
    throw err;
  }
  setUiHidden(false);
  syncFullscreenLabel();
  syncReticleButtonLabel();
  updateStats();
  maybeRunOfflineAutostart();
  requestAnimationFrame(frame);
})();
