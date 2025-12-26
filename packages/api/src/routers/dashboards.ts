/**
 * Dashboards Router
 *
 * tRPC router for observability dashboard management.
 */

import { z } from "zod";
import { createRouter, protectedProcedure, workspaceMiddleware } from "../trpc";
import { DashboardService, GraphQueryService } from "../services";
import {
  CreateDashboardInputSchema,
  UpdateDashboardInputSchema,
  ListDashboardsInputSchema,
  GetDashboardInputSchema,
  DeleteDashboardInputSchema,
  UpsertWidgetInputSchema,
  DeleteWidgetInputSchema,
  UpdateLayoutInputSchema,
  GraphQueryInputSchema,
  GetProjectSummariesInputSchema,
  timeRangeToDateRange,
  WIDGET_TYPE_LABELS,
  DATA_SOURCE_LABELS,
  METRIC_OP_LABELS,
  DASHBOARD_TIME_RANGE_LABELS,
  BUCKET_LABELS,
  UNIT_LABELS,
} from "../schemas/dashboard";

/**
 * Dashboards Router
 */
export const dashboardsRouter = createRouter({
  /**
   * List dashboards for a workspace/project
   */
  list: protectedProcedure
    .input(ListDashboardsInputSchema)
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }) => {
      return DashboardService.list(input, ctx.workspace.id, ctx.session.user.id);
    }),

  /**
   * Get a single dashboard with all widgets
   */
  get: protectedProcedure
    .input(GetDashboardInputSchema)
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }) => {
      return DashboardService.getById(input.id, ctx.workspace.id, ctx.session.user.id);
    }),

  /**
   * Get the default dashboard for a project or workspace
   */
  getDefault: protectedProcedure
    .input(
      z.object({
        workspaceSlug: z.string(),
        projectId: z.string().optional(),
      })
    )
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }) => {
      return DashboardService.getDefault(
        ctx.workspace.id,
        input.projectId ?? null,
        ctx.session.user.id
      );
    }),

  /**
   * Create a new dashboard
   */
  create: protectedProcedure
    .input(CreateDashboardInputSchema)
    .use(workspaceMiddleware)
    .mutation(async ({ ctx, input }) => {
      return DashboardService.create(input, ctx.workspace.id, ctx.session.user.id);
    }),

  /**
   * Update dashboard metadata
   */
  update: protectedProcedure
    .input(UpdateDashboardInputSchema)
    .use(workspaceMiddleware)
    .mutation(async ({ ctx, input }) => {
      return DashboardService.update(input, ctx.workspace.id, ctx.session.user.id);
    }),

  /**
   * Delete a dashboard
   */
  delete: protectedProcedure
    .input(DeleteDashboardInputSchema)
    .use(workspaceMiddleware)
    .mutation(async ({ ctx, input }) => {
      return DashboardService.delete(input.id, ctx.workspace.id, ctx.session.user.id);
    }),

  /**
   * Upsert a widget (create or update)
   */
  upsertWidget: protectedProcedure
    .input(UpsertWidgetInputSchema)
    .use(workspaceMiddleware)
    .mutation(async ({ ctx, input }) => {
      return DashboardService.upsertWidget(input, ctx.workspace.id, ctx.session.user.id);
    }),

  /**
   * Delete a widget
   */
  deleteWidget: protectedProcedure
    .input(DeleteWidgetInputSchema)
    .use(workspaceMiddleware)
    .mutation(async ({ ctx, input }) => {
      return DashboardService.deleteWidget(
        input.dashboardId,
        input.widgetId,
        ctx.workspace.id,
        ctx.session.user.id
      );
    }),

  /**
   * Batch update widget layouts
   */
  updateLayout: protectedProcedure
    .input(UpdateLayoutInputSchema)
    .use(workspaceMiddleware)
    .mutation(async ({ ctx, input }) => {
      return DashboardService.updateLayout(input, ctx.workspace.id, ctx.session.user.id);
    }),

  /**
   * Get presets and labels for UI
   */
  getPresets: protectedProcedure.query(() => ({
    labels: {
      widgetTypes: WIDGET_TYPE_LABELS,
      dataSources: DATA_SOURCE_LABELS,
      metricOps: METRIC_OP_LABELS,
      timeRanges: DASHBOARD_TIME_RANGE_LABELS,
      buckets: BUCKET_LABELS,
      units: UNIT_LABELS,
    },
  })),
});

/**
 * Graphs Router - separate router for graph queries
 */
export const graphsRouter = createRouter({
  /**
   * Execute a graph query
   */
  query: protectedProcedure
    .input(GraphQueryInputSchema)
    .use(workspaceMiddleware)
    .query(async ({ input }) => {
      return GraphQueryService.execute(input.projectId, input.query);
    }),

  /**
   * Get project summaries for workspace overview
   */
  projectSummaries: protectedProcedure
    .input(GetProjectSummariesInputSchema)
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }) => {
      const { from, to } = timeRangeToDateRange(input.timeRange, input.customTimeRange);
      return GraphQueryService.getProjectSummaries(ctx.workspace.id, from, to);
    }),

  /**
   * Get sparkline data for all projects in a workspace
   */
  projectSparklines: protectedProcedure
    .input(GetProjectSummariesInputSchema)
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }) => {
      const { from, to } = timeRangeToDateRange(input.timeRange, input.customTimeRange);
      const sparklineMap = await GraphQueryService.getProjectSparklines(ctx.workspace.id, from, to);
      // Convert Map to object for JSON serialization
      const result: Record<string, Array<{ time: string; value: number }>> = {};
      for (const [projectId, data] of sparklineMap) {
        result[projectId] = data;
      }
      return result;
    }),
});

export type DashboardsRouter = typeof dashboardsRouter;
export type GraphsRouter = typeof graphsRouter;
