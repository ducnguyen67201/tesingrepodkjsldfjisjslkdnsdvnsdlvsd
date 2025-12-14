"use client";

import { useState, useCallback } from "react";
import {
  MoreVertical,
  Trash2,
  Pencil,
  Activity,
  FileText,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { RegressionBadge, StatusDot } from "./regression-badge";
import { BaselineIndicator } from "./baseline-indicator";
import { TriggerEvalButton } from "./trigger-eval-button";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import type { EvalRunStatus } from "@cognobserve/api/schemas";

interface LastRun {
  id: string;
  status: string;
  isRegression: boolean | null;
  createdAt: Date;
}

interface EvalSuiteCardProps {
  id: string;
  name: string;
  description?: string | null;
  enabled: boolean;
  endpoint: string;
  promptCount: number;
  runCount: number;
  lastRun: LastRun | null;
  hasBaseline: boolean;
  latencyRegressionThreshold: number;
  errorRegressionThreshold: number;
  onEdit: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
  onToggle: (id: string) => Promise<void>;
  onTrigger: (id: string) => Promise<void>;
  onViewRuns: (id: string) => void;
  isDeleting?: boolean;
  isToggling?: boolean;
  isTriggering?: boolean;
}

export function EvalSuiteCard({
  id,
  name,
  description,
  enabled,
  endpoint,
  promptCount,
  runCount,
  lastRun,
  hasBaseline,
  onEdit,
  onDelete,
  onToggle,
  onTrigger,
  onViewRuns,
  isDeleting,
  isToggling,
  isTriggering,
}: EvalSuiteCardProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const handleDelete = useCallback(async () => {
    await onDelete(id);
    setShowDeleteDialog(false);
  }, [onDelete, id]);

  const handleToggle = useCallback(async () => {
    await onToggle(id);
  }, [onToggle, id]);

  const handleTrigger = useCallback(async () => {
    await onTrigger(id);
  }, [onTrigger, id]);

  return (
    <>
      <Card className={cn(!enabled && "opacity-60")}>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">{name}</CardTitle>
                {lastRun && (
                  <StatusDot status={lastRun.status as EvalRunStatus} />
                )}
              </div>
              {description && (
                <CardDescription className="text-sm">
                  {description}
                </CardDescription>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={enabled}
                onCheckedChange={handleToggle}
                disabled={isToggling}
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onEdit(id)}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onViewRuns(id)}>
                    <Activity className="mr-2 h-4 w-4" />
                    View runs
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setShowDeleteDialog(true)}
                    className="text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Stats row */}
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <FileText className="h-4 w-4" />
              {promptCount} {promptCount === 1 ? "prompt" : "prompts"}
            </div>
            <div className="flex items-center gap-1">
              <Activity className="h-4 w-4" />
              {runCount} {runCount === 1 ? "run" : "runs"}
            </div>
          </div>

          {/* Last run info */}
          {lastRun && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Last run:</span>
                <RegressionBadge
                  status={lastRun.status as EvalRunStatus}
                  isRegression={lastRun.isRegression}
                />
                <span className="text-muted-foreground">
                  {formatDistanceToNow(new Date(lastRun.createdAt), {
                    addSuffix: true,
                  })}
                </span>
              </div>
            </div>
          )}

          {/* Baseline and trigger */}
          <div className="flex items-center justify-between pt-2">
            <BaselineIndicator
              latencyP95={hasBaseline ? 100 : null}
              errorRate={hasBaseline ? 1 : null}
            />
            <TriggerEvalButton
              onTrigger={handleTrigger}
              isTriggering={isTriggering ?? false}
              disabled={!enabled}
            />
          </div>
        </CardContent>
      </Card>

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete eval suite?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{name}" and all its run history.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
