import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@ducsigr/db";
import { validateInternalSecret } from "@ducsigr/shared";
import { env } from "@/lib/env";
import { internalApiError, internalApiSuccess } from "@/lib/api-responses";

// Constants
const INTERNAL_SECRET_HEADER = "X-Internal-Secret";

// Input validation schema
const validateKeySchema = z.object({
  hashedKey: z
    .string()
    .length(64, "Hash must be 64 characters")
    .regex(/^[a-f0-9]+$/i, "Hash must be hexadecimal"),
});

/**
 * Internal API for validating API key hashes.
 * Called by Go ingest service.
 *
 * Security measures:
 * 1. X-Internal-Secret header validation (constant-time)
 * 2. Input validation (hash format)
 * 3. Expiration check
 * 4. No sensitive data in logs
 */
export async function POST(req: NextRequest) {
  // 1. Validate internal secret (constant-time)
  const providedSecret = req.headers.get(INTERNAL_SECRET_HEADER);
  if (!validateInternalSecret(providedSecret, env.INTERNAL_API_SECRET)) {
    console.warn("Invalid internal API secret attempt", {
      ip: req.headers.get("x-forwarded-for") || "unknown",
      timestamp: new Date().toISOString(),
    });
    return internalApiSuccess.invalid("Unauthorized");
  }

  // 2. Parse and validate input
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return internalApiSuccess.invalid("Invalid JSON");
  }

  const parseResult = validateKeySchema.safeParse(body);
  if (!parseResult.success) {
    return internalApiSuccess.invalid("Invalid hash format");
  }

  const { hashedKey } = parseResult.data;

  // 3. Look up key by hash (indexed for performance)
  try {
    const apiKey = await prisma.apiKey.findUnique({
      where: { hashedKey },
      select: {
        id: true,
        projectId: true,
        expiresAt: true,
      },
    });

    // 4. Check existence
    if (!apiKey) {
      console.info("API key validation failed: key not found", {
        timestamp: new Date().toISOString(),
      });
      return internalApiSuccess.invalid("Invalid or expired API key");
    }

    // 5. Check expiration
    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      console.info("API key validation failed: expired", {
        keyId: apiKey.id,
        expiredAt: apiKey.expiresAt.toISOString(),
      });
      return internalApiSuccess.invalid("Invalid or expired API key");
    }

    // 6. Success - return project ID
    console.info("API key validated", {
      keyId: apiKey.id,
      projectId: apiKey.projectId,
    });

    return internalApiSuccess.valid({ projectId: apiKey.projectId });
  } catch (error) {
    console.error("Database error during key validation:", error);
    return internalApiError.internal();
  }
}
