/**
 * MCP API: list_projects
 * Returns project info for the authenticated API key's project.
 */
import { type NextRequest } from "next/server";
import { prisma } from "@ducsigr/db";
import { authenticateMcpRequest } from "@/lib/mcp-auth";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-responses";

export async function POST(req: NextRequest) {
  const auth = await authenticateMcpRequest(req);
  if (!auth.success) return auth.response;

  try {
    const project = await prisma.project.findUnique({
      where: { id: auth.projectId },
      select: {
        id: true,
        name: true,
        createdAt: true,
        workspace: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: {
          select: {
            traces: true,
            apiKeys: true,
          },
        },
      },
    });

    if (!project) {
      return apiError.notFound("Project");
    }

    return apiSuccess.ok({ project });
  } catch {
    return apiServerError.internal();
  }
}
