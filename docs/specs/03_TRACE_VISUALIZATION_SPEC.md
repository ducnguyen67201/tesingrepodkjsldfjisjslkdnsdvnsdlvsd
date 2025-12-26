# Engineering Specification: Trace Visualization

**Status:** Draft
**Version:** 1.2
**Date:** 2025-11-29
**Epic:** Trace Visualization - Enable debugging through visual trace exploration

---

## Table of Contents

1. [Overview](#1-overview)
2. [Current State Analysis](#2-current-state-analysis)
3. [Span Types & Flexibility](#3-span-types--flexibility)
4. [Architecture](#4-architecture)
5. [URL Structure & Routing](#5-url-structure--routing)
6. [Database Design](#6-database-design)
7. [API Design](#7-api-design)
8. [Security Considerations](#8-security-considerations)
9. [UI Components](#9-ui-components)
10. [Waterfall View Design](#10-waterfall-view-design)
11. [Span Detail Panel](#11-span-detail-panel)
12. [Error Highlighting](#12-error-highlighting)
13. [Filtering & Search](#13-filtering--search)
14. [Performance Optimization](#14-performance-optimization)
15. [Data Retention](#15-data-retention)
16. [Implementation Plan](#16-implementation-plan)
17. [Future Extensibility](#17-future-extensibility)
18. [Testing Checklist](#18-testing-checklist)
19. [Architecture Decision Records](#19-architecture-decision-records)

---

## Sub issues 
- docs/specs/trace-viz/70_SPRINT_1_INFRASTRUCTURE_SPEC.md
- docs/specs/trace-viz/71_SPRINT_2_WATERFALL_SPEC.md 
- docs/specs/trace-viz/72_SPRINT_3_FILTERING_SPEC.md
- docs/specs/trace-viz/73_SPRINT_4_PERFORMANCE_SPEC.md

## 1. Overview

Ducsigr is a **general-purpose observability platform** that collects and visualizes traces from any application. While it has first-class support for LLM/AI workloads, it is designed to handle **all types of spans** including logs, function calls, HTTP requests, database queries, and custom operations.

### 1.1 Goals

- Enable visual debugging of **any operation** through trace exploration
- Provide waterfall view for understanding timing and span hierarchy
- Surface span details including inputs, outputs, and type-specific metadata
- Highlight errors and warnings for quick issue identification
- Support multiple span types (LLM, LOG, FUNCTION, HTTP, DB, CUSTOM)
- Build scalable foundation for future features (real-time, distributed tracing)

### 1.2 Non-Goals (v1)

- Real-time streaming of in-progress traces
- Distributed tracing across multiple services
- Trace comparison side-by-side
- Custom dashboards/alerting
- Full-text search on span input/output content

### 1.3 Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Navigation clicks | < 3 | Project → Traces → Detail |
| Waterfall render time | < 500ms | 100+ spans |
| Error visibility | Immediate | No scrolling required |
| API latency (p95) | < 200ms | List and detail queries |
| Error rate | < 0.1% | All trace endpoints |
| Span type coverage | 100% | All types render correctly |

---

## 2. Current State Analysis

### 2.1 Existing Infrastructure

| Component | Status | Location |
|-----------|--------|----------|
| Trace/Span DB Schema | Complete | `packages/db/prisma/schema.prisma` |
| Proto Definitions | Complete | `proto/ducsigr/v1/trace.proto` |
| Ingest Service | Complete | `apps/ingest/` (Go, port 8080) |
| Worker Processing | Complete | `apps/worker/` (queue → DB) |
| tRPC Trace Router | Complete | `packages/api/src/routers/traces.ts` |
| Basic Trace Detail Page | Partial | `apps/web/.../traces/[traceId]/page.tsx` |

### 2.2 Current Data Model

```prisma
model Trace {
  id        String   @id @default(cuid())
  projectId String
  name      String
  timestamp DateTime @default(now())
  metadata  Json?
  spans     Span[]

  @@index([projectId])
  @@index([timestamp])
}

model Span {
  id               String    @id
  traceId          String
  parentSpanId     String?          // Hierarchical relationship
  name             String
  startTime        DateTime
  endTime          DateTime?
  input            Json?
  output           Json?
  metadata         Json?
  model            String?          // LLM model name
  modelParameters  Json?
  promptTokens     Int?
  completionTokens Int?
  totalTokens      Int?
  level            SpanLevel        // DEBUG | DEFAULT | WARNING | ERROR
  statusMessage    String?
}
```

### 2.3 Current API Endpoints

| Endpoint | Description | Status |
|----------|-------------|--------|
| `traces.list` | Paginated trace list with metrics | Complete |
| `traces.get` | Single trace with all spans | Complete |

### 2.4 Gaps to Address

1. **No dedicated traces page** - Currently embedded in project detail
2. **Basic hierarchy view** - Needs proper waterfall visualization
3. **No span detail panel** - Input/output shown inline only
4. **No filtering** - Can't filter by level, type, duration
5. **No error highlighting** - Errors not visually prominent
6. **No time-based queries** - Can't filter by date range
7. **Missing database indexes** - Compound indexes needed for performance
8. **No security documentation** - Authorization flows not specified
9. **No span type field** - Currently uses `model` field for LLM spans only

---

## 3. Span Types & Flexibility

### 3.1 Design Philosophy

Ducsigr treats **all spans equally** in terms of visualization and hierarchy. The span type determines:
- Which **icon** is displayed in the waterfall view
- Which **detail sections** are shown in the span panel
- Which **filters** are available
- Which **metrics** are aggregated

### 3.2 Span Type Taxonomy

| Type | Description | Key Fields | Icon |
|------|-------------|------------|------|
| `LLM` | AI/ML model calls | `model`, `promptTokens`, `completionTokens`, `totalTokens`, `modelParameters` | Brain/Sparkles |
| `LOG` | Log entries/events | `level`, `message` | FileText |
| `FUNCTION` | Function/method calls | `input`, `output` | Code |
| `HTTP` | HTTP requests | `method`, `url`, `statusCode` | Globe |
| `DB` | Database queries | `query`, `rowCount` | Database |
| `CUSTOM` | User-defined spans | Flexible via `metadata` | Box |

### 3.3 Schema Enhancement (Proposed)

Add a `type` field to the Span model for explicit categorization:

```prisma
enum SpanType {
  LLM        // AI/ML model calls
  LOG        // Log entries
  FUNCTION   // Function calls
  HTTP       // HTTP requests
  DB         // Database queries
  CUSTOM     // User-defined
}

model Span {
  // ... existing fields

  type SpanType @default(CUSTOM)  // NEW: Span categorization

  // LLM-specific fields (only populated for type=LLM)
  model            String?
  modelParameters  Json?
  promptTokens     Int?
  completionTokens Int?
  totalTokens      Int?

  // HTTP-specific fields (stored in metadata for now)
  // Future: httpMethod, httpUrl, httpStatusCode

  @@index([type])  // Filter by type
}
```

**Migration Strategy:**
1. Add `type` field with default `CUSTOM`
2. Backfill: Set `type = LLM` where `model IS NOT NULL`
3. Update ingest service to accept `type` from SDK

### 3.4 Backward Compatibility

Until `type` field is added:
- **Infer type** from existing fields:
  - `model` is set → `LLM`
  - `level` is DEBUG with no model → `LOG`
  - Otherwise → `CUSTOM`

```typescript
// lib/traces/infer-span-type.ts
function inferSpanType(span: Span): SpanType {
  if (span.model) return 'LLM';
  if (span.metadata?.httpMethod) return 'HTTP';
  if (span.metadata?.query) return 'DB';
  if (span.level === 'DEBUG' && !span.model) return 'LOG';
  return 'CUSTOM';
}
```

### 3.5 Type-Specific Detail Rendering

The `SpanDetailPanel` renders different sections based on span type:

| Section | LLM | LOG | FUNCTION | HTTP | DB | CUSTOM |
|---------|-----|-----|----------|------|-----|--------|
| Timing | Yes | Yes | Yes | Yes | Yes | Yes |
| Input/Output | Yes | - | Yes | Yes | Yes | Yes |
| Token Usage | Yes | - | - | - | - | - |
| Model Info | Yes | - | - | - | - | - |
| HTTP Details | - | - | - | Yes | - | - |
| Query Details | - | - | - | - | Yes | - |
| Log Message | - | Yes | - | - | - | - |
| Metadata | Yes | Yes | Yes | Yes | Yes | Yes |
| Status Message | Yes | Yes | Yes | Yes | Yes | Yes |

### 3.6 Type-Specific Icons & Colors

```typescript
// components/traces/span-type-config.ts

export const SPAN_TYPE_CONFIG = {
  LLM: {
    icon: Sparkles,
    color: 'text-purple-500',
    bgColor: 'bg-purple-100 dark:bg-purple-900/30',
    label: 'LLM',
  },
  LOG: {
    icon: FileText,
    color: 'text-gray-500',
    bgColor: 'bg-gray-100 dark:bg-gray-800',
    label: 'Log',
  },
  FUNCTION: {
    icon: Code,
    color: 'text-blue-500',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    label: 'Function',
  },
  HTTP: {
    icon: Globe,
    color: 'text-green-500',
    bgColor: 'bg-green-100 dark:bg-green-900/30',
    label: 'HTTP',
  },
  DB: {
    icon: Database,
    color: 'text-orange-500',
    bgColor: 'bg-orange-100 dark:bg-orange-900/30',
    label: 'Database',
  },
  CUSTOM: {
    icon: Box,
    color: 'text-slate-500',
    bgColor: 'bg-slate-100 dark:bg-slate-800',
    label: 'Custom',
  },
} as const;
```

---

## 4. Architecture

### 4.1 Data Flow (Current - No Changes Needed)

```
SDK/Application
       ↓
POST /v1/traces (Ingest Service, Go, Port 8080)
       ↓
Redis Queue (ducsigr:traces)
       ↓
Worker Service (Node.js, processes queue)
       ↓
PostgreSQL (Trace + Span tables)
       ↓
tRPC API (traces.list, traces.get)
       ↓
React UI (Next.js, Port 3000)
```

### 4.2 Service Interface (Hexagonal Architecture)

Define clear ports for trace queries to decouple from implementation:

```typescript
// packages/api/src/services/trace-service.ts

interface TraceQueryService {
  // Queries (reads)
  listTraces(
    projectId: string,
    filter: TraceFilter,
    pagination: Pagination
  ): Promise<PaginatedResult<TraceListItem>>;

  getTraceDetail(traceId: string): Promise<TraceDetail>;

  getSpanDetail(spanId: string): Promise<SpanDetail>;
}

// Adapter implementation
class PrismaTraceQueryService implements TraceQueryService {
  constructor(private prisma: PrismaClient) {}

  async listTraces(...) { /* Prisma implementation */ }
}
```

### 4.3 Component Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Traces Page Layout                           │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  FilterBar: Level | Model | Duration | Date Range       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  TracesTable: Sortable, Paginated List                  │   │
│  │  [Name] [Timestamp] [Spans] [Duration] [Tokens] [Status]│   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                  Trace Detail Page Layout                       │
├──────────────────────────────────┬──────────────────────────────┤
│        Waterfall View (60%)      │    Span Detail Panel (40%)   │
│  ┌────────────────────────────┐  │  ┌────────────────────────┐  │
│  │ Timeline Header            │  │  │ Selected Span Name     │  │
│  │ ├─ Span A ████████░░░     │  │  │ ──────────────────────│  │
│  │ │  ├─ Span B  ██████░     │  │  │ Metadata               │  │
│  │ │  └─ Span C   ████░░     │  │  │ Input (collapsible)    │  │
│  │ └─ Span D        ██████   │  │  │ Output (collapsible)   │  │
│  └────────────────────────────┘  │  │ Token Usage            │  │
│                                  │  │ Timing Details         │  │
│                                  │  └────────────────────────┘  │
└──────────────────────────────────┴──────────────────────────────┘
```

### 4.4 State Management

```typescript
// URL-driven state (query params)
interface TracesPageState {
  // Filter state (persisted in URL)
  level?: SpanLevel[];           // ?level=ERROR,WARNING
  type?: SpanType[];             // ?type=LLM,HTTP (NEW)
  model?: string[];              // ?model=gpt-4,claude-3 (LLM-specific)
  minDuration?: number;          // ?minDuration=1000 (ms)
  maxDuration?: number;          // ?maxDuration=5000 (ms)
  from?: string;                 // ?from=2025-01-01
  to?: string;                   // ?to=2025-01-31

  // Pagination
  cursor?: string;               // ?cursor=clx123...
}

// Local state (React)
interface TraceDetailState {
  selectedSpanId: string | null; // Currently selected span
  expandedSpans: Set<string>;    // Collapsed/expanded spans
  timelineZoom: number;          // Zoom level (1-10)
}
```

---

## 4. URL Structure & Routing

### 4.1 Recommended URL Pattern

```
/workspace/[workspaceSlug]/projects/[projectId]/traces
/workspace/[workspaceSlug]/projects/[projectId]/traces/[traceId]
```

**Rationale:**
- Traces belong to a project context
- Consistent with existing `/projects/[projectId]/settings`
- Enables breadcrumb navigation: Workspace → Project → Traces → Detail
- Query params for filtering: `?level=ERROR&model=gpt-4`

### 4.2 Route Files

```
apps/web/src/app/workspace/[workspaceSlug]/projects/[projectId]/
├── page.tsx                    # Project overview (existing)
├── settings/page.tsx           # Project settings (existing)
└── traces/
    ├── page.tsx               # NEW: Traces list with filters
    └── [traceId]/
        └── page.tsx           # ENHANCE: Waterfall view + detail panel
```

### 4.3 Navigation Updates

Update sidebar/breadcrumbs to include:
- Project nav item should show "Traces" sub-item
- Trace count badge on project card (already exists)

---

## 5. Database Design

### 5.1 Required Indexes (Phase 1 - Add Immediately)

These indexes are **critical** for performance and must be added before implementation:

```prisma
model Trace {
  id        String   @id @default(cuid())
  projectId String
  name      String
  timestamp DateTime @default(now())
  metadata  Json?
  spans     Span[]

  // REQUIRED: Compound index for paginated list query
  @@index([projectId, timestamp(sort: Desc)])

  // REQUIRED: Cursor-based pagination
  @@index([projectId, id])

  // Existing (keep)
  @@index([projectId])
  @@index([timestamp])
}

model Span {
  id               String    @id
  traceId          String
  parentSpanId     String?
  name             String
  startTime        DateTime
  endTime          DateTime?
  // ... other fields

  // REQUIRED: Waterfall ordering
  @@index([traceId, startTime])
}
```

**Migration file:** `packages/db/prisma/migrations/XXXXXX_add_trace_indexes/migration.sql`

```sql
-- Add compound index for trace list query
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Trace_projectId_timestamp_idx"
ON "Trace" ("projectId", "timestamp" DESC);

-- Add cursor pagination index
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Trace_projectId_id_idx"
ON "Trace" ("projectId", "id");

-- Add span ordering index
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Span_traceId_startTime_idx"
ON "Span" ("traceId", "startTime");
```

### 5.2 Future Indexes (Add When Filtering Becomes Slow)

```prisma
model Span {
  // Add when server-side filtering needed (>1000 traces)
  @@index([level])                // Filter errors/warnings
  @@index([model])                // Filter by LLM model
}
```

### 5.3 Query Optimization Strategy

| Phase | Trigger | Action |
|-------|---------|--------|
| Phase 1 (v1) | Launch | Client-side filtering, fetch traces then filter |
| Phase 2 | >1000 traces/project | Server-side filtering with WHERE clauses |
| Phase 3 | >10,000 traces/project | Pre-computed aggregates on Trace model |
| Phase 4 | >100,000 traces/project | Time-series partitioning |

### 5.4 Query Timeout Configuration

All trace queries must have timeouts to prevent runaway queries:

```typescript
// packages/api/src/lib/query-utils.ts

const QUERY_TIMEOUTS = {
  LIST: 5_000,      // 5 seconds for list queries
  DETAIL: 10_000,   // 10 seconds for detail with all spans
  SPAN: 3_000,      // 3 seconds for single span
} as const;

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  context: string
): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new TRPCError({
        code: 'TIMEOUT',
        message: `${context} timed out after ${ms}ms`
      })),
      ms
    )
  );
  return Promise.race([promise, timeout]);
}

// Usage in router
const traces = await withTimeout(
  prisma.trace.findMany({ where: { projectId }, ... }),
  QUERY_TIMEOUTS.LIST,
  'traces.list'
);
```

---

## 6. API Design

### 6.1 Error Response Schema

All trace endpoints use a consistent error response format:

```typescript
// packages/api/src/lib/errors.ts

interface ApiError {
  error: {
    code: string;           // Machine-readable: "TRACE_NOT_FOUND"
    message: string;        // Human-readable description
    details?: ErrorDetail[];
    requestId: string;      // For debugging/support
  };
}

interface ErrorDetail {
  field?: string;
  code: string;
  message: string;
}

// Trace-specific error codes
const TRACE_ERROR_CODES = {
  TRACE_NOT_FOUND: { status: 404, message: 'Trace not found' },
  SPAN_NOT_FOUND: { status: 404, message: 'Span not found' },
  INVALID_FILTER: { status: 400, message: 'Invalid filter parameters' },
  QUERY_TIMEOUT: { status: 408, message: 'Query timed out' },
  INVALID_CURSOR: { status: 400, message: 'Invalid pagination cursor' },
} as const;
```

### 6.2 Enhanced `traces.list` Query

```typescript
// packages/api/src/routers/traces.ts

const listInputSchema = z.object({
  workspaceSlug: z.string(),
  projectId: z.string(),

  // Pagination
  limit: z.number().min(1).max(100).default(50),
  cursor: z.string().max(100).optional(),  // Max length for security

  // Filters (Phase 2)
  levels: z.array(SpanLevelSchema).optional(),
  models: z.array(z.string().max(50)).optional(),
  minDuration: z.number().min(0).max(3600000).optional(),  // Max 1 hour
  maxDuration: z.number().min(0).max(3600000).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

// Output includes hasErrors flag for quick identification
const TraceListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  timestamp: z.string(),
  spanCount: z.number(),
  totalTokens: z.number().nullable(),
  duration: z.number().nullable(),         // milliseconds
  hasErrors: z.boolean(),                  // NEW: true if any span has ERROR level
  hasWarnings: z.boolean(),                // NEW: true if any span has WARNING level
  primaryModel: z.string().nullable(),     // NEW: most common model in trace
});

const listOutputSchema = z.object({
  items: z.array(TraceListItemSchema),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});
```

### 6.3 Enhanced `traces.get` Query

```typescript
const TraceDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  timestamp: z.string(),
  metadata: z.unknown(),

  // Summary stats
  spanCount: z.number(),
  totalTokens: z.number().nullable(),
  duration: z.number().nullable(),
  errorCount: z.number(),
  warningCount: z.number(),

  // Spans with computed fields (without large input/output)
  spans: z.array(SpanItemSchema),
});

const SpanItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  parentSpanId: z.string().nullable(),
  startTime: z.string(),
  endTime: z.string().nullable(),
  duration: z.number().nullable(),

  // Offset for waterfall positioning
  offsetFromTraceStart: z.number(),

  // Span categorization
  type: SpanTypeSchema,                  // NEW: LLM | LOG | FUNCTION | HTTP | DB | CUSTOM

  // LLM-specific fields (only for type=LLM)
  model: z.string().nullable(),
  promptTokens: z.number().nullable(),
  completionTokens: z.number().nullable(),
  totalTokens: z.number().nullable(),

  level: SpanLevelSchema,
  statusMessage: z.string().nullable(),

  // NOTE: input/output NOT included here - use getSpanDetail for full content
});
```

### 6.4 New `traces.getSpanDetail` Query (Lazy Loading)

```typescript
// Fetch full span data only when selected
// Avoids loading large input/output for all spans upfront

const getSpanDetailInput = z.object({
  workspaceSlug: z.string(),
  projectId: z.string(),
  traceId: z.string(),
  spanId: z.string(),
});

const SpanDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  parentSpanId: z.string().nullable(),
  startTime: z.string(),
  endTime: z.string().nullable(),
  duration: z.number().nullable(),

  // Full content (can be large)
  input: z.unknown(),
  output: z.unknown(),
  metadata: z.unknown(),
  modelParameters: z.unknown(),

  // Metrics
  model: z.string().nullable(),
  promptTokens: z.number().nullable(),
  completionTokens: z.number().nullable(),
  totalTokens: z.number().nullable(),

  level: SpanLevelSchema,
  statusMessage: z.string().nullable(),
});
```

---

## 7. Security Considerations

### 7.1 Authorization

All trace endpoints require proper authorization:

```typescript
// Authorization flow for every trace endpoint
async function authorizeTraceAccess(
  ctx: Context,
  projectId: string
): Promise<void> {
  // 1. Verify user is authenticated
  if (!ctx.session?.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }

  // 2. Verify workspace membership (via workspaceMiddleware)
  // Already handled by middleware in router

  // 3. Verify project belongs to workspace
  const project = await ctx.prisma.project.findFirst({
    where: {
      id: projectId,
      workspaceId: ctx.workspace.id,
    },
  });

  if (!project) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found' });
  }
}
```

### 7.2 Input Validation

| Field | Validation | Reason |
|-------|------------|--------|
| `cursor` | Max 100 chars | Prevent buffer overflow |
| `limit` | 1-100 | Prevent DoS |
| `minDuration/maxDuration` | 0-3600000ms | Max 1 hour range |
| `from/to` | ISO 8601 datetime | Standard format |
| `models[]` | Max 50 chars each | Prevent injection |

### 7.3 Data Protection

```typescript
// Span input/output may contain PII
// Consider these protections:

interface DataProtectionConfig {
  // List view: Never show input/output content
  listView: {
    includeInput: false,
    includeOutput: false,
  };

  // Detail view: Show with explicit user action
  detailView: {
    requireExplicitFetch: true,  // Lazy load via getSpanDetail
    maxPayloadSize: 1_000_000,   // 1MB limit per span
  };

  // Future: PII masking
  piiMasking: {
    enabled: false,  // v2 feature
    patterns: ['email', 'phone', 'ssn'],
  };
}
```

### 7.4 Rate Limiting (Future)

```typescript
// Rate limits per endpoint (implement in Phase 2)
const RATE_LIMITS = {
  'traces.list': { requests: 100, window: '1m' },
  'traces.get': { requests: 200, window: '1m' },
  'traces.getSpanDetail': { requests: 500, window: '1m' },
} as const;
```

### 7.5 Audit Logging (Future)

```typescript
// Log trace access for compliance (implement when needed)
interface TraceAccessLog {
  userId: string;
  traceId: string;
  action: 'view_list' | 'view_detail' | 'view_span';
  timestamp: Date;
  ipAddress: string;
}
```

---

## 8. UI Components

### 8.1 Component Hierarchy

```
apps/web/src/
├── components/
│   └── traces/
│       ├── traces-table.tsx           # Paginated table with row click
│       ├── traces-filter-bar.tsx      # Level, model, duration, date filters
│       ├── trace-waterfall.tsx        # Main waterfall visualization
│       ├── trace-waterfall-row.tsx    # Single span row in waterfall
│       ├── trace-timeline-header.tsx  # Time scale header
│       ├── span-detail-panel.tsx      # Right panel for selected span
│       ├── span-json-viewer.tsx       # Collapsible JSON viewer
│       ├── span-token-badge.tsx       # Token count display
│       └── span-level-badge.tsx       # Color-coded level indicator
│
├── hooks/
│   └── traces/
│       ├── use-traces.ts              # List query with filters
│       ├── use-trace-detail.ts        # Single trace query
│       ├── use-span-detail.ts         # Lazy span detail fetch
│       └── use-trace-filters.ts       # URL param sync
│
└── lib/
    └── traces/
        ├── span-tree.ts               # Build hierarchy from flat list
        ├── waterfall-calc.ts          # Calculate positions/widths
        └── duration-format.ts         # Format ms/s/m/h
```

### 8.2 Component Specifications

#### TracesTable

```typescript
interface TracesTableProps {
  projectId: string;
  workspaceSlug: string;
}

// Features:
// - Sortable columns (timestamp, duration, tokens)
// - Error/warning indicators (colored dot or icon)
// - Click row → navigate to trace detail
// - Pagination controls (load more / cursor-based)
// - Empty state when no traces
// - Loading skeleton
```

#### TraceWaterfall

```typescript
interface TraceWaterfallProps {
  trace: TraceDetail;
  selectedSpanId: string | null;
  onSpanSelect: (spanId: string) => void;
  expandedSpans: Set<string>;
  onToggleExpand: (spanId: string) => void;
}

// Features:
// - Horizontal timeline with scale markers
// - Nested rows based on parent-child relationships
// - Horizontal bars showing duration relative to trace
// - Color coding by level (errors red, warnings yellow)
// - Click to select span
// - Collapse/expand children
// - Hover tooltip with quick info
```

#### SpanDetailPanel

```typescript
interface SpanDetailPanelProps {
  span: SpanDetail | null;
  isLoading: boolean;
  onClose: () => void;
}

// Sections:
// 1. Header: Name, Level badge, Model badge
// 2. Timing: Start, End, Duration (with relative to trace)
// 3. Tokens: Prompt, Completion, Total (with cost estimate?)
// 4. Input: Collapsible JSON with syntax highlighting
// 5. Output: Collapsible JSON with syntax highlighting
// 6. Metadata: Collapsible JSON
// 7. Status Message: If present (especially for errors)
```

---

## 9. Waterfall View Design

### 9.1 Visual Specification

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  0ms        200ms       400ms       600ms       800ms       1000ms          │
│  ├──────────┼──────────┼──────────┼──────────┼──────────┼──────────┤       │
├─────────────────────────────────────────────────────────────────────────────┤
│  ▼ Root Span                                                                │
│  ┌─[DEFAULT]──────────────────────────────────────────────────────────┐    │
│  │ orchestrate_request          [gpt-4]  1000ms  500 tokens           │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│    │                                                                        │
│    ├─▼ Child Span 1                                                        │
│    │ ┌─[DEFAULT]────────────────────────┐                                  │
│    │ │ llm_call_1    [gpt-4]  400ms  200│                                  │
│    │ └──────────────────────────────────┘                                  │
│    │   │                                                                    │
│    │   └─ Grandchild                                                        │
│    │     ┌─[WARNING]──────┐                                                │
│    │     │ parse_response │                                                │
│    │     └────────────────┘                                                │
│    │                                                                        │
│    └─▼ Child Span 2                                                        │
│      ┌─[ERROR]────────────────────────────────────────────┐                │
│      │ llm_call_2    [claude-3]  500ms  300 tokens        │ ← HIGHLIGHTED  │
│      └────────────────────────────────────────────────────┘                │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 9.2 Waterfall Calculations

```typescript
// lib/traces/waterfall-calc.ts

interface WaterfallSpan {
  id: string;
  name: string;
  depth: number;                    // Hierarchy depth (0 = root)
  startOffset: number;              // ms from trace start
  duration: number;                 // ms
  percentStart: number;             // 0-100% of trace duration
  percentWidth: number;             // 0-100% of trace duration
  level: SpanLevel;
  model?: string;
  tokens?: number;
  children: WaterfallSpan[];
}

function calculateWaterfall(spans: SpanItem[], traceDuration: number): WaterfallSpan[] {
  const traceStart = Math.min(...spans.map(s => new Date(s.startTime).getTime()));

  // Build tree structure
  const spanMap = new Map<string, WaterfallSpan>();
  const roots: WaterfallSpan[] = [];

  // First pass: create nodes
  for (const span of spans) {
    const startTime = new Date(span.startTime).getTime();
    const endTime = span.endTime ? new Date(span.endTime).getTime() : Date.now();
    const duration = endTime - startTime;
    const startOffset = startTime - traceStart;

    spanMap.set(span.id, {
      id: span.id,
      name: span.name,
      depth: 0,
      startOffset,
      duration,
      percentStart: (startOffset / traceDuration) * 100,
      percentWidth: Math.max((duration / traceDuration) * 100, 0.5), // Min 0.5% visible
      level: span.level,
      model: span.model,
      tokens: span.totalTokens,
      children: [],
    });
  }

  // Second pass: build hierarchy
  for (const span of spans) {
    const node = spanMap.get(span.id)!;
    if (span.parentSpanId && spanMap.has(span.parentSpanId)) {
      const parent = spanMap.get(span.parentSpanId)!;
      node.depth = parent.depth + 1;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

// Flatten for rendering (DFS order)
function flattenWaterfall(roots: WaterfallSpan[]): WaterfallSpan[] {
  const result: WaterfallSpan[] = [];

  function traverse(node: WaterfallSpan) {
    result.push(node);
    for (const child of node.children.sort((a, b) => a.startOffset - b.startOffset)) {
      traverse(child);
    }
  }

  for (const root of roots.sort((a, b) => a.startOffset - b.startOffset)) {
    traverse(root);
  }

  return result;
}
```

### 9.3 Styling Constants

```typescript
// components/traces/waterfall-constants.ts

export const WATERFALL = {
  ROW_HEIGHT: 40,                   // px
  INDENT_PER_LEVEL: 20,             // px per depth level
  BAR_HEIGHT: 24,                   // px
  MIN_BAR_WIDTH: 4,                 // px (minimum visible width)

  COLORS: {
    DEBUG: 'bg-gray-200 dark:bg-gray-700',
    DEFAULT: 'bg-blue-500 dark:bg-blue-600',
    WARNING: 'bg-yellow-500 dark:bg-yellow-600',
    ERROR: 'bg-red-500 dark:bg-red-600',
  },

  BORDER_COLORS: {
    DEBUG: 'border-gray-400',
    DEFAULT: 'border-blue-600',
    WARNING: 'border-yellow-600',
    ERROR: 'border-red-600',
  },
} as const;
```

---

## 10. Span Detail Panel

### 10.1 Layout Specification

```
┌─────────────────────────────────────────────────────────────┐
│  ✕                                    [Copy] [View Raw]     │ ← Header actions
├─────────────────────────────────────────────────────────────┤
│  llm_call_2                                                 │
│  ┌─────────┐ ┌─────────────┐                               │
│  │ ERROR   │ │ claude-3    │                               │
│  └─────────┘ └─────────────┘                               │
├─────────────────────────────────────────────────────────────┤
│  TIMING                                                     │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Start:     10:23:45.123                              │   │
│  │ End:       10:23:45.623                              │   │
│  │ Duration:  500ms                                     │   │
│  │ Offset:    +200ms from trace start                   │   │
│  └─────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│  TOKENS                                                     │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Prompt:      150                                     │   │
│  │ Completion:  150                                     │   │
│  │ Total:       300                                     │   │
│  └─────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│  ▼ INPUT                                              [Copy]│
│  ┌─────────────────────────────────────────────────────┐   │
│  │ {                                                    │   │
│  │   "messages": [                                      │   │
│  │     { "role": "user", "content": "Hello..." }       │   │
│  │   ],                                                 │   │
│  │   "temperature": 0.7                                 │   │
│  │ }                                                    │   │
│  └─────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│  ▼ OUTPUT                                             [Copy]│
│  ┌─────────────────────────────────────────────────────┐   │
│  │ {                                                    │   │
│  │   "choices": [...]                                   │   │
│  │ }                                                    │   │
│  └─────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│  ▶ METADATA                                            [Copy]│ ← Collapsed by default
├─────────────────────────────────────────────────────────────┤
│  STATUS MESSAGE                                             │ ← Only if present
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Rate limit exceeded. Retrying in 5 seconds...       │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 10.2 JSON Viewer Component

```typescript
// components/traces/span-json-viewer.tsx

interface JsonViewerProps {
  data: unknown;
  maxHeight?: number;              // Default 300px
  defaultExpanded?: boolean;       // Default true for input/output
  onCopy?: () => void;
}

// Features:
// - Syntax highlighting (use shiki or prism)
// - Collapsible objects/arrays
// - Line numbers
// - Copy button
// - Search within JSON (future)
// - Max height with scroll
```

---

## 11. Error Highlighting

### 11.1 Error Visibility Strategy

**Goal:** Errors should be impossible to miss.

| Location | Error Indication |
|----------|------------------|
| Traces Table | Red dot + "Error" badge in status column |
| Waterfall Row | Red background, red border, error icon |
| Span Detail | Red header background, prominent status message |
| Timeline | Red marker at error span position |

### 11.2 Visual Hierarchy

```
ERROR   → Red (500/600) background, destructive styling
WARNING → Yellow (500/600) background, warning icon
DEFAULT → Blue (500/600) background, neutral
DEBUG   → Gray (200/700) background, muted
```

### 11.3 Error Aggregation

```typescript
// In trace list, show aggregated error info
interface TraceListItem {
  // ... existing fields
  hasErrors: boolean;
  hasWarnings: boolean;
  errorCount: number;              // Quick scan of trace health

  // Optional: First error message preview
  firstErrorMessage?: string;
}
```

### 11.4 Jump to First Error

```typescript
// Auto-scroll to first error span when opening trace detail
function useScrollToFirstError(spans: SpanItem[]) {
  useEffect(() => {
    const firstError = spans.find(s => s.level === 'ERROR');
    if (firstError) {
      const element = document.getElementById(`span-${firstError.id}`);
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [spans]);
}
```

---

## 12. Filtering & Search

### 12.1 Filter UI (v1 - Client-Side)

```typescript
interface TracesFilters {
  // Level filter (multi-select)
  levels: SpanLevel[];             // ["ERROR", "WARNING"]

  // Span type filter (multi-select) - NEW
  types: SpanType[];               // ["LLM", "HTTP", "DB"]

  // Model filter (multi-select, LLM-specific)
  models: string[];                // ["gpt-4", "claude-3"]

  // Duration range
  minDuration: number | null;      // ms
  maxDuration: number | null;      // ms

  // Date range
  from: Date | null;
  to: Date | null;
}
```

### 12.2 Filter Bar Component

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ Type: [All ▼]  Level: [All ▼]  Model: [All ▼]  Duration: [Any ▼]  Date: [7 days ▼]  │
│                                                                                      │
│ Active filters: [LLM ✕] [HTTP ✕] [ERROR ✕] [gpt-4 ✕]               [Clear all]      │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

**Filter Logic:**
- `Type` filter: Show spans of selected types
- `Model` filter: Only applies when `LLM` type is included (or all types)
- Filters are AND-ed together

### 12.3 URL Sync

```typescript
// Persist filters in URL for shareability
// /workspace/acme/projects/proj_123/traces?type=LLM,HTTP&level=ERROR&model=gpt-4

function useTracesFilters() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const filters = useMemo(() => ({
    types: searchParams.get('type')?.split(',') ?? [],
    levels: searchParams.get('level')?.split(',') ?? [],
    models: searchParams.get('model')?.split(',') ?? [],
    minDuration: searchParams.get('minDuration')
      ? parseInt(searchParams.get('minDuration')!)
      : null,
    // ... etc
  }), [searchParams]);

  const setFilters = useCallback((newFilters: Partial<TracesFilters>) => {
    const params = new URLSearchParams(searchParams);
    // Update params...
    router.push(`?${params.toString()}`);
  }, [searchParams, router]);

  return { filters, setFilters };
}
```

### 12.4 Quick Filters

Pre-defined filter combinations for common use cases:

| Quick Filter | Applied Filters |
|--------------|-----------------|
| "Errors Only" | `level=ERROR` |
| "LLM Calls" | `type=LLM` |
| "HTTP Requests" | `type=HTTP` |
| "Database Queries" | `type=DB` |
| "Slow Traces" | `minDuration=5000` (>5s) |
| "Recent Errors" | `level=ERROR&from=<24h ago>` |
| "LLM Errors" | `type=LLM&level=ERROR` |
| "High Token Usage" | `type=LLM&minTokens=1000` (v2) |

---

## 13. Performance Optimization

### 13.1 Data Loading Strategy

| Data | Strategy | Rationale |
|------|----------|-----------|
| Trace List | Cursor pagination (50/page) | Efficient for large lists |
| Trace Detail | Full fetch (spans without input/output) | Typically <100 spans |
| Span Input/Output | Lazy load on selection | Can be large (MB) |
| Waterfall Positions | Client-side calculation | Fast, no server roundtrip |

### 13.2 Virtualization (When Needed)

```typescript
// For traces with 100+ spans, virtualize the waterfall
// Use @tanstack/react-virtual or similar

function VirtualizedWaterfall({ spans }: { spans: WaterfallSpan[] }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: spans.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => WATERFALL.ROW_HEIGHT,
    overscan: 10,
  });

  return (
    <div ref={parentRef} style={{ height: '100%', overflow: 'auto' }}>
      <div style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((virtualRow) => (
          <WaterfallRow
            key={spans[virtualRow.index].id}
            span={spans[virtualRow.index]}
            style={{
              position: 'absolute',
              top: virtualRow.start,
              height: virtualRow.size,
            }}
          />
        ))}
      </div>
    </div>
  );
}
```

### 13.3 Caching Strategy

```typescript
// Use React Query / tRPC's built-in caching

const traceListQueryOptions = {
  staleTime: 30_000,               // Consider fresh for 30s
  gcTime: 5 * 60_000,              // Keep in cache for 5min
  refetchOnWindowFocus: false,     // Don't refetch on tab focus
};

// Trace detail - slightly longer cache
const traceDetailQueryOptions = {
  staleTime: 60_000,               // Fresh for 1 minute
  gcTime: 10 * 60_000,             // Keep for 10 minutes
};

// Span detail - immutable, cache forever
const spanDetailQueryOptions = {
  staleTime: Infinity,             // Never stale (spans don't change)
  gcTime: 10 * 60_000,             // Keep in cache for 10min
};
```

### 13.4 Cache Invalidation Rules

| Event | Invalidation |
|-------|--------------|
| New trace ingested | Invalidate project's trace list |
| Navigate away | Keep cache (user may return) |
| Manual refresh | Invalidate current query |
| 5 minutes elapsed | Mark stale, refetch on next access |

### 13.5 Bundle Optimization

- Code-split the trace detail page (dynamic import)
- Lazy load JSON syntax highlighter
- Use lightweight alternatives (e.g., `react-json-view-lite` vs full `react-json-view`)
- Target bundle size: <50KB for trace components

---

## 14. Data Retention

### 14.1 Default Retention Policy

| Data Age | Status | Action |
|----------|--------|--------|
| 0-90 days | Active | Full access |
| 90-365 days | Archived | Read-only, slower queries |
| >365 days | Deleted | Permanently removed |

### 14.2 Implementation

```typescript
// Future: Add to Trace model
model Trace {
  // ... existing fields
  expiresAt DateTime?  // Calculated: timestamp + retention period
}

// Background job for cleanup
async function cleanupExpiredTraces() {
  // Soft delete first
  await prisma.trace.updateMany({
    where: {
      expiresAt: { lt: new Date() },
      deletedAt: null,
    },
    data: { deletedAt: new Date() },
  });

  // Hard delete after 30 days
  const hardDeleteBefore = subDays(new Date(), 30);
  await prisma.trace.deleteMany({
    where: {
      deletedAt: { lt: hardDeleteBefore },
    },
  });
}
```

### 14.3 Project-Level Configuration (Future)

```typescript
// Allow projects to customize retention
interface ProjectSettings {
  traceRetentionDays: number;  // Default: 90
  archiveAfterDays: number;    // Default: 90
  deleteAfterDays: number;     // Default: 365
}
```

---

## 15. Implementation Plan

### Phase 0: Infrastructure (Prerequisites)

**Must complete before any feature work:**

- [ ] Add database index migration (Section 5.1)
- [ ] Add query timeout utility (Section 5.4)
- [ ] Set up error response schema (Section 6.1)
- [ ] Verify authorization middleware covers new routes

### Phase 1: Core Traces Page

- [ ] Create `/workspace/[ws]/projects/[pid]/traces/page.tsx`
- [ ] Create `TracesTable` component with pagination
- [ ] Add navigation link from project page
- [ ] Add `hasErrors` and `hasWarnings` to trace list API
- [ ] Basic error indication in table (red dot)
- [ ] Empty state and loading skeleton

### Phase 2: Enhanced Trace Detail (Waterfall)

- [ ] Refactor existing trace detail page layout
- [ ] Implement `TraceWaterfall` component
- [ ] Create waterfall calculation utilities
- [ ] Add timeline header with scale
- [ ] Implement span selection (click to select)
- [ ] Add collapse/expand for span children

### Phase 3: Span Detail Panel

- [ ] Create `SpanDetailPanel` component
- [ ] Create `traces.getSpanDetail` tRPC endpoint
- [ ] Add collapsible JSON viewer component
- [ ] Add copy functionality for JSON sections
- [ ] Show status message prominently for errors

### Phase 4: Filtering & Polish

- [ ] Create `TracesFilterBar` component
- [ ] Implement URL param sync for filters
- [ ] Add quick filter presets
- [ ] Add "jump to first error" functionality
- [ ] Loading states and empty states refinement
- [ ] Keyboard navigation support

### Phase 5: Optimization (As Needed)

- [ ] Add virtualization for traces with 100+ spans
- [ ] Optimize bundle size (<50KB target)
- [ ] Add server-side filtering (when >1000 traces)
- [ ] Implement read replica routing (when >10k traces)

---

## 16. Future Extensibility

### 16.1 Prepared-For Features

| Feature | How We're Preparing |
|---------|---------------------|
| Real-time traces | State structure supports streaming updates |
| Distributed tracing | `parentSpanId` can reference spans in other traces |
| Trace comparison | Waterfall component can be reused side-by-side |
| Custom dashboards | Filter/aggregation queries are reusable |
| Export | Trace detail includes all data needed for export |

### 16.2 Schema Evolution

```prisma
// Potential future additions (NOT adding now)

model Trace {
  // ... existing

  // Aggregated metrics (denormalized for speed)
  errorCount      Int?              // Pre-computed
  warningCount    Int?
  totalDuration   Int?              // ms

  // Distributed tracing
  parentTraceId   String?           // Link to parent trace
  rootTraceId     String?           // Original trace in chain

  // Tags for filtering
  tags            String[]          // ["production", "user:123"]

  // Retention
  expiresAt       DateTime?
  deletedAt       DateTime?
}

model Span {
  // ... existing

  // Links to other spans/traces
  links           SpanLink[]

  // Events within span
  events          SpanEvent[]
}
```

### 16.3 API Evolution Path

```typescript
// v2 additions (backwards compatible)
traces.list({
  // v1 fields...

  // v2: Advanced filtering
  tags: ["production"],
  hasError: true,

  // v2: Aggregations
  groupBy: "hour",                 // Returns bucketed counts

  // v2: Full-text search
  search: "timeout error",
});

traces.compare({
  traceIds: ["trace_1", "trace_2"],
});

traces.export({
  traceId: "trace_1",
  format: "json" | "otlp",
});
```

---

## 17. Testing Checklist

### 17.1 Unit Tests

- [ ] `calculateWaterfall` returns correct positions
- [ ] `flattenWaterfall` maintains DFS order
- [ ] Duration formatting (ms, s, m, h)
- [ ] Filter URL param serialization/deserialization
- [ ] Query timeout wrapper behavior
- [ ] Error code mapping

### 17.2 Component Tests

- [ ] TracesTable renders empty state
- [ ] TracesTable renders traces with correct columns
- [ ] TracesTable shows error indicators correctly
- [ ] WaterfallRow renders at correct position
- [ ] WaterfallRow shows correct color for each level
- [ ] SpanDetailPanel shows all sections
- [ ] SpanDetailPanel handles loading state
- [ ] FilterBar updates URL params

### 17.3 Integration Tests

- [ ] Navigate project → traces → trace detail
- [ ] Filter by error level shows only errors
- [ ] Clicking span selects it and shows detail
- [ ] Pagination loads more traces
- [ ] Authorization rejects unauthorized access
- [ ] Query timeout triggers error response

### 17.4 E2E Tests

- [ ] Full flow: Ingest trace → See in list → View detail
- [ ] Error trace highlighted correctly
- [ ] Filters persist on page refresh
- [ ] Deep link to trace works
- [ ] Deep link with filters works

### 17.5 Performance Tests

- [ ] Trace with 100 spans renders in <500ms
- [ ] Trace with 500 spans renders with virtualization
- [ ] List of 1000 traces paginates smoothly
- [ ] List query returns in <200ms (p95)
- [ ] Detail query returns in <500ms (p95)

---

## 18. Architecture Decision Records

### ADR-001: Client-Side Filtering First

**Status:** Accepted

**Context:**
Need to filter traces by level, model, and duration. Options:
1. Server-side filtering with database indexes and WHERE clauses
2. Client-side filtering after fetching all data

**Decision:**
Start with client-side filtering in Phase 1.

**Rationale:**
- Simpler implementation for MVP
- Works well for <1000 traces per project
- Avoids premature database optimization
- Clear upgrade path when needed

**Consequences:**
- Positive: Faster time to market, simpler code
- Negative: May feel slow with 500+ traces
- Mitigation: Plan for server-side filtering in Phase 5

**Upgrade Trigger:** When any project exceeds 500 traces or users report slowness.

---

### ADR-002: Lazy Span Detail Loading

**Status:** Accepted

**Context:**
Span input/output can be large (MBs of JSON). Options:
1. Load all spans with full data upfront
2. Load spans without input/output, fetch on selection
3. Pagination within span detail

**Decision:**
Option 2 - Load spans without input/output, lazy fetch via `getSpanDetail`.

**Rationale:**
- Reduces initial payload by 90%+ (typical span metadata is <1KB, input/output can be >100KB)
- Better perceived performance for initial load
- Matches user behavior (most users view few spans in detail)
- Enables infinite caching of span detail (immutable data)

**Consequences:**
- Positive: Fast initial load, efficient bandwidth
- Negative: Additional API call when selecting span (~100ms latency)
- Mitigation: Cache span details, preload on hover (future)

---

### ADR-003: Compound Database Index for List Query

**Status:** Accepted

**Context:**
The traces list query filters by `projectId` and sorts by `timestamp DESC`. Options:
1. Use existing separate indexes
2. Add compound index `(projectId, timestamp DESC)`
3. Add compound index + cursor index

**Decision:**
Option 3 - Add both compound index and cursor pagination index.

**Rationale:**
- Compound index enables efficient range scan for the most common query pattern
- Cursor index (`projectId, id`) enables efficient keyset pagination
- Without compound index, PostgreSQL may choose inefficient query plan
- Cost is minimal (small index on two columns)

**Consequences:**
- Positive: 10-100x faster list queries at scale
- Negative: Slightly slower write operations, additional storage
- Mitigation: Monitor index usage, drop if unused

---

### ADR-004: URL-Driven Filter State

**Status:** Accepted

**Context:**
Need to persist filter state for the traces list. Options:
1. React state only (lost on refresh)
2. Local storage
3. URL query parameters
4. Server-side user preferences

**Decision:**
Option 3 - URL query parameters.

**Rationale:**
- Shareable links (copy URL to share filtered view)
- Browser back/forward works naturally
- Bookmarkable filter combinations
- No additional storage mechanism needed
- Server-side rendering possible with filters

**Consequences:**
- Positive: Best UX for sharing and navigation
- Negative: URL can get long with many filters
- Mitigation: Use short param names, consider compression for complex filters (future)

---

### ADR-005: Flexible Span Types with Backward Compatibility

**Status:** Accepted

**Context:**
Ducsigr needs to support multiple span types beyond LLM calls (LOG, FUNCTION, HTTP, DB, CUSTOM). Options:
1. Add `type` enum field to Span model (breaking change)
2. Infer type from existing fields (no schema change)
3. Store type in `metadata` JSON field
4. Add `type` field with default + inference for backward compatibility

**Decision:**
Option 4 - Add `type` field with `CUSTOM` default + inference from existing fields.

**Rationale:**
- Explicit type field enables efficient filtering and indexing
- Default value ensures backward compatibility
- Inference logic handles existing data without migration
- Future-proof: new span types can be added easily

**Consequences:**
- Positive: Clean data model, efficient queries, backward compatible
- Negative: Two sources of truth during transition (field vs inference)
- Mitigation: Always prefer explicit `type` field when present; inference only as fallback

**Migration Strategy:**
1. Add `type` field with default `CUSTOM` (no breaking change)
2. Background job: Set `type = LLM` where `model IS NOT NULL`
3. Update SDKs to send explicit `type`
4. Remove inference logic after SDK adoption (6 months)

---

## Appendix A: File Changes Summary

### New Files

| File | Purpose |
|------|---------|
| `packages/db/prisma/migrations/XXXXXX_add_trace_indexes/` | Database indexes |
| `packages/db/prisma/migrations/XXXXXX_add_span_type/` | SpanType enum and field |
| `packages/api/src/lib/query-utils.ts` | Query timeout utility |
| `packages/api/src/lib/errors.ts` | Error codes and response schema |
| `apps/web/src/app/workspace/[ws]/projects/[pid]/traces/page.tsx` | Traces list page |
| `apps/web/src/components/traces/traces-table.tsx` | Paginated trace table |
| `apps/web/src/components/traces/traces-filter-bar.tsx` | Filter controls |
| `apps/web/src/components/traces/trace-waterfall.tsx` | Waterfall container |
| `apps/web/src/components/traces/trace-waterfall-row.tsx` | Single span row |
| `apps/web/src/components/traces/trace-timeline-header.tsx` | Time scale |
| `apps/web/src/components/traces/span-detail-panel.tsx` | Detail sidebar |
| `apps/web/src/components/traces/span-json-viewer.tsx` | JSON display |
| `apps/web/src/components/traces/span-type-config.ts` | Type icons, colors, labels |
| `apps/web/src/hooks/traces/use-traces.ts` | List data hook |
| `apps/web/src/hooks/traces/use-trace-detail.ts` | Detail data hook |
| `apps/web/src/hooks/traces/use-span-detail.ts` | Lazy span fetch hook |
| `apps/web/src/hooks/traces/use-trace-filters.ts` | Filter URL sync |
| `apps/web/src/lib/traces/waterfall-calc.ts` | Position calculations |
| `apps/web/src/lib/traces/span-tree.ts` | Hierarchy builder |
| `apps/web/src/lib/traces/infer-span-type.ts` | Type inference for backward compat |

### Modified Files

| File | Changes |
|------|---------|
| `packages/db/prisma/schema.prisma` | Add compound indexes |
| `packages/api/src/routers/traces.ts` | Add `hasErrors`, `hasWarnings`, `getSpanDetail` |
| `apps/web/src/app/workspace/[ws]/projects/[pid]/traces/[tid]/page.tsx` | Refactor to waterfall + panel layout |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-11-29 | Claude | Initial specification |
| 1.1 | 2025-11-29 | Claude | Added: Security section, database indexes, error schema, query timeouts, ADRs, data retention, updated implementation phases |
| 1.2 | 2025-11-29 | Claude | Generalized to support all span types (LLM, LOG, FUNCTION, HTTP, DB, CUSTOM). Added: Span Types section, type-specific rendering, type filters, backward compatibility strategy |
