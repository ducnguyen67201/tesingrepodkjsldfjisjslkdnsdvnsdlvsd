/**
 * LLM Center - Core Type Definitions
 *
 * Types for LLM operations, providers, and results.
 */

import type { z } from "zod";

// ============================================
// Provider Configuration
// ============================================

export interface OpenAIConfig {
  apiKey: string;
  organization?: string;
  baseURL?: string;
  defaultModel?: string;
  embeddingModel?: string;
  /** Request timeout in milliseconds (default: 60000) */
  timeout?: number;
}

export interface AnthropicConfig {
  apiKey: string;
  baseURL?: string;
  defaultModel?: string;
  /** Request timeout in milliseconds (default: 60000) */
  timeout?: number;
}

// ============================================
// Embedding Types
// ============================================

export interface EmbedOptions {
  /** Override provider for this call */
  provider?: ProviderName;
  /** Override model for this call */
  model?: string;
  /** Batch size for processing */
  batchSize?: number;
  /** Embedding dimensions (for models that support it) */
  dimensions?: number;
}

export interface EmbedResult {
  embeddings: number[][];
  model: string;
  provider: string;
  usage: {
    totalTokens: number;
    estimatedCost: number;
  };
}

// ============================================
// Completion Types
// ============================================

export interface CompleteOptions<T extends z.ZodType = z.ZodType> {
  /** Override provider for this call */
  provider?: ProviderName;
  /** Override model for this call */
  model?: string;
  /** Zod schema for structured output */
  schema?: T;
  /** Temperature (0-2) */
  temperature?: number;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** System prompt */
  systemPrompt?: string;
}

export interface CompleteResult<T = unknown> {
  data: T;
  raw: string;
  model: string;
  provider: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedCost: number;
  };
  finishReason: FinishReason;
}

// ============================================
// Chat Types
// ============================================

export type MessageRole = "system" | "user" | "assistant";

export interface Message {
  role: MessageRole;
  content: string;
}

export interface ChatOptions<T extends z.ZodType = z.ZodType> {
  /** Override provider for this call */
  provider?: ProviderName;
  /** Override model for this call */
  model?: string;
  /** Zod schema for structured output */
  schema?: T;
  /** Temperature (0-2) */
  temperature?: number;
  /** Maximum tokens to generate */
  maxTokens?: number;
}

export interface ChatResult<T = unknown> {
  data: T;
  message: Message;
  model: string;
  provider: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedCost: number;
  };
  finishReason: FinishReason;
}

// ============================================
// Usage Tracking
// ============================================

export interface UsageEvent {
  timestamp: Date;
  provider: string;
  model: string;
  operation: OperationType;
  tokens: {
    prompt?: number;
    completion?: number;
    total: number;
  };
  cost: number;
  latencyMs: number;
  success: boolean;
  error?: string;
}

export interface UsageStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalTokens: number;
  totalCost: number;
  byProvider: Record<
    string,
    {
      requests: number;
      tokens: number;
      cost: number;
    }
  >;
  byOperation: Record<
    string,
    {
      requests: number;
      tokens: number;
      cost: number;
    }
  >;
}

// ============================================
// Provider Interface
// ============================================

export type ProviderName = "openai" | "anthropic";
export type OperationType = "embed" | "chat" | "complete";
export type FinishReason = "stop" | "length" | "content_filter";

/**
 * Interface that all LLM providers must implement.
 */
export interface LLMProvider {
  readonly name: ProviderName;

  /**
   * Generate embeddings for texts.
   */
  embed(texts: string[], options?: EmbedOptions): Promise<EmbedResult>;

  /**
   * Generate completion with optional structured output.
   */
  complete<T>(
    prompt: string,
    options?: CompleteOptions<z.ZodType<T>>
  ): Promise<CompleteResult<T>>;

  /**
   * Chat with optional structured output.
   */
  chat<T>(
    messages: Message[],
    options?: ChatOptions<z.ZodType<T>>
  ): Promise<ChatResult<T>>;

  /**
   * Initialize provider (optional).
   */
  initialize?(): Promise<void>;

  /**
   * Shutdown provider (optional).
   */
  shutdown?(): Promise<void>;
}
