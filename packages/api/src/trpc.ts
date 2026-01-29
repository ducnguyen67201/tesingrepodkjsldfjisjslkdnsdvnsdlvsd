import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { Context, SessionWithProjects, SessionWithWorkspaces } from "./context";
import { requireAuth, requireProjectRole, ADMIN_ROLES } from "./middleware/auth";
import {
  requireWorkspaceAccess,
  requireWorkspaceRole,
  WORKSPACE_ADMIN_ROLES,
} from "./middleware/workspace";

/**
 * Initialize tRPC with context type and superjson transformer.
 */
const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape }) {
    return {
      ...shape,
      data: {
        ...shape.data,
      },
    };
  },
});

/**
 * Create a new router.
 * Use this to define route modules.
 *
 * @example
 * ```ts
 * export const usersRouter = createRouter({
 *   list: publicProcedure.query(() => db.user.findMany()),
 *   get: publicProcedure.input(z.string()).query(({ input }) => db.user.findUnique({ where: { id: input } })),
 * });
 * ```
 */
export const createRouter = t.router;

/**
 * Merge multiple routers into one.
 */
export const mergeRouters = t.mergeRouters;

/**
 * Create middleware for procedures.
 */
export const middleware = t.middleware;

// Legacy alias for backwards compatibility
export const router = createRouter;

/**
 * Public procedure - no authentication required.
 * Use sparingly, most procedures should require auth.
 */
export const publicProcedure = t.procedure;

/**
 * Logging middleware - logs procedure calls for debugging/tracing.
 * Can be extended to integrate with observability tools.
 */
const loggerMiddleware = middleware(async ({ path, type, next }) => {
  const start = Date.now();
  const result = await next();
  const duration = Date.now() - start;

  if (result.ok) {
    console.log(`[tRPC] ${type} ${path} - OK (${duration}ms)`);
  } else {
    console.error(`[tRPC] ${type} ${path} - ERROR (${duration}ms)`, result.error);
  }

  return result;
});

/**
 * Auth middleware - ensures user is authenticated.
 */
const authMiddleware = middleware(({ ctx, next }) => {
  requireAuth(ctx);
  return next({
    ctx: {
      ...ctx,
      session: ctx.session as SessionWithProjects,
    },
  });
});

/**
 * Protected procedure - requires authentication.
 * Most procedures should use this.
 */
export const protectedProcedure = t.procedure
  .use(loggerMiddleware)
  .use(authMiddleware);

/**
 * Project admin procedure factory - requires OWNER or ADMIN role.
 * Use for procedures that modify project settings, API keys, etc.
 *
 * Usage:
 * ```ts
 * .input(z.object({ projectId: z.string() }))
 * .use(projectAdminMiddleware)
 * .mutation(({ ctx, input }) => { ... })
 * ```
 */
export const projectAdminMiddleware = middleware(async ({ ctx, next, getRawInput }) => {
  // Ensure auth first
  requireAuth(ctx);

  // Extract projectId from input
  const rawInput = await getRawInput();
  const input = rawInput as { projectId?: string };
  if (!input?.projectId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "projectId is required",
    });
  }

  // Check admin role
  requireProjectRole(
    ctx as Context & { session: SessionWithProjects },
    input.projectId,
    [...ADMIN_ROLES]
  );

  return next({
    ctx: {
      ...ctx,
      session: ctx.session as SessionWithProjects,
      projectId: input.projectId,
    },
  });
});

/**
 * Project admin procedure - requires OWNER or ADMIN role.
 * Convenience procedure that includes auth + admin check.
 */
export const projectAdminProcedure = t.procedure
  .use(loggerMiddleware)
  .use(projectAdminMiddleware);

/**
 * Workspace middleware - validates workspace access from workspaceId or workspaceSlug.
 * Extracts workspace info from input and adds to context.
 *
 * Usage:
 * ```ts
 * .input(z.object({ workspaceId: z.string() }))
 * .use(workspaceMiddleware)
 * .query(({ ctx }) => { ctx.workspace... })
 * ```
 */
export const workspaceMiddleware = middleware(async ({ ctx, next, getRawInput }) => {
  // Ensure auth first
  requireAuth(ctx);

  // Extract workspaceId or workspaceSlug from input
  const rawInput = await getRawInput();
  const input = rawInput as { workspaceId?: string; workspaceSlug?: string };
  const identifier = input?.workspaceId || input?.workspaceSlug;
  const bySlug = !!input?.workspaceSlug;

  if (!identifier) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "workspaceId or workspaceSlug is required",
    });
  }

  // Check workspace access
  const workspace = requireWorkspaceAccess(
    ctx as Context & { session: SessionWithWorkspaces },
    identifier,
    bySlug
  );

  return next({
    ctx: {
      ...ctx,
      session: ctx.session as SessionWithWorkspaces,
      workspace: {
        id: workspace.id,
        slug: workspace.slug,
        role: workspace.role,
      },
    },
  });
});

/**
 * Workspace procedure - requires workspace access.
 * Use for procedures that read workspace data.
 */
export const workspaceProcedure = t.procedure
  .use(loggerMiddleware)
  .use(workspaceMiddleware);

/**
 * Workspace admin middleware - requires OWNER or ADMIN role.
 * Use for procedures that modify workspace settings, members, etc.
 */
export const workspaceAdminMiddleware = middleware(async ({ ctx, next, getRawInput }) => {
  // Ensure auth first
  requireAuth(ctx);

  // Extract workspaceId from input
  const rawInput = await getRawInput();
  const input = rawInput as { workspaceId?: string };
  if (!input?.workspaceId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "workspaceId is required",
    });
  }

  // Check admin role
  requireWorkspaceRole(
    ctx as Context & { session: SessionWithWorkspaces },
    input.workspaceId,
    [...WORKSPACE_ADMIN_ROLES]
  );

  return next({
    ctx: {
      ...ctx,
      session: ctx.session as SessionWithWorkspaces,
      workspaceId: input.workspaceId,
    },
  });
});

/**
 * Workspace admin procedure - requires OWNER or ADMIN role.
 * Convenience procedure that includes auth + admin check.
 */
export const workspaceAdminProcedure = t.procedure
  .use(loggerMiddleware)
  .use(workspaceAdminMiddleware);

/**
 * Create caller for server-side usage.
 */
export const createCallerFactory = t.createCallerFactory;
