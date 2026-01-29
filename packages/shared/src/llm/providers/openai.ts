/**
 * LLM Center - OpenAI Provider
 *
 * OpenAI implementation with support for:
 * - Embeddings (text-embedding-3-small/large)
 * - Chat completions (gpt-4o, gpt-4o-mini)
 * - Structured outputs with Zod schemas
 */

import OpenAI from "openai";
import type { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { BaseLLMProvider } from "./base";
import type {
  OpenAIConfig,
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
} from "../errors";

// ============================================
// Constants
// ============================================

const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
const DEFAULT_CHAT_MODEL = "gpt-4o-mini";
const EMBEDDING_DIMENSIONS = 1536;
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * Cost per 1M tokens (as of December 2024)
 */
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  // Embedding models
  "text-embedding-3-small": { input: 0.02, output: 0 },
  "text-embedding-3-large": { input: 0.13, output: 0 },
  "text-embedding-ada-002": { input: 0.1, output: 0 },
  // Chat models
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4-turbo": { input: 10, output: 30 },
  "gpt-4": { input: 30, output: 60 },
  "gpt-3.5-turbo": { input: 0.5, output: 1.5 },
};

// ============================================
// OpenAI Provider
// ============================================

/**
 * OpenAI provider implementation.
 *
 * Supports embeddings, completions, and chat with structured outputs.
 */
export class OpenAIProvider extends BaseLLMProvider {
  readonly name = "openai" as const;
  private client: OpenAI;
  private config: OpenAIConfig;
  private timeoutMs: number;

  constructor(config: OpenAIConfig) {
    super();
    this.config = config;
    this.timeoutMs = config.timeout ?? DEFAULT_TIMEOUT_MS;
    this.client = new OpenAI({
      apiKey: config.apiKey,
      organization: config.organization,
      baseURL: config.baseURL,
      timeout: this.timeoutMs,
    });
  }

  /**
   * Generate embeddings for texts.
   */
  async embed(texts: string[], options?: EmbedOptions): Promise<EmbedResult> {
    const model =
      options?.model ?? this.config.embeddingModel ?? DEFAULT_EMBEDDING_MODEL;

    try {
      const response = await this.client.embeddings.create({
        model,
        input: texts,
        dimensions: options?.dimensions ?? EMBEDDING_DIMENSIONS,
      });

      const embeddings = response.data.map((d) => d.embedding);
      const totalTokens = response.usage.total_tokens;
      const cost = this.calculateCost(model, totalTokens, 0);

      return {
        embeddings,
        model,
        provider: this.name,
        usage: {
          totalTokens,
          estimatedCost: cost,
        },
      };
    } catch (error) {
      throw this.mapError(error, model);
    }
  }

  /**
   * Generate completion with optional structured output.
   */
  async complete<T>(
    prompt: string,
    options?: CompleteOptions<z.ZodType<T>>
  ): Promise<CompleteResult<T>> {
    const model =
      options?.model ?? this.config.defaultModel ?? DEFAULT_CHAT_MODEL;
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

    if (options?.systemPrompt) {
      messages.push({ role: "system", content: options.systemPrompt });
    }
    messages.push({ role: "user", content: prompt });

    try {
      // Use structured output if schema provided
      if (options?.schema) {
        const response = await this.client.beta.chat.completions.parse({
          model,
          messages,
          temperature: options?.temperature ?? DEFAULT_TEMPERATURE,
          max_tokens: options?.maxTokens,
          response_format: zodResponseFormat(options.schema, "response"),
        });

        const choice = response.choices[0];
        if (!choice) {
          throw new Error("No completion choice returned");
        }

        const parsed = choice.message.parsed as T;

        return {
          data: parsed,
          raw: choice.message.content ?? "",
          model,
          provider: this.name,
          usage: {
            promptTokens: response.usage?.prompt_tokens ?? 0,
            completionTokens: response.usage?.completion_tokens ?? 0,
            totalTokens: response.usage?.total_tokens ?? 0,
            estimatedCost: this.calculateCost(
              model,
              response.usage?.prompt_tokens ?? 0,
              response.usage?.completion_tokens ?? 0
            ),
          },
          finishReason: this.mapFinishReason(choice.finish_reason),
        };
      }

      // Regular completion without schema
      const response = await this.client.chat.completions.create({
        model,
        messages,
        temperature: options?.temperature ?? DEFAULT_TEMPERATURE,
        max_tokens: options?.maxTokens,
      });

      const choice = response.choices[0];
      if (!choice) {
        throw new Error("No completion choice returned");
      }

      const content = choice.message.content ?? "";

      return {
        data: content as T,
        raw: content,
        model,
        provider: this.name,
        usage: {
          promptTokens: response.usage?.prompt_tokens ?? 0,
          completionTokens: response.usage?.completion_tokens ?? 0,
          totalTokens: response.usage?.total_tokens ?? 0,
          estimatedCost: this.calculateCost(
            model,
            response.usage?.prompt_tokens ?? 0,
            response.usage?.completion_tokens ?? 0
          ),
        },
        finishReason: this.mapFinishReason(choice.finish_reason),
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
    const model =
      options?.model ?? this.config.defaultModel ?? DEFAULT_CHAT_MODEL;
    const openaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] =
      messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

    try {
      // Use structured output if schema provided
      if (options?.schema) {
        const response = await this.client.beta.chat.completions.parse({
          model,
          messages: openaiMessages,
          temperature: options?.temperature ?? DEFAULT_TEMPERATURE,
          max_tokens: options?.maxTokens,
          response_format: zodResponseFormat(options.schema, "response"),
        });

        const choice = response.choices[0];
        if (!choice) {
          throw new Error("No chat choice returned");
        }

        const parsed = choice.message.parsed as T;

        return {
          data: parsed,
          message: {
            role: "assistant",
            content: choice.message.content ?? "",
          },
          model,
          provider: this.name,
          usage: {
            promptTokens: response.usage?.prompt_tokens ?? 0,
            completionTokens: response.usage?.completion_tokens ?? 0,
            totalTokens: response.usage?.total_tokens ?? 0,
            estimatedCost: this.calculateCost(
              model,
              response.usage?.prompt_tokens ?? 0,
              response.usage?.completion_tokens ?? 0
            ),
          },
          finishReason: this.mapFinishReason(choice.finish_reason),
        };
      }

      // Regular chat without schema
      const response = await this.client.chat.completions.create({
        model,
        messages: openaiMessages,
        temperature: options?.temperature ?? DEFAULT_TEMPERATURE,
        max_tokens: options?.maxTokens,
      });

      const choice = response.choices[0];
      if (!choice) {
        throw new Error("No chat choice returned");
      }

      const content = choice.message.content ?? "";

      return {
        data: content as T,
        message: {
          role: "assistant",
          content,
        },
        model,
        provider: this.name,
        usage: {
          promptTokens: response.usage?.prompt_tokens ?? 0,
          completionTokens: response.usage?.completion_tokens ?? 0,
          totalTokens: response.usage?.total_tokens ?? 0,
          estimatedCost: this.calculateCost(
            model,
            response.usage?.prompt_tokens ?? 0,
            response.usage?.completion_tokens ?? 0
          ),
        },
        finishReason: this.mapFinishReason(choice.finish_reason),
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
   * Map OpenAI finish reason to standard format.
   */
  private mapFinishReason(reason: string | null): FinishReason {
    switch (reason) {
      case "stop":
        return "stop";
      case "length":
        return "length";
      case "content_filter":
        return "content_filter";
      default:
        return "stop";
    }
  }

  /**
   * Map OpenAI errors to our custom error types.
   */
  private mapError(error: unknown, model: string): Error {
    if (error instanceof OpenAI.APIError) {
      const status = error.status;
      const message = error.message;

      if (status === 401) {
        return new AuthenticationError(this.name, error);
      }

      if (status === 429) {
        // Extract retry-after if available
        const retryAfter = error.headers?.["retry-after"];
        const retryAfterMs = retryAfter ? parseInt(retryAfter) * 1000 : undefined;
        return new RateLimitError(this.name, model, retryAfterMs, error);
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
    }

    // Return original error if not an API error
    return error instanceof Error ? error : new Error(String(error));
  }
}
