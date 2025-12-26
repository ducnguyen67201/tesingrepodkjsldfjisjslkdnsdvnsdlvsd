# Engineering Spec: LLM Center - Centralized LLM Processor

**Issue**: #136
**Sprint**: 2 - Vector Search
**Story Points**: 8
**Priority**: P0
**Status**: Implemented
**Author**: Engineering Team
**Created**: 2025-12-13
**Dependencies**: None (foundational infrastructure)

---

## Overview

Create a centralized LLM processing service (`LLMCenter`) in `packages/shared` that serves as the single entry point for all LLM operations across the application. This includes embeddings, chat completions, and structured outputs with Zod schema validation.

## Problem Statement

Without centralized LLM management:

1. **Scattered API calls**: LLM calls spread across codebase, hard to maintain
2. **No provider abstraction**: Locked to single provider, difficult to switch/add
3. **Inconsistent error handling**: Each call handles errors differently
4. **No cost tracking**: Can't monitor/optimize LLM spending
5. **No structured outputs**: Manual parsing of LLM responses, error-prone
6. **Rate limiting chaos**: Each caller implements own rate limiting

## Goals

1. **Single entry point** for all LLM operations in the application
2. **Provider abstraction** supporting OpenAI, Anthropic, and future providers
3. **Structured outputs** with Zod schema validation
4. **Centralized cost tracking** and usage metrics
5. **Built-in rate limiting** and retry logic
6. **Type-safe API** with full TypeScript support

## Non-Goals

- Streaming responses (Phase 2)
- Function calling / tool use (Phase 2)
- Fine-tuned model support (Future)
- Local model support (Future)

---

## Model Routing & Fallback Configuration

### Overview

A TypeScript configuration file (`llm.config.ts`) defines smart routing rules per operation type with fallback chains. This provides:

1. **Per-operation routing**: Different primary models for embed/chat/complete
2. **Fallback chains**: Automatic failover when primary model fails
3. **Type safety**: Full IDE support with validation
4. **Environment-aware**: Different configs for dev/staging/prod

### Configuration Structure

**File**: `packages/shared/src/llm/llm.config.ts`

```typescript
import { defineLLMConfig } from "./config";

export const llmConfig = defineLLMConfig({
  // Default provider when not specified
  defaultProvider: "openai",

  // Provider credentials (loaded from env)
  providers: {
    openai: {
      apiKey: process.env.OPENAI_API_KEY!,
      organization: process.env.OPENAI_ORG_ID,
    },
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY!,
    },
  },

  // Smart routing per operation type
  routing: {
    embed: {
      // Embeddings: OpenAI only (Anthropic doesn't support)
      primary: { provider: "openai", model: "text-embedding-3-small" },
      fallbacks: [
        { provider: "openai", model: "text-embedding-3-large" },
      ],
    },

    chat: {
      // Chat: Prefer Claude for quality, fallback to GPT
      primary: { provider: "anthropic", model: "claude-3-5-sonnet-20241022" },
      fallbacks: [
        { provider: "openai", model: "gpt-4o" },
        { provider: "openai", model: "gpt-4o-mini" },
        { provider: "anthropic", model: "claude-3-5-haiku-20241022" },
      ],
    },

    complete: {
      // Completions: GPT-4o-mini for cost efficiency
      primary: { provider: "openai", model: "gpt-4o-mini" },
      fallbacks: [
        { provider: "openai", model: "gpt-4o" },
        { provider: "anthropic", model: "claude-3-5-sonnet-20241022" },
      ],
    },
  },

  // Fallback behavior
  fallback: {
    enabled: true,
    maxAttempts: 3,           // Max fallbacks to try
    retryDelay: 1000,         // Delay between retries (ms)
    retryableErrors: [        // Error types that trigger fallback
      "rate_limit",
      "timeout",
      "service_unavailable",
      "model_overloaded",
    ],
  },

  // Global settings
  settings: {
    timeout: 30000,           // Request timeout (ms)
    maxRetries: 2,            // Retries per model before fallback
  },
});
```

### Config Type Definitions

```typescript
// packages/shared/src/llm/config.types.ts

export type ProviderName = "openai" | "anthropic";
export type OperationType = "embed" | "chat" | "complete";

export interface ModelRef {
  provider: ProviderName;
  model: string;
}

export interface OperationRouting {
  primary: ModelRef;
  fallbacks?: ModelRef[];
}

export interface FallbackConfig {
  enabled: boolean;
  maxAttempts?: number;
  retryDelay?: number;
  retryableErrors?: string[];
}

export interface LLMRoutingConfig {
  defaultProvider: ProviderName;

  providers: {
    openai?: {
      apiKey: string;
      organization?: string;
      baseURL?: string;
    };
    anthropic?: {
      apiKey: string;
      baseURL?: string;
    };
  };

  routing: {
    embed: OperationRouting;
    chat: OperationRouting;
    complete: OperationRouting;
  };

  fallback?: FallbackConfig;

  settings?: {
    timeout?: number;
    maxRetries?: number;
  };
}

/**
 * Type-safe config definition helper
 */
export function defineLLMConfig(config: LLMRoutingConfig): LLMRoutingConfig {
  return config;
}
```

### Routing Execution Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SMART ROUTING FLOW                                   │
└─────────────────────────────────────────────────────────────────────────────┘

  User calls: llm.chat(messages)
         │
         ▼
  ┌──────────────────┐
  │  Load Routing    │
  │  Config for      │
  │  "chat" operation│
  └────────┬─────────┘
           │
           ▼
  ┌──────────────────┐     Success    ┌──────────────────┐
  │  Try PRIMARY     │ ─────────────► │  Return Result   │
  │  claude-3-5-     │                └──────────────────┘
  │  sonnet          │
  └────────┬─────────┘
           │ Failure (retryable error)
           ▼
  ┌──────────────────┐     Success    ┌──────────────────┐
  │  Try FALLBACK 1  │ ─────────────► │  Return Result   │
  │  gpt-4o          │                └──────────────────┘
  └────────┬─────────┘
           │ Failure
           ▼
  ┌──────────────────┐     Success    ┌──────────────────┐
  │  Try FALLBACK 2  │ ─────────────► │  Return Result   │
  │  gpt-4o-mini     │                └──────────────────┘
  └────────┬─────────┘
           │ Failure
           ▼
  ┌──────────────────┐     Success    ┌──────────────────┐
  │  Try FALLBACK 3  │ ─────────────► │  Return Result   │
  │  claude-3-5-     │                └──────────────────┘
  │  haiku           │
  └────────┬─────────┘
           │ All failed
           ▼
  ┌──────────────────┐
  │  Throw Error     │
  │  with all        │
  │  attempt details │
  └──────────────────┘
```

### Environment-Specific Configs

```typescript
// packages/shared/src/llm/configs/development.ts
export const devConfig = defineLLMConfig({
  defaultProvider: "openai",
  routing: {
    embed: {
      primary: { provider: "openai", model: "text-embedding-3-small" },
    },
    chat: {
      // Use cheaper models in dev
      primary: { provider: "openai", model: "gpt-4o-mini" },
      fallbacks: [],
    },
    complete: {
      primary: { provider: "openai", model: "gpt-4o-mini" },
    },
  },
  // ... rest of config
});

// packages/shared/src/llm/configs/production.ts
export const prodConfig = defineLLMConfig({
  defaultProvider: "anthropic",
  routing: {
    embed: {
      primary: { provider: "openai", model: "text-embedding-3-small" },
      fallbacks: [
        { provider: "openai", model: "text-embedding-3-large" },
      ],
    },
    chat: {
      // Best quality in prod
      primary: { provider: "anthropic", model: "claude-3-5-sonnet-20241022" },
      fallbacks: [
        { provider: "openai", model: "gpt-4o" },
        { provider: "anthropic", model: "claude-3-5-haiku-20241022" },
      ],
    },
    complete: {
      primary: { provider: "openai", model: "gpt-4o" },
      fallbacks: [
        { provider: "anthropic", model: "claude-3-5-sonnet-20241022" },
      ],
    },
  },
  fallback: {
    enabled: true,
    maxAttempts: 3,
  },
  // ... rest of config
});

// packages/shared/src/llm/configs/index.ts
import { devConfig } from "./development";
import { prodConfig } from "./production";

export function getConfig() {
  return process.env.NODE_ENV === "production" ? prodConfig : devConfig;
}
```

### Usage with Config

```typescript
import { createLLMCenter } from "@ducsigr/shared";
import { getConfig } from "@ducsigr/shared/llm/configs";

// Create LLMCenter with routing config
const llm = createLLMCenter(getConfig());

// Embeddings automatically use OpenAI (per routing config)
const embedResult = await llm.embed(["Hello world"]);
// Uses: text-embedding-3-small -> fallback to text-embedding-3-large

// Chat automatically routes to Anthropic first
const chatResult = await llm.chat([{ role: "user", content: "Hello" }]);
// Uses: claude-3-5-sonnet -> gpt-4o -> gpt-4o-mini -> claude-3-5-haiku

// Override routing for specific call
const customResult = await llm.chat(
  [{ role: "user", content: "Hello" }],
  { provider: "openai", model: "gpt-4o" } // Skip routing, use this directly
);
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         LLM CENTER ARCHITECTURE                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                              Application Layer                               │
│                                                                             │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                    │
│   │   Worker    │    │     Web     │    │   Ingest    │                    │
│   │  (Temporal) │    │  (Next.js)  │    │    (Go)     │                    │
│   └──────┬──────┘    └──────┬──────┘    └─────────────┘                    │
│          │                  │                                               │
└──────────┼──────────────────┼───────────────────────────────────────────────┘
           │                  │
           ▼                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         packages/shared/src/llm                              │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │                          LLMCenter                                   │  │
│   │                                                                      │  │
│   │   // Public API                                                      │  │
│   │   llm.embed(texts, options)          → EmbeddingResult              │  │
│   │   llm.complete(prompt, schema)       → StructuredOutput<T>          │  │
│   │   llm.chat(messages, schema)         → StructuredOutput<T>          │  │
│   │   llm.getUsage()                     → UsageStats                   │  │
│   │                                                                      │  │
│   └──────────────────────────────┬──────────────────────────────────────┘  │
│                                  │                                          │
│   ┌──────────────────────────────┴──────────────────────────────────────┐  │
│   │                      Provider Interface                              │  │
│   │                                                                      │  │
│   │   interface LLMProvider {                                            │  │
│   │     embed(texts: string[]): Promise<EmbeddingResponse>              │  │
│   │     complete(prompt: string): Promise<CompletionResponse>           │  │
│   │     chat(messages: Message[]): Promise<ChatResponse>                │  │
│   │   }                                                                  │  │
│   │                                                                      │  │
│   └──────────────────────────────┬──────────────────────────────────────┘  │
│                                  │                                          │
│   ┌──────────────┬───────────────┼───────────────┬──────────────────────┐  │
│   │              │               │               │                      │  │
│   ▼              ▼               ▼               ▼                      │  │
│ ┌────────┐  ┌────────┐    ┌──────────┐    ┌──────────┐                 │  │
│ │ OpenAI │  │Anthropic│    │  Gemini  │    │  Custom  │                 │  │
│ │Provider│  │Provider │    │ Provider │    │ Provider │                 │  │
│ └────────┘  └────────┘    └──────────┘    └──────────┘                 │  │
│                                                                          │  │
└──────────────────────────────────────────────────────────────────────────┘  │
                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Core Design Principles

### 1. Provider Abstraction

All providers implement a common interface, allowing easy switching and multi-provider support:

```typescript
interface LLMProvider {
  readonly name: string;
  readonly models: ModelCapabilities;

  // Core operations
  embed(input: EmbedInput): Promise<EmbedOutput>;
  complete(input: CompleteInput): Promise<CompleteOutput>;
  chat(input: ChatInput): Promise<ChatOutput>;

  // Lifecycle
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
}
```

### 2. Structured Outputs with Zod

All LLM responses can be validated and typed using Zod schemas:

```typescript
const AnalysisSchema = z.object({
  sentiment: z.enum(["positive", "negative", "neutral"]),
  confidence: z.number().min(0).max(1),
  keywords: z.array(z.string()),
});

const result = await llm.complete(prompt, {
  schema: AnalysisSchema,
  // Uses OpenAI's structured output or Anthropic's JSON mode
});

// result.data is fully typed as z.infer<typeof AnalysisSchema>
```

### 3. Centralized Configuration

Single configuration point for all LLM settings:

```typescript
const llm = createLLMCenter({
  defaultProvider: "openai",
  providers: {
    openai: {
      apiKey: env.OPENAI_API_KEY,
      defaultModel: "gpt-4o-mini",
      embeddingModel: "text-embedding-3-small",
    },
    anthropic: {
      apiKey: env.ANTHROPIC_API_KEY,
      defaultModel: "claude-3-5-sonnet-20241022",
    },
  },
  rateLimiting: {
    enabled: true,
    requestsPerMinute: 500,
  },
  tracking: {
    enabled: true,
    costTracking: true,
  },
});
```

---

## Implementation Steps

### Step 1: Create Package Structure

**Directory**: `packages/shared/src/llm/`

```
packages/shared/src/llm/
├── index.ts                    # Public exports
├── center.ts                   # LLMCenter main class
├── types.ts                    # Core type definitions
├── config.types.ts             # Routing config types
├── router.ts                   # Smart routing logic
├── errors.ts                   # Custom error classes
├── configs/
│   ├── index.ts               # Config loader (env-aware)
│   ├── development.ts         # Dev environment config
│   └── production.ts          # Production config
├── utils/
│   ├── rate-limiter.ts        # Rate limiting utility
│   ├── retry.ts               # Retry with backoff
│   ├── cost-calculator.ts     # Cost tracking
│   └── schema-parser.ts       # Zod schema utilities
└── providers/
    ├── base.ts                # Base provider class
    ├── openai.ts              # OpenAI implementation
    ├── anthropic.ts           # Anthropic implementation
    └── index.ts               # Provider exports
```

---

### Step 2: Define Core Types

**File**: `packages/shared/src/llm/types.ts`

```typescript
import { z } from "zod";

// ============================================
// Provider Configuration
// ============================================

export interface OpenAIConfig {
  apiKey: string;
  organization?: string;
  defaultModel?: string;
  embeddingModel?: string;
  baseURL?: string;
}

export interface AnthropicConfig {
  apiKey: string;
  defaultModel?: string;
  baseURL?: string;
}

export interface LLMCenterConfig {
  defaultProvider: "openai" | "anthropic";
  providers: {
    openai?: OpenAIConfig;
    anthropic?: AnthropicConfig;
  };
  rateLimiting?: {
    enabled: boolean;
    requestsPerMinute?: number;
    tokensPerMinute?: number;
  };
  tracking?: {
    enabled: boolean;
    costTracking?: boolean;
    onUsage?: (usage: UsageEvent) => void;
  };
  retry?: {
    maxAttempts?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
  };
}

// ============================================
// Embedding Types
// ============================================

export interface EmbedOptions {
  provider?: "openai" | "anthropic";
  model?: string;
  batchSize?: number;
  dimensions?: number;
}

export interface EmbedResult {
  embeddings: number[][];
  model: string;
  usage: {
    totalTokens: number;
    estimatedCost: number;
  };
}

// ============================================
// Completion Types
// ============================================

export interface CompleteOptions<T extends z.ZodType = z.ZodType> {
  provider?: "openai" | "anthropic";
  model?: string;
  schema?: T;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

export interface CompleteResult<T = unknown> {
  data: T;
  raw: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedCost: number;
  };
  finishReason: "stop" | "length" | "content_filter";
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
  provider?: "openai" | "anthropic";
  model?: string;
  schema?: T;
  temperature?: number;
  maxTokens?: number;
}

export interface ChatResult<T = unknown> {
  data: T;
  message: Message;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedCost: number;
  };
  finishReason: "stop" | "length" | "content_filter";
}

// ============================================
// Usage Tracking
// ============================================

export interface UsageEvent {
  timestamp: Date;
  provider: string;
  model: string;
  operation: "embed" | "complete" | "chat";
  tokens: {
    prompt?: number;
    completion?: number;
    total: number;
  };
  cost: number;
  latencyMs: number;
}

export interface UsageStats {
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
  byProvider: Record<string, {
    requests: number;
    tokens: number;
    cost: number;
  }>;
  byOperation: Record<string, {
    requests: number;
    tokens: number;
    cost: number;
  }>;
}

// ============================================
// Provider Interface
// ============================================

export interface LLMProvider {
  readonly name: string;

  embed(texts: string[], options?: EmbedOptions): Promise<EmbedResult>;
  complete<T>(prompt: string, options?: CompleteOptions<z.ZodType<T>>): Promise<CompleteResult<T>>;
  chat<T>(messages: Message[], options?: ChatOptions<z.ZodType<T>>): Promise<ChatResult<T>>;

  initialize(): Promise<void>;
  shutdown(): Promise<void>;
}
```

---

### Step 3: Create Base Provider

**File**: `packages/shared/src/llm/providers/base.ts`

```typescript
import type { z } from "zod";
import type {
  LLMProvider,
  EmbedOptions,
  EmbedResult,
  CompleteOptions,
  CompleteResult,
  ChatOptions,
  ChatResult,
  Message,
} from "../types";

/**
 * Base class for LLM providers with common functionality.
 */
export abstract class BaseLLMProvider implements LLMProvider {
  abstract readonly name: string;

  abstract embed(texts: string[], options?: EmbedOptions): Promise<EmbedResult>;

  abstract complete<T>(
    prompt: string,
    options?: CompleteOptions<z.ZodType<T>>
  ): Promise<CompleteResult<T>>;

  abstract chat<T>(
    messages: Message[],
    options?: ChatOptions<z.ZodType<T>>
  ): Promise<ChatResult<T>>;

  async initialize(): Promise<void> {
    // Default: no-op, override if needed
  }

  async shutdown(): Promise<void> {
    // Default: no-op, override if needed
  }

  /**
   * Parse and validate response against Zod schema.
   */
  protected parseWithSchema<T>(
    response: string,
    schema: z.ZodType<T>
  ): T {
    // Try to parse as JSON first
    let parsed: unknown;
    try {
      parsed = JSON.parse(response);
    } catch {
      // If not valid JSON, try to extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Response is not valid JSON");
      }
    }

    // Validate against schema
    const result = schema.safeParse(parsed);
    if (!result.success) {
      throw new Error(
        `Schema validation failed: ${result.error.flatten().formErrors.join(", ")}`
      );
    }

    return result.data;
  }
}
```

---

### Step 4: Implement OpenAI Provider

**File**: `packages/shared/src/llm/providers/openai.ts`

```typescript
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
} from "../types";

// ============================================
// Constants
// ============================================

const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
const DEFAULT_CHAT_MODEL = "gpt-4o-mini";
const EMBEDDING_DIMENSIONS = 1536;

// Cost per 1M tokens (as of Dec 2024)
const COSTS: Record<string, { input: number; output: number }> = {
  "text-embedding-3-small": { input: 0.02, output: 0 },
  "text-embedding-3-large": { input: 0.13, output: 0 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4-turbo": { input: 10, output: 30 },
};

// ============================================
// OpenAI Provider
// ============================================

export class OpenAIProvider extends BaseLLMProvider {
  readonly name = "openai";
  private client: OpenAI;
  private config: OpenAIConfig;

  constructor(config: OpenAIConfig) {
    super();
    this.config = config;
    this.client = new OpenAI({
      apiKey: config.apiKey,
      organization: config.organization,
      baseURL: config.baseURL,
    });
  }

  /**
   * Generate embeddings for texts.
   */
  async embed(texts: string[], options?: EmbedOptions): Promise<EmbedResult> {
    const model = options?.model ?? this.config.embeddingModel ?? DEFAULT_EMBEDDING_MODEL;

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
      usage: {
        totalTokens,
        estimatedCost: cost,
      },
    };
  }

  /**
   * Generate completion with optional structured output.
   */
  async complete<T>(
    prompt: string,
    options?: CompleteOptions<z.ZodType<T>>
  ): Promise<CompleteResult<T>> {
    const model = options?.model ?? this.config.defaultModel ?? DEFAULT_CHAT_MODEL;
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

    if (options?.systemPrompt) {
      messages.push({ role: "system", content: options.systemPrompt });
    }
    messages.push({ role: "user", content: prompt });

    // Use structured output if schema provided
    if (options?.schema) {
      const response = await this.client.beta.chat.completions.parse({
        model,
        messages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens,
        response_format: zodResponseFormat(options.schema, "response"),
      });

      const message = response.choices[0]!;
      const parsed = message.message.parsed as T;

      return {
        data: parsed,
        raw: message.message.content ?? "",
        model,
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
        finishReason: this.mapFinishReason(message.finish_reason),
      };
    }

    // Regular completion without schema
    const response = await this.client.chat.completions.create({
      model,
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens,
    });

    const message = response.choices[0]!;
    const content = message.message.content ?? "";

    return {
      data: content as T,
      raw: content,
      model,
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
      finishReason: this.mapFinishReason(message.finish_reason),
    };
  }

  /**
   * Chat with optional structured output.
   */
  async chat<T>(
    messages: Message[],
    options?: ChatOptions<z.ZodType<T>>
  ): Promise<ChatResult<T>> {
    const model = options?.model ?? this.config.defaultModel ?? DEFAULT_CHAT_MODEL;
    const openaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // Use structured output if schema provided
    if (options?.schema) {
      const response = await this.client.beta.chat.completions.parse({
        model,
        messages: openaiMessages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens,
        response_format: zodResponseFormat(options.schema, "response"),
      });

      const choice = response.choices[0]!;
      const parsed = choice.message.parsed as T;

      return {
        data: parsed,
        message: {
          role: "assistant",
          content: choice.message.content ?? "",
        },
        model,
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
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens,
    });

    const choice = response.choices[0]!;
    const content = choice.message.content ?? "";

    return {
      data: content as T,
      message: {
        role: "assistant",
        content,
      },
      model,
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

  /**
   * Calculate cost based on model and token usage.
   */
  private calculateCost(model: string, inputTokens: number, outputTokens: number): number {
    const pricing = COSTS[model] ?? { input: 0, output: 0 };
    return (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;
  }

  /**
   * Map OpenAI finish reason to standard format.
   */
  private mapFinishReason(
    reason: string | null
  ): "stop" | "length" | "content_filter" {
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
}
```

---

### Step 5: Implement Anthropic Provider

**File**: `packages/shared/src/llm/providers/anthropic.ts`

```typescript
import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
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
} from "../types";

// ============================================
// Constants
// ============================================

const DEFAULT_MODEL = "claude-3-5-sonnet-20241022";

// Cost per 1M tokens (as of Dec 2024)
const COSTS: Record<string, { input: number; output: number }> = {
  "claude-3-5-sonnet-20241022": { input: 3, output: 15 },
  "claude-3-5-haiku-20241022": { input: 0.8, output: 4 },
  "claude-3-opus-20240229": { input: 15, output: 75 },
};

// ============================================
// Anthropic Provider
// ============================================

export class AnthropicProvider extends BaseLLMProvider {
  readonly name = "anthropic";
  private client: Anthropic;
  private config: AnthropicConfig;

  constructor(config: AnthropicConfig) {
    super();
    this.config = config;
    this.client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    });
  }

  /**
   * Anthropic doesn't have embeddings API - throw error.
   */
  async embed(_texts: string[], _options?: EmbedOptions): Promise<EmbedResult> {
    throw new Error("Anthropic does not support embeddings. Use OpenAI provider for embeddings.");
  }

  /**
   * Generate completion with optional structured output.
   */
  async complete<T>(
    prompt: string,
    options?: CompleteOptions<z.ZodType<T>>
  ): Promise<CompleteResult<T>> {
    const model = options?.model ?? this.config.defaultModel ?? DEFAULT_MODEL;

    // Build messages with optional system prompt
    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: prompt },
    ];

    // For structured output, add JSON instruction to system prompt
    let systemPrompt = options?.systemPrompt ?? "";
    if (options?.schema) {
      const schemaDescription = JSON.stringify(options.schema._def, null, 2);
      systemPrompt += `\n\nYou must respond with valid JSON matching this schema:\n${schemaDescription}\n\nRespond ONLY with the JSON object, no other text.`;
    }

    const response = await this.client.messages.create({
      model,
      max_tokens: options?.maxTokens ?? 4096,
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

    // For structured output, add JSON instruction
    if (options?.schema) {
      const schemaDescription = JSON.stringify(options.schema._def, null, 2);
      systemPrompt += `\n\nYou must respond with valid JSON matching this schema:\n${schemaDescription}\n\nRespond ONLY with the JSON object, no other text.`;
    }

    const response = await this.client.messages.create({
      model,
      max_tokens: options?.maxTokens ?? 4096,
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
  }

  /**
   * Calculate cost based on model and token usage.
   */
  private calculateCost(model: string, inputTokens: number, outputTokens: number): number {
    const pricing = COSTS[model] ?? { input: 0, output: 0 };
    return (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;
  }

  /**
   * Map Anthropic stop reason to standard format.
   */
  private mapFinishReason(
    reason: string | null
  ): "stop" | "length" | "content_filter" {
    switch (reason) {
      case "end_turn":
        return "stop";
      case "max_tokens":
        return "length";
      default:
        return "stop";
    }
  }
}
```

---

### Step 6: Create LLM Center

**File**: `packages/shared/src/llm/center.ts`

```typescript
import type { z } from "zod";
import type {
  LLMCenterConfig,
  LLMProvider,
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
import { OpenAIProvider } from "./providers/openai";
import { AnthropicProvider } from "./providers/anthropic";
import { RateLimiter } from "./utils/rate-limiter";
import { withRetry } from "./utils/retry";

/**
 * LLM Center - Centralized LLM Processing Service
 *
 * Single entry point for all LLM operations with:
 * - Multi-provider support (OpenAI, Anthropic)
 * - Structured outputs with Zod validation
 * - Centralized cost tracking
 * - Built-in rate limiting and retry
 */
export class LLMCenter {
  private providers: Map<string, LLMProvider> = new Map();
  private defaultProvider: string;
  private config: LLMCenterConfig;
  private rateLimiter?: RateLimiter;
  private usageEvents: UsageEvent[] = [];

  constructor(config: LLMCenterConfig) {
    this.config = config;
    this.defaultProvider = config.defaultProvider;

    // Initialize providers
    if (config.providers.openai) {
      this.providers.set("openai", new OpenAIProvider(config.providers.openai));
    }
    if (config.providers.anthropic) {
      this.providers.set("anthropic", new AnthropicProvider(config.providers.anthropic));
    }

    // Initialize rate limiter
    if (config.rateLimiting?.enabled) {
      this.rateLimiter = new RateLimiter({
        requestsPerMinute: config.rateLimiting.requestsPerMinute ?? 500,
        tokensPerMinute: config.rateLimiting.tokensPerMinute,
      });
    }
  }

  /**
   * Get a provider by name.
   */
  private getProvider(name?: string): LLMProvider {
    const providerName = name ?? this.defaultProvider;
    const provider = this.providers.get(providerName);

    if (!provider) {
      throw new Error(`Provider "${providerName}" not configured`);
    }

    return provider;
  }

  /**
   * Track usage event.
   */
  private trackUsage(event: Omit<UsageEvent, "timestamp">): void {
    if (!this.config.tracking?.enabled) return;

    const usageEvent: UsageEvent = {
      ...event,
      timestamp: new Date(),
    };

    this.usageEvents.push(usageEvent);
    this.config.tracking.onUsage?.(usageEvent);
  }

  /**
   * Generate embeddings for texts.
   */
  async embed(texts: string[], options?: EmbedOptions): Promise<EmbedResult> {
    // For embeddings, always use OpenAI (Anthropic doesn't support it)
    const provider = this.getProvider(options?.provider ?? "openai");
    const startTime = Date.now();

    // Apply rate limiting
    await this.rateLimiter?.acquire();

    // Execute with retry
    const result = await withRetry(
      () => provider.embed(texts, options),
      this.config.retry
    );

    // Track usage
    this.trackUsage({
      provider: provider.name,
      model: result.model,
      operation: "embed",
      tokens: { total: result.usage.totalTokens },
      cost: result.usage.estimatedCost,
      latencyMs: Date.now() - startTime,
    });

    return result;
  }

  /**
   * Generate completion with optional structured output.
   */
  async complete<T>(
    prompt: string,
    options?: CompleteOptions<z.ZodType<T>>
  ): Promise<CompleteResult<T>> {
    const provider = this.getProvider(options?.provider);
    const startTime = Date.now();

    await this.rateLimiter?.acquire();

    const result = await withRetry(
      () => provider.complete<T>(prompt, options),
      this.config.retry
    );

    this.trackUsage({
      provider: provider.name,
      model: result.model,
      operation: "complete",
      tokens: {
        prompt: result.usage.promptTokens,
        completion: result.usage.completionTokens,
        total: result.usage.totalTokens,
      },
      cost: result.usage.estimatedCost,
      latencyMs: Date.now() - startTime,
    });

    return result;
  }

  /**
   * Chat with optional structured output.
   */
  async chat<T>(
    messages: Message[],
    options?: ChatOptions<z.ZodType<T>>
  ): Promise<ChatResult<T>> {
    const provider = this.getProvider(options?.provider);
    const startTime = Date.now();

    await this.rateLimiter?.acquire();

    const result = await withRetry(
      () => provider.chat<T>(messages, options),
      this.config.retry
    );

    this.trackUsage({
      provider: provider.name,
      model: result.model,
      operation: "chat",
      tokens: {
        prompt: result.usage.promptTokens,
        completion: result.usage.completionTokens,
        total: result.usage.totalTokens,
      },
      cost: result.usage.estimatedCost,
      latencyMs: Date.now() - startTime,
    });

    return result;
  }

  /**
   * Get aggregated usage statistics.
   */
  getUsage(): UsageStats {
    const stats: UsageStats = {
      totalRequests: this.usageEvents.length,
      totalTokens: 0,
      totalCost: 0,
      byProvider: {},
      byOperation: {},
    };

    for (const event of this.usageEvents) {
      stats.totalTokens += event.tokens.total;
      stats.totalCost += event.cost;

      // By provider
      if (!stats.byProvider[event.provider]) {
        stats.byProvider[event.provider] = { requests: 0, tokens: 0, cost: 0 };
      }
      stats.byProvider[event.provider].requests++;
      stats.byProvider[event.provider].tokens += event.tokens.total;
      stats.byProvider[event.provider].cost += event.cost;

      // By operation
      if (!stats.byOperation[event.operation]) {
        stats.byOperation[event.operation] = { requests: 0, tokens: 0, cost: 0 };
      }
      stats.byOperation[event.operation].requests++;
      stats.byOperation[event.operation].tokens += event.tokens.total;
      stats.byOperation[event.operation].cost += event.cost;
    }

    return stats;
  }

  /**
   * Clear usage history.
   */
  clearUsage(): void {
    this.usageEvents = [];
  }

  /**
   * Shutdown all providers.
   */
  async shutdown(): Promise<void> {
    for (const provider of this.providers.values()) {
      await provider.shutdown();
    }
  }
}

/**
 * Create LLM Center instance.
 */
export function createLLMCenter(config: LLMCenterConfig): LLMCenter {
  return new LLMCenter(config);
}
```

---

### Step 7: Create Utility Functions

**File**: `packages/shared/src/llm/utils/rate-limiter.ts`

```typescript
interface RateLimiterConfig {
  requestsPerMinute: number;
  tokensPerMinute?: number;
}

/**
 * Simple token bucket rate limiter.
 */
export class RateLimiter {
  private tokens: number;
  private maxTokens: number;
  private refillRate: number; // tokens per ms
  private lastRefill: number;

  constructor(config: RateLimiterConfig) {
    this.maxTokens = config.requestsPerMinute;
    this.tokens = this.maxTokens;
    this.refillRate = config.requestsPerMinute / 60_000; // per ms
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    this.refill();

    if (this.tokens < 1) {
      // Wait until we have a token
      const waitTime = (1 - this.tokens) / this.refillRate;
      await this.sleep(waitTime);
      this.refill();
    }

    this.tokens--;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
```

**File**: `packages/shared/src/llm/utils/retry.ts`

```typescript
interface RetryConfig {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

const DEFAULT_RETRY_CONFIG: Required<RetryConfig> = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 60000,
};

/**
 * Execute function with exponential backoff retry.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config?: RetryConfig
): Promise<T> {
  const { maxAttempts, baseDelayMs, maxDelayMs } = {
    ...DEFAULT_RETRY_CONFIG,
    ...config,
  };

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if error is retryable
      if (!isRetryableError(error)) {
        throw lastError;
      }

      // Don't wait after last attempt
      if (attempt === maxAttempts) {
        break;
      }

      // Calculate delay with exponential backoff and jitter
      const delay = Math.min(
        baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 1000,
        maxDelayMs
      );

      console.log(
        `[LLMCenter] Attempt ${attempt}/${maxAttempts} failed, retrying in ${Math.round(delay)}ms...`
      );

      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Check if error is retryable.
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    // Retry on rate limit, timeout, or network errors
    return (
      message.includes("rate limit") ||
      message.includes("timeout") ||
      message.includes("econnreset") ||
      message.includes("econnrefused") ||
      message.includes("503") ||
      message.includes("529")
    );
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

---

### Step 8: Create Public Exports

**File**: `packages/shared/src/llm/index.ts`

```typescript
// Core
export { LLMCenter, createLLMCenter } from "./center";

// Types
export type {
  LLMCenterConfig,
  OpenAIConfig,
  AnthropicConfig,
  LLMProvider,
  EmbedOptions,
  EmbedResult,
  CompleteOptions,
  CompleteResult,
  ChatOptions,
  ChatResult,
  Message,
  MessageRole,
  UsageEvent,
  UsageStats,
} from "./types";

// Providers (for direct use if needed)
export { OpenAIProvider } from "./providers/openai";
export { AnthropicProvider } from "./providers/anthropic";

// Utilities
export { RateLimiter } from "./utils/rate-limiter";
export { withRetry } from "./utils/retry";
```

**File**: `packages/shared/src/index.ts` (add to existing)

```typescript
// ... existing exports ...

// LLM Center
export * from "./llm";
```

---

## Usage Examples

### Basic Embedding Generation

```typescript
import { createLLMCenter } from "@ducsigr/shared";

const llm = createLLMCenter({
  defaultProvider: "openai",
  providers: {
    openai: { apiKey: process.env.OPENAI_API_KEY! },
  },
});

const result = await llm.embed(["Hello world", "How are you?"]);
console.log(result.embeddings); // [[0.1, 0.2, ...], [0.3, 0.4, ...]]
console.log(result.usage); // { totalTokens: 10, estimatedCost: 0.0000002 }
```

### Structured Output with Zod

```typescript
import { z } from "zod";
import { createLLMCenter } from "@ducsigr/shared";

const llm = createLLMCenter({
  defaultProvider: "openai",
  providers: {
    openai: { apiKey: process.env.OPENAI_API_KEY! },
  },
});

const SentimentSchema = z.object({
  sentiment: z.enum(["positive", "negative", "neutral"]),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});

const result = await llm.complete(
  "Analyze the sentiment: 'I love this product!'",
  { schema: SentimentSchema }
);

// result.data is typed as { sentiment: "positive" | "negative" | "neutral", confidence: number, reasoning: string }
console.log(result.data.sentiment); // "positive"
console.log(result.data.confidence); // 0.95
```

### Multi-Provider Chat

```typescript
import { createLLMCenter } from "@ducsigr/shared";

const llm = createLLMCenter({
  defaultProvider: "openai",
  providers: {
    openai: { apiKey: process.env.OPENAI_API_KEY! },
    anthropic: { apiKey: process.env.ANTHROPIC_API_KEY! },
  },
});

// Use OpenAI (default)
const openaiResult = await llm.chat([
  { role: "user", content: "Hello!" }
]);

// Use Anthropic explicitly
const anthropicResult = await llm.chat(
  [{ role: "user", content: "Hello!" }],
  { provider: "anthropic" }
);
```

---

## Files to Create

| File | Description |
|------|-------------|
| `packages/shared/src/llm/index.ts` | Public exports |
| `packages/shared/src/llm/center.ts` | LLMCenter main class |
| `packages/shared/src/llm/types.ts` | Type definitions |
| `packages/shared/src/llm/config.types.ts` | Routing config types |
| `packages/shared/src/llm/router.ts` | Smart routing with fallback logic |
| `packages/shared/src/llm/errors.ts` | Custom error classes |
| `packages/shared/src/llm/configs/index.ts` | Config loader (env-aware) |
| `packages/shared/src/llm/configs/development.ts` | Dev environment config |
| `packages/shared/src/llm/configs/production.ts` | Production config |
| `packages/shared/src/llm/providers/base.ts` | Base provider class |
| `packages/shared/src/llm/providers/openai.ts` | OpenAI implementation |
| `packages/shared/src/llm/providers/anthropic.ts` | Anthropic implementation |
| `packages/shared/src/llm/providers/index.ts` | Provider exports |
| `packages/shared/src/llm/utils/rate-limiter.ts` | Rate limiting utility |
| `packages/shared/src/llm/utils/retry.ts` | Retry with backoff |

---

## Dependencies to Add

**File**: `packages/shared/package.json`

```json
{
  "dependencies": {
    "openai": "^4.76.0",
    "@anthropic-ai/sdk": "^0.32.0",
    "zod": "^3.23.0"
  }
}
```

---

## Testing Plan

### Unit Tests

1. **Provider tests**: Each provider's embed/complete/chat methods
2. **Rate limiter tests**: Token bucket behavior
3. **Retry tests**: Exponential backoff, retryable error detection
4. **Schema validation tests**: Zod parsing and validation

### Integration Tests

1. **Real API calls**: Test with actual OpenAI/Anthropic APIs
2. **Structured output**: Verify schema validation works
3. **Cost tracking**: Verify usage metrics are accurate

---

## Acceptance Criteria

- [ ] LLMCenter created in `packages/shared/src/llm/`
- [ ] OpenAI provider implements embed, complete, chat
- [ ] Anthropic provider implements complete, chat
- [ ] Structured outputs work with Zod schemas
- [ ] Cost tracking accumulates usage stats
- [ ] Rate limiting prevents API abuse
- [ ] Retry logic handles transient failures
- [ ] All methods are fully typed
- [ ] Exported from `@ducsigr/shared`
