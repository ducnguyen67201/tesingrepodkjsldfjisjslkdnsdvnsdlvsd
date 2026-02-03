"use client";

import { useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Building2, User, Shield } from "lucide-react";
import type { WorkspaceListItem } from "@ducsigr/api/client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { trpc } from "@/lib/trpc/client";
import { useSystemAdmin } from "@/hooks/use-system-admin";

/**
 * Admin-only workspace switcher for the settings page.
 * Only renders for users with isSystemAdmin = true.
 * Allows quick navigation between workspace settings.
 */
export function AdminWorkspaceSwitcher() {
  const params = useParams();
  const router = useRouter();

  // Validate workspaceSlug - can be string | string[] | undefined
  const rawSlug = params.workspaceSlug;
  const currentSlug = typeof rawSlug === "string" ? rawSlug : undefined;

  // Check if user is system admin
  const { isSystemAdmin, isLoading: isAdminLoading } = useSystemAdmin();

  // Only fetch workspaces if user is admin (conditional query)
  const { data: workspaces, isLoading: isWorkspacesLoading } =
    trpc.workspaces.listWithDetails.useQuery(undefined, {
      enabled: isSystemAdmin,
      staleTime: 5 * 60 * 1000,
    });

  // Must define useCallback before early return (React hooks rules)
  const handleWorkspaceSelect = useCallback(
    (slug: string) => {
      if (slug !== currentSlug) {
        router.push(`/workspace/${slug}/settings`);
      }
    },
    [currentSlug, router]
  );

  const renderWorkspaceItem = useCallback(
    (workspace: WorkspaceListItem) => {
      const isCurrentWorkspace = currentSlug ? workspace.slug === currentSlug : false;
      const Icon = workspace.isPersonal ? User : Building2;

      const handleClick = () => handleWorkspaceSelect(workspace.slug);

      return (
        <DropdownMenuItem
          key={workspace.id}
          onClick={handleClick}
          className="flex items-center justify-between gap-2 cursor-pointer"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{workspace.name}</span>
          </div>
          {isCurrentWorkspace && (
            <Check className="h-4 w-4 shrink-0 text-primary" />
          )}
        </DropdownMenuItem>
      );
    },
    [currentSlug, handleWorkspaceSelect]
  );

  // Return null if not admin, still loading, or invalid slug
  if (isAdminLoading || !isSystemAdmin || !currentSlug) {
    return null;
  }

  const currentWorkspace = workspaces?.find((w) => w.slug === currentSlug);
  const isLoading = isWorkspacesLoading;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={isLoading}
        >
          <Shield className="h-4 w-4 text-yellow-600" />
          {isLoading ? (
            "Loading..."
          ) : currentWorkspace ? (
            <>
              <span className="max-w-[150px] truncate">
                {currentWorkspace.name}
              </span>
              <ChevronsUpDown className="h-4 w-4 opacity-50" />
            </>
          ) : (
            "Select workspace"
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[220px]">
        <DropdownMenuLabel className="flex items-center gap-2 text-xs text-muted-foreground">
          <Shield className="h-3 w-3" />
          Admin: Switch Workspace
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {workspaces && workspaces.length > 0 ? (
          workspaces.map(renderWorkspaceItem)
        ) : (
          <DropdownMenuItem disabled className="text-muted-foreground">
            No workspaces available
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
