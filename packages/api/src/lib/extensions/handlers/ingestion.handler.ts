/**
 * Ingestion Extension Handler (Stub)
 *
 * Handles ingestion extensions that can modify trace data during ingestion.
 * This is a stub implementation - full functionality will be added when
 * ingestion extensions are implemented.
 */

import {
  BaseExtensionHandler,
  type ExtensionContext,
  type HandlerResult,
} from "../types";
import { IngestionConfigSchema } from "../../../schemas/extensions";

/**
 * Handler for INGESTION type extensions.
 *
 * Ingestion extensions can hook into the trace ingestion pipeline
 * to transform, filter, or enrich span data.
 *
 * Supported hooks:
 * - after_parse: After JSON/protobuf parsing
 * - after_normalize: After data normalization
 * - after_validate: After schema validation
 * - after_scrub: After PII scrubbing
 *
 * @todo Full implementation pending ingest-node integration
 */
export class IngestionHandler extends BaseExtensionHandler {
  readonly type = "INGESTION" as const;
  readonly requiredPermissions = ["ingest:read-span", "ingest:write-span"] as const;

  /**
   * Validate ingestion-specific configuration.
   *
   * Uses IngestionConfigSchema to validate:
   * - hooks: Array of hook names to register
   * - priority: Execution order (0-100, default 50)
   */
  validateConfig(config: unknown): HandlerResult {
    const result = IngestionConfigSchema.safeParse(config);
    if (!result.success) {
      return {
        success: false,
        error: `Invalid ingestion config: ${result.error.message}`,
      };
    }
    return { success: true, data: result.data };
  }

  /**
   * Called when ingestion handler is enabled.
   *
   * @todo Register hooks with ingest pipeline
   */
  async onEnable(ctx: ExtensionContext): Promise<HandlerResult> {
    console.log(`Ingestion handler ${ctx.extensionId} enabled for workspace ${ctx.workspaceId}`);
    // TODO: Register hooks with ingest-node pipeline
    return { success: true };
  }

  /**
   * Called when ingestion handler is disabled.
   *
   * @todo Unregister hooks from ingest pipeline
   */
  async onDisable(ctx: ExtensionContext): Promise<HandlerResult> {
    console.log(`Ingestion handler ${ctx.extensionId} disabled for workspace ${ctx.workspaceId}`);
    // TODO: Unregister hooks from ingest-node pipeline
    return { success: true };
  }
}
