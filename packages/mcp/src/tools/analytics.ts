import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ApiClient } from "../lib/api-client.js";
import {
  formatCostByModel,
  formatCostByDay,
  formatCostByService,
  formatTraceStats,
  formatDuration,
} from "../lib/formatters.js";
import { CostTimeRangeSchema, CostGroupBySchema, TimeRangeSchema } from "../lib/schemas.js";
import { textResult } from "../lib/errors.js";

// ============================================================
// Schemas
// ============================================================

const GetCostSummaryInputSchema = z.object({
  timeRange: CostTimeRangeSchema.default("7d"),
  groupBy: CostGroupBySchema.default("model"),
});

const GetTraceStatsInputSchema = z.object({
  timeRange: TimeRangeSchema.default("24h"),
  serviceName: z.string().optional(),
});

// ============================================================
// Exported Handlers (for testability)
// ============================================================

export async function handleGetCostSummary(
  apiClient: ApiClient,
  args: z.input<typeof GetCostSummaryInputSchema>
) {
  const input = GetCostSummaryInputSchema.parse(args);

  const data = await apiClient.getCostSummary({
    timeRange: input.timeRange,
    groupBy: input.groupBy,
  });

  if (data.groupBy === "model") {
    const output = formatCostByModel(data.data, input.timeRange);
    return textResult(output);
  }

  if (data.groupBy === "day") {
    const output = formatCostByDay(data.data, input.timeRange);
    return textResult(output);
  }

  // groupBy === "service"
  const output = formatCostByService(data.data, input.timeRange);
  return textResult(output);
}

export async function handleGetTraceStats(
  apiClient: ApiClient,
  args: z.input<typeof GetTraceStatsInputSchema>
) {
  const input = GetTraceStatsInputSchema.parse(args);

  const data = await apiClient.getTraceStats({
    timeRange: input.timeRange,
    serviceName: input.serviceName,
  });

  const output = formatTraceStats({
    totalCount: data.totalCount,
    errorCount: data.errorCount,
    percentiles: data.percentiles,
    serviceStats: data.serviceStats,
    errorRateByService: data.errorRateByService,
    timeRange: input.timeRange,
  });

  return textResult(output);
}

// ============================================================
// Tool Registration
// ============================================================

export function registerAnalyticsTools(
  server: McpServer,
  apiClient: ApiClient
): void {
  server.registerTool(
    "get_cost_summary",
    {
      description:
        "Get cost breakdown for your project. Shows token usage and costs grouped by model, day, or service.",
      inputSchema: GetCostSummaryInputSchema.shape,
    },
    async (args) => handleGetCostSummary(apiClient, args)
  );

  server.registerTool(
    "get_trace_stats",
    {
      description:
        "Get aggregate statistics for traces including latency percentiles and error rates.",
      inputSchema: GetTraceStatsInputSchema.shape,
    },
    async (args) => handleGetTraceStats(apiClient, args)
  );
}

// Re-export formatDuration for potential use
export { formatDuration };
