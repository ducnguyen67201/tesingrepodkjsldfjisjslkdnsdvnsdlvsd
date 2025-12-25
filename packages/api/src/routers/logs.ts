/**
 * Logs Router
 *
 * Provides workspace-level access to ingested log records.
 * Supports filtering, pagination, and service aggregation.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { prisma, Prisma } from "@cognobserve/db";
import { createRouter, protectedProcedure, workspaceMiddleware } from "../trpc";

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
});
