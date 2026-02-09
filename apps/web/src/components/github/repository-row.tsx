"use client";

import { useState, useCallback } from "react";
import {
  MoreHorizontal,
  RefreshCw,
  ExternalLink,
  Loader2,
  Lock,
  BarChart3,
  FolderKanban,
  Unlink,
  Link2,
} from "lucide-react";
import { GitHubIcon } from "@/components/icons";
import { trpc } from "@/lib/trpc/client";
import { showError } from "@/lib/errors";
import { githubToast } from "@/lib/success";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { TableCell, TableRow } from "@/components/ui/table";
import { RepositoryStatusBadge } from "./repository-status-badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AssignRepoDialog } from "./assign-repo-dialog";
import type { Repository } from "./types";

/**
 * Format a date as a relative time string (e.g., "2 hours ago")
 */
function formatRelativeTime(date: Date | string | null): string {
  if (!date) return "Never";

  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return then.toLocaleDateString();
}

interface RepositoryRowProps {
  repository: Repository;
  workspaceSlug: string;
  onRefresh: () => void;
}

export function RepositoryRow({
  repository,
  workspaceSlug,
  onRefresh,
}: RepositoryRowProps) {
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [showUnassignDialog, setShowUnassignDialog] = useState(false);

  const unassign = trpc.github.unassignFromProject.useMutation({
    onSuccess: () => {
      githubToast.repositoryUnassigned(repository.fullName);
      setShowUnassignDialog(false);
      onRefresh();
    },
    onError: showError,
  });

  const reindex = trpc.github.reindexRepository.useMutation({
    onSuccess: () => {
      githubToast.reindexStarted(repository.fullName);
      onRefresh();
    },
    onError: showError,
  });

  const isLoading = unassign.isPending || reindex.isPending;

  const handleAssignClick = useCallback(() => {
    setShowAssignDialog(true);
  }, []);

  const handleUnassignClick = useCallback(() => {
    setShowUnassignDialog(true);
  }, []);

  const handleUnassignConfirm = useCallback(() => {
    unassign.mutate({ workspaceSlug, repositoryId: repository.id });
  }, [unassign, workspaceSlug, repository.id]);

  const handleUnassignCancel = useCallback(() => {
    setShowUnassignDialog(false);
  }, []);

  const handleReindex = useCallback(() => {
    reindex.mutate({ workspaceSlug, repositoryId: repository.id });
  }, [reindex, workspaceSlug, repository.id]);

  const githubUrl = `https://github.com/${repository.fullName}`;
  const isAssigned = !!repository.projectId;
  const branchDisplay = repository.indexBranch ?? repository.defaultBranch;

  return (
    <>
      <TableRow>
        <TableCell>
          <div className="flex items-center gap-3">
            <GitHubIcon className="h-5 w-5 text-muted-foreground" />
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="font-medium">{repository.fullName}</span>
                {repository.isPrivate && (
                  <Tooltip>
                    <TooltipTrigger>
                      <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>Private repository</TooltipContent>
                  </Tooltip>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {isAssigned && repository.lastIndexedAt && (
                  <span>Indexed {formatRelativeTime(repository.lastIndexedAt)}</span>
                )}
                {isAssigned && (
                  <span>Branch: {branchDisplay}</span>
                )}
              </div>
            </div>
          </div>
        </TableCell>
        <TableCell>
          {isAssigned ? (
            <div className="flex items-center gap-1.5">
              <FolderKanban className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-sm">{repository.projectName}</span>
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">Not assigned</span>
          )}
        </TableCell>
        <TableCell className="text-right">
          <div className="flex items-center justify-end gap-2">
            <RepositoryStatusBadge
              enabled={repository.enabled}
              status={repository.indexStatus}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" disabled={isLoading}>
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <MoreHorizontal className="h-4 w-4" />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {isAssigned ? (
                  <>
                    <DropdownMenuItem onClick={handleReindex}>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Re-index
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <a href={`?repo=${repository.id}&view=stats`}>
                        <BarChart3 className="mr-2 h-4 w-4" />
                        View Stats
                      </a>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleAssignClick}>
                      <Link2 className="mr-2 h-4 w-4" />
                      Reassign Project
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleUnassignClick}>
                      <Unlink className="mr-2 h-4 w-4" />
                      Unassign
                    </DropdownMenuItem>
                  </>
                ) : (
                  <DropdownMenuItem onClick={handleAssignClick}>
                    <FolderKanban className="mr-2 h-4 w-4" />
                    Assign to Project
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <a
                    href={githubUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    View on GitHub
                  </a>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </TableCell>
      </TableRow>

      <AssignRepoDialog
        open={showAssignDialog}
        onOpenChange={setShowAssignDialog}
        repositoryId={repository.id}
        repositoryName={repository.fullName}
        defaultBranch={repository.defaultBranch}
        currentProjectId={repository.projectId}
        workspaceSlug={workspaceSlug}
        onSuccess={onRefresh}
      />

      <AlertDialog open={showUnassignDialog} onOpenChange={setShowUnassignDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unassign repository?</AlertDialogTitle>
            <AlertDialogDescription>
              This will unlink{" "}
              <span className="font-medium">{repository.fullName}</span> from{" "}
              <span className="font-medium">{repository.projectName}</span> and
              delete all indexed code chunks. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleUnassignCancel}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleUnassignConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {unassign.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Unassign
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
