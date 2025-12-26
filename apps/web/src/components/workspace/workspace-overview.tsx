"use client";

import { useState, useCallback } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkspaceOverview } from "@/hooks/use-workspace-overview";
import { TimeRangeFilter } from "@/components/dashboard/time-range-filter";
import { WorkspaceStatsRow } from "./workspace-stats-row";
import { ProjectCardsGrid } from "./project-cards-grid";
import { RecentActivityFeed } from "./recent-activity-feed";
import type { DashboardTimeRange } from "@cognobserve/api/schemas";

// ============================================================
// Props
// ============================================================

interface WorkspaceOverviewProps {
  workspaceSlug: string;
  workspaceName?: string;
}

// ============================================================
// Component
// ============================================================

export function WorkspaceOverview({
  workspaceSlug,
  workspaceName,
}: WorkspaceOverviewProps) {
  const [timeRange, setTimeRange] = useState<DashboardTimeRange>("24h");

  const {
    stats,
    activities,
    isLoading,
    refetch,
  } = useWorkspaceOverview(workspaceSlug, timeRange);

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
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {workspaceName ? `Welcome to ${workspaceName}` : "Workspace Overview"}
          </h1>
          <p className="text-muted-foreground">
            Monitor your AI applications at a glance
          </p>
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

      {/* Stats Row */}
      <WorkspaceStatsRow stats={stats} isLoading={isLoading} />

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Projects - Takes 2 columns on large screens */}
        <div className="lg:col-span-2">
          <ProjectCardsGrid workspaceSlug={workspaceSlug} timeRange={timeRange} />
        </div>

        {/* Activity Feed - Takes 1 column */}
        <div>
          <RecentActivityFeed activities={activities} isLoading={isLoading} />
        </div>
      </div>
    </div>
  );
}
