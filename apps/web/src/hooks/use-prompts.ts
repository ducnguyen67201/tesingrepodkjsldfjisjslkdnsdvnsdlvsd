/**
 * Hook for prompt CRUD operations
 */

import { useCallback } from "react";
import { trpc } from "@/lib/trpc/client";
import { showError } from "@/lib/errors";
import { promptToast, showSuccess } from "@/lib/success";
import { type PromptLabelName } from "@ducsigr/api/schemas";

interface UsePromptsOptions {
  workspaceSlug: string;
  projectId: string;
  includeArchived?: boolean;
}

export function usePrompts({ workspaceSlug, projectId, includeArchived = false }: UsePromptsOptions) {
  const utils = trpc.useUtils();

  // Query prompts
  const {
    data: promptsData,
    isLoading,
    error,
  } = trpc.prompts.list.useQuery(
    { workspaceSlug, projectId, includeArchived },
    {
      staleTime: 30_000,
      enabled: !!workspaceSlug && !!projectId,
    }
  );

  // Extract items from paginated response
  const prompts = promptsData?.items ?? [];

  // Create prompt mutation
  const createPrompt = trpc.prompts.create.useMutation({
    onSuccess: (newPrompt) => {
      promptToast.created(newPrompt.name);
      utils.prompts.list.invalidate({ workspaceSlug, projectId });
    },
    onError: showError,
  });

  // Update prompt mutation
  const updatePrompt = trpc.prompts.update.useMutation({
    onSuccess: (updatedPrompt) => {
      promptToast.updated(updatedPrompt.name);
      utils.prompts.list.invalidate({ workspaceSlug, projectId });
      utils.prompts.get.invalidate({ workspaceSlug, promptId: updatedPrompt.id });
    },
    onError: showError,
  });

  // Archive prompt mutation
  const archivePrompt = trpc.prompts.archive.useMutation({
    onSuccess: (_result, variables) => {
      if (variables.archive) {
        promptToast.archived();
      } else {
        promptToast.restored();
      }
      utils.prompts.list.invalidate({ workspaceSlug, projectId });
    },
    onError: showError,
  });

  // Delete prompt mutation
  const deletePrompt = trpc.prompts.delete.useMutation({
    onSuccess: () => {
      promptToast.deleted();
      utils.prompts.list.invalidate({ workspaceSlug, projectId });
    },
    onError: showError,
  });

  // Create version mutation
  const createVersion = trpc.prompts.createVersion.useMutation({
    onSuccess: (newVersion) => {
      promptToast.versionCreated(newVersion.version);
      utils.prompts.list.invalidate({ workspaceSlug, projectId });
      utils.prompts.get.invalidate({ workspaceSlug, promptId: newVersion.promptId });
    },
    onError: showError,
  });

  // Set label mutation
  const setLabel = trpc.prompts.setLabel.useMutation({
    onSuccess: (_result, variables) => {
      promptToast.labelSet(variables.label);
      utils.prompts.list.invalidate({ workspaceSlug, projectId });
      utils.prompts.get.invalidate({ workspaceSlug, promptId: variables.promptId });
    },
    onError: showError,
  });

  // Remove label mutation
  const removeLabel = trpc.prompts.removeLabel.useMutation({
    onSuccess: (_result, variables) => {
      showSuccess("Label removed", `${variables.label} label has been removed.`);
      utils.prompts.list.invalidate({ workspaceSlug, projectId });
      utils.prompts.get.invalidate({ workspaceSlug, promptId: variables.promptId });
    },
    onError: showError,
  });

  // Helper functions
  const handleCreate = useCallback(
    async (data: Parameters<typeof createPrompt.mutateAsync>[0]) => {
      return createPrompt.mutateAsync(data);
    },
    [createPrompt]
  );

  const handleUpdate = useCallback(
    async (data: Parameters<typeof updatePrompt.mutateAsync>[0]) => {
      return updatePrompt.mutateAsync(data);
    },
    [updatePrompt]
  );

  const handleArchive = useCallback(
    async (promptId: string, archive: boolean = true) => {
      return archivePrompt.mutateAsync({ workspaceSlug, promptId, archive });
    },
    [archivePrompt, workspaceSlug]
  );

  const handleDelete = useCallback(
    async (promptId: string) => {
      return deletePrompt.mutateAsync({ workspaceSlug, promptId });
    },
    [deletePrompt, workspaceSlug]
  );

  const handleCreateVersion = useCallback(
    async (data: Parameters<typeof createVersion.mutateAsync>[0]) => {
      return createVersion.mutateAsync(data);
    },
    [createVersion]
  );

  const handleSetLabel = useCallback(
    async (promptId: string, versionId: string, label: PromptLabelName) => {
      return setLabel.mutateAsync({ workspaceSlug, promptId, versionId, label });
    },
    [setLabel, workspaceSlug]
  );

  const handleRemoveLabel = useCallback(
    async (promptId: string, label: PromptLabelName) => {
      return removeLabel.mutateAsync({ workspaceSlug, promptId, label });
    },
    [removeLabel, workspaceSlug]
  );

  return {
    prompts,
    isLoading,
    error,
    createPrompt: handleCreate,
    updatePrompt: handleUpdate,
    archivePrompt: handleArchive,
    deletePrompt: handleDelete,
    createVersion: handleCreateVersion,
    setLabel: handleSetLabel,
    removeLabel: handleRemoveLabel,
    isCreating: createPrompt.isPending,
    isUpdating: updatePrompt.isPending,
    isArchiving: archivePrompt.isPending,
    isDeleting: deletePrompt.isPending,
    isCreatingVersion: createVersion.isPending,
    isSettingLabel: setLabel.isPending,
    isRemovingLabel: removeLabel.isPending,
  };
}

/**
 * Hook for single prompt detail with versions
 */
export function usePromptDetail({
  workspaceSlug,
  promptId,
}: {
  workspaceSlug: string;
  promptId: string;
}) {
  const utils = trpc.useUtils();

  const {
    data: prompt,
    isLoading,
    error,
  } = trpc.prompts.get.useQuery(
    { workspaceSlug, promptId },
    { enabled: !!workspaceSlug && !!promptId }
  );

  // Create version mutation
  const createVersion = trpc.prompts.createVersion.useMutation({
    onSuccess: (newVersion) => {
      promptToast.versionCreated(newVersion.version);
      utils.prompts.get.invalidate({ workspaceSlug, promptId });
    },
    onError: showError,
  });

  // Set label mutation
  const setLabel = trpc.prompts.setLabel.useMutation({
    onSuccess: (result) => {
      promptToast.labelSet(result.label);
      utils.prompts.get.invalidate({ workspaceSlug, promptId });
    },
    onError: showError,
  });

  // Remove label mutation
  const removeLabel = trpc.prompts.removeLabel.useMutation({
    onSuccess: (_result, variables) => {
      showSuccess("Label removed", `${variables.label} label has been removed.`);
      utils.prompts.get.invalidate({ workspaceSlug, promptId });
    },
    onError: showError,
  });

  const handleCreateVersion = useCallback(
    async (data: {
      template: Parameters<typeof createVersion.mutateAsync>[0]["template"];
      variables?: Parameters<typeof createVersion.mutateAsync>[0]["variables"];
      config?: Parameters<typeof createVersion.mutateAsync>[0]["config"];
      metadata?: Parameters<typeof createVersion.mutateAsync>[0]["metadata"];
      label?: Parameters<typeof createVersion.mutateAsync>[0]["label"];
    }) => {
      return createVersion.mutateAsync({
        workspaceSlug,
        promptId,
        ...data,
      });
    },
    [createVersion, workspaceSlug, promptId]
  );

  const handleSetLabel = useCallback(
    async (versionId: string, label: PromptLabelName) => {
      return setLabel.mutateAsync({ workspaceSlug, promptId, versionId, label });
    },
    [setLabel, workspaceSlug, promptId]
  );

  const handleRemoveLabel = useCallback(
    async (label: PromptLabelName) => {
      return removeLabel.mutateAsync({ workspaceSlug, promptId, label });
    },
    [removeLabel, workspaceSlug, promptId]
  );

  return {
    prompt,
    isLoading,
    error,
    createVersion: handleCreateVersion,
    setLabel: handleSetLabel,
    removeLabel: handleRemoveLabel,
    isCreatingVersion: createVersion.isPending,
    isSettingLabel: setLabel.isPending,
    isRemovingLabel: removeLabel.isPending,
  };
}
