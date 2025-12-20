import { Router, type Router as RouterType } from "express";
import { logger } from "../lib/logger.js";
import { createIngestionPipeline, type PipelineContext } from "../pipeline/index.js";

export const tracesRouter: RouterType = Router();

// Create the ingestion pipeline (singleton)
const pipeline = createIngestionPipeline();

/**
 * OTLP Trace ingestion endpoint
 * POST /v1/traces
 *
 * Accepts OTLP trace data in protobuf or JSON format.
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
tracesRouter.post("/", async (req, res) => {
  try {
    const contentType = req.headers["content-type"] ?? "";
    const contentEncoding = req.headers["content-encoding"] ?? "";

    logger.debug(
      { contentType, contentEncoding },
      "Received trace ingestion request"
    );

    // Collect raw body
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const rawBody = Buffer.concat(chunks);

    // Build pipeline context
    const ctx: PipelineContext = {
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
    logger.error({ error }, "Unexpected error in trace ingestion");

    if (!res.headersSent) {
      res.status(500).json({
        error: "INTERNAL_ERROR",
        message: "Failed to process trace data",
      });
    }
  }
});
