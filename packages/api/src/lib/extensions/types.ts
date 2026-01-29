/**
 * Extension Type Handler System
 *
 * This module defines the interface for extension type handlers.
 * Each extension type (THEME, INGESTION, POLICY, WEBHOOK) has a registered handler
 * that manages its lifecycle and configuration validation.
 *
 * @example
 * ```ts
 * class ThemeHandler extends BaseExtensionHandler {
 *   readonly type = "THEME" as const;
 *   readonly requiredPermissions = ["ui:theme"] as const;
 *
 *   async onEnable(ctx: ExtensionContext): Promise<HandlerResult> {
 *     // Theme-specific activation logic
 *     return { success: true };
 *   }
 * }
 * ```
 */

import {
  type ExtensionType,
  type ExtensionManifest,
  type ExtensionPermission,
} from "../../schemas/extensions";

/**
 * Context passed to extension type handlers during lifecycle operations.
 * Contains all information needed to execute extension logic.
 */
export interface ExtensionContext {
  /** Workspace where the extension is installed */
  workspaceId: string;
  /** Extension catalog ID */
  extensionId: string;
  /** Installation record ID */
  installId: string;
  /** Full extension manifest (parsed from version) */
  manifest: ExtensionManifest;
  /** Workspace-specific configuration */
  config: Record<string, unknown>;
  /** Permissions approved during installation */
  permissions: ExtensionPermission[];
}

/**
 * Result of handler operations.
 * Used for consistent error handling across all handlers.
 */
export interface HandlerResult {
  /** Whether the operation succeeded */
  success: boolean;
  /** Error message if operation failed */
  error?: string;
  /** Optional data returned from operation */
  data?: Record<string, unknown>;
}

/**
 * Interface for extension type handlers.
 *
 * Implement this interface to add support for new extension types.
 * Each handler is responsible for:
 * - Validating type-specific manifest requirements
 * - Validating type-specific configuration
 * - Executing lifecycle hooks (install, enable, disable, uninstall, configure)
 *
 * Handlers are registered with ExtensionTypeRegistry and invoked
 * by the extensions router during lifecycle operations.
 */
export interface IExtensionTypeHandler {
  /** The extension type this handler manages */
  readonly type: ExtensionType;

  /** Permissions required for this extension type */
  readonly requiredPermissions: readonly ExtensionPermission[];

  /**
   * Validate manifest for this extension type.
   * Called during manifest import/publish.
   *
   * @param manifest - The extension manifest to validate
   * @returns HandlerResult with success status
   */
  validateManifest(manifest: ExtensionManifest): HandlerResult;

  /**
   * Validate type-specific configuration.
   * Called during configuration updates.
   *
   * @param config - The configuration to validate
   * @returns HandlerResult with success status and optional parsed data
   */
  validateConfig(config: unknown): HandlerResult;

  /**
   * Called when extension is installed to a workspace.
   *
   * @param ctx - Extension context with install details
   * @returns Promise<HandlerResult> with success status
   */
  onInstall(ctx: ExtensionContext): Promise<HandlerResult>;

  /**
   * Called when extension is enabled in a workspace.
   *
   * @param ctx - Extension context with current state
   * @returns Promise<HandlerResult> with success status
   */
  onEnable(ctx: ExtensionContext): Promise<HandlerResult>;

  /**
   * Called when extension is disabled in a workspace.
   *
   * @param ctx - Extension context with current state
   * @returns Promise<HandlerResult> with success status
   */
  onDisable(ctx: ExtensionContext): Promise<HandlerResult>;

  /**
   * Called when extension is uninstalled from a workspace.
   *
   * @param ctx - Extension context with final state
   * @returns Promise<HandlerResult> with success status
   */
  onUninstall(ctx: ExtensionContext): Promise<HandlerResult>;

  /**
   * Called when extension configuration changes.
   *
   * @param ctx - Extension context with current state
   * @param newConfig - The new configuration
   * @returns Promise<HandlerResult> with success status
   */
  onConfigure(ctx: ExtensionContext, newConfig: unknown): Promise<HandlerResult>;
}

/**
 * Base class with default implementations for extension type handlers.
 *
 * Extend this class to create new extension type handlers.
 * Override methods as needed for type-specific behavior.
 */
export abstract class BaseExtensionHandler implements IExtensionTypeHandler {
  abstract readonly type: ExtensionType;
  abstract readonly requiredPermissions: readonly ExtensionPermission[];

  /**
   * Default manifest validation - checks type matches.
   * Override for additional type-specific validation.
   */
  validateManifest(manifest: ExtensionManifest): HandlerResult {
    if (manifest.type !== this.type) {
      return { success: false, error: `Invalid type: expected ${this.type}` };
    }
    return { success: true };
  }

  /**
   * Default config validation - accepts any config.
   * Override for type-specific schema validation.
   */
  validateConfig(_config: unknown): HandlerResult {
    return { success: true };
  }

  /**
   * Default install hook - no-op.
   * Override for type-specific installation logic.
   */
  async onInstall(_ctx: ExtensionContext): Promise<HandlerResult> {
    return { success: true };
  }

  /**
   * Default enable hook - no-op.
   * Override for type-specific activation logic.
   */
  async onEnable(_ctx: ExtensionContext): Promise<HandlerResult> {
    return { success: true };
  }

  /**
   * Default disable hook - no-op.
   * Override for type-specific deactivation logic.
   */
  async onDisable(_ctx: ExtensionContext): Promise<HandlerResult> {
    return { success: true };
  }

  /**
   * Default uninstall hook - no-op.
   * Override for type-specific cleanup logic.
   */
  async onUninstall(_ctx: ExtensionContext): Promise<HandlerResult> {
    return { success: true };
  }

  /**
   * Default configure hook - no-op.
   * Override for type-specific configuration handling.
   */
  async onConfigure(_ctx: ExtensionContext, _newConfig: unknown): Promise<HandlerResult> {
    return { success: true };
  }
}
