/**
 * OTLP Ingestion Pipeline
 *
 * Chain of Responsibility pattern for processing OTLP trace requests.
 *
 * Pipeline order:
 * 1. ParseHandler - Parse protobuf/JSON payload
 * 2. NormalizeHandler - Convert OTLP to internal format
 * 3. ValidateHandler - Validate limits and constraints
 * 4. ScrubHandler - Remove/redact PII from spans
 * 5. AuthHandler - Authenticate and bind to project
 * 6. PersistHandler - Save to database
 * 7. ResponseHandler - Send success response
 *
 * Each handler can:
 * - Continue to next handler (return { continue: true })
 * - Stop the chain with error (return { continue: false, error: {...} })
 * - Stop the chain without error (return { continue: false })
 */

export * from "./types.js";
export * from "./runner.js";
export * from "./handlers/index.js";

import { createPipeline } from "./runner.js";
import {
  ParseHandler,
  NormalizeHandler,
  ValidateHandler,
  ScrubHandler,
  AuthHandler,
  PersistHandler,
  ResponseHandler,
} from "./handlers/index.js";

/**
 * Create the full ingestion pipeline with all handlers
 */
export function createIngestionPipeline() {
  return createPipeline()
    .addHandler(new ParseHandler())
    .addHandler(new NormalizeHandler())
    .addHandler(new ValidateHandler())
    .addHandler(new ScrubHandler())
    .addHandler(new AuthHandler())
    .addHandler(new PersistHandler())
    .addHandler(new ResponseHandler());
}
