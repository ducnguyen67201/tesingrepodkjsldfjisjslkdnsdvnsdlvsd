# Sprint 2: Vector Search - How It Works

> **TL;DR**: Sprint 2 converts code text into numerical vectors, enabling the RCA system to find semantically relevant code when alerts fire.

---

## The Problem Sprint 2 Solves

After Sprint 1, we have code chunks stored in the database:

```
code_chunks table
├── id: "chunk-123"
├── filePath: "src/auth/login.ts"
├── content: "async function validateUser(token) { ... }"
├── contentHash: "a1b2c3..."
└── language: "typescript"
```

**But we can't search them intelligently.**

When an alert fires with an error like:
```
"TypeError: Cannot read property 'user' of undefined at AuthService.validate"
```

How do we find which code chunks are related?

- ❌ **Keyword search** fails: "user" appears in 500 files
- ❌ **Exact match** fails: error message isn't in any file
- ✅ **Semantic search** works: find code with similar *meaning*

---

## What Are Vector Embeddings?

Embeddings are numerical representations of text that capture meaning:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        TEXT → VECTOR EMBEDDING                               │
└─────────────────────────────────────────────────────────────────────────────┘

    "function validateUser(token) {           OpenAI API          1536 numbers
      const user = await findUser(token);  ─────────────────►  [0.023, -0.041,
      if (!user) throw new Error();                              0.018, 0.056,
      return user;                                               -0.032, 0.089,
    }"                                                           ... 1530 more]

                                                                     │
                                                                     ▼
                                                              This vector captures
                                                              the MEANING of the code:
                                                              - User validation
                                                              - Token authentication
                                                              - Error handling
```

**Key insight**: Similar code produces similar vectors.

```
Code A: "function validateUser(token) { ... }"     → Vector A: [0.023, -0.041, ...]
Code B: "async function checkUserToken(jwt) { }"   → Vector B: [0.025, -0.039, ...]
Code C: "function calculateTax(amount) { }"        → Vector C: [0.891, 0.234, ...]

Similarity(A, B) = 0.94  ← Very similar (both about user/token validation)
Similarity(A, C) = 0.12  ← Very different (authentication vs math)
```

---

## The Sprint 2 Transformation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SPRINT 2: CODE → SEARCHABLE VECTORS                       │
└─────────────────────────────────────────────────────────────────────────────┘

  BEFORE (Sprint 1)                              AFTER (Sprint 2)
  ─────────────────                              ─────────────────

  code_chunks table                              code_chunks table
  ├── id                                         ├── id
  ├── filePath                                   ├── filePath
  ├── content          ───── OpenAI API ─────►   ├── content
  ├── contentHash                                ├── contentHash
  └── language                                   ├── language
                                                 └── embedding vector(1536) ◀── NEW!


  Search capability:                             Search capability:
  ❌ None                                        ✅ Semantic similarity search
                                                 ✅ "Find code related to X"
                                                 ✅ < 500ms query time
```

---

## How Similarity Search Works

### Step 1: Query Embedding

When searching, we first convert the query to a vector:

```
Query: "user authentication token validation error"
                    │
                    ▼
            ┌───────────────┐
            │   OpenAI API  │
            │  Embeddings   │
            └───────┬───────┘
                    │
                    ▼
        Query Vector: [0.021, -0.043, 0.019, ...]
```

### Step 2: Vector Comparison

Compare query vector against all code chunk vectors:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         VECTOR SIMILARITY SEARCH                             │
└─────────────────────────────────────────────────────────────────────────────┘

  Query Vector ────────────────────────────────────────────────────────────────
       │
       │    ┌─────────────────────────────────────────────────────────────────┐
       │    │                    code_chunks table                            │
       │    │                                                                 │
       │    │   Chunk 1: src/auth/validate.ts                                │
       ├───►│   embedding: [0.022, -0.041, 0.020, ...]                        │
       │    │   similarity: 0.94 ◀── VERY SIMILAR                             │
       │    │                                                                 │
       │    │   Chunk 2: src/api/user-service.ts                              │
       ├───►│   embedding: [0.019, -0.038, 0.017, ...]                        │
       │    │   similarity: 0.87 ◀── SIMILAR                                  │
       │    │                                                                 │
       │    │   Chunk 3: src/utils/math.ts                                    │
       ├───►│   embedding: [0.891, 0.234, -0.567, ...]                        │
       │    │   similarity: 0.12 ◀── NOT SIMILAR                              │
       │    │                                                                 │
       │    │   ... 10,000 more chunks ...                                    │
       │    │                                                                 │
       │    └─────────────────────────────────────────────────────────────────┘
       │
       ▼
  Results (Top 10 by similarity):
  1. src/auth/validate.ts:45      (0.94)
  2. src/api/user-service.ts:23   (0.87)
  3. src/middleware/auth.ts:12    (0.82)
  ...
```

### Step 3: SQL Query (pgvector)

The actual database query uses pgvector's cosine distance operator:

```sql
SELECT
  id,
  file_path,
  content,
  1 - (embedding <=> query_vector) as similarity  -- Cosine similarity
FROM code_chunks
WHERE repo_id = 'abc123'
  AND embedding IS NOT NULL
ORDER BY embedding <=> query_vector  -- Order by distance (closest first)
LIMIT 10;
```

The `<=>` operator computes cosine distance. `1 - distance = similarity`.

---

## The Complete Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    COMPLETE SPRINT 2 DATA FLOW                               │
└─────────────────────────────────────────────────────────────────────────────┘


                         ┌──────────────────────────────────────┐
                         │         INDEXING PHASE               │
                         │      (When repo is enabled)          │
                         └──────────────────────────────────────┘

    GitHub Repository
          │
          ▼
    ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
    │   Fetch     │────►│   Chunk     │────►│   Store     │
    │   Files     │     │   Code      │     │   Chunks    │
    └─────────────┘     └─────────────┘     └──────┬──────┘
                                                   │
                                                   ▼
                                            ┌─────────────┐
                                            │   Check     │
                                            │   Cache     │◄─────┐
                                            └──────┬──────┘      │
                                                   │             │
                              ┌────────────────────┼─────────────┤
                              │                    │             │
                              ▼                    ▼             │
                        Cache HIT           Cache MISS           │
                        (Use cached         (Call OpenAI)        │
                         embedding)              │               │
                              │                  ▼               │
                              │           ┌─────────────┐        │
                              │           │   OpenAI    │        │
                              │           │   API       │────────┘
                              │           │             │   (Cache new
                              │           └──────┬──────┘    embeddings)
                              │                  │
                              └────────┬─────────┘
                                       │
                                       ▼
                              ┌─────────────────┐
                              │  Store in DB    │
                              │  embedding      │
                              │  column         │
                              └─────────────────┘



                         ┌──────────────────────────────────────┐
                         │          SEARCH PHASE                │
                         │      (When alert fires)              │
                         └──────────────────────────────────────┘

    Error Message / Stack Trace
    "TypeError: Cannot read 'user' of undefined"
          │
          ▼
    ┌─────────────┐
    │   OpenAI    │     Generate embedding for search query
    │   API       │
    └──────┬──────┘
           │
           ▼
    ┌─────────────────────────────────────────────────────────────────────────┐
    │                         PostgreSQL + pgvector                            │
    │                                                                         │
    │   SELECT *, 1 - (embedding <=> query) as similarity                     │
    │   FROM code_chunks                                                      │
    │   WHERE repo_id = ?                                                     │
    │   ORDER BY embedding <=> query                                          │
    │   LIMIT 10                                                              │
    │                                                                         │
    │   Uses HNSW index for O(log n) search instead of O(n)                   │
    │                                                                         │
    └─────────────────────────────────────────────────────────────────────────┘
           │
           ▼
    Top 10 Most Relevant Code Chunks
    ├── src/auth/validate.ts:45    (similarity: 0.94)
    ├── src/api/user-service.ts:23 (similarity: 0.87)
    └── src/middleware/auth.ts:12  (similarity: 0.82)
           │
           ▼
    ┌─────────────────────────────────────────────────────────────────────────┐
    │                    Sprint 3: RCA Engine                                  │
    │                                                                         │
    │   Uses these code chunks + recent commits + alert data                  │
    │   to generate root cause analysis                                       │
    │                                                                         │
    └─────────────────────────────────────────────────────────────────────────┘
```

---

## Why Each Story Matters

### #132: pgvector Setup

PostgreSQL doesn't natively support vector operations. pgvector adds:

```sql
-- New vector data type
embedding vector(1536)

-- Cosine distance operator
embedding <=> query_vector

-- HNSW index for fast search
CREATE INDEX ON code_chunks USING hnsw (embedding vector_cosine_ops)
```

Without pgvector, we'd need a separate vector database (Pinecone, Weaviate, etc.), adding infrastructure complexity.

### #133: Embedding Generation

Converts code text to vectors via OpenAI API:

```
Input:  "function validateUser(token) { const user = await findUser(token); }"
Output: [0.023, -0.041, 0.018, 0.056, -0.032, 0.089, ... 1530 more numbers]
```

**Batching**: Process 100 chunks per API call (cost efficiency)
**Rate limiting**: Avoid hitting OpenAI limits
**Cost**: ~$0.02 per 1M tokens (~$0.02 per 5,000 chunks)

### #134: Vector Similarity Search

The core search functionality:

```typescript
const results = await searchCodebase({
  repoId: "abc123",
  query: "user authentication error handling",
  topK: 10,
  minSimilarity: 0.5,
});

// Returns:
// [
//   { filePath: "src/auth/validate.ts", similarity: 0.94, content: "..." },
//   { filePath: "src/api/user.ts", similarity: 0.87, content: "..." },
//   ...
// ]
```

**Performance target**: < 500ms for 100K chunks (achieved via HNSW index)

### #135: Embedding Caching

Avoid regenerating embeddings for unchanged code:

```
First Index:
  1000 chunks → 1000 API calls → $0.004

Re-index (same code):
  1000 chunks → 650 cache hits + 350 API calls → $0.0014 (65% savings)

Re-index (after code changes):
  1000 chunks → 800 cache hits + 200 API calls → $0.0008 (80% savings)
```

Cache key: `embedding:{contentHash}`
TTL: 30 days

---

## Cost Analysis

### Embedding Generation Costs

| Model | Cost per 1M tokens | Dimensions |
|-------|-------------------|------------|
| text-embedding-3-small | $0.02 | 1536 |
| text-embedding-3-large | $0.13 | 3072 |

We use `text-embedding-3-small` for best cost/performance ratio.

### Example Repository Costs

| Repo Size | Files | Chunks | Tokens | Cost (no cache) | Cost (50% cache) |
|-----------|-------|--------|--------|-----------------|------------------|
| Small | 100 | 500 | 100K | $0.002 | $0.001 |
| Medium | 1,000 | 5,000 | 1M | $0.02 | $0.01 |
| Large | 10,000 | 50,000 | 10M | $0.20 | $0.10 |

### Search Costs

Each search query requires one embedding call:

- Average query: ~50 tokens
- Cost per search: $0.000001 (negligible)

---

## Performance Characteristics

### HNSW Index

HNSW (Hierarchical Navigable Small World) provides approximate nearest neighbor search:

```
                    Brute Force              HNSW Index
                    ───────────              ──────────
Complexity:         O(n)                     O(log n)
100K chunks:        ~500ms                   ~50ms
1M chunks:          ~5000ms                  ~100ms
Recall:             100%                     ~95-99%
```

### Query Time Breakdown

```
Total search time: ~200ms

├── Query embedding (OpenAI):  ~150ms
├── Vector search (pgvector):  ~40ms
└── Result formatting:         ~10ms
```

---

## Integration with Sprint 3 (RCA Engine)

Sprint 2 enables Sprint 3's core functionality:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SPRINT 3: RCA ENGINE                                 │
└─────────────────────────────────────────────────────────────────────────────┘

    Alert Fires: "Error rate spike in /api/users"
                              │
                              ▼
    ┌─────────────────────────────────────────────────────────────────────────┐
    │                      GATHER CONTEXT                                      │
    │                                                                         │
    │   1. Error traces from the alert window                                 │
    │   2. Recent commits (last 24h)                                          │
    │   3. Related code chunks ◀── SPRINT 2 SEARCH                            │
    │                                                                         │
    └─────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
    ┌─────────────────────────────────────────────────────────────────────────┐
    │                      LLM ANALYSIS                                        │
    │                                                                         │
    │   Claude analyzes:                                                      │
    │   - Error patterns in traces                                            │
    │   - Recent code changes                                                 │
    │   - Semantically related code ◀── FROM SPRINT 2                         │
    │                                                                         │
    │   Generates:                                                            │
    │   - Root cause hypothesis                                               │
    │   - Confidence score                                                    │
    │   - Remediation steps                                                   │
    │                                                                         │
    └─────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
    RCA Report:
    "The error is likely caused by commit abc123 which modified
     the user validation logic in src/auth/validate.ts. The change
     removed null checking, causing 'Cannot read user of undefined'
     when tokens expire."
```

---

## Summary

Sprint 2 bridges the gap between raw code storage and intelligent code retrieval:

| Before Sprint 2 | After Sprint 2 |
|-----------------|----------------|
| Code is stored as text | Code is stored as text + vectors |
| Can only do keyword search | Can do semantic similarity search |
| "Find files with 'user'" | "Find code related to authentication errors" |
| No RCA capability | RCA can find relevant code context |

**Sprint 2 is the foundation for intelligent code understanding in the RCA system.**
