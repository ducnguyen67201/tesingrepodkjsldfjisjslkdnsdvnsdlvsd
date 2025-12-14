/**
 * Hook for triggering manual eval runs
 */

import { useCallback } from "react";
import { trpc } from "@/lib/trpc/client";
import { showError } from "@/lib/errors";
import { showSuccess, showInfo } from "@/lib/success";

interface UseTriggerEvalOptions {
  workspaceSlug: string;
  onSuccess?: (workflowId: string) => void;
}

export function useTriggerEval({ workspaceSlug, onSuccess }: UseTriggerEvalOptions) {
  const utils = trpc.useUtils();

  const triggerRun = trpc.evals.triggerRun.useMutation({
    onSuccess: (result) => {
      if (result.status === "started") {
        showSuccess("Eval started", result.message);
        onSuccess?.(result.workflowId);
      } else if (result.status === "already_running") {
        showInfo("Already running", result.message);
      }
    },
    onError: showError,
  });

  const updateBaseline = trpc.evals.updateBaseline.useMutation({
    onSuccess: () => {
      showSuccess("Baseline updated", "The baseline has been set from this run.");
    },
    onError: showError,
  });

  const handleTrigger = useCallback(
    async (suiteId: string) => {
      const result = await triggerRun.mutateAsync({ workspaceSlug, suiteId });
      // Invalidate runs list after triggering
      if (result.status === "started") {
        utils.evals.listRuns.invalidate({ workspaceSlug, suiteId });
        utils.evals.listSuites.invalidate({ workspaceSlug });
      }
      return result;
    },
    [triggerRun, workspaceSlug, utils]
  );

  const handleUpdateBaseline = useCallback(
    async (runId: string) => {
      const result = await updateBaseline.mutateAsync({ workspaceSlug, runId });
      // Invalidate suite to refresh baseline values
      utils.evals.listSuites.invalidate({ workspaceSlug });
      return result;
    },
    [updateBaseline, workspaceSlug, utils]
  );

  return {
    triggerRun: handleTrigger,
    updateBaseline: handleUpdateBaseline,
    isTriggering: triggerRun.isPending,
    isUpdatingBaseline: updateBaseline.isPending,
  };
}
