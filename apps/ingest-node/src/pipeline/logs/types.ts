/**
 * Logs Pipeline Types
 *
 * Extends the base pipeline types for OTLP logs ingestion.
 */
import type {
  OtlpLogsExportRequest,
  NormalizedLogRecord,
} from "@cognobserve/api/schemas";
import type {
  BasePipelineContext,
  PipelineError,
  HandlerResult,
  PipelineHandler as GenericPipelineHandler,
} from "../shared/types.js";

// Re-export shared types for convenience
export type { PipelineError as LogsPipelineError, HandlerResult as LogsHandlerResult };

/**
 * Logs pipeline context that flows through all handlers
 */
export interface LogsPipelineContext extends BasePipelineContext {
  // After parsing
  parsedRequest?: OtlpLogsExportRequest;

  // After normalization
  normalizedLogs?: NormalizedLogRecord[];

  // After validation
  validationPassed?: boolean;
  rejectedCount?: number;
  rejectionReasons?: string[];

  // After persistence
  persistedCount?: number;
}

/**
 * Logs pipeline handler interface
 */
export type LogsPipelineHandler = GenericPipelineHandler<LogsPipelineContext>;

/**
 * Logs pipeline configuration
 */
export interface LogsPipelineConfig {
  /** Max logs per request */
  maxLogsPerRequest: number;
  /** Max attributes per log */
  maxAttrPerLog: number;
  /** Max log body length in bytes */
  maxLogBodyLen: number;
  /** Max timestamp drift in hours */
  logTimestampDriftHours: number;
}

/**
 * Logs-specific error codes
 */
export const LogsPipelineErrorCodes = {
  // Parsing errors (4xx)
  INVALID_CONTENT_TYPE: "INVALID_CONTENT_TYPE",
  INVALID_PAYLOAD: "INVALID_PAYLOAD",
  PARSE_ERROR: "PARSE_ERROR",
  DECOMPRESSION_ERROR: "DECOMPRESSION_ERROR",

  // Validation errors (4xx)
  PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",
  TOO_MANY_LOGS: "TOO_MANY_LOGS",
  LOG_BODY_TOO_LARGE: "LOG_BODY_TOO_LARGE",
  LOG_TIMESTAMP_INVALID: "LOG_TIMESTAMP_INVALID",
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

export type LogsPipelineErrorCode =
  (typeof LogsPipelineErrorCodes)[keyof typeof LogsPipelineErrorCodes];
