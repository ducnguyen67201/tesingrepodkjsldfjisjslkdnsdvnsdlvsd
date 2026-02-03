"use client";

import { trpc } from "@/lib/trpc/client";

interface UseSystemAdminReturn {
  isSystemAdmin: boolean;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Hook to check if the current user is a system admin.
 * Results are cached for 5 minutes to minimize API calls.
 */
export function useSystemAdmin(): UseSystemAdminReturn {
  const { data, isLoading, error } = trpc.workspaces.checkSystemAdmin.useQuery(
    undefined,
    {
      staleTime: 5 * 60 * 1000, // Cache for 5 minutes
      refetchOnWindowFocus: false,
    }
  );

  return {
    isSystemAdmin: data?.isSystemAdmin ?? false,
    isLoading,
    error: error as Error | null,
  };
}
