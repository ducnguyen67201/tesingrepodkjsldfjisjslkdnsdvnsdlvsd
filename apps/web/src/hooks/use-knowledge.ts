"use client";

import { useCallback } from "react";
import { trpc } from "@/lib/trpc/client";
import { knowledgeToast } from "@/lib/success";
import { showError } from "@/lib/errors";
import type { ArticleStatus } from "@ducsigr/api/schemas";

interface UseKnowledgeOptions {
  workspaceSlug: string;
  groupId?: string;
  status?: ArticleStatus;
  searchQuery?: string;
}

export function useKnowledge({
  workspaceSlug,
  groupId,
  status,
  searchQuery,
}: UseKnowledgeOptions) {
  const utils = trpc.useUtils();

  // Fetch groups (returns array directly, flat mode)
  const {
    data: groupsData,
    isLoading: isLoadingGroups,
    error: groupsError,
  } = trpc.knowledge.listGroups.useQuery(
    { workspaceSlug, flat: true },
    { enabled: !!workspaceSlug }
  );

  // Fetch articles (returns { items, nextCursor })
  const {
    data: articlesData,
    isLoading: isLoadingArticles,
    error: articlesError,
  } = trpc.knowledge.listArticles.useQuery(
    {
      workspaceSlug,
      groupId,
      status,
      query: searchQuery,
    },
    { enabled: !!workspaceSlug }
  );

  // Archive article mutation
  const archiveMutation = trpc.knowledge.archiveArticle.useMutation({
    onSuccess: (result) => {
      knowledgeToast.articleArchived(result.title, result.status === "ARCHIVED");
      utils.knowledge.listArticles.invalidate();
    },
    onError: showError,
  });

  // Delete article mutation
  const deleteMutation = trpc.knowledge.deleteArticle.useMutation({
    onSuccess: () => {
      knowledgeToast.articleDeleted();
      utils.knowledge.listArticles.invalidate();
    },
    onError: showError,
  });

  // Archive handler
  const archiveArticle = useCallback(
    async (articleId: string, archive: boolean) => {
      await archiveMutation.mutateAsync({
        workspaceSlug,
        articleId,
        archive,
      });
    },
    [archiveMutation, workspaceSlug]
  );

  // Delete handler
  const deleteArticle = useCallback(
    async (articleId: string) => {
      await deleteMutation.mutateAsync({
        workspaceSlug,
        articleId,
      });
    },
    [deleteMutation, workspaceSlug]
  );

  // Groups data is returned as flat array
  const groups = Array.isArray(groupsData) ? groupsData : [];

  return {
    groups,
    articles: articlesData?.items ?? [],
    hasMore: !!articlesData?.nextCursor,
    isLoading: isLoadingGroups || isLoadingArticles,
    error: groupsError || articlesError,
    archiveArticle,
    deleteArticle,
    isArchiving: archiveMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

interface UseArticleDetailOptions {
  workspaceSlug: string;
  articleId: string;
}

export function useArticleDetail({
  workspaceSlug,
  articleId,
}: UseArticleDetailOptions) {
  const utils = trpc.useUtils();

  // Fetch article
  const {
    data: articleData,
    isLoading: isLoadingArticle,
    error: articleError,
  } = trpc.knowledge.getArticle.useQuery(
    { workspaceSlug, articleId },
    { enabled: !!workspaceSlug && !!articleId }
  );

  // Fetch versions
  const {
    data: versionsData,
    isLoading: isLoadingVersions,
    error: versionsError,
  } = trpc.knowledge.listVersions.useQuery(
    { workspaceSlug, articleId },
    { enabled: !!workspaceSlug && !!articleId }
  );

  // Update article mutation
  const updateMutation = trpc.knowledge.updateArticle.useMutation({
    onSuccess: (result) => {
      knowledgeToast.articleUpdated(result.title);
      utils.knowledge.getArticle.invalidate({ workspaceSlug, articleId });
      utils.knowledge.listArticles.invalidate();
      utils.knowledge.listVersions.invalidate({ workspaceSlug, articleId });
    },
    onError: showError,
  });

  // Publish article mutation
  const publishMutation = trpc.knowledge.publishArticle.useMutation({
    onSuccess: (result) => {
      knowledgeToast.articlePublished(result.title);
      utils.knowledge.getArticle.invalidate({ workspaceSlug, articleId });
      utils.knowledge.listArticles.invalidate();
    },
    onError: showError,
  });

  // Revert to version mutation
  const revertMutation = trpc.knowledge.revertToVersion.useMutation({
    onSuccess: () => {
      knowledgeToast.articleReverted();
      utils.knowledge.getArticle.invalidate({ workspaceSlug, articleId });
      utils.knowledge.listVersions.invalidate({ workspaceSlug, articleId });
      utils.knowledge.listArticles.invalidate();
    },
    onError: showError,
  });

  // Update handler
  const updateArticle = useCallback(
    async (data: {
      title?: string;
      summary?: string;
      content?: string;
      tags?: string[];
    }) => {
      await updateMutation.mutateAsync({
        workspaceSlug,
        articleId,
        ...data,
      });
    },
    [updateMutation, workspaceSlug, articleId]
  );

  // Publish handler
  const publishArticle = useCallback(async () => {
    await publishMutation.mutateAsync({
      workspaceSlug,
      articleId,
    });
  }, [publishMutation, workspaceSlug, articleId]);

  // Revert handler
  const revertToVersion = useCallback(
    async (version: number) => {
      await revertMutation.mutateAsync({
        workspaceSlug,
        articleId,
        version,
      });
    },
    [revertMutation, workspaceSlug, articleId]
  );

  return {
    article: articleData ?? null,
    versions: versionsData?.items ?? [],
    isLoading: isLoadingArticle || isLoadingVersions,
    error: articleError || versionsError,
    updateArticle,
    publishArticle,
    revertToVersion,
    isUpdating: updateMutation.isPending,
    isPublishing: publishMutation.isPending,
    isReverting: revertMutation.isPending,
  };
}
