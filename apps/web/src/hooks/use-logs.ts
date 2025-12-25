/**
 * useLogs Hook
 *
 * Provides data fetching and state management for the Logs Explorer.
 */
import { useCallback, useMemo } from "react";
import { trpc } from "@/lib/trpc/client";
import { showError } from "@/lib/errors";
import type { SeverityFilterValue } from "@/lib/log-utils";
import { getMinSeverityForFilter } from "@/lib/log-utils";

export interface LogFilters {
  severityFilter: SeverityFilterValue;
  serviceName: string | null;
  search: string;
  projectId: string | null;
  traceId: string | null;
}

const DEFAULT_FILTERS: LogFilters = {
  severityFilter: "all",
  serviceName: null,
  search: "",
  projectId: null,
  traceId: null,
};

/**
 * Hook for fetching and managing logs data
 */
export function useLogs(workspaceSlug: string, filters: Partial<LogFilters> = {}) {
  const {
    severityFilter = DEFAULT_FILTERS.severityFilter,
    serviceName = DEFAULT_FILTERS.serviceName,
    search = DEFAULT_FILTERS.search,
    projectId = DEFAULT_FILTERS.projectId,
    traceId = DEFAULT_FILTERS.traceId,
  } = filters;

  const queryInput = useMemo(
    () => ({
      workspaceSlug,
      severityMin:
        severityFilter !== "all"
          ? getMinSeverityForFilter(severityFilter)
          : undefined,
      serviceName: serviceName ?? undefined,
      search: search || undefined,
      projectId: projectId ?? undefined,
      traceId: traceId ?? undefined,
    }),
    [workspaceSlug, severityFilter, serviceName, search, projectId, traceId]
  );

  const {
    data,
    isLoading,
    isFetching,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = trpc.logs.list.useInfiniteQuery(queryInput, {
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: !!workspaceSlug,
    staleTime: 30_000,
  });

  // Flatten pages into single array
  const logs = useMemo(
    () => data?.pages.flatMap((page) => page.items) ?? [],
    [data]
  );

  const totalCount = data?.pages[0]?.totalCount ?? 0;

  // Load more handler
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage().catch(showError);
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return {
    logs,
    totalCount,
    isLoading,
    isFetching,
    error,
    loadMore,
    hasNextPage: hasNextPage ?? false,
    isFetchingNextPage,
  };
}

/**
 * Hook for fetching a single log detail
 */
export function useLogDetail(workspaceSlug: string, logId: string | null) {
  const { data, isLoading, error } = trpc.logs.get.useQuery(
    { workspaceSlug, logId: logId! },
    { enabled: !!workspaceSlug && !!logId }
  );

  return {
    log: data ?? null,
    isLoading,
    error,
  };
}

/**
 * Hook for fetching services for filter dropdown
 */
export function useLogServices(workspaceSlug: string, projectId?: string) {
  const { data, isLoading } = trpc.logs.getServices.useQuery(
    { workspaceSlug, projectId },
    { enabled: !!workspaceSlug, staleTime: 60_000 }
  );

  return {
    services: data ?? [],
    isLoading,
  };
}

/**
 * Hook for fetching severity stats
 */
export function useLogSeverityStats(workspaceSlug: string, projectId?: string) {
  const { data, isLoading } = trpc.logs.getSeverityStats.useQuery(
    { workspaceSlug, projectId },
    { enabled: !!workspaceSlug, staleTime: 30_000 }
  );

  return {
    stats: data ?? null,
    isLoading,
  };
}
