/**
 * Pipeline Runner
 *
 * Executes the chain of handlers in sequence.
 * Implements the Chain of Responsibility pattern.
 */
import { logger } from "../lib/logger.js";
import { metrics } from "../lib/metrics.js";
import type {
  PipelineContext,
  PipelineHandler,
  PipelineError,
} from "./types.js";

/**
 * Pipeline runner that executes handlers in sequence
 */
export class PipelineRunner {
  private handlers: PipelineHandler[] = [];

  /**
   * Add a handler to the chain
   */
  addHandler(handler: PipelineHandler): this {
    this.handlers.push(handler);
    return this;
  }

  /**
   * Add multiple handlers to the chain
   */
  addHandlers(...handlers: PipelineHandler[]): this {
    this.handlers.push(...handlers);
    return this;
  }

  /**
   * Execute the pipeline with the given context
   */
  async execute(ctx: PipelineContext): Promise<void> {
    const startTime = performance.now();

    logger.debug(
      { handlerCount: this.handlers.length },
      "Starting pipeline execution"
    );

    for (const handler of this.handlers) {
      const handlerStart = performance.now();

      try {
        logger.debug({ handler: handler.name }, "Executing handler");

        const result = await handler.handle(ctx);

        const handlerDuration = performance.now() - handlerStart;
        logger.debug(
          {
            handler: handler.name,
            durationMs: handlerDuration.toFixed(2),
            continue: result.continue,
          },
          "Handler completed"
        );

        // Record handler metrics
        metrics.handlerDuration.observe(
          { handler: handler.name, status: result.error ? "error" : "success" },
          handlerDuration / 1000
        );

        if (!result.continue) {
          // Handler signaled to stop the chain
          if (result.error) {
            ctx.error = result.error;
            this.sendErrorResponse(ctx, result.error);
          }
          break;
        }
      } catch (error) {
        // Unexpected error in handler
        const handlerDuration = performance.now() - handlerStart;
        logger.error(
          {
            handler: handler.name,
            error,
            durationMs: handlerDuration.toFixed(2),
          },
          "Handler threw unexpected error"
        );

        metrics.handlerDuration.observe(
          { handler: handler.name, status: "exception" },
          handlerDuration / 1000
        );

        const pipelineError: PipelineError = {
          code: "INTERNAL_ERROR",
          message: "Internal server error",
          httpStatus: 500,
        };

        ctx.error = pipelineError;
        this.sendErrorResponse(ctx, pipelineError);
        break;
      }
    }

    const totalDuration = performance.now() - startTime;
    logger.info(
      {
        durationMs: totalDuration.toFixed(2),
        success: !ctx.error,
        traceCount: ctx.normalizedTraces?.length ?? 0,
        spanCount: ctx.normalizedSpans?.length ?? 0,
      },
      "Pipeline execution completed"
    );

    // Record overall pipeline metrics
    metrics.pipelineDuration.observe(
      { status: ctx.error ? "error" : "success" },
      totalDuration / 1000
    );
  }

  /**
   * Send error response to client
   */
  private sendErrorResponse(ctx: PipelineContext, error: PipelineError): void {
    if (ctx.res.headersSent) {
      logger.warn("Headers already sent, cannot send error response");
      return;
    }

    ctx.res.status(error.httpStatus).json({
      error: error.code,
      message: error.message,
      ...(error.details && { details: error.details }),
    });

    metrics.requestErrors.inc({
      error_code: error.code,
      status_code: error.httpStatus.toString(),
    });
  }
}

/**
 * Create a new pipeline runner
 */
export function createPipeline(): PipelineRunner {
  return new PipelineRunner();
}
