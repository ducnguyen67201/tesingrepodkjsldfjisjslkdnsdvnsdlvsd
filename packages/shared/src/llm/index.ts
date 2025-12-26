/**
 * LLM Center - Public Exports
 *
 * Centralized LLM processing service for Ducsigr.
 *
 * @example
 * ```typescript
 * import { createLLMCenter, getConfig } from "@ducsigr/shared/llm";
 *
 * const llm = createLLMCenter(getConfig());
 *
 * // Embeddings
 * const embedResult = await llm.embed(["Hello world"]);
 *
 * // Chat with structured output
 * const chatResult = await llm.chat(
 *   [{ role: "user", content: "Analyze this" }],
 *   { schema: MySchema }
 * );
 * ```
 */

// ============================================
// Core
// ============================================

export { LLMCenter, createLLMCenter } from "./center";
export { SmartRouter, createSmartRouter } from "./router";

// ============================================
// Internal Modules (for advanced usage)
// ============================================

export {
  createProviders,
  getProvider,
  hasProvider,
  shutdownProviders,
  type ProviderRegistry,
} from "./provider-factory";

export {
  UsageTracker,
  createUsageTracker,
  type UsageTrackerConfig,
  type TrackUsageInput,
} from "./usage-tracker";

// ============================================
// Types
// ============================================

export type {
  // Provider configs
  OpenAIConfig,
  AnthropicConfig,
  // Operation types
  EmbedOptions,
  EmbedResult,
  CompleteOptions,
  CompleteResult,
  ChatOptions,
  ChatResult,
  Message,
  MessageRole,
  // Provider interface
  LLMProvider,
  ProviderName,
  OperationType,
  FinishReason,
  // Usage tracking
  UsageEvent,
  UsageStats,
} from "./types";

export type {
  // Config types
  LLMCenterConfig,
  ModelRef,
  OperationRouting,
  FallbackConfig,
} from "./config.types";

export { defineLLMConfig } from "./config.types";

// ============================================
// Providers
// ============================================

export { BaseLLMProvider } from "./providers/base";
export { OpenAIProvider } from "./providers/openai";
export { AnthropicProvider } from "./providers/anthropic";

// ============================================
// Errors
// ============================================

export {
  LLMError,
  RateLimitError,
  AuthenticationError,
  ModelNotFoundError,
  TimeoutError,
  ServiceUnavailableError,
  ContentFilterError,
  SchemaValidationError,
  AllProvidersFailedError,
  ProviderNotConfiguredError,
  isRetryableError,
  getErrorCode,
} from "./errors";

// ============================================
// Utilities
// ============================================

export { RateLimiter, createRateLimiter } from "./utils/rate-limiter";
export { withRetry, retry } from "./utils/retry";
export { Logger, createLogger, getLogger, configureLogger } from "./utils/logger";
export type { RateLimiterOptions } from "./utils/rate-limiter";
export type { RetryOptions } from "./utils/retry";
export type { LogLevel, LoggerConfig } from "./utils/logger";

// ============================================
// Configs
// ============================================

export {
  getConfig,
  getConfigByName,
  developmentConfig,
  productionConfig,
} from "./configs";
