"use client";

import {
  FlaskConical,
  BarChart3,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useExperimentDetail } from "@/hooks/use-prompt-experiments";
import { getStatusColor, getStatusLabel } from "./experiments-constants";
import { AnalysisResultsSection } from "./analysis-results-section";

export interface ExperimentDetailPanelProps {
  workspaceSlug: string;
  experimentId: string;
}

export function ExperimentDetailPanel({
  workspaceSlug,
  experimentId,
}: ExperimentDetailPanelProps) {
  const { experiment, analytics, isLoading, isLoadingAnalytics } =
    useExperimentDetail({
      workspaceSlug,
      experimentId,
    });

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-6 w-32" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
    );
  }

  if (!experiment) {
    return (
      <div className="flex-1 flex items-center justify-center text-center p-8">
        <div>
          <FlaskConical className="h-12 w-12 text-muted-foreground/30 mx-auto" />
          <p className="mt-4 text-sm text-muted-foreground">
            Experiment not found
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Row 1: Header */}
      <div className="flex items-center justify-between h-[72px] px-4 border-b bg-background">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">{experiment.name}</h2>
            <Badge
              className={`text-[10px] px-1.5 py-0 ${getStatusColor(experiment.status)}`}
            >
              {getStatusLabel(experiment.status)}
            </Badge>
          </div>
          <code className="text-xs text-muted-foreground mt-1 block">
            {experiment.slug}
          </code>
        </div>
      </div>

      {/* Row 2: Variant Summary */}
      <div className="h-[52px] px-4 border-b bg-background flex items-center gap-4">
        {experiment.variants.map((v) => (
          <div key={v.id} className="flex items-center gap-2">
            <Badge
              variant={v.isControl ? "secondary" : "outline"}
              className="text-xs"
            >
              Variant {v.name}
              {v.isControl && " (Control)"}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {v.weight / 100}%
            </span>
          </div>
        ))}
      </div>

      {/* Row 3: Description */}
      <div className="flex items-center h-[36px] px-4 border-b bg-muted/30">
        {experiment.description ? (
          <p className="text-xs text-muted-foreground truncate">
            {experiment.description}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground/50">No description</p>
        )}
      </div>

      {/* Content: Analytics */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Variant Details */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <FlaskConical className="h-4 w-4" />
              Variants
            </h3>
            {experiment.variants.map((v) => (
              <div
                key={v.id}
                className="rounded-lg border bg-background p-3 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={v.isControl ? "secondary" : "outline"}
                      className="text-xs"
                    >
                      {v.name}
                    </Badge>
                    {v.isControl && (
                      <span className="text-[10px] text-muted-foreground">
                        Control
                      </span>
                    )}
                  </div>
                  <span className="text-sm font-medium">{v.weight / 100}%</span>
                </div>
                {v.promptVersion && (
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium">
                      {v.promptVersion.prompt?.name ?? "Unknown Prompt"}
                    </span>
                    <span className="mx-1">v{v.promptVersion.version}</span>
                    <code className="text-[10px]">
                      ({v.promptVersion.prompt?.slug ?? "unknown"})
                    </code>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Analytics */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Analytics
            </h3>
            <div className="rounded-lg border bg-background p-6 text-center">
              {isLoadingAnalytics ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24 mx-auto" />
                  <Skeleton className="h-20 w-full" />
                </div>
              ) : analytics && analytics.totalUsage > 0 ? (
                <div className="space-y-4">
                  <p className="text-2xl font-bold">{analytics.totalUsage}</p>
                  <p className="text-xs text-muted-foreground">Total requests</p>
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    {analytics.byVariant.map((v) => (
                      <div key={v.variantId} className="text-left">
                        <div className="flex items-center gap-1 mb-1">
                          <Badge variant="outline" className="text-[10px]">
                            {v.variantName}
                          </Badge>
                        </div>
                        <p className="text-sm font-medium">{v.usageCount}</p>
                        <p className="text-[10px] text-muted-foreground">
                          requests
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  <BarChart3 className="h-8 w-8 text-muted-foreground/30 mx-auto" />
                  <p className="mt-3 text-sm text-muted-foreground">
                    No data yet
                  </p>
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    Analytics will appear once the experiment receives traffic
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* LLM Analysis Results */}
          {experiment.analysisStatus && (
            <AnalysisResultsSection
              status={experiment.analysisStatus}
              error={experiment.analysisError}
              result={experiment.analysisResult}
              winnerVariantId={experiment.winnerVariantId}
              winnerConfidence={experiment.winnerConfidence}
              variants={experiment.variants}
            />
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
