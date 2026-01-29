// ============================================================
// TEMPORAL MODULE - CENTRALIZED EXPORTS
// ============================================================
// This is the single entry point for all Temporal-related imports.
// Always import from here, never from individual modules.
//
// Usage:
//   import { getTemporalClient, isTemporalEnabled } from "./temporal";
//   import { persistTrace, calculateTraceCosts } from "./temporal";
//   import type { TraceWorkflowInput, SpanInput } from "./temporal";
// ============================================================

// -----------------------------
// Client exports
// -----------------------------
export {
  getTemporalClient,
  closeTemporalClient,
  getTemporalConfig,
} from "./client";

// -----------------------------
// Worker exports
// -----------------------------
export {
  createTemporalWorker,
  runTemporalWorker,
  shutdownTemporalWorker,
  closeWorkerConnection,
} from "./worker";

// -----------------------------
// Type exports
// -----------------------------
export type {
  // Trace types
  TraceWorkflowInput,
  TraceWorkflowResult,
  SpanInput,
  UserInput,
  // Score types
  ScoreWorkflowInput,
  ScoreWorkflowResult,
  ScoreValidationResult,
  ScoreDataType,
  // Alert types
  AlertWorkflowInput,
  AlertEvaluationResult,
  AlertStateTransition,
} from "./types";

// -----------------------------
// Activities exports
// -----------------------------
export * from "./activities";
