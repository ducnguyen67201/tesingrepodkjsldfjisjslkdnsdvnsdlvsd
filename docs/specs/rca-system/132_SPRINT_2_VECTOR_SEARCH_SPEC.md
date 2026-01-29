# Sprint 2: Vector Search - Semantic Code Search

**Sprint ID:** #127 Sprint 2
**Story Points:** 21
**Priority:** P0
**Dependencies:** Sprint 1 (Foundation) completed

---

## Sprint Goal

> Semantic code search operational: Code chunks have embeddings, vector similarity search returns relevant results in < 500ms, embeddings are cached for cost efficiency.

---

## Definition of Done

- [ ] pgvector extension enabled in PostgreSQL
- [ ] Code chunks have embeddings generated
- [ ] `searchCodebase` returns top-K relevant chunks
- [ ] Embeddings cached by content hash (> 50% cache hit rate on re-index)
- [ ] Search latency < 500ms P95

---

## Stories

### Story 1: pgvector Setup + Migrations

**Ticket ID:** #132
**Points:** 3
**Priority:** P0

#### Description

Enable the pgvector extension in PostgreSQL and add the embedding column to the `CodeChunk` table. Create HNSW index for fast similarity search.

#### Acceptance Criteria

- [ ] pgvector extension enabled (`CREATE EXTENSION vector`)
- [ ] `embedding` column added to `code_chunks` table
- [ ] HNSW index created for cosine similarity
- [ ] Migration runs on dev, staging, and production
- [ ] Verified with sample vector insert/query

#### Technical Details

**Migration SQL:**
```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column (1536 dimensions for text-embedding-3-small)
ALTER TABLE code_chunks
ADD COLUMN embedding vector(1536);

-- Create HNSW index for fast similarity search
-- HNSW is faster than IVFFlat for our expected data size
CREATE INDEX code_chunks_embedding_idx
ON code_chunks
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Index for filtering by repo before vector search
CREATE INDEX code_chunks_repo_embedding_idx
ON code_chunks (repo_id)
WHERE embedding IS NOT NULL;
```

**Prisma Schema Update:**
```prisma
model CodeChunk {
  // ... existing fields ...

  // pgvector embedding - use raw SQL for operations
  // Prisma doesn't natively support vector type
  embedding    Unsupported("vector(1536)")?

  @@index([repoId])
}
```

**Raw SQL Helper:**
```typescript
// packages/db/src/vector.ts
import { prisma } from "./client";

export async function setChunkEmbedding(
  chunkId: string,
  embedding: number[]
): Promise<void> {
  await prisma.$executeRaw`
    UPDATE code_chunks
    SET embedding = ${embedding}::vector
    WHERE id = ${chunkId}
  `;
}

export async function searchSimilarChunks(
  repoId: string,
  queryEmbedding: number[],
  topK: number = 10
): Promise<SimilarChunk[]> {
  return prisma.$queryRaw`
    SELECT
      id,
      file_path,
      start_line,
      end_line,
      content,
      language,
      1 - (embedding <=> ${queryEmbedding}::vector) as similarity
    FROM code_chunks
    WHERE repo_id = ${repoId}
      AND embedding IS NOT NULL
    ORDER BY embedding <=> ${queryEmbedding}::vector
    LIMIT ${topK}
  `;
}
```

#### Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/db/prisma/migrations/xxx_add_pgvector/migration.sql` | Create | Raw SQL migration |
| `packages/db/prisma/schema.prisma` | Modify | Add embedding column |
| `packages/db/src/vector.ts` | Create | Vector operation helpers |

#### Environment Requirements

```yaml
# docker-compose.yml - PostgreSQL with pgvector
services:
  postgres:
    image: pgvector/pgvector:pg16  # Use pgvector image
```

---

### Story 2: Embedding Generation Activity

**Ticket ID:** #133
**Points:** 5
**Priority:** P0

#### Description

Create a Temporal activity that generates embeddings for code chunks using OpenAI's text-embedding-3-small model. Implement batching for cost efficiency.

#### Acceptance Criteria

- [ ] Activity generates embeddings via OpenAI API
- [ ] Batches up to 100 chunks per API call
- [ ] Rate limiting to stay under API limits
- [ ] Handles API errors with retries
- [ ] Cost tracking logged per batch

#### Technical Details

**Embedding Model:**
- Model: `text-embedding-3-small`
- Dimensions: 1536
- Cost: $0.02 per 1M tokens
- Max batch size: 100 texts

**Activity Implementation:**
```typescript
// apps/worker/src/temporal/activities/embedding.activities.ts
import OpenAI from "openai";

const EMBEDDING_MODEL = "text-embedding-3-small";
const MAX_BATCH_SIZE = 100;
const MAX_TOKENS_PER_CHUNK = 8000;  // Leave buffer for model limit

interface EmbeddingInput {
  chunks: Array<{
    id: string;
    content: string;
    contentHash: string;
  }>;
}

interface EmbeddingResult {
  embeddings: Array<{
    chunkId: string;
    embedding: number[];
  }>;
  tokensUsed: number;
  cached: number;
  generated: number;
}

export async function generateEmbeddings(
  input: EmbeddingInput
): Promise<EmbeddingResult> {
  const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const results: EmbeddingResult["embeddings"] = [];
  let totalTokens = 0;
  let cached = 0;
  let generated = 0;

  // Check cache first
  const uncached = await filterUncachedChunks(input.chunks);
  cached = input.chunks.length - uncached.length;

  // Load cached embeddings
  const cachedEmbeddings = await loadCachedEmbeddings(
    input.chunks.filter(c => !uncached.find(u => u.id === c.id))
  );
  results.push(...cachedEmbeddings);

  // Process uncached in batches
  for (let i = 0; i < uncached.length; i += MAX_BATCH_SIZE) {
    const batch = uncached.slice(i, i + MAX_BATCH_SIZE);

    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch.map(c => truncateToTokenLimit(c.content)),
    });

    for (let j = 0; j < batch.length; j++) {
      results.push({
        chunkId: batch[j].id,
        embedding: response.data[j].embedding,
      });

      // Cache for future use
      await cacheEmbedding(batch[j].contentHash, response.data[j].embedding);
    }

    totalTokens += response.usage.total_tokens;
    generated += batch.length;

    // Log cost for monitoring
    const batchCost = (response.usage.total_tokens / 1_000_000) * 0.02;
    console.log(`Embedding batch: ${batch.length} chunks, ${response.usage.total_tokens} tokens, $${batchCost.toFixed(4)}`);
  }

  return {
    embeddings: results,
    tokensUsed: totalTokens,
    cached,
    generated,
  };
}
```

**Workflow Integration:**
```typescript
// Update github-index.workflow.ts
export async function githubIndexWorkflow(input: GitHubIndexInput): Promise<GitHubIndexResult> {
  // ... existing steps ...

  // 5. Store chunks first (without embeddings)
  const storedChunks = await storeIndexedData({
    repoId,
    event,
    payload,
    chunks: allChunks,
  });

  // 6. Generate embeddings for new chunks
  const embeddings = await generateEmbeddings({
    chunks: storedChunks.newChunks,
  });

  // 7. Store embeddings
  await storeEmbeddings({
    embeddings: embeddings.embeddings,
  });

  return {
    ...storedChunks,
    embeddingsGenerated: embeddings.generated,
    embeddingsCached: embeddings.cached,
    tokensUsed: embeddings.tokensUsed,
  };
}
```

#### Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/worker/src/temporal/activities/embedding.activities.ts` | Create | Embedding generation |
| `apps/worker/src/temporal/index.ts` | Modify | Export new activities |
| `apps/worker/src/workflows/github-index.workflow.ts` | Modify | Add embedding step |
| `packages/api/src/routers/internal.ts` | Modify | Add `storeEmbeddings` procedure |

#### Environment Variables

```env
OPENAI_API_KEY=sk-...
```

---

### Story 3: Vector Similarity Search

**Ticket ID:** #134
**Points:** 8
**Priority:** P0

#### Description

Implement the `searchCodebase` activity that performs vector similarity search against indexed code chunks. This is the core retrieval mechanism for RCA.

#### Acceptance Criteria

- [ ] `searchCodebase` activity returns top-K similar chunks
- [ ] Supports filtering by repository, file path patterns
- [ ] Returns similarity scores with results
- [ ] P95 latency < 500ms for 100K chunks
- [ ] Handles empty results gracefully

#### Technical Details

**Search Input/Output:**
```typescript
interface SearchCodebaseInput {
  projectId: string;
  query: string;              // Natural language or code query
  topK?: number;              // Default: 10
  filePatterns?: string[];    // Optional: ["*.ts", "src/**/*.py"]
  minSimilarity?: number;     // Default: 0.5
}

interface SearchResult {
  chunkId: string;
  filePath: string;
  startLine: number;
  endLine: number;
  content: string;
  language: string | null;
  similarity: number;         // 0-1, higher is better
}

interface SearchCodebaseOutput {
  results: SearchResult[];
  queryTokens: number;
  searchLatencyMs: number;
}
```

**Activity Implementation:**
```typescript
// apps/worker/src/temporal/activities/search.activities.ts

export async function searchCodebase(
  input: SearchCodebaseInput
): Promise<SearchCodebaseOutput> {
  const startTime = Date.now();

  // 1. Get repository ID for project
  const repo = await prisma.gitHubRepository.findUnique({
    where: { projectId: input.projectId },
    select: { id: true },
  });

  if (!repo) {
    return { results: [], queryTokens: 0, searchLatencyMs: 0 };
  }

  // 2. Generate embedding for query
  const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const queryEmbedding = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: input.query,
  });

  const queryVector = queryEmbedding.data[0].embedding;
  const queryTokens = queryEmbedding.usage.total_tokens;

  // 3. Perform vector similarity search
  const topK = input.topK ?? 10;
  const minSimilarity = input.minSimilarity ?? 0.5;

  let results: SearchResult[];

  if (input.filePatterns && input.filePatterns.length > 0) {
    // Search with file pattern filter
    results = await searchWithPatterns(
      repo.id,
      queryVector,
      topK,
      minSimilarity,
      input.filePatterns
    );
  } else {
    // Search all indexed files
    results = await searchAll(repo.id, queryVector, topK, minSimilarity);
  }

  return {
    results,
    queryTokens,
    searchLatencyMs: Date.now() - startTime,
  };
}

async function searchAll(
  repoId: string,
  queryVector: number[],
  topK: number,
  minSimilarity: number
): Promise<SearchResult[]> {
  const results = await prisma.$queryRaw<SearchResult[]>`
    SELECT
      id as "chunkId",
      file_path as "filePath",
      start_line as "startLine",
      end_line as "endLine",
      content,
      language,
      1 - (embedding <=> ${queryVector}::vector) as similarity
    FROM code_chunks
    WHERE repo_id = ${repoId}
      AND embedding IS NOT NULL
      AND 1 - (embedding <=> ${queryVector}::vector) >= ${minSimilarity}
    ORDER BY embedding <=> ${queryVector}::vector
    LIMIT ${topK}
  `;

  return results;
}

async function searchWithPatterns(
  repoId: string,
  queryVector: number[],
  topK: number,
  minSimilarity: number,
  patterns: string[]
): Promise<SearchResult[]> {
  // Convert glob patterns to SQL LIKE patterns
  const likePatterns = patterns.map(p =>
    p.replace(/\*/g, "%").replace(/\?/g, "_")
  );

  const results = await prisma.$queryRaw<SearchResult[]>`
    SELECT
      id as "chunkId",
      file_path as "filePath",
      start_line as "startLine",
      end_line as "endLine",
      content,
      language,
      1 - (embedding <=> ${queryVector}::vector) as similarity
    FROM code_chunks
    WHERE repo_id = ${repoId}
      AND embedding IS NOT NULL
      AND 1 - (embedding <=> ${queryVector}::vector) >= ${minSimilarity}
      AND (${Prisma.join(
        likePatterns.map(p => Prisma.sql`file_path LIKE ${p}`),
        " OR "
      )})
    ORDER BY embedding <=> ${queryVector}::vector
    LIMIT ${topK}
  `;

  return results;
}
```

#### Performance Optimization

**Index Tuning:**
```sql
-- HNSW parameters for ~100K chunks
-- m: connections per node (higher = more accurate, more memory)
-- ef_construction: build-time search width

CREATE INDEX code_chunks_embedding_idx
ON code_chunks
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- At query time, set ef_search for accuracy/speed tradeoff
SET hnsw.ef_search = 40;  -- Default is 40, increase for better recall
```

**Query Plan Verification:**
```sql
EXPLAIN ANALYZE
SELECT id, 1 - (embedding <=> '[...]'::vector) as similarity
FROM code_chunks
WHERE repo_id = 'xxx'
ORDER BY embedding <=> '[...]'::vector
LIMIT 10;

-- Should show "Index Scan using code_chunks_embedding_idx"
```

#### Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/worker/src/temporal/activities/search.activities.ts` | Create | Search activity |
| `apps/worker/src/temporal/index.ts` | Modify | Export search activities |
| `packages/db/src/vector.ts` | Modify | Add search helpers |

---

### Story 4: Embedding Caching by Content Hash

**Ticket ID:** #135
**Points:** 5
**Priority:** P1

#### Description

Implement caching of embeddings by content hash to avoid regenerating embeddings for unchanged code. This significantly reduces costs when re-indexing.

#### Acceptance Criteria

- [ ] Embeddings cached in Redis by content hash
- [ ] Cache hit rate > 50% on typical re-index
- [ ] Cache TTL: 30 days (configurable)
- [ ] Cache size monitored and bounded
- [ ] Graceful degradation if cache unavailable

#### Technical Details

**Cache Key Format:**
```
embedding:{contentHash}
```

**Cache Implementation:**
```typescript
// packages/shared/src/cache/embedding-cache.ts
import { Redis } from "ioredis";

const CACHE_PREFIX = "embedding:";
const CACHE_TTL_SECONDS = 30 * 24 * 60 * 60;  // 30 days

export class EmbeddingCache {
  constructor(private redis: Redis) {}

  async get(contentHash: string): Promise<number[] | null> {
    try {
      const key = `${CACHE_PREFIX}${contentHash}`;
      const cached = await this.redis.get(key);

      if (cached) {
        // Refresh TTL on hit
        await this.redis.expire(key, CACHE_TTL_SECONDS);
        return JSON.parse(cached);
      }

      return null;
    } catch (error) {
      console.warn("Embedding cache get failed:", error);
      return null;  // Graceful degradation
    }
  }

  async set(contentHash: string, embedding: number[]): Promise<void> {
    try {
      const key = `${CACHE_PREFIX}${contentHash}`;
      await this.redis.setex(
        key,
        CACHE_TTL_SECONDS,
        JSON.stringify(embedding)
      );
    } catch (error) {
      console.warn("Embedding cache set failed:", error);
      // Don't throw - cache is optional
    }
  }

  async getMany(contentHashes: string[]): Promise<Map<string, number[]>> {
    const results = new Map<string, number[]>();

    try {
      const keys = contentHashes.map(h => `${CACHE_PREFIX}${h}`);
      const values = await this.redis.mget(...keys);

      for (let i = 0; i < contentHashes.length; i++) {
        if (values[i]) {
          results.set(contentHashes[i], JSON.parse(values[i]));
        }
      }
    } catch (error) {
      console.warn("Embedding cache getMany failed:", error);
    }

    return results;
  }

  async setMany(entries: Array<{ contentHash: string; embedding: number[] }>): Promise<void> {
    try {
      const pipeline = this.redis.pipeline();

      for (const entry of entries) {
        const key = `${CACHE_PREFIX}${entry.contentHash}`;
        pipeline.setex(key, CACHE_TTL_SECONDS, JSON.stringify(entry.embedding));
      }

      await pipeline.exec();
    } catch (error) {
      console.warn("Embedding cache setMany failed:", error);
    }
  }
}
```

**Updated Embedding Activity:**
```typescript
export async function generateEmbeddings(
  input: EmbeddingInput
): Promise<EmbeddingResult> {
  const cache = new EmbeddingCache(redis);

  // 1. Check cache for all chunks
  const contentHashes = input.chunks.map(c => c.contentHash);
  const cached = await cache.getMany(contentHashes);

  // 2. Separate cached vs uncached
  const cachedResults: EmbeddingResult["embeddings"] = [];
  const uncachedChunks: typeof input.chunks = [];

  for (const chunk of input.chunks) {
    const cachedEmbedding = cached.get(chunk.contentHash);
    if (cachedEmbedding) {
      cachedResults.push({
        chunkId: chunk.id,
        embedding: cachedEmbedding,
      });
    } else {
      uncachedChunks.push(chunk);
    }
  }

  // 3. Generate embeddings for uncached only
  const newEmbeddings = await generateEmbeddingsFromAPI(uncachedChunks);

  // 4. Cache new embeddings
  await cache.setMany(
    newEmbeddings.map((e, i) => ({
      contentHash: uncachedChunks[i].contentHash,
      embedding: e.embedding,
    }))
  );

  return {
    embeddings: [...cachedResults, ...newEmbeddings],
    tokensUsed: newEmbeddings.length > 0 ? /* from API */ : 0,
    cached: cachedResults.length,
    generated: newEmbeddings.length,
  };
}
```

**Cache Metrics:**
```typescript
// Log cache metrics for monitoring
console.log(`Embedding cache: ${cached} hits, ${generated} misses, ${(cached / (cached + generated) * 100).toFixed(1)}% hit rate`);
```

#### Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/shared/src/cache/embedding-cache.ts` | Create | Cache implementation |
| `apps/worker/src/temporal/activities/embedding.activities.ts` | Modify | Use cache |

---

## Sprint Backlog Summary

| Story | Points | Assignee | Status |
|-------|--------|----------|--------|
| #132 pgvector setup | 3 | TBD | To Do |
| #133 Embedding generation | 5 | TBD | To Do |
| #134 Vector similarity search | 8 | TBD | To Do |
| #135 Embedding caching | 5 | TBD | To Do |
| **Total** | **21** | | |

---

## Dependencies & Blockers

| Dependency | Status | Notes |
|------------|--------|-------|
| Sprint 1 completed | ⏳ Pending | Code chunks in DB |
| pgvector Docker image | ✅ Available | `pgvector/pgvector:pg16` |
| OpenAI API key | ⚠️ Needed | Add to Doppler |
| Redis running | ✅ Done | Existing infra |

---

## Performance Benchmarks

| Operation | Target | Measurement |
|-----------|--------|-------------|
| Embedding generation (batch 100) | < 5s | API latency |
| Vector search (100K chunks) | < 500ms | P95 latency |
| Cache hit lookup | < 10ms | Redis RTT |
| Full re-index (10K files) | < 30 min | End-to-end |

---

## Definition of Ready (for Sprint 3)

By end of Sprint 2:
- [ ] All code chunks have embeddings
- [ ] Vector search returns relevant results
- [ ] Cache hit rate > 50% demonstrated
- [ ] Search latency < 500ms verified
