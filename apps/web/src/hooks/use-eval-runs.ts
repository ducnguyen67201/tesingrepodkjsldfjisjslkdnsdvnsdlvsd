/**
 * Hook for eval run queries
 */

import { trpc } from "@/lib/trpc/client";

interface UseEvalRunsOptions {
  workspaceSlug: string;
  suiteId: string;
  limit?: number;
}

export function useEvalRuns({ workspaceSlug, suiteId, limit = 20 }: UseEvalRunsOptions) {
  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = trpc.evals.listRuns.useInfiniteQuery(
    { workspaceSlug, suiteId, limit },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      staleTime: 30_000,
    }
  );

  // Flatten paginated results
  const runs = data?.pages.flatMap((page) => page.items) ?? [];

  return {
    runs,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  };
}

interface UseEvalRunOptions {
  workspaceSlug: string;
  runId: string;
  enabled?: boolean;
}

export function useEvalRun({ workspaceSlug, runId, enabled = true }: UseEvalRunOptions) {
  const {
    data: run,
    isLoading,
    error,
    refetch,
  } = trpc.evals.getRun.useQuery(
    { workspaceSlug, runId },
    { enabled, staleTime: 10_000 }
  );

  return {
    run,
    isLoading,
    error,
    refetch,
  };
}

interface UseEvalRunStatusOptions {
  workspaceSlug: string;
  runId: string;
  enabled?: boolean;
  refetchInterval?: number | false;
}

export function useEvalRunStatus({
  workspaceSlug,
  runId,
  enabled = true,
  refetchInterval = false,
}: UseEvalRunStatusOptions) {
  const {
    data: status,
    isLoading,
    error,
  } = trpc.evals.getRunStatus.useQuery(
    { workspaceSlug, runId },
    {
      enabled,
      refetchInterval: refetchInterval || undefined,
      staleTime: 5_000,
    }
  );

  return {
    status,
    isLoading,
    error,
    isRunning: status?.status === "RUNNING" || status?.status === "PENDING",
    isCompleted: status?.status === "PASSED" || status?.status === "FAILED" || status?.status === "REGRESSION_DETECTED",
    isRegression: status?.isRegression ?? false,
  };
}
