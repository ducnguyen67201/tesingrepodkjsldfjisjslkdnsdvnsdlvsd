"use client";

import { useState, useCallback, useMemo } from "react";
import { Search, BookOpen, Loader2, Link as LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc/client";
import { knowledgeToast } from "@/lib/success";
import { showError } from "@/lib/errors";
import type { KnowledgeEntityType } from "@ducsigr/api/schemas";

interface LinkArticleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceSlug: string;
  entityType: KnowledgeEntityType;
  entityId: string;
  /** Optional: exclude already linked articles */
  excludeArticleIds?: string[];
}

export function LinkArticleDialog({
  open,
  onOpenChange,
  workspaceSlug,
  entityType,
  entityId,
  excludeArticleIds = [],
}: LinkArticleDialogProps) {
  const utils = trpc.useUtils();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);

  // Fetch published articles
  const { data: articlesData, isLoading: isLoadingArticles } =
    trpc.knowledge.listArticles.useQuery(
      {
        workspaceSlug,
        status: "PUBLISHED",
        query: searchQuery || undefined,
        limit: 50,
      },
      { enabled: open && !!workspaceSlug }
    );

  // Filter out already linked articles
  const availableArticles = useMemo(() => {
    const articles = articlesData?.items ?? [];
    if (excludeArticleIds.length === 0) return articles;
    return articles.filter((a) => !excludeArticleIds.includes(a.id));
  }, [articlesData, excludeArticleIds]);

  // Link mutation
  const linkMutation = trpc.knowledge.linkEntity.useMutation({
    onSuccess: () => {
      knowledgeToast.articleLinked();
      utils.knowledge.listLinks.invalidate();
      onOpenChange(false);
      setSelectedArticleId(null);
      setSearchQuery("");
    },
    onError: showError,
  });

  const handleLink = useCallback(() => {
    if (!selectedArticleId) return;

    linkMutation.mutate({
      workspaceSlug,
      articleId: selectedArticleId,
      entityType,
      entityId,
    });
  }, [linkMutation, workspaceSlug, selectedArticleId, entityType, entityId]);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchQuery(e.target.value);
    },
    []
  );

  const handleSelectArticle = useCallback((articleId: string) => {
    setSelectedArticleId((prev) => (prev === articleId ? null : articleId));
  }, []);

  const entityTypeLabel = useMemo(() => {
    switch (entityType) {
      case "TRACE":
        return "trace";
      case "PROJECT":
        return "project";
      case "SPAN":
        return "span";
      case "ALERT":
        return "alert";
      case "ALERT_HISTORY":
        return "alert instance";
      default:
        return "entity";
    }
  }, [entityType]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LinkIcon className="h-5 w-5" />
            Link Knowledge Article
          </DialogTitle>
          <DialogDescription>
            Select an article to link to this {entityTypeLabel}. Only published
            articles are shown.
          </DialogDescription>
        </DialogHeader>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search articles..."
            value={searchQuery}
            onChange={handleSearchChange}
            className="pl-9"
          />
        </div>

        {/* Article List */}
        <ScrollArea className="h-[300px] border rounded-md">
          {isLoadingArticles ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : availableArticles.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-4">
              <BookOpen className="h-8 w-8 text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">
                {searchQuery
                  ? "No articles match your search"
                  : "No published articles available"}
              </p>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {availableArticles.map((article) => {
                const isSelected = selectedArticleId === article.id;
                return (
                  <button
                    key={article.id}
                    type="button"
                    onClick={() => handleSelectArticle(article.id)}
                    className={cn(
                      "w-full text-left p-3 rounded-md border transition-colors",
                      isSelected
                        ? "border-primary bg-primary/5"
                        : "border-transparent hover:bg-muted/50"
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <BookOpen
                        className={cn(
                          "h-4 w-4 mt-0.5 shrink-0",
                          isSelected ? "text-primary" : "text-muted-foreground"
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">
                          {article.title}
                        </p>
                        {article.summary && (
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                            {article.summary}
                          </p>
                        )}
                        {article.tags.length > 0 && (
                          <div className="flex items-center gap-1 mt-1 flex-wrap">
                            {article.tags.slice(0, 3).map((tag) => (
                              <Badge
                                key={tag}
                                variant="outline"
                                className="text-[10px] px-1 py-0"
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
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleLink}
            disabled={!selectedArticleId || linkMutation.isPending}
          >
            {linkMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Link Article
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
