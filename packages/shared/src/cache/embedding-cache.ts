/**
 * Embedding Cache
 *
 * Cache embeddings by content hash to avoid regenerating embeddings
 * for unchanged code. Uses Redis for storage.
 *
 * Key format: embedding:{contentHash}
 * Value: JSON-encoded number[] (1536 dimensions)
 * TTL: 30 days (configurable)
 */

import type Redis from "ioredis";
import { getRedis } from "./redis";

// ============================================
// Constants
// ============================================

/** Cache key prefix */
const CACHE_PREFIX = "embedding:";

/** Default TTL in seconds (30 days) */
const DEFAULT_TTL_SECONDS = 30 * 24 * 60 * 60;

/** Expected embedding dimensions */
const EMBEDDING_DIMENSIONS = 1536;

// ============================================
// Types
// ============================================

export interface EmbeddingCacheStats {
  hits: number;
  misses: number;
  hitRate: number;
}

export interface CachedEmbedding {
  contentHash: string;
  embedding: number[];
}

export interface EmbeddingCacheOptions {
  redis?: Redis;
  ttlSeconds?: number;
}

// ============================================
// Embedding Cache Class
// ============================================

export class EmbeddingCache {
  private redis: Redis;
  private ttlSeconds: number;
  private stats: { hits: number; misses: number };

  constructor(options?: EmbeddingCacheOptions) {
    this.redis = options?.redis ?? getRedis();
    this.ttlSeconds = options?.ttlSeconds ?? DEFAULT_TTL_SECONDS;
    this.stats = { hits: 0, misses: 0 };
  }

  // ============================================
  // Single Operations
  // ============================================

  /**
   * Get cached embedding by content hash.
   * Returns null if not found or on error.
   */
  async get(contentHash: string): Promise<number[] | null> {
    try {
      const key = `${CACHE_PREFIX}${contentHash}`;
      const cached = await this.redis.get(key);

      if (!cached) {
        this.stats.misses++;
        return null;
      }

      // Refresh TTL on access (sliding expiration)
      await this.redis.expire(key, this.ttlSeconds);

      const embedding = JSON.parse(cached) as number[];

      // Validate dimensions
      if (embedding.length !== EMBEDDING_DIMENSIONS) {
        console.warn(
          `[EmbeddingCache] Invalid dimensions for ${contentHash}: ${embedding.length}`
        );
        this.stats.misses++;
        return null;
      }

      this.stats.hits++;
      return embedding;
    } catch (error) {
      console.warn("[EmbeddingCache] Get failed:", error);
      this.stats.misses++;
      return null; // Graceful degradation
    }
  }

  /**
   * Cache an embedding by content hash.
   */
  async set(contentHash: string, embedding: number[]): Promise<void> {
    try {
      if (embedding.length !== EMBEDDING_DIMENSIONS) {
        console.warn(
          `[EmbeddingCache] Invalid dimensions: ${embedding.length}`
        );
        return;
      }

      const key = `${CACHE_PREFIX}${contentHash}`;
      await this.redis.setex(key, this.ttlSeconds, JSON.stringify(embedding));
    } catch (error) {
      console.warn("[EmbeddingCache] Set failed:", error);
      // Don't throw - cache is optional
    }
  }

  // ============================================
  // Batch Operations
  // ============================================

  /**
   * Get multiple embeddings by content hashes.
   * Returns a Map of contentHash -> embedding for found items.
   */
  async getMany(contentHashes: string[]): Promise<Map<string, number[]>> {
    const results = new Map<string, number[]>();

    if (contentHashes.length === 0) {
      return results;
    }

    try {
      const keys = contentHashes.map((h) => `${CACHE_PREFIX}${h}`);
      const values = await this.redis.mget(...keys);

      for (let i = 0; i < contentHashes.length; i++) {
        const hash = contentHashes[i]!;
        const value = values[i];

        if (value) {
          try {
            const embedding = JSON.parse(value) as number[];
            if (embedding.length === EMBEDDING_DIMENSIONS) {
              results.set(hash, embedding);
              this.stats.hits++;
            } else {
              this.stats.misses++;
            }
          } catch {
            this.stats.misses++;
          }
        } else {
          this.stats.misses++;
        }
      }

      // Refresh TTL for found items
      if (results.size > 0) {
        const pipeline = this.redis.pipeline();
        for (const hash of results.keys()) {
          pipeline.expire(`${CACHE_PREFIX}${hash}`, this.ttlSeconds);
        }
        await pipeline.exec();
      }
    } catch (error) {
      console.warn("[EmbeddingCache] GetMany failed:", error);
      // Count all as misses
      this.stats.misses += contentHashes.length;
    }

    return results;
  }

  /**
   * Cache multiple embeddings.
   */
  async setMany(items: CachedEmbedding[]): Promise<void> {
    if (items.length === 0) {
      return;
    }

    try {
      const pipeline = this.redis.pipeline();

      for (const item of items) {
        if (item.embedding.length !== EMBEDDING_DIMENSIONS) {
          console.warn(
            `[EmbeddingCache] Skipping invalid dimensions: ${item.contentHash}`
          );
          continue;
        }

        const key = `${CACHE_PREFIX}${item.contentHash}`;
        pipeline.setex(key, this.ttlSeconds, JSON.stringify(item.embedding));
      }

      await pipeline.exec();
    } catch (error) {
      console.warn("[EmbeddingCache] SetMany failed:", error);
      // Don't throw - cache is optional
    }
  }

  // ============================================
  // Utility Methods
  // ============================================

  /**
   * Check if cache contains a content hash.
   */
  async has(contentHash: string): Promise<boolean> {
    try {
      const key = `${CACHE_PREFIX}${contentHash}`;
      const exists = await this.redis.exists(key);
      return exists === 1;
    } catch {
      return false;
    }
  }

  /**
   * Delete a cached embedding.
   */
  async delete(contentHash: string): Promise<void> {
    try {
      const key = `${CACHE_PREFIX}${contentHash}`;
      await this.redis.del(key);
    } catch (error) {
      console.warn("[EmbeddingCache] Delete failed:", error);
    }
  }

  /**
   * Get cache statistics.
   */
  getStats(): EmbeddingCacheStats {
    const total = this.stats.hits + this.stats.misses;
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: total > 0 ? this.stats.hits / total : 0,
    };
  }

  /**
   * Reset cache statistics.
   */
  resetStats(): void {
    this.stats = { hits: 0, misses: 0 };
  }

  /**
   * Get approximate cache size (number of embedding keys).
   */
  async getSize(): Promise<number> {
    try {
      // Use SCAN to count keys (non-blocking)
      let count = 0;
      let cursor = "0";

      do {
        const [nextCursor, keys] = await this.redis.scan(
          cursor,
          "MATCH",
          `${CACHE_PREFIX}*`,
          "COUNT",
          1000
        );
        cursor = nextCursor;
        count += keys.length;
      } while (cursor !== "0");

      return count;
    } catch {
      return 0;
    }
  }
}

// ============================================
// Singleton Instance
// ============================================

let _cache: EmbeddingCache | null = null;

/**
 * Get singleton embedding cache instance.
 */
export function getEmbeddingCache(): EmbeddingCache {
  if (!_cache) {
    _cache = new EmbeddingCache();
  }
  return _cache;
}
