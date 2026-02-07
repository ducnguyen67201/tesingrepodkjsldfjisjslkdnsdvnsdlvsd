import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ApiClient } from "../lib/api-client.js";
import {
  formatTraceTable,
  formatTraceDetail,
  formatErrorSummary,
  groupErrorsByType,
} from "../lib/formatters.js";
import { errorResult, textResult } from "../lib/errors.js";
import { TimeRangeSchema, ErrorTimeRangeSchema } from "../lib/schemas.js";

// ============================================================
// Schemas
// ============================================================

const ListTracesInputSchema = z.object({
  limit: z.number().min(1).max(100).default(20),
  cursor: z.string().optional(),
  timeRange: TimeRangeSchema.default("24h"),
  hasError: z.boolean().optional(),
  search: z.string().optional(),
  serviceName: z.string().optional(),
  minDurationMs: z.number().optional(),
  maxDurationMs: z.number().optional(),
});

const GetTraceInputSchema = z.object({
  traceId: z.string(),
  includeInputOutput: z.boolean().default(true),
});

const GetErrorTracesInputSchema = z.object({
  limit: z.number().min(1).max(50).default(10),
  timeRange: ErrorTimeRangeSchema.default("24h"),
  exceptionType: z.string().optional(),
});

// ============================================================
// Exported Handlers (for testability)
// ============================================================

export async function handleListTraces(
  apiClient: ApiClient,
  args: z.input<typeof ListTracesInputSchema>
) {
  const input = ListTracesInputSchema.parse(args);

  const data = await apiClient.listTraces({
    limit: input.limit,
    cursor: input.cursor,
    timeRange: input.timeRange,
    hasError: input.hasError,
    search: input.search,
    serviceName: input.serviceName,
    minDurationMs: input.minDurationMs,
    maxDurationMs: input.maxDurationMs,
  });

  const output = formatTraceTable(data.traces, {
    total: data.total,
    timeRange: input.timeRange,
    nextCursor: data.nextCursor ?? undefined,
  });

  return textResult(output);
}

export async function handleGetTrace(
  apiClient: ApiClient,
  args: z.input<typeof GetTraceInputSchema>
) {
  const input = GetTraceInputSchema.parse(args);

  try {
    const data = await apiClient.getTrace({
      traceId: input.traceId,
      includeInputOutput: input.includeInputOutput,
    });

    const output = formatTraceDetail(data.trace, input.includeInputOutput);
    return textResult(output);
  } catch (error) {
    if (error instanceof Error && "status" in error && (error as { status: number }).status === 404) {
      return errorResult(`Trace not found: ${input.traceId}`);
    }
    throw error;
  }
}

export async function handleGetErrorTraces(
  apiClient: ApiClient,
  args: z.input<typeof GetErrorTracesInputSchema>
) {
  const input = GetErrorTracesInputSchema.parse(args);

  const data = await apiClient.getErrorTraces({
    limit: input.limit,
    timeRange: input.timeRange,
    exceptionType: input.exceptionType,
  });

  const errorGroups = groupErrorsByType(data.errorSpans);
  const output = formatErrorSummary(errorGroups, input.timeRange);

  return textResult(output);
}

// ============================================================
// Tool Registration
// ============================================================

export function registerTraceTools(
  server: McpServer,
  apiClient: ApiClient
): void {
  server.registerTool(
    "list_traces",
    {
      description:
        "List traces from your Ducsigr project with optional filters. Returns recent traces with summary info including duration, error status, and span count.",
      inputSchema: ListTracesInputSchema.shape,
    },
    async (args) => handleListTraces(apiClient, args)
  );

  server.registerTool(
    "get_trace",
    {
      description:
        "Get detailed information about a specific trace including all spans, LLM inputs/outputs, and timing breakdown.",
      inputSchema: GetTraceInputSchema.shape,
    },
    async (args) => handleGetTrace(apiClient, args)
  );

  server.registerTool(
    "get_error_traces",
    {
      description:
        "Get recent traces that contain errors or exceptions. Ideal for debugging production issues.",
      inputSchema: GetErrorTracesInputSchema.shape,
    },
    async (args) => handleGetErrorTraces(apiClient, args)
  );
}
