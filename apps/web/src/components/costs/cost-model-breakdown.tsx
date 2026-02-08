"use client";

import { useMemo } from "react";
import { Bar, BarChart, XAxis, YAxis, CartesianGrid } from "recharts";
import { PieChart as PieChartIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Badge } from "@/components/ui/badge";
import { formatCost, formatNumber } from "@/lib/format";
import type { ModelCostBreakdown } from "@ducsigr/api/schemas";

interface CostModelBreakdownProps {
  data: ModelCostBreakdown[];
}

const MODEL_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

const formatCostValue = (value: unknown): string => formatCost(value as number);

function renderTableRow(item: ModelCostBreakdown) {
  return (
    <TableRow key={item.model}>
      <TableCell className="font-medium">{item.displayName}</TableCell>
      <TableCell>
        <Badge variant="outline" className="text-[10px]">
          {item.provider}
        </Badge>
      </TableCell>
      <TableCell className="text-right">{formatCost(item.cost)}</TableCell>
      <TableCell className="text-right">{item.percentage.toFixed(1)}%</TableCell>
      <TableCell className="text-right">{formatNumber(item.tokens)}</TableCell>
      <TableCell className="text-right">{formatNumber(item.spanCount)}</TableCell>
    </TableRow>
  );
}

export function CostModelBreakdown({ data }: CostModelBreakdownProps) {
  const topModels = data.slice(0, 5);

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

  const chartData = useMemo(
    () =>
      topModels.map((item, idx) => ({
        ...item,
        fill: MODEL_COLORS[idx % MODEL_COLORS.length],
      })),
    [topModels]
  );

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <PieChartIcon className="h-4 w-4" />
            Cost by Model
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-[150px] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
            No model cost data
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <PieChartIcon className="h-4 w-4" />
          Cost by Model
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Bar Chart */}
          <ChartContainer config={chartConfig} className="h-[200px] w-full">
            <BarChart data={chartData} layout="vertical" accessibilityLayer>
              <CartesianGrid horizontal={false} strokeDasharray="3 3" />
              <XAxis
                type="number"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11 }}
                tickFormatter={formatCost}
              />
              <YAxis
                dataKey="displayName"
                type="category"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11 }}
                width={80}
              />
              <ChartTooltip
                content={<ChartTooltipContent formatter={formatCostValue} />}
              />
              <Bar dataKey="cost" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ChartContainer>

          {/* Table */}
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Model</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">%</TableHead>
                  <TableHead className="text-right">Tokens</TableHead>
                  <TableHead className="text-right">Spans</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>{data.map(renderTableRow)}</TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
