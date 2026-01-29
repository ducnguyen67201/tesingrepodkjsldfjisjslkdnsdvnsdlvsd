import { TRPCError } from "@trpc/server";
import type { Context, SessionWithProjects, ProjectAccess } from "../context";

/**
 * Middleware that ensures the user is authenticated.
 * Throws UNAUTHORIZED if no session.
 */
export function requireAuth(ctx: Context): asserts ctx is Context & { session: SessionWithProjects } {
  if (!ctx.session?.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be logged in to perform this action",
    });
  }
}

/**
 * Checks if user has access to a project.
 */
export function hasProjectAccess(
  projects: ProjectAccess[],
  projectId: string
): ProjectAccess | undefined {
  return projects.find((p) => p.id === projectId);
}

/**
 * Checks if user has specific role(s) in a project.
 */
export function hasProjectRole(
  projects: ProjectAccess[],
  projectId: string,
  allowedRoles: string[]
): boolean {
  const access = hasProjectAccess(projects, projectId);
  if (!access) return false;
  return allowedRoles.includes(access.role);
}

/**
 * Throws FORBIDDEN if user doesn't have access to project.
 */
export function requireProjectAccess(
  ctx: Context & { session: SessionWithProjects },
  projectId: string
): ProjectAccess {
  const access = hasProjectAccess(ctx.session.user.projects, projectId);
  if (!access) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You don't have access to this project",
    });
  }
  return access;
}

/**
 * Throws FORBIDDEN if user doesn't have required role in project.
 */
export function requireProjectRole(
  ctx: Context & { session: SessionWithProjects },
  projectId: string,
  allowedRoles: string[]
): ProjectAccess {
  const access = requireProjectAccess(ctx, projectId);
  if (!allowedRoles.includes(access.role)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `This action requires one of these roles: ${allowedRoles.join(", ")}`,
    });
  }
  return access;
}

// Re-export role constants for convenience
export { ADMIN_ROLES, MEMBER_ROLES, ALL_ROLES, type ProjectRole } from "../schemas";
