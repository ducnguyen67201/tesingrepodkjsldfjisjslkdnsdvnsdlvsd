// ============================================================
// EXPERIMENT ANALYSIS WORKFLOW - A/B Testing Comparison
// ============================================================
// This workflow analyzes prompt A/B experiments by comparing
// variant metrics and using LLM to determine the winner.
//
// Triggered by:
// - Starting an experiment (via experiments router)
//
// Steps:
// 1. Mark analysis as started
// 2. Get experiment with variant details
// 3. Aggregate metrics for variant A
// 4. Aggregate metrics for variant B
// 5. Generate LLM comparison analysis
// 6. Store results with winner determination
// ============================================================

import { proxyActivities, log } from "@temporalio/workflow";
import type * as activities from "../temporal/activities";
import { ACTIVITY_RETRY, WORKFLOW_TIMEOUTS } from "@ducsigr/shared";
import type {
  ExperimentAnalysisWorkflowInput,
  LLMComparisonResult,
} from "@ducsigr/api/schemas";

// ============================================================
// Workflow Output Type
// ============================================================

export interface ExperimentAnalysisOutput {
  experimentId: string;
  status: "completed" | "failed";
  winnerVariantId: string | null;
  winnerVariantName: "A" | "B" | null;
  winnerConfidence: number;
  sufficientData: boolean;
  error?: string;
}

// ============================================================
// Activity Proxies
// ============================================================

const {
  getExperimentWithVariants,
  aggregateVariantMetrics,
  markAnalysisStarted,
  generateComparisonAnalysis,
  storeExperimentAnalysis,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: WORKFLOW_TIMEOUTS.ALERT.ACTIVITY,
  retry: ACTIVITY_RETRY.ALERT,
});

// ============================================================
// Workflow Implementation
// ============================================================

/**
 * Experiment Analysis Workflow
 *
 * Analyzes an A/B experiment by comparing variant metrics and
 * using LLM to determine which prompt performs better.
 */
export async function experimentAnalysisWorkflow(
  input: ExperimentAnalysisWorkflowInput
): Promise<ExperimentAnalysisOutput> {
  log.info("Starting experiment analysis workflow", {
    experimentId: input.experimentId,
    projectId: input.projectId,
  });

  try {
    // Step 1: Mark analysis as started
    log.info("Step 1: Marking analysis as started");
    await markAnalysisStarted(input.experimentId);

    // Step 2: Get experiment with variant details
    log.info("Step 2: Getting experiment with variants");
    const experiment = await getExperimentWithVariants(input.experimentId);

    if (!experiment) {
      log.error("Experiment not found", { experimentId: input.experimentId });

      await storeExperimentAnalysis({
        experimentId: input.experimentId,
        status: "failed",
        error: "Experiment not found or missing variants",
      });

      return {
        experimentId: input.experimentId,
        status: "failed",
        winnerVariantId: null,
        winnerVariantName: null,
        winnerConfidence: 0,
        sufficientData: false,
        error: "Experiment not found",
      };
    }

    log.info("Experiment loaded", {
      experimentName: experiment.name,
      variantA: experiment.variantA.promptName,
      variantB: experiment.variantB.promptName,
    });

    // Step 3 & 4: Aggregate metrics for both variants (parallel)
    log.info("Steps 3-4: Aggregating metrics for both variants");

    const [metricsA, metricsB] = await Promise.all([
      aggregateVariantMetrics(experiment.variantA.id, experiment.variantA),
      aggregateVariantMetrics(experiment.variantB.id, experiment.variantB),
    ]);

    log.info("Metrics aggregated", {
      variantASpans: metricsA.totalSpans,
      variantBSpans: metricsB.totalSpans,
    });

    // Step 5: Generate LLM comparison analysis
    log.info("Step 5: Generating LLM comparison analysis");

    const comparison: LLMComparisonResult = await generateComparisonAnalysis({
      variantA: metricsA,
      variantB: metricsB,
      experimentName: experiment.name,
    });

    log.info("Comparison analysis complete", {
      winner: comparison.winner.variantName,
      confidence: comparison.confidence,
      sufficientData: comparison.sufficientData,
    });

    // Determine winner variant ID
    let winnerVariantId: string | null = null;
    if (comparison.winner.variantName === "A") {
      winnerVariantId = experiment.variantA.id;
    } else if (comparison.winner.variantName === "B") {
      winnerVariantId = experiment.variantB.id;
    }

    // Step 6: Store results
    log.info("Step 6: Storing analysis results");

    const analysisResult = {
      analyzedAt: new Date().toISOString(),
      variantMetrics: {
        A: metricsA,
        B: metricsB,
      },
      comparison,
    };

    await storeExperimentAnalysis({
      experimentId: input.experimentId,
      status: "completed",
      result: analysisResult,
      winnerVariantId,
      winnerConfidence: comparison.confidence,
    });

    log.info("Experiment analysis workflow complete", {
      experimentId: input.experimentId,
      winner: comparison.winner.variantName,
      confidence: comparison.confidence,
    });

    return {
      experimentId: input.experimentId,
      status: "completed",
      winnerVariantId,
      winnerVariantName: comparison.winner.variantName,
      winnerConfidence: comparison.confidence,
      sufficientData: comparison.sufficientData,
    };
  } catch (error) {
    // Handle workflow failure
    log.error("Experiment analysis workflow failed", {
      error,
      experimentId: input.experimentId,
    });

    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    await storeExperimentAnalysis({
      experimentId: input.experimentId,
      status: "failed",
      error: errorMessage,
    });

    return {
      experimentId: input.experimentId,
      status: "failed",
      winnerVariantId: null,
      winnerVariantName: null,
      winnerConfidence: 0,
      sufficientData: false,
      error: errorMessage,
    };
  }
}
