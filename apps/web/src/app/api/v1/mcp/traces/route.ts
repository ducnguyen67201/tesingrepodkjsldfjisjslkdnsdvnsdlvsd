/**
 * MCP API: list_traces
 * Lists traces with filters and cursor-based pagination.
 */
import { type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@ducsigr/db";
import { authenticateMcpRequest } from "@/lib/mcp-auth";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-responses";
import { TraceTimeRangeSchema, TIME_RANGE_MS } from "@ducsigr/api/schemas";

const InputSchema = z.object({
  limit: z.number().min(1).max(100).default(20),
  cursor: z.string().optional(),
  timeRange: TraceTimeRangeSchema.default("24h"),
  hasError: z.boolean().optional(),
  search: z.string().optional(),
  serviceName: z.string().optional(),
  minDurationMs: z.number().optional(),
  maxDurationMs: z.number().optional(),
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
      projectId: auth.projectId,
      startTime: { gte: since },
    };

    if (input.hasError !== undefined) where.hasError = input.hasError;
    if (input.serviceName) where.serviceName = input.serviceName;
    if (input.search) {
      where.searchText = { contains: input.search, mode: "insensitive" };
    }
    if (input.minDurationMs !== undefined || input.maxDurationMs !== undefined) {
      const dur: Record<string, number> = {};
      if (input.minDurationMs !== undefined) dur.gte = input.minDurationMs;
      if (input.maxDurationMs !== undefined) dur.lte = input.maxDurationMs;
      where.durationMs = dur;
    }

    const cursor = input.cursor ? { id: input.cursor } : undefined;

    const [traces, total] = await Promise.all([
      prisma.trace.findMany({
        where,
        select: {
          id: true,
          serviceName: true,
          rootSpanName: true,
          durationMs: true,
          errorCount: true,
          spanCount: true,
          startTime: true,
          hasError: true,
        },
        orderBy: { startTime: "desc" },
        take: input.limit + 1,
        cursor,
        skip: cursor ? 1 : 0,
      }),
      prisma.trace.count({ where }),
    ]);

    const hasMore = traces.length > input.limit;
    const displayTraces = hasMore ? traces.slice(0, -1) : traces;
    const nextCursor = hasMore ? traces[traces.length - 1]?.id : undefined;

    return apiSuccess.ok({
      traces: displayTraces,
      total,
      nextCursor: nextCursor ?? null,
    });
  } catch {
    return apiServerError.internal();
  }
}
