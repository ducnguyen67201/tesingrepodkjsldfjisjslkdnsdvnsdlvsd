/**
 * Response Handler
 *
 * Final handler in the pipeline. Responsible for:
 * 1. Sending the success response to the client
 * 2. Recording success metrics
 */
import { logger } from "../../lib/logger.js";
import { metrics } from "../../lib/metrics.js";
import type {
  PipelineContext,
  PipelineHandler,
  HandlerResult,
} from "../types.js";

/**
 * Response Handler - Sends success response
 */
export class ResponseHandler implements PipelineHandler {
  readonly name = "ResponseHandler";

  async handle(ctx: PipelineContext): Promise<HandlerResult> {
    const traceCount = ctx.normalizedTraces?.length ?? 0;
    const spanCount = ctx.normalizedSpans?.length ?? 0;

    // Record success metrics
    metrics.requestCounter.inc({
      status: "success",
      content_type: ctx.contentType,
    });

    if (ctx.projectId) {
      metrics.spanCounter.inc(
        { project_id: ctx.projectId, status: "accepted" },
        spanCount
      );
    }

    // Send success response
    ctx.res.status(202).json({
      accepted: true,
      traceCount,
      spanCount,
      persistedTraceIds: ctx.persistedTraceIds,
    });

    logger.info(
      {
        traceCount,
        spanCount,
        projectId: ctx.projectId,
      },
      "Successfully processed OTLP request"
    );

    return { continue: false }; // End of chain
  }
}
