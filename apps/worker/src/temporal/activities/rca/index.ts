/**
 * RCA (Root Cause Analysis) Activities
 *
 * Centralized exports for RCA-related Temporal activities.
 *
 * Activities:
 * - analyzeTraces (#136): Extract error patterns, anomalies from trace data
 * - correlateCodeChanges (#137): Correlate alerts with recent code changes
 * - generateRCA (#138): Generate LLM-based root cause analysis
 * - storeRCA (#139): Persist RCA results to database
 *
 * IMPORTANT: analyzeTraces and correlateCodeChanges are read-only.
 * generateRCA uses LLM Center for structured output (no DB mutations).
 * storeRCA calls internal.storeRCA tRPC procedure for DB mutations.
 */

export { analyzeTraces } from "./analyze-traces";
export { correlateCodeChanges } from "./correlate-changes";
export { generateRCA } from "./generate-rca";
export { storeRCA } from "./store-rca.activity";
