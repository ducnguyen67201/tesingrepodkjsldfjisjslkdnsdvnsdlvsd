# Engineering Spec: #130 Temporal Workflow - Basic Indexing

**Story Points:** 8
**Priority:** P0
**Sprint:** Sprint 1 - Foundation
**Dependencies:** #128 (Database Schema), #129 (Webhook Endpoint), #131 (Code Chunking - can be stubbed)
**Status:** ✅ IMPLEMENTED

> **Note:** This spec contains simplified code examples for documentation purposes.
> The actual implementation in source files follows stricter patterns from CLAUDE.md:
> - Uses `env` from `@/lib/env` (not `process.env`)
> - Uses Zod validation for all external API responses
> - Uses `ctx.db` in tRPC procedures (not direct `prisma` import)
> - Inlines pure functions in workflows (not imported from activities)
>
> See actual implementation in:
> - `apps/worker/src/workflows/github-index.workflow.ts`
> - `apps/worker/src/temporal/activities/github.activities.ts`

---

## Overview

Create a Temporal workflow that processes GitHub events and indexes changed files. The workflow fetches file contents, chunks them, and stores in the database. This is the core processing pipeline triggered by the webhook endpoint.

---

## Acceptance Criteria

- [ ] `githubIndexWorkflow` created in `apps/worker/src/workflows/`
- [ ] Activities follow READ-ONLY pattern (mutations via tRPC internal)
- [ ] Handles push events: indexes changed files
- [ ] Handles PR events: stores PR metadata
- [ ] Idempotent: same event can be replayed safely
- [ ] Workflow completes within 5 minutes for typical pushes
- [ ] Exports workflow from `apps/worker/src/workflows/index.ts`

---

## Technical Architecture

### Data Flow

```
Webhook (Web App)
    │
    │ startGitHubIndexWorkflow()
    ▼
┌─────────────────────────────────────────────────────────────┐
│                  githubIndexWorkflow                         │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 1. extractChangedFiles (activity)                   │    │
│  │    - Parse push/PR payload                          │    │
│  │    - Extract added/modified/removed files           │    │
│  └─────────────────────────────────────────────────────┘    │
│                          │                                   │
│                          ▼                                   │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 2. filterIndexableFiles (pure function in workflow) │    │
│  │    - Filter by extension (.ts, .js, .py, .go, etc.) │    │
│  │    - Exclude node_modules, dist, etc.               │    │
│  └─────────────────────────────────────────────────────┘    │
│                          │                                   │
│                          ▼                                   │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 3. fetchFileContents (activity)                     │    │
│  │    - GitHub API: GET /repos/{owner}/{repo}/contents │    │
│  │    - Batch fetch with rate limiting                 │    │
│  └─────────────────────────────────────────────────────┘    │
│                          │                                   │
│                          ▼                                   │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 4. chunkCodeFiles (activity)                        │    │
│  │    - Split each file into semantic chunks           │    │
│  │    - Generate content hashes                        │    │
│  └─────────────────────────────────────────────────────┘    │
│                          │                                   │
│                          ▼                                   │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 5. storeIndexedData (activity → tRPC internal)      │    │
│  │    - Upsert commit/PR metadata                      │    │
│  │    - Delete old chunks for changed files            │    │
│  │    - Insert new chunks                              │    │
│  │    - Update repo lastIndexedAt                      │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
                   GitHubIndexResult
```

### Workflow Input/Output Types

```typescript
// Input from webhook
interface GitHubIndexInput {
  repoId: string;
  projectId: string;
  event: "push" | "pull_request";
  payload: unknown; // GitHubPushPayload | GitHubPRPayload
  deliveryId: string;
}

// Output result
interface GitHubIndexResult {
  success: boolean;
  repoId: string;
  event: "push" | "pull_request";
  filesProcessed: number;
  chunksCreated: number;
  commitSha?: string;
  prNumber?: number;
  error?: string;
}
```

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/worker/src/workflows/github-index.workflow.ts` | Create | Main workflow definition |
| `apps/worker/src/workflows/index.ts` | Modify | Export new workflow |
| `apps/worker/src/temporal/activities/github.activities.ts` | Create | GitHub-related activities |
| `apps/worker/src/temporal/activities/index.ts` | Modify | Export new activities |
| `apps/worker/src/temporal/types.ts` | Modify | Add GitHubIndex types |
| `packages/api/src/routers/internal.ts` | Modify | Add `storeGitHubIndex` procedure |
| `packages/api/src/schemas/github.ts` | Modify | Add `StoreGitHubIndexSchema` |
| `apps/worker/src/lib/env.ts` | Modify | Add `GITHUB_TOKEN` (optional) |

---

## Implementation Steps

### Step 1: Add Types to `apps/worker/src/temporal/types.ts`

```typescript
// ============================================
// GitHub Index Workflow Types
// ============================================

export interface GitHubIndexInput {
  repoId: string;
  projectId: string;
  event: "push" | "pull_request";
  payload: unknown;
  deliveryId: string;
}

export interface GitHubIndexResult {
  success: boolean;
  repoId: string;
  event: "push" | "pull_request";
  filesProcessed: number;
  chunksCreated: number;
  commitSha?: string;
  prNumber?: number;
  error?: string;
}

export interface ChangedFile {
  path: string;
  status: "added" | "modified" | "removed";
}

export interface FileContent {
  path: string;
  content: string;
  encoding: "utf-8" | "base64";
}

export interface CodeChunkData {
  filePath: string;
  startLine: number;
  endLine: number;
  content: string;
  contentHash: string;
  language: string | null;
  chunkType: "function" | "class" | "module" | "block";
}

export interface StoreGitHubIndexInput {
  repoId: string;
  event: "push" | "pull_request";
  commitSha?: string;
  commitMessage?: string;
  commitAuthor?: string;
  commitAuthorEmail?: string;
  commitTimestamp?: string;
  prNumber?: number;
  prTitle?: string;
  prBody?: string;
  prState?: string;
  prAuthor?: string;
  prBaseBranch?: string;
  prHeadBranch?: string;
  prMergedAt?: string;
  prClosedAt?: string;
  changedFiles: string[];
  chunks: CodeChunkData[];
}
```

---

### Step 2: Add Environment Variable (Optional)

**File: `apps/worker/src/lib/env.ts`**

```typescript
// GitHub API Token (optional, for higher rate limits)
GITHUB_TOKEN: z.string().optional(),
```

---

### Step 3: Create GitHub Activities

**File: `apps/worker/src/temporal/activities/github.activities.ts`**

```typescript
import { prisma } from "@ducsigr/db";
import {
  GitHubPushPayloadSchema,
  GitHubPRPayloadSchema,
} from "@ducsigr/api/schemas";
import { createHash } from "crypto";
import { getInternalCaller } from "@/lib/trpc-caller";
import type {
  GitHubIndexInput,
  ChangedFile,
  FileContent,
  CodeChunkData,
  StoreGitHubIndexInput,
} from "../types";

// ============================================
// Constants
// ============================================

const INDEXABLE_EXTENSIONS = [
  ".ts", ".tsx", ".js", ".jsx",  // JavaScript/TypeScript
  ".py",                          // Python
  ".go",                          // Go
  ".rs",                          // Rust
  ".java",                        // Java
];

const EXCLUDED_PATTERNS = [
  /node_modules/,
  /\.git\//,
  /dist\//,
  /build\//,
  /\.next\//,
  /\.min\./,
  /package-lock\.json/,
  /pnpm-lock\.yaml/,
  /yarn\.lock/,
];

const MAX_FILE_SIZE = 100 * 1024; // 100KB max per file
const MAX_FILES_PER_BATCH = 50;

// ============================================
// Activity: Extract Changed Files
// ============================================

export async function extractChangedFiles(
  input: GitHubIndexInput
): Promise<ChangedFile[]> {
  const { event, payload } = input;

  if (event === "push") {
    const parsed = GitHubPushPayloadSchema.parse(payload);
    const changedFiles: ChangedFile[] = [];

    for (const commit of parsed.commits) {
      for (const file of commit.added) {
        changedFiles.push({ path: file, status: "added" });
      }
      for (const file of commit.modified) {
        changedFiles.push({ path: file, status: "modified" });
      }
      for (const file of commit.removed) {
        changedFiles.push({ path: file, status: "removed" });
      }
    }

    // Deduplicate by path (keep last status)
    const fileMap = new Map<string, ChangedFile>();
    for (const file of changedFiles) {
      fileMap.set(file.path, file);
    }

    return Array.from(fileMap.values());
  }

  if (event === "pull_request") {
    // For PRs, we'll fetch changed files via API in fetchFileContents
    // Return empty here, PR metadata is stored separately
    return [];
  }

  return [];
}

// ============================================
// Activity: Fetch File Contents from GitHub
// ============================================

export async function fetchFileContents(input: {
  repoId: string;
  files: ChangedFile[];
  ref: string;
}): Promise<FileContent[]> {
  const { repoId, files, ref } = input;

  // Get repo info for API calls
  const repo = await prisma.gitHubRepository.findUnique({
    where: { id: repoId },
    select: { owner: true, repo: true, installationId: true },
  });

  if (!repo) {
    throw new Error(`Repository not found: ${repoId}`);
  }

  // Filter to non-removed files only
  const filesToFetch = files.filter((f) => f.status !== "removed");

  // Batch fetch to avoid rate limits
  const contents: FileContent[] = [];
  const batches = chunk(filesToFetch, MAX_FILES_PER_BATCH);

  for (const batch of batches) {
    const batchResults = await Promise.all(
      batch.map(async (file) => {
        try {
          const content = await fetchSingleFile(repo.owner, repo.repo, file.path, ref);
          return content;
        } catch (error) {
          console.warn(`[GitHub] Failed to fetch ${file.path}:`, error);
          return null;
        }
      })
    );

    contents.push(...batchResults.filter((c): c is FileContent => c !== null));
  }

  return contents;
}

async function fetchSingleFile(
  owner: string,
  repo: string,
  path: string,
  ref: string
): Promise<FileContent | null> {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${ref}`;

  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "Ducsigr-Indexer",
  };

  // Use token if available for higher rate limits
  const token = process.env.GITHUB_TOKEN;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, { headers });

  if (!response.ok) {
    if (response.status === 404) {
      return null; // File doesn't exist at this ref
    }
    throw new Error(`GitHub API error: ${response.status}`);
  }

  const data = await response.json();

  // Skip files that are too large
  if (data.size > MAX_FILE_SIZE) {
    console.log(`[GitHub] Skipping large file: ${path} (${data.size} bytes)`);
    return null;
  }

  // Decode base64 content
  const content = Buffer.from(data.content, "base64").toString("utf-8");

  return {
    path,
    content,
    encoding: "utf-8",
  };
}

// ============================================
// Activity: Chunk Code Files
// ============================================

export async function chunkCodeFiles(
  files: FileContent[]
): Promise<CodeChunkData[]> {
  const allChunks: CodeChunkData[] = [];

  for (const file of files) {
    const language = detectLanguage(file.path);
    const chunks = chunkCode(file.path, file.content, language);
    allChunks.push(...chunks);
  }

  return allChunks;
}

function chunkCode(
  filePath: string,
  content: string,
  language: string | null
): CodeChunkData[] {
  // Simple line-based chunking for now
  // TODO: Implement AST-based chunking in #131
  const lines = content.split("\n");
  const chunks: CodeChunkData[] = [];

  const CHUNK_SIZE = 100; // lines per chunk
  const MIN_CHUNK_SIZE = 10;

  for (let i = 0; i < lines.length; i += CHUNK_SIZE) {
    const chunkLines = lines.slice(i, i + CHUNK_SIZE);

    // Skip tiny chunks at the end
    if (chunkLines.length < MIN_CHUNK_SIZE && chunks.length > 0) {
      // Append to previous chunk
      const prev = chunks[chunks.length - 1];
      prev.endLine = i + chunkLines.length;
      prev.content += "\n" + chunkLines.join("\n");
      prev.contentHash = generateContentHash(prev.content);
      continue;
    }

    const chunkContent = chunkLines.join("\n");

    chunks.push({
      filePath,
      startLine: i + 1,
      endLine: i + chunkLines.length,
      content: chunkContent,
      contentHash: generateContentHash(chunkContent),
      language,
      chunkType: "block",
    });
  }

  return chunks;
}

function generateContentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function detectLanguage(filePath: string): string | null {
  const ext = filePath.substring(filePath.lastIndexOf("."));
  const langMap: Record<string, string> = {
    ".ts": "typescript",
    ".tsx": "typescript",
    ".js": "javascript",
    ".jsx": "javascript",
    ".py": "python",
    ".go": "go",
    ".rs": "rust",
    ".java": "java",
  };
  return langMap[ext] || null;
}

// ============================================
// Activity: Store Indexed Data
// ============================================

export async function storeIndexedData(
  input: StoreGitHubIndexInput
): Promise<{ chunksCreated: number }> {
  const caller = getInternalCaller();
  return caller.internal.storeGitHubIndex(input);
}

// ============================================
// Helper: Filter Indexable Files
// ============================================

export function shouldIndexFile(path: string): boolean {
  // Check excluded patterns
  if (EXCLUDED_PATTERNS.some((p) => p.test(path))) {
    return false;
  }

  // Check extension
  return INDEXABLE_EXTENSIONS.some((ext) => path.endsWith(ext));
}

// ============================================
// Helper: Chunk Array
// ============================================

function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}
```

---

### Step 4: Export Activities

**File: `apps/worker/src/temporal/activities/index.ts`**

Add to existing exports:

```typescript
// GitHub indexing activities
export {
  extractChangedFiles,
  fetchFileContents,
  chunkCodeFiles,
  storeIndexedData,
  shouldIndexFile,
} from "./github.activities";
```

---

### Step 5: Create Workflow

**File: `apps/worker/src/workflows/github-index.workflow.ts`**

```typescript
import { proxyActivities, log, ApplicationFailure } from "@temporalio/workflow";
import type * as activities from "../temporal/activities";
import type { GitHubIndexInput, GitHubIndexResult } from "../temporal/types";
import { GitHubPushPayloadSchema, GitHubPRPayloadSchema } from "@ducsigr/api/schemas";

// Activity configuration
const {
  extractChangedFiles,
  fetchFileContents,
  chunkCodeFiles,
  storeIndexedData,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "2m",
  retry: {
    maximumAttempts: 3,
    initialInterval: "1s",
    backoffCoefficient: 2,
    maximumInterval: "30s",
  },
});

// Import pure helper (can be used directly in workflow)
import { shouldIndexFile } from "../temporal/activities/github.activities";

/**
 * GitHub Index Workflow
 *
 * Processes GitHub push/PR events and indexes changed code files.
 *
 * Flow:
 * 1. Extract changed files from event payload
 * 2. Filter to indexable files
 * 3. Fetch file contents from GitHub API
 * 4. Chunk code into semantic pieces
 * 5. Store chunks and metadata in database
 */
export async function githubIndexWorkflow(
  input: GitHubIndexInput
): Promise<GitHubIndexResult> {
  const { repoId, projectId, event, payload, deliveryId } = input;

  log.info("Starting GitHub index workflow", {
    repoId,
    projectId,
    event,
    deliveryId,
  });

  try {
    // Parse payload based on event type
    let commitSha: string | undefined;
    let prNumber: number | undefined;
    let ref: string;
    let storeInput: Parameters<typeof storeIndexedData>[0];

    if (event === "push") {
      const parsed = GitHubPushPayloadSchema.parse(payload);
      commitSha = parsed.after;
      ref = parsed.after;

      // Extract changed files
      const changedFiles = await extractChangedFiles(input);
      log.info("Extracted changed files", { count: changedFiles.length });

      // Filter to indexable files
      const filesToIndex = changedFiles.filter((f) =>
        f.status !== "removed" && shouldIndexFile(f.path)
      );
      log.info("Files to index", { count: filesToIndex.length });

      if (filesToIndex.length === 0) {
        log.info("No indexable files found, skipping");
        return {
          success: true,
          repoId,
          event,
          filesProcessed: 0,
          chunksCreated: 0,
          commitSha,
        };
      }

      // Fetch file contents
      const fileContents = await fetchFileContents({
        repoId,
        files: filesToIndex,
        ref,
      });
      log.info("Fetched file contents", { count: fileContents.length });

      // Chunk code files
      const chunks = await chunkCodeFiles(fileContents);
      log.info("Created code chunks", { count: chunks.length });

      // Prepare store input
      const headCommit = parsed.head_commit;
      storeInput = {
        repoId,
        event,
        commitSha: parsed.after,
        commitMessage: headCommit?.message,
        commitAuthor: headCommit?.author.name,
        commitAuthorEmail: headCommit?.author.email,
        commitTimestamp: headCommit?.timestamp,
        changedFiles: changedFiles.map((f) => f.path),
        chunks,
      };

      // Store indexed data
      const result = await storeIndexedData(storeInput);

      log.info("GitHub index workflow completed", {
        repoId,
        event,
        filesProcessed: fileContents.length,
        chunksCreated: result.chunksCreated,
        commitSha,
      });

      return {
        success: true,
        repoId,
        event,
        filesProcessed: fileContents.length,
        chunksCreated: result.chunksCreated,
        commitSha,
      };
    }

    if (event === "pull_request") {
      const parsed = GitHubPRPayloadSchema.parse(payload);
      prNumber = parsed.number;

      // For PRs, we only store metadata (no file indexing yet)
      storeInput = {
        repoId,
        event,
        prNumber: parsed.number,
        prTitle: parsed.pull_request.title,
        prBody: parsed.pull_request.body || undefined,
        prState: parsed.pull_request.state,
        prAuthor: parsed.pull_request.user.login,
        prBaseBranch: parsed.pull_request.base.ref,
        prHeadBranch: parsed.pull_request.head.ref,
        prMergedAt: parsed.pull_request.merged_at || undefined,
        prClosedAt: parsed.pull_request.closed_at || undefined,
        changedFiles: [],
        chunks: [],
      };

      const result = await storeIndexedData(storeInput);

      log.info("GitHub PR metadata stored", {
        repoId,
        prNumber,
      });

      return {
        success: true,
        repoId,
        event,
        filesProcessed: 0,
        chunksCreated: result.chunksCreated,
        prNumber,
      };
    }

    throw ApplicationFailure.create({
      type: "UNSUPPORTED_EVENT",
      message: `Unsupported event type: ${event}`,
      nonRetryable: true,
    });
  } catch (error) {
    log.error("GitHub index workflow failed", { error, repoId, event });

    // Re-throw ApplicationFailure as-is
    if (error instanceof ApplicationFailure) {
      throw error;
    }

    // Wrap other errors
    throw ApplicationFailure.create({
      type: "WORKFLOW_ERROR",
      message: error instanceof Error ? error.message : "Unknown error",
      cause: error,
    });
  }
}
```

---

### Step 6: Export Workflow

**File: `apps/worker/src/workflows/index.ts`**

Add to existing exports:

```typescript
export { githubIndexWorkflow } from "./github-index.workflow";
```

---

### Step 7: Add Internal tRPC Procedure

**File: `packages/api/src/routers/internal.ts`**

Add the `storeGitHubIndex` procedure:

```typescript
import { StoreGitHubIndexSchema } from "../schemas/github";

// Add to internal router
storeGitHubIndex: internalProcedure
  .input(StoreGitHubIndexSchema)
  .mutation(async ({ input }) => {
    const {
      repoId,
      event,
      commitSha,
      commitMessage,
      commitAuthor,
      commitAuthorEmail,
      commitTimestamp,
      prNumber,
      prTitle,
      prBody,
      prState,
      prAuthor,
      prBaseBranch,
      prHeadBranch,
      prMergedAt,
      prClosedAt,
      changedFiles,
      chunks,
    } = input;

    return prisma.$transaction(async (tx) => {
      // 1. Upsert commit metadata (for push events)
      if (event === "push" && commitSha) {
        await tx.gitCommit.upsert({
          where: {
            repoId_sha: { repoId, sha: commitSha },
          },
          create: {
            repoId,
            sha: commitSha,
            message: commitMessage || "",
            author: commitAuthor || "unknown",
            authorEmail: commitAuthorEmail,
            timestamp: commitTimestamp ? new Date(commitTimestamp) : new Date(),
          },
          update: {
            message: commitMessage || "",
            author: commitAuthor || "unknown",
            authorEmail: commitAuthorEmail,
          },
        });
      }

      // 2. Upsert PR metadata (for pull_request events)
      if (event === "pull_request" && prNumber) {
        await tx.gitPullRequest.upsert({
          where: {
            repoId_number: { repoId, number: prNumber },
          },
          create: {
            repoId,
            number: prNumber,
            title: prTitle || "",
            body: prBody,
            state: prState || "open",
            author: prAuthor || "unknown",
            baseBranch: prBaseBranch || "main",
            headBranch: prHeadBranch || "",
            mergedAt: prMergedAt ? new Date(prMergedAt) : null,
            closedAt: prClosedAt ? new Date(prClosedAt) : null,
          },
          update: {
            title: prTitle || "",
            body: prBody,
            state: prState || "open",
            mergedAt: prMergedAt ? new Date(prMergedAt) : null,
            closedAt: prClosedAt ? new Date(prClosedAt) : null,
          },
        });
      }

      // 3. Delete old chunks for changed files
      if (changedFiles.length > 0) {
        await tx.codeChunk.deleteMany({
          where: {
            repoId,
            filePath: { in: changedFiles },
          },
        });
      }

      // 4. Insert new chunks
      let chunksCreated = 0;
      if (chunks.length > 0) {
        const result = await tx.codeChunk.createMany({
          data: chunks.map((chunk) => ({
            repoId,
            filePath: chunk.filePath,
            startLine: chunk.startLine,
            endLine: chunk.endLine,
            content: chunk.content,
            contentHash: chunk.contentHash,
            language: chunk.language,
            chunkType: chunk.chunkType,
          })),
        });
        chunksCreated = result.count;
      }

      // 5. Update repo lastIndexedAt
      await tx.gitHubRepository.update({
        where: { id: repoId },
        data: {
          lastIndexedAt: new Date(),
          indexStatus: "READY",
        },
      });

      return { chunksCreated };
    });
  }),
```

---

### Step 8: Add Store Schema

**File: `packages/api/src/schemas/github.ts`**

Add after existing schemas:

```typescript
// ============================================
// Store GitHub Index Schema (for tRPC internal)
// ============================================

export const StoreGitHubIndexSchema = z.object({
  repoId: z.string(),
  event: z.enum(["push", "pull_request"]),
  // Commit fields (for push)
  commitSha: z.string().optional(),
  commitMessage: z.string().optional(),
  commitAuthor: z.string().optional(),
  commitAuthorEmail: z.string().optional(),
  commitTimestamp: z.string().optional(),
  // PR fields (for pull_request)
  prNumber: z.number().optional(),
  prTitle: z.string().optional(),
  prBody: z.string().optional(),
  prState: z.string().optional(),
  prAuthor: z.string().optional(),
  prBaseBranch: z.string().optional(),
  prHeadBranch: z.string().optional(),
  prMergedAt: z.string().optional(),
  prClosedAt: z.string().optional(),
  // Changed files and chunks
  changedFiles: z.array(z.string()),
  chunks: z.array(
    z.object({
      filePath: z.string(),
      startLine: z.number(),
      endLine: z.number(),
      content: z.string(),
      contentHash: z.string(),
      language: z.string().nullable(),
      chunkType: z.string(),
    })
  ),
});
export type StoreGitHubIndexInput = z.infer<typeof StoreGitHubIndexSchema>;
```

---

## Activity Summary

| Activity | Purpose | I/O Type | Database Access |
|----------|---------|----------|-----------------|
| `extractChangedFiles` | Parse event payload | Pure computation | None |
| `fetchFileContents` | GitHub API call | Network I/O | Read (repo info) |
| `chunkCodeFiles` | Split code into chunks | CPU-bound | None |
| `storeIndexedData` | Persist to database | tRPC call | Write (via internal) |

---

## Timeout & Retry Configuration

| Setting | Value | Reason |
|---------|-------|--------|
| Activity timeout | 2 minutes | GitHub API can be slow |
| Workflow timeout | 5 minutes | Typical push should complete |
| Max retry attempts | 3 | Recover from transient failures |
| Initial retry interval | 1 second | Quick first retry |
| Max retry interval | 30 seconds | Cap exponential backoff |

---

## Idempotency Considerations

1. **Workflow ID**: Uses `github-index-{deliveryId}` - same event redelivery uses same ID
2. **Commit upsert**: Uses `repoId_sha` unique constraint
3. **PR upsert**: Uses `repoId_number` unique constraint
4. **Chunk replacement**: Deletes old chunks before inserting new ones
5. **Content hash**: Same content produces same hash for deduplication

---

## Testing

### Unit Tests

```typescript
describe("GitHub Index Workflow", () => {
  it("indexes push event with changed files", async () => {
    // Mock activities
    // Run workflow
    // Assert chunks created
  });

  it("stores PR metadata without indexing files", async () => {
    // Mock activities
    // Run workflow
    // Assert PR stored, no chunks
  });

  it("skips non-indexable files", async () => {
    // Push with only .md files
    // Assert no chunks created
  });

  it("is idempotent for same event", async () => {
    // Run workflow twice with same deliveryId
    // Assert same result
  });
});
```

### Integration Tests

```typescript
describe("GitHub Index Integration", () => {
  it("webhook → workflow → database", async () => {
    // 1. Create test repository
    // 2. Send mock webhook
    // 3. Wait for workflow completion
    // 4. Verify chunks in database
  });
});
```

---

## Notes

- **Code chunking**: Using simple line-based chunking for now. AST-based chunking will be implemented in #131
- **GitHub API rate limits**: Without token: 60 req/hr. With token: 5000 req/hr. Consider adding token.
- **Large repositories**: Files > 100KB are skipped. Very large pushes may need pagination.
- **PR file changes**: Currently only stores PR metadata. File diff indexing can be added later.
