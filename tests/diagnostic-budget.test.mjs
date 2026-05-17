import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_DIAGNOSTIC_BUDGET, computeDiagnosticsBudget } from '../src/diagnostic-budget.js';

test('keeps RAM-expanded diagnostic cadence when frame time is healthy', () => {
  const budget = computeDiagnosticsBudget({
    frameMs: 14.5,
    autonomousActive: false,
    portalActive: false,
    activeChunkCount: 0,
    residentSignal: false,
    residentInFlight: 0
  });

  assert.deepEqual(budget, DEFAULT_DIAGNOSTIC_BUDGET);
});

test('keeps expanded resident queues under normal autonomous load', () => {
  const budget = computeDiagnosticsBudget({
    frameMs: 28,
    autonomousActive: true,
    portalActive: true,
    activeChunkCount: 4,
    residentSignal: true,
    residentInFlight: 2
  });

  assert.ok(budget.backflowMinInterval >= DEFAULT_DIAGNOSTIC_BUDGET.backflowMinInterval, 'readback cadence should not become faster than the base cap');
  assert.ok(budget.backflowMinInterval < DEFAULT_DIAGNOSTIC_BUDGET.backflowMinInterval * 1.30, 'normal autonomous load should only soften expanded readback cadence slightly');
  assert.ok(budget.autonomyPlannerInterval < DEFAULT_DIAGNOSTIC_BUDGET.autonomyPlannerInterval * 1.22, 'planner should stay near turbo cadence');
  assert.equal(budget.portalCenterCap, DEFAULT_DIAGNOSTIC_BUDGET.portalCenterCap, 'route compiler should keep the expanded center budget at normal autonomous frame times');
  assert.equal(budget.gpuFeedCenterCap, DEFAULT_DIAGNOSTIC_BUDGET.gpuFeedCenterCap, 'GPU feed optimizer should keep the expanded center budget at normal autonomous frame times');
  assert.equal(budget.maxPendingReadbacks, DEFAULT_DIAGNOSTIC_BUDGET.maxPendingReadbacks, 'normal autonomous runs can keep the deeper async readback queue');
  assert.equal(budget.maxInFlightSyntax, DEFAULT_DIAGNOSTIC_BUDGET.maxInFlightSyntax, 'normal autonomous runs can keep resident syntax jobs stacked');
});

test('softens expanded queues under severe long frames without dropping to single-lane mode', () => {
  const budget = computeDiagnosticsBudget({
    frameMs: 48,
    autonomousActive: true,
    portalActive: true,
    activeChunkCount: 12,
    residentSignal: true,
    residentInFlight: 8
  });

  assert.ok(budget.portalCenterCap < DEFAULT_DIAGNOSTIC_BUDGET.portalCenterCap, 'severe pressure can reduce route center budget');
  assert.ok(budget.gpuFeedCenterCap < DEFAULT_DIAGNOSTIC_BUDGET.gpuFeedCenterCap, 'severe pressure can reduce feed center budget');
  assert.equal(budget.maxPendingReadbacks, 8, 'severe pressure still permits half of the expanded async queue');
  assert.equal(budget.maxInFlightSyntax, 8, 'severe pressure still keeps half of the expanded syntax residency active');
});
