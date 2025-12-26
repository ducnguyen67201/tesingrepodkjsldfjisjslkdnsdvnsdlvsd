"use client";

import { useCallback } from "react";
import {
  MoreHorizontal,
  Pencil,
  Trash2,
  Archive,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { ARTICLE_STATUS_LABELS, type ArticleStatus } from "@ducsigr/api/schemas";
import { STATUS_COLORS } from "./knowledge-constants";

export interface ArticleRowProps {
  article: {
    id: string;
    title: string;
    slug: string;
    summary: string | null;
    status: ArticleStatus;
    tags: string[];
    updatedAt: Date;
  };
  isSelected: boolean;
  onSelect: (articleId: string) => void;
  onArchive: (articleId: string, archive: boolean) => void;
  onDelete: (articleId: string) => void;
  isArchiving: boolean;
  isDeleting: boolean;
}

export function ArticleRow({
  article,
  isSelected,
  onSelect,
  onArchive,
  onDelete,
  isArchiving,
  isDeleting,
}: ArticleRowProps) {
  const handleClick = useCallback(() => {
    onSelect(article.id);
  }, [onSelect, article.id]);

  const handleArchiveClick = useCallback(() => {
    onArchive(article.id, article.status !== "ARCHIVED");
  }, [onArchive, article.id, article.status]);

  const handleDeleteClick = useCallback(() => {
    onDelete(article.id);
  }, [onDelete, article.id]);

  return (
    <Card
      className={cn(
        "cursor-pointer transition-colors hover:bg-muted/50",
        isSelected && "border-primary bg-muted/50"
      )}
      onClick={handleClick}
    >
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-sm truncate">{article.title}</h3>
              <Badge
                variant="secondary"
                className={cn("text-[10px] px-1.5", STATUS_COLORS[article.status])}
              >
                {ARTICLE_STATUS_LABELS[article.status]}
              </Badge>
            </div>
            {article.summary && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {article.summary}
              </p>
            )}
            <div className="flex items-center gap-2 mt-2">
              <code className="text-[10px] text-muted-foreground">
                {article.slug}
              </code>
              <span className="text-[10px] text-muted-foreground">
                {formatDistanceToNow(new Date(article.updatedAt), {
                  addSuffix: true,
                })}
              </span>
            </div>
            {article.tags.length > 0 && (
              <div className="flex items-center gap-1 mt-2 flex-wrap">
                {article.tags.slice(0, 3).map((tag) => (
                  <Badge
                    key={tag}
                    variant="outline"
                    className="text-[10px] px-1.5 py-0"
                  >
                    {tag}
                  </Badge>
                ))}
                {article.tags.length > 3 && (
                  <span className="text-[10px] text-muted-foreground">
                    +{article.tags.length - 3}
                  </span>
                )}
              </div>
            )}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Eye className="mr-2 h-4 w-4" />
                View History
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  handleArchiveClick();
                }}
                disabled={isArchiving}
              >
                <Archive className="mr-2 h-4 w-4" />
                {article.status === "ARCHIVED" ? "Unarchive" : "Archive"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteClick();
                }}
                disabled={isDeleting}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardContent>
    </Card>
  );
}
