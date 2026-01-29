# Sprint 5: Eval Pipeline - Proactive Regression Detection (Optional)

**Sprint ID:** #127 Sprint 5
**Story Points:** 8
**Priority:** P2 (Optional Enhancement)
**Dependencies:** Sprint 3 (RCA Engine) completed

---

## Sprint Goal

> Proactive regression detection: When PRs merge, automatically run eval suite and alert if performance regresses, catching issues before users report them.

---

## Definition of Done

- [ ] Eval workflow triggers on PR merge
- [ ] Eval suite runs against staging/production
- [ ] Regression detection compares to baseline
- [ ] Alert triggered if regression detected
- [ ] Results stored for historical comparison

---

## Stories

### Story 1: Eval Workflow Triggered on PR Merge

**Ticket ID:** #143
**Points:** 5
**Priority:** P2

#### Description

Create a Temporal workflow that automatically triggers when a PR is merged, runs a configured eval suite, and compares results against baseline metrics.

#### Acceptance Criteria

- [ ] Workflow starts on PR merge webhook event
- [ ] Configurable eval suite per project
- [ ] Runs evals against specified endpoint
- [ ] Compares results to stored baseline
- [ ] Stores eval results for future comparison

#### Technical Details

**Database Schema:**
```prisma
model EvalSuite {
  id           String   @id @default(cuid())
  projectId    String
  project      Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)

  name         String
  description  String?
  enabled      Boolean  @default(true)

  // Eval configuration
  endpoint     String   // API endpoint to test
  prompts      Json     // Array of test prompts
  expectedBehaviors Json // Expected outputs/behaviors

  // Baseline metrics
  baselineLatencyP95 Float?
  baselineErrorRate  Float?
  baselineScores     Json?   // Custom scores

  // Thresholds for regression
  latencyRegressionThreshold Float @default(1.2)  // 20% increase
  errorRegressionThreshold   Float @default(2.0)  // 2x errors

  runs         EvalRun[]

  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@index([projectId])
}

model EvalRun {
  id           String   @id @default(cuid())
  suiteId      String
  suite        EvalSuite @relation(fields: [suiteId], references: [id], onDelete: Cascade)

  // Trigger info
  triggeredBy  String   // "pr_merge" | "manual" | "scheduled"
  triggerRef   String?  // PR number or commit SHA

  // Results
  status       EvalRunStatus @default(PENDING)
  startedAt    DateTime?
  completedAt  DateTime?

  // Metrics
  totalPrompts Int
  passedPrompts Int?
  failedPrompts Int?
  latencyP95   Float?
  errorRate    Float?
  scores       Json?

  // Regression detection
  isRegression Boolean?
  regressionDetails Json?

  createdAt    DateTime @default(now())

  @@index([suiteId, createdAt])
}

enum EvalRunStatus {
  PENDING
  RUNNING
  PASSED
  FAILED
  REGRESSION_DETECTED
}
```

**Workflow Implementation:**
```typescript
// apps/worker/src/workflows/eval.workflow.ts

interface EvalWorkflowInput {
  projectId: string;
  suiteId: string;
  triggeredBy: "pr_merge" | "manual" | "scheduled";
  triggerRef?: string;
}

interface EvalWorkflowOutput {
  runId: string;
  status: EvalRunStatus;
  isRegression: boolean;
  regressionDetails?: {
    metric: string;
    baseline: number;
    actual: number;
    threshold: number;
  }[];
}

export async function evalPipelineWorkflow(
  input: EvalWorkflowInput
): Promise<EvalWorkflowOutput> {
  // 1. Get eval suite configuration
  const suite = await getEvalSuite({ suiteId: input.suiteId });

  // 2. Create eval run record
  const run = await createEvalRun({
    suiteId: input.suiteId,
    triggeredBy: input.triggeredBy,
    triggerRef: input.triggerRef,
    totalPrompts: suite.prompts.length,
  });

  // 3. Run eval prompts
  const results = await runEvalPrompts({
    runId: run.id,
    endpoint: suite.endpoint,
    prompts: suite.prompts,
    expectedBehaviors: suite.expectedBehaviors,
  });

  // 4. Calculate metrics
  const metrics = await calculateEvalMetrics({ results });

  // 5. Compare to baseline
  const regression = await detectRegression({
    suite,
    metrics,
  });

  // 6. Store results
  await storeEvalResults({
    runId: run.id,
    metrics,
    regression,
  });

  // 7. If regression detected, create alert
  if (regression.isRegression) {
    await triggerRegressionAlert({
      projectId: input.projectId,
      runId: run.id,
      regression,
      triggerRef: input.triggerRef,
    });
  }

  return {
    runId: run.id,
    status: regression.isRegression ? "REGRESSION_DETECTED" : "PASSED",
    isRegression: regression.isRegression,
    regressionDetails: regression.details,
  };
}
```

**Activities:**
```typescript
// apps/worker/src/temporal/activities/eval.activities.ts

export async function runEvalPrompts(input: RunEvalInput): Promise<EvalResult[]> {
  const results: EvalResult[] = [];

  for (const prompt of input.prompts) {
    const startTime = Date.now();

    try {
      const response = await fetch(input.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.text }),
      });

      const latencyMs = Date.now() - startTime;
      const data = await response.json();

      // Check expected behaviors
      const passed = checkExpectedBehaviors(data, prompt.expected);

      results.push({
        promptId: prompt.id,
        passed,
        latencyMs,
        error: null,
        response: data,
      });
    } catch (error) {
      results.push({
        promptId: prompt.id,
        passed: false,
        latencyMs: Date.now() - startTime,
        error: getErrorMessage(error),
        response: null,
      });
    }
  }

  return results;
}

export async function detectRegression(
  input: DetectRegressionInput
): Promise<RegressionResult> {
  const { suite, metrics } = input;
  const details: RegressionDetail[] = [];
  let isRegression = false;

  // Check latency regression
  if (suite.baselineLatencyP95 && metrics.latencyP95) {
    const ratio = metrics.latencyP95 / suite.baselineLatencyP95;
    if (ratio > suite.latencyRegressionThreshold) {
      isRegression = true;
      details.push({
        metric: "latency_p95",
        baseline: suite.baselineLatencyP95,
        actual: metrics.latencyP95,
        threshold: suite.latencyRegressionThreshold,
        message: `Latency P95 increased by ${((ratio - 1) * 100).toFixed(0)}%`,
      });
    }
  }

  // Check error rate regression
  if (suite.baselineErrorRate !== null && metrics.errorRate !== null) {
    const ratio = metrics.errorRate / Math.max(suite.baselineErrorRate, 0.01);
    if (ratio > suite.errorRegressionThreshold) {
      isRegression = true;
      details.push({
        metric: "error_rate",
        baseline: suite.baselineErrorRate,
        actual: metrics.errorRate,
        threshold: suite.errorRegressionThreshold,
        message: `Error rate increased from ${(suite.baselineErrorRate * 100).toFixed(1)}% to ${(metrics.errorRate * 100).toFixed(1)}%`,
      });
    }
  }

  // Check pass rate
  const passRate = metrics.passedPrompts / metrics.totalPrompts;
  const baselinePassRate = (suite.baselineScores as any)?.passRate ?? 0.95;
  if (passRate < baselinePassRate * 0.9) {  // 10% drop
    isRegression = true;
    details.push({
      metric: "pass_rate",
      baseline: baselinePassRate,
      actual: passRate,
      threshold: 0.9,
      message: `Pass rate dropped from ${(baselinePassRate * 100).toFixed(0)}% to ${(passRate * 100).toFixed(0)}%`,
    });
  }

  return { isRegression, details };
}
```

**Webhook Integration:**
```typescript
// apps/web/src/app/api/webhooks/github/route.ts

// Add to existing webhook handler
if (event === "pull_request" && payload.action === "closed" && payload.pull_request.merged) {
  // PR was merged - trigger eval pipeline
  const repo = await prisma.gitHubRepository.findFirst({
    where: {
      owner: payload.repository.owner.login,
      repo: payload.repository.name,
    },
    include: {
      project: {
        include: {
          evalSuites: {
            where: { enabled: true },
          },
        },
      },
    },
  });

  if (repo && repo.project.evalSuites.length > 0) {
    const client = await getTemporalClient();

    for (const suite of repo.project.evalSuites) {
      await client.workflow.start("evalPipelineWorkflow", {
        taskQueue: "eval-queue",
        workflowId: `eval-${suite.id}-pr-${payload.pull_request.number}`,
        args: [{
          projectId: repo.projectId,
          suiteId: suite.id,
          triggeredBy: "pr_merge",
          triggerRef: `PR #${payload.pull_request.number}`,
        }],
      });
    }
  }
}
```

#### Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/db/prisma/schema.prisma` | Modify | Add EvalSuite, EvalRun |
| `apps/worker/src/workflows/eval.workflow.ts` | Create | Eval workflow |
| `apps/worker/src/temporal/activities/eval.activities.ts` | Create | Eval activities |
| `apps/web/src/app/api/webhooks/github/route.ts` | Modify | Trigger on PR merge |

---

### Story 2: Regression Detection

**Ticket ID:** #144
**Points:** 3
**Priority:** P2

#### Description

Implement the regression detection algorithm and alert generation when regressions are detected after PR merges.

#### Acceptance Criteria

- [ ] Compares metrics against baseline
- [ ] Configurable thresholds per metric
- [ ] Creates alert when regression detected
- [ ] Includes PR information in alert
- [ ] Stores regression details for review

#### Technical Details

**Alert Generation:**
```typescript
// apps/worker/src/temporal/activities/eval.activities.ts

export async function triggerRegressionAlert(
  input: TriggerRegressionAlertInput
): Promise<void> {
  const caller = getInternalCaller();

  // Create a special regression alert history entry
  await caller.internal.createRegressionAlert({
    projectId: input.projectId,
    evalRunId: input.runId,
    triggerRef: input.triggerRef,
    regressionDetails: input.regression.details,
  });
}
```

**Internal Procedure:**
```typescript
// packages/api/src/routers/internal.ts

createRegressionAlert: internalProcedure
  .input(z.object({
    projectId: z.string(),
    evalRunId: z.string(),
    triggerRef: z.string().optional(),
    regressionDetails: z.array(z.object({
      metric: z.string(),
      baseline: z.number(),
      actual: z.number(),
      threshold: z.number(),
      message: z.string(),
    })),
  }))
  .mutation(async ({ input }) => {
    const project = await prisma.project.findUnique({
      where: { id: input.projectId },
      include: {
        workspace: {
          include: {
            notificationChannels: {
              where: { enabled: true },
            },
          },
        },
      },
    });

    if (!project) return;

    // Build notification payload
    const payload: AlertPayload = {
      alertId: `regression-${input.evalRunId}`,
      alertName: "Performance Regression Detected",
      projectId: input.projectId,
      projectName: project.name,
      type: "ERROR_RATE",  // Use as generic alert type
      threshold: 0,
      actualValue: 0,
      operator: "GT",
      triggeredAt: new Date().toISOString(),
      dashboardUrl: `${env.APP_URL}/projects/${input.projectId}/evals/${input.evalRunId}`,
      // Add regression-specific info
      regressionInfo: {
        triggerRef: input.triggerRef,
        details: input.regressionDetails,
      },
    };

    // Send to all workspace notification channels
    for (const channel of project.workspace.notificationChannels) {
      const adapter = AdapterRegistry.get(channel.provider);
      if (adapter) {
        await adapter.send(channel.config, payload);
      }
    }
  }),
```

**Notification Template (Discord):**
```typescript
// Add to discord adapter for regression alerts
if (payload.regressionInfo) {
  fields.push({
    name: "⚠️ Regression Detected",
    value: payload.regressionInfo.triggerRef
      ? `After: ${payload.regressionInfo.triggerRef}`
      : "After recent changes",
    inline: false,
  });

  for (const detail of payload.regressionInfo.details) {
    fields.push({
      name: `📉 ${detail.metric}`,
      value: detail.message,
      inline: true,
    });
  }
}
```

#### Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/worker/src/temporal/activities/eval.activities.ts` | Modify | Add alert trigger |
| `packages/api/src/routers/internal.ts` | Modify | Add createRegressionAlert |
| `packages/api/src/lib/alerting/adapters/discord.ts` | Modify | Handle regression alerts |

---

## Sprint Backlog Summary

| Story | Points | Assignee | Status |
|-------|--------|----------|--------|
| #143 Eval workflow on PR merge | 5 | TBD | To Do |
| #144 Regression detection | 3 | TBD | To Do |
| **Total** | **8** | | |

---

## Dependencies & Blockers

| Dependency | Status | Notes |
|------------|--------|-------|
| Sprint 3 completed | ⏳ Pending | Core RCA workflow |
| GitHub webhook | ✅ Done | Sprint 1 |
| Notification adapters | ✅ Done | #91 |

---

## Future Enhancements (Out of Scope)

- Custom eval metrics beyond latency/error rate
- A/B testing eval comparisons
- Scheduled (cron) eval runs
- Eval suite UI for configuration
- LLM-as-judge eval scoring
- Multi-environment eval (staging vs prod)

---

## Eval Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                      EVAL PIPELINE FLOW                             │
└─────────────────────────────────────────────────────────────────────┘

    PR Merged            Manual Trigger           Scheduled
        │                      │                      │
        └──────────┬───────────┴──────────────────────┘
                   │
                   ▼
         ┌─────────────────┐
         │  Eval Workflow  │
         │    (Temporal)   │
         └────────┬────────┘
                  │
        ┌─────────┼─────────┐
        ▼         ▼         ▼
   ┌────────┐ ┌────────┐ ┌────────┐
   │Prompt 1│ │Prompt 2│ │Prompt N│
   └────┬───┘ └────┬───┘ └────┬───┘
        │         │         │
        └─────────┼─────────┘
                  │
                  ▼
         ┌─────────────────┐
         │ Calculate Metrics│
         │ • Latency P95    │
         │ • Error Rate     │
         │ • Pass Rate      │
         └────────┬────────┘
                  │
                  ▼
         ┌─────────────────┐
         │Compare Baseline │
         └────────┬────────┘
                  │
        ┌─────────┴─────────┐
        ▼                   ▼
   ┌─────────┐         ┌─────────┐
   │ PASSED  │         │REGRESSION│
   └─────────┘         └────┬────┘
                            │
                            ▼
                    ┌───────────────┐
                    │ Send Alert    │
                    │ • Discord     │
                    │ • Slack       │
                    │ • Email       │
                    └───────────────┘
```
