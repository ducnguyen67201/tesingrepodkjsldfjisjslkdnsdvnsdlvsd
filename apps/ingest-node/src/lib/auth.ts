/**
 * Shared Auth Utilities
 *
 * Core authentication logic shared across pipeline handlers.
 * Extracts API key validation to avoid duplication.
 */
import type { Request } from "express";
import { prisma } from "./db.js";
import { logger } from "./logger.js";
import { metrics } from "./metrics.js";
import { hashApiKey } from "@cognobserve/shared";

/**
 * Validated API key result
 */
export interface ValidatedApiKey {
  id: string;
  projectId: string;
}

/**
 * Auth error result
 */
export interface AuthError {
  code: string;
  message: string;
  httpStatus: number;
}

/**
 * Auth validation result
 */
export type AuthResult =
  | { success: true; apiKey: ValidatedApiKey }
  | { success: false; error: AuthError };

/**
 * Error codes for auth failures
 */
export const AUTH_ERROR_CODES = {
  MISSING_API_KEY: "MISSING_API_KEY",
  INVALID_API_KEY: "INVALID_API_KEY",
  EXPIRED_API_KEY: "EXPIRED_API_KEY",
  AUTH_ERROR: "AUTH_ERROR",
} as const;

/**
 * Extract API key from request headers
 *
 * Supports:
 * - Authorization: Bearer <token>
 * - X-API-Key: <token>
 */
export function extractApiKey(req: Request): string | null {
  // Check Authorization header (Bearer token)
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  // Check X-API-Key header
  const xApiKey = req.headers["x-api-key"];
  if (typeof xApiKey === "string" && xApiKey) {
    return xApiKey;
  }

  return null;
}

/**
 * Validate API key and return project binding
 *
 * This is the core auth logic shared by all pipelines:
 * 1. Extract API key from headers
 * 2. Hash and look up in database
 * 3. Check expiration
 * 4. Update lastUsedAt (non-blocking)
 * 5. Return validated result or error
 */
export async function validateApiKey(req: Request): Promise<AuthResult> {
  const apiKey = extractApiKey(req);

  if (!apiKey) {
    logger.warn("Missing API key in request");
    metrics.rejectCounter.inc({ reason: "missing_api_key" });

    return {
      success: false,
      error: {
        code: AUTH_ERROR_CODES.MISSING_API_KEY,
        message:
          "API key is required. Provide via Authorization header (Bearer token) or X-API-Key header.",
        httpStatus: 401,
      },
    };
  }

  // Log only prefix for security
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
        success: false,
        error: {
          code: AUTH_ERROR_CODES.INVALID_API_KEY,
          message: "Invalid API key",
          httpStatus: 401,
        },
      };
    }

    // Check expiration
    if (keyRecord.expiresAt && keyRecord.expiresAt < new Date()) {
      logger.warn(
        { keyPrefix, expiredAt: keyRecord.expiresAt.toISOString() },
        "API key expired"
      );
      metrics.rejectCounter.inc({ reason: "expired_api_key" });

      return {
        success: false,
        error: {
          code: AUTH_ERROR_CODES.EXPIRED_API_KEY,
          message: "API key has expired",
          httpStatus: 401,
        },
      };
    }

    logger.debug(
      { keyPrefix, projectId: keyRecord.projectId },
      "API key validated"
    );

    // Update lastUsedAt timestamp (non-blocking, fire-and-forget)
    prisma.apiKey
      .update({
        where: { id: keyRecord.id },
        data: { lastUsedAt: new Date() },
      })
      .catch((err) => {
        logger.warn({ error: err, keyId: keyRecord.id }, "Failed to update lastUsedAt");
      });

    return {
      success: true,
      apiKey: {
        id: keyRecord.id,
        projectId: keyRecord.projectId,
      },
    };
  } catch (error) {
    logger.error({ error, keyPrefix }, "Database error during API key validation");
    metrics.rejectCounter.inc({ reason: "auth_error" });

    return {
      success: false,
      error: {
        code: AUTH_ERROR_CODES.AUTH_ERROR,
        message: "Authentication service error",
        httpStatus: 500,
      },
    };
  }
}
