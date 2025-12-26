"use client";

import { memo, useMemo } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import { MoreVertical, Pencil, Trash2, GripVertical } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useGraphQuery } from "@/hooks/use-dashboards";
import { formatMetricValue } from "@ducsigr/api/schemas";
import type {
  WidgetType,
  GraphQuery,
  GraphDisplay,
} from "@ducsigr/api/schemas";

// Chart colors for series
const CHART_COLORS = ["#eab308", "#3b82f6", "#22c55e", "#ef4444", "#8b5cf6"];

// ============================================================
// Props
// ============================================================

interface WidgetCardProps {
  id: string;
  title: string;
  type: WidgetType;
  query: GraphQuery;
  display: GraphDisplay;
  workspaceSlug: string;
  projectId: string;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  isDragging?: boolean;
}

// ============================================================
// Component
// ============================================================

export const WidgetCard = memo(function WidgetCard({
  id,
  title,
  type,
  query,
  display,
  workspaceSlug,
  projectId,
  onEdit,
  onDelete,
  isDragging,
}: WidgetCardProps) {
  const { data, isLoading, error } = useGraphQuery(
    workspaceSlug,
    projectId,
    query
  );

  const handleEdit = () => onEdit?.(id);
  const handleDelete = () => onDelete?.(id);

  const isStatCard = type === "stat";

  return (
    <Card className={isDragging ? "ring-2 ring-primary" : undefined}>
      <CardHeader className={`flex flex-row items-center justify-between space-y-0 ${isStatCard ? "pb-1 pt-3 px-3" : "pb-2"}`}>
        <div className="flex items-center gap-2">
          {!isStatCard && <GripVertical className="h-4 w-4 cursor-grab text-muted-foreground" />}
          <CardTitle className={`font-medium uppercase tracking-wide ${isStatCard ? "text-[10px] text-muted-foreground" : "text-sm"}`}>
            {title}
          </CardTitle>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className={isStatCard ? "h-6 w-6" : "h-8 w-8"}>
              <MoreVertical className={isStatCard ? "h-3 w-3" : "h-4 w-4"} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleEdit}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleDelete} className="text-destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent className={isStatCard ? "px-3 pb-3 pt-0" : "p-4 pt-0"}>
        {isLoading ? (
          <Skeleton className={isStatCard ? "h-[80px] w-full" : "h-[200px] w-full"} />
        ) : error ? (
          <ErrorState message={error.message} compact={isStatCard} />
        ) : !data || data.series.length === 0 ? (
          <EmptyState compact={isStatCard} />
        ) : (
          <ChartRenderer
            type={type}
            series={data.series}
            display={display}
          />
        )}
      </CardContent>
    </Card>
  );
});

// ============================================================
// Chart Renderer
// ============================================================

interface ChartRendererProps {
  type: WidgetType;
  series: Array<{
    label: string;
    data: Array<{ time: string; value: number }>;
  }>;
  display: GraphDisplay;
}

function ChartRenderer({ type, series, display }: ChartRendererProps) {
  // Single value widget
  if (type === "single") {
    return <SingleValueWidget series={series} display={display} />;
  }

  // Stat card with sparkline
  if (type === "stat") {
    return <StatWidget series={series} display={display} />;
  }

  // Table widget
  if (type === "table") {
    return <TableWidget series={series} display={display} />;
  }

  // Chart widgets
  return <TimeSeriesChart type={type} series={series} />;
}

// ============================================================
// Single Value Widget
// ============================================================

interface SingleValueWidgetProps {
  series: Array<{
    label: string;
    data: Array<{ time: string; value: number }>;
  }>;
  display: GraphDisplay;
}

function SingleValueWidget({ series, display }: SingleValueWidgetProps) {
  const total = series.reduce(
    (acc, s) => acc + s.data.reduce((a, d) => a + d.value, 0),
    0
  );

  return (
    <div className="flex h-[120px] flex-col items-center justify-center">
      <p className="text-4xl font-bold">
        {formatMetricValue(total, display.unit ?? "count", display.decimals ?? 2)}
      </p>
      <p className="text-sm text-muted-foreground">Total</p>
    </div>
  );
}

// ============================================================
// Stat Widget (Compact card with sparkline)
// ============================================================

interface StatWidgetProps {
  series: Array<{
    label: string;
    data: Array<{ time: string; value: number }>;
  }>;
  display: GraphDisplay;
}

function StatWidget({ series, display }: StatWidgetProps) {
  // Calculate total and trend
  const { total, trend, sparklineData } = useMemo(() => {
    const allData = series.flatMap((s) => s.data);
    const sorted = [...allData].sort((a, b) => a.time.localeCompare(b.time));
    const sum = sorted.reduce((acc, d) => acc + d.value, 0);

    // Calculate trend (comparing last half vs first half)
    const mid = Math.floor(sorted.length / 2);
    const firstHalf = sorted.slice(0, mid).reduce((acc, d) => acc + d.value, 0);
    const secondHalf = sorted.slice(mid).reduce((acc, d) => acc + d.value, 0);
    const trendPct = firstHalf > 0 ? ((secondHalf - firstHalf) / firstHalf) * 100 : 0;

    // Sparkline data (normalize values)
    const maxVal = Math.max(...sorted.map((d) => d.value), 1);
    const sparkData = sorted.map((d) => ({
      value: (d.value / maxVal) * 100,
    }));

    return { total: sum, trend: trendPct, sparklineData: sparkData };
  }, [series]);

  const trendColor = trend >= 0 ? "#22c55e" : "#ef4444";
  const trendSign = trend >= 0 ? "+" : "";

  return (
    <div className="flex h-[80px] items-center justify-between">
      <div className="flex flex-col">
        <p className="text-2xl font-bold text-primary">
          {formatMetricValue(total, display.unit ?? "count", display.decimals ?? 2)}
        </p>
        {sparklineData.length > 1 && (
          <p className="text-xs" style={{ color: trendColor }}>
            {trendSign}{trend.toFixed(1)}%
          </p>
        )}
      </div>
      {sparklineData.length > 1 && (
        <div className="h-[50px] w-[100px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sparklineData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
              <Line
                type="monotone"
                dataKey="value"
                stroke={trendColor}
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Table Widget
// ============================================================

interface TableWidgetProps {
  series: Array<{
    label: string;
    data: Array<{ time: string; value: number }>;
  }>;
  display: GraphDisplay;
}

function TableWidget({ series, display }: TableWidgetProps) {
  const rows = series.map((s) => ({
    label: s.label,
    value: s.data.reduce((a, d) => a + d.value, 0),
  }));

  return (
    <div className="max-h-[150px] overflow-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="pb-2 text-left font-medium">Name</th>
            <th className="pb-2 text-right font-medium">Value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b last:border-0">
              <td className="py-1.5">{row.label}</td>
              <td className="py-1.5 text-right font-mono">
                {formatMetricValue(row.value, display.unit ?? "count", display.decimals ?? 2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================
// Time Series Chart
// ============================================================

interface TimeSeriesChartProps {
  type: WidgetType;
  series: Array<{
    label: string;
    data: Array<{ time: string; value: number }>;
  }>;
  display: GraphDisplay;
}

function TimeSeriesChart({ type, series }: Omit<TimeSeriesChartProps, "display">) {
  // Merge series data by time
  const chartData = useMemo(() => {
    const timeMap = new Map<string, Record<string, number>>();
    series.forEach((s) => {
      s.data.forEach((d) => {
        if (!timeMap.has(d.time)) {
          timeMap.set(d.time, {});
        }
        timeMap.get(d.time)![s.label] = d.value;
      });
    });
    const sortedEntries = Array.from(timeMap.entries()).sort(([a], [b]) => a.localeCompare(b));
    return sortedEntries.map(([time, values]) => ({
      time,
      displayTime: formatTimeLabel(time, sortedEntries.length),
      ...values,
    }));
  }, [series]);

  // Calculate tick interval to show ~5-6 labels max
  const tickInterval = Math.max(Math.floor(chartData.length / 5) - 1, 0);

  // Show empty state if no chart data
  if (chartData.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
        No data points to display
      </div>
    );
  }

  if (type === "line" || type === "area") {
    return (
      <div className="h-[200px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="displayTime"
              tick={{ fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              interval={tickInterval}
            />
            <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={35} />
            {series.map((s, i) => (
              <Line
                key={s.label}
                type="monotone"
                dataKey={s.label}
                stroke={CHART_COLORS[i % CHART_COLORS.length]}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (type === "bar" || type === "stacked_bar") {
    return (
      <div className="h-[200px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="displayTime"
              tick={{ fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              interval={tickInterval}
            />
            <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={35} />
            {series.map((s, i) => (
              <Bar
                key={s.label}
                dataKey={s.label}
                fill={CHART_COLORS[i % CHART_COLORS.length]}
                stackId={type === "stacked_bar" ? "stack" : undefined}
                radius={[2, 2, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return null;
}


// ============================================================
// Helpers
// ============================================================

function formatTimeLabel(isoString: string, dataLength: number): string {
  const date = new Date(isoString);

  // For longer time ranges (more points), show date
  if (dataLength > 48) {
    // Likely 7d or 30d range - show month/day
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  } else if (dataLength > 24) {
    // Likely multi-day range - show day + hour
    return date.toLocaleDateString([], { weekday: "short", hour: "2-digit" });
  } else {
    // 24h or less - show time only
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
}

// ============================================================
// States
// ============================================================

function EmptyState({ compact }: { compact?: boolean }) {
  return (
    <div className={`flex items-center justify-center text-sm text-muted-foreground ${compact ? "h-[80px]" : "h-[150px]"}`}>
      No data available
    </div>
  );
}

function ErrorState({ message, compact }: { message: string; compact?: boolean }) {
  return (
    <div className={`flex flex-col items-center justify-center text-sm text-destructive ${compact ? "h-[80px]" : "h-[150px]"}`}>
      <p>Failed to load data</p>
      <p className="text-xs text-muted-foreground">{message}</p>
    </div>
  );
}
