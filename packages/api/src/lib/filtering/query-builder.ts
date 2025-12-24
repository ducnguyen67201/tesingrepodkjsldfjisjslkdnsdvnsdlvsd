/**
 * Query Builder for Trace/Span Filtering v2
 *
 * Builds Prisma queries for trace and span list endpoints using
 * the FilterExpression DSL. Supports keyset pagination and
 * EXISTS subqueries for span predicates on trace queries.
 *
 * @see docs/specs/tracing/TRACING_FILTERING_SEARCH_V2_SPEC.md
 */
import { prisma, Prisma } from "@cognobserve/db";
import {
  type FilterExpression,
  type TracesListV2Input,
  type SpansListV2Input,
  type PaginationCursor,
} from "../../schemas/filtering";
import { getFilterParser, type ParsedFilter } from "./filter-parser";

// ============================================================================
// Types
// ============================================================================

/**
 * Trace with optional span previews
 */
export interface TraceWithSpans {
  id: string;
  projectId: string;
  externalTraceId: string;
  serviceName: string;
  serviceVersion: string | null;
  environment: string | null;
  startTime: Date;
  endTime: Date | null;
  durationMs: number | null;
  spanCount: number;
  errorCount: number;
  rootSpanId: string | null;
  rootSpanName: string | null;
  rootSpanKind: string | null;
  rootSpanStatusCode: string | null;
  rootSpanDurationMs: number | null;
  hasError: boolean;
  hasException: boolean;
  spanTypes: string[];
  createdAt: Date;
  updatedAt: Date;
  // Preview spans (first few for display)
  spans?: SpanPreview[];
}

/**
 * Span preview for trace list
 */
export interface SpanPreview {
  id: string;
  externalSpanId: string;
  name: string;
  kind: string;
  statusCode: string;
  durationMs: number | null;
  spanType: string | null;
}

/**
 * Paginated result with cursor
 */
export interface PaginatedResult<T> {
  items: T[];
  nextCursor: PaginationCursor | null;
  hasMore: boolean;
}

// ============================================================================
// Query Builder Class
// ============================================================================

export class TraceQueryBuilder {
  private parser = getFilterParser();

  /**
   * Build and execute trace list query
   */
  async listTraces(input: TracesListV2Input): Promise<PaginatedResult<TraceWithSpans>> {
    const {
      projectId,
      timeRange,
      filter,
      _spanMatch = "any",
      limit = 50,
      cursor,
    } = input;

    // Parse filter expression
    const parsedFilter: ParsedFilter | null = filter
      ? this.parser.parse(filter)
      : null;

    // Build base where clause
    const baseWhere: Prisma.TraceWhereInput = {
      projectId,
      startTime: {
        gte: new Date(timeRange.from),
        lte: new Date(timeRange.to),
      },
    };

    // Add cursor condition for pagination
    if (cursor) {
      baseWhere.OR = [
        { startTime: { lt: new Date(cursor.startTime) } },
        {
          startTime: new Date(cursor.startTime),
          id: { lt: cursor.id },
        },
      ];
    }

    // Merge with parsed filter
    const traceWhere: Prisma.TraceWhereInput = parsedFilter?.traceWhere
      ? { AND: [baseWhere, parsedFilter.traceWhere] }
      : baseWhere;

    // Handle span predicates with EXISTS subquery
    let finalWhere = traceWhere;
    if (parsedFilter?.hasSpanPredicates && parsedFilter.spanWhere) {
      finalWhere = {
        AND: [
          traceWhere,
          {
            spans: {
              some: parsedFilter.spanWhere as Prisma.SpanWhereInput,
            },
          },
        ],
      };
    }

    // Execute query with limit + 1 to check for more
    const traces = await prisma.trace.findMany({
      where: finalWhere,
      orderBy: [{ startTime: "desc" }, { id: "desc" }],
      take: limit + 1,
      include: {
        spans: {
          take: 5,
          orderBy: { startTime: "asc" },
          select: {
            id: true,
            externalSpanId: true,
            name: true,
            kind: true,
            statusCode: true,
            durationMs: true,
            spanType: true,
          },
        },
      },
    });

    // Check if there are more results
    const hasMore = traces.length > limit;
    const items = hasMore ? traces.slice(0, limit) : traces;

    // Build next cursor
    const lastItem = items[items.length - 1];
    const nextCursor: PaginationCursor | null =
      hasMore && lastItem
        ? {
            startTime: lastItem.startTime.toISOString(),
            id: lastItem.id,
          }
        : null;

    return {
      items: items as TraceWithSpans[],
      nextCursor,
      hasMore,
    };
  }

  /**
   * Build and execute span list query
   */
  async listSpans(input: SpansListV2Input): Promise<PaginatedResult<Prisma.SpanGetPayload<object>>> {
    const {
      projectId,
      traceId,
      timeRange,
      filter,
      limit = 50,
      cursor,
    } = input;

    // Parse filter expression
    const parsedFilter: ParsedFilter | null = filter
      ? this.parser.parse(filter)
      : null;

    // Build base where clause
    const baseWhere: Prisma.SpanWhereInput = {
      trace: {
        projectId,
      },
      startTime: {
        gte: new Date(timeRange.from),
        lte: new Date(timeRange.to),
      },
    };

    // Filter to specific trace if provided
    if (traceId) {
      baseWhere.traceId = traceId;
    }

    // Add cursor condition for pagination
    if (cursor) {
      baseWhere.OR = [
        { startTime: { lt: new Date(cursor.startTime) } },
        {
          startTime: new Date(cursor.startTime),
          id: { lt: cursor.id },
        },
      ];
    }

    // Merge with parsed filter
    let finalWhere: Prisma.SpanWhereInput = baseWhere;

    if (parsedFilter) {
      const conditions: Prisma.SpanWhereInput[] = [baseWhere];

      if (parsedFilter.spanWhere) {
        conditions.push(parsedFilter.spanWhere);
      }

      // Apply trace predicates via join
      if (parsedFilter.traceWhere && Object.keys(parsedFilter.traceWhere).length > 0) {
        conditions.push({
          trace: parsedFilter.traceWhere,
        });
      }

      finalWhere = { AND: conditions };
    }

    // Execute query with limit + 1 to check for more
    const spans = await prisma.span.findMany({
      where: finalWhere,
      orderBy: [{ startTime: "desc" }, { id: "desc" }],
      take: limit + 1,
    });

    // Check if there are more results
    const hasMore = spans.length > limit;
    const items = hasMore ? spans.slice(0, limit) : spans;

    // Build next cursor
    const lastItem = items[items.length - 1];
    const nextCursor: PaginationCursor | null =
      hasMore && lastItem
        ? {
            startTime: lastItem.startTime.toISOString(),
            id: lastItem.id,
          }
        : null;

    return {
      items,
      nextCursor,
      hasMore,
    };
  }

  /**
   * Get filter statistics (facets) for a project
   */
  async getFilterStats(
    projectId: string,
    timeRange: { from: string; to: string },
    _filter?: FilterExpression
  ) {
    const baseWhere: Prisma.TraceWhereInput = {
      projectId,
      startTime: {
        gte: new Date(timeRange.from),
        lte: new Date(timeRange.to),
      },
    };

    // Get service counts
    const services = await prisma.trace.groupBy({
      by: ["serviceName"],
      where: baseWhere,
      _count: { serviceName: true },
      orderBy: { _count: { serviceName: "desc" } },
      take: 20,
    });

    // Get environment counts
    const environments = await prisma.trace.groupBy({
      by: ["environment"],
      where: { ...baseWhere, environment: { not: null } },
      _count: { environment: true },
      orderBy: { _count: { environment: "desc" } },
      take: 10,
    });

    // Get status code counts from root span
    const statusCodes = await prisma.trace.groupBy({
      by: ["rootSpanStatusCode"],
      where: { ...baseWhere, rootSpanStatusCode: { not: null } },
      _count: { rootSpanStatusCode: true },
      orderBy: { _count: { rootSpanStatusCode: "desc" } },
    });

    // Get HTTP routes from spans
    const httpRoutes = await prisma.span.groupBy({
      by: ["httpRoute"],
      where: {
        trace: baseWhere,
        httpRoute: { not: null },
      },
      _count: { httpRoute: true },
      orderBy: { _count: { httpRoute: "desc" } },
      take: 20,
    });

    // Get DB systems from spans
    const dbSystems = await prisma.span.groupBy({
      by: ["dbSystem"],
      where: {
        trace: baseWhere,
        dbSystem: { not: null },
      },
      _count: { dbSystem: true },
      orderBy: { _count: { dbSystem: "desc" } },
      take: 10,
    });

    // Get span types
    const spanTypes = await prisma.span.groupBy({
      by: ["spanType"],
      where: {
        trace: baseWhere,
        spanType: { not: null },
      },
      _count: { spanType: true },
      orderBy: { _count: { spanType: "desc" } },
    });

    return {
      services: services.map((s) => ({
        name: s.serviceName,
        count: s._count.serviceName,
      })),
      environments: environments.map((e) => ({
        name: e.environment!,
        count: e._count.environment,
      })),
      statusCodes: statusCodes.map((s) => ({
        code: s.rootSpanStatusCode!,
        count: s._count.rootSpanStatusCode,
      })),
      spanTypes: spanTypes.map((s) => ({
        type: s.spanType!,
        count: s._count.spanType,
      })),
      httpRoutes: httpRoutes.map((r) => ({
        route: r.httpRoute!,
        count: r._count.httpRoute,
      })),
      dbSystems: dbSystems.map((d) => ({
        system: d.dbSystem!,
        count: d._count.dbSystem,
      })),
    };
  }

  /**
   * Get attribute keys for autocomplete
   */
  async getAttributeKeys(
    projectId: string,
    scope: "resource" | "span",
    prefix?: string,
    limit = 20
  ): Promise<string[]> {
    // This is a simplified implementation
    // A production version would query distinct JSONB keys
    // For now, return common keys based on scope

    const commonResourceKeys = [
      "service.name",
      "service.version",
      "service.namespace",
      "deployment.environment",
      "cloud.provider",
      "cloud.region",
      "host.name",
      "telemetry.sdk.name",
      "telemetry.sdk.version",
    ];

    const commonSpanKeys = [
      "http.request.method",
      "http.response.status_code",
      "http.route",
      "url.full",
      "db.system",
      "db.name",
      "db.operation",
      "rpc.system",
      "rpc.service",
      "rpc.method",
      "gen_ai.operation.name",
      "gen_ai.provider.name",
      "gen_ai.request.model",
    ];

    const keys = scope === "resource" ? commonResourceKeys : commonSpanKeys;

    if (prefix) {
      return keys
        .filter((k) => k.toLowerCase().startsWith(prefix.toLowerCase()))
        .slice(0, limit);
    }

    return keys.slice(0, limit);
  }

  /**
   * Get attribute values for autocomplete
   */
  async getAttributeValues(
    projectId: string,
    scope: "resource" | "span",
    key: string,
    prefix?: string,
    limit = 20
  ): Promise<string[]> {
    // Simplified implementation
    // Would query distinct values from JSONB column

    // For promoted columns, we can query directly
    if (scope === "resource" && key === "service.name") {
      const results = await prisma.trace.findMany({
        where: {
          projectId,
          serviceName: prefix
            ? { startsWith: prefix, mode: "insensitive" }
            : undefined,
        },
        select: { serviceName: true },
        distinct: ["serviceName"],
        take: limit,
      });
      return results.map((r) => r.serviceName);
    }

    if (scope === "resource" && key === "deployment.environment") {
      const results = await prisma.trace.findMany({
        where: {
          projectId,
          environment: prefix
            ? { startsWith: prefix, mode: "insensitive" }
            : { not: null },
        },
        select: { environment: true },
        distinct: ["environment"],
        take: limit,
      });
      return results.filter((r) => r.environment).map((r) => r.environment!);
    }

    // For other keys, return empty for now
    return [];
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let _builder: TraceQueryBuilder | null = null;

/**
 * Get the singleton TraceQueryBuilder instance
 */
export const getQueryBuilder = (): TraceQueryBuilder => {
  if (!_builder) {
    _builder = new TraceQueryBuilder();
  }
  return _builder;
};
