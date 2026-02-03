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
  const currentSlug = params.workspaceSlug as string;

  // Check if user is system admin
  const { isSystemAdmin, isLoading: isAdminLoading } = useSystemAdmin();

  // Only fetch workspaces if user is admin (conditional query)
  const { data: workspaces, isLoading: isWorkspacesLoading } =
    trpc.workspaces.listWithDetails.useQuery(undefined, {
      enabled: isSystemAdmin,
      staleTime: 5 * 60 * 1000,
    });

  // Return null if not admin or still loading admin status
  if (isAdminLoading || !isSystemAdmin) {
    return null;
  }

  const currentWorkspace = workspaces?.find((w) => w.slug === currentSlug);
  const isLoading = isWorkspacesLoading;

  const handleWorkspaceSelect = useCallback(
    (slug: string) => {
      if (slug !== currentSlug) {
        router.push(`/workspace/${slug}/settings`);
      }
    },
    [currentSlug, router]
  );

  const renderWorkspaceItem = (workspace: WorkspaceListItem) => {
    const isCurrentWorkspace = workspace.slug === currentSlug;
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
  };

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
        {workspaces?.map(renderWorkspaceItem)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
