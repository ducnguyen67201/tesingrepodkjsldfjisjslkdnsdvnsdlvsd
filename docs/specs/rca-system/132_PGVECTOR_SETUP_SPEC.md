# Engineering Spec: pgvector Setup + Migrations

**Issue**: #132
**Sprint**: 2 - Vector Search
**Story Points**: 3
**Priority**: P0
**Status**: Draft
**Author**: Engineering Team
**Created**: 2025-12-13

---

## Overview

Enable the pgvector extension in PostgreSQL and add the embedding column to the `CodeChunk` table. This establishes the foundation for semantic code search in the RCA system.

## Problem Statement

Currently, code chunks are stored with text content but have no vector representation. To enable semantic similarity search (finding code related to error messages), we need:

1. pgvector extension enabled in PostgreSQL
2. Embedding column added to `code_chunks` table
3. HNSW index for fast similarity search

## Goals

1. Enable pgvector extension via Prisma migration
2. Add `embedding` column to `CodeChunk` model
3. Create HNSW index for cosine similarity search
4. Provide TypeScript utilities for vector operations
5. Ensure migration runs safely on all environments

## Non-Goals

- Embedding generation (Story #133)
- Similarity search implementation (Story #134)
- Embedding caching (Story #135)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PGVECTOR INTEGRATION                                  │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                           Docker Compose                                     │
│                                                                             │
│   postgres:                                                                 │
│     image: pgvector/pgvector:pg16  ◀── pgvector pre-installed              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PostgreSQL Database                                  │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │  CREATE EXTENSION IF NOT EXISTS vector;                              │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │  code_chunks                                                         │  │
│   │  ├── id              VARCHAR (PK)                                    │  │
│   │  ├── repo_id         VARCHAR (FK)                                    │  │
│   │  ├── file_path       VARCHAR                                         │  │
│   │  ├── content         TEXT                                            │  │
│   │  ├── content_hash    VARCHAR                                         │  │
│   │  ├── embedding       vector(1536)  ◀── NEW COLUMN                    │  │
│   │  └── ...                                                             │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │  HNSW Index (code_chunks_embedding_idx)                              │  │
│   │  ├── m = 16 (connections per node)                                   │  │
│   │  ├── ef_construction = 64 (build-time search width)                  │  │
│   │  └── operator: vector_cosine_ops                                     │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         packages/db                                          │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │  schema.prisma                                                       │  │
│   │  ├── CodeChunk.embedding  Unsupported("vector(1536)")?               │  │
│   │  └── (Prisma doesn't natively support vector type)                   │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │  src/vector.ts                                                       │  │
│   │  ├── setChunkEmbedding()      - Store embedding via raw SQL          │  │
│   │  ├── setChunkEmbeddings()     - Batch store embeddings               │  │
│   │  ├── searchSimilarChunks()    - Vector similarity search             │  │
│   │  └── getChunkEmbedding()      - Retrieve embedding                   │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Steps

### Step 1: Update Docker Compose

**File**: `docker-compose.yml`

Update the PostgreSQL service to use the pgvector image:

```yaml
services:
  postgres:
    image: pgvector/pgvector:pg16  # Changed from postgres:16
    container_name: ducsigr-postgres
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-postgres}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-postgres}
      POSTGRES_DB: ${POSTGRES_DB:-ducsigr}
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5
```

**Note**: The `pgvector/pgvector:pg16` image includes the pgvector extension pre-installed.

---

### Step 2: Create Prisma Migration

**File**: `packages/db/prisma/migrations/YYYYMMDDHHMMSS_add_pgvector/migration.sql`

```sql
-- Enable pgvector extension
-- This is idempotent - safe to run multiple times
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column to code_chunks table
-- 1536 dimensions for OpenAI text-embedding-3-small model
ALTER TABLE code_chunks
ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Create HNSW index for fast similarity search
-- HNSW (Hierarchical Navigable Small World) is faster than IVFFlat for our scale
-- Parameters:
--   m = 16: connections per node (higher = more accurate, more memory)
--   ef_construction = 64: build-time search width (higher = better recall)
CREATE INDEX IF NOT EXISTS code_chunks_embedding_idx
ON code_chunks
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Create partial index for filtering by repo before vector search
-- This optimizes queries that filter by repo_id first
CREATE INDEX IF NOT EXISTS code_chunks_repo_has_embedding_idx
ON code_chunks (repo_id)
WHERE embedding IS NOT NULL;
```

---

### Step 3: Update Prisma Schema

**File**: `packages/db/prisma/schema.prisma`

```prisma
model CodeChunk {
  id          String   @id @default(cuid())
  repoId      String
  filePath    String
  startLine   Int
  endLine     Int
  content     String   @db.Text
  contentHash String
  language    String?
  chunkType   String   @default("block")
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  // pgvector embedding column - use raw SQL for operations
  // Prisma doesn't natively support vector type, so we use Unsupported
  // Operations: setChunkEmbedding(), searchSimilarChunks() in packages/db/src/vector.ts
  embedding   Unsupported("vector(1536)")?

  repo GitHubRepository @relation(fields: [repoId], references: [id], onDelete: Cascade)

  @@index([repoId, filePath])
  @@index([contentHash])
  @@map("code_chunks")
}
```

**Note**: The `Unsupported` type tells Prisma to pass the type through to the database without validation. All vector operations must use raw SQL.

---

### Step 4: Create Vector Utilities Module

**File**: `packages/db/src/vector.ts`

```typescript
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

import { prisma, Prisma } from "./client";

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
// Validation
// ============================================================

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
    UPDATE code_chunks
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
    FROM code_chunks
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

  // Validate all embeddings first
  for (const item of items) {
    validateEmbedding(item.embedding);
  }

  // Build batch update using CASE WHEN
  // This is more efficient than multiple UPDATE statements
  const ids = items.map((item) => item.chunkId);
  const cases = items
    .map((item) => {
      const vectorLiteral = formatVector(item.embedding);
      return `WHEN id = '${item.chunkId}' THEN '${vectorLiteral}'::vector`;
    })
    .join("\n      ");

  await prisma.$executeRaw`
    UPDATE code_chunks
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
      repo_id as "repoId",
      file_path as "filePath",
      start_line as "startLine",
      end_line as "endLine",
      content,
      language,
      chunk_type as "chunkType",
      1 - (embedding <=> ${Prisma.raw(`'${vectorLiteral}'::vector`)}) as similarity
    FROM code_chunks
    WHERE repo_id = ${repoId}
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

  // Convert glob patterns to SQL LIKE patterns
  const likePatterns = filePatterns.map((p) =>
    p.replace(/\*\*/g, "%").replace(/\*/g, "%").replace(/\?/g, "_")
  );

  const vectorLiteral = formatVector(queryEmbedding);

  // Build OR conditions for file patterns
  const patternConditions = likePatterns
    .map((pattern) => `file_path LIKE '${pattern}'`)
    .join(" OR ");

  const results = await prisma.$queryRaw<SimilarChunk[]>`
    SELECT
      id,
      repo_id as "repoId",
      file_path as "filePath",
      start_line as "startLine",
      end_line as "endLine",
      content,
      language,
      chunk_type as "chunkType",
      1 - (embedding <=> ${Prisma.raw(`'${vectorLiteral}'::vector`)}) as similarity
    FROM code_chunks
    WHERE repo_id = ${repoId}
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
    FROM code_chunks
    WHERE repo_id = ${repoId}
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
    UPDATE code_chunks
    SET embedding = NULL
    WHERE repo_id = ${repoId}
      AND embedding IS NOT NULL
  `;

  return result;
}
```

---

### Step 5: Export from Package

**File**: `packages/db/src/index.ts`

Add export for vector utilities:

```typescript
// ... existing exports ...

// Vector operations (pgvector)
export * from "./vector";
```

---

### Step 6: Add Package Dependencies

**File**: `packages/db/package.json`

No additional dependencies required. The vector utilities use only Prisma's built-in raw SQL capabilities.

---

## Database Migration Process

### Local Development

```bash
# 1. Stop existing containers
docker-compose down

# 2. Update docker-compose.yml with pgvector image
# (already done in Step 1)

# 3. Start with fresh database (optional - for clean slate)
docker-compose down -v
docker-compose up -d postgres

# 4. Wait for PostgreSQL to be ready
docker-compose logs -f postgres
# Look for: "database system is ready to accept connections"

# 5. Run Prisma migration
cd packages/db
pnpm prisma migrate dev --name add_pgvector

# 6. Verify extension is enabled
docker exec -it ducsigr-postgres psql -U postgres -d ducsigr -c "SELECT * FROM pg_extension WHERE extname = 'vector';"
```

### Production Deployment

```bash
# 1. Ensure PostgreSQL has pgvector extension installed
# For managed services (Supabase, Neon, etc.), enable pgvector in dashboard

# 2. Run migration
pnpm prisma migrate deploy

# 3. Verify
pnpm prisma db execute --file ./scripts/verify_pgvector.sql
```

**File**: `packages/db/scripts/verify_pgvector.sql`

```sql
-- Verify pgvector setup
DO $$
BEGIN
  -- Check extension exists
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    RAISE EXCEPTION 'pgvector extension not installed';
  END IF;

  -- Check column exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'code_chunks' AND column_name = 'embedding'
  ) THEN
    RAISE EXCEPTION 'embedding column not found in code_chunks';
  END IF;

  -- Check HNSW index exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'code_chunks_embedding_idx'
  ) THEN
    RAISE EXCEPTION 'HNSW index not found';
  END IF;

  RAISE NOTICE 'pgvector setup verified successfully';
END $$;
```

---

## Testing Plan

### Unit Tests

**File**: `packages/db/src/__tests__/vector.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../client";
import {
  setChunkEmbedding,
  getChunkEmbedding,
  setChunkEmbeddings,
  searchSimilarChunks,
  EMBEDDING_DIMENSIONS,
} from "../vector";

describe("Vector Operations", () => {
  const testRepoId = "test-repo-id";
  const testChunkIds: string[] = [];

  // Create test data
  beforeAll(async () => {
    // Create test repository and chunks
    // ...
  });

  afterAll(async () => {
    // Cleanup test data
    await prisma.codeChunk.deleteMany({
      where: { repoId: testRepoId },
    });
  });

  describe("setChunkEmbedding", () => {
    it("should store embedding for a chunk", async () => {
      const embedding = Array(EMBEDDING_DIMENSIONS).fill(0.1);
      await setChunkEmbedding(testChunkIds[0], embedding);

      const result = await getChunkEmbedding(testChunkIds[0]);
      expect(result).toHaveLength(EMBEDDING_DIMENSIONS);
    });

    it("should reject invalid dimensions", async () => {
      const invalidEmbedding = Array(100).fill(0.1);
      await expect(
        setChunkEmbedding(testChunkIds[0], invalidEmbedding)
      ).rejects.toThrow("Invalid embedding dimensions");
    });
  });

  describe("searchSimilarChunks", () => {
    it("should return chunks ordered by similarity", async () => {
      const queryEmbedding = Array(EMBEDDING_DIMENSIONS).fill(0.1);
      const results = await searchSimilarChunks(testRepoId, queryEmbedding, 5);

      expect(results.length).toBeLessThanOrEqual(5);
      if (results.length > 1) {
        // Verify descending similarity order
        for (let i = 1; i < results.length; i++) {
          expect(results[i - 1].similarity).toBeGreaterThanOrEqual(
            results[i].similarity
          );
        }
      }
    });

    it("should filter by minimum similarity", async () => {
      const queryEmbedding = Array(EMBEDDING_DIMENSIONS).fill(0.1);
      const results = await searchSimilarChunks(
        testRepoId,
        queryEmbedding,
        10,
        0.9
      );

      for (const result of results) {
        expect(result.similarity).toBeGreaterThanOrEqual(0.9);
      }
    });
  });
});
```

### Integration Test

```bash
# Manual verification script
cd packages/db

# 1. Create a test embedding
pnpm tsx scripts/test-vector.ts
```

**File**: `packages/db/scripts/test-vector.ts`

```typescript
import { prisma } from "../src/client";
import {
  setChunkEmbedding,
  getChunkEmbedding,
  searchSimilarChunks,
  EMBEDDING_DIMENSIONS,
} from "../src/vector";

async function main() {
  console.log("Testing pgvector integration...\n");

  // 1. Find a code chunk to test with
  const chunk = await prisma.codeChunk.findFirst();
  if (!chunk) {
    console.log("No code chunks found. Run indexing first.");
    return;
  }

  console.log(`Testing with chunk: ${chunk.id}`);
  console.log(`File: ${chunk.filePath}\n`);

  // 2. Create a test embedding
  const testEmbedding = Array(EMBEDDING_DIMENSIONS)
    .fill(0)
    .map(() => Math.random() * 2 - 1);

  // 3. Store embedding
  console.log("Storing embedding...");
  await setChunkEmbedding(chunk.id, testEmbedding);
  console.log("Stored successfully.\n");

  // 4. Retrieve embedding
  console.log("Retrieving embedding...");
  const retrieved = await getChunkEmbedding(chunk.id);
  console.log(`Retrieved ${retrieved?.length} dimensions.\n`);

  // 5. Search for similar chunks
  console.log("Searching for similar chunks...");
  const similar = await searchSimilarChunks(chunk.repoId, testEmbedding, 5);
  console.log(`Found ${similar.length} similar chunks:`);
  for (const result of similar) {
    console.log(`  - ${result.filePath}:${result.startLine} (similarity: ${result.similarity.toFixed(4)})`);
  }

  console.log("\npgvector integration test passed!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `docker-compose.yml` | Modify | Use pgvector/pgvector:pg16 image |
| `packages/db/prisma/migrations/xxx_add_pgvector/migration.sql` | Create | Enable pgvector, add column, create index |
| `packages/db/prisma/schema.prisma` | Modify | Add embedding column to CodeChunk |
| `packages/db/src/vector.ts` | Create | Vector operation utilities |
| `packages/db/src/index.ts` | Modify | Export vector utilities |
| `packages/db/scripts/verify_pgvector.sql` | Create | Verification script |
| `packages/db/scripts/test-vector.ts` | Create | Integration test script |
| `packages/db/src/__tests__/vector.test.ts` | Create | Unit tests |

---

## Environment Requirements

### Docker

```yaml
# docker-compose.yml
services:
  postgres:
    image: pgvector/pgvector:pg16  # Required for pgvector support
```

### Managed PostgreSQL Services

| Service | pgvector Support |
|---------|------------------|
| Supabase | ✅ Built-in, enable in dashboard |
| Neon | ✅ Built-in, enable in dashboard |
| Railway | ✅ Available as extension |
| Render | ✅ Enable via SQL |
| AWS RDS | ⚠️ Requires Aurora PostgreSQL 15.3+ |

---

## Performance Considerations

### HNSW Index Parameters

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| `m` | 16 | Balanced memory/accuracy for ~100K chunks |
| `ef_construction` | 64 | Good recall during index build |

### Query Time Settings

```sql
-- Set at query time for accuracy/speed tradeoff
SET hnsw.ef_search = 40;  -- Default, increase for better recall
```

### Expected Performance

| Operation | Expected Latency | Notes |
|-----------|------------------|-------|
| Insert embedding | < 10ms | Single row update |
| Batch insert (100) | < 100ms | Using CASE WHEN |
| Similarity search (10K chunks) | < 50ms | With HNSW index |
| Similarity search (100K chunks) | < 200ms | With HNSW index |

---

## Security Considerations

1. **Input Validation**: All embeddings are validated for correct dimensions
2. **SQL Injection**: Using Prisma's raw SQL with parameterized queries
3. **Access Control**: Vector operations use existing repository access controls

---

## Rollback Plan

If issues are encountered:

```sql
-- 1. Drop the HNSW index
DROP INDEX IF EXISTS code_chunks_embedding_idx;
DROP INDEX IF EXISTS code_chunks_repo_has_embedding_idx;

-- 2. Drop the embedding column
ALTER TABLE code_chunks DROP COLUMN IF EXISTS embedding;

-- 3. Optionally drop the extension
-- DROP EXTENSION IF EXISTS vector;
```

---

## Acceptance Criteria

- [ ] pgvector extension enabled via `CREATE EXTENSION vector`
- [ ] `embedding` column added to `code_chunks` table (vector(1536))
- [ ] HNSW index created with cosine similarity operator
- [ ] Migration runs without errors on local, staging, production
- [ ] Vector utilities module created with TypeScript types
- [ ] Unit tests pass for vector operations
- [ ] Integration test verifies insert/query functionality
- [ ] Performance verified: < 200ms search on 100K chunks
