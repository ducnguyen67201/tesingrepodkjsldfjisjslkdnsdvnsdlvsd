"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import {
  Loader2,
  FolderKanban,
  GitBranch,
  Check,
  ChevronsUpDown,
} from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { showError } from "@/lib/errors";
import { githubToast } from "@/lib/success";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const BRANCH_LIST_STYLE = { height: "auto", maxHeight: "200px", overflowY: "auto" } as const;

interface AssignRepoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repositoryId: string;
  repositoryName: string;
  defaultBranch: string;
  currentProjectId: string | null;
  workspaceSlug: string;
  onSuccess: () => void;
}

export function AssignRepoDialog({
  open,
  onOpenChange,
  repositoryId,
  repositoryName,
  defaultBranch,
  currentProjectId,
  workspaceSlug,
  onSuccess,
}: AssignRepoDialogProps) {
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedBranch, setSelectedBranch] = useState<string>("");
  const [branchPopoverOpen, setBranchPopoverOpen] = useState(false);

  const { data: projects, isLoading: projectsLoading } =
    trpc.github.listProjectsForAssignment.useQuery(
      { workspaceSlug },
      { enabled: open }
    );

  const { data: branches, isLoading: branchesLoading } =
    trpc.github.listBranches.useQuery(
      { workspaceSlug, repositoryId },
      { enabled: open, staleTime: 60_000 }
    );

  const assign = trpc.github.assignToProject.useMutation({
    onSuccess: (result) => {
      githubToast.repositoryAssigned(repositoryName, result.projectName);
      onOpenChange(false);
      onSuccess();
    },
    onError: showError,
  });

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedProjectId(currentProjectId ?? "");
      setSelectedBranch("");
    }
  }, [open, currentProjectId]);

  const handleAssign = useCallback(() => {
    if (!selectedProjectId) return;
    assign.mutate({
      workspaceSlug,
      repositoryId,
      projectId: selectedProjectId,
      indexBranch: selectedBranch || undefined,
    });
  }, [assign, workspaceSlug, repositoryId, selectedProjectId, selectedBranch]);

  const handleSelectBranch = useCallback((branchName: string) => {
    // If selecting the default branch, clear selection (same as "leave empty")
    setSelectedBranch(branchName === defaultBranch ? "" : branchName);
    setBranchPopoverOpen(false);
  }, [defaultBranch]);

  const availableProjects = useMemo(
    () => projects?.filter((p) => !p.hasRepo || p.id === currentProjectId) ?? [],
    [projects, currentProjectId]
  );

  const displayBranch = selectedBranch || defaultBranch;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign to Project</DialogTitle>
          <DialogDescription>
            Link <span className="font-medium">{repositoryName}</span> to a
            project for code indexing and Root Cause Analysis.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="project">Project</Label>
            {projectsLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading projects...
              </div>
            ) : availableProjects.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No available projects. All projects already have a repository assigned.
              </p>
            ) : (
              <Select
                value={selectedProjectId}
                onValueChange={setSelectedProjectId}
              >
                <SelectTrigger id="project">
                  <SelectValue placeholder="Select a project" />
                </SelectTrigger>
                <SelectContent>
                  {availableProjects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      <div className="flex items-center gap-2">
                        <FolderKanban className="h-4 w-4 text-muted-foreground" />
                        {project.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-2">
            <Label>Branch to Index</Label>
            <Popover open={branchPopoverOpen} onOpenChange={setBranchPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={branchPopoverOpen}
                  className="w-full justify-between font-normal"
                >
                  <div className="flex items-center gap-2 truncate">
                    <GitBranch className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{displayBranch}</span>
                    {!selectedBranch && (
                      <span className="text-xs text-muted-foreground">(default)</span>
                    )}
                  </div>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search branches..." />
                  <CommandList style={BRANCH_LIST_STYLE}>
                    <CommandEmpty>
                      {branchesLoading ? "Loading branches..." : "No branches found."}
                    </CommandEmpty>
                    <CommandGroup>
                      {branches?.map((branch) => (
                        <CommandItem
                          key={branch.name}
                          value={branch.name}
                          onSelect={handleSelectBranch}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              displayBranch === branch.name
                                ? "opacity-100"
                                : "opacity-0"
                            )}
                          />
                          <GitBranch className="mr-2 h-4 w-4 text-muted-foreground" />
                          {branch.name}
                          {branch.isDefault && (
                            <span className="ml-auto text-xs text-muted-foreground">
                              default
                            </span>
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <p className="text-xs text-muted-foreground">
              Pushes to this branch will trigger incremental indexing.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleAssign}
            disabled={!selectedProjectId || assign.isPending}
          >
            {assign.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Assign & Index
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
