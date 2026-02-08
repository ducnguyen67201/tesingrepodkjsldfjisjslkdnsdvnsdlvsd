"use client";

import { useState, useCallback } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { TimeRangeButtons } from "@/components/dashboard";
import { useCosts } from "@/hooks/use-costs";
import { CostOverviewCards } from "./cost-overview-cards";
import { CostTrendChart } from "./cost-trend-chart";
import { CostModelBreakdown } from "./cost-model-breakdown";
import { CostPricingTable } from "./cost-pricing-table";
import type { TimeRange } from "@ducsigr/api/schemas";
import type { DashboardTimeRange } from "@ducsigr/api/schemas";

interface CostAnalyticsViewProps {
  workspaceSlug: string;
  projectId: string;
}

export function CostAnalyticsView({
  workspaceSlug,
  projectId,
}: CostAnalyticsViewProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>("7d");

  const { overview, modelBreakdown, timeSeries, isLoading } = useCosts({
    workspaceSlug,
    projectId,
    timeRange,
  });

  const handleTimeRangeChange = useCallback((value: DashboardTimeRange) => {
    setTimeRange(value as TimeRange);
  }, []);

  if (isLoading) {
    return <CostAnalyticsSkeleton />;
  }

  return (
    <div className="space-y-4">
      {/* Time Range Selector */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Cost Analytics</h2>
        <TimeRangeButtons
          value={timeRange as DashboardTimeRange}
          onChange={handleTimeRangeChange}
        />
      </div>

      {/* Overview Cards */}
      {overview && <CostOverviewCards overview={overview} />}

      {/* Cost Trend Chart */}
      <CostTrendChart data={timeSeries} timeRange={timeRange} />

      {/* Model Breakdown */}
      <CostModelBreakdown data={modelBreakdown} />

      {/* Pricing Reference */}
      <CostPricingTable />
    </div>
  );
}

function CostAnalyticsSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-8 w-48" />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
      <Skeleton className="h-[340px]" />
      <Skeleton className="h-[260px]" />
    </div>
  );
}
