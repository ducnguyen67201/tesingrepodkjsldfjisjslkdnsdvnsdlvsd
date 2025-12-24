"use client";

import { useState, useCallback } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ExtensionList } from "./extension-list";
import { ExtensionFilters } from "./extension-filters";
import { InstallExtensionDialog } from "./install-extension-dialog";
import { ConfigureExtensionDialog } from "./configure-extension-dialog";
import { ImportManifestDialog } from "./import-manifest-dialog";
import { useExtensions } from "@/hooks/use-extensions";
import { useDebounce } from "@/hooks/use-debounce";
import {
  type ExtensionType,
  type ExtensionPermission,
  type ExtensionManifest,
  type ExtensionVisibility,
} from "@cognobserve/api/schemas";

// ============================================================================
// Types
// ============================================================================

interface ExtensionsHubProps {
  workspaceSlug: string;
  workspaceId: string;
}

// ============================================================================
// Component
// ============================================================================

export function ExtensionsHub({ workspaceSlug, workspaceId }: ExtensionsHubProps) {
  // Filter state
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<ExtensionType | undefined>();
  const [installedOnly, setInstalledOnly] = useState(false);
  const debouncedSearch = useDebounce(search, 300);

  // Dialog state
  const [installDialogOpen, setInstallDialogOpen] = useState(false);
  const [configureDialogOpen, setConfigureDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [selectedExtensionId, setSelectedExtensionId] = useState<string | null>(null);
  const [selectedInstallId, setSelectedInstallId] = useState<string | null>(null);

  // Data fetching
  const {
    extensions,
    isLoading,
    install,
    toggle,
    configure,
    uninstall,
    importManifest,
    isInstalling,
    isToggling,
    isConfiguring,
    isUninstalling,
    isImporting,
  } = useExtensions({
    workspaceSlug,
    type: typeFilter,
    search: debouncedSearch,
    installedOnly,
  });

  // Handlers
  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
  }, []);

  const handleTypeChange = useCallback((type: ExtensionType | undefined) => {
    setTypeFilter(type);
  }, []);

  const handleInstalledOnlyChange = useCallback((value: boolean) => {
    setInstalledOnly(value);
  }, []);

  const handleInstallClick = useCallback((extensionId: string) => {
    setSelectedExtensionId(extensionId);
    setInstallDialogOpen(true);
  }, []);

  const handleConfigureClick = useCallback((extensionId: string, installId: string) => {
    setSelectedExtensionId(extensionId);
    setSelectedInstallId(installId);
    setConfigureDialogOpen(true);
  }, []);

  const handleInstall = useCallback(
    async ({
      extensionId,
      approvedPermissions,
    }: {
      extensionId: string;
      approvedPermissions: ExtensionPermission[];
    }) => {
      await install({
        workspaceId,
        extensionId,
        approvedPermissions,
      });
      setInstallDialogOpen(false);
    },
    [install, workspaceId]
  );

  const handleConfigure = useCallback(
    async ({
      installId,
      config,
    }: {
      installId: string;
      config: Record<string, unknown>;
    }) => {
      await configure(workspaceId, installId, config);
      setConfigureDialogOpen(false);
    },
    [configure, workspaceId]
  );

  const handleToggle = useCallback(
    async (wId: string, installId: string, enabled: boolean) => {
      await toggle(wId, installId, enabled);
    },
    [toggle]
  );

  const handleUninstall = useCallback(
    async (wId: string, installId: string) => {
      await uninstall(wId, installId);
    },
    [uninstall]
  );

  const handleInstallDialogClose = useCallback((open: boolean) => {
    setInstallDialogOpen(open);
    if (!open) {
      setSelectedExtensionId(null);
    }
  }, []);

  const handleConfigureDialogClose = useCallback((open: boolean) => {
    setConfigureDialogOpen(open);
    if (!open) {
      setSelectedExtensionId(null);
      setSelectedInstallId(null);
    }
  }, []);

  const handleImportClick = useCallback(() => {
    setImportDialogOpen(true);
  }, []);

  const handleImport = useCallback(
    async (manifest: ExtensionManifest, visibility: ExtensionVisibility) => {
      await importManifest({
        workspaceId,
        manifest,
        visibility,
      });
      setImportDialogOpen(false);
    },
    [importManifest, workspaceId]
  );

  const handleImportDialogClose = useCallback((open: boolean) => {
    setImportDialogOpen(open);
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Extensions Hub</h1>
          <p className="text-sm text-muted-foreground">
            Discover, install, and manage extensions for your workspace
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleImportClick}>
          <Upload className="mr-2 h-4 w-4" />
          Import Manifest
        </Button>
      </div>

      {/* Filters */}
      <ExtensionFilters
        search={search}
        type={typeFilter}
        installedOnly={installedOnly}
        onSearchChange={handleSearchChange}
        onTypeChange={handleTypeChange}
        onInstalledOnlyChange={handleInstalledOnlyChange}
      />

      {/* List */}
      <ExtensionList
        extensions={extensions}
        isLoading={isLoading}
        workspaceId={workspaceId}
        onInstall={handleInstallClick}
        onConfigure={handleConfigureClick}
        onToggle={handleToggle}
        onUninstall={handleUninstall}
        isToggling={isToggling}
        isUninstalling={isUninstalling}
      />

      {/* Install Dialog */}
      <InstallExtensionDialog
        open={installDialogOpen}
        onOpenChange={handleInstallDialogClose}
        extensionId={selectedExtensionId}
        workspaceId={workspaceId}
        onInstall={handleInstall}
        isInstalling={isInstalling}
      />

      {/* Configure Dialog */}
      <ConfigureExtensionDialog
        open={configureDialogOpen}
        onOpenChange={handleConfigureDialogClose}
        extensionId={selectedExtensionId}
        installId={selectedInstallId}
        workspaceId={workspaceId}
        onConfigure={handleConfigure}
        isConfiguring={isConfiguring}
      />

      {/* Import Dialog */}
      <ImportManifestDialog
        open={importDialogOpen}
        onOpenChange={handleImportDialogClose}
        workspaceId={workspaceId}
        onImport={handleImport}
        isImporting={isImporting}
      />
    </div>
  );
}
