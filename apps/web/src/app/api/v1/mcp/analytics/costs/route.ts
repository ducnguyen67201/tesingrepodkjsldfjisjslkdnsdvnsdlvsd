/**
 * MCP API: get_cost_summary
 * Cost breakdown grouped by model, day, or service.
 */
import { type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@ducsigr/db";
import { authenticateMcpRequest } from "@/lib/mcp-auth";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-responses";
import { CostTimeRangeSchema, CostGroupBySchema, TIME_RANGE_MS } from "@ducsigr/api/schemas";

const InputSchema = z.object({
  timeRange: CostTimeRangeSchema.default("7d"),
  groupBy: CostGroupBySchema.default("model"),
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
    const since = new Date(Date.now() - (TIME_RANGE_MS[input.timeRange] ?? 604_800_000));

    if (input.groupBy === "model") {
      const summaries = await prisma.costDailySummary.groupBy({
        by: ["model"],
        where: {
          projectId: auth.projectId,
          date: { gte: since },
          model: { not: "__all__" },
        },
        _sum: {
          spanCount: true,
          inputTokens: true,
          outputTokens: true,
          totalCost: true,
        },
      });

      // Convert BigInt/Decimal to number for JSON serialization
      const data = summaries.map((row) => ({
        model: row.model,
        spanCount: row._sum.spanCount ?? 0,
        inputTokens: row._sum.inputTokens !== null ? Number(row._sum.inputTokens) : 0,
        outputTokens: row._sum.outputTokens !== null ? Number(row._sum.outputTokens) : 0,
        totalCost: row._sum.totalCost !== null ? Number(row._sum.totalCost) : 0,
      }));

      return apiSuccess.ok({ groupBy: "model", data });
    }

    if (input.groupBy === "day") {
      const summaries = await prisma.costDailySummary.findMany({
        where: {
          projectId: auth.projectId,
          date: { gte: since },
          model: "__all__",
        },
        orderBy: { date: "desc" },
      });

      const data = summaries.map((row) => ({
        date: row.date,
        spanCount: row.spanCount,
        inputTokens: Number(row.inputTokens),
        outputTokens: Number(row.outputTokens),
        totalCost: Number(row.totalCost),
      }));

      return apiSuccess.ok({ groupBy: "day", data });
    }

    // groupBy === "service"
    const serviceStats = await prisma.span.groupBy({
      by: ["model"],
      where: {
        trace: { projectId: auth.projectId },
        startTime: { gte: since },
        model: { not: null },
      },
      _sum: {
        promptTokens: true,
        completionTokens: true,
        totalCost: true,
      },
      _count: true,
    });

    const data = serviceStats.map((row) => ({
      model: row.model,
      spanCount: row._count,
      promptTokens: row._sum.promptTokens ?? 0,
      completionTokens: row._sum.completionTokens ?? 0,
      totalCost: row._sum.totalCost !== null ? Number(row._sum.totalCost) : 0,
    }));

    return apiSuccess.ok({ groupBy: "service", data });
  } catch {
    return apiServerError.internal();
  }
}
