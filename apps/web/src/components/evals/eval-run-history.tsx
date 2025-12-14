"use client";

import { useCallback } from "react";
import { Clock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { RunItem } from "./run-item";
import { useEvalRuns } from "@/hooks/use-eval-runs";
import { useTriggerEval } from "@/hooks/use-trigger-eval";

interface EvalRunHistoryProps {
  workspaceSlug: string;
  suiteId: string;
  onRunClick?: (runId: string) => void;
}

export function EvalRunHistory({
  workspaceSlug,
  suiteId,
  onRunClick,
}: EvalRunHistoryProps) {
  const { runs, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useEvalRuns({ workspaceSlug, suiteId });

  const { updateBaseline, isUpdatingBaseline } = useTriggerEval({
    workspaceSlug,
  });

  const handleUpdateBaseline = useCallback(
    async (runId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      await updateBaseline(runId);
    },
    [updateBaseline]
  );

  if (isLoading) {
    return <RunHistorySkeleton />;
  }

  if (runs.length === 0) {
    return <EmptyState />;
  }

  return (
    <ScrollArea className="h-[400px]">
      <div className="space-y-2">
        {runs.map((run) => (
          <RunItem
            key={run.id}
            run={run}
            onClick={() => onRunClick?.(run.id)}
            onUpdateBaseline={handleUpdateBaseline}
            isUpdatingBaseline={isUpdatingBaseline}
          />
        ))}
        {hasNextPage && (
          <LoadMoreButton
            onClick={fetchNextPage}
            isLoading={isFetchingNextPage}
          />
        )}
      </div>
    </ScrollArea>
  );
}

// ============================================================
// Sub-components
// ============================================================

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <Clock className="h-12 w-12 text-muted-foreground/50" />
      <p className="mt-4 text-sm text-muted-foreground">No runs yet</p>
      <p className="text-xs text-muted-foreground">
        Runs will appear here when you trigger an eval or a PR is merged
      </p>
    </div>
  );
}

interface LoadMoreButtonProps {
  onClick: () => void;
  isLoading: boolean;
}

function LoadMoreButton({ onClick, isLoading }: LoadMoreButtonProps) {
  return (
    <Button
      variant="ghost"
      className="w-full"
      onClick={onClick}
      disabled={isLoading}
    >
      {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Load more"}
    </Button>
  );
}

function RunHistorySkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-lg border p-3">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <Skeleton className="h-5 w-24" />
              <div className="flex gap-2">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-20" />
              </div>
            </div>
            <Skeleton className="h-8 w-24" />
          </div>
          <div className="mt-2 flex gap-4">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}
