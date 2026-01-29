"use client";

import { useCallback, useMemo } from "react";
import { trpc } from "@/lib/trpc/client";
import { showError } from "@/lib/errors";
import { showSuccess } from "@/lib/success";
import {
  type ExtensionType,
  type ExtensionPermission,
  type ExtensionVisibility,
} from "@ducsigr/api/schemas";

// ============================================================================
// Types
// ============================================================================

interface UseExtensionsOptions {
  workspaceSlug: string;
  type?: ExtensionType;
  search?: string;
  installedOnly?: boolean;
}

interface InstallExtensionInput {
  workspaceId: string;
  extensionId: string;
  versionId?: string;
  approvedPermissions: ExtensionPermission[];
  config?: Record<string, unknown>;
}

interface ImportManifestInput {
  workspaceId: string;
  manifest: {
    id: string;
    name: string;
    version: string;
    type: ExtensionType;
    description?: string;
    permissions: ExtensionPermission[];
    configSchema?: Record<string, unknown>;
  };
  visibility?: ExtensionVisibility;
}

// ============================================================================
// Extension Toasts
// ============================================================================

export const extensionToast = {
  installed: (name: string) =>
    showSuccess("Extension installed", `"${name}" is now active.`),
  enabled: (name: string) =>
    showSuccess("Extension enabled", `"${name}" is now active.`),
  disabled: (name: string) =>
    showSuccess("Extension disabled", `"${name}" has been disabled.`),
  configured: (name: string) =>
    showSuccess("Extension configured", `"${name}" settings updated.`),
  uninstalled: (name: string) =>
    showSuccess("Extension uninstalled", `"${name}" has been removed.`),
  imported: (name: string) =>
    showSuccess("Extension imported", `"${name}" is ready to install.`),
} as const;

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook for managing extensions in a workspace.
 * Provides list, install, toggle, configure, and uninstall operations.
 */
export function useExtensions(options: UseExtensionsOptions) {
  const utils = trpc.useUtils();
  const { workspaceSlug, type, search, installedOnly } = options;

  // Query: List extensions
  const {
    data: extensions = [],
    isLoading,
    error,
    refetch,
  } = trpc.extensions.list.useQuery(
    {
      workspaceSlug,
      type,
      search,
      installedOnly,
    },
    {
      enabled: !!workspaceSlug,
      staleTime: 30_000,
    }
  );

  // Create O(1) lookup maps for extension names
  const { extensionNameById, extensionNameByInstallId } = useMemo(() => {
    const byId = new Map<string, string>();
    const byInstallId = new Map<string, string>();

    for (const ext of extensions) {
      byId.set(ext.id, ext.name);
      if (ext.install?.id) {
        byInstallId.set(ext.install.id, ext.name);
      }
    }

    return { extensionNameById: byId, extensionNameByInstallId: byInstallId };
  }, [extensions]);

  // Helper to get extension name with fallback
  const getExtensionName = useCallback(
    (extensionId: string) => extensionNameById.get(extensionId) ?? "Extension",
    [extensionNameById]
  );

  const getExtensionNameByInstall = useCallback(
    (installId: string) => extensionNameByInstallId.get(installId) ?? "Extension",
    [extensionNameByInstallId]
  );

  // Mutation: Install extension
  const installMutation = trpc.extensions.install.useMutation({
    onSuccess: (_, variables) => {
      extensionToast.installed(getExtensionName(variables.extensionId));
      utils.extensions.list.invalidate({ workspaceSlug });
    },
    onError: showError,
  });

  // Mutation: Toggle extension
  const toggleMutation = trpc.extensions.toggle.useMutation({
    onSuccess: (_, variables) => {
      const name = getExtensionNameByInstall(variables.installId);
      if (variables.enabled) {
        extensionToast.enabled(name);
      } else {
        extensionToast.disabled(name);
      }
      utils.extensions.list.invalidate({ workspaceSlug });
      // Also invalidate theme query in case this is a theme extension
      // This ensures ThemeWrapper picks up theme enable/disable immediately
      utils.theme.getActive.invalidate({ workspaceId: variables.workspaceId });
    },
    onError: showError,
  });

  // Mutation: Configure extension
  const configureMutation = trpc.extensions.configure.useMutation({
    onSuccess: (_, variables) => {
      extensionToast.configured(getExtensionNameByInstall(variables.installId));
      utils.extensions.list.invalidate({ workspaceSlug });
    },
    onError: showError,
  });

  // Mutation: Uninstall extension
  const uninstallMutation = trpc.extensions.uninstall.useMutation({
    onSuccess: (_, variables) => {
      extensionToast.uninstalled(getExtensionNameByInstall(variables.installId));
      utils.extensions.list.invalidate({ workspaceSlug });
    },
    onError: showError,
  });

  // Mutation: Import manifest
  const importMutation = trpc.extensions.importManifest.useMutation({
    onSuccess: (result) => {
      extensionToast.imported(result.name);
      utils.extensions.list.invalidate({ workspaceSlug });
    },
    onError: showError,
  });

  // Wrapped mutation functions
  const install = useCallback(
    async (input: InstallExtensionInput) => {
      return installMutation.mutateAsync(input);
    },
    [installMutation]
  );

  const toggle = useCallback(
    async (workspaceId: string, installId: string, enabled: boolean) => {
      return toggleMutation.mutateAsync({ workspaceId, installId, enabled });
    },
    [toggleMutation]
  );

  const configure = useCallback(
    async (
      workspaceId: string,
      installId: string,
      config: Record<string, unknown>
    ) => {
      return configureMutation.mutateAsync({ workspaceId, installId, config });
    },
    [configureMutation]
  );

  const uninstall = useCallback(
    async (workspaceId: string, installId: string) => {
      return uninstallMutation.mutateAsync({ workspaceId, installId });
    },
    [uninstallMutation]
  );

  const importManifest = useCallback(
    async (input: ImportManifestInput) => {
      return importMutation.mutateAsync(input);
    },
    [importMutation]
  );

  return {
    // Data
    extensions,
    isLoading,
    error: error as Error | null,
    refetch,

    // Actions
    install,
    toggle,
    configure,
    uninstall,
    importManifest,

    // Loading states
    isInstalling: installMutation.isPending,
    isToggling: toggleMutation.isPending,
    isConfiguring: configureMutation.isPending,
    isUninstalling: uninstallMutation.isPending,
    isImporting: importMutation.isPending,
  };
}

// ============================================================================
// Extension Detail Hook
// ============================================================================

/**
 * Hook for getting extension details with all versions.
 */
export function useExtension(extensionId: string, workspaceId?: string) {
  const { data, isLoading, error, refetch } = trpc.extensions.getById.useQuery(
    { extensionId, workspaceId },
    { enabled: !!extensionId }
  );

  return {
    extension: data ?? null,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}
