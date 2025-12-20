"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Cell,
} from "recharts";
import { DollarSign, TrendingUp, TrendingDown } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import type { TimeRange, TraceFilters, CustomDateRange } from "@cognobserve/api/schemas";

interface CostSidebarPanelProps {
  workspaceSlug: string;
  projectId: string;
  filters: TraceFilters;
  timeRange: TimeRange;
  customRange?: CustomDateRange;
}

// Chart colors
const CHART_COLORS = {
  cost: "hsl(var(--chart-1))",
  prompt: "hsl(var(--chart-4))",
  completion: "hsl(var(--chart-5))",
};

const MODEL_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

/**
 * Format currency
 */
const formatCurrency = (amount: number): string => {
  if (amount >= 1000) return `$${(amount / 1000).toFixed(1)}K`;
  if (amount >= 1) return `$${amount.toFixed(2)}`;
  if (amount >= 0.01) return `$${amount.toFixed(3)}`;
  if (amount === 0) return "$0.00";
  return `$${amount.toFixed(4)}`;
};

/**
 * Format large numbers with K/M suffix
 */
const formatNumber = (num: number): string => {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toLocaleString();
};

/**
 * Format percentage change
 */
const formatChange = (change: number): string => {
  const prefix = change >= 0 ? "+" : "";
  return `${prefix}${change.toFixed(1)}%`;
};

/**
 * Formatter wrapper for tooltip (handles unknown type from recharts)
 */
const formatNumberValue = (value: unknown): string => formatNumber(value as number);
const formatCurrencyValue = (value: unknown): string => formatCurrency(value as number);

/**
 * Format date for chart axis
 */
const formatDateLabel = (dateStr: string, range: TimeRange): string => {
  const date = new Date(dateStr);
  if (range === "24h") {
    return date.toLocaleTimeString([], { hour: "2-digit" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
};

export function CostSidebarPanel({
  workspaceSlug,
  projectId,
  filters,
  timeRange,
  customRange,
}: CostSidebarPanelProps) {
  // Build query params with filters
  const queryParams = {
    workspaceSlug,
    projectId,
    timeRange,
    // Pass custom date range if applicable
    customFrom: customRange?.from,
    customTo: customRange?.to,
    // Pass filter params
    search: filters.search,
    types: filters.types,
    levels: filters.levels,
    models: filters.models,
    minDuration: filters.minDuration,
    maxDuration: filters.maxDuration,
  };

  // Cost data
  const { data: costOverview, isLoading: isLoadingCost } =
    trpc.costs.getOverview.useQuery(
      queryParams,
      { enabled: !!workspaceSlug && !!projectId }
    );

  const { data: costByModel } =
    trpc.costs.getByModel.useQuery(
      queryParams,
      { enabled: !!workspaceSlug && !!projectId }
    );

  const { data: costTimeSeries } =
    trpc.costs.getTimeSeries.useQuery(
      queryParams,
      { enabled: !!workspaceSlug && !!projectId }
    );

  // NOTE: analytics router removed - token/model usage will be reworked for OTLP-first design
  const isLoading = isLoadingCost;

  if (isLoading) {
    return <PanelSkeleton />;
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <DollarSign className="h-4 w-4" />
          <span className="text-sm font-semibold">Analytics & Costs</span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 space-y-4 overflow-auto p-4">
        {/* Cost Statistics - First */}
        {costOverview && (
          <div className="space-y-3">
            {/* Total Cost */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Total Cost</span>
                <ChangeIndicator change={costOverview.costChange} />
              </div>
              <p className="text-2xl font-bold">{formatCurrency(costOverview.totalCost)}</p>
            </div>
            {/* Cost Breakdown */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Input Cost</span>
                <span className="font-medium">{formatCurrency(costOverview.breakdown.inputCost)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Output Cost</span>
                <span className="font-medium">{formatCurrency(costOverview.breakdown.outputCost)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Input Tokens</span>
                <span className="font-medium">{formatNumber(costOverview.inputTokens)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Output Tokens</span>
                <span className="font-medium">{formatNumber(costOverview.outputTokens)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Total Tokens</span>
                <span className="font-medium">{formatNumber(costOverview.totalTokens)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Avg Cost/Trace</span>
                <span className="font-medium">{formatCurrency(costOverview.avgCostPerTrace)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Billable Spans</span>
                <span className="font-medium">{formatNumber(costOverview.billableSpans)}</span>
              </div>
            </div>
          </div>
        )}

        <Separator />

        {/* NOTE: Token Usage and Model Usage charts removed - will be reworked for OTLP-first design */}

        {/* Cost Trend Chart */}
        <CostTrendChart data={costTimeSeries ?? []} timeRange={timeRange} />

        <Separator />

        {/* Cost by Model Chart */}
        <CostByModelChart data={costByModel ?? []} />
      </div>
    </div>
  );
}

/**
 * Token Usage mini chart
 */
function TokenUsageChart({
  data,
  timeRange,
}: {
  data: Array<{ date: string; prompt: number; completion: number }>;
  timeRange: TimeRange;
}) {
  const chartConfig: ChartConfig = {
    prompt: { label: "Prompt", color: CHART_COLORS.prompt },
    completion: { label: "Completion", color: CHART_COLORS.completion },
  };

  const chartData = useMemo(() => {
    return data.map((d) => ({
      ...d,
      dateLabel: formatDateLabel(d.date, timeRange),
    }));
  }, [data, timeRange]);

  if (data.length === 0) {
    return (
      <div className="space-y-2">
        <span className="text-xs font-medium">Token Usage</span>
        <div className="flex h-[80px] items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
          No token data
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <span className="text-xs font-medium">Token Usage</span>
      <ChartContainer config={chartConfig} className="h-[80px] w-full">
        <AreaChart data={chartData} accessibilityLayer>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="dateLabel"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 9 }}
            interval="preserveStartEnd"
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 9 }}
            width={35}
            tickFormatter={formatNumber}
          />
          <ChartTooltip
            content={<ChartTooltipContent formatter={formatNumberValue} />}
          />
          <Area type="monotone" dataKey="prompt" stackId="1" stroke="var(--color-prompt)" fill="var(--color-prompt)" fillOpacity={0.4} />
          <Area type="monotone" dataKey="completion" stackId="1" stroke="var(--color-completion)" fill="var(--color-completion)" fillOpacity={0.4} />
        </AreaChart>
      </ChartContainer>
    </div>
  );
}

/**
 * Model Usage mini pie chart
 */
function ModelUsageChart({
  data,
}: {
  data: Array<{ model: string; count: number }>;
}) {
  const chartConfig = useMemo(() => {
    const config: ChartConfig = {};
    data.forEach((item, idx) => {
      config[item.model] = {
        label: item.model,
        color: MODEL_COLORS[idx % MODEL_COLORS.length],
      };
    });
    return config;
  }, [data]);

  const renderPieCell = (entry: { model: string; count: number }, idx: number) => (
    <Cell key={entry.model} fill={MODEL_COLORS[idx % MODEL_COLORS.length]} />
  );

  const renderLegendItem = (item: { model: string; count: number }, idx: number) => (
    <div key={item.model} className="flex items-center gap-1">
      <span
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: MODEL_COLORS[idx % MODEL_COLORS.length] }}
      />
      <span className="text-muted-foreground">{item.model}</span>
      <span className="font-medium">{item.count}</span>
    </div>
  );

  if (data.length === 0) {
    return (
      <div className="space-y-2">
        <span className="text-xs font-medium">Model Usage</span>
        <div className="flex h-[100px] items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
          No model data
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <span className="text-xs font-medium">Model Usage</span>
      <ChartContainer config={chartConfig} className="h-[100px] w-full">
        <PieChart accessibilityLayer>
          <ChartTooltip content={<ChartTooltipContent />} />
          <Pie
            data={data}
            dataKey="count"
            nameKey="model"
            cx="50%"
            cy="50%"
            innerRadius={25}
            outerRadius={40}
            paddingAngle={2}
          >
            {data.map(renderPieCell)}
          </Pie>
        </PieChart>
      </ChartContainer>
      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {data.slice(0, 5).map(renderLegendItem)}
      </div>
    </div>
  );
}

/**
 * Cost trend mini chart
 */
function CostTrendChart({
  data,
  timeRange,
}: {
  data: Array<{ date: string; cost: number }>;
  timeRange: TimeRange;
}) {
  const chartConfig: ChartConfig = {
    cost: { label: "Cost", color: CHART_COLORS.cost },
  };

  const chartData = useMemo(() => {
    return data.map((d) => ({
      ...d,
      dateLabel: formatDateLabel(d.date, timeRange),
    }));
  }, [data, timeRange]);

  if (data.length === 0) {
    return (
      <div className="space-y-2">
        <span className="text-xs font-medium">Cost Trend</span>
        <div className="flex h-[80px] items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
          No cost data
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <span className="text-xs font-medium">Cost Trend</span>
      <ChartContainer config={chartConfig} className="h-[80px] w-full">
        <AreaChart data={chartData} accessibilityLayer>
          <defs>
            <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-cost)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="var(--color-cost)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="dateLabel"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 9 }}
            interval="preserveStartEnd"
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 9 }}
            width={35}
            tickFormatter={formatCurrency}
          />
          <ChartTooltip
            content={<ChartTooltipContent formatter={formatCurrencyValue} />}
          />
          <Area
            type="monotone"
            dataKey="cost"
            stroke="var(--color-cost)"
            strokeWidth={1.5}
            fill="url(#costGradient)"
          />
        </AreaChart>
      </ChartContainer>
    </div>
  );
}

/**
 * Cost by model mini chart
 */
function CostByModelChart({
  data,
}: {
  data: Array<{ model: string; displayName: string; cost: number; percentage: number }>;
}) {
  const topModels = data.slice(0, 4);

  const chartConfig = useMemo(() => {
    const config: ChartConfig = {};
    topModels.forEach((item, idx) => {
      config[item.model] = {
        label: item.displayName,
        color: MODEL_COLORS[idx % MODEL_COLORS.length],
      };
    });
    return config;
  }, [topModels]);

  const addFillColor = (
    item: { model: string; displayName: string; cost: number; percentage: number },
    idx: number
  ) => ({
    ...item,
    fill: MODEL_COLORS[idx % MODEL_COLORS.length],
  });

  const chartData = topModels.map(addFillColor);

  if (data.length === 0) {
    return (
      <div className="space-y-2">
        <span className="text-xs font-medium">Cost by Model</span>
        <div className="flex h-[80px] items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
          No cost data
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <span className="text-xs font-medium">Cost by Model</span>
      <ChartContainer config={chartConfig} className="h-[80px] w-full">
        <BarChart data={chartData} layout="vertical" accessibilityLayer>
          <CartesianGrid horizontal={false} strokeDasharray="3 3" />
          <XAxis
            type="number"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 9 }}
            tickFormatter={formatCurrency}
          />
          <YAxis
            dataKey="displayName"
            type="category"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 9 }}
            width={60}
          />
          <ChartTooltip
            content={<ChartTooltipContent formatter={formatCurrencyValue} />}
          />
          <Bar dataKey="cost" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ChartContainer>
    </div>
  );
}

/**
 * Change indicator
 */
function ChangeIndicator({ change }: { change: number }) {
  if (change === 0) return null;
  const isIncrease = change > 0;

  return (
    <div
      className={cn(
        "flex items-center gap-0.5 text-xs",
        isIncrease ? "text-destructive" : "text-green-600"
      )}
    >
      {isIncrease ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {formatChange(change)}
    </div>
  );
}

/**
 * Loading skeleton
 */
function PanelSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <DollarSign className="h-4 w-4" />
        <span className="text-sm font-semibold">Analytics & Costs</span>
      </div>
      <div className="flex-1 space-y-4 p-4">
        {/* Cost Statistics */}
        <Skeleton className="h-28 w-full" />
        <Separator />
        {/* Token Usage */}
        <Skeleton className="h-[100px] w-full" />
        <Separator />
        {/* Model Usage */}
        <Skeleton className="h-[120px] w-full" />
        <Separator />
        {/* Cost Trend */}
        <Skeleton className="h-[100px] w-full" />
        <Separator />
        {/* Cost by Model */}
        <Skeleton className="h-[100px] w-full" />
      </div>
    </div>
  );
}
