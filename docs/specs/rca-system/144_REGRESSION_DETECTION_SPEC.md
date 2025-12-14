# Engineering Spec: Regression Detection (#144)

**Ticket:** #144 [RCA Sprint 5] Regression detection
**Epic:** #127 Automated RCA System
**Sprint:** 5 - Eval Pipeline (Optional)
**Points:** 3
**Priority:** P2
**Author:** Senior Architect
**Status:** Implementation Review

---

## Executive Summary

This ticket implements regression detection for the eval pipeline. When eval metrics (latency, error rate) regress compared to baseline, the system creates alerts and notifies workspace channels.

**Key Finding:** ~90% of the implementation already exists in the codebase. This ticket primarily involves:
1. Verification and testing of existing implementation
2. Minor enhancements to notification templates
3. Integration testing with PR merge webhook flow

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      REGRESSION DETECTION FLOW                               │
└─────────────────────────────────────────────────────────────────────────────┘

   PR Merged (webhook)
         │
         ▼
   ┌─────────────────┐
   │ evalPipeline    │
   │   Workflow      │
   └────────┬────────┘
            │
            ▼
   ┌─────────────────┐     ┌─────────────────┐
   │ runEvalPrompts  │────▶│ calculateMetrics│
   │   (activity)    │     │   (activity)    │
   └─────────────────┘     └────────┬────────┘
                                    │
                                    ▼
                          ┌─────────────────┐
                          │ detectRegression│  ◀── Compare to baseline
                          │   (activity)    │
                          └────────┬────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    │                             │
                    ▼                             ▼
           isRegression: false            isRegression: true
                    │                             │
                    ▼                             ▼
           ┌─────────────┐              ┌─────────────────────┐
           │ storeResults│              │ dispatchRegression  │
           │  (tRPC)     │              │     Alert (tRPC)    │
           └─────────────┘              └──────────┬──────────┘
                                                   │
                                        ┌──────────┴──────────┐
                                        ▼                     ▼
                                  ┌──────────┐          ┌──────────┐
                                  │ Discord  │          │  Slack   │
                                  └──────────┘          └──────────┘
```

---

## Existing Implementation Status

### ✅ Database Schema (Complete)

**File:** `packages/db/prisma/schema.prisma`

| Model | Status | Description |
|-------|--------|-------------|
| `EvalSuite` | ✅ Done | Stores eval configuration, baseline metrics, thresholds |
| `EvalRun` | ✅ Done | Stores run results, regression details |
| `EvalRunStatus` | ✅ Done | PENDING, RUNNING, PASSED, FAILED, REGRESSION_DETECTED |

**Key Fields:**
```prisma
// EvalSuite - Regression thresholds (configurable per metric)
latencyRegressionThreshold Float @default(1.2)  // 20% increase = regression
errorRegressionThreshold   Float @default(2.0)  // 2x errors = regression
baselineLatencyP95         Float?
baselineErrorRate          Float?

// EvalRun - Regression tracking
isRegression       Boolean?
regressionDetails  Json?  // Array of RegressionDetail
```

---

### ✅ Activities (Complete)

**File:** `apps/worker/src/temporal/activities/eval.activities.ts`

| Activity | Type | Status | Description |
|----------|------|--------|-------------|
| `getEvalSuite` | READ | ✅ Done | Fetch suite config with project |
| `createEvalRun` | MUTATION | ✅ Done | Create run via tRPC internal |
| `runEvalPrompts` | HTTP | ✅ Done | Execute prompts against endpoint |
| `calculateMetrics` | PURE | ✅ Done | Calculate P95 latency, error rate |
| `detectRegression` | PURE | ✅ Done | Compare metrics to baseline |
| `storeResults` | MUTATION | ✅ Done | Store results via tRPC internal |
| `triggerAlert` | MUTATION | ✅ Done | Dispatch alert via tRPC internal |

**Regression Detection Algorithm:**
```typescript
// Latency regression
if (metrics.latencyP95 / baseline.latencyP95 > thresholds.latencyMultiplier) {
  // Regression detected
}

// Error rate regression
if (metrics.errorRate / baseline.errorRate > thresholds.errorMultiplier) {
  // Regression detected
}
```

---

### ✅ Internal Procedures (Complete)

**File:** `packages/api/src/routers/internal.ts`

| Procedure | Status | Description |
|-----------|--------|-------------|
| `createEvalRun` | ✅ Done | Create EvalRun record |
| `updateEvalRun` | ✅ Done | Update run with results, regression info |
| `dispatchRegressionAlert` | ✅ Done | Send alerts to workspace channels |

**Alert Dispatch Flow:**
```typescript
dispatchRegressionAlert:
  1. Get EvalSuite with project → workspace → notificationChannels
  2. Build AlertPayload with regressionInfo
  3. Send to each enabled channel via AdapterRegistry
  4. Return sentCount, failedCount
```

---

### ✅ Notification Adapters (Complete)

**File:** `packages/api/src/lib/alerting/adapters/discord.ts`

| Feature | Status | Description |
|---------|--------|-------------|
| `buildRegressionFields` | ✅ Done | Build Discord embed fields for regression |
| PR reference display | ✅ Done | Shows `triggerRef` (e.g., "After: PR #123") |
| Metric details | ✅ Done | Shows each regressed metric with values |

**Discord Embed Example:**
```
🚨 Performance Regression Detected

⚠️ Regression After: PR #123
   Performance regression detected in eval suite

📉 P95 Latency
   Increased by 35.2% (150ms → 203ms)

📉 Error Rate
   Increased from 1.0% to 5.5%

📊 View Details: [link to eval run]
```

---

### ✅ Schema Types (Complete)

**File:** `packages/api/src/schemas/alerting.ts`

| Type | Status | Description |
|------|--------|-------------|
| `RegressionInfoSchema` | ✅ Done | Alert payload extension |
| `RegressionDetail` | ✅ Done | Individual metric regression |
| `AlertPayload.regressionInfo` | ✅ Done | Optional field in payload |
| `REGRESSION_METRIC_LABELS` | ✅ Done | Display labels |
| `formatRegressionValue` | ✅ Done | Value formatting |

---

## Remaining Work

### 1. Verification & Testing (Primary)

| Task | Priority | Effort |
|------|----------|--------|
| E2E test: PR merge → regression alert | P1 | 2h |
| Unit tests for `detectRegression` | P1 | 1h |
| Integration test: Discord notification | P2 | 1h |
| Verify Slack adapter has regression support | P2 | 30m |

**Test Scenarios:**
```typescript
describe("detectRegression", () => {
  it("detects latency regression when P95 exceeds threshold");
  it("detects error rate regression when errors double");
  it("handles zero baseline error rate");
  it("returns empty details when no regression");
});
```

### 2. Slack Adapter Enhancement (If needed)

**Check if Slack adapter has regression support:**
```bash
grep -n "regressionInfo\|buildRegressionFields" packages/api/src/lib/alerting/adapters/slack.ts
```

If missing, add similar to Discord:
```typescript
// packages/api/src/lib/alerting/adapters/slack.ts
private buildRegressionBlocks(regressionInfo: RegressionInfo): SlackBlock[] {
  // Build Slack blocks for regression details
}
```

### 3. Optional Enhancements

| Enhancement | Priority | Effort | Description |
|-------------|----------|--------|-------------|
| Pass rate regression | P3 | 1h | Add pass_rate check to `detectRegression` |
| Historical trend | P3 | 2h | Show last N runs comparison |
| Auto-update baseline | P3 | 2h | Option to auto-update baseline after stable runs |

---

## Integration Points

### 1. PR Merge Webhook → Eval Workflow

**File:** `apps/web/src/app/api/webhooks/github/route.ts`

The webhook handler should trigger eval workflow on PR merge:
```typescript
if (event === "pull_request" && payload.action === "closed" && payload.pull_request.merged) {
  // Start eval workflow with triggerRef = "PR #123"
}
```

**Verification needed:** Confirm this integration exists and passes `triggerRef`.

### 2. Eval Workflow → Activities

**File:** `apps/worker/src/workflows/eval.workflow.ts`

Workflow orchestrates activities in order:
1. `getEvalSuite` → Get config
2. `createEvalRun` → Create run record
3. `runEvalPrompts` → Execute prompts
4. `calculateMetrics` → Compute metrics
5. `detectRegression` → Compare to baseline
6. `storeResults` → Store results
7. `triggerAlert` → If regression, send alerts

### 3. Alert Payload Structure

**Type:** `AlertPayload` with `regressionInfo`

```typescript
const payload: AlertPayload = {
  alertId: `regression-${evalRunId}`,
  alertName: "Performance Regression Detected",
  projectId,
  projectName,
  type: "ERROR_RATE", // Generic type for regression
  threshold: 0,
  actualValue: 0,
  operator: "GREATER_THAN",
  triggeredAt: new Date().toISOString(),
  dashboardUrl: `/projects/${projectId}/evals/${evalRunId}`,
  regressionInfo: {
    triggerRef: "PR #123",
    details: [
      {
        metric: "latency_p95",
        baseline: 150,
        current: 203,
        threshold: 1.2,
        changePercent: 35.3,
        message: "P95 latency increased by 35.3%",
      },
    ],
  },
};
```

---

## Acceptance Criteria Checklist

| Criteria | Status | Implementation |
|----------|--------|----------------|
| Compares metrics against baseline | ✅ Done | `detectRegression` activity |
| Configurable thresholds per metric | ✅ Done | `EvalSuite.latencyRegressionThreshold`, `errorRegressionThreshold` |
| Creates alert when regression detected | ✅ Done | `dispatchRegressionAlert` internal procedure |
| Includes PR information in alert | ✅ Done | `regressionInfo.triggerRef` in payload |
| Stores regression details for review | ✅ Done | `EvalRun.regressionDetails` JSON field |

---

## File Inventory

### Files Already Complete

| File | Status |
|------|--------|
| `packages/db/prisma/schema.prisma` | ✅ EvalSuite, EvalRun models |
| `apps/worker/src/temporal/activities/eval.activities.ts` | ✅ All activities |
| `packages/api/src/routers/internal.ts` | ✅ createEvalRun, updateEvalRun, dispatchRegressionAlert |
| `packages/api/src/schemas/alerting.ts` | ✅ RegressionInfo types |
| `packages/api/src/lib/alerting/adapters/discord.ts` | ✅ Regression support |

### Files to Verify/Test

| File | Action |
|------|--------|
| `apps/web/src/app/api/webhooks/github/route.ts` | Verify PR merge triggers eval |
| `apps/worker/src/workflows/eval.workflow.ts` | Verify workflow exists |
| `packages/api/src/lib/alerting/adapters/slack.ts` | Check regression support |

---

## Testing Strategy

### Unit Tests

```typescript
// apps/worker/src/temporal/activities/__tests__/eval.activities.test.ts

describe("detectRegression", () => {
  const baseInput = {
    metrics: { totalPrompts: 10, passedPrompts: 9, failedPrompts: 1, latencyP95: 200, errorRate: 10 },
    baseline: { latencyP95: 150, errorRate: 5 },
    thresholds: { latencyMultiplier: 1.2, errorMultiplier: 2.0 },
  };

  it("detects latency regression", () => {
    const result = detectRegression(baseInput);
    expect(result.isRegression).toBe(true);
    expect(result.details).toContainEqual(expect.objectContaining({ metric: "latency_p95" }));
  });

  it("detects error rate regression", () => {
    const result = detectRegression(baseInput);
    expect(result.isRegression).toBe(true);
    expect(result.details).toContainEqual(expect.objectContaining({ metric: "error_rate" }));
  });

  it("returns no regression when within thresholds", () => {
    const input = {
      ...baseInput,
      metrics: { ...baseInput.metrics, latencyP95: 160, errorRate: 6 },
    };
    const result = detectRegression(input);
    expect(result.isRegression).toBe(false);
    expect(result.details).toHaveLength(0);
  });
});
```

### Integration Tests

```typescript
// packages/api/src/routers/__tests__/internal.test.ts

describe("dispatchRegressionAlert", () => {
  it("sends to all workspace channels", async () => {
    // Setup: Create project, workspace, notification channel
    // Act: Call dispatchRegressionAlert
    // Assert: Channels received correct payload with regressionInfo
  });
});
```

### E2E Test

```typescript
// Manual or automated test flow
1. Create EvalSuite with baseline metrics
2. Trigger PR merge webhook
3. Verify eval workflow starts
4. Mock endpoint to return regressed metrics
5. Verify regression alert sent to Discord/Slack
6. Verify EvalRun.isRegression = true
7. Verify EvalRun.regressionDetails populated
```

---

## Implementation Steps

Since most implementation exists, focus on:

### Step 1: Verify Integration (1h)
- [ ] Confirm PR merge webhook triggers eval workflow
- [ ] Confirm eval workflow calls all activities in order
- [ ] Confirm `triggerRef` is passed through the flow

### Step 2: Check Slack Adapter (30m)
- [ ] Verify Slack adapter has regression support
- [ ] If missing, add `buildRegressionBlocks` method

### Step 3: Write Tests (2h)
- [ ] Unit tests for `detectRegression`
- [ ] Integration test for `dispatchRegressionAlert`

### Step 4: Manual E2E Test (1h)
- [ ] Create test EvalSuite in dev environment
- [ ] Trigger eval run manually or via webhook
- [ ] Verify Discord notification received
- [ ] Verify regression details stored correctly

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Webhook not triggering eval | Low | High | Verify integration code |
| Missing Slack regression support | Medium | Medium | Add if needed |
| Threshold config not exposed in UI | Medium | Low | Out of scope for this ticket |

---

## Dependencies

| Dependency | Status |
|------------|--------|
| Sprint 3 RCA Engine | ✅ Complete |
| GitHub webhook (#91) | ✅ Complete |
| Notification adapters (#91) | ✅ Complete |
| Ticket #143 (Eval workflow) | ⏳ In Progress |

---

## Estimated Effort

| Task | Effort |
|------|--------|
| Verification & integration check | 1.5h |
| Slack adapter enhancement (if needed) | 1h |
| Unit tests | 1.5h |
| Integration/E2E tests | 1.5h |
| Documentation | 0.5h |
| **Total** | **6h** |

---

## Appendix: Type Definitions

### RegressionDetail

```typescript
interface RegressionDetail {
  metric: "latency_p95" | "error_rate" | "pass_rate";
  baseline: number;
  current: number;
  threshold: number;
  changePercent: number;
  message: string;
}
```

### RegressionInfo

```typescript
interface RegressionInfo {
  triggerRef?: string;  // "PR #123" or commit SHA
  details: RegressionDetail[];
}
```

### EvalMetrics

```typescript
interface EvalMetrics {
  totalPrompts: number;
  passedPrompts: number;
  failedPrompts: number;
  latencyP95?: number;
  errorRate?: number;
}
```
