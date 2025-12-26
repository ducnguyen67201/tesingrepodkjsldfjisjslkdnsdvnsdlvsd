"use client";

import { useState, useCallback } from "react";
import { LayoutDashboard, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useProjectSummaries } from "@/hooks/use-dashboards";
import { ProjectSummaryCard } from "./project-summary-card";
import { TimeRangeFilter } from "./time-range-filter";
import type { DashboardTimeRange } from "@cognobserve/api/schemas";

// ============================================================
// Props
// ============================================================

interface WorkspaceOverviewProps {
  workspaceSlug: string;
}

// ============================================================
// Component
// ============================================================

export function WorkspaceOverview({ workspaceSlug }: WorkspaceOverviewProps) {
  const [timeRange, setTimeRange] = useState<DashboardTimeRange>("24h");

  const { summaries, isLoading, refetch } = useProjectSummaries(
    workspaceSlug,
    timeRange
  );

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleTimeRangeChange = useCallback((value: DashboardTimeRange) => {
    setTimeRange(value);
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <LayoutDashboard className="h-5 w-5" />
          <h2 className="text-xl font-semibold">Workspace Overview</h2>
        </div>
        <div className="flex items-center gap-2">
          <TimeRangeFilter value={timeRange} onChange={handleTimeRangeChange} />
          <Button
            variant="outline"
            size="icon"
            onClick={handleRefresh}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <LoadingSkeleton />
      ) : summaries.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {summaries.map((summary) => (
            <ProjectSummaryCard
              key={summary.projectId}
              summary={summary}
              workspaceSlug={workspaceSlug}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Loading Skeleton
// ============================================================

function LoadingSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-[160px]" />
      ))}
    </div>
  );
}

// ============================================================
// Empty State
// ============================================================

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12">
      <LayoutDashboard className="mb-4 h-12 w-12 text-muted-foreground" />
      <h3 className="mb-2 text-lg font-medium">No Projects Yet</h3>
      <p className="text-center text-sm text-muted-foreground">
        Create a project to start monitoring your AI applications.
      </p>
    </div>
  );
}
