/**
 * MCP API: list_alerts
 * List alerts for the project with recent trigger history.
 */
import { type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@ducsigr/db";
import { authenticateMcpRequest } from "@/lib/mcp-auth";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-responses";

const InputSchema = z.object({
  limit: z.number().min(1).max(50).default(20),
  enabled: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const auth = await authenticateMcpRequest(req);
  if (!auth.success) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError.invalidJson();
  }

  const parsed = InputSchema.safeParse(body);
  if (!parsed.success) {
    return apiError.validation("Invalid input", parsed.error.flatten());
  }

  const input = parsed.data;

  try {
    const where: Record<string, unknown> = { projectId: auth.projectId };
    if (input.enabled !== undefined) where.enabled = input.enabled;

    const alerts = await prisma.alert.findMany({
      where,
      select: {
        id: true,
        name: true,
        type: true,
        severity: true,
        state: true,
        threshold: true,
        operator: true,
        windowMins: true,
        enabled: true,
        lastTriggeredAt: true,
        history: {
          take: 3,
          orderBy: { triggeredAt: "desc" },
          select: {
            id: true,
            state: true,
            value: true,
            triggeredAt: true,
          },
        },
        _count: {
          select: { rcaAnalyses: true },
        },
      },
      orderBy: { lastTriggeredAt: "desc" },
      take: input.limit,
    });

    return apiSuccess.ok({ alerts });
  } catch {
    return apiServerError.internal();
  }
}
