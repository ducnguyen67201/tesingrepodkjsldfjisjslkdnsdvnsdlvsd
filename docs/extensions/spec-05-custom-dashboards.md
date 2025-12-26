# Spec 05 - Custom Dashboards and Views

## Summary
Enable workspace users to build custom dashboards and views from trace data. Users can create widgets like "errors by status code in last 7 days" or a pie chart grouped by service, then save and share the view.

## Goals
- Let users compose dashboards from trace and span aggregations.
- Provide reusable "saved views" with filters and time ranges.
- Support sharing and visibility controls (private, workspace, public-link).
- Keep dashboards fast and query-safe.

## Non-Goals
- A full BI tool with arbitrary SQL.
- Cross-workspace data joins.
- Unbounded ad hoc queries without limits.

## User Stories
- As a user, I can build a dashboard showing error codes over the last 7 days.
- As a team lead, I can share a dashboard with my workspace.
- As an admin, I can pin a dashboard as the workspace default.

## Core Concepts
- Dashboard: a container of widgets and layout.
- Widget: a visual component (chart, table, stat).
- Saved View: a reusable query definition with filters and time range.

## Data Model (Draft)
Dashboard:
- id, name, workspaceId, visibility, isDefault
- layout (grid definition)
- createdById, createdAt, updatedAt

DashboardWidget:
- id, dashboardId, type, title
- query (SavedView reference or inline)
- config (chart config, colors, formatting)
- layout (x, y, w, h)

SavedView:
- id, workspaceId, name
- source ("traces" | "spans")
- filters (TraceFilters or SpanFilters)
- timeRange (preset or custom)
- groupBy, aggregation, sort

## Query Model (Draft)
```json
{
  "source": "traces",
  "timeRange": { "preset": "last_7_days" },
  "filters": {
    "service.name": ["api-gateway"],
    "span.type": ["HTTP"],
    "status.code": ["ERROR"]
  },
  "groupBy": ["http.status_code"],
  "aggregation": { "op": "count" },
  "limit": 10
}
```

## Widget Types (Phase 1)
- Stat (single number)
- Time series (line/area)
- Pie/Donut
- Bar chart
- Table

## Architecture
1) UI builds a SavedView query from filters and time range.
2) Backend validates query (allowed fields, max limits).
3) Backend returns aggregated results to render widgets.

Integration points:
- Reuse filter logic from `apps/web/src/components/traces/filters-v2/`.
- Use `@ducsigr/api/schemas` filter types as query contracts.

## API Surface (Draft)
- GET `/api/dashboards?workspaceSlug=...`
- POST `/api/dashboards` (create)
- PATCH `/api/dashboards/:id` (update layout or metadata)
- POST `/api/dashboards/:id/widgets`
- PATCH `/api/dashboards/:id/widgets/:widgetId`
- DELETE `/api/dashboards/:id/widgets/:widgetId`
- POST `/api/saved-views`
- GET `/api/saved-views?workspaceSlug=...`
- POST `/api/analytics/query` (validated aggregation query)

## Validation and Limits
- Allowed fields whitelist for filters and groupBy.
- Max time range for heavy aggregations (default 90 days).
- Max groupBy cardinality and max rows (default 100).
- Caching for repeated queries in a dashboard.

## UI Sketch
Dashboard Builder
```
+--------------------------------------------------------------+
| Dashboards                      [New Dashboard]              |
|--------------------------------------------------------------|
| [Errors - Last 7 Days]   [Latency Overview]   [Costs]         |
|--------------------------------------------------------------|
| Errors - Last 7 Days                                         |
| + Add Widget  |  Share  |  Set as Default                     |
|--------------------------------------------------------------|
| [Pie: http.status_code]   [Line: error count by day]          |
| [Table: top services]     [Stat: error rate]                  |
+--------------------------------------------------------------+
```

Widget Editor
```
+--------------------------------------------------------------+
| Add Widget                                                   |
|--------------------------------------------------------------|
| Type: [Pie v]  Title: [Errors by Status Code]                |
| Source: [Traces v]  Time Range: [Last 7 days v]              |
| Filters:                                                     |
| - status.code = ERROR                                        |
| - service.name = api-gateway                                 |
| Group By: [http.status_code v]                               |
| Aggregation: [count v]                                       |
|--------------------------------------------------------------|
| Preview [Chart]                                              |
|--------------------------------------------------------------|
| [Cancel] [Save Widget]                                       |
+--------------------------------------------------------------+
```

## User Flow
1) Go to Dashboard -> New Dashboard.  
2) Add a widget and define filters, time range, groupBy, and aggregation.  
3) Preview and save the widget.  
4) Arrange widgets and save layout.  
5) Share with workspace or set as default.

## Visibility Rules
- Private: only creator.
- Workspace: all members.
- Public link (optional): read-only, token-protected.

## Performance Considerations
- Batch widget queries for a single dashboard request.
- Cache results by query hash for short TTL.
- Provide a "sample preview" mode for faster editing.
