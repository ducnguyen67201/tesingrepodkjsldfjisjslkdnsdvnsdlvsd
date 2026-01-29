/**
 * Shared Prompt Types
 *
 * Common types for all LLM prompts across activities.
 */

/** Prompt configuration passed to LLM Center */
export interface PromptConfig {
  /** Temperature for response randomness (0-1) */
  temperature: number;
  /** Maximum tokens in response */
  maxTokens: number;
}

/** Standard prompt module exports */
export interface PromptModule<TInput> {
  /** System prompt - defines LLM role */
  systemPrompt: string;
  /** Build user prompt from input */
  buildUserPrompt: (input: TInput) => string;
  /** LLM configuration */
  config: PromptConfig;
}
