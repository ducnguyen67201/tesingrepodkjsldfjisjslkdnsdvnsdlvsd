import { createServer } from "./server.js";
import { config } from "./config/env.js";
import { logger } from "./lib/logger.js";

const server = createServer();

server.listen(config.server.port, config.server.host, () => {
  logger.info(
    {
      port: config.server.port,
      host: config.server.host,
      env: config.server.isDev ? "development" : "production",
    },
    "Ingest-node service started"
  );
});

// Graceful shutdown
const shutdown = () => {
  logger.info("Shutting down gracefully...");
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
