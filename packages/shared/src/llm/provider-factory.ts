/**
 * LLM Provider Factory
 *
 * Creates and manages LLM provider instances from configuration.
 * Centralizes provider initialization logic.
 */

import type { LLMProvider, ProviderName } from "./types";
import type { LLMCenterConfig } from "./config.types";
import { OpenAIProvider } from "./providers/openai";
import { AnthropicProvider } from "./providers/anthropic";
import { ProviderNotConfiguredError, LLMError } from "./errors";

// ============================================
// Types
// ============================================

export interface ProviderRegistry {
  providers: Map<ProviderName, LLMProvider>;
  defaultProvider: ProviderName;
}

// ============================================
// Validation
// ============================================

/**
 * Check if a string is a non-empty API key.
 */
function isValidApiKey(apiKey: string | undefined): boolean {
  return Boolean(apiKey && apiKey.trim().length > 0);
}

/**
 * Throw an error for missing/invalid API key.
 * Call this only when the provider is required (e.g., default provider).
 */
function throwMissingApiKeyError(provider: ProviderName): never {
  throw new LLMError(
    `Missing API key for provider: ${provider}. Set the ${provider === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY"} environment variable.`,
    { code: "missing_api_key", provider, retryable: false }
  );
}

// ============================================
// Factory
// ============================================

/**
 * Create provider instances from configuration.
 *
 * Validates API keys at creation time to fail fast instead of
 * getting 401 errors at runtime.
 *
 * @param config - LLM Center configuration
 * @returns Provider registry with initialized providers
 * @throws LLMError if API key is missing or empty
 * @throws Error if no providers configured
 * @throws ProviderNotConfiguredError if default provider not configured
 */
export function createProviders(config: LLMCenterConfig): ProviderRegistry {
  const providers = new Map<ProviderName, LLMProvider>();

  // Initialize OpenAI provider if configured (with API key validation)
  const openaiConfig = config.providers.openai;
  if (openaiConfig) {
    if (isValidApiKey(openaiConfig.apiKey)) {
      providers.set("openai", new OpenAIProvider(openaiConfig));
    } else if (config.defaultProvider === "openai") {
      // Config exists but API key is invalid - error because it's the default provider
      throwMissingApiKeyError("openai");
    }
    // Otherwise silently skip (optional provider with invalid key)
  }

  // Initialize Anthropic provider if configured (with API key validation)
  const anthropicConfig = config.providers.anthropic;
  if (anthropicConfig) {
    if (isValidApiKey(anthropicConfig.apiKey)) {
      providers.set("anthropic", new AnthropicProvider(anthropicConfig));
    } else if (config.defaultProvider === "anthropic") {
      // Config exists but API key is invalid - error because it's the default provider
      throwMissingApiKeyError("anthropic");
    }
    // Otherwise silently skip (optional provider with invalid key)
  }

  // Validate at least one provider is configured
  if (providers.size === 0) {
    throw new LLMError(
      "No LLM providers configured. At least one provider must have a valid API key.",
      { code: "no_providers", retryable: false }
    );
  }

  // Validate default provider is configured
  if (!providers.has(config.defaultProvider)) {
    throw new ProviderNotConfiguredError(config.defaultProvider);
  }

  return {
    providers,
    defaultProvider: config.defaultProvider,
  };
}

/**
 * Get a provider by name from the registry.
 *
 * @param registry - Provider registry
 * @param name - Provider name
 * @returns Provider instance
 * @throws ProviderNotConfiguredError if provider not found
 */
export function getProvider(
  registry: ProviderRegistry,
  name: ProviderName
): LLMProvider {
  const provider = registry.providers.get(name);
  if (!provider) {
    throw new ProviderNotConfiguredError(name);
  }
  return provider;
}

/**
 * Check if a provider is configured in the registry.
 *
 * @param registry - Provider registry
 * @param name - Provider name
 * @returns True if provider exists
 */
export function hasProvider(
  registry: ProviderRegistry,
  name: ProviderName
): boolean {
  return registry.providers.has(name);
}

/**
 * Shutdown all providers in the registry.
 *
 * @param registry - Provider registry
 */
export async function shutdownProviders(
  registry: ProviderRegistry
): Promise<void> {
  for (const provider of registry.providers.values()) {
    await provider.shutdown?.();
  }
}
