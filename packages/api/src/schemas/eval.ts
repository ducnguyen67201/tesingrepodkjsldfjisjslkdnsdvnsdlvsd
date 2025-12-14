/**
 * Eval Pipeline Schemas
 *
 * Zod schemas for the eval pipeline system - source of truth for types.
 * Used for proactive regression detection when PRs merge.
 */

import { z } from "zod";

// ============================================================
// Eval Run Status
// ============================================================

/**
 * Eval run status - lifecycle state
 */
export const EvalRunStatusSchema = z.enum([
  "PENDING",
  "RUNNING",
  "PASSED",
  "FAILED",
  "REGRESSION_DETECTED",
]);
export type EvalRunStatus = z.infer<typeof EvalRunStatusSchema>;

/**
 * Status labels for UI display
 */
export const EVAL_STATUS_LABELS: Record<EvalRunStatus, string> = {
  PENDING: "Pending",
  RUNNING: "Running",
  PASSED: "Passed",
  FAILED: "Failed",
  REGRESSION_DETECTED: "Regression Detected",
};

// ============================================================
// Eval Trigger Types
// ============================================================

/**
 * What triggered the eval run
 */
export const EvalTriggerTypeSchema = z.enum(["pr_merge", "manual", "scheduled"]);
export type EvalTriggerType = z.infer<typeof EvalTriggerTypeSchema>;

/**
 * Trigger type labels for UI display
 */
export const EVAL_TRIGGER_LABELS: Record<EvalTriggerType, string> = {
  pr_merge: "PR Merge",
  manual: "Manual",
  scheduled: "Scheduled",
};

// ============================================================
// Eval Prompt Schema
// ============================================================

/**
 * Single eval prompt in a suite
 */
export const EvalPromptSchema = z.object({
  /** Unique ID for this prompt within the suite */
  id: z.string(),
  /** Name/label for the prompt */
  name: z.string().min(1),
  /** The actual prompt content to send */
  content: z.string().min(1),
  /** Expected output pattern (regex or substring) */
  expectedPattern: z.string().optional(),
  /** Max acceptable latency in ms */
  maxLatencyMs: z.number().positive().optional(),
  /** Whether this prompt must pass for the suite to pass */
  required: z.boolean().default(true),
});
export type EvalPrompt = z.infer<typeof EvalPromptSchema>;

/**
 * Expected behavior schema
 */
export const ExpectedBehaviorSchema = z.object({
  /** Description of expected behavior */
  description: z.string(),
  /** Validation type */
  type: z.enum(["contains", "regex", "json_path", "semantic"]),
  /** Value to check against */
  value: z.string(),
});
export type ExpectedBehavior = z.infer<typeof ExpectedBehaviorSchema>;

// ============================================================
// Eval Suite Configuration
// ============================================================

/**
 * Eval suite configuration schema
 */
export const EvalSuiteConfigSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  endpoint: z.string().url("Must be a valid URL"),
  enabled: z.boolean().default(true),
  prompts: z.array(EvalPromptSchema).min(1, "At least one prompt is required"),
  expectedBehaviors: z.array(ExpectedBehaviorSchema).default([]),
  latencyRegressionThreshold: z.number().min(1).default(1.2),
  errorRegressionThreshold: z.number().min(1).default(2.0),
});
export type EvalSuiteConfig = z.infer<typeof EvalSuiteConfigSchema>;

/**
 * Create eval suite input schema
 */
export const CreateEvalSuiteSchema = EvalSuiteConfigSchema.extend({
  projectId: z.string(),
});
export type CreateEvalSuiteInput = z.infer<typeof CreateEvalSuiteSchema>;

/**
 * Update eval suite input schema
 */
export const UpdateEvalSuiteSchema = EvalSuiteConfigSchema.partial().extend({
  suiteId: z.string(),
});
export type UpdateEvalSuiteInput = z.infer<typeof UpdateEvalSuiteSchema>;

// ============================================================
// Eval Metrics
// ============================================================

/**
 * Eval metrics from a run
 */
export const EvalMetricsSchema = z.object({
  latencyP50: z.number().optional(),
  latencyP95: z.number().optional(),
  latencyP99: z.number().optional(),
  errorRate: z.number().min(0).max(100),
  totalPrompts: z.number().int().positive(),
  passedPrompts: z.number().int().nonnegative(),
  failedPrompts: z.number().int().nonnegative(),
});
export type EvalMetrics = z.infer<typeof EvalMetricsSchema>;

// ============================================================
// Regression Detection
// ============================================================

/**
 * Regression detail - what regressed
 */
export const RegressionDetailSchema = z.object({
  /** Metric that regressed */
  metric: z.enum(["latency_p95", "error_rate", "pass_rate"]),
  /** Baseline value */
  baseline: z.number(),
  /** Current value */
  current: z.number(),
  /** Threshold that was exceeded */
  threshold: z.number(),
  /** Percentage change */
  changePercent: z.number(),
  /** Human-readable message */
  message: z.string(),
});
export type RegressionDetail = z.infer<typeof RegressionDetailSchema>;

/**
 * Regression details array
 */
export const RegressionDetailsSchema = z.array(RegressionDetailSchema);
export type RegressionDetails = z.infer<typeof RegressionDetailsSchema>;

// ============================================================
// Eval Result (Per Prompt)
// ============================================================

/**
 * Result of evaluating a single prompt
 */
export const EvalPromptResultSchema = z.object({
  promptId: z.string(),
  promptName: z.string(),
  success: z.boolean(),
  latencyMs: z.number().optional(),
  response: z.string().optional(),
  error: z.string().optional(),
  assertions: z
    .array(
      z.object({
        type: z.string(),
        passed: z.boolean(),
        expected: z.string().optional(),
        actual: z.string().optional(),
      })
    )
    .optional(),
});
export type EvalPromptResult = z.infer<typeof EvalPromptResultSchema>;

// ============================================================
// Eval Run Schemas
// ============================================================

/**
 * Eval run scores (arbitrary key-value metrics)
 */
export const EvalScoresSchema = z.record(z.string(), z.number());
export type EvalScores = z.infer<typeof EvalScoresSchema>;

/**
 * Create eval run input (for internal tRPC)
 */
export const CreateEvalRunInputSchema = z.object({
  suiteId: z.string(),
  triggeredBy: EvalTriggerTypeSchema,
  triggerRef: z.string().optional(),
  totalPrompts: z.number().int().positive(),
});
export type CreateEvalRunInput = z.infer<typeof CreateEvalRunInputSchema>;

/**
 * Update eval run input (for internal tRPC)
 */
export const UpdateEvalRunInputSchema = z.object({
  runId: z.string(),
  status: EvalRunStatusSchema,
  completedAt: z.date().optional(),
  passedPrompts: z.number().int().nonnegative().optional(),
  failedPrompts: z.number().int().nonnegative().optional(),
  latencyP95: z.number().optional(),
  errorRate: z.number().optional(),
  scores: EvalScoresSchema.optional(),
  isRegression: z.boolean().optional(),
  regressionDetails: RegressionDetailsSchema.optional(),
});
export type UpdateEvalRunInput = z.infer<typeof UpdateEvalRunInputSchema>;

// ============================================================
// Workflow Input/Output Types
// ============================================================

/**
 * Eval workflow input
 */
export const EvalWorkflowInputSchema = z.object({
  projectId: z.string(),
  suiteId: z.string(),
  triggeredBy: EvalTriggerTypeSchema,
  triggerRef: z.string().optional(),
});
export type EvalWorkflowInput = z.infer<typeof EvalWorkflowInputSchema>;

/**
 * Eval workflow output
 */
export const EvalWorkflowOutputSchema = z.object({
  runId: z.string(),
  status: EvalRunStatusSchema,
  isRegression: z.boolean(),
  metrics: EvalMetricsSchema.optional(),
  regressionDetails: RegressionDetailsSchema.optional(),
});
export type EvalWorkflowOutput = z.infer<typeof EvalWorkflowOutputSchema>;

// ============================================================
// Regression Alert Payload
// ============================================================

/**
 * Regression alert payload for notifications
 */
export const RegressionAlertPayloadSchema = z.object({
  suiteId: z.string(),
  suiteName: z.string(),
  runId: z.string(),
  projectId: z.string(),
  projectName: z.string(),
  triggeredBy: EvalTriggerTypeSchema,
  triggerRef: z.string().optional(),
  regressionDetails: RegressionDetailsSchema,
  dashboardUrl: z.string().url().optional(),
});
export type RegressionAlertPayload = z.infer<typeof RegressionAlertPayloadSchema>;

// ============================================================
// Constants
// ============================================================

/**
 * Default regression thresholds
 */
export const DEFAULT_REGRESSION_THRESHOLDS = {
  latency: 1.2, // 20% slower = regression
  errorRate: 2.0, // 2x errors = regression
} as const;

/**
 * Status colors for UI
 */
export const EVAL_STATUS_COLORS: Record<EvalRunStatus, string> = {
  PENDING: "bg-gray-100 text-gray-800",
  RUNNING: "bg-blue-100 text-blue-800",
  PASSED: "bg-green-100 text-green-800",
  FAILED: "bg-red-100 text-red-800",
  REGRESSION_DETECTED: "bg-orange-100 text-orange-800",
};
