# Extensions and Customization Spec (Draft)

This README defines how Ducsigr supports user customization through clear extension surfaces. Each extension has a type, contract, and UI entry point so users know exactly what they are changing.

## Goals
- Make customization explicit by surface: ingestion, data policy, or theme.
- Allow safe flexibility with clear contracts, schemas, and permissions.
- Support per-workspace install, enable/disable, and version rollback.
- Keep user experience simple: pick a surface, install a pack, configure it.

## Non-Goals
- A money-based marketplace. This is an extensions gallery and registry.
- Arbitrary code execution in core services without isolation.
- Breaking changes across workspaces or existing ingest traffic.

## Spec Breakdown
- Spec 01: `docs/extensions/spec-01-ingestion-handlers.md`
- Spec 02: `docs/extensions/spec-02-ingestion-policies.md`
- Spec 03: `docs/extensions/spec-03-workspace-theme.md`
- Spec 04: `docs/extensions/spec-04-extensions-hub.md`
- Spec 05: `docs/extensions/spec-05-custom-dashboards.md`

## Extension Surfaces (Clear Focus Areas)
| Surface | Type | Code or Config | Runs In | Primary Use |
| --- | --- | --- | --- | --- |
| Ingestion pipeline | ingestion.handler | Code | ingest-node | Transform or filter spans |
| Data policy | ingestion.policy | Config | ingest-node | Redaction, retention, sampling |
| Theme | ui.theme | Config | web | UI branding and layout tokens |

## Extension Type Contracts

### 1) ingestion.handler
Purpose: Add a custom handler to the ingestion pipeline to enrich, filter, or route data.

Hooks (explicit placement):
- before_parse
- after_parse
- after_normalize
- after_validate
- after_scrub
- before_persist
- after_persist
- before_response

Contract (TypeScript):
```ts
export type IngestionHook =
  | "before_parse"
  | "after_parse"
  | "after_normalize"
  | "after_validate"
  | "after_scrub"
  | "before_persist"
  | "after_persist"
  | "before_response";

export interface IngestionHandlerExtension {
  id: string;
  name: string;
  version: string;
  hooks: IngestionHook[];
  configSchema?: Record<string, unknown>;
  handle(ctx: PipelineContext, config: unknown): Promise<HandlerResult>;
}
```

Integration points:
- `apps/ingest-node/src/pipeline/index.ts` for hook injection.
- `apps/ingest-node/src/pipeline/runner.ts` for metrics and tracing of handler runs.

### 2) ingestion.policy
Purpose: Declarative rules for scrubbing, retention, and sampling without code.

Contract (JSON example):
```json
{
  "version": "1.0",
  "redaction": {
    "denyKeys": ["password", "secret", "api_key"],
    "allowKeys": ["auth_method", "token_usage"],
    "valuePatterns": ["email", "ssn", "credit_card"]
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

Integration points:
- `apps/ingest-node/src/pipeline/handlers/scrub.handler.ts` should load per-workspace policy.
- `apps/ingest-node/src/pipeline/handlers/validate.handler.ts` can enforce retention or sampling.

### 3) ui.theme
Purpose: Workspace-specific visual style using CSS variables and font tokens.

Contract (JSON example):
```json
{
  "version": "1.0",
  "fonts": {
    "body": "Inter",
    "heading": "Space Grotesk"
  },
  "cssVars": {
    "--background": "0 0% 100%",
    "--foreground": "20 14.3% 4.1%",
    "--primary": "47.9 95.8% 53.1%",
    "--sidebar-background": "0 0% 98%"
  }
}
```

Integration points:
- `apps/web/src/app/globals.css` uses CSS variables that can be overridden per workspace.
- Apply tokens at layout load for `/workspace/[workspaceSlug]/*`.

## Common Extension Manifest
All extensions use a shared manifest for discovery and validation.

```json
{
  "id": "com.acme.scrub-plus",
  "name": "Scrub Plus",
  "version": "0.1.0",
  "type": "ingestion.handler",
  "entry": "dist/index.js",
  "hooks": ["after_normalize", "after_scrub"],
  "configSchema": {
    "type": "object",
    "properties": {
      "scrubMode": { "type": "string", "enum": ["remove", "redact"] }
    }
  },
  "permissions": ["ingest:read-span", "ingest:write-span", "network:none"]
}
```

## Data Model (Draft)
- Extension: id, name, type, ownerWorkspaceId, visibility
- ExtensionVersion: extensionId, version, manifest, entry, createdAt
- ExtensionInstall: workspaceId, extensionVersionId, enabled, configJson
- ExtensionSecret: workspaceId, extensionId, encryptedValues

## API Surface (Draft)
- POST `/api/extensions/install`
- POST `/api/extensions/enable`
- POST `/api/extensions/disable`
- GET `/api/extensions/list?workspaceSlug=...`
- POST `/api/extensions/validate-config`
- POST `/api/themes/preview`

## UI: Mock Screens (ASCII)

Extensions Hub (workspace settings)
```
+--------------------------------------------------------------+
| Extensions Hub                                               |
| Search [____________]   Filter: [All v]  Surface: [All v]    |
|--------------------------------------------------------------|
| Ingestion      | Scrub Plus        | Installed | Configure   |
| Theme          | Solarized Light   | Not Inst. | Install     |
| Ingestion      | Cleanup Router    | Installed | Configure   |
|--------------------------------------------------------------|
| + New Extension  |  Import Manifest  |  Browse Gallery        |
+--------------------------------------------------------------+
```

Extension Detail (ingestion.handler)
```
+--------------------------------------------------------------+
| Scrub Plus (v0.1.0)   Type: Ingestion Handler                |
| Hooks: after_normalize, after_scrub                          |
|--------------------------------------------------------------|
| Config                                                      |
| scrubMode: [remove v]                                       |
| denyKeys:  [password, secret, api_key]                      |
|--------------------------------------------------------------|
| [Disable]  [Save]  [Rollback]                                |
+--------------------------------------------------------------+
```

Ingestion Pipeline View
```
Parse -> Normalize -> Validate -> Scrub -> Auth -> Persist -> Response
             |              |                |
             +-- Scrub Plus +-- Cleanup Router+--(empty)
```

Theme Editor
```
+--------------------------------------------------------------+
| Theme: Solarized Light                                       |
|--------------------------------------------------------------|
| Primary color [#EAB308]   Background [#FFFFFF]               |
| Sidebar bg  [#F8FAFC]     Font Heading [Space Grotesk]       |
|--------------------------------------------------------------|
| Preview (workspace shell)                                    |
|--------------------------------------------------------------|
| [Reset] [Save] [Apply to Workspace]                          |
+--------------------------------------------------------------+
```

## Security and Safety
- Handlers run with timeouts and per-request budget limits.
- Network access is explicit in permissions.
- All configs validated against JSON schema before activation.
- Audit log for installs, enables, disables, and config changes.

## Rollout Plan
Phase 0: ingestion.policy (config-only) and ui.theme (config-only).
Phase 1: ingestion.handler (code) behind feature flag.
Phase 2: shareable extension gallery (no money), versioning UI.

## Open Questions
- Where do extensions execute: same process or isolated worker?
- Should we allow per-project overrides or only per-workspace?
- Do we allow private gallery vs public community registry?
