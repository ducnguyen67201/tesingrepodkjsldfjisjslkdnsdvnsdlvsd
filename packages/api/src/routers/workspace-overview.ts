/**
 * Workspace Overview Router
 *
 * tRPC router for workspace overview dashboard - aggregated stats and activity feed.
 */

import { createRouter, protectedProcedure, workspaceMiddleware } from "../trpc";
import { WorkspaceOverviewService } from "../services";
import {
  GetWorkspaceStatsInputSchema,
  GetRecentActivityInputSchema,
} from "../schemas/workspace-overview";

/**
 * Workspace Overview Router
 */
export const workspaceOverviewRouter = createRouter({
  /**
   * Get aggregated stats for workspace with trends
   */
  getStats: protectedProcedure
    .input(GetWorkspaceStatsInputSchema)
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }) => {
      return WorkspaceOverviewService.getStats(input, ctx.workspace.id);
    }),

  /**
   * Get recent activity (alerts, anomalies) for workspace
   */
  getRecentActivity: protectedProcedure
    .input(GetRecentActivityInputSchema)
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }) => {
      return WorkspaceOverviewService.getRecentActivity(input, ctx.workspace.id);
    }),
});

export type WorkspaceOverviewRouter = typeof workspaceOverviewRouter;
