import { TRPCError } from "@trpc/server";
import { prisma } from "@ducsigr/db";
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
 * System admins bypass membership checks and can access any workspace.
 */
export async function requireWorkspaceAccess(
  ctx: Context & { session: SessionWithWorkspaces },
  workspaceIdOrSlug: string,
  bySlug = false
): Promise<WorkspaceAccess> {
  const workspaces = ctx.session.user.workspaces;
  const access = bySlug
    ? hasWorkspaceAccessBySlug(workspaces, workspaceIdOrSlug)
    : hasWorkspaceAccess(workspaces, workspaceIdOrSlug);

  if (access) {
    return access;
  }

  // No membership — check if user is a system admin
  const user = await prisma.user.findUnique({
    where: { id: ctx.session.user.id },
    select: { isSystemAdmin: true },
  });

  if (user?.isSystemAdmin) {
    // Resolve workspace to build a synthetic WorkspaceAccess
    const workspace = bySlug
      ? await prisma.workspace.findUnique({
          where: { slug: workspaceIdOrSlug },
          select: { id: true, slug: true, isPersonal: true },
        })
      : await prisma.workspace.findUnique({
          where: { id: workspaceIdOrSlug },
          select: { id: true, slug: true, isPersonal: true },
        });

    if (workspace) {
      return {
        id: workspace.id,
        slug: workspace.slug,
        role: "ADMIN",
        isPersonal: workspace.isPersonal,
      };
    }
  }

  throw new TRPCError({
    code: "FORBIDDEN",
    message: "You don't have access to this workspace",
  });
}

/**
 * Throws FORBIDDEN if user doesn't have required role in workspace.
 */
export async function requireWorkspaceRole(
  ctx: Context & { session: SessionWithWorkspaces },
  workspaceId: string,
  allowedRoles: string[]
): Promise<WorkspaceAccess> {
  const access = await requireWorkspaceAccess(ctx, workspaceId);
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
