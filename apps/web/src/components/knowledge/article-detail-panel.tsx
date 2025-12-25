"use client";

import { useState, useCallback } from "react";
import {
  Tag,
  FileText,
  Pencil,
  Eye,
  Clock,
  User,
  Zap,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useArticleDetail } from "@/hooks/use-knowledge";
import { formatDistanceToNow } from "date-fns";
import { ARTICLE_STATUS_LABELS } from "@cognobserve/api/schemas";
import { STATUS_COLORS } from "./knowledge-constants";

/** Version type from the hook */
interface ArticleVersion {
  id: string;
  version: number;
  title: string;
  summary: string | null;
  content: string;
  tags: string[];
  createdAt: Date;
  createdBy: { id: string; name: string | null; image: string | null } | null;
}

export interface ArticleDetailPanelProps {
  workspaceSlug: string;
  articleId: string;
  onEdit: (article: {
    id: string;
    title: string;
    slug: string;
    summary: string | null;
    content: string;
    tags: string[];
  }) => void;
}

export function ArticleDetailPanel({
  workspaceSlug,
  articleId,
  onEdit,
}: ArticleDetailPanelProps) {
  const { article, versions, isLoading, publishArticle, isPublishing, revertToVersion, isReverting } = useArticleDetail({
    workspaceSlug,
    articleId,
  });

  // State for viewing a version
  const [viewingVersion, setViewingVersion] = useState<ArticleVersion | null>(null);

  const handleEdit = useCallback(() => {
    if (article) {
      onEdit({
        id: article.id,
        title: article.title,
        slug: article.slug,
        summary: article.summary,
        content: article.content,
        tags: article.tags,
      });
    }
  }, [article, onEdit]);

  const handlePublish = useCallback(async () => {
    await publishArticle();
  }, [publishArticle]);

  const handleViewVersion = useCallback((version: ArticleVersion) => {
    setViewingVersion(version);
  }, []);

  const handleCloseVersionDialog = useCallback(() => {
    setViewingVersion(null);
  }, []);

  const handleRevertToVersion = useCallback(async () => {
    if (!viewingVersion) return;
    await revertToVersion(viewingVersion.version);
    setViewingVersion(null);
  }, [viewingVersion, revertToVersion]);

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!article) {
    return (
      <div className="flex-1 flex items-center justify-center text-center p-8">
        <div>
          <FileText className="h-12 w-12 text-muted-foreground/30 mx-auto" />
          <p className="mt-4 text-sm text-muted-foreground">Article not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between h-[52px] px-4 border-b bg-background">
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold truncate">{article.title}</h2>
        </div>
        <div className="flex items-center gap-2">
          {article.status === "DRAFT" && (
            <Button
              size="sm"
              onClick={handlePublish}
              disabled={isPublishing}
            >
              {isPublishing ? "Publishing..." : "Publish"}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={handleEdit}>
            <Pencil className="mr-1.5 h-4 w-4" />
            Edit
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="content" className="flex-1 flex flex-col">
        <div className="flex items-center h-[40px] px-4 border-b bg-background">
          <TabsList className="h-8">
            <TabsTrigger value="content" className="h-7 text-xs px-3">
              Content
            </TabsTrigger>
            <TabsTrigger value="versions" className="h-7 text-xs px-3">
              Versions ({versions.length})
            </TabsTrigger>
            <TabsTrigger value="links" className="h-7 text-xs px-3">
              Links
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="content" className="flex-1 mt-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-4">
              {/* Metadata */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge
                    variant="secondary"
                    className={cn("text-xs", STATUS_COLORS[article.status])}
                  >
                    {ARTICLE_STATUS_LABELS[article.status]}
                  </Badge>
                  <code className="text-xs text-muted-foreground">
                    {article.slug}
                  </code>
                </div>

                {article.summary && (
                  <p className="text-sm text-muted-foreground">
                    {article.summary}
                  </p>
                )}

                {article.tags.length > 0 && (
                  <div className="flex items-center gap-1 flex-wrap">
                    {article.tags.map((tag) => (
                      <Badge key={tag} variant="outline" className="text-xs">
                        <Tag className="mr-1 h-3 w-3" />
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <Separator />

              {/* Content */}
              <div className="prose prose-sm max-w-none dark:prose-invert">
                <pre className="whitespace-pre-wrap text-sm">
                  {article.content}
                </pre>
              </div>

              <Separator />

              {/* Audit info */}
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                {article.createdBy && (
                  <div className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    <span>Created by {article.createdBy.name}</span>
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  <span>
                    Updated{" "}
                    {formatDistanceToNow(new Date(article.updatedAt), {
                      addSuffix: true,
                    })}
                  </span>
                </div>
              </div>
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="versions" className="flex-1 mt-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-2">
              {versions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No version history yet
                </p>
              ) : (
                versions.map((version) => {
                  const handleClick = () => handleViewVersion(version as ArticleVersion);
                  return (
                    <Card key={version.id}>
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-medium text-sm">
                              Version {version.version}
                            </span>
                            <p className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(version.createdAt), {
                                addSuffix: true,
                              })}
                            </p>
                          </div>
                          <Button size="sm" variant="ghost" onClick={handleClick}>
                            <Eye className="mr-1.5 h-4 w-4" />
                            View
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="links" className="flex-1 mt-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-3">
              {article.links.length === 0 ? (
                <div className="text-center py-8">
                  <Zap className="h-8 w-8 text-muted-foreground/30 mx-auto" />
                  <p className="text-sm text-muted-foreground mt-2">
                    No linked entities yet
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Link this article from a trace or alert detail page
                  </p>
                </div>
              ) : (
                article.links.map((link) => (
                  <div
                    key={link.id}
                    className="flex items-center justify-between p-3 rounded-md border bg-muted/30"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge variant="outline" className="text-xs shrink-0">
                        {link.entityType}
                      </Badge>
                      <code className="text-xs text-muted-foreground truncate">
                        {link.entityId}
                      </code>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 text-xs text-muted-foreground">
                      {link.createdBy && (
                        <span>by {link.createdBy.name}</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>

      {/* Version View Dialog */}
      <Dialog open={!!viewingVersion} onOpenChange={(open) => !open && handleCloseVersionDialog()}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              Version {viewingVersion?.version}
            </DialogTitle>
            <DialogDescription>
              {viewingVersion?.createdAt && (
                <>
                  Created {formatDistanceToNow(new Date(viewingVersion.createdAt), { addSuffix: true })}
                  {viewingVersion.createdBy?.name && ` by ${viewingVersion.createdBy.name}`}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {viewingVersion && (
            <ScrollArea className="flex-1 -mx-6 px-6">
              <div className="space-y-4 pb-4">
                {/* Title */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Title</label>
                  <p className="font-medium">{viewingVersion.title}</p>
                </div>

                {/* Summary */}
                {viewingVersion.summary && (
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Summary</label>
                    <p className="text-sm text-muted-foreground">{viewingVersion.summary}</p>
                  </div>
                )}

                {/* Tags */}
                {viewingVersion.tags.length > 0 && (
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Tags</label>
                    <div className="flex flex-wrap gap-1">
                      {viewingVersion.tags.map((tag) => (
                        <Badge key={tag} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <Separator />

                {/* Content */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Content</label>
                  <div className="rounded-md border bg-muted/30 p-4">
                    <pre className="whitespace-pre-wrap text-sm">{viewingVersion.content}</pre>
                  </div>
                </div>
              </div>
            </ScrollArea>
          )}

          <DialogFooter className="border-t pt-4 mt-4">
            <Button variant="outline" onClick={handleCloseVersionDialog}>
              Close
            </Button>
            <Button onClick={handleRevertToVersion} disabled={isReverting}>
              {isReverting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Reverting...
                </>
              ) : (
                <>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Revert to Version {viewingVersion?.version}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
