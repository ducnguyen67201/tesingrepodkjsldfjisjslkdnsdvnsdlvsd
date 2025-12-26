"use client";

import {
  MoreHorizontal,
  Pencil,
  Trash2,
  Archive,
  Play,
  Pause,
  Square,
  Copy,
  BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ExperimentStatus } from "@ducsigr/api/schemas";

interface ExperimentCardActionsProps {
  status: ExperimentStatus;
  canStart: boolean;
  canPause: boolean;
  canStop: boolean;
  canArchive: boolean;
  canDelete: boolean;
  isActionDisabled: boolean;
  isStarting: boolean;
  isPausing: boolean;
  isArchiving: boolean;
  onViewDetails: (e: React.MouseEvent) => void;
  onEdit: (e: React.MouseEvent) => void;
  onCopySlug: (e: React.MouseEvent) => void;
  onStart: (e: React.MouseEvent) => Promise<void>;
  onPause: (e: React.MouseEvent) => Promise<void>;
  onShowStopDialog: (e: React.MouseEvent) => void;
  onArchive: (e: React.MouseEvent) => Promise<void>;
  onShowDeleteDialog: (e: React.MouseEvent) => void;
}

export function ExperimentCardActions({
  status,
  canStart,
  canPause,
  canStop,
  canArchive,
  canDelete,
  isActionDisabled,
  isStarting,
  isPausing,
  isArchiving,
  onViewDetails,
  onEdit,
  onCopySlug,
  onStart,
  onPause,
  onShowStopDialog,
  onArchive,
  onShowDeleteDialog,
}: ExperimentCardActionsProps) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      {canStart && (
        <Button
          variant="default"
          size="sm"
          className="h-8 gap-1.5"
          onClick={onStart}
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
          <DropdownMenuItem onClick={onViewDetails}>
            <BarChart3 className="mr-2 h-4 w-4" />
            View Details
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onEdit} disabled={status === "archived"}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onCopySlug}>
            <Copy className="mr-2 h-4 w-4" />
            Copy Slug
          </DropdownMenuItem>
          <DropdownMenuSeparator />

          {canPause && (
            <DropdownMenuItem onClick={onPause} disabled={isActionDisabled}>
              <Pause className="mr-2 h-4 w-4" />
              {isPausing ? "Pausing..." : "Pause"}
            </DropdownMenuItem>
          )}

          {canStop && (
            <DropdownMenuItem
              onClick={onShowStopDialog}
              disabled={isActionDisabled}
            >
              <Square className="mr-2 h-4 w-4" />
              Complete
            </DropdownMenuItem>
          )}

          {canArchive && (
            <DropdownMenuItem onClick={onArchive} disabled={isActionDisabled}>
              <Archive className="mr-2 h-4 w-4" />
              {isArchiving ? "Archiving..." : "Archive"}
            </DropdownMenuItem>
          )}

          {canDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onShowDeleteDialog}
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
  );
}
