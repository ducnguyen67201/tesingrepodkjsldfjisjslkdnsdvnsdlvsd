// ============================================================
// SCORE ACTIVITIES - Orchestration for score processing
// ============================================================
// IMPORTANT: Temporal activities are READ-ONLY for database.
// All mutations go through tRPC internal procedures.
//
// TODO(Issue #104): Implement when Score/ScoreConfig models are added
// ============================================================

import { prisma } from "@ducsigr/db";
import { getInternalCaller } from "@/lib/trpc-caller";
import type { ScoreWorkflowInput, ScoreValidationResult, ScoreDataType } from "../types";

/**
 * Persist a score via internal tRPC.
 * Temporal activities are read-only - mutations go through tRPC.
 *
 * @returns The score ID that was persisted
 *
 * TODO(Issue #104): Implement when Score model is added to schema
 */
export async function persistScore(input: ScoreWorkflowInput): Promise<string> {
  console.log(`[Activity:persistScore] Processing score: ${input.id} (${input.name})`);

  const caller = getInternalCaller();

  const result = await caller.internal.ingestScore({
    id: input.id,
    projectId: input.projectId,
    configId: input.configId,
    traceId: input.traceId,
    spanId: input.spanId,
    sessionId: input.sessionId,
    trackedUserId: input.trackedUserId,
    name: input.name,
    value: input.value,
    comment: input.comment,
    metadata: input.metadata,
  });

  console.log(`[Activity:persistScore] Score ${input.id} persisted via tRPC`);
  return result.scoreId;
}

/**
 * Validate a score value against its config bounds.
 * This is a read-only operation - just validates without mutating.
 *
 * @returns Validation result with valid flag and optional error message
 *
 * TODO(Issue #104): Implement when ScoreConfig model is added to schema
 */
export async function validateScoreConfig(
  configId: string,
  value: unknown
): Promise<ScoreValidationResult> {
  console.log(`[Activity:validateScoreConfig] Validating against config: ${configId}`);

  try {
    const caller = getInternalCaller();
    const result = await caller.internal.validateScoreConfig({ configId, value });

    console.log(`[Activity:validateScoreConfig] Validation result: ${result.valid}`);
    return result;
  } catch {
    return { valid: false, error: "Failed to validate score config" };
  }
}

// ============================================================
// READ-ONLY HELPER FUNCTIONS (Database reads are allowed)
// ============================================================

/**
 * Check if a trace exists (read-only)
 */
export async function traceExists(traceId: string): Promise<boolean> {
  const trace = await prisma.trace.findUnique({
    where: { id: traceId },
    select: { id: true },
  });
  return trace !== null;
}

/**
 * Check if a span exists (read-only)
 */
export async function spanExists(spanId: string): Promise<boolean> {
  const span = await prisma.span.findUnique({
    where: { id: spanId },
    select: { id: true },
  });
  return span !== null;
}

/**
 * Infer the score data type from the value's JavaScript type
 */
export function inferDataType(value: unknown): ScoreDataType {
  if (typeof value === "number") return "NUMERIC";
  if (typeof value === "boolean") return "BOOLEAN";
  return "CATEGORICAL";
}
