/**
 * Persist Handler
 *
 * Sixth handler in the pipeline (after AuthHandler). Responsible for:
 * 1. Persisting normalized traces to database
 * 2. Persisting normalized spans to database
 * 3. Handling idempotent upserts via unique constraints
 *
 * Idempotency:
 * - Traces: upsert by (projectId, externalTraceId)
 * - Spans: upsert by (traceId, externalSpanId)
 *
 * This ensures duplicate ingestion requests don't create duplicate data.
 */
import { logger } from "../../lib/logger.js";
import { metrics } from "../../lib/metrics.js";
import { prisma, Prisma } from "../../lib/db.js";
import type { NormalizedTrace, NormalizedSpan } from "@cognobserve/api/schemas";
import type {
  PipelineContext,
  PipelineHandler,
  HandlerResult,
} from "../types.js";
import { PipelineErrorCodes } from "../types.js";

/**
 * Result of persistence operation
 */
interface PersistenceResult {
  tracesCreated: number;
  tracesUpdated: number;
  spansCreated: number;
  spansUpdated: number;
}

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
          code: PipelineErrorCodes.INTERNAL_ERROR,
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
          code: PipelineErrorCodes.INTERNAL_ERROR,
          message: "Missing project ID in pipeline context",
          httpStatus: 500,
        },
      };
    }

    const startTime = performance.now();

    try {
      const result = await this.persistData(
        ctx.projectId,
        ctx.normalizedTraces,
        ctx.normalizedSpans
      );

      // Set context for response handler
      ctx.persistedTraceIds = ctx.normalizedTraces.map((t) => t.externalTraceId);
      ctx.persistedSpanCount = ctx.normalizedSpans.length;

      const duration = performance.now() - startTime;
      metrics.dbLatency.observe({ operation: "persist" }, duration / 1000);

      logger.info(
        {
          projectId: ctx.projectId,
          tracesCreated: result.tracesCreated,
          tracesUpdated: result.tracesUpdated,
          spansCreated: result.spansCreated,
          spansUpdated: result.spansUpdated,
          durationMs: Math.round(duration),
        },
        "Traces persisted successfully"
      );

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

  /**
   * Persist traces and spans to database with idempotent upserts
   */
  private async persistData(
    projectId: string,
    traces: NormalizedTrace[],
    spans: NormalizedSpan[]
  ): Promise<PersistenceResult> {
    const result: PersistenceResult = {
      tracesCreated: 0,
      tracesUpdated: 0,
      spansCreated: 0,
      spansUpdated: 0,
    };

    // Group spans by trace for efficient processing
    const spansByTrace = this.groupSpansByTrace(spans);

    // Use a transaction for atomicity
    await prisma.$transaction(async (tx) => {
      // Upsert each trace and its spans
      for (const trace of traces) {
        const traceSpans = spansByTrace.get(trace.externalTraceId) ?? [];

        // Calculate aggregates from spans
        const errorCount = traceSpans.filter(
          (s) => s.statusCode === "ERROR"
        ).length;
        const spanCount = traceSpans.length;
        const durationMs = this.calculateTraceDuration(traceSpans);
        const endTime = this.calculateTraceEndTime(traceSpans);

        // Upsert trace
        const existingTrace = await tx.trace.findUnique({
          where: {
            projectId_externalTraceId: {
              projectId,
              externalTraceId: trace.externalTraceId,
            },
          },
          select: { id: true },
        });

        const upsertedTrace = await tx.trace.upsert({
          where: {
            projectId_externalTraceId: {
              projectId,
              externalTraceId: trace.externalTraceId,
            },
          },
          create: {
            projectId,
            externalTraceId: trace.externalTraceId,
            serviceName: trace.serviceName ?? "unknown",
            serviceVersion: trace.serviceVersion,
            environment: trace.environment,
            resource: (trace.resource as Prisma.InputJsonValue) ?? undefined,
            startTime: trace.startTime,
            endTime,
            durationMs,
            spanCount,
            errorCount,
            // V2: Root span metadata
            rootSpanId: trace.rootSpanId,
            rootSpanName: trace.rootSpanName,
            rootSpanKind: trace.rootSpanKind,
            rootSpanStatusCode: trace.rootSpanStatusCode,
            rootSpanDurationMs: trace.rootSpanDurationMs,
            // V2: Error/exception flags
            hasError: trace.hasError ?? false,
            hasException: trace.hasException ?? false,
            // V2: Span type aggregation
            spanTypes: trace.spanTypes ?? [],
            // V2: Full-text search
            searchText: trace.searchText,
          },
          update: {
            // Update aggregates and timing on re-ingestion
            spanCount: { increment: spanCount },
            errorCount: { increment: errorCount },
            durationMs,
            endTime,
            // V2: Update root span metadata on re-ingestion
            rootSpanId: trace.rootSpanId,
            rootSpanName: trace.rootSpanName,
            rootSpanKind: trace.rootSpanKind,
            rootSpanStatusCode: trace.rootSpanStatusCode,
            rootSpanDurationMs: trace.rootSpanDurationMs,
            // V2: Update flags
            hasError: trace.hasError ?? false,
            hasException: trace.hasException ?? false,
            // V2: Update span types (merge with existing)
            spanTypes: trace.spanTypes ?? [],
            // V2: Update search text
            searchText: trace.searchText,
          },
        });

        if (existingTrace) {
          result.tracesUpdated++;
        } else {
          result.tracesCreated++;
        }

        // Upsert spans for this trace
        for (const span of traceSpans) {
          const spanResult = await this.upsertSpan(tx, upsertedTrace.id, span);
          if (spanResult === "created") {
            result.spansCreated++;
          } else {
            result.spansUpdated++;
          }
        }
      }
    });

    return result;
  }

  /**
   * Upsert a single span
   */
  private async upsertSpan(
    tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
    traceId: string,
    span: NormalizedSpan
  ): Promise<"created" | "updated"> {
    const existingSpan = await tx.span.findUnique({
      where: {
        traceId_externalSpanId: {
          traceId,
          externalSpanId: span.externalSpanId,
        },
      },
      select: { id: true },
    });

    await tx.span.upsert({
      where: {
        traceId_externalSpanId: {
          traceId,
          externalSpanId: span.externalSpanId,
        },
      },
      create: {
        traceId,
        externalSpanId: span.externalSpanId,
        parentSpanId: span.externalParentId,
        name: span.name,
        kind: span.kind ?? "INTERNAL",
        statusCode: span.statusCode ?? "UNSET",
        statusMessage: span.statusMessage,
        traceState: span.traceState,
        startTime: span.startTime,
        endTime: span.endTime,
        durationMs: span.durationMs,
        attributes: (span.attributes as Prisma.InputJsonValue) ?? undefined,
        events: (span.events as Prisma.InputJsonValue) ?? undefined,
        links: (span.links as Prisma.InputJsonValue) ?? undefined,
        libraryName: span.libraryName,
        libraryVersion: span.libraryVersion,
        model: span.model,
        promptTokens: span.promptTokens,
        completionTokens: span.completionTokens,
        totalTokens:
          span.promptTokens && span.completionTokens
            ? span.promptTokens + span.completionTokens
            : undefined,
        input: (span.input as Prisma.InputJsonValue) ?? undefined,
        output: (span.output as Prisma.InputJsonValue) ?? undefined,
        // V2: HTTP semantic conventions
        httpMethod: span.httpMethod,
        httpRoute: span.httpRoute,
        httpStatusCode: span.httpStatusCode,
        httpUrl: span.httpUrl,
        // V2: Database semantic conventions
        dbSystem: span.dbSystem,
        dbName: span.dbName,
        dbOperation: span.dbOperation,
        dbStatement: span.dbStatement,
        dbCollection: span.dbCollection,
        // V2: RPC semantic conventions
        rpcSystem: span.rpcSystem,
        rpcService: span.rpcService,
        rpcMethod: span.rpcMethod,
        rpcStatusCode: span.rpcStatusCode,
        // V2: Exception semantic conventions
        exceptionType: span.exceptionType,
        exceptionMessage: span.exceptionMessage,
        // V2: GenAI extended fields
        genAiOperation: span.genAiOperation,
        genAiProvider: span.genAiProvider,
        // V2: Inferred span type
        spanType: span.spanType,
        // V2: Full-text search
        searchText: span.searchText,
      },
      update: {
        // On re-ingestion, update fields that may have changed
        endTime: span.endTime,
        durationMs: span.durationMs,
        statusCode: span.statusCode ?? "UNSET",
        statusMessage: span.statusMessage,
        attributes: (span.attributes as Prisma.InputJsonValue) ?? undefined,
        events: (span.events as Prisma.InputJsonValue) ?? undefined,
        links: (span.links as Prisma.InputJsonValue) ?? undefined,
        output: (span.output as Prisma.InputJsonValue) ?? undefined,
        // V2: Update semantic convention fields
        httpMethod: span.httpMethod,
        httpRoute: span.httpRoute,
        httpStatusCode: span.httpStatusCode,
        httpUrl: span.httpUrl,
        dbSystem: span.dbSystem,
        dbName: span.dbName,
        dbOperation: span.dbOperation,
        dbStatement: span.dbStatement,
        dbCollection: span.dbCollection,
        rpcSystem: span.rpcSystem,
        rpcService: span.rpcService,
        rpcMethod: span.rpcMethod,
        rpcStatusCode: span.rpcStatusCode,
        exceptionType: span.exceptionType,
        exceptionMessage: span.exceptionMessage,
        genAiOperation: span.genAiOperation,
        genAiProvider: span.genAiProvider,
        spanType: span.spanType,
        searchText: span.searchText,
      },
    });

    return existingSpan ? "updated" : "created";
  }

  /**
   * Group spans by their external trace ID
   */
  private groupSpansByTrace(spans: NormalizedSpan[]): Map<string, NormalizedSpan[]> {
    const grouped = new Map<string, NormalizedSpan[]>();

    for (const span of spans) {
      const existing = grouped.get(span.externalTraceId);
      if (existing) {
        existing.push(span);
      } else {
        grouped.set(span.externalTraceId, [span]);
      }
    }

    return grouped;
  }

  /**
   * Calculate trace duration from spans (max endTime - min startTime)
   */
  private calculateTraceDuration(spans: NormalizedSpan[]): number | undefined {
    if (spans.length === 0) return undefined;

    let minStart: number | undefined;
    let maxEnd: number | undefined;

    for (const span of spans) {
      const startMs = span.startTime.getTime();
      const endMs = span.endTime?.getTime();

      if (minStart === undefined || startMs < minStart) {
        minStart = startMs;
      }
      if (endMs !== undefined && (maxEnd === undefined || endMs > maxEnd)) {
        maxEnd = endMs;
      }
    }

    if (minStart !== undefined && maxEnd !== undefined) {
      return maxEnd - minStart;
    }

    return undefined;
  }

  /**
   * Calculate trace end time (latest span end time)
   */
  private calculateTraceEndTime(spans: NormalizedSpan[]): Date | undefined {
    let maxEnd: Date | undefined;

    for (const span of spans) {
      if (span.endTime) {
        if (!maxEnd || span.endTime > maxEnd) {
          maxEnd = span.endTime;
        }
      }
    }

    return maxEnd;
  }
}
