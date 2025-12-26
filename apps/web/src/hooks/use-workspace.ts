"use client";

import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import type { WorkspaceListItem, CreateWorkspaceInput } from "@ducsigr/api/client";

interface UseWorkspaceReturn {
  workspaces: WorkspaceListItem[];
  isLoading: boolean;
  error: Error | null;
  createWorkspace: (input: CreateWorkspaceInput) => Promise<WorkspaceListItem>;
  switchWorkspace: (slug: string) => void;
  refetch: () => void;
}

/**
 * Hook for managing workspaces using tRPC.
 * Provides type-safe queries and mutations.
 */
export function useWorkspace(): UseWorkspaceReturn {
  const router = useRouter();
  const utils = trpc.useUtils();

  // Query: List workspaces with details
  const {
    data: workspaces = [],
    isLoading,
    error,
    refetch,
  } = trpc.workspaces.listWithDetails.useQuery();

  // Mutation: Create workspace
  const createMutation = trpc.workspaces.create.useMutation({
    onSuccess: () => {
      // Invalidate to refetch the list
      utils.workspaces.listWithDetails.invalidate();
    },
  });

  const createWorkspace = async (
    input: CreateWorkspaceInput
  ): Promise<WorkspaceListItem> => {
    return createMutation.mutateAsync(input);
  };

  const switchWorkspace = (slug: string): void => {
    router.push(`/workspace/${slug}`);
  };

  return {
    workspaces,
    isLoading,
    error: error as Error | null,
    createWorkspace,
    switchWorkspace,
    refetch,
  };
}
