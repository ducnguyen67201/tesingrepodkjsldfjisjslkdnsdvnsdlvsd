/**
 * Log Types for Ducsigr SDK
 *
 * Defines types for SDK-side log handling that will be sent to
 * the ingest service in OTLP-compatible format.
 */

/**
 * Log severity levels matching OTLP conventions
 * @see https://opentelemetry.io/docs/specs/otel/logs/data-model/#severity-fields
 */
export type LogLevel = 'TRACE' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';

/**
 * OTLP severity number mapping
 * Each level has a range; we use the base number for each level
 *
 * TRACE: 1-4 -> 1
 * DEBUG: 5-8 -> 5
 * INFO: 9-12 -> 9
 * WARN: 13-16 -> 13
 * ERROR: 17-20 -> 17
 * FATAL: 21-24 -> 21
 */
export const SEVERITY_NUMBERS: Record<LogLevel, number> = {
  TRACE: 1,
  DEBUG: 5,
  INFO: 9,
  WARN: 13,
  ERROR: 17,
  FATAL: 21,
} as const;

/**
 * Log record as seen by SDK users
 */
export interface LogRecord {
  /** Log message (body) */
  message: string;
  /** Log severity level */
  level: LogLevel;
  /** Timestamp of the log */
  timestamp: Date;
  /** Additional attributes */
  attributes?: Record<string, unknown>;
  /** Associated trace ID (auto-attached from context when available) */
  traceId?: string;
  /** Associated span ID (auto-attached from context when available) */
  spanId?: string;
}

/**
 * Internal log data for transport to ingest service
 */
export interface LogData {
  /** Log message (body) */
  message: string;
  /** Log severity level */
  level: LogLevel;
  /** OTLP severity number */
  severityNumber: number;
  /** Timestamp in nanoseconds (OTLP format) */
  timeUnixNano: string;
  /** Additional attributes */
  attributes: Record<string, unknown>;
  /** Associated trace ID */
  traceId?: string;
  /** Associated span ID */
  spanId?: string;
}

/**
 * OTLP attribute format for log transport
 */
export interface OtlpLogAttribute {
  key: string;
  value: OtlpLogAttributeValue;
}

/**
 * OTLP attribute value types
 */
export interface OtlpLogAttributeValue {
  stringValue?: string;
  intValue?: string;
  doubleValue?: number;
  boolValue?: boolean;
  arrayValue?: { values: OtlpLogAttributeValue[] };
  kvlistValue?: { values: OtlpLogAttribute[] };
}

/**
 * OTLP Log Record format for wire protocol
 */
export interface OtlpLogRecordPayload {
  timeUnixNano: string;
  observedTimeUnixNano: string;
  severityNumber: number;
  severityText: string;
  body: { stringValue: string };
  attributes: OtlpLogAttribute[];
  traceId?: string;
  spanId?: string;
}

/**
 * OTLP Scope Logs format
 */
export interface OtlpScopeLogsPayload {
  scope: {
    name: string;
    version: string;
  };
  logRecords: OtlpLogRecordPayload[];
}

/**
 * OTLP Resource Logs format
 */
export interface OtlpResourceLogsPayload {
  resource: {
    attributes: OtlpLogAttribute[];
  };
  scopeLogs: OtlpScopeLogsPayload[];
}

/**
 * OTLP ExportLogsServiceRequest - the full request payload
 */
export interface OtlpLogsExportRequest {
  resourceLogs: OtlpResourceLogsPayload[];
}

/**
 * Response from logs ingest endpoint
 */
export interface LogsIngestResponse {
  partialSuccess?: {
    rejectedLogRecords?: number;
    errorMessage?: string;
  };
}
