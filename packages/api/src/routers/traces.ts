/**
 * Traces Router
 *
 * Provides endpoints for listing and retrieving OTLP-first traces.
 * Supports filtering by service, duration, status, and span types.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { prisma, Prisma } from "@cognobserve/db";
import { createRouter, protectedProcedure, workspaceMiddleware } from "../trpc";
import {
  TraceFiltersSchema,
  type SpanType,
} from "../schemas/traces";
import { TimeRangeSchema, type TimeRange } from "../schemas/cost";
import {
  TracesListV2InputSchema,
  SpansListV2InputSchema,
} from "../schemas/filtering";
import { getQueryBuilder } from "../lib/filtering";

// ------------------------------------------------------------
// Constants
// ------------------------------------------------------------

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

// ------------------------------------------------------------
// Input Schemas
// ------------------------------------------------------------

const TraceListInput = z.object({
  workspaceSlug: z.string(),
  projectId: z.string(),
  // Pagination
  cursor: z.string().optional(),
  limit: z.number().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  // Filters
  filters: TraceFiltersSchema.optional(),
});

const TraceGetInput = z.object({
  workspaceSlug: z.string(),
  projectId: z.string(),
  traceId: z.string(),
});

const TraceStatsInput = z.object({
  workspaceSlug: z.string(),
  projectId: z.string(),
  timeRange: TimeRangeSchema.default("24h"),
  customFrom: z.string().optional(),
  customTo: z.string().optional(),
});

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------

/** Trace list item with computed span types */
export interface TraceListItem {
  id: string;
  externalTraceId: string;
  serviceName: string;
  serviceVersion: string | null;
  environment: string | null;
  startTime: Date;
  endTime: Date | null;
  durationMs: number | null;
  spanCount: number;
  errorCount: number;
  /** Inferred span types present in this trace */
  spanTypes: SpanType[];
}

/** Span with inferred type */
export interface SpanWithType {
  id: string;
  externalSpanId: string;
  parentSpanId: string | null;
  name: string;
  kind: string;
  statusCode: string;
  statusMessage: string | null;
  startTime: Date;
  endTime: Date | null;
  durationMs: number | null;
  attributes: unknown;
  events: unknown;
  libraryName: string | null;
  libraryVersion: string | null;
  // LLM fields
  model: string | null;
  modelParameters: unknown;
  input: unknown;
  output: unknown;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  inputCost: number | null;
  outputCost: number | null;
  totalCost: number | null;
  genAiProvider: string | null;
  genAiOperation: string | null;
  // Error fields
  exceptionMessage: string | null;
  exceptionType: string | null;
  // HTTP fields
  httpMethod: string | null;
  httpUrl: string | null;
  httpStatusCode: number | null;
  httpRoute: string | null;
  // DB fields
  dbSystem: string | null;
  dbName: string | null;
  dbStatement: string | null;
  dbOperation: string | null;
  // A/B Testing fields
  promptVariantId: string | null;
  promptVersionId: string | null;
  promptExperimentId: string | null;
  /** Inferred span type */
  type: SpanType;
}

// ------------------------------------------------------------
// Helper Functions
// ------------------------------------------------------------

/**
 * Infer span type from attributes and fields.
 * Order matters - more specific checks first.
 */
const inferSpanType = (span: {
  model: string | null;
  attributes: unknown;
  name: string;
  libraryName: string | null;
}): SpanType => {
  // Check for LLM spans (model field or gen_ai attributes)
  if (span.model) {
    return "LLM";
  }

  // Check attributes for type hints
  const attrs = span.attributes as Record<string, unknown> | null;
  if (attrs) {
    // LLM detection
    if (
      attrs["gen_ai.request.model"] ||
      attrs["gen_ai.model"] ||
      attrs["llm.model"]
    ) {
      return "LLM";
    }

    // HTTP detection
    if (
      attrs["http.method"] ||
      attrs["http.request.method"] ||
      attrs["http.url"] ||
      attrs["url.full"]
    ) {
      return "HTTP";
    }

    // Database detection
    if (
      attrs["db.system"] ||
      attrs["db.name"] ||
      attrs["db.statement"]
    ) {
      return "DB";
    }

    // Function detection
    if (attrs["code.function"] || attrs["code.namespace"]) {
      return "FUNCTION";
    }
  }

  // Check library name for hints
  if (span.libraryName) {
    const lib = span.libraryName.toLowerCase();
    if (lib.includes("openai") || lib.includes("anthropic") || lib.includes("llm")) {
      return "LLM";
    }
    if (lib.includes("http") || lib.includes("fetch")) {
      return "HTTP";
    }
    if (lib.includes("pg") || lib.includes("mysql") || lib.includes("redis")) {
      return "DB";
    }
  }

  // Default
  return "CUSTOM";
};

/**
 * Get date range based on time range preset.
 */
const getDateRange = (
  range: TimeRange,
  customFrom?: string,
  customTo?: string
): { start: Date; end: Date } => {
  const now = new Date();
  const end = now;
  const start = new Date();

  if (range === "custom" && customFrom && customTo) {
    return {
      start: new Date(customFrom),
      end: new Date(customTo),
    };
  }

  switch (range) {
    case "24h":
      start.setHours(start.getHours() - 24);
      break;
    case "7d":
      start.setDate(start.getDate() - 7);
      break;
    case "30d":
      start.setDate(start.getDate() - 30);
      break;
  }

  return { start, end };
};

/**
 * Build Prisma where clause for trace filtering.
 */
const buildTraceFilters = (
  projectId: string,
  filters: z.infer<typeof TraceFiltersSchema> | undefined,
  dateRange: { start: Date; end: Date }
): Prisma.TraceWhereInput => {
  const where: Prisma.TraceWhereInput = {
    projectId,
    startTime: {
      gte: dateRange.start,
      lte: dateRange.end,
    },
  };

  if (!filters) return where;

  // Search by service name
  if (filters.search) {
    where.serviceName = {
      contains: filters.search,
      mode: "insensitive",
    };
  }

  // Filter by error status (errorCount > 0)
  if (filters.levels?.includes("ERROR")) {
    where.errorCount = { gt: 0 };
  }

  // Duration filters
  if (filters.minDuration !== undefined) {
    where.durationMs = {
      ...((where.durationMs as Prisma.IntNullableFilter) ?? {}),
      gte: filters.minDuration,
    };
  }
  if (filters.maxDuration !== undefined) {
    where.durationMs = {
      ...((where.durationMs as Prisma.IntNullableFilter) ?? {}),
      lte: filters.maxDuration,
    };
  }

  return where;
};

/**
 * Filter traces by span types (post-query filter since type is inferred).
 */
const filterBySpanTypes = (
  traces: TraceListItem[],
  types: SpanType[] | undefined
): TraceListItem[] => {
  if (!types || types.length === 0) return traces;

  return traces.filter((trace) =>
    types.some((type) => trace.spanTypes.includes(type))
  );
};

// ------------------------------------------------------------
// Router
// ------------------------------------------------------------

export const tracesRouter = createRouter({
  /**
   * List traces with pagination and filters.
   * Returns traces with inferred span types.
   */
  list: protectedProcedure
    .input(TraceListInput)
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }) => {
      // Verify project access
      const project = await prisma.project.findFirst({
        where: { id: input.projectId, workspaceId: ctx.workspace.id },
        select: { id: true },
      });

      if (!project) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      }

      // Determine date range (default to 24h)
      const timeRange = input.filters?.timeRange ?? "24h";
      const dateRange = getDateRange(
        timeRange,
        input.filters?.customRange?.from,
        input.filters?.customRange?.to
      );

      // Build where clause
      const where = buildTraceFilters(input.projectId, input.filters, dateRange);

      // Parse cursor (format: "startTime|id")
      let cursorCondition: Prisma.TraceWhereInput | undefined;
      if (input.cursor) {
        const [cursorTime, cursorId] = input.cursor.split("|");
        if (cursorTime && cursorId) {
          cursorCondition = {
            OR: [
              { startTime: { lt: new Date(cursorTime) } },
              {
                startTime: new Date(cursorTime),
                id: { lt: cursorId },
              },
            ],
          };
        }
      }

      // Fetch traces with a buffer for post-filtering by span types
      const needsTypeFilter = input.filters?.types && input.filters.types.length > 0;
      const fetchLimit = needsTypeFilter ? input.limit * 3 : input.limit + 1;

      const traces = await prisma.trace.findMany({
        where: cursorCondition ? { AND: [where, cursorCondition] } : where,
        orderBy: [{ startTime: "desc" }, { id: "desc" }],
        take: fetchLimit,
        select: {
          id: true,
          externalTraceId: true,
          serviceName: true,
          serviceVersion: true,
          environment: true,
          startTime: true,
          endTime: true,
          durationMs: true,
          spanCount: true,
          errorCount: true,
          spans: {
            select: {
              model: true,
              attributes: true,
              name: true,
              libraryName: true,
            },
            take: 10, // Limit spans per trace for type inference - only need representative sample
          },
        },
      });

      // Process traces to infer span types
      let processedTraces: TraceListItem[] = traces.map((trace) => {
        const spanTypes = new Set<SpanType>();
        for (const span of trace.spans) {
          spanTypes.add(inferSpanType(span));
        }

        return {
          id: trace.id,
          externalTraceId: trace.externalTraceId,
          serviceName: trace.serviceName,
          serviceVersion: trace.serviceVersion,
          environment: trace.environment,
          startTime: trace.startTime,
          endTime: trace.endTime,
          durationMs: trace.durationMs,
          spanCount: trace.spanCount,
          errorCount: trace.errorCount,
          spanTypes: Array.from(spanTypes),
        };
      });

      // Apply span type filter
      if (needsTypeFilter) {
        processedTraces = filterBySpanTypes(processedTraces, input.filters?.types);
      }

      // Apply pagination limit
      const hasMore = processedTraces.length > input.limit;
      const resultTraces = processedTraces.slice(0, input.limit);

      // Build next cursor
      let nextCursor: string | null = null;
      if (hasMore) {
        const lastTrace = resultTraces[resultTraces.length - 1];
        if (lastTrace) {
          nextCursor = `${lastTrace.startTime.toISOString()}|${lastTrace.id}`;
        }
      }

      return {
        traces: resultTraces,
        nextCursor,
      };
    }),

  /**
   * Get a single trace with all its spans.
   * Returns spans with inferred types in hierarchical structure.
   */
  get: protectedProcedure
    .input(TraceGetInput)
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }) => {
      // Verify project access
      const project = await prisma.project.findFirst({
        where: { id: input.projectId, workspaceId: ctx.workspace.id },
        select: { id: true },
      });

      if (!project) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      }

      // Fetch trace with spans
      const trace = await prisma.trace.findFirst({
        where: {
          id: input.traceId,
          projectId: input.projectId,
        },
        include: {
          spans: {
            orderBy: { startTime: "asc" },
            select: {
              id: true,
              externalSpanId: true,
              parentSpanId: true,
              name: true,
              kind: true,
              statusCode: true,
              statusMessage: true,
              startTime: true,
              endTime: true,
              durationMs: true,
              attributes: true,
              events: true,
              libraryName: true,
              libraryVersion: true,
              // LLM fields
              model: true,
              modelParameters: true,
              input: true,
              output: true,
              promptTokens: true,
              completionTokens: true,
              totalTokens: true,
              inputCost: true,
              outputCost: true,
              totalCost: true,
              genAiProvider: true,
              genAiOperation: true,
              // Error fields
              exceptionMessage: true,
              exceptionType: true,
              // HTTP fields
              httpMethod: true,
              httpUrl: true,
              httpStatusCode: true,
              httpRoute: true,
              // DB fields
              dbSystem: true,
              dbName: true,
              dbStatement: true,
              dbOperation: true,
              // A/B Testing fields
              promptVariantId: true,
              promptVersionId: true,
              promptExperimentId: true,
            },
          },
        },
      });

      if (!trace) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Trace not found" });
      }

      // Process spans to add inferred types
      const spansWithTypes: SpanWithType[] = trace.spans.map((span) => ({
        id: span.id,
        externalSpanId: span.externalSpanId,
        parentSpanId: span.parentSpanId,
        name: span.name,
        kind: span.kind,
        statusCode: span.statusCode,
        statusMessage: span.statusMessage,
        startTime: span.startTime,
        endTime: span.endTime,
        durationMs: span.durationMs,
        attributes: span.attributes,
        events: span.events,
        libraryName: span.libraryName,
        libraryVersion: span.libraryVersion,
        // LLM fields
        model: span.model,
        modelParameters: span.modelParameters,
        input: span.input,
        output: span.output,
        promptTokens: span.promptTokens,
        completionTokens: span.completionTokens,
        totalTokens: span.totalTokens,
        inputCost: span.inputCost?.toNumber() ?? null,
        outputCost: span.outputCost?.toNumber() ?? null,
        totalCost: span.totalCost?.toNumber() ?? null,
        genAiProvider: span.genAiProvider,
        genAiOperation: span.genAiOperation,
        // Error fields
        exceptionMessage: span.exceptionMessage,
        exceptionType: span.exceptionType,
        // HTTP fields
        httpMethod: span.httpMethod,
        httpUrl: span.httpUrl,
        httpStatusCode: span.httpStatusCode,
        httpRoute: span.httpRoute,
        // DB fields
        dbSystem: span.dbSystem,
        dbName: span.dbName,
        dbStatement: span.dbStatement,
        dbOperation: span.dbOperation,
        // A/B Testing fields
        promptVariantId: span.promptVariantId,
        promptVersionId: span.promptVersionId,
        promptExperimentId: span.promptExperimentId,
        type: inferSpanType(span),
      }));

      return {
        trace: {
          id: trace.id,
          externalTraceId: trace.externalTraceId,
          serviceName: trace.serviceName,
          serviceVersion: trace.serviceVersion,
          environment: trace.environment,
          startTime: trace.startTime,
          endTime: trace.endTime,
          durationMs: trace.durationMs,
          spanCount: trace.spanCount,
          errorCount: trace.errorCount,
        },
        spans: spansWithTypes,
      };
    }),

  /**
   * Get trace statistics for a project.
   * Returns aggregate counts for the header display.
   */
  getStats: protectedProcedure
    .input(TraceStatsInput)
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }) => {
      // Verify project access
      const project = await prisma.project.findFirst({
        where: { id: input.projectId, workspaceId: ctx.workspace.id },
        select: { id: true },
      });

      if (!project) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      }

      const dateRange = getDateRange(input.timeRange, input.customFrom, input.customTo);

      const stats = await prisma.trace.aggregate({
        where: {
          projectId: input.projectId,
          startTime: {
            gte: dateRange.start,
            lte: dateRange.end,
          },
        },
        _count: true,
        _sum: {
          errorCount: true,
        },
        _avg: {
          durationMs: true,
        },
      });

      return {
        total: stats._count,
        errorCount: stats._sum.errorCount ?? 0,
        avgDurationMs: stats._avg.durationMs ?? 0,
      };
    }),

  // ============================================================================
  // V2 Endpoints (FilterExpression DSL)
  // ============================================================================

  /**
   * List traces with v2 filtering (FilterExpression DSL).
   * Supports AND/OR/NOT expressions, field predicates, attribute predicates,
   * event predicates, and full-text search.
   */
  listV2: protectedProcedure
    .input(TracesListV2InputSchema)
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }) => {
      // Verify project access
      const project = await prisma.project.findFirst({
        where: { id: input.projectId, workspaceId: ctx.workspace.id },
        select: { id: true },
      });

      if (!project) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      }

      const builder = getQueryBuilder();
      const result = await builder.listTraces(input);

      return {
        traces: result.items,
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      };
    }),

  /**
   * List spans with v2 filtering (FilterExpression DSL).
   * Can filter by trace or across all spans in a project.
   */
  listSpansV2: protectedProcedure
    .input(SpansListV2InputSchema)
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }) => {
      // Verify project access
      const project = await prisma.project.findFirst({
        where: { id: input.projectId, workspaceId: ctx.workspace.id },
        select: { id: true },
      });

      if (!project) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      }

      const builder = getQueryBuilder();
      const result = await builder.listSpans(input);

      return {
        spans: result.items,
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      };
    }),
});

export type TracesRouter = typeof tracesRouter;
