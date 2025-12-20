/**
 * Auth Handler
 *
 * Fifth handler in the pipeline (after ScrubHandler). Responsible for:
 * 1. Extracting API key from request headers
 * 2. Hashing and validating API key against database
 * 3. Checking expiration
 * 4. Binding request to project
 * 5. Updating lastUsedAt timestamp (non-blocking)
 *
 * Security measures:
 * - SHA-256 hashing for API key lookup
 * - Expiration check
 * - Constant-time comparison not needed (database lookup is the bottleneck)
 * - No sensitive data in logs (only key prefix)
 */
import { logger } from "../../lib/logger.js";
import { metrics } from "../../lib/metrics.js";
import { prisma } from "../../lib/db.js";
import { hashApiKey } from "@cognobserve/shared";
import type {
  PipelineContext,
  PipelineHandler,
  HandlerResult,
} from "../types.js";
import { PipelineErrorCodes } from "../types.js";

/**
 * Selected fields from ApiKey for auth validation
 */
interface ApiKeyValidation {
  id: string;
  projectId: string;
  expiresAt: Date | null;
}

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

    // Log only prefix for security (never log full key)
    const keyPrefix = apiKey.substring(0, 12);

    try {
      // Hash the API key using SHA-256
      const hashedKey = hashApiKey(apiKey);

      // Look up key by hash (indexed for performance)
      const keyRecord = await prisma.apiKey.findUnique({
        where: { hashedKey },
        select: {
          id: true,
          projectId: true,
          expiresAt: true,
        },
      });

      // Key not found
      if (!keyRecord) {
        logger.warn({ keyPrefix }, "API key not found");
        metrics.rejectCounter.inc({ reason: "invalid_api_key" });

        return {
          continue: false,
          error: {
            code: PipelineErrorCodes.INVALID_API_KEY,
            message: "Invalid API key",
            httpStatus: 401,
          },
        };
      }

      // Check expiration
      if (this.isExpired(keyRecord)) {
        logger.warn(
          { keyPrefix, expiredAt: keyRecord.expiresAt?.toISOString() },
          "API key expired"
        );
        metrics.rejectCounter.inc({ reason: "expired_api_key" });

        return {
          continue: false,
          error: {
            code: PipelineErrorCodes.INVALID_API_KEY,
            message: "API key has expired",
            httpStatus: 401,
          },
        };
      }

      // Success - bind to project
      ctx.projectId = keyRecord.projectId;
      ctx.apiKeyId = keyRecord.id;

      // Update normalized traces with projectId
      if (ctx.normalizedTraces) {
        for (const trace of ctx.normalizedTraces) {
          trace.projectId = keyRecord.projectId;
        }
      }

      logger.debug(
        { keyPrefix, projectId: keyRecord.projectId },
        "API key validated"
      );

      // Update lastUsedAt timestamp (non-blocking, fire-and-forget)
      this.updateLastUsedAt(keyRecord.id).catch((err) => {
        logger.warn({ error: err, keyId: keyRecord.id }, "Failed to update lastUsedAt");
      });

      return { continue: true };
    } catch (error) {
      logger.error({ error, keyPrefix }, "Database error during API key validation");
      metrics.rejectCounter.inc({ reason: "auth_error" });

      return {
        continue: false,
        error: {
          code: PipelineErrorCodes.INTERNAL_ERROR,
          message: "Authentication service error",
          httpStatus: 500,
        },
      };
    }
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

  /**
   * Check if API key is expired
   */
  private isExpired(keyRecord: ApiKeyValidation): boolean {
    if (!keyRecord.expiresAt) {
      return false; // No expiration set
    }
    return keyRecord.expiresAt < new Date();
  }

  /**
   * Update lastUsedAt timestamp (non-blocking)
   *
   * This is fire-and-forget to not impact request latency.
   * Failures are logged but don't affect the request.
   */
  private async updateLastUsedAt(keyId: string): Promise<void> {
    await prisma.apiKey.update({
      where: { id: keyId },
      data: { lastUsedAt: new Date() },
    });
  }
}
