# Spec 02 - Ingestion Policies (Config-Only)

## Summary
Provide a declarative policy system for redaction, retention, and sampling. Policies are JSON configs that apply per workspace (with optional project overrides).

## Goals
- Give admins a no-code way to control data hygiene.
- Apply policies predictably inside the ingestion pipeline.
- Support versioning, preview, and rollback.

## Non-Goals
- Full scripting or code execution.
- Per-user policy overrides.

## Policy Structure (Draft)
```json
{
  "version": "1.0",
  "redaction": {
    "denyKeys": ["password", "secret", "api_key"],
    "allowKeys": ["auth_method", "token_usage"],
    "valuePatterns": ["email", "ssn", "credit_card", "ip"]
  },
  "retentionDays": 30,
  "sampling": {
    "defaultRate": 1.0,
    "serviceOverrides": {
      "checkout-service": 0.25
    }
  }
}
```

## Architecture
- Store policy JSON per workspace (optional per project override).
- Load policy during pipeline execution and apply rules in handlers.

Integration points:
- `apps/ingest-node/src/pipeline/handlers/scrub.handler.ts` for redaction.
- `apps/ingest-node/src/pipeline/handlers/validate.handler.ts` for limits and sampling.

Policy evaluation:
1) Resolve policy: project override if present, else workspace policy.
2) Apply redaction before persistence.
3) Apply sampling decisions before persistence.
4) Apply retention rules during storage or cleanup jobs.

## Validation
- Validate against JSON schema on save.
- Reject invalid patterns or unsafe deny/allow conflicts.

## Rollback
- Keep policy versions and allow instant rollback.
- Annotate changes with audit log entries.

## API Surface (Draft)
- GET `/api/policies/ingestion?workspaceSlug=...`
- POST `/api/policies/ingestion/validate`
- POST `/api/policies/ingestion/publish`
- POST `/api/policies/ingestion/rollback`

## UI Sketch
```
+--------------------------------------------------------------+
| Ingestion Policy                                             |
|--------------------------------------------------------------|
| Redaction                                                    |
| Deny Keys: [password] [secret] [api_key]  [+ Add]            |
| Allow Keys: [auth_method] [token_usage]     [+ Add]          |
| Value Patterns: [email] [ssn] [credit_card] [+ Add]          |
|--------------------------------------------------------------|
| Sampling                                                     |
| Default Rate: [ 100% v ]                                    |
| Service Overrides:                                           |
| - checkout-service   [25% v]                                 |
|--------------------------------------------------------------|
| Retention                                                    |
| Retention Days: [30]                                         |
|--------------------------------------------------------------|
| [Preview with Sample]  [Save Draft]  [Publish]  [Rollback]   |
+--------------------------------------------------------------+
```

## User Flow
1) Go to Settings -> Data Policy -> Ingestion Policy.  
2) Add or edit redaction rules, sampling, and retention.  
3) Preview policy on a sample payload to see changes.  
4) Publish policy to activate.  
5) Monitor data quality and rollback if needed.
