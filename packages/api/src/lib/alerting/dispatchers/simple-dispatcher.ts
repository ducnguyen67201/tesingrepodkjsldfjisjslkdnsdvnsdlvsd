/**
 * Simple Dispatcher
 *
 * Implementation of IDispatcher using simple HTTP POST.
 * This is the "TODAY" implementation - direct HTTP calls to batch endpoint.
 *
 * For production at scale, use RateLimitedDispatcher with backoff and circuit breaker.
 */

import { z } from "zod";
import type { TriggerQueueItem, DispatchResult } from "../../../schemas/alerting";
import type { IDispatcher } from "../interfaces";

// Response schema from batch trigger endpoint
const BatchTriggerResponseSchema = z.object({
  results: z.array(
    z.object({
      notifiedVia: z.array(z.string()),
    })
  ),
});

export class SimpleDispatcher implements IDispatcher {
  private triggerUrl: string;
  private secret: string;

  constructor(triggerUrl: string, secret: string) {
    this.triggerUrl = triggerUrl;
    this.secret = secret;
  }

  /**
   * Dispatch notifications for triggered alerts via batch endpoint
   */
  async dispatch(items: TriggerQueueItem[]): Promise<DispatchResult> {
    if (items.length === 0) {
      return { success: true, sent: 0, failed: 0 };
    }

    try {
      // Serialize dates to ISO strings for JSON
      const serializedItems = items.map((item) => ({
        ...item,
        queuedAt: item.queuedAt.toISOString(),
      }));

      const response = await fetch(this.triggerUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Secret": this.secret,
        },
        body: JSON.stringify({ alerts: serializedItems }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Dispatch failed: ${response.status} - ${errorText}`);
        return {
          success: false,
          sent: 0,
          failed: items.length,
          errors: [`HTTP ${response.status}: ${errorText}`],
        };
      }

      const json: unknown = await response.json();
      const parsed = BatchTriggerResponseSchema.safeParse(json);

      // Count successes based on channels notified
      const sent = parsed.success
        ? parsed.data.results.filter((r) => r.notifiedVia.length > 0).length
        : items.length; // Assume success if response format unexpected
      const failed = items.length - sent;

      return {
        success: failed === 0,
        sent,
        failed,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("Dispatch error:", errorMessage);
      return {
        success: false,
        sent: 0,
        failed: items.length,
        errors: [errorMessage],
      };
    }
  }
}
