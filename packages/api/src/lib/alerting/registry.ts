/**
 * Adapter Registry
 *
 * Registry for AlertingAdapter implementations.
 * Allows runtime registration and retrieval of adapters.
 */

import type { ChannelProvider } from "../../schemas/alerting";
import type { IAlertingAdapter } from "./adapter";

/**
 * Registry for AlertingAdapter implementations.
 *
 * @example
 * ```ts
 * // Register adapters at startup
 * AdapterRegistry.register(new GmailAdapter());
 * AdapterRegistry.register(new DiscordAdapter());
 *
 * // Get adapter by provider
 * const adapter = AdapterRegistry.get("DISCORD");
 * await adapter.send(config, payload);
 * ```
 */
export class AdapterRegistry {
  private static adapters = new Map<ChannelProvider, IAlertingAdapter>();

  /**
   * Register an adapter for a provider
   */
  static register(adapter: IAlertingAdapter): void {
    if (this.adapters.has(adapter.provider)) {
      console.warn(`Overwriting existing adapter for ${adapter.provider}`);
    }
    this.adapters.set(adapter.provider, adapter);
    console.log(`Registered AlertingAdapter: ${adapter.provider}`);
  }

  /**
   * Get adapter for a provider
   * @throws Error if adapter not registered
   */
  static get(provider: ChannelProvider): IAlertingAdapter {
    const adapter = this.adapters.get(provider);
    if (!adapter) {
      throw new Error(`No adapter registered for provider: ${provider}`);
    }
    return adapter;
  }

  /**
   * Check if adapter is registered
   */
  static has(provider: ChannelProvider): boolean {
    return this.adapters.has(provider);
  }

  /**
   * Get all registered providers
   */
  static getRegisteredProviders(): ChannelProvider[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * Clear all adapters (for testing)
   */
  static clear(): void {
    this.adapters.clear();
  }
}

/**
 * Convenience function to get adapter
 */
export function getAdapter(provider: ChannelProvider): IAlertingAdapter {
  return AdapterRegistry.get(provider);
}
