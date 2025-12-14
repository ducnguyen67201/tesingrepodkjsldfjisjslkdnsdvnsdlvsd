# Engineering Spec: RCA Detail Page in Dashboard

**Ticket:** #141
**Epic:** #127 Automated RCA System
**Sprint:** 4 - Integration & Notifications
**Story Points:** 5
**Priority:** P1
**Author:** Senior Architect
**Last Updated:** 2025-12-14

---

## Table of Contents

1. [Overview](#1-overview)
2. [User Experience](#2-user-experience)
3. [Route & Navigation](#3-route--navigation)
4. [Data Requirements](#4-data-requirements)
5. [API Design](#5-api-design)
6. [Component Architecture](#6-component-architecture)
7. [Implementation Details](#7-implementation-details)
8. [User Feedback System](#8-user-feedback-system)
9. [Error States](#9-error-states)
10. [Performance Considerations](#10-performance-considerations)
11. [Testing Strategy](#11-testing-strategy)
12. [Files to Create/Modify](#12-files-to-createmodify)

---

## 1. Overview

### 1.1 Problem Statement

Users receive RCA summaries in alert notifications (via #140), but they need a way to view the complete analysis including:
- Full reasoning and evidence
- Related code changes with diffs
- Affected traces and error samples
- Ability to provide feedback on RCA accuracy

### 1.2 Goals

1. **Complete Visibility**: Display full RCA report with all supporting evidence
2. **Code Intelligence**: Show related commits/PRs with syntax-highlighted snippets
3. **Trace Context**: Link to affected traces for deeper investigation
4. **Feedback Loop**: Collect user feedback to improve RCA quality
5. **Navigation**: Easy navigation between alert history and RCA details

### 1.3 Non-Goals

- Editing or regenerating RCA from this page (see #142)
- Comparing multiple RCAs
- Exporting RCA as PDF/markdown

---

## 2. User Experience

### 2.1 User Journey

```
User clicks "View Full RCA" in notification
           │
           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       RCA DETAIL PAGE                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ← Back to Alert History          High Error Rate - Dec 14, 2:34 PM │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  🔍 ROOT CAUSE HYPOTHESIS                                     │  │
│  │                                                               │  │
│  │  The error spike correlates with commit abc1234 which         │  │
│  │  introduced a null pointer exception in the auth middleware.  │  │
│  │                                                               │  │
│  │  Confidence: ████████░░ 78%    Category: 💻 Code Change       │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌─────────────────────────┐  ┌─────────────────────────────────┐  │
│  │  📊 EVIDENCE            │  │  📝 RELATED CHANGES             │  │
│  │                         │  │                                 │  │
│  │  • 847 errors in 5min   │  │  Commit abc1234                 │  │
│  │  • Error rate: 15.5%    │  │  "Refactor auth middleware"     │  │
│  │  • P95 latency: 2.4s    │  │  by jane@example.com            │  │
│  │  • 3 endpoints affected │  │  Score: 0.85 (High)             │  │
│  │                         │  │  ─────────────────────────────  │  │
│  │                         │  │  PR #42                         │  │
│  │                         │  │  "Add user validation"          │  │
│  │                         │  │  Score: 0.62 (Medium)           │  │
│  └─────────────────────────┘  └─────────────────────────────────┘  │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  💻 RELEVANT CODE                                             │  │
│  │                                                               │  │
│  │  src/middleware/auth.ts:45-67                     89% match   │  │
│  │  ┌─────────────────────────────────────────────────────────┐  │  │
│  │  │ 45 │ export async function validateUser(req) {         │  │  │
│  │  │ 46 │   const token = req.headers.authorization;        │  │  │
│  │  │ 47 │   const user = await userService.find(token);     │  │  │
│  │  │ 48 │   if (!user) throw new Error("User not found");   │  │  │
│  │  │ ...│                                                   │  │  │
│  │  └─────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  🛠️ RECOMMENDED ACTIONS                                       │  │
│  │                                                               │  │
│  │  Immediate:                                                   │  │
│  │  1. Rollback commit abc1234                                   │  │
│  │  2. Add null check in AuthMiddleware.validate()               │  │
│  │                                                               │  │
│  │  Long-term:                                                   │  │
│  │  1. Add integration tests for auth edge cases                 │  │
│  │  2. Implement input validation at API gateway                 │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  📈 AFFECTED TRACES                                           │  │
│  │                                                               │  │
│  │  trace-abc123  │  /api/users  │  ERROR  │  2.4s  │  View →   │  │
│  │  trace-def456  │  /api/auth   │  ERROR  │  1.8s  │  View →   │  │
│  │  trace-ghi789  │  /api/users  │  ERROR  │  3.1s  │  View →   │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  Was this RCA helpful?                                        │  │
│  │                                                               │  │
│  │  [👍 Yes, helpful]    [👎 Not helpful]                        │  │
│  │                                                               │  │
│  │  [Add feedback...]                                            │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Information Hierarchy

| Section | Priority | Description |
|---------|----------|-------------|
| Hypothesis | P0 | Main finding - immediately visible |
| Confidence | P0 | Trust indicator for the analysis |
| Evidence | P1 | Supporting data for the hypothesis |
| Related Changes | P1 | Code correlation (if GitHub connected) |
| Code Snippets | P2 | Relevant code for context |
| Remediation | P1 | Actionable next steps |
| Affected Traces | P2 | Deep-dive links |
| Feedback | P2 | Quality improvement |

---

## 3. Route & Navigation

### 3.1 Route Structure

```
/[workspaceSlug]/projects/[projectId]/alerts/[alertId]/rca/[rcaId]
```

**Parameters:**
- `workspaceSlug`: Workspace identifier
- `projectId`: Project identifier
- `alertId`: Parent alert ID
- `rcaId`: RCA record ID (AlertRCA.id)

### 3.2 Navigation Flow

```
Alert List Page
      │
      ▼
Alert Detail Page
      │
      ├──→ Alert History Tab
      │         │
      │         ▼
      │    History Item with "View RCA" button
      │         │
      │         ▼
      └──→ RCA Detail Page (this spec)
                │
                ▼
           Trace Detail Page (existing)
```

### 3.3 Breadcrumb

```
Projects / My App / Alerts / High Error Rate / RCA / Dec 14, 2:34 PM
```

---

## 4. Data Requirements

### 4.1 Primary Data: AlertRCA

```typescript
interface RCADetailData {
  // Core RCA
  id: string;
  alertId: string;
  triggeredAt: Date;
  confidence: number | null;

  // Full analysis (stored as JSON)
  analysis: {
    hypothesis: string;
    reasoning: string;
    rootCause: {
      category: RootCauseCategory;
      summary: string;
      evidence: string[];
    };
    relatedChanges: Array<{
      changeId: string;
      type: "commit" | "pr";
      relevance: "high" | "medium" | "low";
      explanation: string;
    }>;
    affectedComponents: string[];
    remediation: {
      immediate: string[];
      longTerm: string[];
    };
  };

  // LLM metadata
  llmMetadata: {
    model: string;
    promptTokens: number;
    completionTokens: number;
    latencyMs: number;
    estimatedCost: number;
  };

  // Suspected changes (indexed for queries)
  suspectedCommits: string[];
  suspectedPRs: string[];

  // User feedback
  helpful: boolean | null;
  feedback: string | null;
}
```

### 4.2 Related Data

```typescript
interface RCARelatedData {
  // Parent alert
  alert: {
    id: string;
    name: string;
    type: AlertType;
    threshold: number;
    operator: AlertOperator;
    severity: AlertSeverity;
  };

  // Alert history entry
  alertHistory: {
    id: string;
    value: number;
    state: AlertState;
    triggeredAt: Date;
  };

  // GitHub commits (if available)
  commits: Array<{
    id: string;
    sha: string;
    message: string;
    authorName: string;
    authorEmail: string;
    committedAt: Date;
    filesChanged: number;
  }>;

  // GitHub PRs (if available)
  pullRequests: Array<{
    id: string;
    number: number;
    title: string;
    authorLogin: string;
    state: "open" | "closed" | "merged";
    mergedAt: Date | null;
  }>;

  // Code chunks (from vector search)
  codeSnippets: Array<{
    id: string;
    filePath: string;
    startLine: number;
    endLine: number;
    content: string;
    language: string | null;
    similarity: number;
  }>;

  // Affected traces
  traces: Array<{
    id: string;
    name: string;
    timestamp: Date;
    duration: number | null;
    errorCount: number;
    spans: Array<{
      id: string;
      name: string;
      level: SpanLevel;
      statusMessage: string | null;
    }>;
  }>;
}
```

---

## 5. API Design

### 5.1 Get RCA Detail

```typescript
// packages/api/src/routers/alerts.ts

getRCADetail: protectedProcedure
  .input(z.object({
    workspaceSlug: z.string(),
    rcaId: z.string(),
  }))
  .use(workspaceMiddleware)
  .query(async ({ ctx, input }) => {
    // 1. Fetch RCA with related data
    const rca = await prisma.alertRCA.findUnique({
      where: { id: input.rcaId },
      include: {
        alert: {
          include: {
            project: {
              select: {
                id: true,
                name: true,
                workspaceId: true,
              },
            },
          },
        },
      },
    });

    if (!rca) {
      throw new TRPCError({ code: "NOT_FOUND", message: "RCA not found" });
    }

    // 2. Verify workspace access
    if (rca.alert.project.workspaceId !== ctx.workspace.id) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }

    // 3. Fetch alert history entry
    const alertHistory = await prisma.alertHistory.findFirst({
      where: {
        alertId: rca.alertId,
        triggeredAt: rca.triggeredAt,
      },
    });

    // 4. Fetch related commits (if any)
    const commits = rca.suspectedCommits.length > 0
      ? await prisma.gitCommit.findMany({
          where: { sha: { in: rca.suspectedCommits } },
          orderBy: { committedAt: "desc" },
          take: 10,
        })
      : [];

    // 5. Fetch related PRs (if any)
    const pullRequests = rca.suspectedPRs.length > 0
      ? await prisma.gitPullRequest.findMany({
          where: { number: { in: rca.suspectedPRs.map(Number) } },
          orderBy: { createdAt: "desc" },
          take: 5,
        })
      : [];

    // 6. Fetch code snippets from analysis
    const analysis = rca.analysisJson as LLMRCAOutput;
    const codeSnippets = analysis.codeContext?.relevantChunks ?? [];

    // 7. Fetch affected traces (sample)
    const traceAnalysis = analysis.traceAnalysis;
    const traces = traceAnalysis?.affectedTraceIds
      ? await prisma.trace.findMany({
          where: { id: { in: traceAnalysis.affectedTraceIds.slice(0, 5) } },
          include: {
            spans: {
              where: { level: "ERROR" },
              take: 3,
              orderBy: { startTime: "desc" },
            },
          },
        })
      : [];

    return {
      rca: {
        id: rca.id,
        alertId: rca.alertId,
        triggeredAt: rca.triggeredAt,
        confidence: rca.confidence,
        analysis,
        helpful: rca.helpful,
        feedback: rca.feedback,
      },
      alert: {
        id: rca.alert.id,
        name: rca.alert.name,
        type: rca.alert.type,
        threshold: rca.alert.threshold,
        operator: rca.alert.operator,
        severity: rca.alert.severity,
      },
      alertHistory,
      commits,
      pullRequests,
      codeSnippets,
      traces,
    };
  }),
```

### 5.2 Submit RCA Feedback

```typescript
// packages/api/src/routers/alerts.ts

submitRCAFeedback: protectedProcedure
  .input(z.object({
    workspaceSlug: z.string(),
    rcaId: z.string(),
    helpful: z.boolean(),
    feedback: z.string().max(1000).optional(),
  }))
  .use(workspaceMiddleware)
  .mutation(async ({ ctx, input }) => {
    // 1. Verify RCA exists and user has access
    const rca = await prisma.alertRCA.findUnique({
      where: { id: input.rcaId },
      include: {
        alert: {
          include: {
            project: { select: { workspaceId: true } },
          },
        },
      },
    });

    if (!rca) {
      throw new TRPCError({ code: "NOT_FOUND", message: "RCA not found" });
    }

    if (rca.alert.project.workspaceId !== ctx.workspace.id) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }

    // 2. Update feedback
    const updated = await prisma.alertRCA.update({
      where: { id: input.rcaId },
      data: {
        helpful: input.helpful,
        feedback: input.feedback ?? null,
        feedbackAt: new Date(),
        feedbackUserId: ctx.session.user.id,
      },
    });

    return {
      success: true,
      helpful: updated.helpful,
    };
  }),
```

### 5.3 Schema Updates Required

```prisma
// packages/db/prisma/schema.prisma

model AlertRCA {
  id               String    @id @default(cuid())
  alertId          String
  alert            Alert     @relation(fields: [alertId], references: [id], onDelete: Cascade)

  triggeredAt      DateTime
  analysisJson     Json      // Full LLMRCAOutput
  suspectedCommits String[]  // Commit SHAs
  suspectedPRs     String[]  // PR numbers as strings
  confidence       Float?

  // User feedback (NEW)
  helpful          Boolean?
  feedback         String?
  feedbackAt       DateTime?
  feedbackUserId   String?

  createdAt        DateTime  @default(now())

  @@index([alertId, triggeredAt])
}
```

---

## 6. Component Architecture

### 6.1 Component Tree

```
RCADetailPage (page.tsx)
├── PageHeader
│   ├── Breadcrumb
│   └── BackButton
├── RCAHeader
│   ├── AlertInfo (name, type, severity badge)
│   ├── TriggerInfo (timestamp, value, threshold)
│   └── ConfidenceBadge
├── RCAHypothesisCard
│   ├── HypothesisText
│   ├── ReasoningSection
│   ├── CategoryBadge
│   └── EvidenceList
├── RCAEvidenceCard
│   ├── MetricsSummary (errors, latency, etc.)
│   ├── AnomaliesList
│   └── AffectedEndpoints
├── RCARelatedChangesCard
│   ├── CommitList
│   │   └── CommitItem (sha, message, author, score)
│   └── PRList
│       └── PRItem (number, title, author, score)
├── RCACodeSnippetsCard
│   └── CodeSnippet (with syntax highlighting)
│       ├── FileHeader (path, lines, similarity)
│       └── CodeBlock (highlighted)
├── RCARemediationCard
│   ├── ImmediateActions
│   └── LongTermActions
├── RCATracesCard
│   └── TraceRow (link to trace detail)
└── RCAFeedbackCard
    ├── FeedbackButtons (thumbs up/down)
    └── FeedbackTextarea (optional comment)
```

### 6.2 Directory Structure

```
apps/web/src/
├── app/(dashboard)/[workspaceSlug]/projects/[projectId]/alerts/[alertId]/rca/
│   └── [rcaId]/
│       └── page.tsx
├── components/rca/
│   ├── rca-detail-page.tsx      # Main orchestrating component
│   ├── rca-header.tsx           # Alert info and confidence
│   ├── rca-hypothesis-card.tsx  # Main hypothesis display
│   ├── rca-evidence-card.tsx    # Metrics and anomalies
│   ├── rca-related-changes.tsx  # Commits and PRs
│   ├── rca-code-snippets.tsx    # Code with syntax highlighting
│   ├── rca-remediation-card.tsx # Action items
│   ├── rca-traces-card.tsx      # Affected traces
│   ├── rca-feedback-card.tsx    # User feedback collection
│   └── index.ts                 # Barrel export
└── hooks/
    └── use-rca-detail.ts        # Data fetching hook
```

---

## 7. Implementation Details

### 7.1 Page Component

```tsx
// apps/web/src/app/(dashboard)/[workspaceSlug]/projects/[projectId]/alerts/[alertId]/rca/[rcaId]/page.tsx

import { RCADetailPage } from "@/components/rca/rca-detail-page";

interface PageProps {
  params: {
    workspaceSlug: string;
    projectId: string;
    alertId: string;
    rcaId: string;
  };
}

export default function Page({ params }: PageProps) {
  return (
    <RCADetailPage
      workspaceSlug={params.workspaceSlug}
      projectId={params.projectId}
      alertId={params.alertId}
      rcaId={params.rcaId}
    />
  );
}

export const metadata = {
  title: "RCA Detail | CognObserve",
};
```

### 7.2 Main Component

```tsx
// apps/web/src/components/rca/rca-detail-page.tsx

"use client";

import { useRCADetail } from "@/hooks/use-rca-detail";
import { RCAHeader } from "./rca-header";
import { RCAHypothesisCard } from "./rca-hypothesis-card";
import { RCAEvidenceCard } from "./rca-evidence-card";
import { RCARelatedChangesCard } from "./rca-related-changes";
import { RCACodeSnippetsCard } from "./rca-code-snippets";
import { RCARemediationCard } from "./rca-remediation-card";
import { RCATracesCard } from "./rca-traces-card";
import { RCAFeedbackCard } from "./rca-feedback-card";
import { RCADetailSkeleton } from "./rca-detail-skeleton";
import { ErrorState } from "@/components/shared/error-state";
import { NotFound } from "@/components/shared/not-found";

interface RCADetailPageProps {
  workspaceSlug: string;
  projectId: string;
  alertId: string;
  rcaId: string;
}

export function RCADetailPage({
  workspaceSlug,
  projectId,
  alertId,
  rcaId,
}: RCADetailPageProps) {
  const { data, isLoading, error } = useRCADetail({
    workspaceSlug,
    rcaId,
  });

  if (isLoading) {
    return <RCADetailSkeleton />;
  }

  if (error) {
    return <ErrorState error={error} />;
  }

  if (!data) {
    return <NotFound message="RCA not found" />;
  }

  const { rca, alert, alertHistory, commits, pullRequests, codeSnippets, traces } = data;

  return (
    <div className="space-y-6">
      {/* Header with back navigation */}
      <RCAHeader
        alert={alert}
        alertHistory={alertHistory}
        rca={rca}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        alertId={alertId}
      />

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column - Primary info */}
        <div className="lg:col-span-2 space-y-6">
          <RCAHypothesisCard analysis={rca.analysis} confidence={rca.confidence} />
          <RCAEvidenceCard analysis={rca.analysis} />
          <RCARemediationCard remediation={rca.analysis.remediation} />
        </div>

        {/* Right column - Supporting info */}
        <div className="space-y-6">
          <RCARelatedChangesCard
            changes={rca.analysis.relatedChanges}
            commits={commits}
            pullRequests={pullRequests}
          />
          {codeSnippets.length > 0 && (
            <RCACodeSnippetsCard snippets={codeSnippets} />
          )}
        </div>
      </div>

      {/* Full width sections */}
      {traces.length > 0 && (
        <RCATracesCard
          traces={traces}
          workspaceSlug={workspaceSlug}
          projectId={projectId}
        />
      )}

      {/* Feedback section */}
      <RCAFeedbackCard
        rcaId={rca.id}
        workspaceSlug={workspaceSlug}
        currentHelpful={rca.helpful}
        currentFeedback={rca.feedback}
      />
    </div>
  );
}
```

### 7.3 Hypothesis Card

```tsx
// apps/web/src/components/rca/rca-hypothesis-card.tsx

"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Lightbulb, AlertTriangle, CheckCircle } from "lucide-react";
import type { LLMRCAOutput } from "@cognobserve/api/schemas";

const CATEGORY_CONFIG = {
  CODE_CHANGE: { label: "Code Change", icon: "💻", color: "bg-blue-100 text-blue-800" },
  INFRASTRUCTURE: { label: "Infrastructure", icon: "🏗️", color: "bg-orange-100 text-orange-800" },
  EXTERNAL_DEPENDENCY: { label: "External Dependency", icon: "🔗", color: "bg-purple-100 text-purple-800" },
  DATA_ISSUE: { label: "Data Issue", icon: "📊", color: "bg-yellow-100 text-yellow-800" },
  CONFIGURATION: { label: "Configuration", icon: "⚙️", color: "bg-gray-100 text-gray-800" },
  UNKNOWN: { label: "Unknown", icon: "❓", color: "bg-gray-100 text-gray-600" },
} as const;

interface RCAHypothesisCardProps {
  analysis: LLMRCAOutput;
  confidence: number | null;
}

export function RCAHypothesisCard({ analysis, confidence }: RCAHypothesisCardProps) {
  const category = CATEGORY_CONFIG[analysis.rootCause.category];
  const confidencePercent = confidence ? Math.round(confidence * 100) : null;

  const getConfidenceColor = (pct: number) => {
    if (pct >= 70) return "text-green-600";
    if (pct >= 50) return "text-yellow-600";
    return "text-orange-600";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-yellow-500" />
          Root Cause Hypothesis
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Main hypothesis */}
        <div className="p-4 bg-muted rounded-lg border-l-4 border-primary">
          <p className="text-lg font-medium">{analysis.hypothesis}</p>
        </div>

        {/* Confidence and category */}
        <div className="flex flex-wrap gap-4">
          {confidencePercent !== null && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Confidence:</span>
              <div className="flex items-center gap-2">
                <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full ${getConfidenceColor(confidencePercent)} bg-current`}
                    style={{ width: `${confidencePercent}%` }}
                  />
                </div>
                <span className={`font-semibold ${getConfidenceColor(confidencePercent)}`}>
                  {confidencePercent}%
                </span>
              </div>
            </div>
          )}

          <Badge className={category.color}>
            <span className="mr-1">{category.icon}</span>
            {category.label}
          </Badge>
        </div>

        {/* Reasoning */}
        <div>
          <h4 className="font-medium text-muted-foreground mb-2">Reasoning</h4>
          <p className="text-sm">{analysis.reasoning}</p>
        </div>

        {/* Evidence */}
        {analysis.rootCause.evidence.length > 0 && (
          <div>
            <h4 className="font-medium text-muted-foreground mb-2">Evidence</h4>
            <ul className="space-y-2">
              {analysis.rootCause.evidence.map((evidence, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                  {evidence}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

### 7.4 Code Snippets with Syntax Highlighting

```tsx
// apps/web/src/components/rca/rca-code-snippets.tsx

"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Code, FileCode } from "lucide-react";

interface CodeSnippet {
  filePath: string;
  startLine: number;
  endLine: number;
  content: string;
  language: string | null;
  similarity: number;
}

interface RCACodeSnippetsCardProps {
  snippets: CodeSnippet[];
}

export function RCACodeSnippetsCard({ snippets }: RCACodeSnippetsCardProps) {
  if (snippets.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Code className="h-5 w-5" />
          Relevant Code
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {snippets.slice(0, 3).map((snippet, i) => (
          <CodeSnippetBlock key={i} snippet={snippet} />
        ))}
      </CardContent>
    </Card>
  );
}

function CodeSnippetBlock({ snippet }: { snippet: CodeSnippet }) {
  const similarityPercent = Math.round(snippet.similarity * 100);

  return (
    <div className="space-y-2">
      {/* File header */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2 text-muted-foreground font-mono">
          <FileCode className="h-4 w-4" />
          <span>{snippet.filePath}</span>
          <span className="text-xs">
            :{snippet.startLine}-{snippet.endLine}
          </span>
        </div>
        <Badge variant="outline" className="text-xs">
          {similarityPercent}% match
        </Badge>
      </div>

      {/* Code block */}
      <div className="relative">
        <pre className="bg-muted p-4 rounded-md overflow-x-auto text-sm font-mono">
          <code>{addLineNumbers(snippet.content, snippet.startLine)}</code>
        </pre>
      </div>
    </div>
  );
}

function addLineNumbers(content: string, startLine: number): string {
  return content
    .split("\n")
    .map((line, i) => {
      const lineNum = (startLine + i).toString().padStart(4, " ");
      return `${lineNum} │ ${line}`;
    })
    .join("\n");
}
```

### 7.5 Data Fetching Hook

```tsx
// apps/web/src/hooks/use-rca-detail.ts

import { api } from "@/lib/trpc/client";

interface UseRCADetailParams {
  workspaceSlug: string;
  rcaId: string;
}

export function useRCADetail({ workspaceSlug, rcaId }: UseRCADetailParams) {
  return api.alerts.getRCADetail.useQuery(
    { workspaceSlug, rcaId },
    {
      staleTime: 30_000, // 30 seconds
      retry: false,
    }
  );
}

export function useSubmitRCAFeedback(workspaceSlug: string) {
  const utils = api.useUtils();

  return api.alerts.submitRCAFeedback.useMutation({
    onSuccess: (_, variables) => {
      utils.alerts.getRCADetail.invalidate({
        workspaceSlug,
        rcaId: variables.rcaId,
      });
    },
  });
}
```

---

## 8. User Feedback System

### 8.1 Feedback Card Component

```tsx
// apps/web/src/components/rca/rca-feedback-card.tsx

"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ThumbsUp, ThumbsDown, MessageSquare } from "lucide-react";
import { useSubmitRCAFeedback } from "@/hooks/use-rca-detail";
import { rcaToast, showError } from "@/lib/errors";

interface RCAFeedbackCardProps {
  rcaId: string;
  workspaceSlug: string;
  currentHelpful: boolean | null;
  currentFeedback: string | null;
}

export function RCAFeedbackCard({
  rcaId,
  workspaceSlug,
  currentHelpful,
  currentFeedback,
}: RCAFeedbackCardProps) {
  const [helpful, setHelpful] = useState<boolean | null>(currentHelpful);
  const [feedback, setFeedback] = useState(currentFeedback ?? "");
  const [showFeedbackInput, setShowFeedbackInput] = useState(!!currentFeedback);

  const submitFeedback = useSubmitRCAFeedback(workspaceSlug);

  const handleVote = (isHelpful: boolean) => {
    setHelpful(isHelpful);
    setShowFeedbackInput(true);

    submitFeedback.mutate(
      { workspaceSlug, rcaId, helpful: isHelpful, feedback: feedback || undefined },
      {
        onSuccess: () => {
          rcaToast.feedbackSubmitted();
        },
        onError: showError,
      }
    );
  };

  const handleSubmitComment = () => {
    if (helpful === null) return;

    submitFeedback.mutate(
      { workspaceSlug, rcaId, helpful, feedback },
      {
        onSuccess: () => {
          rcaToast.feedbackSubmitted();
        },
        onError: showError,
      }
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Was this RCA helpful?
        </CardTitle>
        <CardDescription>
          Your feedback helps improve future root cause analyses
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Vote buttons */}
        <div className="flex gap-4">
          <Button
            variant={helpful === true ? "default" : "outline"}
            onClick={() => handleVote(true)}
            disabled={submitFeedback.isPending}
          >
            <ThumbsUp className="h-4 w-4 mr-2" />
            Yes, helpful
          </Button>
          <Button
            variant={helpful === false ? "destructive" : "outline"}
            onClick={() => handleVote(false)}
            disabled={submitFeedback.isPending}
          >
            <ThumbsDown className="h-4 w-4 mr-2" />
            Not helpful
          </Button>
        </div>

        {/* Feedback text input */}
        {showFeedbackInput && (
          <div className="space-y-2">
            <Textarea
              placeholder={
                helpful === false
                  ? "What was incorrect or missing?"
                  : "Any additional feedback? (optional)"
              }
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={3}
            />
            <Button
              size="sm"
              onClick={handleSubmitComment}
              disabled={submitFeedback.isPending || !feedback.trim()}
            >
              {submitFeedback.isPending ? "Submitting..." : "Submit Feedback"}
            </Button>
          </div>
        )}

        {/* Confirmation message */}
        {currentHelpful !== null && !submitFeedback.isPending && (
          <p className="text-sm text-muted-foreground">
            Thank you for your feedback!
          </p>
        )}
      </CardContent>
    </Card>
  );
}
```

### 8.2 Feedback Analytics (Future)

Store feedback for RCA quality tracking:
- Aggregate helpful/not helpful rates
- Common feedback themes
- Correlation with confidence scores

---

## 9. Error States

### 9.1 RCA Not Found

```tsx
<NotFound
  title="RCA Not Found"
  description="This root cause analysis doesn't exist or has been deleted."
  action={{
    label: "Go to Alert History",
    href: `/${workspaceSlug}/projects/${projectId}/alerts/${alertId}`,
  }}
/>
```

### 9.2 No GitHub Connection

When no commits/PRs are available:

```tsx
<Card className="border-dashed">
  <CardContent className="py-8 text-center">
    <GitBranch className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
    <p className="text-sm text-muted-foreground">
      Connect GitHub to see related code changes
    </p>
    <Button variant="outline" size="sm" className="mt-4">
      Connect GitHub
    </Button>
  </CardContent>
</Card>
```

### 9.3 Loading State

```tsx
function RCADetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-24 w-full" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Skeleton className="h-64" />
          <Skeleton className="h-48" />
        </div>
        <div className="space-y-6">
          <Skeleton className="h-48" />
          <Skeleton className="h-64" />
        </div>
      </div>
    </div>
  );
}
```

---

## 10. Performance Considerations

### 10.1 Data Loading Strategy

- **Initial Load**: Fetch RCA + alert + alertHistory in single query
- **Lazy Load**: Code snippets and traces loaded on scroll (if many)
- **Cache**: 30-second stale time for RCA data

### 10.2 Code Snippet Optimization

- Limit to 3 snippets in sidebar view
- Truncate long snippets (show first 20 lines)
- Add "Show more" expansion

### 10.3 Bundle Size

- Lazy load syntax highlighting library (if added later)
- Use native `<pre>` for initial implementation

---

## 11. Testing Strategy

### 11.1 Unit Tests

```typescript
describe("RCAHypothesisCard", () => {
  it("renders hypothesis text", () => {});
  it("displays confidence percentage with correct color", () => {});
  it("shows category badge with icon", () => {});
  it("lists evidence items", () => {});
});

describe("RCAFeedbackCard", () => {
  it("submits helpful feedback", () => {});
  it("submits not helpful feedback with comment", () => {});
  it("shows confirmation after submission", () => {});
});
```

### 11.2 Integration Tests

```typescript
describe("RCA Detail Page", () => {
  it("loads and displays RCA data", () => {});
  it("shows related commits when available", () => {});
  it("hides code snippets section when none exist", () => {});
  it("navigates back to alert history", () => {});
});
```

---

## 12. Files to Create/Modify

### 12.1 New Files

| File | Description |
|------|-------------|
| `apps/web/src/app/(dashboard)/[workspaceSlug]/projects/[projectId]/alerts/[alertId]/rca/[rcaId]/page.tsx` | Route page |
| `apps/web/src/components/rca/rca-detail-page.tsx` | Main orchestrating component |
| `apps/web/src/components/rca/rca-header.tsx` | Alert info and navigation |
| `apps/web/src/components/rca/rca-hypothesis-card.tsx` | Hypothesis display |
| `apps/web/src/components/rca/rca-evidence-card.tsx` | Metrics and evidence |
| `apps/web/src/components/rca/rca-related-changes.tsx` | Commits and PRs |
| `apps/web/src/components/rca/rca-code-snippets.tsx` | Code with highlighting |
| `apps/web/src/components/rca/rca-remediation-card.tsx` | Action items |
| `apps/web/src/components/rca/rca-traces-card.tsx` | Affected traces |
| `apps/web/src/components/rca/rca-feedback-card.tsx` | User feedback |
| `apps/web/src/components/rca/rca-detail-skeleton.tsx` | Loading state |
| `apps/web/src/components/rca/index.ts` | Barrel export |
| `apps/web/src/hooks/use-rca-detail.ts` | Data fetching hook |

### 12.2 Modified Files

| File | Changes |
|------|---------|
| `packages/api/src/routers/alerts.ts` | Add `getRCADetail`, `submitRCAFeedback` |
| `packages/db/prisma/schema.prisma` | Add feedback fields to AlertRCA |
| `apps/web/src/lib/success.ts` | Add `rcaToast` for feedback |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-12-14 | Senior Architect | Initial specification |
