import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { prisma } from "@cognobserve/db";
import { createRouter, protectedProcedure, workspaceMiddleware } from "../trpc";

/**
 * Output types
 */
export interface ProjectListItem {
  id: string;
  name: string;
  createdAt: string;
  traceCount: number;
  spanCount: number;
  logCount: number;
  lastActivityAt: string | null;
}

export interface ProjectDetail {
  id: string;
  name: string;
  createdAt: string;
  traceCount: number;
  apiKeyCount: number;
}

/**
 * Projects Router
 */
export const projectsRouter = createRouter({
  /**
   * List all projects in a workspace with trace counts.
   */
  list: protectedProcedure
    .input(z.object({ workspaceSlug: z.string().min(1) }))
    .use(workspaceMiddleware)
    .query(async ({ ctx }): Promise<ProjectListItem[]> => {
      const projects = await prisma.project.findMany({
        where: { workspaceId: ctx.workspace.id },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          createdAt: true,
          _count: {
            select: { traces: true, logRecords: true },
          },
          traces: {
            select: {
              startTime: true,
              spanCount: true,
            },
            orderBy: { startTime: "desc" },
            take: 1,
          },
        },
      });

      // Calculate total span counts per project (sum of trace.spanCount)
      const projectIds = projects.map((p) => p.id);
      const spanCounts = await prisma.trace.groupBy({
        by: ["projectId"],
        where: { projectId: { in: projectIds } },
        _sum: { spanCount: true },
      });
      const spanCountMap = new Map(spanCounts.map((s) => [s.projectId, s._sum.spanCount ?? 0]));

      return projects.map((p) => ({
        id: p.id,
        name: p.name,
        createdAt: p.createdAt.toISOString(),
        traceCount: p._count.traces,
        spanCount: spanCountMap.get(p.id) ?? 0,
        logCount: p._count.logRecords,
        lastActivityAt: p.traces[0]?.startTime?.toISOString() ?? null,
      }));
    }),

  /**
   * Get a single project by ID (must belong to workspace).
   */
  get: protectedProcedure
    .input(
      z.object({
        workspaceSlug: z.string().min(1),
        projectId: z.string().min(1),
      })
    )
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }): Promise<ProjectDetail> => {
      const project = await prisma.project.findFirst({
        where: {
          id: input.projectId,
          workspaceId: ctx.workspace.id,
        },
        select: {
          id: true,
          name: true,
          createdAt: true,
          _count: {
            select: { traces: true, apiKeys: true },
          },
        },
      });

      if (!project) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Project not found",
        });
      }

      return {
        id: project.id,
        name: project.name,
        createdAt: project.createdAt.toISOString(),
        traceCount: project._count.traces,
        apiKeyCount: project._count.apiKeys,
      };
    }),

  /**
   * Create a new project in the workspace.
   */
  create: protectedProcedure
    .input(
      z.object({
        workspaceSlug: z.string().min(1),
        name: z.string().min(1).max(100),
      })
    )
    .use(workspaceMiddleware)
    .mutation(async ({ ctx, input }) => {
      const project = await prisma.project.create({
        data: {
          name: input.name,
          workspaceId: ctx.workspace.id,
        },
        select: {
          id: true,
          name: true,
          createdAt: true,
        },
      });

      return {
        id: project.id,
        name: project.name,
        createdAt: project.createdAt.toISOString(),
        traceCount: 0,
        spanCount: 0,
        logCount: 0,
        lastActivityAt: null,
      };
    }),
});

export type ProjectsRouter = typeof projectsRouter;
