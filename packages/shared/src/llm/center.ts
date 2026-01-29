/**
 * LLM Center - Centralized LLM Processing Service
 *
 * Single entry point for all LLM operations with:
 * - Multi-provider support (OpenAI, Anthropic)
 * - Smart routing with automatic fallback
 * - Structured outputs with Zod validation
 * - Centralized cost tracking and usage metrics
 * - Built-in rate limiting and retry logic
 */

import type { z } from "zod";
import type {
  LLMProvider,
  ProviderName,
  EmbedOptions,
  EmbedResult,
  CompleteOptions,
  CompleteResult,
  ChatOptions,
  ChatResult,
  Message,
  UsageEvent,
  UsageStats,
} from "./types";
import type { LLMCenterConfig } from "./config.types";
import { SmartRouter } from "./router";
import { RateLimiter } from "./utils/rate-limiter";
import {
  createProviders,
  getProvider,
  hasProvider,
  shutdownProviders,
  type ProviderRegistry,
} from "./provider-factory";
import { UsageTracker } from "./usage-tracker";

// ============================================
// LLM Center
// ============================================

/**
 * LLM Center - Centralized LLM Processing Service
 *
 * @example
 * ```typescript
 * import { createLLMCenter } from "@ducsigr/shared/llm";
 *
 * const llm = createLLMCenter({
 *   defaultProvider: "openai",
 *   providers: {
 *     openai: { apiKey: process.env.OPENAI_API_KEY! },
 *     anthropic: { apiKey: process.env.ANTHROPIC_API_KEY! },
 *   },
 *   routing: {
 *     embed: { primary: { provider: "openai", model: "text-embedding-3-small" } },
 *     chat: { primary: { provider: "anthropic", model: "claude-3-5-sonnet-20241022" } },
 *     complete: { primary: { provider: "openai", model: "gpt-4o-mini" } },
 *   },
 * });
 *
 * // Generate embeddings
 * const embedResult = await llm.embed(["Hello world"]);
 *
 * // Chat with structured output
 * const chatResult = await llm.chat(
 *   [{ role: "user", content: "Analyze this text" }],
 *   { schema: MySchema }
 * );
 * ```
 */
export class LLMCenter {
  private registry: ProviderRegistry;
  private router: SmartRouter;
  private config: LLMCenterConfig;
  private rateLimiter?: RateLimiter;
  private usageTracker: UsageTracker;

  constructor(config: LLMCenterConfig) {
    this.config = config;

    // Initialize providers via factory
    this.registry = createProviders(config);

    // Initialize router
    this.router = new SmartRouter({
      providers: this.registry.providers,
      config,
    });

    // Initialize rate limiter
    if (config.rateLimiting?.enabled) {
      this.rateLimiter = new RateLimiter({
        requestsPerMinute: config.rateLimiting.requestsPerMinute ?? 500,
        tokensPerMinute: config.rateLimiting.tokensPerMinute,
      });
    }

    // Initialize usage tracker
    this.usageTracker = new UsageTracker({
      enabled: config.tracking?.enabled,
      onUsage: config.tracking?.onUsage,
    });
  }

  /**
   * Generate embeddings for texts.
   */
  async embed(texts: string[], options?: EmbedOptions): Promise<EmbedResult> {
    // Fast path: empty input returns empty result (no API call)
    if (texts.length === 0) {
      return this.createEmptyEmbedResult(options);
    }

    // Filter out empty strings to avoid wasting tokens
    const validTexts = texts.filter((t) => t.trim().length > 0);
    if (validTexts.length === 0) {
      return this.createEmptyEmbedResult(options);
    }

    const startTime = Date.now();
    await this.rateLimiter?.acquire();

    try {
      const result = await this.router.routeEmbed(validTexts, options);

      this.usageTracker.track({
        provider: result.provider as ProviderName,
        model: result.model,
        operation: "embed",
        tokens: { total: result.usage.totalTokens },
        cost: result.usage.estimatedCost,
        latencyMs: Date.now() - startTime,
        success: true,
      });

      return result;
    } catch (error) {
      this.usageTracker.track({
        provider: options?.provider ?? this.config.defaultProvider,
        model: options?.model ?? "unknown",
        operation: "embed",
        tokens: { total: 0 },
        cost: 0,
        latencyMs: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Generate completion with optional structured output.
   */
  async complete<T>(
    prompt: string,
    options?: CompleteOptions<z.ZodType<T>>
  ): Promise<CompleteResult<T>> {
    const startTime = Date.now();
    await this.rateLimiter?.acquire();

    try {
      const result = await this.router.routeComplete<T>(prompt, options);

      this.usageTracker.track({
        provider: result.provider as ProviderName,
        model: result.model,
        operation: "complete",
        tokens: {
          prompt: result.usage.promptTokens,
          completion: result.usage.completionTokens,
          total: result.usage.totalTokens,
        },
        cost: result.usage.estimatedCost,
        latencyMs: Date.now() - startTime,
        success: true,
      });

      return result;
    } catch (error) {
      this.usageTracker.track({
        provider: options?.provider ?? this.config.defaultProvider,
        model: options?.model ?? "unknown",
        operation: "complete",
        tokens: { total: 0 },
        cost: 0,
        latencyMs: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Chat with optional structured output.
   */
  async chat<T>(
    messages: Message[],
    options?: ChatOptions<z.ZodType<T>>
  ): Promise<ChatResult<T>> {
    const startTime = Date.now();
    await this.rateLimiter?.acquire();

    try {
      const result = await this.router.routeChat<T>(messages, options);

      this.usageTracker.track({
        provider: result.provider as ProviderName,
        model: result.model,
        operation: "chat",
        tokens: {
          prompt: result.usage.promptTokens,
          completion: result.usage.completionTokens,
          total: result.usage.totalTokens,
        },
        cost: result.usage.estimatedCost,
        latencyMs: Date.now() - startTime,
        success: true,
      });

      return result;
    } catch (error) {
      this.usageTracker.track({
        provider: options?.provider ?? this.config.defaultProvider,
        model: options?.model ?? "unknown",
        operation: "chat",
        tokens: { total: 0 },
        cost: 0,
        latencyMs: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get aggregated usage statistics.
   */
  getUsage(): UsageStats {
    return this.usageTracker.getStats();
  }

  /**
   * Get raw usage events.
   */
  getUsageEvents(): UsageEvent[] {
    return this.usageTracker.getEvents();
  }

  /**
   * Clear usage history and reset stats.
   */
  clearUsage(): void {
    this.usageTracker.clear();
  }

  /**
   * Get a specific provider instance.
   */
  getProvider(name: ProviderName): LLMProvider {
    return getProvider(this.registry, name);
  }

  /**
   * Check if a provider is configured.
   */
  hasProvider(name: ProviderName): boolean {
    return hasProvider(this.registry, name);
  }

  /**
   * Shutdown all providers.
   */
  async shutdown(): Promise<void> {
    await shutdownProviders(this.registry);
  }

  // ============================================
  // Private Methods
  // ============================================

  private createEmptyEmbedResult(options?: EmbedOptions): EmbedResult {
    return {
      embeddings: [],
      model: options?.model ?? "none",
      provider: options?.provider ?? this.config.defaultProvider,
      usage: { totalTokens: 0, estimatedCost: 0 },
    };
  }
}

/**
 * Create LLM Center instance.
 */
export function createLLMCenter(config: LLMCenterConfig): LLMCenter {
  return new LLMCenter(config);
}
