# Temporal Workflows Documentation

> **This is the source of truth for all workflow-related information.**
> When adding new workflows, update this document.

## Overview

Ducsigr uses [Temporal](https://temporal.io/) for durable workflow orchestration. All background processing runs as Temporal workflows with activities.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         WORKFLOW ARCHITECTURE                        │
└─────────────────────────────────────────────────────────────────────┘

  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
  │   Triggers   │     │   Temporal   │     │   Database   │
  │              │     │              │     │              │
  │ - Webhooks   │────▶│  Workflows   │────▶│  PostgreSQL  │
  │ - Ingest API │     │  Activities  │     │              │
  │ - Scheduler  │     │              │     │              │
  └──────────────┘     └──────────────┘     └──────────────┘
                              │
                              ▼
                       ┌──────────────┐
                       │  tRPC Internal│
                       │  (mutations)  │
                       └──────────────┘
```

## Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| Temporal Worker | `apps/worker/src/temporal/worker.ts` | Worker factory and lifecycle |
| Temporal Client | `apps/worker/src/temporal/client.ts` | Client singleton for workflow operations |
| Workflows | `apps/worker/src/workflows/*.ts` | Workflow definitions |
| Activities | `apps/worker/src/temporal/activities/*.ts` | Activity implementations (READ-ONLY) |
| Startup Registry | `apps/worker/src/startup/index.ts` | Workflow registry and boot-time initialization |
| Internal Router | `packages/api/src/routers/internal.ts` | tRPC procedures for mutations |
| tRPC Caller | `apps/worker/src/lib/trpc-caller.ts` | Internal tRPC caller for activities |
| Types | `apps/worker/src/temporal/types.ts` | Workflow input/output types |

## Workflow Registry

The `WORKFLOW_REGISTRY` in `apps/worker/src/startup/index.ts` is the **single source of truth** for all workflow types:

```typescript
const WORKFLOW_REGISTRY: Record<WorkflowType, WorkflowConfig> = {
  alerts: {
    name: "Alert Evaluation",
    description: "Long-running workflows for monitoring alert conditions",
    startOnBoot: true,
    starter: startAlertWorkflows,
  },
  github: {
    name: "GitHub Indexing",
    description: "Event-driven workflows triggered by GitHub webhooks",
    startOnBoot: false,
  },
  traces: {
    name: "Trace Ingestion",
    description: "Event-driven workflows for processing incoming traces",
    startOnBoot: false,
  },
  scores: {
    name: "Score Ingestion",
    description: "Event-driven workflows for processing incoming scores",
    startOnBoot: false,
  },
};
```

## Workflow Types

### All Workflows

| Workflow | File | Purpose | Duration | Trigger |
|----------|------|---------|----------|---------|
| `traceIngestionWorkflow` | `trace.workflow.ts` | Process trace + spans | Short-lived | Ingest API |
| `scoreIngestionWorkflow` | `score.workflow.ts` | Process score | Short-lived | Ingest API |
| `alertEvaluationWorkflow` | `alert.workflow.ts` | Evaluate alerts periodically | Long-running | Worker boot |
| `githubIndexWorkflow` | `github-index.workflow.ts` | Index GitHub push/PR events | Short-lived | GitHub webhook |
| `repositoryIndexWorkflow` | `repository-index.workflow.ts` | Full repository indexing from UI | Short-lived | UI enable/re-index |

### Workflow Categories

| Category | `startOnBoot` | Trigger | Lifecycle |
|----------|---------------|---------|-----------|
| **Long-running** | `true` | Worker startup | Runs continuously, one per entity |
| **Event-driven** | `false` | External event | Starts on demand, completes quickly |

## Adding a New Workflow

### Checklist

- [ ] Create workflow file in `apps/worker/src/workflows/`
- [ ] Export from `apps/worker/src/workflows/index.ts`
- [ ] Add input/output types to `apps/worker/src/temporal/types.ts`
- [ ] Create activities in `apps/worker/src/temporal/activities/`
- [ ] Export activities from `apps/worker/src/temporal/activities/index.ts`
- [ ] Add to `WORKFLOW_REGISTRY` in `apps/worker/src/startup/index.ts`
- [ ] If `startOnBoot: true`, create starter in `apps/worker/src/startup/`
- [ ] Add internal tRPC procedures if needed
- [ ] **Update this document with the new workflow**

### Step-by-Step Guide

#### 1. Create Workflow File

```typescript
// apps/worker/src/workflows/my.workflow.ts
import { proxyActivities, log } from "@temporalio/workflow";
import type * as activities from "../temporal/activities";
import type { MyWorkflowInput, MyWorkflowResult } from "../temporal/types";

const { myActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "30s",
});

export async function myWorkflow(input: MyWorkflowInput): Promise<MyWorkflowResult> {
  log.info("Starting my workflow", { input });
  const result = await myActivity(input);
  return result;
}
```

#### 2. Export from Workflows Index

```typescript
// apps/worker/src/workflows/index.ts
export { myWorkflow } from "./my.workflow";
```

#### 3. Add Types

```typescript
// apps/worker/src/temporal/types.ts
export interface MyWorkflowInput {
  id: string;
  // ... fields
}

export interface MyWorkflowResult {
  success: boolean;
  // ... fields
}
```

#### 4. Create Activities

```typescript
// apps/worker/src/temporal/activities/my.activities.ts
import { getInternalCaller } from "@/lib/trpc-caller";
import type { MyWorkflowInput, MyWorkflowResult } from "../types";

// READ-ONLY: Use tRPC internal caller for mutations
export async function myActivity(input: MyWorkflowInput): Promise<MyWorkflowResult> {
  const caller = getInternalCaller();
  return caller.internal.myProcedure(input);
}
```

#### 5. Export Activities

```typescript
// apps/worker/src/temporal/activities/index.ts
export * from "./my.activities";
```

#### 6. Add to Registry

```typescript
// apps/worker/src/startup/index.ts
const WORKFLOW_REGISTRY: Record<WorkflowType, WorkflowConfig> = {
  // ... existing
  myWorkflow: {
    name: "My Workflow",
    description: "Description of what it does",
    startOnBoot: false, // or true if long-running
  },
};
```

#### 7. (If Long-Running) Create Starter

```typescript
// apps/worker/src/startup/my-workflows.ts
export async function startMyWorkflows(
  client: Client,
  taskQueue: string
): Promise<{ started: number; skipped: number }> {
  // Implementation
}
```

## Activity Pattern (CRITICAL)

**All database mutations MUST go through tRPC internal procedures.**

```typescript
// ❌ FORBIDDEN - Direct database mutation in activity
export async function myActivity(input: Input): Promise<Result> {
  await prisma.myTable.create({ data: input }); // NEVER do this
}

// ✅ REQUIRED - Use tRPC internal caller
export async function myActivity(input: Input): Promise<Result> {
  const caller = getInternalCaller();
  return caller.internal.myProcedure(input);
}
```

**Activities can READ from database:**
```typescript
// ✅ OK - Read operations are allowed
export async function getDetails(id: string): Promise<Details | null> {
  return prisma.myTable.findUnique({ where: { id } });
}
```

## Available Internal Procedures

| Procedure | Input | Purpose |
|-----------|-------|---------|
| `internal.ingestTrace` | `{ trace, spans }` | Persist trace + spans |
| `internal.calculateTraceCosts` | `{ traceId }` | Calculate span costs |
| `internal.updateCostSummaries` | `{ projectId, date }` | Update daily summaries |
| `internal.ingestScore` | `{ id, projectId, ... }` | Persist score |
| `internal.validateScoreConfig` | `{ configId, value }` | Validate score config |
| `internal.transitionAlertState` | `{ alertId, conditionMet }` | Transition alert state |
| `internal.dispatchNotification` | `{ alertId, state, ... }` | Send notifications |
| `internal.storeGitHubIndex` | `{ repoId, chunks, ... }` | Store indexed code (returns chunkIds) |
| `internal.updateTreeRootHash` | `{ repositoryId, treeRootHash }` | Update Merkle tree root hash |
| `internal.updateRepositoryIndexStatus` | `{ repositoryId, status, lastIndexedAt? }` | Update repo index status |
| `internal.deleteRepositoryChunks` | `{ repositoryId }` | Delete chunks for reindex |
| `internal.storeRepositoryChunks` | `{ repositoryId, chunks }` | Store code chunks (returns chunkIds) |
| `internal.storeChunkEmbeddings` | `{ embeddings: [{ chunkId, embedding }] }` | Store embeddings in pgvector |
| `internal.storeRCA` | `{ alertHistoryId, rcaReport, ... }` | Persist RCA analysis results |

## Startup Summary Output

When the worker starts, it prints a consolidated summary:

```
┌────────────────────────────────────────────────────────┐
│              WORKFLOW STARTUP SUMMARY                  │
├────────────────────────────────────────────────────────┤
│  Alert Evaluation      ✓ 3 started, 0 skipped         │
│  GitHub Indexing       ○ Event-driven                 │
│  Trace Ingestion       ○ Event-driven                 │
│  Score Ingestion       ○ Event-driven                 │
├────────────────────────────────────────────────────────┤
│  Total: 3 started, 0 skipped, 0 errors                │
│  Duration: 45ms                                        │
│  Status: ✓ SUCCESS                                     │
└────────────────────────────────────────────────────────┘
```

## Alert System Details

The alerting system uses a state machine with Temporal:

```
State Machine: INACTIVE → PENDING → FIRING → RESOLVED → INACTIVE

Notification Rules:
- PENDING → FIRING: First notification sent
- FIRING → FIRING: Re-notify only if cooldown passed
- All other transitions: No notification
```

**Severity-based timing:**

| Severity | Pending Duration | Cooldown | Use Case |
|----------|------------------|----------|----------|
| CRITICAL | 1 min | 5 min | System down |
| HIGH | 2 min | 30 min | Degradation |
| MEDIUM | 3 min | 2 hours | Performance |
| LOW | 5 min | 12 hours | Warnings |

**Key files:**
- Workflow: `apps/worker/src/workflows/alert.workflow.ts`
- Activities: `apps/worker/src/temporal/activities/alert.activities.ts`
- Schemas: `packages/api/src/schemas/alerting.ts`
- Adapters: `packages/api/src/lib/alerting/adapters/`

## GitHub Indexing Details

Processes GitHub webhook events, indexes code, and generates embeddings:

```
Push Event → extractChangedFiles → filter → fetchFileContents → chunkCodeFiles
  → Merkle tree diff (skip if unchanged) → storeIndexedData
  → generateEmbeddings → storeEmbeddings → updateTreeRootHash
PR Event → parse payload → storeIndexedData (metadata only)
```

**Incremental embedding generation**: When code is pushed, the workflow now generates and stores embeddings for new/changed chunks, making them immediately searchable by RCA vector search.

**Merkle tree change detection**: A root hash is stored per repository. On push, the workflow builds a Merkle tree from chunks and compares root hashes. If identical, chunk storage and embedding generation are skipped entirely.

**Key files:**
- Workflow: `apps/worker/src/workflows/github-index.workflow.ts`
- Activities: `apps/worker/src/temporal/activities/github.activities.ts`
- Merkle tree: `packages/shared/src/merkle/index.ts`
- Schemas: `packages/api/src/schemas/github.ts`
- Chunking: `packages/shared/src/chunking/`

## Repository Indexing Details

Indexes entire repository when user enables or re-indexes from UI:

```
Enable/Re-index → updateStatus(INDEXING) → cleanupChunks (if reindex) →
  fetchRepositoryTree → fetchRepositoryContents (batched) →
  chunkCodeFiles → storeRepositoryChunks → updateStatus(READY)
```

**Trigger**: tRPC `github.enableRepository` or `github.reindexRepository`

**Input types:**
```typescript
interface RepositoryIndexInput {
  repositoryId: string;
  installationId: number;
  owner: string;
  repo: string;
  branch: string;
  mode: "initial" | "reindex";
}
```

**Key files:**
- Workflow: `apps/worker/src/workflows/repository-index.workflow.ts`
- Activities: `apps/worker/src/temporal/activities/repository-index.activities.ts`
- Temporal Client: `packages/api/src/lib/temporal.ts`
- Router: `packages/api/src/routers/github.ts`

**Performance:**
- Batches GitHub API requests (20 files per batch)
- 100ms delay between batches to avoid rate limits
- 100KB max file size limit

## Embedding and Search Details

Generates embeddings for code chunks and provides semantic search:

### Embedding Generation Flow

```
storeRepositoryChunks → generateEmbeddings → storeEmbeddings
```

**Activities:**
- `generateEmbeddings`: Uses LLM Center to generate embeddings for code chunks
- `storeEmbeddings`: Stores embeddings in pgvector via `internal.storeChunkEmbeddings`

**Configuration:**
- Model: `text-embedding-3-small` (1536 dimensions)
- Batch size: 50 chunks (max 100)
- Rate limiting: 200ms between batches

### Vector Search Activities

```
searchCodebase → LLM Center (embed query) → pgvector (similarity search) → results
```

**Activities:**
- `searchCodebase`: Search by repository ID
- `searchProjectCodebase`: Search by project ID (resolves to repository)

**Input types:**
```typescript
interface SearchCodebaseInput {
  repoId: string;
  query: string;
  topK?: number;        // default: 10, max: 100
  minSimilarity?: number; // default: 0.5
  filePatterns?: string[]; // e.g., ["*.ts", "src/**"]
}
```

**tRPC endpoint:**
- `github.searchCodebase`: UI-accessible search endpoint

**Key files:**
- Embedding Activities: `apps/worker/src/temporal/activities/embedding.activities.ts`
- Search Activities: `apps/worker/src/temporal/activities/search.activities.ts`
- Vector Operations: `packages/db/src/vector.ts`
- tRPC Router: `packages/api/src/routers/github.ts`

**Performance Targets:**
- P95 latency < 500ms for 100K chunks
- Uses HNSW index with cosine similarity

## RCA (Root Cause Analysis) Activities

Automated root cause analysis for alerts using LLM and code correlation:

### Activity Pipeline

```
Alert Fires → analyzeTraces → correlateCodeChanges → generateRCA → storeRCA
```

### RCA Activities

| Activity | Input | Output | Purpose |
|----------|-------|--------|---------|
| `analyzeTraces` | `TraceAnalysisInput` | `TraceAnalysisOutput` | Extract error patterns, anomalies from traces |
| `correlateCodeChanges` | `CodeCorrelationInput` | `CodeCorrelationOutput` | Correlate alerts with recent commits/PRs |
| `generateRCA` | `RCAGenerationInput` | `RCAReport` | Generate LLM-based root cause analysis |
| `storeRCA` | `StoreRCAInput` | `StoreRCAOutput` | Persist RCA to database via tRPC |

**Key files:**
- Activities: `apps/worker/src/temporal/activities/rca/`
- Schemas: `packages/api/src/schemas/rca.ts`
- Prompts: `apps/worker/src/prompts/rca/`
- Internal Procedure: `packages/api/src/routers/internal.ts` (storeRCA)

**LLM Metadata Tracked:**
- Model and provider used
- Tokens consumed
- Estimated cost
- Latency in milliseconds
- Whether template fallback was used

## Debugging

### Temporal UI

- **URL**: http://localhost:8088
- **Purpose**: Monitor workflows, view execution history, debug failures
- **Namespace**: `default`

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Workflow not starting | Not in registry | Add to `WORKFLOW_REGISTRY` |
| Activity timeout | Long operation | Increase `startToCloseTimeout` |
| Mutation failed | Direct DB write | Use `getInternalCaller()` |
| Bundle error | Import issue | Check workflow imports are deterministic |
