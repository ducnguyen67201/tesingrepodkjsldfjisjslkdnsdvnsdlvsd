/**
 * Logs Pipeline Runner
 *
 * Executes the chain of logs handlers in sequence.
 * Implements the Chain of Responsibility pattern.
 */
import { logger } from "../../lib/logger.js";
import { metrics } from "../../lib/metrics.js";
import type {
  LogsPipelineContext,
  LogsPipelineHandler,
  LogsPipelineError,
} from "./types.js";

/**
 * Logs pipeline runner that executes handlers in sequence
 */
export class LogsPipelineRunner {
  private handlers: LogsPipelineHandler[] = [];

  /**
   * Add a handler to the chain
   */
  addHandler(handler: LogsPipelineHandler): this {
    this.handlers.push(handler);
    return this;
  }

  /**
   * Add multiple handlers to the chain
   */
  addHandlers(...handlers: LogsPipelineHandler[]): this {
    this.handlers.push(...handlers);
    return this;
  }

  /**
   * Execute the pipeline with the given context
   */
  async execute(ctx: LogsPipelineContext): Promise<void> {
    const startTime = performance.now();

    logger.debug(
      { handlerCount: this.handlers.length },
      "Starting logs pipeline execution"
    );

    for (const handler of this.handlers) {
      const handlerStart = performance.now();

      try {
        logger.debug({ handler: handler.name }, "Executing logs handler");

        const result = await handler.handle(ctx);

        const handlerDuration = performance.now() - handlerStart;
        logger.debug(
          {
            handler: handler.name,
            durationMs: handlerDuration.toFixed(2),
            continue: result.continue,
          },
          "Logs handler completed"
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
          "Logs handler threw unexpected error"
        );

        metrics.handlerDuration.observe(
          { handler: handler.name, status: "exception" },
          handlerDuration / 1000
        );

        const pipelineError: LogsPipelineError = {
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
        logCount: ctx.normalizedLogs?.length ?? 0,
        persistedCount: ctx.persistedCount ?? 0,
      },
      "Logs pipeline execution completed"
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
  private sendErrorResponse(
    ctx: LogsPipelineContext,
    error: LogsPipelineError
  ): void {
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
 * Create a new logs pipeline runner
 */
export function createLogsPipeline(): LogsPipelineRunner {
  return new LogsPipelineRunner();
}
