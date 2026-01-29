/**
 * LLM Center - Production Configuration
 *
 * Quality-optimized config for production environment.
 * Uses best models with comprehensive fallback chains.
 */

import { defineLLMConfig, type ModelRef } from "../config.types";

// ============================================
// Model Definitions
// ============================================

const MODELS = {
  // OpenAI Models
  GPT_4O: { provider: "openai", model: "gpt-4o" } as ModelRef,
  GPT_4O_MINI: { provider: "openai", model: "gpt-4o-mini" } as ModelRef,
  EMBEDDING_SMALL: { provider: "openai", model: "text-embedding-3-small" } as ModelRef,
  EMBEDDING_LARGE: { provider: "openai", model: "text-embedding-3-large" } as ModelRef,

  // Anthropic Models
  CLAUDE_SONNET: { provider: "anthropic", model: "claude-3-5-sonnet-20241022" } as ModelRef,
  CLAUDE_HAIKU: { provider: "anthropic", model: "claude-3-5-haiku-20241022" } as ModelRef,
} as const;

// ============================================
// Routing Strategies
// ============================================

/**
 * Embedding Strategy:
 * - Primary: text-embedding-3-small (best price/performance)
 * - Fallback: text-embedding-3-large (higher quality if needed)
 */
const EMBED_ROUTING = {
  primary: MODELS.EMBEDDING_SMALL,
  fallbacks: [MODELS.EMBEDDING_LARGE],
};

/**
 * Chat Strategy:
 * - Primary: Claude Sonnet (best quality for conversations)
 * - Fallbacks: GPT-4o -> GPT-4o-mini -> Claude Haiku
 */
const CHAT_ROUTING = {
  primary: MODELS.CLAUDE_SONNET,
  fallbacks: [MODELS.GPT_4O, MODELS.GPT_4O_MINI, MODELS.CLAUDE_HAIKU],
};

/**
 * Completion Strategy:
 * - Primary: GPT-4o (best structured output support)
 * - Fallbacks: GPT-4o-mini -> Claude Sonnet
 */
const COMPLETE_ROUTING = {
  primary: MODELS.GPT_4O,
  fallbacks: [MODELS.GPT_4O_MINI, MODELS.CLAUDE_SONNET],
};

// ============================================
// Configuration Constants
// ============================================

const RATE_LIMITS = {
  requestsPerMinute: 500,
  tokensPerMinute: 100_000,
};

const RETRY_CONFIG = {
  maxAttempts: 3,
  retryDelayMs: 1000,
  timeoutMs: 60_000,
};

const RETRYABLE_ERRORS = [
  "rate_limit",
  "timeout",
  "service_unavailable",
  "model_overloaded",
];

// ============================================
// Production Config Export
// ============================================

export const productionConfig = defineLLMConfig({
  defaultProvider: "anthropic",

  providers: {
    openai: {
      apiKey: process.env.OPENAI_API_KEY ?? "",
      organization: process.env.OPENAI_ORG_ID,
      defaultModel: MODELS.GPT_4O.model,
      embeddingModel: MODELS.EMBEDDING_SMALL.model,
    },
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY ?? "",
      defaultModel: MODELS.CLAUDE_SONNET.model,
    },
  },

  routing: {
    embed: EMBED_ROUTING,
    chat: CHAT_ROUTING,
    complete: COMPLETE_ROUTING,
  },

  fallback: {
    enabled: true,
    maxAttempts: RETRY_CONFIG.maxAttempts,
    retryDelay: RETRY_CONFIG.retryDelayMs,
    retryableErrors: RETRYABLE_ERRORS,
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
