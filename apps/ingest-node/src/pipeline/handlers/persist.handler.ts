/**
 * Persist Handler
 *
 * Fifth handler in the pipeline. Responsible for:
 * 1. Persisting normalized traces to database
 * 2. Persisting normalized spans to database
 * 3. Handling idempotent upserts
 *
 * TODO: Full implementation in Phase 7
 */
import { logger } from "../../lib/logger.js";
import { metrics } from "../../lib/metrics.js";
import type {
  PipelineContext,
  PipelineHandler,
  HandlerResult,
} from "../types.js";
import { PipelineErrorCodes } from "../types.js";

/**
 * Persist Handler - Persists traces and spans to database
 */
export class PersistHandler implements PipelineHandler {
  readonly name = "PersistHandler";

  async handle(ctx: PipelineContext): Promise<HandlerResult> {
    if (!ctx.normalizedTraces || !ctx.normalizedSpans) {
      logger.error("PersistHandler called without normalized data");
      return {
        continue: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Missing normalized data in pipeline context",
          httpStatus: 500,
        },
      };
    }

    if (!ctx.projectId) {
      logger.error("PersistHandler called without projectId");
      return {
        continue: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Missing project ID in pipeline context",
          httpStatus: 500,
        },
      };
    }

    const startTime = performance.now();

    try {
      // TODO: Phase 7 - Implement full persistence logic
      // 1. Use transaction for atomicity
      // 2. Upsert traces by (projectId, externalTraceId)
      // 3. Upsert spans by (traceId, externalSpanId)
      // 4. Handle conflicts gracefully

      // For now, just log and pass through
      logger.info(
        {
          projectId: ctx.projectId,
          traceCount: ctx.normalizedTraces.length,
          spanCount: ctx.normalizedSpans.length,
        },
        "Persistence placeholder - data not yet saved to database"
      );

      // Simulate persisted trace IDs
      ctx.persistedTraceIds = ctx.normalizedTraces.map(
        (t) => t.externalTraceId
      );
      ctx.persistedSpanCount = ctx.normalizedSpans.length;

      const duration = performance.now() - startTime;
      metrics.dbLatency.observe({ operation: "persist" }, duration / 1000);

      return { continue: true };
    } catch (error) {
      const duration = performance.now() - startTime;
      metrics.dbLatency.observe({ operation: "persist_error" }, duration / 1000);

      logger.error(
        { error, projectId: ctx.projectId },
        "Failed to persist traces"
      );

      return {
        continue: false,
        error: {
          code: PipelineErrorCodes.PERSISTENCE_FAILED,
          message: "Failed to persist trace data",
          httpStatus: 500,
        },
      };
    }
  }
}
