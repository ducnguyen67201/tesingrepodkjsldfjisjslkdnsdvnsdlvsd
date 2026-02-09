import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ApiClient } from "../lib/api-client.js";
import { registerTraceTools } from "./traces.js";
import { registerSpanTools } from "./spans.js";
import { registerAnalyticsTools } from "./analytics.js";
import { registerProjectTools } from "./projects.js";
import { registerAlertTools } from "./alerts.js";

export function registerAllTools(server: McpServer, apiClient: ApiClient): void {
  registerTraceTools(server, apiClient);
  registerSpanTools(server, apiClient);
  registerAnalyticsTools(server, apiClient);
  registerProjectTools(server, apiClient);
  registerAlertTools(server, apiClient);
}
