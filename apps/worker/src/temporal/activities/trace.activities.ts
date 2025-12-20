// ============================================================
// TRACE ACTIVITIES - Orchestration for trace processing
// ============================================================
// TODO: OTLP-first migration - These activities will be reworked
// for the new ingest-node service architecture.
// See: docs/specs/ingest/README.md
//
// Legacy trace ingestion activities have been removed as the
// internal.ingestTrace procedure is now deprecated in favor of
// the OTLP-first ingest-node service.
// ============================================================

import { prisma } from "@cognobserve/db";

// NOTE: persistTrace, calculateTraceCosts, and updateCostSummaries
// activities have been removed. Trace ingestion will be handled
// directly by the ingest-node service.

// ============================================================
// READ-ONLY HELPER FUNCTIONS (Database reads are allowed)
// ============================================================

/**
 * Get trace details for validation (read-only)
 */
export async function getTraceDetails(traceId: string): Promise<{
  id: string;
  projectId: string;
  spanCount: number;
} | null> {
  const trace = await prisma.trace.findUnique({
    where: { id: traceId },
    select: {
      id: true,
      projectId: true,
      _count: { select: { spans: true } },
    },
  });

  if (!trace) return null;

  return {
    id: trace.id,
    projectId: trace.projectId,
    spanCount: trace._count.spans,
  };
}

/**
 * Check if a project exists (read-only)
 */
export async function projectExists(projectId: string): Promise<boolean> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  });
  return project !== null;
}
