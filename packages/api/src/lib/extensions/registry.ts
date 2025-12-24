/**
 * Extension Type Registry
 *
 * Static registry for extension type handlers.
 * Follows the AdapterRegistry pattern from the alerting module.
 *
 * New extension types are added by:
 * 1. Creating a handler class that implements IExtensionTypeHandler
 * 2. Registering it in init.ts via ExtensionTypeRegistry.register()
 *
 * @example
 * ```ts
 * // In init.ts
 * ExtensionTypeRegistry.register(new ThemeHandler());
 * ExtensionTypeRegistry.register(new IngestionHandler());
 *
 * // In router
 * const handler = getExtensionHandler("THEME");
 * await handler.onInstall(ctx);
 * ```
 */

import { type ExtensionType } from "../../schemas/extensions";
import { type IExtensionTypeHandler } from "./types";

/**
 * Registry for extension type handlers.
 *
 * This is a static class that holds all registered extension type handlers.
 * Handlers are registered at application startup and used by the router
 * to delegate lifecycle operations to the appropriate handler.
 */
export class ExtensionTypeRegistry {
  private static handlers = new Map<ExtensionType, IExtensionTypeHandler>();

  /**
   * Register an extension type handler.
   *
   * @param handler - The handler to register
   * @throws Warning if handler for type already exists (will overwrite)
   */
  static register(handler: IExtensionTypeHandler): void {
    if (this.handlers.has(handler.type)) {
      console.warn(`Overwriting handler for extension type: ${handler.type}`);
    }
    this.handlers.set(handler.type, handler);
    console.log(`Registered ExtensionTypeHandler: ${handler.type}`);
  }

  /**
   * Get handler for extension type.
   *
   * @param type - The extension type
   * @returns The registered handler
   * @throws Error if no handler registered for type
   */
  static get(type: ExtensionType): IExtensionTypeHandler {
    const handler = this.handlers.get(type);
    if (!handler) {
      throw new Error(`No handler registered for extension type: ${type}`);
    }
    return handler;
  }

  /**
   * Check if handler exists for type.
   *
   * @param type - The extension type
   * @returns True if handler registered
   */
  static has(type: ExtensionType): boolean {
    return this.handlers.has(type);
  }

  /**
   * Get all registered extension types.
   *
   * @returns Array of registered extension types
   */
  static getRegisteredTypes(): ExtensionType[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Clear all registered handlers.
   * Primarily for testing purposes.
   */
  static clear(): void {
    this.handlers.clear();
  }
}

/**
 * Get extension handler for type.
 *
 * Convenience function that wraps ExtensionTypeRegistry.get().
 *
 * @param type - The extension type
 * @returns The registered handler
 * @throws Error if no handler registered for type
 */
export function getExtensionHandler(type: ExtensionType): IExtensionTypeHandler {
  return ExtensionTypeRegistry.get(type);
}
