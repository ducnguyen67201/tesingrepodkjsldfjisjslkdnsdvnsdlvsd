/**
 * Alerting Module
 *
 * Main entry point for the alerting system.
 */

// Re-export adapter
export { BaseAlertingAdapter, type IAlertingAdapter } from "./adapter";

// Re-export registry
export { AdapterRegistry, getAdapter } from "./registry";

// Re-export metrics service
export { getMetric, getAllMetrics } from "./metrics-service";

// Re-export schemas and types
export * from "../../schemas/alerting";

// ============================================================
// Alert System v2 - Interfaces & Implementations
// ============================================================

// Re-export interfaces
export type {
  IAlertStore,
  ITriggerQueue,
  IDispatcher,
  IScheduler,
  AlertWithProject,
  StateMetadata,
  AlertHistoryEntry,
} from "./interfaces";

// Re-export implementations (TODAY)
export { PrismaAlertStore } from "./stores/prisma-alert-store";
export { MemoryTriggerQueue } from "./queues/memory-queue";
export { SimpleDispatcher } from "./dispatchers/simple-dispatcher";
export { IntervalScheduler } from "./schedulers/interval-scheduler";

import type { ChannelProvider } from "../../schemas/alerting";
import type { IAlertingAdapter } from "./adapter";
import { AdapterRegistry } from "./registry";

/**
 * Main entry point for getting an alerting adapter.
 *
 * @example
 * ```ts
 * import { AlertingAdapter } from "@ducsigr/api/lib/alerting";
 *
 * // Get adapter by provider
 * const discord = AlertingAdapter("DISCORD");
 * await discord.send(config, payload);
 *
 * // Or use the registry directly
 * const gmail = AlertingAdapter("GMAIL");
 * await gmail.sendTest({ email: "user@example.com" });
 * ```
 */
export function AlertingAdapter(provider: ChannelProvider): IAlertingAdapter {
  return AdapterRegistry.get(provider);
}

// Attach static methods for convenience
AlertingAdapter.register = AdapterRegistry.register.bind(AdapterRegistry);
AlertingAdapter.has = AdapterRegistry.has.bind(AdapterRegistry);
AlertingAdapter.getProviders = AdapterRegistry.getRegisteredProviders.bind(AdapterRegistry);
