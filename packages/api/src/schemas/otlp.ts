/**
 * OTLP (OpenTelemetry Protocol) Zod Schemas
 *
 * Defines schemas for parsing and validating OTLP trace data.
 * Used by ingest-node service for ingestion and validation.
 *
 * @see https://opentelemetry.io/docs/specs/otlp/
 */
import { z } from "zod";

// ============================================================================
// OTLP Enums
// ============================================================================

/**
 * Span status code (OTLP StatusCode)
 * @see https://opentelemetry.io/docs/specs/otel/trace/api/#set-status
 */
export const SpanStatusCodeSchema = z.enum(["UNSET", "OK", "ERROR"]);
export type SpanStatusCode = z.infer<typeof SpanStatusCodeSchema>;

/**
 * Span kind (OTLP SpanKind)
 * @see https://opentelemetry.io/docs/specs/otel/trace/api/#spankind
 */
export const SpanKindSchema = z.enum([
  "INTERNAL",
  "SERVER",
  "CLIENT",
  "PRODUCER",
  "CONSUMER",
]);
export type SpanKind = z.infer<typeof SpanKindSchema>;

// OTLP uses integer values for status and kind
export const SPAN_STATUS_CODE_MAP: Record<number, SpanStatusCode> = {
  0: "UNSET",
  1: "OK",
  2: "ERROR",
};

export const SPAN_KIND_MAP: Record<number, SpanKind> = {
  0: "INTERNAL",
  1: "INTERNAL", // SPAN_KIND_UNSPECIFIED maps to INTERNAL
  2: "SERVER",
  3: "CLIENT",
  4: "PRODUCER",
  5: "CONSUMER",
};

// ============================================================================
// OTLP Attribute Types
// ============================================================================

/**
 * OTLP AnyValue - polymorphic value type
 * @see https://opentelemetry.io/docs/specs/otel/common/#anyvalue
 */
export const OtlpAnyValueSchema = z.object({
  stringValue: z.string().optional(),
  boolValue: z.boolean().optional(),
  intValue: z.union([z.string(), z.number()]).optional(), // OTLP int64: string or number in JSON
  doubleValue: z.number().optional(),
  arrayValue: z
    .object({
      values: z.array(z.unknown()),
    })
    .optional(),
  kvlistValue: z
    .object({
      values: z.array(
        z.object({
          key: z.string(),
          value: z.unknown(),
        })
      ),
    })
    .optional(),
  bytesValue: z.string().optional(), // base64 encoded
});
export type OtlpAnyValue = z.infer<typeof OtlpAnyValueSchema>;

/**
 * OTLP KeyValue - attribute key-value pair
 */
export const OtlpAttributeSchema = z.object({
  key: z.string(),
  value: OtlpAnyValueSchema,
});
export type OtlpAttribute = z.infer<typeof OtlpAttributeSchema>;

// ============================================================================
// OTLP Span Components
// ============================================================================

/**
 * OTLP Span Event
 * @see https://opentelemetry.io/docs/specs/otel/trace/api/#add-events
 */
export const OtlpEventSchema = z.object({
  timeUnixNano: z.string(),
  name: z.string(),
  attributes: z.array(OtlpAttributeSchema).optional(),
  droppedAttributesCount: z.number().optional(),
});
export type OtlpEvent = z.infer<typeof OtlpEventSchema>;

/**
 * OTLP Span Link
 * @see https://opentelemetry.io/docs/specs/otel/trace/api/#specifying-links
 */
export const OtlpLinkSchema = z.object({
  traceId: z.string(),
  spanId: z.string(),
  traceState: z.string().optional(),
  attributes: z.array(OtlpAttributeSchema).optional(),
  droppedAttributesCount: z.number().optional(),
  flags: z.number().optional(),
});
export type OtlpLink = z.infer<typeof OtlpLinkSchema>;

/**
 * OTLP Span Status
 */
export const OtlpStatusSchema = z.object({
  code: z.number().optional(), // 0=UNSET, 1=OK, 2=ERROR
  message: z.string().optional(),
});
export type OtlpStatus = z.infer<typeof OtlpStatusSchema>;

/**
 * OTLP Span
 * @see https://opentelemetry.io/docs/specs/otel/trace/api/#span
 */
export const OtlpSpanSchema = z.object({
  traceId: z.string(),
  spanId: z.string(),
  parentSpanId: z.string().optional(),
  name: z.string(),
  kind: z.number().optional(), // 0=INTERNAL, 1=UNSPECIFIED, 2=SERVER, 3=CLIENT, 4=PRODUCER, 5=CONSUMER
  startTimeUnixNano: z.string(),
  endTimeUnixNano: z.string().optional(),
  attributes: z.array(OtlpAttributeSchema).optional(),
  events: z.array(OtlpEventSchema).optional(),
  links: z.array(OtlpLinkSchema).optional(),
  status: OtlpStatusSchema.optional(),
  traceState: z.string().optional(),
  droppedAttributesCount: z.number().optional(),
  droppedEventsCount: z.number().optional(),
  droppedLinksCount: z.number().optional(),
  flags: z.number().optional(),
});
export type OtlpSpan = z.infer<typeof OtlpSpanSchema>;

// ============================================================================
// OTLP Instrumentation Scope
// ============================================================================

/**
 * OTLP InstrumentationScope
 * @see https://opentelemetry.io/docs/specs/otel/common/#instrumentationscope
 */
export const OtlpScopeSchema = z.object({
  name: z.string().optional(),
  version: z.string().optional(),
  attributes: z.array(OtlpAttributeSchema).optional(),
  droppedAttributesCount: z.number().optional(),
});
export type OtlpScope = z.infer<typeof OtlpScopeSchema>;

/**
 * OTLP ScopeSpans - spans from a single instrumentation scope
 */
export const OtlpScopeSpansSchema = z.object({
  scope: OtlpScopeSchema.optional(),
  spans: z.array(OtlpSpanSchema),
  schemaUrl: z.string().optional(),
});
export type OtlpScopeSpans = z.infer<typeof OtlpScopeSpansSchema>;

// ============================================================================
// OTLP Resource
// ============================================================================

/**
 * OTLP Resource
 * @see https://opentelemetry.io/docs/specs/otel/resource/sdk/
 */
export const OtlpResourceSchema = z.object({
  attributes: z.array(OtlpAttributeSchema).optional(),
  droppedAttributesCount: z.number().optional(),
});
export type OtlpResource = z.infer<typeof OtlpResourceSchema>;

/**
 * OTLP ResourceSpans - spans from a single resource
 */
export const OtlpResourceSpansSchema = z.object({
  resource: OtlpResourceSchema.optional(),
  scopeSpans: z.array(OtlpScopeSpansSchema),
  schemaUrl: z.string().optional(),
});
export type OtlpResourceSpans = z.infer<typeof OtlpResourceSpansSchema>;

// ============================================================================
// OTLP Export Request
// ============================================================================

/**
 * OTLP ExportTraceServiceRequest - the full request payload
 * @see https://opentelemetry.io/docs/specs/otlp/#otlphttp-request
 */
export const OtlpExportRequestSchema = z.object({
  resourceSpans: z.array(OtlpResourceSpansSchema),
});
export type OtlpExportRequest = z.infer<typeof OtlpExportRequestSchema>;

// ============================================================================
// Normalized Internal Schemas (for database persistence)
// ============================================================================

/**
 * Normalized span for database persistence
 * All OTLP-specific encodings are converted to native types
 */
export const NormalizedSpanSchema = z.object({
  // Core identifiers
  externalSpanId: z.string(),
  externalTraceId: z.string(),
  externalParentId: z.string().optional(),

  // Basic info
  name: z.string(),
  startTime: z.date(),
  endTime: z.date().optional(),
  durationMs: z.number().optional(),

  // Status
  statusCode: SpanStatusCodeSchema.optional(),
  statusMessage: z.string().optional(),

  // Classification
  kind: SpanKindSchema.optional(),

  // Attributes (flattened from OTLP)
  attributes: z.record(z.string(), z.unknown()).optional(),

  // Events and links (preserved as JSON)
  events: z.array(z.unknown()).optional(),
  links: z.array(z.unknown()).optional(),

  // Instrumentation scope
  libraryName: z.string().optional(),
  libraryVersion: z.string().optional(),

  // W3C trace context
  traceState: z.string().optional(),

  // GenAI fields (extracted from attributes)
  model: z.string().optional(),
  promptTokens: z.number().optional(),
  completionTokens: z.number().optional(),
  input: z.unknown().optional(),
  output: z.unknown().optional(),
});
export type NormalizedSpan = z.infer<typeof NormalizedSpanSchema>;

/**
 * Normalized trace for database persistence
 * Aggregates metadata from resource and computed fields
 */
export const NormalizedTraceSchema = z.object({
  // Core identifiers
  externalTraceId: z.string(),
  projectId: z.string(),

  // Service info (from resource attributes)
  serviceName: z.string().optional(),
  serviceVersion: z.string().optional(),
  environment: z.string().optional(),

  // Full resource (preserved as JSON)
  resource: z.record(z.string(), z.unknown()).optional(),

  // Timing
  startTime: z.date(),

  // Aggregates (computed from spans)
  durationMs: z.number().optional(),
  spanCount: z.number().optional(),
  errorCount: z.number().optional(),
});
export type NormalizedTrace = z.infer<typeof NormalizedTraceSchema>;

// ============================================================================
// Ingestion Response Schema
// ============================================================================

/**
 * Response from the ingest endpoint
 */
export const IngestResponseSchema = z.object({
  accepted: z.boolean(),
  traceCount: z.number(),
  spanCount: z.number(),
  partialSuccess: z
    .object({
      rejectedSpans: z.number().optional(),
      errorMessage: z.string().optional(),
    })
    .optional(),
});
export type IngestResponse = z.infer<typeof IngestResponseSchema>;

// ============================================================================
// GenAI Attribute Mappings
// ============================================================================

/**
 * Standard GenAI semantic convention attribute keys
 * @see https://opentelemetry.io/docs/specs/semconv/gen-ai/
 */
export const GENAI_ATTRIBUTE_KEYS = {
  // Request attributes
  MODEL: "gen_ai.request.model",
  MAX_TOKENS: "gen_ai.request.max_tokens",
  TEMPERATURE: "gen_ai.request.temperature",
  TOP_P: "gen_ai.request.top_p",

  // Response attributes
  FINISH_REASON: "gen_ai.response.finish_reasons",

  // Usage attributes
  PROMPT_TOKENS: "gen_ai.usage.input_tokens",
  COMPLETION_TOKENS: "gen_ai.usage.output_tokens",

  // Content attributes (custom - not in semconv)
  PROMPT: "gen_ai.prompt",
  COMPLETION: "gen_ai.completion",
} as const;

/**
 * Alternative attribute keys (legacy/vendor-specific)
 */
export const GENAI_ATTRIBUTE_ALIASES = {
  [GENAI_ATTRIBUTE_KEYS.PROMPT_TOKENS]: [
    "gen_ai.usage.prompt_tokens",
    "llm.token_count.prompt",
  ],
  [GENAI_ATTRIBUTE_KEYS.COMPLETION_TOKENS]: [
    "gen_ai.usage.completion_tokens",
    "llm.token_count.completion",
  ],
  [GENAI_ATTRIBUTE_KEYS.MODEL]: ["llm.model", "model"],
} as const;
