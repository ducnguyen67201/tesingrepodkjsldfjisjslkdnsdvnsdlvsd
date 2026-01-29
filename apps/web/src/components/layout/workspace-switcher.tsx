"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Check, ChevronsUpDown, Plus, Building2, User } from "lucide-react";
import type { WorkspaceListItem } from "@ducsigr/api/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSkeleton,
} from "@/components/ui/sidebar";
import { CreateWorkspaceDialog } from "@/components/workspace/create-workspace-dialog";

interface WorkspaceSwitcherProps {
  currentWorkspace: WorkspaceListItem;
}

export function WorkspaceSwitcher({ currentWorkspace }: WorkspaceSwitcherProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Prevent hydration mismatch with Radix UI dropdown IDs
  useEffect(() => {
    setMounted(true);
  }, []);

  const workspaces = session?.user?.workspaces ?? [];

  const handleSwitchFromEvent = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const slug = e.currentTarget.dataset.slug;
      if (slug) router.push(`/workspace/${slug}`);
    },
    [router]
  );

  const handleCreateWorkspace = useCallback(() => {
    setCreateDialogOpen(true);
  }, []);

  const renderWorkspaceIcon = (isPersonal: boolean) => {
    return isPersonal ? (
      <User className="size-4" />
    ) : (
      <Building2 className="size-4" />
    );
  };

  const renderWorkspaceItem = (workspace: (typeof workspaces)[number]) => {
    const isActive = workspace.slug === currentWorkspace.slug;

    return (
      <DropdownMenuItem
        key={workspace.id}
        data-slug={workspace.slug}
        onClick={handleSwitchFromEvent}
        className="cursor-pointer"
      >
        {workspace.isPersonal ? (
          <User className="mr-2 h-4 w-4" />
        ) : (
          <Building2 className="mr-2 h-4 w-4" />
        )}
        <span className="flex-1 truncate">{workspace.name}</span>
        {isActive && <Check className="ml-2 h-4 w-4" />}
      </DropdownMenuItem>
    );
  };

  // Show skeleton during SSR to prevent hydration mismatch
  if (!mounted) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuSkeleton showIcon className="h-12" />
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size="lg"
                className="data-[state=open]:bg-sidebar-accent"
              >
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  {renderWorkspaceIcon(currentWorkspace.isPersonal)}
                </div>
                <div className="flex flex-1 flex-col items-start text-left text-sm leading-tight">
                  <span className="truncate font-semibold">
                    {currentWorkspace.name}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {currentWorkspace.role}
                  </span>
                </div>
                <ChevronsUpDown className="ml-auto size-4" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-[--radix-dropdown-menu-trigger-width] min-w-56"
              align="start"
              sideOffset={4}
            >
              {workspaces.map(renderWorkspaceItem)}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleCreateWorkspace}
                className="cursor-pointer"
              >
                <Plus className="mr-2 h-4 w-4" />
                Create Workspace
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>

      <CreateWorkspaceDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
    </>
  );
}
