/**
 * Memory Trigger Queue
 *
 * Implementation of ITriggerQueue using in-memory arrays.
 * This is the "TODAY" implementation - simple in-process queues.
 *
 * Note: This queue is NOT persistent. If the process crashes,
 * queued items will be lost. For production at scale, use RedisTriggerQueue.
 */

import type { AlertSeverity, TriggerQueueItem } from "../../../schemas/alerting";
import type { ITriggerQueue } from "../interfaces";

const SEVERITY_LEVELS: AlertSeverity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

export class MemoryTriggerQueue implements ITriggerQueue {
  private queues: Map<AlertSeverity, TriggerQueueItem[]>;

  constructor() {
    this.queues = new Map();
    // Initialize queues for each severity level
    for (const severity of SEVERITY_LEVELS) {
      this.queues.set(severity, []);
    }
  }

  /**
   * Add an item to the appropriate severity queue
   */
  async enqueue(item: TriggerQueueItem): Promise<void> {
    const queue = this.queues.get(item.severity);
    if (!queue) {
      throw new Error(`Unknown severity level: ${item.severity}`);
    }
    queue.push(item);
  }

  /**
   * Remove and return items from a severity queue
   */
  async dequeue(
    severity: AlertSeverity,
    batchSize: number
  ): Promise<TriggerQueueItem[]> {
    const queue = this.queues.get(severity);
    if (!queue) {
      throw new Error(`Unknown severity level: ${severity}`);
    }

    // Splice removes items from the array and returns them
    const count = Math.min(batchSize, queue.length);
    return queue.splice(0, count);
  }

  /**
   * Get the current size of a severity queue
   */
  async size(severity: AlertSeverity): Promise<number> {
    const queue = this.queues.get(severity);
    if (!queue) {
      throw new Error(`Unknown severity level: ${severity}`);
    }
    return queue.length;
  }

  /**
   * Get total size across all queues (for monitoring)
   */
  async totalSize(): Promise<number> {
    let total = 0;
    for (const queue of this.queues.values()) {
      total += queue.length;
    }
    return total;
  }

  /**
   * Clear all queues (useful for testing)
   */
  async clear(): Promise<void> {
    for (const severity of SEVERITY_LEVELS) {
      this.queues.set(severity, []);
    }
  }

  /**
   * Get queue stats (for monitoring)
   */
  async getStats(): Promise<Record<AlertSeverity, number>> {
    const stats: Record<string, number> = {};
    for (const [severity, queue] of this.queues.entries()) {
      stats[severity] = queue.length;
    }
    return stats as Record<AlertSeverity, number>;
  }
}
