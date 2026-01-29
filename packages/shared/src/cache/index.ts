/**
 * Cache Utilities
 *
 * Redis client and embedding cache for Ducsigr.
 */

export { getRedis, isRedisHealthy, closeRedis } from "./redis";

export {
  EmbeddingCache,
  getEmbeddingCache,
  type EmbeddingCacheStats,
  type CachedEmbedding,
  type EmbeddingCacheOptions,
} from "./embedding-cache";
