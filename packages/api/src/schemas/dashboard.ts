/**
 * Dashboard Schemas
 *
 * Zod schemas for observability dashboard - source of truth for types.
 */

import { z } from "zod";

// ============================================================
// Dashboard Enums
// ============================================================

/**
 * Dashboard visibility - who can see the dashboard
 */
export const DashboardVisibilitySchema = z.enum(["workspace", "personal"]);
export type DashboardVisibility = z.infer<typeof DashboardVisibilitySchema>;

/**
 * Widget types - chart/visualization types
 */
export const WidgetTypeSchema = z.enum([
  "line",
  "area",
  "bar",
  "stacked_bar",
  "donut",
  "single",
  "table",
  "stat", // Compact stat card with sparkline
]);
export type WidgetType = z.infer<typeof WidgetTypeSchema>;

/**
 * Data source for graph queries
 */
export const GraphDataSourceSchema = z.enum(["trace", "span", "log"]);
export type GraphDataSource = z.infer<typeof GraphDataSourceSchema>;

/**
 * Metric operations/aggregations
 */
export const MetricOpSchema = z.enum([
  "count",
  "sum",
  "avg",
  "p50",
  "p95",
  "p99",
  "unique_count",
  "rate",
  "error_rate",
  "ratio",
]);
export type MetricOp = z.infer<typeof MetricOpSchema>;

/**
 * Predefined time ranges for dashboards
 */
export const DashboardTimeRangeSchema = z.enum(["24h", "7d", "30d", "custom"]);
export type DashboardTimeRange = z.infer<typeof DashboardTimeRangeSchema>;

/**
 * Bucket intervals for time series
 */
export const BucketSchema = z.enum(["auto", "1m", "5m", "15m", "1h", "6h", "1d"]);
export type Bucket = z.infer<typeof BucketSchema>;

/**
 * Display units for metrics
 */
export const UnitSchema = z.enum(["count", "ms", "percent", "usd", "tokens"]);
export type Unit = z.infer<typeof UnitSchema>;

// ============================================================
// Graph Query Schema
// ============================================================

/**
 * Filter condition for graph queries
 */
export const GraphFilterSchema = z.object({
  field: z.string(),
  op: z.enum(["eq", "neq", "gt", "gte", "lt", "lte", "in", "nin", "contains"]),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
});
export type GraphFilter = z.infer<typeof GraphFilterSchema>;

/**
 * Graph query configuration - defines what data to fetch
 */
export const GraphQuerySchema = z.object({
  source: GraphDataSourceSchema,
  metric: z.string(),
  op: MetricOpSchema,
  field: z.string().optional(),
  groupBy: z.array(z.string()).optional(),
  filters: z.array(GraphFilterSchema).optional(),
  timeRange: DashboardTimeRangeSchema,
  customTimeRange: z
    .object({
      from: z.string().datetime(),
      to: z.string().datetime(),
    })
    .optional(),
  bucket: BucketSchema.default("auto"),
  limit: z.number().int().min(1).max(1000).optional(),
});
export type GraphQuery = z.infer<typeof GraphQuerySchema>;

// ============================================================
// Graph Display Schema
// ============================================================

/**
 * Graph display configuration - defines how to render the data
 */
export const GraphDisplaySchema = z.object({
  unit: UnitSchema.default("count"),
  decimals: z.number().int().min(0).max(4).default(2),
  showLegend: z.boolean().default(true),
  stacked: z.boolean().default(false),
  colors: z.array(z.string()).optional(),
  thresholds: z
    .array(
      z.object({
        value: z.number(),
        color: z.string(),
        label: z.string().optional(),
      })
    )
    .optional(),
  yAxisMin: z.number().optional(),
  yAxisMax: z.number().optional(),
  sparkline: z.boolean().default(false),
});
export type GraphDisplay = z.infer<typeof GraphDisplaySchema>;

// ============================================================
// Widget Layout Schema
// ============================================================

/**
 * Widget position and size in the grid
 */
export const WidgetLayoutSchema = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  w: z.number().int().min(1).max(12),
  h: z.number().int().min(1).max(8),
});
export type WidgetLayout = z.infer<typeof WidgetLayoutSchema>;

// ============================================================
// Dashboard Input Schemas
// ============================================================

/**
 * Create dashboard input
 */
export const CreateDashboardInputSchema = z.object({
  workspaceSlug: z.string(),
  projectId: z.string().optional(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  visibility: DashboardVisibilitySchema.default("workspace"),
  isDefault: z.boolean().default(false),
});
export type CreateDashboardInput = z.infer<typeof CreateDashboardInputSchema>;

/**
 * Update dashboard input
 */
export const UpdateDashboardInputSchema = z.object({
  workspaceSlug: z.string(),
  id: z.string(),
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  visibility: DashboardVisibilitySchema.optional(),
  isDefault: z.boolean().optional(),
});
export type UpdateDashboardInput = z.infer<typeof UpdateDashboardInputSchema>;

/**
 * List dashboards input
 */
export const ListDashboardsInputSchema = z.object({
  workspaceSlug: z.string(),
  projectId: z.string().optional(),
  visibility: DashboardVisibilitySchema.optional(),
});
export type ListDashboardsInput = z.infer<typeof ListDashboardsInputSchema>;

/**
 * Get dashboard input
 */
export const GetDashboardInputSchema = z.object({
  workspaceSlug: z.string(),
  id: z.string(),
});
export type GetDashboardInput = z.infer<typeof GetDashboardInputSchema>;

/**
 * Delete dashboard input
 */
export const DeleteDashboardInputSchema = z.object({
  workspaceSlug: z.string(),
  id: z.string(),
});
export type DeleteDashboardInput = z.infer<typeof DeleteDashboardInputSchema>;

// ============================================================
// Widget Input Schemas
// ============================================================

/**
 * Upsert widget input (create or update)
 */
export const UpsertWidgetInputSchema = z.object({
  workspaceSlug: z.string(),
  dashboardId: z.string(),
  widgetId: z.string().optional(), // If provided, update; otherwise create
  title: z.string().min(1).max(100),
  type: WidgetTypeSchema,
  query: GraphQuerySchema,
  display: GraphDisplaySchema,
  layout: WidgetLayoutSchema,
});
export type UpsertWidgetInput = z.infer<typeof UpsertWidgetInputSchema>;

/**
 * Delete widget input
 */
export const DeleteWidgetInputSchema = z.object({
  workspaceSlug: z.string(),
  dashboardId: z.string(),
  widgetId: z.string(),
});
export type DeleteWidgetInput = z.infer<typeof DeleteWidgetInputSchema>;

/**
 * Update layout input (batch update widget positions)
 */
export const UpdateLayoutInputSchema = z.object({
  workspaceSlug: z.string(),
  dashboardId: z.string(),
  layouts: z.array(
    z.object({
      widgetId: z.string(),
      layout: WidgetLayoutSchema,
    })
  ),
});
export type UpdateLayoutInput = z.infer<typeof UpdateLayoutInputSchema>;

// ============================================================
// Graph Query API Schemas
// ============================================================

/**
 * Execute graph query input
 */
export const GraphQueryInputSchema = z.object({
  workspaceSlug: z.string(),
  projectId: z.string(),
  query: GraphQuerySchema,
});
export type GraphQueryInput = z.infer<typeof GraphQueryInputSchema>;

/**
 * Graph query result - time series data
 */
export const GraphSeriesSchema = z.object({
  label: z.string(),
  data: z.array(
    z.object({
      time: z.string().datetime(),
      value: z.number(),
    })
  ),
});
export type GraphSeries = z.infer<typeof GraphSeriesSchema>;

/**
 * Graph query result
 */
export const GraphQueryResultSchema = z.object({
  series: z.array(GraphSeriesSchema),
  total: z.number().optional(),
  metadata: z
    .object({
      source: GraphDataSourceSchema,
      bucket: BucketSchema,
      timeRange: z.object({
        from: z.string().datetime(),
        to: z.string().datetime(),
      }),
    })
    .optional(),
});
export type GraphQueryResult = z.infer<typeof GraphQueryResultSchema>;

// ============================================================
// Project Summary Schema (for workspace overview)
// ============================================================

/**
 * Project summary for workspace overview
 */
export const ProjectSummarySchema = z.object({
  projectId: z.string(),
  projectName: z.string(),
  traceCount: z.number(),
  errorRate: z.number(),
  avgLatency: z.number(),
  p95Latency: z.number(),
  tokenCount: z.number(),
  costUsd: z.number(),
  lastActiveAt: z.string().datetime().optional(),
});
export type ProjectSummary = z.infer<typeof ProjectSummarySchema>;

/**
 * Get project summaries input
 */
export const GetProjectSummariesInputSchema = z.object({
  workspaceSlug: z.string(),
  timeRange: DashboardTimeRangeSchema.default("24h"),
  customTimeRange: z
    .object({
      from: z.string().datetime(),
      to: z.string().datetime(),
    })
    .optional(),
});
export type GetProjectSummariesInput = z.infer<typeof GetProjectSummariesInputSchema>;

// ============================================================
// Constants
// ============================================================

/**
 * All widget types (derived from schema)
 */
export const WIDGET_TYPES = WidgetTypeSchema.options;

/**
 * All data sources (derived from schema)
 */
export const DATA_SOURCES = GraphDataSourceSchema.options;

/**
 * All metric operations (derived from schema)
 */
export const METRIC_OPS = MetricOpSchema.options;

/**
 * All time ranges (derived from schema)
 */
export const DASHBOARD_TIME_RANGES = DashboardTimeRangeSchema.options;

/**
 * All buckets (derived from schema)
 */
export const BUCKETS = BucketSchema.options;

/**
 * All units (derived from schema)
 */
export const UNITS = UnitSchema.options;

/**
 * Widget type labels for display
 */
export const WIDGET_TYPE_LABELS: Record<WidgetType, string> = {
  line: "Line Chart",
  area: "Area Chart",
  bar: "Bar Chart",
  stacked_bar: "Stacked Bar",
  donut: "Donut Chart",
  single: "Single Value",
  table: "Table",
  stat: "Stat Card",
};

/**
 * Data source labels for display
 */
export const DATA_SOURCE_LABELS: Record<GraphDataSource, string> = {
  trace: "Traces",
  span: "Spans",
  log: "Logs",
};

/**
 * Metric operation labels for display
 */
export const METRIC_OP_LABELS: Record<MetricOp, string> = {
  count: "Count",
  sum: "Sum",
  avg: "Average",
  p50: "P50",
  p95: "P95",
  p99: "P99",
  unique_count: "Unique Count",
  rate: "Rate",
  error_rate: "Error Rate",
  ratio: "Ratio",
};

/**
 * Time range labels for display
 */
export const DASHBOARD_TIME_RANGE_LABELS: Record<DashboardTimeRange, string> = {
  "24h": "Last 24 Hours",
  "7d": "Last 7 Days",
  "30d": "Last 30 Days",
  custom: "Custom Range",
};

/**
 * Bucket labels for display
 */
export const BUCKET_LABELS: Record<Bucket, string> = {
  auto: "Auto",
  "1m": "1 Minute",
  "5m": "5 Minutes",
  "15m": "15 Minutes",
  "1h": "1 Hour",
  "6h": "6 Hours",
  "1d": "1 Day",
};

/**
 * Unit labels for display
 */
export const UNIT_LABELS: Record<Unit, string> = {
  count: "Count",
  ms: "Milliseconds",
  percent: "Percent",
  usd: "USD",
  tokens: "Tokens",
};

/**
 * Format value based on unit
 */
export function formatMetricValue(value: number, unit: Unit, decimals = 2): string {
  switch (unit) {
    case "ms":
      return `${value.toFixed(decimals)}ms`;
    case "percent":
      return `${value.toFixed(decimals)}%`;
    case "usd":
      return `$${value.toFixed(decimals)}`;
    case "tokens":
      return value >= 1000
        ? `${(value / 1000).toFixed(1)}k`
        : value.toFixed(0);
    case "count":
    default:
      return value >= 1000000
        ? `${(value / 1000000).toFixed(1)}M`
        : value >= 1000
          ? `${(value / 1000).toFixed(1)}k`
          : value.toFixed(decimals);
  }
}

/**
 * Calculate bucket interval in milliseconds
 */
export function bucketToMs(bucket: Bucket): number {
  switch (bucket) {
    case "1m":
      return 60_000;
    case "5m":
      return 300_000;
    case "15m":
      return 900_000;
    case "1h":
      return 3_600_000;
    case "6h":
      return 21_600_000;
    case "1d":
      return 86_400_000;
    case "auto":
    default:
      return 300_000; // Default to 5 minutes
  }
}

/**
 * Get auto bucket based on time range
 */
export function getAutoBucket(fromMs: number, toMs: number): Bucket {
  const rangeMs = toMs - fromMs;
  const rangeHours = rangeMs / 3_600_000;

  if (rangeHours <= 1) return "1m";
  if (rangeHours <= 6) return "5m";
  if (rangeHours <= 24) return "15m";
  if (rangeHours <= 168) return "1h"; // 7 days
  if (rangeHours <= 720) return "6h"; // 30 days
  return "1d";
}

/**
 * Convert time range to date range
 */
export function timeRangeToDateRange(
  timeRange: DashboardTimeRange,
  customTimeRange?: { from: string; to: string }
): { from: Date; to: Date } {
  const now = new Date();

  if (timeRange === "custom" && customTimeRange) {
    return {
      from: new Date(customTimeRange.from),
      to: new Date(customTimeRange.to),
    };
  }

  switch (timeRange) {
    case "24h":
      return {
        from: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        to: now,
      };
    case "7d":
      return {
        from: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
        to: now,
      };
    case "30d":
      return {
        from: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
        to: now,
      };
    default:
      return {
        from: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        to: now,
      };
  }
}
