import express, { type Express, type Request, type Response, type NextFunction } from "express";
import compression from "compression";
import pinoHttp from "pino-http";
import { config } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { healthRouter } from "./routes/health.js";
import { tracesRouter } from "./routes/traces.js";
import { logsRouter } from "./routes/logs.js";
import { metricsRouter } from "./routes/metrics.js";
import { promptsRouter } from "./routes/prompts.js";
import { promptExperimentsRouter } from "./routes/prompt-experiments.js";

/**
 * Create and configure the Express application
 */
export function createServer(): Express {
  const app = express();

  // Request logging
  app.use(
    pinoHttp({
      logger,
      autoLogging: {
        ignore: (req) => req.url === "/health" || req.url === "/metrics",
      },
      customLogLevel: (_req, res, err) => {
        if (res.statusCode >= 500 || err) return "error";
        if (res.statusCode >= 400) return "warn";
        return "info";
      },
    })
  );

  // Compression for responses
  app.use(compression());

  // Routes - traces and logs routes handle their own body parsing for gzip support
  app.use("/", healthRouter);
  app.use("/", metricsRouter);
  app.use("/v1/traces", tracesRouter);
  app.use("/v1/logs", logsRouter);

  // Body parsing for JSON routes (prompts, etc.)
  app.use(
    express.json({
      type: ["application/json"],
      limit: config.limits.maxPayloadBytes,
    })
  );

  // Prompts API - SDK retrieval endpoint
  app.use("/v1/prompts", promptsRouter);

  // Prompt Experiments API - A/B testing resolution
  app.use("/v1/prompt-experiments", promptExperimentsRouter);

  // 404 handler
  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      error: "NOT_FOUND",
      message: "The requested resource was not found",
    });
  });

  // Error handler (Express requires all 4 params for error middleware)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error({ err }, "Unhandled error");

    res.status(500).json({
      error: "INTERNAL_ERROR",
      message: config.server.isDev ? err.message : "An internal error occurred",
    });
  });

  return app;
}
