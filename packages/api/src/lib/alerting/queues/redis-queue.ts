/**
 * Redis Trigger Queue (FUTURE)
 *
 * Implementation of ITriggerQueue using Redis lists.
 * This is a placeholder for future implementation.
 *
 * Benefits over MemoryTriggerQueue:
 * - Persistent (survives process restarts)
 * - Shared across multiple workers
 * - Supports distributed locking
 *
 * TODO: Implement when scale requires persistence or multiple workers
 */

import type { AlertSeverity, TriggerQueueItem } from "../../../schemas/alerting";
import type { ITriggerQueue } from "../interfaces";

export class RedisTriggerQueue implements ITriggerQueue {
  constructor() {
    throw new Error(
      "RedisTriggerQueue is not implemented yet. Use MemoryTriggerQueue instead."
    );
  }

  async enqueue(_item: TriggerQueueItem): Promise<void> {
    throw new Error("Not implemented");
  }

  async dequeue(
    _severity: AlertSeverity,
    _batchSize: number
  ): Promise<TriggerQueueItem[]> {
    throw new Error("Not implemented");
  }

  async size(_severity: AlertSeverity): Promise<number> {
    throw new Error("Not implemented");
  }

  async acquireLock(_alertId: string, _ttlMs: number): Promise<boolean> {
    throw new Error("Not implemented");
  }

  async releaseLock(_alertId: string): Promise<void> {
    throw new Error("Not implemented");
  }
}
