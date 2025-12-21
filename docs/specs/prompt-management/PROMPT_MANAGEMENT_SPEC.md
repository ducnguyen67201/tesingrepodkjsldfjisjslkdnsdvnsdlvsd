# Prompt Management + SDK Retrieval (Prompt Registry)

Owner: Eng (Prompts)
Status: Draft
Last updated: 2025-XX-XX

## 1. Problem Statement

We need a first-class prompt registry so teams can store, version, and safely
retrieve prompts at runtime without code deploys. Today, prompts are either
hardcoded in services or stored as JSON blobs for eval suites. There is no
central place to manage prompt versions, no SDK-level fetch API, and no way to
search or audit prompt usage across versions.

This spec defines:
- A prompt storage model with versioning and release labels.
- A public runtime API for SDK retrieval using API keys.
- A grep-friendly search experience across prompt content and metadata.
- Tight integration with traces to measure prompt impact (latency, cost, quality).

## 2. Current Baseline (from repo)

- Internal prompts live in code under `apps/worker/src/prompts/*`.
- Eval prompts are stored as JSON in `EvalSuite.prompts` (`packages/db/prisma/schema/eval.prisma`).
- Trace spans store prompt input/output in `Span.input`/`Span.output` for LLM calls
  (`packages/db/prisma/schema/tracing.prisma`).
- The SDK only posts traces to `/v1/traces` (`packages/sdk/src/transport.ts`) and
  has no prompt retrieval client.

## 3. Goals

- Central prompt registry with version history, labels (prod, staging, latest),
  and metadata (tags, owner, model config).
- Runtime prompt retrieval via SDK using API keys, with caching and ETag support.
- Built-in grep of prompt content, versions, and metadata.
- Trace linkage: every prompt usage is attributable to a prompt version.
- Minimal operational overhead: same DB + API key auth as existing ingest.

## 4. Non-Goals (v1)

- Full A/B traffic splitting or experimentation orchestration (future).
- Prompt evaluation pipelines (already handled by evals; can integrate later).
- Multi-tenant prompt sharing or marketplace.

## 5. Data Model (Prisma)

Add new models in `packages/db/prisma/schema/prompt.prisma` (new file):

```prisma
model Prompt {
  id          String   @id @default(cuid())
  projectId   String
  project     Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  name        String
  slug        String
  description String?
  tags        String[] @default([])
  isArchived  Boolean  @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  versions PromptVersion[]
  labels   PromptLabel[]

  @@unique([projectId, slug])
  @@index([projectId, name])
  @@index([projectId, isArchived])
}

model PromptVersion {
  id          String   @id @default(cuid())
  promptId    String
  prompt      Prompt   @relation(fields: [promptId], references: [id], onDelete: Cascade)
  version     Int
  type        String   // "text" | "chat"
  content     Json     // PromptTemplate
  variables   Json?    // PromptVariables schema
  config      Json?    // Model config (temperature, maxTokens, etc.)
  metadata    Json?    // Arbitrary user metadata
  searchText  String?  // Denormalized text for grep
  checksum    String   // SHA-256 of content+config for ETag
  createdById String?
  createdAt   DateTime @default(now())

  @@unique([promptId, version])
  @@index([promptId, createdAt(sort: Desc)])
}

model PromptLabel {
  id          String   @id @default(cuid())
  promptId    String
  prompt      Prompt   @relation(fields: [promptId], references: [id], onDelete: Cascade)
  versionId   String
  version     PromptVersion @relation(fields: [versionId], references: [id], onDelete: Cascade)
  name        String   // "production", "staging", "latest"
  updatedAt   DateTime @updatedAt
  updatedById String?

  @@unique([promptId, name])
}
```

Notes:
- `PromptLabel` mirrors PromptLayer: labels are unique per prompt and point to
  one version.
- `searchText` stores concatenated content + metadata for grep.
- `checksum` supports ETag and cache revalidation in SDK.

## 6. Prompt Content Schema

Support two prompt types, aligned with common SDK patterns:

```ts
export type PromptTemplate =
  | { type: "text"; text: string }
  | { type: "chat"; messages: { role: "system" | "user" | "assistant" | "tool"; content: string }[] };

export type PromptVariable = {
  name: string;
  required?: boolean;
  default?: string;
  description?: string;
};
```

Template syntax: `{{variable}}` placeholders (consistent with Langfuse and
common prompt CMS tooling). A compile step replaces variables, with a strict
option to error on missing values.

## 7. Prompt Management API (tRPC)

Add `packages/api/src/routers/prompts.ts` and register in `routers/index.ts`.
All management endpoints are workspace-protected.

Endpoints:
- `prompts.list` (workspaceSlug, projectId, query?, tag?, label?, includeArchived?)
- `prompts.get` (workspaceSlug, promptId) -> metadata + versions
- `prompts.create` (workspaceSlug, projectId, name, slug, description?, tags?,
  template, variables?, config?, labels?)
- `prompts.createVersion` (workspaceSlug, promptId, template, variables?, config?,
  metadata?, label?)
- `prompts.setLabel` (workspaceSlug, promptId, versionId, label)
- `prompts.archive` (workspaceSlug, promptId)
- `prompts.searchVersions` (workspaceSlug, projectId, query, limit)

Zod schemas live in `packages/api/src/schemas/prompts.ts`.

## 8. Runtime Prompt Fetch API (Public, API Key)

Expose in ingest-node (same API key auth as `/v1/traces`):

- `GET /v1/prompts/:slug`
  - Query: `label?`, `version?`, `type?`
  - Resolve precedence: `version` > `label` > `production` > `latest`.
  - Returns prompt metadata + template + config + checksum.
  - ETag = checksum, support `If-None-Match` -> `304`.

Optional:
- `POST /v1/prompts/resolve` for server-side compilation with variables.
  This reduces client complexity for thin SDK users.

## 9. SDK API Design

Add a prompts client to `@cognobserve/sdk`:

```ts
const prompt = await CognObserve.prompts.get("movie-critic", {
  label: "production",
  type: "text",
});

const compiled = prompt.compile({ movie: "Dune 2", criticlevel: "expert" });
```

SDK behavior:
- Uses same API key and endpoint as ingest by default.
- In-memory cache with TTL and ETag revalidation.
- Optional `promptsEndpoint` config for separate API host.
- Exposes `prefetch`, `clearCache`, and `getRaw` (no compile).

Trace linkage:
- `prompt.get()` returns metadata (`promptId`, `version`, `label`).
- Encourage `span.setMetadata({ promptId, promptVersion, promptLabel })`.
- Future: map these to OTLP attributes and add `span.promptId` filters.

## 10. Grep and Search

Search scope:
- Prompt name, slug, description
- Template content (text or chat messages)
- Variable names, tags, labels, version metadata

Implementation:
- Build `searchText` on create/update by concatenating fields.
- Query with `contains` + `mode: "insensitive"` (matches trace search today).
- Add DB index for `searchText` (future: tsvector + GIN or pg_trgm for scale).

UI:
- Prompt list supports quick search and filters (tag, label, archived, type).
- Version view supports \"grep all versions\" and diff view.

## 11. Competitive Research (Prompt Management Patterns)

From public docs:
- **Langfuse**: prompt management with text/chat types, template variables,
  version labels (production), SDK fetch + compile, and guidance to link prompts
  to traces for performance analysis. It also documents prompt caching.
- **PromptLayer**: prompt registry with versioned templates, tags, release labels
  (prod/staging), retrieval by version or label, metadata per version, and
  tracking templates to measure latency/cost. It supports A/B releases.

Common patterns:
- Prompts as named templates with versions and labels.
- Runtime fetch by label (production) and compile with variables.
- Basic filtering by label/tags, but limited full-text \"grep\" across prompt
  content and version history.

## 12. How We Beat Them (v1 and v1.5)

- True grep across prompt content, tags, variables, and version history.
- Trace-native analytics: prompt version metrics (latency, cost, errors) inside
  the same UI where traces live.
- Prompt diff + regression view: compare metrics and content side-by-side.
- Semantic search (v1.5): optional embeddings to find similar prompts or reuse
  patterns beyond keyword matching.
- CI-friendly prompt sync: import/export prompts from repo for review + approval.

## 13. Rollout Plan

1. Schema + migration for prompt models.
2. tRPC prompt management router (CRUD + search).
3. Ingest-node public prompt fetch endpoint with API key auth.
4. SDK prompt client + caching + compile.
5. UI list + editor + version diff + grep.
6. Trace linkage and prompt-level analytics.

## 14. Testing

- Unit tests for template compilation and variable validation.
- API tests for label/version resolution and ETag caching.
- Auth tests for API key access in ingest-node.
- Search tests for multi-term queries and tag filters.

## 15. Open Questions

- Should we store prompt content as Json only, or split text/messages columns
  for easier indexing?
- Do we need encrypted storage for prompts (e.g., for sensitive instructions)?
- Should prompt retrieval live in ingest-node or a new public API service?
- How strict should variable validation be (compile error vs leave placeholder)?
- What is the default label: production or latest?
