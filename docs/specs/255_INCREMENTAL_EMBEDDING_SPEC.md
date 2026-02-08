# Engineering Spec: Incremental Push Embedding Generation

> **Sprint**: Codebase Indexing v2
> **Priority**: P0 (blocks demo - RCA can't find new code)
> **Estimated Effort**: 3-5 story points
> **Author**: Senior Architect + Scrum Master

---

## 1. Problem Statement

### The Gap

When code is pushed to the default branch, the `githubIndexWorkflow` processes changed files and stores code chunks - but **never generates embeddings**. This means:

- New/modified code is stored as text in `CodeChunk` table
- But the `embedding` column remains `NULL`
- RCA's vector search (`searchSimilarChunks`) only finds chunks WITH embeddings
- **New code is invisible to Root Cause Analysis**

### Current Flows Compared

```
Full Repo Index (repository-index.workflow.ts) - COMPLETE:
  fetch tree → filter → fetch contents → chunk → store chunks
  → generate embeddings → store embeddings → READY ✅

Incremental Push (github-index.workflow.ts) - BROKEN:
  extract changed files → filter → fetch contents → chunk
  → store chunks → DONE ❌ (no embeddings!)
```

### Impact

| Scenario | What Happens |
|----------|-------------|
| User connects repo | Full index runs → all code searchable ✅ |
| Developer pushes new file | Chunk stored but NOT searchable ❌ |
| Developer modifies file | Old chunks deleted, new chunks stored WITHOUT embeddings ❌ |
| RCA runs after push | Can't find code from recent pushes, misses root cause ❌ |
| Demo: "We auto-sync on push" | Claim is half-true - syncs text but not vector search ❌ |

---

## 2. Design Inspiration: Cursor's Approach

Reference: [Cursor Secure Codebase Indexing](https://cursor.com/blog/secure-codebase-indexing)

### Key Ideas We Can Adopt

| Cursor Pattern | Our Adaptation |
|----------------|----------------|
| **Merkle tree for change detection** | We already have `contentHash` (SHA-256) per chunk - use for embedding cache |
| **Embedding caching by content hash** | Already implemented in `generateEmbeddings` activity (Redis, 30-day TTL) |
| **Async background embedding** | Temporal workflow already runs async - just add the steps |
| **Batch processing** | Already have batch support (50-100 chunks per API call) |
| **Incremental updates (only changed branches)** | Webhook already filters to default branch pushes only |
| **Deduplication across re-indexes** | `contentHash` dedup exists in `storeRepositoryChunks` but NOT in `storeGitHubIndex` |

### What Cursor Does That We Should Add

1. **Content-hash deduplication at chunk storage** - Cursor skips re-embedding unchanged chunks. Our `storeGitHubIndex` uses `createMany` (no dedup), while `storeRepositoryChunks` properly deduplicates by `contentHash`. We need to align.

2. **Embedding cache hit optimization** - Cursor reports cache metrics. Our `generateEmbeddings` already caches by `contentHash` in Redis, so identical code across files/branches won't re-embed. This is free once we wire it up.

3. **Async non-blocking embedding** - Cursor generates embeddings asynchronously. Our Temporal workflow already handles this - embedding generation won't block the push acknowledgment.

---

## 3. Technical Design

### 3.1 Architecture

```
                    GitHub Push Event (webhook)
                              │
                              ▼
                    ┌─────────────────────┐
                    │  github-index       │
                    │  workflow            │
                    └─────────┬───────────┘
                              │
               ┌──────────────┼──────────────┐
               ▼              ▼              ▼
        ┌────────────┐ ┌────────────┐ ┌────────────┐
        │ extract    │ │ fetch      │ │ chunk      │
        │ changed    │ │ contents   │ │ files      │
        │ files      │ │            │ │            │
        └────────────┘ └────────────┘ └────────────┘
                              │
                              ▼
                    ┌─────────────────────┐
                    │  storeGitHubIndex   │  ← CHANGE: return chunkIds
                    │  (tRPC internal)     │
                    └─────────┬───────────┘
                              │
                    ┌─────────┴───────────┐  ← NEW STEPS
                    ▼                     ▼
           ┌──────────────┐     ┌──────────────────┐
           │ generate     │     │ store            │
           │ Embeddings   │────▶│ Embeddings       │
           │ (LLM API)    │     │ (pgvector)       │
           └──────────────┘     └──────────────────┘
                                        │
                                        ▼
                              Chunks now searchable
                              by RCA vector search ✅
```

### 3.2 Changes Required

#### Change 1: `GitHubService.storeIndexedData()` must return chunk IDs

**File**: `packages/api/src/services/github.service.ts`

**Current**: `createChunks` uses `createMany` which returns `{ count }` only.
**Problem**: We need chunk IDs to generate embeddings.

**Solution**: Replace `createMany` with individual `create` calls in a transaction, or query back IDs after insert using `contentHash` match.

```typescript
// BEFORE (current)
private static async createChunks(tx, repoId, chunks): Promise<number> {
  const result = await tx.codeChunk.createMany({
    data: chunks.map(chunk => ({ repoId, ...chunk })),
  });
  return result.count;
}

// Return type changes
static async storeIndexedData(input): Promise<{ chunksCreated: number }> // BEFORE
static async storeIndexedData(input): Promise<{ chunksCreated: number; chunkIds: string[] }> // AFTER
```

**Recommended approach**: After `createMany`, query back the IDs:
```typescript
private static async createChunks(tx, repoId, chunks): Promise<string[]> {
  if (chunks.length === 0) return [];

  // Insert chunks
  await tx.codeChunk.createMany({
    data: chunks.map(chunk => ({ repoId, ...chunk })),
    skipDuplicates: true,
  });

  // Query back IDs by contentHash (unique within repo)
  const created = await tx.codeChunk.findMany({
    where: {
      repoId,
      contentHash: { in: chunks.map(c => c.contentHash) },
    },
    select: { id: true, contentHash: true },
  });

  // Return IDs in same order as input chunks
  const hashToId = new Map(created.map(c => [c.contentHash, c.id]));
  return chunks.map(c => hashToId.get(c.contentHash)).filter((id): id is string => !!id);
}
```

#### Change 2: Wire embedding activities into `githubIndexWorkflow`

**File**: `apps/worker/src/workflows/github-index.workflow.ts`

Add `generateEmbeddings` and `storeEmbeddings` activity proxies (same pattern as `repository-index.workflow.ts`):

```typescript
// Add to activity configuration
const {
  generateEmbeddings,
  storeEmbeddings,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "60m",
  retry: {
    ...ACTIVITY_RETRY.DEFAULT,
    maximumAttempts: 5,
  },
});
```

Add embedding steps after `storeIndexedData` in `handlePushEvent`:

```typescript
// After storeIndexedData returns
const result = await storeIndexedData({ ... });

// NEW: Generate and store embeddings if chunks were created
if (result.chunkIds.length > 0) {
  const embeddingChunks = result.chunkIds.map((id, index) => ({
    id,
    content: chunks[index]!.content,
    contentHash: chunks[index]!.contentHash,
  }));

  const embeddingResult = await generateEmbeddings({ chunks: embeddingChunks });

  if (embeddingResult.embeddings.length > 0) {
    await storeEmbeddings({ embeddings: embeddingResult.embeddings });
  }

  log.info("Embeddings generated for push", {
    generated: embeddingResult.generated,
    cached: embeddingResult.cached,
    tokensUsed: embeddingResult.tokensUsed,
  });
}
```

#### Change 3: Handle deleted files' orphaned embeddings

**File**: `packages/api/src/services/github.service.ts` → `deleteChunksForFiles`

Current: Deletes chunks for changed files (correct - old chunks removed before new ones inserted).

**No change needed** - when chunks are deleted, their embeddings go with them (cascade). New chunks get new embeddings.

### 3.3 Data Flow After Fix

```
Push event: modified src/routes/api.ts
  │
  ├─ 1. Extract changed files: ["src/routes/api.ts"]
  ├─ 2. Filter: indexable ✅
  ├─ 3. Fetch content from GitHub API
  ├─ 4. Chunk: 3 chunks (function A, function B, module)
  ├─ 5. Store:
  │     ├─ Delete old chunks for src/routes/api.ts
  │     ├─ Insert 3 new chunks
  │     └─ Return chunkIds: ["clx1...", "clx2...", "clx3..."]
  ├─ 6. Generate embeddings:
  │     ├─ Check Redis cache by contentHash
  │     ├─ Cache hit: chunk "clx1" (unchanged function) → skip API call
  │     ├─ Cache miss: chunks "clx2", "clx3" → batch embed via LLM API
  │     └─ Store new embeddings in Redis cache
  └─ 7. Store embeddings in pgvector:
        └─ UPDATE CodeChunk SET embedding = ... WHERE id IN (...)
```

---

## 4. File-by-File Changes

### 4.1 `packages/api/src/services/github.service.ts`

| Method | Change | Reason |
|--------|--------|--------|
| `storeIndexedData()` | Return type: add `chunkIds: string[]` | Workflow needs IDs for embedding generation |
| `createChunks()` | Return `string[]` (chunk IDs) instead of `number` | Support chunkId return |

**Estimated lines changed**: ~20

### 4.2 `apps/worker/src/workflows/github-index.workflow.ts`

| Section | Change | Reason |
|---------|--------|--------|
| Activity proxies | Add `generateEmbeddings`, `storeEmbeddings` with 60m timeout | Need embedding activities |
| Import types | Add `EmbeddingChunk` import | Type safety |
| `handlePushEvent()` | Add embedding steps after `storeIndexedData` | Core fix |
| Logging | Add embedding metrics (cached/generated/tokens) | Observability |

**Estimated lines changed**: ~35

### 4.3 `apps/worker/src/temporal/activities/github.activities.ts`

| Change | Reason |
|--------|--------|
| `storeIndexedData` return type | Must match new service return type with `chunkIds` |

**Estimated lines changed**: ~3

### 4.4 `packages/api/src/routers/internal.ts`

| Change | Reason |
|--------|--------|
| No change needed | `storeGitHubIndex` delegates to service, type flows through |

### 4.5 No database migration needed

The `CodeChunk.embedding` column already exists (added during repository-index feature). We're just populating it for incremental pushes too.

---

## 5. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Embedding API rate limit on large pushes | Medium | Medium | Already have batch delay (200ms) + retry (5x) |
| Embedding generation fails mid-push | Low | Low | Chunks still stored without embeddings; RCA falls back to commit correlation |
| Redis cache miss on first push | Low | Low | Only costs extra API calls on first run; cached after |
| `createMany` + query-back race condition | Very Low | Low | Runs in same transaction |
| Chunk order mismatch between store and embed | Low | High | Use `contentHash` map instead of index-based lookup |

---

## 6. Performance Considerations

### Typical Push Size
- Average push: 2-5 files changed
- After filtering (indexable extensions, excluded paths): 1-3 files
- Chunks per file: 3-10
- **Total chunks per push: 5-30**

### Embedding Cost Per Push
- 5-30 chunks × ~200 tokens each = 1,000-6,000 tokens
- `text-embedding-3-small`: $0.02/1M tokens
- **Cost per push: $0.00002-$0.00012** (negligible)
- Redis cache hits reduce this further for unchanged code

### Latency Impact
- Embedding generation: 1-3 seconds for 30 chunks
- Runs async in Temporal (doesn't block webhook response)
- Webhook already returns 200 before workflow starts

---

## 7. Testing Plan

### Unit Tests

| Test Case | File | Description |
|-----------|------|-------------|
| `storeIndexedData returns chunkIds` | `packages/api/src/services/__tests__/github.service.test.ts` | Verify new return type includes chunk IDs |
| `createChunks returns IDs in order` | Same | Verify ID ordering matches input chunk ordering |
| `empty chunks returns empty IDs` | Same | Edge case: push with no indexable files |

### Integration Tests

| Test Case | Description |
|-----------|-------------|
| Push with new files → chunks have embeddings | End-to-end: webhook → workflow → verify `embedding IS NOT NULL` |
| Push with modified files → old embeddings replaced | Verify old chunks deleted, new chunks have embeddings |
| Push with only non-indexable files → no embedding calls | Verify no unnecessary API calls |
| Push with duplicate content → cache hit | Verify Redis cache prevents redundant API calls |

### Manual Verification

```sql
-- Before fix: chunks without embeddings after push
SELECT COUNT(*) as total,
       COUNT(embedding) as with_embedding,
       COUNT(*) - COUNT(embedding) as without_embedding
FROM "CodeChunk"
WHERE "repoId" = '<repo-id>';

-- After fix: all chunks should have embeddings
-- without_embedding should be 0
```

---

## 8. Acceptance Criteria

- [ ] When code is pushed to default branch, new/modified code chunks have embeddings generated
- [ ] Embeddings are cached in Redis by `contentHash` (unchanged code doesn't re-embed)
- [ ] RCA vector search finds code from recent pushes
- [ ] `storeGitHubIndex` returns `chunkIds` alongside `chunksCreated`
- [ ] Embedding generation failure doesn't block chunk storage (graceful degradation)
- [ ] Workflow logs embedding metrics (cached/generated/tokensUsed)
- [ ] No database migration required
- [ ] All existing tests pass

---

## 9. Execution Order

```
1. Update GitHubService.createChunks() to return chunk IDs
2. Update GitHubService.storeIndexedData() return type
3. Update github.activities.ts storeIndexedData return type
4. Add embedding activity proxies to github-index.workflow.ts
5. Add embedding steps to handlePushEvent()
6. Write unit tests for new return types
7. Write integration test for push → embed flow
8. Manual test: push code → verify chunks have embeddings
9. Manual test: RCA finds recently pushed code via vector search
```

---

## 10. Out of Scope (Future Improvements)

| Feature | Why Deferred |
|---------|-------------|
| PR file indexing (not just metadata) | Separate spec; PRs are temporary |
| Merkle tree change detection (Cursor-style) | `contentHash` dedup is sufficient for now |
| Embedding quality metrics / monitoring | Nice-to-have, not blocking |
| Cross-repo embedding dedup | Single-repo scope is sufficient |
| Client-side embedding generation | Server-side is fine for our scale |
| Embedding model upgrade (3-large) | 3-small is cost-effective for code search |

---

## 11. Phase 2: Merkle Tree Change Detection (Code Skeleton)

> **Priority**: P2 (post-demo, improves efficiency at scale)
> **Estimated Effort**: 8-13 story points
> **Inspiration**: [Cursor Secure Codebase Indexing](https://cursor.com/blog/secure-codebase-indexing)

### Why Merkle Trees?

Currently we rely on GitHub's webhook payload to tell us what changed. This works but has limitations:

| Problem | Current Behavior | With Merkle Tree |
|---------|-----------------|------------------|
| Webhook missed / out of order | Chunks silently stale | Detect drift, self-heal |
| Full reindex needed? | Re-fetch + re-chunk ALL files | Compare root hash, only process diffs |
| "Did anything change?" | No way to know without re-fetching | Compare single root hash |
| Cross-user index sharing | Each user re-indexes from scratch | Copy index if trees match >90% |
| Large repos (50k+ files) | Full reindex = minutes | Diff = milliseconds |

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    MERKLE TREE STRUCTURE                         │
│                                                                  │
│                    root: hash(src + lib + ...)                    │
│                    ┌──────────┴──────────┐                       │
│               src: hash(...)        lib: hash(...)                │
│              ┌─────┴─────┐         ┌────┴────┐                   │
│          api.ts      utils.ts   cache.ts   db.ts                 │
│         sha256()     sha256()   sha256()  sha256()               │
│                                                                  │
│  Push modifies api.ts:                                           │
│    → Only api.ts hash changes                                    │
│    → src/ hash changes (parent)                                  │
│    → root hash changes                                           │
│    → Compare old vs new tree: diff = [src/api.ts]                │
│    → Re-chunk + re-embed ONLY src/api.ts                         │
└─────────────────────────────────────────────────────────────────┘
```

### Database Schema Addition

```prisma
// packages/db/prisma/schema/repository.prisma

model RepositoryTreeNode {
  id           String   @id @default(cuid())
  repoId       String
  path         String              // "src/api.ts" or "src/" (directory)
  nodeType     TreeNodeType        // FILE or DIRECTORY
  contentHash  String              // SHA-256 of file content (files) or child hashes (dirs)
  parentPath   String?             // "src/" for "src/api.ts", null for root
  treeVersion  Int                 // Increments per sync
  lastSyncedAt DateTime @default(now())

  repo         GitHubRepository @relation(fields: [repoId], references: [id], onDelete: Cascade)

  @@unique([repoId, path, treeVersion])
  @@index([repoId, treeVersion])
  @@index([repoId, parentPath])
}

enum TreeNodeType {
  FILE
  DIRECTORY
}
```

### Code Skeleton: Merkle Tree Builder

```typescript
// packages/shared/src/merkle/tree.ts

import { createHash } from "crypto";

// ============================================
// Types
// ============================================

export interface MerkleNode {
  path: string;
  hash: string;
  type: "file" | "directory";
  children?: MerkleNode[];
}

export interface MerkleTreeDiff {
  added: string[];     // New files
  modified: string[];  // Changed files (hash differs)
  removed: string[];   // Deleted files
  unchanged: number;   // Count of unchanged files
}

export interface FileHash {
  path: string;
  contentHash: string;
}

// ============================================
// Build Merkle Tree from flat file list
// ============================================

/**
 * Build a Merkle tree from a flat list of file hashes.
 *
 * Each file node's hash = SHA-256 of its content.
 * Each directory node's hash = SHA-256 of sorted(child hashes).
 *
 * @example
 * ```ts
 * const files = [
 *   { path: "src/api.ts", contentHash: "abc123" },
 *   { path: "src/utils.ts", contentHash: "def456" },
 *   { path: "README.md", contentHash: "ghi789" },
 * ];
 * const tree = buildMerkleTree(files);
 * // tree.hash = hash of entire repo
 * // tree.children = [{ path: "src/", ... }, { path: "README.md", ... }]
 * ```
 */
export function buildMerkleTree(files: FileHash[]): MerkleNode {
  // Step 1: Group files by directory
  const dirMap = new Map<string, FileHash[]>();

  for (const file of files) {
    const parts = file.path.split("/");
    const dir = parts.length > 1 ? parts.slice(0, -1).join("/") + "/" : "/";

    if (!dirMap.has(dir)) {
      dirMap.set(dir, []);
    }
    dirMap.get(dir)!.push(file);
  }

  // Step 2: Build tree bottom-up
  return buildNode("/", files);
}

function buildNode(dirPath: string, allFiles: FileHash[]): MerkleNode {
  // Find direct children (files and immediate subdirs)
  const directFiles: MerkleNode[] = [];
  const subdirs = new Map<string, FileHash[]>();

  for (const file of allFiles) {
    const relativePath = dirPath === "/"
      ? file.path
      : file.path.slice(dirPath.length);

    if (!relativePath.includes("/")) {
      // Direct file child
      directFiles.push({
        path: file.path,
        hash: file.contentHash,
        type: "file",
      });
    } else {
      // File in a subdirectory
      const subdir = dirPath === "/"
        ? relativePath.split("/")[0]! + "/"
        : dirPath + relativePath.split("/")[0]! + "/";

      if (!subdirs.has(subdir)) {
        subdirs.set(subdir, []);
      }
      subdirs.get(subdir)!.push(file);
    }
  }

  // Recursively build subdirectory nodes
  const dirChildren: MerkleNode[] = [];
  for (const [subdir, subFiles] of subdirs) {
    dirChildren.push(buildNode(subdir, subFiles));
  }

  // Combine and sort children
  const children = [...directFiles, ...dirChildren].sort((a, b) =>
    a.path.localeCompare(b.path)
  );

  // Directory hash = SHA-256 of sorted child hashes
  const combinedHashes = children.map((c) => c.hash).join("|");
  const dirHash = hashString(combinedHashes);

  return {
    path: dirPath,
    hash: dirHash,
    type: "directory",
    children,
  };
}

function hashString(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

// ============================================
// Diff two Merkle trees
// ============================================

/**
 * Compare two Merkle trees and return the diff.
 * Only walks branches where hashes differ (Cursor's key optimization).
 *
 * @example
 * ```ts
 * const oldTree = buildMerkleTree(oldFiles);
 * const newTree = buildMerkleTree(newFiles);
 * const diff = diffMerkleTrees(oldTree, newTree);
 * // diff.modified = ["src/api.ts"]  // Only changed files
 * // diff.added = ["src/new-file.ts"]
 * // diff.removed = ["src/old-file.ts"]
 * ```
 */
export function diffMerkleTrees(
  oldTree: MerkleNode,
  newTree: MerkleNode
): MerkleTreeDiff {
  const diff: MerkleTreeDiff = {
    added: [],
    modified: [],
    removed: [],
    unchanged: 0,
  };

  diffNodes(oldTree, newTree, diff);
  return diff;
}

function diffNodes(
  oldNode: MerkleNode | undefined,
  newNode: MerkleNode | undefined,
  diff: MerkleTreeDiff
): void {
  // New file/dir added
  if (!oldNode && newNode) {
    if (newNode.type === "file") {
      diff.added.push(newNode.path);
    } else {
      // Recurse into new directory - all files are "added"
      for (const child of newNode.children ?? []) {
        diffNodes(undefined, child, diff);
      }
    }
    return;
  }

  // File/dir removed
  if (oldNode && !newNode) {
    if (oldNode.type === "file") {
      diff.removed.push(oldNode.path);
    } else {
      // Recurse into removed directory - all files are "removed"
      for (const child of oldNode.children ?? []) {
        diffNodes(child, undefined, diff);
      }
    }
    return;
  }

  if (!oldNode || !newNode) return;

  // Hashes match → skip entire subtree (Cursor's key optimization)
  if (oldNode.hash === newNode.hash) {
    if (oldNode.type === "file") {
      diff.unchanged++;
    } else {
      // Count all files in unchanged subtree
      diff.unchanged += countFiles(oldNode);
    }
    return;
  }

  // Hashes differ
  if (oldNode.type === "file" && newNode.type === "file") {
    diff.modified.push(newNode.path);
    return;
  }

  // Directory hashes differ → recurse into children
  const oldChildren = new Map(
    (oldNode.children ?? []).map((c) => [c.path, c])
  );
  const newChildren = new Map(
    (newNode.children ?? []).map((c) => [c.path, c])
  );

  // Check all paths in both trees
  const allPaths = new Set([...oldChildren.keys(), ...newChildren.keys()]);
  for (const path of allPaths) {
    diffNodes(oldChildren.get(path), newChildren.get(path), diff);
  }
}

function countFiles(node: MerkleNode): number {
  if (node.type === "file") return 1;
  return (node.children ?? []).reduce(
    (sum, child) => sum + countFiles(child),
    0
  );
}

// ============================================
// Simhash for fast similarity comparison
// ============================================

/**
 * Compute a simhash fingerprint for a Merkle tree.
 * Used to quickly compare two repos for similarity (Cursor's index sharing).
 *
 * Two repos with simhash similarity > 90% can share indexes.
 *
 * @returns 64-bit simhash as hex string
 */
export function computeSimhash(tree: MerkleNode): string {
  const fileHashes = extractFileHashes(tree);

  // Simhash: weighted bit-count across all file hashes
  const bits = new Int32Array(256); // SHA-256 = 256 bits

  for (const hash of fileHashes) {
    const hashBuffer = Buffer.from(hash, "hex");
    for (let i = 0; i < 256; i++) {
      const byteIndex = Math.floor(i / 8);
      const bitIndex = i % 8;
      const bit = (hashBuffer[byteIndex]! >> bitIndex) & 1;
      bits[i] += bit ? 1 : -1;
    }
  }

  // Convert bit counts to binary: positive = 1, negative = 0
  const resultBytes = Buffer.alloc(32);
  for (let i = 0; i < 256; i++) {
    if (bits[i]! > 0) {
      const byteIndex = Math.floor(i / 8);
      const bitIndex = i % 8;
      resultBytes[byteIndex]! |= 1 << bitIndex;
    }
  }

  return resultBytes.toString("hex");
}

/**
 * Compare two simhashes and return similarity (0-1).
 * Hamming distance based.
 */
export function simhashSimilarity(a: string, b: string): number {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");

  let matchingBits = 0;
  const totalBits = bufA.length * 8;

  for (let i = 0; i < bufA.length; i++) {
    const xor = bufA[i]! ^ bufB[i]!;
    // Count matching bits (total - differing bits)
    let diffBits = 0;
    let val = xor;
    while (val) {
      diffBits += val & 1;
      val >>= 1;
    }
    matchingBits += 8 - diffBits;
  }

  return matchingBits / totalBits;
}

function extractFileHashes(node: MerkleNode): string[] {
  if (node.type === "file") return [node.hash];
  return (node.children ?? []).flatMap(extractFileHashes);
}
```

### Code Skeleton: Merkle Sync Activity

```typescript
// apps/worker/src/temporal/activities/merkle-sync.activities.ts

import { prisma } from "@ducsigr/db";
import { buildMerkleTree, diffMerkleTrees, type FileHash, type MerkleTreeDiff } from "@ducsigr/shared/merkle";
import { getInternalCaller } from "@/lib/trpc-caller";

/**
 * Build a Merkle tree from the current GitHub repo state.
 * Fetches the full file tree and computes hashes.
 *
 * Called during: full index, periodic health check, manual reindex
 */
export async function buildRemoteMerkleTree(input: {
  repoId: string;
  installationId: number;
  owner: string;
  repo: string;
  branch: string;
}): Promise<FileHash[]> {
  // 1. Fetch file tree from GitHub (reuse existing activity)
  // 2. For each file, compute SHA-256 of content
  // 3. Return flat list of { path, contentHash }
  // Implementation reuses fetchRepositoryTree + fetchRepositoryContents
  throw new Error("TODO: implement");
}

/**
 * Build a Merkle tree from our stored chunks.
 * Represents what we THINK the repo looks like.
 */
export async function buildLocalMerkleTree(repoId: string): Promise<FileHash[]> {
  // Query all chunks grouped by filePath, get contentHash
  const chunks = await prisma.codeChunk.findMany({
    where: { repoId },
    select: { filePath: true, contentHash: true },
    distinct: ["filePath"],
  });

  return chunks.map((c) => ({
    path: c.filePath,
    contentHash: c.contentHash,
  }));
}

/**
 * Compute diff between remote (GitHub) and local (our DB) state.
 * Returns exactly which files need re-indexing.
 *
 * This replaces relying on webhook payloads for change detection.
 */
export async function computeIndexDrift(input: {
  repoId: string;
  installationId: number;
  owner: string;
  repo: string;
  branch: string;
}): Promise<MerkleTreeDiff> {
  const [remoteFiles, localFiles] = await Promise.all([
    buildRemoteMerkleTree(input),
    buildLocalMerkleTree(input.repoId),
  ]);

  const remoteTree = buildMerkleTree(remoteFiles);
  const localTree = buildMerkleTree(localFiles);

  return diffMerkleTrees(localTree, remoteTree);
}

/**
 * Store the current Merkle tree snapshot for future comparisons.
 * Called after successful index/sync.
 */
export async function storeMerkleSnapshot(input: {
  repoId: string;
  rootHash: string;
  simhash: string;
  fileCount: number;
}): Promise<void> {
  const caller = getInternalCaller();
  await caller.internal.storeTreeSnapshot(input);
}
```

### Code Skeleton: Smart Sync Workflow

```typescript
// apps/worker/src/workflows/smart-sync.workflow.ts

import { proxyActivities, log } from "@temporalio/workflow";
import type * as activities from "../temporal/activities";
import { ACTIVITY_RETRY } from "@ducsigr/shared";

const {
  computeIndexDrift,
  fetchFileContents,
  chunkCodeFiles,
  storeRepositoryChunks,
  generateEmbeddings,
  storeEmbeddings,
  storeMerkleSnapshot,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "30m",
  retry: { ...ACTIVITY_RETRY.DEFAULT, maximumAttempts: 3 },
});

/**
 * Smart Sync Workflow
 *
 * Uses Merkle tree diff to sync only what changed.
 * Can be triggered by:
 * - Push webhook (instead of current github-index workflow)
 * - Scheduled cron (health check)
 * - Manual "verify index" button
 *
 * Flow:
 * 1. Compare remote vs local Merkle trees
 * 2. If root hashes match → nothing to do
 * 3. If they differ → walk diff, only process changed files
 * 4. Re-chunk + re-embed only changed files
 * 5. Store new Merkle snapshot
 */
export async function smartSyncWorkflow(input: {
  repoId: string;
  installationId: number;
  owner: string;
  repo: string;
  branch: string;
  trigger: "push" | "scheduled" | "manual";
}): Promise<{
  success: boolean;
  filesAdded: number;
  filesModified: number;
  filesRemoved: number;
  filesUnchanged: number;
  embeddingsGenerated: number;
}> {
  const { repoId } = input;

  log.info("Starting smart sync", { repoId, trigger: input.trigger });

  // Step 1: Compute drift between GitHub and our index
  const diff = await computeIndexDrift(input);

  log.info("Merkle diff computed", {
    added: diff.added.length,
    modified: diff.modified.length,
    removed: diff.removed.length,
    unchanged: diff.unchanged,
  });

  // Step 2: Early exit if no changes
  if (
    diff.added.length === 0 &&
    diff.modified.length === 0 &&
    diff.removed.length === 0
  ) {
    log.info("Index is up to date, nothing to sync");
    return {
      success: true,
      filesAdded: 0,
      filesModified: 0,
      filesRemoved: 0,
      filesUnchanged: diff.unchanged,
      embeddingsGenerated: 0,
    };
  }

  // Step 3: Process changes
  const filesToFetch = [...diff.added, ...diff.modified];

  // Step 3a: Remove chunks for deleted and modified files
  // (modified files get old chunks removed, new chunks inserted)
  const filesToRemove = [...diff.removed, ...diff.modified];
  if (filesToRemove.length > 0) {
    // Delete old chunks (cascade removes embeddings)
    log.info("Removing old chunks", { count: filesToRemove.length });
    // await deleteChunksForFiles(repoId, filesToRemove);
  }

  // Step 3b: Fetch, chunk, and embed new/modified files
  let embeddingsGenerated = 0;
  if (filesToFetch.length > 0) {
    log.info("Fetching changed files", { count: filesToFetch.length });

    // Reuse existing activities
    // const contents = await fetchFileContents({ ... });
    // const chunks = await chunkCodeFiles(contents);
    // const stored = await storeRepositoryChunks({ repoId, chunks });
    // const embedded = await generateEmbeddings({ chunks: ... });
    // await storeEmbeddings({ embeddings: embedded.embeddings });
    // embeddingsGenerated = embedded.generated;
  }

  // Step 4: Store new Merkle snapshot
  // await storeMerkleSnapshot({ repoId, rootHash, simhash, fileCount });

  log.info("Smart sync completed", {
    added: diff.added.length,
    modified: diff.modified.length,
    removed: diff.removed.length,
  });

  return {
    success: true,
    filesAdded: diff.added.length,
    filesModified: diff.modified.length,
    filesRemoved: diff.removed.length,
    filesUnchanged: diff.unchanged,
    embeddingsGenerated,
  };
}
```

### Phase 2 Roadmap

```
Phase 2a: Merkle Tree Core (3-5 SP)
  ├─ packages/shared/src/merkle/tree.ts      (build, diff, simhash)
  ├─ packages/shared/src/merkle/__tests__/   (unit tests)
  └─ Migration: add RepositoryTreeNode model

Phase 2b: Smart Sync Workflow (5-8 SP)
  ├─ merkle-sync.activities.ts               (build local/remote trees, compute drift)
  ├─ smart-sync.workflow.ts                  (diff-based sync)
  └─ Wire into webhook handler (replace github-index for push events)

Phase 2c: Scheduled Health Checks (2-3 SP)
  ├─ Cron workflow: compare trees every 24h
  ├─ Auto-heal if drift detected
  └─ Dashboard: index health status per repo

Phase 2d: Cross-User Index Sharing (5-8 SP) - Cursor-style
  ├─ Simhash comparison across workspace repos
  ├─ Copy index when similarity > 90%
  └─ Content proof filtering for security
```

---

## Appendix: Key File Locations

| File | Purpose |
|------|---------|
| `apps/worker/src/workflows/github-index.workflow.ts` | Incremental push workflow (ADD embedding steps) |
| `apps/worker/src/workflows/repository-index.workflow.ts` | Full index workflow (REFERENCE for embedding pattern) |
| `apps/worker/src/temporal/activities/github.activities.ts` | Push activities (UPDATE return type) |
| `apps/worker/src/temporal/activities/embedding.activities.ts` | Embedding activities (REUSE as-is) |
| `apps/worker/src/temporal/activities/repository-index.activities.ts` | Repo index activities (REFERENCE) |
| `packages/api/src/services/github.service.ts` | Storage service (UPDATE to return chunkIds) |
| `packages/api/src/routers/internal.ts` | Internal procedures (no change needed) |
| `packages/db/src/vector.ts` | Vector storage/search (REUSE as-is) |
| `apps/web/src/app/api/webhooks/github/route.ts` | Webhook handler (no change needed) |
