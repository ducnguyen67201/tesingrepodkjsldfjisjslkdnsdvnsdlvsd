"use client";

import { useRCADetail } from "@/hooks/use-rca-detail";
import { RCAHeader } from "./rca-header";
import { RCAHypothesisCard } from "./rca-hypothesis-card";
import { RCAEvidenceCard } from "./rca-evidence-card";
import { RCARelatedChangesCard } from "./rca-related-changes";
import { RCARemediationCard } from "./rca-remediation-card";
import { RCATracesCard } from "./rca-traces-card";
import { RCAFeedbackCard } from "./rca-feedback-card";
import { RCADetailSkeleton } from "./rca-detail-skeleton";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface RCADetailPageProps {
  workspaceSlug: string;
  projectId: string;
  alertId: string;
  rcaId: string;
}

export function RCADetailPage({
  workspaceSlug,
  projectId,
  alertId,
  rcaId,
}: RCADetailPageProps) {
  const { data, isLoading, error } = useRCADetail({
    workspaceSlug,
    rcaId,
  });

  if (isLoading) {
    return <RCADetailSkeleton />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center p-4">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-lg font-semibold mb-2">Failed to load RCA</h2>
        <p className="text-muted-foreground mb-4">{error.message}</p>
        <Button asChild variant="outline">
          <Link href={`/workspace/${workspaceSlug}/projects/${projectId}/alerts/${alertId}`}>
            Back to Alert
          </Link>
        </Button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center p-4">
        <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-lg font-semibold mb-2">RCA Not Found</h2>
        <p className="text-muted-foreground mb-4">
          This root cause analysis doesn&apos;t exist or has been deleted.
        </p>
        <Button asChild variant="outline">
          <Link href={`/workspace/${workspaceSlug}/projects/${projectId}/alerts/${alertId}`}>
            Back to Alert
          </Link>
        </Button>
      </div>
    );
  }

  const { rca, alert, project, alertHistory, commits, pullRequests, traces, githubRepo } = data;

  return (
    <div className="space-y-6 p-4">
      {/* Header with back navigation */}
      <RCAHeader
        alert={alert}
        project={project}
        alertHistory={alertHistory}
        rca={rca}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        alertId={alertId}
      />

      {/* Main content - single column to work with sidebar */}
      <div className="space-y-6">
        <RCAHypothesisCard analysis={rca.analysis} confidence={rca.confidence} />

        {/* Two-column grid for related changes and evidence */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <RCAEvidenceCard analysis={rca.analysis} alertHistory={alertHistory} />
          <RCARelatedChangesCard
            changes={rca.analysis.relatedChanges}
            commits={commits}
            pullRequests={pullRequests}
            githubRepo={githubRepo}
          />
        </div>

        <RCARemediationCard remediation={rca.analysis.remediation} />

        {/* Traces section */}
        {traces.length > 0 && (
          <RCATracesCard
            traces={traces}
            workspaceSlug={workspaceSlug}
            projectId={projectId}
          />
        )}

        {/* Feedback section */}
        <RCAFeedbackCard
          rcaId={rca.id}
          workspaceSlug={workspaceSlug}
          currentHelpful={rca.helpful}
          currentFeedback={rca.feedback}
        />
      </div>
    </div>
  );
}
