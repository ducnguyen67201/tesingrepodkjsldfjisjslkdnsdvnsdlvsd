# Spec 01 - Ingestion Handler Extensions

## Summary
Provide a safe way for users to add custom handlers into the ingestion pipeline at explicit hook points. Handlers can enrich, filter, or route spans without forking core code.

## Goals
- Let users add code-based handlers at defined hooks.
- Keep core pipeline deterministic and observable.
- Allow per-workspace configuration and versioning.

## Non-Goals
- Arbitrary code execution without constraints.
- Inline editing of production handlers in the UI.
- Replacing core pipeline stages (parse/normalize/etc).

## User Stories
- As a workspace admin, I can add a handler after scrubbing to enrich spans.
- As a workspace admin, I can disable or roll back a handler quickly.
- As a developer, I can test a handler against a sample payload before enabling.

## Hooks (Explicit Placement)
- before_parse
- after_parse
- after_normalize
- after_validate
- after_scrub
- before_persist
- after_persist
- before_response

## Contract
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

## Architecture
- Add a HookHandler that runs registered extensions for a specific hook.
- HookHandler is inserted between core handlers in the pipeline.

Integration points:
- `apps/ingest-node/src/pipeline/index.ts`
- `apps/ingest-node/src/pipeline/runner.ts`

Execution flow (simplified):
```
for each handler in pipeline:
  result = handler.handle(ctx)
  if result.continue is false -> stop pipeline
```

HookHandler flow:
```
extensions = registry.getHandlers(workspaceId, hook)
for ext in extensions:
  result = ext.handle(ctx, ext.config)
  if !result.continue -> return result
return { continue: true }
```

## Ordering and Scope
- Handlers are ordered per workspace at each hook.
- Workspace-scoped handlers run after auth, when workspace can be inferred.
- Global handlers can run before auth if needed.

## Error Handling
- If a handler returns `continue: false` with an error, send that error.
- If a handler throws, map to INTERNAL_ERROR and stop.

## Performance and Safety
- Max handlers per hook (default 5).
- Timeout per handler (default 50ms) and total hook budget (default 200ms).
- Deny network access unless permissions explicitly allow it.
- Record per-handler metrics for duration and error rate.

## Data and Storage
Uses the shared extension registry described in Spec 04:
- Extension
- ExtensionVersion
- ExtensionInstall (workspace, enabled, config)

## API Surface (Draft)
- POST `/api/extensions/ingestion/validate-config`
- POST `/api/extensions/ingestion/test`
- POST `/api/extensions/ingestion/order`

## UI Sketch
```
+--------------------------------------------------------------+
| Ingestion Pipeline                                           |
| Parse -> Normalize -> Validate -> Scrub -> Auth -> Persist   |
|   |           |              |              |                |
|   +-- Hook: after_parse      +-- Hook: after_scrub            |
|--------------------------------------------------------------|
| Handlers at after_scrub                                    [ ]|
| 1. Scrub Plus            Enabled  v0.1.0        [Configure]  |
| 2. Cleanup Router        Enabled  v1.2.3        [Configure]  |
|--------------------------------------------------------------|
| [Add Handler]   [Reorder]   [Test with Sample]                |
+--------------------------------------------------------------+
```

## User Flow
1) Go to Settings -> Extensions Hub -> Ingestion.  
2) Click "Add Handler" and select a handler from the gallery or import a manifest.  
3) Configure settings and run a test payload.  
4) Set order for this hook and enable the handler.  
5) Monitor handler metrics and roll back if needed.
