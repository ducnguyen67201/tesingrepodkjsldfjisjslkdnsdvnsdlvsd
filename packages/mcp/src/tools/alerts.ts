import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ApiClientError, type ApiClient } from "../lib/api-client.js";
import { formatAlertList, formatRCADetail } from "../lib/formatters.js";
import { errorResult, textResult } from "../lib/errors.js";

// ============================================================
// Schemas
// ============================================================

const ListAlertsInputSchema = z.object({
  limit: z.number().min(1).max(50).default(20),
  enabled: z.boolean().optional(),
});

const GetRCAInputSchema = z.object({
  rcaId: z.string().describe("The RCA ID (e.g., cmles50d80001xgm1ur7433ny)"),
});

// ============================================================
// Exported Handlers (for testability)
// ============================================================

export async function handleListAlerts(
  apiClient: ApiClient,
  args: z.input<typeof ListAlertsInputSchema>
) {
  const input = ListAlertsInputSchema.parse(args);
  const data = await apiClient.listAlerts({
    limit: input.limit,
    enabled: input.enabled,
  });
  const output = formatAlertList(data.alerts);
  return textResult(output);
}

export async function handleGetRCA(
  apiClient: ApiClient,
  args: z.input<typeof GetRCAInputSchema>
) {
  const input = GetRCAInputSchema.parse(args);

  try {
    const data = await apiClient.getRCA({ rcaId: input.rcaId });
    const output = formatRCADetail(data);
    return textResult(output);
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 404) {
      return errorResult(`RCA not found: ${input.rcaId}`);
    }
    throw error;
  }
}

// ============================================================
// Tool Registration
// ============================================================

export function registerAlertTools(
  server: McpServer,
  apiClient: ApiClient
): void {
  server.registerTool(
    "list_alerts",
    {
      description:
        "List alerts configured for this project, including their current state, severity, and recent trigger history. Use this to understand what monitoring is active.",
      inputSchema: ListAlertsInputSchema.shape,
    },
    async (args) => handleListAlerts(apiClient, args)
  );

  server.registerTool(
    "get_rca",
    {
      description:
        "Get the full Root Cause Analysis (RCA) for an alert incident. Returns the AI-generated hypothesis, evidence, suspected commits, affected components, and remediation steps. Use this to understand why an alert fired and how to fix it.",
      inputSchema: GetRCAInputSchema.shape,
    },
    async (args) => handleGetRCA(apiClient, args)
  );
}
