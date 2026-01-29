/**
 * Ingest Demo App - Entry Point
 *
 * A simple demo application that demonstrates:
 * 1. OpenTelemetry auto-instrumentation for HTTP/Express
 * 2. Manual span creation with attributes
 * 3. Sending traces to Ducsigr ingest service
 * 4. Pino logging with OTLP log export
 */

// IMPORTANT: Import telemetry FIRST before any other modules
import "./telemetry.js";

import express, { type Express } from "express";
import path from "path";
import { fileURLToPath } from "url";

import { config } from "./config/env.js";
import { logger, flushPendingLogs } from "./lib/logger.js";
import { weatherRouter } from "./routes/weather.js";
import { quotesRouter } from "./routes/quotes.js";
import { jokesRouter } from "./routes/jokes.js";
import { llmRouter } from "./routes/llm-mock.js";
import { promptTestRouter } from "./routes/prompt-test.js";
import { sdkTestRouter } from "./routes/sdk-test.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app: Express = express();

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

// Health check endpoint
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "ingest-demo",
    timestamp: new Date().toISOString(),
  });
});

// Demo API routes
app.use("/api/demo", weatherRouter);
app.use("/api/demo", quotesRouter);
app.use("/api/demo", jokesRouter);
app.use("/api/demo", llmRouter);
app.use("/api/demo", promptTestRouter);
app.use("/api/demo", sdkTestRouter);

// Root route redirects to static UI
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

// Start server
const port = config.server.port;
const server = app.listen(port, () => {
  logger.info(
    {
      port,
      tracesUrl: config.ducsigr.tracesUrl,
      logsUrl: `${config.ducsigr.endpoint}/v1/logs`,
    },
    "Ducsigr Ingest Demo App started"
  );

  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║              Ducsigr Ingest Demo App                  ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝

  Server running at:     http://localhost:${port}
  Health check:          http://localhost:${port}/health

  API Endpoints:
    POST /api/demo/weather              - Weather data (wttr.in)
    POST /api/demo/quotes               - Random quotes (zenquotes.io)
    POST /api/demo/jokes                - Dad jokes (icanhazdadjoke.com)
    POST /api/demo/llm                  - Mock LLM response
    POST /api/demo/prompt-test/single   - Test prompt fetch + mock LLM
    POST /api/demo/prompt-test/experiment - Test A/B experiment + mock LLM
    POST /api/demo/sdk-test             - Test @ducsigr/sdk package
    POST /api/demo/sdk-test/simple      - Simple SDK test

  Traces exporting to:   ${config.ducsigr.tracesUrl}
  Logs exporting to:     ${config.ducsigr.endpoint}/v1/logs
  `);
});

// Graceful shutdown
const shutdown = async (): Promise<void> => {
  logger.info("Shutting down server...");
  await flushPendingLogs();
  server.close(() => {
    logger.info("Server closed");
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

export { app };
