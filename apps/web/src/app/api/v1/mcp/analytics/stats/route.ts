/**
 * MCP API: get_trace_stats
 * Aggregate statistics with latency percentiles and error rates.
 */
import { type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@ducsigr/db";
import { authenticateMcpRequest } from "@/lib/mcp-auth";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-responses";
import { TraceTimeRangeSchema, TIME_RANGE_MS } from "@ducsigr/api/schemas";

const InputSchema = z.object({
  timeRange: TraceTimeRangeSchema.default("24h"),
  serviceName: z.string().optional(),
});

function calculatePercentiles(
  values: number[],
  percentiles: number[]
): Record<string, number> {
  if (values.length === 0) {
    return Object.fromEntries(percentiles.map((p) => [`p${p}`, 0]));
  }
  const result: Record<string, number> = {};
  for (const p of percentiles) {
    const index = Math.ceil((p / 100) * values.length) - 1;
    result[`p${p}`] = values[Math.max(0, index)] ?? 0;
  }
  return result;
}

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

    if (input.serviceName) where.serviceName = input.serviceName;

    const [totalCount, errorCount, durations] = await Promise.all([
      prisma.trace.count({ where }),
      prisma.trace.count({ where: { ...where, hasError: true } }),
      prisma.trace.findMany({
        where: { ...where, durationMs: { not: null } },
        select: { durationMs: true },
        orderBy: { durationMs: "asc" },
      }),
    ]);

    const durationValues = durations
      .map((t) => t.durationMs)
      .filter((v): v is number => v !== null);
    const percentiles = calculatePercentiles(durationValues, [50, 90, 95, 99]);

    const serviceStats = await prisma.trace.groupBy({
      by: ["serviceName"],
      where,
      _count: true,
      _avg: { durationMs: true },
    });

    const errorRateByService = await prisma.trace.groupBy({
      by: ["serviceName"],
      where: { ...where, hasError: true },
      _count: true,
    });

    return apiSuccess.ok({
      totalCount,
      errorCount,
      percentiles,
      serviceStats,
      errorRateByService,
    });
  } catch {
    return apiServerError.internal();
  }
}
