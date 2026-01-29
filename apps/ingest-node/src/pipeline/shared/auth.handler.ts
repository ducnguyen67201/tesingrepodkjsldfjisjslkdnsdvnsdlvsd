/**
 * Auth Handler (Shared)
 *
 * Generic authentication handler that works with any pipeline context.
 * Validates API key and sets projectId/apiKeyId on context.
 */
import { logger } from "../../lib/logger.js";
import { validateApiKey } from "../../lib/auth.js";
import type {
  BasePipelineContext,
  PipelineHandler,
  HandlerResult,
} from "./types.js";

/**
 * Auth Handler - Validates API key and binds to project
 *
 * Works with any context that extends BasePipelineContext.
 */
export class AuthHandler<T extends BasePipelineContext>
  implements PipelineHandler<T>
{
  readonly name = "AuthHandler";

  async handle(ctx: T): Promise<HandlerResult> {
    const result = await validateApiKey(ctx.req);

    if (!result.success) {
      return {
        continue: false,
        error: {
          code: result.error.code,
          message: result.error.message,
          httpStatus: result.error.httpStatus,
        },
      };
    }

    // Bind to project
    ctx.projectId = result.apiKey.projectId;
    ctx.apiKeyId = result.apiKey.id;

    logger.debug(
      { projectId: result.apiKey.projectId },
      "Request authenticated"
    );

    return { continue: true };
  }
}
