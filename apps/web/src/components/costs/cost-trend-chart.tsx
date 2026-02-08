"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { formatCost } from "@/lib/format";
import type { CostTimePoint, TimeRange } from "@ducsigr/api/schemas";

interface CostTrendChartProps {
  data: CostTimePoint[];
  timeRange: TimeRange;
}

const CHART_CONFIG: ChartConfig = {
  inputCost: { label: "Input Cost", color: "hsl(var(--chart-1))" },
  outputCost: { label: "Output Cost", color: "hsl(var(--chart-2))" },
};

const formatDateLabel = (dateStr: string, range: TimeRange): string => {
  const date = new Date(dateStr);
  if (range === "24h") {
    return date.toLocaleTimeString([], { hour: "2-digit" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
};

const formatCostValue = (value: unknown): string => formatCost(value as number);

export function CostTrendChart({ data, timeRange }: CostTrendChartProps) {
  const chartData = useMemo(
    () =>
      data.map((d) => ({
        ...d,
        dateLabel: formatDateLabel(d.date, timeRange),
      })),
    [data, timeRange]
  );

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <TrendingUp className="h-4 w-4" />
            Cost Over Time
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-[200px] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
            No cost data for this period
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <TrendingUp className="h-4 w-4" />
          Cost Over Time
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={CHART_CONFIG} className="h-[300px] w-full">
          <AreaChart data={chartData} accessibilityLayer>
            <defs>
              <linearGradient id="inputCostGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-inputCost)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--color-inputCost)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="outputCostGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-outputCost)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--color-outputCost)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="dateLabel"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11 }}
              interval="preserveStartEnd"
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11 }}
              width={50}
              tickFormatter={formatCost}
            />
            <ChartTooltip
              content={<ChartTooltipContent formatter={formatCostValue} />}
            />
            <Area
              type="monotone"
              dataKey="inputCost"
              stackId="cost"
              stroke="var(--color-inputCost)"
              strokeWidth={1.5}
              fill="url(#inputCostGradient)"
            />
            <Area
              type="monotone"
              dataKey="outputCost"
              stackId="cost"
              stroke="var(--color-outputCost)"
              strokeWidth={1.5}
              fill="url(#outputCostGradient)"
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
