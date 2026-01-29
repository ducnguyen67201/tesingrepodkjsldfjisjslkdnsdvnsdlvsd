/**
 * Redis Alert Store (FUTURE)
 *
 * Implementation of IAlertStore using Redis for caching.
 * This is a placeholder for future implementation.
 *
 * Benefits over PrismaAlertStore:
 * - Faster reads (cached in Redis)
 * - Reduced database load
 * - Better for high-frequency evaluations
 *
 * TODO: Implement when scale requires caching
 */

import type { AlertSeverity, AlertState, AlertType, MetricResult } from "../../../schemas/alerting";
import type {
  IAlertStore,
  AlertWithProject,
  StateMetadata,
  AlertHistoryEntry,
} from "../interfaces";

export class RedisAlertStore implements IAlertStore {
  constructor() {
    throw new Error(
      "RedisAlertStore is not implemented yet. Use PrismaAlertStore instead."
    );
  }

  async getEligibleAlerts(_severity?: AlertSeverity): Promise<AlertWithProject[]> {
    throw new Error("Not implemented");
  }

  async updateAlertState(
    _alertId: string,
    _state: AlertState,
    _metadata?: StateMetadata
  ): Promise<void> {
    throw new Error("Not implemented");
  }

  async getMetric(
    _projectId: string,
    _type: AlertType,
    _windowMins: number
  ): Promise<MetricResult> {
    throw new Error("Not implemented");
  }

  async recordHistory(_entry: AlertHistoryEntry): Promise<void> {
    throw new Error("Not implemented");
  }
}
