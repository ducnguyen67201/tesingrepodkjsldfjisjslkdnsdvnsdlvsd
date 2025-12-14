"use client";

import Link from "next/link";
import { ArrowLeft, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RCACopyFixPrompt } from "./rca-copy-fix-prompt";
import type { LLMRCAOutput } from "@cognobserve/api/schemas";

interface RCAHeaderProps {
  alert: {
    id: string;
    name: string;
    type: string;
    threshold: number;
    operator: string;
    severity: string;
  };
  project: {
    id: string;
    name: string;
  };
  alertHistory: {
    id: string;
    value: number;
    state: string | null;
    triggeredAt: Date;
  } | null;
  rca: {
    id: string;
    triggeredAt: Date;
    confidence: number | null;
    analysis: LLMRCAOutput;
  };
  workspaceSlug: string;
  projectId: string;
  alertId: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  HIGH: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  MEDIUM: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  LOW: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
};

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(date));
}

export function RCAHeader({
  alert,
  project,
  rca,
  workspaceSlug,
  projectId,
  alertId,
}: RCAHeaderProps) {
  const severityColor = SEVERITY_COLORS[alert.severity] ?? SEVERITY_COLORS.MEDIUM;

  return (
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
      {/* Left side - breadcrumb and back button */}
      <div className="space-y-2">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href={`/workspace/${workspaceSlug}/projects/${projectId}/alerts/${alertId}`}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Alert
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{alert.name}</h1>
          <div className="flex items-center gap-3 mt-1 text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {formatDateTime(rca.triggeredAt)}
            </span>
            <span className="text-sm">{project.name}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={severityColor}>{alert.severity}</Badge>
          {rca.confidence !== null && (
            <Badge variant="outline">
              {Math.round(rca.confidence * 100)}% Confidence
            </Badge>
          )}
        </div>
      </div>

      {/* Right side - actions */}
      <div className="flex items-center gap-2">
        <RCACopyFixPrompt workspaceSlug={workspaceSlug} rcaId={rca.id} />
      </div>
    </div>
  );
}
