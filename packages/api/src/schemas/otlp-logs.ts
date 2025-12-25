/**
 * OTLP Logs Zod Schemas
 *
 * Defines schemas for parsing and validating OTLP log data.
 * Used by ingest-node service for log ingestion and validation.
 *
 * @see https://opentelemetry.io/docs/specs/otlp/
 * @see https://opentelemetry.io/docs/specs/otel/logs/data-model/
 */
import { z } from "zod";

// Reuse existing OTLP schemas
import {
  OtlpAnyValueSchema,
  OtlpAttributeSchema,
  OtlpScopeSchema,
  OtlpResourceSchema,
} from "./otlp";

// ============================================================================
// OTLP Log Severity
// ============================================================================

/**
 * OTLP Severity Number
 * @see https://opentelemetry.io/docs/specs/otel/logs/data-model/#severity-fields
 *
 * 1-4: TRACE
 * 5-8: DEBUG
 * 9-12: INFO
 * 13-16: WARN
 * 17-20: ERROR
 * 21-24: FATAL
 */
export const SeverityNumberSchema = z.number().min(0).max(24).optional();
export type SeverityNumber = z.infer<typeof SeverityNumberSchema>;

/**
 * Map severity number to text
 */
export const SEVERITY_TEXT_MAP: Record<number, string> = {
  1: "TRACE",
  2: "TRACE2",
  3: "TRACE3",
  4: "TRACE4",
  5: "DEBUG",
  6: "DEBUG2",
  7: "DEBUG3",
  8: "DEBUG4",
  9: "INFO",
  10: "INFO2",
  11: "INFO3",
  12: "INFO4",
  13: "WARN",
  14: "WARN2",
  15: "WARN3",
  16: "WARN4",
  17: "ERROR",
  18: "ERROR2",
  19: "ERROR3",
  20: "ERROR4",
  21: "FATAL",
  22: "FATAL2",
  23: "FATAL3",
  24: "FATAL4",
};

/**
 * Get severity level (TRACE, DEBUG, INFO, WARN, ERROR, FATAL)
 */
export function getSeverityLevel(severityNumber: number): string {
  if (severityNumber <= 4) return "TRACE";
  if (severityNumber <= 8) return "DEBUG";
  if (severityNumber <= 12) return "INFO";
  if (severityNumber <= 16) return "WARN";
  if (severityNumber <= 20) return "ERROR";
  return "FATAL";
}

// ============================================================================
// OTLP Log Record
// ============================================================================

/**
 * OTLP LogRecord
 * @see https://opentelemetry.io/docs/specs/otel/logs/data-model/#log-and-event-record-definition
 */
export const OtlpLogRecordSchema = z.object({
  // Timing
  timeUnixNano: z.string().optional(),
  observedTimeUnixNano: z.string().optional(),

  // Severity
  severityNumber: SeverityNumberSchema,
  severityText: z.string().optional(),

  // Body (the log message)
  body: OtlpAnyValueSchema.optional(),

  // Attributes
  attributes: z.array(OtlpAttributeSchema).optional(),
  droppedAttributesCount: z.number().optional(),

  // Trace correlation
  traceId: z.string().optional(),
  spanId: z.string().optional(),

  // Flags
  flags: z.number().optional(),
});
export type OtlpLogRecord = z.infer<typeof OtlpLogRecordSchema>;

// ============================================================================
// OTLP Scope Logs
// ============================================================================

/**
 * OTLP ScopeLogs - logs from a single instrumentation scope
 */
export const OtlpScopeLogsSchema = z.object({
  scope: OtlpScopeSchema.optional(),
  logRecords: z.array(OtlpLogRecordSchema),
  schemaUrl: z.string().optional(),
});
export type OtlpScopeLogs = z.infer<typeof OtlpScopeLogsSchema>;

// ============================================================================
// OTLP Resource Logs
// ============================================================================

/**
 * OTLP ResourceLogs - logs from a single resource
 */
export const OtlpResourceLogsSchema = z.object({
  resource: OtlpResourceSchema.optional(),
  scopeLogs: z.array(OtlpScopeLogsSchema),
  schemaUrl: z.string().optional(),
});
export type OtlpResourceLogs = z.infer<typeof OtlpResourceLogsSchema>;

// ============================================================================
// OTLP Export Request
// ============================================================================

/**
 * OTLP ExportLogsServiceRequest - the full request payload
 * @see https://opentelemetry.io/docs/specs/otlp/#otlphttp-request
 */
export const OtlpLogsExportRequestSchema = z.object({
  resourceLogs: z.array(OtlpResourceLogsSchema),
});
export type OtlpLogsExportRequest = z.infer<typeof OtlpLogsExportRequestSchema>;

// ============================================================================
// Normalized Log Record (for database persistence)
// ============================================================================

/**
 * Normalized log record for database persistence
 * All OTLP-specific encodings are converted to native types
 */
export const NormalizedLogRecordSchema = z.object({
  // Project association
  projectId: z.string(),

  // Resource attributes (promoted for filtering)
  serviceName: z.string().optional(),
  serviceVersion: z.string().optional(),
  environment: z.string().optional(),
  resource: z.record(z.string(), z.unknown()).optional(),

  // Instrumentation scope
  scopeName: z.string().optional(),
  scopeVersion: z.string().optional(),

  // Timing
  timestamp: z.date(),
  observedTime: z.date().optional(),

  // Severity
  severityNumber: z.number().optional(),
  severityText: z.string().optional(),

  // Body (preserved as JSON and extracted text)
  body: z.unknown().optional(),
  bodyText: z.string().optional(),

  // Attributes (flattened from OTLP)
  attributes: z.record(z.string(), z.unknown()).optional(),
  droppedAttributesCount: z.number().optional(),

  // Trace correlation
  traceId: z.string().optional(),
  spanId: z.string().optional(),

  // Flags
  flags: z.number().optional(),

  // Ingest metadata
  ingestSource: z.string().optional(),
});
export type NormalizedLogRecord = z.infer<typeof NormalizedLogRecordSchema>;

// ============================================================================
// Logs Ingestion Response Schema
// ============================================================================

/**
 * Response from the logs ingest endpoint
 * Follows OTLP partial success pattern
 */
export const LogsIngestResponseSchema = z.object({
  partialSuccess: z
    .object({
      rejectedLogRecords: z.number().optional(),
      errorMessage: z.string().optional(),
    })
    .optional(),
});
export type LogsIngestResponse = z.infer<typeof LogsIngestResponseSchema>;

// ============================================================================
// Log Attribute Keys
// ============================================================================

/**
 * Common log attribute keys
 */
export const LOG_ATTRIBUTE_KEYS = {
  // Service identification
  SERVICE_NAME: "service.name",
  SERVICE_VERSION: "service.version",
  DEPLOYMENT_ENVIRONMENT: "deployment.environment",

  // Log-specific
  LOG_FILE_NAME: "log.file.name",
  LOG_FILE_PATH: "log.file.path",
  LOG_IOSTREAM: "log.iostream",

  // Exception in logs
  EXCEPTION_TYPE: "exception.type",
  EXCEPTION_MESSAGE: "exception.message",
  EXCEPTION_STACKTRACE: "exception.stacktrace",
} as const;
