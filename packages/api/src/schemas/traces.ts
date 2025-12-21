import { z } from "zod";
import { TimeRangeSchema, CustomDateRangeSchema } from "./cost";

/**
 * Span types for visual differentiation - defined as Zod schema (source of truth).
 * Inferred from span data. V2 adds RPC type for gRPC/API calls.
 */
export const SpanTypeSchema = z.enum([
  "LLM",
  "HTTP",
  "DB",
  "RPC",
  "FUNCTION",
  "CUSTOM",
]);
export type SpanType = z.infer<typeof SpanTypeSchema>;
export const ALL_SPAN_TYPES: readonly SpanType[] = SpanTypeSchema.options;

// NOTE: SpanStatusCode is now defined in otlp.ts and re-exported from index.ts
// Legacy SpanLevel aliases remain here for backwards compatibility

/**
 * @deprecated Use SpanStatusCodeSchema from otlp.ts instead
 */
export const SpanLevelSchema = z.enum(["UNSET", "OK", "ERROR"]);
/** @deprecated Use SpanStatusCode from otlp.ts instead */
export type SpanLevel = z.infer<typeof SpanLevelSchema>;
/** @deprecated Use ALL_SPAN_STATUS_CODES from otlp.ts instead */
export const ALL_SPAN_LEVELS: readonly SpanLevel[] = SpanLevelSchema.options;

/**
 * Trace filters schema - used for URL params and API input.
 */
export const TraceFiltersSchema = z.object({
  /** Search by trace name (case-insensitive) */
  search: z.string().optional(),
  /** Filter by span types */
  types: z.array(SpanTypeSchema).optional(),
  /** Filter by span levels */
  levels: z.array(SpanLevelSchema).optional(),
  /** Filter by model names */
  models: z.array(z.string()).optional(),
  /** Minimum duration in milliseconds */
  minDuration: z.number().min(0).optional(),
  /** Maximum duration in milliseconds */
  maxDuration: z.number().min(0).optional(),
  /** Time range filter (preset or "custom") */
  timeRange: TimeRangeSchema.optional(),
  /** Custom date range (when timeRange is "custom") */
  customRange: CustomDateRangeSchema.optional(),
  /** Filter by session ID */
  sessionId: z.string().optional(),
});

export type TraceFilters = z.infer<typeof TraceFiltersSchema>;

/**
 * URL param keys for filter serialization.
 */
export const FILTER_PARAM_KEYS = {
  search: "q",
  types: "type",
  levels: "level",
  models: "model",
  minDuration: "minDuration",
  maxDuration: "maxDuration",
  timeRange: "range",
  customFrom: "from",
  customTo: "to",
} as const;

/**
 * Quick toggle presets for the hybrid filter UI.
 */
export interface QuickToggle {
  id: string;
  label: string;
  filter: Partial<TraceFilters>;
  isActive: (filters: TraceFilters) => boolean;
}

export const QUICK_TOGGLES: QuickToggle[] = [
  {
    id: "errors",
    label: "Errors Only",
    filter: { levels: ["ERROR"] },
    isActive: (f) => f.levels?.length === 1 && f.levels[0] === "ERROR",
  },
  {
    id: "llm",
    label: "LLM Only",
    filter: { types: ["LLM"] },
    isActive: (f) => f.types?.length === 1 && f.types[0] === "LLM",
  },
  {
    id: "slow",
    label: "Slow (>5s)",
    filter: { minDuration: 5000 },
    isActive: (f) => f.minDuration === 5000 && !f.maxDuration,
  },
];

/**
 * Check if any filters are active.
 */
export const hasActiveFilters = (filters: TraceFilters): boolean => {
  return (
    !!filters.search ||
    (filters.types?.length ?? 0) > 0 ||
    (filters.levels?.length ?? 0) > 0 ||
    (filters.models?.length ?? 0) > 0 ||
    filters.minDuration !== undefined ||
    filters.maxDuration !== undefined
  );
};

/**
 * Count the number of active filter categories.
 */
export const countActiveFilters = (filters: TraceFilters): number => {
  let count = 0;
  if (filters.search) count++;
  if (filters.types?.length) count++;
  if (filters.levels?.length) count++;
  if (filters.models?.length) count++;
  if (filters.minDuration !== undefined || filters.maxDuration !== undefined)
    count++;
  return count;
};
