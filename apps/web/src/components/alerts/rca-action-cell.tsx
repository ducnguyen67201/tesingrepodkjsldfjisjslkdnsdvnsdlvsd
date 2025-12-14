"use client";

/**
 * RCA Action Cell
 *
 * Displays the RCA status and trigger button for an alert history entry.
 * States: Analyze → Analyzing → RCA Available → Retry (on failure)
 */

import Link from "next/link";
import { Loader2, Search, CheckCircle, XCircle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTriggerRCA } from "@/hooks/use-trigger-rca";

interface RCAActionCellProps {
  alertHistoryId: string;
  alertId: string;
  workspaceSlug: string;
  projectId: string;
}

export function RCAActionCell({
  alertHistoryId,
  alertId,
  workspaceSlug,
  projectId,
}: RCAActionCellProps) {
  const { status, rcaId, trigger, retry, isLoading } = useTriggerRCA({
    workspaceSlug,
    alertHistoryId,
  });

  const handleAnalyze = () => trigger();
  const handleRetry = () => retry();

  switch (status) {
    case "completed":
      return (
        <Link
          href={`/workspace/${encodeURIComponent(workspaceSlug)}/projects/${encodeURIComponent(projectId)}/alerts/${encodeURIComponent(alertId)}/rca/${encodeURIComponent(rcaId ?? "")}`}
        >
          <Badge variant="secondary" className="cursor-pointer hover:bg-secondary/80">
            <CheckCircle className="h-3 w-3 mr-1 text-green-500" />
            RCA Available
            <ExternalLink className="h-3 w-3 ml-1" />
          </Badge>
        </Link>
      );

    case "running":
    case "triggering":
      return (
        <Badge variant="outline" className="text-muted-foreground">
          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          Analyzing...
        </Badge>
      );

    case "failed":
      return (
        <Button
          size="sm"
          variant="outline"
          onClick={handleRetry}
          disabled={isLoading}
          className="text-destructive"
        >
          <XCircle className="h-3 w-3 mr-1" />
          Retry
        </Button>
      );

    case "idle":
    default:
      return (
        <Button
          size="sm"
          variant="outline"
          onClick={handleAnalyze}
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          ) : (
            <Search className="h-3 w-3 mr-1" />
          )}
          Analyze
        </Button>
      );
  }
}
