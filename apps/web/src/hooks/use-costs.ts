"use client";

import { useMemo } from "react";
import { trpc } from "@/lib/trpc/client";
import type { TimeRange, CustomDateRange } from "@ducsigr/api/schemas";

interface UseCostsParams {
  workspaceSlug: string;
  projectId: string;
  timeRange: TimeRange;
  customRange?: CustomDateRange;
}

export function useCosts({
  workspaceSlug,
  projectId,
  timeRange,
  customRange,
}: UseCostsParams) {
  const enabled = !!workspaceSlug && !!projectId;

  const queryParams = useMemo(
    () => ({
      workspaceSlug,
      projectId,
      timeRange,
      customFrom: customRange?.from,
      customTo: customRange?.to,
    }),
    [workspaceSlug, projectId, timeRange, customRange]
  );

  const { data: overview, isLoading: isLoadingOverview } =
    trpc.costs.getOverview.useQuery(queryParams, { enabled });

  const { data: modelBreakdown, isLoading: isLoadingModels } =
    trpc.costs.getByModel.useQuery(queryParams, { enabled });

  const { data: timeSeries, isLoading: isLoadingTimeSeries } =
    trpc.costs.getTimeSeries.useQuery(queryParams, { enabled });

  const isLoading = isLoadingOverview || isLoadingModels || isLoadingTimeSeries;

  return {
    overview: overview ?? null,
    modelBreakdown: modelBreakdown ?? [],
    timeSeries: timeSeries ?? [],
    isLoading,
  };
}
