# Spec 04 - Extensions Hub (Gallery + Registry)

## Summary
A unified place to discover, install, and manage extensions across all surfaces. This is not a paid marketplace; it is a gallery and registry for shareable extensions.

## Goals
- Give a single UI entry point for all extension types.
- Support install, enable/disable, update, and rollback.
- Provide auditability and permissions for safety.

## Non-Goals
- Payments, billing, or licensing workflows.
- Public code execution without review or constraints.

## Core Concepts
- Extension: a named capability (ingestion handler, policy pack, theme).
- ExtensionVersion: immutable version with manifest and artifacts.
- ExtensionInstall: workspace-specific enable state and config.

## Manifest (Shared)
```json
{
  "id": "com.acme.scrub-plus",
  "name": "Scrub Plus",
  "version": "0.1.0",
  "type": "ingestion.handler",
  "entry": "dist/index.js",
  "hooks": ["after_normalize", "after_scrub"],
  "configSchema": { "type": "object", "properties": {} },
  "permissions": ["ingest:read-span", "ingest:write-span", "network:none"]
}
```

## Data Model (Draft)
- Extension: id, name, type, owner, visibility
- ExtensionVersion: extensionId, version, manifest, entry, createdAt
- ExtensionInstall: workspaceId, extensionVersionId, enabled, configJson
- ExtensionAuditLog: workspaceId, extensionId, action, actorId, createdAt

## Extension Sources
- Built-in catalog (shipped with the app)
- Imported manifest (local JSON or URL)
- Private registry (internal Git or storage)

## API Surface (Draft)
- GET `/api/extensions/list?workspaceSlug=...`
- POST `/api/extensions/install`
- POST `/api/extensions/enable`
- POST `/api/extensions/disable`
- POST `/api/extensions/update`
- POST `/api/extensions/uninstall`

## Permissions Model
Each extension declares permissions in its manifest.
- ingest:read-span
- ingest:write-span
- network:none | network:restricted
- ui:theme

Permissions must be approved on install.

## UI Sketch
```
+--------------------------------------------------------------+
| Extensions Hub                                               |
| Search [____________]   Type: [All v]  Surface: [All v]      |
|--------------------------------------------------------------|
| Ingestion  | Scrub Plus       | Installed | Configure         |
| Theme      | Solarized Light  | Not Inst. | Install           |
| Policy     | Strict Redaction | Installed | Configure         |
|--------------------------------------------------------------|
| [Import Manifest] [Browse Gallery]                           |
+--------------------------------------------------------------+
```

Extension Detail
```
+--------------------------------------------------------------+
| Scrub Plus (v0.1.0)                                          |
| Type: Ingestion Handler   Hooks: after_normalize, after_scrub|
| Permissions: ingest:read-span, ingest:write-span             |
|--------------------------------------------------------------|
| [Install] [Cancel]                                           |
+--------------------------------------------------------------+
```

## User Flow
1) Open Settings -> Extensions Hub.  
2) Filter by surface (Ingestion, Policy, Theme).  
3) View details and approve permissions.  
4) Install and configure for the workspace.  
5) Update or roll back versions as needed.
