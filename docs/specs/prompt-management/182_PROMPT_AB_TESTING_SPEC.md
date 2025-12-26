# Prompt A/B Testing and Comparison

Owner: Eng (Prompts)
Status: Draft
Last updated: 2025-XX-XX

## 1. Problem Statement

Teams want to compare two prompts side-by-side and run controlled A/B tests to
prove improvements. Today, Ducsigr has a prompt registry and runtime
retrieval, but no way to select two prompts for comparison or route live traffic
between variants. We also want to extend performance analysis later using ingest
data and RCA outcomes.

This spec defines:
- A prompt comparison workflow (manual, side-by-side).
- A/B experimentation with deterministic assignment and trace linkage.
- Analytics by variant (latency, cost, error rate).
- A roadmap for ingest and RCA-driven performance insights.

## 2. Goals

- Allow users to select two prompt versions or two prompts and compare them.
- Run A/B experiments with sticky assignment and configurable weights.
- Attribute usage, latency, cost, and errors to each variant via trace linkage.
- Provide a simple UI for setup, monitoring, and winner promotion.

## 3. Non-Goals (v1)

- Multi-armed bandits or auto-optimization.
- Statistical significance engine or automatic winner selection.
- Multi-tenant experiments or prompt marketplace.
- End-to-end eval pipelines (covered by evals, integrated later).

## 4. Current Baseline (from repo)

- Prompt registry + versions + labels in `packages/db/prisma/schema/prompt.prisma`.
- Management API in `packages/api/src/routers/prompts.ts`.
- Public runtime fetch endpoint in `apps/ingest-node/src/routes/prompts.ts`.
- SDK prompt client in `packages/sdk/src/prompts.ts`.
- Prompt analytics UI exists but returns mock data.

## 5. User Stories

- As a prompt owner, I can compare two prompts and view diffs and metadata.
- As a developer, I can run a live A/B test and route traffic reliably.
- As a PM, I can see variant-level metrics and pick a winner.

## 6. Functional Requirements

### 6.1 Prompt Comparison (manual)

- Select two prompt versions or two prompt slugs.
- Side-by-side diff of template content, variables, and config.
- Optional "run in playground" for both variants with shared variables.
- Save comparison history (optional, v1.5).

### 6.2 A/B Experiment Setup

- Create experiment with:
  - name, slug, description, tags
  - projectId, status (draft, running, paused, completed)
  - allocationPct (0-100) to limit exposure
  - assignmentKey strategy (userId, sessionId, custom)
  - two variants (A and B) tied to prompt versions
  - variant weights (sum = 10000 basis points)

### 6.3 Runtime Assignment

- Deterministic bucketing with sticky assignment.
- Resolution via a public API endpoint with API key auth.
- Fallback to default prompt label when outside allocation.

### 6.4 Analytics

- Metrics per variant: usage count, avg latency, p95 latency, avg cost, error rate.
- Aggregate metrics across experiment and per variant.
- Later: incorporate ingest/RCA signals (incident frequency, RCA confidence).

## 7. Data Model (Prisma)

Add experiment models (suggested in `packages/db/prisma/schema/prompt.prisma`).

```prisma
model PromptExperiment {
  id              String   @id @default(cuid())
  projectId       String
  project         Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  name            String
  slug            String
  description     String?
  status          String   // "draft" | "running" | "paused" | "completed" | "archived"
  allocationPct   Int      @default(100) // 0-100
  assignmentSeed  String   @default(uuid())
  assignmentKey   String?  // "userId" | "sessionId" | "custom"
  startAt         DateTime?
  endAt           DateTime?
  metrics         Json?    // { primaryMetric, secondaryMetrics }
  tags            String[] @default([])
  createdById     String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  variants PromptExperimentVariant[]

  @@unique([projectId, slug])
  @@index([projectId, status])
}

model PromptExperimentVariant {
  id              String           @id @default(cuid())
  experimentId    String
  experiment      PromptExperiment @relation(fields: [experimentId], references: [id], onDelete: Cascade)
  name            String           // "A" | "B"
  weight          Int              // basis points, sum = 10000
  promptVersionId String
  promptVersion   PromptVersion    @relation(fields: [promptVersionId], references: [id], onDelete: Restrict)
  isControl       Boolean          @default(false)
  createdAt       DateTime         @default(now())

  @@unique([experimentId, name])
  @@index([promptVersionId])
}
```

### Trace Linkage

Add span-level fields for experiment metadata (in `packages/db/prisma/schema/tracing.prisma`):
- `promptId`, `promptVersion`, `promptLabel`
- `promptExperimentId`, `promptVariantId`, `promptVariantName`
- `assignmentKeyHash` (hashed, never store raw)

Also add filterable fields in `packages/api/src/schemas/filtering.ts`.

## 8. APIs

### 8.1 Management API (tRPC)

Add `packages/api/src/routers/prompt-experiments.ts` with endpoints:
- `promptExperiments.list`
- `promptExperiments.get`
- `promptExperiments.create`
- `promptExperiments.update`
- `promptExperiments.start`
- `promptExperiments.pause`
- `promptExperiments.stop`
- `promptExperiments.archive`
- `promptExperiments.analytics`
- `promptExperiments.compare` (optional, return diff + metadata)

Schemas live in `packages/api/src/schemas/prompt-experiments.ts`.

### 8.2 Runtime API (Ingest Node)

Add `GET /v1/prompt-experiments/:slug/resolve`:
- Query: `assignmentKey` (required), `type?`, `forceVariant?`
- Auth: API key (same as `/v1/prompts/:slug`)
- Response:
  - experiment metadata
  - assigned variant
  - prompt payload (same shape as prompt fetch)

### 8.3 Existing Prompt Fetch

Keep `/v1/prompts/:slug` unchanged. Experiments resolve to a prompt version and
return the existing prompt response shape.

## 9. SDK

Extend `packages/sdk/src/prompts.ts`:

```ts
const assignment = await Ducsigr.prompts.getExperiment("checkout-copy", {
  assignmentKey: userId,
  cacheTTL: 60,
});

const compiled = assignment.prompt.compile({ plan: "pro" });
span.setMetadata(assignment.traceMetadata);
```

Add:
- `getExperiment(slug, options)` returning `{ prompt, experiment, traceMetadata }`
- Cache key includes assignmentKey
- `traceMetadata` includes prompt and experiment identifiers

## 10. Assignment Algorithm

- Compute bucket = hash(assignmentKey + assignmentSeed) % 10000.
- If bucket >= allocationPct * 100, fallback to default prompt label.
- Otherwise choose variant using cumulative weights.
- Reset assignmentSeed on experiment config changes to avoid mixed cohorts.

## 11. UI/UX

New Experiments tab inside Prompts:
- List experiments with status, allocation, and last updated.
- Detail view: variants, weights, and actions (start, pause, end).
- Comparison view: side-by-side diff of A vs B.
- Analytics summary with variant metrics and delta vs control.
- "Promote winner" action: set label to production on winning version.

## 12. Security and Privacy

- API key auth for runtime resolution.
- Workspace auth for management endpoints.
- Store only hashed assignmentKey on traces.
- Rate limit the resolve endpoint.

## 13. Observability

- Log assignment decisions with experiment and variant IDs (no raw keys).
- Emit counters for resolve success/fail and missing experiments.

## 14. Testing

- Unit: assignment hashing, weight selection, allocationPct behavior.
- API: resolve endpoint, CRUD, status transitions.
- SDK: cache with assignmentKey + ETag, error handling.
- Analytics: aggregate by experiment and variant.

## 15. Rollout Plan

1. DB schema + migration.
2. tRPC management API + schemas.
3. Ingest resolve endpoint.
4. SDK getExperiment + trace metadata helpers.
5. UI compare + experiments.
6. Analytics with trace linkage.
7. Ingest/RCA integration for quality insights (v1.5).

## 16. Open Questions

- Do we allow experiments across different prompt slugs or only versions of one prompt?
- Is assignmentKey required or optional (random fallback)?
- Should we allow more than two variants in v1?
- Default fallback label: production or latest?
- How should we surface RCA impact in experiment analytics?
