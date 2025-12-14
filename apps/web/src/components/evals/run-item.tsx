"use client";

import { formatDistanceToNow } from "date-fns";
import {
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  GitPullRequest,
  User,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RegressionBadge } from "./regression-badge";
import { cn } from "@/lib/utils";
import {
  EVAL_TRIGGER_LABELS,
  type EvalRunStatus,
  type EvalTriggerType,
} from "@cognobserve/api/schemas";

export interface EvalRunData {
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
}

interface RunItemProps {
  run: EvalRunData;
  onClick?: () => void;
  onUpdateBaseline: (runId: string, e: React.MouseEvent) => void;
  isUpdatingBaseline: boolean;
}

export function RunItem({
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

  const handleBaselineClick = (e: React.MouseEvent) => {
    onUpdateBaseline(run.id, e);
  };

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
            onClick={handleBaselineClick}
            disabled={isUpdatingBaseline}
          >
            Set as baseline
          </Button>
        )}
      </div>

      {/* Metrics */}
      <RunMetrics run={run} />
    </div>
  );
}

function RunMetrics({ run }: { run: EvalRunData }) {
  if (run.status === "PENDING" || run.status === "RUNNING") {
    return null;
  }

  return (
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
  );
}
