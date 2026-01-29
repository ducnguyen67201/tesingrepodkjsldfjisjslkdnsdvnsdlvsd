/**
 * LLM Center - Routing Configuration Types
 *
 * Type definitions for smart routing and fallback configuration.
 */

import type { ProviderName, OperationType, OpenAIConfig, AnthropicConfig } from "./types";

// ============================================
// Model Reference
// ============================================

/**
 * Reference to a specific model from a provider.
 */
export interface ModelRef {
  provider: ProviderName;
  model: string;
}

// ============================================
// Operation Routing
// ============================================

/**
 * Routing configuration for a single operation type.
 */
export interface OperationRouting {
  /** Primary model to use */
  primary: ModelRef;
  /** Fallback models in order of preference */
  fallbacks?: ModelRef[];
}

// ============================================
// Fallback Configuration
// ============================================

/**
 * Configuration for fallback behavior.
 */
export interface FallbackConfig {
  /** Enable/disable fallback */
  enabled: boolean;
  /** Maximum number of fallbacks to try */
  maxAttempts?: number;
  /** Delay between fallback attempts (ms) */
  retryDelay?: number;
  /** Error types that trigger fallback */
  retryableErrors?: string[];
}

// ============================================
// Rate Limiting Configuration
// ============================================

/**
 * Configuration for rate limiting.
 */
export interface RateLimitConfig {
  /** Enable/disable rate limiting */
  enabled: boolean;
  /** Maximum requests per minute */
  requestsPerMinute?: number;
  /** Maximum tokens per minute (optional) */
  tokensPerMinute?: number;
}

// ============================================
// Tracking Configuration
// ============================================

/**
 * Configuration for usage tracking.
 */
export interface TrackingConfig {
  /** Enable/disable tracking */
  enabled: boolean;
  /** Track cost estimates */
  costTracking?: boolean;
  /** Callback for usage events */
  onUsage?: (event: import("./types").UsageEvent) => void;
}

// ============================================
// Global Settings
// ============================================

/**
 * Global settings for LLM operations.
 */
export interface GlobalSettings {
  /** Request timeout in ms */
  timeout?: number;
  /** Maximum retries per model before fallback */
  maxRetries?: number;
  /** Base delay for exponential backoff (ms) */
  baseRetryDelay?: number;
  /** Maximum delay for exponential backoff (ms) */
  maxRetryDelay?: number;
}

// ============================================
// Main Configuration
// ============================================

/**
 * Complete LLM Center configuration with routing.
 */
export interface LLMCenterConfig {
  /** Default provider when not specified */
  defaultProvider: ProviderName;

  /** Provider configurations */
  providers: {
    openai?: OpenAIConfig;
    anthropic?: AnthropicConfig;
  };

  /** Smart routing per operation type */
  routing: {
    embed: OperationRouting;
    chat: OperationRouting;
    complete: OperationRouting;
  };

  /** Fallback behavior */
  fallback?: FallbackConfig;

  /** Rate limiting */
  rateLimiting?: RateLimitConfig;

  /** Usage tracking */
  tracking?: TrackingConfig;

  /** Global settings */
  settings?: GlobalSettings;
}

// ============================================
// Config Helper
// ============================================

/**
 * Type-safe configuration definition helper.
 * Provides IDE autocomplete and validation.
 *
 * @example
 * ```typescript
 * export const config = defineLLMConfig({
 *   defaultProvider: "openai",
 *   providers: { openai: { apiKey: "..." } },
 *   routing: {
 *     embed: { primary: { provider: "openai", model: "text-embedding-3-small" } },
 *     chat: { primary: { provider: "anthropic", model: "claude-3-5-sonnet" } },
 *     complete: { primary: { provider: "openai", model: "gpt-4o-mini" } },
 *   },
 * });
 * ```
 */
export function defineLLMConfig(config: LLMCenterConfig): LLMCenterConfig {
  // Validate that referenced providers are configured
  const configuredProviders = new Set(Object.keys(config.providers));

  const validateRouting = (routing: OperationRouting, operation: OperationType) => {
    if (!configuredProviders.has(routing.primary.provider)) {
      throw new Error(
        `Provider "${routing.primary.provider}" used in ${operation} routing but not configured`
      );
    }
    for (const fallback of routing.fallbacks ?? []) {
      if (!configuredProviders.has(fallback.provider)) {
        throw new Error(
          `Provider "${fallback.provider}" used in ${operation} fallback but not configured`
        );
      }
    }
  };

  validateRouting(config.routing.embed, "embed");
  validateRouting(config.routing.chat, "chat");
  validateRouting(config.routing.complete, "complete");

  return config;
}
