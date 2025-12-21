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
  startChild,
} from "@temporalio/workflow";
import type * as activities from "../temporal/activities";
import type { AlertWorkflowInput, AlertWorkflowState } from "../temporal/types";
import { ACTIVITY_RETRY, WORKFLOW_TIMEOUTS } from "@cognobserve/shared";
import { rcaAnalysisWorkflow, type RCAAnalysisWorkflowInput } from "./rca-analysis.workflow";

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
    return {
      should: true,
      reason: `Run duration ${Math.floor(runDuration / 60000)}min`,
    };
  }

  // 4. Evaluation count threshold (backup)
  if (state.evaluationsThisRun >= MAX_EVALUATIONS_PER_RUN) {
    return { should: true, reason: `Evaluations ${state.evaluationsThisRun}` };
  }

  return { should: false, reason: "" };
}

// ============================================================
// Helper: Single Evaluation Cycle
// ============================================================

/**
 * Single evaluation cycle: evaluate → transition → notify → RCA if needed
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
  const transition = await transitionAlertState(
    input.alertId,
    result.conditionMet
  );

  log.info("State transition", {
    alertId: input.alertId,
    previousState: transition.previousState,
    newState: transition.newState,
    shouldNotify: transition.shouldNotify,
  });

  // Step 3: Dispatch notification if needed
  if (transition.shouldNotify) {
    const dispatchResult = await dispatchNotification(
      input.alertId,
      transition.newState,
      result.currentValue,
      result.threshold
    );

    log.info("Notification dispatched", {
      alertId: input.alertId,
      success: dispatchResult.success,
      state: transition.newState,
      alertHistoryId: dispatchResult.alertHistoryId,
    });

    // Step 4: Trigger RCA workflow for FIRING state (non-blocking)
    if (
      dispatchResult.success &&
      transition.newState === "FIRING" &&
      dispatchResult.alertHistoryId &&
      dispatchResult.projectId
    ) {
      const now = new Date();
      const windowMins = dispatchResult.windowMins ?? 5;
      const windowEnd = now.toISOString();
      const windowStart = new Date(now.getTime() - windowMins * 60 * 1000).toISOString();

      const rcaInput: RCAAnalysisWorkflowInput = {
        alertId: input.alertId,
        alertHistoryId: dispatchResult.alertHistoryId,
        alertName: dispatchResult.alertName ?? input.alertName,
        alertType: (dispatchResult.alertType ?? "ERROR_RATE") as RCAAnalysisWorkflowInput["alertType"],
        alertValue: result.currentValue,
        threshold: result.threshold,
        severity: (dispatchResult.severity ?? input.severity) as RCAAnalysisWorkflowInput["severity"],
        projectId: dispatchResult.projectId,
        projectName: dispatchResult.projectName ?? "Unknown",
        windowStart,
        windowEnd,
        triggeredBy: "automatic",
      };

      log.info("Starting RCA analysis workflow", {
        alertId: input.alertId,
        alertHistoryId: dispatchResult.alertHistoryId,
      });

      // Start RCA as child workflow (fire-and-forget, don't wait)
      await startChild(rcaAnalysisWorkflow, {
        workflowId: `rca-${dispatchResult.alertHistoryId}`,
        args: [rcaInput],
        parentClosePolicy: "ABANDON", // Let RCA complete even if parent restarts
      });

      log.info("RCA workflow started", {
        workflowId: `rca-${dispatchResult.alertHistoryId}`,
      });
    }
  }
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
