import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getEmbeddingCache,
  closeRedis,
  isRedisHealthy,
  type EmbeddingCache,
} from "../cache";

/**
 * Embedding Cache Tests
 *
 * These tests require Redis to be running.
 * Start Redis with: docker-compose up redis
 */

describe("EmbeddingCache", () => {
  let cache: EmbeddingCache;
  let redisAvailable = false;

  // Test data
  const TEST_HASH = "test-hash-" + Date.now();
  const TEST_EMBEDDING = new Array(1536).fill(0).map((_, i) => i * 0.001);

  beforeAll(async () => {
    redisAvailable = await isRedisHealthy();
    if (redisAvailable) {
      cache = getEmbeddingCache();
    }
  });

  afterAll(async () => {
    if (redisAvailable) {
      await cache.delete(TEST_HASH);
      await cache.delete("batch-test-1");
      await cache.delete("batch-test-2");
      await cache.delete("batch-test-3");
      await closeRedis();
    }
  });

  describe("Redis Connection", () => {
    it("should check Redis health", async () => {
      const healthy = await isRedisHealthy();
      expect(typeof healthy).toBe("boolean");
    });
  });

  describe("Single Operations", () => {
    it("should set and get an embedding", async () => {
      if (!redisAvailable) return; // Skip if no Redis

      await cache.set(TEST_HASH, TEST_EMBEDDING);
      const retrieved = await cache.get(TEST_HASH);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.length).toBe(1536);
      expect(retrieved?.[0]).toBeCloseTo(0);
      expect(retrieved?.[100]).toBeCloseTo(0.1);
    });

    it("should return null for non-existent key", async () => {
      if (!redisAvailable) return;

      const result = await cache.get("non-existent-key-" + Date.now());
      expect(result).toBeNull();
    });

    it("should check if key exists", async () => {
      if (!redisAvailable) return;

      await cache.set(TEST_HASH, TEST_EMBEDDING);
      const exists = await cache.has(TEST_HASH);
      expect(exists).toBe(true);

      const notExists = await cache.has("non-existent-key-" + Date.now());
      expect(notExists).toBe(false);
    });

    it("should delete an embedding", async () => {
      if (!redisAvailable) return;

      const deleteHash = "delete-test-" + Date.now();
      await cache.set(deleteHash, TEST_EMBEDDING);

      const beforeDelete = await cache.has(deleteHash);
      expect(beforeDelete).toBe(true);

      await cache.delete(deleteHash);

      const afterDelete = await cache.has(deleteHash);
      expect(afterDelete).toBe(false);
    });

    it("should reject invalid embedding dimensions", async () => {
      if (!redisAvailable) return;

      const invalidEmbedding = new Array(100).fill(0.1); // Wrong dimensions
      await cache.set("invalid-test", invalidEmbedding);

      // Should not be stored (silently fails due to validation)
      const retrieved = await cache.get("invalid-test");
      expect(retrieved).toBeNull();
    });
  });

  describe("Batch Operations", () => {
    const batchItems = [
      { contentHash: "batch-test-1", embedding: new Array(1536).fill(0.1) },
      { contentHash: "batch-test-2", embedding: new Array(1536).fill(0.2) },
      { contentHash: "batch-test-3", embedding: new Array(1536).fill(0.3) },
    ];

    it("should set multiple embeddings with setMany", async () => {
      if (!redisAvailable) return;

      await cache.setMany(batchItems);

      for (const item of batchItems) {
        const exists = await cache.has(item.contentHash);
        expect(exists).toBe(true);
      }
    });

    it("should get multiple embeddings with getMany", async () => {
      if (!redisAvailable) return;

      await cache.setMany(batchItems);

      const hashes = ["batch-test-1", "batch-test-2", "batch-test-3", "nonexistent"];
      const results = await cache.getMany(hashes);

      expect(results.size).toBe(3);
      expect(results.has("batch-test-1")).toBe(true);
      expect(results.has("batch-test-2")).toBe(true);
      expect(results.has("batch-test-3")).toBe(true);
      expect(results.has("nonexistent")).toBe(false);
    });

    it("should return empty map for all missing keys", async () => {
      if (!redisAvailable) return;

      const results = await cache.getMany(["missing-1", "missing-2"]);
      expect(results.size).toBe(0);
    });
  });

  describe("Statistics", () => {
    it("should track hits and misses", async () => {
      if (!redisAvailable) return;

      const statsHash = "stats-test-" + Date.now();
      await cache.set(statsHash, TEST_EMBEDDING);

      const initialStats = cache.getStats();
      const initialHits = initialStats.hits;
      const initialMisses = initialStats.misses;

      // Hit
      await cache.get(statsHash);
      // Miss
      await cache.get("nonexistent-" + Date.now());

      const finalStats = cache.getStats();
      expect(finalStats.hits).toBe(initialHits + 1);
      expect(finalStats.misses).toBe(initialMisses + 1);

      await cache.delete(statsHash);
    });

    it("should calculate hit rate", async () => {
      if (!redisAvailable) return;

      const stats = cache.getStats();
      expect(typeof stats.hitRate).toBe("number");
      expect(stats.hitRate).toBeGreaterThanOrEqual(0);
      expect(stats.hitRate).toBeLessThanOrEqual(1);
    });
  });
});
