/**
 * Observability Schemas
 *
 * Shared Zod enums for time ranges, grouping options, and sort order.
 * Used by MCP tools, web API routes, and analytics.
 *
 * NOTE: SpanTypeSchema lives in traces.ts (single source of truth).
 * NOTE: TimeRangeSchema in cost.ts is for cost views (includes "custom").
 *       TraceTimeRangeSchema here is the pure enum for trace/span/stats queries.
 */

import { z } from "zod";

// ============================================================
// Time Range Enums
// ============================================================

/**
 * Full time range options (traces, spans, stats)
 */
export const TRACE_TIME_RANGES = ["1h", "6h", "24h", "7d", "30d"] as const;
export const TraceTimeRangeSchema = z.enum(TRACE_TIME_RANGES);
export type TraceTimeRange = z.infer<typeof TraceTimeRangeSchema>;

/**
 * Cost-specific time ranges (no hourly granularity)
 */
export const COST_TIME_RANGES = ["24h", "7d", "30d"] as const;
export const CostTimeRangeSchema = z.enum(COST_TIME_RANGES);
export type CostTimeRange = z.infer<typeof CostTimeRangeSchema>;

/**
 * Error trace time ranges (no 30d)
 */
export const ERROR_TIME_RANGES = ["1h", "6h", "24h", "7d"] as const;
export const ErrorTimeRangeSchema = z.enum(ERROR_TIME_RANGES);
export type ErrorTimeRange = z.infer<typeof ErrorTimeRangeSchema>;

// ============================================================
// Grouping Enums
// ============================================================

/**
 * Cost grouping options
 */
export const COST_GROUP_BY_OPTIONS = ["model", "day", "service"] as const;
export const CostGroupBySchema = z.enum(COST_GROUP_BY_OPTIONS);
export type CostGroupBy = z.infer<typeof CostGroupBySchema>;

// ============================================================
// Sort Order
// ============================================================

/**
 * Generic sort order
 */
export const SORT_ORDERS = ["asc", "desc"] as const;
export const SortOrderSchema = z.enum(SORT_ORDERS);
export type SortOrder = z.infer<typeof SortOrderSchema>;

// ============================================================
// Time Range → Milliseconds Mapping
// ============================================================

/**
 * Millisecond values for each time range option
 */
export const TIME_RANGE_MS: Record<TraceTimeRange, number> = {
  "1h": 3_600_000,
  "6h": 21_600_000,
  "24h": 86_400_000,
  "7d": 604_800_000,
  "30d": 2_592_000_000,
};
