/**
 * Store RCA Activity
 *
 * Persists RCA results via internal tRPC procedure.
 * Extracts commit SHAs and PR numbers from relatedChanges.
 *
 * This activity performs DB mutations via internal.storeRCA procedure,
 * following the pattern: Activities are READ-ONLY, mutations go through tRPC.
 */

import { getInternalCaller } from "@/lib/trpc-caller";
import { getLogger } from "@cognobserve/shared/llm";
import type {
  RCAReport,
  AlertContext,
  StoreRCAOutput,
} from "@cognobserve/api/schemas";

const logger = getLogger();

// ============================================================
// TYPES
// ============================================================

/**
 * Input for storeRCA activity
 * Extends the tRPC input with activity-specific processing
 */
export interface StoreRCAActivityInput {
  /** AlertHistory ID that triggered this RCA */
  alertHistoryId: string;
  /** Complete RCA report from generateRCA activity */
  rcaReport: RCAReport;
  /** Alert context for traceability */
  alertContext?: AlertContext;
  /** Trace analysis summary for debugging */
  traceAnalysisSummary?: {
    totalTraces: number;
    totalSpans: number;
    errorRate: number;
    errorPatternCount: number;
    anomalyCount: number;
  };
}

// Re-export output type from schemas
export type { StoreRCAOutput };

// ============================================================
// ACTIVITY
// ============================================================

/**
 * Persist RCA result via internal tRPC procedure
 *
 * @param input - RCA data to store
 * @returns Created RCA record info
 */
export async function storeRCA(
  input: StoreRCAActivityInput
): Promise<StoreRCAOutput> {
  logger.info("[storeRCA] Persisting RCA", {
    alertHistoryId: input.alertHistoryId,
    confidence: input.rcaReport.confidence,
    model: input.rcaReport.llmMetadata.model,
  });

  const caller = getInternalCaller();

  // Extract suspected commits from relatedChanges
  const suspectedCommitShas = input.rcaReport.relatedChanges
    .filter((change) => change.type === "commit")
    .map((change) => change.changeId);

  // Extract suspected PRs from relatedChanges
  const suspectedPRNumbers = input.rcaReport.relatedChanges
    .filter((change) => change.type === "pr")
    .map((change) => change.changeId);

  logger.debug("[storeRCA] Extracted changes", {
    commits: suspectedCommitShas.length,
    prs: suspectedPRNumbers.length,
  });

  // Call internal procedure to persist
  const result = await caller.internal.storeRCA({
    alertHistoryId: input.alertHistoryId,
    rcaReport: input.rcaReport,
    suspectedCommitShas,
    suspectedPRNumbers,
    alertContext: input.alertContext,
    traceAnalysisSummary: input.traceAnalysisSummary,
  });

  logger.info("[storeRCA] RCA stored successfully", {
    rcaId: result.rcaId,
    alertId: result.alertId,
    tokensUsed: input.rcaReport.llmMetadata.tokensUsed,
    estimatedCost: input.rcaReport.llmMetadata.estimatedCost,
    latencyMs: input.rcaReport.llmMetadata.latencyMs,
  });

  return result;
}
