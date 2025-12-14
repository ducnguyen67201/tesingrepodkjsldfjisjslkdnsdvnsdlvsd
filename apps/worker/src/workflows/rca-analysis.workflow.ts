// ============================================================
// RCA ANALYSIS WORKFLOW - Manual/Automatic RCA Generation
// ============================================================
// This workflow performs root cause analysis for alert triggers.
// Called from:
// - Manual trigger via API (triggerRCA procedure)
// - Automatic trigger from alert evaluation (future)
//
// Steps:
// 1. Analyze traces in the alert window
// 2. Correlate with recent code changes
// 3. Generate LLM-based RCA report
// 4. Store RCA results
// ============================================================

import { proxyActivities, log } from "@temporalio/workflow";
import type * as activities from "../temporal/activities";
import type {
  RCAAlertType,
  AlertSeverity,
  TraceAnalysisOutput,
  CodeCorrelationOutput,
  RCAReport,
} from "../temporal/types";
import { ACTIVITY_RETRY, WORKFLOW_TIMEOUTS } from "@cognobserve/shared";

// ============================================================
// Workflow Input Type
// ============================================================

/**
 * Input for RCA Analysis Workflow
 */
export interface RCAAnalysisWorkflowInput {
  alertId: string;
  alertHistoryId: string;
  alertName: string;
  alertType: RCAAlertType;
  alertValue: number;
  threshold: number;
  severity: AlertSeverity;
  projectId: string;
  projectName: string;
  windowStart: string; // ISO 8601
  windowEnd: string; // ISO 8601
  triggeredBy: "automatic" | "manual";
  userId?: string; // Who triggered (for manual)
}

// ============================================================
// Activity Proxies
// ============================================================

const { analyzeTraces, correlateCodeChanges, generateRCA, storeRCA } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: WORKFLOW_TIMEOUTS.ALERT.ACTIVITY,
    retry: ACTIVITY_RETRY.ALERT,
  });

// ============================================================
// Workflow Implementation
// ============================================================

/**
 * RCA Analysis Workflow
 *
 * Performs end-to-end root cause analysis for an alert trigger.
 */
export async function rcaAnalysisWorkflow(
  input: RCAAnalysisWorkflowInput
): Promise<void> {
  log.info("Starting RCA analysis workflow", {
    alertId: input.alertId,
    alertHistoryId: input.alertHistoryId,
    triggeredBy: input.triggeredBy,
    alertType: input.alertType,
  });

  // Step 1: Analyze traces in the alert window
  log.info("Step 1: Analyzing traces", {
    projectId: input.projectId,
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
  });

  let traceAnalysis: TraceAnalysisOutput;
  try {
    traceAnalysis = await analyzeTraces({
      projectId: input.projectId,
      alertType: input.alertType,
      alertValue: input.alertValue,
      threshold: input.threshold,
      windowStart: input.windowStart,
      windowEnd: input.windowEnd,
    });
  } catch (error) {
    log.error("Trace analysis failed", { error });
    throw error;
  }

  log.info("Trace analysis complete", {
    totalTraces: traceAnalysis.summary.totalTraces,
    errorCount: traceAnalysis.summary.errorCount,
    errorPatterns: traceAnalysis.errorPatterns.length,
  });

  // Step 2: Correlate with recent code changes
  log.info("Step 2: Correlating code changes", {
    projectId: input.projectId,
    alertTriggeredAt: input.windowEnd,
  });

  let codeCorrelation: CodeCorrelationOutput;
  try {
    codeCorrelation = await correlateCodeChanges({
      projectId: input.projectId,
      traceAnalysis,
      alertTriggeredAt: input.windowEnd,
      lookbackDays: 7,
    });
  } catch (error) {
    log.error("Code correlation failed", { error });
    throw error;
  }

  log.info("Code correlation complete", {
    hasRepository: codeCorrelation.hasRepository,
    suspectedCommits: codeCorrelation.suspectedCommits.length,
    suspectedPRs: codeCorrelation.suspectedPRs.length,
    relevantCodeChunks: codeCorrelation.relevantCodeChunks.length,
  });

  // Step 3: Generate LLM-based RCA report
  log.info("Step 3: Generating RCA report");

  const windowMins = Math.round(
    (new Date(input.windowEnd).getTime() -
      new Date(input.windowStart).getTime()) /
      60000
  );

  let rcaReport: RCAReport;
  try {
    rcaReport = await generateRCA({
      alertContext: {
        alertId: input.alertId,
        alertHistoryId: input.alertHistoryId,
        alertName: input.alertName,
        projectId: input.projectId,
        projectName: input.projectName,
        alertType: input.alertType,
        severity: input.severity,
        currentValue: input.alertValue,
        threshold: input.threshold,
        triggeredAt: input.windowEnd,
        windowMins,
      },
      traceAnalysis,
      codeCorrelation,
    });
  } catch (error) {
    log.error("RCA generation failed", { error });
    throw error;
  }

  log.info("RCA report generated", {
    hypothesis: rcaReport.hypothesis.substring(0, 100),
    confidence: rcaReport.confidence,
    category: rcaReport.rootCause.category,
  });

  // Step 4: Store RCA results
  log.info("Step 4: Storing RCA results");

  try {
    await storeRCA({
      alertHistoryId: input.alertHistoryId,
      rcaReport,
      alertContext: {
        alertId: input.alertId,
        alertHistoryId: input.alertHistoryId,
        alertName: input.alertName,
        projectId: input.projectId,
        projectName: input.projectName,
        alertType: input.alertType,
        severity: input.severity,
        currentValue: input.alertValue,
        threshold: input.threshold,
        triggeredAt: input.windowEnd,
        windowMins,
      },
      traceAnalysisSummary: {
        totalTraces: traceAnalysis.summary.totalTraces,
        totalSpans: traceAnalysis.summary.totalSpans,
        errorRate: traceAnalysis.summary.errorRate,
        errorPatternCount: traceAnalysis.errorPatterns.length,
        anomalyCount: traceAnalysis.anomalies.length,
      },
    });
  } catch (error) {
    log.error("RCA storage failed", { error });
    throw error;
  }

  log.info("RCA analysis workflow complete", {
    alertId: input.alertId,
    alertHistoryId: input.alertHistoryId,
    confidence: rcaReport.confidence,
  });
}
