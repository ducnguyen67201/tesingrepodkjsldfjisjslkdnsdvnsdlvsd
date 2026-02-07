/**
 * MCP API: search_spans
 * Search spans across all traces with filters.
 */
import { type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@ducsigr/db";
import { authenticateMcpRequest } from "@/lib/mcp-auth";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-responses";
import { SpanTypeSchema, TraceTimeRangeSchema, TIME_RANGE_MS } from "@ducsigr/api/schemas";

const InputSchema = z.object({
  query: z.string().optional(),
  spanType: SpanTypeSchema.optional(),
  hasError: z.boolean().optional(),
  model: z.string().optional(),
  limit: z.number().min(1).max(100).default(20),
  timeRange: TraceTimeRangeSchema.default("24h"),
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
    };

    if (input.query) {
      where.searchText = { contains: input.query, mode: "insensitive" };
    }
    if (input.spanType) where.spanType = input.spanType;
    if (input.hasError) {
      where.OR = [{ statusCode: "ERROR" }, { exceptionType: { not: null } }];
    }
    if (input.model) {
      where.model = { contains: input.model, mode: "insensitive" };
    }

    const spans = await prisma.span.findMany({
      where,
      select: {
        id: true,
        traceId: true,
        name: true,
        spanType: true,
        statusCode: true,
        durationMs: true,
        startTime: true,
        model: true,
        exceptionType: true,
        trace: {
          select: { serviceName: true },
        },
      },
      orderBy: { startTime: "desc" },
      take: input.limit,
    });

    return apiSuccess.ok({ spans });
  } catch {
    return apiServerError.internal();
  }
}
