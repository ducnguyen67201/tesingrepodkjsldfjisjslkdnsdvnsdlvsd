// Application constants

export const APP_NAME = "Ducsigr";
export const APP_VERSION = "0.1.0";

// Pagination
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

// Redis queue keys
export const QUEUE_KEYS = {
  TRACES: "ducsigr:traces",
  SPANS: "ducsigr:spans",
  DEAD_LETTER: "ducsigr:dlq",
} as const;

// HTTP Headers
export const HEADERS = {
  PROJECT_ID: "X-Project-ID",
  API_KEY: "X-API-Key",
  REQUEST_ID: "X-Request-ID",
} as const;

// ============================================================
// Temporal Configuration
// ============================================================

export const TEMPORAL = {
  DEFAULT_ADDRESS: "localhost:7233",
  DEFAULT_NAMESPACE: "default",
  DEFAULT_TASK_QUEUE: "ducsigr-tasks",
  WORKFLOWS: {
    TRACE: "traceWorkflow",
    SCORE: "scoreWorkflow",
    ALERT_EVALUATION: "alertEvaluationWorkflow",
  },
} as const;

export const WORKFLOW_TIMEOUTS = {
  TRACE: {
    WORKFLOW_EXECUTION: "5m",
    ACTIVITY: "30s",
  },
  SCORE: {
    WORKFLOW_EXECUTION: "2m",
    ACTIVITY: "30s",
  },
  ALERT: {
    WORKFLOW_EXECUTION: "24h",
    ACTIVITY: "10s",
    EVALUATION_INTERVAL_MS: 10_000, // 10 seconds
    // ContinueAsNew thresholds to prevent event history overflow
    CONTINUE_AS_NEW_HISTORY_THRESHOLD: 8_000, // Continue at 8K events (limit is 51.2K)
    CONTINUE_AS_NEW_TIME_THRESHOLD_MS: 4 * 60 * 60 * 1000, // Or every 4 hours
    MAX_EVALUATIONS_PER_RUN: 1_000, // Or every 1000 evaluations
  },
} as const;

export const ACTIVITY_RETRY = {
  DEFAULT: {
    maximumAttempts: 3,
    initialInterval: "1s",
    backoffCoefficient: 2,
    maximumInterval: "30s",
  },
  ALERT: {
    maximumAttempts: 3,
    initialInterval: "500ms",
    backoffCoefficient: 2,
    maximumInterval: "10s",
  },
} as const;
