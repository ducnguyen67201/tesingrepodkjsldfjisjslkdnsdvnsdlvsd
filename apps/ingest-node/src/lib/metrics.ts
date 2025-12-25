import { Counter, Histogram, Registry, collectDefaultMetrics } from "prom-client";

/**
 * Prometheus metrics registry
 */
export const registry = new Registry();

// Collect default Node.js metrics
collectDefaultMetrics({ register: registry });

/**
 * Total ingest requests counter
 */
export const requestCounter = new Counter({
  name: "ingest_requests_total",
  help: "Total number of ingest requests",
  labelNames: ["status", "content_type"],
  registers: [registry],
});

/**
 * Request latency histogram
 */
export const requestLatency = new Histogram({
  name: "ingest_request_duration_seconds",
  help: "Ingest request duration in seconds",
  labelNames: ["status"],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});

/**
 * Total spans ingested counter
 */
export const spanCounter = new Counter({
  name: "ingest_spans_total",
  help: "Total number of spans ingested",
  labelNames: ["project_id", "status"],
  registers: [registry],
});

/**
 * Rejected requests counter
 */
export const rejectCounter = new Counter({
  name: "ingest_rejects_total",
  help: "Total number of rejected requests",
  labelNames: ["reason"],
  registers: [registry],
});

/**
 * Payload size histogram
 */
export const payloadSize = new Histogram({
  name: "ingest_payload_bytes",
  help: "Ingest request payload size in bytes",
  buckets: [1024, 10240, 51200, 102400, 262144, 524288],
  registers: [registry],
});

/**
 * Database operation latency histogram
 */
export const dbLatency = new Histogram({
  name: "ingest_db_duration_seconds",
  help: "Database operation duration in seconds",
  labelNames: ["operation"],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
  registers: [registry],
});

/**
 * Pipeline handler duration histogram
 */
export const handlerDuration = new Histogram({
  name: "ingest_handler_duration_seconds",
  help: "Pipeline handler execution duration in seconds",
  labelNames: ["handler", "status"],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
  registers: [registry],
});

/**
 * Pipeline total duration histogram
 */
export const pipelineDuration = new Histogram({
  name: "ingest_pipeline_duration_seconds",
  help: "Total pipeline execution duration in seconds",
  labelNames: ["status"],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});

/**
 * Request errors counter
 */
export const requestErrors = new Counter({
  name: "ingest_request_errors_total",
  help: "Total number of request errors",
  labelNames: ["error_code", "status_code"],
  registers: [registry],
});

// ============================================================================
// Logs-specific metrics
// ============================================================================

/**
 * Total log ingestion requests counter
 */
export const logRequestCounter = new Counter({
  name: "ingest_logs_total",
  help: "Total number of log ingestion requests",
  labelNames: ["status", "content_type"],
  registers: [registry],
});

/**
 * Total log records ingested counter
 */
export const logRecordCounter = new Counter({
  name: "ingest_log_records_total",
  help: "Total number of log records ingested",
  labelNames: ["project_id", "severity"],
  registers: [registry],
});

/**
 * Rejected log records counter
 */
export const logRejectCounter = new Counter({
  name: "ingest_log_rejects_total",
  help: "Total number of rejected log records",
  labelNames: ["reason"],
  registers: [registry],
});

/**
 * Log payload size histogram
 */
export const logPayloadSize = new Histogram({
  name: "ingest_log_payload_bytes",
  help: "Log ingestion request payload size in bytes",
  buckets: [1024, 10240, 102400, 1048576, 10485760],
  registers: [registry],
});

/**
 * Export all metrics for easy access
 */
export const metrics = {
  requestCounter,
  requestLatency,
  spanCounter,
  rejectCounter,
  payloadSize,
  dbLatency,
  handlerDuration,
  pipelineDuration,
  requestErrors,
  // Logs metrics
  logRequestCounter,
  logRecordCounter,
  logRejectCounter,
  logPayloadSize,
};
