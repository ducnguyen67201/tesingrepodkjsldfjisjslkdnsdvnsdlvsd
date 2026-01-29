/**
 * Workspace Overview Service
 *
 * Business logic for workspace overview dashboard - aggregated stats and activity feed.
 */

import { prisma, Prisma } from "@ducsigr/db";
import { timeRangeToDateRange } from "../schemas/dashboard";
import type {
  GetWorkspaceStatsInput,
  GetRecentActivityInput,
  WorkspaceStats,
  GetRecentActivityOutput,
  StatTrend,
  TrendDirection,
  ActivityType,
  RecentActivityItem,
} from "../schemas/workspace-overview";

// ============================================================
// Constants
// ============================================================

/** Minimum percentage change to consider a trend as "up" or "down" vs "flat" */
const TREND_THRESHOLD_PERCENT = 1;

// ============================================================
// Types
// ============================================================

interface AggregatedStats {
  traceCount: number;
  errorCount: number;
  avgLatencyP95: number;
}

// ============================================================
// Service
// ============================================================

export class WorkspaceOverviewService {
  /**
   * Get aggregated stats for a workspace with trends
   */
  static async getStats(
    input: GetWorkspaceStatsInput,
    workspaceId: string
  ): Promise<WorkspaceStats> {
    // Get time ranges
    const { from: currentFrom, to: currentTo } = timeRangeToDateRange(
      input.timeRange,
      input.customTimeRange
    );

    // Calculate previous period for trend comparison
    const periodMs = currentTo.getTime() - currentFrom.getTime();
    const previousFrom = new Date(currentFrom.getTime() - periodMs);
    const previousTo = currentFrom;

    // Get project IDs for this workspace
    const projects = await prisma.project.findMany({
      where: { workspaceId },
      select: { id: true },
    });

    const projectIds = projects.map((p) => p.id);

    // If no projects, return empty stats
    if (projectIds.length === 0) {
      return this.emptyStats();
    }

    // Fetch current and previous period stats in parallel
    const [currentStats, previousStats, activeAlertsCount] = await Promise.all([
      this.getAggregatedStats(projectIds, currentFrom, currentTo),
      this.getAggregatedStats(projectIds, previousFrom, previousTo),
      this.getActiveAlertsCount(projectIds),
    ]);

    return {
      totalTraces: this.calculateTrend(currentStats.traceCount, previousStats.traceCount),
      totalErrors: this.calculateTrend(currentStats.errorCount, previousStats.errorCount),
      avgLatencyP95Ms: this.calculateTrend(
        currentStats.avgLatencyP95,
        previousStats.avgLatencyP95
      ),
      activeAlerts: activeAlertsCount,
    };
  }

  /**
   * Get recent activity (alert firings/resolutions) for a workspace
   */
  static async getRecentActivity(
    input: GetRecentActivityInput,
    workspaceId: string
  ): Promise<GetRecentActivityOutput> {
    const limit = input.limit ?? 10;

    // Get all alert history entries for projects in this workspace
    const alertHistories = await prisma.alertHistory.findMany({
      where: {
        alert: {
          project: {
            workspaceId,
          },
        },
      },
      include: {
        alert: {
          include: {
            project: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        triggeredAt: "desc",
      },
      take: limit,
    });

    // Map to activity items
    const items: RecentActivityItem[] = alertHistories.map((history) => {
      const activityType = this.mapAlertStateToActivityType(
        history.state,
        history.resolved
      );

      return {
        id: history.id,
        type: activityType,
        title: this.getActivityTitle(activityType, history.alert.name),
        description: this.getActivityDescription(
          activityType,
          history.value,
          history.threshold
        ),
        timestamp: history.triggeredAt,
        projectId: history.alert.project.id,
        projectName: history.alert.project.name,
        severity: history.alert.severity as
          | "CRITICAL"
          | "HIGH"
          | "MEDIUM"
          | "LOW"
          | undefined,
        alertState: history.state as
          | "INACTIVE"
          | "PENDING"
          | "FIRING"
          | "RESOLVED"
          | undefined,
        value: history.value,
        threshold: history.threshold,
      };
    });

    return {
      items,
      total: items.length,
    };
  }

  // ============================================================
  // Private Helpers
  // ============================================================

  /**
   * Get aggregated stats for a list of project IDs within a time range
   */
  private static async getAggregatedStats(
    projectIds: string[],
    from: Date,
    to: Date
  ): Promise<AggregatedStats> {
    if (projectIds.length === 0) {
      return { traceCount: 0, errorCount: 0, avgLatencyP95: 0 };
    }

    const sql = Prisma.sql`
      SELECT
        COALESCE(COUNT(t."id"), 0)::INT as "traceCount",
        COALESCE(SUM(CASE WHEN t."hasError" THEN 1 ELSE 0 END), 0)::INT as "errorCount",
        COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY t."durationMs"), 0) as "avgLatencyP95"
      FROM "Trace" t
      WHERE t."projectId" = ANY(${projectIds})
        AND t."startTime" >= ${from}
        AND t."startTime" < ${to}
    `;

    const rows = await prisma.$queryRaw<
      Array<{
        traceCount: bigint;
        errorCount: bigint;
        avgLatencyP95: number;
      }>
    >(sql);

    const row = rows[0];
    if (!row) {
      return { traceCount: 0, errorCount: 0, avgLatencyP95: 0 };
    }

    return {
      traceCount: Number(row.traceCount),
      errorCount: Number(row.errorCount),
      avgLatencyP95: Number(row.avgLatencyP95),
    };
  }

  /**
   * Get count of active (FIRING) alerts for project IDs
   */
  private static async getActiveAlertsCount(projectIds: string[]): Promise<number> {
    if (projectIds.length === 0) {
      return 0;
    }

    return prisma.alert.count({
      where: {
        projectId: { in: projectIds },
        state: "FIRING",
        enabled: true,
      },
    });
  }

  /**
   * Calculate trend between current and previous values
   */
  private static calculateTrend(current: number, previous: number): StatTrend {
    let percentChange = 0;
    let direction: TrendDirection = "flat";

    if (previous > 0) {
      percentChange = ((current - previous) / previous) * 100;

      if (percentChange > TREND_THRESHOLD_PERCENT) {
        direction = "up";
      } else if (percentChange < -TREND_THRESHOLD_PERCENT) {
        direction = "down";
      } else {
        direction = "flat";
      }
    } else if (current > 0) {
      // Previous was 0, current is positive
      percentChange = 100;
      direction = "up";
    }

    return {
      current,
      previous,
      percentChange: Math.round(percentChange * 10) / 10, // Round to 1 decimal
      direction,
    };
  }

  /**
   * Map alert state to activity type
   */
  private static mapAlertStateToActivityType(
    state: string | null,
    resolved: boolean
  ): ActivityType {
    if (resolved || state === "RESOLVED") {
      return "alert_resolved";
    }
    if (state === "PENDING") {
      return "alert_pending";
    }
    return "alert_fired";
  }

  /**
   * Get human-readable activity title
   */
  private static getActivityTitle(type: ActivityType, alertName: string): string {
    switch (type) {
      case "alert_fired":
        return `Alert fired: ${alertName}`;
      case "alert_resolved":
        return `Alert resolved: ${alertName}`;
      case "alert_pending":
        return `Alert pending: ${alertName}`;
      default:
        return alertName;
    }
  }

  /**
   * Get activity description with value context
   */
  private static getActivityDescription(
    type: ActivityType,
    value: number,
    threshold: number
  ): string {
    switch (type) {
      case "alert_fired":
        return `Value ${value.toFixed(1)} exceeded threshold ${threshold.toFixed(1)}`;
      case "alert_resolved":
        return `Value ${value.toFixed(1)} returned below threshold ${threshold.toFixed(1)}`;
      case "alert_pending":
        return `Value ${value.toFixed(1)} approaching threshold ${threshold.toFixed(1)}`;
      default:
        return "";
    }
  }

  /**
   * Return empty stats object
   */
  private static emptyStats(): WorkspaceStats {
    const emptyTrend: StatTrend = {
      current: 0,
      previous: 0,
      percentChange: 0,
      direction: "flat",
    };

    return {
      totalTraces: emptyTrend,
      totalErrors: emptyTrend,
      avgLatencyP95Ms: emptyTrend,
      activeAlerts: 0,
    };
  }
}
