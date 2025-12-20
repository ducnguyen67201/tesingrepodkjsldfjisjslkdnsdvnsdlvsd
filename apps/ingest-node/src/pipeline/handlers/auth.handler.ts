/**
 * Auth Handler
 *
 * Fourth handler in the pipeline. Responsible for:
 * 1. Extracting API key from request headers
 * 2. Validating API key against database
 * 3. Binding request to project
 *
 * TODO: Full implementation in Phase 6
 */
import { logger } from "../../lib/logger.js";
import { metrics } from "../../lib/metrics.js";
import type {
  PipelineContext,
  PipelineHandler,
  HandlerResult,
} from "../types.js";
import { PipelineErrorCodes } from "../types.js";

/**
 * Auth Handler - Validates API key and binds to project
 */
export class AuthHandler implements PipelineHandler {
  readonly name = "AuthHandler";

  async handle(ctx: PipelineContext): Promise<HandlerResult> {
    const apiKey = this.extractApiKey(ctx);

    if (!apiKey) {
      logger.warn("Missing API key in request");
      metrics.rejectCounter.inc({ reason: "missing_api_key" });

      return {
        continue: false,
        error: {
          code: PipelineErrorCodes.MISSING_API_KEY,
          message: "API key is required. Provide it via Authorization header (Bearer token) or X-API-Key header.",
          httpStatus: 401,
        },
      };
    }

    // TODO: Phase 6 - Implement full API key validation
    // 1. Hash the API key
    // 2. Look up in database
    // 3. Check expiration
    // 4. Set projectId from key record

    // For now, use a placeholder project ID for development
    // This will be replaced with actual database lookup in Phase 6
    if (process.env.NODE_ENV === "development") {
      logger.debug("Development mode: using placeholder project binding");
      ctx.projectId = "dev-project-placeholder";
      ctx.apiKeyId = "dev-apikey-placeholder";

      // Update normalized traces with projectId
      if (ctx.normalizedTraces) {
        for (const trace of ctx.normalizedTraces) {
          trace.projectId = ctx.projectId;
        }
      }

      return { continue: true };
    }

    // In production, require actual API key validation
    logger.warn({ apiKeyPrefix: apiKey.substring(0, 8) }, "API key validation not yet implemented");
    metrics.rejectCounter.inc({ reason: "invalid_api_key" });

    return {
      continue: false,
      error: {
        code: PipelineErrorCodes.INVALID_API_KEY,
        message: "API key validation not yet implemented",
        httpStatus: 401,
      },
    };
  }

  /**
   * Extract API key from request headers
   */
  private extractApiKey(ctx: PipelineContext): string | null {
    // Check Authorization header (Bearer token)
    const authHeader = ctx.req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      return authHeader.slice(7);
    }

    // Check X-API-Key header
    const xApiKey = ctx.req.headers["x-api-key"];
    if (typeof xApiKey === "string") {
      return xApiKey;
    }

    return null;
  }
}
