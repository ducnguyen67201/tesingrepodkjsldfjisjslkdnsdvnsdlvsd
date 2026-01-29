/**
 * Vector Similarity Search Activities
 *
 * Activities for semantic code search using pgvector.
 * Core retrieval mechanism for the RCA system.
 *
 * Uses centralized LLM Manager for embedding generation.
 * IMPORTANT: Read-only operations, no mutations.
 */

import { getLLM } from "@/lib/llm-manager";
import {
  prisma,
  searchSimilarChunks,
  searchSimilarChunksWithPatterns,
} from "@ducsigr/db";
import type {
  SearchCodebaseInput,
  SearchCodebaseOutput,
  SearchProjectCodebaseInput,
  SearchResult,
} from "../types";

// ============================================
// Constants
// ============================================

/** Maximum query length in characters (~8000 tokens * 3 chars/token) */
const MAX_QUERY_LENGTH = 24000;

/** Default number of results */
const DEFAULT_TOP_K = 10;

/** Maximum number of results */
const MAX_TOP_K = 100;

/** Default minimum similarity */
const DEFAULT_MIN_SIMILARITY = 0.5;

// ============================================
// Helper Functions
// ============================================

/**
 * Truncate query to fit within token limit.
 */
function truncateQuery(query: string): { text: string; truncated: boolean } {
  if (query.length <= MAX_QUERY_LENGTH) {
    return { text: query, truncated: false };
  }
  return {
    text: query.slice(0, MAX_QUERY_LENGTH),
    truncated: true,
  };
}

/**
 * Validate and normalize search parameters.
 */
function normalizeParams(input: SearchCodebaseInput): {
  topK: number;
  minSimilarity: number;
} {
  return {
    topK: Math.min(Math.max(input.topK ?? DEFAULT_TOP_K, 1), MAX_TOP_K),
    minSimilarity: Math.min(
      Math.max(input.minSimilarity ?? DEFAULT_MIN_SIMILARITY, 0),
      1
    ),
  };
}

/**
 * Map database result to SearchResult type.
 */
function mapToSearchResult(
  chunk: Awaited<ReturnType<typeof searchSimilarChunks>>[number]
): SearchResult {
  return {
    chunkId: chunk.id,
    repoId: chunk.repoId,
    filePath: chunk.filePath,
    startLine: chunk.startLine,
    endLine: chunk.endLine,
    content: chunk.content,
    language: chunk.language,
    chunkType: chunk.chunkType,
    similarity: chunk.similarity,
  };
}

// ============================================
// Activity: Search Codebase
// ============================================

/**
 * Search for similar code chunks using vector similarity.
 *
 * Process:
 * 1. Generate embedding for query using LLM Center
 * 2. Perform vector similarity search in PostgreSQL
 * 3. Return top-K results with similarity scores
 *
 * @param input - Search parameters
 * @returns Search results with metadata
 */
export async function searchCodebase(
  input: SearchCodebaseInput
): Promise<SearchCodebaseOutput> {
  const startTime = Date.now();
  const { repoId, query, filePatterns } = input;
  const { topK, minSimilarity } = normalizeParams(input);

  console.log(
    `[Search] Searching repo ${repoId} for: "${query.slice(0, 100)}..."`
  );

  // Validate query
  if (!query || query.trim().length === 0) {
    return {
      results: [],
      queryTokens: 0,
      searchLatencyMs: Date.now() - startTime,
      queryTruncated: false,
    };
  }

  // Truncate query if needed
  const { text: queryText, truncated: queryTruncated } = truncateQuery(query);

  // Generate query embedding using centralized LLM Manager
  const llm = getLLM();
  const embedResult = await llm.embed([queryText]);

  // Get the embedding vector
  const queryEmbedding = embedResult.embeddings[0];
  if (!queryEmbedding) {
    throw new Error("Failed to generate embedding for query");
  }

  const queryTokens = embedResult.usage.totalTokens;

  console.log(`[Search] Generated query embedding (${queryTokens} tokens)`);

  // Perform vector search
  let dbResults: Awaited<ReturnType<typeof searchSimilarChunks>>;

  if (filePatterns && filePatterns.length > 0) {
    dbResults = await searchSimilarChunksWithPatterns(
      repoId,
      queryEmbedding,
      filePatterns,
      topK,
      minSimilarity
    );
  } else {
    dbResults = await searchSimilarChunks(
      repoId,
      queryEmbedding,
      topK,
      minSimilarity
    );
  }

  // Map to SearchResult type
  const results: SearchResult[] = dbResults.map(mapToSearchResult);
  const searchLatencyMs = Date.now() - startTime;

  console.log(
    `[Search] Found ${results.length} results in ${searchLatencyMs}ms ` +
      `(top similarity: ${results[0]?.similarity.toFixed(4) ?? "N/A"})`
  );

  return {
    results,
    queryTokens,
    searchLatencyMs,
    queryTruncated,
  };
}

// ============================================
// Activity: Search Project Codebase
// ============================================

/**
 * Search codebase by project ID.
 * Resolves project to repository, then performs search.
 *
 * @param input - Search parameters with project ID
 * @returns Search results
 */
export async function searchProjectCodebase(
  input: SearchProjectCodebaseInput
): Promise<SearchCodebaseOutput> {
  const startTime = Date.now();
  const { projectId, query, topK, minSimilarity, filePatterns } = input;

  console.log(`[Search] Searching project ${projectId}`);

  // Resolve project to repository
  const repo = await prisma.gitHubRepository.findUnique({
    where: { projectId },
    select: { id: true },
  });

  if (!repo) {
    console.log(`[Search] No repository linked to project ${projectId}`);
    return {
      results: [],
      queryTokens: 0,
      searchLatencyMs: Date.now() - startTime,
      queryTruncated: false,
    };
  }

  // Delegate to repoId-based search
  return searchCodebase({
    repoId: repo.id,
    query,
    topK,
    minSimilarity,
    filePatterns,
  });
}
