/**
 * Extensions Router
 *
 * tRPC router for the Extensions Hub feature.
 * Provides CRUD operations for extensions catalog and workspace installations.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { prisma, Prisma } from "@cognobserve/db";
import {
  createRouter,
  protectedProcedure,
  workspaceAdminMiddleware,
} from "../trpc";
import {
  ListExtensionsInput,
  GetExtensionInput,
  InstallExtensionInput,
  ToggleExtensionInput,
  ConfigureExtensionInput,
  UninstallExtensionInput,
  ImportManifestInput,
  ExtensionManifestSchema,
  type ExtensionPermission,
} from "../schemas/extensions";
import { getExtensionHandler } from "../lib/extensions/registry";
import type { SessionWithWorkspaces } from "../context";

/**
 * Extensions Router
 *
 * Provides:
 * - list: List available extensions (catalog + install status)
 * - getById: Get extension details with all versions
 * - install: Install extension to workspace (admin only)
 * - toggle: Enable/disable extension (admin only)
 * - configure: Update extension config (admin only)
 * - uninstall: Uninstall extension (admin only)
 * - importManifest: Import manifest to create private extension (admin only)
 */
export const extensionsRouter = createRouter({
  /**
   * List available extensions (catalog + install status)
   */
  list: protectedProcedure.input(ListExtensionsInput).query(async ({ input }) => {
    const where: Record<string, unknown> = {};

    if (input.type) {
      where.type = input.type;
    }

    if (input.visibility) {
      where.visibility = input.visibility;
    }

    if (input.search) {
      where.OR = [
        { name: { contains: input.search, mode: "insensitive" } },
        { description: { contains: input.search, mode: "insensitive" } },
      ];
    }

    const extensions = await prisma.extension.findMany({
      where,
      include: {
        versions: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        installs: input.workspaceSlug
          ? {
              where: { workspace: { slug: input.workspaceSlug } },
            }
          : false,
      },
      orderBy: { name: "asc" },
    });

    return extensions.map((ext) => ({
      id: ext.id,
      slug: ext.slug,
      name: ext.name,
      description: ext.description,
      type: ext.type,
      visibility: ext.visibility,
      latestVersion: ext.versions[0]?.version ?? null,
      latestVersionId: ext.versions[0]?.id ?? null,
      manifest: ext.versions[0]?.manifest ?? null,
      install: ext.installs?.[0] ?? null,
      isInstalled: (ext.installs?.length ?? 0) > 0,
    }));
  }),

  /**
   * Get extension details with all versions
   */
  getById: protectedProcedure.input(GetExtensionInput).query(async ({ input }) => {
    const extension = await prisma.extension.findUnique({
      where: { id: input.extensionId },
      include: {
        versions: { orderBy: { createdAt: "desc" } },
        owner: { select: { id: true, name: true, email: true } },
        installs: input.workspaceId
          ? {
              where: { workspaceId: input.workspaceId },
              include: { version: true },
            }
          : false,
      },
    });

    if (!extension) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Extension not found",
      });
    }

    return extension;
  }),

  /**
   * Install extension to workspace
   */
  install: protectedProcedure
    .input(InstallExtensionInput)
    .use(workspaceAdminMiddleware)
    .mutation(async ({ ctx, input }) => {
      const session = ctx.session as SessionWithWorkspaces;

      // Get extension and version
      const extension = await prisma.extension.findUnique({
        where: { id: input.extensionId },
        include: { versions: { orderBy: { createdAt: "desc" }, take: 1 } },
      });

      if (!extension) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Extension not found",
        });
      }

      const version = input.versionId
        ? await prisma.extensionVersion.findUnique({
            where: { id: input.versionId },
          })
        : extension.versions[0];

      if (!version) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Version not found",
        });
      }

      // Validate manifest and permissions
      const manifest = ExtensionManifestSchema.parse(version.manifest);
      const handler = getExtensionHandler(extension.type);

      const manifestResult = handler.validateManifest(manifest);
      if (!manifestResult.success) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: manifestResult.error ?? "Invalid manifest",
        });
      }

      // Verify all required permissions are approved
      const missingPermissions = manifest.permissions.filter(
        (p) => !input.approvedPermissions.includes(p)
      );
      if (missingPermissions.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Missing permission approvals: ${missingPermissions.join(", ")}`,
        });
      }

      // Check for existing install
      const existing = await prisma.extensionInstall.findUnique({
        where: {
          workspaceId_extensionId: {
            workspaceId: input.workspaceId,
            extensionId: input.extensionId,
          },
        },
      });

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Extension already installed",
        });
      }

      // Create install in transaction
      const install = await prisma.$transaction(async (tx) => {
        const newInstall = await tx.extensionInstall.create({
          data: {
            workspaceId: input.workspaceId,
            extensionId: input.extensionId,
            extensionVersionId: version.id,
            enabled: true,
            configJson: (input.config ?? {}) as Prisma.InputJsonValue,
            approvedPermissions: input.approvedPermissions,
            installedById: session.user.id,
          },
        });

        await tx.extensionAuditLog.create({
          data: {
            installId: newInstall.id,
            action: "INSTALLED",
            actorId: session.user.id,
            metadata: { versionId: version.id, version: version.version } as Prisma.InputJsonValue,
          },
        });

        return newInstall;
      });

      // Call handler lifecycle
      await handler.onInstall({
        workspaceId: input.workspaceId,
        extensionId: input.extensionId,
        installId: install.id,
        manifest,
        config: (input.config ?? {}) as Record<string, unknown>,
        permissions: input.approvedPermissions,
      });

      return install;
    }),

  /**
   * Enable/disable extension
   */
  toggle: protectedProcedure
    .input(ToggleExtensionInput)
    .use(workspaceAdminMiddleware)
    .mutation(async ({ ctx, input }) => {
      const session = ctx.session as SessionWithWorkspaces;

      const install = await prisma.extensionInstall.findFirst({
        where: { id: input.installId, workspaceId: input.workspaceId },
        include: { extension: true, version: true },
      });

      if (!install) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Install not found",
        });
      }

      const handler = getExtensionHandler(install.extension.type);
      const manifest = ExtensionManifestSchema.parse(install.version.manifest);

      const extensionCtx = {
        workspaceId: input.workspaceId,
        extensionId: install.extensionId,
        installId: install.id,
        manifest,
        config: (install.configJson ?? {}) as Record<string, unknown>,
        permissions: install.approvedPermissions as ExtensionPermission[],
      };

      // Call appropriate lifecycle hook
      if (input.enabled) {
        const result = await handler.onEnable(extensionCtx);
        if (!result.success) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: result.error ?? "Failed to enable extension",
          });
        }
      } else {
        const result = await handler.onDisable(extensionCtx);
        if (!result.success) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: result.error ?? "Failed to disable extension",
          });
        }
      }

      // Update state
      await prisma.$transaction([
        prisma.extensionInstall.update({
          where: { id: input.installId },
          data: { enabled: input.enabled },
        }),
        prisma.extensionAuditLog.create({
          data: {
            installId: input.installId,
            action: input.enabled ? "ENABLED" : "DISABLED",
            actorId: session.user.id,
          },
        }),
      ]);

      return { success: true };
    }),

  /**
   * Update extension config
   */
  configure: protectedProcedure
    .input(ConfigureExtensionInput)
    .use(workspaceAdminMiddleware)
    .mutation(async ({ ctx, input }) => {
      const session = ctx.session as SessionWithWorkspaces;

      const install = await prisma.extensionInstall.findFirst({
        where: { id: input.installId, workspaceId: input.workspaceId },
        include: { extension: true, version: true },
      });

      if (!install) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Install not found",
        });
      }

      const handler = getExtensionHandler(install.extension.type);
      const manifest = ExtensionManifestSchema.parse(install.version.manifest);

      // Validate new config
      const configResult = handler.validateConfig(input.config);
      if (!configResult.success) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: configResult.error ?? "Invalid configuration",
        });
      }

      // Call handler
      const result = await handler.onConfigure(
        {
          workspaceId: input.workspaceId,
          extensionId: install.extensionId,
          installId: install.id,
          manifest,
          config: (install.configJson ?? {}) as Record<string, unknown>,
          permissions: install.approvedPermissions as ExtensionPermission[],
        },
        input.config
      );

      if (!result.success) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: result.error ?? "Failed to configure extension",
        });
      }

      // Persist
      await prisma.$transaction([
        prisma.extensionInstall.update({
          where: { id: input.installId },
          data: { configJson: input.config as Prisma.InputJsonValue },
        }),
        prisma.extensionAuditLog.create({
          data: {
            installId: input.installId,
            action: "CONFIGURED",
            actorId: session.user.id,
            metadata: { config: input.config } as Prisma.InputJsonValue,
          },
        }),
      ]);

      return { success: true };
    }),

  /**
   * Uninstall extension
   */
  uninstall: protectedProcedure
    .input(UninstallExtensionInput)
    .use(workspaceAdminMiddleware)
    .mutation(async ({ input }) => {
      const install = await prisma.extensionInstall.findFirst({
        where: { id: input.installId, workspaceId: input.workspaceId },
        include: { extension: true, version: true },
      });

      if (!install) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Install not found",
        });
      }

      const handler = getExtensionHandler(install.extension.type);
      const manifest = ExtensionManifestSchema.parse(install.version.manifest);

      // Call handler
      await handler.onUninstall({
        workspaceId: input.workspaceId,
        extensionId: install.extensionId,
        installId: install.id,
        manifest,
        config: (install.configJson ?? {}) as Record<string, unknown>,
        permissions: install.approvedPermissions as ExtensionPermission[],
      });

      // Delete (audit logs cascade)
      await prisma.extensionInstall.delete({ where: { id: input.installId } });

      return { success: true };
    }),

  /**
   * Import manifest (create private extension)
   */
  importManifest: protectedProcedure
    .input(ImportManifestInput)
    .use(workspaceAdminMiddleware)
    .mutation(async ({ ctx, input }) => {
      const session = ctx.session as SessionWithWorkspaces;

      const handler = getExtensionHandler(input.manifest.type);
      const manifestResult = handler.validateManifest(input.manifest);
      if (!manifestResult.success) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: manifestResult.error ?? "Invalid manifest",
        });
      }

      // Check slug uniqueness
      const existing = await prisma.extension.findUnique({
        where: { slug: input.manifest.id },
      });

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Extension with slug "${input.manifest.id}" already exists`,
        });
      }

      // Create extension and version
      const extension = await prisma.extension.create({
        data: {
          slug: input.manifest.id,
          name: input.manifest.name,
          description: input.manifest.description,
          type: input.manifest.type,
          visibility: input.visibility,
          ownerId: session.user.id,
          versions: {
            create: {
              version: input.manifest.version,
              manifest: input.manifest as unknown as Prisma.InputJsonValue,
              entry: input.manifest.entry,
            },
          },
        },
        include: { versions: true },
      });

      return extension;
    }),
});

export type ExtensionsRouter = typeof extensionsRouter;
