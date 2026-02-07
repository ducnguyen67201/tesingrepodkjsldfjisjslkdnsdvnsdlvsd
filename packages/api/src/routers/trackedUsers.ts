import { z } from "zod";
import { createRouter, protectedProcedure, workspaceMiddleware } from "../trpc";
import { TrackedUserService } from "../services/trackedUser.service";
import { SortOrderSchema } from "../schemas/observability";

/**
 * Tracked Users Router - Manage tracked users (end-users of AI applications)
 *
 * TrackedUser = Your customers using your AI app
 * User = Dashboard/Auth users (developers)
 *
 * NOTE: Trace-based metrics removed - will be reworked for OTLP-first design
 */
export const trackedUsersRouter = createRouter({
  /**
   * List tracked users for a project (basic info only)
   */
  list: protectedProcedure
    .input(
      z.object({
        workspaceSlug: z.string().min(1),
        projectId: z.string().min(1),
        search: z.string().optional(),
        from: z.date().optional(),
        to: z.date().optional(),
        sortBy: z
          .enum(["lastSeenAt", "firstSeenAt"])
          .default("lastSeenAt"),
        sortOrder: SortOrderSchema.default("desc"),
        limit: z.number().int().min(1).max(100).default(50),
        cursor: z.string().optional(),
      })
    )
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }) => {
      return TrackedUserService.list({
        projectId: input.projectId,
        workspaceId: ctx.workspace.id,
        search: input.search,
        from: input.from,
        to: input.to,
        sortBy: input.sortBy,
        sortOrder: input.sortOrder,
        limit: input.limit,
        cursor: input.cursor,
      });
    }),

  /**
   * Get single user with recent sessions
   */
  get: protectedProcedure
    .input(
      z.object({
        workspaceSlug: z.string().min(1),
        id: z.string(),
      })
    )
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }) => {
      return TrackedUserService.get(input.id, ctx.workspace.id);
    }),

  /**
   * Get user by external ID
   */
  getByExternalId: protectedProcedure
    .input(
      z.object({
        workspaceSlug: z.string().min(1),
        projectId: z.string(),
        externalId: z.string(),
      })
    )
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }) => {
      return TrackedUserService.getByExternalId(
        input.projectId,
        input.externalId,
        ctx.workspace.id
      );
    }),

  // NOTE: traces and analytics endpoints removed - will be reworked for OTLP-first design

  /**
   * Project-level user summary stats
   */
  summary: protectedProcedure
    .input(
      z.object({
        workspaceSlug: z.string().min(1),
        projectId: z.string(),
      })
    )
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }) => {
      return TrackedUserService.getSummary(input.projectId, ctx.workspace.id);
    }),

  /**
   * Update user metadata
   */
  update: protectedProcedure
    .input(
      z.object({
        workspaceSlug: z.string().min(1),
        id: z.string(),
        name: z.string().max(255).optional(),
        email: z.string().email().optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .use(workspaceMiddleware)
    .mutation(async ({ ctx, input }) => {
      return TrackedUserService.update(input.id, ctx.workspace.id, {
        name: input.name,
        email: input.email,
        metadata: input.metadata,
      });
    }),

  /**
   * Delete tracked user (unlinks traces, doesn't delete them)
   */
  delete: protectedProcedure
    .input(
      z.object({
        workspaceSlug: z.string().min(1),
        id: z.string(),
      })
    )
    .use(workspaceMiddleware)
    .mutation(async ({ ctx, input }) => {
      return TrackedUserService.delete(input.id, ctx.workspace.id);
    }),
});

export type TrackedUsersRouter = typeof trackedUsersRouter;
