# Engineering Specification: RCA Storage and Schema

**Issue:** [#139](https://github.com/ducnguyen67201/CognObserve/issues/139) - [RCA Sprint 3] RCA storage and schema
**Sprint:** 3 - RCA Engine
**Story Points:** 2
**Priority:** P0
**Parent Epic:** #127 (Automated RCA System)

---

## 1. Overview

### 1.1 Objective

Implement a tRPC internal procedure (`internal.storeRCA`) to persist Root Cause Analysis (RCA) results, establish linkages to AlertHistory records, and store comprehensive LLM metadata for cost tracking and analysis.

### 1.2 Scope

| In Scope | Out of Scope |
|----------|--------------|
| `internal.storeRCA` procedure | RCA workflow orchestration |
| AlertHistory-to-RCA linkage | RCA generation logic |
| LLM metadata persistence | UI components for RCA display |
| Schema validation with Zod | RCA retrieval endpoints |
| Commit/PR relation storage | Notification integration |

### 1.3 Success Criteria

- [x] RCA results persist to `AlertRCA` table with all fields
- [x] AlertHistory records link to corresponding RCA
- [x] LLM metadata (model, tokens, cost, latency) stored
- [x] Suspected commits/PRs stored as arrays
- [x] Full RCA analysis JSON preserved
- [x] Activity can call procedure successfully

### 1.4 Implementation Status: ✅ COMPLETE

**Implemented:** 2025-01-15

| Component | File | Status |
|-----------|------|--------|
| Input Schema | `packages/api/src/schemas/rca.ts:478-505` | ✅ Done |
| Internal Procedure | `packages/api/src/routers/internal.ts:830-893` | ✅ Done |
| Store Activity | `apps/worker/src/temporal/activities/rca/store-rca.activity.ts` | ✅ Done |
| Activity Export | `apps/worker/src/temporal/activities/rca/index.ts` | ✅ Done |
| Documentation | `docs/WORKFLOWS.md` | ✅ Done |

---

## 2. Architecture

### 2.1 System Context

```
┌──────────────────────────────────────────────────────────────────┐
│                    RCA STORAGE DATA FLOW                         │
└──────────────────────────────────────────────────────────────────┘

  Alert Fires → AlertHistory Created
        │
        ▼
  ┌─────────────────────────────────────────────────────────────┐
  │                   RCA Workflow (Temporal)                    │
  │                                                              │
  │  ┌─────────────┐    ┌──────────────┐    ┌─────────────┐     │
  │  │ analyze     │───▶│ correlate    │───▶│ generate    │     │
  │  │ Traces      │    │ CodeChanges  │    │ RCA         │     │
  │  └─────────────┘    └──────────────┘    └──────┬──────┘     │
  │                                                 │            │
  └─────────────────────────────────────────────────┼────────────┘
                                                    │
                                                    ▼
  ┌─────────────────────────────────────────────────────────────┐
  │              internal.storeRCA (NEW - This Ticket)           │
  │                                                              │
  │  Input: alertHistoryId, rcaReport, commitShas, prNumbers    │
  │                                                              │
  │  Operations:                                                 │
  │  1. Validate AlertHistory exists                             │
  │  2. Create AlertRCA record with full analysis JSON           │
  │  3. Link AlertRCA to AlertHistory via alertId                │
  │  4. Store suspected commits/PRs arrays                       │
  │  5. Store LLM metadata in analysisJson                       │
  └─────────────────────────────────────────────────────────────┘
                                                    │
                                                    ▼
  ┌─────────────────────────────────────────────────────────────┐
  │                      PostgreSQL                              │
  │                                                              │
  │  AlertHistory ────────┬──────────── AlertRCA                 │
  │  (1)                  │             (0..*)                   │
  │                       │                                      │
  │                       ▼                                      │
  │                   Alert ────────── GitHubRepository          │
  │                       │                   │                  │
  │                       ▼                   ▼                  │
  │                   Project         GitCommit / GitPullRequest │
  └─────────────────────────────────────────────────────────────┘
```

### 2.2 Entity Relationship

```
┌─────────────────┐       ┌─────────────────┐
│  AlertHistory   │       │    AlertRCA     │
├─────────────────┤       ├─────────────────┤
│ id (PK)         │       │ id (PK)         │
│ alertId (FK)    │◄──────│ alertId (FK)    │
│ triggeredAt     │       │ triggeredAt     │
│ value           │       │ analysisJson    │ ◄── Full RCAReport
│ threshold       │       │ suspectedPRs[]  │
│ state           │       │ suspectedCommits│
│ notifiedVia[]   │       │ confidence      │
└─────────────────┘       └─────────────────┘
         │                         │
         └────────┬────────────────┘
                  ▼
         ┌─────────────────┐
         │      Alert      │
         ├─────────────────┤
         │ id (PK)         │
         │ projectId (FK)  │
         │ name            │
         │ type            │
         │ severity        │
         └─────────────────┘
```

---

## 3. Database Schema

### 3.1 Existing Schema (No Changes Required)

The `AlertRCA` model already exists in `packages/db/prisma/schema.prisma`:

```prisma
model AlertRCA {
  id               String   @id @default(cuid())
  alertId          String
  triggeredAt      DateTime
  analysisJson     Json                    // Stores complete RCAReport
  suspectedPRs     String[]               // PR numbers as strings
  suspectedCommits String[]               // Commit SHAs
  confidence       Float?                 // 0-1 confidence score
  createdAt        DateTime @default(now())

  alert Alert @relation(fields: [alertId], references: [id], onDelete: Cascade)

  @@index([alertId])
  @@index([triggeredAt(sort: Desc)])
  @@map("alert_rcas")
}
```

### 3.2 AnalysisJson Structure

The `analysisJson` field stores the complete `RCAReport` type:

```typescript
interface AnalysisJson {
  // Core RCA Output (from LLMRCAOutput)
  hypothesis: string;           // One-sentence root cause
  confidence: number;           // 0-1 confidence score
  reasoning: string;            // 2-4 sentence explanation
  rootCause: {
    category: RootCauseCategory; // CODE_CHANGE | INFRASTRUCTURE | etc.
    summary: string;
    evidence: string[];
  };
  relatedChanges: Array<{
    changeId: string;           // Commit SHA or PR number
    type: "commit" | "pr";
    relevance: "high" | "medium" | "low";
    explanation: string;
  }>;
  affectedComponents: string[];
  remediation: {
    immediate: string[];        // Mitigation steps
    longTerm: string[];         // Prevention steps
  };

  // LLM Metadata (for cost tracking)
  llmMetadata: {
    model: string;              // e.g., "claude-3-5-sonnet-20241022"
    provider: string;           // e.g., "anthropic"
    tokensUsed: number;         // Total tokens consumed
    estimatedCost: number;      // Cost in USD
    latencyMs: number;          // LLM call duration
    usedTemplate: boolean;      // Whether template fallback was used
  };

  // Context Metadata (for traceability)
  alertContext?: {
    alertId: string;
    alertHistoryId: string;
    alertName: string;
    alertType: string;
    severity: string;
    windowMins: number;
  };

  // Trace Analysis Summary (optional, for debugging)
  traceAnalysisSummary?: {
    totalTraces: number;
    totalSpans: number;
    errorRate: number;
    errorPatternCount: number;
    anomalyCount: number;
  };
}
```

---

## 4. API Design

### 4.1 Input Schema

**File:** `packages/api/src/schemas/rca.ts`

Add the following schema for the store procedure:

```typescript
/**
 * Input for internal.storeRCA procedure
 */
export const StoreRCAInputSchema = z.object({
  /** AlertHistory ID that triggered this RCA */
  alertHistoryId: z.string(),

  /** Complete RCA report from generateRCA activity */
  rcaReport: RCAReportSchema,

  /** Suspected commit SHAs (extracted for indexing) */
  suspectedCommitShas: z.array(z.string()).default([]),

  /** Suspected PR numbers as strings (extracted for indexing) */
  suspectedPRNumbers: z.array(z.string()).default([]),

  /** Alert context for traceability */
  alertContext: AlertContextSchema.optional(),

  /** Trace analysis summary for debugging */
  traceAnalysisSummary: z.object({
    totalTraces: z.number(),
    totalSpans: z.number(),
    errorRate: z.number(),
    errorPatternCount: z.number(),
    anomalyCount: z.number(),
  }).optional(),
});

export type StoreRCAInput = z.infer<typeof StoreRCAInputSchema>;
```

### 4.2 Internal Procedure

**File:** `packages/api/src/routers/internal.ts`

```typescript
/**
 * Store RCA analysis result
 * Called by: rca.workflow.ts → storeRCAActivity
 *
 * Links RCA to AlertHistory via shared alertId.
 * Stores complete analysis JSON with LLM metadata.
 */
storeRCA: internalProcedure
  .input(StoreRCAInputSchema)
  .mutation(async ({ input }) => {
    const {
      alertHistoryId,
      rcaReport,
      suspectedCommitShas,
      suspectedPRNumbers,
      alertContext,
      traceAnalysisSummary,
    } = input;

    // 1. Verify AlertHistory exists and get alertId
    const alertHistory = await prisma.alertHistory.findUnique({
      where: { id: alertHistoryId },
      select: {
        id: true,
        alertId: true,
        triggeredAt: true,
        alert: {
          select: { projectId: true },
        },
      },
    });

    if (!alertHistory) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `AlertHistory ${alertHistoryId} not found`,
      });
    }

    // 2. Build complete analysisJson
    const analysisJson = {
      ...rcaReport,
      alertContext,
      traceAnalysisSummary,
    };

    // 3. Create AlertRCA record
    const alertRCA = await prisma.alertRCA.create({
      data: {
        alertId: alertHistory.alertId,
        triggeredAt: alertHistory.triggeredAt,
        analysisJson,
        suspectedPRs: suspectedPRNumbers,
        suspectedCommits: suspectedCommitShas,
        confidence: rcaReport.confidence,
      },
    });

    console.log(
      `[Internal:storeRCA] Created AlertRCA ${alertRCA.id} for AlertHistory ${alertHistoryId}`
    );
    console.log(
      `[Internal:storeRCA] LLM: ${rcaReport.llmMetadata.model}, ` +
      `tokens: ${rcaReport.llmMetadata.tokensUsed}, ` +
      `cost: $${rcaReport.llmMetadata.estimatedCost.toFixed(4)}, ` +
      `latency: ${rcaReport.llmMetadata.latencyMs}ms`
    );

    return {
      rcaId: alertRCA.id,
      alertId: alertHistory.alertId,
      confidence: alertRCA.confidence,
    };
  }),
```

### 4.3 Return Type

```typescript
interface StoreRCAOutput {
  /** Created AlertRCA record ID */
  rcaId: string;
  /** Parent Alert ID */
  alertId: string;
  /** Extracted confidence score */
  confidence: number | null;
}
```

---

## 5. Activity Integration

### 5.1 Store RCA Activity

**File:** `apps/worker/src/temporal/activities/rca/store-rca.activity.ts`

```typescript
import { getInternalCaller } from "@/lib/trpc-caller";
import type { RCAReport, AlertContext } from "@cognobserve/api/schemas";

export interface StoreRCAInput {
  alertHistoryId: string;
  rcaReport: RCAReport;
  alertContext?: AlertContext;
  traceAnalysisSummary?: {
    totalTraces: number;
    totalSpans: number;
    errorRate: number;
    errorPatternCount: number;
    anomalyCount: number;
  };
}

export interface StoreRCAOutput {
  rcaId: string;
  alertId: string;
  confidence: number | null;
}

/**
 * Persist RCA result via internal tRPC procedure
 */
export async function storeRCA(input: StoreRCAInput): Promise<StoreRCAOutput> {
  const caller = getInternalCaller();

  // Extract suspected commits/PRs from relatedChanges
  const suspectedCommitShas = input.rcaReport.relatedChanges
    .filter((c) => c.type === "commit")
    .map((c) => c.changeId);

  const suspectedPRNumbers = input.rcaReport.relatedChanges
    .filter((c) => c.type === "pr")
    .map((c) => c.changeId);

  return await caller.internal.storeRCA({
    alertHistoryId: input.alertHistoryId,
    rcaReport: input.rcaReport,
    suspectedCommitShas,
    suspectedPRNumbers,
    alertContext: input.alertContext,
    traceAnalysisSummary: input.traceAnalysisSummary,
  });
}
```

### 5.2 Activity Export

**File:** `apps/worker/src/temporal/activities/rca/index.ts`

```typescript
export { analyzeTraces } from "./analyze-traces";
export { correlateCodeChanges } from "./correlate-changes";
export { generateRCA } from "./generate-rca";
export { storeRCA } from "./store-rca.activity"; // NEW
```

---

## 6. Workflow Integration

### 6.1 RCA Workflow (Future - Out of Scope)

The RCA workflow will orchestrate activities in sequence. This is documented for context but implemented in a separate ticket.

```typescript
// apps/worker/src/workflows/rca.workflow.ts (FUTURE)
import { proxyActivities } from "@temporalio/workflow";
import type * as activities from "../temporal/activities/rca";

const { analyzeTraces, correlateCodeChanges, generateRCA, storeRCA } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: "5 minutes",
    retry: { maximumAttempts: 3 },
  });

export async function rcaWorkflow(input: RCAWorkflowInput): Promise<RCAWorkflowOutput> {
  // 1. Analyze traces
  const traceAnalysis = await analyzeTraces({
    projectId: input.projectId,
    alertType: input.alertType,
    // ...
  });

  // 2. Correlate code changes
  const codeCorrelation = await correlateCodeChanges({
    projectId: input.projectId,
    traceAnalysis,
    alertTriggeredAt: input.triggeredAt,
  });

  // 3. Generate RCA
  const rcaReport = await generateRCA({
    alertContext: input.alertContext,
    traceAnalysis,
    codeCorrelation,
  });

  // 4. Store RCA (THIS TICKET)
  const result = await storeRCA({
    alertHistoryId: input.alertHistoryId,
    rcaReport,
    alertContext: input.alertContext,
    traceAnalysisSummary: {
      totalTraces: traceAnalysis.summary.totalTraces,
      totalSpans: traceAnalysis.summary.totalSpans,
      errorRate: traceAnalysis.summary.errorRate,
      errorPatternCount: traceAnalysis.errorPatterns.length,
      anomalyCount: traceAnalysis.anomalies.length,
    },
  });

  return { rcaId: result.rcaId, confidence: result.confidence };
}
```

---

## 7. Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                      COMPLETE RCA DATA FLOW                         │
└─────────────────────────────────────────────────────────────────────┘

┌──────────────────┐
│  Alert Fires     │
│  (state=FIRING)  │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐     ┌──────────────────────────────────────────┐
│  AlertHistory    │     │              Input to Workflow            │
│  Created         │────▶│  - alertHistoryId                        │
│  (id: "ah_123")  │     │  - alertId, alertType, severity          │
└──────────────────┘     │  - threshold, currentValue               │
                         │  - triggeredAt, windowMins               │
                         └────────────────────┬─────────────────────┘
                                              │
                                              ▼
                         ┌──────────────────────────────────────────┐
                         │           analyzeTraces Activity          │
                         │  - Query spans in window                  │
                         │  - Calculate error rate, latency          │
                         │  - Extract error patterns                 │
                         │  - Detect anomalies                       │
                         └────────────────────┬─────────────────────┘
                                              │ TraceAnalysisOutput
                                              ▼
                         ┌──────────────────────────────────────────┐
                         │       correlateCodeChanges Activity       │
                         │  - Find GitHub repository                 │
                         │  - Vector search code chunks              │
                         │  - Score commits by temporal/semantic     │
                         │  - Score PRs by correlation signals       │
                         └────────────────────┬─────────────────────┘
                                              │ CodeCorrelationOutput
                                              ▼
                         ┌──────────────────────────────────────────┐
                         │           generateRCA Activity            │
                         │  - Build LLM prompt with context          │
                         │  - Call LLM Center (Anthropic/OpenAI)     │
                         │  - Parse structured output                │
                         │  - Track tokens, cost, latency            │
                         └────────────────────┬─────────────────────┘
                                              │ RCAReport
                                              ▼
┌────────────────────────────────────────────────────────────────────┐
│                    storeRCA Activity (THIS TICKET)                  │
│                                                                     │
│  Input:                                                             │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ alertHistoryId: "ah_123"                                     │   │
│  │ rcaReport: {                                                 │   │
│  │   hypothesis: "Recent code change introduced null check..."  │   │
│  │   confidence: 0.85                                          │   │
│  │   reasoning: "Error patterns match commit abc123..."        │   │
│  │   rootCause: { category: "CODE_CHANGE", summary: "...", ... }│   │
│  │   relatedChanges: [{ changeId: "abc123", type: "commit" }]  │   │
│  │   llmMetadata: {                                            │   │
│  │     model: "claude-3-5-sonnet-20241022"                     │   │
│  │     provider: "anthropic"                                   │   │
│  │     tokensUsed: 1234                                        │   │
│  │     estimatedCost: 0.0185                                   │   │
│  │     latencyMs: 2500                                         │   │
│  │     usedTemplate: false                                     │   │
│  │   }                                                         │   │
│  │ }                                                            │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  Process:                                                           │
│  1. getInternalCaller() → tRPC caller with INTERNAL_API_SECRET     │
│  2. Extract suspectedCommitShas from relatedChanges                │
│  3. Extract suspectedPRNumbers from relatedChanges                 │
│  4. Call internal.storeRCA procedure                               │
│                                                                     │
└────────────────────────────────────────────────────────────────────┘
                                              │
                                              ▼
┌────────────────────────────────────────────────────────────────────┐
│               internal.storeRCA tRPC Procedure                      │
│                                                                     │
│  1. Validate AlertHistory exists                                    │
│     SELECT id, alertId, triggeredAt FROM alert_history              │
│     WHERE id = 'ah_123'                                             │
│                                                                     │
│  2. Build analysisJson (full RCAReport + context)                   │
│                                                                     │
│  3. Create AlertRCA record                                          │
│     INSERT INTO alert_rcas (                                        │
│       id, alertId, triggeredAt, analysisJson,                       │
│       suspectedPRs, suspectedCommits, confidence                    │
│     ) VALUES (...)                                                  │
│                                                                     │
└────────────────────────────────────────────────────────────────────┘
                                              │
                                              ▼
┌────────────────────────────────────────────────────────────────────┐
│                      PostgreSQL - alert_rcas                        │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ id: "rca_xyz789"                                              │  │
│  │ alertId: "alert_456" (FK to alerts)                           │  │
│  │ triggeredAt: "2025-01-15T10:30:00Z"                           │  │
│  │ confidence: 0.85                                              │  │
│  │ suspectedCommits: ["abc123", "def456"]                        │  │
│  │ suspectedPRs: ["42", "43"]                                    │  │
│  │ analysisJson: {                                               │  │
│  │   hypothesis: "...",                                          │  │
│  │   confidence: 0.85,                                           │  │
│  │   reasoning: "...",                                           │  │
│  │   rootCause: {...},                                           │  │
│  │   relatedChanges: [...],                                      │  │
│  │   affectedComponents: [...],                                  │  │
│  │   remediation: {...},                                         │  │
│  │   llmMetadata: {                                              │  │
│  │     model: "claude-3-5-sonnet-20241022",                      │  │
│  │     provider: "anthropic",                                    │  │
│  │     tokensUsed: 1234,                                         │  │
│  │     estimatedCost: 0.0185,                                    │  │
│  │     latencyMs: 2500,                                          │  │
│  │     usedTemplate: false                                       │  │
│  │   },                                                          │  │
│  │   alertContext: {...},                                        │  │
│  │   traceAnalysisSummary: {...}                                 │  │
│  │ }                                                             │  │
│  │ createdAt: "2025-01-15T10:30:05Z"                             │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  Indexes:                                                           │
│  - (alertId) for lookup by alert                                   │
│  - (triggeredAt DESC) for latest-first queries                     │
└────────────────────────────────────────────────────────────────────┘
```

---

## 8. Implementation Checklist

### 8.1 Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/api/src/schemas/rca.ts` | **Modify** | Add `StoreRCAInputSchema` |
| `packages/api/src/routers/internal.ts` | **Modify** | Add `storeRCA` procedure |
| `apps/worker/src/temporal/activities/rca/store-rca.activity.ts` | **Create** | New store activity |
| `apps/worker/src/temporal/activities/rca/index.ts` | **Modify** | Export new activity |
| `docs/WORKFLOWS.md` | **Modify** | Document storeRCA activity |

### 8.2 Implementation Steps

1. **Add Input Schema** (packages/api/src/schemas/rca.ts)
   - Define `StoreRCAInputSchema` with alertHistoryId, rcaReport, etc.
   - Export type `StoreRCAInput`

2. **Add Internal Procedure** (packages/api/src/routers/internal.ts)
   - Import `StoreRCAInputSchema` from schemas
   - Add `storeRCA` procedure with validation
   - Verify AlertHistory exists before creating RCA
   - Create AlertRCA record with full analysisJson

3. **Create Store Activity** (apps/worker/src/temporal/activities/rca/)
   - Create `store-rca.activity.ts`
   - Extract commit SHAs and PR numbers from relatedChanges
   - Call `internal.storeRCA` via tRPC caller

4. **Update Activity Exports**
   - Add export in `apps/worker/src/temporal/activities/rca/index.ts`

5. **Update Documentation**
   - Add storeRCA to activity table in `docs/WORKFLOWS.md`

### 8.3 Testing Plan

| Test | Type | Description |
|------|------|-------------|
| Schema validation | Unit | Verify `StoreRCAInputSchema` validates correctly |
| Procedure - success | Integration | Create RCA with valid AlertHistory |
| Procedure - not found | Integration | Verify error when AlertHistory missing |
| Activity - full flow | Integration | Call activity with mock RCAReport |
| LLM metadata stored | Integration | Verify tokensUsed, cost, latency persisted |
| Commits/PRs extracted | Unit | Verify extraction from relatedChanges |

---

## 9. Error Handling

### 9.1 Error Cases

| Error | Code | Handling |
|-------|------|----------|
| AlertHistory not found | `NOT_FOUND` | Throw TRPCError, workflow fails |
| Invalid RCAReport schema | `BAD_REQUEST` | Zod validation rejects input |
| Database constraint violation | `INTERNAL_SERVER_ERROR` | Log error, retry via Temporal |

### 9.2 Retry Strategy

The activity uses Temporal's built-in retry mechanism:

```typescript
const { storeRCA } = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 seconds",
  retry: {
    maximumAttempts: 3,
    initialInterval: "1 second",
    backoffCoefficient: 2,
    nonRetryableErrorTypes: ["NOT_FOUND"],
  },
});
```

---

## 10. Observability

### 10.1 Logging

```typescript
// Success log
console.log(
  `[Internal:storeRCA] Created AlertRCA ${rcaId} for AlertHistory ${alertHistoryId}`
);

// LLM usage log
console.log(
  `[Internal:storeRCA] LLM: ${model}, tokens: ${tokens}, cost: $${cost}, latency: ${latency}ms`
);
```

### 10.2 Metrics (Future)

| Metric | Type | Labels |
|--------|------|--------|
| `rca_stored_total` | Counter | `alert_type`, `confidence_bucket` |
| `rca_llm_tokens_total` | Counter | `provider`, `model` |
| `rca_llm_cost_total` | Counter | `provider`, `model` |
| `rca_llm_latency_seconds` | Histogram | `provider`, `model` |

---

## 11. Security Considerations

### 11.1 Authentication

- Procedure uses `internalProcedure` middleware
- Requires `INTERNAL_API_SECRET` for access
- Only callable from Temporal worker

### 11.2 Data Sensitivity

| Field | Sensitivity | Handling |
|-------|-------------|----------|
| Error messages | Medium | Stored in analysisJson, accessible via UI |
| Stack traces | High | Truncated to 500 chars in error patterns |
| Commit SHAs | Low | Public information |
| LLM responses | Medium | May contain code snippets |

---

## 12. Dependencies

### 12.1 Internal Dependencies

| Package | Used For |
|---------|----------|
| `@cognobserve/db` | Prisma client, AlertRCA type |
| `@cognobserve/api/schemas` | RCAReportSchema, AlertContextSchema |

### 12.2 External Dependencies

None - uses existing infrastructure.

---

## 13. Appendix

### A. Complete Schema Export

```typescript
// packages/api/src/schemas/rca.ts (additions)

export const StoreRCAInputSchema = z.object({
  alertHistoryId: z.string(),
  rcaReport: RCAReportSchema,
  suspectedCommitShas: z.array(z.string()).default([]),
  suspectedPRNumbers: z.array(z.string()).default([]),
  alertContext: AlertContextSchema.optional(),
  traceAnalysisSummary: z.object({
    totalTraces: z.number(),
    totalSpans: z.number(),
    errorRate: z.number(),
    errorPatternCount: z.number(),
    anomalyCount: z.number(),
  }).optional(),
});

export type StoreRCAInput = z.infer<typeof StoreRCAInputSchema>;
```

### B. Sample Payload

```json
{
  "alertHistoryId": "ah_cm1234567890",
  "rcaReport": {
    "hypothesis": "A recent code change in the authentication module introduced a null reference error when processing expired tokens.",
    "confidence": 0.85,
    "reasoning": "Error patterns show 95% of failures originate from auth/token.ts. Commit abc123 modified token validation logic 2 hours before the incident. The stack traces consistently point to line 142 where null check was removed.",
    "rootCause": {
      "category": "CODE_CHANGE",
      "summary": "Null check removed in token validation",
      "evidence": [
        "Commit abc123 removed null check on line 142",
        "Error rate spiked from 0.1% to 15% within 30 minutes",
        "All errors contain 'Cannot read property of null'"
      ]
    },
    "relatedChanges": [
      {
        "changeId": "abc123",
        "type": "commit",
        "relevance": "high",
        "explanation": "Removed null check in token validation"
      },
      {
        "changeId": "42",
        "type": "pr",
        "relevance": "medium",
        "explanation": "PR containing the problematic commit"
      }
    ],
    "affectedComponents": ["auth-service", "api-gateway"],
    "remediation": {
      "immediate": [
        "Revert commit abc123",
        "Add null check guard clause"
      ],
      "longTerm": [
        "Add unit tests for null token scenarios",
        "Enable stricter TypeScript null checks"
      ]
    },
    "llmMetadata": {
      "model": "claude-3-5-sonnet-20241022",
      "provider": "anthropic",
      "tokensUsed": 1234,
      "estimatedCost": 0.0185,
      "latencyMs": 2500,
      "usedTemplate": false
    }
  },
  "alertContext": {
    "alertId": "alert_456",
    "alertHistoryId": "ah_cm1234567890",
    "alertName": "High Error Rate - Auth Service",
    "projectId": "proj_789",
    "projectName": "CognObserve",
    "alertType": "ERROR_RATE",
    "severity": "HIGH",
    "currentValue": 0.15,
    "threshold": 0.05,
    "triggeredAt": "2025-01-15T10:30:00Z",
    "windowMins": 15
  },
  "traceAnalysisSummary": {
    "totalTraces": 1500,
    "totalSpans": 4500,
    "errorRate": 0.15,
    "errorPatternCount": 3,
    "anomalyCount": 2
  }
}
```

---

**Document Version:** 1.0
**Last Updated:** 2025-01-15
**Author:** Claude Code (Senior Architect)
