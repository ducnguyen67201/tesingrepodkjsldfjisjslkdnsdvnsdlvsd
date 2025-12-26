# Observability Graph Overview - Engineering Specs

**EPIC:** Observability UX
**Package:** Web + API

---

## Summary

Build a configurable observability dashboard that summarizes traces and logs with graphs, a custom graph builder, and importable template sets. The dashboard becomes the default workspace landing page and supports project scoping via a filter.

---

## Goals

- Provide a default overview dashboard with key trace/log health signals.
- Let users create custom graphs, save dashboards, and manage layout.
- Support importing pre-built graph sets.

## Non-goals

- Real-time streaming graphs or new metrics ingestion pipelines in v1.
- Arbitrary SQL or formula language for graphs.
- Cross-workspace dashboards.

---

## User Experience

### Two-Level Dashboard Architecture

| Level | URL | Purpose |
|-------|-----|---------|
| **Workspace Overview** | `/workspace/{slug}` | All projects listed with summary metrics cards |
| **Project Metrics** | `/workspace/{slug}/projects/{id}?tab=metrics` | Full customizable dashboard for one project |

### Workspace Overview Flow

1. User opens `/workspace/{workspaceSlug}` and lands on "Workspace Overview".
2. Page displays **all projects** as cards, each with key summary metrics.
3. Each project card shows: Trace volume, Error rate, P95 latency (mini stats).
4. User can click "View Project" to navigate to project metrics tab.
5. User can set global time range filter (applies to all project cards).

### Project Metrics Flow

1. User navigates to `/workspace/{slug}/projects/{id}?tab=metrics`.
2. User sees full dashboard with customizable graphs for that project.
3. User clicks "Add Graph" to build a graph (data source, metric, grouping, filters, chart type).
4. User clicks "Import Set" to load a pre-built dashboard template.
5. User can edit, duplicate, delete, and reorder graphs; layout persists per dashboard.

### Navigation Structure

```
Projects
  ├─ + New Project
  │
  ├─ Project A
  │    ├─ 📊 Metrics   ← Project dashboard (customizable)
  │    ├─ 📈 Traces    ← Trace explorer
  │    └─ 📋 Logs      ← Log explorer
  │
  └─ Project B
       ├─ 📊 Metrics
       ├─ 📈 Traces
       └─ 📋 Logs
```

---

## Default Graphs (v1)

- Trace volume over time (line).
- Span error rate over time (line).
- P95 span latency over time (line).
- Log volume by severity (stacked area).
- Logs with traceId ratio (line).
- Top services by error count (bar).

---

## Pre-built Template Sets (v1)

- Observability Overview (default).
- LLM Cost and Usage (cost trend, tokens by model, cost by model, avg cost per trace).
- API Health (request count, error rate, P95 latency by route).

---

## Data Model

### Dashboard

```prisma
model Dashboard {
  id           String   @id @default(cuid())
  workspaceId  String
  projectId    String?  // Optional project scope
  name         String
  description  String?
  visibility   String   @default("workspace") // "workspace" | "personal"
  isDefault    Boolean  @default(false)
  createdById  String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  widgets      DashboardWidget[]

  @@index([workspaceId])
  @@index([workspaceId, projectId])
}
```

### DashboardWidget

```prisma
model DashboardWidget {
  id          String   @id @default(cuid())
  dashboardId String
  title       String
  type        String   // "line" | "area" | "bar" | "single" | "table" | ...
  query       Json     // GraphQuery
  display     Json     // GraphDisplay
  layout      Json     // WidgetLayout
  createdById String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  dashboard   Dashboard @relation(fields: [dashboardId], references: [id], onDelete: Cascade)

  @@index([dashboardId])
}
```

### DashboardTemplate

Option A: Store templates in DB.

```prisma
model DashboardTemplate {
  id          String   @id @default(cuid())
  name        String
  description String?
  tags        String[]
  version     String   @default("v1")
  widgets     Json     // Array<DashboardWidget>
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

Option B (preferred for v1): Store templates in code at `apps/web/src/lib/dashboard-templates.ts`.

---

## Graph Query Schema

```ts
type GraphQuery = {
  dataSource: "trace" | "span" | "log";
  metric: {
    op: "count" | "sum" | "avg" | "p50" | "p95" | "p99" | "unique_count" | "rate" | "error_rate" | "ratio";
    field?: string;
  };
  groupBy?: { field?: string; limit?: number; sort?: "asc" | "desc" };
  timeRange: "24h" | "7d" | "30d" | "custom";
  customRange?: { from: string; to: string };
  bucket?: "auto" | "1m" | "5m" | "15m" | "1h" | "6h" | "1d";
  filter?: FilterExpression | LogFilterExpression;
};

type GraphDisplay = {
  type: "line" | "area" | "bar" | "stacked_bar" | "donut" | "single" | "table";
  unit?: "count" | "ms" | "percent" | "usd" | "tokens";
  showLegend?: boolean;
  stacked?: boolean;
};

type WidgetLayout = { x: number; y: number; w: number; h: number };
```

---

## API (tRPC)

### Dashboards

- `dashboards.list` - list dashboards by workspace (and optional projectId).
- `dashboards.get` - get dashboard by id.
- `dashboards.create` - create dashboard.
- `dashboards.update` - update dashboard metadata.
- `dashboards.delete` - delete dashboard.
- `dashboards.widgets.upsert` - create/update widget.
- `dashboards.widgets.delete` - delete widget.
- `dashboards.layout.update` - save widget layout.

### Graph Query

- `graphs.query` - execute GraphQuery and return series data + stats.
- `graphs.preview` - light-weight preview for builder.

---

## Query Engine

### Tables and Time Columns

- Trace: `Trace.startTime`
- Span: `Span.startTime`
- Log: `LogRecord.timestamp`

### Implementation Notes

- Implement in `packages/api/src/services/graph-query.service.ts`.
- Use `DATE_TRUNC` for buckets and raw SQL for percentiles, ratios, and rates.
- Use existing DSLs:
  - `FilterExpression` (`packages/api/src/schemas/filtering.ts`)
  - `LogFilterExpression` (`packages/api/src/schemas/log-filtering.ts`)

### Guardrails

- Max points per series (target 60-120).
- Max series per group (top N with "Others" bucket).
- Query timeout 2s (align with existing filtering guardrails).

---

## Frontend

### Pages

| Page | File | Purpose |
|------|------|---------|
| Workspace Overview | `apps/web/src/app/workspace/[workspaceSlug]/page.tsx` | Lists all projects with summary metrics |
| Project Metrics | `apps/web/src/app/workspace/[workspaceSlug]/projects/[projectId]/page.tsx` | Renders metrics tab with full dashboard |

### Workspace Overview Components

- `apps/web/src/components/dashboard/workspace-overview.tsx` - Main overview container
- `apps/web/src/components/dashboard/project-summary-card.tsx` - Project card with mini metrics
- `apps/web/src/components/dashboard/time-range-filter.tsx` - Global time range selector

### Project Dashboard Components

- `apps/web/src/components/dashboard/dashboard-view.tsx` - Full dashboard container
- `apps/web/src/components/dashboard/widget-grid.tsx` - Draggable grid (react-grid-layout)
- `apps/web/src/components/dashboard/widget-card.tsx` - Single widget container
- `apps/web/src/components/dashboard/graph-builder-dialog.tsx` - Create/edit graph UI
- `apps/web/src/components/dashboard/template-gallery.tsx` - Import template modal

### Charts

- Reuse `ChartContainer`, `ChartTooltip`, and Recharts from `apps/web/src/components/ui/chart.tsx`.

### Filters

- Reuse Query Builder for traces/spans.
- Reuse Log Query Builder for logs.

---

## Permissions

- OWNER/ADMIN: create and edit workspace dashboards.
- MEMBER: view dashboards.
- Optional: personal dashboards (visibility = "personal").

---

## Performance

- Cache graph queries for 30-60 seconds per dashboard/time range.
- Lazy-load widgets (render only in viewport).
- Avoid heavy joins in v1 (prefer denormalized fields).

---

## Testing

- Unit tests for query builder and metric calculations.
- Router tests for dashboard CRUD and graph query endpoints.
- UI tests for add graph, import template, and empty states.

---

## Rollout

- Feature flag `dashboard_v2` per workspace.
- Seed a default dashboard on first use.
- Backfill default dashboards for existing workspaces via migration.

---

## Open Questions

- ~~Should dashboards be strictly project-scoped or workspace-wide with project filter?~~ **RESOLVED**: Two-level architecture - workspace overview lists all projects, project metrics tab has full dashboard per project.
- Which template set should be default for new workspaces?
- Do we need JSON import/export in v1 or only built-in templates?
