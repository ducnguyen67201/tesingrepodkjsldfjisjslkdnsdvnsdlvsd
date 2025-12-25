/**
 * Filter DSL Schemas for Log Filtering v2
 *
 * Defines Zod schemas for the recursive LogFilterExpression DSL that supports:
 * - AND/OR/NOT logical operators
 * - Field predicates (log.serviceName, log.severity, etc.)
 * - Attribute predicates (resource.*, log attributes)
 * - Full-text search predicates on body
 *
 * @see docs/plans/advanced-log-search-plan.md
 */
import { z } from "zod";
import {
  FilterOperatorSchema,
  PredicateValueSchema,
  FILTER_LIMITS,
  TimeRangeInputSchema,
} from "./filtering";

// ============================================================================
// Log Field Schema
// ============================================================================

/**
 * Log-specific field names for filtering
 */
export const LogFieldSchema = z.enum([
  "log.serviceName",
  "log.serviceVersion",
  "log.environment",
  "log.severity", // severityText (DEBUG, INFO, WARN, ERROR, FATAL)
  "log.severityNumber", // OTLP severity number (1-24)
  "log.body", // bodyText field
  "log.traceId",
  "log.spanId",
  "log.scopeName",
]);
export type LogField = z.infer<typeof LogFieldSchema>;

/**
 * All log fields as array
 */
export const LOG_FIELDS = LogFieldSchema.options;

// ============================================================================
// Attribute Scope Schema
// ============================================================================

/**
 * Attribute scope for JSONB attribute predicates in logs
 */
export const LogAttributeScopeSchema = z.enum(["resource", "log"]);
export type LogAttributeScope = z.infer<typeof LogAttributeScopeSchema>;

// ============================================================================
// Predicate Schemas
// ============================================================================

/**
 * Field predicate - filter by log field value
 */
export const LogFieldPredicateSchema = z.object({
  field: LogFieldSchema,
  op: FilterOperatorSchema,
  value: PredicateValueSchema.optional(),
});
export type LogFieldPredicate = z.infer<typeof LogFieldPredicateSchema>;

/**
 * Attribute predicate - filter by JSONB attribute key/value
 */
export const LogAttributePredicateSchema = z.object({
  attribute: z.object({
    scope: LogAttributeScopeSchema,
    key: z.string().max(FILTER_LIMITS.MAX_ATTRIBUTE_KEY_LENGTH),
    op: FilterOperatorSchema,
    value: PredicateValueSchema.optional(),
  }),
});
export type LogAttributePredicate = z.infer<typeof LogAttributePredicateSchema>;

/**
 * Search predicate - full-text search on body
 */
export const LogSearchPredicateSchema = z.object({
  search: z.object({
    query: z.string().min(1).max(FILTER_LIMITS.MAX_SEARCH_QUERY_LENGTH),
    mode: z.enum(["phrase", "terms"]).optional().default("terms"),
  }),
});
export type LogSearchPredicate = z.infer<typeof LogSearchPredicateSchema>;

// ============================================================================
// Filter Expression (Recursive)
// ============================================================================

/**
 * Base predicate types (leaf nodes in the expression tree)
 */
export const LogBasePredicateSchema = z.union([
  LogFieldPredicateSchema,
  LogAttributePredicateSchema,
  LogSearchPredicateSchema,
]);
export type LogBasePredicate = z.infer<typeof LogBasePredicateSchema>;

/**
 * Recursive LogFilterExpression type for TypeScript
 */
export type LogFilterExpression =
  | { and: LogFilterExpression[] }
  | { or: LogFilterExpression[] }
  | { not: LogFilterExpression }
  | LogFieldPredicate
  | LogAttributePredicate
  | LogSearchPredicate;

/**
 * Recursive LogFilterExpression schema using z.lazy()
 */
export const LogFilterExpressionSchema: z.ZodType<LogFilterExpression> = z.lazy(
  () =>
    z.union([
      z.object({ and: z.array(LogFilterExpressionSchema) }),
      z.object({ or: z.array(LogFilterExpressionSchema) }),
      z.object({ not: LogFilterExpressionSchema }),
      LogFieldPredicateSchema,
      LogAttributePredicateSchema,
      LogSearchPredicateSchema,
    ])
);

// ============================================================================
// API Input Schemas
// ============================================================================

/**
 * Input for logs.listV2 endpoint
 */
export const LogsListV2InputSchema = z.object({
  workspaceSlug: z.string().min(1),
  projectId: z.string().optional(),
  timeRange: TimeRangeInputSchema,
  filter: LogFilterExpressionSchema.optional(),
  limit: z.number().min(1).max(100).optional().default(50),
  cursor: z.string().optional(),
});
export type LogsListV2Input = z.infer<typeof LogsListV2InputSchema>;

/**
 * Input for logs.filterKeys endpoint
 */
export const LogFilterKeysInputSchema = z.object({
  workspaceSlug: z.string().min(1),
  projectId: z.string().optional(),
  scope: LogAttributeScopeSchema,
  prefix: z.string().optional(),
  limit: z.number().min(1).max(100).optional().default(20),
});
export type LogFilterKeysInput = z.infer<typeof LogFilterKeysInputSchema>;

/**
 * Input for logs.filterValues endpoint
 */
export const LogFilterValuesInputSchema = z.object({
  workspaceSlug: z.string().min(1),
  projectId: z.string().optional(),
  scope: LogAttributeScopeSchema,
  key: z.string().min(1),
  prefix: z.string().optional(),
  limit: z.number().min(1).max(100).optional().default(20),
});
export type LogFilterValuesInput = z.infer<typeof LogFilterValuesInputSchema>;

/**
 * Input for logs.filterStats endpoint
 */
export const LogFilterStatsInputSchema = z.object({
  workspaceSlug: z.string().min(1),
  projectId: z.string().optional(),
  timeRange: TimeRangeInputSchema,
  filter: LogFilterExpressionSchema.optional(),
});
export type LogFilterStatsInput = z.infer<typeof LogFilterStatsInputSchema>;

/**
 * Output for logs.filterStats endpoint
 */
export const LogFilterStatsOutputSchema = z.object({
  services: z.array(
    z.object({
      name: z.string(),
      count: z.number(),
    })
  ),
  severities: z.array(
    z.object({
      level: z.string(),
      count: z.number(),
    })
  ),
  environments: z.array(
    z.object({
      name: z.string(),
      count: z.number(),
    })
  ),
  totalCount: z.number(),
});
export type LogFilterStatsOutput = z.infer<typeof LogFilterStatsOutputSchema>;

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if a field is a log field
 */
export const isLogField = (field: string): field is LogField => {
  return field.startsWith("log.");
};

/**
 * Get the database column name from a log filter field
 */
export const logFieldToColumn = (field: LogField): string => {
  const mapping: Record<LogField, string> = {
    "log.serviceName": "serviceName",
    "log.serviceVersion": "serviceVersion",
    "log.environment": "environment",
    "log.severity": "severityText",
    "log.severityNumber": "severityNumber",
    "log.body": "bodyText",
    "log.traceId": "traceId",
    "log.spanId": "spanId",
    "log.scopeName": "scopeName",
  };
  return mapping[field];
};

/**
 * Count predicates in a log filter expression (for guardrail validation)
 */
export const countLogPredicates = (expr: LogFilterExpression): number => {
  if ("and" in expr) {
    return expr.and.reduce((sum, e) => sum + countLogPredicates(e), 0);
  }
  if ("or" in expr) {
    return expr.or.reduce((sum, e) => sum + countLogPredicates(e), 0);
  }
  if ("not" in expr) {
    return countLogPredicates(expr.not);
  }
  // Base predicate
  return 1;
};

/**
 * Count OR groups in a log filter expression (for guardrail validation)
 */
export const countLogOrGroups = (expr: LogFilterExpression): number => {
  if ("and" in expr) {
    return expr.and.reduce((sum, e) => sum + countLogOrGroups(e), 0);
  }
  if ("or" in expr) {
    return 1 + expr.or.reduce((sum, e) => sum + countLogOrGroups(e), 0);
  }
  if ("not" in expr) {
    return countLogOrGroups(expr.not);
  }
  return 0;
};

/**
 * Count search predicates in a log filter expression (for guardrail validation)
 */
export const countLogSearchPredicates = (expr: LogFilterExpression): number => {
  if ("and" in expr) {
    return expr.and.reduce((sum, e) => sum + countLogSearchPredicates(e), 0);
  }
  if ("or" in expr) {
    return expr.or.reduce((sum, e) => sum + countLogSearchPredicates(e), 0);
  }
  if ("not" in expr) {
    return countLogSearchPredicates(expr.not);
  }
  if ("search" in expr) {
    return 1;
  }
  return 0;
};

/**
 * Validate log filter expression against guardrails
 */
export const validateLogFilterGuardrails = (
  expr: LogFilterExpression
): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];

  const predicateCount = countLogPredicates(expr);
  if (predicateCount > FILTER_LIMITS.MAX_PREDICATES) {
    errors.push(
      `Too many predicates: ${predicateCount} (max: ${FILTER_LIMITS.MAX_PREDICATES})`
    );
  }

  const orGroupCount = countLogOrGroups(expr);
  if (orGroupCount > FILTER_LIMITS.MAX_OR_GROUPS) {
    errors.push(
      `Too many OR groups: ${orGroupCount} (max: ${FILTER_LIMITS.MAX_OR_GROUPS})`
    );
  }

  const searchCount = countLogSearchPredicates(expr);
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
