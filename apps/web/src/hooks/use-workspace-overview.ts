"use client";

import { trpc } from "@/lib/trpc/client";
import type {
  DashboardTimeRange,
  WorkspaceStats,
  RecentActivityItem,
} from "@cognobserve/api/schemas";

// ============================================================
// useWorkspaceStats Hook
// ============================================================

export function useWorkspaceStats(
  workspaceSlug: string,
  timeRange: DashboardTimeRange = "24h",
  customTimeRange?: { from: string; to: string }
) {
  const {
    data: stats,
    isLoading,
    error,
    refetch,
  } = trpc.workspaceOverview.getStats.useQuery(
    { workspaceSlug, timeRange, customTimeRange },
    {
      enabled: !!workspaceSlug,
      staleTime: 60_000, // Cache for 1 minute
      refetchInterval: 120_000, // Auto-refresh every 2 minutes
    }
  );

  return {
    stats: stats ?? null,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

// ============================================================
// useRecentActivity Hook
// ============================================================

export function useRecentActivity(workspaceSlug: string, limit: number = 10) {
  const {
    data,
    isLoading,
    error,
    refetch,
  } = trpc.workspaceOverview.getRecentActivity.useQuery(
    { workspaceSlug, limit },
    {
      enabled: !!workspaceSlug,
      staleTime: 30_000, // Cache for 30 seconds
      refetchInterval: 60_000, // Auto-refresh every 1 minute
    }
  );

  return {
    activities: data?.items ?? [],
    total: data?.total ?? 0,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

// ============================================================
// Combined Hook for Workspace Overview
// ============================================================

export function useWorkspaceOverview(
  workspaceSlug: string,
  timeRange: DashboardTimeRange = "24h"
) {
  const {
    stats,
    isLoading: isLoadingStats,
    error: statsError,
    refetch: refetchStats,
  } = useWorkspaceStats(workspaceSlug, timeRange);

  const {
    activities,
    total: activityTotal,
    isLoading: isLoadingActivity,
    error: activityError,
    refetch: refetchActivity,
  } = useRecentActivity(workspaceSlug, 10);

  const refetch = async () => {
    await Promise.all([refetchStats(), refetchActivity()]);
  };

  return {
    stats,
    activities,
    activityTotal,
    isLoading: isLoadingStats || isLoadingActivity,
    error: statsError ?? activityError,
    refetch,
  };
}

// ============================================================
// Type Exports
// ============================================================

export type { WorkspaceStats, RecentActivityItem };
