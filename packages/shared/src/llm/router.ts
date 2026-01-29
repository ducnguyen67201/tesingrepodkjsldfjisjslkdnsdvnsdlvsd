/**
 * LLM Center - Smart Router
 *
 * Handles intelligent routing of LLM requests with:
 * - Per-operation routing (embed/chat/complete)
 * - Automatic fallback on retryable errors
 * - Retry logic with exponential backoff
 */

import type { z } from "zod";
import type {
  LLMProvider,
  ProviderName,
  OperationType,
  EmbedOptions,
  EmbedResult,
  CompleteOptions,
  CompleteResult,
  ChatOptions,
  ChatResult,
  Message,
} from "./types";
import type { LLMCenterConfig, ModelRef, OperationRouting } from "./config.types";
import { AllProvidersFailedError, isRetryableError } from "./errors";
import { withRetry, sleep } from "./utils";

// ============================================
// Constants
// ============================================

/** Default max retries per model before moving to fallback */
const DEFAULT_MAX_RETRIES = 2;

/** Base delay for exponential backoff (ms) */
const DEFAULT_BASE_DELAY_MS = 1000;

/** Maximum delay cap for exponential backoff (ms) */
const DEFAULT_MAX_DELAY_MS = 30_000;

// ============================================
// Types
// ============================================

interface RouterOptions {
  providers: Map<ProviderName, LLMProvider>;
  config: LLMCenterConfig;
}

interface AttemptResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  model: ModelRef;
}

// ============================================
// Smart Router
// ============================================

/**
 * Smart router for LLM operations with fallback support.
 */
export class SmartRouter {
  private providers: Map<ProviderName, LLMProvider>;
  private config: LLMCenterConfig;

  constructor(options: RouterOptions) {
    this.providers = options.providers;
    this.config = options.config;
  }

  /**
   * Route an embed operation through the fallback chain.
   */
  async routeEmbed(
    texts: string[],
    options?: EmbedOptions
  ): Promise<EmbedResult> {
    // If specific provider/model requested, use directly
    if (options?.provider || options?.model) {
      const provider = this.getProvider(options.provider ?? "openai");
      return this.executeWithRetry(() => provider.embed(texts, options));
    }

    // Use routing config
    const routing = this.config.routing.embed;
    return this.executeWithFallback<EmbedResult>(
      "embed",
      routing,
      async (provider, model) => {
        return provider.embed(texts, { ...options, model: model.model });
      }
    );
  }

  /**
   * Route a complete operation through the fallback chain.
   */
  async routeComplete<T>(
    prompt: string,
    options?: CompleteOptions<z.ZodType<T>>
  ): Promise<CompleteResult<T>> {
    // If specific provider/model requested, use directly
    if (options?.provider || options?.model) {
      const provider = this.getProvider(
        options.provider ?? this.config.defaultProvider
      );
      return this.executeWithRetry(() => provider.complete<T>(prompt, options));
    }

    // Use routing config
    const routing = this.config.routing.complete;
    return this.executeWithFallback<CompleteResult<T>>(
      "complete",
      routing,
      async (provider, model) => {
        return provider.complete<T>(prompt, { ...options, model: model.model });
      }
    );
  }

  /**
   * Route a chat operation through the fallback chain.
   */
  async routeChat<T>(
    messages: Message[],
    options?: ChatOptions<z.ZodType<T>>
  ): Promise<ChatResult<T>> {
    // If specific provider/model requested, use directly
    if (options?.provider || options?.model) {
      const provider = this.getProvider(
        options.provider ?? this.config.defaultProvider
      );
      return this.executeWithRetry(() => provider.chat<T>(messages, options));
    }

    // Use routing config
    const routing = this.config.routing.chat;
    return this.executeWithFallback<ChatResult<T>>(
      "chat",
      routing,
      async (provider, model) => {
        return provider.chat<T>(messages, { ...options, model: model.model });
      }
    );
  }

  /**
   * Execute operation with fallback chain.
   */
  private async executeWithFallback<T>(
    operation: OperationType,
    routing: OperationRouting,
    execute: (provider: LLMProvider, model: ModelRef) => Promise<T>
  ): Promise<T> {
    const fallbackConfig = this.config.fallback;
    const maxAttempts = fallbackConfig?.maxAttempts ?? 3;
    const attempts: AttemptResult<T>[] = [];

    // Build chain: primary + fallbacks
    const chain: ModelRef[] = [routing.primary];
    if (fallbackConfig?.enabled !== false && routing.fallbacks) {
      chain.push(...routing.fallbacks.slice(0, maxAttempts - 1));
    }

    for (const model of chain) {
      const provider = this.providers.get(model.provider);
      if (!provider) {
        attempts.push({
          success: false,
          error: new Error(`Provider "${model.provider}" not configured`),
          model,
        });
        continue;
      }

      try {
        const result = await this.executeWithRetry(() =>
          execute(provider, model)
        );
        return result;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        attempts.push({
          success: false,
          error: err,
          model,
        });

        // If error is not retryable, stop trying
        if (!this.shouldFallback(err)) {
          throw err;
        }

        // Wait before trying next fallback
        if (fallbackConfig?.retryDelay) {
          await sleep(fallbackConfig.retryDelay);
        }
      }
    }

    // All attempts failed
    throw new AllProvidersFailedError(
      operation,
      attempts.map((a) => ({ model: a.model, error: a.error! }))
    );
  }

  /**
   * Execute with retry logic.
   */
  private async executeWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    return withRetry(fn, {
      maxAttempts: this.config.settings?.maxRetries ?? DEFAULT_MAX_RETRIES,
      baseDelayMs: DEFAULT_BASE_DELAY_MS,
      maxDelayMs: DEFAULT_MAX_DELAY_MS,
    });
  }

  /**
   * Check if error should trigger fallback.
   */
  private shouldFallback(error: Error): boolean {
    const fallbackConfig = this.config.fallback;
    if (fallbackConfig?.enabled === false) {
      return false;
    }

    // Check against retryable errors list
    const retryableErrors = fallbackConfig?.retryableErrors ?? [
      "rate_limit",
      "timeout",
      "service_unavailable",
      "model_overloaded",
    ];

    // Use our error utility to check
    if (isRetryableError(error)) {
      return true;
    }

    // Check error message for specific patterns
    const message = error.message.toLowerCase();
    return retryableErrors.some((errType) =>
      message.includes(errType.toLowerCase().replace("_", " "))
    );
  }

  /**
   * Get provider by name.
   */
  private getProvider(name: ProviderName): LLMProvider {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new Error(`Provider "${name}" not configured`);
    }
    return provider;
  }
}

/**
 * Create a smart router instance.
 */
export function createSmartRouter(options: RouterOptions): SmartRouter {
  return new SmartRouter(options);
}
