"use client";

import { Loader2, Settings, Unlink } from "lucide-react";
import { GitHubIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useGitHubDisconnect, useManageRepos } from "@/hooks/use-github-oauth";

interface GitHubInstallation {
  id: string;
  installationId: bigint;
  accountLogin: string;
  accountType: string;
  createdAt: Date;
}

interface GitHubConnectionStatusProps {
  installation: GitHubInstallation;
  workspaceId: string;
}

export function GitHubConnectionStatus({
  installation,
  workspaceId,
}: GitHubConnectionStatusProps) {
  const { disconnect, isDisconnecting } = useGitHubDisconnect(workspaceId);
  const { openManageRepos, isOpen: isManageReposOpen } = useManageRepos(installation);

  const handleDisconnect = async () => {
    await disconnect();
  };

  return (
    <div className="flex items-center justify-between rounded-lg border bg-card p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
          <GitHubIcon className="h-5 w-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            <span className="font-medium">Connected to GitHub</span>
          </div>
          <p className="text-sm text-muted-foreground">
            {installation.accountType === "Organization" ? "Organization: " : "Account: "}
            <span className="font-mono">@{installation.accountLogin}</span>
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={openManageRepos}
          disabled={isManageReposOpen}
        >
          {isManageReposOpen ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Settings className="mr-2 h-4 w-4" />
          )}
          {isManageReposOpen ? "Managing..." : "Manage Repos"}
        </Button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" disabled={isDisconnecting}>
              {isDisconnecting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Unlink className="mr-2 h-4 w-4" />
              )}
              Disconnect
            </Button>
          </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect GitHub?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the GitHub integration from this workspace. All
              repository data and indexed code chunks will be deleted. You can
              reconnect at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDisconnect}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
