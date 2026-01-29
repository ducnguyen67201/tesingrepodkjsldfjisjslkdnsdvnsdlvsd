/**
 * LLM Provider Detection
 *
 * Utilities for detecting the provider from a model name and normalizing model names
 * for pricing lookup.
 */

export const LLM_PROVIDERS = {
  OPENAI: "openai",
  ANTHROPIC: "anthropic",
  GOOGLE: "google",
  MISTRAL: "mistral",
  COHERE: "cohere",
  META: "meta",
  UNKNOWN: "unknown",
} as const;

export type LLMProvider = (typeof LLM_PROVIDERS)[keyof typeof LLM_PROVIDERS];

/**
 * Model name patterns for provider detection.
 * Order matters - more specific patterns first.
 */
const PROVIDER_PATTERNS: Array<{ pattern: RegExp; provider: LLMProvider }> = [
  // OpenAI
  { pattern: /^gpt-4/i, provider: "openai" },
  { pattern: /^gpt-3\.5/i, provider: "openai" },
  { pattern: /^o1/i, provider: "openai" },
  { pattern: /^text-davinci/i, provider: "openai" },
  { pattern: /^text-embedding/i, provider: "openai" },

  // Anthropic
  { pattern: /^claude/i, provider: "anthropic" },

  // Google
  { pattern: /^gemini/i, provider: "google" },
  { pattern: /^palm/i, provider: "google" },

  // Cohere
  { pattern: /^command/i, provider: "cohere" },
  { pattern: /^embed/i, provider: "cohere" },

  // Mistral
  { pattern: /^mistral/i, provider: "mistral" },
  { pattern: /^mixtral/i, provider: "mistral" },

  // Meta
  { pattern: /^llama/i, provider: "meta" },
];

/**
 * Detect LLM provider from model name.
 */
export function detectProvider(model: string): LLMProvider {
  const normalizedModel = model.trim().toLowerCase();

  for (const { pattern, provider } of PROVIDER_PATTERNS) {
    if (pattern.test(normalizedModel)) {
      return provider;
    }
  }

  return "unknown";
}

/**
 * Normalize model name for pricing lookup.
 * Removes version suffixes, dates, etc.
 */
export function normalizeModelName(model: string): string {
  return (
    model
      .trim()
      .toLowerCase()
      // Remove date suffixes like -20240229
      .replace(/-\d{8}$/, "")
      // Remove version suffixes like -0125
      .replace(/-\d{4}$/, "")
      // Remove preview/beta suffixes
      .replace(/-(preview|beta|alpha)$/i, "")
  );
}
