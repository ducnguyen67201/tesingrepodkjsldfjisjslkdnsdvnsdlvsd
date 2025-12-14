"use client";

import { useCallback } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  GitPullRequest,
  User,
  Calendar,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { RegressionBadge } from "./regression-badge";
import { useEvalRuns } from "@/hooks/use-eval-runs";
import { useTriggerEval } from "@/hooks/use-trigger-eval";
import { cn } from "@/lib/utils";
import {
  EVAL_TRIGGER_LABELS,
  type EvalRunStatus,
  type EvalTriggerType,
} from "@cognobserve/api/schemas";

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
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Load more"
            )}
          </Button>
        )}
      </div>
    </ScrollArea>
  );
}

interface RunItemProps {
  run: {
    id: string;
    status: string;
    triggeredBy: string;
    triggerRef?: string | null;
    isRegression?: boolean | null;
    latencyP95?: number | null;
    errorRate?: number | null;
    passedPrompts?: number | null;
    failedPrompts?: number | null;
    totalPrompts: number;
    createdAt: Date;
    completedAt?: Date | null;
  };
  onClick?: () => void;
  onUpdateBaseline: (runId: string, e: React.MouseEvent) => void;
  isUpdatingBaseline: boolean;
}

function RunItem({
  run,
  onClick,
  onUpdateBaseline,
  isUpdatingBaseline,
}: RunItemProps) {
  const TriggerIcon = run.triggeredBy === "pr_merge" ? GitPullRequest : User;
  const triggerLabel =
    EVAL_TRIGGER_LABELS[run.triggeredBy as EvalTriggerType] ?? run.triggeredBy;

  const canSetBaseline =
    run.status === "PASSED" || run.status === "REGRESSION_DETECTED";

  return (
    <div
      className={cn(
        "rounded-lg border p-3 transition-colors",
        onClick && "cursor-pointer hover:bg-accent/50"
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <RegressionBadge
              status={run.status as EvalRunStatus}
              isRegression={run.isRegression}
            />
            {run.triggerRef && (
              <Badge variant="outline" className="text-xs">
                {run.triggerRef}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <TriggerIcon className="h-3 w-3" />
              {triggerLabel}
            </div>
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {formatDistanceToNow(new Date(run.createdAt), {
                addSuffix: true,
              })}
            </div>
          </div>
        </div>
        {canSetBaseline && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={(e) => onUpdateBaseline(run.id, e)}
            disabled={isUpdatingBaseline}
          >
            Set as baseline
          </Button>
        )}
      </div>

      {/* Metrics */}
      {run.status !== "PENDING" && run.status !== "RUNNING" && (
        <div className="mt-2 flex items-center gap-4 text-xs">
          {run.latencyP95 !== null && run.latencyP95 !== undefined && (
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3 text-muted-foreground" />
              <span>{run.latencyP95.toFixed(0)}ms</span>
            </div>
          )}
          {run.errorRate !== null && run.errorRate !== undefined && (
            <div className="flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 text-muted-foreground" />
              <span>{run.errorRate.toFixed(2)}%</span>
            </div>
          )}
          <div className="flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3 text-green-500" />
            <span>{run.passedPrompts ?? 0}</span>
            {(run.failedPrompts ?? 0) > 0 && (
              <>
                <XCircle className="ml-1 h-3 w-3 text-red-500" />
                <span>{run.failedPrompts}</span>
              </>
            )}
            <span className="text-muted-foreground">/ {run.totalPrompts}</span>
          </div>
        </div>
      )}
    </div>
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
