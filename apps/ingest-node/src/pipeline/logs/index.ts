/**
 * Logs Pipeline
 *
 * Chain of Responsibility pipeline for OTLP logs ingestion.
 * Assembles and exports the complete logs processing pipeline.
 */
export * from "./types.js";
export * from "./runner.js";

// Export handlers
export { ParseLogsHandler } from "./parse-logs.handler.js";
export { NormalizeLogsHandler } from "./normalize-logs.handler.js";
export { ValidateLogsHandler } from "./validate-logs.handler.js";
export { ScrubLogsHandler } from "./scrub-logs.handler.js";
export { PersistLogsHandler } from "./persist-logs.handler.js";
export { ResponseLogsHandler } from "./response-logs.handler.js";

// Re-export shared AuthHandler
export { AuthHandler } from "../shared/auth.handler.js";

import { createLogsPipeline } from "./runner.js";
import { ParseLogsHandler } from "./parse-logs.handler.js";
import { NormalizeLogsHandler } from "./normalize-logs.handler.js";
import { ValidateLogsHandler } from "./validate-logs.handler.js";
import { ScrubLogsHandler } from "./scrub-logs.handler.js";
import { AuthHandler } from "../shared/auth.handler.js";
import { PersistLogsHandler } from "./persist-logs.handler.js";
import { ResponseLogsHandler } from "./response-logs.handler.js";
import type { LogsPipelineContext } from "./types.js";

/**
 * Create the default logs ingestion pipeline
 *
 * Pipeline order:
 * 1. ParseLogsHandler - Parse protobuf/JSON
 * 2. NormalizeLogsHandler - Flatten hierarchy
 * 3. ValidateLogsHandler - Enforce limits
 * 4. ScrubLogsHandler - Redact PII
 * 5. AuthHandler - Authenticate & resolve project (shared)
 * 6. PersistLogsHandler - Insert to database
 * 7. ResponseLogsHandler - Send response
 */
export function createDefaultLogsPipeline() {
  return createLogsPipeline()
    .addHandler(new ParseLogsHandler())
    .addHandler(new NormalizeLogsHandler())
    .addHandler(new ValidateLogsHandler())
    .addHandler(new ScrubLogsHandler())
    .addHandler(new AuthHandler<LogsPipelineContext>())
    .addHandler(new PersistLogsHandler())
    .addHandler(new ResponseLogsHandler());
}
