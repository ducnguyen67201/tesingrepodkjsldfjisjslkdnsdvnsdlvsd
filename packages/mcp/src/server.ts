import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { validateEnv } from "./env.js";
import { createApiClient } from "./lib/api-client.js";
import { registerAllTools } from "./tools/index.js";

export async function createServer(): Promise<McpServer> {
  const env = validateEnv();

  const apiClient = createApiClient(env.DUCSIGR_API_URL, env.DUCSIGR_API_KEY);

  console.error("[Ducsigr MCP] Authenticating...");
  const projectData = await apiClient.getProjectInfo();

  console.error(
    `[Ducsigr MCP] Authenticated as project "${projectData.project.name}" in workspace "${projectData.project.workspace.name}"`
  );

  const server = new McpServer({
    name: "ducsigr",
    version: "0.1.0",
  });

  registerAllTools(server, apiClient);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("[Ducsigr MCP] Server connected via stdio");

  return server;
}
