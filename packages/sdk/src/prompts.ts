/**
 * Prompt Client for SDK
 *
 * Provides runtime prompt retrieval with caching, ETag support,
 * and template compilation.
 *
 * @example
 * ```typescript
 * // Get prompt with caching
 * const prompt = await CognObserve.prompts.get("movie-critic", {
 *   label: "production",
 * });
 *
 * // Compile with variables
 * const compiled = prompt.compile({
 *   movie: "Dune 2",
 *   criticLevel: "expert",
 * });
 *
 * // Use with LLM
 * const response = await openai.chat.completions.create({
 *   model: prompt.config?.model || "gpt-4",
 *   messages: compiled.messages,
 * });
 * ```
 */

import type { ResolvedConfig } from "./types";

// ============================================================
// Types
// ============================================================

/**
 * Label names for version targeting
 */
export type PromptLabelName = "production" | "staging" | "latest";

/**
 * Prompt template type
 */
export type PromptType = "text" | "chat";

/**
 * Chat message
 */
export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
}

/**
 * Text template content
 */
export interface TextContent {
  type: "text";
  text: string;
}

/**
 * Chat template content
 */
export interface ChatContent {
  type: "chat";
  messages: ChatMessage[];
}

/**
 * Prompt template (discriminated union)
 */
export type PromptTemplate = TextContent | ChatContent;

/**
 * Variable definition
 */
export interface PromptVariable {
  name: string;
  required: boolean;
  default?: string;
  description?: string;
}

/**
 * Model configuration
 */
export interface PromptConfig {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stop?: string[];
  [key: string]: unknown;
}

// ============================================================
// Experiment Types
// ============================================================

/**
 * Variant name
 */
export type VariantName = "A" | "B";

/**
 * Experiment status
 */
export type ExperimentStatus = "draft" | "running" | "paused" | "completed" | "archived";

/**
 * Options for resolving an experiment
 */
export interface GetExperimentOptions {
  /** Assignment key for deterministic bucketing (userId, sessionId, etc.) */
  assignmentKey: string;
  /** Force a specific variant for testing */
  forceVariant?: VariantName;
  /** Use cached version if available (default: true) */
  cache?: boolean;
  /** Cache TTL in seconds (default: 60) - cache key includes assignmentKey */
  cacheTTL?: number;
}

/**
 * Experiment metadata
 */
export interface ExperimentInfo {
  id: string;
  slug: string;
  name: string;
  status: ExperimentStatus;
}

/**
 * Assigned variant info
 */
export interface VariantInfo {
  id: string;
  name: VariantName;
  isControl: boolean;
}

/**
 * Trace metadata for spans (attach to LLM calls)
 */
export interface ExperimentTraceMetadata {
  promptExperimentId: string;
  promptExperimentSlug: string;
  promptVariantId: string;
  promptVariantName: string;
  assignmentKeyHash: string;
}

/**
 * Experiment assignment result
 */
export interface ExperimentAssignment {
  /** Experiment metadata */
  experiment: ExperimentInfo;
  /** Assigned variant */
  variant: VariantInfo;
  /** Whether user is in experiment allocation (vs fallback) */
  inAllocation: boolean;
  /** Prompt with compile method */
  prompt: Prompt;
  /** Trace metadata to attach to spans */
  traceMetadata: ExperimentTraceMetadata;
}

/**
 * Raw experiment resolve response from API
 */
interface ExperimentResolveResponse {
  experiment: ExperimentInfo;
  variant: VariantInfo;
  inAllocation: boolean;
  prompt: PromptResponse;
  traceMetadata: ExperimentTraceMetadata;
}

/**
 * Options for fetching a prompt
 */
export interface GetPromptOptions {
  /** Label to fetch (production, staging, latest) */
  label?: PromptLabelName;
  /** Specific version number to fetch */
  version?: number;
  /** Filter by type */
  type?: PromptType;
  /** Use cached version if available (default: true) */
  cache?: boolean;
  /** Cache TTL in seconds (default: 60) */
  cacheTTL?: number;
}

/**
 * Raw prompt response from API
 */
export interface PromptResponse {
  id: string;
  promptId: string;
  name: string;
  slug: string;
  version: number;
  type: PromptType;
  content: PromptTemplate;
  variables: PromptVariable[] | null;
  config: PromptConfig | null;
  checksum: string;
  label: PromptLabelName | null;
}

/**
 * Compiled text prompt
 */
export interface CompiledTextPrompt {
  type: "text";
  text: string;
}

/**
 * Compiled chat prompt
 */
export interface CompiledChatPrompt {
  type: "chat";
  messages: ChatMessage[];
}

/**
 * Compiled prompt (result of template compilation)
 */
export type CompiledPrompt = CompiledTextPrompt | CompiledChatPrompt;

/**
 * Prompt object with compile method
 */
export interface Prompt extends PromptResponse {
  /**
   * Compile the template with variables
   *
   * @param variables - Variable values to substitute
   * @param options - Compilation options
   * @returns Compiled prompt ready for LLM
   *
   * @example
   * ```typescript
   * const compiled = prompt.compile({
   *   movie: "Dune 2",
   *   rating: "5 stars",
   * });
   * ```
   */
  compile(
    variables: Record<string, string>,
    options?: { strict?: boolean }
  ): CompiledPrompt;
}

// ============================================================
// Cache Entry
// ============================================================

interface CacheEntry {
  data: PromptResponse;
  expiresAt: number;
  etag: string;
}

interface ExperimentCacheEntry {
  data: ExperimentResolveResponse;
  expiresAt: number;
}

// ============================================================
// Prompt Client
// ============================================================

/**
 * Prompt client for fetching and compiling prompts
 */
export class PromptClient {
  private config: ResolvedConfig;
  private cache: Map<string, CacheEntry> = new Map();
  private experimentCache: Map<string, ExperimentCacheEntry> = new Map();
  private defaultCacheTTL = 60; // 60 seconds

  constructor(config: ResolvedConfig) {
    this.config = config;
  }

  /**
   * Build cache key from slug and options
   */
  private buildCacheKey(slug: string, options: GetPromptOptions): string {
    const parts = [slug];
    if (options.label) parts.push(`label:${options.label}`);
    if (options.version !== undefined) parts.push(`version:${options.version}`);
    if (options.type) parts.push(`type:${options.type}`);
    return parts.join(":");
  }

  /**
   * Check if cache entry is expired
   */
  private isExpired(entry: CacheEntry): boolean {
    return Date.now() > entry.expiresAt;
  }

  /**
   * Wrap raw response with compile method
   */
  private wrapPrompt(data: PromptResponse): Prompt {
    return {
      ...data,
      compile: (
        variables: Record<string, string>,
        options?: { strict?: boolean }
      ) => this.compileTemplate(data.content, variables, options),
    };
  }

  /**
   * Compile template by replacing {{variable}} placeholders
   */
  private compileTemplate(
    template: PromptTemplate,
    variables: Record<string, string>,
    options?: { strict?: boolean }
  ): CompiledPrompt {
    const replacePlaceholders = (text: string): string => {
      return text.replace(
        /\{\{(\w+)\}\}/g,
        (match: string, varName: string): string => {
          const value = variables[varName];
          if (value !== undefined) {
            return value;
          }
          if (options?.strict) {
            throw new Error(`Missing required variable: ${varName}`);
          }
          return match; // Leave placeholder if not strict
        }
      );
    };

    if (template.type === "text") {
      return {
        type: "text",
        text: replacePlaceholders(template.text),
      };
    }

    return {
      type: "chat",
      messages: template.messages.map((m) => ({
        ...m,
        content: replacePlaceholders(m.content),
      })),
    };
  }

  /**
   * Fetch a prompt by slug
   *
   * @param slug - Prompt slug (unique identifier)
   * @param options - Fetch options (label, version, cache settings)
   * @returns Prompt object with compile method
   *
   * @example
   * ```typescript
   * const prompt = await client.get("movie-critic", {
   *   label: "production",
   * });
   *
   * const compiled = prompt.compile({ movie: "Dune 2" });
   * ```
   */
  async get(slug: string, options: GetPromptOptions = {}): Promise<Prompt> {
    if (this.config.disabled) {
      throw new Error("[CognObserve] SDK is disabled");
    }

    const cacheKey = this.buildCacheKey(slug, options);
    const useCache = options.cache !== false;
    const cacheTTL = options.cacheTTL ?? this.defaultCacheTTL;

    // Check cache first
    if (useCache) {
      const cached = this.cache.get(cacheKey);
      if (cached && !this.isExpired(cached)) {
        if (this.config.debug) {
          console.log(`[CognObserve] Prompt cache hit: ${slug}`);
        }
        return this.wrapPrompt(cached.data);
      }
    }

    // Build query params
    const params = new URLSearchParams();
    if (options.label) params.set("label", options.label);
    if (options.version !== undefined)
      params.set("version", options.version.toString());
    if (options.type) params.set("type", options.type);

    const queryString = params.toString();
    const url = `${this.config.endpoint}/v1/prompts/${encodeURIComponent(slug)}${queryString ? `?${queryString}` : ""}`;

    // Get cached ETag for conditional request
    const cachedEntry = this.cache.get(cacheKey);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.config.apiKey}`,
    };

    if (cachedEntry) {
      headers["If-None-Match"] = `"${cachedEntry.etag}"`;
    }

    if (this.config.debug) {
      console.log(`[CognObserve] Fetching prompt: ${slug}`);
    }

    // Fetch from API
    const response = await fetch(url, { headers });

    // Handle 304 Not Modified
    if (response.status === 304 && cachedEntry) {
      // Update cache expiry and return cached data
      cachedEntry.expiresAt = Date.now() + cacheTTL * 1000;
      if (this.config.debug) {
        console.log(`[CognObserve] Prompt not modified (304): ${slug}`);
      }
      return this.wrapPrompt(cachedEntry.data);
    }

    // Handle errors
    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage: string;

      try {
        const parsed: unknown = JSON.parse(errorText);
        // Safely extract error message from parsed JSON
        if (typeof parsed === "object" && parsed !== null) {
          const obj = parsed as Record<string, unknown>;
          if (typeof obj.message === "string") {
            errorMessage = obj.message;
          } else if (typeof obj.error === "string") {
            errorMessage = obj.error;
          } else {
            errorMessage = errorText;
          }
        } else {
          errorMessage = errorText;
        }
      } catch {
        errorMessage = errorText;
      }

      if (response.status === 404) {
        throw new Error(`Prompt not found: ${slug}`);
      }
      if (response.status === 401) {
        throw new Error(`Unauthorized: Invalid API key`);
      }

      throw new Error(`Failed to fetch prompt: ${errorMessage}`);
    }

    // Parse response
    const data = (await response.json()) as PromptResponse;

    // Store in cache
    if (useCache) {
      this.cache.set(cacheKey, {
        data,
        expiresAt: Date.now() + cacheTTL * 1000,
        etag: data.checksum,
      });
    }

    if (this.config.debug) {
      console.log(
        `[CognObserve] Fetched prompt: ${slug} (v${data.version}, ${data.type})`
      );
    }

    return this.wrapPrompt(data);
  }

  /**
   * Resolve an A/B experiment and get the assigned variant's prompt
   *
   * @param slug - Experiment slug
   * @param options - Options including assignmentKey for bucketing
   * @returns Experiment assignment with prompt and trace metadata
   *
   * @example
   * ```typescript
   * const assignment = await client.getExperiment("checkout-copy", {
   *   assignmentKey: userId,
   * });
   *
   * // Use the assigned prompt
   * const compiled = assignment.prompt.compile({ plan: "pro" });
   *
   * // Attach trace metadata to span
   * span.setAttributes(assignment.traceMetadata);
   *
   * // Check which variant was assigned
   * if (assignment.variant.name === "B") {
   *   console.log("User is in treatment group");
   * }
   * ```
   */
  async getExperiment(
    slug: string,
    options: GetExperimentOptions
  ): Promise<ExperimentAssignment> {
    if (this.config.disabled) {
      throw new Error("[CognObserve] SDK is disabled");
    }

    const { assignmentKey, forceVariant, cache: useCache = true, cacheTTL = this.defaultCacheTTL } = options;

    // Build cache key (includes assignmentKey for sticky assignment)
    const cacheKey = `exp:${slug}:${assignmentKey}${forceVariant ? `:force:${forceVariant}` : ""}`;

    // Check cache first
    if (useCache) {
      const cached = this.experimentCache.get(cacheKey);
      if (cached && Date.now() < cached.expiresAt) {
        if (this.config.debug) {
          console.log(`[CognObserve] Experiment cache hit: ${slug}`);
        }
        return this.wrapExperimentAssignment(cached.data);
      }
    }

    // Build query params
    const params = new URLSearchParams();
    params.set("assignmentKey", assignmentKey);
    if (forceVariant) params.set("forceVariant", forceVariant);

    const url = `${this.config.endpoint}/v1/prompt-experiments/${encodeURIComponent(slug)}/resolve?${params.toString()}`;

    if (this.config.debug) {
      console.log(`[CognObserve] Resolving experiment: ${slug}`);
    }

    // Fetch from API
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
      },
    });

    // Handle errors
    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage: string;

      try {
        const parsed: unknown = JSON.parse(errorText);
        if (typeof parsed === "object" && parsed !== null) {
          const obj = parsed as Record<string, unknown>;
          if (typeof obj.message === "string") {
            errorMessage = obj.message;
          } else if (typeof obj.error === "string") {
            errorMessage = obj.error;
          } else {
            errorMessage = errorText;
          }
        } else {
          errorMessage = errorText;
        }
      } catch {
        errorMessage = errorText;
      }

      if (response.status === 404) {
        throw new Error(`Experiment not found or not running: ${slug}`);
      }
      if (response.status === 401) {
        throw new Error(`Unauthorized: Invalid API key`);
      }

      throw new Error(`Failed to resolve experiment: ${errorMessage}`);
    }

    // Parse response
    const data = (await response.json()) as ExperimentResolveResponse;

    // Store in cache
    if (useCache) {
      this.experimentCache.set(cacheKey, {
        data,
        expiresAt: Date.now() + cacheTTL * 1000,
      });
    }

    if (this.config.debug) {
      console.log(
        `[CognObserve] Experiment resolved: ${slug} → variant ${data.variant.name} (${data.inAllocation ? "in allocation" : "fallback"})`
      );
    }

    return this.wrapExperimentAssignment(data);
  }

  /**
   * Wrap experiment response with prompt compile method
   */
  private wrapExperimentAssignment(data: ExperimentResolveResponse): ExperimentAssignment {
    return {
      experiment: data.experiment,
      variant: data.variant,
      inAllocation: data.inAllocation,
      prompt: this.wrapPrompt(data.prompt),
      traceMetadata: data.traceMetadata,
    };
  }

  /**
   * Prefetch multiple prompts into cache
   *
   * @param slugs - Array of prompt slugs to prefetch
   * @param options - Fetch options applied to all prompts
   *
   * @example
   * ```typescript
   * // Prefetch during app startup
   * await client.prefetch(["greeting", "farewell", "error-message"], {
   *   label: "production",
   * });
   * ```
   */
  async prefetch(slugs: string[], options: GetPromptOptions = {}): Promise<void> {
    if (this.config.disabled) return;

    if (this.config.debug) {
      console.log(`[CognObserve] Prefetching ${slugs.length} prompt(s)`);
    }

    await Promise.allSettled(
      slugs.map((slug) => this.get(slug, { ...options, cache: true }))
    );
  }

  /**
   * Clear cache for a specific prompt/experiment or all entries
   *
   * @param slug - Optional slug to clear; if omitted, clears entire cache
   */
  clearCache(slug?: string): void {
    if (slug) {
      // Clear all cache entries for this slug (prompts)
      for (const key of this.cache.keys()) {
        if (key.startsWith(`${slug}:`)) {
          this.cache.delete(key);
        }
      }
      // Also check exact match
      this.cache.delete(slug);

      // Clear experiment cache entries for this slug
      for (const key of this.experimentCache.keys()) {
        if (key.startsWith(`exp:${slug}:`)) {
          this.experimentCache.delete(key);
        }
      }
    } else {
      this.cache.clear();
      this.experimentCache.clear();
    }

    if (this.config.debug) {
      console.log(
        `[CognObserve] Cache cleared${slug ? ` for: ${slug}` : " (all)"}`
      );
    }
  }

  /**
   * Get raw prompt response without compile method
   *
   * @param slug - Prompt slug
   * @param options - Fetch options
   * @returns Raw prompt response
   */
  async getRaw(
    slug: string,
    options: GetPromptOptions = {}
  ): Promise<PromptResponse> {
    const prompt = await this.get(slug, options);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { compile, ...raw } = prompt;
    return raw;
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    prompts: { size: number; keys: string[] };
    experiments: { size: number; keys: string[] };
    total: number;
  } {
    return {
      prompts: {
        size: this.cache.size,
        keys: Array.from(this.cache.keys()),
      },
      experiments: {
        size: this.experimentCache.size,
        keys: Array.from(this.experimentCache.keys()),
      },
      total: this.cache.size + this.experimentCache.size,
    };
  }
}

// ============================================================
// Standalone Compile Function
// ============================================================

/**
 * Compile a prompt template with variables (standalone function)
 *
 * @param template - Prompt template (text or chat)
 * @param variables - Variable values to substitute
 * @param options - Compilation options
 * @returns Compiled prompt
 *
 * @example
 * ```typescript
 * import { compilePrompt } from '@cognobserve/sdk';
 *
 * const compiled = compilePrompt(
 *   { type: "text", text: "Hello, {{name}}!" },
 *   { name: "World" }
 * );
 * // { type: "text", text: "Hello, World!" }
 * ```
 */
export function compilePrompt(
  template: PromptTemplate,
  variables: Record<string, string>,
  options?: { strict?: boolean }
): CompiledPrompt {
  const replacePlaceholders = (text: string): string => {
    return text.replace(
      /\{\{(\w+)\}\}/g,
      (match: string, varName: string): string => {
        const value = variables[varName];
        if (value !== undefined) {
          return value;
        }
        if (options?.strict) {
          throw new Error(`Missing required variable: ${varName}`);
        }
        return match;
      }
    );
  };

  if (template.type === "text") {
    return {
      type: "text",
      text: replacePlaceholders(template.text),
    };
  }

  return {
    type: "chat",
    messages: template.messages.map((m) => ({
      ...m,
      content: replacePlaceholders(m.content),
    })),
  };
}

/**
 * Extract variable names from a template
 *
 * @param template - Prompt template
 * @returns Array of variable names found in the template
 *
 * @example
 * ```typescript
 * const vars = extractVariables({
 *   type: "text",
 *   text: "Hello {{name}}, welcome to {{place}}!"
 * });
 * // ["name", "place"]
 * ```
 */
export function extractVariables(template: PromptTemplate): string[] {
  const variables = new Set<string>();

  const extractFromText = (text: string): void => {
    // Create new regex instance per call to avoid lastIndex issues with global flag
    const regex = /\{\{(\w+)\}\}/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      if (match[1]) {
        variables.add(match[1]);
      }
    }
  };

  if (template.type === "text") {
    extractFromText(template.text);
  } else {
    for (const message of template.messages) {
      extractFromText(message.content);
    }
  }

  return Array.from(variables);
}
