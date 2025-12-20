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
};
