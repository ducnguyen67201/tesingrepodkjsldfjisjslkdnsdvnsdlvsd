/**
 * LLM Center - Anthropic Provider
 *
 * Anthropic implementation with support for:
 * - Chat completions (claude-3.5-sonnet, claude-3.5-haiku, claude-3-opus)
 * - Structured outputs with Zod schemas (via JSON mode)
 *
 * Note: Anthropic does NOT support embeddings. Use OpenAI for embeddings.
 *
 * @requires zod>=4.0.0 - Uses z.toJSONSchema() for structured outputs
 */

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { BaseLLMProvider } from "./base";
import type {
  AnthropicConfig,
  EmbedOptions,
  EmbedResult,
  CompleteOptions,
  CompleteResult,
  ChatOptions,
  ChatResult,
  Message,
  FinishReason,
} from "../types";
import {
  RateLimitError,
  AuthenticationError,
  TimeoutError,
  ServiceUnavailableError,
  ModelNotFoundError,
  LLMError,
} from "../errors";

// ============================================
// Constants
// ============================================

const DEFAULT_MODEL = "claude-3-5-sonnet-20241022";
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * Cost per 1M tokens (as of December 2024)
 */
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  "claude-3-5-sonnet-20241022": { input: 3, output: 15 },
  "claude-3-5-haiku-20241022": { input: 0.8, output: 4 },
  "claude-3-opus-20240229": { input: 15, output: 75 },
  "claude-3-sonnet-20240229": { input: 3, output: 15 },
  "claude-3-haiku-20240307": { input: 0.25, output: 1.25 },
};

// ============================================
// Anthropic Provider
// ============================================

/**
 * Anthropic provider implementation.
 *
 * Supports completions and chat with structured outputs.
 * Does NOT support embeddings - use OpenAI for that.
 */
export class AnthropicProvider extends BaseLLMProvider {
  readonly name = "anthropic" as const;
  private client: Anthropic;
  private config: AnthropicConfig;
  private timeoutMs: number;

  constructor(config: AnthropicConfig) {
    super();
    this.config = config;
    this.timeoutMs = config.timeout ?? DEFAULT_TIMEOUT_MS;
    this.client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      timeout: this.timeoutMs,
    });
  }

  /**
   * Anthropic doesn't support embeddings.
   * @throws LLMError always - use OpenAI for embeddings
   */
  async embed(_texts: string[], _options?: EmbedOptions): Promise<EmbedResult> {
    throw new LLMError(
      "Anthropic does not support embeddings. Use OpenAI provider for embeddings.",
      {
        code: "unsupported_operation",
        provider: this.name,
        retryable: false,
      }
    );
  }

  /**
   * Generate completion with optional structured output.
   */
  async complete<T>(
    prompt: string,
    options?: CompleteOptions<z.ZodType<T>>
  ): Promise<CompleteResult<T>> {
    const model = options?.model ?? this.config.defaultModel ?? DEFAULT_MODEL;

    // Build messages
    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: prompt },
    ];

    // Build system prompt with optional schema instructions
    let systemPrompt = options?.systemPrompt ?? "";
    if (options?.schema) {
      // Use compact JSON to minimize token usage
      const jsonSchema = z.toJSONSchema(options.schema);
      systemPrompt += `\nRespond with valid JSON matching: ${JSON.stringify(jsonSchema)}\nJSON only.`;
    }

    try {
      const response = await this.client.messages.create({
        model,
        max_tokens: options?.maxTokens ?? DEFAULT_MAX_TOKENS,
        system: systemPrompt || undefined,
        messages,
      });

      const content = response.content[0];
      const text = content?.type === "text" ? content.text : "";

      // Parse with schema if provided
      const data = options?.schema
        ? this.parseWithSchema(text, options.schema)
        : (text as T);

      return {
        data,
        raw: text,
        model,
        provider: this.name,
        usage: {
          promptTokens: response.usage.input_tokens,
          completionTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens,
          estimatedCost: this.calculateCost(
            model,
            response.usage.input_tokens,
            response.usage.output_tokens
          ),
        },
        finishReason: this.mapFinishReason(response.stop_reason),
      };
    } catch (error) {
      throw this.mapError(error, model);
    }
  }

  /**
   * Chat with optional structured output.
   */
  async chat<T>(
    messages: Message[],
    options?: ChatOptions<z.ZodType<T>>
  ): Promise<ChatResult<T>> {
    const model = options?.model ?? this.config.defaultModel ?? DEFAULT_MODEL;

    // Extract system message if present
    let systemPrompt = "";
    const chatMessages: Anthropic.MessageParam[] = [];

    for (const msg of messages) {
      if (msg.role === "system") {
        systemPrompt = msg.content;
      } else {
        chatMessages.push({
          role: msg.role as "user" | "assistant",
          content: msg.content,
        });
      }
    }

    // Add schema instructions for structured output (compact to save tokens)
    if (options?.schema) {
      const jsonSchema = z.toJSONSchema(options.schema);
      systemPrompt += `\nRespond with valid JSON matching: ${JSON.stringify(jsonSchema)}\nJSON only.`;
    }

    try {
      const response = await this.client.messages.create({
        model,
        max_tokens: options?.maxTokens ?? DEFAULT_MAX_TOKENS,
        system: systemPrompt || undefined,
        messages: chatMessages,
      });

      const content = response.content[0];
      const text = content?.type === "text" ? content.text : "";

      // Parse with schema if provided
      const data = options?.schema
        ? this.parseWithSchema(text, options.schema)
        : (text as T);

      return {
        data,
        message: {
          role: "assistant",
          content: text,
        },
        model,
        provider: this.name,
        usage: {
          promptTokens: response.usage.input_tokens,
          completionTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens,
          estimatedCost: this.calculateCost(
            model,
            response.usage.input_tokens,
            response.usage.output_tokens
          ),
        },
        finishReason: this.mapFinishReason(response.stop_reason),
      };
    } catch (error) {
      throw this.mapError(error, model);
    }
  }

  /**
   * Calculate cost based on model and token usage.
   */
  private calculateCost(
    model: string,
    inputTokens: number,
    outputTokens: number
  ): number {
    const pricing = MODEL_COSTS[model] ?? { input: 0, output: 0 };
    return (
      (inputTokens / 1_000_000) * pricing.input +
      (outputTokens / 1_000_000) * pricing.output
    );
  }

  /**
   * Map Anthropic stop reason to standard format.
   */
  private mapFinishReason(reason: string | null): FinishReason {
    switch (reason) {
      case "end_turn":
        return "stop";
      case "max_tokens":
        return "length";
      default:
        return "stop";
    }
  }

  /**
   * Map Anthropic errors to our custom error types.
   */
  private mapError(error: unknown, model: string): Error {
    if (error instanceof Anthropic.APIError) {
      const status = error.status;
      const message = error.message;

      if (status === 401) {
        return new AuthenticationError(this.name, error);
      }

      if (status === 429) {
        return new RateLimitError(this.name, model, undefined, error);
      }

      if (status === 404) {
        return new ModelNotFoundError(this.name, model, error);
      }

      if (status === 503 || status === 529) {
        return new ServiceUnavailableError(this.name, error);
      }

      if (message.includes("timeout") || status === 408) {
        return new TimeoutError(this.name, model, this.timeoutMs, error);
      }

      if (message.includes("overloaded")) {
        return new ServiceUnavailableError(this.name, error);
      }
    }

    // Return original error if not an API error
    return error instanceof Error ? error : new Error(String(error));
  }
}
