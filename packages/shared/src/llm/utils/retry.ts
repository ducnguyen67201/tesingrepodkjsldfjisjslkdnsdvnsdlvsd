/**
 * LLM Center - Retry Utilities
 *
 * Exponential backoff retry logic with jitter.
 */

import { isRetryableError } from "../errors";

// ============================================
// Configuration
// ============================================

export interface RetryOptions {
  /** Maximum number of retry attempts */
  maxAttempts?: number;
  /** Base delay between retries (ms) */
  baseDelayMs?: number;
  /** Maximum delay between retries (ms) */
  maxDelayMs?: number;
  /** Custom function to check if error is retryable */
  isRetryable?: (error: unknown) => boolean;
  /** Callback called before each retry */
  onRetry?: (attempt: number, error: Error, delayMs: number) => void;
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, "onRetry" | "isRetryable">> = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 60000,
};

// ============================================
// Retry Function
// ============================================

/**
 * Execute a function with exponential backoff retry.
 *
 * @param fn - Function to execute
 * @param options - Retry options
 * @returns Result of the function
 * @throws Last error if all retries fail
 *
 * @example
 * ```typescript
 * const result = await withRetry(
 *   () => fetchFromAPI(),
 *   { maxAttempts: 3, baseDelayMs: 1000 }
 * );
 * ```
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const {
    maxAttempts,
    baseDelayMs,
    maxDelayMs,
  } = { ...DEFAULT_OPTIONS, ...options };

  const checkRetryable = options?.isRetryable ?? isRetryableError;

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if error is retryable
      if (!checkRetryable(error)) {
        throw lastError;
      }

      // Don't delay after last attempt
      if (attempt === maxAttempts) {
        break;
      }

      // Calculate delay with exponential backoff and jitter
      const delay = calculateDelay(attempt, baseDelayMs, maxDelayMs);

      // Call retry callback if provided
      options?.onRetry?.(attempt, lastError, delay);

      await sleep(delay);
    }
  }

  throw lastError;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Calculate delay with exponential backoff and jitter.
 */
function calculateDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number
): number {
  // Exponential backoff: base * 2^(attempt-1)
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt - 1);

  // Add jitter (0-1000ms) to prevent thundering herd
  const jitter = Math.random() * 1000;

  // Cap at max delay
  return Math.min(exponentialDelay + jitter, maxDelayMs);
}

/** Internal sleep to avoid circular imports with utils/index.ts */
const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// ============================================
// Retry Builder
// ============================================

/**
 * Fluent builder for retry configuration.
 *
 * @example
 * ```typescript
 * const result = await retry()
 *   .attempts(5)
 *   .delay(2000)
 *   .maxDelay(120000)
 *   .onRetry((attempt, error) => console.log(`Retry ${attempt}:`, error))
 *   .execute(() => fetchFromAPI());
 * ```
 */
export function retry(): RetryBuilder {
  return new RetryBuilder();
}

class RetryBuilder {
  private options: RetryOptions = {};

  /**
   * Set maximum retry attempts.
   */
  attempts(n: number): this {
    this.options.maxAttempts = n;
    return this;
  }

  /**
   * Set base delay between retries.
   */
  delay(ms: number): this {
    this.options.baseDelayMs = ms;
    return this;
  }

  /**
   * Set maximum delay between retries.
   */
  maxDelay(ms: number): this {
    this.options.maxDelayMs = ms;
    return this;
  }

  /**
   * Set custom retryable check function.
   */
  retryIf(fn: (error: unknown) => boolean): this {
    this.options.isRetryable = fn;
    return this;
  }

  /**
   * Set callback called before each retry.
   */
  onRetry(fn: (attempt: number, error: Error, delayMs: number) => void): this {
    this.options.onRetry = fn;
    return this;
  }

  /**
   * Execute the function with configured retry options.
   */
  execute<T>(fn: () => Promise<T>): Promise<T> {
    return withRetry(fn, this.options);
  }
}
