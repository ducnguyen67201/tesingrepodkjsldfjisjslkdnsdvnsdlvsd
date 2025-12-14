// ============================================================
// EVAL PIPELINE WORKFLOW - Regression Detection
// ============================================================
// This workflow runs eval suites against API endpoints.
// Triggered by:
// - PR merge (via GitHub webhook)
// - Manual trigger (via API)
// - Scheduled runs (future)
//
// Steps:
// 1. Get eval suite configuration
// 2. Create eval run record
// 3. Execute prompts against endpoint
// 4. Calculate metrics (latency, error rate, pass rate)
// 5. Detect regression vs baseline
// 6. Store results
// 7. Trigger alert if regression detected
// ============================================================

import { proxyActivities, log } from "@temporalio/workflow";
import type * as activities from "../temporal/activities";
import type { EvalPrompt, EvalRunStatus } from "@cognobserve/api/schemas";
import { ACTIVITY_RETRY, WORKFLOW_TIMEOUTS } from "@cognobserve/shared";

// ============================================================
// Workflow Input Type
// ============================================================

/**
 * Input for Eval Pipeline Workflow
 */
export interface EvalWorkflowInput {
  projectId: string;
  suiteId: string;
  triggeredBy: "pr_merge" | "manual" | "scheduled";
  triggerRef?: string; // PR number or commit SHA
}

/**
 * Output from Eval Pipeline Workflow
 */
export interface EvalWorkflowOutput {
  runId: string;
  status: EvalRunStatus;
  isRegression: boolean;
  passedPrompts: number;
  failedPrompts: number;
  latencyP95?: number;
  errorRate?: number;
}

// ============================================================
// Activity Proxies
// ============================================================

const {
  getEvalSuite,
  createEvalRun,
  runEvalPrompts,
  calculateMetrics,
  detectRegression,
  storeResults,
  triggerAlert,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: WORKFLOW_TIMEOUTS.ALERT.ACTIVITY,
  retry: ACTIVITY_RETRY.ALERT,
});

// ============================================================
// Workflow Implementation
// ============================================================

/**
 * Eval Pipeline Workflow
 *
 * Executes eval prompts, calculates metrics, and detects regression.
 */
export async function evalPipelineWorkflow(
  input: EvalWorkflowInput
): Promise<EvalWorkflowOutput> {
  log.info("Starting eval pipeline workflow", {
    projectId: input.projectId,
    suiteId: input.suiteId,
    triggeredBy: input.triggeredBy,
    triggerRef: input.triggerRef,
  });

  // Step 1: Get eval suite configuration
  log.info("Step 1: Getting eval suite configuration");
  const suite = await getEvalSuite(input.suiteId);

  if (!suite) {
    log.warn("Eval suite not found or disabled, aborting workflow", {
      suiteId: input.suiteId,
    });
    // Return early - suite doesn't exist or is disabled
    return {
      runId: "",
      status: "FAILED",
      isRegression: false,
      passedPrompts: 0,
      failedPrompts: 0,
    };
  }

  // Parse prompts from JSON
  const prompts = suite.prompts as EvalPrompt[];
  const totalPrompts = prompts.length;

  log.info("Eval suite loaded", {
    suiteName: suite.name,
    promptCount: totalPrompts,
    endpoint: suite.endpoint,
  });

  // Step 2: Create eval run record
  log.info("Step 2: Creating eval run record");
  const runId = await createEvalRun({
    suiteId: input.suiteId,
    triggeredBy: input.triggeredBy,
    triggerRef: input.triggerRef,
    totalPrompts,
  });

  log.info("Eval run created", { runId });

  try {
    // Step 3: Execute prompts against endpoint
    log.info("Step 3: Running eval prompts against endpoint", {
      endpoint: suite.endpoint,
      promptCount: totalPrompts,
    });

    const { results, totalLatencyMs } = await runEvalPrompts({
      endpoint: suite.endpoint,
      prompts,
      timeout: 30000, // 30 second timeout per prompt
    });

    log.info("Eval prompts completed", {
      totalLatencyMs,
      resultsCount: results.length,
    });

    // Step 4: Calculate metrics
    log.info("Step 4: Calculating metrics");
    const metrics = calculateMetrics({
      results,
      totalPrompts,
    });

    log.info("Metrics calculated", {
      passedPrompts: metrics.passedPrompts,
      failedPrompts: metrics.failedPrompts,
      latencyP95: metrics.latencyP95,
      errorRate: metrics.errorRate,
    });

    // Step 5: Detect regression vs baseline
    log.info("Step 5: Detecting regression");
    const { isRegression, details: regressionDetails } = detectRegression({
      metrics,
      baseline: {
        latencyP95: suite.baselineLatencyP95,
        errorRate: suite.baselineErrorRate,
      },
      thresholds: {
        latencyMultiplier: suite.latencyRegressionThreshold,
        errorMultiplier: suite.errorRegressionThreshold,
      },
    });

    log.info("Regression detection complete", {
      isRegression,
      regressionDetailsCount: regressionDetails.length,
    });

    // Determine final status
    let status: EvalRunStatus;
    if (metrics.failedPrompts > 0 && !isRegression) {
      status = "FAILED";
    } else if (isRegression) {
      status = "REGRESSION_DETECTED";
    } else {
      status = "PASSED";
    }

    // Step 6: Store results
    log.info("Step 6: Storing results", { status });
    await storeResults({
      runId,
      status,
      metrics,
      isRegression,
      regressionDetails: regressionDetails.length > 0 ? regressionDetails : undefined,
    });

    log.info("Results stored");

    // Step 7: Trigger alert if regression detected
    if (isRegression && regressionDetails.length > 0) {
      log.info("Step 7: Triggering regression alert");
      const alertResult = await triggerAlert({
        suiteId: input.suiteId,
        runId,
        regressionDetails,
      });

      log.info("Alert triggered", {
        sentCount: alertResult.sentCount,
        failedCount: alertResult.failedCount,
      });
    } else {
      log.info("Step 7: No regression, skipping alert");
    }

    log.info("Eval pipeline workflow complete", {
      runId,
      status,
      isRegression,
      passedPrompts: metrics.passedPrompts,
      failedPrompts: metrics.failedPrompts,
    });

    return {
      runId,
      status,
      isRegression,
      passedPrompts: metrics.passedPrompts,
      failedPrompts: metrics.failedPrompts,
      latencyP95: metrics.latencyP95,
      errorRate: metrics.errorRate,
    };
  } catch (error) {
    // Handle workflow failure - store failed status
    log.error("Eval pipeline workflow failed", { error, runId });

    await storeResults({
      runId,
      status: "FAILED",
      metrics: {
        totalPrompts,
        passedPrompts: 0,
        failedPrompts: totalPrompts,
        errorRate: 100,
      },
      isRegression: false,
    });

    throw error;
  }
}
