"use client";

/**
 * Manual RCA Trigger Hook
 *
 * Manages the state for triggering RCA and polling for completion.
 * Uses conditional polling pattern from repositories-page.tsx.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc/client";
import { alertToast } from "@/lib/success";
import { alertError, showError } from "@/lib/errors";

type RCAStatus = "idle" | "triggering" | "running" | "completed" | "failed";

const POLLING_INTERVAL_MS = 3000;

interface UseTriggerRCAParams {
  workspaceSlug: string;
  alertHistoryId: string;
  onCompleted?: (rcaId: string) => void;
}

interface UseTriggerRCAReturn {
  status: RCAStatus;
  rcaId: string | null;
  error: Error | null;
  trigger: () => void;
  retry: () => void;
  isLoading: boolean;
  isCompleted: boolean;
  isFailed: boolean;
}

export function useTriggerRCA({
  workspaceSlug,
  alertHistoryId,
  onCompleted,
}: UseTriggerRCAParams): UseTriggerRCAReturn {
  const [status, setStatus] = useState<RCAStatus>("idle");
  const [rcaId, setRcaId] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);

  // Track if user triggered the RCA - only show toasts for user-initiated actions
  const userTriggeredRef = useRef(false);

  const utils = trpc.useUtils();
  const shouldPoll = status === "running";

  // Polling query (enabled only when running)
  const statusQuery = trpc.alerts.getRCAStatus.useQuery(
    { workspaceSlug, alertHistoryId },
    {
      enabled: shouldPoll,
      refetchInterval: shouldPoll ? POLLING_INTERVAL_MS : false,
    }
  );

  // Watch polling results - only show toasts for user-triggered actions
  useEffect(() => {
    if (!statusQuery.data || !userTriggeredRef.current) return;

    const queryStatus = statusQuery.data.status;

    if (queryStatus === "completed" && statusQuery.data.rcaId) {
      setStatus("completed");
      setRcaId(statusQuery.data.rcaId);
      alertToast.rcaCompleted(statusQuery.data.confidence ?? undefined);
      onCompleted?.(statusQuery.data.rcaId);
      userTriggeredRef.current = false; // Reset after completion
    } else if (queryStatus === "failed") {
      setStatus("failed");
      alertError.rcaFailed();
      userTriggeredRef.current = false; // Reset after failure
    }
  }, [statusQuery.data, onCompleted]);

  // Trigger mutation
  const triggerMutation = trpc.alerts.triggerRCA.useMutation({
    onSuccess: (data) => {
      if (data.status === "existing" && data.rcaId) {
        setStatus("completed");
        setRcaId(data.rcaId);
        alertToast.rcaExists();
        onCompleted?.(data.rcaId);
      } else if (data.status === "started" || data.status === "queued") {
        setStatus("running");
        alertToast.rcaStarted();
      }
    },
    onError: (err) => {
      setStatus("failed");
      setError(new Error(err.message));
      showError(err);
    },
  });

  // Initial status check on mount - silently set status without toasts
  useEffect(() => {
    const checkInitialStatus = async () => {
      try {
        const data = await utils.alerts.getRCAStatus.fetch({
          workspaceSlug,
          alertHistoryId,
        });

        if (data.status === "completed" && data.rcaId) {
          setStatus("completed");
          setRcaId(data.rcaId);
          // Don't show toast for existing RCA on mount
        } else if (data.status === "running") {
          // Resume polling for in-progress workflow, but don't show completion toast
          // since user didn't trigger it in this session
          setStatus("running");
        }
      } catch {
        // Ignore fetch errors on mount
      }
    };

    checkInitialStatus();
  }, [alertHistoryId, workspaceSlug, utils.alerts.getRCAStatus]);

  const trigger = useCallback(() => {
    userTriggeredRef.current = true; // Mark as user-triggered for toast display
    setStatus("triggering");
    setError(null);
    triggerMutation.mutate({ workspaceSlug, alertHistoryId });
  }, [workspaceSlug, alertHistoryId, triggerMutation]);

  const retry = useCallback(() => {
    setStatus("idle");
    setError(null);
    trigger();
  }, [trigger]);

  return {
    status,
    rcaId,
    error,
    trigger,
    retry,
    isLoading: status === "triggering" || status === "running",
    isCompleted: status === "completed",
    isFailed: status === "failed",
  };
}
