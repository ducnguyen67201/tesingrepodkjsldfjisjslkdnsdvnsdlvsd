# Ducsigr MCP Server - Engineering Specification

**Version:** 1.0
**Status:** Ready for Implementation
**Author:** Engineering Team
**Date:** 2025-02-04

---

## Table of Contents

1. [Overview](#1-overview)
2. [Package Setup](#2-package-setup)
3. [Authentication](#3-authentication)
4. [Tool Implementations](#4-tool-implementations)
5. [Prisma Queries](#5-prisma-queries)
6. [Output Formatting](#6-output-formatting)
7. [Error Handling](#7-error-handling)
8. [Testing Strategy](#8-testing-strategy)
9. [Configuration & Distribution](#9-configuration--distribution)
10. [Implementation Checklist](#10-implementation-checklist)

---

## 1. Overview

### 1.1 Purpose

Build an MCP (Model Context Protocol) server that exposes Ducsigr's observability data to AI assistants. The server runs as a standalone process communicating via stdio transport.

### 1.2 Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         MCP Architecture                            │
└─────────────────────────────────────────────────────────────────────┘

   Claude Code / AI Assistant
            │
            │ MCP Protocol (stdio)
            ▼
   ┌─────────────────────┐
   │  @ducsigr/mcp       │  (packages/mcp/)
   │                     │
   │  ┌───────────────┐  │
   │  │   Server      │  │
   │  │   (stdio)     │  │
   │  └───────┬───────┘  │
   │          │          │
   │  ┌───────┴───────┐  │
   │  │     Auth      │  │  ← API Key validation
   │  └───────┬───────┘  │
   │          │          │
   │  ┌───────┴───────┐  │
   │  │    Tools      │  │
   │  │  - traces     │  │
   │  │  - spans      │  │
   │  │  - analytics  │  │
   │  │  - projects   │  │
   │  └───────┬───────┘  │
   │          │          │
   └──────────┼──────────┘
              │
              │ Prisma Client
              ▼
   ┌──────────────────────┐
   │     PostgreSQL       │
   └──────────────────────┘
```

### 1.3 Key Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@modelcontextprotocol/sdk` | `^1.9.0` | MCP server SDK |
| `@ducsigr/db` | `workspace:*` | Prisma client & types |
| `@ducsigr/shared` | `workspace:*` | Shared utilities (hashApiKey) |
| `zod` | `^4.1.13` | Input validation |

---

## 2. Package Setup

### 2.1 Directory Structure

```
packages/mcp/
├── src/
│   ├── index.ts              # CLI entry point (bin)
│   ├── server.ts             # MCP server factory
│   ├── auth.ts               # API key authentication
│   ├── tools/
│   │   ├── index.ts          # Tool registry
│   │   ├── traces.ts         # list_traces, get_trace, get_error_traces
│   │   ├── spans.ts          # search_spans
│   │   ├── analytics.ts      # get_cost_summary, get_trace_stats
│   │   └── projects.ts       # list_projects
│   ├── lib/
│   │   ├── db.ts             # Prisma client singleton
│   │   ├── formatters.ts     # Markdown output formatters
│   │   ├── time.ts           # Time range utilities
│   │   └── types.ts          # Internal types
│   └── env.ts                # Environment validation
├── package.json
├── tsconfig.json
├── tsup.config.ts
└── README.md
```

### 2.2 package.json

```json
{
  "name": "@ducsigr/mcp",
  "version": "0.1.0",
  "description": "MCP server for Ducsigr observability data",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "bin": {
    "ducsigr-mcp": "./dist/index.js"
  },
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": [
    "dist",
    "README.md"
  ],
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src/",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.9.0",
    "@ducsigr/db": "workspace:*",
    "@ducsigr/shared": "workspace:*",
    "zod": "^4.1.13"
  },
  "devDependencies": {
    "@ducsigr/config-eslint": "workspace:*",
    "@ducsigr/config-typescript": "workspace:*",
    "@types/node": "^24.10.1",
    "tsup": "^8.3.5",
    "typescript": "^5.7.2",
    "vitest": "^4.0.14"
  },
  "engines": {
    "node": ">=20"
  }
}
```

### 2.3 tsconfig.json

```json
{
  "extends": "@ducsigr/config-typescript/base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "target": "ES2022",
    "lib": ["ES2022"],
    "strict": true,
    "noEmit": false,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### 2.4 tsup.config.ts

```typescript
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  banner: {
    js: "#!/usr/bin/env node",
  },
});
```

---

## 3. Authentication

### 3.1 Overview

Reuse the existing API key authentication pattern from `apps/ingest-node/src/lib/auth.ts`. The MCP server authenticates once at startup using the `DUCSIGR_API_KEY` environment variable.

### 3.2 Implementation

```typescript
// packages/mcp/src/auth.ts
import { prisma } from "./lib/db";
import { hashApiKey, setApiKeyConfig } from "@ducsigr/shared";

/**
 * Authentication result
 */
export interface AuthResult {
  success: boolean;
  projectId?: string;
  error?: string;
}

/**
 * Initialize API key config from environment
 * Must be called before using hashApiKey
 */
export function initApiKeyConfig(): void {
  setApiKeyConfig({
    prefix: process.env.API_KEY_PREFIX || "co_sk_",
    randomBytesLength: parseInt(process.env.API_KEY_RANDOM_BYTES_LENGTH || "32", 10),
    base62Charset:
      process.env.API_KEY_BASE62_CHARSET ||
      "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
  });
}

/**
 * Authenticate API key and return project binding
 *
 * @param apiKey - Raw API key from environment
 * @returns AuthResult with projectId on success
 */
export async function authenticateApiKey(apiKey: string | undefined): Promise<AuthResult> {
  if (!apiKey) {
    return {
      success: false,
      error: "DUCSIGR_API_KEY environment variable is required",
    };
  }

  try {
    const hashedKey = hashApiKey(apiKey);

    const keyRecord = await prisma.apiKey.findUnique({
      where: { hashedKey },
      select: {
        id: true,
        projectId: true,
        expiresAt: true,
        project: {
          select: {
            id: true,
            name: true,
            workspace: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!keyRecord) {
      return { success: false, error: "Invalid API key" };
    }

    if (keyRecord.expiresAt && keyRecord.expiresAt < new Date()) {
      return { success: false, error: "API key has expired" };
    }

    // Update lastUsedAt (fire and forget)
    prisma.apiKey
      .update({
        where: { id: keyRecord.id },
        data: { lastUsedAt: new Date() },
      })
      .catch(() => {});

    return {
      success: true,
      projectId: keyRecord.projectId,
    };
  } catch (error) {
    return {
      success: false,
      error: `Authentication failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}
```

### 3.3 Authentication Flow

1. Read `DUCSIGR_API_KEY` from environment
2. Initialize API key config via `setApiKeyConfig()`
3. Hash the API key using SHA-256
4. Look up in database by `hashedKey`
5. Validate expiration
6. Extract `projectId` for all subsequent queries
7. Fail startup if authentication fails

---

## 4. Tool Implementations

### 4.1 Tool Registry

```typescript
// packages/mcp/src/tools/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTraceTools } from "./traces";
import { registerSpanTools } from "./spans";
import { registerAnalyticsTools } from "./analytics";
import { registerProjectTools } from "./projects";

export function registerAllTools(server: McpServer, projectId: string): void {
  registerTraceTools(server, projectId);
  registerSpanTools(server, projectId);
  registerAnalyticsTools(server, projectId);
  registerProjectTools(server, projectId);
}
```

### 4.2 Tool: list_traces

**File:** `packages/mcp/src/tools/traces.ts`

```typescript
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "../lib/db";
import { parseTimeRange, formatRelativeTime } from "../lib/time";
import { formatTraceTable } from "../lib/formatters";

const ListTracesInputSchema = z.object({
  limit: z.number().min(1).max(100).default(20),
  cursor: z.string().optional(),
  timeRange: z.enum(["1h", "6h", "24h", "7d", "30d"]).default("24h"),
  hasError: z.boolean().optional(),
  search: z.string().optional(),
  serviceName: z.string().optional(),
  minDurationMs: z.number().optional(),
  maxDurationMs: z.number().optional(),
});

export function registerTraceTools(server: McpServer, projectId: string): void {
  server.tool(
    "list_traces",
    "List traces from your Ducsigr project with optional filters. Returns recent traces with summary info including duration, error status, and span count.",
    ListTracesInputSchema.shape,
    async (args) => {
      const input = ListTracesInputSchema.parse(args);
      const since = parseTimeRange(input.timeRange);

      // Build where clause
      const where: Parameters<typeof prisma.trace.findMany>[0]["where"] = {
        projectId,
        startTime: { gte: since },
      };

      if (input.hasError !== undefined) {
        where.hasError = input.hasError;
      }

      if (input.serviceName) {
        where.serviceName = input.serviceName;
      }

      if (input.search) {
        where.searchText = { contains: input.search, mode: "insensitive" };
      }

      if (input.minDurationMs !== undefined || input.maxDurationMs !== undefined) {
        where.durationMs = {};
        if (input.minDurationMs !== undefined) {
          where.durationMs.gte = input.minDurationMs;
        }
        if (input.maxDurationMs !== undefined) {
          where.durationMs.lte = input.maxDurationMs;
        }
      }

      // Cursor-based pagination
      const cursor = input.cursor ? { id: input.cursor } : undefined;

      // Query traces
      const traces = await prisma.trace.findMany({
        where,
        select: {
          id: true,
          serviceName: true,
          rootSpanName: true,
          durationMs: true,
          errorCount: true,
          spanCount: true,
          startTime: true,
          hasError: true,
        },
        orderBy: { startTime: "desc" },
        take: input.limit + 1, // +1 to check if there are more
        cursor,
        skip: cursor ? 1 : 0,
      });

      // Count total for context
      const totalCount = await prisma.trace.count({ where });

      // Check for next page
      const hasMore = traces.length > input.limit;
      const displayTraces = hasMore ? traces.slice(0, -1) : traces;
      const nextCursor = hasMore ? traces[traces.length - 1]?.id : undefined;

      // Format output
      const output = formatTraceTable(displayTraces, {
        total: totalCount,
        timeRange: input.timeRange,
        nextCursor,
      });

      return { content: [{ type: "text", text: output }] };
    }
  );
}
```

### 4.3 Tool: get_trace

```typescript
const GetTraceInputSchema = z.object({
  traceId: z.string(),
  includeInputOutput: z.boolean().default(true),
});

// In registerTraceTools function:
server.tool(
  "get_trace",
  "Get detailed information about a specific trace including all spans, LLM inputs/outputs, and timing breakdown.",
  GetTraceInputSchema.shape,
  async (args) => {
    const input = GetTraceInputSchema.parse(args);

    const trace = await prisma.trace.findFirst({
      where: {
        id: input.traceId,
        projectId, // Security: ensure trace belongs to project
      },
      include: {
        spans: {
          orderBy: { startTime: "asc" },
          select: {
            id: true,
            externalSpanId: true,
            parentSpanId: true,
            name: true,
            kind: true,
            spanType: true,
            statusCode: true,
            statusMessage: true,
            startTime: true,
            endTime: true,
            durationMs: true,
            // GenAI fields
            model: true,
            promptTokens: true,
            completionTokens: true,
            totalCost: true,
            // Include input/output if requested
            ...(input.includeInputOutput && {
              input: true,
              output: true,
            }),
            // HTTP fields
            httpMethod: true,
            httpRoute: true,
            httpStatusCode: true,
            // DB fields
            dbSystem: true,
            dbOperation: true,
            // Exception fields
            exceptionType: true,
            exceptionMessage: true,
          },
        },
      },
    });

    if (!trace) {
      return {
        content: [{ type: "text", text: `Trace not found: ${input.traceId}` }],
        isError: true,
      };
    }

    const output = formatTraceDetail(trace, input.includeInputOutput);
    return { content: [{ type: "text", text: output }] };
  }
);
```

### 4.4 Tool: get_error_traces

```typescript
const GetErrorTracesInputSchema = z.object({
  limit: z.number().min(1).max(50).default(10),
  timeRange: z.enum(["1h", "6h", "24h", "7d"]).default("24h"),
  exceptionType: z.string().optional(),
});

server.tool(
  "get_error_traces",
  "Get recent traces that contain errors or exceptions. Ideal for debugging production issues.",
  GetErrorTracesInputSchema.shape,
  async (args) => {
    const input = GetErrorTracesInputSchema.parse(args);
    const since = parseTimeRange(input.timeRange);

    // Find error spans with their traces
    const errorSpans = await prisma.span.findMany({
      where: {
        trace: { projectId },
        startTime: { gte: since },
        OR: [
          { statusCode: "ERROR" },
          { exceptionType: { not: null } },
        ],
        ...(input.exceptionType && {
          exceptionType: input.exceptionType,
        }),
      },
      select: {
        id: true,
        name: true,
        exceptionType: true,
        exceptionMessage: true,
        statusMessage: true,
        startTime: true,
        trace: {
          select: {
            id: true,
            serviceName: true,
            rootSpanName: true,
          },
        },
      },
      orderBy: { startTime: "desc" },
      take: input.limit,
    });

    // Group by exception type for summary
    const errorGroups = groupErrorsByType(errorSpans);

    const output = formatErrorSummary(errorGroups, input.timeRange);
    return { content: [{ type: "text", text: output }] };
  }
);
```

### 4.5 Tool: search_spans

**File:** `packages/mcp/src/tools/spans.ts`

```typescript
const SearchSpansInputSchema = z.object({
  query: z.string().optional(),
  spanType: z.enum(["LLM", "HTTP", "DB", "RPC", "FUNCTION", "CUSTOM"]).optional(),
  hasError: z.boolean().optional(),
  model: z.string().optional(),
  limit: z.number().min(1).max(100).default(20),
  timeRange: z.enum(["1h", "6h", "24h", "7d", "30d"]).default("24h"),
});

export function registerSpanTools(server: McpServer, projectId: string): void {
  server.tool(
    "search_spans",
    "Search spans across all traces. Useful for finding specific LLM calls, database queries, or errors.",
    SearchSpansInputSchema.shape,
    async (args) => {
      const input = SearchSpansInputSchema.parse(args);
      const since = parseTimeRange(input.timeRange);

      const where: Parameters<typeof prisma.span.findMany>[0]["where"] = {
        trace: { projectId },
        startTime: { gte: since },
      };

      if (input.query) {
        where.searchText = { contains: input.query, mode: "insensitive" };
      }

      if (input.spanType) {
        where.spanType = input.spanType;
      }

      if (input.hasError) {
        where.OR = [
          { statusCode: "ERROR" },
          { exceptionType: { not: null } },
        ];
      }

      if (input.model) {
        where.model = { contains: input.model, mode: "insensitive" };
      }

      const spans = await prisma.span.findMany({
        where,
        select: {
          id: true,
          traceId: true,
          name: true,
          spanType: true,
          statusCode: true,
          durationMs: true,
          startTime: true,
          model: true,
          exceptionType: true,
          trace: {
            select: {
              serviceName: true,
            },
          },
        },
        orderBy: { startTime: "desc" },
        take: input.limit,
      });

      const output = formatSpanSearchResults(spans, input);
      return { content: [{ type: "text", text: output }] };
    }
  );
}
```

### 4.6 Tool: get_cost_summary

**File:** `packages/mcp/src/tools/analytics.ts`

```typescript
const GetCostSummaryInputSchema = z.object({
  timeRange: z.enum(["24h", "7d", "30d"]).default("7d"),
  groupBy: z.enum(["model", "day", "service"]).default("model"),
});

export function registerAnalyticsTools(server: McpServer, projectId: string): void {
  server.tool(
    "get_cost_summary",
    "Get cost breakdown by model for your project. Shows token usage and costs.",
    GetCostSummaryInputSchema.shape,
    async (args) => {
      const input = GetCostSummaryInputSchema.parse(args);
      const since = parseTimeRange(input.timeRange);
      const sinceDate = new Date(since);

      if (input.groupBy === "model") {
        // Use CostDailySummary for efficiency
        const summaries = await prisma.costDailySummary.groupBy({
          by: ["model"],
          where: {
            projectId,
            date: { gte: sinceDate },
            model: { not: "__all__" },
          },
          _sum: {
            spanCount: true,
            inputTokens: true,
            outputTokens: true,
            totalCost: true,
          },
        });

        const output = formatCostByModel(summaries, input.timeRange);
        return { content: [{ type: "text", text: output }] };
      }

      if (input.groupBy === "day") {
        const summaries = await prisma.costDailySummary.findMany({
          where: {
            projectId,
            date: { gte: sinceDate },
            model: "__all__",
          },
          orderBy: { date: "desc" },
        });

        const output = formatCostByDay(summaries, input.timeRange);
        return { content: [{ type: "text", text: output }] };
      }

      // groupBy === "service"
      const serviceStats = await prisma.span.groupBy({
        by: ["model"],
        where: {
          trace: { projectId },
          startTime: { gte: since },
          model: { not: null },
        },
        _sum: {
          promptTokens: true,
          completionTokens: true,
          totalCost: true,
        },
        _count: true,
      });

      const output = formatCostByService(serviceStats, input.timeRange);
      return { content: [{ type: "text", text: output }] };
    }
  );
}
```

### 4.7 Tool: get_trace_stats

```typescript
const GetTraceStatsInputSchema = z.object({
  timeRange: z.enum(["1h", "6h", "24h", "7d", "30d"]).default("24h"),
  serviceName: z.string().optional(),
});

server.tool(
  "get_trace_stats",
  "Get aggregate statistics for traces including latency percentiles and error rates.",
  GetTraceStatsInputSchema.shape,
  async (args) => {
    const input = GetTraceStatsInputSchema.parse(args);
    const since = parseTimeRange(input.timeRange);

    const where = {
      projectId,
      startTime: { gte: since },
      ...(input.serviceName && { serviceName: input.serviceName }),
    };

    // Get aggregate counts
    const [totalCount, errorCount, durations] = await Promise.all([
      prisma.trace.count({ where }),
      prisma.trace.count({ where: { ...where, hasError: true } }),
      prisma.trace.findMany({
        where: { ...where, durationMs: { not: null } },
        select: { durationMs: true },
        orderBy: { durationMs: "asc" },
      }),
    ]);

    // Calculate percentiles
    const durationValues = durations.map((t) => t.durationMs!).filter(Boolean);
    const percentiles = calculatePercentiles(durationValues, [50, 90, 95, 99]);

    // Group by service
    const serviceStats = await prisma.trace.groupBy({
      by: ["serviceName"],
      where,
      _count: true,
      _avg: { durationMs: true },
    });

    const errorRateByService = await prisma.trace.groupBy({
      by: ["serviceName"],
      where: { ...where, hasError: true },
      _count: true,
    });

    const output = formatTraceStats({
      totalCount,
      errorCount,
      percentiles,
      serviceStats,
      errorRateByService,
      timeRange: input.timeRange,
    });

    return { content: [{ type: "text", text: output }] };
  }
);
```

### 4.8 Tool: list_projects

**File:** `packages/mcp/src/tools/projects.ts`

```typescript
export function registerProjectTools(server: McpServer, projectId: string): void {
  server.tool(
    "list_projects",
    "Show information about the current project (determined by your API key).",
    {},
    async () => {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: {
          id: true,
          name: true,
          createdAt: true,
          workspace: {
            select: {
              id: true,
              name: true,
            },
          },
          _count: {
            select: {
              traces: true,
              apiKeys: true,
            },
          },
        },
      });

      if (!project) {
        return {
          content: [{ type: "text", text: "Project not found" }],
          isError: true,
        };
      }

      const output = formatProjectInfo(project);
      return { content: [{ type: "text", text: output }] };
    }
  );
}
```

---

## 5. Prisma Queries

### 5.1 Database Client

```typescript
// packages/mcp/src/lib/db.ts
import { PrismaClient } from "@ducsigr/db";

// Use globalThis to persist client across hot reloads
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

### 5.2 Query Patterns

**Trace List Query:**
```typescript
// Efficient: Uses index on [projectId, startTime(sort: Desc)]
prisma.trace.findMany({
  where: {
    projectId,
    startTime: { gte: since },
    hasError: true, // Uses index on [projectId, hasError]
  },
  select: { /* minimal fields */ },
  orderBy: { startTime: "desc" },
  take: limit + 1,
});
```

**Full-Text Search:**
```typescript
// Uses GIN trigram index on searchText
prisma.trace.findMany({
  where: {
    projectId,
    searchText: { contains: query, mode: "insensitive" },
  },
});
```

**Cost Aggregation:**
```typescript
// Uses pre-aggregated CostDailySummary table
prisma.costDailySummary.groupBy({
  by: ["model"],
  where: {
    projectId,
    date: { gte: sinceDate },
    model: { not: "__all__" },
  },
  _sum: {
    spanCount: true,
    inputTokens: true,
    outputTokens: true,
    totalCost: true,
  },
});
```

---

## 6. Output Formatting

### 6.1 Formatter Utilities

```typescript
// packages/mcp/src/lib/formatters.ts
import type { Decimal } from "@ducsigr/db";

/**
 * Format duration in human-readable form
 */
export function formatDuration(ms: number | null): string {
  if (ms === null) return "-";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  return `${(ms / 60000).toFixed(2)}m`;
}

/**
 * Format relative time (e.g., "10 minutes ago")
 */
export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)} hours ago`;
  return `${Math.floor(diffMins / 1440)} days ago`;
}

/**
 * Format cost as currency
 */
export function formatCost(cost: Decimal | number | null): string {
  if (cost === null) return "-";
  const value = typeof cost === "number" ? cost : parseFloat(cost.toString());
  return `$${value.toFixed(4)}`;
}

/**
 * Format token count with abbreviation
 */
export function formatTokens(tokens: number | bigint | null): string {
  if (tokens === null) return "-";
  const value = typeof tokens === "bigint" ? Number(tokens) : tokens;
  if (value < 1000) return value.toString();
  if (value < 1000000) return `${(value / 1000).toFixed(1)}K`;
  return `${(value / 1000000).toFixed(2)}M`;
}
```

### 6.2 Table Formatters

```typescript
interface TraceTableOptions {
  total: number;
  timeRange: string;
  nextCursor?: string;
}

interface TraceRow {
  id: string;
  serviceName: string;
  rootSpanName: string | null;
  durationMs: number | null;
  errorCount: number;
  spanCount: number;
  startTime: Date;
}

export function formatTraceTable(
  traces: TraceRow[],
  options: TraceTableOptions
): string {
  const lines: string[] = [];

  lines.push(`Found ${traces.length} traces (showing ${traces.length} of ${options.total} in last ${options.timeRange})`);
  lines.push("");
  lines.push("| ID | Service | Root Span | Duration | Errors | Spans | Time |");
  lines.push("|-----|---------|-----------|----------|--------|-------|------|");

  for (const trace of traces) {
    const id = trace.id.slice(0, 8);
    const service = truncate(trace.serviceName, 15);
    const rootSpan = truncate(trace.rootSpanName || "-", 20);
    const duration = formatDuration(trace.durationMs);
    const errors = trace.errorCount > 0 ? `${trace.errorCount}` : "-";
    const spans = trace.spanCount.toString();
    const time = formatRelativeTime(trace.startTime);

    lines.push(`| ${id} | ${service} | ${rootSpan} | ${duration} | ${errors} | ${spans} | ${time} |`);
  }

  if (options.nextCursor) {
    lines.push("");
    lines.push(`Next page: cursor=${options.nextCursor}`);
  }

  return lines.join("\n");
}
```

### 6.3 Trace Detail Formatter

```typescript
interface SpanNode {
  id: string;
  externalSpanId: string;
  parentSpanId: string | null;
  name: string;
  kind: string;
  spanType: string | null;
  statusCode: string;
  durationMs: number | null;
  model?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalCost?: Decimal | null;
  input?: unknown;
  output?: unknown;
  httpMethod?: string | null;
  httpStatusCode?: number | null;
  dbSystem?: string | null;
  dbOperation?: string | null;
  exceptionType?: string | null;
  exceptionMessage?: string | null;
  children: SpanNode[];
}

export function formatTraceDetail(
  trace: TraceWithSpans,
  includeInputOutput: boolean
): string {
  const lines: string[] = [];

  // Header
  lines.push(`# Trace: ${trace.id}`);
  lines.push("");
  lines.push(`**Service:** ${trace.serviceName}`);
  lines.push(`**Duration:** ${formatDuration(trace.durationMs)}`);
  lines.push(`**Started:** ${trace.startTime.toISOString()}`);
  lines.push(`**Status:** ${trace.hasError ? "ERROR" : "OK"}`);
  lines.push(`**Spans:** ${trace.spans.length}`);
  lines.push("");

  // Build span tree
  const tree = buildSpanTree(trace.spans);

  lines.push("## Span Tree");
  lines.push("");
  lines.push(formatSpanTree(tree, 0));

  // LLM span details
  if (includeInputOutput) {
    const llmSpans = trace.spans.filter((s) => s.spanType === "LLM");
    if (llmSpans.length > 0) {
      lines.push("");
      lines.push("## LLM Span Details");

      for (const span of llmSpans) {
        lines.push("");
        lines.push(`### ${span.name}`);
        if (span.model) lines.push(`**Model:** ${span.model}`);
        if (span.promptTokens) {
          lines.push(`**Tokens:** ${span.promptTokens} in / ${span.completionTokens || 0} out`);
        }
        if (span.totalCost) lines.push(`**Cost:** ${formatCost(span.totalCost)}`);

        if (span.input) {
          lines.push("");
          lines.push("**Input:**");
          lines.push("```json");
          lines.push(JSON.stringify(span.input, null, 2).slice(0, 2000));
          lines.push("```");
        }

        if (span.output) {
          lines.push("");
          lines.push("**Output:**");
          lines.push("```json");
          lines.push(JSON.stringify(span.output, null, 2).slice(0, 2000));
          lines.push("```");
        }
      }
    }
  }

  return lines.join("\n");
}

function formatSpanTree(nodes: SpanNode[], depth: number): string {
  const lines: string[] = [];
  const indent = "    ".repeat(depth);
  const prefix = depth === 0 ? "└── " : "├── ";

  for (const node of nodes) {
    const duration = formatDuration(node.durationMs);
    const typeTag = node.spanType ? `[${node.spanType}]` : "";
    const statusIcon = node.statusCode === "ERROR" ? " " : "";
    const llmIcon = node.spanType === "LLM" ? " ⚡" : "";

    let extra = "";
    if (node.model) extra += `\n${indent}    Model: ${node.model}`;
    if (node.httpMethod) extra += ` ${node.httpMethod} ${node.httpStatusCode || ""}`;
    if (node.dbSystem) extra += ` ${node.dbSystem} ${node.dbOperation || ""}`;
    if (node.exceptionType) extra += `\n${indent}    Exception: ${node.exceptionType}`;

    lines.push(`${indent}${prefix}${node.name} (${duration}) ${typeTag}${statusIcon}${llmIcon}${extra}`);

    if (node.children.length > 0) {
      lines.push(formatSpanTree(node.children, depth + 1));
    }
  }

  return lines.join("\n");
}
```

---

## 7. Error Handling

### 7.1 Error Types

```typescript
// packages/mcp/src/lib/errors.ts

/**
 * MCP tool error that returns error response
 */
export class ToolError extends Error {
  constructor(
    message: string,
    public readonly code: string = "TOOL_ERROR"
  ) {
    super(message);
    this.name = "ToolError";
  }
}

/**
 * Wrap tool handler with error handling
 */
export function withErrorHandling<T>(
  handler: () => Promise<T>
): Promise<T | { content: [{ type: "text"; text: string }]; isError: true }> {
  return handler().catch((error) => {
    console.error("[MCP Error]", error);

    const message = error instanceof Error ? error.message : "Unknown error occurred";

    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true as const,
    };
  });
}
```

### 7.2 Validation Errors

```typescript
// Use Zod for input validation - errors are descriptive
const input = InputSchema.safeParse(args);
if (!input.success) {
  const errors = input.error.flatten().fieldErrors;
  const message = Object.entries(errors)
    .map(([field, msgs]) => `${field}: ${msgs?.join(", ")}`)
    .join("; ");

  return {
    content: [{ type: "text", text: `Validation error: ${message}` }],
    isError: true,
  };
}
```

---

## 8. Testing Strategy

### 8.1 Test Structure

```
packages/mcp/src/
├── __tests__/
│   ├── auth.test.ts           # Auth tests with mocked DB
│   ├── tools/
│   │   ├── traces.test.ts     # Trace tools tests
│   │   ├── spans.test.ts      # Span tools tests
│   │   └── analytics.test.ts  # Analytics tools tests
│   └── lib/
│       ├── formatters.test.ts # Formatter unit tests
│       └── time.test.ts       # Time utility tests
```

### 8.2 Test Patterns

**Unit Tests (Formatters):**
```typescript
// packages/mcp/src/__tests__/lib/formatters.test.ts
import { describe, it, expect } from "vitest";
import { formatDuration, formatCost, formatTokens } from "../../lib/formatters";

describe("formatDuration", () => {
  it("formats milliseconds", () => {
    expect(formatDuration(500)).toBe("500ms");
  });

  it("formats seconds", () => {
    expect(formatDuration(2500)).toBe("2.50s");
  });

  it("formats minutes", () => {
    expect(formatDuration(125000)).toBe("2.08m");
  });

  it("handles null", () => {
    expect(formatDuration(null)).toBe("-");
  });
});

describe("formatCost", () => {
  it("formats decimal cost", () => {
    expect(formatCost(0.0234)).toBe("$0.0234");
  });
});

describe("formatTokens", () => {
  it("formats thousands", () => {
    expect(formatTokens(1500)).toBe("1.5K");
  });

  it("formats millions", () => {
    expect(formatTokens(2500000)).toBe("2.50M");
  });
});
```

**Integration Tests (Tools):**
```typescript
// packages/mcp/src/__tests__/tools/traces.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../lib/db";

// Mock Prisma
vi.mock("../../lib/db", () => ({
  prisma: {
    trace: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
    },
    span: {
      findMany: vi.fn(),
    },
  },
}));

describe("list_traces", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns formatted trace table", async () => {
    const mockTraces = [
      {
        id: "trace-1",
        serviceName: "api-service",
        rootSpanName: "POST /chat",
        durationMs: 2340,
        errorCount: 0,
        spanCount: 5,
        startTime: new Date("2025-02-04T10:00:00Z"),
        hasError: false,
      },
    ];

    (prisma.trace.findMany as any).mockResolvedValue(mockTraces);
    (prisma.trace.count as any).mockResolvedValue(1);

    // Test the tool handler directly
    const result = await listTracesHandler({ projectId: "proj-1" }, {
      limit: 20,
      timeRange: "24h",
    });

    expect(result.content[0].text).toContain("trace-1");
    expect(result.content[0].text).toContain("api-service");
    expect(result.content[0].text).toContain("POST /chat");
  });
});
```

### 8.3 Run Tests

```bash
# Run all tests
pnpm --filter @ducsigr/mcp test

# Run with coverage
pnpm --filter @ducsigr/mcp test -- --coverage

# Watch mode
pnpm --filter @ducsigr/mcp test:watch
```

---

## 9. Configuration & Distribution

### 9.1 Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DUCSIGR_API_KEY` | Yes | API key for authentication |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `API_KEY_PREFIX` | No | API key prefix (default: `co_sk_`) |
| `NODE_ENV` | No | Environment (development/production) |

### 9.2 Claude Code Configuration

```json
// ~/.claude/mcp.json
{
  "mcpServers": {
    "ducsigr": {
      "command": "npx",
      "args": ["@ducsigr/mcp"],
      "env": {
        "DUCSIGR_API_KEY": "co_sk_your_api_key_here",
        "DATABASE_URL": "postgresql://user:pass@host:5432/db"
      }
    }
  }
}
```

### 9.3 Local Development

```json
// For local development with workspace dependency
{
  "mcpServers": {
    "ducsigr": {
      "command": "node",
      "args": ["./packages/mcp/dist/index.js"],
      "env": {
        "DUCSIGR_API_KEY": "co_sk_xxx",
        "DATABASE_URL": "postgresql://postgres:postgres@localhost:5432/ducsigr"
      }
    }
  }
}
```

### 9.4 npm Publishing

```bash
# Build
pnpm --filter @ducsigr/mcp build

# Publish (from packages/mcp)
cd packages/mcp
npm publish --access public
```

---

## 10. Implementation Checklist

### Phase 1: Package Setup
- [ ] Create `packages/mcp/` directory
- [ ] Add `package.json` with dependencies
- [ ] Add `tsconfig.json`
- [ ] Add `tsup.config.ts`
- [ ] Update `pnpm-workspace.yaml` (already includes `packages/*`)
- [ ] Update `turbo.json` to include mcp build task

### Phase 2: Core Infrastructure
- [ ] Implement `src/env.ts` - Environment validation
- [ ] Implement `src/lib/db.ts` - Prisma client
- [ ] Implement `src/lib/time.ts` - Time range utilities
- [ ] Implement `src/lib/formatters.ts` - Output formatters
- [ ] Implement `src/auth.ts` - API key authentication

### Phase 3: Server Setup
- [ ] Implement `src/server.ts` - MCP server factory
- [ ] Implement `src/index.ts` - CLI entry point
- [ ] Test stdio transport locally

### Phase 4: Debugging Tools
- [ ] Implement `list_traces` tool
- [ ] Implement `get_trace` tool
- [ ] Implement `get_error_traces` tool
- [ ] Implement `search_spans` tool
- [ ] Write tests for trace tools

### Phase 5: Analytics Tools
- [ ] Implement `get_cost_summary` tool
- [ ] Implement `get_trace_stats` tool
- [ ] Implement `list_projects` tool
- [ ] Write tests for analytics tools

### Phase 6: Testing & Documentation
- [ ] Write unit tests for formatters
- [ ] Write integration tests with mocked Prisma
- [ ] Create `README.md` with setup instructions
- [ ] Test with Claude Code locally

### Phase 7: Publishing (Future)
- [ ] Configure npm publishing
- [ ] Add CI/CD for publishing
- [ ] Add to documentation site

---

## Appendix A: Server Entry Point

```typescript
// packages/mcp/src/index.ts
import { createServer } from "./server";

async function main() {
  try {
    const server = await createServer();
    console.error("[Ducsigr MCP] Server started successfully");

    // Handle graceful shutdown
    process.on("SIGINT", async () => {
      console.error("[Ducsigr MCP] Shutting down...");
      process.exit(0);
    });
  } catch (error) {
    console.error("[Ducsigr MCP] Failed to start:", error);
    process.exit(1);
  }
}

main();
```

```typescript
// packages/mcp/src/server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { authenticateApiKey, initApiKeyConfig } from "./auth";
import { registerAllTools } from "./tools";

export async function createServer(): Promise<McpServer> {
  // Initialize API key config
  initApiKeyConfig();

  // Authenticate
  const apiKey = process.env.DUCSIGR_API_KEY;
  const auth = await authenticateApiKey(apiKey);

  if (!auth.success) {
    throw new Error(`Authentication failed: ${auth.error}`);
  }

  const projectId = auth.projectId!;

  // Create MCP server
  const server = new McpServer({
    name: "ducsigr",
    version: "0.1.0",
  });

  // Register all tools
  registerAllTools(server, projectId);

  // Connect via stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);

  return server;
}
```

---

## Appendix B: Time Range Utilities

```typescript
// packages/mcp/src/lib/time.ts

const TIME_RANGE_MS: Record<string, number> = {
  "1h": 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

/**
 * Parse time range string to Date
 */
export function parseTimeRange(range: string): Date {
  const ms = TIME_RANGE_MS[range];
  if (!ms) {
    throw new Error(`Invalid time range: ${range}`);
  }
  return new Date(Date.now() - ms);
}

/**
 * Calculate percentiles from sorted array
 */
export function calculatePercentiles(
  values: number[],
  percentiles: number[]
): Record<string, number> {
  if (values.length === 0) {
    return Object.fromEntries(percentiles.map((p) => [`p${p}`, 0]));
  }

  const result: Record<string, number> = {};
  for (const p of percentiles) {
    const index = Math.ceil((p / 100) * values.length) - 1;
    result[`p${p}`] = values[Math.max(0, index)] ?? 0;
  }

  return result;
}
```

---

**End of Engineering Specification**
