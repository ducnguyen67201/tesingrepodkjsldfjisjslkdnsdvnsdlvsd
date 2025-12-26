/**
 * Traces Pipeline Types
 *
 * Extends the base pipeline types for OTLP traces ingestion.
 */
import type {
  OtlpExportRequest,
  NormalizedTrace,
  NormalizedSpan,
} from "@ducsigr/api/schemas";
import type {
  BasePipelineContext,
  PipelineError,
  HandlerResult,
  PipelineHandler as GenericPipelineHandler,
} from "./shared/types.js";

// Re-export shared types
export type { PipelineError, HandlerResult };

/**
 * Traces pipeline context that flows through all handlers
 */
export interface PipelineContext extends BasePipelineContext {
  // After parsing
  parsedRequest?: OtlpExportRequest;

  // After normalization
  normalizedTraces?: NormalizedTrace[];
  normalizedSpans?: NormalizedSpan[];

  // After validation
  validationPassed?: boolean;

  // After persistence
  persistedTraceIds?: string[];
  persistedSpanCount?: number;
}

/**
 * Traces pipeline handler interface
 */
export type PipelineHandler = GenericPipelineHandler<PipelineContext>;

/**
 * Pipeline configuration
 */
export interface PipelineConfig {
  /** Max payload size in bytes */
  maxPayloadBytes: number;
  /** Max spans per request */
  maxSpansPerRequest: number;
  /** Max attributes per span */
  maxAttrPerSpan: number;
  /** Max events per span */
  maxEventsPerSpan: number;
  /** Max links per span */
  maxLinksPerSpan: number;
  /** Max attribute value length */
  maxAttrValueLen: number;
}

/**
 * Standard error codes for the pipeline
 */
export const PipelineErrorCodes = {
  // Parsing errors (4xx)
  INVALID_CONTENT_TYPE: "INVALID_CONTENT_TYPE",
  INVALID_PAYLOAD: "INVALID_PAYLOAD",
  PARSE_ERROR: "PARSE_ERROR",
  DECOMPRESSION_ERROR: "DECOMPRESSION_ERROR",

  // Validation errors (4xx)
  PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",
  TOO_MANY_SPANS: "TOO_MANY_SPANS",
  VALIDATION_FAILED: "VALIDATION_FAILED",

  // Auth errors (4xx)
  MISSING_API_KEY: "MISSING_API_KEY",
  INVALID_API_KEY: "INVALID_API_KEY",
  EXPIRED_API_KEY: "EXPIRED_API_KEY",

  // Persistence errors (5xx)
  DATABASE_ERROR: "DATABASE_ERROR",
  PERSISTENCE_FAILED: "PERSISTENCE_FAILED",

  // Internal errors (5xx)
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type PipelineErrorCode =
  (typeof PipelineErrorCodes)[keyof typeof PipelineErrorCodes];
