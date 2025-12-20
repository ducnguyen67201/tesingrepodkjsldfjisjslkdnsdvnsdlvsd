// ============================================================
// TRACE WORKFLOW - DEPRECATED
// ============================================================
// This workflow is deprecated and will be removed.
// Trace ingestion is now handled directly by the ingest-node service
// using an OTLP-first design.
//
// See: docs/specs/ingest/README.md
// ============================================================

import { log } from "@temporalio/workflow";
import type { TraceWorkflowInput, TraceWorkflowResult } from "../temporal/types";

/**
 * Trace ingestion workflow - DEPRECATED.
 *
 * This workflow is a no-op placeholder. Trace ingestion is now
 * handled directly by the ingest-node service.
 *
 * @deprecated Will be removed after ingest-node migration is complete
 */
export async function traceWorkflow(
  input: TraceWorkflowInput
): Promise<TraceWorkflowResult> {
  log.warn("traceWorkflow is DEPRECATED - use ingest-node service instead", {
    traceId: input.id,
    projectId: input.projectId,
    spanCount: input.spans.length,
  });

  // Return a no-op result
  return {
    traceId: input.id,
    spanCount: input.spans.length,
    costsCalculated: 0,
  };
}
