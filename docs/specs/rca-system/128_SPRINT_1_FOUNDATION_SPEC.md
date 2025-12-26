# Sprint 1: Foundation - GitHub Indexing Infrastructure

**Sprint ID:** #127 Sprint 1
**Story Points:** 21
**Priority:** P0
**Dependencies:** #115 (Temporal Migration completed)

---

## Sprint Goal

> Basic GitHub → Database pipeline working: Push events to main branch trigger indexing of changed files, stored in `code_chunks` table with proper metadata.

---

## Definition of Done

- [ ] Push to main indexes changed files
- [ ] Files stored in `code_chunks` table
- [ ] Commit/PR metadata stored in database
- [ ] Unit tests for chunking logic
- [ ] Integration test: webhook → database

---

## Stories

### Story 1: Database Schema for GitHub Indexing

**Ticket ID:** #128
**Points:** 3
**Priority:** P0

#### Description

Create the database schema to store GitHub repository connections, commits, pull requests, and code chunks. This is the foundation for all subsequent indexing work.

#### Acceptance Criteria

- [ ] Prisma schema includes all new models (`GitHubRepository`, `GitCommit`, `GitPullRequest`, `CodeChunk`, `AlertRCA`)
- [ ] Migration runs successfully on dev and staging
- [ ] All indexes created for query performance
- [ ] Relations properly cascade on delete

#### Technical Details

**New Enums:**
```prisma
enum IndexStatus {
  PENDING
  INDEXING
  READY
  FAILED
}
```

**New Models:**

1. `GitHubRepository` - Links project to GitHub repo
2. `GitCommit` - Stores commit metadata
3. `GitPullRequest` - Stores PR metadata
4. `CodeChunk` - Stores indexed code chunks (without embedding column yet - Sprint 2)
5. `AlertRCA` - Stores RCA analysis results

**Key Indexes:**
- `GitHubRepository.projectId` (unique)
- `GitCommit(repoId, sha)` (unique)
- `GitCommit(repoId, timestamp)`
- `GitPullRequest(repoId, number)` (unique)
- `GitPullRequest(repoId, mergedAt)`
- `CodeChunk(repoId, filePath)`
- `CodeChunk.contentHash`

#### Implementation Notes

```bash
# Generate migration
pnpm --filter @ducsigr/db db:migrate:dev --name add_github_indexing

# Verify migration
pnpm --filter @ducsigr/db db:generate
```

#### Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/db/prisma/schema.prisma` | Modify | Add new models and relations |
| `packages/api/src/schemas/github.ts` | Create | Zod schemas for GitHub types |

---

### Story 2: GitHub Webhook Receiver Endpoint

**Ticket ID:** #129
**Points:** 5
**Priority:** P0

#### Description

Create an API endpoint that receives GitHub webhook events (push, pull_request) and validates the payload signature. This endpoint will trigger the indexing workflow.

#### Acceptance Criteria

- [ ] `POST /api/webhooks/github` endpoint created
- [ ] Validates `X-Hub-Signature-256` header
- [ ] Handles `push` events (commits to default branch)
- [ ] Handles `pull_request` events (opened, closed, merged)
- [ ] Returns 200 quickly, processes async via Temporal
- [ ] Rejects invalid signatures with 401

#### Technical Details

**Endpoint:** `POST /api/webhooks/github`

**Headers:**
- `X-Hub-Signature-256`: HMAC signature of payload
- `X-GitHub-Event`: Event type (push, pull_request)
- `X-GitHub-Delivery`: Unique event ID

**Signature Validation:**
```typescript
import { createHmac, timingSafeEqual } from "crypto";

function verifyGitHubSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expected = `sha256=${createHmac("sha256", secret)
    .update(payload)
    .digest("hex")}`;
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
```

**Event Flow:**
1. Receive webhook
2. Validate signature
3. Parse event type
4. Look up repository by `owner/repo`
5. Start `githubIndexWorkflow` via Temporal
6. Return 200 immediately

#### Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/web/src/app/api/webhooks/github/route.ts` | Create | Webhook handler |
| `packages/api/src/schemas/github.ts` | Modify | Add webhook payload schemas |
| `packages/api/src/lib/github/signature.ts` | Create | Signature verification |

#### Environment Variables

```env
# Added to .env.example
GITHUB_WEBHOOK_SECRET=your-webhook-secret-here
```

---

### Story 3: Temporal Workflow - Basic Indexing

**Ticket ID:** #130
**Points:** 8
**Priority:** P0

#### Description

Create a Temporal workflow that processes GitHub events and indexes changed files. The workflow fetches file contents, chunks them, and stores in the database.

#### Acceptance Criteria

- [ ] `githubIndexWorkflow` created in `apps/worker/src/workflows/`
- [ ] Activities follow READ-ONLY pattern (mutations via tRPC internal)
- [ ] Handles push events: indexes changed files
- [ ] Handles PR events: stores PR metadata
- [ ] Idempotent: same event can be replayed safely
- [ ] Workflow completes within 5 minutes for typical pushes

#### Technical Details

**Workflow Input:**
```typescript
interface GitHubIndexInput {
  repoId: string;
  projectId: string;
  event: "push" | "pull_request";
  payload: GitHubPushPayload | GitHubPRPayload;
}
```

**Workflow Outline:**
```typescript
export async function githubIndexWorkflow(input: GitHubIndexInput): Promise<GitHubIndexResult> {
  const { repoId, event, payload } = input;

  // 1. Extract changed files from event
  const changedFiles = await extractChangedFiles({ event, payload });

  // 2. Filter to indexable files
  const filesToIndex = changedFiles.filter(shouldIndexFile);

  // 3. Fetch file contents from GitHub
  const fileContents = await fetchFileContents({
    repoId,
    files: filesToIndex,
    ref: payload.after || payload.pull_request?.head?.sha,
  });

  // 4. Chunk each file
  const allChunks: CodeChunkInput[] = [];
  for (const file of fileContents) {
    const chunks = await chunkCode({
      filePath: file.path,
      content: file.content,
      language: detectLanguage(file.path),
    });
    allChunks.push(...chunks);
  }

  // 5. Store chunks and metadata (via tRPC internal)
  const result = await storeIndexedData({
    repoId,
    event,
    payload,
    chunks: allChunks,
  });

  return result;
}
```

**Activities:**

| Activity | Purpose | Database Access |
|----------|---------|-----------------|
| `extractChangedFiles` | Parse event payload | None |
| `fetchFileContents` | GitHub API call | Read (get auth token) |
| `chunkCode` | Split code into chunks | None |
| `storeIndexedData` | Persist to DB | Write via tRPC internal |

#### Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/worker/src/workflows/github-index.workflow.ts` | Create | Main workflow |
| `apps/worker/src/workflows/index.ts` | Modify | Export new workflow |
| `apps/worker/src/temporal/activities/github.activities.ts` | Create | GitHub activities |
| `apps/worker/src/temporal/types.ts` | Modify | Add input/output types |
| `packages/api/src/routers/internal.ts` | Modify | Add `storeGitHubIndex` procedure |

#### Internal tRPC Procedure

```typescript
// packages/api/src/routers/internal.ts
storeGitHubIndex: internalProcedure
  .input(StoreGitHubIndexSchema)
  .mutation(async ({ input }) => {
    return prisma.$transaction(async (tx) => {
      // 1. Upsert commit metadata
      // 2. Upsert PR metadata (if applicable)
      // 3. Delete old chunks for changed files
      // 4. Insert new chunks
      // 5. Update repo lastIndexedAt
    });
  }),
```

---

### Story 4: Code Chunking Utility

**Ticket ID:** #131
**Points:** 5
**Priority:** P0

#### Description

Create a utility that intelligently splits code files into semantic chunks, preserving function and class boundaries. This ensures better retrieval quality compared to fixed-size chunking.

#### Acceptance Criteria

- [ ] Chunks preserve function/class boundaries when possible
- [ ] Handles TypeScript, JavaScript, Python, Go
- [ ] Falls back to line-based chunking for unknown languages
- [ ] Maximum chunk size: 500 lines or 10KB
- [ ] Minimum chunk size: 10 lines (to avoid tiny fragments)
- [ ] Includes metadata: filePath, startLine, endLine, language

#### Technical Details

**Chunking Strategy:**

1. **AST-based (preferred)**: Parse code, extract top-level declarations
2. **Heuristic (fallback)**: Split on blank lines, function keywords
3. **Fixed-size (last resort)**: Split every N lines

**Supported Languages:**

| Language | Parser | Strategy |
|----------|--------|----------|
| TypeScript/JavaScript | `@typescript-eslint/parser` | AST-based |
| Python | `tree-sitter-python` | AST-based |
| Go | `tree-sitter-go` | AST-based |
| Others | None | Heuristic/Fixed |

**Chunk Output:**
```typescript
interface CodeChunk {
  filePath: string;
  startLine: number;
  endLine: number;
  content: string;
  contentHash: string;  // SHA-256 of content for caching
  language: string | null;
  type: "function" | "class" | "module" | "block";
}
```

**File Filtering:**
```typescript
const INDEXABLE_EXTENSIONS = [
  ".ts", ".tsx", ".js", ".jsx",  // JavaScript/TypeScript
  ".py",                          // Python
  ".go",                          // Go
  ".rs",                          // Rust
  ".java",                        // Java
];

const EXCLUDED_PATTERNS = [
  /node_modules/,
  /\.git/,
  /dist\//,
  /build\//,
  /\.min\./,
  /package-lock\.json/,
  /pnpm-lock\.yaml/,
];

function shouldIndexFile(path: string): boolean {
  if (EXCLUDED_PATTERNS.some(p => p.test(path))) return false;
  return INDEXABLE_EXTENSIONS.some(ext => path.endsWith(ext));
}
```

#### Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/shared/src/chunking/index.ts` | Create | Main chunking module |
| `packages/shared/src/chunking/typescript.ts` | Create | TS/JS chunker |
| `packages/shared/src/chunking/python.ts` | Create | Python chunker |
| `packages/shared/src/chunking/fallback.ts` | Create | Heuristic chunker |
| `packages/shared/src/chunking/types.ts` | Create | Type definitions |

#### Testing

```typescript
describe("chunkCode", () => {
  it("preserves TypeScript function boundaries", () => {
    const code = `
      function foo() { return 1; }
      function bar() { return 2; }
    `;
    const chunks = chunkCode({ content: code, language: "typescript" });
    expect(chunks).toHaveLength(2);
    expect(chunks[0].content).toContain("foo");
    expect(chunks[1].content).toContain("bar");
  });

  it("handles large files with fixed-size fallback", () => {
    const code = "x\n".repeat(1000);
    const chunks = chunkCode({ content: code, language: "unknown" });
    expect(chunks.every(c => c.endLine - c.startLine <= 500)).toBe(true);
  });
});
```

---

## Sprint Backlog Summary

| Story | Points | Assignee | Status |
|-------|--------|----------|--------|
| #128 Database schema | 3 | TBD | To Do |
| #129 Webhook endpoint | 5 | TBD | To Do |
| #130 Index workflow | 8 | TBD | To Do |
| #131 Code chunking | 5 | TBD | To Do |
| **Total** | **21** | | |

---

## Dependencies & Blockers

| Dependency | Status | Notes |
|------------|--------|-------|
| Temporal worker running | ✅ Done | #115 completed |
| PostgreSQL access | ✅ Done | Existing infra |
| GitHub App credentials | ⚠️ Needed | Create before sprint start |

---

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| AST parsing failures | Medium | Fallback to heuristic chunking |
| Large files timeout | Low | Chunk size limits, skip very large files |
| GitHub API rate limits | Low | Use installation tokens, cache responses |

---

## Definition of Ready (for Sprint 2)

By end of Sprint 1:
- [ ] All code chunks stored in `code_chunks` table
- [ ] Commits/PRs tracked in respective tables
- [ ] Chunking unit tests passing
- [ ] Integration test: push event → chunks in DB
