import { z } from "zod";

/**
 * Tracked user input from SDK/Ingest - for tracking end-users of AI applications
 */
export const TrackedUserInputSchema = z.object({
  /** External user ID (required - user's ID from their system) */
  id: z.string().min(1).max(255),
  /** Display name */
  name: z.string().max(255).optional(),
  /** User email */
  email: z.string().email().optional(),
  /** Custom metadata (plan, company, etc.) */
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type TrackedUserInput = z.infer<typeof TrackedUserInputSchema>;

/**
 * Update tracked user request
 */
export const UpdateTrackedUserSchema = z.object({
  id: z.string(),
  name: z.string().max(255).optional(),
  email: z.string().email().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type UpdateTrackedUserInput = z.infer<typeof UpdateTrackedUserSchema>;

/**
 * Tracked user list filters
 */
export const TrackedUserListFiltersSchema = z.object({
  projectId: z.string(),
  /** Search by name, email, or external ID */
  search: z.string().optional(),
  /** Filter by lastSeenAt date range */
  from: z.date().optional(),
  to: z.date().optional(),
  /** Sort options */
  sortBy: z
    .enum(["lastSeenAt", "firstSeenAt", "traceCount", "totalCost"])
    .default("lastSeenAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  /** Pagination */
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});
export type TrackedUserListFilters = z.infer<typeof TrackedUserListFiltersSchema>;

/**
 * Tracked user with aggregated stats (returned from list endpoint)
 */
export const TrackedUserWithStatsSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  externalId: z.string(),
  name: z.string().nullable(),
  email: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  firstSeenAt: z.date(),
  lastSeenAt: z.date(),
  // Aggregated stats
  traceCount: z.number(),
  sessionCount: z.number(),
  totalTokens: z.number(),
  totalCost: z.number(),
  errorCount: z.number(),
  errorRate: z.number(), // Percentage
  avgLatencyMs: z.number().nullable(),
});
export type TrackedUserWithStats = z.infer<typeof TrackedUserWithStatsSchema>;

/**
 * Tracked user analytics over time (daily breakdown)
 */
export const TrackedUserAnalyticsSchema = z.object({
  date: z.date(),
  traceCount: z.number(),
  totalTokens: z.number(),
  totalCost: z.number(),
  errorCount: z.number(),
});
export type TrackedUserAnalytics = z.infer<typeof TrackedUserAnalyticsSchema>;

/**
 * Tracked user traces list filters
 */
export const TrackedUserTracesFiltersSchema = z.object({
  userId: z.string(),
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});
export type TrackedUserTracesFilters = z.infer<typeof TrackedUserTracesFiltersSchema>;

/**
 * Tracked user analytics request
 */
export const TrackedUserAnalyticsRequestSchema = z.object({
  userId: z.string(),
  days: z.number().int().min(1).max(90).default(30),
});
export type TrackedUserAnalyticsRequest = z.infer<typeof TrackedUserAnalyticsRequestSchema>;

/**
 * Project tracked user summary (for dashboard)
 */
export const TrackedUserSummarySchema = z.object({
  totalUsers: z.number(),
  activeUsers: z.number(), // Active in last 7 days
  newUsers: z.number(), // New in last 7 days
  topUsersByCost: z.array(
    z.object({
      userId: z.string(),
      externalId: z.string(),
      name: z.string().nullable(),
      totalCost: z.number(),
    })
  ),
});
export type TrackedUserSummary = z.infer<typeof TrackedUserSummarySchema>;
