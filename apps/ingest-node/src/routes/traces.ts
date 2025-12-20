import { Router, type Router as RouterType } from "express";
import { logger } from "../lib/logger.js";

export const tracesRouter: RouterType = Router();

/**
 * OTLP Trace ingestion endpoint
 * POST /v1/traces
 *
 * Accepts OTLP trace data in protobuf or JSON format
 */
tracesRouter.post("/", async (req, res) => {
  try {
    const contentType = req.headers["content-type"] || "";

    // TODO: Implement full OTLP ingestion pipeline
    // Phase 4: Parse OTLP request (protobuf or JSON)
    // Phase 5: Validate request limits
    // Phase 6: Authenticate and bind to project
    // Phase 7: Persist to database

    logger.info({ contentType }, "Received trace ingestion request");

    // Placeholder response
    res.status(202).json({
      accepted: true,
      message: "OTLP ingestion endpoint - implementation in progress",
    });
  } catch (error) {
    logger.error({ error }, "Error processing trace ingestion");
    res.status(500).json({
      error: "INTERNAL_ERROR",
      message: "Failed to process trace data",
    });
  }
});
