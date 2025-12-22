"use client";

import { useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { BookOpen, Plus, ExternalLink, X } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc/client";
import { knowledgeToast } from "@/lib/success";
import { showError } from "@/lib/errors";
import { LinkArticleDialog } from "@/components/knowledge/link-article-dialog";

interface TraceKnowledgeSectionProps {
  workspaceSlug: string;
  traceId: string;
}

export function TraceKnowledgeSection({
  workspaceSlug,
  traceId,
}: TraceKnowledgeSectionProps) {
  const utils = trpc.useUtils();
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);

  const { data, isLoading } = trpc.knowledge.listLinks.useQuery(
    {
      workspaceSlug,
      entityType: "TRACE",
      entityId: traceId,
      limit: 10,
    },
    {
      enabled: !!traceId && !!workspaceSlug,
    }
  );

  const unlinkMutation = trpc.knowledge.unlinkEntity.useMutation({
    onSuccess: () => {
      knowledgeToast.articleUnlinked();
      utils.knowledge.listLinks.invalidate();
    },
    onError: showError,
  });

  const handleUnlink = useCallback(
    (articleId: string, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      unlinkMutation.mutate({
        workspaceSlug,
        articleId,
        entityType: "TRACE",
        entityId: traceId,
      });
    },
    [unlinkMutation, workspaceSlug, traceId]
  );

  const handleOpenLinkDialog = useCallback(() => {
    setIsLinkDialogOpen(true);
  }, []);

  // Get already linked article IDs to exclude from dialog
  const linkedArticleIds = useMemo(
    () => (data ?? []).map((link) => link.articleId),
    [data]
  );

  // Don't show section if loading or no links
  if (isLoading) {
    return <TraceKnowledgeSkeleton />;
  }

  const links = data ?? [];

  return (
    <>
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm font-medium flex items-center justify-between">
            <span className="flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              Knowledge Articles
            </span>
            <div className="flex items-center gap-2">
              {links.length > 0 && (
                <Badge variant="secondary">{links.length}</Badge>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2"
                onClick={handleOpenLinkDialog}
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="py-0 px-4 pb-3">
          {links.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground mb-3">
                No knowledge articles linked to this trace.
              </p>
              <Button variant="outline" size="sm" onClick={handleOpenLinkDialog}>
                <Plus className="h-4 w-4 mr-1" />
                Link Article
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {links.map((link) => (
                <div
                  key={link.id}
                  className="flex items-center justify-between p-2 rounded-md border hover:bg-muted/50 transition-colors group"
                >
                  <Link
                    href={`/workspace/${workspaceSlug}/knowledge?articleId=${link.articleId}`}
                    className="flex items-center gap-2 min-w-0 flex-1"
                  >
                    <BookOpen className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-sm font-medium truncate">
                      {link.article.title}
                    </span>
                  </Link>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => handleUnlink(link.articleId, e)}
                      disabled={unlinkMutation.isPending}
                    >
                      <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                    </Button>
                    <Link href={`/workspace/${workspaceSlug}/knowledge?articleId=${link.articleId}`}>
                      <ExternalLink className="h-3 w-3 text-muted-foreground" />
                    </Link>
                  </div>
                </div>
              ))}
              {links.length >= 5 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs"
                  asChild
                >
                  <Link href={`/workspace/${workspaceSlug}/knowledge`}>
                    View All Articles
                  </Link>
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <LinkArticleDialog
        open={isLinkDialogOpen}
        onOpenChange={setIsLinkDialogOpen}
        workspaceSlug={workspaceSlug}
        entityType="TRACE"
        entityId={traceId}
        excludeArticleIds={linkedArticleIds}
      />
    </>
  );
}

function TraceKnowledgeSkeleton() {
  return (
    <Card>
      <CardHeader className="py-3 px-4">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-4 w-32" />
        </div>
      </CardHeader>
      <CardContent className="py-0 px-4 pb-3">
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </CardContent>
    </Card>
  );
}
