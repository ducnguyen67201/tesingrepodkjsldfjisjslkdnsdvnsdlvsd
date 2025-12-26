"use client";

import { useCallback } from "react";
import { trpc } from "@/lib/trpc/client";
import { showError } from "@/lib/errors";
import { dashboardToast } from "@/lib/success";
import type {
  DashboardVisibility,
  WidgetType,
  GraphQuery,
  GraphDisplay,
  WidgetLayout,
} from "@cognobserve/api/schemas";

// ============================================================
// Types
// ============================================================

interface CreateDashboardInput {
  name: string;
  description?: string;
  projectId?: string;
  visibility?: DashboardVisibility;
  isDefault?: boolean;
}

interface UpdateDashboardInput {
  name?: string;
  description?: string;
  visibility?: DashboardVisibility;
  isDefault?: boolean;
}

interface UpsertWidgetInput {
  widgetId?: string;
  title: string;
  type: WidgetType;
  query: GraphQuery;
  display: GraphDisplay;
  layout: WidgetLayout;
}

interface LayoutUpdate {
  widgetId: string;
  layout: WidgetLayout;
}

// ============================================================
// useDashboards Hook
// ============================================================

export function useDashboards(workspaceSlug: string, projectId?: string) {
  const utils = trpc.useUtils();

  // Query: List dashboards
  const {
    data: dashboards = [],
    isLoading,
    error,
    refetch,
  } = trpc.dashboards.list.useQuery(
    { workspaceSlug, projectId },
    { enabled: !!workspaceSlug }
  );

  // Query: Get presets (labels, options)
  const { data: presets } = trpc.dashboards.getPresets.useQuery();

  // Mutation: Create dashboard
  const createMutation = trpc.dashboards.create.useMutation({
    onSuccess: (data) => {
      dashboardToast.created(data.name);
      utils.dashboards.list.invalidate({ workspaceSlug, projectId });
    },
    onError: showError,
  });

  // Mutation: Update dashboard
  const updateMutation = trpc.dashboards.update.useMutation({
    onSuccess: (data) => {
      dashboardToast.updated(data.name);
      utils.dashboards.list.invalidate({ workspaceSlug, projectId });
      utils.dashboards.get.invalidate({ workspaceSlug, id: data.id });
    },
    onError: showError,
  });

  // Mutation: Delete dashboard
  const deleteMutation = trpc.dashboards.delete.useMutation({
    onSuccess: () => {
      dashboardToast.deleted();
      utils.dashboards.list.invalidate({ workspaceSlug, projectId });
    },
    onError: showError,
  });

  const createDashboard = useCallback(
    async (input: CreateDashboardInput) => {
      return createMutation.mutateAsync({
        workspaceSlug,
        projectId: input.projectId,
        name: input.name,
        description: input.description,
        visibility: input.visibility,
        isDefault: input.isDefault,
      });
    },
    [createMutation, workspaceSlug]
  );

  const updateDashboard = useCallback(
    async (dashboardId: string, input: UpdateDashboardInput) => {
      return updateMutation.mutateAsync({
        workspaceSlug,
        id: dashboardId,
        ...input,
      });
    },
    [updateMutation, workspaceSlug]
  );

  const deleteDashboard = useCallback(
    async (dashboardId: string) => {
      await deleteMutation.mutateAsync({
        workspaceSlug,
        id: dashboardId,
      });
    },
    [deleteMutation, workspaceSlug]
  );

  return {
    dashboards,
    presets,
    isLoading,
    error: error as Error | null,
    refetch,
    createDashboard,
    updateDashboard,
    deleteDashboard,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

// ============================================================
// useDashboard Hook (single dashboard with widgets)
// ============================================================

export function useDashboard(workspaceSlug: string, dashboardId: string) {
  const utils = trpc.useUtils();

  // Query: Get dashboard with widgets
  const {
    data: dashboard,
    isLoading,
    error,
    refetch,
  } = trpc.dashboards.get.useQuery(
    { workspaceSlug, id: dashboardId },
    { enabled: !!workspaceSlug && !!dashboardId }
  );

  // Mutation: Upsert widget
  const upsertWidgetMutation = trpc.dashboards.upsertWidget.useMutation({
    onSuccess: (_, variables) => {
      if (variables.widgetId) {
        dashboardToast.widgetUpdated();
      } else {
        dashboardToast.widgetAdded();
      }
      utils.dashboards.get.invalidate({ workspaceSlug, id: dashboardId });
    },
    onError: showError,
  });

  // Mutation: Delete widget
  const deleteWidgetMutation = trpc.dashboards.deleteWidget.useMutation({
    onSuccess: () => {
      dashboardToast.widgetDeleted();
      utils.dashboards.get.invalidate({ workspaceSlug, id: dashboardId });
    },
    onError: showError,
  });

  // Mutation: Update layout
  const updateLayoutMutation = trpc.dashboards.updateLayout.useMutation({
    onSuccess: () => {
      dashboardToast.layoutSaved();
    },
    onError: showError,
  });

  const upsertWidget = useCallback(
    async (input: UpsertWidgetInput) => {
      return upsertWidgetMutation.mutateAsync({
        workspaceSlug,
        dashboardId,
        ...input,
      });
    },
    [upsertWidgetMutation, workspaceSlug, dashboardId]
  );

  const deleteWidget = useCallback(
    async (widgetId: string) => {
      await deleteWidgetMutation.mutateAsync({
        workspaceSlug,
        dashboardId,
        widgetId,
      });
    },
    [deleteWidgetMutation, workspaceSlug, dashboardId]
  );

  const updateLayout = useCallback(
    async (layouts: LayoutUpdate[]) => {
      await updateLayoutMutation.mutateAsync({
        workspaceSlug,
        dashboardId,
        layouts,
      });
    },
    [updateLayoutMutation, workspaceSlug, dashboardId]
  );

  return {
    dashboard,
    isLoading,
    error: error as Error | null,
    refetch,
    upsertWidget,
    deleteWidget,
    updateLayout,
    isUpsertingWidget: upsertWidgetMutation.isPending,
    isDeletingWidget: deleteWidgetMutation.isPending,
    isUpdatingLayout: updateLayoutMutation.isPending,
  };
}

// ============================================================
// useGraphQuery Hook (execute graph queries)
// ============================================================

export function useGraphQuery(
  workspaceSlug: string,
  projectId: string,
  query: GraphQuery | null,
  enabled = true
) {
  const {
    data,
    isLoading,
    error,
    refetch,
  } = trpc.graphs.query.useQuery(
    { workspaceSlug, projectId, query: query! },
    {
      enabled: enabled && !!workspaceSlug && !!projectId && !!query,
      staleTime: 30_000, // Cache for 30 seconds
      refetchInterval: 60_000, // Auto-refresh every minute
    }
  );

  return {
    data,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

// ============================================================
// useProjectSummaries Hook (workspace overview)
// ============================================================

export function useProjectSummaries(
  workspaceSlug: string,
  timeRange: "24h" | "7d" | "30d" | "custom" = "24h",
  customTimeRange?: { from: string; to: string }
) {
  const {
    data: summaries = [],
    isLoading,
    error,
    refetch,
  } = trpc.graphs.projectSummaries.useQuery(
    { workspaceSlug, timeRange, customTimeRange },
    {
      enabled: !!workspaceSlug,
      staleTime: 60_000, // Cache for 1 minute
      refetchInterval: 120_000, // Auto-refresh every 2 minutes
    }
  );

  return {
    summaries,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}
