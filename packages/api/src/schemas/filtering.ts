/**
 * Filter DSL Schemas for Trace Filtering v2
 *
 * Defines Zod schemas for the recursive FilterExpression DSL that supports:
 * - AND/OR/NOT logical operators
 * - Field predicates (trace.*, span.*)
 * - Attribute predicates (resource.*, span attributes)
 * - Event predicates (span events like exceptions)
 * - Full-text search predicates
 *
 * @see docs/specs/tracing/TRACING_FILTERING_SEARCH_V2_SPEC.md
 */
import { z } from "zod";

// ============================================================================
// Guardrails and Limits
// ============================================================================

/**
 * Filter guardrails to prevent expensive queries
 */
export const FILTER_LIMITS = {
  /** Maximum total predicates in a filter expression */
  MAX_PREDICATES: 50,
  /** Maximum OR groups (to prevent combinatorial explosion) */
  MAX_OR_GROUPS: 10,
  /** Maximum full-text search clauses */
  MAX_SEARCH_CLAUSES: 5,
  /** Query timeout in milliseconds */
  QUERY_TIMEOUT_MS: 2000,
  /** Maximum attribute key length */
  MAX_ATTRIBUTE_KEY_LENGTH: 256,
  /** Maximum search query length */
  MAX_SEARCH_QUERY_LENGTH: 500,
} as const;

// ============================================================================
// Filter Operators
// ============================================================================

/**
 * Comparison operators for predicates
 */
export const FilterOperatorSchema = z.enum([
  "eq", // equals
  "neq", // not equals
  "in", // in array
  "nin", // not in array
  "gt", // greater than
  "gte", // greater than or equal
  "lt", // less than
  "lte", // less than or equal
  "exists", // field exists (non-null)
  "prefix", // string starts with
  "contains", // string contains
]);
export type FilterOperator = z.infer<typeof FilterOperatorSchema>;

/**
 * Operators that work with arrays
 */
export const ARRAY_OPERATORS: readonly FilterOperator[] = ["in", "nin"];

/**
 * Operators that work with numbers
 */
export const NUMERIC_OPERATORS: readonly FilterOperator[] = [
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  "nin",
];

/**
 * Operators that work with strings
 */
export const STRING_OPERATORS: readonly FilterOperator[] = [
  "eq",
  "neq",
  "in",
  "nin",
  "prefix",
  "contains",
];

// ============================================================================
// Predicate Values
// ============================================================================

/**
 * Scalar value for predicates
 */
export const ScalarValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
]);
export type ScalarValue = z.infer<typeof ScalarValueSchema>;

/**
 * Value for predicates (scalar or array for in/nin operators)
 */
export const PredicateValueSchema = z.union([
  ScalarValueSchema,
  z.array(z.string()),
  z.array(z.number()),
]);
export type PredicateValue = z.infer<typeof PredicateValueSchema>;

// ============================================================================
// Field Predicates
// ============================================================================

/**
 * Trace-level field names for filtering
 */
export const TraceFieldSchema = z.enum([
  // Core fields
  "trace.serviceName",
  "trace.serviceVersion",
  "trace.environment",
  "trace.durationMs",
  "trace.spanCount",
  "trace.errorCount",
  // V2: Root span fields
  "trace.rootSpanName",
  "trace.rootSpanKind",
  "trace.rootSpanStatusCode",
  "trace.rootSpanDurationMs",
  // V2: Flags
  "trace.hasError",
  "trace.hasException",
]);
export type TraceField = z.infer<typeof TraceFieldSchema>;

/**
 * Span-level field names for filtering
 */
export const SpanFieldSchema = z.enum([
  // Core fields
  "span.name",
  "span.kind",
  "span.statusCode",
  "span.statusMessage",
  "span.durationMs",
  "span.libraryName",
  "span.libraryVersion",
  // GenAI fields
  "span.model",
  "span.promptTokens",
  "span.completionTokens",
  "span.genAiOperation",
  "span.genAiProvider",
  // V2: HTTP fields
  "span.httpMethod",
  "span.httpRoute",
  "span.httpStatusCode",
  "span.httpUrl",
  // V2: Database fields
  "span.dbSystem",
  "span.dbName",
  "span.dbOperation",
  "span.dbStatement",
  "span.dbCollection",
  // V2: RPC fields
  "span.rpcSystem",
  "span.rpcService",
  "span.rpcMethod",
  "span.rpcStatusCode",
  // V2: Exception fields
  "span.exceptionType",
  "span.exceptionMessage",
  // V2: Inferred type
  "span.spanType",
  // Prompt Experiment fields
  "span.promptExperimentId",
  "span.promptExperimentSlug",
  "span.promptVariantId",
  "span.promptVariantName",
]);
export type SpanField = z.infer<typeof SpanFieldSchema>;

/**
 * All filterable field names
 */
export const FilterFieldSchema = z.union([TraceFieldSchema, SpanFieldSchema]);
export type FilterField = z.infer<typeof FilterFieldSchema>;

/**
 * Field predicate - filter by trace or span field value
 */
export const FieldPredicateSchema = z.object({
  field: FilterFieldSchema,
  op: FilterOperatorSchema,
  value: PredicateValueSchema.optional(),
});
export type FieldPredicate = z.infer<typeof FieldPredicateSchema>;

// ============================================================================
// Attribute Predicates
// ============================================================================

/**
 * Attribute scope for JSONB attribute predicates
 */
export const AttributeScopeSchema = z.enum(["resource", "span"]);
export type AttributeScope = z.infer<typeof AttributeScopeSchema>;

/**
 * Attribute predicate - filter by JSONB attribute key/value
 */
export const AttributePredicateSchema = z.object({
  attribute: z.object({
    scope: AttributeScopeSchema,
    key: z.string().max(FILTER_LIMITS.MAX_ATTRIBUTE_KEY_LENGTH),
    op: FilterOperatorSchema,
    value: PredicateValueSchema.optional(),
  }),
});
export type AttributePredicate = z.infer<typeof AttributePredicateSchema>;

// ============================================================================
// Event Predicates
// ============================================================================

/**
 * Event predicate - filter by span event properties
 */
export const EventPredicateSchema = z.object({
  event: z.object({
    /** Event name (e.g., "exception") */
    name: z.string().optional(),
    /** Attribute key within the event */
    attributeKey: z.string().optional(),
    op: FilterOperatorSchema,
    value: PredicateValueSchema.optional(),
  }),
});
export type EventPredicate = z.infer<typeof EventPredicateSchema>;

// ============================================================================
// Search Predicates
// ============================================================================

/**
 * Search scope for full-text search
 */
export const SearchScopeSchema = z.enum(["trace", "span", "both"]);
export type SearchScope = z.infer<typeof SearchScopeSchema>;

/**
 * Search mode for full-text search
 */
export const SearchModeSchema = z.enum(["phrase", "terms"]);
export type SearchMode = z.infer<typeof SearchModeSchema>;

/**
 * Search predicate - full-text search across trace/span data
 */
export const SearchPredicateSchema = z.object({
  search: z.object({
    query: z.string().min(1).max(FILTER_LIMITS.MAX_SEARCH_QUERY_LENGTH),
    scope: SearchScopeSchema.optional().default("both"),
    mode: SearchModeSchema.optional().default("terms"),
    /** Specific fields to search (optional, defaults to searchText) */
    fields: z.array(z.string()).optional(),
  }),
});
export type SearchPredicate = z.infer<typeof SearchPredicateSchema>;

// ============================================================================
// Filter Expression (Recursive)
// ============================================================================

/**
 * Base predicate types (leaf nodes in the expression tree)
 */
export const BasePredicateSchema = z.union([
  FieldPredicateSchema,
  AttributePredicateSchema,
  EventPredicateSchema,
  SearchPredicateSchema,
]);
export type BasePredicate = z.infer<typeof BasePredicateSchema>;

/**
 * Recursive FilterExpression type for TypeScript
 */
export type FilterExpression =
  | { and: FilterExpression[] }
  | { or: FilterExpression[] }
  | { not: FilterExpression }
  | FieldPredicate
  | AttributePredicate
  | EventPredicate
  | SearchPredicate;

/**
 * Recursive FilterExpression schema using z.lazy()
 */
export const FilterExpressionSchema: z.ZodType<FilterExpression> = z.lazy(() =>
  z.union([
    z.object({ and: z.array(FilterExpressionSchema) }),
    z.object({ or: z.array(FilterExpressionSchema) }),
    z.object({ not: FilterExpressionSchema }),
    FieldPredicateSchema,
    AttributePredicateSchema,
    EventPredicateSchema,
    SearchPredicateSchema,
  ])
);

// ============================================================================
// Span Matching Semantics
// ============================================================================

/**
 * How span predicates should match for trace-level queries
 */
export const SpanMatchModeSchema = z.enum([
  "any", // Trace matches if ANY span matches (default)
  "root", // Only root span is evaluated
  "all", // All spans in trace must match
]);
export type SpanMatchMode = z.infer<typeof SpanMatchModeSchema>;

// ============================================================================
// Filter Input Schemas (for API endpoints)
// ============================================================================

/**
 * Time range for filtering (required)
 */
export const TimeRangeInputSchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
});
export type TimeRangeInput = z.infer<typeof TimeRangeInputSchema>;

/**
 * Cursor for keyset pagination
 */
export const PaginationCursorSchema = z.object({
  startTime: z.string().datetime(),
  id: z.string(),
});
export type PaginationCursor = z.infer<typeof PaginationCursorSchema>;

/**
 * Input for traces.listV2 endpoint
 */
export const TracesListV2InputSchema = z.object({
  workspaceSlug: z.string(),
  projectId: z.string(),
  timeRange: TimeRangeInputSchema,
  filter: FilterExpressionSchema.optional(),
  spanMatch: SpanMatchModeSchema.optional().default("any"),
  limit: z.number().min(1).max(100).optional().default(50),
  cursor: PaginationCursorSchema.optional(),
});
export type TracesListV2Input = z.infer<typeof TracesListV2InputSchema>;

/**
 * Input for spans.listV2 endpoint
 */
export const SpansListV2InputSchema = z.object({
  workspaceSlug: z.string(),
  projectId: z.string(),
  traceId: z.string().optional(), // Optional: filter to specific trace
  timeRange: TimeRangeInputSchema,
  filter: FilterExpressionSchema.optional(),
  limit: z.number().min(1).max(100).optional().default(50),
  cursor: PaginationCursorSchema.optional(),
});
export type SpansListV2Input = z.infer<typeof SpansListV2InputSchema>;

// ============================================================================
// Filter Autocomplete Schemas
// ============================================================================

/**
 * Input for filters.keys endpoint
 */
export const FilterKeysInputSchema = z.object({
  projectId: z.string(),
  scope: AttributeScopeSchema,
  prefix: z.string().optional(),
  limit: z.number().min(1).max(100).optional().default(20),
});
export type FilterKeysInput = z.infer<typeof FilterKeysInputSchema>;

/**
 * Input for filters.values endpoint
 */
export const FilterValuesInputSchema = z.object({
  projectId: z.string(),
  scope: AttributeScopeSchema,
  key: z.string(),
  prefix: z.string().optional(),
  limit: z.number().min(1).max(100).optional().default(20),
});
export type FilterValuesInput = z.infer<typeof FilterValuesInputSchema>;

/**
 * Input for filters.stats endpoint (facets)
 */
export const FilterStatsInputSchema = z.object({
  projectId: z.string(),
  timeRange: TimeRangeInputSchema,
  filter: FilterExpressionSchema.optional(),
});
export type FilterStatsInput = z.infer<typeof FilterStatsInputSchema>;

/**
 * Output for filters.stats endpoint
 */
export const FilterStatsOutputSchema = z.object({
  services: z.array(
    z.object({
      name: z.string(),
      count: z.number(),
    })
  ),
  environments: z.array(
    z.object({
      name: z.string(),
      count: z.number(),
    })
  ),
  statusCodes: z.array(
    z.object({
      code: z.string(),
      count: z.number(),
    })
  ),
  spanTypes: z.array(
    z.object({
      type: z.string(),
      count: z.number(),
    })
  ),
  httpRoutes: z.array(
    z.object({
      route: z.string(),
      count: z.number(),
    })
  ),
  dbSystems: z.array(
    z.object({
      system: z.string(),
      count: z.number(),
    })
  ),
});
export type FilterStatsOutput = z.infer<typeof FilterStatsOutputSchema>;

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if a field is a trace-level field
 */
export const isTraceField = (field: string): field is TraceField => {
  return field.startsWith("trace.");
};

/**
 * Check if a field is a span-level field
 */
export const isSpanField = (field: string): field is SpanField => {
  return field.startsWith("span.");
};

/**
 * Get the database column name from a filter field
 */
export const fieldToColumn = (field: FilterField): string => {
  // Remove the "trace." or "span." prefix
  const parts = field.split(".");
  if (parts.length !== 2) return field;
  return parts[1] as string;
};

/**
 * Count predicates in a filter expression (for guardrail validation)
 */
export const countPredicates = (expr: FilterExpression): number => {
  if ("and" in expr) {
    return expr.and.reduce((sum, e) => sum + countPredicates(e), 0);
  }
  if ("or" in expr) {
    return expr.or.reduce((sum, e) => sum + countPredicates(e), 0);
  }
  if ("not" in expr) {
    return countPredicates(expr.not);
  }
  // Base predicate
  return 1;
};

/**
 * Count OR groups in a filter expression (for guardrail validation)
 */
export const countOrGroups = (expr: FilterExpression): number => {
  if ("and" in expr) {
    return expr.and.reduce((sum, e) => sum + countOrGroups(e), 0);
  }
  if ("or" in expr) {
    return 1 + expr.or.reduce((sum, e) => sum + countOrGroups(e), 0);
  }
  if ("not" in expr) {
    return countOrGroups(expr.not);
  }
  return 0;
};

/**
 * Count search predicates in a filter expression (for guardrail validation)
 */
export const countSearchPredicates = (expr: FilterExpression): number => {
  if ("and" in expr) {
    return expr.and.reduce((sum, e) => sum + countSearchPredicates(e), 0);
  }
  if ("or" in expr) {
    return expr.or.reduce((sum, e) => sum + countSearchPredicates(e), 0);
  }
  if ("not" in expr) {
    return countSearchPredicates(expr.not);
  }
  if ("search" in expr) {
    return 1;
  }
  return 0;
};

/**
 * Validate filter expression against guardrails
 */
export const validateFilterGuardrails = (
  expr: FilterExpression
): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];

  const predicateCount = countPredicates(expr);
  if (predicateCount > FILTER_LIMITS.MAX_PREDICATES) {
    errors.push(
      `Too many predicates: ${predicateCount} (max: ${FILTER_LIMITS.MAX_PREDICATES})`
    );
  }

  const orGroupCount = countOrGroups(expr);
  if (orGroupCount > FILTER_LIMITS.MAX_OR_GROUPS) {
    errors.push(
      `Too many OR groups: ${orGroupCount} (max: ${FILTER_LIMITS.MAX_OR_GROUPS})`
    );
  }

  const searchCount = countSearchPredicates(expr);
  if (searchCount > FILTER_LIMITS.MAX_SEARCH_CLAUSES) {
    errors.push(
      `Too many search clauses: ${searchCount} (max: ${FILTER_LIMITS.MAX_SEARCH_CLAUSES})`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};
