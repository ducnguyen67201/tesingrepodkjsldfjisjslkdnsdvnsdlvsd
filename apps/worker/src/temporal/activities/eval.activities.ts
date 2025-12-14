// ============================================================
// EVAL ACTIVITIES - Eval Pipeline Processing
// ============================================================
// IMPORTANT: Temporal activities are READ-ONLY for database.
// All mutations go through tRPC internal procedures.
//
// Activities:
// - getEvalSuite (READ)
// - createEvalRun (tRPC mutation)
// - runEvalPrompts (HTTP - external endpoint)
// - calculateMetrics (pure function)
// - detectRegression (pure function)
// - storeResults (tRPC mutation)
// - triggerAlert (tRPC mutation)
// ============================================================

import { prisma, type EvalSuite } from "@cognobserve/db";
import { getInternalCaller } from "@/lib/trpc-caller";
import type {
  EvalPrompt,
  EvalMetrics,
  EvalPromptResult,
  RegressionDetail,
  EvalTriggerType,
  EvalRunStatus,
} from "@cognobserve/api/schemas";

// ============================================================
// TYPES
// ============================================================

export interface EvalSuiteWithProject extends EvalSuite {
  project: { id: string; name: string };
}

export interface RunEvalPromptsInput {
  endpoint: string;
  prompts: EvalPrompt[];
  timeout?: number;
}

export interface RunEvalPromptsOutput {
  results: EvalPromptResult[];
  totalLatencyMs: number;
}

export interface CalculateMetricsInput {
  results: EvalPromptResult[];
  totalPrompts: number;
}

export interface DetectRegressionInput {
  metrics: EvalMetrics;
  baseline: {
    latencyP95: number | null;
    errorRate: number | null;
  };
  thresholds: {
    latencyMultiplier: number;
    errorMultiplier: number;
  };
}

export interface DetectRegressionOutput {
  isRegression: boolean;
  details: RegressionDetail[];
}

// ============================================================
// READ-ONLY ACTIVITIES (Database reads)
// ============================================================

/**
 * Get eval suite configuration (read-only)
 * Returns null if suite not found or disabled
 */
export async function getEvalSuite(
  suiteId: string
): Promise<EvalSuiteWithProject | null> {
  console.log(`[Activity:getEvalSuite] Fetching suite: ${suiteId}`);

  const suite = await prisma.evalSuite.findUnique({
    where: { id: suiteId },
    include: {
      project: {
        select: { id: true, name: true },
      },
    },
  });

  if (!suite) {
    console.log(`[Activity:getEvalSuite] Suite not found: ${suiteId}`);
    return null;
  }

  if (!suite.enabled) {
    console.log(`[Activity:getEvalSuite] Suite disabled: ${suiteId}`);
    return null;
  }

  console.log(`[Activity:getEvalSuite] Found suite: ${suite.name}`);
  return suite;
}

// ============================================================
// MUTATION ACTIVITIES (via tRPC internal)
// ============================================================

/**
 * Create a new eval run record
 * Uses tRPC internal procedure for mutation
 */
export async function createEvalRun(input: {
  suiteId: string;
  triggeredBy: EvalTriggerType;
  triggerRef?: string;
  totalPrompts: number;
}): Promise<string> {
  console.log(`[Activity:createEvalRun] Creating run for suite: ${input.suiteId}`);

  const caller = getInternalCaller();
  const result = await caller.internal.createEvalRun({
    suiteId: input.suiteId,
    triggeredBy: input.triggeredBy,
    triggerRef: input.triggerRef,
    totalPrompts: input.totalPrompts,
  });

  console.log(`[Activity:createEvalRun] Created run: ${result.runId}`);
  return result.runId;
}

/**
 * Store eval run results
 * Uses tRPC internal procedure for mutation
 */
export async function storeResults(input: {
  runId: string;
  status: EvalRunStatus;
  metrics: EvalMetrics;
  isRegression: boolean;
  regressionDetails?: RegressionDetail[];
}): Promise<void> {
  console.log(`[Activity:storeResults] Storing results for run: ${input.runId}`);

  const caller = getInternalCaller();
  await caller.internal.updateEvalRun({
    runId: input.runId,
    status: input.status,
    passedPrompts: input.metrics.passedPrompts,
    failedPrompts: input.metrics.failedPrompts,
    latencyP95: input.metrics.latencyP95,
    errorRate: input.metrics.errorRate,
    isRegression: input.isRegression,
    regressionDetails: input.regressionDetails,
  });

  console.log(`[Activity:storeResults] Stored results with status: ${input.status}`);
}

/**
 * Trigger regression alert notification
 * Uses tRPC internal procedure for mutation
 */
export async function triggerAlert(input: {
  suiteId: string;
  runId: string;
  regressionDetails: RegressionDetail[];
}): Promise<{ sentCount: number; failedCount: number }> {
  console.log(`[Activity:triggerAlert] Triggering alert for run: ${input.runId}`);

  const caller = getInternalCaller();
  const result = await caller.internal.dispatchRegressionAlert({
    suiteId: input.suiteId,
    runId: input.runId,
    regressionDetails: input.regressionDetails,
  });

  console.log(`[Activity:triggerAlert] Sent to ${result.sentCount} channels`);
  return { sentCount: result.sentCount, failedCount: result.failedCount };
}

// ============================================================
// HTTP ACTIVITIES (External endpoint calls)
// ============================================================

/**
 * Run eval prompts against the configured endpoint
 * Executes each prompt and collects results
 */
export async function runEvalPrompts(
  input: RunEvalPromptsInput
): Promise<RunEvalPromptsOutput> {
  console.log(
    `[Activity:runEvalPrompts] Running ${input.prompts.length} prompts against ${input.endpoint}`
  );

  const results: EvalPromptResult[] = [];
  let totalLatencyMs = 0;
  const timeout = input.timeout ?? 30000; // Default 30s timeout

  for (const prompt of input.prompts) {
    const startTime = Date.now();
    let result: EvalPromptResult;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(input.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: prompt.content,
          promptId: prompt.id,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const latencyMs = Date.now() - startTime;
      totalLatencyMs += latencyMs;

      if (!response.ok) {
        result = {
          promptId: prompt.id,
          promptName: prompt.name,
          success: false,
          latencyMs,
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      } else {
        const responseText = await response.text();

        // Check assertions
        const assertions: Array<{
          type: string;
          passed: boolean;
          expected?: string;
          actual?: string;
        }> = [];

        // Check expected pattern if defined
        if (prompt.expectedPattern) {
          const regex = new RegExp(prompt.expectedPattern, "i");
          const patternPassed = regex.test(responseText);
          assertions.push({
            type: "pattern",
            passed: patternPassed,
            expected: prompt.expectedPattern,
            actual: responseText.slice(0, 100),
          });
        }

        // Check latency if defined
        if (prompt.maxLatencyMs) {
          const latencyPassed = latencyMs <= prompt.maxLatencyMs;
          assertions.push({
            type: "latency",
            passed: latencyPassed,
            expected: `<= ${prompt.maxLatencyMs}ms`,
            actual: `${latencyMs}ms`,
          });
        }

        const allAssertionsPassed =
          assertions.length === 0 || assertions.every((a) => a.passed);

        result = {
          promptId: prompt.id,
          promptName: prompt.name,
          success: allAssertionsPassed,
          latencyMs,
          response: responseText.slice(0, 1000), // Truncate for storage
          assertions,
        };
      }
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      totalLatencyMs += latencyMs;

      result = {
        promptId: prompt.id,
        promptName: prompt.name,
        success: false,
        latencyMs,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error executing prompt",
      };
    }

    results.push(result);
  }

  console.log(
    `[Activity:runEvalPrompts] Completed ${results.length} prompts, total latency: ${totalLatencyMs}ms`
  );
  return { results, totalLatencyMs };
}

// ============================================================
// PURE FUNCTIONS (Computations)
// ============================================================

/**
 * Calculate metrics from eval results
 * Note: Must be async for Temporal proxyActivities compatibility
 */
export async function calculateMetrics(input: CalculateMetricsInput): Promise<EvalMetrics> {
  console.log(
    `[Activity:calculateMetrics] Processing ${input.results.length} results`
  );

  const { results, totalPrompts } = input;

  // Count passed/failed
  const passedPrompts = results.filter((r) => r.success).length;
  const failedPrompts = results.filter((r) => !r.success).length;

  // Calculate latency P95
  const latencies = results
    .map((r) => r.latencyMs)
    .filter((l): l is number => l !== undefined)
    .sort((a, b) => a - b);

  let latencyP95: number | undefined;
  if (latencies.length > 0) {
    // Clamp index to valid range for small arrays
    const p95Index = Math.min(
      Math.floor(latencies.length * 0.95),
      latencies.length - 1
    );
    latencyP95 = latencies[p95Index];
  }

  // Calculate error rate
  const errorRate = totalPrompts > 0 ? (failedPrompts / totalPrompts) * 100 : 0;

  const metrics: EvalMetrics = {
    totalPrompts,
    passedPrompts,
    failedPrompts,
    latencyP95,
    errorRate,
  };

  console.log(
    `[Activity:calculateMetrics] Metrics: ${passedPrompts}/${totalPrompts} passed, P95=${latencyP95}ms, error=${errorRate.toFixed(1)}%`
  );
  return metrics;
}

/**
 * Detect regression by comparing metrics to baseline
 * Note: Must be async for Temporal proxyActivities compatibility
 */
export async function detectRegression(
  input: DetectRegressionInput
): Promise<DetectRegressionOutput> {
  console.log(`[Activity:detectRegression] Comparing metrics to baseline`);

  const { metrics, baseline, thresholds } = input;
  const details: RegressionDetail[] = [];

  // Check latency regression
  if (baseline.latencyP95 !== null && metrics.latencyP95 !== undefined) {
    const ratio = metrics.latencyP95 / baseline.latencyP95;
    if (ratio > thresholds.latencyMultiplier) {
      const changePercent = (ratio - 1) * 100;
      details.push({
        metric: "latency_p95",
        baseline: baseline.latencyP95,
        current: metrics.latencyP95,
        threshold: thresholds.latencyMultiplier,
        changePercent,
        message: `P95 latency increased by ${changePercent.toFixed(1)}% (${baseline.latencyP95}ms → ${metrics.latencyP95}ms)`,
      });
    }
  }

  // Check error rate regression
  if (baseline.errorRate !== null && metrics.errorRate !== undefined) {
    // Handle zero baseline specially
    if (baseline.errorRate === 0 && metrics.errorRate > 0) {
      details.push({
        metric: "error_rate",
        baseline: baseline.errorRate,
        current: metrics.errorRate,
        threshold: thresholds.errorMultiplier,
        changePercent: 100,
        message: `Error rate increased from 0% to ${metrics.errorRate.toFixed(1)}%`,
      });
    } else if (baseline.errorRate > 0) {
      const ratio = metrics.errorRate / baseline.errorRate;
      if (ratio > thresholds.errorMultiplier) {
        const changePercent = (ratio - 1) * 100;
        details.push({
          metric: "error_rate",
          baseline: baseline.errorRate,
          current: metrics.errorRate,
          threshold: thresholds.errorMultiplier,
          changePercent,
          message: `Error rate increased by ${changePercent.toFixed(1)}% (${baseline.errorRate.toFixed(1)}% → ${metrics.errorRate.toFixed(1)}%)`,
        });
      }
    }
  }

  const isRegression = details.length > 0;

  console.log(
    `[Activity:detectRegression] Regression: ${isRegression}, details: ${details.length}`
  );
  return { isRegression, details };
}
