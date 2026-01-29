// ============================================================
// SCORE WORKFLOW - Orchestrates score ingestion
// ============================================================
// Validates scores against configs and persists them.
// Used for SDK-submitted scores.
// ============================================================

import { proxyActivities, ApplicationFailure, log } from "@temporalio/workflow";
import type * as activities from "../temporal/activities";
import type { ScoreWorkflowInput, ScoreWorkflowResult, ScoreDataType } from "../temporal/types";
import { ACTIVITY_RETRY, WORKFLOW_TIMEOUTS } from "@ducsigr/shared";

// Proxy activities with retry configuration
const { persistScore, validateScoreConfig } = proxyActivities<typeof activities>({
  startToCloseTimeout: WORKFLOW_TIMEOUTS.SCORE.ACTIVITY,
  retry: ACTIVITY_RETRY.DEFAULT,
});

/**
 * Score ingestion workflow.
 *
 * Steps:
 * 1. Validate against config if configId provided (fails if invalid)
 * 2. Persist score to database
 *
 * @param input - Score data from ingest service
 * @returns Result with score ID and data type
 */
export async function scoreWorkflow(
  input: ScoreWorkflowInput
): Promise<ScoreWorkflowResult> {
  log.info("Starting score workflow", {
    scoreId: input.id,
    name: input.name,
    hasConfig: !!input.configId,
  });

  // Step 1: Validate against config if provided
  if (input.configId) {
    const validation = await validateScoreConfig(input.configId, input.value);

    if (!validation.valid) {
      log.error("Score validation failed", {
        scoreId: input.id,
        configId: input.configId,
        error: validation.error,
      });

      // Throw non-retryable error for validation failures
      throw ApplicationFailure.create({
        type: "VALIDATION_ERROR",
        message: validation.error ?? "Score validation failed",
        nonRetryable: true, // Don't retry validation failures
      });
    }

    log.info("Score validation passed", { scoreId: input.id });
  }

  // Step 2: Persist score
  const scoreId = await persistScore(input);

  // Infer data type for result
  const dataType = inferDataType(input.value);

  log.info("Score workflow completed", {
    scoreId,
    dataType,
  });

  return {
    scoreId,
    dataType,
  };
}

/**
 * Infer score data type from value
 */
function inferDataType(value: unknown): ScoreDataType {
  if (typeof value === "number") return "NUMERIC";
  if (typeof value === "boolean") return "BOOLEAN";
  return "CATEGORICAL";
}
