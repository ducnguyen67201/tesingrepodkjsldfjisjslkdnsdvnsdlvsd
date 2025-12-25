# Log Ingestion Implementation Plan

## Feature Overview
Add OTLP Logs ingestion to the ingest-node service. Logs are stored alongside traces in Postgres with trace correlation and basic indexing.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     LOG INGESTION FLOW                          │
└─────────────────────────────────────────────────────────────────┘

  User App (with OTel SDK)           OTel Collector
  (Pino/Winston instrumented)        (for raw console.log)
         │                                  │
         │ OTLP HTTP                        │ OTLP HTTP
         ▼                                  ▼
  ┌─────────────────────────────────────────────────────────┐
  │           POST /v1/logs (ingest-node)                   │
  │                                                         │
  │  ┌─────────────────────────────────────────────────┐   │
  │  │              LOGS PIPELINE                       │   │
  │  │                                                  │   │
  │  │  1. ParseLogsHandler    - Parse protobuf/JSON   │   │
  │  │  2. NormalizeLogsHandler - Map to LogRecord     │   │
  │  │  3. ValidateLogsHandler - Enforce limits        │   │
  │  │  4. ScrubLogsHandler    - Redact PII            │   │
  │  │  5. AuthHandler         - Resolve project       │   │
  │  │  6. PersistLogsHandler  - Insert to DB          │   │
  │  │  7. LogsResponseHandler - Return counts         │   │
  │  └─────────────────────────────────────────────────┘   │
  └─────────────────────────────────────────────────────────┘
                        │
                        ▼
  ┌─────────────────────────────────────────────────────────┐
  │                    PostgreSQL                           │
  │                                                         │
  │   LogRecord table with indexes on:                      │
  │   - (projectId, timestamp DESC)                         │
  │   - (projectId, severityNumber)                         │
  │   - (projectId, serviceName)                            │
  │   - (projectId, traceId) -- for trace correlation       │
  └─────────────────────────────────────────────────────────┘
```

---

## Implementation Plan

### Phase 1: Database Schema

**File:** `packages/db/prisma/schema/tracing.prisma`

Add LogRecord model after the Span model:

```prisma
// ============================================================
// OTLP Log Record Model
// ============================================================

model LogRecord {
  id                     String   @id @default(cuid())
  projectId              String
  project                Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)

  // Resource attributes (promoted for filtering)
  serviceName            String?
  serviceVersion         String?
  environment            String?
  resource               Json?

  // Instrumentation scope
  scopeName              String?
  scopeVersion           String?

  // Timing
  timestamp              DateTime
  observedTime           DateTime?

  // Severity (OTLP SeverityNumber: 1-24)
  severityNumber         Int?
  severityText           String?

  // Body + attributes
  body                   Json?
  bodyText               String?   @db.Text
  attributes             Json?
  droppedAttributesCount Int?

  // Trace correlation (optional)
  traceId                String?
  spanId                 String?
  flags                  Int?

  // Ingest metadata
  ingestSource           String?   // "otlp", "collector.filelog", "sdk"

  // Audit
  createdAt              DateTime  @default(now())

  @@index([projectId, timestamp(sort: Desc)])
  @@index([projectId, severityNumber])
  @@index([projectId, serviceName])
  @@index([projectId, traceId])
  @@index([timestamp])
}
```

**Migration:** `pnpm db:migrate --name add_log_records`

---

### Phase 2: Zod Schemas

**File:** `packages/api/src/schemas/otlp-logs.ts` (NEW)

```typescript
/**
 * OTLP Logs Zod Schemas
 *
 * Defines schemas for parsing and validating OTLP log data.
 * @see https://opentelemetry.io/docs/specs/otel/logs/
 */
import { z } from "zod";
import { OtlpAnyValueSchema, OtlpAttributeSchema, OtlpResourceSchema, OtlpScopeSchema } from "./otlp";

// ============================================================================
// OTLP Severity
// ============================================================================

export const OtlpSeverityNumberSchema = z.number().int().min(0).max(24).optional();
export type OtlpSeverityNumber = z.infer<typeof OtlpSeverityNumberSchema>;

export const SEVERITY_TEXT_MAP: Record<number, string> = {
  0: "UNSPECIFIED",
  1: "TRACE", 2: "TRACE2", 3: "TRACE3", 4: "TRACE4",
  5: "DEBUG", 6: "DEBUG2", 7: "DEBUG3", 8: "DEBUG4",
  9: "INFO", 10: "INFO2", 11: "INFO3", 12: "INFO4",
  13: "WARN", 14: "WARN2", 15: "WARN3", 16: "WARN4",
  17: "ERROR", 18: "ERROR2", 19: "ERROR3", 20: "ERROR4",
  21: "FATAL", 22: "FATAL2", 23: "FATAL3", 24: "FATAL4",
};

// ============================================================================
// OTLP Log Record
// ============================================================================

export const OtlpLogRecordSchema = z.object({
  timeUnixNano: z.string().optional(),
  observedTimeUnixNano: z.string().optional(),
  severityNumber: OtlpSeverityNumberSchema,
  severityText: z.string().optional(),
  body: OtlpAnyValueSchema.optional(),
  attributes: z.array(OtlpAttributeSchema).optional(),
  droppedAttributesCount: z.number().optional(),
  flags: z.number().optional(),
  traceId: z.string().optional(),
  spanId: z.string().optional(),
});
export type OtlpLogRecord = z.infer<typeof OtlpLogRecordSchema>;

// ============================================================================
// OTLP Scope Logs
// ============================================================================

export const OtlpScopeLogsSchema = z.object({
  scope: OtlpScopeSchema.optional(),
  logRecords: z.array(OtlpLogRecordSchema),
  schemaUrl: z.string().optional(),
});
export type OtlpScopeLogs = z.infer<typeof OtlpScopeLogsSchema>;

// ============================================================================
// OTLP Resource Logs
// ============================================================================

export const OtlpResourceLogsSchema = z.object({
  resource: OtlpResourceSchema.optional(),
  scopeLogs: z.array(OtlpScopeLogsSchema),
  schemaUrl: z.string().optional(),
});
export type OtlpResourceLogs = z.infer<typeof OtlpResourceLogsSchema>;

// ============================================================================
// OTLP Export Logs Request
// ============================================================================

export const OtlpExportLogsRequestSchema = z.object({
  resourceLogs: z.array(OtlpResourceLogsSchema),
});
export type OtlpExportLogsRequest = z.infer<typeof OtlpExportLogsRequestSchema>;

// ============================================================================
// Normalized Log Record (for database persistence)
// ============================================================================

export const NormalizedLogRecordSchema = z.object({
  // Resource attributes
  serviceName: z.string().optional(),
  serviceVersion: z.string().optional(),
  environment: z.string().optional(),
  resource: z.record(z.string(), z.unknown()).optional(),

  // Scope
  scopeName: z.string().optional(),
  scopeVersion: z.string().optional(),

  // Timing
  timestamp: z.date(),
  observedTime: z.date().optional(),

  // Severity
  severityNumber: z.number().optional(),
  severityText: z.string().optional(),

  // Body + attributes
  body: z.unknown().optional(),
  bodyText: z.string().optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
  droppedAttributesCount: z.number().optional(),

  // Trace correlation
  traceId: z.string().optional(),
  spanId: z.string().optional(),
  flags: z.number().optional(),

  // Ingest metadata
  ingestSource: z.string().optional(),
});
export type NormalizedLogRecord = z.infer<typeof NormalizedLogRecordSchema>;

// ============================================================================
// Ingest Logs Response
// ============================================================================

export const IngestLogsResponseSchema = z.object({
  accepted: z.boolean(),
  logRecordCount: z.number(),
  partialSuccess: z.object({
    rejectedLogRecords: z.number().optional(),
    errorMessage: z.string().optional(),
  }).optional(),
});
export type IngestLogsResponse = z.infer<typeof IngestLogsResponseSchema>;
```

**Update:** `packages/api/src/schemas/index.ts` - Add export for otlp-logs

---

### Phase 3: Environment Configuration

**File:** `apps/ingest-node/src/config/env.ts`

Add new environment variables:

```typescript
// In server schema, add:
MAX_LOGS_PER_REQUEST: z.coerce.number().default(1000),
MAX_ATTR_PER_LOG: z.coerce.number().default(64),
MAX_LOG_BODY_LEN: z.coerce.number().default(8192),

// In runtimeEnv, add:
MAX_LOGS_PER_REQUEST: process.env.MAX_LOGS_PER_REQUEST,
MAX_ATTR_PER_LOG: process.env.MAX_ATTR_PER_LOG,
MAX_LOG_BODY_LEN: process.env.MAX_LOG_BODY_LEN,

// In config.limits, add:
maxLogsPerRequest: env.MAX_LOGS_PER_REQUEST,
maxAttrPerLog: env.MAX_ATTR_PER_LOG,
maxLogBodyLen: env.MAX_LOG_BODY_LEN,
```

---

### Phase 4: Pipeline Types

**File:** `apps/ingest-node/src/pipeline/types.ts`

Add logs-specific types:

```typescript
import type { OtlpExportLogsRequest, NormalizedLogRecord } from "@cognobserve/api/schemas";

// Add to PipelineContext interface:
export interface PipelineContext {
  // ... existing fields ...

  // Logs pipeline fields
  parsedLogsRequest?: OtlpExportLogsRequest;
  normalizedLogRecords?: NormalizedLogRecord[];
  persistedLogCount?: number;
}

// Add to PipelineErrorCodes:
export const PipelineErrorCodes = {
  // ... existing codes ...

  // Logs-specific errors
  TOO_MANY_LOGS: "TOO_MANY_LOGS",
  LOG_BODY_TOO_LARGE: "LOG_BODY_TOO_LARGE",
} as const;
```

---

### Phase 5: Pipeline Handlers

#### 5.1 ParseLogsHandler
**File:** `apps/ingest-node/src/pipeline/logs/parse-logs.handler.ts` (NEW)

Similar to ParseHandler but parses `OtlpExportLogsRequestSchema`.

#### 5.2 NormalizeLogsHandler
**File:** `apps/ingest-node/src/pipeline/logs/normalize-logs.handler.ts` (NEW)

- Extract resource attributes (serviceName, serviceVersion, environment)
- Extract scope (scopeName, scopeVersion)
- Convert timeUnixNano to Date
- Extract body as JSON and bodyText as string
- Flatten attributes to key-value map

#### 5.3 ValidateLogsHandler
**File:** `apps/ingest-node/src/pipeline/logs/validate-logs.handler.ts` (NEW)

- Enforce MAX_LOGS_PER_REQUEST
- Enforce MAX_ATTR_PER_LOG
- Truncate bodyText to MAX_LOG_BODY_LEN
- Validate timestamp (reject >24h skew)

#### 5.4 ScrubLogsHandler
**File:** `apps/ingest-node/src/pipeline/logs/scrub-logs.handler.ts` (NEW)

- Apply PII scrubbing to bodyText
- Apply PII scrubbing to attribute values
- Reuse patterns from existing ScrubHandler

#### 5.5 PersistLogsHandler
**File:** `apps/ingest-node/src/pipeline/logs/persist-logs.handler.ts` (NEW)

- Batch insert log records using `prisma.logRecord.createMany()`
- Set ingestSource to "otlp"

#### 5.6 LogsResponseHandler
**File:** `apps/ingest-node/src/pipeline/logs/response-logs.handler.ts` (NEW)

- Return 202 Accepted with log record count
- Format per OTLP response spec

---

### Phase 6: Logs Pipeline Runner

**File:** `apps/ingest-node/src/pipeline/logs/index.ts` (NEW)

```typescript
import { PipelineRunner } from "../runner.js";
import { ParseLogsHandler } from "./parse-logs.handler.js";
import { NormalizeLogsHandler } from "./normalize-logs.handler.js";
import { ValidateLogsHandler } from "./validate-logs.handler.js";
import { ScrubLogsHandler } from "./scrub-logs.handler.js";
import { AuthHandler } from "../handlers/auth.handler.js";  // Reuse
import { PersistLogsHandler } from "./persist-logs.handler.js";
import { LogsResponseHandler } from "./response-logs.handler.js";

export function createLogsIngestionPipeline(): PipelineRunner {
  return new PipelineRunner([
    new ParseLogsHandler(),
    new NormalizeLogsHandler(),
    new ValidateLogsHandler(),
    new ScrubLogsHandler(),
    new AuthHandler(),  // Reuse existing auth handler
    new PersistLogsHandler(),
    new LogsResponseHandler(),
  ]);
}
```

---

### Phase 7: Routes

**File:** `apps/ingest-node/src/routes/logs.ts` (NEW)

```typescript
import { Router, type Router as RouterType } from "express";
import express from "express";
import { config } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { createLogsIngestionPipeline, type PipelineContext } from "../pipeline/logs/index.js";
import { rateLimitMiddleware } from "../middleware/rate-limit.js";

export const logsRouter: RouterType = Router();

const pipeline = createLogsIngestionPipeline();

logsRouter.use(rateLimitMiddleware);

logsRouter.use(
  express.raw({
    type: () => true,
    limit: config.limits.maxPayloadBytes,
  })
);

logsRouter.post("/", async (req, res) => {
  try {
    const contentType = req.headers["content-type"] ?? "";
    const contentEncoding = req.headers["content-encoding"] ?? "";

    logger.debug({ contentType, contentEncoding }, "Received logs ingestion request");

    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from([]);

    const ctx: PipelineContext = {
      req,
      res,
      rawBody,
      contentType,
      contentEncoding: contentEncoding as string,
    };

    await pipeline.execute(ctx);
  } catch (error) {
    logger.error({ error }, "Unexpected error in logs ingestion");
    if (!res.headersSent) {
      res.status(500).json({
        error: "INTERNAL_ERROR",
        message: "Failed to process log data",
      });
    }
  }
});
```

**Update:** `apps/ingest-node/src/server.ts`

```typescript
import { logsRouter } from "./routes/logs.js";

// Add routes (before JSON body parser):
app.use("/v1/logs", logsRouter);
app.use("/v1/otlp/logs", logsRouter);  // Alias
```

---

### Phase 8: Metrics

**File:** `apps/ingest-node/src/lib/metrics.ts`

Add logs-specific metrics:

```typescript
// Logs request counter
export const logsRequestCounter = new Counter({
  name: "ingest_logs_requests_total",
  help: "Total number of logs ingestion requests",
  labelNames: ["status", "content_type"],
  registers: [registry],
});

// Log records counter
export const logRecordCounter = new Counter({
  name: "ingest_log_records_total",
  help: "Total number of log records ingested",
  labelNames: ["project_id", "status"],
  registers: [registry],
});

// Logs reject counter
export const logsRejectCounter = new Counter({
  name: "ingest_logs_rejects_total",
  help: "Total number of rejected log requests",
  labelNames: ["reason"],
  registers: [registry],
});

// Logs payload size histogram
export const logsPayloadSize = new Histogram({
  name: "ingest_logs_payload_bytes",
  help: "Logs request payload size in bytes",
  buckets: [1024, 10240, 51200, 102400, 262144, 524288],
  registers: [registry],
});
```

---

### Phase 9: Proto Parser (Optional)

**File:** `apps/ingest-node/src/lib/otlp-logs-proto.ts` (NEW)

If protobuf support is needed, add protobuf parsing for logs.
Can be deferred to v1.1 if JSON-only is acceptable for v1.

---

## File Summary

| File | Action | Description |
|------|--------|-------------|
| `packages/db/prisma/schema/tracing.prisma` | MODIFY | Add LogRecord model |
| `packages/api/src/schemas/otlp-logs.ts` | NEW | OTLP logs Zod schemas |
| `packages/api/src/schemas/index.ts` | MODIFY | Export otlp-logs |
| `apps/ingest-node/src/config/env.ts` | MODIFY | Add logs limits config |
| `apps/ingest-node/src/pipeline/types.ts` | MODIFY | Add logs context fields |
| `apps/ingest-node/src/pipeline/logs/parse-logs.handler.ts` | NEW | Parse OTLP logs |
| `apps/ingest-node/src/pipeline/logs/normalize-logs.handler.ts` | NEW | Normalize log records |
| `apps/ingest-node/src/pipeline/logs/validate-logs.handler.ts` | NEW | Validate limits |
| `apps/ingest-node/src/pipeline/logs/scrub-logs.handler.ts` | NEW | PII scrubbing |
| `apps/ingest-node/src/pipeline/logs/persist-logs.handler.ts` | NEW | Persist to DB |
| `apps/ingest-node/src/pipeline/logs/response-logs.handler.ts` | NEW | Return response |
| `apps/ingest-node/src/pipeline/logs/index.ts` | NEW | Logs pipeline factory |
| `apps/ingest-node/src/routes/logs.ts` | NEW | Express route |
| `apps/ingest-node/src/server.ts` | MODIFY | Register logs routes |
| `apps/ingest-node/src/lib/metrics.ts` | MODIFY | Add logs metrics |

---

## Execution Order

1. **Database schema + migration**
   - Add LogRecord model to tracing.prisma
   - Run `pnpm db:migrate --name add_log_records`

2. **Zod schemas**
   - Create `packages/api/src/schemas/otlp-logs.ts`
   - Export from index.ts

3. **Environment config**
   - Add MAX_LOGS_PER_REQUEST, MAX_ATTR_PER_LOG, MAX_LOG_BODY_LEN

4. **Pipeline types**
   - Add logs fields to PipelineContext
   - Add logs error codes

5. **Pipeline handlers** (in order)
   - ParseLogsHandler
   - NormalizeLogsHandler
   - ValidateLogsHandler
   - ScrubLogsHandler
   - PersistLogsHandler
   - LogsResponseHandler

6. **Pipeline factory**
   - Create createLogsIngestionPipeline()

7. **Routes**
   - Create logsRouter
   - Register in server.ts

8. **Metrics**
   - Add logs-specific counters and histograms

9. **Tests**
   - Unit tests for each handler
   - Integration test for /v1/logs endpoint

---

## Success Criteria

- [ ] `POST /v1/logs` accepts OTLP JSON and returns 202
- [ ] `POST /v1/otlp/logs` (alias) works identically
- [ ] LogRecord persists with all fields populated
- [ ] Trace correlation works when traceId/spanId present
- [ ] PII scrubbing applies to bodyText and attributes
- [ ] Metrics exported for logs ingestion
- [ ] Validation rejects oversized payloads
- [ ] p95 latency < 300ms at target load
