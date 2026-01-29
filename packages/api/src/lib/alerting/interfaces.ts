/**
 * Alert System v2 - Interface Definitions
 *
 * These interfaces define the contracts for the alerting system.
 * Implementations can be swapped for different backends (e.g., Redis, PostgreSQL).
 */

import type {
  AlertSeverity,
  AlertState,
  AlertType,
  AlertOperator,
  MetricResult,
  TriggerQueueItem,
  DispatchResult,
} from "../../schemas/alerting";

// ============================================================
// Alert With Project Type (used by evaluator)
// ============================================================

/**
 * Alert with project information for evaluation
 */
export interface AlertWithProject {
  id: string;
  projectId: string;
  name: string;
  type: AlertType;
  threshold: number;
  operator: AlertOperator;
  windowMins: number;
  cooldownMins: number;
  pendingMins: number;
  severity: AlertSeverity;
  state: AlertState;
  stateChangedAt: Date | null;
  lastTriggeredAt: Date | null;
  lastEvaluatedAt: Date | null;
  enabled: boolean;
  project: {
    id: string;
    name: string;
    workspaceId: string;
  };
  channelLinks: Array<{
    channelId: string;
    channel: {
      id: string;
      name: string;
      provider: string;
    };
  }>;
}

/**
 * Metadata for state updates
 */
export interface StateMetadata {
  evaluationMs?: number;
  sampleCount?: number;
  value?: number;
  /** If true, this is an actual state transition and stateChangedAt should be updated */
  stateChanged?: boolean;
}

/**
 * Entry for alert history
 */
export interface AlertHistoryEntry {
  alertId: string;
  value: number;
  threshold: number;
  state: AlertState;
  previousState: AlertState | null;
  resolved: boolean;
  resolvedAt: Date | null;
  notifiedVia: string[];
  sampleCount?: number;
  evaluationMs?: number;
}

// ============================================================
// Extension Point 1: Alert Storage
// ============================================================

/**
 * IAlertStore - Interface for alert data access
 *
 * TODAY: PrismaAlertStore (direct database queries)
 * FUTURE: RedisAlertStore (cached queries with Redis)
 */
export interface IAlertStore {
  /**
   * Get all enabled alerts eligible for evaluation
   * @param severity - Optional filter by severity level
   */
  getEligibleAlerts(severity?: AlertSeverity): Promise<AlertWithProject[]>;

  /**
   * Update an alert's state
   * @param alertId - The alert ID
   * @param state - The new state
   * @param metadata - Optional evaluation metadata
   */
  updateAlertState(
    alertId: string,
    state: AlertState,
    metadata?: StateMetadata
  ): Promise<void>;

  /**
   * Get the current metric value for an alert
   * @param projectId - The project ID
   * @param type - The alert type (metric to check)
   * @param windowMins - The time window in minutes
   */
  getMetric(
    projectId: string,
    type: AlertType,
    windowMins: number
  ): Promise<MetricResult>;

  /**
   * Record an entry in alert history
   * @param entry - The history entry to record
   */
  recordHistory(entry: AlertHistoryEntry): Promise<void>;
}

// ============================================================
// Extension Point 2: Trigger Queue
// ============================================================

/**
 * ITriggerQueue - Interface for alert trigger queue
 *
 * TODAY: MemoryTriggerQueue (in-process arrays)
 * FUTURE: RedisTriggerQueue (persistent queue with Redis)
 */
export interface ITriggerQueue {
  /**
   * Add an item to the queue
   * @param item - The trigger item to enqueue
   */
  enqueue(item: TriggerQueueItem): Promise<void>;

  /**
   * Remove and return items from the queue
   * @param severity - The severity level to dequeue from
   * @param batchSize - Maximum number of items to return
   */
  dequeue(
    severity: AlertSeverity,
    batchSize: number
  ): Promise<TriggerQueueItem[]>;

  /**
   * Get the current queue size
   * @param severity - The severity level to check
   */
  size(severity: AlertSeverity): Promise<number>;

  /**
   * Acquire a lock for an alert (for distributed workers)
   * @param alertId - The alert ID to lock
   * @param ttlMs - Lock time-to-live in milliseconds
   */
  acquireLock?(alertId: string, ttlMs: number): Promise<boolean>;

  /**
   * Release a lock for an alert
   * @param alertId - The alert ID to unlock
   */
  releaseLock?(alertId: string): Promise<void>;
}

// ============================================================
// Extension Point 3: Notification Dispatcher
// ============================================================

/**
 * IDispatcher - Interface for notification dispatch
 *
 * TODAY: SimpleDispatcher (HTTP POST to batch endpoint)
 * FUTURE: RateLimitedDispatcher (with backoff and circuit breaker)
 */
export interface IDispatcher {
  /**
   * Dispatch notifications for triggered alerts
   * @param items - The trigger items to dispatch
   */
  dispatch(items: TriggerQueueItem[]): Promise<DispatchResult>;

  /**
   * Get rate limit status for a channel (future)
   * @param channelId - The channel ID
   */
  getRateLimitStatus?(channelId: string): Promise<{
    remaining: number;
    resetAt: Date;
  }>;

  /**
   * Check if circuit is open for a channel (future)
   * @param channelId - The channel ID
   */
  isCircuitOpen?(channelId: string): Promise<boolean>;
}

// ============================================================
// Extension Point 4: Scheduler
// ============================================================

/**
 * IScheduler - Interface for task scheduling
 *
 * TODAY: IntervalScheduler (setInterval-based)
 * FUTURE: DistributedScheduler (with distributed locking)
 */
export interface IScheduler {
  /**
   * Schedule a recurring task
   * @param name - Unique name for the task
   * @param intervalMs - Interval in milliseconds
   * @param task - The async task to run
   */
  schedule(
    name: string,
    intervalMs: number,
    task: () => Promise<void>
  ): void;

  /**
   * Cancel a scheduled task
   * @param name - The task name to cancel
   */
  cancel(name: string): void;

  /**
   * Cancel all scheduled tasks
   */
  cancelAll(): void;

  /**
   * Update the interval of a scheduled task (future)
   * @param name - The task name
   * @param newIntervalMs - The new interval
   */
  updateInterval?(name: string, newIntervalMs: number): void;
}
