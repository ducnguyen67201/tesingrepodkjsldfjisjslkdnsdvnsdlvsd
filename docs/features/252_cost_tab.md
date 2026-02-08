# #252 — Costs Tab on Project Page

## Overview

The **Costs** tab provides full-page cost analytics on the project detail page, giving teams visibility into LLM spending — total cost, token usage, cost-over-time trends, per-model breakdown, and model pricing reference.

**URL:** `/workspace/[slug]/projects/[id]?tab=costs`

## Tab Position

```
Metrics → Traces → [Costs] → Logs → Sessions → Users
```

## Layout

```
┌─────────────────────────────────────────────────────────┐
│  Cost Analytics                    [24h] [7d] [30d]     │
├────────────┬────────────┬────────────┬─────────────────┤
│ Total Cost │ Tokens     │ Avg/Trace  │ Billable Spans  │
│ $1,234.56  │ 2.3M       │ $0.042     │ 28.5K           │
│ +12.3%     │ +8.1%      │            │                 │
├────────────┴────────────┴────────────┴─────────────────┤
│              Cost Over Time (Stacked Area)              │
│  ▓▓▓▓▓▓▓▓ Input Cost                                   │
│  ░░░░░░░░ Output Cost                                   │
├─────────────────────────┬───────────────────────────────┤
│  Cost by Model (Bar)    │  Model Breakdown (Table)      │
│  GPT-4o  ██████ 62%     │  Model   | Cost  | %  | Tok  │
│  Claude  ████   28%     │  GPT-4o  | $765  | 62 | 15K  │
│  GPT-3.5 ██     10%     │  Claude  | $345  | 28 | 8K   │
├─────────────────────────┴───────────────────────────────┤
│  ▸ Model Pricing Reference (collapsed by default)       │
│    Provider | Model   | Input $/1M | Output $/1M        │
└─────────────────────────────────────────────────────────┘
```

## Components

### Overview Cards

Four stat cards displayed in a responsive grid (`2x2` on mobile, `4x1` on desktop):

| Card | Value | Change Indicator |
|------|-------|-----------------|
| **Total Cost** | Formatted currency | % vs previous period (red up / green down) |
| **Total Tokens** | Formatted number (K/M suffix) | % vs previous period |
| **Avg Cost / Trace** | Formatted currency | — |
| **Billable Spans** | Formatted number | — |

### Cost Over Time Chart

- **Type:** Stacked area chart (recharts)
- **Layers:** Input cost (bottom) + output cost (top)
- **Height:** 300px
- **X-axis:** Date labels (hour format for 24h, "Jan 15" format for 7d/30d)
- **Y-axis:** Currency format
- **Tooltip:** Shows input cost, output cost per data point
- **Empty state:** Dashed border with "No cost data for this period"

### Cost by Model

Two-column layout on desktop, stacked on mobile:

**Left — Bar chart:**
- Horizontal bars for top 5 models
- Color-coded with chart theme colors
- Currency-formatted x-axis

**Right — Data table:**
- Columns: Model, Provider (badge), Cost, %, Tokens, Spans
- Sorted by cost descending
- Shows all models (not just top 5)

### Model Pricing Reference

- **Collapsed by default** — click to expand
- Uses `Collapsible` component from shadcn/ui
- Table columns: Provider (badge), Model (monospace), Display Name, Input $/1M, Output $/1M
- **Lazy-loaded** — query only fires when expanded

## Data Sources

All data comes from existing tRPC procedures. No backend changes were needed.

| Procedure | Purpose | Used By |
|-----------|---------|---------|
| `costs.getOverview` | Summary stats with % change vs previous period | Overview cards |
| `costs.getByModel` | Per-model breakdown (cost, %, tokens, spans) | Model breakdown |
| `costs.getTimeSeries` | Daily cost data (input/output split) | Trend chart |
| `costs.listPricing` | Current model pricing | Pricing table |

## Time Range

The time range selector (24h / 7d / 30d) is local to the Costs tab using `useState`. It filters all four data sections simultaneously.

The `costs.getOverview` procedure automatically calculates change percentages by comparing the current period against the equivalent previous period (e.g., 7d vs prior 7d).

## File Map

```
apps/web/src/
├── hooks/
│   └── use-costs.ts                          # Hook wrapping 3 cost queries
├── components/costs/
│   ├── index.ts                              # Barrel exports
│   ├── cost-analytics-view.tsx               # Orchestrator (time range + layout)
│   ├── cost-overview-cards.tsx               # 4 stat cards
│   ├── cost-trend-chart.tsx                  # Stacked area chart
│   ├── cost-model-breakdown.tsx              # Bar chart + table
│   ├── cost-pricing-table.tsx                # Collapsible pricing reference
│   ├── cost-sidebar-panel.tsx                # (pre-existing) Mini sidebar
│   └── cost-context.tsx                      # (pre-existing) Filter context
└── app/workspace/[slug]/projects/[id]/
    └── page.tsx                              # Project page (tab added)
```

## Hook API

```typescript
import { useCosts } from "@/hooks/use-costs";

const { overview, modelBreakdown, timeSeries, isLoading } = useCosts({
  workspaceSlug: "my-workspace",
  projectId: "proj_123",
  timeRange: "7d",           // "24h" | "7d" | "30d" | "custom"
  customRange: undefined,    // { from: string, to: string } for custom
});

// overview: CostOverview | null
// modelBreakdown: ModelCostBreakdown[]
// timeSeries: CostTimePoint[]
// isLoading: boolean
```

## Conventions Followed

- All files under 150 lines
- No inline functions in JSX — handlers extracted to named functions
- Logic in `useCosts` hook, not in components
- Types imported from `@ducsigr/api/schemas` (no duplicates)
- shadcn/ui components only (Card, Table, Badge, Collapsible, ChartContainer)
- Format utilities from `@/lib/format` (`formatCost`, `formatNumber`)
- `TimeRangeButtons` reused from `@/components/dashboard`
- Empty states for all sections when no data exists

## Related

- **GitHub Issue:** [#252](https://github.com/ducnguyen67201/tesingrepodkjsldfjisjslkdnsdvnsdlvsd/issues/252)
- **Engineering Spec:** [`docs/plans/cost-tab-spec.md`](../plans/cost-tab-spec.md)
- **Cost API Router:** `packages/api/src/routers/costs.ts`
- **Cost Schemas:** `packages/api/src/schemas/cost.ts`
- **DB Models:** `packages/db/prisma/schema/cost.prisma` (ModelPricing, CostDailySummary)
