# Sprint 3: RCA Engine - Root Cause Analysis Generation

**Sprint ID:** #127 Sprint 3
**Story Points:** 26
**Priority:** P0
**Dependencies:** Sprint 2 (Vector Search) - Completed

---

## Sprint Goal

> RCA generation working end-to-end: When an alert fires, the system automatically analyzes traces, correlates with code changes, generates an actionable RCA report, and stores it with confidence scoring.

---

## Executive Summary

This specification details the implementation of the Root Cause Analysis (RCA) Engine for Ducsigr Sprint 3. When an alert fires, the system will automatically:

1. **Analyze traces** to extract error patterns and anomalies
2. **Correlate with recent code changes** (commits/PRs) using vector similarity
3. **Generate an AI-powered RCA report** with hypothesis and remediation steps
4. **Store the analysis** linked to the alert history

**Success Metrics:**
- RCA generation time < 30 seconds (P95)
- LLM cost per RCA < $0.05 (average)
- Confidence scoring accuracy validated manually

---

## Definition of Done

- [ ] Alert triggers RCA workflow automatically when FIRING
- [ ] Trace analysis extracts error patterns and anomalies
- [ ] Code correlation finds relevant recent changes with scoring
- [ ] LLM generates structured RCA with hypothesis and confidence
- [ ] RCA stored in AlertRCA table with all metadata
- [ ] LLM cost per RCA < $0.05 (average)
- [ ] Documentation updated (WORKFLOWS.md)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         RCA WORKFLOW ARCHITECTURE                            │
└─────────────────────────────────────────────────────────────────────────────┘

  Alert Fires (FIRING state)
         │
         ▼
  alertEvaluationWorkflow
         │
         │ shouldNotify=true
         ▼
  ┌──────────────────────────────────────────────────────────────────────────┐
  │                         rcaWorkflow (Child Workflow)                      │
  │                                                                           │
  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐           │
  │  │ 1. analyzeTraces│─▶│ 2. correlate   │─▶│ 3. generateRCA  │           │
  │  │    Activity     │  │ CodeChanges    │  │    Activity     │           │
  │  │                 │  │    Activity    │  │                 │           │
  │  │ • Error patterns│  │ • Find commits │  │ • Claude Haiku/ │           │
  │  │ • Latency stats │  │ • Vector search│  │   Sonnet        │           │
  │  │ • Anomalies     │  │ • Score 0-1    │  │ • Structured    │           │
  │  └─────────────────┘  └─────────────────┘  │   JSON output  │           │
  │                                            └─────────────────┘           │
  │                                                     │                    │
  │                                                     ▼                    │
  │                                    ┌─────────────────────────┐           │
  │                                    │ 4. storeRCA Activity    │           │
  │                                    │    (via tRPC internal)  │           │
  │                                    └─────────────────────────┘           │
  └──────────────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
1. Alert Fires → alertEvaluationWorkflow detects FIRING state
2. Child workflow (rcaWorkflow) triggered with alert context
3. RCA Workflow:
   a. analyzeTraces: Query spans in alert window, extract patterns
   b. correlateCodeChanges: Find commits/PRs, score by similarity
   c. generateRCA: LLM synthesis or template for LOW severity
   d. storeRCA: Persist via tRPC internal procedure
4. RCA available for notifications and dashboard
```

---

## Stories Breakdown

| Story | Ticket ID | Points | Description |
|-------|-----------|--------|-------------|
| Trace Analysis Activity | #136 | 8 | Extract error patterns, latency stats, anomalies from spans |
| Code Correlation Activity | #137 | 8 | Find and score commits/PRs by temporal + semantic similarity |
| LLM RCA Generation | #138 | 8 | Generate structured RCA using Claude with severity-based model selection |
| RCA Storage | #139 | 2 | tRPC internal procedure + schema updates |

---

## Implementation Phases

### Phase 1: Types & Schemas (Day 1)

#### 1.1 Add RCA Types to Temporal Types

**File:** `apps/worker/src/temporal/types.ts`

```typescript
// ============================================================
// RCA WORKFLOW TYPES
// ============================================================

/** Input for RCA Workflow (child workflow of alertEvaluationWorkflow) */
export interface RCAWorkflowInput {
  alertId: string;
  alertHistoryId: string;
  projectId: string;
  alertName: string;
  alertType: "ERROR_RATE" | "LATENCY_P50" | "LATENCY_P95" | "LATENCY_P99";
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  triggeredAt: string;  // ISO string
  currentValue: number;
  threshold: number;
  windowMins: number;
}

/** Output from trace analysis activity */
export interface TraceAnalysisOutput {
  /** Error statistics */
  errorCount: number;
  totalSpanCount: number;
  errorRate: number;

  /** Grouped error patterns */
  errorGroups: Array<{
    errorMessage: string;
    count: number;
    sampleSpanIds: string[];
    endpoints: string[];
    models: string[];
  }>;

  /** Latency statistics in milliseconds */
  latencyStats: {
    p50: number;
    p95: number;
    p99: number;
    mean: number;
  };

  /** Detected anomalies */
  anomalies: Array<{
    type: "latency_spike" | "error_burst" | "throughput_drop";
    description: string;
    severity: "high" | "medium" | "low";
  }>;

  /** Sample traces for debugging */
  sampleTraces: Array<{
    traceId: string;
    name: string;
    errorMessage?: string;
    latencyMs: number;
  }>;
}

/** Output from code correlation activity */
export interface CodeCorrelationOutput {
  /** Commits ranked by correlation score */
  suspectedCommits: Array<{
    sha: string;
    message: string;
    author: string;
    timestamp: string;
    score: number;  // 0-1
    signals: {
      temporal: number;   // Recency score
      semantic: number;   // Vector similarity score
      pathMatch: number;  // Stack trace path match score
    };
  }>;

  /** PRs ranked by correlation score */
  suspectedPRs: Array<{
    number: number;
    title: string;
    author: string;
    mergedAt: string;
    score: number;
  }>;

  /** Relevant code chunks from vector search */
  relevantCodeChunks: Array<{
    filePath: string;
    content: string;
    similarity: number;
  }>;
}

/** Output from RCA generation activity */
export interface RCAGenerationOutput {
  hypothesis: string;
  confidence: number;  // 0-1
  rootCauses: Array<{
    description: string;
    likelihood: "high" | "medium" | "low";
    evidence: string[];
  }>;
  affectedComponents: string[];
  remediation: Array<{
    action: string;
    priority: "immediate" | "short_term" | "long_term";
    effort: "low" | "medium" | "high";
  }>;
  model: string;
  tokensUsed: number;
  estimatedCost: number;
}

/** Final RCA workflow result */
export interface RCAWorkflowResult {
  rcaId: string;
  success: boolean;
  analysisGenerated: boolean;
  error?: string;
}
```

#### 1.2 Create RCA Zod Schemas

**File:** `packages/api/src/schemas/rca.ts` (NEW)

```typescript
import { z } from "zod";

// ============================================================
// ENUMS
// ============================================================

export const RCAStatusSchema = z.enum([
  "PENDING",
  "COLLECTING",
  "ANALYZING",
  "COMPLETED",
  "FAILED",
]);
export type RCAStatus = z.infer<typeof RCAStatusSchema>;

export const RootCauseCategorySchema = z.enum([
  "CODE_CHANGE",
  "INFRASTRUCTURE",
  "EXTERNAL_DEPENDENCY",
  "DATA_ISSUE",
  "UNKNOWN",
]);
export type RootCauseCategory = z.infer<typeof RootCauseCategorySchema>;

// ============================================================
// TRACE ANALYSIS SCHEMAS
// ============================================================

export const TraceAnalysisOutputSchema = z.object({
  errorCount: z.number().int().min(0),
  totalSpanCount: z.number().int().min(0),
  errorRate: z.number().min(0).max(1),
  errorGroups: z.array(z.object({
    errorMessage: z.string(),
    count: z.number().int().positive(),
    sampleSpanIds: z.array(z.string()),
    endpoints: z.array(z.string()),
    models: z.array(z.string()),
  })),
  latencyStats: z.object({
    p50: z.number().min(0),
    p95: z.number().min(0),
    p99: z.number().min(0),
    mean: z.number().min(0),
  }),
  anomalies: z.array(z.object({
    type: z.enum(["latency_spike", "error_burst", "throughput_drop"]),
    description: z.string(),
    severity: z.enum(["high", "medium", "low"]),
  })),
  sampleTraces: z.array(z.object({
    traceId: z.string(),
    name: z.string(),
    errorMessage: z.string().optional(),
    latencyMs: z.number().min(0),
  })),
});

// ============================================================
// RCA REPORT SCHEMAS
// ============================================================

export const RCAReportSchema = z.object({
  hypothesis: z.string().min(1),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  rootCause: z.object({
    category: RootCauseCategorySchema,
    summary: z.string(),
    evidence: z.array(z.string()),
  }),
  relatedChanges: z.array(z.object({
    changeId: z.string(),
    type: z.enum(["commit", "pr"]),
    relevance: z.enum(["high", "medium", "low"]),
    explanation: z.string(),
  })),
  affectedComponents: z.array(z.string()),
  remediation: z.object({
    immediate: z.array(z.string()),
    longTerm: z.array(z.string()),
  }),
  traceAnalysis: TraceAnalysisOutputSchema.optional(),
});
export type RCAReport = z.infer<typeof RCAReportSchema>;

// ============================================================
// TRPC INPUT SCHEMAS
// ============================================================

export const StoreRCAInputSchema = z.object({
  alertId: z.string(),
  alertHistoryId: z.string().optional(),
  triggeredAt: z.string().datetime(),
  report: RCAReportSchema,
  suspectedPRs: z.array(z.string()).default([]),
  suspectedCommits: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).optional(),
  traceCount: z.number().int().min(0).optional(),
  errorCount: z.number().int().min(0).optional(),
  llmTokensUsed: z.number().int().min(0).optional(),
  llmCost: z.number().min(0).optional(),
});
export type StoreRCAInput = z.infer<typeof StoreRCAInputSchema>;

// ============================================================
// LLM STRUCTURED OUTPUT SCHEMA
// ============================================================

/** Schema for LLM structured output (passed to llm.complete()) */
export const LLMRCAOutputSchema = z.object({
  hypothesis: z.string().describe("One sentence stating the most likely root cause"),
  confidence: z.number().min(0).max(1).describe("Confidence score from 0 to 1"),
  reasoning: z.string().describe("2-4 sentences explaining the reasoning"),
  rootCause: z.object({
    category: z.enum(["CODE_CHANGE", "INFRASTRUCTURE", "EXTERNAL_DEPENDENCY", "DATA_ISSUE", "UNKNOWN"]),
    summary: z.string(),
    evidence: z.array(z.string()),
  }),
  relatedChanges: z.array(z.object({
    changeId: z.string(),
    type: z.enum(["commit", "pr"]),
    relevance: z.enum(["high", "medium", "low"]),
    explanation: z.string(),
  })),
  affectedComponents: z.array(z.string()),
  remediation: z.object({
    immediate: z.array(z.string()).describe("Steps to mitigate now"),
    longTerm: z.array(z.string()).describe("Steps to prevent recurrence"),
  }),
});
```

---

### Phase 2: Database Schema Updates (Day 1)

**File:** `packages/db/prisma/schema.prisma`

The existing `AlertRCA` model needs enhancement:

```prisma
// ============================================================
// RCA STATUS AND CATEGORY ENUMS
// ============================================================

enum RCAStatus {
  PENDING
  COLLECTING
  ANALYZING
  COMPLETED
  FAILED
}

enum RootCauseCategory {
  CODE_CHANGE
  INFRASTRUCTURE
  EXTERNAL_DEPENDENCY
  DATA_ISSUE
  UNKNOWN
}

// ============================================================
// ALERT RCA MODEL (Enhanced)
// ============================================================

model AlertRCA {
  id               String            @id @default(cuid())
  alertId          String
  alertHistoryId   String?           // Link to specific trigger event
  triggeredAt      DateTime

  // Workflow status
  status           RCAStatus         @default(PENDING)
  startedAt        DateTime?
  completedAt      DateTime?

  // Analysis results
  analysisJson     Json              // Full RCA report as JSON
  hypothesis       String?           @db.Text  // Denormalized for queries
  rootCauseCategory RootCauseCategory?
  confidence       Float?

  // Related entities
  suspectedPRs     String[]
  suspectedCommits String[]

  // Metrics
  traceCount       Int?
  errorCount       Int?
  llmTokensUsed    Int?
  llmCost          Decimal?          @db.Decimal(10, 6)

  createdAt        DateTime          @default(now())
  updatedAt        DateTime          @updatedAt

  // Relations
  alert            Alert             @relation(fields: [alertId], references: [id], onDelete: Cascade)
  alertHistory     AlertHistory?     @relation(fields: [alertHistoryId], references: [id], onDelete: SetNull)

  @@index([alertId])
  @@index([alertHistoryId])
  @@index([triggeredAt(sort: Desc)])
  @@index([status])
  @@map("alert_rcas")
}
```

**Migration Commands:**
```bash
pnpm db:generate
pnpm db:push
```

---

### Phase 3: Activities Implementation (Day 2-3)

**File:** `apps/worker/src/temporal/activities/rca.activities.ts` (NEW)

#### 3.1 Trace Analysis Activity

```typescript
import { prisma } from "@ducsigr/db";
import { type RCAWorkflowInput, type TraceAnalysisOutput } from "../types";

/**
 * Analyzes traces and spans during the alert window to extract:
 * - Error patterns grouped by message
 * - Latency statistics (p50, p95, p99, mean)
 * - Anomalies (latency spikes, error bursts)
 * - Sample traces for debugging
 */
export async function analyzeTraces(input: RCAWorkflowInput): Promise<TraceAnalysisOutput> {
  const windowStart = new Date(
    new Date(input.triggeredAt).getTime() - input.windowMins * 60 * 1000
  );
  const windowEnd = new Date(input.triggeredAt);

  // Query spans in alert window
  const spans = await prisma.span.findMany({
    where: {
      trace: { projectId: input.projectId },
      startTime: { gte: windowStart, lte: windowEnd },
    },
    select: {
      id: true,
      name: true,
      level: true,
      statusMessage: true,
      model: true,
      startTime: true,
      endTime: true,
      trace: { select: { id: true, name: true } },
    },
    take: 1000,  // Limit for performance
  });

  // Calculate latencies
  const latencies = spans
    .filter((s) => s.endTime)
    .map((s) => new Date(s.endTime!).getTime() - new Date(s.startTime).getTime());

  latencies.sort((a, b) => a - b);

  const percentile = (arr: number[], p: number) => {
    if (arr.length === 0) return 0;
    const idx = Math.ceil((p / 100) * arr.length) - 1;
    return arr[Math.max(0, idx)] ?? 0;
  };

  const mean = latencies.length > 0
    ? latencies.reduce((a, b) => a + b, 0) / latencies.length
    : 0;

  // Group errors
  const errorSpans = spans.filter((s) => s.level === "ERROR");
  const errorMap = new Map<string, {
    count: number;
    sampleSpanIds: string[];
    endpoints: Set<string>;
    models: Set<string>;
  }>();

  for (const span of errorSpans) {
    const msg = normalizeErrorMessage(span.statusMessage ?? "Unknown error");
    const existing = errorMap.get(msg);
    if (existing) {
      existing.count++;
      if (existing.sampleSpanIds.length < 3) {
        existing.sampleSpanIds.push(span.id);
      }
      existing.endpoints.add(span.name);
      if (span.model) existing.models.add(span.model);
    } else {
      errorMap.set(msg, {
        count: 1,
        sampleSpanIds: [span.id],
        endpoints: new Set([span.name]),
        models: span.model ? new Set([span.model]) : new Set(),
      });
    }
  }

  const errorGroups = Array.from(errorMap.entries())
    .map(([errorMessage, data]) => ({
      errorMessage,
      count: data.count,
      sampleSpanIds: data.sampleSpanIds,
      endpoints: Array.from(data.endpoints),
      models: Array.from(data.models),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Detect anomalies
  const anomalies = detectAnomalies(spans, input.alertType, latencies, mean);

  // Sample traces
  const sampleTraces = spans
    .filter((s) => s.level === "ERROR" || latencies.length === 0)
    .slice(0, 5)
    .map((s) => ({
      traceId: s.trace.id,
      name: s.trace.name,
      errorMessage: s.statusMessage ?? undefined,
      latencyMs: s.endTime
        ? new Date(s.endTime).getTime() - new Date(s.startTime).getTime()
        : 0,
    }));

  return {
    errorCount: errorSpans.length,
    totalSpanCount: spans.length,
    errorRate: spans.length > 0 ? errorSpans.length / spans.length : 0,
    errorGroups,
    latencyStats: {
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      p99: percentile(latencies, 99),
      mean,
    },
    anomalies,
    sampleTraces,
  };
}

/** Normalize error messages for grouping (remove UUIDs, timestamps, line numbers) */
function normalizeErrorMessage(msg: string): string {
  return msg
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<UUID>")
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/g, "<TIMESTAMP>")
    .replace(/line \d+/gi, "line <N>")
    .replace(/:\d+:\d+/g, ":<LINE>:<COL>")
    .slice(0, 200);
}

/** Detect anomalies in trace data */
function detectAnomalies(
  spans: Array<{ startTime: Date; level: string }>,
  alertType: string,
  latencies: number[],
  mean: number
): TraceAnalysisOutput["anomalies"] {
  const anomalies: TraceAnalysisOutput["anomalies"] = [];

  // Group by 1-minute buckets for burst detection
  const buckets = new Map<string, { errors: number; latencies: number[] }>();
  for (const span of spans) {
    const bucket = new Date(span.startTime).toISOString().slice(0, 16); // YYYY-MM-DDTHH:MM
    const existing = buckets.get(bucket) ?? { errors: 0, latencies: [] };
    if (span.level === "ERROR") existing.errors++;
    buckets.set(bucket, existing);
  }

  // Detect error bursts (> 5 errors in 1 minute)
  for (const [bucket, data] of buckets) {
    if (data.errors > 5) {
      anomalies.push({
        type: "error_burst",
        description: `${data.errors} errors in 1 minute at ${bucket}`,
        severity: data.errors > 20 ? "high" : "medium",
      });
    }
  }

  // Detect latency spikes for latency alerts
  if (alertType.startsWith("LATENCY") && mean > 0) {
    const p99 = latencies[Math.floor(latencies.length * 0.99)] ?? 0;
    if (p99 > mean * 3) {
      anomalies.push({
        type: "latency_spike",
        description: `P99 latency (${p99.toFixed(0)}ms) is ${(p99 / mean).toFixed(1)}x the mean`,
        severity: p99 > mean * 5 ? "high" : "medium",
      });
    }
  }

  return anomalies.slice(0, 5);
}
```

#### 3.2 Code Correlation Activity

```typescript
import { prisma } from "@ducsigr/db";
import { getLLM } from "@/lib/llm-manager";
import { searchSimilarChunks } from "./search.activities";
import {
  type RCAWorkflowInput,
  type TraceAnalysisOutput,
  type CodeCorrelationOutput,
} from "../types";

/** Correlation signal weights */
const WEIGHTS = {
  temporal: 0.3,
  semantic: 0.4,
  pathMatch: 0.3,
} as const;

/**
 * Correlates alert with recent code changes using:
 * - Temporal proximity (exponential decay)
 * - Semantic similarity (vector search)
 * - Path matching (stack traces → changed files)
 */
export async function correlateCodeChanges(
  input: RCAWorkflowInput,
  traceAnalysis: TraceAnalysisOutput
): Promise<CodeCorrelationOutput> {
  const LOOKBACK_DAYS = 7;
  const cutoffDate = new Date(
    new Date(input.triggeredAt).getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000
  );

  // Get repository for project
  const repo = await prisma.gitHubRepository.findUnique({
    where: { projectId: input.projectId },
    include: {
      commits: {
        where: { timestamp: { gte: cutoffDate } },
        orderBy: { timestamp: "desc" },
        take: 100,
      },
      pullRequests: {
        where: { mergedAt: { gte: cutoffDate } },
        orderBy: { mergedAt: "desc" },
        take: 50,
      },
    },
  });

  if (!repo) {
    return { suspectedCommits: [], suspectedPRs: [], relevantCodeChunks: [] };
  }

  // Build search query from error patterns
  const searchQuery = buildSearchQuery(traceAnalysis);

  // Vector search for relevant code
  let relevantCodeChunks: CodeCorrelationOutput["relevantCodeChunks"] = [];
  if (searchQuery) {
    const llm = getLLM();
    const embedding = await llm.embed([searchQuery]);

    const chunks = await searchSimilarChunks({
      projectId: input.projectId,
      embedding: embedding[0] ?? [],
      topK: 20,
      minSimilarity: 0.4,
    });

    relevantCodeChunks = chunks.map((c) => ({
      filePath: c.filePath,
      content: c.content.slice(0, 300),
      similarity: c.similarity,
    }));
  }

  // Score commits
  const alertTime = new Date(input.triggeredAt).getTime();
  const changedPaths = new Set(relevantCodeChunks.map((c) => c.filePath));

  const suspectedCommits = repo.commits
    .map((commit) => {
      const temporal = calculateTemporalScore(commit.timestamp, alertTime);
      const semantic = calculateSemanticScore(commit, relevantCodeChunks);
      const pathMatch = calculatePathMatchScore(commit, traceAnalysis);

      const score =
        temporal * WEIGHTS.temporal +
        semantic * WEIGHTS.semantic +
        pathMatch * WEIGHTS.pathMatch;

      return {
        sha: commit.sha,
        message: commit.message.slice(0, 200),
        author: commit.authorName,
        timestamp: commit.timestamp.toISOString(),
        score,
        signals: { temporal, semantic, pathMatch },
      };
    })
    .filter((c) => c.score > 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  // Score PRs
  const suspectedPRs = repo.pullRequests
    .filter((pr) => pr.mergedAt)
    .map((pr) => {
      const temporal = calculateTemporalScore(pr.mergedAt!, alertTime);
      return {
        number: pr.number,
        title: pr.title.slice(0, 200),
        author: pr.authorLogin,
        mergedAt: pr.mergedAt!.toISOString(),
        score: temporal,
      };
    })
    .filter((pr) => pr.score > 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return { suspectedCommits, suspectedPRs, relevantCodeChunks };
}

/** Build search query from trace analysis */
function buildSearchQuery(analysis: TraceAnalysisOutput): string {
  const parts: string[] = [];

  // Top error messages
  for (const error of analysis.errorGroups.slice(0, 3)) {
    parts.push(error.errorMessage);
  }

  // Affected endpoints
  for (const error of analysis.errorGroups.slice(0, 2)) {
    parts.push(...error.endpoints.slice(0, 2));
  }

  return parts.join(" ").slice(0, 500);
}

/** Calculate temporal score with exponential decay (half-life ~3 days) */
function calculateTemporalScore(changeTime: Date, alertTime: number): number {
  const daysAgo = (alertTime - changeTime.getTime()) / (24 * 60 * 60 * 1000);
  return Math.exp(-daysAgo / 3);
}

/** Calculate semantic score based on changed files matching relevant chunks */
function calculateSemanticScore(
  commit: { filesChanged: unknown },
  chunks: CodeCorrelationOutput["relevantCodeChunks"]
): number {
  if (chunks.length === 0) return 0;

  const filesChanged = (commit.filesChanged as Array<{ path: string }>) ?? [];
  const changedPaths = new Set(filesChanged.map((f) => f.path));

  let maxSimilarity = 0;
  for (const chunk of chunks) {
    if (changedPaths.has(chunk.filePath)) {
      maxSimilarity = Math.max(maxSimilarity, chunk.similarity);
    }
  }

  return maxSimilarity;
}

/** Calculate path match score from error endpoints */
function calculatePathMatchScore(
  commit: { filesChanged: unknown },
  analysis: TraceAnalysisOutput
): number {
  const filesChanged = (commit.filesChanged as Array<{ path: string }>) ?? [];
  const changedPaths = new Set(filesChanged.map((f) => f.path.toLowerCase()));

  const endpoints = analysis.errorGroups.flatMap((g) => g.endpoints);
  if (endpoints.length === 0) return 0;

  let matches = 0;
  for (const endpoint of endpoints) {
    const normalized = endpoint.toLowerCase();
    for (const path of changedPaths) {
      if (path.includes(normalized) || normalized.includes(path.split("/").pop() ?? "")) {
        matches++;
        break;
      }
    }
  }

  return matches / endpoints.length;
}
```

#### 3.3 RCA Generation Activity

```typescript
import { getLLM } from "@/lib/llm-manager";
import { LLMRCAOutputSchema } from "@ducsigr/api/schemas";
import {
  type RCAWorkflowInput,
  type TraceAnalysisOutput,
  type CodeCorrelationOutput,
  type RCAGenerationOutput,
} from "../types";

/** Model selection by alert severity */
const MODEL_BY_SEVERITY = {
  CRITICAL: { provider: "anthropic" as const, model: "claude-sonnet-4-20250514" },
  HIGH: { provider: "anthropic" as const, model: "claude-sonnet-4-20250514" },
  MEDIUM: { provider: "anthropic" as const, model: "claude-3-5-haiku-20241022" },
  LOW: { provider: "anthropic" as const, model: "claude-3-5-haiku-20241022" },
} as const;

/**
 * Generates structured RCA report using LLM or template.
 * Uses severity-based model selection for cost optimization.
 */
export async function generateRCA(
  input: RCAWorkflowInput,
  traceAnalysis: TraceAnalysisOutput,
  codeCorrelation: CodeCorrelationOutput
): Promise<RCAGenerationOutput> {
  // For LOW severity with minimal data, use template (no LLM cost)
  if (
    input.severity === "LOW" &&
    shouldUseTemplate(traceAnalysis, codeCorrelation)
  ) {
    return generateTemplateRCA(input, traceAnalysis, codeCorrelation);
  }

  const modelConfig = MODEL_BY_SEVERITY[input.severity];
  const prompt = buildRCAPrompt(input, traceAnalysis, codeCorrelation);

  const llm = getLLM();
  const result = await llm.complete(prompt, {
    provider: modelConfig.provider,
    model: modelConfig.model,
    schema: LLMRCAOutputSchema,
    temperature: 0.3,
    maxTokens: 1000,
  });

  const output = result.data;
  const tokensUsed = result.usage?.totalTokens ?? 0;

  // Estimate cost (approximate)
  const costPerMillion = modelConfig.model.includes("sonnet") ? 15 : 1;
  const estimatedCost = (tokensUsed / 1_000_000) * costPerMillion;

  return {
    hypothesis: output.hypothesis,
    confidence: output.confidence,
    rootCauses: [{
      description: output.rootCause.summary,
      likelihood: output.confidence > 0.7 ? "high" : output.confidence > 0.4 ? "medium" : "low",
      evidence: output.rootCause.evidence,
    }],
    affectedComponents: output.affectedComponents,
    remediation: [
      ...output.remediation.immediate.map((action) => ({
        action,
        priority: "immediate" as const,
        effort: "low" as const,
      })),
      ...output.remediation.longTerm.map((action) => ({
        action,
        priority: "long_term" as const,
        effort: "medium" as const,
      })),
    ],
    model: modelConfig.model,
    tokensUsed,
    estimatedCost,
  };
}

/** Check if template-based RCA is sufficient */
function shouldUseTemplate(
  traceAnalysis: TraceAnalysisOutput,
  codeCorrelation: CodeCorrelationOutput
): boolean {
  return (
    traceAnalysis.errorGroups.length <= 1 &&
    codeCorrelation.suspectedCommits.length === 0 &&
    traceAnalysis.anomalies.length === 0
  );
}

/** Generate template-based RCA (no LLM cost) */
function generateTemplateRCA(
  input: RCAWorkflowInput,
  traceAnalysis: TraceAnalysisOutput,
  codeCorrelation: CodeCorrelationOutput
): RCAGenerationOutput {
  const topError = traceAnalysis.errorGroups[0];
  const topCommit = codeCorrelation.suspectedCommits[0];

  const hypothesis = topCommit
    ? `Alert may be related to recent commit: "${topCommit.message.slice(0, 50)}..."`
    : topError
      ? `Error pattern detected: ${topError.errorMessage.slice(0, 100)}`
      : `${input.alertType} threshold exceeded (${input.currentValue} > ${input.threshold})`;

  return {
    hypothesis,
    confidence: 0.3,
    rootCauses: [{
      description: topError?.errorMessage ?? "See trace analysis",
      likelihood: "low",
      evidence: [],
    }],
    affectedComponents: traceAnalysis.errorGroups.flatMap((g) => g.endpoints).slice(0, 5),
    remediation: [
      { action: "Review recent deployments", priority: "immediate", effort: "low" },
      { action: "Check service health dashboards", priority: "immediate", effort: "low" },
      { action: "Add more granular monitoring", priority: "long_term", effort: "medium" },
    ],
    model: "template",
    tokensUsed: 0,
    estimatedCost: 0,
  };
}

/** Build LLM prompt from analysis data */
function buildRCAPrompt(
  input: RCAWorkflowInput,
  traceAnalysis: TraceAnalysisOutput,
  codeCorrelation: CodeCorrelationOutput
): string {
  return `You are an expert SRE analyzing a production incident. Generate a root cause analysis.

## Alert Information
- **Alert:** ${input.alertName}
- **Type:** ${input.alertType}
- **Severity:** ${input.severity}
- **Value:** ${input.currentValue} (threshold: ${input.threshold})
- **Window:** ${input.windowMins} minutes

## Trace Analysis
- **Error Rate:** ${(traceAnalysis.errorRate * 100).toFixed(1)}%
- **Total Spans:** ${traceAnalysis.totalSpanCount}
- **Error Count:** ${traceAnalysis.errorCount}
- **Latency:** P50=${traceAnalysis.latencyStats.p50.toFixed(0)}ms, P95=${traceAnalysis.latencyStats.p95.toFixed(0)}ms, P99=${traceAnalysis.latencyStats.p99.toFixed(0)}ms

## Top Error Patterns
${traceAnalysis.errorGroups.slice(0, 5).map((e, i) =>
  `${i + 1}. "${e.errorMessage}" (${e.count} occurrences)`
).join("\n")}

## Anomalies Detected
${traceAnalysis.anomalies.map((a) =>
  `- [${a.severity.toUpperCase()}] ${a.type}: ${a.description}`
).join("\n") || "None detected"}

## Recent Code Changes (by correlation score)
${codeCorrelation.suspectedCommits.slice(0, 5).map((c, i) =>
  `${i + 1}. [${(c.score * 100).toFixed(0)}%] ${c.message} (${c.author}, ${c.timestamp})`
).join("\n") || "No correlated commits found"}

Analyze this incident and provide a structured root cause analysis with hypothesis, confidence (0-1), evidence, affected components, and remediation steps.`;
}
```

#### 3.4 Store RCA Activity

```typescript
import { getInternalCaller } from "@/lib/trpc-caller";
import {
  type RCAWorkflowInput,
  type TraceAnalysisOutput,
  type CodeCorrelationOutput,
  type RCAGenerationOutput,
} from "../types";

interface RCAAnalysis {
  traceAnalysis: TraceAnalysisOutput;
  codeCorrelation: CodeCorrelationOutput;
  generation: RCAGenerationOutput;
}

/**
 * Stores RCA results via tRPC internal procedure.
 * Follows Temporal activity pattern: mutations via tRPC, not direct DB access.
 */
export async function storeRCA(
  input: RCAWorkflowInput,
  analysis: RCAAnalysis
): Promise<{ rcaId: string }> {
  const caller = getInternalCaller();

  return caller.internal.storeRCA({
    alertId: input.alertId,
    alertHistoryId: input.alertHistoryId,
    triggeredAt: input.triggeredAt,
    report: {
      hypothesis: analysis.generation.hypothesis,
      confidence: analysis.generation.confidence,
      reasoning: analysis.generation.rootCauses[0]?.description ?? "",
      rootCause: {
        category: determineCategory(analysis),
        summary: analysis.generation.rootCauses[0]?.description ?? "",
        evidence: analysis.generation.rootCauses[0]?.evidence ?? [],
      },
      relatedChanges: analysis.codeCorrelation.suspectedCommits.slice(0, 5).map((c) => ({
        changeId: c.sha,
        type: "commit" as const,
        relevance: c.score > 0.7 ? "high" as const : c.score > 0.5 ? "medium" as const : "low" as const,
        explanation: `Score: ${(c.score * 100).toFixed(0)}% (temporal: ${(c.signals.temporal * 100).toFixed(0)}%, semantic: ${(c.signals.semantic * 100).toFixed(0)}%, path: ${(c.signals.pathMatch * 100).toFixed(0)}%)`,
      })),
      affectedComponents: analysis.generation.affectedComponents,
      remediation: {
        immediate: analysis.generation.remediation
          .filter((r) => r.priority === "immediate")
          .map((r) => r.action),
        longTerm: analysis.generation.remediation
          .filter((r) => r.priority === "long_term")
          .map((r) => r.action),
      },
      traceAnalysis: analysis.traceAnalysis,
    },
    suspectedPRs: analysis.codeCorrelation.suspectedPRs.map((pr) => String(pr.number)),
    suspectedCommits: analysis.codeCorrelation.suspectedCommits.map((c) => c.sha),
    confidence: analysis.generation.confidence,
    traceCount: analysis.traceAnalysis.totalSpanCount,
    errorCount: analysis.traceAnalysis.errorCount,
    llmTokensUsed: analysis.generation.tokensUsed,
    llmCost: analysis.generation.estimatedCost,
  });
}

/** Determine root cause category from analysis */
function determineCategory(analysis: RCAAnalysis): "CODE_CHANGE" | "INFRASTRUCTURE" | "EXTERNAL_DEPENDENCY" | "DATA_ISSUE" | "UNKNOWN" {
  if (analysis.codeCorrelation.suspectedCommits.some((c) => c.score > 0.6)) {
    return "CODE_CHANGE";
  }
  if (analysis.traceAnalysis.anomalies.some((a) => a.type === "throughput_drop")) {
    return "INFRASTRUCTURE";
  }
  return "UNKNOWN";
}
```

---

### Phase 4: tRPC Internal Procedure (Day 2)

**File:** `packages/api/src/routers/internal.ts`

Add the `storeRCA` procedure:

```typescript
import { StoreRCAInputSchema } from "../schemas/rca";

// Add to internalRouter
storeRCA: internalProcedure
  .input(StoreRCAInputSchema)
  .mutation(async ({ input }) => {
    const rca = await prisma.alertRCA.create({
      data: {
        alertId: input.alertId,
        alertHistoryId: input.alertHistoryId ?? undefined,
        triggeredAt: new Date(input.triggeredAt),
        status: "COMPLETED",
        completedAt: new Date(),
        analysisJson: input.report,
        hypothesis: input.report.hypothesis,
        rootCauseCategory: input.report.rootCause.category,
        confidence: input.report.confidence,
        suspectedPRs: input.suspectedPRs,
        suspectedCommits: input.suspectedCommits,
        traceCount: input.traceCount ?? null,
        errorCount: input.errorCount ?? null,
        llmTokensUsed: input.llmTokensUsed ?? null,
        llmCost: input.llmCost ? new Prisma.Decimal(input.llmCost) : null,
      },
    });

    return { rcaId: rca.id };
  }),
```

---

### Phase 5: RCA Workflow (Day 3)

**File:** `apps/worker/src/workflows/rca.workflow.ts` (NEW)

```typescript
import { proxyActivities, log } from "@temporalio/workflow";
import type * as activities from "../temporal/activities/rca.activities";
import type { RCAWorkflowInput, RCAWorkflowResult } from "../temporal/types";

const {
  analyzeTraces,
  correlateCodeChanges,
  generateRCA,
  storeRCA,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "2 minutes",
  retry: {
    initialInterval: "1s",
    maximumInterval: "30s",
    maximumAttempts: 3,
  },
});

/**
 * RCA Workflow - triggered as child workflow when an alert fires.
 *
 * Steps:
 * 1. Analyze traces to extract error patterns
 * 2. Correlate with recent code changes
 * 3. Generate RCA using LLM (or template)
 * 4. Store RCA via tRPC internal procedure
 */
export async function rcaWorkflow(input: RCAWorkflowInput): Promise<RCAWorkflowResult> {
  log.info("Starting RCA workflow", {
    alertId: input.alertId,
    severity: input.severity,
    alertType: input.alertType,
  });

  try {
    // Step 1: Analyze traces
    log.info("Analyzing traces", { projectId: input.projectId });
    const traceAnalysis = await analyzeTraces(input);
    log.info("Trace analysis complete", {
      errorCount: traceAnalysis.errorCount,
      totalSpans: traceAnalysis.totalSpanCount,
      anomalies: traceAnalysis.anomalies.length,
    });

    // Step 2: Correlate code changes
    log.info("Correlating code changes");
    const codeCorrelation = await correlateCodeChanges(input, traceAnalysis);
    log.info("Correlation complete", {
      commits: codeCorrelation.suspectedCommits.length,
      prs: codeCorrelation.suspectedPRs.length,
    });

    // Step 3: Generate RCA
    log.info("Generating RCA", { severity: input.severity });
    const rcaGeneration = await generateRCA(input, traceAnalysis, codeCorrelation);
    log.info("RCA generated", {
      confidence: rcaGeneration.confidence,
      model: rcaGeneration.model,
      tokensUsed: rcaGeneration.tokensUsed,
    });

    // Step 4: Store RCA
    log.info("Storing RCA");
    const { rcaId } = await storeRCA(input, {
      traceAnalysis,
      codeCorrelation,
      generation: rcaGeneration,
    });

    log.info("RCA workflow completed", { rcaId, alertId: input.alertId });

    return {
      rcaId,
      success: true,
      analysisGenerated: true,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error("RCA workflow failed", { alertId: input.alertId, error: errorMessage });

    return {
      rcaId: "",
      success: false,
      analysisGenerated: false,
      error: errorMessage,
    };
  }
}
```

---

### Phase 6: Integration with Alert Workflow (Day 4)

**File:** `apps/worker/src/workflows/alert.workflow.ts`

Add child workflow invocation after notification dispatch:

```typescript
import { executeChild } from "@temporalio/workflow";
import { rcaWorkflow } from "./rca.workflow";

// Inside evaluateAlertCycle, after dispatchNotification for FIRING state:
if (transition.newState === "FIRING") {
  log.info("Triggering RCA workflow", { alertId: input.alertId });

  // Fire-and-forget: RCA runs independently
  await executeChild(rcaWorkflow, {
    args: [{
      alertId: input.alertId,
      alertHistoryId: historyId ?? "",
      projectId: input.projectId,
      alertName: input.alertName,
      alertType: input.alertType ?? "ERROR_RATE",
      severity: input.severity,
      triggeredAt: new Date().toISOString(),
      currentValue: result.currentValue,
      threshold: result.threshold,
      windowMins: input.windowMins ?? 5,
    }],
    workflowId: `rca-${input.alertId}-${Date.now()}`,
    parentClosePolicy: "ABANDON",  // RCA continues even if parent stops
  });
}
```

---

### Phase 7: Exports & Registry (Day 4)

**File:** `apps/worker/src/temporal/activities/index.ts`
```typescript
export {
  analyzeTraces,
  correlateCodeChanges,
  generateRCA,
  storeRCA,
} from "./rca.activities";
```

**File:** `apps/worker/src/workflows/index.ts`
```typescript
export { rcaWorkflow } from "./rca.workflow";
```

**File:** `apps/worker/src/startup/index.ts`
```typescript
const WORKFLOW_REGISTRY = {
  // ...existing
  rca: {
    name: "Root Cause Analysis",
    description: "Event-driven RCA when alerts fire",
    startOnBoot: false,  // Triggered by alert workflow
  },
};
```

---

## Files Summary

### New Files to Create

| File | Description |
|------|-------------|
| `apps/worker/src/temporal/activities/rca.activities.ts` | All 4 RCA activities |
| `apps/worker/src/workflows/rca.workflow.ts` | RCA workflow orchestration |
| `packages/api/src/schemas/rca.ts` | Zod schemas for RCA types |

### Files to Modify

| File | Changes |
|------|---------|
| `apps/worker/src/temporal/types.ts` | Add RCA workflow types |
| `apps/worker/src/workflows/alert.workflow.ts` | Trigger RCA on FIRING state |
| `apps/worker/src/temporal/activities/index.ts` | Export RCA activities |
| `apps/worker/src/workflows/index.ts` | Export rcaWorkflow |
| `apps/worker/src/startup/index.ts` | Add to workflow registry |
| `packages/api/src/routers/internal.ts` | Add storeRCA procedure |
| `packages/api/src/schemas/index.ts` | Export RCA schemas |
| `packages/db/prisma/schema.prisma` | Enhance AlertRCA model, add enums |
| `docs/WORKFLOWS.md` | Document RCA workflow |

---

## Error Handling & Retry Configuration

| Activity | Max Attempts | Initial Delay | Max Delay | Notes |
|----------|--------------|---------------|-----------|-------|
| `analyzeTraces` | 3 | 1s | 30s | Database reads |
| `correlateCodeChanges` | 3 | 1s | 30s | Vector search + DB |
| `generateRCA` | 3 | 2s | 60s | LLM API calls |
| `storeRCA` | 3 | 500ms | 10s | tRPC mutation |

**Failure Scenarios:**

| Scenario | Handling |
|----------|----------|
| No repository linked | Return empty code correlation, still generate analysis |
| No spans in window | Generate minimal RCA with low confidence |
| LLM API failure | Retry with exponential backoff, fallback to template |
| Database failure | Retry with backoff, fail workflow if persistent |

---

## Cost Analysis

| Severity | Model | Est. Tokens | Cost/RCA |
|----------|-------|-------------|----------|
| CRITICAL | claude-sonnet | ~3000 | ~$0.045 |
| HIGH | claude-sonnet | ~3000 | ~$0.045 |
| MEDIUM | claude-haiku | ~3000 | ~$0.003 |
| LOW | Template | 0 | $0.000 |

**Expected Monthly Cost (100 alerts):**
- 10% CRITICAL: 10 × $0.045 = $0.45
- 30% HIGH: 30 × $0.045 = $1.35
- 40% MEDIUM: 40 × $0.003 = $0.12
- 20% LOW: 20 × $0.00 = $0.00
- **Total: ~$1.92/month** (well under $5 budget)

---

## Correlation Scoring Algorithm

The code correlation algorithm combines three signals:

| Signal | Weight | Description |
|--------|--------|-------------|
| **Temporal** | 0.3 | Exponential decay from alert time (half-life ~3 days) |
| **Semantic** | 0.4 | Vector similarity of error messages to changed code |
| **Path Match** | 0.3 | Stack trace paths match changed files |

**Formula:**
```
score = (temporal × 0.3) + (semantic × 0.4) + (pathMatch × 0.3)
```

**Temporal Score:** `exp(-daysAgo / 3)`
- Commit 1 day ago: 0.72
- Commit 3 days ago: 0.37
- Commit 7 days ago: 0.10

---

## Sprint Backlog

| Story | Points | Ticket | Status |
|-------|--------|--------|--------|
| Trace Analysis Activity | 8 | #136 | To Do |
| Code Correlation Activity | 8 | #137 | To Do |
| LLM RCA Generation | 8 | #138 | To Do |
| RCA Storage | 2 | #139 | To Do |
| **Total** | **26** | | |

---

## Dependencies & Blockers

| Dependency | Status | Notes |
|------------|--------|-------|
| Sprint 2 (Vector Search) | ✅ Done | `searchSimilarChunks` available |
| LLM Center | ✅ Done | `getLLM()` with `embed()` and `complete()` |
| Alert System (#90-93) | ✅ Done | AlertHistory table exists |
| Anthropic API key | ⚠️ Needed | Add to environment |
| `alertEvaluationWorkflow` | ✅ Done | FIRING state transitions |

---

## Definition of Ready (for Sprint 4)

By end of Sprint 3:
- [ ] RCA workflow runs successfully on alert fire
- [ ] RCA stored in database with all fields
- [ ] Confidence scores are reasonable (validated manually)
- [ ] Cost per RCA within budget ($0.05 average)
- [ ] WORKFLOWS.md updated with RCA documentation
