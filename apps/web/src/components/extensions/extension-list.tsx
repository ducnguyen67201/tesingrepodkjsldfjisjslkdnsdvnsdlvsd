"use client";

import { memo, useCallback } from "react";
import { Puzzle } from "lucide-react";
import { ExtensionCard } from "./extension-card";
import { Skeleton } from "@/components/ui/skeleton";
import { type ExtensionType } from "@ducsigr/api/schemas";

// ============================================================================
// Types
// ============================================================================

interface ExtensionInstall {
  id: string;
  enabled: boolean;
}

interface Extension {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  type: ExtensionType;
  latestVersion: string | null;
  isInstalled: boolean;
  install: ExtensionInstall | null;
}

interface ExtensionListProps {
  extensions: Extension[];
  isLoading: boolean;
  workspaceId: string;
  onInstall: (extensionId: string) => void;
  onConfigure: (extensionId: string, installId: string) => void;
  onToggle: (workspaceId: string, installId: string, enabled: boolean) => Promise<void>;
  onUninstall: (workspaceId: string, installId: string) => Promise<void>;
  isToggling: boolean;
  isUninstalling: boolean;
}

// ============================================================================
// Loading Skeleton
// ============================================================================

function ExtensionListSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-lg border p-4 space-y-3">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-48" />
            </div>
            <Skeleton className="h-8 w-16" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-5 w-12" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Empty State
// ============================================================================

function ExtensionListEmpty({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="rounded-full bg-muted p-4 mb-4">
        <Puzzle className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-medium">No extensions found</h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm">
        {hasFilters
          ? "Try adjusting your search or filters to find what you're looking for."
          : "Extensions will appear here once they're available."}
      </p>
    </div>
  );
}

// ============================================================================
// Component
// ============================================================================

export const ExtensionList = memo(function ExtensionList({
  extensions,
  isLoading,
  workspaceId,
  onInstall,
  onConfigure,
  onToggle,
  onUninstall,
  isToggling,
  isUninstalling,
}: ExtensionListProps) {
  const handleToggle = useCallback(
    async (installId: string, enabled: boolean) => {
      await onToggle(workspaceId, installId, enabled);
    },
    [onToggle, workspaceId]
  );

  const handleUninstall = useCallback(
    async (installId: string) => {
      await onUninstall(workspaceId, installId);
    },
    [onUninstall, workspaceId]
  );

  if (isLoading) {
    return <ExtensionListSkeleton />;
  }

  if (extensions.length === 0) {
    return <ExtensionListEmpty hasFilters={false} />;
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {extensions.map((extension) => (
        <ExtensionCard
          key={extension.id}
          id={extension.id}
          slug={extension.slug}
          name={extension.name}
          description={extension.description}
          type={extension.type as ExtensionType}
          latestVersion={extension.latestVersion}
          isInstalled={extension.isInstalled}
          installId={extension.install?.id}
          enabled={extension.install?.enabled ?? false}
          onInstall={onInstall}
          onConfigure={onConfigure}
          onToggle={handleToggle}
          onUninstall={handleUninstall}
          isToggling={isToggling}
          isUninstalling={isUninstalling}
        />
      ))}
    </div>
  );
});
