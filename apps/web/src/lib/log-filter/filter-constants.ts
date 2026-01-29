/**
 * Filter Constants for Log Filtering v2 UI
 *
 * Defines field metadata, display labels, and UI configuration
 * for the LogFilterExpression-based filtering system.
 *
 * @see packages/api/src/schemas/log-filtering.ts for DSL types
 */

import type {
  LogField,
  LogFilterExpression,
} from "@ducsigr/api/schemas";
import type { FilterOperator } from "@ducsigr/api/schemas";

// ============================================================================
// Filter Field Metadata
// ============================================================================

/**
 * Metadata for a log filter field
 */
export interface LogFilterFieldMeta {
  /** Display label for the field */
  label: string;
  /** Short description */
  description?: string;
  /** Data type */
  type: "string" | "number" | "boolean";
  /** Category for grouping in UI */
  category: LogFilterFieldCategory;
  /** Valid operators for this field */
  operators: readonly FilterOperator[];
  /** Placeholder text for value input */
  placeholder?: string;
  /** Whether this is a commonly used field (shown in quick filters) */
  common?: boolean;
  /** Known values for autocomplete (static) */
  knownValues?: readonly string[];
}

/**
 * Categories for grouping log filter fields in the UI
 */
export type LogFilterFieldCategory = "core" | "severity" | "correlation" | "metadata";

/**
 * Category display labels
 */
export const LOG_FILTER_CATEGORY_LABELS: Record<LogFilterFieldCategory, string> = {
  core: "Core",
  severity: "Severity",
  correlation: "Correlation",
  metadata: "Metadata",
} as const;

// ============================================================================
// Operator Metadata
// ============================================================================

/**
 * Display labels for operators
 */
export const LOG_OPERATOR_LABELS: Record<FilterOperator, string> = {
  eq: "equals",
  neq: "not equals",
  in: "in",
  nin: "not in",
  gt: "greater than",
  gte: "at least",
  lt: "less than",
  lte: "at most",
  exists: "exists",
  prefix: "starts with",
  contains: "contains",
} as const;

/**
 * Short operator symbols for display in chips
 */
export const LOG_OPERATOR_SYMBOLS: Record<FilterOperator, string> = {
  eq: "=",
  neq: "!=",
  in: "in",
  nin: "not in",
  gt: ">",
  gte: ">=",
  lt: "<",
  lte: "<=",
  exists: "exists",
  prefix: "^",
  contains: "~",
} as const;

/**
 * Common string operators
 */
const STRING_OPS: readonly FilterOperator[] = [
  "eq",
  "neq",
  "in",
  "nin",
  "prefix",
  "contains",
  "exists",
];

/**
 * Common number operators
 */
const NUMBER_OPS: readonly FilterOperator[] = [
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  "nin",
  "exists",
];

// ============================================================================
// Log Field Metadata
// ============================================================================

/**
 * Metadata for log-level fields
 */
export const LOG_FIELD_META: Record<LogField, LogFilterFieldMeta> = {
  "log.serviceName": {
    label: "Service Name",
    type: "string",
    category: "core",
    operators: STRING_OPS,
    placeholder: "e.g., api-service",
    common: true,
  },
  "log.serviceVersion": {
    label: "Service Version",
    type: "string",
    category: "metadata",
    operators: STRING_OPS,
    placeholder: "e.g., 1.2.3",
  },
  "log.environment": {
    label: "Environment",
    type: "string",
    category: "core",
    operators: STRING_OPS,
    placeholder: "e.g., production",
    common: true,
    knownValues: ["production", "staging", "development", "test"],
  },
  "log.severity": {
    label: "Severity",
    description: "Severity text (DEBUG, INFO, WARN, ERROR, FATAL)",
    type: "string",
    category: "severity",
    operators: ["eq", "neq", "in", "nin"],
    knownValues: ["TRACE", "DEBUG", "INFO", "WARN", "ERROR", "FATAL"],
    common: true,
  },
  "log.severityNumber": {
    label: "Severity Number",
    description: "OTLP severity number (1-24)",
    type: "number",
    category: "severity",
    operators: NUMBER_OPS,
    placeholder: "e.g., 17 for ERROR",
    common: true,
  },
  "log.body": {
    label: "Log Body",
    description: "Log message text",
    type: "string",
    category: "core",
    operators: ["contains", "prefix", "eq"],
    placeholder: "Search log message...",
    common: true,
  },
  "log.traceId": {
    label: "Trace ID",
    description: "Correlated trace ID",
    type: "string",
    category: "correlation",
    operators: ["eq", "exists"],
    placeholder: "32-char hex trace ID",
  },
  "log.spanId": {
    label: "Span ID",
    description: "Correlated span ID",
    type: "string",
    category: "correlation",
    operators: ["eq", "exists"],
    placeholder: "16-char hex span ID",
  },
  "log.scopeName": {
    label: "Scope Name",
    description: "Logger/instrumentation scope name",
    type: "string",
    category: "metadata",
    operators: STRING_OPS,
    placeholder: "e.g., my-logger",
  },
} as const;

/**
 * Get metadata for a log field
 */
export const getLogFieldMeta = (field: LogField): LogFilterFieldMeta | undefined => {
  return LOG_FIELD_META[field];
};

/**
 * Get common log fields for quick filter UI
 */
export const getCommonLogFields = (): LogField[] => {
  return (Object.entries(LOG_FIELD_META) as [LogField, LogFilterFieldMeta][])
    .filter(([, meta]) => meta.common)
    .map(([field]) => field);
};

/**
 * Get log fields by category
 */
export const getLogFieldsByCategory = (
  category: LogFilterFieldCategory
): LogField[] => {
  return (Object.entries(LOG_FIELD_META) as [LogField, LogFilterFieldMeta][])
    .filter(([, meta]) => meta.category === category)
    .map(([field]) => field);
};

// ============================================================================
// Quick Filter Presets
// ============================================================================

/**
 * Quick filter preset definition for logs
 */
export interface LogQuickFilterPreset {
  id: string;
  label: string;
  description: string;
  color?: string;
  /** Creates the LogFilterExpression for this preset */
  createFilter: () => LogFilterExpression;
}

/**
 * Built-in quick filter presets for logs
 */
export const LOG_QUICK_FILTER_PRESETS: readonly LogQuickFilterPreset[] = [
  {
    id: "errors",
    label: "Errors",
    description: "Error and Fatal logs (severity >= 17)",
    color: "destructive",
    createFilter: () => ({
      field: "log.severityNumber" as const,
      op: "gte" as const,
      value: 17,
    }),
  },
  {
    id: "warnings",
    label: "Warnings",
    description: "Warning logs (severity 13-16)",
    color: "warning",
    createFilter: () => ({
      and: [
        { field: "log.severityNumber" as const, op: "gte" as const, value: 13 },
        { field: "log.severityNumber" as const, op: "lte" as const, value: 16 },
      ],
    }),
  },
  {
    id: "info-plus",
    label: "Info+",
    description: "Info, Warn, Error, Fatal logs (severity >= 9)",
    createFilter: () => ({
      field: "log.severityNumber" as const,
      op: "gte" as const,
      value: 9,
    }),
  },
  {
    id: "debug-plus",
    label: "Debug+",
    description: "Debug and above (severity >= 5)",
    createFilter: () => ({
      field: "log.severityNumber" as const,
      op: "gte" as const,
      value: 5,
    }),
  },
  {
    id: "with-trace",
    label: "With Trace",
    description: "Logs linked to traces",
    createFilter: () => ({
      field: "log.traceId" as const,
      op: "exists" as const,
    }),
  },
] as const;

// ============================================================================
// Severity Level Helpers
// ============================================================================

/**
 * OTLP severity number ranges
 */
export const SEVERITY_LEVELS = {
  TRACE: { min: 1, max: 4 },
  DEBUG: { min: 5, max: 8 },
  INFO: { min: 9, max: 12 },
  WARN: { min: 13, max: 16 },
  ERROR: { min: 17, max: 20 },
  FATAL: { min: 21, max: 24 },
} as const;

/**
 * Get severity level from number
 */
export const getSeverityLevel = (
  severityNumber: number
): keyof typeof SEVERITY_LEVELS => {
  if (severityNumber <= 4) return "TRACE";
  if (severityNumber <= 8) return "DEBUG";
  if (severityNumber <= 12) return "INFO";
  if (severityNumber <= 16) return "WARN";
  if (severityNumber <= 20) return "ERROR";
  return "FATAL";
};

/**
 * Get severity color for styling
 */
export const getSeverityColor = (level: keyof typeof SEVERITY_LEVELS): string => {
  const colors: Record<keyof typeof SEVERITY_LEVELS, string> = {
    TRACE: "text-muted-foreground",
    DEBUG: "text-blue-600 dark:text-blue-400",
    INFO: "text-green-600 dark:text-green-400",
    WARN: "text-yellow-600 dark:text-yellow-400",
    ERROR: "text-red-600 dark:text-red-400",
    FATAL: "text-red-800 dark:text-red-300",
  };
  return colors[level];
};

// ============================================================================
// URL Serialization
// ============================================================================

/**
 * URL parameter keys for log filter state
 */
export const LOG_FILTER_V2_URL_PARAMS = {
  /** Base64-encoded LogFilterExpression */
  filter: "lf",
  /** Search query */
  query: "lq",
  /** Time range start (ISO string) */
  from: "lfrom",
  /** Time range end (ISO string) */
  to: "lto",
  /** Selected log ID */
  log: "log",
} as const;

/**
 * Compress log filter expression for URL (uses short keys)
 */
export const compressLogFilterForUrl = (filter: LogFilterExpression): string => {
  const shorten = (obj: unknown): unknown => {
    if (Array.isArray(obj)) {
      return obj.map(shorten);
    }
    if (typeof obj === "object" && obj !== null) {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        const shortKey =
          key === "and"
            ? "a"
            : key === "or"
              ? "o"
              : key === "not"
                ? "n"
                : key === "field"
                  ? "f"
                  : key === "op"
                    ? "p"
                    : key === "value"
                      ? "v"
                      : key === "attribute"
                        ? "t"
                        : key === "search"
                          ? "s"
                          : key === "scope"
                            ? "c"
                            : key === "key"
                              ? "k"
                              : key === "query"
                                ? "q"
                                : key === "mode"
                                  ? "m"
                                  : key;
        result[shortKey] = shorten(value);
      }
      return result;
    }
    return obj;
  };

  const compressed = shorten(filter);
  return btoa(JSON.stringify(compressed));
};

/**
 * Decompress log filter expression from URL
 */
export const decompressLogFilterFromUrl = (
  encoded: string
): LogFilterExpression | null => {
  try {
    const json = JSON.parse(atob(encoded));

    const expand = (obj: unknown): unknown => {
      if (Array.isArray(obj)) {
        return obj.map(expand);
      }
      if (typeof obj === "object" && obj !== null) {
        const result: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(obj)) {
          const fullKey =
            key === "a"
              ? "and"
              : key === "o"
                ? "or"
                : key === "n"
                  ? "not"
                  : key === "f"
                    ? "field"
                    : key === "p"
                      ? "op"
                      : key === "v"
                        ? "value"
                        : key === "t"
                          ? "attribute"
                          : key === "s"
                            ? "search"
                            : key === "c"
                              ? "scope"
                              : key === "k"
                                ? "key"
                                : key === "q"
                                  ? "query"
                                  : key === "m"
                                    ? "mode"
                                    : key;
          result[fullKey] = expand(value);
        }
        return result;
      }
      return obj;
    };

    return expand(json) as LogFilterExpression;
  } catch {
    return null;
  }
};
