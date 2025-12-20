/**
 * Rate Limiting Middleware
 *
 * Token bucket rate limiter for the ingest endpoint.
 * Limits requests per project/API key to prevent abuse.
 *
 * Features:
 * 1. In-memory token bucket per identifier
 * 2. Configurable RPS and burst limits
 * 3. Returns 429 with Retry-After header when exceeded
 */
import type { Request, Response, NextFunction } from "express";
import { config } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { metrics } from "../lib/metrics.js";

/**
 * Token bucket for rate limiting
 */
interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

/**
 * Rate limiter state (in-memory for v1)
 * In production, use Redis for distributed rate limiting
 */
const buckets = new Map<string, TokenBucket>();

/**
 * Cleanup interval for stale buckets (5 minutes)
 */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Max age for unused buckets (30 minutes)
 */
const BUCKET_MAX_AGE_MS = 30 * 60 * 1000;

/**
 * Get the rate limit identifier from request
 * Uses API key if present, falls back to IP address
 */
const getIdentifier = (req: Request): string => {
  // Try API key first (more accurate per-tenant limiting)
  const apiKey = req.headers["x-api-key"];
  if (typeof apiKey === "string" && apiKey.length > 0) {
    // Use first 16 chars of API key as identifier (don't store full key)
    return `key:${apiKey.substring(0, 16)}`;
  }

  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    return `key:${token.substring(0, 16)}`;
  }

  // Fall back to IP address
  const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
  return `ip:${ip}`;
};

/**
 * Get or create a token bucket for the identifier
 */
const getBucket = (identifier: string): TokenBucket => {
  let bucket = buckets.get(identifier);

  if (!bucket) {
    bucket = {
      tokens: config.rateLimit.burst,
      lastRefill: Date.now(),
    };
    buckets.set(identifier, bucket);
  }

  return bucket;
};

/**
 * Refill tokens based on elapsed time
 */
const refillTokens = (bucket: TokenBucket): void => {
  const now = Date.now();
  const elapsed = now - bucket.lastRefill;
  const refillAmount = (elapsed / 1000) * config.rateLimit.rps;

  bucket.tokens = Math.min(
    config.rateLimit.burst,
    bucket.tokens + refillAmount
  );
  bucket.lastRefill = now;
};

/**
 * Try to consume a token from the bucket
 */
const consumeToken = (bucket: TokenBucket): boolean => {
  refillTokens(bucket);

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return true;
  }

  return false;
};

/**
 * Calculate seconds until a token is available
 */
const getRetryAfter = (bucket: TokenBucket): number => {
  const tokensNeeded = 1 - bucket.tokens;
  const secondsToRefill = tokensNeeded / config.rateLimit.rps;
  return Math.ceil(secondsToRefill);
};

/**
 * Cleanup stale buckets periodically
 */
const cleanupStaleBuckets = (): void => {
  const now = Date.now();
  let cleaned = 0;

  for (const [key, bucket] of buckets.entries()) {
    if (now - bucket.lastRefill > BUCKET_MAX_AGE_MS) {
      buckets.delete(key);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    logger.debug({ cleaned, remaining: buckets.size }, "Cleaned up stale rate limit buckets");
  }
};

// Start cleanup interval
setInterval(cleanupStaleBuckets, CLEANUP_INTERVAL_MS);

/**
 * Rate limiting middleware
 *
 * Apply to routes that need rate limiting:
 * ```
 * router.post("/v1/traces", rateLimitMiddleware, handler);
 * ```
 */
export const rateLimitMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const identifier = getIdentifier(req);
  const bucket = getBucket(identifier);

  if (consumeToken(bucket)) {
    // Request allowed
    next();
    return;
  }

  // Rate limit exceeded
  const retryAfter = getRetryAfter(bucket);

  logger.warn(
    { identifier: identifier.substring(0, 20), retryAfter },
    "Rate limit exceeded"
  );

  metrics.rejectCounter.inc({ reason: "rate_limited" });

  res.setHeader("Retry-After", retryAfter.toString());
  res.setHeader("X-RateLimit-Limit", config.rateLimit.rps.toString());
  res.setHeader("X-RateLimit-Remaining", "0");
  res.setHeader("X-RateLimit-Reset", (Date.now() + retryAfter * 1000).toString());

  res.status(429).json({
    error: "RATE_LIMITED",
    message: "Too many requests. Please retry after the specified time.",
    retryAfter,
  });
};

/**
 * Get current rate limit status for an identifier
 * Useful for debugging and monitoring
 */
export const getRateLimitStatus = (identifier: string): {
  tokens: number;
  limit: number;
  burst: number;
} | null => {
  const bucket = buckets.get(identifier);
  if (!bucket) return null;

  refillTokens(bucket);
  return {
    tokens: Math.floor(bucket.tokens),
    limit: config.rateLimit.rps,
    burst: config.rateLimit.burst,
  };
};
