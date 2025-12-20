import { createServer } from "./server.js";
import { config } from "./config/env.js";
import { logger } from "./lib/logger.js";

const app = createServer();

const server = app
  .listen(config.server.port, config.server.host, () => {
    logger.info(
      {
        port: config.server.port,
        host: config.server.host,
        env: config.server.isDev ? "development" : "production",
      },
      "Ingest-node service started"
    );
  })
  .on("error", (err) => {
    logger.error({ error: err }, "Failed to start server");
    process.exit(1);
  });

// Graceful shutdown - close server before exiting
const shutdown = () => {
  logger.info("Shutting down gracefully...");
  server.close((err) => {
    if (err) {
      logger.error({ error: err }, "Error during server shutdown");
      process.exit(1);
    }
    logger.info("Server closed successfully");
    process.exit(0);
  });

  // Force exit after 10 seconds if graceful shutdown fails
  setTimeout(() => {
    logger.warn("Forcing shutdown after timeout");
    process.exit(1);
  }, 10000);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
