/**
 * Distributed Scheduler (FUTURE)
 *
 * Implementation of IScheduler with distributed locking.
 * This is a placeholder for future implementation.
 *
 * Benefits over IntervalScheduler:
 * - Only one worker runs each task (distributed lock)
 * - Leader election for task ownership
 * - Supports horizontal scaling
 *
 * TODO: Implement when scale requires multiple workers
 */

import type { IScheduler } from "../interfaces";

export class DistributedScheduler implements IScheduler {
  constructor() {
    throw new Error(
      "DistributedScheduler is not implemented yet. Use IntervalScheduler instead."
    );
  }

  schedule(
    _name: string,
    _intervalMs: number,
    _task: () => Promise<void>
  ): void {
    throw new Error("Not implemented");
  }

  cancel(_name: string): void {
    throw new Error("Not implemented");
  }

  cancelAll(): void {
    throw new Error("Not implemented");
  }

  updateInterval(_name: string, _newIntervalMs: number): void {
    throw new Error("Not implemented");
  }
}
