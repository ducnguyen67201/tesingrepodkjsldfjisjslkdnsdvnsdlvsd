import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { prisma } from "@ducsigr/db";
import {
  createRouter,
  protectedProcedure,
  workspaceMiddleware,
  workspaceAdminMiddleware,
} from "../trpc";
import {
  CreateWorkspaceSchema,
  InviteMemberSchema,
} from "../schemas";
import { createAppError } from "../errors";
import type { SessionWithWorkspaces } from "../context";

/**
 * Output types
 */
export interface WorkspaceListItem {
  id: string;
  name: string;
  slug: string;
  isPersonal: boolean;
  role: string;
}

export interface WorkspaceDetail {
  id: string;
  name: string;
  slug: string;
  isPersonal: boolean;
  role: string;
  memberCount: number;
  projectCount: number;
}

export interface WorkspaceMemberItem {
  id: string;
  role: string;
  createdAt: string;
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  };
}

/**
 * Workspaces Router
 */
export const workspacesRouter = createRouter({
  /**
   * List all workspaces for the current user.
   * Returns workspaces from session (already loaded).
   * Note: Name uses slug as fallback since session doesn't store names.
   * Use listWithDetails for full workspace data including actual names.
   */
  list: protectedProcedure.query(({ ctx }): WorkspaceListItem[] => {
    const session = ctx.session as SessionWithWorkspaces;

    // Return workspaces from session (populated by JWT callback)
    // Use slug as name fallback since session doesn't include name
    return session.user.workspaces.map((w) => ({
      id: w.id,
      name: w.isPersonal ? "Personal" : w.slug,
      slug: w.slug,
      isPersonal: w.isPersonal,
      role: w.role,
    }));
  }),

  /**
   * List workspaces with full details (requires DB query).
   */
  listWithDetails: protectedProcedure.query(async ({ ctx }): Promise<WorkspaceListItem[]> => {
    const session = ctx.session as SessionWithWorkspaces;

    const workspaces = await prisma.workspace.findMany({
      where: {
        members: {
          some: { userId: session.user.id },
        },
      },
      include: {
        members: {
          where: { userId: session.user.id },
          select: { role: true },
        },
      },
      orderBy: [{ isPersonal: "desc" }, { createdAt: "asc" }],
    });

    return workspaces.map((w) => ({
      id: w.id,
      name: w.name,
      slug: w.slug,
      isPersonal: w.isPersonal,
      role: w.members[0]?.role ?? "MEMBER",
    }));
  }),

  /**
   * Get workspace by slug with details.
   */
  getBySlug: protectedProcedure
    .input(z.object({ workspaceSlug: z.string().min(1) }))
    .use(workspaceMiddleware)
    .query(async ({ ctx }): Promise<WorkspaceDetail> => {
      const workspace = await prisma.workspace.findUnique({
        where: { id: ctx.workspace.id },
        include: {
          _count: {
            select: {
              members: true,
              projects: true,
            },
          },
        },
      });

      if (!workspace) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Workspace not found",
        });
      }

      return {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        isPersonal: workspace.isPersonal,
        role: ctx.workspace.role,
        memberCount: workspace._count.members,
        projectCount: workspace._count.projects,
      };
    }),

  /**
   * Create a new workspace.
   * User becomes OWNER.
   * Uses atomic operation to prevent race conditions on slug uniqueness.
   */
  create: protectedProcedure
    .input(CreateWorkspaceSchema)
    .mutation(async ({ ctx, input }): Promise<WorkspaceListItem> => {
      const session = ctx.session as SessionWithWorkspaces;

      try {
        // Atomic create - unique constraint handles race condition
        const workspace = await prisma.workspace.create({
          data: {
            name: input.name,
            slug: input.slug,
            isPersonal: false,
            members: {
              create: {
                userId: session.user.id,
                role: "OWNER",
              },
            },
          },
        });

        console.info("Workspace created", {
          workspaceId: workspace.id,
          slug: workspace.slug,
          userId: session.user.id,
        });

        return {
          id: workspace.id,
          name: workspace.name,
          slug: workspace.slug,
          isPersonal: workspace.isPersonal,
          role: "OWNER",
        };
      } catch (error) {
        // Handle unique constraint violation (P2002)
        if (
          error instanceof Error &&
          "code" in error &&
          error.code === "P2002"
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "This workspace slug is already taken",
          });
        }
        throw error;
      }
    }),

  /**
   * List workspace members (admin only).
   */
  listMembers: protectedProcedure
    .input(z.object({ workspaceId: z.string().min(1) }))
    .use(workspaceAdminMiddleware)
    .query(async ({ input }): Promise<WorkspaceMemberItem[]> => {
      const members = await prisma.workspaceMember.findMany({
        where: { workspaceId: input.workspaceId },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      });

      return members.map((m) => ({
        id: m.id,
        role: m.role,
        createdAt: m.createdAt.toISOString(),
        user: m.user,
      }));
    }),

  /**
   * Invite a member to workspace (admin only).
   * Uses atomic operation to prevent race conditions on duplicate membership.
   */
  inviteMember: protectedProcedure
    .input(InviteMemberSchema)
    .use(workspaceAdminMiddleware)
    .mutation(async ({ ctx, input }): Promise<WorkspaceMemberItem> => {
      const { workspaceId, email, role } = input;
      const session = ctx.session as SessionWithWorkspaces;

      // Find user by email
      const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, name: true, email: true, image: true },
      });

      if (!user) {
        throw createAppError("USER_NOT_SIGNED_UP");
      }

      try {
        // Atomic create - unique constraint handles race condition
        const member = await prisma.workspaceMember.create({
          data: {
            userId: user.id,
            workspaceId,
            role,
          },
        });

        console.info("Workspace member invited", {
          workspaceId,
          invitedUserId: user.id,
          role,
          invitedBy: session.user.id,
        });

        return {
          id: member.id,
          role: member.role,
          createdAt: member.createdAt.toISOString(),
          user,
        };
      } catch (error) {
        // Handle unique constraint violation (P2002)
        if (
          error instanceof Error &&
          "code" in error &&
          error.code === "P2002"
        ) {
          throw createAppError("USER_ALREADY_MEMBER");
        }
        throw error;
      }
    }),

  /**
   * Remove a member from workspace (admin only).
   * Cannot remove the last OWNER.
   * Uses transaction to prevent race condition on owner count check.
   */
  removeMember: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string().min(1),
        memberId: z.string().min(1),
      })
    )
    .use(workspaceAdminMiddleware)
    .mutation(async ({ ctx, input }): Promise<{ success: boolean }> => {
      const { workspaceId, memberId } = input;
      const session = ctx.session as SessionWithWorkspaces;

      // Use transaction to prevent race condition between owner count check and delete
      const removedUserId = await prisma.$transaction(async (tx) => {
        // Get the member to remove
        const member = await tx.workspaceMember.findUnique({
          where: { id: memberId },
          select: { userId: true, role: true, workspaceId: true },
        });

        if (!member || member.workspaceId !== workspaceId) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Member not found",
          });
        }

        // Check if this is the last owner
        if (member.role === "OWNER") {
          const ownerCount = await tx.workspaceMember.count({
            where: { workspaceId, role: "OWNER" },
          });

          if (ownerCount <= 1) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Cannot remove the last owner of a workspace",
            });
          }
        }

        // Remove member
        await tx.workspaceMember.delete({
          where: { id: memberId },
        });

        return member.userId;
      });

      console.info("Workspace member removed", {
        workspaceId,
        removedUserId,
        removedBy: session.user.id,
      });

      return { success: true };
    }),
});

export type WorkspacesRouter = typeof workspacesRouter;
