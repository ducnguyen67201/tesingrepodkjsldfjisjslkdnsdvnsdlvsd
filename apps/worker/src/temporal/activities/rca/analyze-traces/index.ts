/**
 * Analyze Traces Activity
 *
 * Main activity for trace analysis during alert investigation.
 * Extracts error patterns, latency statistics, and anomalies.
 */

import type { TraceAnalysisInput, TraceAnalysisOutput } from "../../../types";
import { querySpansInWindow } from "./query";
import { calculateSummary } from "./summary";
import { extractErrorPatterns } from "./error-patterns";
import { groupByEndpoint, groupByModel } from "./grouping";
import { calculateTimeDistribution } from "./time-distribution";
import { detectAnomalies } from "./anomaly-detection";

/**
 * Analyzes traces and spans during the alert window to extract:
 * - Error patterns grouped by normalized message
 * - Latency statistics (p50, p95, p99, mean)
 * - Affected endpoints and LLM models
 * - Time distribution for trend detection
 * - Anomalies (latency spikes, error bursts, throughput drops)
 *
 * @param input - Analysis parameters including project ID and time window
 * @returns Structured analysis output for LLM consumption
 */
export async function analyzeTraces(
  input: TraceAnalysisInput
): Promise<TraceAnalysisOutput> {
  const windowStart = new Date(input.windowStart);
  const windowEnd = new Date(input.windowEnd);

  console.log(
    `[analyzeTraces] Starting analysis for project ${input.projectId}`
  );
  console.log(
    `[analyzeTraces] Alert: ${input.alertType} = ${input.alertValue} (threshold: ${input.threshold})`
  );
  console.log(
    `[analyzeTraces] Window: ${windowStart.toISOString()} to ${windowEnd.toISOString()}`
  );

  // 1. Query spans in time window
  const spans = await querySpansInWindow(input.projectId, windowStart, windowEnd);
  console.log(`[analyzeTraces] Found ${spans.length} spans`);

  // 2. Calculate summary statistics
  const summary = calculateSummary(spans);

  // 3. Group and extract error patterns
  const errorPatterns = extractErrorPatterns(spans);

  // 4. Group by affected endpoints
  const affectedEndpoints = groupByEndpoint(spans);

  // 5. Group by affected models
  const affectedModels = groupByModel(spans);

  // 6. Calculate time distribution
  const timeDistribution = calculateTimeDistribution(
    spans,
    windowStart,
    windowEnd
  );

  // 7. Detect anomalies
  const anomalies = detectAnomalies(input.alertType, timeDistribution);

  console.log(
    `[analyzeTraces] Analysis complete: ${summary.errorCount} errors, ` +
      `${errorPatterns.length} patterns, ${anomalies.length} anomalies`
  );

  return {
    summary,
    errorPatterns,
    affectedEndpoints,
    affectedModels,
    timeDistribution,
    anomalies,
  };
}
