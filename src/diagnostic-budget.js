export const DEFAULT_DIAGNOSTIC_BUDGET = {
  // v0.3.19: RAM allowance expansion over v0.3.18. Cadence stays
  // intentionally turbo, while resident queues/pools can absorb twice as
  // much asynchronous work before the main thread has to wait or drop jobs.
  portalRouteInterval: 0.0375,
  portalCenterCap: 576,
  autonomyPlannerInterval: 0.0225,
  gpuFeedInterval: 0.009,
  gpuFeedCenterCap: 640,
  backflowMinInterval: 0.008,
  residentSyntaxMinInterval: 0.0275,
  maxPendingReadbacks: 16,
  maxInFlightSyntax: 16
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function roundBudget(value) {
  return Math.round(value * 10000) / 10000;
}

export function computeDiagnosticsBudget(runtime = {}) {
  const frameMs = Math.max(0, Number(runtime.frameMs) || 0);
  const portalActive = Boolean(runtime.portalActive);
  const autonomousActive = Boolean(runtime.autonomousActive);
  const residentSignal = Boolean(runtime.residentSignal);
  const residentInFlight = Math.max(0, Math.floor(Number(runtime.residentInFlight) || 0));
  const activeChunkCount = Math.max(0, Math.floor(Number(runtime.activeChunkCount) || 0));

  let pressure = 1;
  if (frameMs > 18.5) pressure += Math.min(0.75, (frameMs - 18.5) / 18);
  if (portalActive) pressure += 0.10;
  if (autonomousActive) pressure += 0.08;
  if (residentSignal) pressure += 0.06;
  pressure += Math.min(0.18, activeChunkCount * 0.025);
  pressure += Math.min(0.12, residentInFlight * 0.03);
  pressure = clamp(pressure, 1, 2.15);

  // Do not panic-throttle at normal autonomous frame times. Only soften the
  // side workers when frames are genuinely long; otherwise keep CPU cores fed
  // and use the expanded resident RAM to hide WebGL readback/transfer latency.
  const intervalScale = clamp(1 + (pressure - 1) * 0.24, 1, 1.30);
  const plannerScale = clamp(1 + (pressure - 1) * 0.18, 1, 1.22);
  const portalScale = clamp(1 + (pressure - 1) * 0.16, 1, 1.20);
  const gpuFeedScale = clamp(1 + (pressure - 1) * 0.20, 1, 1.26);
  const heavyPressure = frameMs >= 34;
  const severePressure = frameMs >= 45;

  return {
    portalRouteInterval: roundBudget(DEFAULT_DIAGNOSTIC_BUDGET.portalRouteInterval * portalScale),
    portalCenterCap: heavyPressure ? 384 : DEFAULT_DIAGNOSTIC_BUDGET.portalCenterCap,
    autonomyPlannerInterval: roundBudget(DEFAULT_DIAGNOSTIC_BUDGET.autonomyPlannerInterval * plannerScale),
    gpuFeedInterval: roundBudget(DEFAULT_DIAGNOSTIC_BUDGET.gpuFeedInterval * gpuFeedScale),
    gpuFeedCenterCap: heavyPressure ? 448 : DEFAULT_DIAGNOSTIC_BUDGET.gpuFeedCenterCap,
    backflowMinInterval: roundBudget(DEFAULT_DIAGNOSTIC_BUDGET.backflowMinInterval * intervalScale),
    residentSyntaxMinInterval: roundBudget(DEFAULT_DIAGNOSTIC_BUDGET.residentSyntaxMinInterval * intervalScale * (residentInFlight > 2 ? 1.04 : 1)),
    maxPendingReadbacks: severePressure ? 8 : DEFAULT_DIAGNOSTIC_BUDGET.maxPendingReadbacks,
    maxInFlightSyntax: severePressure ? 8 : DEFAULT_DIAGNOSTIC_BUDGET.maxInFlightSyntax
  };
}
