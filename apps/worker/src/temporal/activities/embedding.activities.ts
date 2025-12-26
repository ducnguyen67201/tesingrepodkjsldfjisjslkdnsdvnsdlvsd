/**
 * Embedding Generation Activities
 *
 * Activities for generating and storing code chunk embeddings.
 * Uses centralized LLM Manager for provider-agnostic embedding generation.
 * Includes Redis caching by content hash for cost optimization.
 *
 * IMPORTANT: Follows READ-ONLY pattern - all storage via tRPC internal procedures.
 */

import type { EmbedResult } from "@ducsigr/shared/llm";
import { getEmbeddingCache, type EmbeddingCache } from "@ducsigr/shared/cache";
import { getLLM } from "@/lib/llm-manager";
import { getInternalCaller } from "@/lib/trpc-caller";
import type {
  GenerateEmbeddingsInput,
  GenerateEmbeddingsOutput,
  EmbeddingResult,
  EmbeddingChunk,
  StoreEmbeddingsInput,
  StoreEmbeddingsOutput,
} from "../types";

// ============================================
// Constants
// ============================================

/** Maximum texts per API call (OpenAI limit) */
const MAX_BATCH_SIZE = 100;

/** Default batch size (conservative for reliability) */
const DEFAULT_BATCH_SIZE = 50;

/** Maximum tokens per chunk (leave buffer for model limit of 8191) */
const MAX_TOKENS_PER_CHUNK = 8000;

/** Approximate characters per token (conservative estimate for code) */
const CHARS_PER_TOKEN = 3;

/** Maximum characters per chunk */
const MAX_CHARS_PER_CHUNK = MAX_TOKENS_PER_CHUNK * CHARS_PER_TOKEN;

/** Delay between batches in ms (for rate limiting) */
const BATCH_DELAY_MS = 200;

// ============================================
// Cache Singleton
// ============================================

let _cache: EmbeddingCache | null = null;

function getCache(): EmbeddingCache {
  if (!_cache) {
    _cache = getEmbeddingCache();
  }
  return _cache;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Truncate content to fit within token limit.
 * Uses a conservative character-based estimate.
 */
function truncateToTokenLimit(content: string): string {
  if (content.length <= MAX_CHARS_PER_CHUNK) {
    return content;
  }
  // Truncate with indicator
  return content.slice(0, MAX_CHARS_PER_CHUNK - 20) + "\n[...truncated]";
}

/**
 * Split array into batches of specified size.
 */
function batchArray<T>(array: T[], batchSize: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < array.length; i += batchSize) {
    batches.push(array.slice(i, i + batchSize));
  }
  return batches;
}

/**
 * Sleep for specified milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================
// Activity: Generate Embeddings
// ============================================

/**
 * Generate embeddings for code chunks using LLM Center with caching.
 *
 * Features:
 * - Redis caching by content hash (30-day TTL)
 * - Batches requests for efficiency (up to 100 per call)
 * - Truncates long content to token limit
 * - Rate limits between batches (handled by LLM Center)
 * - Automatic retry and fallback (handled by LLM Center)
 * - Tracks token usage, cost, and cache hit rate
 *
 * @param input - Chunks to generate embeddings for
 * @returns Embeddings with usage stats and cache metrics
 */
export async function generateEmbeddings(
  input: GenerateEmbeddingsInput
): Promise<GenerateEmbeddingsOutput> {
  const { chunks, batchSize = DEFAULT_BATCH_SIZE } = input;

  console.log(
    `[Embedding] Starting embedding generation for ${chunks.length} chunks`
  );

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
  let totalCost = 0;
  let cached = 0;
  let generated = 0;

  // ================================================================
  // Step 1: Check cache for all chunks
  // ================================================================
  const contentHashes = chunks.map((c) => c.contentHash);
  const cachedEmbeddings = await cache.getMany(contentHashes);

  console.log(
    `[Embedding] Cache lookup: ${cachedEmbeddings.size}/${chunks.length} hits ` +
      `(${((cachedEmbeddings.size / chunks.length) * 100).toFixed(1)}%)`
  );

  // ================================================================
  // Step 2: Separate cached vs uncached chunks
  // ================================================================
  const uncachedChunks: EmbeddingChunk[] = [];

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
  // Step 3: Generate embeddings for uncached chunks
  // ================================================================
  if (uncachedChunks.length > 0) {
    console.log(
      `[Embedding] Generating ${uncachedChunks.length} new embeddings`
    );

    const llm = getLLM();
    const effectiveBatchSize = Math.min(batchSize, MAX_BATCH_SIZE);
    const batches = batchArray(uncachedChunks, effectiveBatchSize);

    const newCacheEntries: { contentHash: string; embedding: number[] }[] = [];

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i]!;
      const batchNum = i + 1;

      console.log(
        `[Embedding] Processing batch ${batchNum}/${batches.length} (${batch.length} chunks)`
      );

      // Prepare input texts (truncated to token limit)
      const inputTexts = batch.map((chunk) =>
        truncateToTokenLimit(chunk.content)
      );

      // Call LLM Center for embeddings (handles retries, rate limiting, fallbacks)
      const result: EmbedResult = await llm.embed(inputTexts);

      // Validate response count
      if (result.embeddings.length !== batch.length) {
        throw new Error(
          `Embedding count mismatch: expected ${batch.length}, got ${result.embeddings.length}`
        );
      }

      // Match embeddings to chunk IDs and queue for cache
      for (let j = 0; j < batch.length; j++) {
        const chunk = batch[j]!;
        const embeddingVector = result.embeddings[j]!;

        results.push({
          chunkId: chunk.id,
          embedding: embeddingVector,
        });

        // Queue for cache
        newCacheEntries.push({
          contentHash: chunk.contentHash,
          embedding: embeddingVector,
        });

        generated++;
      }

      // Track token usage and cost
      totalTokens += result.usage.totalTokens;
      totalCost += result.usage.estimatedCost;

      console.log(
        `[Embedding] Batch ${batchNum} complete: ${batch.length} chunks, ` +
          `${result.usage.totalTokens} tokens, $${result.usage.estimatedCost.toFixed(6)}`
      );

      // Rate limit delay (except for last batch)
      if (i < batches.length - 1) {
        await sleep(BATCH_DELAY_MS);
      }
    }

    // ================================================================
    // Step 4: Cache new embeddings
    // ================================================================
    if (newCacheEntries.length > 0) {
      console.log(`[Embedding] Caching ${newCacheEntries.length} new embeddings`);
      await cache.setMany(newCacheEntries);
    }
  }

  // ================================================================
  // Step 5: Log final stats and return
  // ================================================================
  const cacheStats = cache.getStats();

  console.log(
    `[Embedding] Complete: ${results.length} embeddings ` +
      `(${cached} cached, ${generated} generated), ` +
      `${totalTokens} tokens, $${totalCost.toFixed(6)}, ` +
      `cache hit rate: ${(cacheStats.hitRate * 100).toFixed(1)}%`
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

// ============================================
// Activity: Store Embeddings
// ============================================

/**
 * Store embeddings in database via tRPC internal procedure.
 *
 * IMPORTANT: Mutations go through internal router - NOT direct database access.
 *
 * @param input - Embeddings to store
 * @returns Count of stored embeddings
 */
export async function storeEmbeddings(
  input: StoreEmbeddingsInput
): Promise<StoreEmbeddingsOutput> {
  const { embeddings } = input;

  if (embeddings.length === 0) {
    return { storedCount: 0 };
  }

  console.log(`[Embedding] Storing ${embeddings.length} embeddings`);

  const caller = getInternalCaller();
  const result = await caller.internal.storeChunkEmbeddings({
    embeddings: embeddings.map((e) => ({
      chunkId: e.chunkId,
      embedding: e.embedding,
    })),
  });

  console.log(`[Embedding] Stored ${result.storedCount} embeddings`);

  return result;
}
