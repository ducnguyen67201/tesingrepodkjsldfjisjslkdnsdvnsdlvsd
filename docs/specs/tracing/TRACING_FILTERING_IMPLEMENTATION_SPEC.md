# Trace Filtering Implementation Guide + Engineering Spec

Owner: Eng (Tracing)
Status: Draft
Last updated: 2025-XX-XX

## 1. Purpose

Define how to implement an OTLP-first filtering system for traces and spans,
including backend query semantics, schema/index strategy, and UI layout. This
spec assumes the new Node ingest pipeline is already in place and OTLP
normalization persists spans and traces as implemented in `apps/ingest-node/`.

## 2. Current Baseline (From the PR and Repo)

- Ingest pipeline (parse -> normalize -> validate -> scrub -> auth -> persist)
  exists in `apps/ingest-node/src/pipeline/`.
- OTLP normalization extracts resource attributes into trace-level fields and
  persists full resource JSON (`Trace.resource`) and span attributes JSON
  (`Span.attributes`).
- Trace/Span schema is defined in `packages/db/prisma/schema/tracing.prisma`
  with promoted fields: `serviceName`, `environment`, `statusCode`, `model`,
  token usage, etc.
- PII scrubbing removes sensitive keys before persistence
  (`apps/ingest-node/src/pipeline/handlers/scrub.handler.ts`).
- Existing filter schemas are legacy and only wired into cost queries
  (`packages/api/src/schemas/traces.ts`, `packages/api/src/routers/costs.ts`).

If your PR added additional promoted fields or indexes, include them in
Section 6 and align the filter DSL accordingly.

## 3. Goals

- Fast filters for common OTLP dimensions: service, environment, status, duration.
- Attribute filters for resource and span attributes (OTLP semantic conventions).
- Stable pagination, project-scoped isolation, and bounded query complexity.
- UI with a left filter sidebar and a long horizontal top bar for quick filters.

## 4. Non-Goals (v1)

- Full-text or regex over large JSON blobs.
- Cross-project or global filtering.
- Advanced analytics aggregations (handled separately).

## 5. Architecture Overview

```
OTLP SDKs/Collector
        |
        v
apps/ingest-node (OTLP normalize + persist)
        |
        v
Postgres: Trace + Span + JSONB attributes
        |
        v
API: traces.list + spans.list + filters metadata
        |
        v
Web: Project Traces page (sidebar + top bar)
```

## 6. Data Model and Indexing

### 6.1 Promoted Columns (Existing or Proposed)

Trace:
- `serviceName`, `serviceVersion`, `environment`, `resource`
- `startTime`, `endTime`, `durationMs`
- `spanCount`, `errorCount`
- Proposed: `rootSpanName`, `rootSpanKind`, `rootSpanStatusCode`, `hasError`

Span:
- `name`, `kind`, `statusCode`
- `startTime`, `endTime`, `durationMs`
- `attributes`, `events`, `links`
- `libraryName`, `libraryVersion`
- `model`, `promptTokens`, `completionTokens`, `totalTokens`
- Proposed: `projectId` denormalized for faster span filtering

### 6.2 Indexes

Trace:
- `(projectId, startTime DESC)`
- `(projectId, serviceName)`
- `(projectId, environment)`
- `(projectId, durationMs)`
- `(projectId, hasError)` (if added)
- `GIN` on `resource` JSONB with `jsonb_path_ops`

Span:
- `(traceId, startTime)`
- `(startTime)` (already present)
- `(statusCode)`
- `(kind)`
- `(model)`
- `GIN` on `attributes` JSONB with `jsonb_path_ops`
- Optional trigram index on `name` for substring search

### 6.3 Attribute Index Tables (Phase 2)

If JSONB filters become slow at scale, add typed attribute index tables:

```
SpanAttributeIndex(projectId, traceId, spanId, key, valueType, valueText, valueNumber, valueBool)
ResourceAttributeIndex(projectId, traceId, key, valueType, valueText, valueNumber, valueBool)
```

These tables should be populated asynchronously (worker) to avoid ingest latency.

## 7. Filter Semantics

### 7.1 Trace List

- Trace-level predicates filter on Trace columns.
- Span predicates match a trace when any span matches (EXISTS).
- Optional mode: `rootSpanOnly` to restrict span predicates to root span.

### 7.2 Span List

- Span predicates apply directly to spans.
- Trace predicates apply via join or denormalized projectId + trace fields.

### 7.3 Operators

- eq, neq, in, nin
- exists
- gt, gte, lt, lte
- contains (string/array)
- prefix (string)

### 7.4 Query Limits

- Max predicates: 50
- Max OR groups: 10
- Max `contains`: 5
- Hard time range required (default 7d)

## 8. Filter DSL (API)

Example input:
```json
{
  "projectId": "proj_123",
  "timeRange": { "from": "2024-03-01T00:00:00Z", "to": "2024-03-02T00:00:00Z" },
  "filter": {
    "and": [
      { "field": "trace.serviceName", "op": "eq", "value": "api" },
      { "attribute": { "scope": "resource", "key": "deployment.environment", "op": "eq", "value": "prod" } },
      {
        "anySpan": [
          { "field": "span.statusCode", "op": "eq", "value": "ERROR" },
          { "attribute": { "scope": "span", "key": "http.status_code", "op": "gte", "value": 500 } }
        ]
      }
    ]
  },
  "limit": 50,
  "cursor": { "startTime": "2024-03-01T12:34:56Z", "id": "trace_cuid" }
}
```

Schema types to add in `packages/api/src/schemas`:
- `FilterExpressionSchema`
- `TraceListInputSchema`
- `SpanListInputSchema`

## 9. Query Strategy

### 9.1 Trace List (Span predicates)
```sql
SELECT t.*
FROM "Trace" t
WHERE t."projectId" = $1
  AND t."startTime" BETWEEN $2 AND $3
  AND <trace_predicates>
  AND EXISTS (
    SELECT 1 FROM "Span" s
    WHERE s."traceId" = t."id"
      AND <span_predicates>
  )
ORDER BY t."startTime" DESC, t."id" DESC
LIMIT $limit_plus_one;
```

### 9.2 Span List (Trace predicates)
```sql
SELECT s.*
FROM "Span" s
JOIN "Trace" t ON t."id" = s."traceId"
WHERE t."projectId" = $1
  AND s."startTime" BETWEEN $2 AND $3
  AND <span_predicates>
  AND <trace_predicates>
ORDER BY s."startTime" DESC, s."id" DESC
LIMIT $limit_plus_one;
```

### 9.3 JSONB Filters

Use JSONB containment and path ops:
- `resource @> '{"service.name":"api"}'`
- `attributes @> '{"http.method":"GET"}'`

Avoid regex or deep path queries in v1.

## 10. API Endpoints

### 10.1 traces.list

Input:
```ts
type TracesListInput = {
  projectId: string;
  timeRange: { from: string; to: string };
  filter?: FilterExpression;
  limit?: number;
  cursor?: { startTime: string; id: string };
};
```

Output:
```ts
type TracesListOutput = {
  items: TraceListItem[];
  nextCursor?: { startTime: string; id: string };
  appliedFilters: FilterExpression | null;
  queryMs: number;
};
```

### 10.2 spans.list

Same pattern as traces.list, but returns spans and supports trace filters.

### 10.3 filters.keys + filters.values

- `filters.keys(projectId, scope)` returns top keys for resource/span attributes.
- `filters.values(projectId, scope, key, prefix)` returns value suggestions.

## 11. UI: Project Traces Page

### 11.1 Layout (Top Bar + Left Sidebar)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Project: <name>  Traces                                                   │
│ [Search traces...] [Time Range] [Service] [Env] [Status] [Apply] [Save]  │
└──────────────────────────────────────────────────────────────────────────┘
┌───────────────────┬──────────────────────────────────────────────────────┐
│ Filters           │ Trace List                                            │
│ - Overview        │  [Trace rows... sortable by time, duration, status]  │
│ - Service         │                                                      │
│ - Environment     │                                                      │
│ - Status          │                                                      │
│ - Duration        │                                                      │
│ - Span Attributes │                                                      │
│ - Resource Attrs  │                                                      │
│ - Models          │                                                      │
│ - Errors          │                                                      │
└───────────────────┴──────────────────────────────────────────────────────┘
```

### 11.2 Sidebar Behavior (Modeled after the provided UI)

```
┌───────────────────────────────┐
│ Filters                       │
│ [Search filters...]           │
├───────────────────────────────┤
│ Service           >           │
│ Environment       >           │
│ Status            >           │
│ Duration          >           │
│ Span Attributes   >           │
│ Resource Attrs    >           │
│ Models            >           │
│ Errors            >           │
└───────────────────────────────┘

Right panel (selected category):
┌────────────────────────────────────────────────────────────┐
│ Service                                                    │
│ [Search service]                                           │
│ [ ] api (1.2M)                                              │
│ [ ] worker (214k)                                          │
│ [ ] ingest-node (98k)                                      │
└────────────────────────────────────────────────────────────┘
```

### 11.3 Top Bar Quick Filters

- Search input (trace name + selected attributes)
- Time range selector (24h, 7d, 30d, custom)
- Quick toggles: Errors, Slow, LLM, HTTP, DB
- "Apply" button (debounced updates)
- "Save view" (optional v2)

### 11.4 URL Sync

Filters must serialize into query params for sharing. Use the existing
`ProjectFilterProvider` pattern in `apps/web/src/components/costs/cost-context.tsx`
as a base, but extend to support the new filter DSL.

## 12. Implementation Steps

### Phase 1: API + Query Core
1. Add filter DSL schemas in `packages/api/src/schemas`.
2. Implement `traces.list` and `spans.list` with SQL/Prisma.
3. Add query timeout and complexity limits.
4. Add GIN indexes on `resource` and `attributes`.

### Phase 2: UI
1. Create `traces-filter-topbar.tsx` and `traces-filter-sidebar.tsx`.
2. Add filter context (URL sync + state).
3. Wire filters into `traces.list` query.
4. Render chips for active filters and allow quick removal.

### Phase 3: Attribute Indexing
1. Add attribute index tables + worker job.
2. Switch high-cardinality filters to indexed path.
3. Add `filters.keys` and `filters.values` endpoints for autocomplete.

## 13. Testing and Validation

- Unit: filter DSL parser, SQL compiler, predicate limits.
- Integration: OTLP payloads with resource + span attributes.
- Performance: EXPLAIN ANALYZE for common filters (service + status + duration).
- UI: URL sync, filter chips, sidebar selection, empty states.

## 14. Open Questions

- Should span predicates default to ANY span or ROOT span?
- Do we allow filter persistence (saved views) in v1?
- Which attribute keys should be promoted to columns in v1?

