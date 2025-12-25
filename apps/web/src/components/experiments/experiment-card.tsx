"use client";

import { formatDistanceToNow } from "date-fns";
import {
  MoreHorizontal,
  Pencil,
  Trash2,
  Archive,
  Play,
  Pause,
  Square,
  Copy,
  FlaskConical,
  BarChart3,
  Trophy,
  AlertCircle,
  Loader2,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { useState, useCallback } from "react";
import { clipboardToast } from "@/lib/success";
import {
  getStatusColor,
  getStatusLabel,
} from "@/hooks/use-prompt-experiments";
import type { ExperimentStatus } from "@cognobserve/api/schemas";

interface Variant {
  id: string;
  name: "A" | "B";
  weight: number;
  isControl: boolean;
  promptName: string;
  promptSlug: string;
  version: number;
}

type AnalysisStatus = "pending" | "running" | "completed" | "failed" | null;

interface ExperimentCardProps {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  status: ExperimentStatus;
  allocationPct: number;
  tags: string[];
  variants: Variant[];
  startedAt?: Date | null;
  endedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  // Analysis fields
  analysisStatus?: AnalysisStatus;
  analysisError?: string | null;
  winnerVariantId?: string | null;
  winnerConfidence?: number | null;
  onEdit: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
  onStart: (id: string) => Promise<void>;
  onPause: (id: string) => Promise<void>;
  onStop: (id: string) => Promise<void>;
  onArchive: (id: string) => Promise<void>;
  onViewDetails: (id: string) => void;
  isDeleting: boolean;
  isStarting: boolean;
  isPausing: boolean;
  isStopping: boolean;
  isArchiving: boolean;
  isSelected?: boolean;
}

export function ExperimentCard({
  id,
  name,
  slug,
  description,
  status,
  allocationPct,
  tags,
  variants,
  startedAt,
  updatedAt,
  analysisStatus,
  analysisError,
  winnerVariantId,
  winnerConfidence,
  onEdit,
  onDelete,
  onStart,
  onPause,
  onStop,
  onArchive,
  onViewDetails,
  isDeleting,
  isStarting,
  isPausing,
  isStopping,
  isArchiving,
  isSelected = false,
}: ExperimentCardProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showStopDialog, setShowStopDialog] = useState(false);

  // Get winner variant name from ID
  const winnerVariant = winnerVariantId
    ? variants.find((v) => v.id === winnerVariantId)
    : null;

  const handleCopySlug = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        await navigator.clipboard.writeText(slug);
        clipboardToast.copied("Slug");
      } catch {
        clipboardToast.copyFailed();
      }
    },
    [slug]
  );

  const handleEdit = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onEdit(id);
    },
    [id, onEdit]
  );

  const handleViewDetails = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onViewDetails(id);
    },
    [id, onViewDetails]
  );

  const handleStart = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      await onStart(id);
    },
    [id, onStart]
  );

  const handlePause = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      await onPause(id);
    },
    [id, onPause]
  );

  const handleStop = useCallback(async () => {
    await onStop(id);
    setShowStopDialog(false);
  }, [id, onStop]);

  const handleArchive = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      await onArchive(id);
    },
    [id, onArchive]
  );

  const handleDelete = useCallback(async () => {
    await onDelete(id);
    setShowDeleteDialog(false);
  }, [id, onDelete]);

  const handleShowDeleteDialog = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDeleteDialog(true);
  }, []);

  const handleShowStopDialog = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowStopDialog(true);
  }, []);

  const isActionDisabled =
    isDeleting || isStarting || isPausing || isStopping || isArchiving;
  const canStart = status === "draft" || status === "paused";
  const canPause = status === "running";
  const canStop = status === "running" || status === "paused";
  const canArchive =
    status === "draft" || status === "completed" || status === "paused";
  const canDelete = status === "draft" || status === "archived";

  return (
    <>
      <div
        className={`rounded-lg border p-4 transition-colors hover:bg-muted/50 cursor-pointer ${
          status === "archived" ? "opacity-60" : ""
        } ${isSelected ? "border-primary bg-muted/30" : ""}`}
        onClick={handleViewDetails}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {/* Header */}
            <div className="flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-muted-foreground shrink-0" />
              <button
                onClick={handleViewDetails}
                className="font-medium text-sm hover:underline truncate text-left"
              >
                {name}
              </button>
              <Badge className={`shrink-0 text-[10px] px-1.5 py-0 ${getStatusColor(status)}`}>
                {getStatusLabel(status)}
              </Badge>
            </div>

            {/* Slug */}
            <div className="flex items-center gap-1.5 mt-1">
              <code className="text-xs text-muted-foreground font-mono truncate">
                {slug}
              </code>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 shrink-0"
                onClick={handleCopySlug}
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>

            {/* Description */}
            {description && (
              <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                {description}
              </p>
            )}

            {/* Tags */}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {tags.slice(0, 3).map((tag) => (
                  <Badge
                    key={tag}
                    variant="outline"
                    className="text-[10px] px-1.5 py-0"
                  >
                    {tag}
                  </Badge>
                ))}
                {tags.length > 3 && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    +{tags.length - 3}
                  </Badge>
                )}
              </div>
            )}

            {/* Variant info */}
            <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
              {variants.map((v) => (
                <span key={v.id} className="flex items-center gap-1">
                  <Badge
                    variant={v.isControl ? "secondary" : "outline"}
                    className="text-[10px] px-1.5 py-0"
                  >
                    {v.name}
                  </Badge>
                  <span className="text-[10px]">{v.weight / 100}%</span>
                </span>
              ))}
              <span className="text-[10px]">• {allocationPct}% traffic</span>
            </div>

            {/* Analysis Status */}
            {analysisStatus && status === "running" && (
              <div className="flex items-center gap-2 mt-3">
                {analysisStatus === "pending" && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 gap-1">
                    <Clock className="h-3 w-3" />
                    Analysis pending
                  </Badge>
                )}
                {analysisStatus === "running" && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 gap-1 text-blue-600 border-blue-200 bg-blue-50">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Analyzing...
                  </Badge>
                )}
                {analysisStatus === "completed" && winnerVariant && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 gap-1 text-green-600 border-green-200 bg-green-50">
                    <Trophy className="h-3 w-3" />
                    Winner: Variant {winnerVariant.name}
                    {winnerConfidence && (
                      <span className="text-muted-foreground">
                        ({Math.round(winnerConfidence * 100)}% conf)
                      </span>
                    )}
                  </Badge>
                )}
                {analysisStatus === "completed" && !winnerVariant && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 gap-1">
                    No clear winner
                  </Badge>
                )}
                {analysisStatus === "failed" && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 gap-1 text-red-600 border-red-200 bg-red-50">
                    <AlertCircle className="h-3 w-3" />
                    Analysis failed
                    {analysisError && (
                      <span title={analysisError} className="cursor-help">
                        (hover for details)
                      </span>
                    )}
                  </Badge>
                )}
              </div>
            )}

            {/* Started time / Updated time */}
            <p className="text-[10px] text-muted-foreground mt-2">
              {startedAt
                ? `Started ${formatDistanceToNow(new Date(startedAt), { addSuffix: true })}`
                : `Updated ${formatDistanceToNow(new Date(updatedAt), { addSuffix: true })}`}
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 shrink-0">
            {/* Start button - visible when experiment can be started */}
            {canStart && (
              <Button
                variant="default"
                size="sm"
                className="h-8 gap-1.5"
                onClick={handleStart}
                disabled={isActionDisabled}
              >
                <Play className="h-3.5 w-3.5" />
                {isStarting ? "Starting..." : "Start"}
              </Button>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleViewDetails}>
                  <BarChart3 className="mr-2 h-4 w-4" />
                  View Details
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleEdit} disabled={status === "archived"}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleCopySlug}>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy Slug
                </DropdownMenuItem>
                <DropdownMenuSeparator />

                {canPause && (
                  <DropdownMenuItem
                    onClick={handlePause}
                    disabled={isActionDisabled}
                  >
                    <Pause className="mr-2 h-4 w-4" />
                    {isPausing ? "Pausing..." : "Pause"}
                  </DropdownMenuItem>
                )}

                {canStop && (
                  <DropdownMenuItem
                    onClick={handleShowStopDialog}
                    disabled={isActionDisabled}
                  >
                    <Square className="mr-2 h-4 w-4" />
                    Complete
                  </DropdownMenuItem>
                )}

                {canArchive && (
                  <DropdownMenuItem
                    onClick={handleArchive}
                    disabled={isActionDisabled}
                  >
                    <Archive className="mr-2 h-4 w-4" />
                    {isArchiving ? "Archiving..." : "Archive"}
                  </DropdownMenuItem>
                )}

                {canDelete && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={handleShowDeleteDialog}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Experiment</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{name}&quot;? This will
              permanently delete the experiment and all its data. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Stop confirmation dialog */}
      <AlertDialog open={showStopDialog} onOpenChange={setShowStopDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Complete Experiment</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to complete &quot;{name}&quot;? This will
              stop the experiment and no new assignments will be made. You can
              still view the results.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleStop} disabled={isStopping}>
              {isStopping ? "Completing..." : "Complete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
