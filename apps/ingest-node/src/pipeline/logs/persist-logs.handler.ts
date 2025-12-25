/**
 * Persist Logs Handler
 *
 * Inserts normalized log records into the database.
 * Uses batch insert for efficiency.
 */
import { prisma, type Prisma } from "../../lib/db.js";
import { logger } from "../../lib/logger.js";
import type {
  LogsPipelineContext,
  LogsPipelineHandler,
  LogsHandlerResult,
} from "./types.js";
import { LogsPipelineErrorCodes } from "./types.js";

/**
 * Persist Logs Handler - Inserts logs into database
 */
export class PersistLogsHandler implements LogsPipelineHandler {
  readonly name = "PersistLogsHandler";

  async handle(ctx: LogsPipelineContext): Promise<LogsHandlerResult> {
    if (!ctx.normalizedLogs || ctx.normalizedLogs.length === 0) {
      ctx.persistedCount = 0;
      return { continue: true };
    }

    if (!ctx.projectId) {
      return {
        continue: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "No project ID in context",
          httpStatus: 500,
        },
      };
    }

    try {
      // Prepare data for batch insert
      // Note: Use ctx.projectId (set by AuthHandler), cast JSON fields for type compatibility
      const logData = ctx.normalizedLogs.map((log) => ({
        projectId: ctx.projectId!,
        serviceName: log.serviceName,
        serviceVersion: log.serviceVersion,
        environment: log.environment,
        resource: (log.resource as Prisma.InputJsonValue) ?? undefined,
        scopeName: log.scopeName,
        scopeVersion: log.scopeVersion,
        timestamp: log.timestamp,
        observedTime: log.observedTime,
        severityNumber: log.severityNumber,
        severityText: log.severityText,
        body: (log.body as Prisma.InputJsonValue) ?? undefined,
        bodyText: log.bodyText,
        attributes: (log.attributes as Prisma.InputJsonValue) ?? undefined,
        droppedAttributesCount: log.droppedAttributesCount,
        traceId: log.traceId,
        spanId: log.spanId,
        flags: log.flags,
        ingestSource: log.ingestSource ?? "otlp",
      }));

      // Batch insert
      const result = await prisma.logRecord.createMany({
        data: logData,
        skipDuplicates: true,
      });

      ctx.persistedCount = result.count;

      logger.debug(
        {
          requestedCount: ctx.normalizedLogs.length,
          persistedCount: result.count,
          projectId: ctx.projectId,
        },
        "Persisted logs to database"
      );

      return { continue: true };
    } catch (error) {
      logger.error({ error }, "Failed to persist logs");
      return {
        continue: false,
        error: {
          code: LogsPipelineErrorCodes.DATABASE_ERROR,
          message: "Failed to persist logs to database",
          httpStatus: 500,
          details: {
            error: error instanceof Error ? error.message : String(error),
          },
        },
      };
    }
  }
}
