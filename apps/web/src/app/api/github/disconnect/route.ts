import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { prisma } from "@ducsigr/db";
import { authOptions } from "@/lib/auth/config";
import { apiError, apiSuccess, apiServerError } from "@/lib/api-responses";

/**
 * Request body schema
 */
const DisconnectRequestSchema = z.object({
  workspaceId: z.string().min(1, "workspaceId is required"),
});

/**
 * POST /api/github/disconnect
 *
 * Removes GitHub App installation from a workspace.
 * Deletes the installation record (cascades to repositories).
 *
 * Body:
 * - workspaceId: string (required)
 */
export async function POST(request: NextRequest) {
  // 1. Verify authentication
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError.unauthorized("Please sign in to disconnect GitHub");
  }

  // 2. Parse and validate request body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError.invalidJson();
  }

  const parseResult = DisconnectRequestSchema.safeParse(body);
  if (!parseResult.success) {
    return apiError.validation(
      "Invalid request",
      parseResult.error.flatten().fieldErrors
    );
  }

  const { workspaceId } = parseResult.data;

  // 3. Verify workspace admin access
  const membership = await prisma.workspaceMember.findFirst({
    where: {
      workspaceId,
      userId: session.user.id,
      role: { in: ["OWNER", "ADMIN"] },
    },
  });

  if (!membership) {
    return apiError.forbidden(
      "Workspace not found or you don't have admin access"
    );
  }

  // 4. Find and delete the GitHub installation
  try {
    const installation = await prisma.gitHubInstallation.findUnique({
      where: { workspaceId },
    });

    if (!installation) {
      return apiError.notFound("GitHub installation");
    }

    // Delete installation (repositories cascade via DB)
    await prisma.gitHubInstallation.delete({
      where: { workspaceId },
    });

    return apiSuccess.ok({ success: true });
  } catch (error) {
    console.error("Error disconnecting GitHub:", error);
    return apiServerError.internal("Failed to disconnect GitHub");
  }
}
