/**
 * Extensions Module
 *
 * Provides the extension type handler system for the Extensions Hub.
 *
 * @example
 * ```ts
 * import {
 *   initializeExtensionHandlers,
 *   getExtensionHandler,
 *   ExtensionTypeRegistry,
 * } from "./lib/extensions";
 *
 * // At app startup
 * initializeExtensionHandlers();
 *
 * // In router
 * const handler = getExtensionHandler("THEME");
 * await handler.onInstall(ctx);
 * ```
 */

// Types
export type {
  ExtensionContext,
  HandlerResult,
  IExtensionTypeHandler,
} from "./types";
export { BaseExtensionHandler } from "./types";

// Registry
export { ExtensionTypeRegistry, getExtensionHandler } from "./registry";

// Initialization
export { initializeExtensionHandlers, resetExtensionHandlers } from "./init";

// Handlers (for direct access if needed)
export { ThemeHandler } from "./handlers/theme.handler";
export { IngestionHandler } from "./handlers/ingestion.handler";

// Built-in extensions
export { ensureBuiltinExtensions, getBuiltinExtensionSlugs } from "./builtins";
