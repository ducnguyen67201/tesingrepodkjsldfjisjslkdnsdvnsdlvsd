"use client";

import { memo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, FolderKanban } from "lucide-react";
import {
  LineChart,
  Line,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useProjectSummaries, useProjectSparklines } from "@/hooks/use-dashboards";
import { formatNumber, formatLatency } from "@/lib/format";
import type { DashboardTimeRange } from "@ducsigr/api/schemas";

// ============================================================
// Constants
// ============================================================

const SKELETON_CARD_COUNT = 3;

// ============================================================
// Props
// ============================================================

interface ProjectCardsGridProps {
  workspaceSlug: string;
  timeRange: DashboardTimeRange;
}

// ============================================================
// Component
// ============================================================

export const ProjectCardsGrid = memo(function ProjectCardsGrid({
  workspaceSlug,
  timeRange,
}: ProjectCardsGridProps) {
  const router = useRouter();
  const { summaries, isLoading } = useProjectSummaries(workspaceSlug, timeRange);
  const { sparklines, isLoading: isLoadingSparklines } = useProjectSparklines(workspaceSlug, timeRange);

  const handleCreateProject = useCallback(() => {
    router.push(`/workspace/${workspaceSlug}/settings?tab=projects`);
  }, [router, workspaceSlug]);

  const handleProjectClick = useCallback(
    (projectId: string) => () => {
      router.push(`/workspace/${workspaceSlug}/projects/${projectId}`);
    },
    [router, workspaceSlug]
  );

  if (isLoading || isLoadingSparklines) {
    return <ProjectGridSkeleton />;
  }

  if (summaries.length === 0) {
    return <EmptyProjectsState onCreate={handleCreateProject} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Projects</h2>
        <Button variant="outline" size="sm" onClick={handleCreateProject}>
          <Plus className="mr-2 h-4 w-4" />
          New Project
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {summaries.map((summary) => (
          <ProjectCard
            key={summary.projectId}
            projectId={summary.projectId}
            projectName={summary.projectName}
            traceCount={summary.traceCount}
            errorRate={summary.errorRate}
            p95Latency={summary.p95Latency}
            sparklineData={sparklines[summary.projectId] ?? []}
            onClick={handleProjectClick(summary.projectId)}
          />
        ))}
      </div>
    </div>
  );
});

// ============================================================
// ProjectCard Component
// ============================================================

interface ProjectCardProps {
  projectId: string;
  projectName: string;
  traceCount: number;
  errorRate: number;
  p95Latency: number;
  sparklineData: Array<{ time: string; value: number }>;
  onClick: () => void;
}

const ProjectCard = memo(function ProjectCard({
  projectName,
  traceCount,
  errorRate,
  p95Latency,
  sparklineData,
  onClick,
}: ProjectCardProps) {
  const getErrorRateColor = (): string => {
    if (errorRate === 0) return "text-emerald-600 dark:text-emerald-400";
    if (errorRate < 5) return "text-amber-600 dark:text-amber-400";
    return "text-destructive";
  };

  return (
    <Card
      className="cursor-pointer transition-all hover:shadow-md hover:border-primary/50"
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <FolderKanban className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">{projectName}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Sparkline */}
        <div className="h-[120px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sparklineData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
              <Line
                type="monotone"
                dataKey="value"
                className="stroke-primary"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Metrics Row */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-xs text-muted-foreground">Traces</p>
            <p className="text-sm font-semibold">{formatNumber(traceCount)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Error Rate</p>
            <p className={`text-sm font-semibold ${getErrorRateColor()}`}>
              {errorRate.toFixed(1)}%
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">P95</p>
            <p className="text-sm font-semibold">{formatLatency(p95Latency)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
});

// ============================================================
// Empty State
// ============================================================

interface EmptyProjectsStateProps {
  onCreate: () => void;
}

function EmptyProjectsState({ onCreate }: EmptyProjectsStateProps) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Projects</h2>
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-8">
          <FolderKanban className="mb-4 h-10 w-10 text-muted-foreground" />
          <h3 className="mb-2 text-lg font-medium">No Projects Yet</h3>
          <p className="mb-4 text-center text-sm text-muted-foreground">
            Create your first project to start monitoring AI applications.
          </p>
          <Button onClick={onCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Create Project
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// Skeleton
// ============================================================

function ProjectGridSkeleton() {
  const renderSkeletonCard = (index: number) => (
    <Card key={`project-skeleton-${index}`}>
      <CardHeader className="pb-2">
        <Skeleton className="h-5 w-32" />
      </CardHeader>
      <CardContent className="space-y-3">
        <Skeleton className="h-[40px] w-full" />
        <div className="grid grid-cols-3 gap-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: SKELETON_CARD_COUNT }).map((_, i) => renderSkeletonCard(i))}
      </div>
    </div>
  );
}


