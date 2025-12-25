/**
 * Logs Ingestion Route
 *
 * OTLP logs ingestion endpoint.
 * Supports protobuf and JSON formats with gzip compression.
 */
import { Router, type Router as RouterType } from "express";
import express from "express";
import { config } from "../config/env.js";
import { logger } from "../lib/logger.js";
import {
  createDefaultLogsPipeline,
  type LogsPipelineContext,
} from "../pipeline/logs/index.js";
import { rateLimitMiddleware } from "../middleware/rate-limit.js";

export const logsRouter: RouterType = Router();

// Create the logs ingestion pipeline (singleton)
const pipeline = createDefaultLogsPipeline();

// Apply rate limiting to all log routes
logsRouter.use(rateLimitMiddleware);

// Use raw body parser for all content types on this route
// This allows us to handle gzip decompression manually
logsRouter.use(
  express.raw({
    type: () => true, // Accept all content types
    limit: config.limits.maxPayloadBytes,
  })
);

/**
 * OTLP Logs ingestion endpoint
 * POST /v1/logs
 *
 * Accepts OTLP log data in protobuf or JSON format.
 *
 * Content-Types supported:
 * - application/x-protobuf (OTLP protobuf)
 * - application/json (OTLP JSON)
 *
 * Content-Encoding supported:
 * - gzip (optional compression)
 *
 * Authentication:
 * - Authorization: Bearer <api-key>
 * - X-API-Key: <api-key>
 */
logsRouter.post("/", async (req, res) => {
  try {
    const contentType = req.headers["content-type"] ?? "";
    const contentEncoding = req.headers["content-encoding"] ?? "";

    logger.debug(
      { contentType, contentEncoding },
      "Received logs ingestion request"
    );

    // Get raw body from express.raw() middleware
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from([]);

    // Build pipeline context
    const ctx: LogsPipelineContext = {
      req,
      res,
      rawBody,
      contentType,
      contentEncoding: contentEncoding as string,
    };

    // Execute the pipeline (Chain of Responsibility)
    await pipeline.execute(ctx);
  } catch (error) {
    // Unexpected error not caught by pipeline
    logger.error({ error }, "Unexpected error in logs ingestion");

    if (!res.headersSent) {
      res.status(500).json({
        error: "INTERNAL_ERROR",
        message: "Failed to process log data",
      });
    }
  }
});
