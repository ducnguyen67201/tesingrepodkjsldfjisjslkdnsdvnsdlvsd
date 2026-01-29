# Ingest Node Service Spec (Postgres-First, OTLP-First)

## Summary
Build a Node.js ingest service that accepts standard OTLP traces and persists them to Postgres with strong validation, idempotency, and query-friendly normalization. This is the v1 foundation for a scalable observability platform.

## Goals
- Accept OTLP/HTTP (protobuf + JSON) at standard endpoints.
- Enforce schema/size limits, PII guardrails, and per-project rate limits.
- Normalize core fields into columns for fast filtering and aggregation.
- Preserve full OTLP fidelity in JSON fields.
- Idempotent writes for retries and partial batches.
- Postgres-only storage (v1), ClickHouse-ready later.

## Non-Goals (v1)
- Metrics/logs ingestion (traces only).
- Multi-region ingest or cross-region replication.
- Full-text search at scale (use JSON filters).

## Interfaces

### Endpoints
- `POST /v1/traces` (OTLP/HTTP)
  - Content-Type: `application/x-protobuf` or `application/json`
  - Content-Encoding: `gzip` supported
- Optional alias: `POST /v1/otlp/traces` (same behavior)
- `GET /health` (no auth)

### Auth
- API key required for external ingest.
- Resolve `projectId` from API key validation only.
- Do not trust caller-provided project headers.
- Optional JWT allowed for internal services, but API key is default.

## Validation and Guardrails
- Payload size limit: 512KB default, configurable.
- Max spans per request: 500 default.
- Attribute count per span: 64 default.
- Event count per span: 64 default.
- Link count per span: 32 default.
- Attribute value length: 2KB default.
- Timestamp sanity: reject or clamp spans with >24h skew.
- PII scrubber: denylist keys (password, token, auth, secret, etc) with allowlist override.
- Rate limit: per project token bucket (e.g., 200 req/s with burst 2x).

## Normalization Rules

### Resource Attributes (Trace-level)
Promote these to columns:
- `service.name` -> `Trace.serviceName`
- `service.version` -> `Trace.serviceVersion`
- `deployment.environment` -> `Trace.environment`
Store the full resource attributes JSON in `Trace.resource`.

### Span Fields
Convert OTLP fields:
- `startTimeUnixNano` -> ISO timestamp
- `endTimeUnixNano` -> ISO timestamp
- `status.code` -> `Span.statusCode` enum
- `kind` -> optional `Span.kind` (if stored)
Store `attributes`, `events`, `links` JSON as-is.
Store scope fields to `Span.libraryName`, `Span.libraryVersion`.

### Derived Fields
Compute and store:
- `Span.durationMs = end - start`
- `Trace.durationMs = max(end) - min(start)` (for spans in this batch)
- `Trace.spanCount`, `Trace.errorCount`

## Idempotency
- Use external OTLP IDs:
  - Trace: `externalTraceId`
  - Span: `externalSpanId`
- Enforce uniqueness:
  - `(projectId, externalTraceId)` on Trace
  - `(projectId, externalTraceId, externalSpanId)` on Span
- Upsert behavior:
  - If Trace exists, update aggregates and metadata.
  - If Span exists, ignore if identical, reject if project mismatch.

## Storage Model (Postgres)

### Trace Table (required columns)
- `id` (internal)
- `projectId`
- `externalTraceId` (hex)
- `timestamp`
- `serviceName`, `serviceVersion`, `environment`
- `resource` JSON
- `durationMs`, `spanCount`, `errorCount`

### Span Table (required columns)
- `id` (internal)
- `traceId` (internal trace FK)
- `externalSpanId` (hex)
- `parentSpanId` (external)
- `name`, `startTime`, `endTime`, `durationMs`
- `statusCode`, `statusMessage`
- `attributes`, `events`, `links` JSON
- `libraryName`, `libraryVersion`

### Indexes
- Trace: `(projectId, timestamp DESC)`
- Trace: `(projectId, serviceName)`
- Trace: `(projectId, environment)`
- Trace: `(projectId, durationMs)`
- Span: `(traceId, startTime)`
- Span: `(traceId, statusCode)`
- Span: `(projectId, externalTraceId, externalSpanId)` unique

## Write Path
1) Parse OTLP request (protobuf or JSON).
2) Validate against limits.
3) Group spans by `traceId`.
4) For each trace group:
   - Upsert Trace by `(projectId, externalTraceId)`
   - Upsert spans with `externalSpanId`
   - Update trace aggregates (best-effort)

## Query Support (v1)
- List traces by project, time range, service, environment.
- Trace detail with span tree for a given `externalTraceId`.
- Filter spans by status/duration and attribute key/value.

## Observability
- Metrics: request count, latency, status codes, reject reasons, payload size.
- Logs: structured, include projectId, traceId, spanCount.
- Traces: instrument ingest with its own OTel SDK.

## Configuration
- `MAX_PAYLOAD_BYTES`
- `MAX_SPANS_PER_REQUEST`
- `MAX_ATTR_PER_SPAN`
- `MAX_EVENTS_PER_SPAN`
- `MAX_LINKS_PER_SPAN`
- `MAX_ATTR_VALUE_LEN`
- `RATE_LIMIT_RPS`
- `RATE_LIMIT_BURST`
- `INTERNAL_API_SECRET`
- `JWT_SHARED_SECRET`

## Testing
- Unit: OTLP parsing, validation, PII scrubbing, duration calc.
- Integration: OTLP JSON + protobuf payloads.
- Load: 10x expected burst, verify 429s and queue behavior.

## Rollout
1) Implement OTLP JSON + protobuf on `/v1/traces`.
2) Add limits, rate limiting, PII scrubbing.
3) Add idempotent storage and unique constraints.
4) Release SDK guide for OTLP configuration.
5) Deprecate legacy JSON ingestion if needed.

