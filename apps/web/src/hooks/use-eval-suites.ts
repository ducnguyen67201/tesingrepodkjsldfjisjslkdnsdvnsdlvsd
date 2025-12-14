/**
 * Hook for eval suite CRUD operations
 */

import { useCallback } from "react";
import { trpc } from "@/lib/trpc/client";
import { showError } from "@/lib/errors";
import { showSuccess, showDeleted } from "@/lib/success";

interface UseEvalSuitesOptions {
  workspaceSlug: string;
  projectId: string;
}

export function useEvalSuites({ workspaceSlug, projectId }: UseEvalSuitesOptions) {
  const utils = trpc.useUtils();

  // Query suites
  const {
    data: suites,
    isLoading,
    error,
  } = trpc.evals.listSuites.useQuery(
    { workspaceSlug, projectId },
    { staleTime: 30_000 }
  );

  // Create suite mutation
  const createSuite = trpc.evals.createSuite.useMutation({
    onSuccess: (newSuite) => {
      showSuccess("Eval suite created", `"${newSuite.name}" is ready.`);
      utils.evals.listSuites.invalidate({ workspaceSlug, projectId });
    },
    onError: showError,
  });

  // Update suite mutation
  const updateSuite = trpc.evals.updateSuite.useMutation({
    onSuccess: (updatedSuite) => {
      showSuccess("Eval suite updated", `"${updatedSuite.name}" has been updated.`);
      utils.evals.listSuites.invalidate({ workspaceSlug, projectId });
      utils.evals.getSuite.invalidate({ workspaceSlug, suiteId: updatedSuite.id });
    },
    onError: showError,
  });

  // Delete suite mutation
  const deleteSuite = trpc.evals.deleteSuite.useMutation({
    onSuccess: () => {
      showDeleted("Eval suite");
      utils.evals.listSuites.invalidate({ workspaceSlug, projectId });
    },
    onError: showError,
  });

  // Toggle suite mutation
  const toggleSuite = trpc.evals.toggleSuite.useMutation({
    onSuccess: (updatedSuite) => {
      const status = updatedSuite.enabled ? "enabled" : "disabled";
      showSuccess("Eval suite updated", `Suite is now ${status}.`);
      utils.evals.listSuites.invalidate({ workspaceSlug, projectId });
    },
    onError: showError,
  });

  // Helper functions
  const handleCreate = useCallback(
    async (data: Parameters<typeof createSuite.mutateAsync>[0]) => {
      return createSuite.mutateAsync(data);
    },
    [createSuite]
  );

  const handleUpdate = useCallback(
    async (data: Parameters<typeof updateSuite.mutateAsync>[0]) => {
      return updateSuite.mutateAsync(data);
    },
    [updateSuite]
  );

  const handleDelete = useCallback(
    async (suiteId: string) => {
      return deleteSuite.mutateAsync({ workspaceSlug, suiteId });
    },
    [deleteSuite, workspaceSlug]
  );

  const handleToggle = useCallback(
    async (suiteId: string) => {
      return toggleSuite.mutateAsync({ workspaceSlug, suiteId });
    },
    [toggleSuite, workspaceSlug]
  );

  return {
    suites: suites ?? [],
    isLoading,
    error,
    createSuite: handleCreate,
    updateSuite: handleUpdate,
    deleteSuite: handleDelete,
    toggleSuite: handleToggle,
    isCreating: createSuite.isPending,
    isUpdating: updateSuite.isPending,
    isDeleting: deleteSuite.isPending,
    isToggling: toggleSuite.isPending,
  };
}
