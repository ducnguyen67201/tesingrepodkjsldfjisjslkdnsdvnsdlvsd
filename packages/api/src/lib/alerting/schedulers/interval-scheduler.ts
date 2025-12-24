/**
 * Interval Scheduler
 *
 * Implementation of IScheduler using setInterval.
 * This is the "TODAY" implementation - simple in-process scheduling.
 *
 * For production at scale with multiple workers, use DistributedScheduler
 * with distributed locking (e.g., Redis locks).
 */

import type { IScheduler } from "../interfaces";

interface ScheduledTask {
  intervalId: NodeJS.Timeout;
  intervalMs: number;
  isRunning: boolean;
}

export class IntervalScheduler implements IScheduler {
  private tasks: Map<string, ScheduledTask>;

  constructor() {
    this.tasks = new Map();
  }

  /**
   * Schedule a recurring task
   * Runs immediately on first call, then on interval
   */
  schedule(
    name: string,
    intervalMs: number,
    task: () => Promise<void>
  ): void {
    // Cancel existing task if present
    if (this.tasks.has(name)) {
      this.cancel(name);
    }

    // Create wrapper that prevents overlapping runs
    const wrappedTask = async () => {
      const scheduled = this.tasks.get(name);
      if (!scheduled || scheduled.isRunning) {
        return;
      }

      scheduled.isRunning = true;
      try {
        await task();
      } catch (error) {
        console.error(`Scheduled task "${name}" failed:`, error);
      } finally {
        const current = this.tasks.get(name);
        if (current) {
          current.isRunning = false;
        }
      }
    };

    // Schedule on interval
    const intervalId = setInterval(wrappedTask, intervalMs);

    // Store task BEFORE running immediately (wrappedTask checks this.tasks.get)
    this.tasks.set(name, {
      intervalId,
      intervalMs,
      isRunning: false,
    });

    console.log(`Scheduled task "${name}" every ${intervalMs}ms`);

    // Run immediately after storing
    wrappedTask();
  }

  /**
   * Cancel a scheduled task
   */
  cancel(name: string): void {
    const task = this.tasks.get(name);
    if (task) {
      clearInterval(task.intervalId);
      this.tasks.delete(name);
      console.log(`Cancelled task "${name}"`);
    }
  }

  /**
   * Cancel all scheduled tasks
   */
  cancelAll(): void {
    for (const name of this.tasks.keys()) {
      this.cancel(name);
    }
    console.log("Cancelled all scheduled tasks");
  }

  /**
   * Update the interval of a scheduled task
   * Note: This will reset the interval timer
   */
  updateInterval(name: string, _newIntervalMs: number): void {
    const task = this.tasks.get(name);
    if (!task) {
      console.warn(`Cannot update interval: task "${name}" not found`);
      return;
    }

    // We need access to the original task function
    // For now, this is a no-op - would need to store the task function
    console.warn(
      `updateInterval not fully implemented - task "${name}" unchanged`
    );
  }

  /**
   * Get list of scheduled task names (for monitoring)
   */
  getScheduledTasks(): string[] {
    return Array.from(this.tasks.keys());
  }

  /**
   * Check if a task is currently running
   */
  isRunning(name: string): boolean {
    return this.tasks.get(name)?.isRunning ?? false;
  }
}
