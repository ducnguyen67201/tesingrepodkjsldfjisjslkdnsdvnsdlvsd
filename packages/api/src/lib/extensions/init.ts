/**
 * Extension Handlers Initialization
 *
 * Registers all extension type handlers with the ExtensionTypeRegistry.
 * Call this function at application startup before handling any extension requests.
 *
 * @example
 * ```ts
 * // In app startup
 * import { initializeExtensionHandlers } from "./lib/extensions/init";
 * initializeExtensionHandlers();
 * ```
 */

import { ExtensionTypeRegistry } from "./registry";
import { ThemeHandler } from "./handlers/theme.handler";
import { IngestionHandler } from "./handlers/ingestion.handler";

/** Flag to prevent double initialization */
let initialized = false;

/**
 * Initialize all extension type handlers.
 *
 * Registers handlers for:
 * - THEME: Visual customization extensions
 * - INGESTION: Trace data processing extensions
 * - POLICY: (Future) Policy pack extensions
 * - WEBHOOK: (Future) Webhook notification extensions
 */
export function initializeExtensionHandlers(): void {
  if (initialized) {
    console.log("Extension handlers already initialized, skipping");
    return;
  }

  console.log("Initializing extension type handlers...");

  // Register core handlers
  ExtensionTypeRegistry.register(new ThemeHandler());
  ExtensionTypeRegistry.register(new IngestionHandler());

  // Future handlers will be added here:
  // ExtensionTypeRegistry.register(new PolicyHandler());
  // ExtensionTypeRegistry.register(new WebhookHandler());

  initialized = true;
  console.log(
    `Extension handlers initialized: ${ExtensionTypeRegistry.getRegisteredTypes().join(", ")}`
  );
}

/**
 * Reset initialization state.
 * For testing purposes only.
 */
export function resetExtensionHandlers(): void {
  ExtensionTypeRegistry.clear();
  initialized = false;
}
