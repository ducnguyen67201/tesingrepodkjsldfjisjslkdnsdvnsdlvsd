import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ApiClient } from "../lib/api-client.js";
import { formatSpanSearchResults } from "../lib/formatters.js";
import { SpanTypeSchema, TimeRangeSchema } from "../lib/schemas.js";
import { textResult } from "../lib/errors.js";

// ============================================================
// Schema
// ============================================================

const SearchSpansInputSchema = z.object({
  query: z.string().optional(),
  spanType: SpanTypeSchema.optional(),
  hasError: z.boolean().optional(),
  model: z.string().optional(),
  limit: z.number().min(1).max(100).default(20),
  timeRange: TimeRangeSchema.default("24h"),
});

// ============================================================
// Exported Handler (for testability)
// ============================================================

export async function handleSearchSpans(
  apiClient: ApiClient,
  args: z.input<typeof SearchSpansInputSchema>
) {
  const input = SearchSpansInputSchema.parse(args);

  const data = await apiClient.searchSpans({
    query: input.query,
    spanType: input.spanType,
    hasError: input.hasError,
    model: input.model,
    limit: input.limit,
    timeRange: input.timeRange,
  });

  const output = formatSpanSearchResults(data.spans, input);
  return textResult(output);
}

// ============================================================
// Tool Registration
// ============================================================

export function registerSpanTools(
  server: McpServer,
  apiClient: ApiClient
): void {
  server.registerTool(
    "search_spans",
    {
      description:
        "Search spans across all traces. Useful for finding specific LLM calls, database queries, or errors.",
      inputSchema: SearchSpansInputSchema.shape,
    },
    async (args) => handleSearchSpans(apiClient, args)
  );
}
