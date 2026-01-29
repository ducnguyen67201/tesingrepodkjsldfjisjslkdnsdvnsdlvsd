# Log Ingestion (OTLP Logs + Raw Console Capture)

## Summary
Add OTLP Logs ingestion to the ingest-node service and provide a collector-based
path to capture raw console.log/stdout lines. Logs are stored alongside traces
in Postgres with basic indexing and trace correlation.

## Goals
- Accept OTLP/HTTP logs (protobuf + JSON) at standard endpoints.
- Store log records with resource metadata, severity, timestamps, body, and attributes.
- Support trace/span correlation when `traceId`/`spanId` are present.
- Provide a documented way to ingest raw console.log via OpenTelemetry Collector.
- Reuse existing auth, rate limiting, and PII scrubbing patterns.

## Non-Goals (v1)
- Metrics ingestion.
- Full-text search at scale (start with basic indexes).
- Custom on-host agent inside this repo (collector config only).
- UI log explorer (backend ingestion only).

## Interfaces

### Endpoints
- `POST /v1/logs` (OTLP/HTTP)
- Optional alias: `POST /v1/otlp/logs`
- `GET /health` (no auth)

### Content Types
- `application/x-protobuf`
- `application/json`
- `Content-Encoding: gzip` supported

### Responses
- `202 Accepted` on success with counts.
- `4xx` with structured error code on validation/auth failures.
- `5xx` only for internal errors.

## OTLP Log Mapping

OTLP Logs payload shape:
`ExportLogsServiceRequest` -> `resourceLogs[]` -> `scopeLogs[]` -> `logRecords[]`.

Normalized mapping rules:
- `resource.attributes` -> `resource` JSON.
- Promote `service.name`, `service.version`, `deployment.environment` into columns.
- `scope.name` -> `scopeName`, `scope.version` -> `scopeVersion`.
- `logRecord.timeUnixNano` -> `timestamp` (fallback to `observedTimeUnixNano`).
- `logRecord.observedTimeUnixNano` -> `observedTime`.
- `logRecord.severityNumber`/`severityText` -> `severityNumber`/`severityText`.
- `logRecord.body` (AnyValue) -> `body` JSON and `bodyText` string.
- `logRecord.attributes` -> `attributes` JSON.
- `logRecord.traceId`/`spanId` -> correlation fields (optional).
- `logRecord.flags` -> `flags`.

## Storage Model (Postgres)

Add a log record table in Prisma. Suggested model:

```prisma
model LogRecord {
  id                  String   @id @default(cuid())
  projectId           String
  project             Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)

  // Resource attributes (promoted for filtering)
  serviceName         String?
  serviceVersion      String?
  environment         String?
  resource            Json?

  // Scope
  scopeName           String?
  scopeVersion        String?

  // Timing
  timestamp           DateTime
  observedTime        DateTime?

  // Severity
  severityNumber      Int?
  severityText        String?

  // Body + attributes
  body                Json?
  bodyText            String?
  attributes          Json?
  droppedAttributesCount Int?

  // Trace correlation
  traceId             String?
  spanId              String?
  flags               Int?

  // Ingest metadata
  ingestSource        String? // otlp, collector.filelog, sdk, etc (optional)

  createdAt           DateTime @default(now())

  @@index([projectId, timestamp(sort: Desc)])
  @@index([projectId, severityNumber])
  @@index([projectId, serviceName])
  @@index([projectId, traceId])
  @@index([timestamp])
}
```

Retention options (choose one):
- Time-based delete job (daily) via a worker/cron.
- Partition by month in Postgres (future enhancement).

## Ingest Pipeline (ingest-node)

Add a dedicated logs pipeline mirroring the trace pipeline:

1) `ParseLogsHandler` - parse OTLP Logs protobuf/JSON.
2) `NormalizeLogsHandler` - map to `NormalizedLogRecord`.
3) `ValidateLogsHandler` - enforce limits and timestamp sanity.
4) `ScrubLogsHandler` - redact PII in body/attributes.
5) `AuthHandler` - resolve project via API key.
6) `PersistLogsHandler` - insert log records.
7) `ResponseHandler` (log variant) - return counts.

Suggested file layout:
- `apps/ingest-node/src/routes/logs.ts`
- `apps/ingest-node/src/pipeline/logs/*`
- `apps/ingest-node/src/lib/otlp-logs-proto.ts`
- `packages/api/src/schemas/otlp-logs.ts`
- `packages/db/prisma/schema/tracing.prisma` (add LogRecord model)

Add routes in `apps/ingest-node/src/server.ts`:
- `app.use("/v1/logs", logsRouter)`
- `app.use("/v1/otlp/logs", logsRouter)`

## Validation & Guardrails
Defaults (tunable via env):
- Max payload: reuse `MAX_PAYLOAD_BYTES`.
- `MAX_LOGS_PER_REQUEST`: 1000.
- `MAX_ATTR_PER_LOG`: 64.
- `MAX_LOG_BODY_LEN`: 8192 bytes (truncate if exceeded).
- Timestamp drift: reject or clamp >24h skew.
- Drop attributes with sensitive keys (see PII scrubber).

Add new env vars in `apps/ingest-node/src/config/env.ts`:
- `MAX_LOGS_PER_REQUEST`
- `MAX_ATTR_PER_LOG`
- `MAX_LOG_BODY_LEN`

Extend `PipelineErrorCodes` with:
- `TOO_MANY_LOGS`
- `LOG_BODY_TOO_LARGE` (if rejecting instead of truncating)

## PII Scrubbing
Apply existing scrubbing rules to:
- `bodyText` (string)
- `attributes` values
- Any string fields promoted from attributes

Optionally expose allowlist/denylist overrides via env.

## Raw console.log Capture (Collector-Based)

Raw console.log is stdout/stderr text. Use OpenTelemetry Collector to tail
log files or container logs and export OTLP logs to `/v1/logs`.

Example (filelog receiver, plain text fallback):

```yaml
receivers:
  filelog:
    include:
      - /var/log/app/*.log
    start_at: end
    operators:
      - type: regex_parser
        regex: '^(?P<timestamp>[^ ]+) (?P<level>DEBUG|INFO|WARN|ERROR) (?P<message>.*)$'
        timestamp:
          parse_from: attributes.timestamp
          layout: '%Y-%m-%dT%H:%M:%S.%LZ'
        severity:
          parse_from: attributes.level
      - type: move
        from: attributes.message
        to: body
      - type: remove
        field: attributes.level
      - type: remove
        field: attributes.timestamp

processors:
  resource:
    attributes:
      - key: service.name
        value: my-service
        action: upsert
      - key: deployment.environment
        value: production
        action: upsert
  batch: {}

exporters:
  otlphttp:
    endpoint: http://ingest-node:8080/v1/logs
    headers:
      x-api-key: ${DUCSIGR_API_KEY}

service:
  pipelines:
    logs:
      receivers: [filelog]
      processors: [resource, batch]
      exporters: [otlphttp]
```

Notes:
- For JSON logs (pino/winston), swap in a `json_parser` operator.
- For Docker/K8s, use `filelog` on container log paths and `k8sattributes`.
- If the app uses an OTLP log exporter directly, it can bypass the collector.

## Trace Correlation
- If `traceId`/`spanId` are present in log records, store them as-is.
- For raw console.log, trace context is usually absent unless the app
  uses an OTel log SDK or a logging bridge.

## Metrics & Observability
Add ingest metrics for logs in `apps/ingest-node/src/lib/metrics.ts`:
- `ingest_logs_total` (requests)
- `ingest_log_records_total` (records accepted)
- `ingest_log_rejects_total` (reject reasons)
- `ingest_log_payload_bytes` (payload sizes)

Reuse existing request latency and handler duration histograms.

## Testing
- Unit: parse/normalize/validate for OTLP log JSON + protobuf.
- Unit: PII scrubbing for body and attributes.
- Integration: POST `/v1/logs` with OTLP JSON sample, assert inserts.
- E2E: collector config tailing a temp log file, verify logs appear in DB.

## Rollout Plan
1) Add Prisma model + migration; regenerate client.
2) Add OTLP log schemas + proto parser.
3) Implement logs pipeline and route.
4) Add config + metrics + tests.
5) Document collector config and SDK options.
6) Deploy behind a feature flag; enable in staging; then production.

## Success Criteria
- `/v1/logs` accepts OTLP JSON/proto and returns 202.
- Logs persist with service metadata, severity, timestamps, and attributes.
- Raw console.log captured via collector appears in DB.
- Ingest p95 < 300ms at target load; rejects provide clear error codes.
