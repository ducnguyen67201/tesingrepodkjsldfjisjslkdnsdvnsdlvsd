import { z } from "zod";

/**
 * Session input from SDK/Ingest - external session ID
 */
export const SessionInputSchema = z.object({
  /** External session ID (user-provided) */
  id: z.string().min(1).max(255).optional(),
  /** Optional display name */
  name: z.string().max(255).optional(),
  /** Optional metadata */
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type SessionInput = z.infer<typeof SessionInputSchema>;

/**
 * Create session request
 */
export const CreateSessionSchema = z.object({
  projectId: z.string(),
  externalId: z.string().min(1).max(255).optional(),
  name: z.string().max(255).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type CreateSessionInput = z.infer<typeof CreateSessionSchema>;

/**
 * Update session request
 */
export const UpdateSessionSchema = z.object({
  id: z.string(),
  name: z.string().max(255).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type UpdateSessionInput = z.infer<typeof UpdateSessionSchema>;

/**
 * Session list filters
 */
export const SessionListFiltersSchema = z.object({
  projectId: z.string(),
  /** Search by name or external ID */
  search: z.string().optional(),
  /** Filter by date range */
  from: z.date().optional(),
  to: z.date().optional(),
  /** Pagination */
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});
export type SessionListFilters = z.infer<typeof SessionListFiltersSchema>;

/**
 * Session with aggregated stats (returned from list endpoint)
 */
export const SessionWithStatsSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  externalId: z.string().nullable(),
  name: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  // Aggregated stats
  traceCount: z.number(),
  totalTokens: z.number(),
  totalCost: z.number(),
  errorCount: z.number(),
  avgLatencyMs: z.number().nullable(),
});
export type SessionWithStats = z.infer<typeof SessionWithStatsSchema>;
