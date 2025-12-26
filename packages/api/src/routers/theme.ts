/**
 * Theme Router
 *
 * tRPC router for workspace visual customization.
 * Uses ExtensionInstall.configJson for storing theme configurations.
 */

import { TRPCError } from "@trpc/server";
import { prisma, Prisma } from "@ducsigr/db";
import {
  createRouter,
  protectedProcedure,
  workspaceAdminMiddleware,
  workspaceMiddleware,
} from "../trpc";
import {
  GetActiveThemeInput,
  SetActiveThemeInput,
  SaveThemeConfigInput,
  ListInstalledThemesInput,
  WorkspaceThemeConfigSchema,
  DEFAULT_THEME,
  THEME_PRESETS,
  type WorkspaceThemeConfig,
} from "../schemas/theme";
import type { SessionWithWorkspaces } from "../context";

/**
 * Parse and validate theme config from JSON.
 * Falls back to DEFAULT_THEME if validation fails.
 */
function parseThemeConfig(configJson: unknown): WorkspaceThemeConfig {
  const result = WorkspaceThemeConfigSchema.safeParse(configJson);
  if (!result.success) {
    console.warn(
      "[theme] Invalid theme config, falling back to default:",
      result.error.issues
    );
    return DEFAULT_THEME;
  }
  return result.data;
}

/**
 * Theme Router
 *
 * Provides:
 * - getActive: Get the active theme for a workspace
 * - setActive: Activate a theme (enable one, disable others)
 * - saveConfig: Save theme configuration
 * - listInstalled: List all installed THEME extensions
 * - getPresets: Get available theme presets
 */
export const themeRouter = createRouter({
  /**
   * Get the active theme for a workspace.
   *
   * Returns the first enabled THEME extension's config,
   * or DEFAULT_THEME if none are enabled.
   */
  getActive: protectedProcedure
    .input(GetActiveThemeInput)
    .use(workspaceMiddleware)
    .query(async ({ input }) => {
      // Find the first enabled THEME extension
      const activeInstall = await prisma.extensionInstall.findFirst({
        where: {
          workspaceId: input.workspaceId,
          enabled: true,
          extension: {
            type: "THEME",
          },
        },
        include: {
          extension: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      });

      if (!activeInstall) {
        return {
          config: DEFAULT_THEME,
          isActive: false,
          installId: null,
          extensionId: null,
          extensionName: null,
        };
      }

      const config = parseThemeConfig(activeInstall.configJson);

      return {
        config,
        isActive: true,
        installId: activeInstall.id,
        extensionId: activeInstall.extension.id,
        extensionName: activeInstall.extension.name,
      };
    }),

  /**
   * Set the active theme for a workspace.
   *
   * Enables the specified theme and disables all others.
   * If installId is null, disables all themes (revert to default).
   */
  setActive: protectedProcedure
    .input(SetActiveThemeInput)
    .use(workspaceAdminMiddleware)
    .mutation(async ({ ctx, input }) => {
      const session = ctx.session as SessionWithWorkspaces;

      // If installId provided, verify it exists and is a THEME extension
      if (input.installId) {
        const install = await prisma.extensionInstall.findFirst({
          where: {
            id: input.installId,
            workspaceId: input.workspaceId,
            extension: {
              type: "THEME",
            },
          },
        });

        if (!install) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Theme extension not found",
          });
        }
      }

      // Transaction: disable all themes, then enable the selected one
      await prisma.$transaction(async (tx) => {
        // Disable all THEME extensions in this workspace
        await tx.extensionInstall.updateMany({
          where: {
            workspaceId: input.workspaceId,
            extension: {
              type: "THEME",
            },
          },
          data: {
            enabled: false,
          },
        });

        // Enable the selected theme (if not null)
        if (input.installId) {
          await tx.extensionInstall.update({
            where: { id: input.installId },
            data: { enabled: true },
          });

          // Audit log
          await tx.extensionAuditLog.create({
            data: {
              installId: input.installId,
              action: "ENABLED",
              actorId: session.user.id,
              metadata: { source: "theme-studio" } as Prisma.InputJsonValue,
            },
          });
        }
      });

      return { success: true };
    }),

  /**
   * Save theme configuration for an installed extension.
   */
  saveConfig: protectedProcedure
    .input(SaveThemeConfigInput)
    .use(workspaceAdminMiddleware)
    .mutation(async ({ ctx, input }) => {
      const session = ctx.session as SessionWithWorkspaces;

      // Verify install exists and is a THEME extension
      const install = await prisma.extensionInstall.findFirst({
        where: {
          id: input.installId,
          workspaceId: input.workspaceId,
          extension: {
            type: "THEME",
          },
        },
      });

      if (!install) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Theme extension not found",
        });
      }

      // Update config
      await prisma.$transaction(async (tx) => {
        await tx.extensionInstall.update({
          where: { id: input.installId },
          data: {
            configJson: input.config as Prisma.InputJsonValue,
          },
        });

        // Audit log
        await tx.extensionAuditLog.create({
          data: {
            installId: input.installId,
            action: "CONFIGURED",
            actorId: session.user.id,
            metadata: {
              source: "theme-studio",
              config: input.config,
            } as Prisma.InputJsonValue,
          },
        });
      });

      return { success: true };
    }),

  /**
   * List all installed THEME extensions for a workspace.
   */
  listInstalled: protectedProcedure
    .input(ListInstalledThemesInput)
    .use(workspaceMiddleware)
    .query(async ({ input }) => {
      const installs = await prisma.extensionInstall.findMany({
        where: {
          workspaceId: input.workspaceId,
          extension: {
            type: "THEME",
          },
        },
        include: {
          extension: {
            select: {
              id: true,
              name: true,
              slug: true,
              description: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      return installs.map((install) => ({
        id: install.id,
        extensionId: install.extension.id,
        extensionName: install.extension.name,
        extensionSlug: install.extension.slug,
        description: install.extension.description,
        enabled: install.enabled,
        config: parseThemeConfig(install.configJson),
        createdAt: install.createdAt,
      }));
    }),

  /**
   * Get available theme presets.
   */
  getPresets: protectedProcedure.query(async () => {
    return Object.entries(THEME_PRESETS).map(([key, preset]) => ({
      key,
      name: preset.name,
      description: preset.description,
      config: preset.config,
    }));
  }),
});

export type ThemeRouter = typeof themeRouter;
