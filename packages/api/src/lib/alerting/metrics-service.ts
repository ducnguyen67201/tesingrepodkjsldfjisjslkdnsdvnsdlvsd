/**
 * Metrics Service
 *
 * Service for calculating metrics used in alert evaluation.
 */

import { prisma } from "@ducsigr/db";
import type { AlertType, MetricResult } from "../../schemas/alerting";

/**
 * Get metric value for a project within a time window.
 */
export async function getMetric(
  projectId: string,
  type: AlertType,
  windowMins: number
): Promise<MetricResult> {
  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - windowMins * 60 * 1000);

  switch (type) {
    case "ERROR_RATE":
      return getErrorRate(projectId, windowStart, windowEnd);
    case "LATENCY_P50":
      return getLatencyPercentile(projectId, windowStart, windowEnd, 50);
    case "LATENCY_P95":
      return getLatencyPercentile(projectId, windowStart, windowEnd, 95);
    case "LATENCY_P99":
      return getLatencyPercentile(projectId, windowStart, windowEnd, 99);
    default:
      throw new Error(`Unknown metric type: ${type}`);
  }
}

/**
 * Calculate error rate as percentage of spans with ERROR status.
 */
async function getErrorRate(
  projectId: string,
  windowStart: Date,
  windowEnd: Date
): Promise<MetricResult> {
  const result = await prisma.$queryRaw<
    Array<{ total: bigint; errors: bigint }>
  >`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE s."statusCode" = 'ERROR') as errors
    FROM "Span" s
    INNER JOIN "Trace" t ON s."traceId" = t."id"
    WHERE t."projectId" = ${projectId}
      AND s."startTime" >= ${windowStart}
      AND s."startTime" < ${windowEnd}
  `;

  const { total, errors } = result[0] ?? { total: BigInt(0), errors: BigInt(0) };
  const totalNum = Number(total);
  const errorsNum = Number(errors);
  const errorRate = totalNum > 0 ? (errorsNum / totalNum) * 100 : 0;

  return {
    value: errorRate,
    sampleCount: totalNum,
    windowStart,
    windowEnd,
  };
}

/**
 * Calculate latency percentile in milliseconds.
 */
async function getLatencyPercentile(
  projectId: string,
  windowStart: Date,
  windowEnd: Date,
  percentile: number
): Promise<MetricResult> {
  const result = await prisma.$queryRaw<
    Array<{ percentile_value: number | null; sample_count: bigint }>
  >`
    SELECT
      PERCENTILE_CONT(${percentile / 100}) WITHIN GROUP (
        ORDER BY EXTRACT(EPOCH FROM (s."endTime" - s."startTime")) * 1000
      ) as percentile_value,
      COUNT(*) as sample_count
    FROM "Span" s
    INNER JOIN "Trace" t ON s."traceId" = t."id"
    WHERE t."projectId" = ${projectId}
      AND s."startTime" >= ${windowStart}
      AND s."startTime" < ${windowEnd}
      AND s."endTime" IS NOT NULL
  `;

  const { percentile_value, sample_count } = result[0] ?? {
    percentile_value: null,
    sample_count: BigInt(0),
  };

  return {
    value: percentile_value ?? 0,
    sampleCount: Number(sample_count),
    windowStart,
    windowEnd,
  };
}

/**
 * Get all metrics for a project (for dashboard display)
 */
export async function getAllMetrics(
  projectId: string,
  windowMins: number = 5
): Promise<Record<AlertType, MetricResult>> {
  const [errorRate, p50, p95, p99] = await Promise.all([
    getMetric(projectId, "ERROR_RATE", windowMins),
    getMetric(projectId, "LATENCY_P50", windowMins),
    getMetric(projectId, "LATENCY_P95", windowMins),
    getMetric(projectId, "LATENCY_P99", windowMins),
  ]);

  return {
    ERROR_RATE: errorRate,
    LATENCY_P50: p50,
    LATENCY_P95: p95,
    LATENCY_P99: p99,
  };
}
