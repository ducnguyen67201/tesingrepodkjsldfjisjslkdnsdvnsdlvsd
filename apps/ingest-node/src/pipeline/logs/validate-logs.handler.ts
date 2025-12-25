/**
 * Validate Logs Handler
 *
 * Validates normalized log records against configured limits:
 * - Max logs per request
 * - Max attributes per log
 * - Max body length (truncates if exceeded)
 * - Timestamp drift validation
 */
import { config } from "../../config/env.js";
import { logger } from "../../lib/logger.js";
import type {
  LogsPipelineContext,
  LogsPipelineHandler,
  LogsHandlerResult,
} from "./types.js";
import { LogsPipelineErrorCodes } from "./types.js";

/**
 * Validate Logs Handler - Enforces limits and validates data
 */
export class ValidateLogsHandler implements LogsPipelineHandler {
  readonly name = "ValidateLogsHandler";

  async handle(ctx: LogsPipelineContext): Promise<LogsHandlerResult> {
    if (!ctx.normalizedLogs) {
      return {
        continue: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "No normalized logs in context",
          httpStatus: 500,
        },
      };
    }

    const {
      maxLogsPerRequest,
      maxAttrPerLog,
      maxLogBodyLen,
      logTimestampDriftHours,
    } = config.limits;

    // Check max logs per request
    if (ctx.normalizedLogs.length > maxLogsPerRequest) {
      logger.warn(
        {
          logCount: ctx.normalizedLogs.length,
          maxAllowed: maxLogsPerRequest,
        },
        "Too many logs in request"
      );
      return {
        continue: false,
        error: {
          code: LogsPipelineErrorCodes.TOO_MANY_LOGS,
          message: `Request contains ${ctx.normalizedLogs.length} logs, max allowed is ${maxLogsPerRequest}`,
          httpStatus: 400,
        },
      };
    }

    const now = Date.now();
    const maxDriftMs = logTimestampDriftHours * 60 * 60 * 1000;
    const rejectedCount = 0;
    const rejectionReasons: string[] = [];

    // Validate and truncate each log record
    for (const log of ctx.normalizedLogs) {
      // Check attribute count
      const attrCount = Object.keys(log.attributes ?? {}).length;
      if (attrCount > maxAttrPerLog) {
        // Truncate attributes instead of rejecting
        const attrs = log.attributes ?? {};
        const keys = Object.keys(attrs).slice(0, maxAttrPerLog);
        log.attributes = Object.fromEntries(
          keys.map((k) => [k, attrs[k]])
        );
        log.droppedAttributesCount =
          (log.droppedAttributesCount ?? 0) + (attrCount - maxAttrPerLog);
      }

      // Truncate body if too long
      if (log.bodyText && log.bodyText.length > maxLogBodyLen) {
        log.bodyText = log.bodyText.slice(0, maxLogBodyLen) + "...[truncated]";
      }

      // Check timestamp drift
      const logTime = log.timestamp.getTime();
      const drift = Math.abs(now - logTime);
      if (drift > maxDriftMs) {
        logger.debug(
          {
            logTimestamp: log.timestamp.toISOString(),
            driftHours: drift / (60 * 60 * 1000),
            maxDriftHours: logTimestampDriftHours,
          },
          "Log timestamp outside allowed drift, clamping"
        );
        // Clamp to now instead of rejecting
        if (logTime > now) {
          log.timestamp = new Date(now);
        } else {
          log.timestamp = new Date(now - maxDriftMs);
        }
        rejectionReasons.push("timestamp_clamped");
      }
    }

    ctx.validationPassed = true;
    ctx.rejectedCount = rejectedCount;
    ctx.rejectionReasons = rejectionReasons;

    logger.debug(
      {
        logCount: ctx.normalizedLogs.length,
        rejectedCount,
      },
      "Logs validation passed"
    );

    return { continue: true };
  }
}
