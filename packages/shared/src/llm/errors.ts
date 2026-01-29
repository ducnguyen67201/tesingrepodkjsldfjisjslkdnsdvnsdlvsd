/**
 * LLM Center - Custom Error Classes
 *
 * Error types for LLM operations with structured error information.
 */

import type { ModelRef } from "./config.types";

// ============================================
// Base LLM Error
// ============================================

/**
 * Base error class for all LLM-related errors.
 */
export class LLMError extends Error {
  readonly code: string;
  readonly provider?: string;
  readonly model?: string;
  readonly retryable: boolean;

  constructor(
    message: string,
    options: {
      code: string;
      provider?: string;
      model?: string;
      retryable?: boolean;
      cause?: Error;
    }
  ) {
    super(message);
    this.name = "LLMError";
    this.code = options.code;
    this.provider = options.provider;
    this.model = options.model;
    this.retryable = options.retryable ?? false;
    this.cause = options.cause;
  }
}

// ============================================
// Specific Error Types
// ============================================

/**
 * Error when rate limit is exceeded.
 */
export class RateLimitError extends LLMError {
  readonly retryAfterMs?: number;

  constructor(
    provider: string,
    model: string,
    retryAfterMs?: number,
    cause?: Error
  ) {
    super(`Rate limit exceeded for ${provider}/${model}`, {
      code: "rate_limit",
      provider,
      model,
      retryable: true,
      cause,
    });
    this.name = "RateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Error when API key is invalid or missing.
 */
export class AuthenticationError extends LLMError {
  constructor(provider: string, cause?: Error) {
    super(`Authentication failed for provider: ${provider}`, {
      code: "authentication_error",
      provider,
      retryable: false,
      cause,
    });
    this.name = "AuthenticationError";
  }
}

/**
 * Error when model is not found or unavailable.
 */
export class ModelNotFoundError extends LLMError {
  constructor(provider: string, model: string, cause?: Error) {
    super(`Model not found: ${provider}/${model}`, {
      code: "model_not_found",
      provider,
      model,
      retryable: false,
      cause,
    });
    this.name = "ModelNotFoundError";
  }
}

/**
 * Error when request times out.
 */
export class TimeoutError extends LLMError {
  constructor(provider: string, model: string, timeoutMs: number, cause?: Error) {
    super(`Request timed out after ${timeoutMs}ms for ${provider}/${model}`, {
      code: "timeout",
      provider,
      model,
      retryable: true,
      cause,
    });
    this.name = "TimeoutError";
  }
}

/**
 * Error when service is unavailable.
 */
export class ServiceUnavailableError extends LLMError {
  constructor(provider: string, cause?: Error) {
    super(`Service unavailable: ${provider}`, {
      code: "service_unavailable",
      provider,
      retryable: true,
      cause,
    });
    this.name = "ServiceUnavailableError";
  }
}

/**
 * Error when content is filtered/blocked.
 */
export class ContentFilterError extends LLMError {
  constructor(provider: string, model: string, cause?: Error) {
    super(`Content filtered by ${provider}/${model}`, {
      code: "content_filter",
      provider,
      model,
      retryable: false,
      cause,
    });
    this.name = "ContentFilterError";
  }
}

/**
 * Error when schema validation fails.
 */
export class SchemaValidationError extends LLMError {
  readonly validationErrors: string[];

  constructor(
    provider: string,
    model: string,
    validationErrors: string[],
    cause?: Error
  ) {
    super(`Schema validation failed: ${validationErrors.join(", ")}`, {
      code: "schema_validation",
      provider,
      model,
      retryable: false,
      cause,
    });
    this.name = "SchemaValidationError";
    this.validationErrors = validationErrors;
  }
}

/**
 * Error when all fallbacks are exhausted.
 */
export class AllProvidersFailedError extends LLMError {
  readonly attempts: Array<{
    model: ModelRef;
    error: Error;
  }>;

  constructor(
    operation: string,
    attempts: Array<{ model: ModelRef; error: Error }>
  ) {
    const attemptSummary = attempts
      .map((a) => `${a.model.provider}/${a.model.model}: ${a.error.message}`)
      .join("; ");

    super(`All providers failed for ${operation}: ${attemptSummary}`, {
      code: "all_providers_failed",
      retryable: false,
    });
    this.name = "AllProvidersFailedError";
    this.attempts = attempts;
  }
}

/**
 * Error when provider is not configured.
 */
export class ProviderNotConfiguredError extends LLMError {
  constructor(provider: string) {
    super(`Provider not configured: ${provider}`, {
      code: "provider_not_configured",
      provider,
      retryable: false,
    });
    this.name = "ProviderNotConfiguredError";
  }
}

// ============================================
// Error Utilities
// ============================================

/**
 * Check if an error is retryable.
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof LLMError) {
    return error.retryable;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes("rate limit") ||
      message.includes("timeout") ||
      message.includes("econnreset") ||
      message.includes("econnrefused") ||
      message.includes("503") ||
      message.includes("529") ||
      message.includes("overloaded")
    );
  }

  return false;
}

/**
 * Extract error code from error.
 */
export function getErrorCode(error: unknown): string {
  if (error instanceof LLMError) {
    return error.code;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (message.includes("rate limit")) return "rate_limit";
    if (message.includes("timeout")) return "timeout";
    if (message.includes("authentication") || message.includes("api key"))
      return "authentication_error";
    if (message.includes("not found")) return "model_not_found";
    if (message.includes("503") || message.includes("unavailable"))
      return "service_unavailable";
  }

  return "unknown_error";
}
