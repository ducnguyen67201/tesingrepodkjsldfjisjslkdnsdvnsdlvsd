/**
 * Centralized LLM Configuration
 *
 * Single source of truth for all LLM model selection and fallbacks.
 * Each task defines its primary model and fallback chain.
 *
 * Usage:
 *   import { LLM_CONFIG, getModelChain } from "@/lib/llm-config";
 *
 *   // Get config for a task
 *   const config = LLM_CONFIG.rca;
 *   // { primary: { provider, model }, fallback: [...] }
 *
 *   // Get model chain (primary + fallbacks in order)
 *   const chain = getModelChain("embedding");
 *   // [{ provider: "openai", model: "..." }, { provider: "anthropic", model: "..." }]
 */

// ============================================
// Types
// ============================================

export type Provider = "openai" | "anthropic";

export interface ModelConfig {
  provider: Provider;
  model: string;
}

export interface TaskConfig {
  /** Primary model to use */
  primary: ModelConfig;
  /** Fallback models in order of preference */
  fallback: ModelConfig[];
  /** Default prompt settings */
  promptDefaults?: {
    temperature?: number;
    maxTokens?: number;
  };
}

export type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

// ============================================
// Model Registry
// ============================================

/**
 * All available models.
 * Reference these in task configs below.
 */
export const MODELS = {
  // OpenAI
  GPT_4O: { provider: "openai", model: "gpt-4o" } as ModelConfig,
  GPT_4O_MINI: { provider: "openai", model: "gpt-4o-mini" } as ModelConfig,
  EMBEDDING_SMALL: { provider: "openai", model: "text-embedding-3-small" } as ModelConfig,
  EMBEDDING_LARGE: { provider: "openai", model: "text-embedding-3-large" } as ModelConfig,

  // Anthropic
  CLAUDE_SONNET: { provider: "anthropic", model: "claude-3-5-sonnet-20241022" } as ModelConfig,
  CLAUDE_HAIKU: { provider: "anthropic", model: "claude-3-5-haiku-20241022" } as ModelConfig,
} as const;

// ============================================
// Task Configuration
// ============================================

/**
 * LLM configuration per task/workflow.
 *
 * Each task defines:
 * - primary: First model to try
 * - fallback: Models to try if primary fails (in order)
 * - promptDefaults: Default temperature/maxTokens
 *
 * To add a new task:
 * 1. Add entry here with primary + fallback
 * 2. Import and use in your activity
 */
export const LLM_CONFIG = {
  /** Embedding generation */
  embedding: {
    primary: MODELS.EMBEDDING_SMALL,
    fallback: [MODELS.EMBEDDING_LARGE],
    promptDefaults: {
      // Embeddings don't use these, but included for consistency
    },
  },

  /** RCA generation - high severity */
  rca_high: {
    primary: MODELS.CLAUDE_SONNET,
    fallback: [MODELS.GPT_4O, MODELS.CLAUDE_HAIKU],
    promptDefaults: {
      temperature: 0.3,
      maxTokens: 2000,
    },
  },

  /** RCA generation - low severity */
  rca_low: {
    primary: MODELS.CLAUDE_HAIKU,
    fallback: [MODELS.GPT_4O_MINI, MODELS.CLAUDE_SONNET],
    promptDefaults: {
      temperature: 0.3,
      maxTokens: 1500,
    },
  },

  /** General chat/conversation */
  chat: {
    primary: MODELS.CLAUDE_HAIKU,
    fallback: [MODELS.GPT_4O_MINI],
    promptDefaults: {
      temperature: 0.7,
      maxTokens: 1000,
    },
  },

  /** Code analysis/review */
  code_analysis: {
    primary: MODELS.CLAUDE_SONNET,
    fallback: [MODELS.GPT_4O],
    promptDefaults: {
      temperature: 0.2,
      maxTokens: 2000,
    },
  },

  /** Summarization */
  summarization: {
    primary: MODELS.CLAUDE_HAIKU,
    fallback: [MODELS.GPT_4O_MINI],
    promptDefaults: {
      temperature: 0.5,
      maxTokens: 500,
    },
  },
} as const satisfies Record<string, TaskConfig>;

export type TaskType = keyof typeof LLM_CONFIG;

// ============================================
// Severity-Based RCA Selection
// ============================================

/**
 * Maps severity to RCA task config.
 */
const SEVERITY_TO_RCA_CONFIG: Record<Severity, TaskType> = {
  CRITICAL: "rca_high",
  HIGH: "rca_high",
  MEDIUM: "rca_low",
  LOW: "rca_low",
};

/**
 * Get RCA config based on alert severity.
 */
export function getRCAConfigBySeverity(severity: Severity): TaskConfig {
  const taskType = SEVERITY_TO_RCA_CONFIG[severity] ?? "rca_low";
  return LLM_CONFIG[taskType];
}

// ============================================
// Helper Functions
// ============================================

/**
 * Get the full model chain for a task (primary + fallbacks).
 *
 * @param task - Task type
 * @returns Array of models in order of preference
 */
export function getModelChain(task: TaskType): ModelConfig[] {
  const config = LLM_CONFIG[task];
  return [config.primary, ...config.fallback];
}

/**
 * Get task config by name.
 */
export function getTaskConfig(task: TaskType): TaskConfig {
  return LLM_CONFIG[task];
}

/**
 * Get primary model for a task.
 */
export function getPrimaryModel(task: TaskType): ModelConfig {
  return LLM_CONFIG[task].primary;
}

// ============================================
// Template Fallback (RCA-specific)
// ============================================

/**
 * Template fallback conditions for RCA generation.
 * Use template-based RCA (no LLM cost) when ALL conditions are met.
 */
export const TEMPLATE_FALLBACK_CONDITIONS = {
  maxSeverity: "LOW" as Severity,
  maxErrorPatterns: 1,
  maxSuspectedCommits: 0,
  maxAnomalies: 0,
} as const;

/**
 * Check if template fallback should be used.
 */
export function shouldUseTemplateFallback(
  severity: Severity,
  errorPatternCount: number,
  suspectedCommitCount: number,
  anomalyCount: number
): boolean {
  const c = TEMPLATE_FALLBACK_CONDITIONS;
  return (
    severity === c.maxSeverity &&
    errorPatternCount <= c.maxErrorPatterns &&
    suspectedCommitCount <= c.maxSuspectedCommits &&
    anomalyCount <= c.maxAnomalies
  );
}

// ============================================
// Pricing
// ============================================

/**
 * Model pricing (per 1M tokens).
 */
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // OpenAI
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "text-embedding-3-small": { input: 0.02, output: 0 },
  "text-embedding-3-large": { input: 0.13, output: 0 },
  // Anthropic
  "claude-3-5-sonnet-20241022": { input: 3, output: 15 },
  "claude-3-5-haiku-20241022": { input: 0.8, output: 4 },
};

/**
 * Estimate cost for a model call.
 */
export function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number = 0
): number {
  const pricing = MODEL_PRICING[model] ?? { input: 0, output: 0 };
  return (
    (inputTokens / 1_000_000) * pricing.input +
    (outputTokens / 1_000_000) * pricing.output
  );
}
