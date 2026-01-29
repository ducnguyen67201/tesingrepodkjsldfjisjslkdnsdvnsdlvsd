"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import {
  Plus,
  Settings,
  RefreshCw,
  LayoutDashboard,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useDashboard, useDashboards } from "@/hooks/use-dashboards";
import { WidgetCard } from "./widget-card";
import { TimeRangeFilter } from "./time-range-filter";
import { CreateDashboardDialog } from "./create-dashboard-dialog";
import { AddWidgetDialog } from "./add-widget-dialog";
import type {
  DashboardTimeRange,
  GraphQuery,
  GraphDisplay,
  WidgetType,
  WidgetLayout,
} from "@ducsigr/api/schemas";

// ============================================================
// Types
// ============================================================

interface Widget {
  id: string;
  title: string;
  type: string;
  query: unknown;
  display: unknown;
  layout: unknown;
}

// ============================================================
// Props
// ============================================================

interface DashboardViewProps {
  workspaceSlug: string;
  projectId: string;
  dashboardId?: string;
}

// ============================================================
// Component
// ============================================================

export function DashboardView({
  workspaceSlug,
  projectId,
  dashboardId,
}: DashboardViewProps) {
  const [timeRange, setTimeRange] = useState<DashboardTimeRange>("24h");
  const [activeDashboardId, setActiveDashboardId] = useState<string | undefined>(
    dashboardId
  );
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showAddWidgetDialog, setShowAddWidgetDialog] = useState(false);

  // List of dashboards for dropdown
  const { dashboards, isLoading: isLoadingList } = useDashboards(
    workspaceSlug,
    projectId
  );

  // Active dashboard
  const {
    dashboard,
    isLoading: isLoadingDashboard,
    refetch,
    deleteWidget,
    upsertWidget,
    isUpsertingWidget,
  } = useDashboard(workspaceSlug, activeDashboardId ?? "");

  // Auto-select first dashboard or default dashboard when list loads
  useEffect(() => {
    if (!activeDashboardId && dashboards.length > 0) {
      const defaultDashboard = dashboards.find((d) => d.isDefault);
      const dashboardToSelect = defaultDashboard ?? dashboards[0];
      if (dashboardToSelect) {
        setActiveDashboardId(dashboardToSelect.id);
      }
    }
  }, [dashboards, activeDashboardId]);

  // Derived state
  const isLoading = isLoadingList || isLoadingDashboard;
  const hasWidgets = (dashboard?.widgets?.length ?? 0) > 0;

  // Handlers
  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleTimeRangeChange = useCallback((value: DashboardTimeRange) => {
    setTimeRange(value);
  }, []);

  const handleDashboardChange = useCallback((id: string) => {
    setActiveDashboardId(id);
  }, []);

  const handleEditWidget = useCallback((widgetId: string) => {
    // TODO: Open widget editor dialog
    console.debug("Edit widget:", widgetId);
  }, []);

  const handleDeleteWidget = useCallback(
    async (widgetId: string) => {
      await deleteWidget(widgetId);
    },
    [deleteWidget]
  );

  const handleOpenAddWidget = useCallback(() => {
    setShowAddWidgetDialog(true);
  }, []);

  const handleCloseAddWidget = useCallback(() => {
    setShowAddWidgetDialog(false);
  }, []);

  const handleSaveWidget = useCallback(
    async (widget: {
      title: string;
      type: WidgetType;
      query: GraphQuery;
      display: GraphDisplay;
      layout: WidgetLayout;
    }) => {
      await upsertWidget(widget);
      setShowAddWidgetDialog(false);
    },
    [upsertWidget]
  );

  const handleOpenCreateDashboard = useCallback(() => {
    setShowCreateDialog(true);
  }, []);

  const handleCloseCreateDashboard = useCallback(() => {
    setShowCreateDialog(false);
  }, []);

  const handleDashboardCreated = useCallback((dashboardId: string) => {
    setActiveDashboardId(dashboardId);
  }, []);

  // Sorted widgets by layout position
  const sortedWidgets = useMemo(() => {
    if (!dashboard?.widgets) return [];
    return [...dashboard.widgets].sort((a, b) => {
      const layoutA = a.layout as WidgetLayout;
      const layoutB = b.layout as WidgetLayout;
      if (layoutA.y !== layoutB.y) return layoutA.y - layoutB.y;
      return layoutA.x - layoutB.x;
    });
  }, [dashboard?.widgets]);

  // Query with time range override
  const getQueryWithTimeRange = useCallback(
    (query: unknown): GraphQuery => {
      const q = query as GraphQuery;
      return { ...q, timeRange };
    },
    [timeRange]
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <LayoutDashboard className="h-5 w-5" />
          <DashboardSelector
            dashboards={dashboards}
            activeDashboardId={activeDashboardId}
            onSelect={handleDashboardChange}
          />
        </div>
        <div className="flex items-center gap-2">
          <TimeRangeFilter value={timeRange} onChange={handleTimeRangeChange} />
          <Button variant="outline" size="icon" onClick={handleRefresh}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
          <Button variant="outline" size="icon">
            <Settings className="h-4 w-4" />
          </Button>
          <Button size="sm" onClick={handleOpenAddWidget} disabled={!activeDashboardId}>
            <Plus className="mr-2 h-4 w-4" />
            Add Widget
          </Button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <LoadingSkeleton />
      ) : !dashboard ? (
        <NoDashboard onCreate={handleOpenCreateDashboard} />
      ) : !hasWidgets ? (
        <EmptyDashboard onAddWidget={handleOpenAddWidget} />
      ) : (
        <WidgetGrid
          widgets={sortedWidgets}
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          getQueryWithTimeRange={getQueryWithTimeRange}
          onEdit={handleEditWidget}
          onDelete={handleDeleteWidget}
        />
      )}

      {/* Dialogs */}
      <CreateDashboardDialog
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        open={showCreateDialog}
        onClose={handleCloseCreateDashboard}
        onCreated={handleDashboardCreated}
      />

      <AddWidgetDialog
        open={showAddWidgetDialog}
        onClose={handleCloseAddWidget}
        onSave={handleSaveWidget}
        isSaving={isUpsertingWidget}
        existingWidgetCount={dashboard?.widgets?.length ?? 0}
      />
    </div>
  );
}

// ============================================================
// Dashboard Selector
// ============================================================

interface DashboardSelectorProps {
  dashboards: Array<{ id: string; name: string }>;
  activeDashboardId?: string;
  onSelect: (id: string) => void;
}

function DashboardSelector({
  dashboards,
  activeDashboardId,
  onSelect,
}: DashboardSelectorProps) {
  const activeDashboard = dashboards.find((d) => d.id === activeDashboardId);
  const displayName = activeDashboard?.name ?? "Select Dashboard";

  const handleSelect = useCallback(
    (id: string) => () => onSelect(id),
    [onSelect]
  );

  if (dashboards.length === 0) {
    return <h2 className="text-xl font-semibold">Dashboard</h2>;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="gap-2">
          <span className="text-xl font-semibold">{displayName}</span>
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {dashboards.map((dashboard) => (
          <DropdownMenuItem
            key={dashboard.id}
            onClick={handleSelect(dashboard.id)}
          >
            {dashboard.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ============================================================
// Widget Grid
// ============================================================

interface WidgetGridProps {
  widgets: Widget[];
  workspaceSlug: string;
  projectId: string;
  getQueryWithTimeRange: (query: unknown) => GraphQuery;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

function WidgetGrid({
  widgets,
  workspaceSlug,
  projectId,
  getQueryWithTimeRange,
  onEdit,
  onDelete,
}: WidgetGridProps) {
  // Separate stat cards from charts
  const statWidgets = widgets.filter((w) => w.type === "stat");
  const chartWidgets = widgets.filter((w) => w.type !== "stat");

  return (
    <div className="space-y-6">
      {/* Stat Cards - 4 columns on large screens */}
      {statWidgets.length > 0 && (
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          {statWidgets.map((widget) => (
            <WidgetCard
              key={widget.id}
              id={widget.id}
              title={widget.title}
              type={widget.type as WidgetType}
              query={getQueryWithTimeRange(widget.query)}
              display={widget.display as GraphDisplay}
              workspaceSlug={workspaceSlug}
              projectId={projectId}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}

      {/* Charts - 2 columns */}
      {chartWidgets.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {chartWidgets.map((widget) => (
            <WidgetCard
              key={widget.id}
              id={widget.id}
              title={widget.title}
              type={widget.type as WidgetType}
              query={getQueryWithTimeRange(widget.query)}
              display={widget.display as GraphDisplay}
              workspaceSlug={workspaceSlug}
              projectId={projectId}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// States
// ============================================================

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      {/* Stat cards skeleton */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={`stat-${i}`} className="h-[120px]" />
        ))}
      </div>
      {/* Charts skeleton */}
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={`chart-${i}`} className="h-[280px]" />
        ))}
      </div>
    </div>
  );
}

function NoDashboard({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12">
      <LayoutDashboard className="mb-4 h-12 w-12 text-muted-foreground" />
      <h3 className="mb-2 text-lg font-medium">No Dashboard Found</h3>
      <p className="mb-4 text-center text-sm text-muted-foreground">
        Create a dashboard to start visualizing your metrics.
      </p>
      <Button onClick={onCreate}>
        <Plus className="mr-2 h-4 w-4" />
        Create Dashboard
      </Button>
    </div>
  );
}

function EmptyDashboard({ onAddWidget }: { onAddWidget: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12">
      <LayoutDashboard className="mb-4 h-12 w-12 text-muted-foreground" />
      <h3 className="mb-2 text-lg font-medium">Empty Dashboard</h3>
      <p className="mb-4 text-center text-sm text-muted-foreground">
        Add widgets to visualize your metrics.
      </p>
      <Button onClick={onAddWidget}>
        <Plus className="mr-2 h-4 w-4" />
        Add Widget
      </Button>
    </div>
  );
}
