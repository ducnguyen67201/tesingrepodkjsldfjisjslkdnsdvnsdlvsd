import { createServer } from "./server.js";

async function main() {
  try {
    await createServer();
  } catch (error) {
    console.error(
      "[Ducsigr MCP] Failed to start:",
      error instanceof Error ? error.message : error
    );
    process.exit(1);
  }
}

const handleShutdown = () => {
  console.error("[Ducsigr MCP] Shutting down...");
  process.exit(0);
};

process.on("SIGINT", handleShutdown);
process.on("SIGTERM", handleShutdown);

main();
