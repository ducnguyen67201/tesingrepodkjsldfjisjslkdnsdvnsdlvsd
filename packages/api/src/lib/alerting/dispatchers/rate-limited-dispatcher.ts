/**
 * Rate Limited Dispatcher (FUTURE)
 *
 * Implementation of IDispatcher with rate limiting and circuit breaker.
 * This is a placeholder for future implementation.
 *
 * Benefits over SimpleDispatcher:
 * - Respects channel rate limits (Discord, Slack, etc.)
 * - Exponential backoff on failures
 * - Circuit breaker to prevent cascading failures
 * - Retry queue for failed dispatches
 *
 * TODO: Implement when scale requires rate limiting
 */

import type { TriggerQueueItem, DispatchResult } from "../../../schemas/alerting";
import type { IDispatcher } from "../interfaces";

export class RateLimitedDispatcher implements IDispatcher {
  constructor() {
    throw new Error(
      "RateLimitedDispatcher is not implemented yet. Use SimpleDispatcher instead."
    );
  }

  async dispatch(_items: TriggerQueueItem[]): Promise<DispatchResult> {
    throw new Error("Not implemented");
  }

  async getRateLimitStatus(_channelId: string): Promise<{
    remaining: number;
    resetAt: Date;
  }> {
    throw new Error("Not implemented");
  }

  async isCircuitOpen(_channelId: string): Promise<boolean> {
    throw new Error("Not implemented");
  }
}
