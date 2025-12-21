/**
 * Hook for prompt CRUD operations
 */

import { useCallback } from "react";
import { trpc } from "@/lib/trpc/client";
import { showError } from "@/lib/errors";
import { showSuccess, showDeleted } from "@/lib/success";

interface UsePromptsOptions {
  workspaceSlug: string;
  projectId: string;
}

export function usePrompts({ workspaceSlug, projectId }: UsePromptsOptions) {
  const utils = trpc.useUtils();

  // Query prompts
  const {
    data: promptsData,
    isLoading,
    error,
  } = trpc.prompts.list.useQuery(
    { workspaceSlug, projectId },
    { staleTime: 30_000 }
  );

  // Extract items from paginated response
  const prompts = promptsData?.items ?? [];

  // Create prompt mutation
  const createPrompt = trpc.prompts.create.useMutation({
    onSuccess: (newPrompt) => {
      showSuccess("Prompt created", `"${newPrompt.name}" is ready.`);
      utils.prompts.list.invalidate({ workspaceSlug, projectId });
    },
    onError: showError,
  });

  // Update prompt mutation
  const updatePrompt = trpc.prompts.update.useMutation({
    onSuccess: (updatedPrompt) => {
      showSuccess("Prompt updated", `"${updatedPrompt.name}" has been updated.`);
      utils.prompts.list.invalidate({ workspaceSlug, projectId });
      utils.prompts.get.invalidate({ workspaceSlug, promptId: updatedPrompt.id });
    },
    onError: showError,
  });

  // Archive prompt mutation
  const archivePrompt = trpc.prompts.archive.useMutation({
    onSuccess: (result, variables) => {
      const action = variables.archive ? "archived" : "restored";
      showSuccess("Prompt updated", `Prompt has been ${action}.`);
      utils.prompts.list.invalidate({ workspaceSlug, projectId });
    },
    onError: showError,
  });

  // Delete prompt mutation
  const deletePrompt = trpc.prompts.delete.useMutation({
    onSuccess: () => {
      showDeleted("Prompt");
      utils.prompts.list.invalidate({ workspaceSlug, projectId });
    },
    onError: showError,
  });

  // Create version mutation
  const createVersion = trpc.prompts.createVersion.useMutation({
    onSuccess: (newVersion) => {
      showSuccess("Version created", `Version ${newVersion.version} is ready.`);
      utils.prompts.list.invalidate({ workspaceSlug, projectId });
      utils.prompts.get.invalidate({ workspaceSlug, promptId: newVersion.promptId });
    },
    onError: showError,
  });

  // Set label mutation
  const setLabel = trpc.prompts.setLabel.useMutation({
    onSuccess: (result, variables) => {
      showSuccess("Label set", `Version is now "${variables.label}".`);
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
    async (promptId: string, versionId: string, label: "production" | "staging" | "latest") => {
      return setLabel.mutateAsync({ workspaceSlug, promptId, versionId, label });
    },
    [setLabel, workspaceSlug]
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
    isCreating: createPrompt.isPending,
    isUpdating: updatePrompt.isPending,
    isArchiving: archivePrompt.isPending,
    isDeleting: deletePrompt.isPending,
    isCreatingVersion: createVersion.isPending,
    isSettingLabel: setLabel.isPending,
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
      showSuccess("Version created", `Version ${newVersion.version} is ready.`);
      utils.prompts.get.invalidate({ workspaceSlug, promptId });
    },
    onError: showError,
  });

  // Set label mutation
  const setLabel = trpc.prompts.setLabel.useMutation({
    onSuccess: (result) => {
      showSuccess("Label updated", `Version is now "${result.label}".`);
      utils.prompts.get.invalidate({ workspaceSlug, promptId });
    },
    onError: showError,
  });

  const handleCreateVersion = useCallback(
    async (data: {
      template: { type: "text"; text: string } | { type: "chat"; messages: Array<{ role: "system" | "user" | "assistant"; content: string }> };
      variables?: Array<{ name: string; required?: boolean; default?: string; description?: string }>;
      config?: Record<string, unknown>;
      metadata?: Record<string, unknown>;
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
    async (versionId: string, label: "production" | "staging" | "latest") => {
      return setLabel.mutateAsync({ workspaceSlug, promptId, versionId, label });
    },
    [setLabel, workspaceSlug, promptId]
  );

  return {
    prompt,
    isLoading,
    error,
    createVersion: handleCreateVersion,
    setLabel: handleSetLabel,
    isCreatingVersion: createVersion.isPending,
    isSettingLabel: setLabel.isPending,
  };
}
