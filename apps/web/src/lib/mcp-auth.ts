/**
 * Shared API key auth for MCP API routes.
 *
 * Authenticates requests via `Authorization: Bearer <api_key>`.
 * Returns the resolved projectId on success, or an error response.
 */
import type { NextRequest } from "next/server";
import { prisma } from "@ducsigr/db";
import { hashApiKey } from "@/lib/api-keys";
import { apiError, apiServerError } from "@/lib/api-responses";

type AuthSuccess = { success: true; projectId: string };
type AuthFailure = { success: false; response: ReturnType<typeof apiError.unauthorized> };
type AuthResult = AuthSuccess | AuthFailure;

export async function authenticateMcpRequest(req: NextRequest): Promise<AuthResult> {
  const authHeader = req.headers.get("authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return {
      success: false,
      response: apiError.unauthorized("Missing or invalid Authorization header"),
    };
  }

  const apiKey = authHeader.slice(7);
  if (!apiKey) {
    return {
      success: false,
      response: apiError.unauthorized("Empty API key"),
    };
  }

  try {
    const hashedKey = hashApiKey(apiKey);

    const keyRecord = await prisma.apiKey.findUnique({
      where: { hashedKey },
      select: {
        id: true,
        projectId: true,
        expiresAt: true,
      },
    });

    if (!keyRecord) {
      return { success: false, response: apiError.invalidApiKey() };
    }

    if (keyRecord.expiresAt && keyRecord.expiresAt < new Date()) {
      return { success: false, response: apiError.invalidApiKey() };
    }

    // Fire-and-forget lastUsedAt update
    prisma.apiKey
      .update({
        where: { id: keyRecord.id },
        data: { lastUsedAt: new Date() },
      })
      .catch(() => {});

    return { success: true, projectId: keyRecord.projectId };
  } catch {
    return { success: false, response: apiServerError.internal() };
  }
}
