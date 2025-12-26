/**
 * Anomaly Detection
 *
 * Functions for detecting anomalies from time distribution data.
 */

import { TIME_BUCKET_MINUTES, ANOMALY_THRESHOLDS } from "@ducsigr/api/schemas";
import type { TimeDistributionBucket, DetectedAnomaly } from "../../../types";

/**
 * Detect anomalies from time distribution data.
 * Compares each bucket to the window average.
 */
export function detectAnomalies(
  alertType: string,
  timeDistribution: TimeDistributionBucket[]
): DetectedAnomaly[] {
  const anomalies: DetectedAnomaly[] = [];

  if (timeDistribution.length === 0) return anomalies;

  // Calculate baseline averages
  const avgErrors =
    timeDistribution.reduce((a, b) => a + b.errorCount, 0) /
    timeDistribution.length;
  const avgLatency =
    timeDistribution.reduce((a, b) => a + b.avgLatency, 0) /
    timeDistribution.length;
  const avgThroughput =
    timeDistribution.reduce((a, b) => a + b.spanCount, 0) /
    timeDistribution.length;

  for (const bucket of timeDistribution) {
    // Detect error bursts (> 3x average errors)
    if (
      bucket.errorCount > ANOMALY_THRESHOLDS.minErrorsForBurst &&
      bucket.errorCount > avgErrors * ANOMALY_THRESHOLDS.errorBurstMultiplier
    ) {
      const multiplier = avgErrors > 0 ? bucket.errorCount / avgErrors : 0;
      anomalies.push({
        type: "error_burst",
        timestamp: bucket.bucket,
        description: `${bucket.errorCount} errors in ${TIME_BUCKET_MINUTES} minutes (${multiplier.toFixed(1)}x average)`,
        severity:
          bucket.errorCount >
          avgErrors * ANOMALY_THRESHOLDS.highErrorBurstMultiplier
            ? "high"
            : "medium",
      });
    }

    // Detect latency spikes (> 2x average latency)
    if (
      alertType.startsWith("LATENCY") &&
      bucket.avgLatency > avgLatency * ANOMALY_THRESHOLDS.latencySpikeMultiplier &&
      bucket.avgLatency > ANOMALY_THRESHOLDS.minLatencyForSpike
    ) {
      const multiplier = avgLatency > 0 ? bucket.avgLatency / avgLatency : 0;
      anomalies.push({
        type: "latency_spike",
        timestamp: bucket.bucket,
        description: `Latency spiked to ${bucket.avgLatency.toFixed(0)}ms (${multiplier.toFixed(1)}x average)`,
        severity:
          bucket.avgLatency >
          avgLatency * ANOMALY_THRESHOLDS.highLatencySpikeMultiplier
            ? "high"
            : "medium",
      });
    }

    // Detect throughput drops (< 50% of average, minimum 10 spans baseline)
    if (
      avgThroughput > ANOMALY_THRESHOLDS.minBaselineThroughput &&
      bucket.spanCount < avgThroughput * ANOMALY_THRESHOLDS.throughputDropPercentage
    ) {
      const percentage =
        avgThroughput > 0
          ? ((bucket.spanCount / avgThroughput) * 100).toFixed(0)
          : "0";
      anomalies.push({
        type: "throughput_drop",
        timestamp: bucket.bucket,
        description: `Throughput dropped to ${bucket.spanCount} spans (${percentage}% of average)`,
        severity:
          bucket.spanCount <
          avgThroughput * ANOMALY_THRESHOLDS.highThroughputDropPercentage
            ? "high"
            : "medium",
      });
    }
  }

  // Sort by severity (high first) and limit to top 10
  return anomalies
    .sort((a, b) => (a.severity === "high" ? 0 : 1) - (b.severity === "high" ? 0 : 1))
    .slice(0, 10);
}
