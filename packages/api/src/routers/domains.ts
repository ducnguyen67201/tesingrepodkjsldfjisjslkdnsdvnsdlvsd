import { z } from "zod";
import { prisma } from "@ducsigr/db";
import {
  createRouter,
  protectedProcedure,
  workspaceAdminMiddleware,
} from "../trpc";
import { WorkspaceRoleSchema } from "../schemas";
import { createAppError } from "../errors";
import { DomainSchema } from "../lib/domain-matcher";
import type { SessionWithWorkspaces } from "../context";

const createDomainInput = z.object({
  workspaceId: z.string().min(1),
  domain: DomainSchema,
  role: WorkspaceRoleSchema.exclude(["OWNER"]).default("MEMBER"),
});

const listDomainsInput = z.object({
  workspaceId: z.string().min(1),
});

const deleteDomainInput = z.object({
  workspaceId: z.string().min(1),
  domainId: z.string().min(1),
});

/**
 * Output types
 */
export interface AllowedDomainItem {
  id: string;
  domain: string;
  role: string;
  createdAt: string;
  createdBy: {
    id: string;
    name: string | null;
    email: string;
  };
}

/**
 * Domains Router
 *
 * Manages allowed domains for workspace auto-join feature.
 * When a user signs up with an email matching an allowed domain,
 * they are automatically added to the workspace.
 */
export const domainsRouter = createRouter({
  /**
   * List allowed domains for a workspace (admin only)
   */
  list: protectedProcedure
    .input(listDomainsInput)
    .use(workspaceAdminMiddleware)
    .query(async ({ input }): Promise<AllowedDomainItem[]> => {
      const domains = await prisma.allowedDomain.findMany({
        where: { workspaceId: input.workspaceId },
        include: {
          createdBy: {
            select: { id: true, name: true, email: true },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      return domains.map((d) => ({
        id: d.id,
        domain: d.domain,
        role: d.role,
        createdAt: d.createdAt.toISOString(),
        createdBy: d.createdBy,
      }));
    }),

  /**
   * Add an allowed domain (admin only)
   * Domain must be globally unique (one domain = one workspace)
   */
  create: protectedProcedure
    .input(createDomainInput)
    .use(workspaceAdminMiddleware)
    .mutation(async ({ ctx, input }): Promise<AllowedDomainItem> => {
      const session = ctx.session as SessionWithWorkspaces;
      const domain = input.domain;

      // Create domain atomically (unique constraint handles race condition)
      let created;
      try {
        created = await prisma.allowedDomain.create({
          data: {
            workspaceId: input.workspaceId,
            domain,
            role: input.role,
            createdById: session.user.id,
          },
          include: {
            createdBy: {
              select: { id: true, name: true, email: true },
            },
          },
        });
      } catch (error) {
        // P2002 = Unique constraint violation (domain already exists)
        const isPrismaError = error instanceof Error && "code" in error;
        if (isPrismaError && (error as { code: string }).code === "P2002") {
          // Fetch the existing domain to provide helpful error message
          const existing = await prisma.allowedDomain.findUnique({
            where: { domain },
            include: { workspace: { select: { name: true } } },
          });
          throw createAppError(
            "DOMAIN_ALREADY_EXISTS",
            `Domain "${domain}" is already claimed by workspace "${existing?.workspace.name ?? "another workspace"}"`
          );
        }
        throw error;
      }

      // Auto-add existing users with this email domain to the workspace
      const existingUsers = await prisma.user.findMany({
        where: {
          email: { endsWith: `@${domain}` },
        },
        select: { id: true, email: true },
      });

      // Filter out users already in the workspace
      const existingMemberIds = new Set(
        (
          await prisma.workspaceMember.findMany({
            where: {
              workspaceId: input.workspaceId,
              userId: { in: existingUsers.map((u) => u.id) },
            },
            select: { userId: true },
          })
        ).map((m) => m.userId)
      );

      const usersToAdd = existingUsers.filter((u) => !existingMemberIds.has(u.id));

      if (usersToAdd.length > 0) {
        await prisma.workspaceMember.createMany({
          data: usersToAdd.map((user) => ({
            userId: user.id,
            workspaceId: input.workspaceId,
            role: input.role,
          })),
          skipDuplicates: true,
        });

        console.info("Domain matcher: Auto-added existing users to workspace", {
          workspaceId: input.workspaceId,
          domain,
          usersAdded: usersToAdd.length,
        });
      }

      console.info("Allowed domain created", {
        workspaceId: input.workspaceId,
        domain,
        role: input.role,
        createdBy: session.user.id,
        existingUsersAdded: usersToAdd.length,
      });

      return {
        id: created.id,
        domain: created.domain,
        role: created.role,
        createdAt: created.createdAt.toISOString(),
        createdBy: created.createdBy,
      };
    }),

  /**
   * Remove an allowed domain (admin only)
   */
  delete: protectedProcedure
    .input(deleteDomainInput)
    .use(workspaceAdminMiddleware)
    .mutation(async ({ ctx, input }): Promise<{ success: boolean }> => {
      const session = ctx.session as SessionWithWorkspaces;

      // Verify domain belongs to this workspace
      const domain = await prisma.allowedDomain.findUnique({
        where: { id: input.domainId },
        select: { id: true, domain: true, workspaceId: true },
      });

      if (!domain) {
        throw createAppError("NOT_FOUND", "Domain not found");
      }

      if (domain.workspaceId !== input.workspaceId) {
        throw createAppError("FORBIDDEN", "Domain does not belong to this workspace");
      }

      await prisma.allowedDomain.delete({
        where: { id: input.domainId },
      });

      console.info("Allowed domain deleted", {
        workspaceId: input.workspaceId,
        domain: domain.domain,
        deletedBy: session.user.id,
      });

      return { success: true };
    }),
});

export type DomainsRouter = typeof domainsRouter;
