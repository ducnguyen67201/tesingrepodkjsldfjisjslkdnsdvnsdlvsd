"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { Loader2, AlertCircle, Search, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { trpc } from "@/lib/trpc/client";
import Link from "next/link";

/**
 * RCA Lookup Page
 *
 * This page handles the URL pattern:
 * /workspace/{slug}/projects/{projectId}/alerts/{alertId}/rca?historyId={alertHistoryId}
 *
 * It checks the RCA status for the given history entry and either:
 * - Shows the RCA if completed (redirects to /rca/{rcaId})
 * - Shows a loading state if RCA is in progress
 * - Triggers RCA if not started and shows progress
 */
export default function RCALookupPage() {
  const params = useParams<{
    workspaceSlug: string;
    projectId: string;
    alertId: string;
  }>();
  const searchParams = useSearchParams();
  const router = useRouter();

  const { workspaceSlug, projectId, alertId } = params;
  const historyId = searchParams.get("historyId");

  const [pollCount, setPollCount] = useState(0);

  // Get RCA status
  const {
    data: status,
    isLoading,
    error,
    refetch,
  } = trpc.alerts.getRCAStatus.useQuery(
    { workspaceSlug, alertHistoryId: historyId ?? "" },
    {
      enabled: !!workspaceSlug && !!historyId,
      refetchInterval: (query) => {
        // Poll every 3 seconds while running
        if (query.state.data?.status === "running") {
          return 3000;
        }
        return false;
      },
    }
  );

  // Trigger RCA mutation
  const triggerRCA = trpc.alerts.triggerRCA.useMutation({
    onSuccess: () => {
      // Start polling
      refetch();
    },
  });

  // Auto-trigger RCA if not started
  // Note: Only include triggerRCA.mutate (stable ref) to avoid infinite re-renders
  useEffect(() => {
    if (status?.status === "not_started" && historyId && !triggerRCA.isPending) {
      triggerRCA.mutate({ workspaceSlug, alertHistoryId: historyId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- triggerRCA object changes each render, using stable .mutate ref
  }, [status?.status, historyId, workspaceSlug, triggerRCA.mutate, triggerRCA.isPending]);

  // Redirect to RCA page when completed
  useEffect(() => {
    if (status?.status === "completed" && status.rcaId) {
      router.replace(
        `/workspace/${workspaceSlug}/projects/${projectId}/alerts/${alertId}/rca/${status.rcaId}`
      );
    }
  }, [status, workspaceSlug, projectId, alertId, router]);

  // Track poll count for progress animation
  useEffect(() => {
    if (status?.status === "running") {
      const interval = setInterval(() => {
        setPollCount((c) => c + 1);
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [status?.status]);

  const handleRetrigger = useCallback(() => {
    if (historyId) {
      triggerRCA.mutate({ workspaceSlug, alertHistoryId: historyId });
    }
  }, [historyId, workspaceSlug, triggerRCA]);

  // No historyId provided
  if (!historyId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-4">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-lg font-semibold mb-2">Missing History ID</h2>
        <p className="text-muted-foreground mb-4 text-center">
          No alert history ID was provided. Please use the link from your notification.
        </p>
        <Button asChild variant="outline">
          <Link href={`/workspace/${workspaceSlug}/projects/${projectId}?alertPanel=open&alertTab=history`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Alert History
          </Link>
        </Button>
      </div>
    );
  }

  // Loading initial status
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-4">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-4" />
        <p className="text-muted-foreground">Loading RCA status...</p>
      </div>
    );
  }

  // Error fetching status
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-4">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-lg font-semibold mb-2">Error Loading RCA</h2>
        <p className="text-muted-foreground mb-4">{error.message}</p>
        <Button asChild variant="outline">
          <Link href={`/workspace/${workspaceSlug}/projects/${projectId}?alertPanel=open&alertTab=history`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Alert History
          </Link>
        </Button>
      </div>
    );
  }

  // RCA is running or being triggered
  if (
    status?.status === "running" ||
    status?.status === "not_started" ||
    triggerRCA.isPending
  ) {
    // Calculate animated progress (cycles through 0-90% while analyzing)
    const animatedProgress = Math.min(90, (pollCount % 30) * 3);

    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 rounded-full bg-primary/10 p-4">
              <Search className="h-8 w-8 text-primary animate-pulse" />
            </div>
            <CardTitle>Analyzing Root Cause</CardTitle>
            <CardDescription>
              AI is analyzing traces, code changes, and system patterns to identify the root cause.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress value={animatedProgress} className="h-2" />
            <div className="text-center text-sm text-muted-foreground">
              <p>This typically takes 30-60 seconds...</p>
              {pollCount > 10 && (
                <p className="mt-2">Still analyzing... complex incidents may take longer.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // RCA failed
  if (status?.status === "failed") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 rounded-full bg-destructive/10 p-4">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <CardTitle>RCA Analysis Failed</CardTitle>
            <CardDescription>
              The root cause analysis could not be completed. This may be due to insufficient data or a system error.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2 justify-center">
              <Button onClick={handleRetrigger} disabled={triggerRCA.isPending}>
                {triggerRCA.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Retry Analysis
              </Button>
              <Button asChild variant="outline">
                <Link href={`/workspace/${workspaceSlug}/projects/${projectId}?alertPanel=open&alertTab=history`}>
                  Back to History
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Fallback (shouldn't reach here normally)
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-4">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}
