# Engineering Spec: Alert Workflow with ContinueAsNew

**Issue**: Fix Long-Running Alert Workflow
**Priority**: P0 (Critical - Current implementation will fail)
**Status**: Draft
**Author**: Engineering Team
**Created**: 2025-12-13

---

## Overview

Fix the `alertEvaluationWorkflow` to use Temporal's `continueAsNew` mechanism, preventing workflow termination due to event history limits. The current implementation will fail after ~18 hours of continuous operation.

## Problem Statement

The current alert workflow runs in an infinite loop without resetting its event history:

```typescript
// CURRENT - BROKEN
while (!shouldStop) {
  await condition(...);           // ~2 events
  await evaluateAlertCycle(...);  // ~6 events
}
// Each iteration: ~8 events
// 10 second interval: ~8 events/10s = ~2,880 events/hour
// Temporal limit: 51,200 events
// Time to failure: ~18 hours
```

**Impact**: All alert monitoring will stop after ~18 hours, with no notifications sent.

## Goals

1. Implement `continueAsNew` to reset event history periodically
2. Preserve workflow state across restarts
3. Maintain all existing functionality (signals, evaluation, notifications)
4. Zero downtime during continue-as-new transitions
5. Add monitoring for workflow health

## Non-Goals

- Change alert evaluation logic
- Modify notification dispatching
- Change evaluation intervals

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ALERT WORKFLOW WITH CONTINUE-AS-NEW                       │
└─────────────────────────────────────────────────────────────────────────────┘

  Workflow ID: alert-{alertId}

  ┌─────────────────────────────────────────────────────────────────────────┐
  │                         Run 1 (Run ID: abc-123)                          │
  │                                                                         │
  │   Events 1-8000                                                         │
  │   ├── WorkflowExecutionStarted                                          │
  │   ├── Timer cycles (evaluate every 10s)                                 │
  │   ├── Activity: evaluateAlert                                           │
  │   ├── Activity: transitionAlertState                                    │
  │   ├── Activity: dispatchNotification (if needed)                        │
  │   └── ...                                                               │
  │                                                                         │
  │   At ~8000 events: ContinueAsNewInitiated ──────────────────────────┐   │
  │                                                                     │   │
  └─────────────────────────────────────────────────────────────────────│───┘
                                                                        │
                                                                        ▼
  ┌─────────────────────────────────────────────────────────────────────────┐
  │                         Run 2 (Run ID: abc-456)                          │
  │                                                                         │
  │   Events 1-8000 (FRESH HISTORY)                                         │
  │   ├── WorkflowExecutionStarted (with preserved state)                   │
  │   ├── State: { evaluationCount: 1000, lastState: "FIRING" }             │
  │   ├── Timer cycles continue...                                          │
  │   └── ...                                                               │
  │                                                                         │
  │   At ~8000 events: ContinueAsNewInitiated ──────────────────────────┐   │
  │                                                                     │   │
  └─────────────────────────────────────────────────────────────────────│───┘
                                                                        │
                                                                        ▼
                                      ... continues indefinitely ...
```

---

## Implementation Steps

### Step 1: Define Workflow State Type

**File**: `apps/worker/src/temporal/types.ts`

Add state type for preserving across `continueAsNew`:

```typescript
// ============================================
// Alert Workflow Types (Updated)
// ============================================

/**
 * Alert evaluation workflow input
 */
export interface AlertWorkflowInput {
  alertId: string;
  projectId: string;
  alertName: string;
  severity: string;
  evaluationIntervalMs: number;
}

/**
 * State preserved across continueAsNew restarts.
 * This state survives workflow restarts and maintains continuity.
 */
export interface AlertWorkflowState {
  /** Total evaluations across all runs */
  totalEvaluations: number;
  /** Evaluations in current run (reset on continueAsNew) */
  evaluationsThisRun: number;
  /** Timestamp of last evaluation */
  lastEvaluatedAt: number;
  /** Timestamp when this run started */
  runStartedAt: number;
  /** Number of times workflow has continued as new */
  continueAsNewCount: number;
}

/**
 * Default initial state for new workflows
 */
export const DEFAULT_ALERT_WORKFLOW_STATE: AlertWorkflowState = {
  totalEvaluations: 0,
  evaluationsThisRun: 0,
  lastEvaluatedAt: 0,
  runStartedAt: Date.now(),
  continueAsNewCount: 0,
};
```

---

### Step 2: Update Workflow Constants

**File**: `packages/shared/src/constants.ts`

Add continueAsNew thresholds:

```typescript
export const WORKFLOW_TIMEOUTS = {
  TRACE: {
    WORKFLOW_EXECUTION: "5m",
    ACTIVITY: "30s",
  },
  SCORE: {
    WORKFLOW_EXECUTION: "2m",
    ACTIVITY: "30s",
  },
  ALERT: {
    WORKFLOW_EXECUTION: "24h",
    ACTIVITY: "10s",
    EVALUATION_INTERVAL_MS: 10_000, // 10 seconds
    // NEW: ContinueAsNew thresholds
    CONTINUE_AS_NEW_HISTORY_THRESHOLD: 8_000,    // Continue at 8K events
    CONTINUE_AS_NEW_TIME_THRESHOLD_MS: 4 * 60 * 60 * 1000, // Or every 4 hours
    MAX_EVALUATIONS_PER_RUN: 1_000, // Or every 1000 evaluations
  },
} as const;
```

---

### Step 3: Rewrite Alert Workflow

**File**: `apps/worker/src/workflows/alert.workflow.ts`

```typescript
// ============================================================
// ALERT EVALUATION WORKFLOW - Long-running with ContinueAsNew
// ============================================================
// This workflow runs continuously, evaluating alerts periodically.
// Uses continueAsNew to prevent event history from exceeding limits.
//
// Key features:
// - Signals for external control (trigger, stop)
// - State preserved across continueAsNew restarts
// - Automatic history reset before hitting limits
// ============================================================

import {
  proxyActivities,
  condition,
  defineSignal,
  setHandler,
  log,
  continueAsNew,
  workflowInfo,
} from "@temporalio/workflow";
import type * as activities from "../temporal/activities";
import type { AlertWorkflowInput, AlertWorkflowState } from "../temporal/types";
import { ACTIVITY_RETRY, WORKFLOW_TIMEOUTS } from "@ducsigr/shared";

// ============================================================
// Activity Proxies
// ============================================================

const { evaluateAlert, transitionAlertState, dispatchNotification } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: WORKFLOW_TIMEOUTS.ALERT.ACTIVITY,
    retry: ACTIVITY_RETRY.ALERT,
  });

// ============================================================
// Signals
// ============================================================

/**
 * Signal to trigger immediate evaluation (skip waiting for interval)
 */
export const triggerEvaluationSignal = defineSignal("triggerEvaluation");

/**
 * Signal to stop the workflow gracefully
 */
export const stopEvaluationSignal = defineSignal("stopEvaluation");

// ============================================================
// Constants
// ============================================================

const {
  CONTINUE_AS_NEW_HISTORY_THRESHOLD,
  CONTINUE_AS_NEW_TIME_THRESHOLD_MS,
  MAX_EVALUATIONS_PER_RUN,
} = WORKFLOW_TIMEOUTS.ALERT;

// ============================================================
// Helper: Check if should continue as new
// ============================================================

/**
 * Determine if workflow should continue as new to reset history.
 * Uses multiple criteria for safety.
 */
function shouldContinueAsNew(state: AlertWorkflowState): {
  should: boolean;
  reason: string;
} {
  const info = workflowInfo();

  // 1. Temporal's built-in suggestion (most reliable)
  if (info.continueAsNewSuggested) {
    return { should: true, reason: "Temporal suggested" };
  }

  // 2. History length threshold
  if (info.historyLength >= CONTINUE_AS_NEW_HISTORY_THRESHOLD) {
    return { should: true, reason: `History length ${info.historyLength}` };
  }

  // 3. Time-based threshold (backup)
  const runDuration = Date.now() - state.runStartedAt;
  if (runDuration >= CONTINUE_AS_NEW_TIME_THRESHOLD_MS) {
    return { should: true, reason: `Run duration ${Math.floor(runDuration / 60000)}min` };
  }

  // 4. Evaluation count threshold (backup)
  if (state.evaluationsThisRun >= MAX_EVALUATIONS_PER_RUN) {
    return { should: true, reason: `Evaluations ${state.evaluationsThisRun}` };
  }

  return { should: false, reason: "" };
}

// ============================================================
// Main Workflow
// ============================================================

/**
 * Alert evaluation workflow.
 *
 * This is a long-running workflow that:
 * 1. Evaluates alert conditions periodically
 * 2. Transitions alert state based on results
 * 3. Dispatches notifications when needed
 * 4. Uses continueAsNew to prevent history overflow
 *
 * The workflow runs until stopped via signal or if the alert is disabled/deleted.
 *
 * @param input - Alert configuration
 * @param state - Preserved state (optional, defaults to initial state)
 */
export async function alertEvaluationWorkflow(
  input: AlertWorkflowInput,
  state: AlertWorkflowState = createInitialState()
): Promise<void> {
  // ================================================================
  // Signal Handling State
  // ================================================================
  let shouldEvaluate = false;
  let shouldStop = false;

  // ================================================================
  // Register Signal Handlers
  // ================================================================
  setHandler(triggerEvaluationSignal, () => {
    log.info("Received trigger evaluation signal", { alertId: input.alertId });
    shouldEvaluate = true;
  });

  setHandler(stopEvaluationSignal, () => {
    log.info("Received stop signal", { alertId: input.alertId });
    shouldStop = true;
  });

  // ================================================================
  // Startup Logging
  // ================================================================
  const info = workflowInfo();
  log.info("Alert evaluation workflow started/continued", {
    alertId: input.alertId,
    alertName: input.alertName,
    severity: input.severity,
    intervalMs: input.evaluationIntervalMs,
    runId: info.runId,
    historyLength: info.historyLength,
    continueAsNewCount: state.continueAsNewCount,
    totalEvaluations: state.totalEvaluations,
  });

  // ================================================================
  // Main Evaluation Loop
  // ================================================================
  while (!shouldStop) {
    // ============================================================
    // CHECK: Should we continue as new?
    // ============================================================
    const continueCheck = shouldContinueAsNew(state);
    if (continueCheck.should) {
      log.info("Continuing as new to reset history", {
        alertId: input.alertId,
        reason: continueCheck.reason,
        historyLength: workflowInfo().historyLength,
        totalEvaluations: state.totalEvaluations,
        continueAsNewCount: state.continueAsNewCount,
      });

      // Prepare state for next run
      const nextState: AlertWorkflowState = {
        totalEvaluations: state.totalEvaluations,
        evaluationsThisRun: 0, // Reset per-run counter
        lastEvaluatedAt: state.lastEvaluatedAt,
        runStartedAt: Date.now(), // New run start time
        continueAsNewCount: state.continueAsNewCount + 1,
      };

      // Continue as new with preserved state
      return continueAsNew<typeof alertEvaluationWorkflow>(input, nextState);
    }

    // ============================================================
    // WAIT: For interval or signal
    // ============================================================
    await condition(
      () => shouldEvaluate || shouldStop,
      input.evaluationIntervalMs
    );

    // Check if we should stop
    if (shouldStop) {
      log.info("Stopping alert evaluation", {
        alertId: input.alertId,
        totalEvaluations: state.totalEvaluations,
      });
      break;
    }

    // Reset manual trigger flag
    shouldEvaluate = false;

    // ============================================================
    // EVALUATE: Run evaluation cycle
    // ============================================================
    try {
      await evaluateAlertCycle(input);

      // Update state
      state.totalEvaluations++;
      state.evaluationsThisRun++;
      state.lastEvaluatedAt = Date.now();
    } catch (error) {
      // Log but don't stop - continue evaluating
      log.warn("Alert evaluation cycle failed", {
        alertId: input.alertId,
        error: String(error),
        totalEvaluations: state.totalEvaluations,
      });
    }
  }

  log.info("Alert evaluation workflow completed", {
    alertId: input.alertId,
    totalEvaluations: state.totalEvaluations,
    continueAsNewCount: state.continueAsNewCount,
  });
}

// ============================================================
// Helper: Create Initial State
// ============================================================

function createInitialState(): AlertWorkflowState {
  return {
    totalEvaluations: 0,
    evaluationsThisRun: 0,
    lastEvaluatedAt: 0,
    runStartedAt: Date.now(),
    continueAsNewCount: 0,
  };
}

// ============================================================
// Helper: Single Evaluation Cycle
// ============================================================

/**
 * Single evaluation cycle: evaluate → transition → notify if needed
 */
async function evaluateAlertCycle(input: AlertWorkflowInput): Promise<void> {
  log.info("Running evaluation cycle", { alertId: input.alertId });

  // Step 1: Evaluate alert condition
  const result = await evaluateAlert(input.alertId);

  log.info("Evaluation result", {
    alertId: input.alertId,
    conditionMet: result.conditionMet,
    currentValue: result.currentValue,
    threshold: result.threshold,
    sampleCount: result.sampleCount,
  });

  // Skip if no samples
  if (result.sampleCount === 0) {
    log.info("No samples in window, skipping transition", {
      alertId: input.alertId,
    });
    return;
  }

  // Step 2: Transition state
  const transition = await transitionAlertState(input.alertId, result.conditionMet);

  log.info("State transition", {
    alertId: input.alertId,
    previousState: transition.previousState,
    newState: transition.newState,
    shouldNotify: transition.shouldNotify,
  });

  // Step 3: Dispatch notification if needed
  if (transition.shouldNotify) {
    const notified = await dispatchNotification(
      input.alertId,
      transition.newState,
      result.currentValue,
      result.threshold
    );

    log.info("Notification dispatched", {
      alertId: input.alertId,
      success: notified,
      state: transition.newState,
    });
  }
}
```

---

### Step 4: Update Workflow Starter

**File**: `apps/worker/src/startup/alert-workflows.ts`

No changes needed - the starter already passes `AlertWorkflowInput`. The optional `state` parameter will default to initial state for new workflows.

---

### Step 5: Export Updated Types

**File**: `apps/worker/src/temporal/types.ts`

Ensure the new types are exported:

```typescript
// Add to exports
export type {
  AlertWorkflowInput,
  AlertWorkflowState,
};

export { DEFAULT_ALERT_WORKFLOW_STATE };
```

---

## Testing Plan

### Unit Tests

**File**: `apps/worker/src/workflows/__tests__/alert.workflow.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import { alertEvaluationWorkflow, stopEvaluationSignal } from "../alert.workflow";
import type { AlertWorkflowInput, AlertWorkflowState } from "../../temporal/types";

describe("alertEvaluationWorkflow", () => {
  let testEnv: TestWorkflowEnvironment;

  beforeAll(async () => {
    testEnv = await TestWorkflowEnvironment.createLocal();
  });

  afterAll(async () => {
    await testEnv?.teardown();
  });

  it("should preserve state across continueAsNew", async () => {
    const { client, nativeConnection } = testEnv;

    const worker = await Worker.create({
      connection: nativeConnection,
      taskQueue: "test",
      workflowsPath: require.resolve("../alert.workflow"),
      activities: {
        evaluateAlert: async () => ({
          alertId: "test",
          conditionMet: false,
          currentValue: 0,
          threshold: 10,
          sampleCount: 5,
        }),
        transitionAlertState: async () => ({
          alertId: "test",
          previousState: "INACTIVE",
          newState: "INACTIVE",
          shouldNotify: false,
        }),
        dispatchNotification: async () => true,
      },
    });

    const input: AlertWorkflowInput = {
      alertId: "test-alert",
      projectId: "test-project",
      alertName: "Test Alert",
      severity: "MEDIUM",
      evaluationIntervalMs: 100, // Fast for testing
    };

    // Start with state that triggers immediate continueAsNew
    const state: AlertWorkflowState = {
      totalEvaluations: 999,
      evaluationsThisRun: 999, // Will trigger continueAsNew at 1000
      lastEvaluatedAt: Date.now(),
      runStartedAt: Date.now(),
      continueAsNewCount: 5,
    };

    await worker.runUntil(async () => {
      const handle = await client.workflow.start(alertEvaluationWorkflow, {
        taskQueue: "test",
        workflowId: "test-alert-workflow",
        args: [input, state],
      });

      // Wait for one evaluation cycle
      await new Promise((r) => setTimeout(r, 200));

      // Send stop signal
      await handle.signal(stopEvaluationSignal);

      // Workflow should have continued as new
      const description = await handle.describe();
      expect(description.status.name).toBe("COMPLETED");
    });
  });

  it("should continue running after continueAsNew", async () => {
    // Test that workflow continues functioning after restart
    // ...
  });
});
```

### Integration Test

```bash
# Start Temporal and worker
docker-compose up -d
pnpm dev

# In another terminal, create a test alert and monitor in Temporal UI
# http://localhost:8088

# Observe:
# 1. Workflow starts with Run ID xyz-1
# 2. After ~1000 evaluations, ContinueAsNewInitiated event
# 3. New Run ID xyz-2 starts with preserved state
# 4. continueAsNewCount increments
# 5. totalEvaluations preserved across runs
```

### Performance Test

```typescript
// scripts/test-alert-workflow-longevity.ts
import { Client } from "@temporalio/client";

async function main() {
  const client = new Client();

  // Start a test workflow
  const handle = await client.workflow.start("alertEvaluationWorkflow", {
    taskQueue: "ducsigr-tasks",
    workflowId: "longevity-test-alert",
    args: [{
      alertId: "test-longevity",
      projectId: "test",
      alertName: "Longevity Test",
      severity: "LOW",
      evaluationIntervalMs: 1000, // 1 second for fast testing
    }],
  });

  console.log("Started workflow:", handle.workflowId);
  console.log("Monitoring for 30 minutes...\n");

  // Monitor for 30 minutes
  const startTime = Date.now();
  const checkInterval = 60_000; // Check every minute

  while (Date.now() - startTime < 30 * 60_000) {
    const description = await handle.describe();
    console.log({
      status: description.status.name,
      runId: description.runId,
      historyLength: description.historyLength,
      elapsedMinutes: Math.floor((Date.now() - startTime) / 60_000),
    });

    await new Promise(r => setTimeout(r, checkInterval));
  }

  // Stop the test
  await handle.signal("stopEvaluation");
  console.log("\nTest completed successfully!");
}

main().catch(console.error);
```

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/worker/src/temporal/types.ts` | Modify | Add `AlertWorkflowState` type |
| `packages/shared/src/constants.ts` | Modify | Add continueAsNew thresholds |
| `apps/worker/src/workflows/alert.workflow.ts` | **Rewrite** | Implement continueAsNew |
| `apps/worker/src/workflows/__tests__/alert.workflow.test.ts` | Create | Unit tests |

---

## Monitoring

### Temporal UI Indicators

After implementation, monitor in Temporal UI (http://localhost:8088):

```
Workflow: alert-{alertId}
Status: Running

Event History:
├── WorkflowExecutionStarted
├── ...
├── WorkflowExecutionContinuedAsNew  ← Look for these events
└── (history resets)

Workflow Properties:
├── continueAsNewCount: 5
├── totalEvaluations: 5000
└── runStartedAt: 2025-12-13T10:00:00Z
```

### Key Metrics

| Metric | Expected | Alert If |
|--------|----------|----------|
| History length | < 8,000 | > 10,000 |
| ContinueAsNew frequency | Every ~4 hours | Never happens |
| Run duration | ~4 hours | > 6 hours |

### Logging

The workflow logs key events:

```
[INFO] Alert evaluation workflow started/continued
  alertId=abc123
  runId=xyz-456
  historyLength=1
  continueAsNewCount=3
  totalEvaluations=3000

[INFO] Continuing as new to reset history
  alertId=abc123
  reason=Evaluations 1000
  historyLength=7856
  continueAsNewCount=3

[INFO] Alert evaluation workflow started/continued
  alertId=abc123
  runId=xyz-789
  historyLength=1
  continueAsNewCount=4
  totalEvaluations=4000
```

---

## Rollback Plan

If issues are found:

1. **Revert to old workflow**: The old workflow will still work for ~18 hours
2. **Monitor alert delivery**: Check that notifications are still sent
3. **Check Temporal UI**: Look for workflow failures

---

## Acceptance Criteria

- [ ] Workflow uses `continueAsNew` before hitting 10K events
- [ ] State preserved across restarts (totalEvaluations, lastEvaluatedAt)
- [ ] Signals (trigger, stop) work correctly after continueAsNew
- [ ] Notifications continue to be sent correctly
- [ ] Workflow runs indefinitely without termination
- [ ] Monitoring shows regular continueAsNew events
- [ ] Unit tests pass
- [ ] Integration test runs for 30+ minutes without issues
- [ ] No regression in alert evaluation accuracy

---

## Timeline

| Phase | Tasks | Duration |
|-------|-------|----------|
| Implementation | Update types, rewrite workflow | 2-3 hours |
| Testing | Unit tests, integration tests | 2-3 hours |
| Deployment | Deploy to staging, monitor | 1 day |
| Verification | Run 24+ hours in staging | 1 day |
| Production | Deploy, monitor | 1 day |

---

## References

- [Temporal: Continue-As-New](https://docs.temporal.io/develop/typescript/continue-as-new)
- [Temporal: Workflow Execution Limits](https://docs.temporal.io/workflow-execution/limits)
- [Temporal Blog: Very Long-Running Workflows](https://temporal.io/blog/very-long-running-workflows)
