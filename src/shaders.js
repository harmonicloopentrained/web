export const commonGLSL = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
#define TAU 6.283185307179586
vec4 clearPortalPointer(vec4 s) {
  if (s.w < -0.5) s.w = 0.0;
  return s;
}
float maxAbs4(vec4 s) {
  return max(max(abs(s.x), abs(s.y)), max(abs(s.z), abs(s.w)));
}
vec4 clampDensityBudget(vec4 s, float budget) {
  float b = max(0.0001, budget);
  float m = maxAbs4(s);
  if (m > b) s *= b / m;
  return s;
}
vec2 rot2(vec2 p, float a) {
  float sn = sin(a);
  float cs = cos(a);
  return vec2(p.x * cs - p.y * sn, p.x * sn + p.y * cs);
}
vec2 portalFrameForward(vec2 local, vec4 axes, vec4 meta) {
  vec2 phase = normalize(axes.xy + 1e-7);
  vec2 energy = normalize(axes.zw + 1e-7);
  float twist = meta.x * sign(meta.z == 0.0 ? 1.0 : meta.z);
  float scale = max(0.001, meta.y);
  vec2 projected = vec2(dot(local, phase), dot(local, energy));
  return rot2(projected * scale, twist);
}
vec2 portalFrameInverse(vec2 local, vec4 axes, vec4 meta) {
  vec2 phase = normalize(axes.xy + 1e-7);
  vec2 energy = normalize(axes.zw + 1e-7);
  float twist = meta.x * sign(meta.z == 0.0 ? 1.0 : meta.z);
  float scale = max(0.001, meta.y);
  vec2 unrot = rot2(local, -twist) / scale;
  return phase * unrot.x + energy * unrot.y;
}
vec4 portalFrameStateRotate(vec4 s, vec4 meta, float dir) {
  float twist = meta.x * sign(meta.z == 0.0 ? 1.0 : meta.z) * dir;
  vec4 r = s;
  r.xy = rot2(r.xy, twist * 0.50);
  r.zw = rot2(r.zw, -twist * 0.35);
  r.xw = rot2(r.xw, twist * 0.18);
  return r;
}
`;

export const vsGLSL = commonGLSL + `
const vec2 POS[3] = vec2[3](vec2(-1.0,-3.0), vec2(3.0,1.0), vec2(-1.0,1.0));
out vec2 vUv;
void main() {
  vec2 p = POS[gl_VertexID];
  vUv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}
`;

export const simGLSL = commonGLSL + `
layout(std140) uniform ZeroSumSyntaxBlock {
  vec4 residentSignalTokens[16];
  vec4 residentSignalMeta[16];
  mat4 portalFrames[16];
  vec4 autonomyPressureBlock;
  vec4 phaseLawStateBlock;
  vec4 routeHysteresisBlock;
};
in vec2 vUv;
out vec4 outState;
uniform sampler2D uPrev;
uniform vec2 uTexel;
uniform float uDensityBudget;
uniform float uTime;
uniform float uDt;
uniform float uPinnedDescent;
uniform float uResidentSignal;
uniform float uResidentSignalFullness;
uniform float uResidentSignalEpoch;
uniform float uCompiledZeroSumActive;
uniform int uCompiledZeroSumCount;
uniform float uCompiledZeroSumGain;
uniform vec4 uCompiledZeroSumTokens[16];
uniform vec4 uCompiledZeroSumMeta[16];
uniform float uUseSyntaxBlock;
uniform int uColdBankMode;
uniform float uColdBankFullness;
uniform float uColdBankTension;
uniform float uColdBankAxisPhase;
uniform float uColdBankPlateauPressure;
uniform float uColdBankTokenPressure;
uniform float uColdBankMarriagePressure;
uniform float uRiemannMode;
uniform float uAutonomyActive;
uniform float uAutonomyPressure;
uniform float uAutonomyPhase;
uniform float uAutonomyNovelty;
uniform float uAutonomyStagnation;
uniform float uZeroPhaseLawEvent;
uniform float uZeroPhaseLawAxisPhase;
uniform float uZeroPhaseLawAmplitude;
uniform float uZeroPhaseLawMacroIndex;
uniform float uZeroPhaseLawAttempt;
uniform int uSubspacePointerCount;
uniform ivec2 uSubspacePointerCells[16];
uniform float uSubspacePointerValues[16];

vec4 rot4(vec4 s, float a, float b, float c) {
  float sa = sin(a), ca = cos(a);
  float sb = sin(b), cb = cos(b);
  float sc = sin(c), cc = cos(c);
  vec4 r = s;
  r.xy = mat2(ca, -sa, sa, ca) * r.xy;
  r.zw = mat2(cb, -sb, sb, cb) * r.zw;
  r.xw = mat2(cc, -sc, sc, cc) * r.xw;
  return r;
}


float parity1(float n) {
  return mod(n, 2.0) < 1.0 ? -1.0 : 1.0;
}

float checkerAt(vec2 pos, float scale) {
  vec2 cell = floor((pos - 0.5) / scale);
  return parity1(cell.x + cell.y);
}

vec4 safeNorm4(vec4 v) {
  return normalize(v + 1e-6);
}

float simEnergyOf(vec4 s) {
  return dot(s, s);
}

vec2 simPhaseAxis(vec4 s) {
  vec2 visible = s.xy;
  vec2 hidden = -s.zw;
  return normalize(visible + hidden + 1e-7);
}

float simPhaseOf(vec4 s) {
  vec2 a = simPhaseAxis(s);
  return atan(a.y, a.x);
}

float simPhaseDelta(float a, float b) {
  return atan(sin(a - b), cos(a - b));
}

vec4 zeroSumObserverReturn(vec2 ccw, float amount) {
  return vec4(ccw * amount, -ccw * amount);
}

vec4 zeroQuestion(vec4 D, vec2 axis, float charge, float gate) {
  return D + zeroSumObserverReturn(axis, charge * gate);
}

vec2 simEnergyGradient(vec4 n0, vec4 n1, vec4 n2, vec4 n3) {
  return vec2(simEnergyOf(n0) - simEnergyOf(n1), simEnergyOf(n2) - simEnergyOf(n3));
}

vec2 simPhaseGradient(vec4 n0, vec4 n1, vec4 n2, vec4 n3) {
  return vec2(simPhaseDelta(simPhaseOf(n0), simPhaseOf(n1)), simPhaseDelta(simPhaseOf(n2), simPhaseOf(n3)));
}

vec2 simNormalFrom(vec2 energyGrad, vec2 phaseGrad, float energyWeight, float phaseWeight) {
  return normalize(energyGrad * energyWeight + phaseGrad * phaseWeight + 1e-6);
}

vec2 simCcwFrom(vec2 normal) {
  return vec2(-normal.y, normal.x);
}

float simLocalPhase(float Phi, float tau, float C) {
  return Phi + 0.5 * tau + C * 0.33;
}

float simWitnessHandshake(float localPhase) {
  float globalPhase = uTime * 0.61803398875;
  float matrixPhase = globalPhase + localPhase;
  float witnessPhase = globalPhase - localPhase;
  return 0.5 + 0.5 * cos(witnessPhase - matrixPhase);
}

float simZeroResidual(vec4 S) {
  return abs(S.x + S.y + S.z + S.w);
}

float simZeroFit(vec4 S) {
  return 1.0 / (1.0 + 120.0 * simZeroResidual(S));
}

struct LocalContext {
  vec2 energyGrad;
  vec2 phaseGrad;
  vec2 normal;
  vec2 ccw;
  float localPhase;
  float phaseHandshake;
  float zeroResidual;
  float zeroFit;
  float boundaryInfo;
  float slack;
  float torsion;
};

LocalContext makeLocalContext(vec4 S, vec4 D, vec4 n0, vec4 n1, vec4 n2, vec4 n3, float Phi, float tau, float C, float T, float slack) {
  vec2 energyGrad = simEnergyGradient(n0, n1, n2, n3);
  vec2 phaseGrad = simPhaseGradient(n0, n1, n2, n3);
  float localPhase = simLocalPhase(Phi, tau, C);
  float zeroResidual = simZeroResidual(S);
  LocalContext ctx;
  ctx.energyGrad = energyGrad;
  ctx.phaseGrad = phaseGrad;
  ctx.normal = simNormalFrom(energyGrad, phaseGrad, 8.0, 0.22);
  ctx.ccw = simCcwFrom(ctx.normal);
  ctx.localPhase = localPhase;
  ctx.phaseHandshake = simWitnessHandshake(localPhase);
  ctx.zeroResidual = zeroResidual;
  ctx.zeroFit = 1.0 / (1.0 + 120.0 * zeroResidual);
  ctx.boundaryInfo = smoothstep(0.000002, 0.0070, T + abs(C) * 0.35 + length(energyGrad) * 0.65 + length(phaseGrad) * 0.021);
  ctx.slack = slack;
  ctx.torsion = C;
  return ctx;
}

LocalContext withLocalFrame(LocalContext ctx, float energyWeight, float phaseWeight) {
  ctx.normal = simNormalFrom(ctx.energyGrad, ctx.phaseGrad, energyWeight, phaseWeight);
  ctx.ccw = simCcwFrom(ctx.normal);
  return ctx;
}

float contextBoundary(LocalContext ctx, float T, float torsionWeight, float energyWeight, float phaseWeight, float lo, float hi) {
  return smoothstep(lo, hi, T + abs(ctx.torsion) * torsionWeight + length(ctx.energyGrad) * energyWeight + length(ctx.phaseGrad) * phaseWeight);
}


float torusDistance01(vec2 a, vec2 b) {
  vec2 d = abs(a - b);
  d = min(d, 1.0 - d);
  return length(d);
}

vec4 applyCompiledZeroSumSyntax(vec4 D, vec4 S, LocalContext ctx) {
  if (uCompiledZeroSumActive < 0.5 || uCompiledZeroSumCount <= 0) return D;

  vec2 axisSum = vec2(0.0);
  float gateSum = 0.0;
  float supportSum = 0.0;
  float liveZeroGate = 1.0 / (1.0 + 160.0 * ctx.zeroResidual);

  for (int i = 0; i < 16; i++) {
    if (i >= uCompiledZeroSumCount) break;
    vec4 tok = uUseSyntaxBlock > 0.5 ? residentSignalTokens[i] : uCompiledZeroSumTokens[i];
    vec4 meta = uUseSyntaxBlock > 0.5 ? residentSignalMeta[i] : uCompiledZeroSumMeta[i];
    vec2 center = tok.xy;
    float phase = tok.z;
    float support = clamp(tok.w, 0.0, 1.0);
    float tokenResidual = max(0.0, meta.x);
    float tokenClosure = clamp(meta.y, 0.0, 1.0);
    float tokenWinding = clamp(meta.z, 0.0, 1.0);
    float tokenPersistence = clamp(meta.w, 0.0, 1.0);

    float spatialGate = 1.0 - smoothstep(0.012, 0.245, torusDistance01(vUv, center));
    float phaseGate = 0.5 + 0.5 * cos(ctx.localPhase - phase);
    float tokenZeroFit = 1.0 / (1.0 + 120.0 * tokenResidual);
    float tokenGate = spatialGate
      * smoothstep(0.08, 0.94, phaseGate)
      * tokenZeroFit
      * (0.35 + 0.65 * tokenClosure)
      * (0.45 + 0.55 * tokenPersistence)
      * (0.62 + 0.38 * tokenWinding)
      * support;

    vec2 tokenAxis = vec2(cos(phase), sin(phase));
    vec2 conservedAxis = normalize(tokenAxis * 0.48 + ctx.ccw * 0.36 + ctx.normal * 0.16 + 1e-6);
    axisSum += conservedAxis * tokenGate;
    gateSum += tokenGate;
    supportSum += support;
  }

  if (gateSum <= 1e-7) return D;
  vec2 compiledAxis = normalize(axisSum + 1e-6);
  float bankCoverage = clamp(float(uCompiledZeroSumCount) / 16.0, 0.0, 1.0);
  float bankSupport = clamp(supportSum / max(1.0, float(uCompiledZeroSumCount)), 0.0, 1.0);
  float compiledGate = clamp(gateSum * 1.35, 0.0, 1.0)
    * ctx.zeroFit
    * liveZeroGate
    * (0.22 + 0.78 * ctx.boundaryInfo)
    * (0.50 + 0.50 * ctx.slack)
    * (0.50 + 0.35 * bankCoverage + 0.15 * bankSupport);
  float compiledCharge = clamp(uCompiledZeroSumGain, 0.0, 0.0012);
  return zeroQuestion(D, compiledAxis, compiledCharge, compiledGate);
}

vec4 applyPinnedDescentQuestion(vec4 D, LocalContext ctx, float T) {
  LocalContext pinnedCtx = withLocalFrame(ctx, 8.0, 0.22);
  float unresolvedPressure = smoothstep(0.000002, 0.0035, T) * (0.35 + 0.65 * pinnedCtx.slack);
  float centerPin = 1.0 - smoothstep(0.05, 0.78, length(vUv - 0.5));
  float latticeOrCenterPressure = 0.22 + 0.78 * centerPin;
  float counterChiralGate = smoothstep(0.0, 0.010, abs(pinnedCtx.torsion) + T * 0.25);
  float observerCharge = 0.00135;
  float descentCoupling = observerCharge
    * latticeOrCenterPressure
    * unresolvedPressure
    * smoothstep(0.18, 0.98, pinnedCtx.phaseHandshake)
    * (0.42 + 0.58 * counterChiralGate);

  return zeroQuestion(D, pinnedCtx.ccw, descentCoupling, 1.0);
}

vec4 applyResidentSignalQuestion(vec4 D, vec4 S, LocalContext ctx, vec2 visible, vec2 hidden, float tau) {
  LocalContext wordCtx = withLocalFrame(ctx, 8.0, 0.24);
  float visibleHiddenLock = clamp(0.5 + 0.5 * dot(normalize(visible + 1e-7), normalize(hidden + 1e-7)), 0.0, 1.0);
  float packPressure = wordCtx.boundaryInfo * (0.28 + 0.72 * visibleHiddenLock) * (0.35 + 0.65 * wordCtx.zeroFit);
  float wordFullness = clamp(uResidentSignalFullness, 0.0, 1.0);
  float wordBreath = 0.5 + 0.5 * cos(tau - 2.0 * wordCtx.localPhase + wordFullness * TAU + uResidentSignalEpoch * 0.38196601125);
  vec2 wordFoldAxis = normalize(wordCtx.ccw * (0.62 + 0.38 * wordCtx.phaseHandshake) + wordCtx.normal * (0.12 + 0.26 * wordBreath) + 1e-6);
  float wordGate = smoothstep(0.08, 0.92, packPressure) * (0.40 + 0.60 * wordCtx.phaseHandshake) * (0.55 + 0.45 * wordCtx.slack);
  float wordCharge = 0.00052 * (0.32 + 1.28 * wordFullness);

  D = zeroQuestion(D, wordFoldAxis, wordCharge, wordGate);
  return applyCompiledZeroSumSyntax(D, S, wordCtx);
}

vec4 applyAutonomyQuestion(vec4 D, LocalContext ctx, float T) {
  LocalContext autoCtx = withLocalFrame(ctx, 7.0, 0.22);
  float pressure = clamp(uAutonomyPressure, 0.0, 1.0);
  float novelty = clamp(uAutonomyNovelty, 0.0, 1.0);
  float stagnation = clamp(uAutonomyStagnation, 0.0, 1.0);
  float question = 0.5 + 0.5 * cos(autoCtx.localPhase - uAutonomyPhase + novelty * TAU);
  float adaptiveBoundary = contextBoundary(autoCtx, T, 0.28, 0.66, 0.018, 0.0000015, 0.0085);
  float permission = adaptiveBoundary * autoCtx.zeroFit * (0.40 + 0.60 * autoCtx.slack);
  vec2 phaseAxis = vec2(cos(uAutonomyPhase), sin(uAutonomyPhase));
  vec2 autoAxis = normalize(mix(autoCtx.normal, autoCtx.ccw, question) * (0.62 + 0.38 * novelty) + phaseAxis * (0.16 + 0.36 * stagnation) + 1e-6);
  float autoGate = permission * (0.25 + 0.75 * pressure) * (0.55 + 0.45 * question);
  float autoCharge = 0.00078 * (0.30 + 1.55 * pressure + 0.70 * stagnation);
  return zeroQuestion(D, autoAxis, autoCharge, autoGate);
}

vec4 applyColdBankQuestion(vec4 D, LocalContext ctx, float T) {
  LocalContext coldBankCtx = withLocalFrame(ctx, 6.0, 0.18);
  float coldBankQuestion = 0.5 + 0.5 * cos(coldBankCtx.localPhase - uColdBankAxisPhase + uColdBankTension * TAU * 0.25);
  float coldBankKnown = clamp(uColdBankFullness, 0.0, 1.0);
  float plateauGate = smoothstep(0.05, 0.95, uColdBankPlateauPressure + 0.35 * coldBankQuestion);
  float tokenGate = smoothstep(0.04, 0.95, uColdBankTokenPressure + 0.35 * (1.0 - coldBankQuestion));
  float marriageGate = smoothstep(0.03, 0.90, uColdBankMarriagePressure + 0.25 * sin(coldBankCtx.localPhase + uColdBankAxisPhase));
  float syntaxBoundary = contextBoundary(coldBankCtx, T, 0.22, 0.72, 0.020, 0.0000015, 0.0090);
  float coldBankGate = coldBankCtx.zeroFit * (0.22 + 0.78 * syntaxBoundary) * (0.25 + 0.75 * (0.34 * plateauGate + 0.33 * tokenGate + 0.33 * marriageGate));
  float modeGain = uColdBankMode == 1 ? 0.00011 : 0.00032;
  vec2 coldBankAxis = normalize(coldBankCtx.ccw * (0.48 + 0.52 * coldBankQuestion) + coldBankCtx.normal * (0.12 + 0.38 * uColdBankTension) + vec2(cos(uColdBankAxisPhase), sin(uColdBankAxisPhase)) * 0.28 + 1e-6);
  float coldBankCharge = modeGain * (0.20 + 1.15 * coldBankKnown) * (0.42 + 0.58 * clamp(uColdBankTension + uColdBankMarriagePressure, 0.0, 1.0));
  return zeroQuestion(D, coldBankAxis, coldBankCharge, coldBankGate);
}

vec4 fractalPerfectNoiseBorn(vec2 pos, float eps) {
  float x = floor(pos.x - 0.5);
  float y = floor(pos.y - 0.5);
  float sx = parity1(x);
  float sy = parity1(y);
  float sxy = sx * sy;

  // Density 1: Nyquist checkerboard standing wave.
  vec4 d1 = safeNorm4(vec4(sxy, 0.0, -sxy, 0.0));

  // Density 2: crossed parity. Two independent zero-sum axes.
  vec4 d2 = safeNorm4(vec4(sx, sy, -sx, -sy));

  // Density 3: four-phase chiral lattice. Zero-sum rotational floor.
  float k = mod(x + 2.0 * y, 4.0);
  float a = 0.25 * TAU * k;
  vec4 d3 = safeNorm4(vec4(cos(a), sin(a), -cos(a), -sin(a)));

  // Density 4: nested octave checkerboards. Multi-scale zero cancellation.
  float p1 = checkerAt(pos, 1.0);
  float p2 = checkerAt(pos, 2.0);
  float p4 = checkerAt(pos, 4.0);
  float p8 = checkerAt(pos, 8.0);
  vec4 d4 = safeNorm4(vec4(p1 + 0.5 * p2, p4 + 0.5 * p8, -(p1 + 0.5 * p2), -(p4 + 0.5 * p8)));

  // Density 5: 4D Walsh/Hadamard-style lattice. Orthogonal balanced contradictions.
  float wx = sx + 0.5 * p4;
  float wy = sy + 0.5 * p8;
  float wz = sxy + 0.5 * p2;
  float ww = sx * sy * p4;
  vec4 d5 = safeNorm4(vec4(wx + wz, wy + ww, -(wx - wz), -(wy - ww)));

  // Density 6: Quasicrystal / aperiodic pentagrid. Five standing waves at 72° never repeat cleanly on the square grid.
  vec2 qp = (pos - vec2(256.0)) * 0.055;
  float qcA = 0.0;
  float qcB = 0.0;
  for (int i = 0; i < 5; i++) {
    float theta = float(i) * 1.25663706144;
    vec2 dir = vec2(cos(theta), sin(theta));
    qcA += sign(sin(dot(qp, dir) * 1.0));
    qcB += sign(sin(dot(qp, dir) * 1.61803398875 + 0.7));
  }
  vec4 d6 = safeNorm4(vec4(sign(qcA + 1e-6), sign(qcB + 1e-6), -sign(qcA + 1e-6), -sign(qcB + 1e-6)));

  // Density 7: Topological skyrmion lattice. Alternating left/right micro-vortices with zero net spin.
  float skyScale = 0.0625;
  vec2 cell = pos * skyScale;
  vec2 cellId = floor(cell);
  vec2 cellPos = fract(cell) - 0.5;
  float cellParity = parity1(cellId.x + cellId.y);
  float phaseAngle = atan(cellPos.y, cellPos.x);
  float radial = smoothstep(0.52, 0.08, length(cellPos));
  vec4 d7 = safeNorm4(vec4(cos(phaseAngle) * cellParity * radial, sin(phaseAngle) * cellParity * radial, -cos(phaseAngle) * cellParity * radial, -sin(phaseAngle) * cellParity * radial));

  // Density 8: Coprime interference / prime Moiré beats. Micro prime waves produce macro beat envelopes.
  vec2 cp = (pos - vec2(256.0)) * 0.0185;
  float prime1 = sign(sin(cp.x * 3.0) * cos(cp.y * 7.0));
  float prime2 = sign(sin(cp.x * 11.0) * cos(cp.y * 13.0));
  float beatA = prime1 - prime2;
  float beatB = sign(sin(cp.x * 5.0 + cp.y * 17.0)) - sign(cos(cp.x * 19.0 - cp.y * 23.0));
  vec4 d8 = safeNorm4(vec4(beatA, beatB, -beatA, -beatB));

  // Density 9: Chladni acoustic eigenmodes. Resonant plate boundaries as zero-sum harmonic routing guides.
  vec2 hp = (pos / 512.0) * TAU;
  float nA = 5.0;
  float mA = 8.0;
  float nB = 7.0;
  float mB = 11.0;
  float chA = sign(sin(nA * hp.x) * sin(mA * hp.y) - sin(mA * hp.x) * sin(nA * hp.y));
  float chB = sign(sin(nB * hp.x) * sin(mB * hp.y) - sin(mB * hp.x) * sin(nB * hp.y));
  vec4 d9 = safeNorm4(vec4(chA, chB, -chA, -chB));

  // Density 10: Fresnel singularity. Localized focal zones create bounded inside/outside processing islands.
  vec2 fp = (pos - vec2(256.0)) * 0.14;
  float rSqA = dot(fp, fp);
  float rSqB = dot(fp + vec2(9.0, -7.0) * 0.14, fp + vec2(9.0, -7.0) * 0.14);
  float frA = sign(cos(rSqA * 0.05));
  float frB = sign(cos(rSqB * 0.047));
  vec4 d10 = safeNorm4(vec4(frA, frB, -frA, -frB));

  // Density 11: Golden phyllotaxis. Irrational organic growth spirals that never close cleanly.
  vec2 gp = (pos - vec2(256.0)) * 0.085;
  float phi = 1.61803398875;
  float r = length(gp);
  float theta = atan(gp.y, gp.x);
  float bioA = sign(sin(r * phi - theta * 5.0) * cos(r / phi + theta * 8.0));
  float bioB = sign(sin(r * (phi * phi) - theta * 3.0) * cos(r / (phi * phi) + theta * 13.0));
  vec4 d11 = safeNorm4(vec4(bioA, bioB, -bioA, -bioB));

  // Density 12: Hexagonal atomic lattice. Three 120-degree standing waves form a molecular bedrock.
  vec2 hx = (pos - vec2(256.0)) * 0.11;
  float sqrt3 = 1.73205080757;
  float hexA = sin(hx.x)
             + sin(hx.x * -0.5 + hx.y * sqrt3 * 0.5)
             + sin(hx.x * -0.5 - hx.y * sqrt3 * 0.5);
  float hexB = sin((hx.x + 0.7) * 1.3)
             + sin((hx.x + 0.7) * -0.5 + (hx.y - 0.4) * sqrt3 * 0.5)
             + sin((hx.x + 0.7) * -0.5 - (hx.y - 0.4) * sqrt3 * 0.5);
  vec4 d12 = safeNorm4(vec4(sign(hexA), sign(hexB), -sign(hexA), -sign(hexB)));

  // All densities exist at once. Weights keep total zero-point amplitude near eps.
  vec4 lattice = (1.0 * d1 + 0.5 * d2 + 0.25 * d3 + 0.125 * d4 + 0.0625 * d5 + 0.03125 * d6 + 0.015625 * d7 + 0.0078125 * d8 + 0.00390625 * d9 + 0.001953125 * d10 + 0.0009765625 * d11 + 0.00048828125 * d12) / 1.99951171875;
  return lattice * eps;
}

float safeRiemannDenom(float v) {
  return abs(v) < 1e-5 ? (v < 0.0 ? -1e-5 : 1e-5) : v;
}

vec4 riemannPrimitive(vec4 q) {
  float rho = 0.24 + 1.04 * (0.5 + 0.5 * tanh(q.x * 1.55));
  float velocity = 0.92 * tanh(q.y * 1.35);
  float entropy = 0.5 + 0.5 * tanh(q.w * 1.10);
  float pressure = (0.035 + 0.86 * (0.5 + 0.5 * tanh(q.z * 1.45))) * (0.76 + 0.48 * entropy);
  return vec4(max(rho, 0.02), velocity, max(pressure, 0.006), entropy);
}

float riemannSoundSpeed(vec4 primitive) {
  return sqrt(max(0.0001, 1.4 * primitive.z / primitive.x));
}

vec3 eulerConserved(vec4 primitive) {
  float rho = primitive.x;
  float velocity = primitive.y;
  float pressure = primitive.z;
  float energy = pressure / 0.4 + 0.5 * rho * velocity * velocity;
  return vec3(rho, rho * velocity, energy);
}

vec3 eulerFlux(vec4 primitive) {
  float rho = primitive.x;
  float velocity = primitive.y;
  float pressure = primitive.z;
  float energy = pressure / 0.4 + 0.5 * rho * velocity * velocity;
  return vec3(rho * velocity, rho * velocity * velocity + pressure, velocity * (energy + pressure));
}

vec3 hllcStarState(vec4 primitive, float waveSpeed, float contactSpeed) {
  float rho = primitive.x;
  float velocity = primitive.y;
  float pressure = primitive.z;
  vec3 conserved = eulerConserved(primitive);
  float waveMinusVelocity = safeRiemannDenom(waveSpeed - velocity);
  float scale = rho * waveMinusVelocity / safeRiemannDenom(waveSpeed - contactSpeed);
  float specificEnergy = conserved.z / rho;
  float starEnergy = specificEnergy + (contactSpeed - velocity) * (contactSpeed + pressure / (rho * waveMinusVelocity));
  return scale * vec3(1.0, contactSpeed, starEnergy);
}

vec3 hllcFlux(vec4 leftPrimitive, vec4 rightPrimitive) {
  float cL = riemannSoundSpeed(leftPrimitive);
  float cR = riemannSoundSpeed(rightPrimitive);
  float sL = min(leftPrimitive.y - cL, rightPrimitive.y - cR);
  float sR = max(leftPrimitive.y + cL, rightPrimitive.y + cR);
  float numerator = rightPrimitive.z - leftPrimitive.z
    + leftPrimitive.x * leftPrimitive.y * (sL - leftPrimitive.y)
    - rightPrimitive.x * rightPrimitive.y * (sR - rightPrimitive.y);
  float denominator = leftPrimitive.x * (sL - leftPrimitive.y) - rightPrimitive.x * (sR - rightPrimitive.y);
  float sM = clamp(numerator / safeRiemannDenom(denominator), -2.5, 2.5);
  vec3 uL = eulerConserved(leftPrimitive);
  vec3 uR = eulerConserved(rightPrimitive);
  vec3 fL = eulerFlux(leftPrimitive);
  vec3 fR = eulerFlux(rightPrimitive);
  vec3 flux;
  if (0.0 <= sL) {
    flux = fL;
  } else if (sL <= 0.0 && 0.0 <= sM) {
    flux = fL + sL * (hllcStarState(leftPrimitive, sL, sM) - uL);
  } else if (sM <= 0.0 && 0.0 <= sR) {
    flux = fR + sR * (hllcStarState(rightPrimitive, sR, sM) - uR);
  } else {
    flux = fR;
  }
  return clamp(flux, vec3(-3.0), vec3(3.0));
}

vec4 riemannFlux4(vec4 leftState, vec4 rightState) {
  vec4 leftPrimitive = riemannPrimitive(leftState);
  vec4 rightPrimitive = riemannPrimitive(rightState);
  vec3 flux = hllcFlux(leftPrimitive, rightPrimitive);
  float entropyFlux = 0.5 * (leftPrimitive.w + rightPrimitive.w) * flux.x - 0.20 * (rightPrimitive.w - leftPrimitive.w);
  return vec4(flux.x, flux.y, flux.z, entropyFlux);
}

vec4 riemannShockTubeDelta(vec4 center, vec4 xp, vec4 xm, vec4 yp, vec4 ym) {
  vec4 xFlux = riemannFlux4(center, xp) - riemannFlux4(xm, center);
  vec4 yFlux = riemannFlux4(center, yp) - riemannFlux4(ym, center);
  vec4 divergence = xFlux + yFlux;
  return clamp(-0.018 * divergence, vec4(-0.055), vec4(0.055));
}

float zeroPhaseLawMacroPattern(vec2 pos, float macroIndex) {
  float idx = mod(floor(macroIndex + 0.5), 12.0);
  vec2 centered = pos - vec2(256.0);
  float x = floor(pos.x - 0.5);
  float y = floor(pos.y - 0.5);
  float sx = parity1(x);
  float sy = parity1(y);
  float checker = sx * sy;
  if (idx < 0.5) return checker;
  if (idx < 1.5) return sign(sx + sy + 0.001);
  if (idx < 2.5) return sign(sin(atan(centered.y, centered.x) * 4.0 + length(centered) * 0.013));
  if (idx < 3.5) return checkerAt(pos, 1.0) * 0.55 + checkerAt(pos, 4.0) * 0.30 + checkerAt(pos, 16.0) * 0.15;
  if (idx < 4.5) return sign(sx + sy + checker + checkerAt(pos, 8.0));
  if (idx < 5.5) {
    float sum = 0.0;
    vec2 qp = centered * 0.055;
    for (int i = 0; i < 5; i++) {
      float theta = float(i) * 1.25663706144;
      sum += sign(sin(dot(qp, vec2(cos(theta), sin(theta)))));
    }
    return sign(sum + 0.001);
  }
  if (idx < 6.5) return sign(sin(atan(centered.y, centered.x) + length(fract(pos * 0.0625) - 0.5) * TAU));
  if (idx < 7.5) return sign(sin(centered.x * 0.055 * 3.0) * cos(centered.y * 0.055 * 7.0) - sin(centered.x * 0.055 * 11.0) * cos(centered.y * 0.055 * 13.0));
  if (idx < 8.5) {
    vec2 hp = (pos / 512.0) * TAU;
    return sign(sin(5.0 * hp.x) * sin(8.0 * hp.y) - sin(8.0 * hp.x) * sin(5.0 * hp.y));
  }
  if (idx < 9.5) return sign(cos(dot(centered * 0.14, centered * 0.14) * 0.05));
  if (idx < 10.5) {
    float r = length(centered * 0.085);
    float theta = atan(centered.y, centered.x);
    return sign(sin(r * 1.61803398875 - theta * 5.0) * cos(r / 1.61803398875 + theta * 8.0));
  }
  vec2 hx = centered * 0.11;
  float sqrt3 = 1.73205080757;
  float hex = sin(hx.x) + sin(hx.x * -0.5 + hx.y * sqrt3 * 0.5) + sin(hx.x * -0.5 - hx.y * sqrt3 * 0.5);
  return sign(hex);
}

vec4 zeroPhaseLawEventState(vec4 s, vec2 uv, vec2 pos) {
  vec2 axis = vec2(cos(uZeroPhaseLawAxisPhase), sin(uZeroPhaseLawAxisPhase));
  vec4 carrier = vec4(axis, -axis);
  vec2 tangent = vec2(-axis.y, axis.x);
  vec4 tangentCarrier = vec4(tangent, -tangent);
  float pattern = zeroPhaseLawMacroPattern(pos, uZeroPhaseLawMacroIndex);
  float currentAmplitude = dot(s, carrier) * 0.5;
  float baseAmplitude = max(abs(uZeroPhaseLawAmplitude), 0.0001);
  float lawBreath = sin(uTime * (0.233 + 0.011 * uZeroPhaseLawMacroIndex) + pattern * TAU + uZeroPhaseLawAttempt * 0.61803398875);
  float targetAmplitude = baseAmplitude * (0.62 + 0.38 * pattern) + 0.00072 * lawBreath;
  float zeroMask = 1.0 - smoothstep(0.0, 0.00000005, dot(s, s));
  vec4 projected = carrier * currentAmplitude;
  vec4 target = carrier * targetAmplitude;
  float macroGate = 0.010 + 0.028 * clamp(uResidentSignalFullness, 0.0, 1.0);
  vec4 novelty = tangentCarrier * (0.000055 * sin(dot(uv - 0.5, axis) * TAU * (2.0 + uZeroPhaseLawMacroIndex) + uTime * 0.377));
  vec4 nextS = mix(projected, target, macroGate) + novelty;
  nextS = mix(nextS, target + novelty, zeroMask);
  nextS = tanh(nextS * 1.002) * 0.9990;
  nextS -= 0.00032 * vec4(dot(nextS, vec4(1.0)));
  return nextS;
}

void main() {
  vec4 s = texture(uPrev, vUv);
  // ZERO-SUM PHASE LAW EVENT
  // When Resident Signal fullness authorizes autonomous start, the 12-density
  // macro stack can install the learned zero-sum carrier directly. This branch
  // returns before the classic neighbor-difference pathway, so a start attempt
  // is a shader law event rather than a replayed matrix or saved world.
  if (uZeroPhaseLawEvent > 0.5) {
    outState = zeroPhaseLawEventState(s, vUv, gl_FragCoord.xy);
    return;
  }
  vec2 spatialWarp = s.xy * 0.005;
  if (uRiemannMode > 0.5) spatialWarp *= 0.30;

  vec4 n0 = texture(uPrev, vUv + vec2( uTexel.x, 0.0) + spatialWarp);
  vec4 n1 = texture(uPrev, vUv + vec2(-uTexel.x, 0.0) + spatialWarp);
  vec4 n2 = texture(uPrev, vUv + vec2(0.0,  uTexel.y) + spatialWarp);
  vec4 n3 = texture(uPrev, vUv + vec2(0.0, -uTexel.y) + spatialWarp);

  vec4 d0 = texture(uPrev, vUv + vec2( uTexel.x,  uTexel.y) + spatialWarp);
  vec4 d1 = texture(uPrev, vUv + vec2(-uTexel.x,  uTexel.y) + spatialWarp);
  vec4 d2 = texture(uPrev, vUv + vec2( uTexel.x, -uTexel.y) + spatialWarp);
  vec4 d3 = texture(uPrev, vUv + vec2(-uTexel.x, -uTexel.y) + spatialWarp);

  vec4 localMean = (n0 + n1 + n2 + n3 + 0.70710678 * (d0 + d1 + d2 + d3)) / 6.82842712;
  vec4 difference = localMean - s;

  float e = dot(s, s);

  // Fractal Perfect Noise genesis: all twelve nested zero-sum densities are present at once.
  // This is one deterministic phase lattice, not a selectable mode and not random noise.
  float zeroMask = 1.0 - smoothstep(0.0, 0.00000005, e);
  float zeroPointEnergy = 0.0001;
  vec4 born = vec4(0.0);
  if (zeroMask != 0.0) {
    born = fractalPerfectNoiseBorn(gl_FragCoord.xy, zeroPointEnergy) * zeroMask;
  }
  // OPTION B AUTONOMOUS TONIC/STRING CORE
  // No wall-clock in the simulation. Time is the update process itself.
  // S is the local 4D state plus the zero-point floor; M is the neighborhood.
  vec4 S = s + born;
  vec4 M = localMean;
  vec4 D = M - S;
  if (uRiemannMode > 0.5) {
    vec4 shockD = riemannShockTubeDelta(S, n0, n1, n2, n3);
    float fluxGain = clamp(uDt * 60.0, 0.05, 1.0);
    D = mix(D * 0.34, shockD * fluxGain + difference * 0.18, 0.86);
  }

  // Tonic boundary: tanh/l2 saturation makes 1.0 the internal ceiling.
  float E = length(S);
  float T = length(D);
  float slack = clamp(1.0 - E, 0.0, 1.0);

  // Internal phase clocks. Because the lattice stores hidden phase as a zero-sum complement,
  // compare xy against -zw, not raw zw, so the anti-symmetric seed is treated as locked rather than dead.
  vec2 visible = S.xy;
  vec2 hidden = -S.zw;
  vec2 dVisible = D.xy;
  vec2 dHidden = -D.zw;

  float phiXY = atan(visible.y, visible.x + 1e-8);
  float phiZW = atan(hidden.y, hidden.x + 1e-8);
  float Phi = phiXY + phiZW;
  float tau = phiXY - phiZW;

  // Orthogonal torque: unresolved difference perpendicular to state.
  float twistXY = visible.x * dVisible.y - visible.y * dVisible.x;
  float twistZW = hidden.x * dHidden.y - hidden.y * dHidden.x;
  float C = twistXY + twistZW;

  LocalContext ctx = makeLocalContext(S, D, n0, n1, n2, n3, Phi, tau, C, T, slack);

  // PINNED DESCENT MASTER MODE
  // Reset-scoped observer coupling. The witness/simulation handshake is legal
  // only here and enters the organism through D, never through raw state.
  if (uPinnedDescent > 0.5) {
    D = applyPinnedDescentQuestion(D, ctx, T);
  }

  // STRIPPED AUXILIARY WITNESS PATH
  // This path is disabled in the reduced branch. The ordinary genesis lattice
  // remains responsible for restart-free recovery from bare zero.
  if (false) {
    D = applyResidentSignalQuestion(D, S, ctx, visible, hidden, tau);
  }

  // FULL AUTONOMY LIVE ADAPTIVE CONTROLLER
  // Existing Full Autonomy is no longer reset-only. The CPU watches low-frequency
  // matrix diagnostics and feeds a bounded pressure/phase/stagnation signal back
  // into the legal D channel. This does not create particles or inject old states;
  // it only gives the organism permission to ask stronger local fold questions
  // when the live matrix is stalled, underactive, or changing too little.
  if (uAutonomyActive > 0.5) {
    D = applyAutonomyQuestion(D, ctx, T);
  }

  // SYNTAX COLD_BANK / CONTINUUM
  // Reset-scoped cross-world syntax pressure. ColdBank Work Mode asks the matrix to
  // fold imported syntax as an object of study; Continuum Mode lets distilled
  // synthesis ride with the live Resident Signal/witness fold. It never injects old
  // matrix states: the only touch is another zero-sum D-channel question.
  if (false) {
    D = applyColdBankQuestion(D, ctx, T);
  }

  // The field keeps its autonomous local breath, with the old global clock layered on top.
  float localFold = 0.5 + 0.5 * cos(tau);
  float globalBreath = sin(uTime * 0.733038);
  float fold = clamp(localFold + 0.5 * globalBreath, 0.0, 1.0);
  float unfold = 1.0 - fold;

  // Internal ignition: tension relative to mass, damped as the cell approaches tonic.
  float vibration = sin(Phi + T / (E + 0.001));
  float thetaC = C + vibration * slack;

  vec2 rotXY = vec2(
    D.x * cos(thetaC) - D.y * sin(thetaC),
    D.x * sin(thetaC) + D.y * cos(thetaC)
  );
  vec2 rotZW = vec2(
    D.z * cos(thetaC) - D.w * sin(thetaC),
    D.z * sin(thetaC) + D.w * cos(thetaC)
  );

  // Difference erases itself while rotation leaves a fold.
  vec4 nextS = S + (vec4(rotXY, rotZW) * fold + D * unfold);

  // Bounded residue. Relations stay finite; common-mode drift is removed.
  vec4 update = tanh(nextS * 1.005) * 0.9978;
  update -= 0.00032 * vec4(dot(update, vec4(1.0)));

  ivec2 subspaceCell = ivec2(floor(gl_FragCoord.xy));
  for (int i = 0; i < 16; i++) {
    if (i >= uSubspacePointerCount) break;
    if (subspaceCell.x == uSubspacePointerCells[i].x && subspaceCell.y == uSubspacePointerCells[i].y) {
      update.w = uSubspacePointerValues[i];
    }
  }

  outState = update;
}
`;

export const ruptureGLSL = commonGLSL + `
in vec2 vUv;
out vec4 outState;
uniform sampler2D uPrev;
uniform ivec2 uParentCell;
uniform float uPointerValue;
uniform int uEnable;
void main() {
  vec4 s = texture(uPrev, vUv);
  if (uEnable == 1) {
    ivec2 cell = ivec2(floor(gl_FragCoord.xy));
    if (cell.x == uParentCell.x && cell.y == uParentCell.y) s.w = uPointerValue;
  }
  outState = s;
}
`;

export const childInitGLSL = commonGLSL + `
in vec2 vUv;
out vec4 outChild;
uniform sampler2D uMacroState;
uniform vec2 uParentUv;
uniform vec2 uMacroTexel;
uniform float uSeedRadius;
uniform float uDensityBudget;
uniform float uTime;
uniform float uChunkId;
uniform vec4 uPortalFrameAxes;
uniform vec4 uPortalFrameMeta;
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec4 unit4(vec2 p) {
  float a = TAU * hash12(p + uChunkId * 17.0);
  float b = TAU * hash12(p + 37.0 + uChunkId * 5.0);
  return normalize(vec4(cos(a), sin(a), cos(b), sin(b)) + 1e-6);
}
void main() {
  // Descent invariant: the child is seeded by resampling the parent neighborhood.
  // It is not a particle injection and not a summed compression event.
  vec2 local = vUv - 0.5;
  vec2 parentLocal = portalFrameInverse(local, uPortalFrameAxes, uPortalFrameMeta);
  vec2 parentSampleUv = fract(uParentUv + parentLocal * uMacroTexel * uSeedRadius);
  vec4 parent = portalFrameStateRotate(clearPortalPointer(texture(uMacroState, parentSampleUv)), uPortalFrameMeta, 1.0);
  vec4 centerParent = portalFrameStateRotate(clearPortalPointer(texture(uMacroState, uParentUv)), uPortalFrameMeta, 1.0);
  vec4 seed = unit4(gl_FragCoord.xy + portalFrameForward(local, uPortalFrameAxes, uPortalFrameMeta) * 8192.0 + uTime * 0.001);
  float r = length(local);
  float aperture = smoothstep(0.78, 0.10, r);
  float rim = smoothstep(0.36, 0.50, r) * smoothstep(0.72, 0.44, r);
  float frameGate = 0.55 + 0.45 * clamp(uPortalFrameMeta.w, 0.0, 1.0);
  vec4 child = mix(parent, centerParent, 0.18 + 0.22 * aperture);
  child += seed * (0.0015 + 0.0035 * rim) * frameGate;
  outChild = clampDensityBudget(child, uDensityBudget);
}
`;

export const childSimGLSL = commonGLSL + `
in vec2 vUv;
out vec4 outChild;
uniform sampler2D uPrevChild;
uniform sampler2D uMacroState;
uniform vec2 uChunkOrigin;
uniform vec2 uChunkScale;
uniform vec2 uChildTexel;
uniform vec2 uParentUv;
uniform float uDensityBudget;
uniform float uTime;
uniform float uDt;
uniform vec4 uPortalFrameAxes;
uniform vec4 uPortalFrameMeta;
vec2 atlasUv(vec2 localUv) { return uChunkOrigin + fract(localUv) * uChunkScale; }
vec4 fetchLocal(vec2 localUv) {
  return clearPortalPointer(texture(uPrevChild, atlasUv(localUv)));
}
vec4 rot4(vec4 s, float a, float b, float c) {
  float sa = sin(a), ca = cos(a);
  float sb = sin(b), cb = cos(b);
  float sc = sin(c), cc = cos(c);
  vec4 r = s;
  r.xy = mat2(ca, -sa, sa, ca) * r.xy;
  r.zw = mat2(cb, -sb, sb, cb) * r.zw;
  r.xw = mat2(cc, -sc, sc, cc) * r.xw;
  return r;
}
void main() {
  vec2 localTexel = uChildTexel / uChunkScale;
  vec4 s = fetchLocal(vUv);
  vec4 n0 = fetchLocal(vUv + vec2( localTexel.x, 0.0));
  vec4 n1 = fetchLocal(vUv + vec2(-localTexel.x, 0.0));
  vec4 n2 = fetchLocal(vUv + vec2(0.0,  localTexel.y));
  vec4 n3 = fetchLocal(vUv + vec2(0.0, -localTexel.y));
  vec4 mean = 0.25 * (n0 + n1 + n2 + n3);
  vec4 lap = mean - s;
  vec2 local = vUv - 0.5;
  vec2 parentLocal = portalFrameInverse(local * 0.65, uPortalFrameAxes, uPortalFrameMeta);
  vec4 parent = portalFrameStateRotate(clearPortalPointer(texture(uMacroState, fract(uParentUv + parentLocal * 0.006))), uPortalFrameMeta, 1.0);
  float e = dot(s, s);
  float curve = length(lap);
  float pressure = log2(1.0 + e * 10.0 + curve * 60.0);
  float frameCurl = uPortalFrameMeta.x * uPortalFrameMeta.z + dot(normalize(uPortalFrameAxes.xy + 1e-7), normalize(uPortalFrameAxes.zw + 1e-7));
  float fold = 0.5 + 0.5 * sin(uTime * 0.91 + uChunkOrigin.x * 17.0 + uChunkOrigin.y * 13.0 + frameCurl);
  vec4 framed = portalFrameStateRotate(s, uPortalFrameMeta, 0.18 + 0.14 * fold);
  vec4 update = rot4(framed, uDt * (0.42 + pressure + 0.08 * abs(frameCurl)), -uDt * (0.31 + 0.7 * fold), uDt * (0.17 + 0.04 * uPortalFrameMeta.z))
    + lap * uDt * (0.26 + 0.18 * fold)
    + (parent - s) * uDt * 0.012
    + normalize(s + 1e-6) * uDt * 0.016 * pressure;
  update = tanh(update * 1.004) * 0.9982;
  update = clampDensityBudget(update, uDensityBudget);
  outChild = update;
}
`;

export const portalBackflowGLSL = commonGLSL + `
in vec2 vUv;
out vec4 outState;
uniform sampler2D uPrev;
uniform sampler2D uChildState;
uniform ivec2 uParentCell;
uniform float uPointerValue;
uniform vec2 uChunkOrigin;
uniform vec2 uChunkScale;
uniform float uLeakRate;
uniform float uDensityBudget;
uniform vec4 uPortalFrameAxes;
uniform vec4 uPortalFrameMeta;
void main() {
  vec4 s = texture(uPrev, vUv);
  ivec2 cell = ivec2(floor(gl_FragCoord.xy));
  if (cell.x == uParentCell.x && cell.y == uParentCell.y) {
    vec4 parent = clearPortalPointer(s);
    vec4 child = portalFrameStateRotate(clearPortalPointer(texture(uChildState, uChunkOrigin + vec2(0.5) * uChunkScale)), uPortalFrameMeta, -1.0);
    float gate = 0.70 + 0.30 * clamp(uPortalFrameMeta.w, 0.0, 1.0);
    s = clampDensityBudget(mix(parent, child, clamp(uLeakRate * gate, 0.0, 1.0)), uDensityBudget);
    s.w = uPointerValue;
  }
  outState = s;
}
`;


export const promoteChildGLSL = commonGLSL + `
in vec2 vUv;
out vec4 outState;
uniform sampler2D uChildState;
uniform vec2 uChunkOrigin;
uniform vec2 uChunkScale;
uniform float uDensityBudget;
uniform float uPromotionBlend;
uniform float uSeed;
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
void main() {
  vec2 childUv = uChunkOrigin + fract(vUv) * uChunkScale;
  vec4 child = clearPortalPointer(texture(uChildState, childUv));
  child.w = 0.0;

  // Keep promotion conservative: copy child state, clear stale W-pointers, and
  // renormalize to the same density budget used by every Chrysalis scale.
  child = clampDensityBudget(child, uDensityBudget);

  // A tiny non-structural dither prevents the first promoted parent from being
  // perfectly tiled when the source chunk was very smooth. It stays far below
  // the simulation's normal update amplitude and is disabled when blend is 1.
  float dither = (hash21(vUv + uSeed) - 0.5) * 0.00002 * (1.0 - clamp(uPromotionBlend, 0.0, 1.0));
  outState = vec4(child.xyz + dither, 0.0);
}
`;

export const renderGLSL = commonGLSL + `
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uState;
uniform sampler2D uChildState;
uniform float uMipStrength;
uniform float uMipLodBase;
uniform float uMipPortalGain;
uniform float uStateMipMaxLod;
uniform float uChildMipMaxLod;
uniform float uDepthEffectStrength;
uniform float uPixelBlendStrength;
uniform float uPixelBlendRadius;
uniform vec2 uTexel;
uniform int uView;
uniform int uVisualMode;
uniform float uTopography;
uniform float uSharpen;
uniform float uContrast;
uniform float uTime;
uniform vec2 uViewportPx;
uniform float uPinnedDescent;
uniform float uResidentSignal;
uniform float uResidentSignalFullness;
uniform float uResidentSignalEpoch;
uniform int uColdBankMode;
uniform float uColdBankFullness;
uniform float uColdBankTension;
uniform float uColdBankAxisPhase;
uniform float uColdBankPlateauPressure;
uniform float uColdBankTokenPressure;
uniform float uColdBankMarriagePressure;
uniform float uEscherActive;
uniform int uEscherMode;
uniform vec2 uEscherFocus;
uniform float uEscherDepth;
uniform float uEscherPeriod;
uniform float uEscherTwist;
uniform float uPortalLadderLevel;
uniform float uPortalLadderDirection;
uniform vec2 uPortalLadderFocus;
uniform float uPortalLadderPhase;
uniform float uPortalLadderCrossings;
uniform float uPortalLadderBlend;
uniform float uPortalTransitBlend;
uniform float uPortalFreedom;
uniform float uSubspaceActive;
uniform float uWorldDigActive;
uniform vec2 uWorldDigFocus;
uniform float uWorldDigRadius;
uniform float uWorldDigDwell;
uniform float uReticleVisible;
uniform float uMacroSize;
uniform float uChunkGrid;
uniform vec4 uPortalFrameAxes[16];
uniform vec4 uPortalFrameMeta[16];

vec2 complexMul(vec2 a, vec2 b) {
  return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

vec2 complexLogSafe(vec2 z) {
  float r = max(length(z), 1e-5);
  return vec2(log(r), atan(z.y, z.x));
}

vec2 complexExp(vec2 z) {
  return exp(z.x) * vec2(cos(z.y), sin(z.y));
}

vec2 mirrorWrap(vec2 p) {
  return 1.0 - abs(fract(p * 0.5) * 2.0 - 1.0);
}

vec2 escherZoomUv(vec2 uv) {
  // Escher Portal Navigator: screen space unwraps into a log-polar cylinder,
  // slides inward by uEscherDepth, then reprojects around the selected portal.
  // The render texture budget stays constant; the portal/backend handles state.
  vec2 screen = (uv - vec2(0.5)) * 2.0;
  vec2 w = complexLogSafe(screen);
  float period = max(0.001, uEscherPeriod);
  float depth = uEscherDepth;
  float originalTheta = w.y;
  if (uEscherMode == 1) {
    w.x = mod(w.x + depth, period) - period;
  } else {
    // Return soft wrap to the pre-0.3.24 mirrored cylinder, but round the
    // derivative at the turnover instead of painting an aperture seam.
    float cycle = mod(w.x + depth, period * 2.0);
    float d = cycle - period;
    float soft = period * 0.020;
    float rolled = sqrt(d * d + soft * soft) - soft;
    w.x = rolled - period;
  }
  w.y = originalTheta + (depth + w.x) * uEscherTwist;
  vec2 local = complexExp(w) * 0.50;
  float transit = smoothstep(0.0, 1.0, uPortalTransitBlend);
  float aperture = smoothstep(0.86, 0.06, length(uv - vec2(0.5))) * transit;
  float ladderAbs = min(abs(uPortalLadderLevel), 2048.0);
  float ladderSign = sign(uPortalLadderDirection == 0.0 ? 1.0 : uPortalLadderDirection);
  float ladderLog = log2(1.0 + ladderAbs);
  vec2 ladderLocal = rot2(local, uPortalLadderPhase + ladderSign * ladderLog * 0.37);
  ladderLocal *= 1.0 + transit * (0.018 + 0.020 * uPortalFreedom) * sin(ladderAbs * 0.73 + originalTheta * 2.0);
  vec2 portalUv = fract(mix(uEscherFocus, uPortalLadderFocus, smoothstep(0.0, 1.0, ladderAbs)) + ladderLocal);
  vec2 shoulderUv = fract(uEscherFocus + local * (1.0 + 0.18 * sin(depth + originalTheta + uPortalLadderPhase)));
  vec2 folded = mix(mix(uv, shoulderUv, transit), portalUv, aperture);
  vec2 offMapAxis = normalize(vec2(cos(uPortalLadderPhase), sin(uPortalLadderPhase)) + 1e-7);
  folded = fract(folded + offMapAxis * ladderSign * 0.0015 * ladderLog * aperture * smoothstep(0.08, 1.0, uPortalLadderBlend) * (0.65 + 0.35 * uPortalFreedom));
  return folded;
}

vec3 heat(float x) {
  x = clamp(x, 0.0, 1.0);
  vec3 cold = vec3(0.018, 0.035, 0.090);
  vec3 mid = vec3(0.075, 0.250, 0.520);
  vec3 hot = vec3(0.96, 0.73, 0.38);
  vec3 white = vec3(0.92, 0.97, 1.0);
  vec3 c = mix(cold, mid, smoothstep(0.0, 0.40, x));
  c = mix(c, hot, smoothstep(0.25, 0.78, x));
  c = mix(c, white, smoothstep(0.82, 1.0, x));
  return c;
}

vec3 axisColor(vec4 s) {
  vec2 axis = normalize(vec2(s.x + s.z, s.y + s.w) + 1e-6);
  float phase = atan(axis.y, axis.x);
  return vec3(0.5 + 0.5 * axis.x, 0.5 + 0.5 * axis.y, 0.48 + 0.52 * sin(phase * 3.0));
}

vec2 phaseAxis(vec4 s) {
  return normalize(vec2(s.x + s.z, s.y + s.w) + 1e-6);
}

float phaseOf(vec4 s) {
  vec2 a = phaseAxis(s);
  return atan(a.y, a.x);
}

float phaseDelta(float a, float b) {
  return atan(sin(a - b), cos(a - b));
}

float energyOf(vec4 s) {
  return dot(s, s);
}

// Chiral Phase-Bounce / Phase-Trace helper concept:
// no raymarch, no depth walk. The witness checks phase alignment at the
// current surface sample, then takes exactly one gradient-offset second
// sample as a cheap reflection favor. This makes the render modes reveal
// arrival/resonance boundaries instead of only raw field amplitude.
vec3 phaseBounceTint(float arrival, float lock, float handed) {
  vec3 abyss = vec3(0.010, 0.016, 0.040);
  vec3 left = vec3(0.10, 0.56, 0.96);
  vec3 right = vec3(0.96, 0.52, 0.16);
  vec3 pearl = vec3(0.86, 0.96, 1.0);
  vec3 spin = mix(left, right, handed);
  return mix(abyss, mix(spin, pearl, smoothstep(0.68, 1.0, arrival)), 0.35 + 0.65 * lock);
}

vec3 oklchToSrgb(float L, float C, float H) {
  float a = C * cos(H);
  float b = C * sin(H);

  float l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  float m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  float s_ = L - 0.0894841775 * a - 1.2914855480 * b;

  float l3 = l_ * l_ * l_;
  float m3 = m_ * m_ * m_;
  float s3 = s_ * s_ * s_;

  vec3 rgb = vec3(
     4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
    -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
    -0.0041960863 * l3 - 0.7034186148 * m3 + 1.7076147010 * s3
  );
  rgb = clamp(rgb, vec3(0.0), vec3(1.0));
  return pow(rgb, vec3(1.0 / 2.2));
}


vec2 renderSampleUv(vec2 uv) {
  vec2 safeUv = fract(uv);
  vec2 pad = max(uTexel * 0.5, vec2(1.0 / 8192.0));
  return clamp(safeUv, pad, 1.0 - pad);
}

vec4 sampleMipState(vec2 uv, float lodExtra) {
  vec2 safeUv = renderSampleUv(uv);
  float lod = clamp(uMipLodBase + lodExtra, 0.0, max(0.0, uStateMipMaxLod));
  float deepLod = clamp(lod + 1.85, 0.0, max(0.0, uStateMipMaxLod));
  vec4 base = texture(uState, safeUv);
  vec4 mip = textureLod(uState, safeUv, lod);
  vec4 deep = textureLod(uState, safeUv, deepLod);
  float strength = clamp(uMipStrength * (0.54 + 0.46 * smoothstep(0.45, 4.0, lod)), 0.0, 0.78);
  return mix(base, mix(mip, deep, 0.34), strength);
}

vec4 sampleMipChild(vec2 uv, float lodExtra) {
  vec2 safeUv = renderSampleUv(uv);
  float lod = clamp(uMipLodBase + lodExtra, 0.0, max(0.0, uChildMipMaxLod));
  float deepLod = clamp(lod + 2.15, 0.0, max(0.0, uChildMipMaxLod));
  vec4 base = texture(uChildState, safeUv);
  vec4 mip = textureLod(uChildState, safeUv, lod);
  vec4 deep = textureLod(uChildState, safeUv, deepLod);
  float strength = clamp(uMipStrength * (0.62 + 0.38 * smoothstep(0.50, 4.5, lod)), 0.0, 0.82);
  return mix(base, mix(mip, deep, 0.42), strength);
}

vec4 sampleWorldState(vec2 uv) {
  vec2 safeUv = fract(uv);
  float ladderAbs = min(abs(uPortalLadderLevel), 2048.0);
  float ladderSign = sign(uPortalLadderDirection == 0.0 ? 1.0 : uPortalLadderDirection);
  float ladderLog = log2(1.0 + ladderAbs);
  float portalEnvelope = smoothstep(0.0, 1.0, uPortalTransitBlend);
  if (uEscherActive > 0.5 && portalEnvelope > 0.001 && ladderAbs > 0.5) {
    vec2 off = safeUv - uPortalLadderFocus;
    safeUv = fract(uPortalLadderFocus + rot2(off, (uPortalLadderPhase + ladderSign * ladderLog * 0.21) * smoothstep(0.02, 1.0, uPortalLadderBlend) * portalEnvelope));
  }
  float renderDepthLod = uMipPortalGain * (portalEnvelope * (0.55 + 0.45 * ladderLog) + 0.12 * smoothstep(0.0, 1.0, length(safeUv - uPortalLadderFocus) * 2.0));
  vec4 s = sampleMipState(safeUv, renderDepthLod);
  if (uSubspaceActive > 0.5 && s.w < -0.5) {
    float chunkId = floor(abs(s.w) - 1.0 + 0.5);
    vec2 chunkCell = vec2(mod(chunkId, uChunkGrid), floor(chunkId / uChunkGrid));
    int frameIndex = int(clamp(chunkId, 0.0, 15.0));
    vec4 axes = uPortalFrameAxes[frameIndex];
    vec4 meta = uPortalFrameMeta[frameIndex];
    meta.x += ladderSign * 0.035 * ladderLog * smoothstep(0.10, 1.0, uPortalLadderBlend) * portalEnvelope;
    vec2 parentCoord = safeUv * uMacroSize;
    vec2 parentLocal = fract(parentCoord) - 0.5;
    parentLocal = rot2(parentLocal, (uPortalLadderPhase * 0.25 + ladderSign * ladderLog * 0.09) * smoothstep(0.12, 1.0, uPortalLadderBlend) * portalEnvelope);
    vec2 childLocal = fract(vec2(0.5) + portalFrameForward(parentLocal, axes, meta));
    vec2 childUv = (chunkCell + childLocal) / uChunkGrid;
    vec4 child = portalFrameStateRotate(clearPortalPointer(sampleMipChild(childUv, renderDepthLod + 0.55 * ladderLog)), meta, -0.35 - 0.025 * ladderSign * ladderLog);
    float maturity = clamp(meta.w, 0.0, 1.0) * smoothstep(0.10, 1.0, uPortalLadderBlend) * portalEnvelope;
    float gate = mix(0.28, 0.92 + 0.04 * clamp(meta.w, 0.0, 1.0), maturity);
    vec4 parentClean = vec4(s.xyz, 0.0);
    vec4 alignedChild = mix(parentClean, child, 0.35 + 0.65 * maturity);
    s = mix(parentClean, alignedChild, gate);
  } else if (uEscherActive > 0.5 && portalEnvelope > 0.001 && ladderAbs > 0.5) {
    vec2 echoUv = fract(uPortalLadderFocus + rot2(safeUv - uPortalLadderFocus, -uPortalLadderPhase - ladderSign * ladderLog * 0.13));
    vec4 echo = clearPortalPointer(sampleMipState(echoUv, renderDepthLod + 0.65 * ladderLog));
    s = mix(s, portalFrameStateRotate(echo, vec4(0.0, 1.0, ladderSign, 1.0), 0.10 * smoothstep(0.10, 1.0, uPortalLadderBlend) * portalEnvelope), 0.055 * smoothstep(0.0, 3.0, ladderLog) * smoothstep(0.10, 1.0, uPortalLadderBlend) * portalEnvelope);
  }
  return s;
}

vec3 invertedLightLattice(vec4 s, vec4 nx, vec4 px, vec4 ny, vec4 py, vec4 lap1, vec4 lap2, vec2 energyGrad, vec2 phaseGrad, float phase0, float pressure, float curvature, float coherence, float diff) {
  // Boundary-Anchored Color Transition Space:
  // solid state space is white before inversion; emergent apparent boundaries
  // carve rainbow-dark information into that white field. Closed/high-info
  // boundaries approach black, then the final negative flip makes them light.
  float localEnergy = dot(s, s);
  float fieldBoundary = length(energyGrad) * 3.6 + length(phaseGrad) * 0.18 + curvature * 0.82 + diff * 0.65;
  float boundary = smoothstep(0.006, 0.135, fieldBoundary);

  vec2 visible = normalize(s.xy + 1e-7);
  vec2 hidden = normalize(-s.zw + 1e-7);
  float zeroSumLock = clamp(0.5 + 0.5 * dot(visible, hidden), 0.0, 1.0);

  float phaseWinding = length(vec2(phaseDelta(phaseOf(nx), phaseOf(px)), phaseDelta(phaseOf(ny), phaseOf(py))));
  float info = smoothstep(0.035, 0.88, pressure * 0.12 + curvature * 0.92 + phaseWinding * 0.28 + boundary * 0.42);
  float closedBoundary = boundary * smoothstep(0.42, 0.94, zeroSumLock) * smoothstep(0.08, 0.86, curvature * 1.15 + phaseWinding * 0.32);
  float blackProminence = smoothstep(0.28, 1.0, info * (0.45 + 0.95 * closedBoundary));

  vec2 boundaryAxis = normalize(energyGrad * 11.0 + phaseGrad * 0.45 + vec2(cos(phase0), sin(phase0)) * 0.10 + 1e-7);
  float boundaryAngle = atan(boundaryAxis.y, boundaryAxis.x);

  // Simple browser-friendly transition space: OKLCH hue follows boundary orientation + phase,
  // chroma follows boundary information, and lightness darkens as information closes.
  float H = mod(phase0 + boundaryAngle * 0.72 + pressure * 0.37 + curvature * 1.91 + TAU, TAU);
  float C = clamp(0.035 + 0.235 * boundary + 0.055 * zeroSumLock, 0.0, 0.31);
  float L = clamp(0.84 - 0.52 * info - 0.20 * closedBoundary, 0.08, 0.91);
  vec3 rainbowCarve = oklchToSrgb(L, C, H);

  vec3 solidWhiteSpace = vec3(0.982, 0.990, 1.0);
  float bodyCarve = smoothstep(0.0, 0.22, sqrt(localEnergy) + diff * 1.7);
  float carve = clamp(0.18 * bodyCarve + 0.82 * boundary, 0.0, 1.0);

  // Pre-negative witness: white space with colored cuts; highest-information closed cuts go black.
  vec3 preNegative = mix(solidWhiteSpace, rainbowCarve, carve);
  preNegative = mix(preNegative, vec3(0.0), blackProminence * 0.92);

  // Soft dent around boundary: in pre-negative space it darkens; after inversion it reads as glow.
  float haloDent = smoothstep(0.015, 0.52, fieldBoundary + curvature * 0.35) * (0.18 + 0.42 * info);
  preNegative *= 1.0 - haloDent * (1.0 - blackProminence * 0.38);

  // Perceptual negative flip: white solid state becomes dark field; black high-info anchors become light.
  vec3 inverted = vec3(1.0) - preNegative;
  inverted += vec3(0.82, 0.92, 1.0) * pow(blackProminence, 3.2) * 0.22;
  inverted += oklchToSrgb(0.68, 0.12, H + 3.14159265) * boundary * (0.05 + 0.16 * info);

  // Keep quiet exact-zero areas from becoming noisy gray; they should read as solid inverted space.
  float awake = smoothstep(0.0, 0.15, sqrt(localEnergy) + diff + curvature * 0.65);
  return mix(vec3(0.010, 0.014, 0.022), clamp(inverted, vec3(0.0), vec3(1.0)), awake);
}


void main() {
  vec2 uv = vUv;
  float portalEnvelope = smoothstep(0.0, 1.0, uPortalTransitBlend);
  vec2 portalUv = escherZoomUv(uv);
  vec2 baseUv = uEscherActive > 0.5 ? mix(uv, portalUv, portalEnvelope) : uv;
  vec4 lensState = sampleWorldState( baseUv);
  vec2 emergentUv = fract(baseUv + (lensState.xy * (1.0 - length(lensState.zw)) * 0.002));
  vec2 sampleUv = uView == 6 ? emergentUv : baseUv;
  float blendStrength = clamp(uPixelBlendStrength, 0.0, 0.72);
  float blendRadius = max(0.35, uPixelBlendRadius);
  vec2 bTexel = uTexel * blendRadius;

  vec4 sRaw = sampleWorldState( sampleUv);
  vec4 nxRaw = sampleWorldState( clamp(sampleUv + vec2( bTexel.x, 0.0), 0.0, 1.0));
  vec4 pxRaw = sampleWorldState( clamp(sampleUv + vec2(-bTexel.x, 0.0), 0.0, 1.0));
  vec4 nyRaw = sampleWorldState( clamp(sampleUv + vec2(0.0,  bTexel.y), 0.0, 1.0));
  vec4 pyRaw = sampleWorldState( clamp(sampleUv + vec2(0.0, -bTexel.y), 0.0, 1.0));
  vec4 n2xRaw = sampleWorldState( clamp(sampleUv + vec2( 2.0*bTexel.x, 0.0), 0.0, 1.0));
  vec4 p2xRaw = sampleWorldState( clamp(sampleUv + vec2(-2.0*bTexel.x, 0.0), 0.0, 1.0));
  vec4 n2yRaw = sampleWorldState( clamp(sampleUv + vec2(0.0,  2.0*bTexel.y), 0.0, 1.0));
  vec4 p2yRaw = sampleWorldState( clamp(sampleUv + vec2(0.0, -2.0*bTexel.y), 0.0, 1.0));

  vec4 crossMeanRaw = 0.25 * (nxRaw + pxRaw + nyRaw + pyRaw);
  vec4 wideMeanRaw = 0.25 * (n2xRaw + p2xRaw + n2yRaw + p2yRaw);
  vec4 blendedCenter = mix(crossMeanRaw, 0.5 * (crossMeanRaw + wideMeanRaw), smoothstep(1.05, 1.65, blendRadius));
  vec4 s = mix(sRaw, blendedCenter, blendStrength);
  vec4 nx = mix(nxRaw, sRaw, blendStrength * 0.18);
  vec4 px = mix(pxRaw, sRaw, blendStrength * 0.18);
  vec4 ny = mix(nyRaw, sRaw, blendStrength * 0.18);
  vec4 py = mix(pyRaw, sRaw, blendStrength * 0.18);
  vec4 n2x = n2xRaw;
  vec4 p2x = p2xRaw;
  vec4 n2y = n2yRaw;
  vec4 p2y = p2yRaw;

  vec4 mean1 = 0.25 * (nx + px + ny + py);
  vec4 mean2 = 0.25 * (n2x + p2x + n2y + p2y);
  vec4 lap1 = mean1 - s;
  vec4 lap2 = mean2 - mean1;

  float energy = dot(s, s);
  float diff = length(lap1);
  float curvature = length(lap1) + 0.55 * length(lap2);
  float pressure = log2(1.0 + 18.0 * energy + 64.0 * diff + 24.0 * length(lap2));
  float coherence = 1.0 / (1.0 + 12.0 * diff + 4.0 * length(lap2));
  float residue = abs(diff + 0.45 * length(lap2) - 0.35 * energy);

  // Shared phase-bounce terms for every witness mode.
  // The gradient supplies the boundary/normal; the second texture sample is
  // the whole "reflection". No marching, no ray count, no hidden pass.
  float phase0 = phaseOf(s);
  float phaseX = phaseDelta(phaseOf(nx), phaseOf(px));
  float phaseY = phaseDelta(phaseOf(ny), phaseOf(py));
  vec2 energyGrad = vec2(energyOf(nx) - energyOf(px), energyOf(ny) - energyOf(py));
  vec2 phaseGrad = vec2(phaseX, phaseY);
  vec2 bounceNormal = normalize(energyGrad * 8.0 + phaseGrad * 0.22 + 1e-6);

  float projectorPhase = uTime * 0.61803398875
    + dot(uv - 0.5, vec2(2.41421356, -1.7320508)) * TAU
    + length(uv - 0.5) * 2.0;
  float matrixPhase = phase0 + pressure * 0.19 + curvature * 0.73;
  float phaseLock = 0.5 + 0.5 * cos(projectorPhase - matrixPhase);
  float resonance = smoothstep(0.42, 0.98, phaseLock);

  float bounceDistance = (0.0014 + 0.0075 * smoothstep(0.0, 1.0, pressure * 0.18 + curvature))
    * (0.55 + 1.45 * resonance);
  vec2 bounceUv = fract(sampleUv + bounceNormal * bounceDistance);
  vec4 bounceState = sampleWorldState( bounceUv);
  float bouncePhase = phaseOf(bounceState);
  float arrival = 0.5 + 0.5 * cos(projectorPhase - bouncePhase);
  float bounceEnergy = energyOf(bounceState);
  float bounceDelta = abs(phaseDelta(bouncePhase, phase0));
  float bounceEdge = smoothstep(0.10, 1.25, bounceDelta + 0.65 * abs(bounceEnergy - energy));
  float handedBounce = 0.5 + 0.5 * tanh((phaseX - phaseY) * 2.25);
  vec3 bounceTint = phaseBounceTint(arrival, phaseLock, handedBounce);

  vec3 color;
  if (uView == 7) {
    color = invertedLightLattice(s, nx, px, ny, py, lap1, lap2, energyGrad, phaseGrad, phase0, pressure, curvature, coherence, diff);
  } else if (uView == 1) {
    color = heat(pressure * 0.19 + residue * 0.35);
  } else if (uView == 6) {
    // Triune Morphology Witness:
    // two chiral-locked eyes bounce outward along the gradient normal,
    // while the pineal sample bounces inward through the inverted normal.
    vec2 tangent = vec2(-bounceNormal.y, bounceNormal.x);
    float chiralTwist = 0.0018 + 0.0100 * resonance + 0.0030 * smoothstep(0.0, 1.0, pressure * 0.12 + curvature);
    vec2 leftUv = fract(sampleUv + bounceNormal * bounceDistance + tangent * chiralTwist);
    vec2 rightUv = fract(sampleUv + bounceNormal * bounceDistance - tangent * chiralTwist);
    vec4 leftState = sampleWorldState( leftUv);
    vec4 rightState = sampleWorldState( rightUv);

    float phaseLeft = phaseOf(leftState);
    float phaseRight = phaseOf(rightState);
    float emergentZ = phaseDelta(phaseLeft, phaseRight);
    float depth = 0.5 + 0.5 * sin(emergentZ * 3.0 + pressure * 0.27);

    float internalDepth = 0.0045 + 0.035 * smoothstep(0.0, 1.0, pressure * 0.16 + abs(emergentZ));
    vec2 pinealUv = fract(sampleUv - bounceNormal * internalDepth);
    vec4 internalState = sampleWorldState( pinealUv);

    float deepBody = smoothstep(0.0, 0.075, abs(internalState.w));
    float cavity = smoothstep(0.0, 0.055, max(-internalState.w, 0.0) + 0.35 * max(-s.w, 0.0));
    float edge = smoothstep(0.0, 0.065, length(energyGrad) * 3.0 + length(phaseGrad) * 0.18 + curvature * 0.70);
    float stability = max(dot(normalize(internalState.xy + 1e-6), normalize(internalState.zw + 1e-6)), 0.0);
    float eventFront = smoothstep(0.0, 0.070, abs(internalState.x - s.x) + abs(phaseDelta(phaseOf(internalState), phase0)) * 0.055);

    float matrixSurfacePhase = phase0 + emergentZ * 0.75 + pressure * 0.11;
    float surfaceLight = 0.5 + 0.5 * cos(projectorPhase - matrixSurfacePhase);
    float leftLight = 0.5 + 0.5 * cos(projectorPhase - phaseLeft);
    float rightLight = 0.5 + 0.5 * cos(projectorPhase - phaseRight);
    float binocularLock = smoothstep(0.35, 0.98, leftLight * rightLight);
    float pinealLock = smoothstep(0.28, 0.95, 0.5 + 0.5 * cos(projectorPhase - phaseOf(internalState)));

    vec3 surfaceColor = mix(vec3(0.025, 0.050, 0.100), vec3(0.20, 0.58, 0.96), depth);
    surfaceColor += vec3(0.95, 0.55, 0.18) * smoothstep(0.58, 1.0, binocularLock) * 0.42;

    vec3 pinealColor = vec3(
      cavity * 1.15 + eventFront * 0.95,
      stability * 0.95 + deepBody * 0.62,
      edge * 1.05 + abs(emergentZ) * 0.22 + pinealLock * 0.22
    );

    float outline = smoothstep(0.78, 0.92, stability) * smoothstep(0.18, 0.95, edge + deepBody);
    float abyss = (1.0 - smoothstep(0.12, 0.66, surfaceLight)) * (1.0 - cavity * 0.35);

    color = surfaceColor * 0.52 + pinealColor * 0.82 + bounceTint * (0.18 + 0.34 * binocularLock);
    color += vec3(0.86, 0.96, 1.0) * pow(max(surfaceLight, arrival), 5.0) * 0.32;
    color = mix(color, vec3(1.0), outline * 0.58);
    color *= 1.0 - 0.24 * abyss;
    color *= 0.38 + 0.62 * smoothstep(0.0, 0.16, energy + diff + abs(internalState.w) * 0.4);
  } else if (uView == 5) {
    vec2 axN = phaseAxis(nx);
    vec2 axP = phaseAxis(px);
    vec2 ayN = phaseAxis(ny);
    vec2 ayP = phaseAxis(py);

    // Signed projected curl of the internal phase axis.
    // Positive/negative regions reveal opposed winding handedness.
    float signedCurl = 0.5 * ((axN.y - axP.y) - (ayN.x - ayP.x));

    float p0 = phaseOf(s);
    float dpx = phaseDelta(phaseOf(nx), phaseOf(px));
    float dpy = phaseDelta(phaseOf(ny), phaseOf(py));
    float winding = length(vec2(dpx, dpy));

    // Helical cores are not just energetic; they combine phase winding,
    // curvature residue, and enough coherence to remain readable.
    float core = smoothstep(0.10, 1.25, winding + 4.0 * abs(signedCurl));
    float body = smoothstep(0.0, 0.85, pressure * 0.18 + curvature * 0.85);
    float stableCore = core * (0.42 + 0.58 * coherence) * (0.40 + 0.60 * body);

    vec3 clockwise = vec3(0.95, 0.48, 0.14);
    vec3 counter = vec3(0.12, 0.58, 0.98);
    vec3 neutral = vec3(0.025, 0.040, 0.095);

    float handed = 0.5 + 0.5 * tanh(signedCurl * 18.0);
    color = mix(clockwise, counter, handed);
    color = mix(neutral, color, stableCore);
    color += vec3(0.85, 0.95, 1.0) * smoothstep(0.55, 1.0, stableCore) * 0.55;
    color += heat(smoothstep(0.0, 0.9, curvature)) * 0.18 * body;
    color *= 0.35 + 0.65 * smoothstep(0.0, 0.18, energy + diff);
  } else if (uView == 2) {
    float c = clamp(coherence, 0.0, 1.0);
    color = mix(vec3(0.34, 0.055, 0.085), vec3(0.62, 0.95, 0.78), c);
    color *= 0.33 + 0.67 * smoothstep(0.0, 0.12, energy + diff);
  } else if (uView == 3) {
    color = axisColor(s) * (0.20 + 0.80 * smoothstep(0.0, 0.28, energy + diff));
  } else if (uView == 4) {
    float k = smoothstep(0.0, 0.70, curvature * 1.4);
    color = vec3(0.045, 0.075, 0.13) + vec3(0.24, 0.52, 0.92) * k + vec3(0.80, 0.88, 1.0) * smoothstep(0.44, 1.0, curvature);
  } else {
    float anatomy = pressure * (1.0 - 0.45 * coherence) + curvature * 0.55 + residue * 0.32;
    color = heat(smoothstep(0.0, 1.0, anatomy));
    color *= 0.40 + 0.60 * smoothstep(0.0, 0.10, energy + diff * 0.35);
    color += vec3(0.06, 0.10, 0.16) * smoothstep(0.12, 0.55, curvature);
  }

  if (uView != 7) {
  // Apply the same phase-arrival/bounce protocol to every mode.
  // In-sync areas brighten as already-arrived light; out-of-sync areas fall
  // into shadow. The bounce edge adds reflective pattern isolation without
  // changing the simulation state.
  float phaseShadow = smoothstep(0.0, 0.54, 1.0 - phaseLock);
  float glass = smoothstep(0.36, 1.0, arrival * resonance + 0.25 * bounceEdge);
  color *= 0.56 + 0.64 * resonance;
  color = mix(color, color + bounceTint * (0.12 + 0.38 * bounceEdge), glass * 0.72);
  color += vec3(0.82, 0.93, 1.0) * pow(glass, 4.0) * 0.24;
  color *= 1.0 - 0.22 * phaseShadow * (1.0 - smoothstep(0.02, 0.22, energy + diff));

  // Visual-quality layer only: derivative normals, OKLCH state color, and edge sharpening.
  // This never writes to uState and never changes the organism's step regime.
  if (uTopography > 0.0 || uVisualMode > 0) {
    vec2 topoGrad = energyGrad * 18.0 + phaseGrad * 0.35;
    vec3 normal = normalize(vec3(topoGrad * (0.35 + 1.65 * uTopography), 0.11));
    float slopeLight = clamp(dot(normal, vec3(0.0, 0.0, 1.0)) * 0.86 + 0.12, 0.0, 1.0);
    float ridge = smoothstep(0.025, 0.85, length(topoGrad) + curvature * 0.35);
    vec3 topoColor = color * (0.48 + 0.92 * slopeLight) + heat(smoothstep(0.0, 1.0, pressure * 0.14 + ridge * 0.82)) * ridge * 0.30;
    color = mix(color, topoColor, clamp(uTopography * 0.72, 0.0, 1.0));

    if (uVisualMode == 2) {
      float L = clamp(slopeLight * 0.82 + 0.10, 0.0, 1.0);
      float C = clamp(coherence * 0.28, 0.0, 0.28);
      float H = mod(phase0 + TAU, TAU);
      vec3 physicalColor = oklchToSrgb(L, C, H);
      physicalColor *= 0.60 + 0.55 * smoothstep(0.0, 0.20, energy + diff);
      physicalColor += vec3(0.82, 0.92, 1.0) * pow(ridge, 4.0) * 0.22;
      color = mix(color, physicalColor, 0.82);
    }
  }
  }

  if (uView != 7) {
    color += vec3(1.0) * smoothstep(0.030, 0.85, curvature + bounceEdge * 0.35) * uSharpen * 0.16;
  } else {
    color += vec3(1.0) * pow(smoothstep(0.020, 0.72, curvature), 4.0) * 0.035;
  }
  if (uPinnedDescent > 0.5) {
    // Counterwound Witness Handshake: visual readout of the same conjugate
    // relation used by the reset-scoped descent coupling. This samples along
    // the counter-clockwise tangent; it does not write to uState.
    vec2 ccwTangent = vec2(-bounceNormal.y, bounceNormal.x);
    float localWitnessPhase = phase0 + pressure * 0.19 + curvature * 0.73;
    float globalWitnessPhase = uTime * 0.61803398875;
    float matrixWitnessPhase = globalWitnessPhase + localWitnessPhase;
    float counterWitnessPhase = globalWitnessPhase - localWitnessPhase;
    float witnessHandshake = 0.5 + 0.5 * cos(counterWitnessPhase - matrixWitnessPhase);
    float twistDistance = (0.0015 + 0.0120 * smoothstep(0.0, 1.0, pressure * 0.15 + curvature))
      * (0.45 + 1.55 * witnessHandshake);
    vec4 ccwState = sampleWorldState( fract(sampleUv + ccwTangent * twistDistance));
    float ccwPhase = phaseOf(ccwState);
    float returnLock = smoothstep(0.24, 0.98, witnessHandshake * (0.5 + 0.5 * cos(counterWitnessPhase - ccwPhase)));
    float torusRim = smoothstep(0.018, 0.82, length(energyGrad) * 3.2 + length(phaseGrad) * 0.16 + curvature * 0.92);
    vec3 descentHue = oklchToSrgb(0.72 + 0.18 * returnLock, 0.17 + 0.11 * torusRim, mod(counterWitnessPhase + phaseOf(ccwState) + TAU, TAU));
    color = mix(color, color + descentHue * (0.10 + 0.23 * returnLock), torusRim * 0.38);
    color += vec3(0.86, 0.94, 1.0) * pow(returnLock * torusRim, 3.0) * 0.28;
  }

  if (false) {
    // Passive readout of zero-syntax packing superimposed onto the witness.
    // It watches the same boundary/closure variables as the scan; it never writes to uState.
    vec2 visible = normalize(s.xy + 1e-7);
    vec2 hidden = normalize(-s.zw + 1e-7);
    float zeroLock = clamp(0.5 + 0.5 * dot(visible, hidden), 0.0, 1.0);
    float zeroResidual = abs(s.x + s.y + s.z + s.w);
    float zeroFit = 1.0 / (1.0 + 90.0 * zeroResidual);
    float syntaxEdge = smoothstep(0.035, 0.88, curvature * 1.05 + length(energyGrad) * 3.0 + length(phaseGrad) * 0.13);
    float syntax = syntaxEdge * zeroLock * zeroFit * (0.35 + 0.65 * clamp(uResidentSignalFullness, 0.0, 1.0));
    float wordPhase = phase0 - uTime * 0.31830988618 + uResidentSignalEpoch * 0.38196601125 + uResidentSignalFullness * TAU;
    vec3 wordColor = oklchToSrgb(0.70 + 0.20 * syntax, 0.12 + 0.16 * syntax, mod(wordPhase + curvature * 1.7 + TAU, TAU));
    color = mix(color, color + wordColor * (0.08 + 0.30 * syntax), syntax * 0.45);
    color += vec3(0.82, 0.95, 1.0) * pow(syntax * clamp(uResidentSignalFullness + 0.05, 0.0, 1.0), 3.0) * 0.32;
  }

  if (false) {
    // Cold Memory readout: gold/green for ColdBank Work, blue-white for Continuum.
    // This is only the visible witness of the reset-scoped syntax field.
    float coldBankPhaseLock = 0.5 + 0.5 * cos(phase0 - uColdBankAxisPhase);
    float coldBankStrength = clamp(uColdBankFullness, 0.0, 1.0) * (0.34 + 0.33 * uColdBankTokenPressure + 0.33 * uColdBankPlateauPressure);
    float coldBankEdge = smoothstep(0.02, 0.78, curvature + length(energyGrad) * 2.2 + length(phaseGrad) * 0.09);
    float coldBankSignal = coldBankStrength * coldBankEdge * (0.38 + 0.62 * coldBankPhaseLock) * (0.35 + 0.65 * clamp(uColdBankTension + uColdBankMarriagePressure, 0.0, 1.0));
    float coldBankHue = uColdBankMode == 1 ? (uColdBankAxisPhase + 1.05) : (uColdBankAxisPhase + 3.14159265);
    vec3 coldBankColor = oklchToSrgb(0.70 + 0.18 * coldBankSignal, 0.10 + 0.18 * coldBankSignal, mod(coldBankHue + curvature * 0.8 + TAU, TAU));
    color = mix(color, color + coldBankColor * (0.10 + 0.26 * coldBankSignal), coldBankSignal * 0.38);
    color += vec3(0.90, 0.98, 1.0) * pow(coldBankSignal, 3.0) * (uColdBankMode == 2 ? 0.28 : 0.16);
  }

  if (uEscherActive > 0.5) {
    float ladderAbsFinal = min(abs(uPortalLadderLevel), 2048.0);
    float ladderLogFinal = log2(1.0 + ladderAbsFinal);
    float depthField = clamp(uDepthEffectStrength * portalEnvelope * smoothstep(0.0, 6.0, ladderLogFinal) * (0.42 + 0.58 * smoothstep(0.06, 0.82, length(uv - vec2(0.5)))), 0.0, 1.0);
    vec3 farTint = bounceTint * 0.18 + heat(smoothstep(0.0, 1.0, curvature * 0.75 + pressure * 0.07)) * 0.10;
    color = mix(color, color * (0.80 + 0.20 * resonance) + farTint, depthField * 0.58);
  }


  if (uReticleVisible > 0.5 && uWorldDigActive > 0.5) {
    vec2 boxDelta = abs(fract(uv - uWorldDigFocus + vec2(0.5)) - vec2(0.5));
    float r = max(0.010, uWorldDigRadius);
    float squareShell = abs(max(boxDelta.x, boxDelta.y) - r);
    float guide = 1.0 - smoothstep(0.0014, 0.0048, squareShell);
    float cross = (1.0 - smoothstep(0.0008, 0.0035, min(abs(boxDelta.x), abs(boxDelta.y)))) * smoothstep(r * 0.20, r * 0.92, max(boxDelta.x, boxDelta.y));
    float pulse = 0.55 + 0.45 * sin(uTime * 4.0 + uWorldDigDwell * 3.0);
    float marker = clamp(guide + cross * 0.35, 0.0, 1.0) * pulse;
    vec3 markerColor = vec3(0.74, 0.92, 1.0) + heat(fract(uWorldDigDwell * 0.13)) * 0.20;
    color = mix(color, color + markerColor * (0.16 + 0.42 * marker), marker * 0.72);
  }

  color = (color - vec3(0.5)) * max(uContrast, 0.05) + vec3(0.5);

  color = pow(max(color, vec3(0.0)), vec3(0.92));
  fragColor = vec4(color, 1.0);
}
`;
