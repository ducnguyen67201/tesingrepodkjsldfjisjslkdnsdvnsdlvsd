import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { prisma } from "@ducsigr/db";
import {
  generateApiKey,
  hashApiKey,
  maskApiKey,
} from "@ducsigr/shared";
import { createRouter, protectedProcedure, workspaceMiddleware } from "../trpc";

/**
 * Input schemas
 */
const createApiKeyInput = z.object({
  workspaceSlug: z.string().min(1, "Workspace slug is required"),
  projectId: z.string().min(1, "Project ID is required"),
  name: z.string().min(1, "Name is required").max(100, "Name too long").trim(),
  expiresAt: z.string().datetime().optional(),
});

const listApiKeysInput = z.object({
  workspaceSlug: z.string().min(1, "Workspace slug is required"),
  projectId: z.string().min(1, "Project ID is required"),
});

const deleteApiKeyInput = z.object({
  workspaceSlug: z.string().min(1, "Workspace slug is required"),
  projectId: z.string().min(1, "Project ID is required"),
  keyId: z.string().min(1, "Key ID is required"),
});

/**
 * Output types
 */
export interface ApiKeyListItem {
  id: string;
  name: string;
  displayKey: string;
  createdAt: string;
  expiresAt: string | null;
  createdBy: { id: string; name: string | null } | null;
}

export interface CreatedApiKey {
  id: string;
  name: string;
  key: string; // Full key - only returned on creation
  displayKey: string;
  createdAt: string;
  expiresAt: string | null;
}

/**
 * Helper to verify project belongs to workspace.
 */
async function verifyProjectInWorkspace(
  projectId: string,
  workspaceId: string
): Promise<void> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, workspaceId },
    select: { id: true },
  });

  if (!project) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Project not found in this workspace",
    });
  }
}

/**
 * API Keys Router
 *
 * Uses workspace membership for authorization.
 * Projects must belong to the workspace.
 */
export const apiKeysRouter = createRouter({
  /**
   * List all API keys for a project (masked).
   */
  list: protectedProcedure
    .input(listApiKeysInput)
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }): Promise<ApiKeyListItem[]> => {
      const { projectId } = input;

      // Verify project belongs to workspace
      await verifyProjectInWorkspace(projectId, ctx.workspace.id);

      // Fetch API keys
      const apiKeys = await prisma.apiKey.findMany({
        where: { projectId },
        select: {
          id: true,
          name: true,
          displayKey: true,
          createdAt: true,
          expiresAt: true,
          createdById: true,
        },
        orderBy: { createdAt: "desc" },
      });

      // Fetch creator info for keys that have createdById
      const creatorIds = apiKeys
        .map((k) => k.createdById)
        .filter((id): id is string => id !== null);

      const creators =
        creatorIds.length > 0
          ? await prisma.user.findMany({
              where: { id: { in: creatorIds } },
              select: { id: true, name: true },
            })
          : [];

      const creatorMap = new Map(creators.map((c) => [c.id, c]));

      // Format response
      return apiKeys.map((key) => ({
        id: key.id,
        name: key.name,
        displayKey: key.displayKey,
        createdAt: key.createdAt.toISOString(),
        expiresAt: key.expiresAt?.toISOString() ?? null,
        createdBy: key.createdById ? creatorMap.get(key.createdById) ?? null : null,
      }));
    }),

  /**
   * Create a new API key.
   * Returns the full key ONLY once.
   */
  create: protectedProcedure
    .input(createApiKeyInput)
    .use(workspaceMiddleware)
    .mutation(async ({ ctx, input }): Promise<CreatedApiKey> => {
      const { projectId, name, expiresAt } = input;

      // Verify project belongs to workspace
      await verifyProjectInWorkspace(projectId, ctx.workspace.id);

      // Validate expiration date if provided
      if (expiresAt) {
        const expirationDate = new Date(expiresAt);
        if (expirationDate <= new Date()) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Expiration date must be in the future",
          });
        }
      }

      // Generate API key
      const fullKey = generateApiKey();
      const hashedKey = hashApiKey(fullKey);
      const displayKey = maskApiKey(fullKey);

      // Create in database
      const apiKey = await prisma.apiKey.create({
        data: {
          projectId,
          name,
          hashedKey,
          displayKey,
          createdById: ctx.session.user.id,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
        },
        select: {
          id: true,
          name: true,
          displayKey: true,
          createdAt: true,
          expiresAt: true,
        },
      });

      console.info("API key created", {
        keyId: apiKey.id,
        projectId,
        userId: ctx.session.user.id,
      });

      // Return full key (only shown once)
      return {
        id: apiKey.id,
        name: apiKey.name,
        key: fullKey,
        displayKey: apiKey.displayKey,
        createdAt: apiKey.createdAt.toISOString(),
        expiresAt: apiKey.expiresAt?.toISOString() ?? null,
      };
    }),

  /**
   * Delete an API key.
   * Uses atomic deleteMany to avoid TOCTOU race condition.
   */
  delete: protectedProcedure
    .input(deleteApiKeyInput)
    .use(workspaceMiddleware)
    .mutation(async ({ ctx, input }): Promise<{ success: boolean }> => {
      const { projectId, keyId } = input;

      // Verify project belongs to workspace
      await verifyProjectInWorkspace(projectId, ctx.workspace.id);

      // Atomic delete with conditions - avoids race condition between check and delete
      // deleteMany returns count of deleted records, 0 if key didn't exist or didn't match project
      const result = await prisma.apiKey.deleteMany({
        where: {
          id: keyId,
          projectId,
        },
      });

      if (result.count === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "API key not found",
        });
      }

      console.info("API key deleted", {
        keyId,
        projectId,
        userId: ctx.session.user.id,
      });

      return { success: true };
    }),
});

export type ApiKeysRouter = typeof apiKeysRouter;
