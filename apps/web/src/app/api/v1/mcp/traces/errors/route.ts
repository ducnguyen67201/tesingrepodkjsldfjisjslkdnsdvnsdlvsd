/**
 * MCP API: get_error_traces
 * Returns error spans grouped by exception type.
 */
import { type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@ducsigr/db";
import { authenticateMcpRequest } from "@/lib/mcp-auth";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-responses";
import { ErrorTimeRangeSchema, TIME_RANGE_MS } from "@ducsigr/api/schemas";

const InputSchema = z.object({
  limit: z.number().min(1).max(50).default(10),
  timeRange: ErrorTimeRangeSchema.default("24h"),
  exceptionType: z.string().optional(),
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
    const since = new Date(Date.now() - (TIME_RANGE_MS[input.timeRange] ?? 86_400_000));

    const where: Record<string, unknown> = {
      trace: { projectId: auth.projectId },
      startTime: { gte: since },
      OR: [{ statusCode: "ERROR" }, { exceptionType: { not: null } }],
    };

    if (input.exceptionType) {
      where.exceptionType = input.exceptionType;
    }

    const errorSpans = await prisma.span.findMany({
      where,
      select: {
        id: true,
        name: true,
        exceptionType: true,
        exceptionMessage: true,
        statusMessage: true,
        startTime: true,
        trace: {
          select: {
            id: true,
            serviceName: true,
            rootSpanName: true,
          },
        },
      },
      orderBy: { startTime: "desc" },
      take: input.limit,
    });

    return apiSuccess.ok({ errorSpans });
  } catch {
    return apiServerError.internal();
  }
}
