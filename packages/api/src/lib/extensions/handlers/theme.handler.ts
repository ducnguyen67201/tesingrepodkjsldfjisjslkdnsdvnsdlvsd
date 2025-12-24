/**
 * Theme Extension Handler
 *
 * Handles theme extensions that customize workspace appearance.
 * Theme extensions can modify CSS variables, fonts, and other visual settings.
 */

import {
  BaseExtensionHandler,
  type ExtensionContext,
  type HandlerResult,
} from "../types";
import { ThemeConfigSchema } from "../../../schemas/extensions";

/**
 * Handler for THEME type extensions.
 *
 * Theme extensions are simple config-only extensions that store
 * CSS variables and font preferences. They don't execute any code,
 * just provide configuration that the frontend applies.
 */
export class ThemeHandler extends BaseExtensionHandler {
  readonly type = "THEME" as const;
  readonly requiredPermissions = ["ui:theme"] as const;

  /**
   * Validate theme-specific configuration.
   *
   * Uses ThemeConfigSchema to validate:
   * - version (defaults to "1.0")
   * - fonts (body, heading)
   * - cssVars (key-value pairs for CSS custom properties)
   */
  validateConfig(config: unknown): HandlerResult {
    const result = ThemeConfigSchema.safeParse(config);
    if (!result.success) {
      return {
        success: false,
        error: `Invalid theme config: ${result.error.message}`,
      };
    }
    return { success: true, data: result.data };
  }

  /**
   * Called when theme is enabled.
   *
   * Theme activation is handled on the frontend - this hook
   * is for any server-side logging or analytics.
   */
  async onEnable(ctx: ExtensionContext): Promise<HandlerResult> {
    console.log(`Theme ${ctx.extensionId} enabled for workspace ${ctx.workspaceId}`);
    return { success: true };
  }

  /**
   * Called when theme is disabled.
   *
   * Theme deactivation is handled on the frontend - this hook
   * resets to default theme handling.
   */
  async onDisable(ctx: ExtensionContext): Promise<HandlerResult> {
    console.log(`Theme ${ctx.extensionId} disabled for workspace ${ctx.workspaceId}`);
    return { success: true };
  }

  /**
   * Called when theme config changes.
   *
   * Validates new config and logs the change.
   */
  async onConfigure(ctx: ExtensionContext, newConfig: unknown): Promise<HandlerResult> {
    const validation = this.validateConfig(newConfig);
    if (!validation.success) {
      return validation;
    }

    console.log(
      `Theme ${ctx.extensionId} configured for workspace ${ctx.workspaceId}`,
      validation.data
    );

    return { success: true, data: validation.data };
  }
}
