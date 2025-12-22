/**
 * Vector Operations for pgvector
 *
 * This module provides TypeScript utilities for working with pgvector.
 * Since Prisma doesn't natively support the vector type, all operations
 * use raw SQL via prisma.$executeRaw and prisma.$queryRaw.
 *
 * IMPORTANT: All embedding arrays must have exactly 1536 dimensions
 * (matching OpenAI text-embedding-3-small output).
 */

import { prisma } from "./index";
import { Prisma } from "./generated/prisma/client";

// ============================================================
// Types
// ============================================================

/**
 * Result from similarity search
 */
export interface SimilarChunk {
  id: string;
  repoId: string;
  filePath: string;
  startLine: number;
  endLine: number;
  content: string;
  language: string | null;
  chunkType: string;
  similarity: number;
}

/**
 * Input for batch embedding storage
 */
export interface EmbeddingBatchItem {
  chunkId: string;
  embedding: number[];
}

// ============================================================
// Constants
// ============================================================

/** Expected embedding dimensions (text-embedding-3-small) */
export const EMBEDDING_DIMENSIONS = 1536;

/** Default number of results for similarity search */
export const DEFAULT_TOP_K = 10;

/** Default minimum similarity threshold (0-1, higher is more similar) */
export const DEFAULT_MIN_SIMILARITY = 0.5;

// ============================================================
// Validation & Sanitization
// ============================================================

/** CUID pattern for validating chunk IDs */
const CUID_PATTERN = /^c[a-z0-9]{24}$/;

/**
 * Validate embedding dimensions
 */
function validateEmbedding(embedding: number[]): void {
  if (embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Invalid embedding dimensions: expected ${EMBEDDING_DIMENSIONS}, got ${embedding.length}`
    );
  }
}

/**
 * Validate that a string is a valid CUID (used for chunk IDs)
 * Prevents SQL injection by ensuring IDs match expected format
 */
function validateCuid(id: string, fieldName: string = "id"): void {
  if (!CUID_PATTERN.test(id)) {
    throw new Error(`Invalid ${fieldName}: must be a valid CUID`);
  }
}

/**
 * Escape single quotes in SQL LIKE patterns to prevent SQL injection
 */
function escapeLikePattern(pattern: string): string {
  // Escape single quotes by doubling them (SQL standard)
  return pattern.replace(/'/g, "''");
}

/**
 * Format embedding array as PostgreSQL vector literal
 */
function formatVector(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

// ============================================================
// Single Embedding Operations
// ============================================================

/**
 * Store embedding for a single code chunk.
 *
 * @param chunkId - ID of the code chunk
 * @param embedding - 1536-dimensional embedding array
 */
export async function setChunkEmbedding(
  chunkId: string,
  embedding: number[]
): Promise<void> {
  validateEmbedding(embedding);

  const vectorLiteral = formatVector(embedding);

  await prisma.$executeRaw`
    UPDATE "CodeChunk"
    SET embedding = ${Prisma.raw(`'${vectorLiteral}'::vector`)}
    WHERE id = ${chunkId}
  `;
}

/**
 * Get embedding for a code chunk.
 *
 * @param chunkId - ID of the code chunk
 * @returns Embedding array or null if not set
 */
export async function getChunkEmbedding(
  chunkId: string
): Promise<number[] | null> {
  const result = await prisma.$queryRaw<Array<{ embedding: string | null }>>`
    SELECT embedding::text
    FROM "CodeChunk"
    WHERE id = ${chunkId}
  `;

  if (!result[0]?.embedding) {
    return null;
  }

  // Parse PostgreSQL vector format: [1.0,2.0,3.0,...]
  const vectorString = result[0].embedding;
  const numbers = vectorString
    .slice(1, -1) // Remove [ and ]
    .split(",")
    .map(Number);

  return numbers;
}

// ============================================================
// Batch Embedding Operations
// ============================================================

/**
 * Store embeddings for multiple code chunks in a single transaction.
 * More efficient than calling setChunkEmbedding() multiple times.
 *
 * @param items - Array of {chunkId, embedding} pairs
 */
export async function setChunkEmbeddings(
  items: EmbeddingBatchItem[]
): Promise<void> {
  if (items.length === 0) return;

  // Validate all chunk IDs and embeddings first
  for (const item of items) {
    validateCuid(item.chunkId, "chunkId");
    validateEmbedding(item.embedding);
  }

  // Build batch update using CASE WHEN
  // This is more efficient than multiple UPDATE statements
  // Note: chunkIds are validated as CUIDs above, safe for interpolation
  const ids = items.map((item) => item.chunkId);
  const cases = items
    .map((item) => {
      const vectorLiteral = formatVector(item.embedding);
      return `WHEN id = '${item.chunkId}' THEN '${vectorLiteral}'::vector`;
    })
    .join("\n      ");

  await prisma.$executeRaw`
    UPDATE "CodeChunk"
    SET embedding = CASE
      ${Prisma.raw(cases)}
    END
    WHERE id = ANY(${ids})
  `;
}

// ============================================================
// Similarity Search
// ============================================================

/**
 * Search for similar code chunks using vector similarity.
 *
 * Uses cosine similarity (1 - cosine distance) for comparison.
 * Results are ordered by similarity (highest first).
 *
 * @param repoId - Repository ID to search within
 * @param queryEmbedding - 1536-dimensional query embedding
 * @param topK - Maximum number of results (default: 10)
 * @param minSimilarity - Minimum similarity threshold 0-1 (default: 0.5)
 * @returns Array of similar chunks with similarity scores
 */
export async function searchSimilarChunks(
  repoId: string,
  queryEmbedding: number[],
  topK: number = DEFAULT_TOP_K,
  minSimilarity: number = DEFAULT_MIN_SIMILARITY
): Promise<SimilarChunk[]> {
  validateEmbedding(queryEmbedding);

  const vectorLiteral = formatVector(queryEmbedding);

  const results = await prisma.$queryRaw<SimilarChunk[]>`
    SELECT
      id,
      "repoId",
      "filePath",
      "startLine",
      "endLine",
      content,
      language,
      "chunkType",
      1 - (embedding <=> ${Prisma.raw(`'${vectorLiteral}'::vector`)}) as similarity
    FROM "CodeChunk"
    WHERE "repoId" = ${repoId}
      AND embedding IS NOT NULL
      AND 1 - (embedding <=> ${Prisma.raw(`'${vectorLiteral}'::vector`)}) >= ${minSimilarity}
    ORDER BY embedding <=> ${Prisma.raw(`'${vectorLiteral}'::vector`)}
    LIMIT ${topK}
  `;

  return results;
}

/**
 * Search for similar code chunks with file pattern filtering.
 *
 * @param repoId - Repository ID to search within
 * @param queryEmbedding - 1536-dimensional query embedding
 * @param filePatterns - Glob patterns to filter files (e.g., ["*.ts", "src/**"])
 * @param topK - Maximum number of results
 * @param minSimilarity - Minimum similarity threshold
 * @returns Array of similar chunks with similarity scores
 */
export async function searchSimilarChunksWithPatterns(
  repoId: string,
  queryEmbedding: number[],
  filePatterns: string[],
  topK: number = DEFAULT_TOP_K,
  minSimilarity: number = DEFAULT_MIN_SIMILARITY
): Promise<SimilarChunk[]> {
  validateEmbedding(queryEmbedding);

  if (filePatterns.length === 0) {
    return searchSimilarChunks(repoId, queryEmbedding, topK, minSimilarity);
  }

  // Convert glob patterns to SQL LIKE patterns and escape for SQL safety
  const likePatterns = filePatterns.map((p) => {
    // First escape single quotes, then convert glob to LIKE syntax
    const escaped = escapeLikePattern(p);
    return escaped.replace(/\*\*/g, "%").replace(/\*/g, "%").replace(/\?/g, "_");
  });

  const vectorLiteral = formatVector(queryEmbedding);

  // Build OR conditions for file patterns
  // Note: patterns are escaped above, safe for interpolation
  const patternConditions = likePatterns
    .map((pattern) => `"filePath" LIKE '${pattern}'`)
    .join(" OR ");

  const results = await prisma.$queryRaw<SimilarChunk[]>`
    SELECT
      id,
      "repoId",
      "filePath",
      "startLine",
      "endLine",
      content,
      language,
      "chunkType",
      1 - (embedding <=> ${Prisma.raw(`'${vectorLiteral}'::vector`)}) as similarity
    FROM "CodeChunk"
    WHERE "repoId" = ${repoId}
      AND embedding IS NOT NULL
      AND 1 - (embedding <=> ${Prisma.raw(`'${vectorLiteral}'::vector`)}) >= ${minSimilarity}
      AND (${Prisma.raw(patternConditions)})
    ORDER BY embedding <=> ${Prisma.raw(`'${vectorLiteral}'::vector`)}
    LIMIT ${topK}
  `;

  return results;
}

// ============================================================
// Utility Functions
// ============================================================

/**
 * Count chunks with embeddings for a repository.
 * Useful for progress tracking during indexing.
 */
export async function countChunksWithEmbeddings(
  repoId: string
): Promise<{ total: number; withEmbedding: number }> {
  const result = await prisma.$queryRaw<
    Array<{ total: bigint; with_embedding: bigint }>
  >`
    SELECT
      COUNT(*) as total,
      COUNT(embedding) as with_embedding
    FROM "CodeChunk"
    WHERE "repoId" = ${repoId}
  `;

  return {
    total: Number(result[0]?.total ?? 0),
    withEmbedding: Number(result[0]?.with_embedding ?? 0),
  };
}

/**
 * Clear all embeddings for a repository.
 * Used when re-indexing from scratch.
 */
export async function clearRepositoryEmbeddings(
  repoId: string
): Promise<number> {
  const result = await prisma.$executeRaw`
    UPDATE "CodeChunk"
    SET embedding = NULL
    WHERE "repoId" = ${repoId}
      AND embedding IS NOT NULL
  `;

  return result;
}

// ============================================================
// Knowledge Base Vector Operations
// ============================================================

/**
 * Result from knowledge similarity search
 */
export interface SimilarKnowledgeChunk {
  id: string;
  articleId: string;
  workspaceId: string;
  content: string;
  sectionTitle: string | null;
  sourceType: string;
  similarity: number;
}

/**
 * Input for knowledge embedding batch storage
 */
export interface KnowledgeEmbeddingBatchItem {
  chunkId: string;
  embedding: number[];
}

/**
 * Store embedding for a single knowledge chunk.
 *
 * @param chunkId - ID of the knowledge chunk
 * @param embedding - 1536-dimensional embedding array
 */
export async function setKnowledgeChunkEmbedding(
  chunkId: string,
  embedding: number[]
): Promise<void> {
  validateEmbedding(embedding);

  const vectorLiteral = formatVector(embedding);

  await prisma.$executeRaw`
    UPDATE "KnowledgeChunk"
    SET embedding = ${Prisma.raw(`'${vectorLiteral}'::vector`)}
    WHERE id = ${chunkId}
  `;
}

/**
 * Store embeddings for multiple knowledge chunks in a single transaction.
 * More efficient than calling setKnowledgeChunkEmbedding() multiple times.
 *
 * @param items - Array of {chunkId, embedding} pairs
 */
export async function setKnowledgeChunkEmbeddings(
  items: KnowledgeEmbeddingBatchItem[]
): Promise<void> {
  if (items.length === 0) return;

  // Validate all chunk IDs and embeddings first
  for (const item of items) {
    validateCuid(item.chunkId, "chunkId");
    validateEmbedding(item.embedding);
  }

  // Build batch update using CASE WHEN
  const ids = items.map((item) => item.chunkId);
  const cases = items
    .map((item) => {
      const vectorLiteral = formatVector(item.embedding);
      return `WHEN id = '${item.chunkId}' THEN '${vectorLiteral}'::vector`;
    })
    .join("\n      ");

  await prisma.$executeRaw`
    UPDATE "KnowledgeChunk"
    SET embedding = CASE
      ${Prisma.raw(cases)}
    END
    WHERE id = ANY(${ids})
  `;
}

/**
 * Search for similar knowledge chunks using vector similarity.
 *
 * Uses cosine similarity (1 - cosine distance) for comparison.
 * Results are ordered by similarity (highest first).
 *
 * @param workspaceId - Workspace ID to search within
 * @param queryEmbedding - 1536-dimensional query embedding
 * @param topK - Maximum number of results (default: 10)
 * @param minSimilarity - Minimum similarity threshold 0-1 (default: 0.5)
 * @returns Array of similar chunks with similarity scores
 */
export async function searchKnowledgeChunks(
  workspaceId: string,
  queryEmbedding: number[],
  topK: number = DEFAULT_TOP_K,
  minSimilarity: number = DEFAULT_MIN_SIMILARITY
): Promise<SimilarKnowledgeChunk[]> {
  validateEmbedding(queryEmbedding);

  const vectorLiteral = formatVector(queryEmbedding);

  const results = await prisma.$queryRaw<SimilarKnowledgeChunk[]>`
    SELECT
      kc.id,
      kc."articleId",
      kc."workspaceId",
      kc.content,
      kc."sectionTitle",
      kc."sourceType",
      1 - (kc.embedding <=> ${Prisma.raw(`'${vectorLiteral}'::vector`)}) as similarity
    FROM "KnowledgeChunk" kc
    INNER JOIN "KnowledgeArticle" ka ON kc."articleId" = ka.id
    WHERE kc."workspaceId" = ${workspaceId}
      AND ka.status = 'PUBLISHED'
      AND kc.embedding IS NOT NULL
      AND 1 - (kc.embedding <=> ${Prisma.raw(`'${vectorLiteral}'::vector`)}) >= ${minSimilarity}
    ORDER BY kc.embedding <=> ${Prisma.raw(`'${vectorLiteral}'::vector`)}
    LIMIT ${topK}
  `;

  return results;
}

/**
 * Search for similar knowledge chunks filtered by article IDs.
 * Useful when you have a pre-filtered set of relevant articles (e.g., from rules).
 *
 * @param workspaceId - Workspace ID to search within
 * @param queryEmbedding - 1536-dimensional query embedding
 * @param articleIds - Article IDs to search within
 * @param topK - Maximum number of results
 * @param minSimilarity - Minimum similarity threshold
 * @returns Array of similar chunks with similarity scores
 */
export async function searchKnowledgeChunksInArticles(
  workspaceId: string,
  queryEmbedding: number[],
  articleIds: string[],
  topK: number = DEFAULT_TOP_K,
  minSimilarity: number = DEFAULT_MIN_SIMILARITY
): Promise<SimilarKnowledgeChunk[]> {
  validateEmbedding(queryEmbedding);

  if (articleIds.length === 0) {
    return [];
  }

  const vectorLiteral = formatVector(queryEmbedding);

  const results = await prisma.$queryRaw<SimilarKnowledgeChunk[]>`
    SELECT
      kc.id,
      kc."articleId",
      kc."workspaceId",
      kc.content,
      kc."sectionTitle",
      kc."sourceType",
      1 - (kc.embedding <=> ${Prisma.raw(`'${vectorLiteral}'::vector`)}) as similarity
    FROM "KnowledgeChunk" kc
    WHERE kc."workspaceId" = ${workspaceId}
      AND kc."articleId" = ANY(${articleIds})
      AND kc.embedding IS NOT NULL
      AND 1 - (kc.embedding <=> ${Prisma.raw(`'${vectorLiteral}'::vector`)}) >= ${minSimilarity}
    ORDER BY kc.embedding <=> ${Prisma.raw(`'${vectorLiteral}'::vector`)}
    LIMIT ${topK}
  `;

  return results;
}

/**
 * Count knowledge chunks with embeddings for an article.
 * Useful for progress tracking during indexing.
 */
export async function countKnowledgeChunksWithEmbeddings(
  articleId: string
): Promise<{ total: number; withEmbedding: number }> {
  const result = await prisma.$queryRaw<
    Array<{ total: bigint; with_embedding: bigint }>
  >`
    SELECT
      COUNT(*) as total,
      COUNT(embedding) as with_embedding
    FROM "KnowledgeChunk"
    WHERE "articleId" = ${articleId}
  `;

  return {
    total: Number(result[0]?.total ?? 0),
    withEmbedding: Number(result[0]?.with_embedding ?? 0),
  };
}

/**
 * Clear all chunks and embeddings for an article.
 * Used when re-indexing an article.
 */
export async function clearArticleChunks(
  articleId: string
): Promise<number> {
  const result = await prisma.knowledgeChunk.deleteMany({
    where: { articleId },
  });

  return result.count;
}
