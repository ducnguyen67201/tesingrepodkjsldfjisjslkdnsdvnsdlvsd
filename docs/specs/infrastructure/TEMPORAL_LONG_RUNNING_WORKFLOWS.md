# Temporal Long-Running Workflows: Analysis & Best Practices

**Created**: 2025-12-13
**Status**: Technical Analysis
**Related**: `apps/worker/src/workflows/alert.workflow.ts`

---

## Executive Summary

**Issue**: The current `alertEvaluationWorkflow` runs in an infinite `while (!shouldStop)` loop, which will eventually hit Temporal's event history limits and be terminated.

**Solution**: Use `continueAsNew()` to periodically restart the workflow with fresh history while preserving state.

---

## The Problem

### Current Implementation

```typescript
// alert.workflow.ts (CURRENT - PROBLEMATIC)
export async function alertEvaluationWorkflow(input: AlertWorkflowInput): Promise<void> {
  let shouldStop = false;

  // This runs FOREVER
  while (!shouldStop) {
    await condition(() => shouldEvaluate || shouldStop, input.evaluationIntervalMs);

    if (shouldStop) break;

    await evaluateAlertCycle(input);  // Adds ~6-10 events per cycle
  }
}
```

### Why This Is a Problem

Every Temporal workflow maintains an **Event History** - a log of all workflow events:

```
Event 1:  WorkflowExecutionStarted
Event 2:  WorkflowTaskScheduled
Event 3:  WorkflowTaskStarted
Event 4:  WorkflowTaskCompleted
Event 5:  TimerStarted (condition wait)
Event 6:  TimerFired
Event 7:  WorkflowTaskScheduled
Event 8:  WorkflowTaskStarted
Event 9:  ActivityTaskScheduled (evaluateAlert)
Event 10: ActivityTaskStarted
Event 11: ActivityTaskCompleted
... and so on for each activity call
```

### Temporal's Hard Limits

| Limit | Value | Consequence |
|-------|-------|-------------|
| **Warning threshold** | 10,240 events or 10 MB | Performance degradation |
| **Hard limit** | 51,200 events or 50 MB | **Workflow terminated** |

### Impact on Alert Workflow

With an evaluation interval of 10 seconds and ~8 events per cycle:

| Time Running | Events | Status |
|--------------|--------|--------|
| 1 hour | ~2,880 events | OK |
| 6 hours | ~17,280 events | Warning zone |
| **~18 hours** | **~51,200 events** | **TERMINATED** |

**Your current config has `WORKFLOW_EXECUTION: "24h"`** - the workflow will hit the limit before timeout!

---

## The Solution: `continueAsNew`

### What is `continueAsNew`?

`continueAsNew` is a Temporal mechanism that:
1. Closes the current workflow execution **successfully**
2. Immediately starts a new execution with the **same Workflow ID**
3. Passes state from the old execution to the new one
4. **Resets the event history to zero**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CONTINUE-AS-NEW MECHANISM                             │
└─────────────────────────────────────────────────────────────────────────────┘

  Workflow ID: alert-abc123

  Run 1 (Run ID: xyz-1)                Run 2 (Run ID: xyz-2)
  ───────────────────────             ───────────────────────
  Event 1: Started                    Event 1: Started (fresh!)
  Event 2: TaskScheduled              Event 2: TaskScheduled
  ...                                 ...
  Event 5000: Timer                   Event 100: Timer
  Event 5001: Activity                ...
  ...
  Event 10000: ContinueAsNew ─────►   (continues with state)

  History: 10,000 events              History: 100 events
                                      (and growing again)
```

### Fixed Implementation

```typescript
// alert.workflow.ts (FIXED)
import {
  proxyActivities,
  condition,
  defineSignal,
  setHandler,
  log,
  continueAsNew,
  workflowInfo,
} from "@temporalio/workflow";

// State that persists across continueAsNew
interface AlertWorkflowState {
  evaluationCount: number;
  lastEvaluatedAt: number;
}

export async function alertEvaluationWorkflow(
  input: AlertWorkflowInput,
  state: AlertWorkflowState = { evaluationCount: 0, lastEvaluatedAt: 0 }
): Promise<void> {
  let shouldEvaluate = false;
  let shouldStop = false;

  // Register signal handlers
  setHandler(triggerEvaluationSignal, () => {
    shouldEvaluate = true;
  });

  setHandler(stopEvaluationSignal, () => {
    shouldStop = true;
  });

  log.info("Starting/continuing alert evaluation", {
    alertId: input.alertId,
    evaluationCount: state.evaluationCount,
    historyLength: workflowInfo().historyLength,
  });

  while (!shouldStop) {
    // ================================================================
    // CHECK IF WE SHOULD CONTINUE-AS-NEW
    // ================================================================
    if (shouldContinueAsNew()) {
      log.info("Approaching history limit, continuing as new", {
        alertId: input.alertId,
        historyLength: workflowInfo().historyLength,
        evaluationCount: state.evaluationCount,
      });

      // Continue with current state
      return continueAsNew<typeof alertEvaluationWorkflow>(input, {
        evaluationCount: state.evaluationCount,
        lastEvaluatedAt: state.lastEvaluatedAt,
      });
    }

    // Wait for evaluation interval or signal
    await condition(
      () => shouldEvaluate || shouldStop,
      input.evaluationIntervalMs
    );

    if (shouldStop) break;

    shouldEvaluate = false;

    try {
      await evaluateAlertCycle(input);
      state.evaluationCount++;
      state.lastEvaluatedAt = Date.now();
    } catch (error) {
      log.warn("Evaluation cycle failed", { error: String(error) });
    }
  }
}

/**
 * Check if workflow should continue as new.
 * Uses Temporal's built-in suggestion + a safety margin.
 */
function shouldContinueAsNew(): boolean {
  const info = workflowInfo();

  // Use Temporal's built-in suggestion (triggered at ~10K events)
  if (info.continueAsNewSuggested) {
    return true;
  }

  // Additional safety: continue at 8K events
  if (info.historyLength > 8000) {
    return true;
  }

  return false;
}
```

---

## Key Concepts

### 1. State Preservation

You must explicitly pass any state that needs to survive across `continueAsNew`:

```typescript
// BAD - State is lost
let counter = 0;
while (true) {
  counter++;
  if (shouldContinueAsNew()) {
    return continueAsNew(input); // counter = 0 in new execution!
  }
}

// GOOD - State is preserved
interface State { counter: number }

export async function myWorkflow(input: Input, state: State = { counter: 0 }) {
  while (true) {
    state.counter++;
    if (shouldContinueAsNew()) {
      return continueAsNew(input, state); // counter preserved!
    }
  }
}
```

### 2. Signal Handlers Must Be Re-registered

Signal handlers are registered at workflow start. When you `continueAsNew`, the new execution starts fresh, so handlers are automatically re-registered in the new run.

### 3. Pending Activities

**Warning**: Any pending (not-yet-completed) activities will be cancelled when you call `continueAsNew`. Always await activities before continuing:

```typescript
// BAD - Activity may be cancelled
startActivity(doSomething);  // Not awaited
return continueAsNew(input);

// GOOD - Activity completes before continue
await startActivity(doSomething);
return continueAsNew(input);
```

### 4. When to Check

Check `continueAsNewSuggested` at natural checkpoints in your workflow:
- After completing an evaluation cycle
- Before starting a long activity
- At the top of a loop iteration

---

## Alternative Patterns

### Pattern A: Event Count Based (Recommended for Alerts)

```typescript
const MAX_EVALUATIONS_PER_RUN = 1000;

while (!shouldStop) {
  // Continue every N evaluations
  if (state.evaluationsThisRun >= MAX_EVALUATIONS_PER_RUN) {
    return continueAsNew(input, { ...state, evaluationsThisRun: 0 });
  }

  await evaluateAlertCycle(input);
  state.evaluationsThisRun++;
}
```

### Pattern B: Time Based

```typescript
const MAX_RUN_DURATION_MS = 4 * 60 * 60 * 1000; // 4 hours
const startTime = Date.now();

while (!shouldStop) {
  // Continue every 4 hours
  if (Date.now() - startTime > MAX_RUN_DURATION_MS) {
    return continueAsNew(input, state);
  }

  await evaluateAlertCycle(input);
}
```

### Pattern C: Hybrid (History + Time)

```typescript
function shouldContinueAsNew(): boolean {
  const info = workflowInfo();

  // Temporal's suggestion
  if (info.continueAsNewSuggested) return true;

  // History length safety
  if (info.historyLength > 8000) return true;

  // Time-based (every 4 hours)
  if (Date.now() - state.runStartTime > 4 * 60 * 60 * 1000) return true;

  return false;
}
```

---

## Comparison: Current vs Fixed

| Aspect | Current | Fixed |
|--------|---------|-------|
| Max runtime | ~18 hours (then terminates) | Unlimited |
| Event history | Grows unbounded | Resets periodically |
| State preservation | N/A (single run) | Explicit via parameters |
| Performance | Degrades over time | Consistent |
| Reliability | Will fail after limit | Indefinitely stable |

---

## Implementation Checklist

To fix the alert workflow:

- [ ] Add `state` parameter to workflow function
- [ ] Create `shouldContinueAsNew()` helper
- [ ] Add continue check at top of loop
- [ ] Pass state to `continueAsNew()` call
- [ ] Update workflow types in `temporal/types.ts`
- [ ] Test with accelerated history (small `maxHistoryLength`)
- [ ] Monitor in Temporal UI (look for `ContinueAsNewInitiated` events)

---

## Monitoring

### Temporal UI Indicators

In the Temporal UI (http://localhost:8088), a healthy long-running workflow will show:

```
Workflow ID: alert-abc123
Status: Running
Run ID: xyz-456 (current)

History:
├── Run xyz-123: Completed (ContinueAsNewInitiated)
├── Run xyz-234: Completed (ContinueAsNewInitiated)
└── Run xyz-456: Running (current, 2,345 events)
```

### Metrics to Track

1. **History length per run**: Should stay under 10K
2. **Continue-as-new frequency**: Should happen regularly
3. **Run duration**: Each run should be ~few hours max

---

## Conclusion

**Yes, it's OK to have a workflow run forever** - but only if you use `continueAsNew` correctly.

The current implementation will fail after ~18 hours. The fix is straightforward:
1. Track state that needs to persist
2. Check `workflowInfo().continueAsNewSuggested` or history length
3. Call `continueAsNew(input, state)` before hitting limits

This pattern is explicitly recommended by Temporal for:
- Alert monitoring (like yours)
- Subscription billing
- Long-running processes
- Heartbeat/polling workflows

---

## Sources

- [Managing Very Long-Running Workflows | Temporal Blog](https://temporal.io/blog/very-long-running-workflows)
- [Workflow Execution Limits | Temporal Docs](https://docs.temporal.io/workflow-execution/limits)
- [Continue-As-New TypeScript | Temporal Docs](https://docs.temporal.io/develop/typescript/continue-as-new)
- [Events and Event History | Temporal Docs](https://docs.temporal.io/workflow-execution/event)
- [Temporal Workflow Limits | Sivo Blog](https://blog.sivo.it.com/temporal-workflow-limits/what-is-the-limit-of-temporal-workflow/)
