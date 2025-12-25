/**
 * Response Logs Handler
 *
 * Final handler that sends the success response.
 * Follows OTLP ExportLogsPartialSuccess format.
 */
import { logger } from "../../lib/logger.js";
import type {
  LogsPipelineContext,
  LogsPipelineHandler,
  LogsHandlerResult,
} from "./types.js";

/**
 * Response Logs Handler - Sends success response
 */
export class ResponseLogsHandler implements LogsPipelineHandler {
  readonly name = "ResponseLogsHandler";

  async handle(ctx: LogsPipelineContext): Promise<LogsHandlerResult> {
    const totalLogs = ctx.normalizedLogs?.length ?? 0;
    const persistedCount = ctx.persistedCount ?? 0;
    const rejectedCount = ctx.rejectedCount ?? 0;

    // Build response following OTLP format
    const response: {
      partialSuccess?: {
        rejectedLogRecords?: number;
        errorMessage?: string;
      };
    } = {};

    // Include partial success info if there were any rejections
    if (rejectedCount > 0) {
      response.partialSuccess = {
        rejectedLogRecords: rejectedCount,
        errorMessage: ctx.rejectionReasons?.join("; "),
      };
    }

    logger.info(
      {
        totalLogs,
        persistedCount,
        rejectedCount,
        projectId: ctx.projectId,
      },
      "Logs ingestion completed"
    );

    // Send 202 Accepted
    ctx.res.status(202).json(response);

    return { continue: false }; // End of pipeline
  }
}
