"use client";

import { useState, useCallback, useMemo } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import {
  BookOpen,
  Plus,
  Search,
  FolderPlus,
  X,
  Tag,
  FileText,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useWorkspaceUrl } from "@/hooks/use-workspace-url";
import { useKnowledge } from "@/hooks/use-knowledge";
import {
  ARTICLE_STATUS_LABELS,
  type ArticleStatus,
} from "@cognobserve/api/schemas";
import {
  CreateArticleDialog,
  CreateGroupDialog,
  KnowledgeRuleList,
  GroupTreeItem,
  ArticleRow,
  ArticleDetailPanel,
  KnowledgePageSkeleton,
} from "@/components/knowledge";

export default function WorkspaceKnowledgePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { workspaceSlug } = useWorkspaceUrl();

  // Get selected group and article from URL
  const selectedGroupId = searchParams.get("groupId");
  const selectedArticleId = searchParams.get("articleId");

  // Main tab state (articles or rules)
  const mainTab = searchParams.get("tab") ?? "articles";

  // State
  const [isCreateArticleOpen, setIsCreateArticleOpen] = useState(false);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [editingArticle, setEditingArticle] = useState<{
    id: string;
    title: string;
    slug: string;
    summary: string | null;
    content: string;
    tags: string[];
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<ArticleStatus | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Main tab handler
  const setMainTab = useCallback(
    (tab: string) => {
      const url = new URLSearchParams(searchParams.toString());
      if (tab === "articles") {
        url.delete("tab");
      } else {
        url.set("tab", tab);
      }
      // Clear article/group selection when switching tabs
      url.delete("articleId");
      url.delete("groupId");
      const newUrl = url.toString() ? `${pathname}?${url.toString()}` : pathname;
      router.push(newUrl, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  // Fetch knowledge data
  const {
    groups,
    articles,
    isLoading,
    archiveArticle,
    deleteArticle,
    isArchiving,
    isDeleting,
  } = useKnowledge({
    workspaceSlug: workspaceSlug ?? "",
    groupId: selectedGroupId ?? undefined,
    status: statusFilter ?? undefined,
    searchQuery: searchQuery || undefined,
  });

  // URL management
  const updateUrl = useCallback(
    (params: { groupId?: string | null; articleId?: string | null }) => {
      const url = new URLSearchParams(searchParams.toString());

      if (params.groupId !== undefined) {
        if (params.groupId) {
          url.set("groupId", params.groupId);
        } else {
          url.delete("groupId");
        }
      }
      if (params.articleId !== undefined) {
        if (params.articleId) {
          url.set("articleId", params.articleId);
        } else {
          url.delete("articleId");
        }
      }

      const newUrl = url.toString() ? `${pathname}?${url.toString()}` : pathname;
      router.push(newUrl, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  const handleSelectGroup = useCallback(
    (groupId: string | null) => {
      updateUrl({ groupId, articleId: null });
    },
    [updateUrl]
  );

  const handleSelectArticle = useCallback(
    (articleId: string) => {
      updateUrl({ articleId });
    },
    [updateUrl]
  );

  const handleToggleGroup = useCallback((groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }, []);

  const handleArchive = useCallback(
    async (articleId: string, archive: boolean) => {
      await archiveArticle(articleId, archive);
    },
    [archiveArticle]
  );

  const handleDelete = useCallback(
    async (articleId: string) => {
      await deleteArticle(articleId);
      if (selectedArticleId === articleId) {
        updateUrl({ articleId: null });
      }
    },
    [deleteArticle, selectedArticleId, updateUrl]
  );

  // Compute available tags
  const availableTags = useMemo(
    () => Array.from(new Set(articles.flatMap((a) => a.tags))).sort(),
    [articles]
  );

  // Filter articles
  const filteredArticles = useMemo(() => {
    return articles.filter((article) => {
      if (selectedTags.length > 0) {
        const hasSelectedTag = selectedTags.some((tag) =>
          article.tags.includes(tag)
        );
        if (!hasSelectedTag) return false;
      }
      return true;
    });
  }, [articles, selectedTags]);

  const handleToggleTag = useCallback((tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }, []);

  const handleClearFilters = useCallback(() => {
    setSearchQuery("");
    setSelectedTags([]);
    setStatusFilter(null);
  }, []);

  const hasActiveFilters =
    searchQuery.length > 0 ||
    selectedTags.length > 0 ||
    statusFilter !== null;

  const selectedArticle = articles.find((a) => a.id === selectedArticleId);

  if (isLoading && mainTab === "articles") {
    return <KnowledgePageSkeleton />;
  }

  // Show Rules view
  if (mainTab === "rules") {
    return (
      <div className="flex flex-col h-full">
        {/* Top Tabs */}
        <div className="flex items-center h-[44px] px-4 border-b bg-background">
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-8 gap-2",
                mainTab !== "rules" && "text-muted-foreground"
              )}
              onClick={() => setMainTab("articles")}
            >
              <BookOpen className="h-4 w-4" />
              Articles
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-8 gap-2",
                mainTab === "rules" && "bg-muted"
              )}
              onClick={() => setMainTab("rules")}
            >
              <Zap className="h-4 w-4" />
              Rules
            </Button>
          </div>
        </div>

        {/* Rules Content */}
        <div className="flex-1">
          <KnowledgeRuleList workspaceSlug={workspaceSlug ?? ""} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Top Tabs */}
      <div className="flex items-center h-[44px] px-4 border-b bg-background">
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-8 gap-2",
              mainTab === "articles" && "bg-muted"
            )}
            onClick={() => setMainTab("articles")}
          >
            <BookOpen className="h-4 w-4" />
            Articles
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-8 gap-2",
              mainTab !== "articles" && "text-muted-foreground"
            )}
            onClick={() => setMainTab("rules")}
          >
            <Zap className="h-4 w-4" />
            Rules
          </Button>
        </div>
      </div>

      {/* Articles Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Groups Sidebar */}
        <div className="w-[250px] flex flex-col border-r bg-muted/30">
          {/* Header */}
          <div className="flex items-center justify-between h-[52px] px-3 border-b bg-background">
            <span className="text-sm font-medium">Groups</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setIsCreateGroupOpen(true)}
            >
              <FolderPlus className="h-4 w-4" />
            </Button>
          </div>

          {/* Search */}
          <div className="p-3 border-b bg-background">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 pl-8 text-sm"
              />
            </div>
          </div>

          {/* Group Tree */}
          <ScrollArea className="flex-1">
            <div className="p-2">
              {/* All Articles */}
              <button
                className={cn(
                  "flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-sm text-left hover:bg-muted",
                  !selectedGroupId && "bg-muted font-medium"
                )}
                onClick={() => handleSelectGroup(null)}
              >
                <BookOpen className="h-4 w-4" />
                All Articles
                <Badge variant="secondary" className="ml-auto text-[10px] px-1.5">
                  {articles.length}
                </Badge>
              </button>

              <Separator className="my-2" />

              {/* Groups */}
              {groups.length === 0 ? (
                <p className="text-xs text-muted-foreground px-2 py-4 text-center">
                  No groups yet
                </p>
              ) : (
                <div className="space-y-0.5">
                  {groups
                    .filter((g) => !g.parentId)
                    .map((group) => (
                      <GroupTreeItem
                        key={group.id}
                        group={group}
                        groups={groups}
                        articles={articles}
                        selectedGroupId={selectedGroupId}
                        expandedGroups={expandedGroups}
                        onSelect={handleSelectGroup}
                        onToggle={handleToggleGroup}
                      />
                    ))}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Middle: Articles List */}
        <div className="flex-1 flex flex-col border-r">
          {/* Header */}
          <div className="flex items-center justify-between h-[52px] px-4 border-b">
            <div>
              <h1 className="text-lg font-semibold">Knowledge Base</h1>
              <span className="text-xs text-muted-foreground">
                {filteredArticles.length} articles
              </span>
            </div>
            <Button size="sm" onClick={() => setIsCreateArticleOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              New Article
            </Button>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-1.5 h-[40px] px-4 border-b bg-muted/30 overflow-x-auto">
            {(["DRAFT", "PUBLISHED", "ARCHIVED"] as const).map((status) => (
              <Badge
                key={status}
                variant={statusFilter === status ? "default" : "outline"}
                className={cn(
                  "cursor-pointer text-[10px] px-2 py-0.5",
                  statusFilter !== status && "hover:bg-muted"
                )}
                onClick={() =>
                  setStatusFilter(statusFilter === status ? null : status)
                }
              >
                {ARTICLE_STATUS_LABELS[status]}
              </Badge>
            ))}

            {availableTags.length > 0 && (
              <div className="w-px h-4 bg-border mx-1" />
            )}

            {availableTags.slice(0, 5).map((tag) => {
              const isSelected = selectedTags.includes(tag);
              return (
                <Badge
                  key={tag}
                  variant={isSelected ? "secondary" : "outline"}
                  className={cn(
                    "cursor-pointer text-[10px] px-2 py-0.5 gap-1",
                    !isSelected && "hover:bg-muted"
                  )}
                  onClick={() => handleToggleTag(tag)}
                >
                  <Tag className="h-2.5 w-2.5" />
                  {tag}
                </Badge>
              );
            })}

            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="h-5 px-2 text-[10px] text-muted-foreground ml-auto"
                onClick={handleClearFilters}
              >
                <X className="h-2.5 w-2.5 mr-1" />
                Clear
              </Button>
            )}
          </div>

          {/* Articles List */}
          <ScrollArea className="flex-1">
            <div className="p-4">
              {filteredArticles.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="rounded-full bg-muted/50 p-5">
                    <BookOpen className="h-10 w-10 text-muted-foreground/70" />
                  </div>
                  <h3 className="mt-6 text-base font-semibold">No articles yet</h3>
                  <p className="mt-2 text-sm text-muted-foreground max-w-[260px] leading-relaxed">
                    Create articles to document rules, runbooks, and domain
                    knowledge for your team.
                  </p>
                  <Button
                    className="mt-4"
                    onClick={() => setIsCreateArticleOpen(true)}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Create First Article
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredArticles.map((article) => (
                    <ArticleRow
                      key={article.id}
                      article={article}
                      isSelected={article.id === selectedArticleId}
                      onSelect={handleSelectArticle}
                      onArchive={handleArchive}
                      onDelete={handleDelete}
                      isArchiving={isArchiving}
                      isDeleting={isDeleting}
                    />
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Right: Article Detail */}
        <div className="w-[400px] flex flex-col bg-muted/30">
          {selectedArticleId && selectedArticle ? (
            <ArticleDetailPanel
              workspaceSlug={workspaceSlug ?? ""}
              articleId={selectedArticleId}
              onEdit={setEditingArticle}
            />
          ) : (
            <div className="flex flex-col h-full">
              <div className="flex items-center h-[52px] px-4 border-b bg-background">
                <span className="text-muted-foreground text-sm">
                  No article selected
                </span>
              </div>
              <div className="h-[40px] border-b bg-muted/30" />
              <div className="flex-1 flex items-center justify-center text-center p-8">
                <div>
                  <FileText className="h-12 w-12 text-muted-foreground/30 mx-auto" />
                  <p className="mt-4 text-sm text-muted-foreground">
                    Select an article to view details
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Dialogs */}
      <CreateArticleDialog
        open={isCreateArticleOpen || !!editingArticle}
        onOpenChange={(open) => {
          if (!open) {
            setIsCreateArticleOpen(false);
            setEditingArticle(null);
          }
        }}
        workspaceSlug={workspaceSlug ?? ""}
        groupId={selectedGroupId ?? undefined}
        article={editingArticle}
      />

      <CreateGroupDialog
        open={isCreateGroupOpen}
        onOpenChange={setIsCreateGroupOpen}
        workspaceSlug={workspaceSlug ?? ""}
        parentId={selectedGroupId ?? undefined}
      />
    </div>
  );
}
