/**
 * RCA Detail Hook
 *
 * Data fetching hooks for RCA detail page.
 */

import { trpc } from "@/lib/trpc/client";
import { rcaToast } from "@/lib/success";
import { showError } from "@/lib/errors";

interface UseRCADetailParams {
  workspaceSlug: string;
  rcaId: string;
}

/**
 * Fetch RCA detail with all related data
 */
export function useRCADetail({ workspaceSlug, rcaId }: UseRCADetailParams) {
  return trpc.alerts.getRCADetail.useQuery(
    { workspaceSlug, rcaId },
    {
      staleTime: 30_000, // 30 seconds
      retry: false,
    }
  );
}

/**
 * Submit RCA feedback mutation
 */
export function useSubmitRCAFeedback(workspaceSlug: string) {
  const utils = trpc.useUtils();

  return trpc.alerts.submitRCAFeedback.useMutation({
    onSuccess: (_data, variables) => {
      rcaToast.feedbackSubmitted();
      utils.alerts.getRCADetail.invalidate({
        workspaceSlug,
        rcaId: variables.rcaId,
      });
    },
    onError: showError,
  });
}

/**
 * Generate fix prompt query
 */
export function useGenerateFixPrompt({
  workspaceSlug,
  rcaId,
  enabled = false,
}: UseRCADetailParams & { enabled?: boolean }) {
  return trpc.alerts.generateFixPrompt.useQuery(
    { workspaceSlug, rcaId },
    {
      enabled,
      staleTime: 60_000, // 1 minute
    }
  );
}
