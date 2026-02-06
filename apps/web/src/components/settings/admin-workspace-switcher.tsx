"use client";

import { useCallback, useState } from "react";
import { Check, ChevronsUpDown, Building2, User, Shield } from "lucide-react";
import type { WorkspaceListItem } from "@ducsigr/api/client";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useAdminWorkspaceSwitcher } from "@/hooks/use-admin-workspace-switcher";

/**
 * Admin-only workspace switcher for the settings page.
 * Only renders for users with isSystemAdmin = true.
 * Uses a searchable combobox for quick workspace navigation.
 */
export function AdminWorkspaceSwitcher() {
  const [open, setOpen] = useState(false);
  const {
    isSystemAdmin,
    isLoading,
    currentSlug,
    currentWorkspace,
    workspaces,
    selectWorkspace,
  } = useAdminWorkspaceSwitcher();

  const handleSelect = useCallback(
    (slug: string) => {
      setOpen(false);
      selectWorkspace(slug);
    },
    [selectWorkspace]
  );

  const renderWorkspaceItem = useCallback(
    (workspace: WorkspaceListItem) => {
      const isCurrentWorkspace = currentSlug === workspace.slug;
      const Icon = workspace.isPersonal ? User : Building2;

      const onSelect = () => handleSelect(workspace.slug);

      return (
        <CommandItem
          key={workspace.id}
          value={workspace.name}
          onSelect={onSelect}
          className="flex items-center justify-between gap-2 cursor-pointer"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{workspace.name}</span>
          </div>
          {isCurrentWorkspace && (
            <Check className="h-4 w-4 shrink-0 text-primary" />
          )}
        </CommandItem>
      );
    },
    [currentSlug, handleSelect]
  );

  if (!isSystemAdmin || !currentSlug) {
    return null;
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-medium text-muted-foreground">
        Admin workspace view
      </span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            role="combobox"
            aria-expanded={open}
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
        </PopoverTrigger>
        <PopoverContent className="w-[250px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search workspaces..." />
            <CommandList>
              <CommandEmpty>No workspace found.</CommandEmpty>
              <CommandGroup heading="Admin: Switch Workspace">
                {workspaces.length > 0
                  ? workspaces.map(renderWorkspaceItem)
                  : null}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
