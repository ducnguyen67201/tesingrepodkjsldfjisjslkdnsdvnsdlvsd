/**
 * Filter Constants for Trace Filtering v2 UI
 *
 * Defines field metadata, display labels, and UI configuration
 * for the v2 FilterExpression-based filtering system.
 *
 * @see packages/api/src/schemas/filtering.ts for DSL types
 */

import type {
  FilterField,
  FilterOperator,
  TraceField,
  SpanField,
} from "@ducsigr/api/schemas";

// ============================================================================
// Filter Field Metadata
// ============================================================================

/**
 * Metadata for a filter field
 */
export interface FilterFieldMeta {
  /** Display label for the field */
  label: string;
  /** Short description */
  description?: string;
  /** Data type */
  type: "string" | "number" | "boolean" | "array";
  /** Category for grouping in UI */
  category: FilterFieldCategory;
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
 * Categories for grouping filter fields in the UI
 */
export type FilterFieldCategory =
  | "trace"
  | "http"
  | "database"
  | "rpc"
  | "genai"
  | "exception"
  | "experiment"
  | "general";

/**
 * Category display labels
 */
export const FILTER_CATEGORY_LABELS: Record<FilterFieldCategory, string> = {
  trace: "Trace",
  http: "HTTP",
  database: "Database",
  rpc: "RPC",
  genai: "GenAI / LLM",
  exception: "Exceptions",
  experiment: "A/B Experiments",
  general: "General",
} as const;

// ============================================================================
// Operator Metadata
// ============================================================================

/**
 * Display labels for operators
 */
export const OPERATOR_LABELS: Record<FilterOperator, string> = {
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
export const OPERATOR_SYMBOLS: Record<FilterOperator, string> = {
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

/**
 * Boolean operators
 */
const BOOL_OPS: readonly FilterOperator[] = ["eq"];

// ============================================================================
// Trace Field Metadata
// ============================================================================

/**
 * Metadata for trace-level fields
 */
export const TRACE_FIELD_META: Record<TraceField, FilterFieldMeta> = {
  "trace.serviceName": {
    label: "Service Name",
    type: "string",
    category: "trace",
    operators: STRING_OPS,
    placeholder: "e.g., api-service",
    common: true,
  },
  "trace.serviceVersion": {
    label: "Service Version",
    type: "string",
    category: "trace",
    operators: STRING_OPS,
    placeholder: "e.g., 1.2.3",
  },
  "trace.environment": {
    label: "Environment",
    type: "string",
    category: "trace",
    operators: STRING_OPS,
    placeholder: "e.g., production",
    common: true,
    knownValues: ["production", "staging", "development", "test"],
  },
  "trace.durationMs": {
    label: "Duration (ms)",
    description: "Total trace duration in milliseconds",
    type: "number",
    category: "trace",
    operators: NUMBER_OPS,
    placeholder: "e.g., 1000",
    common: true,
  },
  "trace.spanCount": {
    label: "Span Count",
    type: "number",
    category: "trace",
    operators: NUMBER_OPS,
    placeholder: "e.g., 10",
  },
  "trace.errorCount": {
    label: "Error Count",
    type: "number",
    category: "trace",
    operators: NUMBER_OPS,
    placeholder: "e.g., 0",
    common: true,
  },
  "trace.rootSpanName": {
    label: "Root Span Name",
    type: "string",
    category: "trace",
    operators: STRING_OPS,
    placeholder: "e.g., HTTP GET /api/users",
    common: true,
  },
  "trace.rootSpanKind": {
    label: "Root Span Kind",
    type: "string",
    category: "trace",
    operators: ["eq", "neq", "in", "nin"],
    knownValues: ["SERVER", "CLIENT", "INTERNAL", "PRODUCER", "CONSUMER"],
  },
  "trace.rootSpanStatusCode": {
    label: "Root Status",
    type: "string",
    category: "trace",
    operators: ["eq", "neq", "in", "nin"],
    knownValues: ["OK", "ERROR", "UNSET"],
    common: true,
  },
  "trace.rootSpanDurationMs": {
    label: "Root Duration (ms)",
    type: "number",
    category: "trace",
    operators: NUMBER_OPS,
    placeholder: "e.g., 500",
  },
  "trace.hasError": {
    label: "Has Error",
    type: "boolean",
    category: "trace",
    operators: BOOL_OPS,
    common: true,
  },
  "trace.hasException": {
    label: "Has Exception",
    type: "boolean",
    category: "trace",
    operators: BOOL_OPS,
    common: true,
  },
} as const;

// ============================================================================
// Span Field Metadata
// ============================================================================

/**
 * Metadata for span-level fields
 */
export const SPAN_FIELD_META: Record<SpanField, FilterFieldMeta> = {
  // Core fields
  "span.name": {
    label: "Span Name",
    type: "string",
    category: "general",
    operators: STRING_OPS,
    placeholder: "e.g., processRequest",
    common: true,
  },
  "span.kind": {
    label: "Span Kind",
    type: "string",
    category: "general",
    operators: ["eq", "neq", "in", "nin"],
    knownValues: ["SERVER", "CLIENT", "INTERNAL", "PRODUCER", "CONSUMER"],
  },
  "span.statusCode": {
    label: "Status Code",
    type: "string",
    category: "general",
    operators: ["eq", "neq", "in", "nin"],
    knownValues: ["OK", "ERROR", "UNSET"],
    common: true,
  },
  "span.statusMessage": {
    label: "Status Message",
    type: "string",
    category: "general",
    operators: STRING_OPS,
    placeholder: "e.g., success",
  },
  "span.durationMs": {
    label: "Span Duration (ms)",
    type: "number",
    category: "general",
    operators: NUMBER_OPS,
    placeholder: "e.g., 100",
    common: true,
  },
  "span.libraryName": {
    label: "Library Name",
    type: "string",
    category: "general",
    operators: STRING_OPS,
    placeholder: "e.g., @opentelemetry/instrumentation-http",
  },
  "span.libraryVersion": {
    label: "Library Version",
    type: "string",
    category: "general",
    operators: STRING_OPS,
  },

  // HTTP fields
  "span.httpMethod": {
    label: "HTTP Method",
    type: "string",
    category: "http",
    operators: ["eq", "neq", "in", "nin"],
    knownValues: ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"],
    common: true,
  },
  "span.httpRoute": {
    label: "HTTP Route",
    type: "string",
    category: "http",
    operators: STRING_OPS,
    placeholder: "e.g., /api/users/:id",
    common: true,
  },
  "span.httpStatusCode": {
    label: "HTTP Status",
    type: "number",
    category: "http",
    operators: NUMBER_OPS,
    placeholder: "e.g., 200",
    common: true,
  },
  "span.httpUrl": {
    label: "HTTP URL",
    type: "string",
    category: "http",
    operators: STRING_OPS,
    placeholder: "e.g., https://api.example.com",
  },

  // Database fields
  "span.dbSystem": {
    label: "DB System",
    type: "string",
    category: "database",
    operators: ["eq", "neq", "in", "nin"],
    knownValues: [
      "postgresql",
      "mysql",
      "mongodb",
      "redis",
      "sqlite",
      "mssql",
      "oracle",
    ],
    common: true,
  },
  "span.dbName": {
    label: "Database Name",
    type: "string",
    category: "database",
    operators: STRING_OPS,
    placeholder: "e.g., users_db",
  },
  "span.dbOperation": {
    label: "DB Operation",
    type: "string",
    category: "database",
    operators: ["eq", "neq", "in", "nin"],
    knownValues: [
      "SELECT",
      "INSERT",
      "UPDATE",
      "DELETE",
      "CREATE",
      "DROP",
      "findOne",
      "find",
      "aggregate",
    ],
    common: true,
  },
  "span.dbStatement": {
    label: "DB Statement",
    type: "string",
    category: "database",
    operators: ["contains", "prefix"],
    placeholder: "e.g., SELECT * FROM",
  },
  "span.dbCollection": {
    label: "DB Collection/Table",
    type: "string",
    category: "database",
    operators: STRING_OPS,
    placeholder: "e.g., users",
  },

  // RPC fields
  "span.rpcSystem": {
    label: "RPC System",
    type: "string",
    category: "rpc",
    operators: ["eq", "neq", "in", "nin"],
    knownValues: ["grpc", "aws-api", "azure", "graphql"],
  },
  "span.rpcService": {
    label: "RPC Service",
    type: "string",
    category: "rpc",
    operators: STRING_OPS,
    placeholder: "e.g., UserService",
  },
  "span.rpcMethod": {
    label: "RPC Method",
    type: "string",
    category: "rpc",
    operators: STRING_OPS,
    placeholder: "e.g., GetUser",
  },
  "span.rpcStatusCode": {
    label: "RPC Status Code",
    type: "number",
    category: "rpc",
    operators: NUMBER_OPS,
    placeholder: "e.g., 0 (OK)",
  },

  // Exception fields
  "span.exceptionType": {
    label: "Exception Type",
    type: "string",
    category: "exception",
    operators: STRING_OPS,
    placeholder: "e.g., ValueError",
    common: true,
  },
  "span.exceptionMessage": {
    label: "Exception Message",
    type: "string",
    category: "exception",
    operators: ["contains", "prefix"],
    placeholder: "e.g., connection refused",
  },

  // GenAI fields
  "span.model": {
    label: "Model",
    type: "string",
    category: "genai",
    operators: STRING_OPS,
    placeholder: "e.g., gpt-4",
    common: true,
  },
  "span.promptTokens": {
    label: "Prompt Tokens",
    type: "number",
    category: "genai",
    operators: NUMBER_OPS,
    placeholder: "e.g., 500",
  },
  "span.completionTokens": {
    label: "Completion Tokens",
    type: "number",
    category: "genai",
    operators: NUMBER_OPS,
    placeholder: "e.g., 200",
  },
  "span.genAiOperation": {
    label: "GenAI Operation",
    type: "string",
    category: "genai",
    operators: ["eq", "neq", "in", "nin"],
    knownValues: ["chat", "completion", "embedding", "image"],
  },
  "span.genAiProvider": {
    label: "GenAI Provider",
    type: "string",
    category: "genai",
    operators: ["eq", "neq", "in", "nin"],
    knownValues: ["openai", "anthropic", "cohere", "huggingface"],
    common: true,
  },

  // Inferred type
  "span.spanType": {
    label: "Span Type",
    type: "string",
    category: "general",
    operators: ["eq", "neq", "in", "nin"],
    knownValues: ["LLM", "HTTP", "DB", "RPC", "FUNCTION", "CUSTOM"],
    common: true,
  },

  // Prompt Experiment fields
  "span.promptExperimentId": {
    label: "Experiment ID",
    type: "string",
    category: "experiment",
    operators: ["eq", "neq", "in", "nin", "exists"],
    placeholder: "e.g., clxyz123...",
  },
  "span.promptExperimentSlug": {
    label: "Experiment Slug",
    type: "string",
    category: "experiment",
    operators: STRING_OPS,
    placeholder: "e.g., checkout-copy-test",
    common: true,
  },
  "span.promptVariantId": {
    label: "Variant ID",
    type: "string",
    category: "experiment",
    operators: ["eq", "neq", "in", "nin", "exists"],
    placeholder: "e.g., clxyz456...",
  },
  "span.promptVariantName": {
    label: "Variant Name",
    type: "string",
    category: "experiment",
    operators: ["eq", "neq", "in", "nin"],
    knownValues: ["A", "B"],
    common: true,
  },
} as const;

// ============================================================================
// Combined Field Metadata
// ============================================================================

/**
 * All field metadata combined
 */
export const ALL_FIELD_META: Record<FilterField, FilterFieldMeta> = {
  ...TRACE_FIELD_META,
  ...SPAN_FIELD_META,
} as const;

/**
 * Get metadata for a field
 */
export const getFieldMeta = (field: FilterField): FilterFieldMeta | undefined => {
  return ALL_FIELD_META[field];
};

/**
 * Get common fields for quick filter UI
 */
export const getCommonFields = (): FilterField[] => {
  return (Object.entries(ALL_FIELD_META) as [FilterField, FilterFieldMeta][])
    .filter(([, meta]) => meta.common)
    .map(([field]) => field);
};

/**
 * Get fields by category
 */
export const getFieldsByCategory = (
  category: FilterFieldCategory
): FilterField[] => {
  return (Object.entries(ALL_FIELD_META) as [FilterField, FilterFieldMeta][])
    .filter(([, meta]) => meta.category === category)
    .map(([field]) => field);
};

// ============================================================================
// Quick Filter Presets
// ============================================================================

/**
 * Quick filter preset definition
 */
export interface QuickFilterPreset {
  id: string;
  label: string;
  description: string;
  icon?: string;
  /** Creates the FilterExpression for this preset */
  createFilter: () => import("@ducsigr/api/schemas").FilterExpression;
}

/**
 * Built-in quick filter presets
 */
export const QUICK_FILTER_PRESETS: readonly QuickFilterPreset[] = [
  {
    id: "errors",
    label: "Errors",
    description: "Traces with errors",
    createFilter: () => ({
      field: "trace.hasError" as const,
      op: "eq" as const,
      value: true,
    }),
  },
  {
    id: "exceptions",
    label: "Exceptions",
    description: "Traces with unhandled exceptions",
    createFilter: () => ({
      field: "trace.hasException" as const,
      op: "eq" as const,
      value: true,
    }),
  },
  {
    id: "slow",
    label: "Slow (>5s)",
    description: "Traces taking more than 5 seconds",
    createFilter: () => ({
      field: "trace.durationMs" as const,
      op: "gt" as const,
      value: 5000,
    }),
  },
  {
    id: "llm",
    label: "LLM Calls",
    description: "Traces containing LLM/GenAI spans",
    createFilter: () => ({
      field: "span.spanType" as const,
      op: "eq" as const,
      value: "LLM",
    }),
  },
  {
    id: "http-errors",
    label: "HTTP 5xx",
    description: "Traces with server errors",
    createFilter: () => ({
      and: [
        { field: "span.httpStatusCode" as const, op: "gte" as const, value: 500 },
        { field: "span.httpStatusCode" as const, op: "lt" as const, value: 600 },
      ],
    }),
  },
  {
    id: "db-slow",
    label: "Slow DB",
    description: "Database queries taking >100ms",
    createFilter: () => ({
      and: [
        { field: "span.spanType" as const, op: "eq" as const, value: "DB" },
        { field: "span.durationMs" as const, op: "gt" as const, value: 100 },
      ],
    }),
  },
] as const;

// ============================================================================
// URL Serialization
// ============================================================================

/**
 * URL parameter keys for filter state
 */
export const FILTER_V2_URL_PARAMS = {
  /** Base64-encoded FilterExpression */
  filter: "f",
  /** Search query */
  query: "q",
  /** Search scope */
  scope: "s",
  /** Time range start (ISO string) */
  from: "from",
  /** Time range end (ISO string) */
  to: "to",
  /** Selected trace ID */
  trace: "trace",
} as const;

/**
 * Compress filter expression for URL (uses short keys)
 */
export const compressFilterForUrl = (
  filter: import("@ducsigr/api/schemas").FilterExpression
): string => {
  // Use short keys for common properties to reduce URL size
  const shorten = (obj: unknown): unknown => {
    if (Array.isArray(obj)) {
      return obj.map(shorten);
    }
    if (typeof obj === "object" && obj !== null) {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        // Short key mappings
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
 * Decompress filter expression from URL
 */
export const decompressFilterFromUrl = (
  encoded: string
): import("@ducsigr/api/schemas").FilterExpression | null => {
  try {
    const json = JSON.parse(atob(encoded));

    // Expand short keys back to full names
    const expand = (obj: unknown): unknown => {
      if (Array.isArray(obj)) {
        return obj.map(expand);
      }
      if (typeof obj === "object" && obj !== null) {
        const result: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(obj)) {
          // Expand short keys
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

    return expand(json) as import("@ducsigr/api/schemas").FilterExpression;
  } catch {
    return null;
  }
};
