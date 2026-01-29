/**
 * LLM Center - Development Configuration
 *
 * Cost-optimized config for development environment.
 * Uses cheaper models and minimal fallbacks for fast iteration.
 */

import { defineLLMConfig, type ModelRef } from "../config.types";

// ============================================
// Model Definitions
// ============================================

const MODELS = {
  // OpenAI Models (cost-effective for dev)
  GPT_4O_MINI: { provider: "openai", model: "gpt-4o-mini" } as ModelRef,
  EMBEDDING_SMALL: { provider: "openai", model: "text-embedding-3-small" } as ModelRef,

  // Anthropic Models (optional in dev)
  CLAUDE_HAIKU: { provider: "anthropic", model: "claude-3-5-haiku-20241022" } as ModelRef,
} as const;

// ============================================
// Routing Strategies (Minimal for Dev)
// ============================================

/**
 * Embedding Strategy:
 * - Primary only: text-embedding-3-small
 * - No fallback in dev (fail fast)
 */
const EMBED_ROUTING = {
  primary: MODELS.EMBEDDING_SMALL,
};

/**
 * Chat Strategy:
 * - Primary: GPT-4o-mini (cheap and fast)
 * - No fallback in dev (fail fast)
 */
const CHAT_ROUTING = {
  primary: MODELS.GPT_4O_MINI,
  fallbacks: [],
};

/**
 * Completion Strategy:
 * - Primary: GPT-4o-mini (cheap and fast)
 * - No fallback in dev (fail fast)
 */
const COMPLETE_ROUTING = {
  primary: MODELS.GPT_4O_MINI,
  fallbacks: [],
};

// ============================================
// Configuration Constants
// ============================================

const RATE_LIMITS = {
  requestsPerMinute: 100, // Lower limit in dev
};

const RETRY_CONFIG = {
  maxAttempts: 1, // Fewer retries in dev (fail fast)
  timeoutMs: 30_000,
};

// ============================================
// Development Config Export
// ============================================

export const developmentConfig = defineLLMConfig({
  defaultProvider: "openai",

  providers: {
    openai: {
      apiKey: process.env.OPENAI_API_KEY ?? "",
      organization: process.env.OPENAI_ORG_ID,
      defaultModel: MODELS.GPT_4O_MINI.model,
      embeddingModel: MODELS.EMBEDDING_SMALL.model,
    },
    // Anthropic is optional in dev - only include if API key exists
    ...(process.env.ANTHROPIC_API_KEY && {
      anthropic: {
        apiKey: process.env.ANTHROPIC_API_KEY,
        defaultModel: MODELS.CLAUDE_HAIKU.model,
      },
    }),
  },

  routing: {
    embed: EMBED_ROUTING,
    chat: CHAT_ROUTING,
    complete: COMPLETE_ROUTING,
  },

  fallback: {
    enabled: false, // Disable fallbacks in dev (fail fast)
    maxAttempts: RETRY_CONFIG.maxAttempts,
  },

  rateLimiting: {
    enabled: true,
    ...RATE_LIMITS,
  },

  tracking: {
    enabled: true,
    costTracking: true,
  },

  settings: {
    timeout: RETRY_CONFIG.timeoutMs,
    maxRetries: RETRY_CONFIG.maxAttempts,
  },
});
