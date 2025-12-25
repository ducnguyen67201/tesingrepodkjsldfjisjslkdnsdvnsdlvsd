/**
 * Hook for prompt experiment CRUD operations
 */

import { useCallback } from "react";
import { trpc } from "@/lib/trpc/client";
import { showError } from "@/lib/errors";
import { experimentToast } from "@/lib/success";
import type { ExperimentStatus } from "@cognobserve/api/schemas";

interface UsePromptExperimentsOptions {
  workspaceSlug: string;
  projectId: string;
}

export function usePromptExperiments({
  workspaceSlug,
  projectId,
}: UsePromptExperimentsOptions) {
  const utils = trpc.useUtils();

  // Query experiments
  const {
    data: experimentsData,
    isLoading,
    error,
  } = trpc.promptExperiments.list.useQuery(
    { workspaceSlug, projectId },
    { staleTime: 30_000, enabled: !!projectId }
  );

  // Extract items from paginated response
  const experiments = experimentsData?.items ?? [];

  // Create experiment mutation
  const createExperiment = trpc.promptExperiments.create.useMutation({
    onSuccess: (result) => {
      experimentToast.created(result.slug);
      utils.promptExperiments.list.invalidate({ workspaceSlug, projectId });
    },
    onError: showError,
  });

  // Update experiment mutation
  const updateExperiment = trpc.promptExperiments.update.useMutation({
    onSuccess: (result) => {
      experimentToast.updated(result.name);
      utils.promptExperiments.list.invalidate({ workspaceSlug, projectId });
      utils.promptExperiments.get.invalidate({
        workspaceSlug,
        experimentId: result.id,
      });
    },
    onError: showError,
  });

  // Update weights mutation
  const updateWeights = trpc.promptExperiments.updateWeights.useMutation({
    onSuccess: () => {
      experimentToast.weightsUpdated();
      utils.promptExperiments.list.invalidate({ workspaceSlug, projectId });
    },
    onError: showError,
  });

  // Start experiment mutation
  const startExperiment = trpc.promptExperiments.start.useMutation({
    onSuccess: () => {
      experimentToast.started();
      utils.promptExperiments.list.invalidate({ workspaceSlug, projectId });
    },
    onError: showError,
  });

  // Pause experiment mutation
  const pauseExperiment = trpc.promptExperiments.pause.useMutation({
    onSuccess: () => {
      experimentToast.paused();
      utils.promptExperiments.list.invalidate({ workspaceSlug, projectId });
    },
    onError: showError,
  });

  // Stop experiment mutation
  const stopExperiment = trpc.promptExperiments.stop.useMutation({
    onSuccess: () => {
      experimentToast.completed();
      utils.promptExperiments.list.invalidate({ workspaceSlug, projectId });
    },
    onError: showError,
  });

  // Archive experiment mutation
  const archiveExperiment = trpc.promptExperiments.archive.useMutation({
    onSuccess: () => {
      experimentToast.archived();
      utils.promptExperiments.list.invalidate({ workspaceSlug, projectId });
    },
    onError: showError,
  });

  // Delete experiment mutation
  const deleteExperiment = trpc.promptExperiments.delete.useMutation({
    onSuccess: () => {
      experimentToast.deleted();
      utils.promptExperiments.list.invalidate({ workspaceSlug, projectId });
    },
    onError: showError,
  });

  // Helper functions
  const handleCreate = useCallback(
    async (data: Parameters<typeof createExperiment.mutateAsync>[0]) => {
      return createExperiment.mutateAsync(data);
    },
    [createExperiment]
  );

  const handleUpdate = useCallback(
    async (data: Parameters<typeof updateExperiment.mutateAsync>[0]) => {
      return updateExperiment.mutateAsync(data);
    },
    [updateExperiment]
  );

  const handleUpdateWeights = useCallback(
    async (
      experimentId: string,
      variants: Array<{ variantId: string; weight: number }>
    ) => {
      return updateWeights.mutateAsync({
        workspaceSlug,
        experimentId,
        variants,
      });
    },
    [updateWeights, workspaceSlug]
  );

  const handleStart = useCallback(
    async (experimentId: string) => {
      return startExperiment.mutateAsync({ workspaceSlug, experimentId });
    },
    [startExperiment, workspaceSlug]
  );

  const handlePause = useCallback(
    async (experimentId: string) => {
      return pauseExperiment.mutateAsync({ workspaceSlug, experimentId });
    },
    [pauseExperiment, workspaceSlug]
  );

  const handleStop = useCallback(
    async (experimentId: string, winnerId?: string) => {
      return stopExperiment.mutateAsync({ workspaceSlug, experimentId, winnerId });
    },
    [stopExperiment, workspaceSlug]
  );

  const handleArchive = useCallback(
    async (experimentId: string) => {
      return archiveExperiment.mutateAsync({ workspaceSlug, experimentId });
    },
    [archiveExperiment, workspaceSlug]
  );

  const handleDelete = useCallback(
    async (experimentId: string) => {
      return deleteExperiment.mutateAsync({ workspaceSlug, experimentId });
    },
    [deleteExperiment, workspaceSlug]
  );

  return {
    experiments,
    isLoading,
    error,
    createExperiment: handleCreate,
    updateExperiment: handleUpdate,
    updateWeights: handleUpdateWeights,
    startExperiment: handleStart,
    pauseExperiment: handlePause,
    stopExperiment: handleStop,
    archiveExperiment: handleArchive,
    deleteExperiment: handleDelete,
    isCreating: createExperiment.isPending,
    isUpdating: updateExperiment.isPending,
    isUpdatingWeights: updateWeights.isPending,
    isStarting: startExperiment.isPending,
    isPausing: pauseExperiment.isPending,
    isStopping: stopExperiment.isPending,
    isArchiving: archiveExperiment.isPending,
    isDeleting: deleteExperiment.isPending,
  };
}

/**
 * Hook for single experiment detail with variants and analytics
 */
export function useExperimentDetail({
  workspaceSlug,
  experimentId,
}: {
  workspaceSlug: string;
  experimentId: string;
}) {
  const utils = trpc.useUtils();

  // Query experiment detail
  const {
    data: experiment,
    isLoading,
    error,
  } = trpc.promptExperiments.get.useQuery(
    { workspaceSlug, experimentId },
    { enabled: !!workspaceSlug && !!experimentId }
  );

  // Query analytics
  const {
    data: analytics,
    isLoading: isLoadingAnalytics,
    refetch: refetchAnalytics,
  } = trpc.promptExperiments.analytics.useQuery(
    { workspaceSlug, experimentId },
    { enabled: !!workspaceSlug && !!experimentId, staleTime: 60_000 }
  );

  // Update weights mutation
  const updateWeights = trpc.promptExperiments.updateWeights.useMutation({
    onSuccess: () => {
      experimentToast.weightsUpdated();
      utils.promptExperiments.get.invalidate({ workspaceSlug, experimentId });
    },
    onError: showError,
  });

  // Start experiment mutation
  const startExperiment = trpc.promptExperiments.start.useMutation({
    onSuccess: () => {
      experimentToast.started();
      utils.promptExperiments.get.invalidate({ workspaceSlug, experimentId });
    },
    onError: showError,
  });

  // Pause experiment mutation
  const pauseExperiment = trpc.promptExperiments.pause.useMutation({
    onSuccess: () => {
      experimentToast.paused();
      utils.promptExperiments.get.invalidate({ workspaceSlug, experimentId });
    },
    onError: showError,
  });

  // Stop experiment mutation
  const stopExperiment = trpc.promptExperiments.stop.useMutation({
    onSuccess: () => {
      experimentToast.completed();
      utils.promptExperiments.get.invalidate({ workspaceSlug, experimentId });
    },
    onError: showError,
  });

  const handleUpdateWeights = useCallback(
    async (variants: Array<{ variantId: string; weight: number }>) => {
      return updateWeights.mutateAsync({
        workspaceSlug,
        experimentId,
        variants,
      });
    },
    [updateWeights, workspaceSlug, experimentId]
  );

  const handleStart = useCallback(async () => {
    return startExperiment.mutateAsync({ workspaceSlug, experimentId });
  }, [startExperiment, workspaceSlug, experimentId]);

  const handlePause = useCallback(async () => {
    return pauseExperiment.mutateAsync({ workspaceSlug, experimentId });
  }, [pauseExperiment, workspaceSlug, experimentId]);

  const handleStop = useCallback(
    async (winnerId?: string) => {
      return stopExperiment.mutateAsync({ workspaceSlug, experimentId, winnerId });
    },
    [stopExperiment, workspaceSlug, experimentId]
  );

  return {
    experiment,
    analytics,
    isLoading,
    isLoadingAnalytics,
    error,
    refetchAnalytics,
    updateWeights: handleUpdateWeights,
    startExperiment: handleStart,
    pauseExperiment: handlePause,
    stopExperiment: handleStop,
    isUpdatingWeights: updateWeights.isPending,
    isStarting: startExperiment.isPending,
    isPausing: pauseExperiment.isPending,
    isStopping: stopExperiment.isPending,
  };
}

/**
 * Hook for experiment presets and tags
 */
export function useExperimentPresets() {
  const { data: presets } = trpc.promptExperiments.getPresets.useQuery();

  return {
    statusLabels: presets?.statusLabels ?? {},
    statusColors: presets?.statusColors ?? {},
    assignmentKeyLabels: presets?.assignmentKeyLabels ?? {},
    totalBasisPoints: presets?.totalBasisPoints ?? 10000,
  };
}

/**
 * Hook for experiment tags
 */
export function useExperimentTags({
  workspaceSlug,
  projectId,
}: {
  workspaceSlug: string;
  projectId: string;
}) {
  const { data: tags = [] } = trpc.promptExperiments.getTags.useQuery(
    { workspaceSlug, projectId },
    { enabled: !!projectId }
  );

  return tags;
}

/**
 * Hook for comparing two prompt versions
 */
export function usePromptComparison({
  workspaceSlug,
  versionIdA,
  versionIdB,
}: {
  workspaceSlug: string;
  versionIdA: string;
  versionIdB: string;
}) {
  const {
    data: comparison,
    isLoading,
    error,
  } = trpc.promptExperiments.compare.useQuery(
    { workspaceSlug, versionIdA, versionIdB },
    { enabled: !!versionIdA && !!versionIdB }
  );

  return { comparison, isLoading, error };
}

/**
 * Get status badge color class
 */
export function getStatusColor(status: ExperimentStatus): string {
  const colors: Record<ExperimentStatus, string> = {
    draft: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
    running: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    paused: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    completed: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    archived: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
  };
  return colors[status] ?? colors.draft;
}

/**
 * Get status display label
 */
export function getStatusLabel(status: ExperimentStatus): string {
  const labels: Record<ExperimentStatus, string> = {
    draft: "Draft",
    running: "Running",
    paused: "Paused",
    completed: "Completed",
    archived: "Archived",
  };
  return labels[status] ?? status;
}
