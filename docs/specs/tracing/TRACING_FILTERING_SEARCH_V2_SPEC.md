# Trace Filtering + Search v2 (OTLP-First)

Owner: Eng (Tracing)
Status: Draft
Last updated: 2025-XX-XX

## 1. Problem Statement

The current trace filtering UX is limited to basic filters (service-name search,
error status, duration, span type inference) and does not expose the full
power of OTLP semantic conventions. Users want to search across service name,
span operation, body/prompt content, HTTP/DB/RPC metadata, and resource
attributes, while keeping performance predictable and PII-safe.

This spec defines a v2 filtering and search system that:
- Aligns with OpenTelemetry semantic conventions (resource, span, event).
- Supports advanced attribute filtering and full-text search where safe.
- Scales with Postgres-first storage while keeping query costs bounded.

## 2. Current Baseline (from repo)

- Trace list filters in `packages/api/src/routers/traces.ts`:
  - `filters.search` only targets `Trace.serviceName`.
  - `filters.levels` only checks `Trace.errorCount > 0`.
  - `filters.types` is inferred in-memory (post-query) from 10 spans.
- Trace schema in `packages/db/prisma/schema/tracing.prisma`:
  - Trace: serviceName, serviceVersion, environment, resource (JSON), durationMs,
    spanCount, errorCount.
  - Span: name, kind, statusCode, attributes (JSON), events (JSON), model,
    promptTokens/completionTokens, input/output (JSON).
- PII scrubbing runs in `apps/ingest-node/src/pipeline/handlers/scrub.handler.ts`
  and removes sensitive keys (including `session.id`) and redacts values.

## 3. Goals

- Enable search/filter across common OTLP dimensions:
  - Resource: service.name, service.version, deployment.environment, cloud, k8s.
  - Span: name, kind, statusCode, duration, http/db/rpc/messaging/faas.
  - GenAI: model, operation, input/output content (where allowed).
  - Exception events: exception.type/message/stacktrace.
- Provide an extensible filter DSL for trace list and span list endpoints.
- Maintain predictable performance with guardrails and indexes.
- Improve UI for discoverability and composability of filters.

## 4. Non-Goals (v2)

- Regex search across all JSON blobs.
- Cross-project or cross-tenant queries.
- Full text search across raw HTTP bodies by default (requires opt-in capture).

## 5. OTLP Semantic Conventions to Support (high value)

### 5.1 Resource Attributes (Trace-level)

Primary keys for filtering:
- service.name, service.version, service.namespace, service.instance.id
- deployment.environment, deployment.environment.name
- cloud.provider, cloud.region, cloud.availability_zone
- k8s.cluster.name, k8s.namespace.name, k8s.deployment.name, k8s.pod.name
- host.name, host.id, host.type
- telemetry.sdk.name, telemetry.sdk.version, telemetry.sdk.language
- enduser.id, enduser.role, user.id (if allowed)
- session.id (requires scrubbing rule update or hashed storage)

### 5.2 Span Attributes (Span-level)

HTTP:
- http.request.method / http.method, http.route, http.response.status_code, http.url
- url.full, url.path, server.address, client.address, network.protocol.name

DB:
- db.system, db.name, db.operation, db.statement, db.query.text, db.collection.name

RPC:
- rpc.system, rpc.service, rpc.method, rpc.grpc.status_code, rpc.response.status_code

Messaging:
- messaging.system, messaging.destination.name, messaging.operation, messaging.message.id

FaaS:
- faas.name, faas.trigger, faas.invocation_id, faas.coldstart

Exceptions:
- exception.type, exception.message, exception.stacktrace
- error.type, error.message (non-exception errors)

GenAI (model spans):
- gen_ai.operation.name, gen_ai.provider.name, gen_ai.request.model
- gen_ai.response.model, gen_ai.usage.input_tokens, gen_ai.usage.output_tokens
- gen_ai.input.messages, gen_ai.output.messages, gen_ai.system_instructions
- gen_ai.prompt, gen_ai.completion (legacy/custom)

## 6. Filter DSL (API)

### 6.1 Expression Model

```
FilterExpression =
  | { and: FilterExpression[] }
  | { or: FilterExpression[] }
  | { not: FilterExpression }
  | FieldPredicate
  | AttributePredicate
  | EventPredicate
  | SearchPredicate

FieldPredicate =
  { field: "trace.serviceName" | "trace.environment" | "trace.durationMs" | ...,
    op: "eq" | "neq" | "in" | "nin" | "gt" | "gte" | "lt" | "lte" | "exists" | "prefix" | "contains",
    value?: string | number | boolean | string[] | number[] }

AttributePredicate =
  { attribute: { scope: "resource" | "span", key: string,
                 op: "eq" | "neq" | "in" | "nin" | "exists" | "gt" | "gte" | "lt" | "lte" | "contains" | "prefix",
                 value?: string | number | boolean | string[] | number[] } }

EventPredicate =
  { event: { name?: string, attributeKey?: string, op, value } }

SearchPredicate =
  { search: { query: string, scope?: "trace" | "span" | "both",
              fields?: string[], mode?: "phrase" | "terms" } }
```

### 6.2 Span Matching Semantics for trace list

When span predicates are included:
- `spanMatch: "any"` (default) - trace matches if ANY span matches.
- `spanMatch: "root"` - only root span is evaluated.
- `spanMatch: "all"` - all spans in trace must match.
- `spanMatch: "descendants_of:<spanId>"` (optional) - sub-tree filters.

### 6.3 Example Queries

```
AND(
  trace.serviceName = "api",
  trace.environment = "prod",
  trace.durationMs > 1000,
  ANY_SPAN(
    span.statusCode = "ERROR",
    attribute(span, "http.response.status_code") >= 500
  )
)
```

Search query (UI string form):
```
service:api env:prod status:error http.route:/v1/users "timeout"
```

## 7. Data Model Changes

### 7.1 Trace (promote high-value fields)

Add columns:
- rootSpanId, rootSpanName, rootSpanKind, rootSpanStatusCode, rootSpanDurationMs
- hasError (bool), hasException (bool)
- spanTypes (string[]) or JSON array of inferred types
- searchText (tsvector) OR searchTextRaw (text) for trace-level full-text

Rationale:
- Avoid post-query span sampling for types and root fields.
- Enable fast filtering for common queries.

### 7.2 Span (promote high-value fields)

Add columns (nullable, extracted from attributes):
- httpMethod, httpRoute, httpStatusCode, httpUrl
- dbSystem, dbName, dbOperation, dbStatement, dbQueryText, dbCollection
- rpcSystem, rpcService, rpcMethod, rpcStatusCode
- messagingSystem, messagingDestination, messagingOperation
- faasName, faasTrigger, faasInvocationId
- exceptionType, exceptionMessage
- genAiOperation, genAiProvider, genAiRequestModel, genAiResponseModel
- inputText, outputText (normalized text for search; optional)
- projectId (denormalized for faster span-only queries)
- searchText (tsvector) OR searchTextRaw (text) for span-level full-text

### 7.3 JSONB + Attribute Index Tables (Phase 2)

If JSONB filters become slow at scale:

```
SpanAttributeIndex(
  projectId, traceId, spanId,
  key, valueType, valueText, valueNumber, valueBool
)

ResourceAttributeIndex(
  projectId, traceId,
  key, valueType, valueText, valueNumber, valueBool
)
```

Populated asynchronously to avoid ingest latency.

## 8. Ingest and Derivation Pipeline

### 8.1 Extract + Promote

Add a "derive" step after normalization to:
- Compute root span metadata per trace.
- Extract common attributes into promoted columns.
- Build searchText (selected fields only).
- Hash or drop sensitive fields based on allowlist.

### 8.2 GenAI Body Search

OTLP traces do not include HTTP bodies by default. For body-like search:
- Use gen_ai.input.messages, gen_ai.output.messages or gen_ai.prompt/completion.
- Extract into inputText/outputText for search (after scrubbing).
- Offer workspace setting to disable body indexing.

## 9. Indexing Strategy (Postgres)

Trace:
- (projectId, startTime DESC)
- (projectId, serviceName)
- (projectId, environment)
- (projectId, durationMs)
- (projectId, hasError)
- GIN on resource JSONB (jsonb_path_ops)
- GIN on trace searchText (tsvector) or trigram on serviceName

Span:
- (traceId, startTime)
- (projectId, startTime) if denormalized
- (statusCode), (kind), (model)
- (httpStatusCode), (httpRoute)
- (dbSystem), (rpcSystem), (messagingSystem)
- GIN on attributes JSONB (jsonb_path_ops)
- GIN on span searchText (tsvector), optional trigram on span.name

## 10. Query Strategy

### 10.1 Trace list with span predicates (EXISTS)

```
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

### 10.2 Span list with trace predicates (JOIN)

```
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

### 10.3 Full-text search

Prefer FTS on curated fields:
- `to_tsvector('english', span.searchTextRaw) @@ plainto_tsquery($q)`
- fallback to ILIKE for specific fields when needed

## 11. API Endpoints

### 11.1 traces.list (v2)

```
type TracesListInput = {
  workspaceSlug: string,
  projectId: string,
  timeRange: { from: string, to: string },
  filter?: FilterExpression,
  spanMatch?: "any" | "root" | "all",
  limit?: number,
  cursor?: { startTime: string, id: string },
}
```

### 11.2 spans.list (v2)

Same shape with trace+span filters, returns spans.

### 11.3 filters.keys / filters.values

- `filters.keys(projectId, scope)` returns top keys for resource/span/event attrs.
- `filters.values(projectId, scope, key, prefix)` returns value suggestions.

### 11.4 filters.stats (facets)

- Service, environment, status, http route, db system counts for UI.

## 12. UI/UX Changes

### 12.1 Top Search Bar (query builder + free-text)

- Support `field:value` and quoted phrases.
- Inline suggestions for fields and values from `filters.keys/values`.
- Scope toggle: Trace vs Span vs Both.

Example:
```
service:api env:prod status:error http.route:/v1/users "timeout"
```

### 12.2 Filter Sidebar

Sections (collapsible):
- Service / Environment / Status / Duration / Span Kind
- HTTP, DB, RPC, Messaging, FaaS
- GenAI (model, operation, tokens, prompt/output)
- Resource Attributes / Span Attributes (advanced)
- Exceptions (type/message)

### 12.3 Active Filter Chips

Show filter pills with one-click remove and clear-all.

## 13. Guardrails and Limits

- Hard time range required (default 24h/7d).
- Max predicates: 50, max OR groups: 10.
- Max full-text clauses: 5.
- Query timeout: 2s (configurable).

## 14. Security and PII

- Keep PII scrubbing in ingest pipeline.
- Add allowlist for searchable keys and opt-in for body indexing.
- Store hashed session/user IDs if needed for filtering.
- Avoid indexing raw headers by default.

## 15. Testing and Validation

- Unit: filter DSL parser, operator handling, type coercion.
- Integration: OTLP payloads with resource + span attributes.
- Perf: EXPLAIN ANALYZE for common queries.
- UI: URL sync, filter chips, key/value autocomplete.

## 16. Migration Plan

1) Add new columns + indexes.
2) Backfill promoted fields (offline worker).
3) Add v2 endpoints in API with feature flag.
4) Update UI to use v2 endpoints.
5) Remove post-query span type inference once backfill is complete.

## 17. Open Questions

- Should span predicates default to any span or root span?
- Which fields should be indexed with FTS vs JSONB contains?
- How to handle session.id given current scrubbing rules?
- Do we need separate log search (OTEL logs) for body search use cases?
