"use client";

import { Loader2 } from "lucide-react";
import { GitHubIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useGitHubOAuth } from "@/hooks/use-github-oauth";

interface GitHubEmptyStateProps {
  workspaceSlug: string;
}

export function GitHubEmptyState({ workspaceSlug }: GitHubEmptyStateProps) {
  const { connect, isConnecting } = useGitHubOAuth(workspaceSlug);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Repositories</h1>
        <p className="text-sm text-muted-foreground">
          Connect GitHub to index repositories for Root Cause Analysis.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <div className="mb-4 rounded-full bg-muted p-4">
            <GitHubIcon className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="mb-2 text-lg font-semibold">Connect GitHub</h3>
          <p className="mb-6 max-w-md text-center text-sm text-muted-foreground">
            Connect your GitHub account to import repositories. Once connected,
            you can enable indexing for specific repositories to power Root
            Cause Analysis.
          </p>
          <Button onClick={connect} disabled={isConnecting}>
            {isConnecting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <GitHubIcon className="mr-2 h-4 w-4" />
            )}
            {isConnecting ? "Connecting..." : "Connect GitHub"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
