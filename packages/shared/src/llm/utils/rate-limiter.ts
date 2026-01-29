/**
 * LLM Center - Rate Limiter
 *
 * Token bucket rate limiter for controlling API request rates.
 */

// ============================================
// Configuration
// ============================================

export interface RateLimiterOptions {
  /** Maximum requests per minute */
  requestsPerMinute: number;
  /** Maximum tokens per minute (optional) */
  tokensPerMinute?: number;
}

// ============================================
// Rate Limiter Class
// ============================================

/**
 * Token bucket rate limiter.
 *
 * Limits requests to stay within API rate limits.
 * Uses a token bucket algorithm with automatic refill.
 */
export class RateLimiter {
  private requestTokens: number;
  private maxRequestTokens: number;
  private requestRefillRate: number; // tokens per ms
  private lastRefill: number;

  constructor(options: RateLimiterOptions) {
    this.maxRequestTokens = options.requestsPerMinute;
    this.requestTokens = this.maxRequestTokens;
    this.requestRefillRate = options.requestsPerMinute / 60_000; // per ms
    this.lastRefill = Date.now();
  }

  /**
   * Acquire a token to make a request.
   * Waits if no tokens are available.
   */
  async acquire(): Promise<void> {
    this.refill();

    if (this.requestTokens < 1) {
      // Calculate wait time until we have a token
      const waitTime = Math.ceil((1 - this.requestTokens) / this.requestRefillRate);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      this.refill();
    }

    this.requestTokens--;
  }

  /**
   * Try to acquire a token without waiting.
   * @returns true if token was acquired, false otherwise
   */
  tryAcquire(): boolean {
    this.refill();

    if (this.requestTokens >= 1) {
      this.requestTokens--;
      return true;
    }

    return false;
  }

  /**
   * Get current available tokens.
   */
  getAvailableTokens(): number {
    this.refill();
    return Math.floor(this.requestTokens);
  }

  /**
   * Get time until next token is available (ms).
   */
  getTimeUntilAvailable(): number {
    this.refill();

    if (this.requestTokens >= 1) {
      return 0;
    }

    return Math.ceil((1 - this.requestTokens) / this.requestRefillRate);
  }

  /**
   * Refill tokens based on elapsed time.
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const tokensToAdd = elapsed * this.requestRefillRate;

    this.requestTokens = Math.min(
      this.maxRequestTokens,
      this.requestTokens + tokensToAdd
    );
    this.lastRefill = now;
  }
}

// ============================================
// Factory Function
// ============================================

/**
 * Create a rate limiter with the given options.
 */
export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  return new RateLimiter(options);
}
