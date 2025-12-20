# Ingest Service Base Spec (OTEL-First, Scalable, Extensible)

## Purpose
Define a clean, scalable ingestion foundation for an observability platform that accepts OpenTelemetry (OTLP) traces and supports fast filtering, search, and aggregation.

## Goals
- Accept standard OTLP traces (HTTP + gRPC) from SDKs or Collectors.
- Preserve OTLP fidelity (resource, scope, attributes, events, links, status).
- Provide fast filtering (service, environment, duration, status, attributes).
- Support aggregation (latency percentiles, error rates, throughput).
- Scale to high throughput with backpressure and durability.
- Make it easy to extend with logs/metrics and new query dimensions.

## Non-Goals (for v1)
- Custom APM auto-instrumentation beyond OTel SDKs.
- Full-text log analytics (keep to trace attributes/events).
- Multi-region replication and global query federation (later).

## Terminology
- **OTLP**: OpenTelemetry Protocol (wire format).
- **Trace**: A tree of spans sharing a traceId.
- **Span**: Single operation with attributes/events/links.
- **Resource**: Service-level metadata (service.name, environment).
- **Scope**: Instrumentation library metadata.

## High-Level Architecture
1) **Edge Ingest**: OTLP receiver (HTTP + gRPC).
2) **Validation + Normalization**: schema checks, limits, PII guardrails.
3) **Durable Buffer**: queue or log for backpressure and retry.
4) **Processing**: normalization, idempotent upserts, aggregation.
5) **Storage**:
   - **Hot**: queryable DB (Postgres/ClickHouse).
   - **Cold** (optional): object store for raw payloads.

## Interfaces

### OTLP Receiver
- **HTTP**: `POST /v1/traces` with `application/x-protobuf` or `application/json`.
- **gRPC**: OTLP TraceService.
- Support `Content-Encoding: gzip`.
- Must accept SDKs and Collector exporters without custom headers.

### Auth & Tenancy
- API key per project/workspace.
- For collectors, allow per-tenant routing via headers or auth token claims.
- Auth must resolve a canonical `projectId` and reject tampering.

## Validation & Guardrails
- Payload size limit (default 512KB, configurable).
- Max spans per request (default 500).
- Attribute/event/link caps (e.g., 64/64/32).
- Attribute value length caps (e.g., 2KB).
- Timestamp sanity checks (reject or clamp skew).
- PII scrubbing: drop/deny keys by pattern, allowlist overrides.
- Rate limiting: per-project (token bucket).

## Idempotency & Consistency
- Use external IDs from OTLP (traceId, spanId) as stable keys.
- Enforce uniqueness on `(projectId, externalTraceId, externalSpanId)`.
- Upsert spans; ignore duplicates if content matches.
- Reject if a span arrives with the same IDs but different project.

## Storage Model (Minimal)

### Trace Table
- Internal ID
- Project ID
- External traceId (hex)
- Timestamp (start or first span start)
- `service.name`, `service.version`, `environment`
- Resource attributes (JSON)
- Aggregates: spanCount, errorCount, durationMs

### Span Table
- Internal ID
- Project ID
- Trace internal ID + external spanId
- Parent spanId
- Name, kind, status, start/end/duration
- Attributes JSON
- Events JSON
- Links JSON
- Scope name/version

### Optional Derived Tables
- **TraceSummary** (precomputed aggregates)
- **MetricsRollup** (time series for p50/p95 error rates)
- **AttributeIndex** (key/value index for fast filtering)

## Indexing Strategy (Filtering)
- Composite indexes:
  - `(projectId, timestamp DESC)`
  - `(projectId, serviceName)`
  - `(projectId, environment)`
  - `(projectId, durationMs)`
  - `(projectId, statusCode)`
- Attribute search:
  - Start with JSONB GIN indexes (Postgres) or ClickHouse map/kv columns.
  - Add a dedicated attribute index table if filters become slow.

## Aggregation Strategy
- Real-time aggregates:
  - `trace.durationMs = max(end) - min(start)`
  - `trace.errorCount`, `trace.spanCount`
- Periodic rollups:
  - Requests per minute
  - p50/p95/p99 latency per service
  - Error rate per service/environment

## Extensibility
- Accept any OTLP attributes without schema migration.
- Promote frequently queried attributes into columns.
- Schema versioning for normalization logic (e.g., v1, v2).
- Add logs/metrics using OTLP without changing ingest auth/tenant model.

## Scalability & Backpressure
- Async buffering (Redis Streams/Kafka/Redpanda).
- Batch DB writes for throughput.
- Adaptive sampling (collector or ingest-level).
- Circuit breakers: reject/429 when queue is saturated.

## Reliability & SLOs
- Availability target: 99.9%+ for ingest.
- Ingest p95 latency < 300ms under target load.
- At-least-once delivery from edge to storage.

## Observability (of the Ingest)
- Metrics: rps, latency, status codes, reject reasons, queue lag.
- Tracing: ingest request traces tagged with projectId.
- Logging: structured, redact secrets.

## Security
- TLS everywhere.
- API keys stored hashed; never log raw keys.
- PII scrubbing and configurable allowlist.
- Strict request size/timeouts.

## Testing Requirements
- Unit: OTLP parsing, limits, PII scrubbing, idempotency.
- Integration: OTLP JSON + protobuf samples.
- Load: sustained throughput + burst behavior.

## Acceptance Criteria (v1)
- OTLP/HTTP + OTLP/gRPC accepted with gzip.
- Spans stored with external IDs and are idempotent on retry.
- Filter by service.name, environment, duration, status, and attributes.
- Aggregations for latency and error rate available in API.
- Clear limits and rate limiting are enforced.

## Open Decisions
- Storage backend: Postgres vs ClickHouse for primary span storage.
- Attribute indexing strategy at scale.
- Whether to require collector in production by default.
