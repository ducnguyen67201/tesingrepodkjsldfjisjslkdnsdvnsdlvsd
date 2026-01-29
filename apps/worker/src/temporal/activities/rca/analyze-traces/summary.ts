/**
 * Summary Statistics
 *
 * Functions for calculating summary statistics from spans.
 */

import type { TraceAnalysisSummary } from "../../../types";
import type { SpanRow } from "../types";

/**
 * Calculate percentile from sorted array.
 */
export function percentile(sortedArr: number[], p: number): number {
  if (sortedArr.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sortedArr.length) - 1;
  return sortedArr[Math.max(0, idx)] ?? 0;
}

/**
 * Calculate summary statistics from spans.
 */
export function calculateSummary(spans: SpanRow[]): TraceAnalysisSummary {
  const latencies = spans
    .filter((s) => s.endTime)
    .map((s) => s.endTime!.getTime() - s.startTime.getTime())
    .sort((a, b) => a - b);

  const errorSpans = spans.filter((s) => s.statusCode === "ERROR");
  const uniqueTraces = new Set(spans.map((s) => s.traceId));

  return {
    totalTraces: uniqueTraces.size,
    totalSpans: spans.length,
    errorCount: errorSpans.length,
    errorRate: spans.length > 0 ? errorSpans.length / spans.length : 0,
    latencyP50: percentile(latencies, 50),
    latencyP95: percentile(latencies, 95),
    latencyP99: percentile(latencies, 99),
    meanLatency:
      latencies.length > 0
        ? latencies.reduce((a, b) => a + b, 0) / latencies.length
        : 0,
  };
}
