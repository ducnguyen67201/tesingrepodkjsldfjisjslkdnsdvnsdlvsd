/**
 * Logs Router
 *
 * Provides workspace-level access to ingested log records.
 * Supports filtering, pagination, and service aggregation.
 *
 * v2 procedures (listV2, filterKeys, filterValues, filterStats) support
 * the LogFilterExpression DSL for advanced query-based filtering.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { prisma, Prisma } from "@cognobserve/db";
import { createRouter, protectedProcedure, workspaceMiddleware } from "../trpc";
import { LogFilterService } from "../services/log-filter.service";
import {
  LogsListV2InputSchema,
  LogFilterKeysInputSchema,
  LogFilterValuesInputSchema,
  LogFilterStatsInputSchema,
  validateLogFilterGuardrails,
} from "../schemas/log-filtering";

/**
 * Log record list item
 */
export interface LogListItem {
  id: string;
  timestamp: string;
  severityNumber: number | null;
  severityText: string | null;
  serviceName: string | null;
  bodyText: string | null;
  traceId: string | null;
  spanId: string | null;
  projectId: string;
  projectName: string;
}

/**
 * Log detail with full attributes
 */
export interface LogDetail extends LogListItem {
  serviceVersion: string | null;
  environment: string | null;
  resource: unknown;
  scopeName: string | null;
  scopeVersion: string | null;
  observedTime: string | null;
  body: unknown;
  attributes: unknown;
  droppedAttributesCount: number | null;
  flags: number | null;
  ingestSource: string | null;
  createdAt: string;
}

/**
 * Paginated logs response
 */
export interface LogsListResponse {
  items: LogListItem[];
  nextCursor: string | null;
  totalCount: number;
}

/**
 * Service count for filters
 */
export interface ServiceCount {
  serviceName: string;
  count: number;
}

/**
 * Logs router
 */
export const logsRouter = createRouter({
  /**
   * List logs with filtering and pagination
   */
  list: protectedProcedure
    .input(
      z.object({
        workspaceSlug: z.string().min(1),
        projectId: z.string().optional(),
        severityMin: z.number().min(0).max(24).optional(),
        serviceName: z.string().optional(),
        search: z.string().optional(),
        traceId: z.string().optional(),
        cursor: z.string().optional(),
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }): Promise<LogsListResponse> => {
      const { projectId, severityMin, serviceName, search, traceId, cursor, limit } = input;

      // Get all projects in workspace
      const workspaceProjects = await prisma.project.findMany({
        where: { workspaceId: ctx.workspace.id },
        select: { id: true, name: true },
      });

      if (workspaceProjects.length === 0) {
        return { items: [], nextCursor: null, totalCount: 0 };
      }

      const projectIds = projectId
        ? [projectId]
        : workspaceProjects.map((p) => p.id);

      // Build where clause
      const where: Prisma.LogRecordWhereInput = {
        projectId: { in: projectIds },
      };

      if (severityMin !== undefined) {
        where.severityNumber = { gte: severityMin };
      }

      if (serviceName) {
        where.serviceName = serviceName;
      }

      if (search) {
        where.bodyText = { contains: search, mode: "insensitive" };
      }

      if (traceId) {
        where.traceId = traceId;
      }

      // Cursor-based pagination
      if (cursor) {
        where.id = { lt: cursor };
      }

      // Get total count (without cursor)
      const countWhere = { ...where };
      delete countWhere.id;
      const totalCount = await prisma.logRecord.count({ where: countWhere });

      // Get logs
      const logs = await prisma.logRecord.findMany({
        where,
        orderBy: { timestamp: "desc" },
        take: limit + 1, // Get one extra to determine if there's a next page
        select: {
          id: true,
          timestamp: true,
          severityNumber: true,
          severityText: true,
          serviceName: true,
          bodyText: true,
          traceId: true,
          spanId: true,
          projectId: true,
        },
      });

      // Determine next cursor
      let nextCursor: string | null = null;
      if (logs.length > limit) {
        const nextItem = logs.pop();
        nextCursor = nextItem!.id;
      }

      // Map project names
      const projectMap = new Map(workspaceProjects.map((p) => [p.id, p.name]));

      const items: LogListItem[] = logs.map((log) => ({
        id: log.id,
        timestamp: log.timestamp.toISOString(),
        severityNumber: log.severityNumber,
        severityText: log.severityText,
        serviceName: log.serviceName,
        bodyText: log.bodyText,
        traceId: log.traceId,
        spanId: log.spanId,
        projectId: log.projectId,
        projectName: projectMap.get(log.projectId) ?? "Unknown",
      }));

      return { items, nextCursor, totalCount };
    }),

  /**
   * Get a single log record with full details
   */
  get: protectedProcedure
    .input(
      z.object({
        workspaceSlug: z.string().min(1),
        logId: z.string().min(1),
      })
    )
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }): Promise<LogDetail> => {
      const { logId } = input;

      // Get all project IDs in workspace
      const workspaceProjects = await prisma.project.findMany({
        where: { workspaceId: ctx.workspace.id },
        select: { id: true, name: true },
      });

      const projectIds = workspaceProjects.map((p) => p.id);

      const log = await prisma.logRecord.findFirst({
        where: {
          id: logId,
          projectId: { in: projectIds },
        },
      });

      if (!log) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Log record not found",
        });
      }

      const projectMap = new Map(workspaceProjects.map((p) => [p.id, p.name]));

      return {
        id: log.id,
        timestamp: log.timestamp.toISOString(),
        severityNumber: log.severityNumber,
        severityText: log.severityText,
        serviceName: log.serviceName,
        serviceVersion: log.serviceVersion,
        environment: log.environment,
        resource: log.resource,
        scopeName: log.scopeName,
        scopeVersion: log.scopeVersion,
        observedTime: log.observedTime?.toISOString() ?? null,
        body: log.body,
        bodyText: log.bodyText,
        attributes: log.attributes,
        droppedAttributesCount: log.droppedAttributesCount,
        traceId: log.traceId,
        spanId: log.spanId,
        flags: log.flags,
        ingestSource: log.ingestSource,
        projectId: log.projectId,
        projectName: projectMap.get(log.projectId) ?? "Unknown",
        createdAt: log.createdAt.toISOString(),
      };
    }),

  /**
   * Get distinct service names for filter dropdown
   */
  getServices: protectedProcedure
    .input(
      z.object({
        workspaceSlug: z.string().min(1),
        projectId: z.string().optional(),
      })
    )
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }): Promise<ServiceCount[]> => {
      const { projectId } = input;

      // Get all project IDs in workspace
      const workspaceProjects = await prisma.project.findMany({
        where: { workspaceId: ctx.workspace.id },
        select: { id: true },
      });

      const projectIds = projectId
        ? [projectId]
        : workspaceProjects.map((p) => p.id);

      // Get distinct service names with counts
      const services = await prisma.logRecord.groupBy({
        by: ["serviceName"],
        where: {
          projectId: { in: projectIds },
          serviceName: { not: null },
        },
        _count: { serviceName: true },
        orderBy: { _count: { serviceName: "desc" } },
        take: 100,
      });

      return services.map((s) => ({
        serviceName: s.serviceName ?? "unknown",
        count: s._count.serviceName,
      }));
    }),

  /**
   * Get severity distribution for stats
   */
  getSeverityStats: protectedProcedure
    .input(
      z.object({
        workspaceSlug: z.string().min(1),
        projectId: z.string().optional(),
      })
    )
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }) => {
      const { projectId } = input;

      // Get all project IDs in workspace
      const workspaceProjects = await prisma.project.findMany({
        where: { workspaceId: ctx.workspace.id },
        select: { id: true },
      });

      const projectIds = projectId
        ? [projectId]
        : workspaceProjects.map((p) => p.id);

      // Get severity distribution
      const severities = await prisma.logRecord.groupBy({
        by: ["severityNumber"],
        where: { projectId: { in: projectIds } },
        _count: { severityNumber: true },
      });

      // Aggregate into severity levels
      const levels = {
        trace: 0,
        debug: 0,
        info: 0,
        warn: 0,
        error: 0,
        fatal: 0,
      };

      for (const s of severities) {
        const num = s.severityNumber ?? 0;
        const count = s._count.severityNumber;

        if (num <= 4) levels.trace += count;
        else if (num <= 8) levels.debug += count;
        else if (num <= 12) levels.info += count;
        else if (num <= 16) levels.warn += count;
        else if (num <= 20) levels.error += count;
        else levels.fatal += count;
      }

      return levels;
    }),

  // ============================================================================
  // v2 Procedures - Advanced Filtering with LogFilterExpression
  // ============================================================================

  /**
   * List logs with v2 FilterExpression support
   */
  listV2: protectedProcedure
    .input(LogsListV2InputSchema)
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }): Promise<LogsListResponse> => {
      const { projectId, timeRange, filter, limit, cursor } = input;

      // Validate filter guardrails
      if (filter) {
        const validation = validateLogFilterGuardrails(filter);
        if (!validation.valid) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: validation.errors.join("; "),
          });
        }
      }

      // Get all projects in workspace
      const workspaceProjects = await prisma.project.findMany({
        where: { workspaceId: ctx.workspace.id },
        select: { id: true, name: true },
      });

      if (workspaceProjects.length === 0) {
        return { items: [], nextCursor: null, totalCount: 0 };
      }

      const projectIds = projectId
        ? [projectId]
        : workspaceProjects.map((p) => p.id);

      // Build where clause using LogFilterService
      const where = LogFilterService.buildWhereClause(projectIds, timeRange, filter);

      // Add cursor for pagination
      const paginatedWhere: Prisma.LogRecordWhereInput = cursor
        ? { AND: [where, { id: { lt: cursor } }] }
        : where;

      // Get total count (without cursor)
      const totalCount = await prisma.logRecord.count({ where });

      // Get logs
      const logs = await prisma.logRecord.findMany({
        where: paginatedWhere,
        orderBy: { timestamp: "desc" },
        take: limit + 1,
        select: {
          id: true,
          timestamp: true,
          severityNumber: true,
          severityText: true,
          serviceName: true,
          bodyText: true,
          traceId: true,
          spanId: true,
          projectId: true,
        },
      });

      // Determine next cursor
      let nextCursor: string | null = null;
      if (logs.length > limit) {
        const nextItem = logs.pop();
        nextCursor = nextItem!.id;
      }

      // Map project names
      const projectMap = new Map(workspaceProjects.map((p) => [p.id, p.name]));

      const items: LogListItem[] = logs.map((log) => ({
        id: log.id,
        timestamp: log.timestamp.toISOString(),
        severityNumber: log.severityNumber,
        severityText: log.severityText,
        serviceName: log.serviceName,
        bodyText: log.bodyText,
        traceId: log.traceId,
        spanId: log.spanId,
        projectId: log.projectId,
        projectName: projectMap.get(log.projectId) ?? "Unknown",
      }));

      return { items, nextCursor, totalCount };
    }),

  /**
   * Get attribute keys for autocomplete
   */
  filterKeys: protectedProcedure
    .input(LogFilterKeysInputSchema)
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }) => {
      const { projectId, scope, prefix, limit } = input;

      // Get all projects in workspace
      const workspaceProjects = await prisma.project.findMany({
        where: { workspaceId: ctx.workspace.id },
        select: { id: true },
      });

      const projectIds = projectId
        ? [projectId]
        : workspaceProjects.map((p) => p.id);

      const column = scope === "resource" ? "resource" : "attributes";

      // Query for distinct keys from JSONB column
      // Using raw query for JSONB key extraction
      const prefixFilter = prefix ? `AND key LIKE '${prefix}%'` : "";
      const projectIdList = projectIds.map((id) => `'${id}'`).join(",");

      const result = await prisma.$queryRaw<{ key: string }[]>`
        SELECT DISTINCT jsonb_object_keys(${Prisma.raw(column)}) as key
        FROM "LogRecord"
        WHERE "projectId" IN (${Prisma.raw(projectIdList)})
          AND ${Prisma.raw(column)} IS NOT NULL
        ${Prisma.raw(prefixFilter)}
        LIMIT ${limit}
      `;

      return {
        keys: result.map((r) => r.key),
      };
    }),

  /**
   * Get attribute values for autocomplete
   */
  filterValues: protectedProcedure
    .input(LogFilterValuesInputSchema)
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }) => {
      const { projectId, scope, key, prefix, limit } = input;

      // Get all projects in workspace
      const workspaceProjects = await prisma.project.findMany({
        where: { workspaceId: ctx.workspace.id },
        select: { id: true },
      });

      const projectIds = projectId
        ? [projectId]
        : workspaceProjects.map((p) => p.id);

      const column = scope === "resource" ? "resource" : "attributes";
      const projectIdList = projectIds.map((id) => `'${id}'`).join(",");
      const prefixFilter = prefix
        ? `AND (${column}->>'${key}') LIKE '${prefix}%'`
        : "";

      const result = await prisma.$queryRaw<{ value: string }[]>`
        SELECT DISTINCT (${Prisma.raw(column)}->>${Prisma.raw(`'${key}'`)}) as value
        FROM "LogRecord"
        WHERE "projectId" IN (${Prisma.raw(projectIdList)})
          AND ${Prisma.raw(column)} IS NOT NULL
          AND ${Prisma.raw(column)}->>${Prisma.raw(`'${key}'`)} IS NOT NULL
        ${Prisma.raw(prefixFilter)}
        LIMIT ${limit}
      `;

      return {
        values: result.map((r) => r.value).filter((v) => v !== null),
      };
    }),

  /**
   * Get filter statistics (facets) for UI
   */
  filterStats: protectedProcedure
    .input(LogFilterStatsInputSchema)
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }) => {
      const { projectId, timeRange, filter } = input;

      // Get all projects in workspace
      const workspaceProjects = await prisma.project.findMany({
        where: { workspaceId: ctx.workspace.id },
        select: { id: true },
      });

      const projectIds = projectId
        ? [projectId]
        : workspaceProjects.map((p) => p.id);

      // Build where clause
      const where = LogFilterService.buildWhereClause(projectIds, timeRange, filter);

      // Get service counts
      const services = await prisma.logRecord.groupBy({
        by: ["serviceName"],
        where: { ...where, serviceName: { not: null } },
        _count: { serviceName: true },
        orderBy: { _count: { serviceName: "desc" } },
        take: 20,
      });

      // Get severity distribution
      const severities = await prisma.logRecord.groupBy({
        by: ["severityNumber"],
        where,
        _count: { severityNumber: true },
      });

      // Get environment counts
      const environments = await prisma.logRecord.groupBy({
        by: ["environment"],
        where: { ...where, environment: { not: null } },
        _count: { environment: true },
        orderBy: { _count: { environment: "desc" } },
        take: 10,
      });

      // Get total count
      const totalCount = await prisma.logRecord.count({ where });

      // Map severity numbers to levels
      const severityLevels = {
        trace: 0,
        debug: 0,
        info: 0,
        warn: 0,
        error: 0,
        fatal: 0,
      };

      for (const s of severities) {
        const num = s.severityNumber ?? 0;
        const count = s._count.severityNumber;

        if (num <= 4) severityLevels.trace += count;
        else if (num <= 8) severityLevels.debug += count;
        else if (num <= 12) severityLevels.info += count;
        else if (num <= 16) severityLevels.warn += count;
        else if (num <= 20) severityLevels.error += count;
        else severityLevels.fatal += count;
      }

      return {
        services: services.map((s) => ({
          name: s.serviceName ?? "unknown",
          count: s._count.serviceName,
        })),
        severities: Object.entries(severityLevels).map(([level, count]) => ({
          level,
          count,
        })),
        environments: environments.map((e) => ({
          name: e.environment ?? "unknown",
          count: e._count.environment,
        })),
        totalCount,
      };
    }),
});
