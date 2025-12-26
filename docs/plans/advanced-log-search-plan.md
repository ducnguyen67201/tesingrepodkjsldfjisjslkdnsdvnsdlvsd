# Implementation Plan: Advanced Log Search

## Summary

Add query-based filtering to Logs view matching Traces functionality. Support for `service.name="api" AND body contains "error"` with autocomplete, AND/OR operators, and quick filter chips.

---

## Implementation Plan (JSON)

```json
{
  "feature": "Advanced Log Search",
  "summary": "Add DSL-based filtering to Logs view with autocomplete and quick filters",

  "database": {
    "schemaFile": "packages/db/prisma/schema/tracing.prisma",
    "models": [],
    "migrationName": null,
    "notes": "No database changes needed - LogRecord already has all required fields (serviceName, severityNumber, bodyText, attributes JSONB, traceId, spanId, environment)"
  },

  "schemas": {
    "file": "packages/api/src/schemas/log-filtering.ts",
    "exports": [
      { "name": "LogFieldSchema", "type": "enum", "values": ["log.serviceName", "log.serviceVersion", "log.environment", "log.severity", "log.severityNumber", "log.body", "log.traceId", "log.spanId", "log.scopeName"] },
      { "name": "LogAttributeScopeSchema", "type": "enum", "values": ["resource", "log"] },
      { "name": "LogFieldPredicateSchema", "type": "object", "description": "Field predicate for log fields" },
      { "name": "LogAttributePredicateSchema", "type": "object", "description": "JSONB attribute predicate" },
      { "name": "LogSearchPredicateSchema", "type": "object", "description": "Full-text search on body" },
      { "name": "LogFilterExpressionSchema", "type": "recursive", "description": "Recursive AND/OR/NOT expression" },
      { "name": "LogsListV2InputSchema", "type": "object", "description": "Input for logs.listV2" },
      { "name": "LogFilterKeysInputSchema", "type": "object" },
      { "name": "LogFilterValuesInputSchema", "type": "object" },
      { "name": "LogFilterStatsInputSchema", "type": "object" },
      { "name": "LogFilterStatsOutputSchema", "type": "object" }
    ],
    "reuseFrom": "packages/api/src/schemas/filtering.ts (FilterOperatorSchema, PredicateValueSchema, FILTER_LIMITS)"
  },

  "api": {
    "routerFile": "packages/api/src/routers/logs.ts",
    "procedures": [
      { "name": "listV2", "type": "query", "middleware": "workspaceMiddleware", "description": "List logs with FilterExpression support" },
      { "name": "filterKeys", "type": "query", "middleware": "workspaceMiddleware", "description": "Get attribute keys for autocomplete" },
      { "name": "filterValues", "type": "query", "middleware": "workspaceMiddleware", "description": "Get attribute values for autocomplete" },
      { "name": "filterStats", "type": "query", "middleware": "workspaceMiddleware", "description": "Get facets (services, severities, etc.)" }
    ],
    "serviceFile": "packages/api/src/services/log-filter.service.ts",
    "serviceDescription": "Build Prisma WHERE clause from LogFilterExpression, handle JSONB queries"
  },

  "tests": {
    "file": "packages/api/src/routers/__tests__/logs-filter.test.ts",
    "testCases": [
      "listV2 returns logs with basic filter",
      "listV2 supports AND expressions",
      "listV2 supports OR expressions",
      "listV2 supports NOT expressions",
      "listV2 filters by severity (gte, lte)",
      "listV2 filters by serviceName",
      "listV2 filters by body contains",
      "listV2 supports attribute filtering",
      "listV2 validates filter guardrails",
      "filterKeys returns distinct attribute keys",
      "filterValues returns values for a key",
      "filterStats returns service counts",
      "filterStats returns severity distribution",
      "requires authentication",
      "requires workspace access"
    ]
  },

  "frontend": {
    "constants": {
      "file": "apps/web/src/lib/log-filter/filter-constants.ts",
      "exports": [
        "LOG_FIELD_META - Metadata for log fields",
        "LOG_QUICK_FILTER_PRESETS - Quick filters (Errors, Warnings, etc.)",
        "LOG_FILTER_URL_PARAMS - URL param keys",
        "compressLogFilterForUrl",
        "decompressLogFilterFromUrl"
      ]
    },
    "hook": {
      "file": "apps/web/src/hooks/use-log-filters-v2.ts",
      "operations": ["parseUrlFilters", "updateUrlFilters", "executeQuery", "toggleQuickFilter", "clearFilters"]
    },
    "autocompleteHook": {
      "file": "apps/web/src/hooks/use-log-filter-autocomplete.ts",
      "operations": ["fields", "getValueSuggestions"]
    },
    "components": [
      { "file": "apps/web/src/components/logs/filters-v2/log-query-builder-input.tsx", "description": "Search bar with autocomplete (adapt QueryBuilderInput)" },
      { "file": "apps/web/src/components/logs/filters-v2/log-filter-chips.tsx", "description": "Quick filter buttons (Errors, Warnings, Info, etc.)" },
      { "file": "apps/web/src/components/logs/filters-v2/log-filter-sidebar.tsx", "description": "Sidebar with time range and stats" },
      { "file": "apps/web/src/components/logs/filters-v2/index.ts", "description": "Re-exports" }
    ],
    "pages": [
      { "file": "apps/web/src/app/workspace/[workspaceSlug]/logs/page.tsx", "description": "Update to use new filtering" }
    ],
    "toasts": {
      "file": "apps/web/src/lib/success.ts",
      "additions": []
    }
  },

  "executionOrder": [
    "1. Create log-filtering.ts schemas (reuse operators from filtering.ts)",
    "2. Write tests for new logs procedures (TDD)",
    "3. Create LogFilterService with Prisma query builder",
    "4. Add new procedures to logs router (listV2, filterKeys, filterValues, filterStats)",
    "5. Create log-filter constants (field metadata, quick presets)",
    "6. Create use-log-filter-autocomplete hook",
    "7. Create use-log-filters-v2 hook",
    "8. Build LogQueryBuilderInput component",
    "9. Build LogFilterChips component",
    "10. Update logs page to use new filtering"
  ]
}
```

---

## Detailed Design

### 1. Log Field Schema (packages/api/src/schemas/log-filtering.ts)

```typescript
import { z } from "zod";
import { FilterOperatorSchema, PredicateValueSchema, FILTER_LIMITS } from "./filtering";

// Log-specific fields
export const LogFieldSchema = z.enum([
  "log.serviceName",
  "log.serviceVersion",
  "log.environment",
  "log.severity",        // Severity text (DEBUG, INFO, WARN, ERROR, FATAL)
  "log.severityNumber",  // OTLP severity number (1-24)
  "log.body",            // bodyText field
  "log.traceId",
  "log.spanId",
  "log.scopeName",
]);
export type LogField = z.infer<typeof LogFieldSchema>;

// Attribute scope
export const LogAttributeScopeSchema = z.enum(["resource", "log"]);
export type LogAttributeScope = z.infer<typeof LogAttributeScopeSchema>;

// Field predicate
export const LogFieldPredicateSchema = z.object({
  field: LogFieldSchema,
  op: FilterOperatorSchema,
  value: PredicateValueSchema.optional(),
});

// Attribute predicate (for JSONB attributes/resource)
export const LogAttributePredicateSchema = z.object({
  attribute: z.object({
    scope: LogAttributeScopeSchema,
    key: z.string().max(FILTER_LIMITS.MAX_ATTRIBUTE_KEY_LENGTH),
    op: FilterOperatorSchema,
    value: PredicateValueSchema.optional(),
  }),
});

// Search predicate (body text)
export const LogSearchPredicateSchema = z.object({
  search: z.object({
    query: z.string().min(1).max(FILTER_LIMITS.MAX_SEARCH_QUERY_LENGTH),
    mode: z.enum(["phrase", "terms"]).optional().default("terms"),
  }),
});

// Recursive FilterExpression
export type LogFilterExpression =
  | { and: LogFilterExpression[] }
  | { or: LogFilterExpression[] }
  | { not: LogFilterExpression }
  | z.infer<typeof LogFieldPredicateSchema>
  | z.infer<typeof LogAttributePredicateSchema>
  | z.infer<typeof LogSearchPredicateSchema>;

export const LogFilterExpressionSchema: z.ZodType<LogFilterExpression> = z.lazy(() =>
  z.union([
    z.object({ and: z.array(LogFilterExpressionSchema) }),
    z.object({ or: z.array(LogFilterExpressionSchema) }),
    z.object({ not: LogFilterExpressionSchema }),
    LogFieldPredicateSchema,
    LogAttributePredicateSchema,
    LogSearchPredicateSchema,
  ])
);

// API Input schemas
export const LogsListV2InputSchema = z.object({
  workspaceSlug: z.string(),
  projectId: z.string().optional(),
  timeRange: z.object({
    from: z.string().datetime(),
    to: z.string().datetime(),
  }),
  filter: LogFilterExpressionSchema.optional(),
  limit: z.number().min(1).max(100).optional().default(50),
  cursor: z.string().optional(),
});
```

### 2. Log Filter Service (packages/api/src/services/log-filter.service.ts)

```typescript
import { Prisma } from "@ducsigr/db";
import type { LogFilterExpression, LogField } from "../schemas/log-filtering";

export class LogFilterService {
  /**
   * Build Prisma WHERE clause from LogFilterExpression
   */
  static buildWhereClause(
    expr: LogFilterExpression,
    projectIds: string[]
  ): Prisma.LogRecordWhereInput {
    const baseWhere: Prisma.LogRecordWhereInput = {
      projectId: { in: projectIds },
    };

    if (!expr) return baseWhere;

    const filterWhere = this.expressionToWhere(expr);
    return { AND: [baseWhere, filterWhere] };
  }

  private static expressionToWhere(
    expr: LogFilterExpression
  ): Prisma.LogRecordWhereInput {
    // Handle AND
    if ("and" in expr) {
      return { AND: expr.and.map((e) => this.expressionToWhere(e)) };
    }

    // Handle OR
    if ("or" in expr) {
      return { OR: expr.or.map((e) => this.expressionToWhere(e)) };
    }

    // Handle NOT
    if ("not" in expr) {
      return { NOT: this.expressionToWhere(expr.not) };
    }

    // Handle field predicate
    if ("field" in expr) {
      return this.fieldPredicateToWhere(expr);
    }

    // Handle attribute predicate
    if ("attribute" in expr) {
      return this.attributePredicateToWhere(expr);
    }

    // Handle search predicate
    if ("search" in expr) {
      return { bodyText: { contains: expr.search.query, mode: "insensitive" } };
    }

    return {};
  }

  private static fieldPredicateToWhere(
    predicate: { field: LogField; op: string; value?: unknown }
  ): Prisma.LogRecordWhereInput {
    const { field, op, value } = predicate;
    const column = this.fieldToColumn(field);

    // Map operators to Prisma conditions
    switch (op) {
      case "eq": return { [column]: value };
      case "neq": return { [column]: { not: value } };
      case "gt": return { [column]: { gt: value } };
      case "gte": return { [column]: { gte: value } };
      case "lt": return { [column]: { lt: value } };
      case "lte": return { [column]: { lte: value } };
      case "in": return { [column]: { in: value as unknown[] } };
      case "nin": return { [column]: { notIn: value as unknown[] } };
      case "contains": return { [column]: { contains: value as string, mode: "insensitive" } };
      case "prefix": return { [column]: { startsWith: value as string } };
      case "exists": return { [column]: { not: null } };
      default: return {};
    }
  }

  private static fieldToColumn(field: LogField): string {
    const mapping: Record<LogField, string> = {
      "log.serviceName": "serviceName",
      "log.serviceVersion": "serviceVersion",
      "log.environment": "environment",
      "log.severity": "severityText",
      "log.severityNumber": "severityNumber",
      "log.body": "bodyText",
      "log.traceId": "traceId",
      "log.spanId": "spanId",
      "log.scopeName": "scopeName",
    };
    return mapping[field];
  }

  private static attributePredicateToWhere(
    predicate: { attribute: { scope: string; key: string; op: string; value?: unknown } }
  ): Prisma.LogRecordWhereInput {
    const { scope, key, op, value } = predicate.attribute;
    const column = scope === "resource" ? "resource" : "attributes";

    // Use Prisma JSONB path query
    return {
      [column]: {
        path: [key],
        [this.opToPrismaJsonOp(op)]: value,
      },
    };
  }

  private static opToPrismaJsonOp(op: string): string {
    const mapping: Record<string, string> = {
      eq: "equals",
      neq: "not",
      gt: "gt",
      gte: "gte",
      lt: "lt",
      lte: "lte",
      contains: "string_contains",
    };
    return mapping[op] ?? "equals";
  }
}
```

### 3. Quick Filter Presets (apps/web/src/lib/log-filter/filter-constants.ts)

```typescript
export const LOG_QUICK_FILTER_PRESETS = [
  {
    id: "errors",
    label: "Errors",
    description: "Error and Fatal logs",
    createFilter: () => ({
      field: "log.severityNumber" as const,
      op: "gte" as const,
      value: 17, // ERROR and above
    }),
  },
  {
    id: "warnings",
    label: "Warnings",
    description: "Warning logs",
    createFilter: () => ({
      and: [
        { field: "log.severityNumber" as const, op: "gte" as const, value: 13 },
        { field: "log.severityNumber" as const, op: "lte" as const, value: 16 },
      ],
    }),
  },
  {
    id: "info",
    label: "Info+",
    description: "Info, Warn, Error, Fatal logs",
    createFilter: () => ({
      field: "log.severityNumber" as const,
      op: "gte" as const,
      value: 9,
    }),
  },
  {
    id: "debug",
    label: "Debug+",
    description: "Debug and above",
    createFilter: () => ({
      field: "log.severityNumber" as const,
      op: "gte" as const,
      value: 5,
    }),
  },
  {
    id: "with-trace",
    label: "With Trace",
    description: "Logs linked to traces",
    createFilter: () => ({
      field: "log.traceId" as const,
      op: "exists" as const,
    }),
  },
] as const;
```

### 4. UI Search Example

The search bar will support queries like:
- `log.serviceName="api"` - Service name equals
- `log.body contains "error"` - Body contains text
- `log.severityNumber>=17` - Error and above
- `log.serviceName="api" AND log.severityNumber>=17` - Combined
- `resource.hostname="server-1"` - Attribute filter

---

## Key Files Summary

| Layer | File | Purpose |
|-------|------|---------|
| **Schema** | `packages/api/src/schemas/log-filtering.ts` | Log filter DSL types |
| **Service** | `packages/api/src/services/log-filter.service.ts` | Build Prisma WHERE |
| **Router** | `packages/api/src/routers/logs.ts` | Add listV2, filterKeys, filterValues, filterStats |
| **Tests** | `packages/api/src/routers/__tests__/logs-filter.test.ts` | TDD tests |
| **Constants** | `apps/web/src/lib/log-filter/filter-constants.ts` | Field metadata, presets |
| **Hook** | `apps/web/src/hooks/use-log-filters-v2.ts` | Filter state management |
| **Hook** | `apps/web/src/hooks/use-log-filter-autocomplete.ts` | Autocomplete data |
| **Component** | `apps/web/src/components/logs/filters-v2/log-query-builder-input.tsx` | Search bar |
| **Component** | `apps/web/src/components/logs/filters-v2/log-filter-chips.tsx` | Quick filters |

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        LOG FILTER FLOW                              │
└─────────────────────────────────────────────────────────────────────┘

  User Input: log.serviceName="api" AND log.body contains "error"
                                │
                                ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │  LogQueryBuilderInput (Frontend)                                │
  │  - Parse query string                                           │
  │  - Show autocomplete suggestions                                │
  │  - Syntax highlighting                                          │
  └─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │  use-log-filters-v2 Hook                                        │
  │  - Convert query → LogFilterExpression                          │
  │  - Sync to URL params                                           │
  │  - Call tRPC logs.listV2                                        │
  └─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │  logs.listV2 (tRPC Router)                                      │
  │  - Validate input with Zod                                      │
  │  - Call LogFilterService                                        │
  └─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │  LogFilterService                                               │
  │  - Build Prisma WHERE from FilterExpression                     │
  │  - Handle AND/OR/NOT recursively                                │
  │  - Map fields to columns                                        │
  │  - Handle JSONB attribute queries                               │
  └─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │  Prisma Query → PostgreSQL                                      │
  │                                                                 │
  │  SELECT * FROM "LogRecord"                                      │
  │  WHERE "projectId" IN (...)                                     │
  │    AND "serviceName" = 'api'                                    │
  │    AND "bodyText" ILIKE '%error%'                               │
  │  ORDER BY "timestamp" DESC                                      │
  │  LIMIT 50                                                       │
  └─────────────────────────────────────────────────────────────────┘
```

---

## Pattern Reuse

This implementation follows the exact patterns from Traces filtering:

| Traces | Logs |
|--------|------|
| `FilterExpressionSchema` | `LogFilterExpressionSchema` |
| `TracesListV2InputSchema` | `LogsListV2InputSchema` |
| `traces.listV2` | `logs.listV2` |
| `QueryBuilderInput` | `LogQueryBuilderInput` |
| `use-trace-filters-v2.ts` | `use-log-filters-v2.ts` |
| `TRACE_FIELD_META` | `LOG_FIELD_META` |
| `QUICK_FILTER_PRESETS` | `LOG_QUICK_FILTER_PRESETS` |

---

**Plan complete! Next steps:**
- `/execute` - Start implementation with agents
- `/create-ticket` - Create GitHub issues
- Or describe adjustments needed
