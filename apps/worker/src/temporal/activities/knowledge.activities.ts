/**
 * Knowledge Base Indexing Activities
 *
 * Activities for chunking, embedding, and indexing knowledge articles.
 * Uses centralized LLM Manager for embedding generation with Redis caching.
 *
 * IMPORTANT: Follows READ-ONLY pattern - all storage via tRPC internal procedures.
 */

import crypto from "crypto";
import { prisma } from "@cognobserve/db";
import type { EmbedResult } from "@cognobserve/shared/llm";
import { getEmbeddingCache, type EmbeddingCache } from "@cognobserve/shared/cache";
import { getLLM } from "@/lib/llm-manager";
import { getInternalCaller } from "@/lib/trpc-caller";

// ============================================
// Types
// ============================================

export interface KnowledgeArticle {
  id: string;
  workspaceId: string;
  title: string;
  summary: string | null;
  content: string;
  tags: string[];
}

export interface KnowledgeChunk {
  content: string;
  contentHash: string;
  startOffset: number;
  endOffset: number;
  sectionTitle: string | null;
}

export interface ChunkArticleInput {
  articleId: string;
  workspaceId: string;
  content: string;
  title: string;
  summary: string | null;
}

export interface ChunkArticleOutput {
  chunks: KnowledgeChunk[];
  totalChunks: number;
}

export interface StoreChunksInput {
  articleId: string;
  workspaceId: string;
  chunks: KnowledgeChunk[];
}

export interface StoreChunksOutput {
  chunksCreated: number;
  chunkIds: string[];
}

export interface GenerateKnowledgeEmbeddingsInput {
  chunks: Array<{
    id: string;
    content: string;
    contentHash: string;
  }>;
  batchSize?: number;
}

export interface GenerateKnowledgeEmbeddingsOutput {
  embeddings: Array<{
    chunkId: string;
    embedding: number[];
  }>;
  tokensUsed: number;
  estimatedCost: number;
  cached: number;
  generated: number;
}

export interface StoreKnowledgeEmbeddingsInput {
  embeddings: Array<{
    chunkId: string;
    embedding: number[];
  }>;
}

export interface UpdateSearchTextInput {
  articleId: string;
  title: string;
  summary: string | null;
  content: string;
  tags: string[];
}

// ============================================
// Constants
// ============================================

/** Target chunk size in characters (approx 500-600 tokens) */
const TARGET_CHUNK_SIZE = 1500;

/** Minimum chunk size (don't create tiny chunks) */
const MIN_CHUNK_SIZE = 200;

/** Maximum tokens per embedding (OpenAI limit with buffer) */
const MAX_TOKENS_PER_CHUNK = 8000;

/** Approximate characters per token */
const CHARS_PER_TOKEN = 3;

/** Maximum characters per chunk for embedding */
const MAX_CHARS_PER_EMBED = MAX_TOKENS_PER_CHUNK * CHARS_PER_TOKEN;

/** Maximum batch size for embeddings */
const MAX_BATCH_SIZE = 100;

/** Default batch size */
const DEFAULT_BATCH_SIZE = 50;

/** Delay between batches in ms */
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
 * Generate SHA-256 hash for content deduplication.
 */
function hashContent(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex").slice(0, 32);
}

/**
 * Split array into batches.
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

/**
 * Truncate content to fit within token limit.
 */
function truncateToTokenLimit(content: string): string {
  if (content.length <= MAX_CHARS_PER_EMBED) {
    return content;
  }
  return content.slice(0, MAX_CHARS_PER_EMBED - 20) + "\n[...truncated]";
}

/**
 * Extract section title from markdown heading.
 */
function extractSectionTitle(text: string): string | null {
  const match = text.match(/^#+\s+(.+)$/m);
  return match ? match[1]!.trim() : null;
}

// ============================================
// Activity: Get Article for Indexing
// ============================================

/**
 * Fetch article details for indexing (READ-ONLY).
 */
export async function getArticleForIndexing(
  articleId: string
): Promise<KnowledgeArticle | null> {
  console.log(`[Knowledge] Fetching article ${articleId} for indexing`);

  const article = await prisma.knowledgeArticle.findUnique({
    where: { id: articleId },
    select: {
      id: true,
      workspaceId: true,
      title: true,
      summary: true,
      content: true,
      tags: true,
    },
  });

  if (!article) {
    console.log(`[Knowledge] Article ${articleId} not found`);
    return null;
  }

  return article;
}

// ============================================
// Activity: Chunk Article Content
// ============================================

/**
 * Split article content into semantic chunks.
 *
 * Strategy:
 * 1. Split on markdown headings for semantic boundaries
 * 2. If sections are too large, split on paragraphs
 * 3. If paragraphs are too large, split on sentences
 * 4. Maintain overlap for context continuity
 */
export async function chunkArticleContent(
  input: ChunkArticleInput
): Promise<ChunkArticleOutput> {
  const { content, title, summary } = input;

  console.log(
    `[Knowledge] Chunking article content (${content.length} chars)`
  );

  const chunks: KnowledgeChunk[] = [];

  // Add title and summary as first chunk if present
  if (summary) {
    const headerContent = `# ${title}\n\n${summary}`;
    chunks.push({
      content: headerContent,
      contentHash: hashContent(headerContent),
      startOffset: 0,
      endOffset: headerContent.length,
      sectionTitle: title,
    });
  }

  // Split content by markdown headings
  const sections = content.split(/(?=^#{1,3}\s)/m);
  let currentOffset = 0;

  for (const section of sections) {
    if (section.trim().length < MIN_CHUNK_SIZE) {
      currentOffset += section.length;
      continue;
    }

    const sectionTitle = extractSectionTitle(section);

    // If section is small enough, use as single chunk
    if (section.length <= TARGET_CHUNK_SIZE) {
      chunks.push({
        content: section.trim(),
        contentHash: hashContent(section.trim()),
        startOffset: currentOffset,
        endOffset: currentOffset + section.length,
        sectionTitle,
      });
    } else {
      // Split large sections by paragraphs
      const paragraphs = section.split(/\n\n+/);
      let buffer = "";
      let bufferStart = currentOffset;
      let paragraphOffset = currentOffset;

      for (let i = 0; i < paragraphs.length; i++) {
        const paragraph = paragraphs[i]!;
        const isLast = i === paragraphs.length - 1;

        if (buffer.length + paragraph.length <= TARGET_CHUNK_SIZE) {
          // First paragraph in buffer sets the start offset
          if (!buffer) {
            bufferStart = paragraphOffset;
          }
          buffer += (buffer ? "\n\n" : "") + paragraph;
        } else {
          // Flush current buffer
          if (buffer.length >= MIN_CHUNK_SIZE) {
            chunks.push({
              content: buffer.trim(),
              contentHash: hashContent(buffer.trim()),
              startOffset: bufferStart,
              endOffset: paragraphOffset,
              sectionTitle,
            });
          }
          buffer = paragraph;
          bufferStart = paragraphOffset;
        }
        // Advance offset: paragraph length + separator (2 chars, except for last)
        paragraphOffset += paragraph.length + (isLast ? 0 : 2);
      }

      // Flush remaining buffer
      if (buffer.length >= MIN_CHUNK_SIZE) {
        chunks.push({
          content: buffer.trim(),
          contentHash: hashContent(buffer.trim()),
          startOffset: bufferStart,
          endOffset: paragraphOffset,
          sectionTitle,
        });
      }

    }

    // Advance offset to end of section
    currentOffset += section.length;
  }

  console.log(`[Knowledge] Created ${chunks.length} chunks`);

  return {
    chunks,
    totalChunks: chunks.length,
  };
}

// ============================================
// Activity: Store Chunks
// ============================================

/**
 * Store article chunks via tRPC internal procedure.
 */
export async function storeKnowledgeChunks(
  input: StoreChunksInput
): Promise<StoreChunksOutput> {
  const { articleId, workspaceId, chunks } = input;

  console.log(`[Knowledge] Storing ${chunks.length} chunks for article ${articleId}`);

  if (chunks.length === 0) {
    return { chunksCreated: 0, chunkIds: [] };
  }

  const caller = getInternalCaller();
  const result = await caller.internal.storeKnowledgeChunks({
    articleId,
    workspaceId,
    chunks: chunks.map((c) => ({
      content: c.content,
      contentHash: c.contentHash,
      startOffset: c.startOffset,
      endOffset: c.endOffset,
      sectionTitle: c.sectionTitle ?? undefined,
      sourceType: "ARTICLE" as const,
    })),
  });

  console.log(`[Knowledge] Stored ${result.chunksCreated} chunks`);

  return result;
}

// ============================================
// Activity: Generate Embeddings
// ============================================

/**
 * Generate embeddings for knowledge chunks using LLM Center with caching.
 */
export async function generateKnowledgeEmbeddings(
  input: GenerateKnowledgeEmbeddingsInput
): Promise<GenerateKnowledgeEmbeddingsOutput> {
  const { chunks, batchSize = DEFAULT_BATCH_SIZE } = input;

  console.log(`[Knowledge] Generating embeddings for ${chunks.length} chunks`);

  if (chunks.length === 0) {
    return {
      embeddings: [],
      tokensUsed: 0,
      estimatedCost: 0,
      cached: 0,
      generated: 0,
    };
  }

  const cache = getCache();
  const results: Array<{ chunkId: string; embedding: number[] }> = [];
  let totalTokens = 0;
  let totalCost = 0;
  let cached = 0;
  let generated = 0;

  // Check cache for all chunks
  const contentHashes = chunks.map((c) => c.contentHash);
  const cachedEmbeddings = await cache.getMany(contentHashes);

  console.log(
    `[Knowledge] Cache lookup: ${cachedEmbeddings.size}/${chunks.length} hits`
  );

  // Separate cached vs uncached
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

  // Generate embeddings for uncached chunks
  if (uncachedChunks.length > 0) {
    console.log(`[Knowledge] Generating ${uncachedChunks.length} new embeddings`);

    const llm = getLLM();
    const effectiveBatchSize = Math.min(batchSize, MAX_BATCH_SIZE);
    const batches = batchArray(uncachedChunks, effectiveBatchSize);
    const newCacheEntries: { contentHash: string; embedding: number[] }[] = [];

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i]!;
      console.log(`[Knowledge] Processing batch ${i + 1}/${batches.length}`);

      const inputTexts = batch.map((chunk) =>
        truncateToTokenLimit(chunk.content)
      );

      const result: EmbedResult = await llm.embed(inputTexts);

      if (result.embeddings.length !== batch.length) {
        throw new Error(
          `Embedding count mismatch: expected ${batch.length}, got ${result.embeddings.length}`
        );
      }

      for (let j = 0; j < batch.length; j++) {
        const chunk = batch[j]!;
        const embeddingVector = result.embeddings[j]!;

        results.push({
          chunkId: chunk.id,
          embedding: embeddingVector,
        });

        newCacheEntries.push({
          contentHash: chunk.contentHash,
          embedding: embeddingVector,
        });

        generated++;
      }

      totalTokens += result.usage.totalTokens;
      totalCost += result.usage.estimatedCost;

      if (i < batches.length - 1) {
        await sleep(BATCH_DELAY_MS);
      }
    }

    // Cache new embeddings
    if (newCacheEntries.length > 0) {
      await cache.setMany(newCacheEntries);
    }
  }

  console.log(
    `[Knowledge] Complete: ${results.length} embeddings (${cached} cached, ${generated} generated)`
  );

  return {
    embeddings: results,
    tokensUsed: totalTokens,
    estimatedCost: totalCost,
    cached,
    generated,
  };
}

// ============================================
// Activity: Store Embeddings
// ============================================

/**
 * Store knowledge embeddings via tRPC internal procedure.
 */
export async function storeKnowledgeEmbeddings(
  input: StoreKnowledgeEmbeddingsInput
): Promise<{ storedCount: number }> {
  const { embeddings } = input;

  if (embeddings.length === 0) {
    return { storedCount: 0 };
  }

  console.log(`[Knowledge] Storing ${embeddings.length} embeddings`);

  const caller = getInternalCaller();
  const result = await caller.internal.storeKnowledgeEmbeddings({
    embeddings,
  });

  return result;
}

// ============================================
// Activity: Update Search Text
// ============================================

/**
 * Update article searchText for keyword search.
 */
export async function updateArticleSearchText(
  input: UpdateSearchTextInput
): Promise<{ success: boolean }> {
  const { articleId, title, summary, content, tags } = input;

  // Build searchable text from article fields
  const searchParts = [
    title,
    summary,
    content,
    tags.join(" "),
  ].filter(Boolean);

  const searchText = searchParts.join("\n\n");

  console.log(`[Knowledge] Updating searchText for article ${articleId}`);

  const caller = getInternalCaller();
  await caller.internal.updateArticleSearchText({
    articleId,
    searchText,
  });

  return { success: true };
}

// ============================================
// Activity: Clear Article Chunks
// ============================================

/**
 * Clear existing chunks for an article (for re-indexing).
 */
export async function clearArticleChunks(
  articleId: string
): Promise<{ deletedCount: number }> {
  console.log(`[Knowledge] Clearing chunks for article ${articleId}`);

  const caller = getInternalCaller();
  const result = await caller.internal.clearArticleChunks({ articleId });

  return result;
}

// ============================================
// Activity: Evaluate Knowledge Rules
// ============================================

export interface EvaluateRulesInput {
  workspaceId: string;
  projectId: string;
  /** Context data for rule evaluation */
  traceContext: Record<string, unknown>;
}

export interface EvaluateRulesOutput {
  matchedArticleIds: string[];
  matches: Array<{
    articleId: string;
    ruleName: string;
    matchReason: string;
  }>;
}

/**
 * Evaluate knowledge rules against trace context.
 *
 * This activity is READ-ONLY - it only reads rules and returns matches.
 * The actual matching logic uses the FilterExpression DSL.
 */
export async function evaluateKnowledgeRules(
  input: EvaluateRulesInput
): Promise<EvaluateRulesOutput> {
  const { workspaceId, projectId, traceContext } = input;

  console.log(`[Knowledge] Evaluating rules for workspace ${workspaceId}`);

  // Fetch enabled rules for this workspace/project
  const rules = await prisma.knowledgeRule.findMany({
    where: {
      workspaceId,
      enabled: true,
      OR: [
        { scope: "WORKSPACE" },
        { scope: "PROJECT", projectId },
      ],
    },
    include: {
      article: {
        select: { id: true, title: true },
      },
    },
    orderBy: { priority: "desc" },
  });

  console.log(`[Knowledge] Found ${rules.length} enabled rules`);

  const matches: EvaluateRulesOutput["matches"] = [];
  const matchedArticleIds: string[] = [];

  for (const rule of rules) {
    if (!rule.articleId || !rule.article) continue;

    try {
      // Evaluate rule condition against trace context
      // The condition is a JSON FilterExpression
      const condition = rule.condition as Record<string, unknown>;
      const isMatch = evaluateFilterExpression(condition, traceContext);

      if (isMatch) {
        matchedArticleIds.push(rule.articleId);
        matches.push({
          articleId: rule.articleId,
          ruleName: rule.name,
          matchReason: rule.matchReasonTemplate || `Matched rule: ${rule.name}`,
        });
      }
    } catch (error) {
      console.warn(`[Knowledge] Error evaluating rule ${rule.id}:`, error);
    }
  }

  console.log(`[Knowledge] ${matches.length} rules matched`);

  return {
    matchedArticleIds: [...new Set(matchedArticleIds)],
    matches,
  };
}

/**
 * Simple filter expression evaluator.
 * Supports basic operators: equals, contains, exists, and, or.
 */
function evaluateFilterExpression(
  condition: Record<string, unknown>,
  context: Record<string, unknown>
): boolean {
  const operator = condition.operator as string | undefined;

  if (!operator) {
    // Simple field comparison
    const field = condition.field as string;
    const value = condition.value;
    const contextValue = getNestedValue(context, field);
    return contextValue === value;
  }

  switch (operator.toLowerCase()) {
    case "equals":
    case "eq": {
      const field = condition.field as string;
      const value = condition.value;
      return getNestedValue(context, field) === value;
    }

    case "contains": {
      const field = condition.field as string;
      const value = condition.value as string;
      const contextValue = getNestedValue(context, field);
      if (typeof contextValue === "string") {
        return contextValue.toLowerCase().includes(value.toLowerCase());
      }
      return false;
    }

    case "exists": {
      const field = condition.field as string;
      return getNestedValue(context, field) !== undefined;
    }

    case "and": {
      const conditions = condition.conditions as Record<string, unknown>[];
      return conditions.every((c) => evaluateFilterExpression(c, context));
    }

    case "or": {
      const conditions = condition.conditions as Record<string, unknown>[];
      return conditions.some((c) => evaluateFilterExpression(c, context));
    }

    case "not": {
      const inner = condition.condition as Record<string, unknown>;
      return !evaluateFilterExpression(inner, context);
    }

    case "regex": {
      const field = condition.field as string;
      const pattern = condition.value as string;
      const contextValue = getNestedValue(context, field);
      if (typeof contextValue === "string") {
        return new RegExp(pattern, "i").test(contextValue);
      }
      return false;
    }

    default:
      console.warn(`[Knowledge] Unknown operator: ${operator}`);
      return false;
  }
}

/**
 * Get nested value from object using dot notation.
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current === "object") {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return current;
}

// ============================================
// Activity: Retrieve Knowledge Context for RCA
// ============================================

export interface RetrieveKnowledgeContextInput {
  workspaceId: string;
  projectId: string;
  alertId: string;
  alertHistoryId: string;
  /** Trace analysis for rule matching and semantic search */
  traceContext: {
    serviceName?: string;
    rootSpanName?: string;
    rootSpanStatusCode?: string;
    environment?: string;
    errorCount: number;
    hasErrors: boolean;
    errorPatterns: string[];
    anomalyTypes: string[];
  };
}

export interface MatchedKnowledgeArticle {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  excerpt: string;
  matchType: "RULE" | "SEMANTIC" | "DIRECT_LINK";
  matchScore: number;
  matchReason: string;
}

export interface RetrieveKnowledgeContextOutput {
  articles: MatchedKnowledgeArticle[];
  promptContext: string | null;
  totalMatches: number;
}

/**
 * Retrieve knowledge context for RCA generation.
 *
 * This activity combines:
 * 1. Rule-based matching using knowledge rules
 * 2. Semantic search using embeddings (if available)
 * 3. Direct entity links
 *
 * The output includes formatted context for the LLM prompt.
 */
export async function retrieveKnowledgeContext(
  input: RetrieveKnowledgeContextInput
): Promise<RetrieveKnowledgeContextOutput> {
  const { workspaceId, projectId, alertId, traceContext } = input;

  console.log(`[Knowledge] Retrieving knowledge context for RCA`, {
    workspaceId,
    projectId,
    alertId,
  });

  const matchedArticles: MatchedKnowledgeArticle[] = [];
  const seenArticleIds = new Set<string>();

  // Step 1: Evaluate knowledge rules
  try {
    const ruleMatches = await evaluateKnowledgeRules({
      workspaceId,
      projectId,
      traceContext: traceContext as unknown as Record<string, unknown>,
    });

    for (const match of ruleMatches.matches) {
      if (seenArticleIds.has(match.articleId)) continue;
      seenArticleIds.add(match.articleId);

      // Fetch article details
      const article = await prisma.knowledgeArticle.findUnique({
        where: { id: match.articleId },
        select: {
          id: true,
          title: true,
          slug: true,
          summary: true,
          content: true,
        },
      });

      if (article) {
        matchedArticles.push({
          id: article.id,
          title: article.title,
          slug: article.slug,
          summary: article.summary,
          excerpt: extractExcerpt(article.content, 300),
          matchType: "RULE",
          matchScore: 1.0, // Rule matches have high confidence
          matchReason: match.matchReason,
        });
      }
    }

    console.log(`[Knowledge] Rule matches: ${ruleMatches.matches.length}`);
  } catch (error) {
    console.warn(`[Knowledge] Rule evaluation failed:`, error);
  }

  // Step 2: Semantic search using error patterns
  if (traceContext.errorPatterns.length > 0) {
    try {
      const searchQuery = buildSearchQuery(traceContext);
      const semanticMatches = await searchKnowledgeBase({
        workspaceId,
        query: searchQuery,
        limit: 5,
      });

      for (const match of semanticMatches) {
        if (seenArticleIds.has(match.articleId)) continue;
        seenArticleIds.add(match.articleId);

        matchedArticles.push({
          id: match.articleId,
          title: match.title,
          slug: match.slug,
          summary: match.summary,
          excerpt: match.excerpt,
          matchType: "SEMANTIC",
          matchScore: match.score,
          matchReason: `Semantic match for: ${searchQuery.slice(0, 100)}`,
        });
      }

      console.log(`[Knowledge] Semantic matches: ${semanticMatches.length}`);
    } catch (error) {
      console.warn(`[Knowledge] Semantic search failed:`, error);
    }
  }

  // Step 3: Check for direct entity links
  try {
    const directLinks = await prisma.knowledgeLink.findMany({
      where: {
        entityType: "ALERT",
        entityId: alertId,
        article: {
          workspaceId,
          status: "PUBLISHED",
        },
      },
      include: {
        article: {
          select: {
            id: true,
            title: true,
            slug: true,
            summary: true,
            content: true,
          },
        },
      },
      take: 5,
    });

    for (const link of directLinks) {
      if (!link.article || seenArticleIds.has(link.article.id)) continue;
      seenArticleIds.add(link.article.id);

      matchedArticles.push({
        id: link.article.id,
        title: link.article.title,
        slug: link.article.slug,
        summary: link.article.summary,
        excerpt: extractExcerpt(link.article.content, 300),
        matchType: "DIRECT_LINK",
        matchScore: 1.0,
        matchReason: link.note || "Directly linked to this alert",
      });
    }

    console.log(`[Knowledge] Direct links: ${directLinks.length}`);
  } catch (error) {
    console.warn(`[Knowledge] Direct link lookup failed:`, error);
  }

  // Sort by match score (rule and direct links first, then semantic)
  matchedArticles.sort((a, b) => {
    // Prioritize RULE and DIRECT_LINK over SEMANTIC
    const typePriority = { RULE: 3, DIRECT_LINK: 2, SEMANTIC: 1 };
    const typeCompare =
      typePriority[b.matchType] - typePriority[a.matchType];
    if (typeCompare !== 0) return typeCompare;
    return b.matchScore - a.matchScore;
  });

  // Limit to top 5 articles
  const topArticles = matchedArticles.slice(0, 5);

  // Build prompt context
  let promptContext: string | null = null;
  if (topArticles.length > 0) {
    promptContext = buildKnowledgePromptContext(topArticles);
  }

  console.log(`[Knowledge] Total matches: ${topArticles.length}`);

  return {
    articles: topArticles,
    promptContext,
    totalMatches: topArticles.length,
  };
}

/**
 * Extract excerpt from content.
 */
function extractExcerpt(content: string, maxLength: number): string {
  // Remove markdown headers and formatting
  const cleanContent = content
    .replace(/^#+\s+.*$/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`]/g, "")
    .trim();

  if (cleanContent.length <= maxLength) {
    return cleanContent;
  }

  // Find a good break point
  const truncated = cleanContent.slice(0, maxLength);
  const lastPeriod = truncated.lastIndexOf(".");
  const lastSpace = truncated.lastIndexOf(" ");

  const breakPoint = lastPeriod > maxLength - 50 ? lastPeriod + 1 : lastSpace;
  return truncated.slice(0, breakPoint).trim() + "...";
}

/**
 * Build search query from trace context.
 */
function buildSearchQuery(traceContext: RetrieveKnowledgeContextInput["traceContext"]): string {
  const parts: string[] = [];

  // Add error patterns
  if (traceContext.errorPatterns.length > 0) {
    parts.push(...traceContext.errorPatterns.slice(0, 3));
  }

  // Add service context
  if (traceContext.serviceName) {
    parts.push(traceContext.serviceName);
  }

  // Add anomaly types
  if (traceContext.anomalyTypes.length > 0) {
    parts.push(...traceContext.anomalyTypes.slice(0, 2));
  }

  return parts.join(" ").slice(0, 500);
}

/**
 * Search knowledge base using embeddings.
 */
async function searchKnowledgeBase(params: {
  workspaceId: string;
  query: string;
  limit: number;
}): Promise<Array<{
  articleId: string;
  title: string;
  slug: string;
  summary: string | null;
  excerpt: string;
  score: number;
}>> {
  const { workspaceId, query, limit } = params;

  // Generate embedding for query
  const llm = getLLM();
  const embedResult = await llm.embed([query]);

  if (embedResult.embeddings.length === 0) {
    return [];
  }

  const queryEmbedding = embedResult.embeddings[0]!;

  // Search via internal procedure
  const caller = getInternalCaller();
  const results = await caller.internal.searchKnowledgeChunks({
    workspaceId,
    embedding: queryEmbedding,
    limit: limit * 2, // Get more chunks, then dedupe by article
  });

  // Dedupe and aggregate by article
  const articleScores = new Map<string, { score: number; chunk: typeof results.chunks[0] }>();

  for (const chunk of results.chunks) {
    const existing = articleScores.get(chunk.articleId);
    if (!existing || chunk.score > existing.score) {
      articleScores.set(chunk.articleId, { score: chunk.score, chunk });
    }
  }

  // Sort by score and take top N
  const sorted = Array.from(articleScores.entries())
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, limit);

  // Fetch article details
  const articleResults: Array<{
    articleId: string;
    title: string;
    slug: string;
    summary: string | null;
    excerpt: string;
    score: number;
  }> = [];

  for (const [articleId, { score, chunk }] of sorted) {
    const article = await prisma.knowledgeArticle.findUnique({
      where: { id: articleId },
      select: {
        id: true,
        title: true,
        slug: true,
        summary: true,
      },
    });

    if (article) {
      articleResults.push({
        articleId: article.id,
        title: article.title,
        slug: article.slug,
        summary: article.summary,
        excerpt: chunk.content.slice(0, 300),
        score,
      });
    }
  }

  return articleResults;
}

/**
 * Build knowledge context for LLM prompt.
 */
function buildKnowledgePromptContext(articles: MatchedKnowledgeArticle[]): string {
  const sections: string[] = [
    "## Relevant Knowledge Base Articles",
    "",
    "The following knowledge articles may be relevant to this incident:",
    "",
  ];

  for (let i = 0; i < articles.length; i++) {
    const article = articles[i]!;
    sections.push(`### ${i + 1}. ${article.title}`);
    sections.push(`**Match Reason:** ${article.matchReason}`);
    if (article.summary) {
      sections.push(`**Summary:** ${article.summary}`);
    }
    sections.push("");
    sections.push(article.excerpt);
    sections.push("");
  }

  sections.push(
    "Consider these knowledge articles when determining root cause and remediation steps."
  );

  return sections.join("\n");
}
