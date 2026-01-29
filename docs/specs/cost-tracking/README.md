# Cost Tracking Epic

**Epic:** Cost Tracking - Visibility into LLM Spending
**Status:** Draft

---

## Overview

Provide visibility into LLM spending across projects. Token usage, cost estimation, and spending trends.

## Tickets

| Ticket | Title | Points | Status |
|--------|-------|--------|--------|
| #80 | [Cost Tracking Foundation](./80_COST_TRACKING_SPEC.md) | 8 | Ready |
| #81 | Budget Management & Alerts | TBD | Future |

## Scope

### In Scope (Ticket #80)
- Model pricing configuration (database table + seed data)
- Cost calculation at span ingestion time
- Cost fields on Span model + daily aggregation table
- Cost dashboard page with overview cards
- Cost breakdown by model (pie chart + table)
- Cost time series chart
- Trend indicators (vs previous period)
- Placeholder tab for future budget/alerts

### Out of Scope (Future - Ticket #81)
- Budget configuration per project
- Alert thresholds (50%, 80%, 100%)
- Email/webhook notifications
- Alert history
- Cost forecasting
- Anomaly detection
- Optimization recommendations

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Cost Tracking (MVP)                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   Ingest     │───▶│   Worker     │───▶│    Cost      │  │
│  │  (traces)    │    │  (process)   │    │ Calculation  │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│                                                   │         │
│                                                   ▼         │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   Web UI     │◀───│   tRPC API   │◀───│  PostgreSQL  │  │
│  │ (dashboard)  │    │  (queries)   │    │ (aggregates) │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Key Decisions

1. **Cost calculated at ingestion** - Worker calculates when processing traces
2. **Model pricing in database** - Allows updates without deploys
3. **Pre-aggregated daily summaries** - Fast dashboard queries
