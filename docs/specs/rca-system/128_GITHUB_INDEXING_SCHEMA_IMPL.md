# Implementation Plan: #128 Database Schema for GitHub Indexing

**Story Points:** 3
**Priority:** P0
**Sprint:** Sprint 1 - Foundation

---

## Overview

Create the database schema to store GitHub repository connections, commits, pull requests, and code chunks. This is the foundation for all subsequent indexing work in the RCA system.

---

## Files to Modify/Create

| File | Action | Description |
|------|--------|-------------|
| `packages/db/prisma/schema.prisma` | Modify | Add new models, enums, and relations |
| `packages/api/src/schemas/github.ts` | Create | Zod schemas for GitHub types |
| `packages/api/src/schemas/index.ts` | Modify | Export new github schemas |

---

## Implementation Steps

### Step 1: Add IndexStatus Enum to Prisma Schema

Add the new enum at **line ~340** (after `AlertState` enum):

```prisma
enum IndexStatus {
  PENDING
  INDEXING
  READY
  FAILED
}
```

**Location:** After `AlertState` enum (around line 339)

---

### Step 2: Add GitHub Indexing Section (End of File)

Add a new section comment and all GitHub models at the **end of the file** (after `TraceSession` model, around line 496):

```prisma
// ============================================================
// GitHub Indexing Models (RCA System)
// ============================================================
```

### Step 3: Add GitHubRepository Model

```prisma
model GitHubRepository {
  id              String      @id @default(cuid())
  projectId       String      @unique  // One repo per project (for now)
  owner           String               // GitHub org/user name
  repo            String               // Repository name
  defaultBranch   String      @default("main")
  installationId  BigInt?              // GitHub App installation ID
  indexStatus     IndexStatus @default(PENDING)
  lastIndexedAt   DateTime?
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt

  // Relations
  project   Project         @relation(fields: [projectId], references: [id], onDelete: Cascade)
  commits   GitCommit[]
  prs       GitPullRequest[]
  chunks    CodeChunk[]

  @@index([owner, repo])
  @@map("github_repositories")
}
```

**Key Decisions:**
- `projectId` is `@unique` - one repo per project (per spec)
- `installationId` as `BigInt` - GitHub uses large integers
- Cascade delete to Project - cleanup when project deleted
- `@@map` for cleaner table name

---

### Step 4: Add GitCommit Model

```prisma
model GitCommit {
  id          String   @id @default(cuid())
  repoId      String
  sha         String   @db.Char(40)  // Git commit SHA (exactly 40 chars)
  message     String              // Commit message
  author      String              // Author name
  authorEmail String?             // Author email
  timestamp   DateTime            // Commit timestamp
  createdAt   DateTime @default(now())

  // Relations
  repo GitHubRepository @relation(fields: [repoId], references: [id], onDelete: Cascade)
  prs  GitPullRequest[] // PRs that contain this commit (implicit M-to-M)

  @@unique([repoId, sha])
  @@index([repoId, timestamp(sort: Desc)])
  @@map("git_commits")
}
```

**Key Decisions:**
- Unique constraint on `(repoId, sha)` - prevent duplicate commits
- Index on `(repoId, timestamp)` with descending sort for recent-first queries
- Author info stored for RCA correlation
- Many-to-many with PRs via implicit join table

---

### Step 5: Add GitPullRequest Model

```prisma
model GitPullRequest {
  id          String    @id @default(cuid())
  repoId      String
  number      Int                 // PR number (GitHub PR #)
  title       String
  body        String?   @db.Text  // PR description (can be long)
  state       String              // open, closed, merged
  author      String              // PR author
  baseBranch  String              // Target branch (e.g., main)
  headBranch  String              // Source branch
  mergedAt    DateTime?           // When merged (null if not merged)
  closedAt    DateTime?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  // Relations
  repo    GitHubRepository @relation(fields: [repoId], references: [id], onDelete: Cascade)
  commits GitCommit[]      // Commits in this PR (implicit M-to-M)

  @@unique([repoId, number])
  @@index([repoId, mergedAt(sort: Desc)])
  @@map("git_pull_requests")
}
```

**Key Decisions:**
- `number` is the GitHub PR number (not CUID)
- Unique constraint on `(repoId, number)`
- Index on `(repoId, mergedAt)` for finding recent merged PRs (RCA correlation)
- `state` as String (not enum) for flexibility with GitHub's states
- `body` uses `@db.Text` for large PR descriptions

---

### Step 6: Add CodeChunk Model

```prisma
model CodeChunk {
  id          String   @id @default(cuid())
  repoId      String
  filePath    String              // Full file path in repo
  startLine   Int                 // Starting line number
  endLine     Int                 // Ending line number
  content     String   @db.Text   // Chunk content (can be large)
  contentHash String   @db.Char(64)  // SHA-256 hash for deduplication (64 hex chars)
  language    String?             // Detected language
  chunkType   String   @default("block")  // function, class, module, block
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  // Relations
  repo GitHubRepository @relation(fields: [repoId], references: [id], onDelete: Cascade)

  @@index([repoId, filePath])
  @@index([contentHash])
  @@map("code_chunks")
}
```

**Key Decisions:**
- No `embedding` column yet (Sprint 2 adds this)
- `contentHash` for caching/deduplication
- `chunkType` as String for flexibility
- Index on `(repoId, filePath)` for file-based queries
- Index on `contentHash` for duplicate detection
- `content` uses `@db.Text` for large code chunks

---

### Step 7: Add AlertRCA Model

```prisma
model AlertRCA {
  id               String   @id @default(cuid())
  alertId          String
  triggeredAt      DateTime            // When alert triggered
  analysisJson     Json                // RCA analysis results
  suspectedPRs     String[]            // Array of PR IDs
  suspectedCommits String[]            // Array of commit IDs
  confidence       Float?              // Confidence score (0-1)
  createdAt        DateTime @default(now())

  // Relations
  alert Alert @relation(fields: [alertId], references: [id], onDelete: Cascade)

  @@index([alertId])
  @@index([triggeredAt(sort: Desc)])
  @@map("alert_rcas")
}
```

**Key Decisions:**
- Links to existing Alert model
- `analysisJson` for flexible RCA data storage
- Arrays for suspected PRs/commits (can be multiple)
- Index on `triggeredAt` for recent-first queries

---

### Step 8: Update Project Model (line ~148-165)

Add the `githubRepo` relation to the existing Project model:

```prisma
model Project {
  id          String   @id @default(cuid())
  name        String
  workspaceId String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  workspace     Workspace          @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  apiKeys       ApiKey[]
  traces        Trace[]
  traceSessions TraceSession[]
  trackedUsers  TrackedUser[]
  members       ProjectMember[]
  costSummary   CostDailySummary[]
  alerts        Alert[]
  githubRepo    GitHubRepository?  // <-- ADD THIS LINE

  @@index([workspaceId])
}
```

---

### Step 9: Update Alert Model (line ~341-376)

Add the `rcaAnalyses` relation to the existing Alert model:

```prisma
model Alert {
  // ... existing fields ...

  channels        AlertChannel[]
  channelLinks    AlertChannelLink[]
  history         AlertHistory[]
  rcaAnalyses     AlertRCA[]         // <-- ADD THIS LINE
  createdAt       DateTime           @default(now())
  updatedAt       DateTime           @updatedAt

  // ... existing indexes ...
}
```

---

### Step 10: Create Zod Schemas

Create `packages/api/src/schemas/github.ts`:

```typescript
import { z } from "zod";

// ============================================
// Enums (Source of Truth)
// ============================================

export const IndexStatusSchema = z.enum([
  "PENDING",
  "INDEXING",
  "READY",
  "FAILED",
]);
export type IndexStatus = z.infer<typeof IndexStatusSchema>;
export const ALL_INDEX_STATUSES = IndexStatusSchema.options;

export const ChunkTypeSchema = z.enum([
  "function",
  "class",
  "module",
  "block",
]);
export type ChunkType = z.infer<typeof ChunkTypeSchema>;

// ============================================
// UI Display Constants
// ============================================

export const INDEX_STATUS_LABELS: Record<IndexStatus, string> = {
  PENDING: "Pending",
  INDEXING: "Indexing...",
  READY: "Ready",
  FAILED: "Failed",
};

// ============================================
// Input Schemas
// ============================================

export const ConnectRepositorySchema = z.object({
  projectId: z.string().min(1),
  owner: z.string().min(1),
  repo: z.string().min(1),
  defaultBranch: z.string().default("main"),
  installationId: z.bigint().optional(),
});
export type ConnectRepositoryInput = z.infer<typeof ConnectRepositorySchema>;

// ============================================
// Code Chunk Schemas (for Temporal workflows)
// ============================================

export const CodeChunkSchema = z
  .object({
    filePath: z.string(),
    startLine: z.number().int().positive(),
    endLine: z.number().int().positive(),
    content: z.string(),
    contentHash: z.string().length(64),
    language: z.string().nullable(),
    chunkType: ChunkTypeSchema,
  })
  .refine((data) => data.endLine >= data.startLine, {
    message: "endLine must be greater than or equal to startLine",
    path: ["endLine"],
  });
export type CodeChunkInput = z.infer<typeof CodeChunkSchema>;
```

---

### Step 11: Export from Index

Update `packages/api/src/schemas/index.ts` - add at end of file:

```typescript
export * from "./github";
```

---

### Step 12: Generate Migration

Run from project root:

```bash
pnpm --filter @ducsigr/db db:migrate:dev --name add_github_indexing
```

---

### Step 13: Verify Prisma Client Generation

```bash
pnpm --filter @ducsigr/db db:generate
```

---

### Step 14: Run Type Check

```bash
pnpm typecheck
```

---

## Acceptance Criteria Checklist

Per spec requirements:

- [ ] Prisma schema includes `IndexStatus` enum (PENDING, INDEXING, READY, FAILED)
- [ ] `GitHubRepository` model with `projectId` unique constraint
- [ ] `GitCommit` model with `@@unique([repoId, sha])`
- [ ] `GitCommit` model with `@@index([repoId, timestamp(sort: Desc)])`
- [ ] `GitPullRequest` model with `@@unique([repoId, number])`
- [ ] `GitPullRequest` model with `@@index([repoId, mergedAt(sort: Desc)])`
- [ ] `CodeChunk` model with `@@index([repoId, filePath])`
- [ ] `CodeChunk` model with `@@index([contentHash])`
- [ ] `AlertRCA` model linked to Alert with cascade delete
- [ ] Project model updated with `githubRepo` relation
- [ ] Alert model updated with `rcaAnalyses` relation
- [ ] Migration runs successfully on dev
- [ ] Prisma client generates without errors
- [ ] Zod schemas in `packages/api/src/schemas/github.ts`
- [ ] Schemas exported from `packages/api/src/schemas/index.ts`
- [ ] `pnpm typecheck` passes

---

## Testing Verification

After implementation:

1. **Migration Test**: Run `pnpm --filter @ducsigr/db db:migrate:dev --name add_github_indexing`
2. **Client Generation**: Run `pnpm --filter @ducsigr/db db:generate`
3. **Type Check**: Run `pnpm typecheck` - must pass
4. **Prisma Studio**: Open `pnpm --filter @ducsigr/db db:studio` to verify:
   - All 5 new tables created (github_repositories, git_commits, git_pull_requests, code_chunks, alert_rcas)
   - Relations work correctly
   - Indexes visible in table structure

---

## Notes

- **No embedding column** in CodeChunk - that's Sprint 2 (#132 Vector Embeddings)
- **GitHubRepository.projectId is unique** - one repo per project (can be relaxed later)
- **installationId is BigInt** - GitHub installation IDs are large integers
- **PR ↔ Commit is implicit M-to-M** - Prisma creates `_GitCommitToGitPullRequest` join table
- **body and content use @db.Text** - PR descriptions and code chunks can be large
- Keep `chunkType` and `state` as Strings for GitHub API flexibility
