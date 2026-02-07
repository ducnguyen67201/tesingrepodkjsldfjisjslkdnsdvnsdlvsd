import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ApiClient } from "../lib/api-client.js";
import { formatProjectInfo } from "../lib/formatters.js";
import { errorResult, textResult } from "../lib/errors.js";

// ============================================================
// Exported Handler (for testability)
// ============================================================

export async function handleListProjects(apiClient: ApiClient) {
  try {
    const data = await apiClient.getProjectInfo();
    const output = formatProjectInfo(data.project);
    return textResult(output);
  } catch (error) {
    if (error instanceof Error && "status" in error && (error as { status: number }).status === 404) {
      return errorResult("Project not found");
    }
    throw error;
  }
}

// ============================================================
// Tool Registration
// ============================================================

export function registerProjectTools(
  server: McpServer,
  apiClient: ApiClient
): void {
  server.registerTool(
    "list_projects",
    {
      description:
        "Show information about the current project (determined by your API key).",
    },
    async () => handleListProjects(apiClient)
  );
}
