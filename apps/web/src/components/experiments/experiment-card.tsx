"use client";

import { formatDistanceToNow } from "date-fns";
import { Copy, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState, useCallback } from "react";
import { clipboardToast } from "@/lib/success";
import { getStatusColor, getStatusLabel } from "@/hooks/use-prompt-experiments";
import { ExperimentCardAnalysisStatus } from "./experiment-card-analysis-status";
import { ExperimentCardActions } from "./experiment-card-actions";
import {
  ExperimentDeleteDialog,
  ExperimentStopDialog,
} from "./experiment-card-dialogs";
import type { ExperimentStatus } from "@cognobserve/api/schemas";

// ============================================================
// Types
// ============================================================

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

// ============================================================
// Component
// ============================================================

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

  const winnerVariant = winnerVariantId
    ? variants.find((v) => v.id === winnerVariantId) ?? null
    : null;

  // Event handlers
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

  // Computed values
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
              <Badge
                className={`shrink-0 text-[10px] px-1.5 py-0 ${getStatusColor(status)}`}
              >
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
              <ExperimentCardAnalysisStatus
                analysisStatus={analysisStatus}
                analysisError={analysisError}
                winnerVariant={winnerVariant}
                winnerConfidence={winnerConfidence}
              />
            )}

            {/* Timestamp */}
            <p className="text-[10px] text-muted-foreground mt-2">
              {startedAt
                ? `Started ${formatDistanceToNow(new Date(startedAt), { addSuffix: true })}`
                : `Updated ${formatDistanceToNow(new Date(updatedAt), { addSuffix: true })}`}
            </p>
          </div>

          {/* Actions */}
          <ExperimentCardActions
            status={status}
            canStart={canStart}
            canPause={canPause}
            canStop={canStop}
            canArchive={canArchive}
            canDelete={canDelete}
            isActionDisabled={isActionDisabled}
            isStarting={isStarting}
            isPausing={isPausing}
            isArchiving={isArchiving}
            onViewDetails={handleViewDetails}
            onEdit={handleEdit}
            onCopySlug={handleCopySlug}
            onStart={handleStart}
            onPause={handlePause}
            onShowStopDialog={handleShowStopDialog}
            onArchive={handleArchive}
            onShowDeleteDialog={handleShowDeleteDialog}
          />
        </div>
      </div>

      {/* Dialogs */}
      <ExperimentDeleteDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        name={name}
        onConfirm={handleDelete}
        isDeleting={isDeleting}
      />
      <ExperimentStopDialog
        open={showStopDialog}
        onOpenChange={setShowStopDialog}
        name={name}
        onConfirm={handleStop}
        isStopping={isStopping}
      />
    </>
  );
}
