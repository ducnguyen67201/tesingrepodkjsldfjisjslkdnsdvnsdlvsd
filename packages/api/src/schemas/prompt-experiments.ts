/**
 * Prompt A/B Experiment Schemas
 *
 * Zod schemas for the prompt A/B testing system - source of truth for types.
 * Supports experiment creation, variant management, assignment, and analytics.
 */

import { z } from "zod";

// ============================================================
// Experiment Status
// ============================================================

/**
 * Experiment status - lifecycle states
 */
export const ExperimentStatusSchema = z.enum([
  "draft",
  "running",
  "paused",
  "completed",
  "archived",
]);
export type ExperimentStatus = z.infer<typeof ExperimentStatusSchema>;

/**
 * Status labels for UI display
 */
export const EXPERIMENT_STATUS_LABELS: Record<ExperimentStatus, string> = {
  draft: "Draft",
  running: "Running",
  paused: "Paused",
  completed: "Completed",
  archived: "Archived",
};

/**
 * Status colors for UI
 */
export const EXPERIMENT_STATUS_COLORS: Record<ExperimentStatus, string> = {
  draft: "bg-gray-100 text-gray-800",
  running: "bg-green-100 text-green-800",
  paused: "bg-yellow-100 text-yellow-800",
  completed: "bg-blue-100 text-blue-800",
  archived: "bg-gray-100 text-gray-500",
};

// ============================================================
// Assignment Key Type
// ============================================================

/**
 * Assignment key type - determines how users are bucketed
 */
export const AssignmentKeyTypeSchema = z.enum(["userId", "sessionId", "custom"]);
export type AssignmentKeyType = z.infer<typeof AssignmentKeyTypeSchema>;

/**
 * Assignment key labels for UI
 */
export const ASSIGNMENT_KEY_LABELS: Record<AssignmentKeyType, string> = {
  userId: "User ID",
  sessionId: "Session ID",
  custom: "Custom Key",
};

// ============================================================
// Variant Schema
// ============================================================

/**
 * Variant name - typically A or B
 */
export const VariantNameSchema = z.enum(["A", "B"]);
export type VariantName = z.infer<typeof VariantNameSchema>;

/**
 * Variant input for experiment creation
 */
export const ExperimentVariantInputSchema = z.object({
  name: VariantNameSchema,
  /** Weight in basis points (0-10000), sum must = 10000 */
  weight: z.number().int().min(0).max(10000),
  /** Prompt version ID to use for this variant */
  promptVersionId: z.string().min(1),
  /** Whether this is the control variant */
  isControl: z.boolean().default(false),
});
export type ExperimentVariantInput = z.infer<typeof ExperimentVariantInputSchema>;

/**
 * Variant output with full details
 */
export const ExperimentVariantOutputSchema = z.object({
  id: z.string(),
  experimentId: z.string(),
  name: VariantNameSchema,
  weight: z.number(),
  promptVersionId: z.string(),
  isControl: z.boolean(),
  createdAt: z.date(),
  /** Populated prompt version details */
  promptVersion: z
    .object({
      id: z.string(),
      version: z.number(),
      type: z.string(),
      promptId: z.string(),
      prompt: z
        .object({
          id: z.string(),
          name: z.string(),
          slug: z.string(),
        })
        .optional(),
    })
    .optional(),
});
export type ExperimentVariantOutput = z.infer<typeof ExperimentVariantOutputSchema>;

// ============================================================
// Metrics Schema
// ============================================================

/**
 * Metric type for experiment configuration
 */
export const ExperimentMetricTypeSchema = z.enum([
  "latency",
  "cost",
  "errorRate",
  "usageCount",
]);
export type ExperimentMetricType = z.infer<typeof ExperimentMetricTypeSchema>;

/**
 * Experiment metrics configuration
 */
export const ExperimentMetricsConfigSchema = z.object({
  primaryMetric: ExperimentMetricTypeSchema.default("latency"),
  secondaryMetrics: z.array(ExperimentMetricTypeSchema).default([]),
});
export type ExperimentMetricsConfig = z.infer<typeof ExperimentMetricsConfigSchema>;

// ============================================================
// CRUD Input Schemas
// ============================================================

/**
 * Create experiment input
 */
export const CreateExperimentInputSchema = z
  .object({
    workspaceSlug: z.string().min(1),
    projectId: z.string().min(1),
    name: z.string().min(1, "Name is required").max(100, "Name too long"),
    slug: z
      .string()
      .min(1, "Slug is required")
      .max(50, "Slug too long")
      .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
    description: z.string().max(500).optional(),
    /** Traffic allocation percentage (0-100) */
    allocationPct: z.number().int().min(0).max(100).default(100),
    /** Assignment key type for bucketing */
    assignmentKey: AssignmentKeyTypeSchema.default("userId"),
    /** Experiment tags */
    tags: z.array(z.string()).default([]),
    /** Metrics configuration */
    metrics: ExperimentMetricsConfigSchema.optional(),
    /** Variants (exactly 2 required) */
    variants: z.array(ExperimentVariantInputSchema).length(2),
  })
  .refine(
    (data) => {
      const totalWeight = data.variants.reduce((sum, v) => sum + v.weight, 0);
      return totalWeight === 10000;
    },
    { message: "Variant weights must sum to 10000 basis points" }
  )
  .refine(
    (data) => {
      const names = data.variants.map((v) => v.name);
      return names.includes("A") && names.includes("B");
    },
    { message: "Variants must include both A and B" }
  );
export type CreateExperimentInput = z.infer<typeof CreateExperimentInputSchema>;

/**
 * Update experiment input
 */
export const UpdateExperimentInputSchema = z.object({
  workspaceSlug: z.string().min(1),
  experimentId: z.string().min(1),
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  allocationPct: z.number().int().min(0).max(100).optional(),
  tags: z.array(z.string()).optional(),
  metrics: ExperimentMetricsConfigSchema.optional(),
});
export type UpdateExperimentInput = z.infer<typeof UpdateExperimentInputSchema>;

/**
 * Update variant weights input
 */
export const UpdateVariantWeightsInputSchema = z
  .object({
    workspaceSlug: z.string().min(1),
    experimentId: z.string().min(1),
    variants: z.array(
      z.object({
        variantId: z.string().min(1),
        weight: z.number().int().min(0).max(10000),
      })
    ),
  })
  .refine(
    (data) => {
      const totalWeight = data.variants.reduce((sum, v) => sum + v.weight, 0);
      return totalWeight === 10000;
    },
    { message: "Variant weights must sum to 10000 basis points" }
  );
export type UpdateVariantWeightsInput = z.infer<typeof UpdateVariantWeightsInputSchema>;

// ============================================================
// Query Input Schemas
// ============================================================

/**
 * List experiments input
 */
export const ListExperimentsInputSchema = z.object({
  workspaceSlug: z.string().min(1),
  projectId: z.string().min(1),
  status: ExperimentStatusSchema.optional(),
  query: z.string().optional(),
  tags: z.array(z.string()).optional(),
  limit: z.number().min(1).max(100).default(50),
  cursor: z.string().optional(),
});
export type ListExperimentsInput = z.infer<typeof ListExperimentsInputSchema>;

/**
 * Get experiment input
 */
export const GetExperimentInputSchema = z.object({
  workspaceSlug: z.string().min(1),
  experimentId: z.string().min(1),
});
export type GetExperimentInput = z.infer<typeof GetExperimentInputSchema>;

/**
 * Get experiment by slug input
 */
export const GetExperimentBySlugInputSchema = z.object({
  workspaceSlug: z.string().min(1),
  projectId: z.string().min(1),
  slug: z.string().min(1),
});
export type GetExperimentBySlugInput = z.infer<typeof GetExperimentBySlugInputSchema>;

// ============================================================
// Status Transition Schemas
// ============================================================

/**
 * Start experiment input
 */
export const StartExperimentInputSchema = z.object({
  workspaceSlug: z.string().min(1),
  experimentId: z.string().min(1),
});
export type StartExperimentInput = z.infer<typeof StartExperimentInputSchema>;

/**
 * Pause experiment input
 */
export const PauseExperimentInputSchema = z.object({
  workspaceSlug: z.string().min(1),
  experimentId: z.string().min(1),
});
export type PauseExperimentInput = z.infer<typeof PauseExperimentInputSchema>;

/**
 * Stop experiment input (complete)
 */
export const StopExperimentInputSchema = z.object({
  workspaceSlug: z.string().min(1),
  experimentId: z.string().min(1),
  /** Optional winner variant ID */
  winnerId: z.string().optional(),
});
export type StopExperimentInput = z.infer<typeof StopExperimentInputSchema>;

/**
 * Archive experiment input
 */
export const ArchiveExperimentInputSchema = z.object({
  workspaceSlug: z.string().min(1),
  experimentId: z.string().min(1),
});
export type ArchiveExperimentInput = z.infer<typeof ArchiveExperimentInputSchema>;

// ============================================================
// Assignment/Resolution Schemas (for SDK/Ingest)
// ============================================================

/**
 * Resolve experiment input (used by ingest service)
 */
export const ResolveExperimentInputSchema = z.object({
  /** Assignment key value (userId, sessionId, or custom) */
  assignmentKey: z.string().min(1),
  /** Optional: force specific variant for testing */
  forceVariant: VariantNameSchema.optional(),
});
export type ResolveExperimentInput = z.infer<typeof ResolveExperimentInputSchema>;

/**
 * Resolve experiment response
 */
export const ResolveExperimentResponseSchema = z.object({
  /** Experiment metadata */
  experiment: z.object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    status: ExperimentStatusSchema,
  }),
  /** Assigned variant */
  variant: z.object({
    id: z.string(),
    name: VariantNameSchema,
    isControl: z.boolean(),
  }),
  /** Whether assignment is from allocation (vs fallback) */
  inAllocation: z.boolean(),
  /** Prompt payload (same shape as prompt fetch) */
  prompt: z.object({
    id: z.string(),
    promptId: z.string(),
    name: z.string(),
    slug: z.string(),
    version: z.number(),
    type: z.string(),
    content: z.unknown(), // PromptTemplate
    variables: z.unknown().nullable(),
    config: z.unknown().nullable(),
    checksum: z.string(),
  }),
  /** Trace metadata for SDK to attach to spans */
  traceMetadata: z.object({
    promptExperimentId: z.string(),
    promptExperimentSlug: z.string(),
    promptVariantId: z.string(),
    promptVariantName: z.string(),
    assignmentKeyHash: z.string(),
  }),
});
export type ResolveExperimentResponse = z.infer<typeof ResolveExperimentResponseSchema>;

// ============================================================
// Analytics Schemas
// ============================================================

/**
 * Experiment analytics input
 */
export const ExperimentAnalyticsInputSchema = z.object({
  workspaceSlug: z.string().min(1),
  experimentId: z.string().min(1),
  dateRange: z
    .object({
      start: z.date(),
      end: z.date(),
    })
    .optional(),
});
export type ExperimentAnalyticsInput = z.infer<typeof ExperimentAnalyticsInputSchema>;

/**
 * Variant metrics
 */
export const VariantMetricsSchema = z.object({
  variantId: z.string(),
  variantName: VariantNameSchema,
  isControl: z.boolean(),
  usageCount: z.number(),
  avgLatencyMs: z.number().nullable(),
  p95LatencyMs: z.number().nullable(),
  avgCost: z.number().nullable(),
  totalCost: z.number().nullable(),
  errorRate: z.number().nullable(),
  errorCount: z.number(),
});
export type VariantMetrics = z.infer<typeof VariantMetricsSchema>;

/**
 * Experiment analytics response
 */
export const ExperimentAnalyticsResponseSchema = z.object({
  experimentId: z.string(),
  totalUsage: z.number(),
  dateRange: z.object({
    start: z.date(),
    end: z.date(),
  }),
  byVariant: z.array(VariantMetricsSchema),
  /** Delta between variants (treatment - control) */
  delta: z
    .object({
      latencyMs: z.number().nullable(),
      cost: z.number().nullable(),
      errorRate: z.number().nullable(),
    })
    .nullable(),
});
export type ExperimentAnalyticsResponse = z.infer<typeof ExperimentAnalyticsResponseSchema>;

// ============================================================
// Comparison Schemas
// ============================================================

/**
 * Compare prompts input
 */
export const ComparePromptsInputSchema = z.object({
  workspaceSlug: z.string().min(1),
  /** First prompt version ID */
  versionIdA: z.string().min(1),
  /** Second prompt version ID */
  versionIdB: z.string().min(1),
});
export type ComparePromptsInput = z.infer<typeof ComparePromptsInputSchema>;

/**
 * Prompt comparison response
 */
export const PromptComparisonResponseSchema = z.object({
  versionA: z.object({
    id: z.string(),
    version: z.number(),
    promptId: z.string(),
    promptName: z.string(),
    promptSlug: z.string(),
    type: z.string(),
    content: z.unknown(),
    variables: z.unknown().nullable(),
    config: z.unknown().nullable(),
    createdAt: z.date(),
  }),
  versionB: z.object({
    id: z.string(),
    version: z.number(),
    promptId: z.string(),
    promptName: z.string(),
    promptSlug: z.string(),
    type: z.string(),
    content: z.unknown(),
    variables: z.unknown().nullable(),
    config: z.unknown().nullable(),
    createdAt: z.date(),
  }),
  /** Whether content differs */
  contentDiffers: z.boolean(),
  /** Whether config differs */
  configDiffers: z.boolean(),
  /** Whether variables differ */
  variablesDiffer: z.boolean(),
});
export type PromptComparisonResponse = z.infer<typeof PromptComparisonResponseSchema>;

// ============================================================
// Constants
// ============================================================

/**
 * Maximum experiment name length
 */
export const MAX_EXPERIMENT_NAME_LENGTH = 100;

/**
 * Maximum experiment slug length
 */
export const MAX_EXPERIMENT_SLUG_LENGTH = 50;

/**
 * Maximum experiment description length
 */
export const MAX_EXPERIMENT_DESCRIPTION_LENGTH = 500;

/**
 * Total basis points for weight calculation
 */
export const TOTAL_BASIS_POINTS = 10000;

/**
 * Default allocation percentage
 */
export const DEFAULT_ALLOCATION_PCT = 100;

/**
 * Valid status transitions
 */
export const VALID_STATUS_TRANSITIONS: Record<ExperimentStatus, ExperimentStatus[]> = {
  draft: ["running", "archived"],
  running: ["paused", "completed"],
  paused: ["running", "completed", "archived"],
  completed: ["archived"],
  archived: [],
};
