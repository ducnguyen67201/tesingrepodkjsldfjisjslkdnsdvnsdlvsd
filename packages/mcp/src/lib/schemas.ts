/**
 * Zod response schemas for MCP API endpoints.
 * Contract between web API and MCP HTTP client.
 */
import { z } from "zod";

// ============================================================
// Shared primitives
// ============================================================

const DateStringSchema = z.coerce.date();

// ============================================================
// Shared input enums (used by tool input schemas)
// ============================================================

export const TimeRangeSchema = z.enum(["1h", "6h", "24h", "7d", "30d"]);
export type TimeRange = z.infer<typeof TimeRangeSchema>;

export const CostTimeRangeSchema = z.enum(["24h", "7d", "30d"]);
export type CostTimeRange = z.infer<typeof CostTimeRangeSchema>;

export const ErrorTimeRangeSchema = z.enum(["1h", "6h", "24h", "7d"]);
export type ErrorTimeRange = z.infer<typeof ErrorTimeRangeSchema>;

export const SpanTypeSchema = z.enum([
  "LLM",
  "HTTP",
  "DB",
  "RPC",
  "FUNCTION",
  "CUSTOM",
]);
export type SpanType = z.infer<typeof SpanTypeSchema>;

export const CostGroupBySchema = z.enum(["model", "day", "service"]);
export type CostGroupBy = z.infer<typeof CostGroupBySchema>;

// ============================================================
// /api/v1/mcp/traces
// ============================================================

const TraceRowSchema = z.object({
  id: z.string(),
  serviceName: z.string(),
  rootSpanName: z.string().nullable(),
  durationMs: z.number().nullable(),
  errorCount: z.number(),
  spanCount: z.number(),
  startTime: DateStringSchema,
  hasError: z.boolean(),
});

export const ListTracesResponseSchema = z.object({
  traces: z.array(TraceRowSchema),
  total: z.number(),
  nextCursor: z.string().nullable(),
});

export type ListTracesResponse = z.infer<typeof ListTracesResponseSchema>;

// ============================================================
// /api/v1/mcp/traces/detail
// ============================================================

const SpanSchema = z.object({
  id: z.string(),
  externalSpanId: z.string(),
  parentSpanId: z.string().nullable(),
  name: z.string(),
  kind: z.string(),
  spanType: z.string().nullable(),
  statusCode: z.string(),
  statusMessage: z.string().nullable(),
  startTime: DateStringSchema,
  endTime: DateStringSchema.nullable(),
  durationMs: z.number().nullable(),
  model: z.string().nullable(),
  promptTokens: z.number().nullable(),
  completionTokens: z.number().nullable(),
  totalCost: z.number().nullable(),
  input: z.unknown().optional(),
  output: z.unknown().optional(),
  httpMethod: z.string().nullable(),
  httpRoute: z.string().nullable(),
  httpStatusCode: z.number().nullable(),
  dbSystem: z.string().nullable(),
  dbOperation: z.string().nullable(),
  exceptionType: z.string().nullable(),
  exceptionMessage: z.string().nullable(),
});

export const GetTraceResponseSchema = z.object({
  trace: z.object({
    id: z.string(),
    serviceName: z.string(),
    durationMs: z.number().nullable(),
    startTime: DateStringSchema,
    hasError: z.boolean(),
    spans: z.array(SpanSchema),
  }),
});

export type GetTraceResponse = z.infer<typeof GetTraceResponseSchema>;

// ============================================================
// /api/v1/mcp/traces/errors
// ============================================================

const ErrorSpanSchema = z.object({
  id: z.string(),
  name: z.string(),
  exceptionType: z.string().nullable(),
  exceptionMessage: z.string().nullable(),
  statusMessage: z.string().nullable(),
  startTime: DateStringSchema,
  trace: z.object({
    id: z.string(),
    serviceName: z.string(),
    rootSpanName: z.string().nullable(),
  }),
});

export const GetErrorTracesResponseSchema = z.object({
  errorSpans: z.array(ErrorSpanSchema),
});

export type GetErrorTracesResponse = z.infer<typeof GetErrorTracesResponseSchema>;

// ============================================================
// /api/v1/mcp/spans/search
// ============================================================

const SearchSpanSchema = z.object({
  id: z.string(),
  traceId: z.string(),
  name: z.string(),
  spanType: z.string().nullable(),
  statusCode: z.string(),
  durationMs: z.number().nullable(),
  startTime: DateStringSchema,
  model: z.string().nullable(),
  exceptionType: z.string().nullable(),
  trace: z.object({ serviceName: z.string() }),
});

export const SearchSpansResponseSchema = z.object({
  spans: z.array(SearchSpanSchema),
});

export type SearchSpansResponse = z.infer<typeof SearchSpansResponseSchema>;

// ============================================================
// /api/v1/mcp/analytics/costs
// ============================================================

const CostModelRowSchema = z.object({
  model: z.string().nullable(),
  spanCount: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  totalCost: z.number(),
});

const CostDayRowSchema = z.object({
  date: DateStringSchema,
  spanCount: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  totalCost: z.number(),
});

const CostServiceRowSchema = z.object({
  model: z.string().nullable(),
  spanCount: z.number(),
  promptTokens: z.number(),
  completionTokens: z.number(),
  totalCost: z.number(),
});

export const CostSummaryResponseSchema = z.discriminatedUnion("groupBy", [
  z.object({ groupBy: z.literal("model"), data: z.array(CostModelRowSchema) }),
  z.object({ groupBy: z.literal("day"), data: z.array(CostDayRowSchema) }),
  z.object({ groupBy: z.literal("service"), data: z.array(CostServiceRowSchema) }),
]);

export type CostSummaryResponse = z.infer<typeof CostSummaryResponseSchema>;

// ============================================================
// /api/v1/mcp/analytics/stats
// ============================================================

const ServiceStatSchema = z.object({
  serviceName: z.string(),
  _count: z.number(),
  _avg: z.object({ durationMs: z.number().nullable() }),
});

const ErrorRateByServiceSchema = z.object({
  serviceName: z.string(),
  _count: z.number(),
});

export const TraceStatsResponseSchema = z.object({
  totalCount: z.number(),
  errorCount: z.number(),
  percentiles: z.record(z.string(), z.number()),
  serviceStats: z.array(ServiceStatSchema),
  errorRateByService: z.array(ErrorRateByServiceSchema),
});

export type TraceStatsResponse = z.infer<typeof TraceStatsResponseSchema>;

// ============================================================
// /api/v1/mcp/project
// ============================================================

export const ProjectResponseSchema = z.object({
  project: z.object({
    id: z.string(),
    name: z.string(),
    createdAt: DateStringSchema,
    workspace: z.object({
      id: z.string(),
      name: z.string(),
    }),
    _count: z.object({
      traces: z.number(),
      apiKeys: z.number(),
    }),
  }),
});

export type ProjectResponse = z.infer<typeof ProjectResponseSchema>;

// ============================================================
// API error response
// ============================================================

export const ApiErrorResponseSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
  details: z.unknown().optional(),
});
