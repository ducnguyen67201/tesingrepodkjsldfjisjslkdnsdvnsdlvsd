/**
 * Prisma Alert Store
 *
 * Implementation of IAlertStore using Prisma for database access.
 * This is the "TODAY" implementation - direct database queries.
 */

import { prisma } from "@ducsigr/db";
import type { AlertSeverity, AlertState, AlertType, MetricResult } from "../../../schemas/alerting";
import type {
  IAlertStore,
  AlertWithProject,
  StateMetadata,
  AlertHistoryEntry,
} from "../interfaces";
import { getMetric as getMetricFromService } from "../metrics-service";

export class PrismaAlertStore implements IAlertStore {
  /**
   * Get all enabled alerts eligible for evaluation
   */
  async getEligibleAlerts(severity?: AlertSeverity): Promise<AlertWithProject[]> {
    const alerts = await prisma.alert.findMany({
      where: {
        enabled: true,
        ...(severity ? { severity } : {}),
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            workspaceId: true,
          },
        },
        channelLinks: {
          include: {
            channel: {
              select: {
                id: true,
                name: true,
                provider: true,
              },
            },
          },
        },
      },
    });

    return alerts.map((alert) => ({
      id: alert.id,
      projectId: alert.projectId,
      name: alert.name,
      type: alert.type as AlertType,
      threshold: alert.threshold,
      operator: alert.operator as "GREATER_THAN" | "LESS_THAN",
      windowMins: alert.windowMins,
      cooldownMins: alert.cooldownMins,
      pendingMins: alert.pendingMins,
      severity: alert.severity as AlertSeverity,
      state: alert.state as AlertState,
      stateChangedAt: alert.stateChangedAt,
      lastTriggeredAt: alert.lastTriggeredAt,
      lastEvaluatedAt: alert.lastEvaluatedAt,
      enabled: alert.enabled,
      project: alert.project,
      channelLinks: alert.channelLinks.map((link) => ({
        channelId: link.channelId,
        channel: {
          id: link.channel.id,
          name: link.channel.name,
          provider: link.channel.provider,
        },
      })),
    }));
  }

  /**
   * Update an alert's state
   */
  async updateAlertState(
    alertId: string,
    state: AlertState,
    metadata?: StateMetadata
  ): Promise<void> {
    const now = new Date();

    await prisma.alert.update({
      where: { id: alertId },
      data: {
        state,
        lastEvaluatedAt: now,
        // Only update stateChangedAt when state actually changed
        ...(metadata?.stateChanged ? { stateChangedAt: now } : {}),
        // Only update lastTriggeredAt when transitioning to FIRING
        ...(state === "FIRING" && metadata?.stateChanged ? { lastTriggeredAt: now } : {}),
      },
    });
  }

  /**
   * Get the current metric value for an alert
   */
  async getMetric(
    projectId: string,
    type: AlertType,
    windowMins: number
  ): Promise<MetricResult> {
    return getMetricFromService(projectId, type, windowMins);
  }

  /**
   * Record an entry in alert history
   */
  async recordHistory(entry: AlertHistoryEntry): Promise<void> {
    await prisma.alertHistory.create({
      data: {
        alertId: entry.alertId,
        value: entry.value,
        threshold: entry.threshold,
        state: entry.state,
        previousState: entry.previousState,
        resolved: entry.resolved,
        resolvedAt: entry.resolvedAt,
        notifiedVia: entry.notifiedVia,
        sampleCount: entry.sampleCount,
        evaluationMs: entry.evaluationMs,
      },
    });
  }
}
