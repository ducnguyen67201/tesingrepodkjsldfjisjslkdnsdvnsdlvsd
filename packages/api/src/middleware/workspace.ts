import { TRPCError } from "@trpc/server";
import type {
  Context,
  SessionWithWorkspaces,
  WorkspaceAccess,
} from "../context";

/**
 * Checks if user has access to a workspace by ID.
 */
export function hasWorkspaceAccess(
  workspaces: WorkspaceAccess[],
  workspaceId: string
): WorkspaceAccess | undefined {
  return workspaces.find((w) => w.id === workspaceId);
}

/**
 * Checks if user has access to a workspace by slug.
 */
export function hasWorkspaceAccessBySlug(
  workspaces: WorkspaceAccess[],
  slug: string
): WorkspaceAccess | undefined {
  return workspaces.find((w) => w.slug === slug);
}

/**
 * Checks if user has specific role(s) in a workspace.
 */
export function hasWorkspaceRole(
  workspaces: WorkspaceAccess[],
  workspaceId: string,
  allowedRoles: string[]
): boolean {
  const access = hasWorkspaceAccess(workspaces, workspaceId);
  if (!access) return false;
  return allowedRoles.includes(access.role);
}

/**
 * Throws FORBIDDEN if user doesn't have access to workspace.
 * Supports both ID and slug lookup.
 */
export function requireWorkspaceAccess(
  ctx: Context & { session: SessionWithWorkspaces },
  workspaceIdOrSlug: string,
  bySlug = false
): WorkspaceAccess {
  const workspaces = ctx.session.user.workspaces;
  const access = bySlug
    ? hasWorkspaceAccessBySlug(workspaces, workspaceIdOrSlug)
    : hasWorkspaceAccess(workspaces, workspaceIdOrSlug);

  if (!access) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You don't have access to this workspace",
    });
  }
  return access;
}

/**
 * Throws FORBIDDEN if user doesn't have required role in workspace.
 */
export function requireWorkspaceRole(
  ctx: Context & { session: SessionWithWorkspaces },
  workspaceId: string,
  allowedRoles: string[]
): WorkspaceAccess {
  const access = requireWorkspaceAccess(ctx, workspaceId);
  if (!allowedRoles.includes(access.role)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `This action requires one of these roles: ${allowedRoles.join(", ")}`,
    });
  }
  return access;
}

// Re-export role constants for convenience
export {
  WORKSPACE_ADMIN_ROLES,
  WORKSPACE_MEMBER_ROLES,
  ALL_WORKSPACE_ROLES,
  type WorkspaceRole,
} from "../schemas";
