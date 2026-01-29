"use client";

import { trpc } from "@/lib/trpc/client";

interface UseProjectUserCountOptions {
  workspaceSlug: string;
  projectId: string;
}

export function useProjectUserCount({ workspaceSlug, projectId }: UseProjectUserCountOptions) {
  const { data, isLoading, error } = trpc.trackedUsers.summary.useQuery(
    { workspaceSlug, projectId },
    { enabled: !!workspaceSlug && !!projectId }
  );

  return {
    userCount: data?.totalUsers ?? 0,
    isLoading,
    error,
  };
}