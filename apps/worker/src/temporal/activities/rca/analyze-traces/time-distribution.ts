/**
 * Time Distribution Analysis
 *
 * Functions for calculating time-bucketed distribution of spans.
 */

import { TIME_BUCKET_MINUTES } from "@cognobserve/api/schemas";
import type { TimeDistributionBucket } from "../../../types";
import type { SpanRow } from "../types";

/**
 * Calculate time distribution using configurable bucket size (TIME_BUCKET_MINUTES).
 */
export function calculateTimeDistribution(
  spans: SpanRow[],
  windowStart: Date,
  windowEnd: Date
): TimeDistributionBucket[] {
  const bucketMs = TIME_BUCKET_MINUTES * 60 * 1000;
  const buckets = new Map<
    string,
    { errors: number; total: number; latencies: number[] }
  >();

  // Initialize all buckets in window
  let bucketStart = new Date(
    Math.floor(windowStart.getTime() / bucketMs) * bucketMs
  );
  while (bucketStart <= windowEnd) {
    buckets.set(bucketStart.toISOString(), {
      errors: 0,
      total: 0,
      latencies: [],
    });
    bucketStart = new Date(bucketStart.getTime() + bucketMs);
  }

  // Fill buckets with span data
  for (const span of spans) {
    const bucket = new Date(
      Math.floor(span.startTime.getTime() / bucketMs) * bucketMs
    );
    const key = bucket.toISOString();
    const existing = buckets.get(key);

    if (existing) {
      existing.total++;
      if (span.statusCode === "ERROR") existing.errors++;
      if (span.endTime) {
        existing.latencies.push(
          span.endTime.getTime() - span.startTime.getTime()
        );
      }
    }
  }

  return Array.from(buckets.entries())
    .map(([bucket, data]) => ({
      bucket,
      errorCount: data.errors,
      spanCount: data.total,
      avgLatency:
        data.latencies.length > 0
          ? data.latencies.reduce((a, b) => a + b, 0) / data.latencies.length
          : 0,
    }))
    .sort((a, b) => a.bucket.localeCompare(b.bucket));
}
