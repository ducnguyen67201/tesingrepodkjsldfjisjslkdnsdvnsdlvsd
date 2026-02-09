# RCA MCP Integration - Engineering Specification

**Date:** 2026-02-09
**Author:** Senior Architect (Claude)
**Status:** Draft
**Estimated Complexity:** Medium

---

## 1. Overview

### Summary
Add MCP (Model Context Protocol) tools for RCA data retrieval so Claude (or any MCP-compatible AI agent) can automatically fetch RCA analysis, alert context, and generate fix suggestions. On the frontend, enhance the RCA detail page with an "MCP Setup" card that shows users how to configure their MCP client to connect to the project and auto-retrieve RCA data.

### Acceptance Criteria
- [ ] New MCP tool `get_rca` retrieves full RCA analysis by rcaId
- [ ] New MCP tool `list_alerts` returns alerts with recent history for a project
- [ ] New MCP API routes created at `/api/v1/mcp/alerts` and `/api/v1/mcp/alerts/rca`
- [ ] MCP response schemas and formatters implemented with tests
- [ ] Frontend: New `RCAMCPCard` component on the RCA detail page showing MCP config snippet and auto-copy
- [ ] Existing "Copy Fix Prompt" button enhanced with MCP note/callout

---

## 2. High-Level Architecture View

### System Flow Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│  USER WORKFLOW                                                       │
│                                                                      │
│  1. User sees RCA page → Sees "Use with AI Agent" card              │
│  2. User copies MCP config OR copies RCA context prompt             │
│  3. In Claude Code / IDE: MCP auto-fetches get_rca(rcaId)          │
│  4. Claude reads RCA data + related traces → Suggests fix           │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────┐     ┌──────────────────────┐     ┌──────────────────┐
│  Claude Code │────▶│  MCP Server          │────▶│  Web API         │
│  (MCP Client)│◀────│  (@ducsigr/mcp)      │◀────│  (Next.js)       │
└──────────────┘     │                      │     │                  │
                     │  Tools:              │     │  Routes:         │
                     │  - get_rca        ◀──NEW   │  - /mcp/alerts/rca ◀──NEW
                     │  - list_alerts    ◀──NEW   │  - /mcp/alerts     ◀──NEW
                     │  - list_traces       │     │  - /mcp/traces     │
                     │  - get_trace         │     │  - /mcp/traces/*   │
                     │  - search_spans      │     │  - /mcp/spans/*    │
                     │  - get_cost_summary  │     │  - /mcp/analytics/*│
                     │  - get_trace_stats   │     │                  │
                     │  - list_projects     │     │                  │
                     └──────────────────────┘     └────────┬─────────┘
                                                           │
                                                  ┌────────▼─────────┐
                                                  │   PostgreSQL      │
                                                  │  (AlertRCA, Alert,│
                                                  │   AlertHistory)   │
                                                  └──────────────────┘
```

### Component Interaction Map (Frontend)

```
┌─────────────────────────────────────────────────────┐
│            RCADetailPage (existing)                  │
│  apps/web/src/components/rca/rca-detail-page.tsx     │
└───────────────────────┬─────────────────────────────┘
                        │ renders (after remediation card)
           ┌────────────▼────────────┐
           │   RCAMCPCard ◀── NEW    │
           │  components/rca/        │
           │  rca-mcp-card.tsx       │
           └─────────────────────────┘
                        │
                Uses static content (no hook needed)
                - Shows MCP JSON config snippet
                - Copy-to-clipboard for config & rcaId
                - Link to MCP docs
```

### Data Model Relationships

No new database models needed - we expose **existing** `AlertRCA`, `Alert`, and `AlertHistory` via new MCP API routes.

```
┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│    Alert     │──1:N──│ AlertHistory │       │  AlertRCA    │
└──────┬───────┘       └──────────────┘       └──────┬───────┘
       │                                             │
       │ 1:N                                    belongs to
       │                                             │
       └─────────────────────────────────────────────┘
                    (existing models)
```

---

## 3. Codebase Resource Map

### Existing Files (Related)
| File | Purpose | Relevance |
|------|---------|-----------|
| `packages/mcp/src/tools/traces.ts` | Trace MCP tools | Pattern to follow for new tools |
| `packages/mcp/src/tools/index.ts` | Tool registration hub | Must register new alert tools |
| `packages/mcp/src/lib/api-client.ts` | HTTP API client | Must add alert/RCA methods |
| `packages/mcp/src/lib/schemas.ts` | Response Zod schemas | Must add RCA response schemas |
| `packages/mcp/src/lib/formatters.ts` | Output formatters | Must add RCA formatter |
| `packages/mcp/src/lib/types.ts` | TypeScript interfaces | Must add RCA types |
| `packages/mcp/src/lib/errors.ts` | Error/text result helpers | Reuse existing |
| `apps/web/src/lib/mcp-auth.ts` | MCP API auth | Reuse for new routes |
| `apps/web/src/app/api/v1/mcp/traces/route.ts` | MCP trace route | Pattern to follow |
| `apps/web/src/components/rca/rca-detail-page.tsx` | RCA detail page | Must add MCP card |
| `apps/web/src/components/rca/rca-copy-fix-prompt.tsx` | Copy fix prompt dialog | Reference for UX pattern |
| `apps/web/src/components/rca/rca-header.tsx` | RCA header with actions | No changes needed |
| `packages/api/src/schemas/rca.ts` | RCA Zod schemas | Reference for data shapes |
| `packages/api/src/routers/alerts.ts` | Alert router (getRCADetail, generateFixPrompt) | Reference for data queries |

### Files to Create
| File | Purpose |
|------|---------|
| `packages/mcp/src/tools/alerts.ts` | MCP tools: `get_rca`, `list_alerts` |
| `packages/mcp/src/tools/__tests__/alerts.test.ts` | Unit tests for alert tools |
| `apps/web/src/app/api/v1/mcp/alerts/route.ts` | MCP API: list alerts |
| `apps/web/src/app/api/v1/mcp/alerts/rca/route.ts` | MCP API: get RCA detail |
| `apps/web/src/components/rca/rca-mcp-card.tsx` | MCP setup card on RCA page |

### Files to Modify
| File | Change |
|------|--------|
| `packages/mcp/src/tools/index.ts` | Register `registerAlertTools` |
| `packages/mcp/src/lib/api-client.ts` | Add `listAlerts()`, `getRCA()` methods |
| `packages/mcp/src/lib/schemas.ts` | Add alert/RCA response schemas |
| `packages/mcp/src/lib/formatters.ts` | Add `formatAlertList()`, `formatRCADetail()` |
| `packages/mcp/src/lib/types.ts` | Add RCA/Alert type interfaces |
| `apps/web/src/components/rca/rca-detail-page.tsx` | Add `RCAMCPCard` below remediation |

---

## 4. Rationale & Design Decisions

### Why This Architecture?

This follows the exact same pattern established by existing MCP tools (traces, spans, analytics, projects):

1. **MCP Tool** (in `packages/mcp/`) → calls **HTTP API route** (in `apps/web/api/v1/mcp/`) → queries **Prisma** directly
2. MCP tools format data as human-readable text for LLM consumption
3. Auth uses the same `authenticateMcpRequest` (API key → projectId)

The `get_rca` tool is the key value-add - when Claude Code has this MCP connected, the user can simply say "Fix the issue from RCA cmles50d8..." and Claude will automatically call `get_rca` to fetch the full analysis, hypothesis, evidence, suspected commits, and remediation steps.

### Alternatives Considered
| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| MCP Resource (URI-based) | Cleaner for static data | Less discoverable for AI agents; tools are the standard pattern for querying | Rejected |
| Generate-and-copy prompt only (current state) | Already exists | User has to manually copy/paste; no auto-retrieval | Enhance, don't replace |
| **MCP Tools + Frontend Card** | Auto-retrievable by AI; follows existing patterns; discoverable | Two new API routes | **Chosen** |

### Key Design Choices
1. **Two tools, not one** - `list_alerts` provides context (which alerts exist, their state) while `get_rca` deep-dives into a specific RCA. This mirrors the `list_traces` / `get_trace` split.
2. **Frontend card, not modal** - The MCP setup card is always visible on the RCA page (below remediation), so users naturally discover it. No extra clicks needed.
3. **No database changes** - All data already exists in `AlertRCA`, `Alert`, `AlertHistory`. We just expose it through new API routes.

---

## 5. Database Schema

**No database changes required.** This feature exposes existing data through new API endpoints.

---

## 6. API Layer (Code Skeletons)

### 6.1 MCP API Route: List Alerts

```typescript
// apps/web/src/app/api/v1/mcp/alerts/route.ts
import { type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@ducsigr/db";
import { authenticateMcpRequest } from "@/lib/mcp-auth";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-responses";

const InputSchema = z.object({
  limit: z.number().min(1).max(50).default(20),
  enabled: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const auth = await authenticateMcpRequest(req);
  if (!auth.success) return auth.response;

  let body: unknown;
  try { body = await req.json(); } catch { return apiError.invalidJson(); }

  const parsed = InputSchema.safeParse(body);
  if (!parsed.success) return apiError.validation("Invalid input", parsed.error.flatten());

  const input = parsed.data;

  try {
    const where: Record<string, unknown> = { projectId: auth.projectId };
    if (input.enabled !== undefined) where.enabled = input.enabled;

    const alerts = await prisma.alert.findMany({
      where,
      select: {
        id: true,
        name: true,
        type: true,
        severity: true,
        state: true,
        threshold: true,
        operator: true,
        windowMins: true,
        enabled: true,
        lastTriggeredAt: true,
        history: {
          take: 3,
          orderBy: { triggeredAt: "desc" },
          select: {
            id: true,
            state: true,
            value: true,
            triggeredAt: true,
          },
        },
        _count: {
          select: { rcas: true },
        },
      },
      orderBy: { lastTriggeredAt: "desc" },
      take: input.limit,
    });

    return apiSuccess.ok({ alerts });
  } catch {
    return apiServerError.internal();
  }
}
```

### 6.2 MCP API Route: Get RCA

```typescript
// apps/web/src/app/api/v1/mcp/alerts/rca/route.ts
import { type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@ducsigr/db";
import { authenticateMcpRequest } from "@/lib/mcp-auth";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-responses";
import { LLMRCAOutputSchema } from "@ducsigr/api/schemas";

const InputSchema = z.object({
  rcaId: z.string(),
});

export async function POST(req: NextRequest) {
  const auth = await authenticateMcpRequest(req);
  if (!auth.success) return auth.response;

  let body: unknown;
  try { body = await req.json(); } catch { return apiError.invalidJson(); }

  const parsed = InputSchema.safeParse(body);
  if (!parsed.success) return apiError.validation("Invalid input", parsed.error.flatten());

  try {
    const rca = await prisma.alertRCA.findUnique({
      where: { id: parsed.data.rcaId },
      include: {
        alert: {
          include: {
            project: { select: { id: true, workspaceId: true } },
          },
        },
      },
    });

    if (!rca || rca.alert.project.id !== auth.projectId) {
      return apiError.notFound("RCA");
    }

    // Validate analysis JSON
    const analysisResult = LLMRCAOutputSchema.safeParse(rca.analysisJson);

    // Fetch related commits
    const commits = rca.suspectedCommits.length > 0
      ? await prisma.gitCommit.findMany({
          where: { sha: { in: rca.suspectedCommits } },
          select: { sha: true, message: true, author: true, timestamp: true, filesChanged: true },
          take: 10,
        })
      : [];

    // Fetch alert history for trigger value
    const alertHistory = await prisma.alertHistory.findFirst({
      where: { alertId: rca.alertId, triggeredAt: rca.triggeredAt },
      select: { value: true, state: true },
    });

    return apiSuccess.ok({
      rca: {
        id: rca.id,
        alertId: rca.alertId,
        triggeredAt: rca.triggeredAt,
        confidence: rca.confidence,
        suspectedCommits: rca.suspectedCommits,
        suspectedPRs: rca.suspectedPRs,
        analysis: analysisResult.success ? analysisResult.data : null,
      },
      alert: {
        id: rca.alert.id,
        name: rca.alert.name,
        type: rca.alert.type,
        severity: rca.alert.severity,
        threshold: rca.alert.threshold,
        operator: rca.alert.operator,
      },
      triggerValue: alertHistory?.value ?? null,
      commits,
    });
  } catch {
    return apiServerError.internal();
  }
}
```

### 6.3 MCP Client Extensions

```typescript
// Add to packages/mcp/src/lib/api-client.ts

// New interface methods:
//   listAlerts(input: Record<string, unknown>): Promise<ListAlertsResponse>;
//   getRCA(input: Record<string, unknown>): Promise<GetRCAResponse>;

// New client methods:
//   listAlerts: (input) =>
//     request(base, apiKey, "/api/v1/mcp/alerts", ListAlertsResponseSchema, input),
//   getRCA: (input) =>
//     request(base, apiKey, "/api/v1/mcp/alerts/rca", GetRCAResponseSchema, input),
```

### 6.4 MCP Response Schemas

```typescript
// Add to packages/mcp/src/lib/schemas.ts

// ============================================================
// /api/v1/mcp/alerts
// ============================================================

const AlertHistoryRowSchema = z.object({
  id: z.string(),
  state: z.string().nullable(),
  value: z.number(),
  triggeredAt: DateStringSchema,
});

const AlertRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  severity: z.string(),
  state: z.string(),
  threshold: z.number(),
  operator: z.string(),
  windowMins: z.number(),
  enabled: z.boolean(),
  lastTriggeredAt: DateStringSchema.nullable(),
  history: z.array(AlertHistoryRowSchema),
  _count: z.object({ rcas: z.number() }),
});

export const ListAlertsResponseSchema = z.object({
  alerts: z.array(AlertRowSchema),
});
export type ListAlertsResponse = z.infer<typeof ListAlertsResponseSchema>;

// ============================================================
// /api/v1/mcp/alerts/rca
// ============================================================

const RCACommitSchema = z.object({
  sha: z.string(),
  message: z.string(),
  author: z.string(),
  timestamp: DateStringSchema,
  filesChanged: z.array(z.string()),
});

const RCAAnalysisSchema = z.object({
  hypothesis: z.string(),
  confidence: z.number(),
  reasoning: z.string(),
  rootCause: z.object({
    category: z.string(),
    summary: z.string(),
    evidence: z.array(z.string()),
  }),
  relatedChanges: z.array(z.object({
    changeId: z.string(),
    type: z.string(),
    relevance: z.string(),
    explanation: z.string(),
  })),
  affectedComponents: z.array(z.string()),
  remediation: z.object({
    immediate: z.array(z.string()),
    longTerm: z.array(z.string()),
  }),
});

export const GetRCAResponseSchema = z.object({
  rca: z.object({
    id: z.string(),
    alertId: z.string(),
    triggeredAt: DateStringSchema,
    confidence: z.number().nullable(),
    suspectedCommits: z.array(z.string()),
    suspectedPRs: z.array(z.string()),
    analysis: RCAAnalysisSchema.nullable(),
  }),
  alert: z.object({
    id: z.string(),
    name: z.string(),
    type: z.string(),
    severity: z.string(),
    threshold: z.number(),
    operator: z.string(),
  }),
  triggerValue: z.number().nullable(),
  commits: z.array(RCACommitSchema),
});
export type GetRCAResponse = z.infer<typeof GetRCAResponseSchema>;
```

### 6.5 MCP Tools

```typescript
// packages/mcp/src/tools/alerts.ts
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ApiClient } from "../lib/api-client.js";
import { formatAlertList, formatRCADetail } from "../lib/formatters.js";
import { errorResult, textResult } from "../lib/errors.js";

// ============================================================
// Schemas
// ============================================================

const ListAlertsInputSchema = z.object({
  limit: z.number().min(1).max(50).default(20),
  enabled: z.boolean().optional(),
});

const GetRCAInputSchema = z.object({
  rcaId: z.string().describe("The RCA ID (e.g., cmles50d80001xgm1ur7433ny)"),
});

// ============================================================
// Exported Handlers (for testability)
// ============================================================

export async function handleListAlerts(
  apiClient: ApiClient,
  args: z.input<typeof ListAlertsInputSchema>
) {
  const input = ListAlertsInputSchema.parse(args);
  const data = await apiClient.listAlerts({ limit: input.limit, enabled: input.enabled });
  const output = formatAlertList(data.alerts);
  return textResult(output);
}

export async function handleGetRCA(
  apiClient: ApiClient,
  args: z.input<typeof GetRCAInputSchema>
) {
  const input = GetRCAInputSchema.parse(args);

  try {
    const data = await apiClient.getRCA({ rcaId: input.rcaId });
    const output = formatRCADetail(data);
    return textResult(output);
  } catch (error) {
    if (error instanceof Error && "status" in error && (error as { status: number }).status === 404) {
      return errorResult(`RCA not found: ${input.rcaId}`);
    }
    throw error;
  }
}

// ============================================================
// Tool Registration
// ============================================================

export function registerAlertTools(server: McpServer, apiClient: ApiClient): void {
  server.registerTool(
    "list_alerts",
    {
      description:
        "List alerts configured for this project, including their current state, severity, and recent trigger history. Use this to understand what monitoring is active.",
      inputSchema: ListAlertsInputSchema.shape,
    },
    async (args) => handleListAlerts(apiClient, args)
  );

  server.registerTool(
    "get_rca",
    {
      description:
        "Get the full Root Cause Analysis (RCA) for an alert incident. Returns the AI-generated hypothesis, evidence, suspected commits, affected components, and remediation steps. Use this to understand why an alert fired and how to fix it.",
      inputSchema: GetRCAInputSchema.shape,
    },
    async (args) => handleGetRCA(apiClient, args)
  );
}
```

### 6.6 MCP Formatters

```typescript
// Add to packages/mcp/src/lib/formatters.ts

export function formatAlertList(alerts: AlertRow[]): string {
  if (alerts.length === 0) return "No alerts configured for this project.";

  let output = `# Alerts (${alerts.length})\n\n`;

  for (const alert of alerts) {
    const state = alert.state === "FIRING" ? "🔴 FIRING" : alert.state === "PENDING" ? "🟡 PENDING" : "🟢 OK";
    output += `## ${alert.name}\n`;
    output += `- **ID**: ${alert.id}\n`;
    output += `- **Type**: ${alert.type} | **Severity**: ${alert.severity}\n`;
    output += `- **State**: ${state} | **Enabled**: ${alert.enabled ? "Yes" : "No"}\n`;
    output += `- **Threshold**: ${alert.operator} ${alert.threshold} (window: ${alert.windowMins}m)\n`;
    output += `- **RCA Reports**: ${alert._count.rcas}\n`;

    if (alert.history.length > 0) {
      output += `- **Recent History**:\n`;
      for (const h of alert.history) {
        output += `  - ${formatRelativeTime(h.triggeredAt)}: value=${h.value} state=${h.state ?? "N/A"}\n`;
      }
    }
    output += `\n`;
  }

  return output;
}

export function formatRCADetail(data: GetRCAResponse): string {
  const { rca, alert, triggerValue, commits } = data;

  let output = `# Root Cause Analysis: ${alert.name}\n\n`;
  output += `## Alert Context\n`;
  output += `- **Alert**: ${alert.name} (${alert.type})\n`;
  output += `- **Severity**: ${alert.severity}\n`;
  output += `- **Threshold**: ${alert.operator} ${alert.threshold}\n`;
  output += `- **Trigger Value**: ${triggerValue ?? "N/A"}\n`;
  output += `- **Triggered At**: ${rca.triggeredAt}\n`;
  output += `- **Confidence**: ${rca.confidence !== null ? `${Math.round(rca.confidence * 100)}%` : "N/A"}\n\n`;

  if (rca.analysis) {
    const a = rca.analysis;
    output += `## Hypothesis\n${a.hypothesis}\n\n`;
    output += `## Root Cause\n`;
    output += `- **Category**: ${a.rootCause.category}\n`;
    output += `- **Summary**: ${a.rootCause.summary}\n`;
    output += `- **Evidence**:\n`;
    for (const e of a.rootCause.evidence) {
      output += `  - ${e}\n`;
    }
    output += `\n## Reasoning\n${a.reasoning}\n\n`;

    if (a.affectedComponents.length > 0) {
      output += `## Affected Components\n`;
      for (const c of a.affectedComponents) {
        output += `- ${c}\n`;
      }
      output += `\n`;
    }

    if (a.relatedChanges.length > 0) {
      output += `## Related Changes\n`;
      for (const rc of a.relatedChanges) {
        output += `- [${rc.relevance}] ${rc.type} ${rc.changeId}: ${rc.explanation}\n`;
      }
      output += `\n`;
    }

    output += `## Remediation\n`;
    output += `### Immediate Steps\n`;
    for (const [i, step] of a.remediation.immediate.entries()) {
      output += `${i + 1}. ${step}\n`;
    }
    output += `\n### Long-term Improvements\n`;
    for (const [i, step] of a.remediation.longTerm.entries()) {
      output += `${i + 1}. ${step}\n`;
    }
    output += `\n`;
  } else {
    output += `## Analysis\n*Analysis data not available*\n\n`;
  }

  if (commits.length > 0) {
    output += `## Suspected Commits\n`;
    for (const c of commits) {
      output += `- \`${c.sha.slice(0, 7)}\` ${c.message} (by ${c.author})\n`;
      if (c.filesChanged.length > 0) {
        output += `  Files: ${c.filesChanged.join(", ")}\n`;
      }
    }
    output += `\n`;
  }

  return output;
}
```

---

## 7. Frontend Layer (Code Skeletons)

### 7.1 RCA MCP Card Component

```tsx
// apps/web/src/components/rca/rca-mcp-card.tsx
"use client";

import { useState, useCallback } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, Check, Terminal, ExternalLink } from "lucide-react";
import { clipboardToast } from "@/lib/success";

interface RCAMCPCardProps {
  rcaId: string;
  alertName: string;
}

const MCP_CONFIG_TEMPLATE = `{
  "mcpServers": {
    "ducsigr": {
      "command": "npx",
      "args": ["-y", "@ducsigr/mcp@latest"],
      "env": {
        "DUCSIGR_API_KEY": "<your-api-key>",
        "DUCSIGR_API_URL": "<your-ducsigr-url>"
      }
    }
  }
}`;

export function RCAMCPCard({ rcaId, alertName }: RCAMCPCardProps) {
  const [copiedConfig, setCopiedConfig] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  const mcpPrompt = `Use the get_rca tool to fetch RCA "${rcaId}" and help me fix the issue "${alertName}". Read the analysis, check suspected commits, and suggest a code fix.`;

  const handleCopyConfig = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(MCP_CONFIG_TEMPLATE);
      setCopiedConfig(true);
      clipboardToast.copied("MCP config");
      setTimeout(() => setCopiedConfig(false), 2000);
    } catch {
      clipboardToast.copyFailed();
    }
  }, []);

  const handleCopyPrompt = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(mcpPrompt);
      setCopiedPrompt(true);
      clipboardToast.copied("prompt");
      setTimeout(() => setCopiedPrompt(false), 2000);
    } catch {
      clipboardToast.copyFailed();
    }
  }, [mcpPrompt]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Terminal className="h-5 w-5" />
          Use with AI Agent
          <Badge variant="outline" className="text-xs">MCP</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Connect your AI coding assistant to automatically retrieve this RCA data and suggest fixes.
        </p>

        {/* Step 1: Quick prompt */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Quick: Paste this prompt in Claude Code</h4>
          <div className="relative">
            <pre className="bg-muted rounded-md p-3 pr-12 text-xs font-mono overflow-x-auto whitespace-pre-wrap">
              {mcpPrompt}
            </pre>
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 h-7 w-7"
              onClick={handleCopyPrompt}
            >
              {copiedPrompt
                ? <Check className="h-3.5 w-3.5" />
                : <Copy className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>

        {/* Step 2: MCP Config */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Setup: Add Ducsigr MCP to your config</h4>
          <div className="relative">
            <pre className="bg-muted rounded-md p-3 pr-12 text-xs font-mono overflow-x-auto">
              {MCP_CONFIG_TEMPLATE}
            </pre>
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 h-7 w-7"
              onClick={handleCopyConfig}
            >
              {copiedConfig
                ? <Check className="h-3.5 w-3.5" />
                : <Copy className="h-3.5 w-3.5" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Add to <code className="bg-muted px-1 rounded">~/.claude/claude_desktop_config.json</code> or your IDE&apos;s MCP settings.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
```

### 7.2 RCA Detail Page Modification

```tsx
// apps/web/src/components/rca/rca-detail-page.tsx
// Add import:
import { RCAMCPCard } from "./rca-mcp-card";

// Add after RCARemediationCard:
<RCAMCPCard rcaId={rca.id} alertName={alert.name} />
```

---

## 8. Test Specifications

### Unit Tests - MCP Alert Tools

```typescript
// packages/mcp/src/tools/__tests__/alerts.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleListAlerts, handleGetRCA } from "../alerts.js";
import type { ApiClient } from "../../lib/api-client.js";

const mockApiClient: ApiClient = {
  listTraces: vi.fn(),
  getTrace: vi.fn(),
  getErrorTraces: vi.fn(),
  searchSpans: vi.fn(),
  getCostSummary: vi.fn(),
  getTraceStats: vi.fn(),
  getProjectInfo: vi.fn(),
  listAlerts: vi.fn(),
  getRCA: vi.fn(),
};

describe("alert MCP tools", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("handleListAlerts", () => {
    it("returns formatted alert list", async () => {
      (mockApiClient.listAlerts as ReturnType<typeof vi.fn>).mockResolvedValue({
        alerts: [
          {
            id: "alert_1",
            name: "High Error Rate",
            type: "ERROR_RATE",
            severity: "HIGH",
            state: "FIRING",
            threshold: 0.05,
            operator: "GREATER_THAN",
            windowMins: 5,
            enabled: true,
            lastTriggeredAt: new Date("2026-01-15"),
            history: [{ id: "h1", state: "FIRING", value: 0.12, triggeredAt: new Date() }],
            _count: { rcas: 2 },
          },
        ],
      });

      const result = await handleListAlerts(mockApiClient, {});
      expect(result.content[0].text).toContain("High Error Rate");
      expect(result.content[0].text).toContain("FIRING");
      expect(result.content[0].text).toContain("ERROR_RATE");
    });

    it("returns empty message when no alerts", async () => {
      (mockApiClient.listAlerts as ReturnType<typeof vi.fn>).mockResolvedValue({ alerts: [] });
      const result = await handleListAlerts(mockApiClient, {});
      expect(result.content[0].text).toContain("No alerts");
    });

    it("passes limit and enabled filters", async () => {
      (mockApiClient.listAlerts as ReturnType<typeof vi.fn>).mockResolvedValue({ alerts: [] });
      await handleListAlerts(mockApiClient, { limit: 5, enabled: true });
      expect(mockApiClient.listAlerts).toHaveBeenCalledWith({ limit: 5, enabled: true });
    });
  });

  describe("handleGetRCA", () => {
    it("returns formatted RCA detail", async () => {
      (mockApiClient.getRCA as ReturnType<typeof vi.fn>).mockResolvedValue({
        rca: {
          id: "rca_1",
          alertId: "alert_1",
          triggeredAt: new Date("2026-01-15"),
          confidence: 0.87,
          suspectedCommits: ["abc1234"],
          suspectedPRs: ["42"],
          analysis: {
            hypothesis: "Memory leak in connection pool",
            confidence: 0.87,
            reasoning: "Error rate spiked after deployment",
            rootCause: {
              category: "CODE_CHANGE",
              summary: "Unclosed DB connections",
              evidence: ["Connection pool exhaustion logs"],
            },
            relatedChanges: [],
            affectedComponents: ["api-server"],
            remediation: {
              immediate: ["Restart service"],
              longTerm: ["Add connection pool monitoring"],
            },
          },
        },
        alert: {
          id: "alert_1",
          name: "High Error Rate",
          type: "ERROR_RATE",
          severity: "HIGH",
          threshold: 0.05,
          operator: "GREATER_THAN",
        },
        triggerValue: 0.12,
        commits: [
          {
            sha: "abc1234567890",
            message: "fix: update connection handling",
            author: "dev@example.com",
            timestamp: new Date("2026-01-14"),
            filesChanged: ["src/db.ts"],
          },
        ],
      });

      const result = await handleGetRCA(mockApiClient, { rcaId: "rca_1" });
      const text = result.content[0].text;

      expect(text).toContain("Root Cause Analysis");
      expect(text).toContain("Memory leak in connection pool");
      expect(text).toContain("87%");
      expect(text).toContain("CODE_CHANGE");
      expect(text).toContain("Restart service");
      expect(text).toContain("abc1234");
    });

    it("returns error for not found RCA", async () => {
      const error = new Error("Not found");
      (error as unknown as { status: number }).status = 404;
      (mockApiClient.getRCA as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      const result = await handleGetRCA(mockApiClient, { rcaId: "nonexistent" });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("not found");
    });

    it("validates required rcaId input", async () => {
      await expect(handleGetRCA(mockApiClient, {} as { rcaId: string })).rejects.toThrow();
    });
  });
});
```

---

## 9. Execution Order

| Step | Action | Files | Depends On |
|------|--------|-------|------------|
| 1 | Add MCP response schemas | `packages/mcp/src/lib/schemas.ts` | - |
| 2 | Add TypeScript interfaces | `packages/mcp/src/lib/types.ts` | Step 1 |
| 3 | Add API client methods | `packages/mcp/src/lib/api-client.ts` | Step 1 |
| 4 | Add formatters | `packages/mcp/src/lib/formatters.ts` | Step 2 |
| 5 | Write MCP tool tests | `packages/mcp/src/tools/__tests__/alerts.test.ts` | Step 3, 4 |
| 6 | Implement MCP tools | `packages/mcp/src/tools/alerts.ts` | Step 3, 4 |
| 7 | Register tools in index | `packages/mcp/src/tools/index.ts` | Step 6 |
| 8 | Create MCP API route: list alerts | `apps/web/src/app/api/v1/mcp/alerts/route.ts` | - |
| 9 | Create MCP API route: get RCA | `apps/web/src/app/api/v1/mcp/alerts/rca/route.ts` | - |
| 10 | Run MCP tests, verify passing | - | Step 5, 6, 7 |
| 11 | Build `RCAMCPCard` component | `apps/web/src/components/rca/rca-mcp-card.tsx` | - |
| 12 | Add MCP card to RCA detail page | `apps/web/src/components/rca/rca-detail-page.tsx` | Step 11 |
