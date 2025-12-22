"use client";

import { useCallback, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { knowledgeToast } from "@/lib/success";
import { showError } from "@/lib/errors";
import type { KnowledgeRuleScope } from "@cognobserve/api/schemas";

interface UseKnowledgeRulesOptions {
  workspaceSlug: string;
  projectId?: string;
  enabled?: boolean;
}

export function useKnowledgeRules({
  workspaceSlug,
  projectId,
  enabled = true,
}: UseKnowledgeRulesOptions) {
  const utils = trpc.useUtils();

  // Fetch rules
  const {
    data: rulesData,
    isLoading,
    error,
  } = trpc.knowledge.listRules.useQuery(
    { workspaceSlug, projectId, enabled },
    { enabled: !!workspaceSlug }
  );

  // Upsert rule mutation
  const upsertMutation = trpc.knowledge.upsertRule.useMutation({
    onSuccess: (result, variables) => {
      if (variables.ruleId) {
        knowledgeToast.ruleUpdated(result.name);
      } else {
        knowledgeToast.ruleCreated(result.name);
      }
      utils.knowledge.listRules.invalidate();
    },
    onError: showError,
  });

  // Delete rule mutation
  const deleteMutation = trpc.knowledge.deleteRule.useMutation({
    onSuccess: () => {
      knowledgeToast.ruleDeleted();
      utils.knowledge.listRules.invalidate();
    },
    onError: showError,
  });

  // Create handler
  const createRule = useCallback(
    async (data: {
      name: string;
      description?: string;
      enabled: boolean;
      priority: number;
      scope: KnowledgeRuleScope;
      projectId?: string;
      condition: Record<string, unknown>;
      articleId?: string;
      groupId?: string;
      matchReasonTemplate?: string;
    }) => {
      await upsertMutation.mutateAsync({
        workspaceSlug,
        ...data,
      });
    },
    [upsertMutation, workspaceSlug]
  );

  // Update handler - requires name and condition like upsert mutation
  const updateRule = useCallback(
    async (
      ruleId: string,
      data: {
        name: string;
        condition: Record<string, unknown>;
        description?: string;
        enabled?: boolean;
        priority?: number;
        scope?: KnowledgeRuleScope;
        projectId?: string;
        articleId?: string;
        groupId?: string;
        matchReasonTemplate?: string;
      }
    ) => {
      await upsertMutation.mutateAsync({
        workspaceSlug,
        ruleId,
        ...data,
      });
    },
    [upsertMutation, workspaceSlug]
  );

  // Delete handler
  const deleteRule = useCallback(
    async (ruleId: string) => {
      await deleteMutation.mutateAsync({
        workspaceSlug,
        ruleId,
      });
    },
    [deleteMutation, workspaceSlug]
  );

  return {
    rules: rulesData ?? [],
    isLoading,
    error,
    createRule,
    updateRule,
    deleteRule,
    isCreating: upsertMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

interface UseRulePreviewOptions {
  workspaceSlug: string;
}

export function useRulePreview({ workspaceSlug }: UseRulePreviewOptions) {
  const utils = trpc.useUtils();
  const [isLoading, setIsLoading] = useState(false);

  // Preview handler - uses direct fetch for on-demand preview
  const previewRule = useCallback(
    async (condition: Record<string, unknown>, projectId?: string) => {
      setIsLoading(true);
      try {
        const result = await utils.knowledge.previewRule.fetch({
          workspaceSlug,
          projectId,
          condition,
          limit: 10,
        });
        return result;
      } finally {
        setIsLoading(false);
      }
    },
    [utils.knowledge.previewRule, workspaceSlug]
  );

  return {
    previewRule,
    isLoading,
  };
}
