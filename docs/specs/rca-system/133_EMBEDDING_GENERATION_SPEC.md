# Engineering Spec: Embedding Generation Activity

**Issue**: #133
**Sprint**: 2 - Vector Search
**Story Points**: 5
**Priority**: P0
**Status**: Implemented
**Author**: Engineering Team
**Created**: 2025-12-13
**Dependencies**: #132 (pgvector Setup)

---

## Overview

Create a Temporal activity that generates embeddings for code chunks using OpenAI's text-embedding-3-small model. Implement batching for cost efficiency and integrate with the repository indexing workflow.

## Problem Statement

After Sprint 1, code chunks are stored in the database but have no vector representation. To enable semantic search, we need to:

1. Generate embeddings via OpenAI API
2. Batch requests for cost efficiency (API allows 100 texts per call)
3. Handle rate limits and retries gracefully
4. Store embeddings in the `code_chunks` table
5. Track costs for monitoring

## Goals

1. Create `generateEmbeddings` Temporal activity
2. Batch up to 100 chunks per API call
3. Implement rate limiting and retries
4. Track token usage and costs
5. Integrate with repository indexing workflow

## Non-Goals

- Embedding caching (Story #135)
- Similarity search (Story #134)
- Alternative embedding providers

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     EMBEDDING GENERATION FLOW                                │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                    repositoryIndexWorkflow                                   │
│                                                                             │
│   1. updateRepositoryIndexStatus("INDEXING")                                │
│   2. fetchRepositoryTree()                                                  │
│   3. fetchRepositoryContents()                                              │
│   4. chunkCodeFiles()                                                       │
│   5. storeRepositoryChunks()                                                │
│   ─────────────────────────────────────────────────────────────────────────│
│   6. generateEmbeddings()  ◀── NEW STEP                                     │
│   7. storeEmbeddings()     ◀── NEW STEP                                     │
│   ─────────────────────────────────────────────────────────────────────────│
│   8. updateRepositoryIndexStatus("READY")                                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    generateEmbeddings Activity                               │
│                                                                             │
│   Input:                                                                    │
│   ├── chunks: Array<{id, content, contentHash}>                             │
│   └── batchSize: number (default: 100)                                      │
│                                                                             │
│   Process:                                                                  │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │  For each batch of chunks (up to 100):                              │  │
│   │                                                                     │  │
│   │  1. Truncate content to token limit (8000 tokens)                   │  │
│   │  2. Call OpenAI embeddings.create()                                 │  │
│   │     ├── model: text-embedding-3-small                               │  │
│   │     └── input: [chunk1.content, chunk2.content, ...]                │  │
│   │  3. Match embeddings to chunk IDs                                   │  │
│   │  4. Track token usage                                               │  │
│   │  5. Add delay between batches (rate limiting)                       │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│   Output:                                                                   │
│   ├── embeddings: Array<{chunkId, embedding}>                               │
│   ├── tokensUsed: number                                                    │
│   └── estimatedCost: number                                                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    storeEmbeddings Activity                                  │
│                                                                             │
│   Input: Array<{chunkId, embedding}>                                        │
│                                                                             │
│   Process:                                                                  │
│   ├── Call internal.storeChunkEmbeddings via tRPC                           │
│   └── Uses setChunkEmbeddings() from packages/db/src/vector.ts              │
│                                                                             │
│   Output: { storedCount: number }                                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PostgreSQL                                           │
│                                                                             │
│   code_chunks.embedding = vector(1536)                                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Steps

### Step 1: Add OpenAI SDK Dependency

**File**: `apps/worker/package.json`

```json
{
  "dependencies": {
    "openai": "^4.76.0"
  }
}
```

```bash
cd apps/worker
pnpm add openai
```

---

### Step 2: Add Environment Variables

**File**: `apps/worker/src/lib/env.ts`

```typescript
import { z } from "zod";

const envSchema = z.object({
  // ... existing env vars ...

  // OpenAI API for embeddings
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
});

export const env = envSchema.parse(process.env);
```

**File**: `.env.example`

```env
# OpenAI API (for embeddings)
OPENAI_API_KEY=sk-...
```

---

### Step 3: Create Embedding Types

**File**: `apps/worker/src/temporal/types.ts`

Add to existing types file:

```typescript
// ============================================
// Embedding Generation Types
// ============================================

/**
 * Input for generateEmbeddings activity
 */
export interface GenerateEmbeddingsInput {
  chunks: EmbeddingChunk[];
  batchSize?: number;
}

/**
 * Chunk data for embedding generation
 */
export interface EmbeddingChunk {
  id: string;
  content: string;
  contentHash: string;
}

/**
 * Single embedding result
 */
export interface EmbeddingResult {
  chunkId: string;
  embedding: number[];
}

/**
 * Output from generateEmbeddings activity
 */
export interface GenerateEmbeddingsOutput {
  embeddings: EmbeddingResult[];
  tokensUsed: number;
  estimatedCost: number;
  chunksProcessed: number;
  batchCount: number;
}

/**
 * Input for storeEmbeddings activity
 */
export interface StoreEmbeddingsInput {
  embeddings: EmbeddingResult[];
}

/**
 * Output from storeEmbeddings activity
 */
export interface StoreEmbeddingsOutput {
  storedCount: number;
}
```

---

### Step 4: Create Embedding Activities

**File**: `apps/worker/src/temporal/activities/embedding.activities.ts`

```typescript
/**
 * Embedding Generation Activities
 *
 * Activities for generating and storing code chunk embeddings.
 * Uses OpenAI's text-embedding-3-small model.
 *
 * IMPORTANT: Follows READ-ONLY pattern - all storage via tRPC internal procedures.
 */

import OpenAI from "openai";
import { getInternalCaller } from "@/lib/trpc-caller";
import { env } from "@/lib/env";
import type {
  GenerateEmbeddingsInput,
  GenerateEmbeddingsOutput,
  EmbeddingResult,
  StoreEmbeddingsInput,
  StoreEmbeddingsOutput,
} from "../types";

// ============================================
// Constants
// ============================================

/** OpenAI embedding model */
const EMBEDDING_MODEL = "text-embedding-3-small";

/** Embedding dimensions for text-embedding-3-small */
const EMBEDDING_DIMENSIONS = 1536;

/** Cost per 1M tokens for text-embedding-3-small */
const COST_PER_MILLION_TOKENS = 0.02;

/** Maximum texts per API call */
const MAX_BATCH_SIZE = 100;

/** Default batch size */
const DEFAULT_BATCH_SIZE = 50;

/** Maximum tokens per chunk (leave buffer for model limit of 8191) */
const MAX_TOKENS_PER_CHUNK = 8000;

/** Approximate characters per token (conservative estimate) */
const CHARS_PER_TOKEN = 3;

/** Maximum characters per chunk */
const MAX_CHARS_PER_CHUNK = MAX_TOKENS_PER_CHUNK * CHARS_PER_TOKEN;

/** Delay between batches in ms (for rate limiting) */
const BATCH_DELAY_MS = 200;

// ============================================
// OpenAI Client
// ============================================

let _openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
    });
  }
  return _openai;
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
  // Truncate with ellipsis indicator
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

/**
 * Calculate estimated cost from token usage.
 */
function calculateCost(tokens: number): number {
  return (tokens / 1_000_000) * COST_PER_MILLION_TOKENS;
}

// ============================================
// Activity: Generate Embeddings
// ============================================

/**
 * Generate embeddings for code chunks using OpenAI API.
 *
 * Features:
 * - Batches requests for efficiency (up to 100 per call)
 * - Truncates long content to token limit
 * - Rate limits between batches
 * - Tracks token usage and cost
 *
 * @param input - Chunks to generate embeddings for
 * @returns Embeddings with usage stats
 */
export async function generateEmbeddings(
  input: GenerateEmbeddingsInput
): Promise<GenerateEmbeddingsOutput> {
  const { chunks, batchSize = DEFAULT_BATCH_SIZE } = input;

  console.log(`[Embedding] Starting embedding generation for ${chunks.length} chunks`);

  if (chunks.length === 0) {
    return {
      embeddings: [],
      tokensUsed: 0,
      estimatedCost: 0,
      chunksProcessed: 0,
      batchCount: 0,
    };
  }

  const openai = getOpenAI();
  const effectiveBatchSize = Math.min(batchSize, MAX_BATCH_SIZE);
  const batches = batchArray(chunks, effectiveBatchSize);

  const embeddings: EmbeddingResult[] = [];
  let totalTokens = 0;

  console.log(`[Embedding] Processing ${batches.length} batches of up to ${effectiveBatchSize} chunks`);

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]!;
    const batchNum = i + 1;

    console.log(`[Embedding] Processing batch ${batchNum}/${batches.length} (${batch.length} chunks)`);

    try {
      // Prepare input texts (truncated to token limit)
      const inputTexts = batch.map((chunk) => truncateToTokenLimit(chunk.content));

      // Call OpenAI API
      const response = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: inputTexts,
      });

      // Validate response
      if (response.data.length !== batch.length) {
        throw new Error(
          `Embedding count mismatch: expected ${batch.length}, got ${response.data.length}`
        );
      }

      // Match embeddings to chunk IDs
      for (let j = 0; j < batch.length; j++) {
        const chunk = batch[j]!;
        const embeddingData = response.data[j]!;

        // Validate dimensions
        if (embeddingData.embedding.length !== EMBEDDING_DIMENSIONS) {
          throw new Error(
            `Invalid embedding dimensions: expected ${EMBEDDING_DIMENSIONS}, got ${embeddingData.embedding.length}`
          );
        }

        embeddings.push({
          chunkId: chunk.id,
          embedding: embeddingData.embedding,
        });
      }

      // Track token usage
      totalTokens += response.usage.total_tokens;

      const batchCost = calculateCost(response.usage.total_tokens);
      console.log(
        `[Embedding] Batch ${batchNum} complete: ${batch.length} chunks, ` +
        `${response.usage.total_tokens} tokens, $${batchCost.toFixed(4)}`
      );

      // Rate limit delay (except for last batch)
      if (i < batches.length - 1) {
        await sleep(BATCH_DELAY_MS);
      }
    } catch (error) {
      // Log error details
      console.error(`[Embedding] Batch ${batchNum} failed:`, error);

      // Check for rate limit error
      if (error instanceof OpenAI.RateLimitError) {
        console.log(`[Embedding] Rate limited, waiting 60s before retry...`);
        await sleep(60_000);
        i--; // Retry this batch
        continue;
      }

      // Re-throw other errors to trigger Temporal retry
      throw error;
    }
  }

  const totalCost = calculateCost(totalTokens);

  console.log(
    `[Embedding] Generation complete: ${embeddings.length} embeddings, ` +
    `${totalTokens} tokens, $${totalCost.toFixed(4)}`
  );

  return {
    embeddings,
    tokensUsed: totalTokens,
    estimatedCost: totalCost,
    chunksProcessed: embeddings.length,
    batchCount: batches.length,
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
```

---

### Step 5: Add Internal tRPC Procedure

**File**: `packages/api/src/routers/internal.ts`

Add to existing internal router:

```typescript
import { setChunkEmbeddings } from "@ducsigr/db";

// Add to existing internal router:

/**
 * Store embeddings for code chunks
 * Called by: embedding.activities.ts → storeEmbeddings
 */
storeChunkEmbeddings: internalProcedure
  .input(z.object({
    embeddings: z.array(z.object({
      chunkId: z.string(),
      embedding: z.array(z.number()),
    })),
  }))
  .mutation(async ({ input }) => {
    const { embeddings } = input;

    if (embeddings.length === 0) {
      return { storedCount: 0 };
    }

    // Use batch operation from vector utilities
    await setChunkEmbeddings(
      embeddings.map((e) => ({
        chunkId: e.chunkId,
        embedding: e.embedding,
      }))
    );

    console.log(`[Internal:storeChunkEmbeddings] Stored ${embeddings.length} embeddings`);
    return { storedCount: embeddings.length };
  }),
```

---

### Step 6: Export Activities

**File**: `apps/worker/src/temporal/activities/index.ts`

Add exports:

```typescript
// ... existing exports ...

// Embedding activities
export {
  generateEmbeddings,
  storeEmbeddings,
} from "./embedding.activities";
```

---

### Step 7: Update Repository Index Workflow

**File**: `apps/worker/src/workflows/repository-index.workflow.ts`

Add embedding generation step:

```typescript
import {
  proxyActivities,
  log,
  ApplicationFailure,
} from "@temporalio/workflow";
import type * as activities from "../temporal/activities";
import type { RepositoryIndexInput, RepositoryIndexResult } from "../temporal/types";
import { ACTIVITY_RETRY } from "@ducsigr/shared";

// ============================================================
// Activity Configuration
// ============================================================

const {
  updateRepositoryIndexStatus,
  cleanupRepositoryChunks,
  fetchRepositoryTree,
  fetchRepositoryContents,
  chunkCodeFiles,
  storeRepositoryChunks,
  // NEW: Embedding activities
  generateEmbeddings,
  storeEmbeddings,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "30m",
  retry: {
    ...ACTIVITY_RETRY.DEFAULT,
    maximumAttempts: 3,
  },
});

// Separate config for embedding activities (longer timeout, more retries)
const embeddingActivities = proxyActivities<typeof activities>({
  startToCloseTimeout: "60m", // Longer for large repos
  retry: {
    ...ACTIVITY_RETRY.DEFAULT,
    maximumAttempts: 5, // More retries for API calls
  },
});

// ... existing constants ...

export async function repositoryIndexWorkflow(
  input: RepositoryIndexInput
): Promise<RepositoryIndexResult> {
  const { repositoryId, mode, owner, repo, branch } = input;

  log.info("Starting repository index workflow", {
    repositoryId,
    owner,
    repo,
    branch,
    mode,
  });

  try {
    // Step 1: Update status to INDEXING
    await updateRepositoryIndexStatus(repositoryId, "INDEXING");
    log.info("Status updated to INDEXING");

    // Step 2: If reindex, cleanup existing chunks first
    if (mode === "reindex") {
      log.info("Cleaning up existing chunks for reindex");
      await cleanupRepositoryChunks(repositoryId);
    }

    // Step 3: Fetch repository tree from GitHub API
    log.info("Fetching repository tree");
    const allFiles = await fetchRepositoryTree({
      installationId: input.installationId,
      owner,
      repo,
      branch,
    });
    log.info("Fetched file tree", { totalFiles: allFiles.length });

    // Step 4: Filter to indexable files
    const filesToIndex = allFiles.filter(shouldIndexFile);
    log.info("Filtered to indexable files", { count: filesToIndex.length });

    if (filesToIndex.length === 0) {
      log.info("No indexable files found");
      await updateRepositoryIndexStatus(repositoryId, "READY");
      return {
        success: true,
        filesProcessed: 0,
        chunksCreated: 0,
      };
    }

    // Step 5: Fetch file contents
    log.info("Fetching file contents");
    const fileContents = await fetchRepositoryContents({
      installationId: input.installationId,
      owner,
      repo,
      branch,
      files: filesToIndex,
    });
    log.info("Fetched file contents", { count: fileContents.length });

    // Step 6: Chunk the files
    log.info("Chunking files");
    const chunks = await chunkCodeFiles(fileContents);
    log.info("Created chunks", { count: chunks.length });

    // Step 7: Store chunks in database
    let chunksCreated = 0;
    if (chunks.length > 0) {
      log.info("Storing chunks");
      const storeResult = await storeRepositoryChunks({
        repositoryId,
        chunks,
      });
      chunksCreated = storeResult.chunksCreated;
      log.info("Stored chunks", { count: chunksCreated });

      // ================================================================
      // NEW: Step 8 - Generate embeddings for stored chunks
      // ================================================================
      log.info("Generating embeddings for chunks");
      const embeddingInput = chunks.map((chunk, index) => ({
        // Use stored chunk ID if available, otherwise construct from index
        id: `${repositoryId}-chunk-${index}`,
        content: chunk.content,
        contentHash: chunk.contentHash,
      }));

      const embeddingResult = await embeddingActivities.generateEmbeddings({
        chunks: embeddingInput,
        batchSize: 50,
      });

      log.info("Generated embeddings", {
        count: embeddingResult.chunksProcessed,
        tokens: embeddingResult.tokensUsed,
        cost: embeddingResult.estimatedCost,
      });

      // Step 9: Store embeddings
      if (embeddingResult.embeddings.length > 0) {
        log.info("Storing embeddings");
        await embeddingActivities.storeEmbeddings({
          embeddings: embeddingResult.embeddings,
        });
        log.info("Stored embeddings", { count: embeddingResult.embeddings.length });
      }
      // ================================================================
    }

    // Step 10: Update status to READY
    await updateRepositoryIndexStatus(repositoryId, "READY");

    log.info("Repository indexing completed successfully", {
      repositoryId,
      filesProcessed: fileContents.length,
      chunksCreated,
    });

    return {
      success: true,
      filesProcessed: fileContents.length,
      chunksCreated,
    };
  } catch (error) {
    log.error("Repository indexing failed", { error, repositoryId });

    try {
      await updateRepositoryIndexStatus(repositoryId, "FAILED");
    } catch (statusError) {
      log.error("Failed to update status to FAILED", { statusError });
    }

    if (error instanceof ApplicationFailure) {
      throw error;
    }

    return {
      success: false,
      filesProcessed: 0,
      chunksCreated: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
```

---

### Step 8: Update Workflow Result Type

**File**: `apps/worker/src/temporal/types.ts`

Update the result type to include embedding stats:

```typescript
/**
 * Repository index workflow result
 */
export interface RepositoryIndexResult {
  success: boolean;
  filesProcessed: number;
  chunksCreated: number;
  embeddingsGenerated?: number;
  embeddingTokensUsed?: number;
  embeddingCost?: number;
  error?: string;
}
```

---

## Testing Plan

### Unit Tests

**File**: `apps/worker/src/temporal/activities/__tests__/embedding.activities.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateEmbeddings, storeEmbeddings } from "../embedding.activities";

// Mock OpenAI
vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(() => ({
    embeddings: {
      create: vi.fn().mockResolvedValue({
        data: [{ embedding: Array(1536).fill(0.1) }],
        usage: { total_tokens: 100 },
      }),
    },
  })),
}));

describe("generateEmbeddings", () => {
  it("should generate embeddings for chunks", async () => {
    const result = await generateEmbeddings({
      chunks: [
        { id: "chunk-1", content: "function test() {}", contentHash: "abc123" },
      ],
    });

    expect(result.embeddings).toHaveLength(1);
    expect(result.embeddings[0].embedding).toHaveLength(1536);
    expect(result.tokensUsed).toBeGreaterThan(0);
  });

  it("should batch large inputs", async () => {
    const chunks = Array(150).fill(null).map((_, i) => ({
      id: `chunk-${i}`,
      content: `function test${i}() {}`,
      contentHash: `hash-${i}`,
    }));

    const result = await generateEmbeddings({ chunks, batchSize: 50 });

    expect(result.batchCount).toBe(3); // 150 / 50 = 3 batches
  });

  it("should truncate long content", async () => {
    const longContent = "x".repeat(50000); // ~16K tokens
    const result = await generateEmbeddings({
      chunks: [{ id: "chunk-1", content: longContent, contentHash: "hash" }],
    });

    expect(result.embeddings).toHaveLength(1);
  });
});
```

### Integration Test

```bash
# Manual test with real OpenAI API
cd apps/worker
OPENAI_API_KEY=sk-... pnpm tsx scripts/test-embeddings.ts
```

**File**: `apps/worker/scripts/test-embeddings.ts`

```typescript
import { generateEmbeddings } from "../src/temporal/activities/embedding.activities";

async function main() {
  console.log("Testing embedding generation...\n");

  const testChunks = [
    {
      id: "test-1",
      content: `
function calculateTotal(items: Item[]): number {
  return items.reduce((sum, item) => sum + item.price, 0);
}
      `,
      contentHash: "hash-1",
    },
    {
      id: "test-2",
      content: `
class UserService {
  constructor(private db: Database) {}

  async findById(id: string): Promise<User | null> {
    return this.db.users.findUnique({ where: { id } });
  }
}
      `,
      contentHash: "hash-2",
    },
  ];

  const result = await generateEmbeddings({ chunks: testChunks });

  console.log("Results:");
  console.log(`- Embeddings generated: ${result.embeddings.length}`);
  console.log(`- Tokens used: ${result.tokensUsed}`);
  console.log(`- Estimated cost: $${result.estimatedCost.toFixed(4)}`);
  console.log(`- Batches processed: ${result.batchCount}`);

  // Verify embedding dimensions
  for (const emb of result.embeddings) {
    if (emb.embedding.length !== 1536) {
      throw new Error(`Invalid dimensions for ${emb.chunkId}`);
    }
  }

  console.log("\nEmbedding generation test passed!");
}

main().catch(console.error);
```

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/worker/package.json` | Modify | Add openai dependency |
| `apps/worker/src/lib/env.ts` | Modify | Add OPENAI_API_KEY |
| `apps/worker/src/temporal/types.ts` | Modify | Add embedding types |
| `apps/worker/src/temporal/activities/embedding.activities.ts` | Create | Embedding activities |
| `apps/worker/src/temporal/activities/index.ts` | Modify | Export new activities |
| `apps/worker/src/workflows/repository-index.workflow.ts` | Modify | Add embedding step |
| `packages/api/src/routers/internal.ts` | Modify | Add storeChunkEmbeddings |
| `.env.example` | Modify | Add OPENAI_API_KEY |

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes | OpenAI API key for embeddings |

---

## Cost Estimation

### text-embedding-3-small Pricing

| Metric | Value |
|--------|-------|
| Cost per 1M tokens | $0.02 |
| Average tokens per chunk | ~200 |
| Cost per 1K chunks | ~$0.004 |

### Example Repository Costs

| Repository Size | Files | Chunks | Tokens | Cost |
|-----------------|-------|--------|--------|------|
| Small (100 files) | 100 | ~500 | ~100K | ~$0.002 |
| Medium (1K files) | 1,000 | ~5,000 | ~1M | ~$0.02 |
| Large (10K files) | 10,000 | ~50,000 | ~10M | ~$0.20 |

---

## Error Handling

| Error Type | Handling |
|------------|----------|
| Rate limit (429) | Wait 60s, retry |
| Invalid API key | Fail immediately |
| Timeout | Temporal retry (up to 5x) |
| Network error | Temporal retry |
| Invalid response | Log and fail batch |

---

## Monitoring

### Metrics to Track

1. **Token Usage**: Total tokens per repository indexing
2. **Cost**: Estimated cost per repository
3. **Latency**: Time per batch, total embedding time
4. **Error Rate**: Failed batches, retries
5. **Cache Hit Rate**: (Future - Story #135)

### Logging

All activities log:
- Batch progress
- Token usage per batch
- Cost per batch
- Errors with context

---

## Acceptance Criteria

- [ ] Activity generates embeddings via OpenAI API
- [ ] Batches up to 100 chunks per API call
- [ ] Rate limiting with 200ms delay between batches
- [ ] Handles rate limit errors with 60s wait and retry
- [ ] Truncates content exceeding 8000 tokens
- [ ] Tracks token usage and cost
- [ ] Stores embeddings via tRPC internal procedure
- [ ] Workflow integrates embedding generation
- [ ] Unit tests pass
- [ ] Integration test verifies end-to-end flow
