/**
 * Redis Client Utility
 *
 * Shared Redis client for caching across the application.
 * Provides singleton pattern with lazy connection.
 */

import Redis from "ioredis";

// ============================================
// Singleton Client
// ============================================

let _redis: Redis | null = null;

/**
 * Get or create Redis client.
 * Reuses existing connection if available.
 */
export function getRedis(): Redis {
  if (!_redis) {
    const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
    _redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 3) return null; // Stop retrying
        return Math.min(times * 100, 3000);
      },
      lazyConnect: true,
    });

    _redis.on("error", (err) => {
      console.error("[Redis] Connection error:", err.message);
    });

    _redis.on("connect", () => {
      console.log("[Redis] Connected");
    });
  }

  return _redis;
}

/**
 * Check if Redis is connected and healthy.
 */
export async function isRedisHealthy(): Promise<boolean> {
  try {
    const redis = getRedis();
    const result = await redis.ping();
    return result === "PONG";
  } catch {
    return false;
  }
}

/**
 * Close Redis connection.
 */
export async function closeRedis(): Promise<void> {
  if (_redis) {
    await _redis.quit();
    _redis = null;
    console.log("[Redis] Disconnected");
  }
}
