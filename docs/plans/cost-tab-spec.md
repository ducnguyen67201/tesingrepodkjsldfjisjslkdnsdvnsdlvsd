# Engineering Spec: Add "Costs" Tab to Project Page

## Summary

Add a dedicated "Costs" tab to the project detail page (`/workspace/[slug]/projects/[id]?tab=costs`) showing full-page cost analytics — overview stats, cost-over-time chart, model breakdown, and pricing reference.

## Motivation

The YC demo script says *"switch to Cost tab to see spending by model"* but no such tab exists. Cost data is only visible in a sidebar panel (`CostSidebarPanel`) which is too small for a demo walkthrough. A full-page Cost tab provides the high-impact "where the money goes" moment the demo needs.

## Scope

**Frontend only.** No backend changes. All 4 existing tRPC procedures are sufficient:
- `costs.getOverview` — summary stats with % change
- `costs.getByModel` — per-model breakdown
- `costs.getTimeSeries` — daily cost data
- `costs.listPricing` — model pricing table

## Architecture

```
page.tsx (add "costs" tab)
    └── CostAnalyticsView (orchestrator, < 80 lines)
            ├── CostOverviewCards (4 stat cards)
            ├── CostTrendChart (full-width area chart)
            ├── CostModelBreakdown (bar chart + table)
            └── CostPricingTable (model pricing reference)
```

Hook: `useCosts(workspaceSlug, projectId, timeRange, customRange)` wraps all 4 queries.

## Detailed Design

### 1. Modify Project Page Tab Type

**File:** `apps/web/src/app/workspace/[workspaceSlug]/projects/[projectId]/page.tsx`

```diff
- type ProjectTab = "metrics" | "traces" | "logs" | "sessions" | "users";
+ type ProjectTab = "metrics" | "traces" | "costs" | "logs" | "sessions" | "users";
```

Add tab trigger (after Traces, before Logs):
```tsx
<TabsTrigger value="costs" className="h-7 gap-1.5 text-xs px-3">
  <DollarSign className="h-3 w-3" />
  Costs
</TabsTrigger>
```

Add tab content:
```tsx
<TabsContent value="costs" className="mt-2">
  <CostAnalyticsView
    workspaceSlug={workspaceSlug ?? ""}
    projectId={projectId}
  />
</TabsContent>
```

Import `DollarSign` from `lucide-react` and `CostAnalyticsView` from `@/components/costs`.

### 2. Create `useCosts` Hook

**File:** `apps/web/src/hooks/use-costs.ts`

```typescript
export function useCosts(params: {
  workspaceSlug: string;
  projectId: string;
  timeRange: TimeRange;
  customRange?: CustomDateRange;
}) {
  // Builds queryParams from params
  // Calls costs.getOverview, costs.getByModel, costs.getTimeSeries
  // Returns { overview, modelBreakdown, timeSeries, isLoading }
}
```

**Rules:**
- Queries enabled only when `workspaceSlug && projectId` are truthy
- No filter passthrough (Cost tab shows unfiltered project-level costs)
- Returns loading state as union of all 3 queries

### 3. Create `CostAnalyticsView` Orchestrator

**File:** `apps/web/src/components/costs/cost-analytics-view.tsx` (< 80 lines)

**Props:** `{ workspaceSlug: string; projectId: string }`

**Layout:**
```
┌─────────────────────────────────────────────────────────┐
│  Time Range: [24h] [7d] [30d]                           │
├────────────┬────────────┬────────────┬─────────────────┤
│ Total Cost │ Tokens     │ Avg/Trace  │ Billable Spans  │
│ $1,234.56  │ 2.3M       │ $0.042     │ 28.5K           │
│ +12.3%     │ +8.1%      │            │                 │
├────────────┴────────────┴────────────┴─────────────────┤
│              Cost Over Time (Area Chart)                │
│  ████████                                               │
│  ██████████████                                         │
│  ████████████████████                                   │
├─────────────────────────┬───────────────────────────────┤
│  Cost by Model (Bar)    │  Model Breakdown (Table)      │
│  GPT-4o  ██████ 62%     │  Model    | Cost   | %  | #  │
│  Claude  ████   28%     │  GPT-4o   | $765   | 62 | 15K│
│  GPT-3.5 ██     10%     │  Claude   | $345   | 28 | 8K │
├─────────────────────────┴───────────────────────────────┤
│  Model Pricing Reference (Collapsible)                  │
│  Provider | Model   | Input $/1M | Output $/1M          │
│  OpenAI   | gpt-4o  | $2.50      | $10.00               │
└─────────────────────────────────────────────────────────┘
```

**Behavior:**
- Uses `ProjectFilterProvider` context for time range (URL-synced via `?timeRange=`)
- Loading skeleton while data fetches
- Empty state if no cost data

### 4. Create `CostOverviewCards`

**File:** `apps/web/src/components/costs/cost-overview-cards.tsx` (< 60 lines)

4 cards in a responsive grid (`grid-cols-2 md:grid-cols-4`):

| Card | Value | Subtext |
|------|-------|---------|
| Total Cost | `formatCost(overview.totalCost)` | `costChange` with trend icon |
| Tokens | `formatNumber(overview.totalTokens)` | `tokenChange` with trend icon |
| Avg Cost / Trace | `formatCost(overview.avgCostPerTrace)` | — |
| Billable Spans | `formatNumber(overview.billableSpans)` | — |

Uses shadcn `Card` component. Reuse `ChangeIndicator` pattern from `CostSidebarPanel`.

### 5. Create `CostTrendChart`

**File:** `apps/web/src/components/costs/cost-trend-chart.tsx` (< 100 lines)

Full-width stacked area chart showing daily cost over the selected time range.

**Chart spec:**
- **Type:** Stacked AreaChart (recharts)
- **Data keys:** `inputCost` (bottom), `outputCost` (top)
- **Height:** 300px
- **X-axis:** Date labels (short format)
- **Y-axis:** Currency format
- **Tooltip:** Date, input cost, output cost, total cost, token count
- **Gradients:** Two-tone fill (input vs output)
- **Empty state:** Dashed border + "No cost data for this period"

Reuse `ChartContainer`, `ChartTooltip`, `ChartTooltipContent` from shadcn/ui.

### 6. Create `CostModelBreakdown`

**File:** `apps/web/src/components/costs/cost-model-breakdown.tsx` (< 120 lines)

Two-column layout: horizontal bar chart (left) + data table (right).

**Bar chart (left, ~50%):**
- Horizontal bars, top 5 models
- Color-coded per model
- Percentage labels

**Table (right, ~50%):**
- Columns: Model, Provider, Cost, %, Tokens, Spans
- Sorted by cost descending
- Uses shadcn `Table` component
- All models shown (not just top 5)

### 7. Create `CostPricingTable`

**File:** `apps/web/src/components/costs/cost-pricing-table.tsx` (< 80 lines)

Collapsible section (`Collapsible` from shadcn) showing model pricing.

**Table columns:**
- Provider (badge)
- Model
- Display Name
- Input Price ($/1M tokens)
- Output Price ($/1M tokens)

Uses `costs.listPricing` query. Collapsed by default — expandable for reference.

## File Inventory

| File | Action | Lines (est.) |
|------|--------|-------------|
| `apps/web/src/app/workspace/.../page.tsx` | **Edit** — add tab | +15 lines |
| `apps/web/src/hooks/use-costs.ts` | **Create** | ~45 lines |
| `apps/web/src/components/costs/cost-analytics-view.tsx` | **Create** | ~75 lines |
| `apps/web/src/components/costs/cost-overview-cards.tsx` | **Create** | ~55 lines |
| `apps/web/src/components/costs/cost-trend-chart.tsx` | **Create** | ~95 lines |
| `apps/web/src/components/costs/cost-model-breakdown.tsx` | **Create** | ~115 lines |
| `apps/web/src/components/costs/cost-pricing-table.tsx` | **Create** | ~75 lines |
| `apps/web/src/components/costs/index.ts` | **Edit** — add exports | +5 lines |

**Total new code:** ~460 lines across 6 new files + 2 edits.

## Reuse from Existing Code

| What | Source | How |
|------|--------|-----|
| Chart colors | `cost-sidebar-panel.tsx` → `MODEL_COLORS`, `CHART_COLORS` | Extract to shared constant or duplicate (5 lines) |
| `formatCurrency` | `cost-sidebar-panel.tsx` (local) / `format.ts` → `formatCost` | Use `formatCost` from `@/lib/format` |
| `formatChange` | `cost-sidebar-panel.tsx` → `formatChange` | Extract or re-implement (3 lines) |
| `ChangeIndicator` | `cost-sidebar-panel.tsx` → `ChangeIndicator` | Export from sidebar or create shared |
| `ChartContainer` | `@/components/ui/chart` | Import directly |
| Time range filter | `ProjectFilterProvider` context | Use `useProjectFilters()` hook |
| `formatCost`, `formatTokens`, `formatNumber` | `@/lib/format` | Import directly |

## Conventions Followed

- [ ] All files < 150 lines
- [ ] No inline functions in JSX
- [ ] Logic in `useCosts` hook, not in components
- [ ] Types from `@ducsigr/api/schemas` (no duplicates)
- [ ] shadcn/ui components only
- [ ] URL state sync via `ProjectFilterProvider`
- [ ] `formatCost`/`formatTokens` from `@/lib/format`
- [ ] No direct `toast` imports
- [ ] No backend changes needed

## Execution Order

1. Create `apps/web/src/hooks/use-costs.ts`
2. Create `apps/web/src/components/costs/cost-overview-cards.tsx`
3. Create `apps/web/src/components/costs/cost-trend-chart.tsx`
4. Create `apps/web/src/components/costs/cost-model-breakdown.tsx`
5. Create `apps/web/src/components/costs/cost-pricing-table.tsx`
6. Create `apps/web/src/components/costs/cost-analytics-view.tsx`
7. Update `apps/web/src/components/costs/index.ts` — export `CostAnalyticsView`
8. Edit `apps/web/src/app/workspace/.../page.tsx` — add "Costs" tab
9. Test: navigate to `?tab=costs`, verify all charts render

## Acceptance Criteria

- [ ] "Costs" tab appears between "Traces" and "Logs" on project page
- [ ] Overview cards show total cost, tokens, avg/trace, billable spans
- [ ] Cost trend chart renders stacked area (input vs output cost)
- [ ] Model breakdown shows bar chart + table with all models
- [ ] Pricing table is collapsible and shows current model prices
- [ ] Time range selector (24h/7d/30d) filters all data
- [ ] Empty states render gracefully when no cost data exists
- [ ] URL syncs: `?tab=costs&timeRange=7d` is shareable
- [ ] Demo flow: can click "Costs" tab and see "where the money goes"
