# Engineering Spec: Tracing System Improvements

**Epic:** Tracing Optimization & Search
**Priority:** P1
**Author:** Senior Architect
**Status:** Draft

---

## Executive Summary

This spec outlines improvements to CognObserve's tracing system to enable better filtering, session/user tracking UI, metadata search, and structured trace collection. The goal is to match industry-leading LLM observability platforms while maintaining our unique architecture.

---

## Current State Analysis

### What We Have (Complete)

| Component | Status | Notes |
|-----------|--------|-------|
| Trace/Span Schema | ✅ | Hierarchical spans, metadata JSON fields |
| Session Tracking | ✅ | `TraceSession` model + API routers |
| User Tracking | ✅ | `TrackedUser` model + API routers |
| Cost Tracking | ✅ | Per-span LLM costs + daily summaries |
| Ingest Service | ✅ | Go HTTP service with Temporal workflows (migrating to Node/TS) |
| Basic Filtering | ✅ | Type, level, model, search |

### What's Missing (Gaps)

| Gap | Impact | Priority |
|-----|--------|----------|
| Time range filtering not wired | Can't filter by date | P1 |
| No session/user browser UI | Can't view conversations/users | P1 |
| No metadata search | Can't find traces by custom attributes | P2 |
| No full-text search | Limited to trace name only | P2 |
| URL state sync for filters | Can't share filtered views | P2 |
| OpenTelemetry compatibility | No distributed tracing | P3 |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    IMPROVED TRACING ARCHITECTURE                            │
└─────────────────────────────────────────────────────────────────────────────┘

                     ┌──────────────────────────────────┐
                     │         CLIENT SDKs              │
                     │  (Python, JS/TS, OpenTelemetry)  │
                     └───────────────┬──────────────────┘
                                     │
              ┌──────────────────────┼──────────────────────┐
              │                      │                      │
              ▼                      ▼                      ▼
    ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
    │ Native SDK      │   │ OpenTelemetry   │   │ HTTP REST API   │
    │ POST /v1/traces │   │ OTLP Endpoint   │   │ (existing)      │
    └────────┬────────┘   └────────┬────────┘   └────────┬────────┘
             │                     │                     │
             └──────────────────┬──┴─────────────────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │   NODE INGEST SERVICE │
                    │   (Unified Handler)   │
                    │   - ID generation     │
                    │   - Validation        │
                    │   - Attribute extract │
                    └───────────┬───────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │   TEMPORAL WORKFLOW   │
                    │   - Persist trace     │
                    │   - Calculate costs   │
                    │   - Index attributes  │
                    └───────────┬───────────┘
                                │
                                ▼
            ┌───────────────────┴───────────────────┐
            │                                       │
            ▼                                       ▼
┌───────────────────────┐             ┌───────────────────────┐
│     PostgreSQL        │             │   Search Index        │
│   (Primary Storage)   │             │   (Future: PG FTS)    │
│   - traces            │             │   - trace_search_idx  │
│   - spans             │             │   - attribute_idx     │
│   - sessions          │             │   - metadata_jsonb    │
│   - users             │             │                       │
└───────────────────────┘             └───────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────┐
│                      DASHBOARD UI                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   Traces    │  │  Sessions   │  │    Users    │         │
│  │   Browser   │  │   Browser   │  │   Browser   │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Advanced Filter Bar                     │   │
│  │  [Search] [Time Range] [Session] [User] [Tags]      │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Queue Strategy (Temporal-first, BullMQ optional)

- Default: ingest dispatches to a Temporal task queue for durable processing and retries.
- If throughput spikes, enable BullMQ as a front buffer; workers drain BullMQ and start Temporal workflows at a controlled rate.
- Use a queue adapter interface so switching is config-only; keep the same payload schema and idempotency keys.

## Implementation Plan

### Phase 1: Core Filtering Improvements (P1)

#### 1.1 Wire Time Range Filtering

**Problem:** UI has date picker but backend doesn't filter by timestamp.

**Solution:** Add server-side WHERE clause for time range.

**Files to modify:**
- `packages/api/src/routers/traces.ts`

**Implementation:**
```typescript
// In traces.list procedure
const whereClause: Prisma.TraceWhereInput = {
  projectId: project.id,
  // Add time range filtering
  ...(filters?.timeRange && {
    timestamp: getTimeRangeFilter(filters.timeRange, filters.customRange),
  }),
};

// Helper function
function getTimeRangeFilter(
  timeRange: TimeRange,
  customRange?: { start: string; end: string }
): Prisma.DateTimeFilter {
  const now = new Date();

  switch (timeRange) {
    case "24h":
      return { gte: subHours(now, 24) };
    case "7d":
      return { gte: subDays(now, 7) };
    case "30d":
      return { gte: subDays(now, 30) };
    case "custom":
      if (!customRange) throw new Error("Custom range required");
      return {
        gte: new Date(customRange.start),
        lte: new Date(customRange.end),
      };
    default:
      return {};
  }
}
```

**Database index needed:**
```sql
CREATE INDEX idx_traces_project_timestamp
ON "Trace" ("projectId", "timestamp" DESC);
-- Already exists in schema
```

#### 1.2 Add User Filter to Trace List

**Problem:** Can't filter traces by tracked user from UI.

**Solution:** Add userId filter to traces router and filter bar.

**Files to modify:**
- `packages/api/src/routers/traces.ts` - Add userId to filters
- `packages/api/src/schemas/traces.ts` - Add userId to filter schema
- `apps/web/src/components/traces/traces-filter-bar.tsx` - Add user dropdown

**Schema change:**
```typescript
// packages/api/src/schemas/traces.ts
export const TraceFiltersSchema = z.object({
  // ... existing filters
  sessionId: z.string().optional(),
  userId: z.string().optional(),  // NEW
});
```

#### 1.3 URL State Synchronization

**Problem:** Filters not synced to URL, can't share filtered views.

**Solution:** Sync all filter state to URL query params.

**Implementation pattern:**
```typescript
// apps/web/src/components/traces/traces-filter-bar.tsx
const searchParams = useSearchParams();
const router = useRouter();
const pathname = usePathname();

// Read filters from URL on mount
useEffect(() => {
  const filtersFromUrl = parseFiltersFromUrl(searchParams);
  setFilters(filtersFromUrl);
}, [searchParams]);

// Update URL when filters change
const updateFilters = useCallback((newFilters: TraceFilters) => {
  const params = new URLSearchParams();

  if (newFilters.search) params.set("search", newFilters.search);
  if (newFilters.timeRange) params.set("range", newFilters.timeRange);
  if (newFilters.sessionId) params.set("session", newFilters.sessionId);
  if (newFilters.userId) params.set("user", newFilters.userId);
  if (newFilters.levels?.length) params.set("levels", newFilters.levels.join(","));
  if (newFilters.types?.length) params.set("types", newFilters.types.join(","));

  router.replace(`${pathname}?${params.toString()}`, { scroll: false });
}, [pathname, router]);
```

**URL format:**
```
/projects/abc/traces?search=checkout&range=7d&levels=ERROR,WARNING&user=usr_123
```

---

### Phase 2: Session & User Browser UI (P1)

#### 2.1 Sessions Browser Page

**Purpose:** View all conversation sessions with aggregated stats.

**Route:** `/workspace/[slug]/projects/[projectId]/sessions`

**Components to create:**
```
apps/web/src/
├── app/workspace/[workspaceSlug]/projects/[projectId]/sessions/
│   └── page.tsx
├── components/sessions/
│   ├── sessions-table.tsx        # Main table with session list
│   ├── session-detail-panel.tsx  # Side panel with session details
│   ├── session-timeline.tsx      # Trace timeline within session
│   └── sessions-filter-bar.tsx   # Filter by user, date, etc.
```

**Session list columns:**
| Column | Source |
|--------|--------|
| Session Name | `session.name` or "Session #id" |
| User | `session.user.name` or `session.user.email` |
| Traces | Count of traces in session |
| Total Tokens | Sum of all span tokens |
| Total Cost | Sum of all span costs |
| Duration | First trace to last trace |
| Errors | Count of ERROR level spans |
| Last Activity | Most recent trace timestamp |

**API already exists:** `sessions.list()` with aggregations

#### 2.2 Users Browser Page

**Purpose:** View all tracked users with usage analytics.

**Route:** `/workspace/[slug]/projects/[projectId]/users`

**Components to create:**
```
apps/web/src/
├── app/workspace/[workspaceSlug]/projects/[projectId]/users/
│   └── page.tsx
├── components/users/
│   ├── users-table.tsx           # Main table with user list
│   ├── user-detail-panel.tsx     # Side panel with user details
│   ├── user-analytics.tsx        # Usage charts for single user
│   └── users-filter-bar.tsx      # Filter by email, date, etc.
```

**User list columns:**
| Column | Source |
|--------|--------|
| User | `user.name` or `user.externalId` |
| Email | `user.email` |
| First Seen | `user.firstSeenAt` |
| Last Active | `user.lastSeenAt` |
| Total Traces | Count |
| Total Cost | Sum |
| Avg Latency | Calculated |
| Error Rate | Calculated |

**API already exists:** `trackedUsers.list()` with aggregations

#### 2.3 Navigation Updates

**Add to project sidebar:**
```typescript
// apps/web/src/components/layout/project-nav.tsx
const NAV_ITEMS = [
  { title: "Overview", href: "", icon: LayoutDashboard },
  { title: "Traces", href: "/traces", icon: Activity },
  { title: "Sessions", href: "/sessions", icon: MessageSquare },  // NEW
  { title: "Users", href: "/users", icon: Users },                // NEW
  { title: "Alerts", href: "/alerts", icon: Bell },
  // ...
];
```

---

### Phase 3: Metadata & Attribute Search (P2)

#### 3.1 Structured Attributes Schema

**Problem:** Metadata is unstructured JSON, can't efficiently search/filter.

**Solution:** Extract common attributes to indexed columns + JSONB GIN index.

**New fields on Trace model:**
```prisma
model Trace {
  // ... existing fields

  // Structured attributes (indexed for fast filtering)
  environment   String?   // "production", "staging", "development"
  release       String?   // App version/release tag
  tags          String[]  // Custom tags for categorization

  // Keep metadata for arbitrary data
  metadata      Json?

  @@index([projectId, environment])
  @@index([projectId, tags], type: Gin)
}
```

**New fields on Span model:**
```prisma
model Span {
  // ... existing fields

  // Span type (explicit instead of inferred)
  spanType      SpanType  @default(CUSTOM)

  // Structured attributes
  httpMethod    String?   // GET, POST, etc.
  httpUrl       String?   // Request URL
  httpStatus    Int?      // Response status code
  dbSystem      String?   // postgres, redis, etc.
  dbStatement   String?   // Query (truncated)

  @@index([traceId, spanType])
}

enum SpanType {
  LLM
  HTTP
  DB
  FUNCTION
  LOG
  CUSTOM
}
```

#### 3.2 Ingest Service Updates

**Update Node/TS handler to extract attributes:**
```typescript
// apps/ingest/src/handlers/trace.ts

function extractAttributes(span: IngestSpanInput): SpanAttributes {
  const attrs: SpanAttributes = {
    spanType: inferSpanType(span),
  };

  const metadata = span.metadata ?? {};

  const httpMethod = metadata["http.method"];
  if (typeof httpMethod === "string") {
    attrs.httpMethod = httpMethod;
  }
  const httpUrl = metadata["http.url"];
  if (typeof httpUrl === "string") {
    attrs.httpUrl = httpUrl;
  }
  const httpStatus = metadata["http.status_code"];
  if (typeof httpStatus === "number") {
    attrs.httpStatus = Math.trunc(httpStatus);
  }

  const dbSystem = metadata["db.system"];
  if (typeof dbSystem === "string") {
    attrs.dbSystem = dbSystem;
  }

  return attrs;
}

function inferSpanType(span: IngestSpanInput): SpanType {
  if (span.model) {
    return "LLM";
  }

  const metadata = span.metadata ?? {};
  if ("http.method" in metadata) {
    return "HTTP";
  }
  if ("db.system" in metadata) {
    return "DB";
  }

  // Pattern-based fallback
  const nameLower = span.name.toLowerCase();
  if (nameLower.includes("http") || nameLower.includes("fetch")) {
    return "HTTP";
  }
  if (nameLower.includes("query") || nameLower.includes("db")) {
    return "DB";
  }
  return "CUSTOM";
}
```

#### 3.3 Full-Text Search with PostgreSQL

**Option 1: PostgreSQL Full-Text Search (Recommended)**

```sql
-- Add search vector column
ALTER TABLE "Trace" ADD COLUMN search_vector tsvector;

-- Create GIN index
CREATE INDEX idx_trace_search ON "Trace" USING GIN (search_vector);

-- Update trigger to populate search vector
CREATE FUNCTION update_trace_search_vector() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.name, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.metadata::text, '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trace_search_update
  BEFORE INSERT OR UPDATE ON "Trace"
  FOR EACH ROW EXECUTE FUNCTION update_trace_search_vector();
```

**Query with full-text search:**
```typescript
// packages/api/src/routers/traces.ts
const traces = await ctx.db.$queryRaw`
  SELECT * FROM "Trace"
  WHERE "projectId" = ${projectId}
    AND search_vector @@ plainto_tsquery('english', ${searchQuery})
  ORDER BY ts_rank(search_vector, plainto_tsquery('english', ${searchQuery})) DESC
  LIMIT ${limit}
`;
```

**Option 2: JSONB Path Queries (For metadata filtering)**

```typescript
// Filter by metadata attribute
const traces = await ctx.db.trace.findMany({
  where: {
    projectId,
    metadata: {
      path: ["customer_tier"],
      equals: "enterprise",
    },
  },
});
```

#### 3.4 Advanced Filter UI

**Add to filter bar:**
```typescript
// New filter options
interface AdvancedFilters {
  environment?: string[];      // production, staging, dev
  tags?: string[];             // Custom tags
  release?: string;            // App version
  hasErrors?: boolean;         // Quick toggle
  metadataQuery?: string;      // JSON path query (advanced)
}
```

**Filter bar mockup:**
```
┌────────────────────────────────────────────────────────────────────┐
│ [🔍 Search traces...]  [Time: Last 7 days ▼]  [+ Add Filter]      │
├────────────────────────────────────────────────────────────────────┤
│ Type: [LLM] [HTTP] [DB]   Level: [Error] [Warning]                │
│ Environment: [Production ▼]   User: [Select user ▼]              │
│ Tags: [checkout] [payment] [×]                                    │
├────────────────────────────────────────────────────────────────────┤
│ Active: environment=production • tags=checkout,payment • errors   │
└────────────────────────────────────────────────────────────────────┘
```

---

### Phase 4: OpenTelemetry Compatibility (P3)

#### 4.1 OTLP Endpoint

**Purpose:** Accept traces from OpenTelemetry-instrumented applications.

**New endpoint:** `POST /v1/otlp/traces`

**Implementation approach:**
```typescript
// apps/ingest/src/handlers/otlp.ts

export async function handleOTLPTraces(req: Request, res: Response) {
  const body = await readRawBody(req);

  let exportRequest: ExportTraceServiceRequest;
  try {
    exportRequest = decodeOtlpExportTraceServiceRequest(body);
  } catch {
    exportRequest = decodeOtlpExportTraceServiceRequest(
      JSON.parse(body.toString("utf-8"))
    );
  }

  for (const resourceSpan of exportRequest.resourceSpans ?? []) {
    const trace = convertOTLPTrace(resourceSpan);
    enqueueWorkflow(trace);
  }

  res.status(202).end();
}

function convertOTLPTrace(resourceSpan: OtelResourceSpans): TraceWorkflowInput {
  // Map OTLP attributes to CognObserve fields
  // - service.name → trace.name
  // - span attributes → span.metadata
  // - span kind → spanType
  // - status → level
}
```

#### 4.2 Semantic Conventions

Follow [OpenTelemetry Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/) for attribute naming:

| OTel Attribute | CognObserve Field |
|----------------|-------------------|
| `service.name` | `trace.name` |
| `http.method` | `span.httpMethod` |
| `http.url` | `span.httpUrl` |
| `http.status_code` | `span.httpStatus` |
| `db.system` | `span.dbSystem` |
| `db.statement` | `span.dbStatement` |
| `gen_ai.system` | `span.model` (mapped) |
| `gen_ai.usage.prompt_tokens` | `span.promptTokens` |

#### 4.3 Trace Context Propagation

**Support W3C Trace Context headers:**
- `traceparent`: `00-{trace-id}-{span-id}-{flags}`
- `tracestate`: Vendor-specific key-value pairs

```typescript
function extractTraceContext(req: Request): TraceContext | null {
  const traceparent = req.headers["traceparent"];
  if (!traceparent) {
    return null; // No context, generate new IDs
  }

  // Parse: 00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01
  const parts = traceparent.split("-");
  if (parts.length !== 4) {
    throw new Error("invalid traceparent format");
  }

  return {
    traceId: parts[1],
    spanId: parts[2],
    flags: parts[3],
  };
}
```

---

## SDK Improvements

### Recommended SDK Interface

```typescript
// JavaScript/TypeScript SDK
import { CognObserve } from "@cognobserve/sdk";

const co = new CognObserve({
  apiKey: "co_...",
  baseUrl: "https://api.cognobserve.com",
});

// Start a trace with session and user context
const trace = co.trace({
  name: "Chat Completion",
  sessionId: "session_abc123",      // Group related traces
  userId: "user_xyz789",            // Track end user
  user: {                           // User metadata (created/updated automatically)
    name: "John Doe",
    email: "john@example.com",
    metadata: { plan: "enterprise" },
  },
  metadata: {
    environment: "production",
    release: "v1.2.3",
  },
  tags: ["checkout", "payment"],
});

// Create spans within trace
const span = trace.span({
  name: "OpenAI Chat",
  input: { messages: [...] },
});

// Auto-instrumentation for LLM calls
const response = await span.trackLLM(
  () => openai.chat.completions.create({ ... }),
  { model: "gpt-4" }
);

span.end({ output: response });
trace.end();
```

### Python SDK

```python
from cognobserve import CognObserve

co = CognObserve(api_key="co_...")

# Context manager for automatic trace lifecycle
with co.trace(
    name="RAG Pipeline",
    session_id="session_abc",
    user_id="user_xyz",
    tags=["rag", "production"]
) as trace:

    with trace.span(name="Embedding") as span:
        embedding = embed(query)
        span.output = {"embedding_dim": len(embedding)}

    with trace.span(name="Vector Search") as span:
        span.metadata = {"db.system": "pinecone"}
        results = search(embedding)
        span.output = {"matches": len(results)}

    with trace.span(name="LLM Generation") as span:
        response = generate(query, results)
        # Auto-captured: model, tokens, cost
```

---

## Database Migrations

### Migration 1: Add Structured Attributes

```sql
-- Migration: add_trace_attributes
ALTER TABLE "Trace" ADD COLUMN "environment" TEXT;
ALTER TABLE "Trace" ADD COLUMN "release" TEXT;
ALTER TABLE "Trace" ADD COLUMN "tags" TEXT[] DEFAULT '{}';

CREATE INDEX "idx_trace_environment" ON "Trace" ("projectId", "environment");
CREATE INDEX "idx_trace_tags" ON "Trace" USING GIN ("tags");

-- Migration: add_span_type
CREATE TYPE "SpanType" AS ENUM ('LLM', 'HTTP', 'DB', 'FUNCTION', 'LOG', 'CUSTOM');
ALTER TABLE "Span" ADD COLUMN "spanType" "SpanType" DEFAULT 'CUSTOM';
ALTER TABLE "Span" ADD COLUMN "httpMethod" TEXT;
ALTER TABLE "Span" ADD COLUMN "httpUrl" TEXT;
ALTER TABLE "Span" ADD COLUMN "httpStatus" INTEGER;
ALTER TABLE "Span" ADD COLUMN "dbSystem" TEXT;
ALTER TABLE "Span" ADD COLUMN "dbStatement" TEXT;

CREATE INDEX "idx_span_type" ON "Span" ("traceId", "spanType");
```

### Migration 2: Full-Text Search

```sql
-- Migration: add_trace_search
ALTER TABLE "Trace" ADD COLUMN "searchVector" tsvector;

CREATE INDEX "idx_trace_fts" ON "Trace" USING GIN ("searchVector");

-- Populate existing traces
UPDATE "Trace" SET "searchVector" =
  setweight(to_tsvector('english', COALESCE(name, '')), 'A');

-- Create update trigger
CREATE OR REPLACE FUNCTION update_trace_search() RETURNS trigger AS $$
BEGIN
  NEW."searchVector" := setweight(to_tsvector('english', COALESCE(NEW.name, '')), 'A');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trace_search_trigger
  BEFORE INSERT OR UPDATE ON "Trace"
  FOR EACH ROW EXECUTE FUNCTION update_trace_search();
```

---

## Implementation Timeline

| Phase | Scope | Tickets | Priority |
|-------|-------|---------|----------|
| **Phase 1** | Core Filtering | 3 tickets | P1 |
| 1.1 | Wire time range filtering | #150 | P1 |
| 1.2 | Add user filter | #151 | P1 |
| 1.3 | URL state sync | #152 | P1 |
| **Phase 2** | Session/User UI | 2 tickets | P1 |
| 2.1 | Sessions browser page | #153 | P1 |
| 2.2 | Users browser page | #154 | P1 |
| **Phase 3** | Metadata Search | 4 tickets | P2 |
| 3.1 | Structured attributes schema | #155 | P2 |
| 3.2 | Ingest attribute extraction | #156 | P2 |
| 3.3 | Full-text search | #157 | P2 |
| 3.4 | Advanced filter UI | #158 | P2 |
| **Phase 4** | OpenTelemetry | 3 tickets | P3 |
| 4.1 | OTLP endpoint | #159 | P3 |
| 4.2 | Semantic conventions | #160 | P3 |
| 4.3 | Trace context propagation | #161 | P3 |

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Filter response time | ~500ms | <200ms |
| Traces searchable by metadata | 0% | 100% |
| Session browser available | No | Yes |
| User browser available | No | Yes |
| URL shareable filters | No | Yes |
| OpenTelemetry compatible | No | Yes (Phase 4) |

---

## References

### Industry Best Practices

- [OpenTelemetry Tracing Best Practices](https://opentelemetry.io/docs/concepts/signals/traces/)
- [OpenTelemetry Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/)

### Similar Platforms

- Industry-standard LLM observability platforms provide session replay, user tracking, and metadata filtering
- OpenTelemetry-based tools offer semantic conventions for LLM operations
- Leading platforms support both native SDKs and OTLP ingestion

---

## Appendix: Comparison with Industry Standards

### Feature Matrix

| Feature | CognObserve (Current) | CognObserve (Target) | Industry Standard |
|---------|----------------------|---------------------|-------------------|
| Trace collection | ✅ Native SDK | ✅ + OTLP | ✅ Multiple |
| Session tracking | ✅ API only | ✅ Full UI | ✅ Full UI |
| User tracking | ✅ API only | ✅ Full UI | ✅ Full UI |
| Time filtering | ❌ UI only | ✅ Server-side | ✅ Server-side |
| Metadata search | ❌ None | ✅ Full-text | ✅ Full-text |
| URL state | ❌ None | ✅ Full sync | ✅ Full sync |
| OpenTelemetry | ❌ None | ✅ OTLP endpoint | ✅ Native |
| Cost tracking | ✅ LLM only | ✅ LLM only | ✅ LLM only |
| Span hierarchy | ✅ Full | ✅ Full | ✅ Full |
| Evaluations | ✅ Scores | ✅ Scores | ✅ Scores |

### Data Model Comparison

| Concept | CognObserve | OpenTelemetry | Industry Standard |
|---------|-------------|---------------|-------------------|
| Trace | `Trace` model | `Trace` | `Trace` |
| Span | `Span` model | `Span` | `Span`/`Generation` |
| Session | `TraceSession` | N/A (custom) | `Session` |
| User | `TrackedUser` | N/A (custom) | `User` |
| Attributes | `metadata` JSON | `Attributes` map | `metadata` JSON |
| Tags | `tags[]` (new) | N/A | `tags[]` |
