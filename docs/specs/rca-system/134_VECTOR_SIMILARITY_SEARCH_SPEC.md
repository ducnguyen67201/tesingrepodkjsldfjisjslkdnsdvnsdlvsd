# Engineering Spec: Vector Similarity Search

**Issue**: #134
**Sprint**: 2 - Vector Search
**Story Points**: 8
**Priority**: P0
**Status**: Implemented
**Author**: Engineering Team
**Created**: 2025-12-13
**Dependencies**: #132 (pgvector), #133 (Embedding Generation)

---

## Overview

Implement the `searchCodebase` activity that performs vector similarity search against indexed code chunks. This is the core retrieval mechanism for the RCA system, enabling semantic search of code based on error messages, stack traces, and natural language queries.

## Problem Statement

When an alert fires, the RCA system needs to find relevant code:

1. **Error messages** → Find code that might be causing the error
2. **Stack traces** → Find functions/classes mentioned in traces
3. **Natural language** → "Find authentication handling code"

This requires semantic search that understands code meaning, not just keyword matching.

## Goals

1. Create `searchCodebase` Temporal activity
2. Support filtering by repository, file patterns, and minimum similarity
3. Return top-K results with similarity scores
4. Achieve P95 latency < 500ms for 100K chunks
5. Create tRPC endpoint for UI access

## Non-Goals

- Embedding generation (Story #133)
- Embedding caching (Story #135)
- Multi-repository search (future)
- Hybrid search (keyword + vector)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     VECTOR SIMILARITY SEARCH FLOW                            │
└─────────────────────────────────────────────────────────────────────────────┘

                         Search Request
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Entry Points                                         │
│                                                                             │
│   ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐        │
│   │ Temporal        │    │ tRPC Router     │    │ RCA Workflow    │        │
│   │ Activity        │    │ (UI Access)     │    │ (Future)        │        │
│   │ searchCodebase  │    │ github.search   │    │                 │        │
│   └────────┬────────┘    └────────┬────────┘    └────────┬────────┘        │
│            │                      │                      │                  │
└────────────┼──────────────────────┼──────────────────────┼──────────────────┘
             │                      │                      │
             └──────────────────────┼──────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Search Service (Core Logic)                               │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │  1. Validate Input                                                  │  │
│   │     ├── Check query is not empty                                    │  │
│   │     ├── Validate topK (1-100)                                       │  │
│   │     └── Validate minSimilarity (0-1)                                │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                    │                                        │
│                                    ▼                                        │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │  2. Generate Query Embedding                                        │  │
│   │     ├── Call OpenAI text-embedding-3-small                          │  │
│   │     ├── 1536-dimensional vector                                     │  │
│   │     └── Track token usage                                           │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                    │                                        │
│                                    ▼                                        │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │  3. Vector Similarity Search                                        │  │
│   │     ├── Query PostgreSQL with pgvector                              │  │
│   │     ├── Use cosine similarity: 1 - (embedding <=> query)            │  │
│   │     ├── Apply filters (repo, file patterns)                         │  │
│   │     └── Order by similarity, limit to topK                          │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                    │                                        │
│                                    ▼                                        │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │  4. Format Results                                                  │  │
│   │     ├── Include chunk metadata (file, lines, language)             │  │
│   │     ├── Include similarity scores                                   │  │
│   │     └── Calculate search latency                                    │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PostgreSQL + pgvector                                │
│                                                                             │
│   SELECT id, file_path, content,                                            │
│          1 - (embedding <=> query::vector) as similarity                    │
│   FROM code_chunks                                                          │
│   WHERE repo_id = ?                                                         │
│     AND embedding IS NOT NULL                                               │
│     AND similarity >= min_similarity                                        │
│   ORDER BY embedding <=> query::vector                                      │
│   LIMIT topK                                                                │
│                                                                             │
│   Index: HNSW (m=16, ef_construction=64)                                    │
│   Operator: vector_cosine_ops                                               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Steps

### Step 1: Create Search Types

**File**: `apps/worker/src/temporal/types.ts`

Add search types:

```typescript
// ============================================
// Vector Search Types
// ============================================

/**
 * Input for searchCodebase activity
 */
export interface SearchCodebaseInput {
  /** Repository ID to search within */
  repoId: string;
  /** Natural language or code query */
  query: string;
  /** Maximum number of results (default: 10, max: 100) */
  topK?: number;
  /** Minimum similarity threshold 0-1 (default: 0.5) */
  minSimilarity?: number;
  /** Optional file patterns to filter (e.g., ["*.ts", "src/**"]) */
  filePatterns?: string[];
}

/**
 * Single search result
 */
export interface SearchResult {
  /** Code chunk ID */
  chunkId: string;
  /** Repository ID */
  repoId: string;
  /** File path within repository */
  filePath: string;
  /** Start line number (1-based) */
  startLine: number;
  /** End line number (1-based) */
  endLine: number;
  /** Code content */
  content: string;
  /** Programming language */
  language: string | null;
  /** Chunk type (function, class, module, block) */
  chunkType: string;
  /** Cosine similarity score (0-1, higher is better) */
  similarity: number;
}

/**
 * Output from searchCodebase activity
 */
export interface SearchCodebaseOutput {
  /** Search results ordered by similarity */
  results: SearchResult[];
  /** Query embedding tokens used */
  queryTokens: number;
  /** Total search latency in milliseconds */
  searchLatencyMs: number;
  /** Whether query was truncated */
  queryTruncated: boolean;
}

/**
 * Input for project-level search (resolves repo from project)
 */
export interface SearchProjectCodebaseInput {
  /** Project ID (will resolve to repository) */
  projectId: string;
  /** Natural language or code query */
  query: string;
  /** Maximum number of results */
  topK?: number;
  /** Minimum similarity threshold */
  minSimilarity?: number;
  /** Optional file patterns */
  filePatterns?: string[];
}
```

---

### Step 2: Create Search Activity

**File**: `apps/worker/src/temporal/activities/search.activities.ts`

```typescript
/**
 * Vector Similarity Search Activities
 *
 * Activities for semantic code search using pgvector.
 * Core retrieval mechanism for the RCA system.
 *
 * IMPORTANT: Read-only operations, no mutations.
 */

import OpenAI from "openai";
import { prisma } from "@ducsigr/db";
import { searchSimilarChunks, searchSimilarChunksWithPatterns } from "@ducsigr/db";
import { env } from "@/lib/env";
import type {
  SearchCodebaseInput,
  SearchCodebaseOutput,
  SearchProjectCodebaseInput,
  SearchResult,
} from "../types";

// ============================================
// Constants
// ============================================

/** OpenAI embedding model (must match indexing model) */
const EMBEDDING_MODEL = "text-embedding-3-small";

/** Maximum query length in characters */
const MAX_QUERY_LENGTH = 8000 * 3; // ~8000 tokens * 3 chars/token

/** Default number of results */
const DEFAULT_TOP_K = 10;

/** Maximum number of results */
const MAX_TOP_K = 100;

/** Default minimum similarity */
const DEFAULT_MIN_SIMILARITY = 0.5;

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

// ============================================
// Activity: Search Codebase
// ============================================

/**
 * Search for similar code chunks using vector similarity.
 *
 * Process:
 * 1. Generate embedding for query using OpenAI
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

  console.log(`[Search] Searching repo ${repoId} for: "${query.slice(0, 100)}..."`);

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

  // Generate query embedding
  const openai = getOpenAI();
  const embeddingResponse = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: queryText,
  });

  const queryEmbedding = embeddingResponse.data[0]!.embedding;
  const queryTokens = embeddingResponse.usage.total_tokens;

  console.log(`[Search] Generated query embedding (${queryTokens} tokens)`);

  // Perform vector search
  let results: SearchResult[];

  if (filePatterns && filePatterns.length > 0) {
    results = await searchSimilarChunksWithPatterns(
      repoId,
      queryEmbedding,
      filePatterns,
      topK,
      minSimilarity
    );
  } else {
    results = await searchSimilarChunks(
      repoId,
      queryEmbedding,
      topK,
      minSimilarity
    );
  }

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
```

---

### Step 3: Export Activity

**File**: `apps/worker/src/temporal/activities/index.ts`

Add exports:

```typescript
// ... existing exports ...

// Search activities
export {
  searchCodebase,
  searchProjectCodebase,
} from "./search.activities";
```

---

### Step 4: Create tRPC Endpoint for UI

**File**: `packages/api/src/routers/github.ts`

Add search endpoint:

```typescript
import { z } from "zod";
import OpenAI from "openai";
import { searchSimilarChunks, searchSimilarChunksWithPatterns } from "@ducsigr/db";

// Add to input schemas section:
const SearchCodebaseSchema = z.object({
  workspaceSlug: z.string(),
  repositoryId: z.string(),
  query: z.string().min(1).max(10000),
  topK: z.number().min(1).max(100).default(10),
  minSimilarity: z.number().min(0).max(1).default(0.5),
  filePatterns: z.array(z.string()).optional(),
});

// Add to router:

/**
 * Search codebase using vector similarity
 */
searchCodebase: protectedProcedure
  .input(SearchCodebaseSchema)
  .use(workspaceMiddleware)
  .query(async ({ ctx, input }) => {
    const { repositoryId, query, topK, minSimilarity, filePatterns } = input;
    const startTime = Date.now();

    // Verify repository belongs to workspace
    const repo = await prisma.gitHubRepository.findFirst({
      where: {
        id: repositoryId,
        installation: {
          workspaceId: ctx.workspace.id,
        },
      },
      select: { id: true, indexStatus: true },
    });

    if (!repo) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Repository not found",
      });
    }

    if (repo.indexStatus !== "READY") {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: `Repository is not indexed. Status: ${repo.indexStatus}`,
      });
    }

    // Generate query embedding
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: query.slice(0, 24000), // ~8K tokens max
    });

    const queryEmbedding = embeddingResponse.data[0]!.embedding;
    const queryTokens = embeddingResponse.usage.total_tokens;

    // Perform search
    let results;
    if (filePatterns && filePatterns.length > 0) {
      results = await searchSimilarChunksWithPatterns(
        repositoryId,
        queryEmbedding,
        filePatterns,
        topK,
        minSimilarity
      );
    } else {
      results = await searchSimilarChunks(
        repositoryId,
        queryEmbedding,
        topK,
        minSimilarity
      );
    }

    return {
      results: results.map((r) => ({
        chunkId: r.id,
        filePath: r.filePath,
        startLine: r.startLine,
        endLine: r.endLine,
        content: r.content,
        language: r.language,
        chunkType: r.chunkType,
        similarity: r.similarity,
      })),
      queryTokens,
      searchLatencyMs: Date.now() - startTime,
    };
  }),
```

---

### Step 5: Add OpenAI to API Package

**File**: `packages/api/package.json`

```json
{
  "dependencies": {
    "openai": "^4.76.0"
  }
}
```

---

### Step 6: Create Search Service (Shared Logic)

**File**: `packages/api/src/services/search.service.ts`

```typescript
/**
 * Search Service
 *
 * Shared logic for vector similarity search.
 * Used by both tRPC router and Temporal activities.
 */

import OpenAI from "openai";
import { prisma } from "@ducsigr/db";
import {
  searchSimilarChunks,
  searchSimilarChunksWithPatterns,
  type SimilarChunk,
} from "@ducsigr/db";

// ============================================
// Types
// ============================================

export interface SearchInput {
  repoId: string;
  query: string;
  topK?: number;
  minSimilarity?: number;
  filePatterns?: string[];
}

export interface SearchOutput {
  results: SimilarChunk[];
  queryTokens: number;
  searchLatencyMs: number;
}

// ============================================
// Constants
// ============================================

const EMBEDDING_MODEL = "text-embedding-3-small";
const DEFAULT_TOP_K = 10;
const MAX_TOP_K = 100;
const DEFAULT_MIN_SIMILARITY = 0.5;
const MAX_QUERY_CHARS = 24000; // ~8K tokens

// ============================================
// Service
// ============================================

export class SearchService {
  private openai: OpenAI;

  constructor(apiKey: string) {
    this.openai = new OpenAI({ apiKey });
  }

  /**
   * Search for similar code chunks.
   */
  async search(input: SearchInput): Promise<SearchOutput> {
    const startTime = Date.now();
    const {
      repoId,
      query,
      topK = DEFAULT_TOP_K,
      minSimilarity = DEFAULT_MIN_SIMILARITY,
      filePatterns,
    } = input;

    // Validate and normalize
    const effectiveTopK = Math.min(Math.max(topK, 1), MAX_TOP_K);
    const effectiveMinSimilarity = Math.min(Math.max(minSimilarity, 0), 1);
    const queryText = query.slice(0, MAX_QUERY_CHARS);

    // Generate embedding
    const embeddingResponse = await this.openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: queryText,
    });

    const queryEmbedding = embeddingResponse.data[0]!.embedding;
    const queryTokens = embeddingResponse.usage.total_tokens;

    // Search
    let results: SimilarChunk[];
    if (filePatterns && filePatterns.length > 0) {
      results = await searchSimilarChunksWithPatterns(
        repoId,
        queryEmbedding,
        filePatterns,
        effectiveTopK,
        effectiveMinSimilarity
      );
    } else {
      results = await searchSimilarChunks(
        repoId,
        queryEmbedding,
        effectiveTopK,
        effectiveMinSimilarity
      );
    }

    return {
      results,
      queryTokens,
      searchLatencyMs: Date.now() - startTime,
    };
  }

  /**
   * Search by project ID (resolves to repository).
   */
  async searchByProject(
    projectId: string,
    query: string,
    options?: Omit<SearchInput, "repoId" | "query">
  ): Promise<SearchOutput | null> {
    const repo = await prisma.gitHubRepository.findUnique({
      where: { projectId },
      select: { id: true },
    });

    if (!repo) {
      return null;
    }

    return this.search({ ...options, repoId: repo.id, query });
  }

  /**
   * Check if repository has embeddings.
   */
  async hasEmbeddings(repoId: string): Promise<boolean> {
    const count = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count
      FROM code_chunks
      WHERE repo_id = ${repoId}
        AND embedding IS NOT NULL
    `;
    return Number(count[0]?.count ?? 0) > 0;
  }
}
```

---

## Performance Optimization

### Query Time HNSW Settings

**File**: `packages/db/src/vector.ts`

Add query optimization:

```typescript
/**
 * Configure HNSW ef_search for accuracy/speed tradeoff.
 * Higher values = better recall, slower queries.
 *
 * Recommendations:
 * - 40: Default, good balance
 * - 100: High recall for RCA (more accurate)
 * - 200: Maximum recall (slow)
 */
export async function setSearchAccuracy(efSearch: number = 40): Promise<void> {
  await prisma.$executeRaw`SET hnsw.ef_search = ${efSearch}`;
}

/**
 * Search with custom HNSW ef_search setting.
 */
export async function searchSimilarChunksHighRecall(
  repoId: string,
  queryEmbedding: number[],
  topK: number = DEFAULT_TOP_K,
  minSimilarity: number = DEFAULT_MIN_SIMILARITY
): Promise<SimilarChunk[]> {
  // Set high recall for RCA use cases
  await setSearchAccuracy(100);

  const results = await searchSimilarChunks(
    repoId,
    queryEmbedding,
    topK,
    minSimilarity
  );

  // Reset to default
  await setSearchAccuracy(40);

  return results;
}
```

### Performance Benchmarks

| Chunk Count | Query Time (P50) | Query Time (P95) | Notes |
|-------------|------------------|------------------|-------|
| 1,000 | < 10ms | < 20ms | Small repo |
| 10,000 | < 30ms | < 50ms | Medium repo |
| 100,000 | < 100ms | < 200ms | Large repo |
| 1,000,000 | < 300ms | < 500ms | Very large |

---

## Testing Plan

### Unit Tests

**File**: `apps/worker/src/temporal/activities/__tests__/search.activities.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { searchCodebase, searchProjectCodebase } from "../search.activities";

// Mock OpenAI
vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(() => ({
    embeddings: {
      create: vi.fn().mockResolvedValue({
        data: [{ embedding: Array(1536).fill(0.1) }],
        usage: { total_tokens: 10 },
      }),
    },
  })),
}));

// Mock DB
vi.mock("@ducsigr/db", () => ({
  prisma: {
    gitHubRepository: {
      findUnique: vi.fn().mockResolvedValue({ id: "repo-1" }),
    },
  },
  searchSimilarChunks: vi.fn().mockResolvedValue([
    {
      id: "chunk-1",
      repoId: "repo-1",
      filePath: "src/index.ts",
      startLine: 1,
      endLine: 10,
      content: "function test() {}",
      language: "typescript",
      chunkType: "function",
      similarity: 0.95,
    },
  ]),
  searchSimilarChunksWithPatterns: vi.fn().mockResolvedValue([]),
}));

describe("searchCodebase", () => {
  it("should return search results", async () => {
    const result = await searchCodebase({
      repoId: "repo-1",
      query: "authentication handler",
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0].similarity).toBeGreaterThan(0.9);
    expect(result.queryTokens).toBeGreaterThan(0);
    expect(result.searchLatencyMs).toBeGreaterThan(0);
  });

  it("should return empty for empty query", async () => {
    const result = await searchCodebase({
      repoId: "repo-1",
      query: "",
    });

    expect(result.results).toHaveLength(0);
  });

  it("should respect topK parameter", async () => {
    const result = await searchCodebase({
      repoId: "repo-1",
      query: "test",
      topK: 5,
    });

    // Mock returns 1 result, but topK should be applied
    expect(result.results.length).toBeLessThanOrEqual(5);
  });
});

describe("searchProjectCodebase", () => {
  it("should resolve project to repository", async () => {
    const result = await searchProjectCodebase({
      projectId: "project-1",
      query: "test",
    });

    expect(result.results).toBeDefined();
  });

  it("should return empty if no repository", async () => {
    vi.mocked(
      await import("@ducsigr/db")
    ).prisma.gitHubRepository.findUnique.mockResolvedValueOnce(null);

    const result = await searchProjectCodebase({
      projectId: "unknown",
      query: "test",
    });

    expect(result.results).toHaveLength(0);
  });
});
```

### Integration Test

**File**: `packages/api/scripts/test-search.ts`

```typescript
import { SearchService } from "../src/services/search.service";
import { prisma } from "@ducsigr/db";

async function main() {
  console.log("Testing vector similarity search...\n");

  // Find a repository with embeddings
  const repo = await prisma.gitHubRepository.findFirst({
    where: {
      indexStatus: "READY",
    },
    select: { id: true, fullName: true },
  });

  if (!repo) {
    console.log("No indexed repository found. Run indexing first.");
    return;
  }

  console.log(`Testing with repository: ${repo.fullName}\n`);

  const searchService = new SearchService(process.env.OPENAI_API_KEY!);

  // Test 1: Basic search
  console.log("Test 1: Basic search");
  const result1 = await searchService.search({
    repoId: repo.id,
    query: "error handling",
    topK: 5,
  });
  console.log(`Found ${result1.results.length} results in ${result1.searchLatencyMs}ms`);
  for (const r of result1.results) {
    console.log(`  - ${r.filePath}:${r.startLine} (${r.similarity.toFixed(4)})`);
  }

  // Test 2: File pattern filter
  console.log("\nTest 2: With file pattern");
  const result2 = await searchService.search({
    repoId: repo.id,
    query: "database connection",
    topK: 5,
    filePatterns: ["*.ts"],
  });
  console.log(`Found ${result2.results.length} TypeScript results`);

  // Test 3: High similarity threshold
  console.log("\nTest 3: High similarity threshold");
  const result3 = await searchService.search({
    repoId: repo.id,
    query: "function main",
    topK: 10,
    minSimilarity: 0.8,
  });
  console.log(`Found ${result3.results.length} high-similarity results`);

  console.log("\nSearch tests completed!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

### Performance Test

**File**: `packages/api/scripts/benchmark-search.ts`

```typescript
import { SearchService } from "../src/services/search.service";
import { prisma, countChunksWithEmbeddings } from "@ducsigr/db";

async function main() {
  const repo = await prisma.gitHubRepository.findFirst({
    where: { indexStatus: "READY" },
  });

  if (!repo) {
    console.log("No indexed repository found.");
    return;
  }

  const { total, withEmbedding } = await countChunksWithEmbeddings(repo.id);
  console.log(`Repository: ${repo.fullName}`);
  console.log(`Chunks: ${total} (${withEmbedding} with embeddings)\n`);

  const searchService = new SearchService(process.env.OPENAI_API_KEY!);
  const queries = [
    "authentication middleware",
    "database connection pool",
    "error handling try catch",
    "API endpoint handler",
    "user validation",
  ];

  const latencies: number[] = [];

  for (const query of queries) {
    const result = await searchService.search({
      repoId: repo.id,
      query,
      topK: 10,
    });
    latencies.push(result.searchLatencyMs);
    console.log(`Query: "${query}" -> ${result.searchLatencyMs}ms`);
  }

  // Calculate statistics
  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)];
  const p95 = latencies[Math.floor(latencies.length * 0.95)];
  const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;

  console.log("\nPerformance Summary:");
  console.log(`  P50: ${p50}ms`);
  console.log(`  P95: ${p95}ms`);
  console.log(`  Avg: ${avg.toFixed(0)}ms`);

  if (p95! > 500) {
    console.log("\n⚠️ P95 exceeds 500ms target!");
  } else {
    console.log("\n✅ Performance within target (<500ms P95)");
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/worker/src/temporal/types.ts` | Modify | Add search types |
| `apps/worker/src/temporal/activities/search.activities.ts` | Create | Search activities |
| `apps/worker/src/temporal/activities/index.ts` | Modify | Export search |
| `packages/api/src/routers/github.ts` | Modify | Add search endpoint |
| `packages/api/src/services/search.service.ts` | Create | Shared search logic |
| `packages/api/package.json` | Modify | Add openai dependency |
| `packages/db/src/vector.ts` | Modify | Add HNSW tuning |

---

## Error Handling

| Error | Handling |
|-------|----------|
| Empty query | Return empty results |
| Repository not found | TRPCError NOT_FOUND |
| No embeddings | Return empty, log warning |
| OpenAI API error | Propagate for retry |
| Query too long | Truncate silently |

---

## Monitoring

### Metrics

1. **Search Latency**: P50, P95, P99
2. **Query Token Usage**: Track for cost
3. **Result Count**: Average results per query
4. **Similarity Distribution**: Track quality

### Logging

```
[Search] Searching repo repo-123 for: "authentication handler..."
[Search] Generated query embedding (15 tokens)
[Search] Found 8 results in 45ms (top similarity: 0.9234)
```

---

## Acceptance Criteria

- [ ] `searchCodebase` activity returns top-K similar chunks
- [ ] Supports filtering by repository ID
- [ ] Supports file pattern filtering (*.ts, src/**)
- [ ] Returns similarity scores (0-1) with results
- [ ] P95 latency < 500ms for 100K chunks
- [ ] Handles empty queries gracefully
- [ ] tRPC endpoint available for UI access
- [ ] Unit tests pass
- [ ] Performance benchmarks meet targets
