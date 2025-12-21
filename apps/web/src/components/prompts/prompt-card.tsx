"use client";

import { formatDistanceToNow } from "date-fns";
import {
  MoreHorizontal,
  Pencil,
  Trash2,
  Archive,
  RotateCcw,
  Copy,
  MessageSquare,
  FileText,
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

interface PromptCardProps {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  tags: string[];
  isArchived: boolean;
  latestVersion: number;
  latestVersionType?: "text" | "chat";
  labels: string[];
  updatedAt: Date;
  onEdit: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
  onArchive: (id: string, archive: boolean) => Promise<void>;
  onViewVersions: (id: string) => void;
  isDeleting: boolean;
  isArchiving: boolean;
  isSelected?: boolean;
}

export function PromptCard({
  id,
  name,
  slug,
  description,
  tags,
  isArchived,
  latestVersion,
  latestVersionType,
  labels,
  updatedAt,
  onEdit,
  onDelete,
  onArchive,
  onViewVersions,
  isDeleting,
  isArchiving,
  isSelected = false,
}: PromptCardProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const handleCopySlug = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(slug);
      clipboardToast.copied("Slug");
    } catch {
      clipboardToast.copyFailed();
    }
  }, [slug]);

  const handleEdit = useCallback(() => {
    onEdit(id);
  }, [id, onEdit]);

  const handleViewVersions = useCallback(() => {
    onViewVersions(id);
  }, [id, onViewVersions]);

  const handleArchive = useCallback(async () => {
    await onArchive(id, !isArchived);
  }, [id, isArchived, onArchive]);

  const handleDelete = useCallback(async () => {
    await onDelete(id);
    setShowDeleteDialog(false);
  }, [id, onDelete]);

  const TypeIcon = latestVersionType === "chat" ? MessageSquare : FileText;

  return (
    <>
      <div
        className={`rounded-lg border p-4 transition-colors hover:bg-muted/50 cursor-pointer ${
          isArchived ? "opacity-60" : ""
        } ${isSelected ? "border-primary bg-muted/30" : ""}`}
        onClick={handleViewVersions}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {/* Header */}
            <div className="flex items-center gap-2">
              <TypeIcon className="h-4 w-4 text-muted-foreground shrink-0" />
              <button
                onClick={handleViewVersions}
                className="font-medium text-sm hover:underline truncate text-left"
              >
                {name}
              </button>
              {isArchived && (
                <Badge variant="secondary" className="shrink-0 text-[10px] px-1.5 py-0">
                  Archived
                </Badge>
              )}
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

            {/* Version info */}
            <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  v{latestVersion}
                </Badge>
                latest
              </span>
              {labels.includes("production") && (
                <Badge className="bg-green-100 text-green-800 hover:bg-green-100 text-[10px] px-1.5 py-0">
                  prod
                </Badge>
              )}
              {labels.includes("staging") && (
                <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100 text-[10px] px-1.5 py-0">
                  staging
                </Badge>
              )}
            </div>

            {/* Updated time */}
            <p className="text-[10px] text-muted-foreground mt-2">
              Updated {formatDistanceToNow(new Date(updatedAt), { addSuffix: true })}
            </p>
          </div>

          {/* Actions */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleEdit}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleViewVersions}>
                <FileText className="mr-2 h-4 w-4" />
                View Versions
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleCopySlug}>
                <Copy className="mr-2 h-4 w-4" />
                Copy Slug
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleArchive} disabled={isArchiving}>
                {isArchived ? (
                  <>
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Restore
                  </>
                ) : (
                  <>
                    <Archive className="mr-2 h-4 w-4" />
                    Archive
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setShowDeleteDialog(true)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Prompt</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{name}&quot;? This will permanently
              delete the prompt and all its versions. This action cannot be undone.
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
    </>
  );
}
