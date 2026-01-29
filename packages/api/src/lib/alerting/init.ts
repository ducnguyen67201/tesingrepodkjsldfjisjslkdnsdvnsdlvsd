/**
 * Alerting Initialization
 *
 * Initialize and register all alerting adapters.
 * Call this at application startup.
 */

import { AdapterRegistry } from "./registry";
import { GmailAdapter } from "./adapters/gmail";
import { DiscordAdapter } from "./adapters/discord";
import type { ChannelProvider } from "../../schemas/alerting";

// SMTP Configuration check
const SMTP_CONFIGURED =
  process.env.SMTP_USER &&
  process.env.SMTP_PASS &&
  (process.env.SMTP_FROM ?? process.env.SMTP_USER);

/**
 * Initialize all alerting adapters.
 * Call this at application startup.
 */
export function initializeAlertingAdapters(): void {
  console.log("Initializing alerting adapters...");

  // Always register Discord (no server-side config needed)
  AdapterRegistry.register(new DiscordAdapter());

  // Only register Gmail if SMTP is configured
  if (SMTP_CONFIGURED) {
    AdapterRegistry.register(new GmailAdapter());
    console.log("Gmail adapter registered");
  }

  console.log(
    `Alerting adapters initialized: ${AdapterRegistry.getRegisteredProviders().join(", ")}`
  );
}

/**
 * Get list of available providers (for UI)
 */
export function getAvailableProviders(): string[] {
  return AdapterRegistry.getRegisteredProviders();
}

/**
 * Check if a provider is available
 */
export function isProviderAvailable(provider: string): boolean {
  return AdapterRegistry.has(provider as ChannelProvider);
}
