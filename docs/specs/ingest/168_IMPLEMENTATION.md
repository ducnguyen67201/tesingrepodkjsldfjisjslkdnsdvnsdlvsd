# Trace Ingestion Upgrade – Implementation Playbook (Enterprise-Ready)

This document is the implementation guide for upgrading Ducsigr ingestion to OTLP-first, multi-tenant, and enterprise-ready. It expands on the high-level spec in `docs/specs/ingest/README.md`.

## Objectives
- Accept OTLP/HTTP (protobuf + JSON) and legacy JSON with shared validation.
- Enforce auth + tenant binding, schema/size limits, idempotency, and PII protection.
- Persist full OTLP fidelity (resource, scope, attributes, events, links, status, traceState) plus GenAI semantics.
- Make the edge observable (metrics/traces), rate-limited, and ready for bursts.
- Keep the pipeline compatible with Temporal and current storage; allow future storage backends.

## Architecture (Incremental)
1) **Edge**: Go ingest service handles OTLP + legacy JSON, enforces validation/limits, then calls Temporal.
2) **Workflow**: Temporal `traceWorkflow` (TS) orchestrates persistence + cost calc.
3) **Activities/API**: Worker activities call `packages/api` internal router to upsert trace/spans.
4) **Storage**: Postgres (Prisma) extended to store OTLP fields; future ClickHouse/S3 export remains optional.
5) **Optional Collector**: OTel Collector can front ingest for sampling/filtering and protocol fan-in; it forwards to the Go ingest endpoint.

## Endpoints & Formats
- `POST /v1/otlp/traces`
  - Content-Type: `application/x-protobuf` (OTLP ExportRequest) or `application/json` (OTLP JSON).
  - Content-Encoding: `gzip` supported; required above size threshold.
- `POST /v1/traces` (legacy JSON) reuses the same normalization/validation logic.
- Responses: `202 Accepted` on success; 4xx with structured error codes on validation/rate-limit; 5xx only on internal errors.

## Validation & Limits (Edge)
| Concern | Rule (defaults) | Action |
| --- | --- | --- |
| Payload size | ≤ 512 KB | 413 |
| Spans per request | ≤ 500 | 429/400 |
| Attributes per span | ≤ 64 | Drop excess / 400 if critical |
| Attribute value length | ≤ 2048 bytes | Truncate/drop with warning |
| Events per span | ≤ 64 | Drop excess |
| Links per span | ≤ 32 | Drop excess |
| Required fields | `traceId`, `spanId`, `name`, `startTime`; `service.name` in resource | 400 |
| Timestamp skew | >24h skew rejected/clamped | 400/normalize |
| PII guard | Drop keys matching `password|secret|authorization|api_key|token|credit_card` (unless allowlisted) | Drop + metric |
| Compression | Require gzip for protobuf above threshold | 400 |

Implementation hints:
- Centralize validation in a package (Go) that both OTLP and legacy paths call.
- Return machine-readable error codes (`code`, `reason`, `field`, `limit`).

## Auth & Tenant Binding
- Keep API key validation (`apps/ingest/internal/middleware/apikey.go`) but make the project ID authoritative from validation; ignore caller-supplied project headers.
- If JWT is present, enforce that it matches the key-bound project.
- Optional mTLS for collector→ingest (config flag).
- Rate limiting: per-project token bucket (in-memory first; Redis optional later).

## OTLP → Internal Mapping (Normalized Span)
- Trace-level:
  - `resource.attributes.*` → `trace.resource` (JSON). Promote `service.name`, `service.version`, `deployment.environment` into columns.
  - `traceId` preserved; server generates only for legacy missing IDs.
- Span-level:
  - Core: `traceId`, `spanId`, `parentSpanId`, `name`, `startTimeUnixNano`, `endTimeUnixNano`, `traceState`.
  - Status: `status.code`, `status.message`.
  - Scope: `scope.name/version` → `libraryName`/`libraryVersion`.
  - Attributes/events/links: stored as JSONB.
  - Duration: computed server-side.
- GenAI semantic conventions:
  - `gen_ai.model` → `model`
  - `gen_ai.operation.name` → keep as attribute; may suffix span name if missing
  - `gen_ai.usage.prompt_tokens` / `completion_tokens` → `promptTokens` / `completionTokens`; compute `totalTokens`
  - `gen_ai.request.model_parameters` → `modelParameters`
  - `gen_ai.prompt` → `input`; `gen_ai.completion` or `gen_ai.response.*` → `output`
  - Preserve other `gen_ai.*` under attributes.

## Schema Changes (Prisma)
- `Trace`:
  - Add: `resource Json?`, `serviceName String?`, `serviceVersion String?`, `environment String?`.
- `Span`:
  - Add: `attributes Json?`, `events Json?`, `links Json?`, `traceState String?`, `statusCode String?`, `statusMessage String?`, `libraryName String?`, `libraryVersion String?`, `durationMs Int?`.
  - Keep: `model`, `modelParameters`, token and cost fields.
- Indexes:
  - Keep `(projectId, timestamp desc)`, `(traceId, startTime)`.
  - Optional: `(projectId, serviceName)` for filtering by service.
- Migration: add Prisma migration + regenerate client.

## Ingest Service (Go) Work Items
1) **Normalizer**: Create a package to transform OTLP ExportRequest → `TraceWorkflowInput` (Go struct) with validation/limits.
2) **Handlers**:
   - Add `/v1/otlp/traces`: detect content-type (proto vs JSON), decode, normalize.
   - Refactor `/v1/traces` to reuse the same normalization.
3) **Auth/Headers**:
   - Use API key validation result to set project ID; reject mismatches.
   - Strip or overwrite caller-provided project headers.
4) **Rate limiting**: per-project token bucket; return 429 with retry-after.
5) **Instrumentation**: OTel metrics + traces for ingest; include `projectId`, `status`, `reason`.
6) **Config**: env vars for limits, gzip threshold, rate limit, PII allowlist.

## Temporal & Worker (TS) Work Items
1) Update `TraceWorkflowInput` (TS + Go mirror) to include new fields (resource, attributes, events, links, status, traceState, library info, duration).
2) Update `trace.activities.ts`:
   - Persist new columns.
   - Upsert spans on `(traceId, spanId)`; validate project consistency.
3) Keep cost calculation logic; ensure model/tokens map from attributes when present.

## Internal Router (tRPC) Work Items
1) Extend `TraceIngestSchema` (Zod) with new fields.
2) Persistence logic:
   - Upsert spans to achieve idempotency.
   - Compute `duration` server-side.
   - Store attributes/events/links/resource/status in JSONB columns.
3) Reject if project does not exist or mismatched.

## Idempotency & Safety Rules
- Trust caller-provided IDs if present; otherwise generate (legacy only).
- Upsert spans on `(traceId, spanId)`; ignore duplicates with same content; reject cross-project duplicates.
- Compute duration on ingest to avoid bad clocks.
- Drop/limit oversize attributes/events/links; record a metric for truncation.

## Observability & SLOs
- SLO: edge p95 < 300 ms; success rate > 99.9%.
- Metrics: rps, latency, status codes, reject reasons, rate-limit hits, payload size, Temporal start failures, DB upsert failures.
- Tracing: instrument handlers and Temporal start; include projectId and validation outcomes.
- Synthetic: 1-minute OTLP probe; alert on 2 consecutive failures.
- Dashboards: edge latency/error, rate limits, Temporal enqueue latency, DB errors.

## Collector Integration (Optional but Recommended)
- Deploy OTel Collector in front of ingest:
  - Receivers: otlp (grpc/http)
  - Processors: batch, memory_limiter, resource (enforce service.name), attributes (PII scrubbing), tail/parent-based sampling if needed.
  - Exporter: HTTP to ingest `/v1/otlp/traces`.
- Benefits: protocol fan-in, centralized sampling/filtering, backpressure via batch/queue, TLS/mTLS termination.

## Scalability & Backpressure
- Edge limits as above; rate limit per project.
- Temporal start retries with backoff; surface metrics if Temporal unavailable.
- If sustained throughput exceeds DB capacity, optionally introduce a queue (SQS/Kafka) between ingest and worker; Temporal remains primary for now.
- Require gzip to cut bandwidth; tune Go HTTP server `ReadTimeout`/`WriteTimeout`.

## Testing & Verification
- Unit: validators (limits, PII, required fields), OTLP→internal mapping, ID generation fallback, duration computation.
- Integration: ingest OTLP JSON/proto samples (LLM + non-LLM), legacy JSON parity, idempotent retry with same IDs.
- Migration: apply Prisma migration to a staging DB; backfill not required for new columns (nullable).
- Load: k6/locust hitting `/v1/otlp/traces` with gzip; assert p95<300ms at target rps; observe rate-limit behavior.
- Synthetic: deploy probe job to send a minimal OTLP trace every minute.

## Rollout Plan
1) Schema migration + Prisma regen.
2) Update Temporal types (TS + Go) and worker activities.
3) Implement ingest normalizer + OTLP endpoint; refactor legacy path.
4) Extend internal router with new fields and upsert logic.
5) Add metrics/tracing + rate limiting; configure limits via env.
6) Ship docs updates (`docs/GETTING_STARTED.md` with OTLP examples).
7) Shadow traffic: mirror a % of legacy requests into OTLP parser (without writing) to measure reject/accept rates.
8) Enable OTLP ingestion; cut clients over; keep legacy until stable; then deprecate.

## Reference Payloads
- See `docs/specs/ingest/README.md` for the OTLP JSON example; use the same payloads in tests and docs.

## Success Criteria
- OTLP/HTTP (proto+json) accepted with gzip; 202 on success; clear 4xx on validation/rate-limit.
- Legacy JSON produces identical stored records via shared normalization.
- Idempotent span writes; cross-project attempts rejected.
- New OTLP fields stored (resource, attributes, events, links, status, traceState, library, duration); model/token fields populated from GenAI attributes when present.
- Auth enforced with authoritative project binding; ingest edge emits metrics/traces; synthetic probe green; alerts configured.
