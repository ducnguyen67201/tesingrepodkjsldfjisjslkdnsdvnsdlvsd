# Engineering Spec: Eval Pipeline Triggered on PR Merge

**Ticket:** #143
**Epic:** #127 Automated RCA System
**Sprint:** 5 - Eval Pipeline (Optional)
**Story Points:** 5
**Priority:** P2
**Author:** Senior Architect
**Last Updated:** 2025-12-14

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Database Schema](#3-database-schema)
4. [GitHub Webhook Integration](#4-github-webhook-integration)
5. [Temporal Workflow Design](#5-temporal-workflow-design)
6. [Activity Implementations](#6-activity-implementations)
7. [Regression Detection Algorithm](#7-regression-detection-algorithm)
8. [Alert Generation](#8-alert-generation)
9. [API Design](#9-api-design)
10. [Performance Considerations](#10-performance-considerations)
11. [Testing Strategy](#11-testing-strategy)
12. [Files to Create/Modify](#12-files-to-createmodify)

---

## 1. Overview

### 1.1 Problem Statement

After code changes are merged, performance regressions may not be detected until users report issues. By automatically running evaluation suites after PR merges, we can:
1. Detect regressions before they impact users
2. Correlate regressions with specific code changes
3. Enable faster rollback decisions

### 1.2 Goals

1. **Automatic Triggering**: Run eval suite when PR is merged via GitHub webhook
2. **Configurable Suites**: Project-specific eval endpoints and prompts
3. **Regression Detection**: Compare against baseline metrics
4. **Alert Integration**: Notify when regression is detected
5. **Historical Tracking**: Store all eval runs for trend analysis

### 1.3 Non-Goals

- Manual eval triggering from UI (future enhancement)
- A/B testing between branches
- Custom evaluation metrics beyond latency/error rate
- Multi-environment testing (staging vs prod)

### 1.4 Key Concepts

| Term | Definition |
|------|------------|
| **Eval Suite** | Configuration defining what to test (endpoint, prompts, thresholds) |
| **Eval Run** | Single execution of an eval suite with results |
| **Baseline** | Reference metrics from a known-good state |
| **Regression** | Performance degradation beyond configured thresholds |

---

## 2. Architecture

### 2.1 High-Level Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          EVAL PIPELINE ARCHITECTURE                         │
└─────────────────────────────────────────────────────────────────────────────┘

   GitHub                    Ducsigr                    External
   ──────                    ──────────                    ────────

┌─────────┐                ┌─────────────────┐
│   PR    │   webhook      │  GitHub Webhook │
│ Merged  │───────────────▶│    Handler      │
└─────────┘                └────────┬────────┘
                                    │
                                    │ lookup eval suites
                                    ▼
                           ┌─────────────────┐
                           │   PostgreSQL    │
                           │  - EvalSuite    │
                           │  - EvalRun      │
                           └────────┬────────┘
                                    │
                                    │ start workflow
                                    ▼
                           ┌─────────────────┐
                           │    Temporal     │
                           │                 │
                           │ evalPipeline    │
                           │   Workflow      │
                           └────────┬────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        │                           │                           │
        ▼                           ▼                           ▼
┌───────────────┐          ┌───────────────┐          ┌───────────────┐
│  Create Run   │          │ Run Prompts   │          │   Detect      │
│   Activity    │──────────│   Activity    │──────────│  Regression   │
└───────────────┘          └───────┬───────┘          └───────┬───────┘
                                   │                          │
                                   │ HTTP POST                │
                                   ▼                          │
                           ┌───────────────┐                  │
                           │   User API    │                  │
                           │   Endpoint    │                  │
                           └───────────────┘                  │
                                                              │
                                                    (if regression)
                                                              │
                                                              ▼
                                                    ┌───────────────┐
                                                    │ Send Alert    │
                                                    │ (Discord/     │
                                                    │  Slack/Gmail) │
                                                    └───────────────┘
```

### 2.2 Component Responsibilities

| Component | Responsibility |
|-----------|----------------|
| GitHub Webhook Handler | Receive PR merge events, lookup eval suites, start workflows |
| Temporal Workflow | Orchestrate eval execution with retry and timeout handling |
| Create Run Activity | Initialize eval run record in database |
| Run Prompts Activity | Execute HTTP requests to user's API endpoint |
| Detect Regression Activity | Compare metrics against baseline |
| Alert Activity | Send notifications when regression detected |

---

## 3. Database Schema

### 3.1 EvalSuite Model

```prisma
// packages/db/prisma/schema.prisma

model EvalSuite {
  id          String   @id @default(cuid())
  projectId   String
  project     Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)

  // Configuration
  name        String
  description String?
  enabled     Boolean  @default(true)

  // Eval target
  endpoint    String   // Full URL to test (e.g., https://api.example.com/chat)
  method      String   @default("POST")
  headers     Json?    // Custom headers { "Authorization": "Bearer xxx" }
  timeoutMs   Int      @default(30000)

  // Test cases
  prompts     Json     // Array of EvalPrompt objects
  /*
    [
      {
        "id": "prompt-1",
        "name": "Simple greeting",
        "text": "Hello, how are you?",
        "expected": {
          "containsAny": ["hello", "hi", "greetings"],
          "maxLatencyMs": 2000
        }
      }
    ]
  */

  // Baseline metrics
  baselineLatencyP50  Float?
  baselineLatencyP95  Float?
  baselineLatencyP99  Float?
  baselineErrorRate   Float?  @default(0)
  baselinePassRate    Float?  @default(1.0)

  // Regression thresholds
  latencyRegressionPct  Float @default(20)   // 20% increase = regression
  errorRegressionPct    Float @default(100)  // 2x errors = regression
  passRateDropPct       Float @default(10)   // 10% drop = regression

  // Relations
  runs        EvalRun[]

  // Metadata
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  createdBy   String?

  @@index([projectId])
  @@index([projectId, enabled])
}
```

### 3.2 EvalRun Model

```prisma
model EvalRun {
  id          String        @id @default(cuid())
  suiteId     String
  suite       EvalSuite     @relation(fields: [suiteId], references: [id], onDelete: Cascade)

  // Trigger context
  triggeredBy String        // "pr_merge" | "manual" | "scheduled"
  triggerRef  String?       // "PR #123" or commit SHA
  prNumber    Int?          // Extracted PR number if pr_merge
  commitSha   String?       // Head commit SHA

  // Execution status
  status      EvalRunStatus @default(PENDING)
  startedAt   DateTime?
  completedAt DateTime?
  error       String?       // Error message if failed

  // Results
  totalPrompts   Int
  passedPrompts  Int?
  failedPrompts  Int?
  skippedPrompts Int?

  // Aggregate metrics
  latencyP50     Float?
  latencyP95     Float?
  latencyP99     Float?
  avgLatencyMs   Float?
  errorRate      Float?
  passRate       Float?

  // Individual prompt results
  promptResults  Json?
  /*
    [
      {
        "promptId": "prompt-1",
        "passed": true,
        "latencyMs": 1234,
        "response": { ... },
        "checks": {
          "containsAny": true,
          "maxLatencyMs": true
        }
      }
    ]
  */

  // Regression analysis
  isRegression   Boolean?
  regressionDetails Json?
  /*
    [
      {
        "metric": "latency_p95",
        "baseline": 1200,
        "actual": 1800,
        "threshold": 1.2,
        "message": "Latency P95 increased by 50%"
      }
    ]
  */

  // Metadata
  createdAt   DateTime @default(now())

  @@index([suiteId, createdAt])
  @@index([suiteId, status])
  @@index([prNumber])
}

enum EvalRunStatus {
  PENDING
  RUNNING
  PASSED
  FAILED
  REGRESSION_DETECTED
  CANCELED
}
```

### 3.3 Type Definitions

```typescript
// packages/api/src/schemas/eval.ts

import { z } from "zod";

// Prompt expected behavior checks
export const EvalExpectedSchema = z.object({
  // Response content checks
  containsAny: z.array(z.string()).optional(),
  containsAll: z.array(z.string()).optional(),
  notContains: z.array(z.string()).optional(),
  matchesRegex: z.string().optional(),

  // Performance checks
  maxLatencyMs: z.number().positive().optional(),

  // Status check
  expectedStatus: z.number().int().min(200).max(599).optional(),
});

export const EvalPromptSchema = z.object({
  id: z.string(),
  name: z.string(),
  text: z.string(),
  expected: EvalExpectedSchema.optional(),
  weight: z.number().positive().default(1), // For weighted pass rate
});

export type EvalPrompt = z.infer<typeof EvalPromptSchema>;
export type EvalExpected = z.infer<typeof EvalExpectedSchema>;

// Prompt result
export const PromptResultSchema = z.object({
  promptId: z.string(),
  name: z.string(),
  passed: z.boolean(),
  latencyMs: z.number(),
  statusCode: z.number().optional(),
  response: z.unknown().optional(),
  error: z.string().optional(),
  checks: z.record(z.string(), z.boolean()).optional(),
});

export type PromptResult = z.infer<typeof PromptResultSchema>;

// Regression detail
export const RegressionDetailSchema = z.object({
  metric: z.string(),
  baseline: z.number(),
  actual: z.number(),
  threshold: z.number(),
  percentChange: z.number(),
  message: z.string(),
});

export type RegressionDetail = z.infer<typeof RegressionDetailSchema>;
```

---

## 4. GitHub Webhook Integration

### 4.1 Webhook Handler Extension

```typescript
// apps/web/src/app/api/webhooks/github/route.ts

import { prisma } from "@ducsigr/db";
import { getTemporalClient } from "@/lib/temporal";

// Add to existing webhook handler
async function handlePullRequestEvent(payload: PullRequestEvent): Promise<void> {
  // Only handle merged PRs
  if (payload.action !== "closed" || !payload.pull_request.merged) {
    return;
  }

  console.log(`[GitHub Webhook] PR #${payload.pull_request.number} merged`);

  // Find repository in our system
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

  if (!repo) {
    console.log(`[GitHub Webhook] Repository not found in Ducsigr`);
    return;
  }

  if (repo.project.evalSuites.length === 0) {
    console.log(`[GitHub Webhook] No enabled eval suites for project ${repo.projectId}`);
    return;
  }

  // Start eval workflow for each enabled suite
  const client = await getTemporalClient();
  const pr = payload.pull_request;

  for (const suite of repo.project.evalSuites) {
    const workflowId = `eval-${suite.id}-pr-${pr.number}`;

    try {
      await client.workflow.start("evalPipelineWorkflow", {
        taskQueue: "worker-queue",
        workflowId,
        args: [{
          projectId: repo.projectId,
          suiteId: suite.id,
          triggeredBy: "pr_merge",
          triggerRef: `PR #${pr.number}`,
          prNumber: pr.number,
          commitSha: pr.merge_commit_sha,
          prTitle: pr.title,
          prAuthor: pr.user.login,
        }],
      });

      console.log(`[GitHub Webhook] Started eval workflow: ${workflowId}`);
    } catch (error) {
      // Handle duplicate workflow ID (already running)
      if (isWorkflowAlreadyStarted(error)) {
        console.log(`[GitHub Webhook] Eval workflow already running: ${workflowId}`);
      } else {
        console.error(`[GitHub Webhook] Failed to start eval workflow:`, error);
      }
    }
  }
}

function isWorkflowAlreadyStarted(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes("Workflow execution already started")
  );
}
```

### 4.2 Webhook Payload Types

```typescript
// packages/api/src/schemas/github-webhook.ts

export interface PullRequestEvent {
  action: "opened" | "closed" | "reopened" | "synchronize";
  pull_request: {
    number: number;
    title: string;
    state: "open" | "closed";
    merged: boolean;
    merge_commit_sha: string | null;
    head: {
      sha: string;
      ref: string;
    };
    base: {
      sha: string;
      ref: string;
    };
    user: {
      login: string;
    };
  };
  repository: {
    owner: {
      login: string;
    };
    name: string;
  };
}
```

---

## 5. Temporal Workflow Design

### 5.1 Workflow Input/Output

```typescript
// apps/worker/src/temporal/types.ts

export interface EvalWorkflowInput {
  projectId: string;
  suiteId: string;
  triggeredBy: "pr_merge" | "manual" | "scheduled";
  triggerRef?: string;
  prNumber?: number;
  commitSha?: string;
  prTitle?: string;
  prAuthor?: string;
}

export interface EvalWorkflowOutput {
  runId: string;
  status: EvalRunStatus;
  passRate: number;
  isRegression: boolean;
  regressionDetails?: RegressionDetail[];
  metrics: {
    latencyP50?: number;
    latencyP95?: number;
    latencyP99?: number;
    errorRate?: number;
  };
}

type EvalRunStatus =
  | "PASSED"
  | "FAILED"
  | "REGRESSION_DETECTED"
  | "CANCELED";
```

### 5.2 Workflow Implementation

```typescript
// apps/worker/src/workflows/eval.workflow.ts

import {
  proxyActivities,
  sleep,
  defineSignal,
  setHandler,
  condition,
  ApplicationFailure,
} from "@temporalio/workflow";
import type { EvalActivities } from "../temporal/activities/eval.activities";
import type { EvalWorkflowInput, EvalWorkflowOutput } from "../temporal/types";
import { ACTIVITY_RETRY } from "@ducsigr/shared";

const {
  getEvalSuite,
  createEvalRun,
  updateEvalRunStatus,
  runEvalPrompts,
  calculateMetrics,
  detectRegression,
  storeEvalResults,
  sendRegressionAlert,
} = proxyActivities<EvalActivities>({
  startToCloseTimeout: "5 minutes",
  retry: ACTIVITY_RETRY,
});

// Signal for cancellation
const cancelSignal = defineSignal("cancel");

export async function evalPipelineWorkflow(
  input: EvalWorkflowInput
): Promise<EvalWorkflowOutput> {
  let canceled = false;
  setHandler(cancelSignal, () => {
    canceled = true;
  });

  // 1. Get eval suite configuration
  const suite = await getEvalSuite({ suiteId: input.suiteId });

  if (!suite || !suite.enabled) {
    throw ApplicationFailure.nonRetryable("Eval suite not found or disabled");
  }

  // 2. Create eval run record
  const run = await createEvalRun({
    suiteId: input.suiteId,
    triggeredBy: input.triggeredBy,
    triggerRef: input.triggerRef,
    prNumber: input.prNumber,
    commitSha: input.commitSha,
    totalPrompts: suite.prompts.length,
  });

  try {
    // 3. Update status to RUNNING
    await updateEvalRunStatus({
      runId: run.id,
      status: "RUNNING",
      startedAt: new Date(),
    });

    // Check for cancellation
    if (canceled) {
      await updateEvalRunStatus({ runId: run.id, status: "CANCELED" });
      return {
        runId: run.id,
        status: "CANCELED",
        passRate: 0,
        isRegression: false,
        metrics: {},
      };
    }

    // 4. Run eval prompts (with batching for large suites)
    const promptResults = await runEvalPrompts({
      runId: run.id,
      endpoint: suite.endpoint,
      method: suite.method,
      headers: suite.headers,
      timeoutMs: suite.timeoutMs,
      prompts: suite.prompts,
    });

    // 5. Calculate aggregate metrics
    const metrics = await calculateMetrics({
      promptResults,
      prompts: suite.prompts,
    });

    // 6. Detect regression against baseline
    const regression = await detectRegression({
      suite,
      metrics,
    });

    // 7. Determine final status
    const status = regression.isRegression
      ? "REGRESSION_DETECTED"
      : metrics.passRate < 1.0
        ? "FAILED"
        : "PASSED";

    // 8. Store final results
    await storeEvalResults({
      runId: run.id,
      status,
      metrics,
      promptResults,
      isRegression: regression.isRegression,
      regressionDetails: regression.details,
    });

    // 9. Send alert if regression detected
    if (regression.isRegression) {
      await sendRegressionAlert({
        projectId: input.projectId,
        suiteId: input.suiteId,
        runId: run.id,
        suiteName: suite.name,
        triggerRef: input.triggerRef,
        prNumber: input.prNumber,
        prTitle: input.prTitle,
        prAuthor: input.prAuthor,
        regressionDetails: regression.details,
      });
    }

    return {
      runId: run.id,
      status,
      passRate: metrics.passRate,
      isRegression: regression.isRegression,
      regressionDetails: regression.details,
      metrics: {
        latencyP50: metrics.latencyP50,
        latencyP95: metrics.latencyP95,
        latencyP99: metrics.latencyP99,
        errorRate: metrics.errorRate,
      },
    };
  } catch (error) {
    // Handle workflow failure
    await updateEvalRunStatus({
      runId: run.id,
      status: "FAILED",
      error: error instanceof Error ? error.message : "Unknown error",
    });

    throw error;
  }
}
```

---

## 6. Activity Implementations

### 6.1 Run Eval Prompts Activity

```typescript
// apps/worker/src/temporal/activities/eval.activities.ts

import { prisma } from "@ducsigr/db";
import { getInternalCaller } from "@/lib/trpc-caller";
import type { EvalPrompt, PromptResult, EvalExpected } from "@ducsigr/api/schemas";

interface RunEvalPromptsInput {
  runId: string;
  endpoint: string;
  method: string;
  headers?: Record<string, string>;
  timeoutMs: number;
  prompts: EvalPrompt[];
}

export async function runEvalPrompts(
  input: RunEvalPromptsInput
): Promise<PromptResult[]> {
  const results: PromptResult[] = [];
  const { endpoint, method, headers, timeoutMs, prompts } = input;

  console.log(`[Activity:runEvalPrompts] Running ${prompts.length} prompts against ${endpoint}`);

  for (const prompt of prompts) {
    const startTime = Date.now();

    try {
      // Build request body
      const body = JSON.stringify({
        prompt: prompt.text,
        // Include prompt ID for tracing
        metadata: { evalPromptId: prompt.id, evalRunId: input.runId },
      });

      // Execute request with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(endpoint, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
        body,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const latencyMs = Date.now() - startTime;

      // Parse response
      let responseData: unknown;
      try {
        responseData = await response.json();
      } catch {
        responseData = await response.text();
      }

      // Run checks against expected behavior
      const checks = runExpectedChecks(
        response.status,
        responseData,
        latencyMs,
        prompt.expected
      );

      const passed = Object.values(checks).every(Boolean);

      results.push({
        promptId: prompt.id,
        name: prompt.name,
        passed,
        latencyMs,
        statusCode: response.status,
        response: responseData,
        checks,
      });
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      results.push({
        promptId: prompt.id,
        name: prompt.name,
        passed: false,
        latencyMs,
        error: errorMessage,
        checks: {},
      });
    }

    // Small delay between requests to avoid rate limiting
    await sleep(100);
  }

  console.log(`[Activity:runEvalPrompts] Completed: ${results.filter(r => r.passed).length}/${results.length} passed`);

  return results;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Run expected behavior checks
 */
function runExpectedChecks(
  statusCode: number,
  response: unknown,
  latencyMs: number,
  expected?: EvalExpected
): Record<string, boolean> {
  const checks: Record<string, boolean> = {};

  if (!expected) {
    // Default: just check for successful status
    checks.statusOk = statusCode >= 200 && statusCode < 300;
    return checks;
  }

  // Status code check
  if (expected.expectedStatus !== undefined) {
    checks.expectedStatus = statusCode === expected.expectedStatus;
  } else {
    checks.statusOk = statusCode >= 200 && statusCode < 300;
  }

  // Latency check
  if (expected.maxLatencyMs !== undefined) {
    checks.maxLatencyMs = latencyMs <= expected.maxLatencyMs;
  }

  // Response content checks
  const responseText = typeof response === "string"
    ? response.toLowerCase()
    : JSON.stringify(response).toLowerCase();

  if (expected.containsAny?.length) {
    checks.containsAny = expected.containsAny.some(
      term => responseText.includes(term.toLowerCase())
    );
  }

  if (expected.containsAll?.length) {
    checks.containsAll = expected.containsAll.every(
      term => responseText.includes(term.toLowerCase())
    );
  }

  if (expected.notContains?.length) {
    checks.notContains = expected.notContains.every(
      term => !responseText.includes(term.toLowerCase())
    );
  }

  if (expected.matchesRegex) {
    try {
      const regex = new RegExp(expected.matchesRegex, "i");
      checks.matchesRegex = regex.test(responseText);
    } catch {
      checks.matchesRegex = false;
    }
  }

  return checks;
}
```

### 6.2 Calculate Metrics Activity

```typescript
// apps/worker/src/temporal/activities/eval.activities.ts

interface CalculateMetricsInput {
  promptResults: PromptResult[];
  prompts: EvalPrompt[];
}

interface EvalMetrics {
  totalPrompts: number;
  passedPrompts: number;
  failedPrompts: number;
  passRate: number;
  errorRate: number;
  latencyP50: number | null;
  latencyP95: number | null;
  latencyP99: number | null;
  avgLatencyMs: number | null;
}

export async function calculateMetrics(
  input: CalculateMetricsInput
): Promise<EvalMetrics> {
  const { promptResults, prompts } = input;

  // Count pass/fail
  const passed = promptResults.filter(r => r.passed).length;
  const failed = promptResults.filter(r => !r.passed).length;
  const errors = promptResults.filter(r => r.error).length;

  // Calculate weighted pass rate
  const promptWeights = new Map(prompts.map(p => [p.id, p.weight ?? 1]));
  let weightedPassed = 0;
  let totalWeight = 0;

  for (const result of promptResults) {
    const weight = promptWeights.get(result.promptId) ?? 1;
    totalWeight += weight;
    if (result.passed) {
      weightedPassed += weight;
    }
  }

  const passRate = totalWeight > 0 ? weightedPassed / totalWeight : 0;
  const errorRate = promptResults.length > 0 ? errors / promptResults.length : 0;

  // Calculate latency percentiles
  const latencies = promptResults
    .filter(r => !r.error)
    .map(r => r.latencyMs)
    .sort((a, b) => a - b);

  const latencyP50 = percentile(latencies, 50);
  const latencyP95 = percentile(latencies, 95);
  const latencyP99 = percentile(latencies, 99);
  const avgLatencyMs = latencies.length > 0
    ? latencies.reduce((a, b) => a + b, 0) / latencies.length
    : null;

  return {
    totalPrompts: promptResults.length,
    passedPrompts: passed,
    failedPrompts: failed,
    passRate,
    errorRate,
    latencyP50,
    latencyP95,
    latencyP99,
    avgLatencyMs,
  };
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)] ?? null;
}
```

### 6.3 Detect Regression Activity

```typescript
// apps/worker/src/temporal/activities/eval.activities.ts

interface DetectRegressionInput {
  suite: {
    baselineLatencyP50: number | null;
    baselineLatencyP95: number | null;
    baselineLatencyP99: number | null;
    baselineErrorRate: number | null;
    baselinePassRate: number | null;
    latencyRegressionPct: number;
    errorRegressionPct: number;
    passRateDropPct: number;
  };
  metrics: EvalMetrics;
}

interface RegressionResult {
  isRegression: boolean;
  details: RegressionDetail[];
}

export async function detectRegression(
  input: DetectRegressionInput
): Promise<RegressionResult> {
  const { suite, metrics } = input;
  const details: RegressionDetail[] = [];
  let isRegression = false;

  // Helper to check percentage increase
  const checkIncrease = (
    metric: string,
    baseline: number | null,
    actual: number | null,
    thresholdPct: number
  ) => {
    if (baseline === null || actual === null || baseline === 0) return;

    const percentChange = ((actual - baseline) / baseline) * 100;

    if (percentChange > thresholdPct) {
      isRegression = true;
      details.push({
        metric,
        baseline,
        actual,
        threshold: thresholdPct,
        percentChange,
        message: `${metric} increased by ${percentChange.toFixed(1)}% (threshold: ${thresholdPct}%)`,
      });
    }
  };

  // Check latency regressions
  checkIncrease(
    "latency_p50",
    suite.baselineLatencyP50,
    metrics.latencyP50,
    suite.latencyRegressionPct
  );
  checkIncrease(
    "latency_p95",
    suite.baselineLatencyP95,
    metrics.latencyP95,
    suite.latencyRegressionPct
  );
  checkIncrease(
    "latency_p99",
    suite.baselineLatencyP99,
    metrics.latencyP99,
    suite.latencyRegressionPct
  );

  // Check error rate regression
  checkIncrease(
    "error_rate",
    suite.baselineErrorRate,
    metrics.errorRate,
    suite.errorRegressionPct
  );

  // Check pass rate drop (different direction)
  if (
    suite.baselinePassRate !== null &&
    metrics.passRate !== null &&
    suite.baselinePassRate > 0
  ) {
    const dropPct = ((suite.baselinePassRate - metrics.passRate) / suite.baselinePassRate) * 100;

    if (dropPct > suite.passRateDropPct) {
      isRegression = true;
      details.push({
        metric: "pass_rate",
        baseline: suite.baselinePassRate,
        actual: metrics.passRate,
        threshold: suite.passRateDropPct,
        percentChange: -dropPct,
        message: `Pass rate dropped from ${(suite.baselinePassRate * 100).toFixed(1)}% to ${(metrics.passRate * 100).toFixed(1)}%`,
      });
    }
  }

  console.log(`[Activity:detectRegression] Regression: ${isRegression}, Details: ${details.length}`);

  return { isRegression, details };
}
```

---

## 7. Regression Detection Algorithm

### 7.1 Metric Comparison Logic

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    REGRESSION DETECTION ALGORITHM                           │
└─────────────────────────────────────────────────────────────────────────────┘

For each metric:

1. LATENCY (P50, P95, P99)
   ───────────────────────
   regression_pct = ((actual - baseline) / baseline) × 100

   IF regression_pct > latencyRegressionPct (default: 20%)
      THEN regression = TRUE


2. ERROR RATE
   ──────────
   regression_pct = ((actual - baseline) / max(baseline, 0.01)) × 100

   IF regression_pct > errorRegressionPct (default: 100%, i.e., 2x)
      THEN regression = TRUE


3. PASS RATE
   ─────────
   drop_pct = ((baseline - actual) / baseline) × 100

   IF drop_pct > passRateDropPct (default: 10%)
      THEN regression = TRUE


Result: regression = ANY(latency_regression, error_regression, pass_regression)
```

### 7.2 Threshold Configuration

| Metric | Default Threshold | Description |
|--------|-------------------|-------------|
| Latency P50/P95/P99 | 20% increase | 1.2x baseline |
| Error Rate | 100% increase | 2x baseline |
| Pass Rate | 10% drop | 90% of baseline |

### 7.3 Edge Cases

| Scenario | Handling |
|----------|----------|
| No baseline set | Skip comparison, no regression |
| Baseline is 0 | Use small epsilon (0.01) for error rate |
| Actual is 0 | Pass (no regression possible) |
| First run ever | Store as baseline candidate |

---

## 8. Alert Generation

### 8.1 Regression Alert Activity

```typescript
// apps/worker/src/temporal/activities/eval.activities.ts

interface SendRegressionAlertInput {
  projectId: string;
  suiteId: string;
  runId: string;
  suiteName: string;
  triggerRef?: string;
  prNumber?: number;
  prTitle?: string;
  prAuthor?: string;
  regressionDetails: RegressionDetail[];
}

export async function sendRegressionAlert(
  input: SendRegressionAlertInput
): Promise<void> {
  const caller = getInternalCaller();

  await caller.internal.createRegressionAlert({
    projectId: input.projectId,
    evalRunId: input.runId,
    suiteName: input.suiteName,
    triggerRef: input.triggerRef,
    prNumber: input.prNumber,
    prTitle: input.prTitle,
    prAuthor: input.prAuthor,
    regressionDetails: input.regressionDetails,
  });

  console.log(`[Activity:sendRegressionAlert] Alert sent for eval run ${input.runId}`);
}
```

### 8.2 Internal Procedure for Alert

```typescript
// packages/api/src/routers/internal.ts

createRegressionAlert: internalProcedure
  .input(z.object({
    projectId: z.string(),
    evalRunId: z.string(),
    suiteName: z.string(),
    triggerRef: z.string().optional(),
    prNumber: z.number().optional(),
    prTitle: z.string().optional(),
    prAuthor: z.string().optional(),
    regressionDetails: z.array(RegressionDetailSchema),
  }))
  .mutation(async ({ input }) => {
    // Get project with workspace channels
    const project = await prisma.project.findUnique({
      where: { id: input.projectId },
      include: {
        workspace: {
          include: {
            notificationChannels: {
              where: { enabled: true },
            },
            slug: true,
          },
        },
      },
    });

    if (!project) {
      console.warn(`[Internal:createRegressionAlert] Project not found: ${input.projectId}`);
      return;
    }

    // Build notification payload
    const payload: RegressionAlertPayload = {
      alertType: "REGRESSION",
      projectId: input.projectId,
      projectName: project.name,
      suiteName: input.suiteName,
      evalRunId: input.evalRunId,
      triggeredAt: new Date().toISOString(),
      dashboardUrl: `${env.APP_URL}/${project.workspace.slug}/projects/${input.projectId}/evals/${input.evalRunId}`,
      trigger: {
        ref: input.triggerRef,
        prNumber: input.prNumber,
        prTitle: input.prTitle,
        prAuthor: input.prAuthor,
      },
      regressions: input.regressionDetails.map(d => ({
        metric: d.metric,
        message: d.message,
        percentChange: d.percentChange,
      })),
    };

    // Send to all workspace notification channels
    for (const channel of project.workspace.notificationChannels) {
      try {
        const adapter = AdapterRegistry.get(channel.provider);
        await adapter.sendRegression(channel.config, payload);
        console.log(`[Internal:createRegressionAlert] Sent to ${channel.provider}`);
      } catch (error) {
        console.error(`[Internal:createRegressionAlert] Failed to send to ${channel.provider}:`, error);
      }
    }
  }),
```

### 8.3 Discord Regression Alert Format

```typescript
// packages/api/src/lib/alerting/adapters/discord.ts

async sendRegression(config: unknown, payload: RegressionAlertPayload): Promise<SendResult> {
  const validConfig = this.validateConfig(config);

  const fields: DiscordField[] = [
    {
      name: "📊 Eval Suite",
      value: payload.suiteName,
      inline: true,
    },
    {
      name: "🎯 Project",
      value: payload.projectName,
      inline: true,
    },
  ];

  // Add trigger info
  if (payload.trigger.prNumber) {
    fields.push({
      name: "🔀 Triggered By",
      value: `PR #${payload.trigger.prNumber}${payload.trigger.prTitle ? `\n${payload.trigger.prTitle}` : ""}${payload.trigger.prAuthor ? `\nby ${payload.trigger.prAuthor}` : ""}`,
      inline: false,
    });
  }

  // Add regression details
  for (const reg of payload.regressions) {
    const emoji = reg.percentChange > 0 ? "📈" : "📉";
    fields.push({
      name: `${emoji} ${formatMetricName(reg.metric)}`,
      value: reg.message,
      inline: true,
    });
  }

  // Add link
  fields.push({
    name: "🔗 View Details",
    value: `[Open Eval Results](${payload.dashboardUrl})`,
    inline: false,
  });

  const embed: DiscordEmbed = {
    title: "⚠️ Performance Regression Detected",
    description: `Eval suite **${payload.suiteName}** detected a regression after recent changes.`,
    color: 0xf59e0b, // Orange/warning color
    fields,
    timestamp: payload.triggeredAt,
    footer: {
      text: "Ducsigr Eval Pipeline",
    },
  };

  return this.sendEmbed(validConfig.webhookUrl, embed);
}

function formatMetricName(metric: string): string {
  const names: Record<string, string> = {
    latency_p50: "Latency P50",
    latency_p95: "Latency P95",
    latency_p99: "Latency P99",
    error_rate: "Error Rate",
    pass_rate: "Pass Rate",
  };
  return names[metric] ?? metric;
}
```

---

## 9. API Design

### 9.1 List Eval Suites

```typescript
// packages/api/src/routers/eval.ts

export const evalRouter = createRouter({
  listSuites: protectedProcedure
    .input(z.object({
      workspaceSlug: z.string(),
      projectId: z.string(),
    }))
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }) => {
      // Verify project access
      const project = await prisma.project.findFirst({
        where: { id: input.projectId, workspaceId: ctx.workspace.id },
      });

      if (!project) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      return prisma.evalSuite.findMany({
        where: { projectId: input.projectId },
        include: {
          _count: { select: { runs: true } },
          runs: {
            take: 1,
            orderBy: { createdAt: "desc" },
            select: { status: true, createdAt: true, isRegression: true },
          },
        },
        orderBy: { createdAt: "desc" },
      });
    }),

  listRuns: protectedProcedure
    .input(z.object({
      workspaceSlug: z.string(),
      suiteId: z.string(),
      limit: z.number().min(1).max(100).default(20),
      cursor: z.string().optional(),
    }))
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }) => {
      // Verify suite access via project
      const suite = await prisma.evalSuite.findUnique({
        where: { id: input.suiteId },
        include: { project: { select: { workspaceId: true } } },
      });

      if (!suite || suite.project.workspaceId !== ctx.workspace.id) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const runs = await prisma.evalRun.findMany({
        where: { suiteId: input.suiteId },
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        orderBy: { createdAt: "desc" },
      });

      let nextCursor: string | undefined;
      if (runs.length > input.limit) {
        const next = runs.pop();
        nextCursor = next?.id;
      }

      return { items: runs, nextCursor };
    }),

  getRunDetail: protectedProcedure
    .input(z.object({
      workspaceSlug: z.string(),
      runId: z.string(),
    }))
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }) => {
      const run = await prisma.evalRun.findUnique({
        where: { id: input.runId },
        include: {
          suite: {
            include: {
              project: { select: { workspaceId: true, name: true } },
            },
          },
        },
      });

      if (!run || run.suite.project.workspaceId !== ctx.workspace.id) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      return run;
    }),
});
```

---

## 10. Performance Considerations

### 10.1 Prompt Execution

- **Parallelism**: Run prompts sequentially to avoid overwhelming target API
- **Timeout**: 30 second default per prompt, configurable per suite
- **Rate Limiting**: 100ms delay between prompts
- **Batch Size**: Process all prompts in single activity call

### 10.2 Workflow Execution

- **Timeout**: 5 minute workflow timeout
- **Retry**: 3 attempts with exponential backoff for activities
- **Idempotency**: Workflow ID includes PR number to prevent duplicates

### 10.3 Database Queries

- **Indexes**: On `suiteId + createdAt`, `prNumber`, `status`
- **Prompt Results**: Stored as JSON to avoid N+1 queries

---

## 11. Testing Strategy

### 11.1 Unit Tests

```typescript
describe("detectRegression", () => {
  it("detects latency regression", () => {});
  it("detects error rate regression", () => {});
  it("detects pass rate drop", () => {});
  it("handles missing baseline gracefully", () => {});
  it("handles zero baseline", () => {});
  it("returns no regression when within threshold", () => {});
});

describe("runExpectedChecks", () => {
  it("checks containsAny", () => {});
  it("checks containsAll", () => {});
  it("checks notContains", () => {});
  it("checks maxLatencyMs", () => {});
  it("checks expectedStatus", () => {});
  it("checks matchesRegex", () => {});
});

describe("calculateMetrics", () => {
  it("calculates correct pass rate", () => {});
  it("calculates weighted pass rate", () => {});
  it("calculates latency percentiles", () => {});
  it("handles empty results", () => {});
});
```

### 11.2 Integration Tests

```typescript
describe("evalPipelineWorkflow", () => {
  it("executes prompts and stores results", async () => {});
  it("detects regression and sends alert", async () => {});
  it("handles prompt timeout", async () => {});
  it("handles API errors gracefully", async () => {});
  it("can be canceled mid-execution", async () => {});
});

describe("GitHub webhook - PR merge", () => {
  it("triggers eval workflow on PR merge", async () => {});
  it("ignores non-merged PRs", async () => {});
  it("handles missing eval suites", async () => {});
  it("handles repository not found", async () => {});
});
```

---

## 12. Files to Create/Modify

### 12.1 New Files

| File | Description |
|------|-------------|
| `packages/db/prisma/migrations/xxx_eval_pipeline.sql` | Schema migration |
| `packages/api/src/schemas/eval.ts` | Zod schemas for eval types |
| `packages/api/src/routers/eval.ts` | tRPC router for eval operations |
| `apps/worker/src/workflows/eval.workflow.ts` | Temporal eval workflow |
| `apps/worker/src/temporal/activities/eval.activities.ts` | Eval activities |

### 12.2 Modified Files

| File | Changes |
|------|---------|
| `packages/db/prisma/schema.prisma` | Add EvalSuite, EvalRun models |
| `packages/api/src/routers/index.ts` | Export evalRouter |
| `packages/api/src/routers/internal.ts` | Add createRegressionAlert |
| `packages/api/src/lib/alerting/adapters/discord.ts` | Add sendRegression method |
| `packages/api/src/lib/alerting/adapters/slack.ts` | Add sendRegression method |
| `packages/api/src/lib/alerting/adapters/gmail.ts` | Add sendRegression method |
| `apps/web/src/app/api/webhooks/github/route.ts` | Handle PR merge event |
| `apps/worker/src/startup/index.ts` | Register eval workflow |
| `docs/WORKFLOWS.md` | Document eval workflow |

### 12.3 Implementation Order

```
1. Schema migration (Prisma)
2. Type definitions (schemas/eval.ts)
3. Activities implementation
4. Workflow implementation
5. Internal procedure for alerts
6. Webhook handler extension
7. Adapter regression methods
8. tRPC router for UI (future)
```

---

## Appendix A: Example Eval Suite Configuration

```json
{
  "name": "Chat API Regression Suite",
  "description": "Tests core chat functionality for performance regressions",
  "endpoint": "https://api.myapp.com/v1/chat",
  "method": "POST",
  "headers": {
    "Authorization": "Bearer ${EVAL_API_KEY}",
    "X-Eval-Run": "true"
  },
  "timeoutMs": 30000,
  "prompts": [
    {
      "id": "greeting",
      "name": "Simple Greeting",
      "text": "Hello, how are you?",
      "expected": {
        "containsAny": ["hello", "hi", "greetings"],
        "maxLatencyMs": 2000
      },
      "weight": 1
    },
    {
      "id": "complex-query",
      "name": "Complex Query",
      "text": "Explain quantum computing in simple terms",
      "expected": {
        "containsAll": ["quantum", "computer"],
        "notContains": ["error", "sorry"],
        "maxLatencyMs": 10000
      },
      "weight": 2
    }
  ],
  "baselineLatencyP95": 1500,
  "baselineErrorRate": 0.01,
  "baselinePassRate": 0.95,
  "latencyRegressionPct": 20,
  "errorRegressionPct": 100,
  "passRateDropPct": 10
}
```

---

## Appendix B: Discord Regression Alert Example

```
┌─────────────────────────────────────────────────────────────────┐
│ ⚠️ Performance Regression Detected                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Eval suite **Chat API Regression Suite** detected a regression  │
│ after recent changes.                                           │
│                                                                 │
│ 📊 Eval Suite          🎯 Project                               │
│ Chat API Suite         My Production App                        │
│                                                                 │
│ 🔀 Triggered By                                                 │
│ PR #42                                                          │
│ Add caching layer to chat endpoint                              │
│ by @jane-developer                                              │
│                                                                 │
│ 📈 Latency P95                     📈 Error Rate                │
│ Increased by 45%                   Increased by 150%            │
│ (baseline: 1.2s → actual: 1.74s)   (baseline: 1% → actual: 2.5%)│
│                                                                 │
│ 🔗 View Details                                                 │
│ [Open Eval Results](https://app.ducsigr.io/...)             │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│ Ducsigr Eval Pipeline                    Dec 14, 3:45 PM    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-12-14 | Senior Architect | Initial specification |
