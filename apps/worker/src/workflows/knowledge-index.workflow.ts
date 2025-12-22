/**
 * Knowledge Index Workflow
 *
 * Temporal workflow for indexing knowledge articles for semantic search.
 *
 * Steps:
 * 1. Clear existing chunks (for re-index)
 * 2. Chunk article content (markdown-aware)
 * 3. Store chunks via internal procedure
 * 4. Generate embeddings via LLM Center
 * 5. Store embeddings via internal procedure
 * 6. Update searchText for keyword search
 *
 * Triggered when:
 * - Article is published (publishArticle)
 * - Article content is updated (updateArticle on published article)
 * - Manual re-index request
 */

import { proxyActivities } from "@temporalio/workflow";
import { ACTIVITY_RETRY } from "@cognobserve/shared";
import type * as activities from "../temporal/activities/knowledge.activities";

// ============================================
// Activity Proxies
// ============================================

const {
  getArticleForIndexing,
  clearArticleChunks,
  chunkArticleContent,
  storeKnowledgeChunks,
  generateKnowledgeEmbeddings,
  storeKnowledgeEmbeddings,
  updateArticleSearchText,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "5m",
  retry: ACTIVITY_RETRY.DEFAULT,
});

// ============================================
// Workflow Input/Output Types
// ============================================

export interface KnowledgeIndexWorkflowInput {
  articleId: string;
  /** If true, forces re-index even if already indexed */
  forceReindex?: boolean;
}

export interface KnowledgeIndexWorkflowOutput {
  articleId: string;
  chunksCreated: number;
  embeddingsGenerated: number;
  tokensUsed: number;
  estimatedCost: number;
  cached: number;
  durationMs: number;
}

// ============================================
// Workflow Implementation
// ============================================

/**
 * Index a knowledge article for semantic search.
 *
 * This workflow:
 * 1. Fetches the article content
 * 2. Clears any existing chunks
 * 3. Chunks the content into semantic units
 * 4. Stores the chunks
 * 5. Generates embeddings for each chunk
 * 6. Stores the embeddings
 * 7. Updates the searchText for keyword search
 */
export async function knowledgeIndexWorkflow(
  input: KnowledgeIndexWorkflowInput
): Promise<KnowledgeIndexWorkflowOutput> {
  const startTime = Date.now();
  const { articleId, forceReindex } = input;

  console.log(`[KnowledgeIndexWorkflow] Starting for article ${articleId}`);

  // Step 1: Fetch article for indexing
  const article = await getArticleForIndexing(articleId);

  if (!article) {
    throw new Error(`Article ${articleId} not found`);
  }

  console.log(`[KnowledgeIndexWorkflow] Found article: ${article.title}`);

  // Step 2: Clear existing chunks (for clean re-index)
  if (forceReindex) {
    const cleared = await clearArticleChunks(articleId);
    console.log(`[KnowledgeIndexWorkflow] Cleared ${cleared.deletedCount} existing chunks`);
  }

  // Step 3: Chunk the article content
  const chunkResult = await chunkArticleContent({
    articleId,
    workspaceId: article.workspaceId,
    content: article.content,
    title: article.title,
    summary: article.summary,
  });

  console.log(`[KnowledgeIndexWorkflow] Created ${chunkResult.totalChunks} chunks`);

  if (chunkResult.chunks.length === 0) {
    console.log(`[KnowledgeIndexWorkflow] No chunks created, skipping embedding`);
    return {
      articleId,
      chunksCreated: 0,
      embeddingsGenerated: 0,
      tokensUsed: 0,
      estimatedCost: 0,
      cached: 0,
      durationMs: Date.now() - startTime,
    };
  }

  // Step 4: Store chunks
  const storeResult = await storeKnowledgeChunks({
    articleId,
    workspaceId: article.workspaceId,
    chunks: chunkResult.chunks,
  });

  console.log(`[KnowledgeIndexWorkflow] Stored ${storeResult.chunksCreated} chunks`);

  // Step 5: Generate embeddings
  const embeddingResult = await generateKnowledgeEmbeddings({
    chunks: storeResult.chunkIds.map((id, index) => ({
      id,
      content: chunkResult.chunks[index]!.content,
      contentHash: chunkResult.chunks[index]!.contentHash,
    })),
  });

  console.log(
    `[KnowledgeIndexWorkflow] Generated ${embeddingResult.embeddings.length} embeddings ` +
      `(${embeddingResult.cached} cached, ${embeddingResult.generated} generated)`
  );

  // Step 6: Store embeddings
  if (embeddingResult.embeddings.length > 0) {
    await storeKnowledgeEmbeddings({
      embeddings: embeddingResult.embeddings,
    });
  }

  // Step 7: Update searchText for keyword search
  await updateArticleSearchText({
    articleId,
    title: article.title,
    summary: article.summary,
    content: article.content,
    tags: article.tags,
  });

  const durationMs = Date.now() - startTime;

  console.log(
    `[KnowledgeIndexWorkflow] Complete for ${articleId}: ` +
      `${storeResult.chunksCreated} chunks, ${embeddingResult.embeddings.length} embeddings, ` +
      `${embeddingResult.tokensUsed} tokens, $${embeddingResult.estimatedCost.toFixed(6)}, ` +
      `${durationMs}ms`
  );

  return {
    articleId,
    chunksCreated: storeResult.chunksCreated,
    embeddingsGenerated: embeddingResult.embeddings.length,
    tokensUsed: embeddingResult.tokensUsed,
    estimatedCost: embeddingResult.estimatedCost,
    cached: embeddingResult.cached,
    durationMs,
  };
}
