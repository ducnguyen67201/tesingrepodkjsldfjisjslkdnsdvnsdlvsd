"use client";

import { useCallback } from "react";
import { trpc } from "@/lib/trpc/client";
import { showError } from "@/lib/errors";
import { showSuccess } from "@/lib/success";
import type { WorkspaceThemeConfig } from "@ducsigr/api/schemas";

// ============================================================================
// Theme Toasts
// ============================================================================

export const themeToast = {
  activated: (name?: string) =>
    showSuccess("Theme activated", name ? `"${name}" is now active.` : "Theme has been activated."),

  deactivated: () =>
    showSuccess("Theme deactivated", "Reverted to default theme."),

  saved: (name?: string) =>
    showSuccess("Theme saved", name ? `"${name}" configuration saved.` : "Theme configuration saved."),
} as const;

// ============================================================================
// Types
// ============================================================================

interface UseThemeOptions {
  workspaceId: string;
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook for managing workspace theme customization.
 * Provides getActive, setActive, saveConfig, and listInstalled operations.
 */
export function useTheme(options: UseThemeOptions) {
  const utils = trpc.useUtils();
  const { workspaceId } = options;

  // Query: Get active theme
  const {
    data: activeTheme,
    isLoading: isLoadingActive,
    error: activeError,
    refetch: refetchActive,
  } = trpc.theme.getActive.useQuery(
    { workspaceId },
    {
      enabled: !!workspaceId,
      staleTime: 30_000,
    }
  );

  // Query: List installed themes
  const {
    data: installedThemes = [],
    isLoading: isLoadingInstalled,
    error: installedError,
    refetch: refetchInstalled,
  } = trpc.theme.listInstalled.useQuery(
    { workspaceId },
    {
      enabled: !!workspaceId,
      staleTime: 30_000,
    }
  );

  // Query: Get presets
  const { data: presets = [] } = trpc.theme.getPresets.useQuery(undefined, {
    staleTime: 60_000,
  });

  // Mutation: Set active theme
  const setActiveMutation = trpc.theme.setActive.useMutation({
    onSuccess: (_, variables) => {
      if (variables.installId) {
        const theme = installedThemes.find((t) => t.id === variables.installId);
        themeToast.activated(theme?.extensionName);
      } else {
        themeToast.deactivated();
      }
      utils.theme.getActive.invalidate({ workspaceId });
      utils.theme.listInstalled.invalidate({ workspaceId });
    },
    onError: showError,
  });

  // Mutation: Save config
  const saveConfigMutation = trpc.theme.saveConfig.useMutation({
    onSuccess: (_, variables) => {
      const theme = installedThemes.find((t) => t.id === variables.installId);
      themeToast.saved(theme?.extensionName);
      utils.theme.getActive.invalidate({ workspaceId });
      utils.theme.listInstalled.invalidate({ workspaceId });
    },
    onError: showError,
  });

  // Wrapped mutation functions
  const setActive = useCallback(
    async (installId: string | null) => {
      return setActiveMutation.mutateAsync({ workspaceId, installId });
    },
    [setActiveMutation, workspaceId]
  );

  const saveConfig = useCallback(
    async (installId: string, config: WorkspaceThemeConfig) => {
      return saveConfigMutation.mutateAsync({ workspaceId, installId, config });
    },
    [saveConfigMutation, workspaceId]
  );

  const refetch = useCallback(async () => {
    await Promise.all([refetchActive(), refetchInstalled()]);
  }, [refetchActive, refetchInstalled]);

  return {
    // Data
    activeTheme: activeTheme ?? null,
    installedThemes,
    presets,
    
    // Loading states
    isLoading: isLoadingActive || isLoadingInstalled,
    isLoadingActive,
    isLoadingInstalled,
    
    // Errors
    error: activeError ?? installedError,
    
    // Actions
    setActive,
    saveConfig,
    refetch,
    
    // Mutation states
    isSettingActive: setActiveMutation.isPending,
    isSavingConfig: saveConfigMutation.isPending,
  };
}
