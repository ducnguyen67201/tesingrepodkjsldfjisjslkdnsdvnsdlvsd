"use client";

import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GitCommit, GitPullRequest, ExternalLink } from "lucide-react";
import type { LLMRCAOutput } from "@ducsigr/api/schemas";

interface GitHubRepo {
  owner: string;
  repo: string;
}

interface RCARelatedChangesCardProps {
  changes: LLMRCAOutput["relatedChanges"];
  commits: Array<{
    id: string;
    sha: string;
    message: string;
    author: string;
    timestamp: Date;
    repo?: GitHubRepo | null;
  }>;
  pullRequests: Array<{
    id: string;
    number: number;
    title: string;
    author: string;
    state: string;
    mergedAt: Date | null;
    repo?: GitHubRepo | null;
  }>;
  githubRepo?: GitHubRepo | null;
}

const RELEVANCE_COLORS: Record<string, string> = {
  high: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  low: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
};

function buildCommitUrl(sha: string, commitRepo?: GitHubRepo | null, fallbackRepo?: GitHubRepo | null): string | null {
  const repo = commitRepo ?? fallbackRepo;
  if (!repo) return null;
  return `https://github.com/${repo.owner}/${repo.repo}/commit/${sha}`;
}

function buildPRUrl(number: number, prRepo?: GitHubRepo | null, fallbackRepo?: GitHubRepo | null): string | null {
  const repo = prRepo ?? fallbackRepo;
  if (!repo) return null;
  return `https://github.com/${repo.owner}/${repo.repo}/pull/${number}`;
}

export function RCARelatedChangesCard({
  changes,
  commits,
  pullRequests,
  githubRepo,
}: RCARelatedChangesCardProps) {
  const hasChanges = changes.length > 0 || commits.length > 0 || pullRequests.length > 0;

  if (!hasChanges) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-8 text-center">
          <GitCommit className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            No related code changes identified
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GitCommit className="h-5 w-5" />
          Related Changes
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Show changes from RCA analysis */}
        {changes.map((change, i) => {
          const commit = commits.find((c) => c.sha === change.changeId);
          const pr = pullRequests.find((p) => String(p.number) === change.changeId);
          const commitUrl = change.type === "commit" ? buildCommitUrl(change.changeId, commit?.repo, githubRepo) : null;
          const prUrl = change.type === "pr" ? buildPRUrl(Number(change.changeId), pr?.repo, githubRepo) : null;
          const url = commitUrl ?? prUrl;

          return (
            <div key={i} className="p-3 bg-muted rounded-lg space-y-2">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  {change.type === "commit" ? (
                    <GitCommit className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <GitPullRequest className="h-4 w-4 text-muted-foreground" />
                  )}
                  {url ? (
                    <Link
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-sm text-primary hover:underline flex items-center gap-1"
                    >
                      {change.type === "commit"
                        ? change.changeId.slice(0, 7)
                        : `#${change.changeId}`}
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  ) : (
                    <span className="font-mono text-sm">
                      {change.type === "commit"
                        ? change.changeId.slice(0, 7)
                        : `#${change.changeId}`}
                    </span>
                  )}
                </div>
                <Badge className={RELEVANCE_COLORS[change.relevance] ?? RELEVANCE_COLORS.low}>
                  {change.relevance}
                </Badge>
              </div>

              {commit && (
                <p className="text-sm truncate">{commit.message}</p>
              )}
              {pr && <p className="text-sm truncate">{pr.title}</p>}

              <p className="text-xs text-muted-foreground">{change.explanation}</p>

              {(commit ?? pr) && (
                <div className="text-xs text-muted-foreground">
                  by {commit?.author ?? pr?.author ?? "Unknown"}
                </div>
              )}
            </div>
          );
        })}

        {/* Show additional commits not in changes */}
        {commits
          .filter((c) => !changes.some((ch) => ch.changeId === c.sha))
          .slice(0, 3)
          .map((commit) => {
            const url = buildCommitUrl(commit.sha, commit.repo, githubRepo);
            return (
              <div key={commit.id} className="p-3 bg-muted rounded-lg space-y-1">
                <div className="flex items-center gap-2">
                  <GitCommit className="h-4 w-4 text-muted-foreground" />
                  {url ? (
                    <Link
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-sm text-primary hover:underline flex items-center gap-1"
                    >
                      {commit.sha.slice(0, 7)}
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  ) : (
                    <span className="font-mono text-sm">{commit.sha.slice(0, 7)}</span>
                  )}
                </div>
                <p className="text-sm truncate">{commit.message}</p>
                <div className="text-xs text-muted-foreground">by {commit.author}</div>
              </div>
            );
          })}
      </CardContent>
    </Card>
  );
}
