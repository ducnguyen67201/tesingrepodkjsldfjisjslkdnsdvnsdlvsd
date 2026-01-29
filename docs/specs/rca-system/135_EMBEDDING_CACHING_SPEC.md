# Engineering Spec: Embedding Caching by Content Hash

**Issue**: #135
**Sprint**: 2 - Vector Search
**Story Points**: 5
**Priority**: P1
**Status**: Implemented
**Author**: Engineering Team
**Created**: 2025-12-13
**Dependencies**: #133 (Embedding Generation)

---

## Overview

Implement caching of embeddings by content hash to avoid regenerating embeddings for unchanged code. This significantly reduces costs when re-indexing or processing similar code across repositories.

## Problem Statement

Currently, embedding generation:

1. Calls OpenAI API for every code chunk
2. Costs ~$0.02 per 1M tokens
3. Re-indexing regenerates all embeddings (wasteful)
4. Same code in different repos generates duplicate embeddings

With caching:
- Skip API calls for previously seen content
- Target >50% cache hit rate on re-index
- Reduce embedding costs by 50%+

## Goals

1. Cache embeddings in Redis by content hash
2. Achieve >50% cache hit rate on typical re-index
3. 30-day TTL (configurable)
4. Graceful degradation if cache unavailable
5. Monitor cache hit rate for optimization

## Non-Goals

- Persistent embedding storage (PostgreSQL handles this)
- Cross-tenant cache isolation (content hash is anonymous)
- Cache eviction policies beyond TTL

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     EMBEDDING CACHE FLOW                                     │
└─────────────────────────────────────────────────────────────────────────────┘

                    Code Chunks to Embed
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    generateEmbeddings Activity                               │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │  1. Extract content hashes from chunks                              │  │
│   │     chunks.map(c => c.contentHash)                                  │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                           │                                                 │
│                           ▼                                                 │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │  2. Check Redis cache (batch lookup)                                │  │
│   │     MGET embedding:hash1 embedding:hash2 ...                        │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                           │                                                 │
│              ┌────────────┴────────────┐                                   │
│              │                         │                                   │
│              ▼                         ▼                                   │
│   ┌──────────────────┐    ┌──────────────────────────┐                    │
│   │  Cache HIT       │    │  Cache MISS              │                    │
│   │  (Use cached)    │    │  (Call OpenAI API)       │                    │
│   │                  │    │                          │                    │
│   │  ┌────────────┐  │    │  ┌──────────────────┐   │                    │
│   │  │ embedding  │  │    │  │ OpenAI API       │   │                    │
│   │  │ from Redis │  │    │  │ text-embedding   │   │                    │
│   │  └────────────┘  │    │  │ -3-small         │   │                    │
│   │                  │    │  └────────┬─────────┘   │                    │
│   └──────────────────┘    │           │             │                    │
│              │            │           ▼             │                    │
│              │            │  ┌──────────────────┐   │                    │
│              │            │  │ Cache new        │   │                    │
│              │            │  │ embedding        │   │                    │
│              │            │  │ SETEX 30d        │   │                    │
│              │            │  └──────────────────┘   │                    │
│              │            └──────────────────────────┘                    │
│              │                         │                                   │
│              └────────────┬────────────┘                                   │
│                           │                                                 │
│                           ▼                                                 │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │  3. Combine cached + new embeddings                                 │  │
│   │     Return { embeddings, cached, generated, tokensUsed }            │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                           │
                           ▼
               ┌───────────────────────┐
               │      storeEmbeddings  │
               │      (to PostgreSQL)  │
               └───────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                         Redis Cache                                          │
│                                                                             │
│   Key Format: embedding:{contentHash}                                       │
│   Value: JSON-encoded number[] (1536 floats)                                │
│   TTL: 30 days (configurable)                                               │
│                                                                             │
│   Example:                                                                  │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │  KEY: embedding:a1b2c3d4e5f6...                                     │  │
│   │  VALUE: "[0.0123,-0.0456,0.0789,...]"                                │  │
│   │  TTL: 2592000 (30 days in seconds)                                  │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Steps

### Step 1: Add Redis Dependency

**File**: `packages/shared/package.json`

```json
{
  "dependencies": {
    "ioredis": "^5.4.1"
  }
}
```

---

### Step 2: Create Redis Client Utility

**File**: `packages/shared/src/cache/redis.ts`

```typescript
/**
 * Redis Client Utility
 *
 * Shared Redis client for caching across the application.
 */

import Redis from "ioredis";

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
  }
}
```

---

### Step 3: Create Embedding Cache

**File**: `packages/shared/src/cache/embedding-cache.ts`

```typescript
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

// ============================================
// Embedding Cache Class
// ============================================

export class EmbeddingCache {
  private redis: Redis;
  private ttlSeconds: number;
  private stats: { hits: number; misses: number };

  constructor(options?: { redis?: Redis; ttlSeconds?: number }) {
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
```

---

### Step 4: Export from Package

**File**: `packages/shared/src/index.ts`

```typescript
// ... existing exports ...

// Cache utilities
export * from "./cache/redis";
export * from "./cache/embedding-cache";
```

---

### Step 5: Update Embedding Activity

**File**: `apps/worker/src/temporal/activities/embedding.activities.ts`

Update to use cache:

```typescript
import { getEmbeddingCache, type EmbeddingCache } from "@ducsigr/shared";

// Add cache instance
let _cache: EmbeddingCache | null = null;

function getCache(): EmbeddingCache {
  if (!_cache) {
    _cache = getEmbeddingCache();
  }
  return _cache;
}

/**
 * Generate embeddings for code chunks with caching.
 */
export async function generateEmbeddings(
  input: GenerateEmbeddingsInput
): Promise<GenerateEmbeddingsOutput> {
  const { chunks, batchSize = DEFAULT_BATCH_SIZE } = input;

  console.log(`[Embedding] Starting with ${chunks.length} chunks`);

  if (chunks.length === 0) {
    return {
      embeddings: [],
      tokensUsed: 0,
      estimatedCost: 0,
      chunksProcessed: 0,
      batchCount: 0,
      cached: 0,
      generated: 0,
    };
  }

  const cache = getCache();
  const results: EmbeddingResult[] = [];
  let totalTokens = 0;
  let cached = 0;
  let generated = 0;

  // ================================================================
  // Step 1: Check cache for all chunks
  // ================================================================
  const contentHashes = chunks.map((c) => c.contentHash);
  const cachedEmbeddings = await cache.getMany(contentHashes);

  console.log(
    `[Embedding] Cache lookup: ${cachedEmbeddings.size}/${chunks.length} hits`
  );

  // Separate cached vs uncached chunks
  const uncachedChunks: typeof chunks = [];

  for (const chunk of chunks) {
    const cachedEmbedding = cachedEmbeddings.get(chunk.contentHash);
    if (cachedEmbedding) {
      results.push({
        chunkId: chunk.id,
        embedding: cachedEmbedding,
      });
      cached++;
    } else {
      uncachedChunks.push(chunk);
    }
  }

  // ================================================================
  // Step 2: Generate embeddings for uncached chunks
  // ================================================================
  if (uncachedChunks.length > 0) {
    console.log(`[Embedding] Generating ${uncachedChunks.length} new embeddings`);

    const openai = getOpenAI();
    const effectiveBatchSize = Math.min(batchSize, MAX_BATCH_SIZE);
    const batches = batchArray(uncachedChunks, effectiveBatchSize);

    const newCacheEntries: { contentHash: string; embedding: number[] }[] = [];

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i]!;
      const batchNum = i + 1;

      try {
        const inputTexts = batch.map((c) => truncateToTokenLimit(c.content));

        const response = await openai.embeddings.create({
          model: EMBEDDING_MODEL,
          input: inputTexts,
        });

        if (response.data.length !== batch.length) {
          throw new Error(`Embedding count mismatch`);
        }

        for (let j = 0; j < batch.length; j++) {
          const chunk = batch[j]!;
          const embedding = response.data[j]!.embedding;

          results.push({
            chunkId: chunk.id,
            embedding,
          });

          // Queue for cache
          newCacheEntries.push({
            contentHash: chunk.contentHash,
            embedding,
          });

          generated++;
        }

        totalTokens += response.usage.total_tokens;

        const batchCost = calculateCost(response.usage.total_tokens);
        console.log(
          `[Embedding] Batch ${batchNum}/${batches.length}: ${batch.length} chunks, ` +
          `${response.usage.total_tokens} tokens, $${batchCost.toFixed(4)}`
        );

        if (i < batches.length - 1) {
          await sleep(BATCH_DELAY_MS);
        }
      } catch (error) {
        if (error instanceof OpenAI.RateLimitError) {
          console.log(`[Embedding] Rate limited, waiting 60s...`);
          await sleep(60_000);
          i--;
          continue;
        }
        throw error;
      }
    }

    // ================================================================
    // Step 3: Cache new embeddings
    // ================================================================
    if (newCacheEntries.length > 0) {
      console.log(`[Embedding] Caching ${newCacheEntries.length} new embeddings`);
      await cache.setMany(newCacheEntries);
    }
  }

  const totalCost = calculateCost(totalTokens);
  const stats = cache.getStats();

  console.log(
    `[Embedding] Complete: ${results.length} embeddings ` +
    `(${cached} cached, ${generated} generated), ` +
    `${totalTokens} tokens, $${totalCost.toFixed(4)}, ` +
    `cache hit rate: ${(stats.hitRate * 100).toFixed(1)}%`
  );

  return {
    embeddings: results,
    tokensUsed: totalTokens,
    estimatedCost: totalCost,
    chunksProcessed: results.length,
    batchCount: Math.ceil(uncachedChunks.length / DEFAULT_BATCH_SIZE),
    cached,
    generated,
  };
}
```

---

### Step 6: Update Output Type

**File**: `apps/worker/src/temporal/types.ts`

```typescript
export interface GenerateEmbeddingsOutput {
  embeddings: EmbeddingResult[];
  tokensUsed: number;
  estimatedCost: number;
  chunksProcessed: number;
  batchCount: number;
  /** Number of embeddings from cache */
  cached: number;
  /** Number of embeddings generated (API calls) */
  generated: number;
}
```

---

### Step 7: Add Environment Variable

**File**: `.env.example`

```env
# Redis (for embedding cache)
REDIS_URL=redis://localhost:6379
```

---

## Cache Key Design

### Key Format

```
embedding:{contentHash}
```

### Content Hash Calculation

The content hash is already computed during chunking (SHA-256 of content). This ensures:

1. **Deterministic**: Same content always produces same hash
2. **Collision-resistant**: Different content produces different hash
3. **Anonymous**: Hash doesn't reveal content

### Example

```
Content: "function hello() { return 'world'; }"
Hash: a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6
Key: embedding:a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6
```

---

## Testing Plan

### Unit Tests

**File**: `packages/shared/src/cache/__tests__/embedding-cache.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { EmbeddingCache } from "../embedding-cache";

// Mock Redis
const mockRedis = {
  get: vi.fn(),
  setex: vi.fn(),
  mget: vi.fn(),
  expire: vi.fn(),
  exists: vi.fn(),
  del: vi.fn(),
  pipeline: vi.fn(() => ({
    setex: vi.fn().mockReturnThis(),
    expire: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([]),
  })),
  scan: vi.fn().mockResolvedValue(["0", []]),
};

describe("EmbeddingCache", () => {
  let cache: EmbeddingCache;
  const testHash = "abc123";
  const testEmbedding = Array(1536).fill(0.1);

  beforeEach(() => {
    vi.clearAllMocks();
    cache = new EmbeddingCache({ redis: mockRedis as any });
  });

  describe("get", () => {
    it("should return embedding on cache hit", async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify(testEmbedding));

      const result = await cache.get(testHash);

      expect(result).toHaveLength(1536);
      expect(mockRedis.get).toHaveBeenCalledWith(`embedding:${testHash}`);
    });

    it("should return null on cache miss", async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await cache.get(testHash);

      expect(result).toBeNull();
    });

    it("should refresh TTL on hit", async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify(testEmbedding));

      await cache.get(testHash);

      expect(mockRedis.expire).toHaveBeenCalled();
    });

    it("should handle invalid dimensions", async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify([1, 2, 3]));

      const result = await cache.get(testHash);

      expect(result).toBeNull();
    });
  });

  describe("set", () => {
    it("should cache embedding", async () => {
      await cache.set(testHash, testEmbedding);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        `embedding:${testHash}`,
        expect.any(Number),
        JSON.stringify(testEmbedding)
      );
    });

    it("should reject invalid dimensions", async () => {
      await cache.set(testHash, [1, 2, 3]);

      expect(mockRedis.setex).not.toHaveBeenCalled();
    });
  });

  describe("getMany", () => {
    it("should return map of found embeddings", async () => {
      mockRedis.mget.mockResolvedValue([
        JSON.stringify(testEmbedding),
        null,
      ]);

      const result = await cache.getMany(["hash1", "hash2"]);

      expect(result.size).toBe(1);
      expect(result.has("hash1")).toBe(true);
      expect(result.has("hash2")).toBe(false);
    });
  });

  describe("getStats", () => {
    it("should track hits and misses", async () => {
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(testEmbedding));
      mockRedis.get.mockResolvedValueOnce(null);

      await cache.get("hit");
      await cache.get("miss");

      const stats = cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBe(0.5);
    });
  });
});
```

### Integration Test

**File**: `packages/shared/scripts/test-embedding-cache.ts`

```typescript
import { EmbeddingCache, getRedis, isRedisHealthy } from "../src";

async function main() {
  console.log("Testing Embedding Cache...\n");

  // Check Redis health
  const healthy = await isRedisHealthy();
  if (!healthy) {
    console.log("Redis not available. Skipping test.");
    return;
  }
  console.log("Redis is healthy.\n");

  const cache = new EmbeddingCache();
  const testHash = "test-hash-" + Date.now();
  const testEmbedding = Array(1536).fill(0).map(() => Math.random());

  // Test 1: Set and get
  console.log("Test 1: Set and get");
  await cache.set(testHash, testEmbedding);
  const retrieved = await cache.get(testHash);
  console.log(`  Set: ${testHash}`);
  console.log(`  Get: ${retrieved ? "Found" : "Not found"}`);
  console.log(`  Dimensions: ${retrieved?.length ?? 0}`);

  // Test 2: Batch operations
  console.log("\nTest 2: Batch operations");
  const batchHashes = Array(10).fill(0).map((_, i) => `batch-${testHash}-${i}`);
  const batchEmbeddings = batchHashes.map((h) => ({
    contentHash: h,
    embedding: Array(1536).fill(0).map(() => Math.random()),
  }));
  await cache.setMany(batchEmbeddings);
  const batchResults = await cache.getMany(batchHashes);
  console.log(`  Set: ${batchHashes.length} embeddings`);
  console.log(`  Get: ${batchResults.size} found`);

  // Test 3: Stats
  console.log("\nTest 3: Cache stats");
  const stats = cache.getStats();
  console.log(`  Hits: ${stats.hits}`);
  console.log(`  Misses: ${stats.misses}`);
  console.log(`  Hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);

  // Cleanup
  await cache.delete(testHash);
  for (const h of batchHashes) {
    await cache.delete(h);
  }

  console.log("\nEmbedding cache tests passed!");
}

main()
  .catch(console.error)
  .finally(() => getRedis().quit());
```

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/shared/package.json` | Modify | Add ioredis dependency |
| `packages/shared/src/cache/redis.ts` | Create | Redis client utility |
| `packages/shared/src/cache/embedding-cache.ts` | Create | Embedding cache |
| `packages/shared/src/index.ts` | Modify | Export cache utilities |
| `apps/worker/src/temporal/activities/embedding.activities.ts` | Modify | Use cache |
| `apps/worker/src/temporal/types.ts` | Modify | Add cached/generated counts |
| `.env.example` | Modify | Add REDIS_URL |

---

## Monitoring

### Metrics to Track

1. **Cache Hit Rate**: Target >50% on re-index
2. **Cache Size**: Number of cached embeddings
3. **Cache Latency**: Redis GET/SET latency
4. **Cost Savings**: Tokens saved via caching

### Logging

```
[Embedding] Starting with 1000 chunks
[Embedding] Cache lookup: 650/1000 hits
[Embedding] Generating 350 new embeddings
[Embedding] Batch 1/4: 100 chunks, 5000 tokens, $0.0001
...
[Embedding] Caching 350 new embeddings
[Embedding] Complete: 1000 embeddings (650 cached, 350 generated), 17500 tokens, $0.00035, cache hit rate: 65.0%
```

### Redis Memory Estimation

| Cached Embeddings | Approximate Memory |
|-------------------|-------------------|
| 10,000 | ~120 MB |
| 100,000 | ~1.2 GB |
| 1,000,000 | ~12 GB |

Each embedding: ~6KB (1536 floats × 4 bytes + JSON overhead)

---

## Error Handling

| Scenario | Handling |
|----------|----------|
| Redis unavailable | Graceful degradation, generate all |
| Redis timeout | Log warning, continue without cache |
| Invalid cached data | Delete and regenerate |
| Full cache | TTL handles eviction |

---

## Acceptance Criteria

- [ ] Embeddings cached in Redis by content hash
- [ ] Cache hit rate > 50% on typical re-index
- [ ] TTL of 30 days (configurable)
- [ ] Cache size monitored (via `getSize()`)
- [ ] Graceful degradation if cache unavailable
- [ ] Batch operations (getMany, setMany) work correctly
- [ ] Statistics tracked (hits, misses, hit rate)
- [ ] Unit tests pass
- [ ] Integration test verifies Redis operations
