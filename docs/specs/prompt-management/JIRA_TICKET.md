# Jira Epic: Prompt Management + SDK Retrieval

## Epic Details

| Field | Value |
|-------|-------|
| **Type** | Epic |
| **Summary** | Prompt Management + SDK Retrieval (Prompt Registry) |
| **Priority** | High |
| **Labels** | `feature`, `prompts`, `sdk`, `registry` |
| **Components** | Backend, SDK, Frontend |

---

## Description

Build a first-class prompt registry so teams can store, version, and safely retrieve prompts at runtime without code deploys.

### Problem Statement

Today, prompts are either hardcoded in services or stored as JSON blobs for eval suites. There is no central place to manage prompt versions, no SDK-level fetch API, and no way to search or audit prompt usage across versions.

### Goals

- Central prompt registry with version history, labels (prod, staging, latest), and metadata (tags, owner, model config)
- Runtime prompt retrieval via SDK using API keys, with caching and ETag support
- Built-in grep of prompt content, versions, and metadata
- Trace linkage: every prompt usage is attributable to a prompt version
- Minimal operational overhead: same DB + API key auth as existing ingest

### Non-Goals (v1)

- Full A/B traffic splitting or experimentation orchestration
- Prompt evaluation pipelines (handled by evals)
- Multi-tenant prompt sharing or marketplace

### Key Data Models

- **Prompt**: projectId, name, slug, description, tags, isArchived, versions[], labels[]
- **PromptVersion**: version number, type (text/chat), content, variables, config, metadata, searchText, checksum
- **PromptLabel**: name (production/staging/latest), points to one version

### Technical Details

- Template syntax: `{{variable}}` placeholders
- Support two prompt types: text and chat (messages array)
- ETag = checksum for cache revalidation
- Resolve precedence: version > label > production > latest

### Spec Reference

See: [PROMPT_MANAGEMENT_SPEC.md](./PROMPT_MANAGEMENT_SPEC.md)

---

## Child Stories (Implementation Phases)

### Story 1: Database Schema + Migration
| Field | Value |
|-------|-------|
| **Summary** | [Prompts] Add Prisma schema and migration for prompt models |
| **Story Points** | 3 |
| **Priority** | High |

**Description:**
Create new Prisma schema file `packages/db/prisma/schema/prompt.prisma` with:
- `Prompt` model (id, projectId, name, slug, description, tags, isArchived, timestamps)
- `PromptVersion` model (id, promptId, version, type, content, variables, config, metadata, searchText, checksum, createdById, timestamp)
- `PromptLabel` model (id, promptId, versionId, name, updatedAt, updatedById)

**Acceptance Criteria:**
- [ ] Schema file created with all models
- [ ] Unique constraints: `[projectId, slug]` on Prompt, `[promptId, version]` on PromptVersion, `[promptId, name]` on PromptLabel
- [ ] Indexes for efficient queries
- [ ] Migration runs successfully
- [ ] Prisma client regenerated

---

### Story 2: tRPC Prompt Management Router
| Field | Value |
|-------|-------|
| **Summary** | [Prompts] Implement tRPC router for prompt CRUD + search |
| **Story Points** | 5 |
| **Priority** | High |

**Description:**
Add `packages/api/src/routers/prompts.ts` with workspace-protected endpoints:
- `prompts.list` - List prompts with filters (query, tag, label, includeArchived)
- `prompts.get` - Get prompt metadata + versions
- `prompts.create` - Create new prompt with initial version
- `prompts.createVersion` - Add new version to existing prompt
- `prompts.setLabel` - Assign label (prod/staging/latest) to version
- `prompts.archive` - Archive prompt
- `prompts.searchVersions` - Grep across prompt content and metadata

**Acceptance Criteria:**
- [ ] All endpoints implemented with proper authorization
- [ ] Zod schemas in `packages/api/src/schemas/prompts.ts`
- [ ] Router registered in `routers/index.ts`
- [ ] searchText denormalized on create/update
- [ ] Unit tests for all endpoints

---

### Story 3: Public Prompt Fetch API (Ingest-node)
| Field | Value |
|-------|-------|
| **Summary** | [Prompts] Add public prompt fetch endpoint with API key auth |
| **Story Points** | 5 |
| **Priority** | High |

**Description:**
Expose in ingest-node (same API key auth as `/v1/traces`):
- `GET /v1/prompts/:slug` - Fetch prompt by slug
  - Query params: `label?`, `version?`, `type?`
  - Resolution: version > label > production > latest
  - Returns: metadata + template + config + checksum
  - ETag = checksum, support `If-None-Match` -> 304
- Optional: `POST /v1/prompts/resolve` for server-side variable compilation

**Acceptance Criteria:**
- [ ] Endpoint implemented with API key authentication
- [ ] Version/label resolution logic works correctly
- [ ] ETag caching with 304 responses
- [ ] Rate limiting applied
- [ ] API documentation updated

---

### Story 4: SDK Prompt Client
| Field | Value |
|-------|-------|
| **Summary** | [Prompts] Add prompts client to @cognobserve/sdk |
| **Story Points** | 5 |
| **Priority** | High |

**Description:**
Add prompts client to `@cognobserve/sdk`:
```typescript
const prompt = await CognObserve.prompts.get("movie-critic", {
  label: "production",
  type: "text",
});
const compiled = prompt.compile({ movie: "Dune 2" });
```

Features:
- Uses same API key and endpoint as ingest
- In-memory cache with TTL and ETag revalidation
- Optional `promptsEndpoint` config
- Expose `prefetch`, `clearCache`, `getRaw`
- Return metadata (promptId, version, label) for trace linkage

**Acceptance Criteria:**
- [ ] `CognObserve.prompts.get()` implemented
- [ ] `prompt.compile()` with variable substitution
- [ ] Caching with TTL and ETag support
- [ ] TypeScript types exported
- [ ] SDK documentation updated
- [ ] Unit tests for cache and compile logic

---

### Story 5: Prompt Management UI
| Field | Value |
|-------|-------|
| **Summary** | [Prompts] Build prompt list, editor, version diff, and search UI |
| **Story Points** | 8 |
| **Priority** | Medium |

**Description:**
Build UI components in `apps/web/`:
- Prompt list page with search, tag filters, label filters
- Prompt detail/editor page with version history
- Version diff view (side-by-side comparison)
- Grep search across all prompts and versions
- Create/edit prompt modal with template editor
- Label management (set production/staging)

**Acceptance Criteria:**
- [ ] List page with filtering and search
- [ ] Detail page with version timeline
- [ ] Diff view for comparing versions
- [ ] Template editor with syntax highlighting for `{{variables}}`
- [ ] Label assignment UI
- [ ] Archive/restore functionality
- [ ] Responsive design

---

### Story 6: Trace Linkage + Analytics
| Field | Value |
|-------|-------|
| **Summary** | [Prompts] Add prompt-level trace linkage and analytics |
| **Story Points** | 5 |
| **Priority** | Medium |

**Description:**
Link prompts to traces for impact measurement:
- Add `promptId`, `promptVersion`, `promptLabel` to span metadata
- Filter traces by prompt version
- Prompt analytics dashboard:
  - Usage count per version
  - Latency distribution by version
  - Cost per version
  - Error rate by version
- Version comparison metrics

**Acceptance Criteria:**
- [ ] Span metadata accepts prompt fields
- [ ] Trace list filterable by promptId/version
- [ ] Prompt analytics page with metrics
- [ ] Version comparison view
- [ ] OTLP attributes mapped (future prep)

---

## Story Point Summary

| Story | Points |
|-------|--------|
| Schema + Migration | 3 |
| tRPC Router | 5 |
| Public API (Ingest) | 5 |
| SDK Client | 5 |
| UI | 8 |
| Trace Linkage | 5 |
| **Total** | **31** |

---

## Dependencies

- Existing API key auth in ingest-node
- Prisma multi-file schema support
- tRPC router infrastructure
- SDK transport layer

## Open Questions (from spec)

- [ ] Store prompt content as Json only, or split text/messages columns?
- [ ] Need encrypted storage for prompts with sensitive instructions?
- [ ] Prompt retrieval in ingest-node or new public API service?
- [ ] How strict should variable validation be?
- [ ] Default label: production or latest?
