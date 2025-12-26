# Engineering Spec: Repository Indexing Workflow

**Issue**: #152
**Status**: Implemented
**Author**: Engineering Team
**Created**: 2025-12-13
**Last Updated**: 2025-12-13

## Overview

Wire up the GitHub repository indexing flow to trigger Temporal workflows when a repository is enabled or re-indexed. This connects the existing UI enable/disable functionality to actual code indexing via Temporal.

## Problem Statement

Currently when a user enables a repository for indexing:
- ✅ Database is updated (`enabled: true`, `indexStatus: "PENDING"`)
- ❌ No actual indexing occurs (Temporal workflow not triggered)

The same applies to re-indexing - status is updated but no workflow runs.

## Goals

1. Trigger `repositoryIndexWorkflow` when repository is enabled
2. Trigger re-indexing workflow when user clicks "Re-index"
3. Update repository status based on workflow progress
4. Handle workflow failures gracefully

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Repository Indexing Flow                              │
└─────────────────────────────────────────────────────────────────────────────┘

  User clicks "Enable Repository"
           │
           ▼
  ┌─────────────────────────────────────┐
  │ tRPC: github.enableRepository       │
  │                                     │
  │ 1. Update DB: enabled=true          │
  │ 2. Update DB: indexStatus=PENDING   │
  │ 3. Start Temporal workflow          │
  └──────────┬──────────────────────────┘
             │
             ▼
  ┌─────────────────────────────────────┐
  │ Temporal: repositoryIndexWorkflow   │
  │                                     │
  │ Input:                              │
  │   - repositoryId                    │
  │   - installationId                  │
  │   - owner, repo, branch             │
  │   - mode: "initial" | "reindex"     │
  └──────────┬──────────────────────────┘
             │
             ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │                      Workflow Activities                         │
  └─────────────────────────────────────────────────────────────────┘
             │
  ┌──────────┼──────────┬──────────────┬───────────────┐
  │          │          │              │               │
  ▼          ▼          ▼              ▼               ▼
┌──────┐  ┌──────┐  ┌────────┐  ┌───────────┐  ┌────────────┐
│Update│  │Cleanup│ │ Fetch  │  │  Chunk    │  │   Store    │
│Status│  │Chunks │ │ Tree   │  │  Files    │  │  Chunks    │
│      │  │(reindx)│ │        │  │           │  │            │
│INDEXING│ │Delete │ │GitHub  │  │ Shared    │  │ PostgreSQL │
│      │  │old    │ │ API    │  │ chunking  │  │ via tRPC   │
└──────┘  └──────┘  └────────┘  └───────────┘  └────────────┘
             │
             ▼
  ┌─────────────────────────────────────┐
  │ Final Activity: updateIndexStatus   │
  │                                     │
  │ - indexStatus = READY               │
  │ - lastIndexedAt = NOW()             │
  └─────────────────────────────────────┘
```

## Implementation

### Workflow Input Types

**File**: `apps/worker/src/temporal/types.ts`

```typescript
export interface RepositoryIndexInput {
  repositoryId: string;
  installationId: number;
  owner: string;
  repo: string;
  branch: string;
  mode: "initial" | "reindex";
}

export interface RepositoryIndexResult {
  success: boolean;
  filesProcessed: number;
  chunksCreated: number;
  error?: string;
}
```

### Workflow Definition

**File**: `apps/worker/src/workflows/repository-index.workflow.ts`

```typescript
import { proxyActivities, log, ApplicationFailure } from "@temporalio/workflow";
import type * as activities from "../temporal/activities";
import type { RepositoryIndexInput, RepositoryIndexResult } from "../temporal/types";

const {
  updateRepositoryIndexStatus,
  cleanupRepositoryChunks,
  fetchRepositoryTree,
  fetchRepositoryContents,
  chunkCodeFiles,
  storeRepositoryChunks,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 minutes",
  retry: { maximumAttempts: 3 },
});

export async function repositoryIndexWorkflow(
  input: RepositoryIndexInput
): Promise<RepositoryIndexResult> {
  // ... workflow implementation
}
```

### Activities

**File**: `apps/worker/src/temporal/activities/repository-index.activities.ts`

Activities follow the READ-ONLY pattern - all mutations go through tRPC internal procedures:

```typescript
import { getInternalCaller } from "@/lib/trpc-caller";

// Mutation: uses tRPC internal caller
export async function updateRepositoryIndexStatus(
  repositoryId: string,
  status: "PENDING" | "INDEXING" | "READY" | "FAILED"
): Promise<void> {
  const caller = getInternalCaller();
  await caller.internal.updateRepositoryIndexStatus({
    repositoryId,
    status,
    lastIndexedAt: status === "READY" ? new Date() : undefined,
  });
}

// Read-only: fetches from GitHub API
export async function fetchRepositoryTree(input: FetchTreeInput): Promise<string[]> {
  // Uses Octokit with GitHub App authentication
}

export async function fetchRepositoryContents(input: FetchContentsInput): Promise<FileContent[]> {
  // Fetches file contents in batches
}

// Mutation: stores chunks via tRPC
export async function storeRepositoryChunks(input: StoreRepositoryChunksInput): Promise<{ chunksCreated: number }> {
  const caller = getInternalCaller();
  return caller.internal.storeRepositoryChunks(input);
}
```

### Temporal Client

**File**: `packages/api/src/lib/temporal.ts`

The Temporal client lives in the API package (not web app) since tRPC routers trigger workflows:

```typescript
import { Client, Connection } from "@temporalio/client";

let _client: Client | null = null;
let _connectionPromise: Promise<Connection> | null = null;

export async function getTemporalClient(): Promise<Client> {
  if (_client) return _client;

  if (!_connectionPromise) {
    const address = getTemporalAddress();
    _connectionPromise = Connection.connect({ address });
  }

  const connection = await _connectionPromise;
  _client = new Client({ connection });
  return _client;
}

export function getTaskQueue(): string {
  return process.env.TEMPORAL_TASK_QUEUE || "ducsigr-tasks";
}
```

### tRPC Router Integration

**File**: `packages/api/src/routers/github.ts`

```typescript
import { getTemporalClient, getTaskQueue } from "../lib/temporal";

enableRepository: protectedProcedure
  .input(RepositoryActionSchema)
  .use(workspaceMiddleware)
  .mutation(async ({ ctx, input }) => {
    // ... validation ...

    const updatedRepo = await prisma.gitHubRepository.update({
      where: { id: repositoryId },
      data: {
        enabled: true,
        indexStatus: "PENDING",
      },
      include: { installation: true },
    });

    // Start Temporal workflow
    try {
      const client = await getTemporalClient();
      await client.workflow.start("repositoryIndexWorkflow", {
        taskQueue: getTaskQueue(),
        workflowId: `repo-index-${repositoryId}-${Date.now()}`,
        args: [{
          repositoryId: updatedRepo.id,
          installationId: Number(updatedRepo.installation.installationId),
          owner: updatedRepo.owner,
          repo: updatedRepo.repo,
          branch: updatedRepo.defaultBranch,
          mode: "initial",
        }],
      });
    } catch (error) {
      console.error("[GitHub] Failed to start indexing workflow:", error);
      // Mutation succeeds - user can retry via re-index
    }

    return { success: true };
  }),
```

### Internal tRPC Procedures

**File**: `packages/api/src/routers/internal.ts`

```typescript
updateRepositoryIndexStatus: internalProcedure
  .input(z.object({
    repositoryId: z.string(),
    status: z.enum(["PENDING", "INDEXING", "READY", "FAILED"]),
    lastIndexedAt: z.date().optional(),
  }))
  .mutation(async ({ input }) => {
    return prisma.gitHubRepository.update({
      where: { id: input.repositoryId },
      data: {
        indexStatus: input.status,
        lastIndexedAt: input.lastIndexedAt,
      },
    });
  }),

deleteRepositoryChunks: internalProcedure
  .input(z.object({ repositoryId: z.string() }))
  .mutation(async ({ input }) => {
    const result = await prisma.codeChunk.deleteMany({
      where: { repoId: input.repositoryId },
    });
    return { deletedCount: result.count };
  }),

storeRepositoryChunks: internalProcedure
  .input(z.object({
    repositoryId: z.string(),
    chunks: z.array(CodeChunkDataSchema),
  }))
  .mutation(async ({ input }) => {
    const result = await prisma.codeChunk.createMany({
      data: input.chunks.map((chunk) => ({
        repoId: input.repositoryId,
        ...chunk,
      })),
    });
    return { chunksCreated: result.count };
  }),
```

## Database Schema

No schema changes required. Uses existing tables:
- `GitHubRepository` - `indexStatus`, `lastIndexedAt` fields
- `CodeChunk` - stores parsed code chunks

## Index Status State Machine

```
┌─────────┐     Enable      ┌─────────┐
│ NONE    │ ───────────────▶│ PENDING │
└─────────┘                 └────┬────┘
                                 │
                    Workflow     │
                    Started      ▼
                            ┌──────────┐
                            │ INDEXING │
                            └────┬─────┘
                                 │
              ┌──────────────────┼──────────────────┐
              │                  │                  │
              ▼                  │                  ▼
        ┌─────────┐              │            ┌────────┐
        │  READY  │              │            │ FAILED │
        └─────────┘              │            └────────┘
              │                  │                  │
              │   Re-index       │    Re-index     │
              └──────────────────┴──────────────────┘
                                 │
                                 ▼
                            ┌─────────┐
                            │ PENDING │
                            └─────────┘
```

## Files Summary

### New Files
| File | Purpose |
|------|---------|
| `packages/api/src/lib/temporal.ts` | Temporal client for API package |
| `apps/worker/src/workflows/repository-index.workflow.ts` | Workflow definition |
| `apps/worker/src/temporal/activities/repository-index.activities.ts` | Workflow activities |

### Modified Files
| File | Changes |
|------|---------|
| `packages/api/package.json` | Add @temporalio/client |
| `apps/worker/package.json` | Add @octokit/rest, @octokit/auth-app |
| `apps/worker/src/temporal/types.ts` | Add RepositoryIndexInput/Result types |
| `apps/worker/src/workflows/index.ts` | Export repositoryIndexWorkflow |
| `apps/worker/src/temporal/activities/index.ts` | Export new activities |
| `packages/api/src/routers/github.ts` | Trigger workflow on enable/reindex |
| `packages/api/src/routers/internal.ts` | Add status/chunk procedures |

## Error Handling

| Error | Handling |
|-------|----------|
| GitHub API rate limit | Batch requests with delays, retry with backoff |
| GitHub API auth failure | Fail workflow, mark FAILED |
| File size too large | Skip file (>100KB), log warning, continue |
| Temporal unavailable | Log error, return success (user can retry) |
| Database error | Retry 3x via Temporal, then fail workflow |

## Security Considerations

1. **GitHub Token**: Use GitHub App installation token
2. **File Access**: Only index files the installation has access to
3. **Rate Limits**: Batch requests with 100ms delays
4. **Data Size**: 100KB max file size, skip binary files

## Performance Characteristics

Tested results:
- 32 files processed in ~1.8 seconds
- Batched GitHub API requests (20 files per batch)
- 100ms delay between batches to avoid rate limits
