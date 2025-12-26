/**
 * Workspace Overview Schemas
 *
 * Zod schemas for workspace overview dashboard - source of truth for types.
 */

import { z } from "zod";
import { AlertSeveritySchema, AlertStateSchema } from "./alerting";
import { DashboardTimeRangeSchema } from "./dashboard";

// ============================================================
// Trend Schema
// ============================================================

/**
 * Direction of trend change
 */
export const TrendDirectionSchema = z.enum(["up", "down", "flat"]);
export type TrendDirection = z.infer<typeof TrendDirectionSchema>;

/**
 * Trend data with current/previous values and percent change
 */
export const StatTrendSchema = z.object({
  current: z.number(),
  previous: z.number(),
  percentChange: z.number(),
  direction: TrendDirectionSchema,
});
export type StatTrend = z.infer<typeof StatTrendSchema>;

// ============================================================
// Workspace Stats Schema
// ============================================================

/**
 * Aggregated workspace statistics
 */
export const WorkspaceStatsSchema = z.object({
  totalTraces: StatTrendSchema,
  totalErrors: StatTrendSchema,
  avgLatencyP95Ms: StatTrendSchema,
  activeAlerts: z.number(),
});
export type WorkspaceStats = z.infer<typeof WorkspaceStatsSchema>;

// ============================================================
// Recent Activity Schema
// ============================================================

/**
 * Activity types for the feed
 */
export const ActivityTypeSchema = z.enum([
  "alert_fired",
  "alert_resolved",
  "alert_pending",
]);
export type ActivityType = z.infer<typeof ActivityTypeSchema>;

/**
 * Single activity item in the feed
 */
export const RecentActivityItemSchema = z.object({
  id: z.string(),
  type: ActivityTypeSchema,
  title: z.string(),
  description: z.string().optional(),
  timestamp: z.date(),
  projectId: z.string(),
  projectName: z.string(),
  severity: AlertSeveritySchema.optional(),
  alertState: AlertStateSchema.optional(),
  value: z.number().optional(),
  threshold: z.number().optional(),
});
export type RecentActivityItem = z.infer<typeof RecentActivityItemSchema>;

// ============================================================
// Input Schemas
// ============================================================

/**
 * Input for getStats query
 */
export const GetWorkspaceStatsInputSchema = z.object({
  workspaceSlug: z.string(),
  timeRange: DashboardTimeRangeSchema.default("24h"),
  customTimeRange: z
    .object({
      from: z.string(),
      to: z.string(),
    })
    .optional(),
});
export type GetWorkspaceStatsInput = z.infer<typeof GetWorkspaceStatsInputSchema>;

/**
 * Input for getRecentActivity query
 */
export const GetRecentActivityInputSchema = z.object({
  workspaceSlug: z.string(),
  limit: z.number().min(1).max(50).default(10),
});
export type GetRecentActivityInput = z.infer<typeof GetRecentActivityInputSchema>;

// ============================================================
// Output Schemas
// ============================================================

/**
 * Output for getStats query
 */
export const GetWorkspaceStatsOutputSchema = WorkspaceStatsSchema;
export type GetWorkspaceStatsOutput = z.infer<typeof GetWorkspaceStatsOutputSchema>;

/**
 * Output for getRecentActivity query
 */
export const GetRecentActivityOutputSchema = z.object({
  items: z.array(RecentActivityItemSchema),
  total: z.number(),
});
export type GetRecentActivityOutput = z.infer<typeof GetRecentActivityOutputSchema>;
