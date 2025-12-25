/**
 * Ingest Demo App - Entry Point
 *
 * A simple demo application that demonstrates:
 * 1. OpenTelemetry auto-instrumentation for HTTP/Express
 * 2. Manual span creation with attributes
 * 3. Sending traces to CognObserve ingest service
 */

// IMPORTANT: Import telemetry FIRST before any other modules
import "./telemetry.js";

import express, { type Express } from "express";
import path from "path";
import { fileURLToPath } from "url";

import { config } from "./config/env.js";
import { weatherRouter } from "./routes/weather.js";
import { quotesRouter } from "./routes/quotes.js";
import { jokesRouter } from "./routes/jokes.js";
import { llmRouter } from "./routes/llm-mock.js";
import { promptTestRouter } from "./routes/prompt-test.js";

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

// Root route redirects to static UI
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

// Start server
const port = config.server.port;
app.listen(port, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║              CognObserve Ingest Demo App                  ║
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

  Traces exporting to:   ${config.cognobserve.tracesUrl}
  `);
});

export { app };
