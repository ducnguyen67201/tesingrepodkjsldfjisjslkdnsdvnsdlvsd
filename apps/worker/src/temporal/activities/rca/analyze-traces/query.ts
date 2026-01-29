/**
 * Span Query Functions
 *
 * Database queries for fetching spans within an analysis window.
 * Note: OTLP-first schema - uses serviceName instead of trace.name
 */

import { prisma } from "@ducsigr/db";
import { MAX_SPANS_TO_ANALYZE } from "@ducsigr/api/schemas";
import type { SpanRow } from "../types";

/**
 * Query spans within the analysis window.
 * Joins with trace to get serviceName and filters by project.
 */
export async function querySpansInWindow(
  projectId: string,
  windowStart: Date,
  windowEnd: Date
): Promise<SpanRow[]> {
  const rows = await prisma.span.findMany({
    where: {
      trace: { projectId },
      startTime: { gte: windowStart, lte: windowEnd },
    },
    select: {
      id: true,
      traceId: true,
      name: true,
      statusCode: true,
      statusMessage: true,
      model: true,
      startTime: true,
      endTime: true,
      promptTokens: true,
      completionTokens: true,
      totalCost: true,
      output: true,
      trace: { select: { serviceName: true } },
    },
    take: MAX_SPANS_TO_ANALYZE,
    orderBy: { startTime: "desc" },
  });

  return rows.map((r) => ({
    id: r.id,
    traceId: r.traceId,
    serviceName: r.trace.serviceName,
    name: r.name,
    statusCode: r.statusCode,
    statusMessage: r.statusMessage,
    model: r.model,
    startTime: r.startTime,
    endTime: r.endTime,
    promptTokens: r.promptTokens,
    completionTokens: r.completionTokens,
    totalCost: r.totalCost,
    output: r.output,
  }));
}
