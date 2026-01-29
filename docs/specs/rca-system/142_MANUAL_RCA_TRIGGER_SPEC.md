# Engineering Spec: Manual RCA Trigger Button

**Ticket:** #142
**Epic:** #127 Automated RCA System
**Sprint:** 4 - Integration & Notifications
**Story Points:** 3
**Priority:** P2
**Author:** Senior Architect
**Last Updated:** 2025-12-14

---

## Table of Contents

1. [Overview](#1-overview)
2. [User Experience](#2-user-experience)
3. [API Design](#3-api-design)
4. [Workflow Integration](#4-workflow-integration)
5. [Component Implementation](#5-component-implementation)
6. [State Management](#6-state-management)
7. [Error Handling](#7-error-handling)
8. [Testing Strategy](#8-testing-strategy)
9. [Files to Create/Modify](#9-files-to-createmodify)

---

## 1. Overview

### 1.1 Problem Statement

Users need the ability to manually trigger RCA for:
1. **Historical alerts** that fired before RCA was enabled
2. **Re-analysis** when new code information is available
3. **Investigation** of alerts where automatic RCA was skipped (confidence too low)

### 1.2 Goals

1. **On-demand RCA**: Trigger RCA generation for any alert history entry
2. **Smooth UX**: Clear loading states and progress feedback
3. **Idempotent**: Don't create duplicate RCAs
4. **Navigation**: Redirect to RCA detail page when ready

### 1.3 Non-Goals

- Bulk RCA generation for multiple alerts
- Scheduled/automatic re-analysis
- Canceling in-progress RCA workflows

---

## 2. User Experience

### 2.1 UI Location

The trigger button appears in the **Alert History** section:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Alert History                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Dec 14, 2:34 PM  │  FIRING  │  15.5%  │  > 5%  │  ✅ RCA Available     │ │
│  │                                                  └──[View RCA]──────┘  │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Dec 13, 8:12 AM  │  FIRING  │  12.3%  │  > 5%  │  [🔍 Analyze]         │ │
│  │                                                                        │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Dec 12, 4:56 PM  │  FIRING  │  8.7%   │  > 5%  │  ⏳ Analyzing...       │ │
│  │                                                                        │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 UI States

| State | Display | Action |
|-------|---------|--------|
| **No RCA** | `[🔍 Analyze]` button | Click triggers workflow |
| **Analyzing** | `⏳ Analyzing...` spinner | Disabled, polling |
| **RCA Available** | `✅ RCA Available` badge + `[View RCA]` link | Navigate to detail |
| **RCA Failed** | `❌ Analysis Failed` + `[Retry]` button | Click retries |

### 2.3 User Flow

```
User views alert history
         │
         ▼
Sees "Analyze" button on entry without RCA
         │
         ▼
Clicks "Analyze"
         │
         ▼
Button changes to "Analyzing..." (disabled)
         │
         ├───────────────────────────────────────┐
         │                                       │
    (Success)                              (Failure)
         │                                       │
         ▼                                       ▼
Toast: "Analysis started"              Toast: "Analysis failed"
         │                                       │
         ▼                                       ▼
Poll for completion                    Show "Retry" button
         │
         ▼
Badge shows "RCA Available"
         │
         ▼
User clicks "View RCA" → Navigate to detail page
```

---

## 3. API Design

### 3.1 Trigger RCA Procedure

```typescript
// packages/api/src/routers/alerts.ts

const TriggerRCAInputSchema = z.object({
  workspaceSlug: z.string(),
  alertHistoryId: z.string(),
});

const TriggerRCAOutputSchema = z.object({
  status: z.enum(["started", "existing", "queued"]),
  rcaId: z.string().optional(),     // If existing
  workflowId: z.string().optional(), // If started/queued
  message: z.string(),
});

triggerRCA: protectedProcedure
  .input(TriggerRCAInputSchema)
  .use(workspaceMiddleware)
  .mutation(async ({ ctx, input }) => {
    // 1. Fetch alert history with relations
    const history = await prisma.alertHistory.findUnique({
      where: { id: input.alertHistoryId },
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

    if (!history) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Alert history not found" });
    }

    // 2. Verify workspace access
    if (history.alert.project.workspaceId !== ctx.workspace.id) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }

    // 3. Check if RCA already exists
    const existingRCA = await prisma.alertRCA.findFirst({
      where: {
        alertId: history.alertId,
        triggeredAt: history.triggeredAt,
      },
    });

    if (existingRCA) {
      return {
        status: "existing" as const,
        rcaId: existingRCA.id,
        message: "RCA already exists for this alert",
      };
    }

    // 4. Check if workflow is already running
    const workflowId = `rca-manual-${input.alertHistoryId}`;
    const client = await getTemporalClient();

    try {
      const handle = client.workflow.getHandle(workflowId);
      const status = await handle.describe();

      if (status.status.name === "RUNNING") {
        return {
          status: "queued" as const,
          workflowId,
          message: "RCA analysis is already in progress",
        };
      }
    } catch (error) {
      // Workflow doesn't exist, proceed to start
    }

    // 5. Calculate analysis window
    const windowMins = history.alert.windowMins;
    const windowStart = subMinutes(history.triggeredAt, windowMins);
    const windowEnd = history.triggeredAt;

    // 6. Start RCA workflow
    await client.workflow.start("rcaAnalysisWorkflow", {
      taskQueue: "worker-queue",
      workflowId,
      args: [{
        alertId: history.alertId,
        alertHistoryId: input.alertHistoryId,
        alertName: history.alert.name,
        alertType: history.alert.type,
        alertValue: history.value,
        threshold: history.threshold,
        severity: history.alert.severity,
        projectId: history.alert.projectId,
        projectName: history.alert.project.name,
        windowStart: windowStart.toISOString(),
        windowEnd: windowEnd.toISOString(),
        triggeredBy: "manual",
        userId: ctx.session.user.id,
      }],
    });

    // 7. Track manual trigger in database
    await prisma.alertHistory.update({
      where: { id: input.alertHistoryId },
      data: {
        rcaRequestedAt: new Date(),
        rcaRequestedBy: ctx.session.user.id,
      },
    });

    return {
      status: "started" as const,
      workflowId,
      message: "RCA analysis started",
    };
  }),
```

### 3.2 Get RCA Status Procedure

For polling the status of a triggered RCA:

```typescript
// packages/api/src/routers/alerts.ts

getRCAStatus: protectedProcedure
  .input(z.object({
    workspaceSlug: z.string(),
    alertHistoryId: z.string(),
  }))
  .use(workspaceMiddleware)
  .query(async ({ ctx, input }) => {
    // 1. Fetch alert history
    const history = await prisma.alertHistory.findUnique({
      where: { id: input.alertHistoryId },
      include: {
        alert: {
          include: {
            project: { select: { workspaceId: true } },
          },
        },
      },
    });

    if (!history) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }

    if (history.alert.project.workspaceId !== ctx.workspace.id) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }

    // 2. Check for existing RCA
    const rca = await prisma.alertRCA.findFirst({
      where: {
        alertId: history.alertId,
        triggeredAt: history.triggeredAt,
      },
      select: {
        id: true,
        confidence: true,
        createdAt: true,
      },
    });

    if (rca) {
      return {
        status: "completed" as const,
        rcaId: rca.id,
        confidence: rca.confidence,
        completedAt: rca.createdAt,
      };
    }

    // 3. Check workflow status
    const workflowId = `rca-manual-${input.alertHistoryId}`;
    const client = await getTemporalClient();

    try {
      const handle = client.workflow.getHandle(workflowId);
      const description = await handle.describe();

      const statusMap: Record<string, string> = {
        RUNNING: "running",
        COMPLETED: "completed",
        FAILED: "failed",
        CANCELED: "failed",
        TERMINATED: "failed",
        TIMED_OUT: "failed",
      };

      return {
        status: statusMap[description.status.name] ?? "unknown",
        workflowId,
        startedAt: description.startTime,
      };
    } catch (error) {
      // No workflow and no RCA
      return {
        status: "not_started" as const,
      };
    }
  }),
```

### 3.3 Schema Updates

```prisma
// packages/db/prisma/schema.prisma

model AlertHistory {
  id            String   @id @default(cuid())
  alertId       String
  alert         Alert    @relation(fields: [alertId], references: [id], onDelete: Cascade)

  value         Float
  threshold     Float
  state         AlertState
  previousState AlertState?
  notifiedVia   String[]

  triggeredAt   DateTime @default(now())

  // Manual RCA tracking (NEW)
  rcaRequestedAt DateTime?
  rcaRequestedBy String?

  @@index([alertId, triggeredAt])
}
```

---

## 4. Workflow Integration

### 4.1 RCA Workflow Input Extension

```typescript
// apps/worker/src/temporal/types.ts

export interface RCAWorkflowInput {
  alertId: string;
  alertHistoryId: string;
  alertName: string;
  alertType: AlertType;
  alertValue: number;
  threshold: number;
  severity: AlertSeverity;
  projectId: string;
  projectName: string;
  windowStart: string;  // ISO date string
  windowEnd: string;    // ISO date string

  // NEW: Manual trigger metadata
  triggeredBy: "automatic" | "manual";
  userId?: string;  // Who triggered (for manual)
}
```

### 4.2 Workflow ID Convention

```
Automatic: rca-{alertId}-{timestamp}
Manual:    rca-manual-{alertHistoryId}
```

Using `alertHistoryId` for manual triggers ensures:
- Unique per history entry
- Easy lookup for status polling
- Idempotent (can't start duplicate)

---

## 5. Component Implementation

### 5.1 Alert History Row with RCA Button

```tsx
// apps/web/src/components/alerts/alert-history-row.tsx

"use client";

import { useState, useEffect } from "react";
import { TableRow, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, CheckCircle, XCircle, ExternalLink } from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/trpc/client";
import { formatAlertValue, formatDate } from "@/lib/format";
import { alertToast, showError } from "@/lib/errors";

interface AlertHistoryRowProps {
  history: AlertHistoryWithAlert;
  workspaceSlug: string;
  projectId: string;
}

export function AlertHistoryRow({
  history,
  workspaceSlug,
  projectId,
}: AlertHistoryRowProps) {
  const [rcaStatus, setRcaStatus] = useState<RCAStatus>("unknown");
  const [rcaId, setRcaId] = useState<string | null>(null);

  // Initial status check
  const statusQuery = api.alerts.getRCAStatus.useQuery(
    { workspaceSlug, alertHistoryId: history.id },
    {
      refetchInterval: rcaStatus === "running" ? 3000 : false, // Poll while running
      onSuccess: (data) => {
        setRcaStatus(data.status);
        if (data.rcaId) setRcaId(data.rcaId);
      },
    }
  );

  // Trigger mutation
  const triggerRCA = api.alerts.triggerRCA.useMutation({
    onSuccess: (data) => {
      if (data.status === "existing") {
        setRcaStatus("completed");
        setRcaId(data.rcaId);
        alertToast.rcaExists();
      } else if (data.status === "started" || data.status === "queued") {
        setRcaStatus("running");
        alertToast.rcaStarted();
      }
    },
    onError: (error) => {
      showError(error);
    },
  });

  const handleAnalyze = () => {
    triggerRCA.mutate({ workspaceSlug, alertHistoryId: history.id });
  };

  // Build RCA action cell
  const renderRCAAction = () => {
    switch (rcaStatus) {
      case "completed":
        return (
          <Link
            href={`/${workspaceSlug}/projects/${projectId}/alerts/${history.alertId}/rca/${rcaId}`}
          >
            <Badge variant="secondary" className="cursor-pointer hover:bg-secondary/80">
              <CheckCircle className="h-3 w-3 mr-1 text-green-500" />
              RCA Available
              <ExternalLink className="h-3 w-3 ml-1" />
            </Badge>
          </Link>
        );

      case "running":
        return (
          <Badge variant="outline" className="text-muted-foreground">
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            Analyzing...
          </Badge>
        );

      case "failed":
        return (
          <Button
            size="sm"
            variant="outline"
            onClick={handleAnalyze}
            disabled={triggerRCA.isPending}
            className="text-destructive"
          >
            <XCircle className="h-3 w-3 mr-1" />
            Retry
          </Button>
        );

      case "not_started":
      default:
        return (
          <Button
            size="sm"
            variant="outline"
            onClick={handleAnalyze}
            disabled={triggerRCA.isPending}
          >
            {triggerRCA.isPending ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <Search className="h-3 w-3 mr-1" />
            )}
            Analyze
          </Button>
        );
    }
  };

  return (
    <TableRow>
      <TableCell>{formatDate(history.triggeredAt)}</TableCell>
      <TableCell>
        <Badge variant={getStateBadgeVariant(history.state)}>
          {history.state}
        </Badge>
      </TableCell>
      <TableCell className="font-mono">
        {formatAlertValue(history.alert.type, history.value)}
      </TableCell>
      <TableCell className="font-mono text-muted-foreground">
        {getOperatorSymbol(history.alert.operator)}{" "}
        {formatAlertValue(history.alert.type, history.threshold)}
      </TableCell>
      <TableCell>{renderRCAAction()}</TableCell>
    </TableRow>
  );
}

type RCAStatus = "unknown" | "not_started" | "running" | "completed" | "failed";

function getStateBadgeVariant(state: string) {
  switch (state) {
    case "FIRING":
      return "destructive";
    case "RESOLVED":
      return "secondary";
    default:
      return "outline";
  }
}

function getOperatorSymbol(operator: string) {
  return operator === "GREATER_THAN" ? ">" : "<";
}
```

### 5.2 Custom Hook for RCA Trigger

```tsx
// apps/web/src/hooks/use-trigger-rca.ts

import { api } from "@/lib/trpc/client";
import { useState, useCallback, useEffect } from "react";

interface UseTriggerRCAOptions {
  workspaceSlug: string;
  alertHistoryId: string;
  onCompleted?: (rcaId: string) => void;
}

type RCAStatus = "idle" | "triggering" | "running" | "completed" | "failed";

export function useTriggerRCA({
  workspaceSlug,
  alertHistoryId,
  onCompleted,
}: UseTriggerRCAOptions) {
  const [status, setStatus] = useState<RCAStatus>("idle");
  const [rcaId, setRcaId] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const utils = api.useUtils();

  // Trigger mutation
  const triggerMutation = api.alerts.triggerRCA.useMutation({
    onSuccess: (data) => {
      if (data.status === "existing" && data.rcaId) {
        setStatus("completed");
        setRcaId(data.rcaId);
        onCompleted?.(data.rcaId);
      } else if (data.status === "started" || data.status === "queued") {
        setStatus("running");
      }
    },
    onError: (err) => {
      setStatus("failed");
      setError(err);
    },
  });

  // Status polling query
  const statusQuery = api.alerts.getRCAStatus.useQuery(
    { workspaceSlug, alertHistoryId },
    {
      enabled: status === "running",
      refetchInterval: 3000,
      onSuccess: (data) => {
        if (data.status === "completed" && data.rcaId) {
          setStatus("completed");
          setRcaId(data.rcaId);
          onCompleted?.(data.rcaId);
        } else if (data.status === "failed") {
          setStatus("failed");
        }
      },
    }
  );

  // Initial status check
  useEffect(() => {
    const checkInitialStatus = async () => {
      const data = await utils.alerts.getRCAStatus.fetch({
        workspaceSlug,
        alertHistoryId,
      });

      if (data.status === "completed" && data.rcaId) {
        setStatus("completed");
        setRcaId(data.rcaId);
      } else if (data.status === "running") {
        setStatus("running");
      }
    };

    checkInitialStatus();
  }, [alertHistoryId]);

  const trigger = useCallback(() => {
    setStatus("triggering");
    setError(null);
    triggerMutation.mutate({ workspaceSlug, alertHistoryId });
  }, [workspaceSlug, alertHistoryId, triggerMutation]);

  const retry = useCallback(() => {
    setStatus("idle");
    setError(null);
    trigger();
  }, [trigger]);

  return {
    status,
    rcaId,
    error,
    trigger,
    retry,
    isLoading: status === "triggering" || status === "running",
    isCompleted: status === "completed",
    isFailed: status === "failed",
  };
}
```

---

## 6. State Management

### 6.1 Status Flow

```
┌──────────┐   trigger()   ┌────────────┐   API call   ┌─────────┐
│   idle   │─────────────▶│ triggering │────────────▶│ running │
└──────────┘               └────────────┘              └────┬────┘
     ▲                                                      │
     │                                                      │ poll
     │ retry()                                              │
     │                     ┌─────────┐                      ▼
     └─────────────────────│ failed  │◀───────────── (workflow error)
                           └─────────┘
                                                      ┌───────────┐
                                                      │ completed │
                                                      └───────────┘
                                                           │
                                                           ▼
                                                   onCompleted(rcaId)
```

### 6.2 Polling Strategy

- **Interval**: 3 seconds while `status === "running"`
- **Timeout**: 5 minutes max (100 polls)
- **Backoff**: Not implemented (fixed interval sufficient)

### 6.3 Cache Invalidation

After RCA completes:
```typescript
utils.alerts.history.invalidate({ workspaceSlug, alertId });
utils.alerts.getRCAStatus.invalidate({ workspaceSlug, alertHistoryId });
```

---

## 7. Error Handling

### 7.1 Error Scenarios

| Scenario | User Message | Recovery |
|----------|--------------|----------|
| Alert history not found | "Alert history not found" | Refresh page |
| No workspace access | "You don't have access" | - |
| Workflow already running | "Analysis in progress" | Auto-transitions to polling |
| Workflow start failed | "Failed to start analysis" | Show retry button |
| Workflow execution failed | "Analysis failed" | Show retry with error details |
| Temporal connection error | "Service temporarily unavailable" | Retry later |

### 7.2 Toast Messages

```tsx
// apps/web/src/lib/success.ts

export const alertToast = {
  // ... existing
  rcaStarted: () =>
    toast.success("RCA Analysis Started", {
      description: "You'll be notified when the analysis is complete.",
    }),
  rcaCompleted: (confidence?: number) =>
    toast.success("RCA Analysis Complete", {
      description: confidence
        ? `Analysis completed with ${Math.round(confidence * 100)}% confidence.`
        : "Root cause analysis is now available.",
    }),
  rcaExists: () =>
    toast.info("RCA Already Available", {
      description: "Click 'View RCA' to see the analysis.",
    }),
} as const;

// apps/web/src/lib/errors.ts

export const alertError = {
  // ... existing
  rcaFailed: (reason?: string) =>
    toast.error("RCA Analysis Failed", {
      description: reason ?? "Unable to complete root cause analysis. Please try again.",
    }),
  rcaTimeout: () =>
    toast.error("Analysis Timed Out", {
      description: "The analysis is taking longer than expected. Please try again later.",
    }),
} as const;
```

---

## 8. Testing Strategy

### 8.1 Unit Tests

```typescript
describe("useTriggerRCA", () => {
  it("starts in idle state", () => {});
  it("transitions to triggering on trigger()", () => {});
  it("transitions to running after successful API call", () => {});
  it("polls status while running", () => {});
  it("transitions to completed when RCA ready", () => {});
  it("calls onCompleted with rcaId", () => {});
  it("transitions to failed on error", () => {});
  it("allows retry after failure", () => {});
  it("handles existing RCA case", () => {});
});

describe("AlertHistoryRow", () => {
  it("renders Analyze button when no RCA", () => {});
  it("renders Analyzing spinner when running", () => {});
  it("renders RCA Available badge when completed", () => {});
  it("renders Retry button when failed", () => {});
  it("disables button while triggering", () => {});
});
```

### 8.2 Integration Tests

```typescript
describe("triggerRCA procedure", () => {
  it("returns existing RCA if already generated", async () => {});
  it("starts workflow for new RCA request", async () => {});
  it("returns queued status if workflow running", async () => {});
  it("validates workspace access", async () => {});
  it("tracks manual trigger metadata", async () => {});
});

describe("getRCAStatus procedure", () => {
  it("returns completed with rcaId when RCA exists", async () => {});
  it("returns running when workflow in progress", async () => {});
  it("returns not_started when no RCA and no workflow", async () => {});
  it("returns failed when workflow failed", async () => {});
});
```

### 8.3 E2E Tests

```typescript
describe("Manual RCA Trigger E2E", () => {
  it("user can trigger RCA from alert history", async () => {
    // 1. Navigate to alert detail page
    // 2. Click "Analyze" button on history entry
    // 3. Verify "Analyzing..." state
    // 4. Wait for completion
    // 5. Verify "RCA Available" badge
    // 6. Click to navigate to RCA detail
  });
});
```

---

## 9. Files to Create/Modify

### 9.1 New Files

| File | Description |
|------|-------------|
| `apps/web/src/hooks/use-trigger-rca.ts` | Hook for RCA trigger state management |

### 9.2 Modified Files

| File | Changes |
|------|---------|
| `packages/api/src/routers/alerts.ts` | Add `triggerRCA`, `getRCAStatus` procedures |
| `packages/db/prisma/schema.prisma` | Add `rcaRequestedAt`, `rcaRequestedBy` to AlertHistory |
| `apps/web/src/components/alerts/alert-history-row.tsx` | Add RCA trigger button and status display |
| `apps/web/src/lib/success.ts` | Add RCA toast messages |
| `apps/web/src/lib/errors.ts` | Add RCA error messages |
| `apps/worker/src/temporal/types.ts` | Add `triggeredBy`, `userId` to RCA workflow input |

### 9.3 Dependency Order

```
1. Schema migration (Prisma)
2. tRPC procedures (alerts.ts)
3. Hook implementation (use-trigger-rca.ts)
4. Component update (alert-history-row.tsx)
5. Toast messages
```

---

## Appendix A: API Response Examples

### Trigger RCA - Started

```json
{
  "status": "started",
  "workflowId": "rca-manual-clxyz123",
  "message": "RCA analysis started"
}
```

### Trigger RCA - Existing

```json
{
  "status": "existing",
  "rcaId": "clxyz456",
  "message": "RCA already exists for this alert"
}
```

### Get RCA Status - Running

```json
{
  "status": "running",
  "workflowId": "rca-manual-clxyz123",
  "startedAt": "2025-12-14T14:34:00Z"
}
```

### Get RCA Status - Completed

```json
{
  "status": "completed",
  "rcaId": "clxyz456",
  "confidence": 0.78,
  "completedAt": "2025-12-14T14:34:45Z"
}
```

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-12-14 | Senior Architect | Initial specification |
