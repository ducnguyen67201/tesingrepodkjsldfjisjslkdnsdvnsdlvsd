/**
 * Prompts Router
 *
 * tRPC router for prompt management.
 * Handles prompt registry with versioning, labels, and SDK retrieval.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import crypto from "crypto";
import { prisma } from "@cognobserve/db";
import { createRouter, protectedProcedure, workspaceMiddleware } from "../trpc";
import {
  CreatePromptInputSchema,
  UpdatePromptInputSchema,
  CreateVersionInputSchema,
  SetLabelInputSchema,
  RemoveLabelInputSchema,
  ArchivePromptInputSchema,
  ListPromptsInputSchema,
  GetPromptInputSchema,
  SearchPromptsInputSchema,
  ImportPromptsInputSchema,
  ExportPromptsInputSchema,
  RunPlaygroundInputSchema,
  PromptAnalyticsInputSchema,
  PromptLabelNameSchema,
  PROMPT_TYPE_LABELS,
  PROMPT_LABEL_LABELS,
  PROMPT_LABEL_COLORS,
  DEFAULT_FETCH_LABEL,
  type PromptTemplate,
  type PromptVariable,
  type PromptConfig,
  type PromptLabelName,
} from "../schemas/prompts";

// ============================================================
// Helper Functions
// ============================================================

/**
 * Calculate SHA-256 checksum of content + config for ETag
 */
function calculateChecksum(content: PromptTemplate, config?: PromptConfig | null): string {
  const data = JSON.stringify({ content, config });
  return crypto.createHash("sha256").update(data).digest("hex");
}

/**
 * Build searchText from prompt content for grep
 */
function buildSearchText(
  name: string,
  slug: string,
  description: string | null | undefined,
  tags: string[],
  template: PromptTemplate,
  variables?: PromptVariable[] | null
): string {
  const parts: string[] = [name, slug];

  if (description) parts.push(description);
  parts.push(...tags);

  if (template.type === "text") {
    parts.push(template.text);
  } else {
    parts.push(...template.messages.map((m) => `${m.role}: ${m.content}`));
  }

  if (variables) {
    parts.push(...variables.map((v) => `${v.name} ${v.description || ""}`));
  }

  return parts.filter(Boolean).join(" ").toLowerCase();
}

/**
 * Generate slug from name
 */
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 50);
}

/**
 * Verify project belongs to workspace
 */
async function verifyProjectInWorkspace(projectId: string, workspaceId: string): Promise<void> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, workspaceId },
    select: { id: true },
  });

  if (!project) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
  }
}

/**
 * Verify prompt exists and belongs to workspace
 */
async function verifyPromptInWorkspace(
  promptId: string,
  workspaceId: string
): Promise<{ id: string; projectId: string; name: string; slug: string }> {
  const prompt = await prisma.prompt.findUnique({
    where: { id: promptId },
    include: { project: { select: { workspaceId: true } } },
  });

  if (!prompt) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Prompt not found" });
  }

  if (prompt.project.workspaceId !== workspaceId) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }

  return { id: prompt.id, projectId: prompt.projectId, name: prompt.name, slug: prompt.slug };
}

// ============================================================
// Prompts Router
// ============================================================

export const promptsRouter = createRouter({
  /**
   * List prompts for a project
   */
  list: protectedProcedure
    .input(ListPromptsInputSchema)
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }) => {
      await verifyProjectInWorkspace(input.projectId, ctx.workspace.id);

      const prompts = await prisma.prompt.findMany({
        where: {
          projectId: input.projectId,
          isArchived: input.includeArchived ? undefined : false,
          ...(input.query && {
            OR: [
              { name: { contains: input.query, mode: "insensitive" } },
              { slug: { contains: input.query, mode: "insensitive" } },
              { description: { contains: input.query, mode: "insensitive" } },
            ],
          }),
          ...(input.tags?.length && { tags: { hasSome: input.tags } }),
          ...(input.label && {
            labels: { some: { name: input.label } },
          }),
        },
        include: {
          versions: {
            orderBy: { version: "desc" },
            take: 1,
            select: {
              id: true,
              version: true,
              type: true,
              createdAt: true,
            },
          },
          labels: {
            select: {
              name: true,
              versionId: true,
            },
          },
          _count: {
            select: { versions: true },
          },
        },
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        orderBy: { updatedAt: "desc" },
      });

      let nextCursor: string | undefined;
      if (prompts.length > input.limit) {
        const next = prompts.pop();
        nextCursor = next?.id;
      }

      return {
        items: prompts.map((prompt) => ({
          id: prompt.id,
          name: prompt.name,
          slug: prompt.slug,
          description: prompt.description,
          tags: prompt.tags,
          isArchived: prompt.isArchived,
          latestVersion: prompt.versions[0]?.version ?? 0,
          latestVersionId: prompt.versions[0]?.id,
          latestVersionType: prompt.versions[0]?.type as "text" | "chat" | undefined,
          versionCount: prompt._count.versions,
          labels: prompt.labels.map((l) => l.name as PromptLabelName),
          productionVersionId: prompt.labels.find((l) => l.name === "production")?.versionId,
          createdAt: prompt.createdAt,
          updatedAt: prompt.updatedAt,
        })),
        nextCursor,
      };
    }),

  /**
   * List all prompts across all projects in workspace
   */
  listAll: protectedProcedure
    .input(
      z.object({
        workspaceSlug: z.string(),
        query: z.string().optional(),
        tags: z.array(z.string()).optional(),
        label: PromptLabelNameSchema.optional(),
        includeArchived: z.boolean().default(false),
        limit: z.number().min(1).max(100).default(50),
        cursor: z.string().optional(),
      })
    )
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }) => {
      // Get all projects in workspace
      const projectIds = await prisma.project.findMany({
        where: { workspaceId: ctx.workspace.id },
        select: { id: true },
      });

      const prompts = await prisma.prompt.findMany({
        where: {
          projectId: { in: projectIds.map((p) => p.id) },
          isArchived: input.includeArchived ? undefined : false,
          ...(input.query && {
            OR: [
              { name: { contains: input.query, mode: "insensitive" } },
              { slug: { contains: input.query, mode: "insensitive" } },
              { description: { contains: input.query, mode: "insensitive" } },
            ],
          }),
          ...(input.tags?.length && { tags: { hasSome: input.tags } }),
          ...(input.label && {
            labels: { some: { name: input.label } },
          }),
        },
        include: {
          project: { select: { id: true, name: true } },
          versions: {
            orderBy: { version: "desc" },
            take: 1,
            select: {
              id: true,
              version: true,
              type: true,
              createdAt: true,
            },
          },
          labels: {
            select: {
              name: true,
              versionId: true,
            },
          },
          _count: {
            select: { versions: true },
          },
        },
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        orderBy: { updatedAt: "desc" },
      });

      let nextCursor: string | undefined;
      if (prompts.length > input.limit) {
        const next = prompts.pop();
        nextCursor = next?.id;
      }

      return {
        items: prompts.map((prompt) => ({
          id: prompt.id,
          name: prompt.name,
          slug: prompt.slug,
          description: prompt.description,
          tags: prompt.tags,
          isArchived: prompt.isArchived,
          projectId: prompt.project.id,
          projectName: prompt.project.name,
          latestVersion: prompt.versions[0]?.version ?? 0,
          latestVersionId: prompt.versions[0]?.id,
          latestVersionType: prompt.versions[0]?.type as "text" | "chat" | undefined,
          versionCount: prompt._count.versions,
          labels: prompt.labels.map((l) => l.name as PromptLabelName),
          productionVersionId: prompt.labels.find((l) => l.name === "production")?.versionId,
          createdAt: prompt.createdAt,
          updatedAt: prompt.updatedAt,
        })),
        nextCursor,
      };
    }),

  /**
   * Get single prompt with all versions
   */
  get: protectedProcedure
    .input(GetPromptInputSchema)
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }) => {
      const prompt = await prisma.prompt.findUnique({
        where: { id: input.promptId },
        include: {
          project: { select: { workspaceId: true, name: true } },
          versions: {
            orderBy: { version: "desc" },
            include: {
              labels: { select: { name: true } },
            },
          },
          labels: {
            include: {
              version: { select: { version: true } },
            },
          },
        },
      });

      if (!prompt) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Prompt not found" });
      }

      if (prompt.project.workspaceId !== ctx.workspace.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      return {
        ...prompt,
        projectName: prompt.project.name,
        versions: prompt.versions.map((v) => ({
          id: v.id,
          version: v.version,
          type: v.type as "text" | "chat",
          content: v.content as PromptTemplate,
          variables: v.variables as PromptVariable[] | null,
          config: v.config as PromptConfig | null,
          metadata: v.metadata as Record<string, unknown> | null,
          checksum: v.checksum,
          labels: v.labels.map((l) => l.name as PromptLabelName),
          createdById: v.createdById,
          createdAt: v.createdAt,
        })),
        labelMap: Object.fromEntries(
          prompt.labels.map((l) => [l.name, { versionId: l.versionId, version: l.version.version }])
        ),
      };
    }),

  /**
   * Create new prompt with initial version
   */
  create: protectedProcedure
    .input(CreatePromptInputSchema)
    .use(workspaceMiddleware)
    .mutation(async ({ ctx, input }) => {
      await verifyProjectInWorkspace(input.projectId, ctx.workspace.id);

      // Check slug uniqueness
      const existing = await prisma.prompt.findUnique({
        where: {
          projectId_slug: {
            projectId: input.projectId,
            slug: input.slug,
          },
        },
      });

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Prompt with slug "${input.slug}" already exists`,
        });
      }

      const checksum = calculateChecksum(input.template, input.config);
      const searchText = buildSearchText(
        input.name,
        input.slug,
        input.description,
        input.tags,
        input.template,
        input.variables
      );

      // Create prompt with initial version in transaction
      const prompt = await prisma.$transaction(async (tx) => {
        const newPrompt = await tx.prompt.create({
          data: {
            projectId: input.projectId,
            name: input.name,
            slug: input.slug,
            description: input.description,
            tags: input.tags,
            createdById: ctx.session.user.id,
          },
        });

        const version = await tx.promptVersion.create({
          data: {
            promptId: newPrompt.id,
            version: 1,
            type: input.template.type,
            content: input.template,
            variables: input.variables ?? [],
            config: input.config as object | undefined,
            searchText,
            checksum,
            createdById: ctx.session.user.id,
          },
        });

        // Set labels if provided
        const labelsToSet = input.labels ?? ["latest"];
        for (const labelName of labelsToSet) {
          await tx.promptLabel.create({
            data: {
              promptId: newPrompt.id,
              versionId: version.id,
              name: labelName,
              updatedById: ctx.session.user.id,
            },
          });
        }

        return { ...newPrompt, versionId: version.id };
      });

      console.info("Prompt created", {
        promptId: prompt.id,
        slug: input.slug,
        projectId: input.projectId,
        userId: ctx.session.user.id,
      });

      return prompt;
    }),

  /**
   * Create new version for existing prompt
   */
  createVersion: protectedProcedure
    .input(CreateVersionInputSchema)
    .use(workspaceMiddleware)
    .mutation(async ({ ctx, input }) => {
      const prompt = await verifyPromptInWorkspace(input.promptId, ctx.workspace.id);

      // Get latest version number
      const latestVersion = await prisma.promptVersion.findFirst({
        where: { promptId: input.promptId },
        orderBy: { version: "desc" },
        select: { version: true },
      });

      const newVersionNumber = (latestVersion?.version ?? 0) + 1;
      const checksum = calculateChecksum(input.template, input.config);
      const searchText = buildSearchText(
        prompt.name,
        prompt.slug,
        null,
        [],
        input.template,
        input.variables
      );

      const version = await prisma.$transaction(async (tx) => {
        const newVersion = await tx.promptVersion.create({
          data: {
            promptId: input.promptId,
            version: newVersionNumber,
            type: input.template.type,
            content: input.template,
            variables: input.variables ?? [],
            config: input.config as object | undefined,
            metadata: input.metadata as object | undefined,
            searchText,
            checksum,
            createdById: ctx.session.user.id,
          },
        });

        // Update "latest" label to point to new version
        await tx.promptLabel.upsert({
          where: {
            promptId_name: {
              promptId: input.promptId,
              name: "latest",
            },
          },
          create: {
            promptId: input.promptId,
            versionId: newVersion.id,
            name: "latest",
            updatedById: ctx.session.user.id,
          },
          update: {
            versionId: newVersion.id,
            updatedById: ctx.session.user.id,
          },
        });

        // Set additional label if provided
        if (input.label && input.label !== "latest") {
          await tx.promptLabel.upsert({
            where: {
              promptId_name: {
                promptId: input.promptId,
                name: input.label,
              },
            },
            create: {
              promptId: input.promptId,
              versionId: newVersion.id,
              name: input.label,
              updatedById: ctx.session.user.id,
            },
            update: {
              versionId: newVersion.id,
              updatedById: ctx.session.user.id,
            },
          });
        }

        // Update prompt updatedAt
        await tx.prompt.update({
          where: { id: input.promptId },
          data: { updatedAt: new Date() },
        });

        return newVersion;
      });

      console.info("Prompt version created", {
        promptId: input.promptId,
        versionId: version.id,
        version: newVersionNumber,
        userId: ctx.session.user.id,
      });

      return {
        id: version.id,
        promptId: input.promptId,
        version: newVersionNumber,
        type: version.type,
        checksum: version.checksum,
        createdAt: version.createdAt,
      };
    }),

  /**
   * Update prompt metadata (not versions)
   */
  update: protectedProcedure
    .input(UpdatePromptInputSchema)
    .use(workspaceMiddleware)
    .mutation(async ({ ctx, input }) => {
      await verifyPromptInWorkspace(input.promptId, ctx.workspace.id);

      // If slug is being changed, check for uniqueness within the project
      if (input.slug) {
        const existing = await prisma.prompt.findFirst({
          where: {
            slug: input.slug,
            project: { workspaceId: ctx.workspace.id },
            id: { not: input.promptId },
          },
        });
        if (existing) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "A prompt with this slug already exists in the project",
          });
        }
      }

      const updated = await prisma.prompt.update({
        where: { id: input.promptId },
        data: {
          name: input.name,
          slug: input.slug,
          description: input.description,
          tags: input.tags,
        },
      });

      return updated;
    }),

  /**
   * Set label for a version
   */
  setLabel: protectedProcedure
    .input(SetLabelInputSchema)
    .use(workspaceMiddleware)
    .mutation(async ({ ctx, input }) => {
      await verifyPromptInWorkspace(input.promptId, ctx.workspace.id);

      // Verify version exists and belongs to prompt
      const version = await prisma.promptVersion.findFirst({
        where: { id: input.versionId, promptId: input.promptId },
        select: { id: true, version: true },
      });

      if (!version) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Version not found" });
      }

      // Upsert label
      const label = await prisma.promptLabel.upsert({
        where: {
          promptId_name: {
            promptId: input.promptId,
            name: input.label,
          },
        },
        create: {
          promptId: input.promptId,
          versionId: input.versionId,
          name: input.label,
          updatedById: ctx.session.user.id,
        },
        update: {
          versionId: input.versionId,
          updatedById: ctx.session.user.id,
        },
      });

      console.info("Prompt label set", {
        promptId: input.promptId,
        versionId: input.versionId,
        version: version.version,
        label: input.label,
        userId: ctx.session.user.id,
      });

      return { label: label.name, versionId: label.versionId, version: version.version };
    }),

  /**
   * Remove label from prompt (de-set production/staging)
   */
  removeLabel: protectedProcedure
    .input(RemoveLabelInputSchema)
    .use(workspaceMiddleware)
    .mutation(async ({ ctx, input }) => {
      await verifyPromptInWorkspace(input.promptId, ctx.workspace.id);

      // Delete the label
      const deleted = await prisma.promptLabel.deleteMany({
        where: {
          promptId: input.promptId,
          name: input.label,
        },
      });

      if (deleted.count === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Label not found" });
      }

      console.info("Prompt label removed", {
        promptId: input.promptId,
        label: input.label,
        userId: ctx.session.user.id,
      });

      return { success: true, label: input.label };
    }),

  /**
   * Archive/unarchive prompt
   */
  archive: protectedProcedure
    .input(ArchivePromptInputSchema)
    .use(workspaceMiddleware)
    .mutation(async ({ ctx, input }) => {
      await verifyPromptInWorkspace(input.promptId, ctx.workspace.id);

      const updated = await prisma.prompt.update({
        where: { id: input.promptId },
        data: { isArchived: input.archive },
      });

      console.info(`Prompt ${input.archive ? "archived" : "unarchived"}`, {
        promptId: input.promptId,
        userId: ctx.session.user.id,
      });

      return { id: updated.id, isArchived: updated.isArchived };
    }),

  /**
   * Delete prompt
   */
  delete: protectedProcedure
    .input(GetPromptInputSchema)
    .use(workspaceMiddleware)
    .mutation(async ({ ctx, input }) => {
      await verifyPromptInWorkspace(input.promptId, ctx.workspace.id);

      await prisma.prompt.delete({ where: { id: input.promptId } });

      console.info("Prompt deleted", {
        promptId: input.promptId,
        userId: ctx.session.user.id,
      });

      return { success: true };
    }),

  /**
   * Search prompts across content
   */
  search: protectedProcedure
    .input(SearchPromptsInputSchema)
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }) => {
      await verifyProjectInWorkspace(input.projectId, ctx.workspace.id);

      const prompts = await prisma.prompt.findMany({
        where: {
          projectId: input.projectId,
          isArchived: false,
          ...(input.tags?.length && { tags: { hasSome: input.tags } }),
          ...(input.labels?.length && {
            labels: { some: { name: { in: input.labels } } },
          }),
          OR: [
            { name: { contains: input.query, mode: "insensitive" } },
            { slug: { contains: input.query, mode: "insensitive" } },
            { description: { contains: input.query, mode: "insensitive" } },
            ...(input.includeVersions
              ? [
                  {
                    versions: {
                      some: {
                        searchText: { contains: input.query, mode: "insensitive" as const },
                      },
                    },
                  },
                ]
              : []),
          ],
        },
        include: {
          versions: input.includeVersions
            ? {
                where: {
                  searchText: { contains: input.query, mode: "insensitive" },
                },
                orderBy: { version: "desc" },
                take: 3,
                select: {
                  id: true,
                  version: true,
                  type: true,
                  searchText: true,
                },
              }
            : {
                orderBy: { version: "desc" },
                take: 1,
                select: { id: true, version: true, type: true },
              },
          labels: { select: { name: true } },
        },
        take: input.limit,
        orderBy: { updatedAt: "desc" },
      });

      return prompts.map((prompt) => ({
        id: prompt.id,
        name: prompt.name,
        slug: prompt.slug,
        description: prompt.description,
        tags: prompt.tags,
        labels: prompt.labels.map((l) => l.name as PromptLabelName),
        matchingVersions: prompt.versions.map((v) => ({
          id: v.id,
          version: v.version,
          type: v.type as "text" | "chat",
        })),
        updatedAt: prompt.updatedAt,
      }));
    }),

  /**
   * Import prompts (bulk)
   */
  import: protectedProcedure
    .input(ImportPromptsInputSchema)
    .use(workspaceMiddleware)
    .mutation(async ({ ctx, input }) => {
      await verifyProjectInWorkspace(input.projectId, ctx.workspace.id);

      const results: {
        created: string[];
        updated: string[];
        skipped: string[];
        errors: { slug: string; error: string }[];
      } = {
        created: [],
        updated: [],
        skipped: [],
        errors: [],
      };

      for (const importPrompt of input.prompts) {
        const slug = importPrompt.slug || generateSlug(importPrompt.name);

        try {
          // Check if prompt exists
          const existing = await prisma.prompt.findUnique({
            where: {
              projectId_slug: {
                projectId: input.projectId,
                slug,
              },
            },
            include: {
              versions: {
                orderBy: { version: "desc" },
                take: 1,
              },
            },
          });

          if (existing) {
            if (!input.options?.overwrite && !input.options?.createVersions) {
              results.skipped.push(slug);
              continue;
            }

            if (input.options?.createVersions) {
              // Create new version
              const newVersionNumber = (existing.versions[0]?.version ?? 0) + 1;
              const checksum = calculateChecksum(importPrompt.template, importPrompt.config);
              const searchText = buildSearchText(
                importPrompt.name,
                slug,
                importPrompt.description,
                importPrompt.tags ?? [],
                importPrompt.template,
                importPrompt.variables
              );

              await prisma.$transaction(async (tx) => {
                const version = await tx.promptVersion.create({
                  data: {
                    promptId: existing.id,
                    version: newVersionNumber,
                    type: importPrompt.template.type,
                    content: importPrompt.template,
                    variables: importPrompt.variables ?? [],
                    config: importPrompt.config as object | undefined,
                    searchText,
                    checksum,
                    createdById: ctx.session.user.id,
                  },
                });

                await tx.promptLabel.upsert({
                  where: {
                    promptId_name: { promptId: existing.id, name: "latest" },
                  },
                  create: {
                    promptId: existing.id,
                    versionId: version.id,
                    name: "latest",
                    updatedById: ctx.session.user.id,
                  },
                  update: {
                    versionId: version.id,
                    updatedById: ctx.session.user.id,
                  },
                });
              });

              results.updated.push(slug);
            }
          } else {
            // Create new prompt
            const checksum = calculateChecksum(importPrompt.template, importPrompt.config);
            const searchText = buildSearchText(
              importPrompt.name,
              slug,
              importPrompt.description,
              importPrompt.tags ?? [],
              importPrompt.template,
              importPrompt.variables
            );

            await prisma.$transaction(async (tx) => {
              const prompt = await tx.prompt.create({
                data: {
                  projectId: input.projectId,
                  name: importPrompt.name,
                  slug,
                  description: importPrompt.description,
                  tags: importPrompt.tags ?? [],
                  createdById: ctx.session.user.id,
                },
              });

              const version = await tx.promptVersion.create({
                data: {
                  promptId: prompt.id,
                  version: 1,
                  type: importPrompt.template.type,
                  content: importPrompt.template,
                  variables: importPrompt.variables ?? [],
                  config: importPrompt.config as object | undefined,
                  searchText,
                  checksum,
                  createdById: ctx.session.user.id,
                },
              });

              await tx.promptLabel.create({
                data: {
                  promptId: prompt.id,
                  versionId: version.id,
                  name: "latest",
                  updatedById: ctx.session.user.id,
                },
              });
            });

            results.created.push(slug);
          }
        } catch (error) {
          results.errors.push({
            slug,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }

      console.info("Prompts imported", {
        projectId: input.projectId,
        created: results.created.length,
        updated: results.updated.length,
        skipped: results.skipped.length,
        errors: results.errors.length,
        userId: ctx.session.user.id,
      });

      return results;
    }),

  /**
   * Export prompts
   */
  export: protectedProcedure
    .input(ExportPromptsInputSchema)
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }) => {
      await verifyProjectInWorkspace(input.projectId, ctx.workspace.id);

      const prompts = await prisma.prompt.findMany({
        where: {
          projectId: input.projectId,
          ...(input.promptIds?.length && { id: { in: input.promptIds } }),
        },
        include: {
          versions: input.includeAllVersions
            ? { orderBy: { version: "desc" } }
            : {
                orderBy: { version: "desc" },
                take: 1,
              },
          labels: { select: { name: true, versionId: true } },
        },
      });

      return prompts.map((prompt) => ({
        name: prompt.name,
        slug: prompt.slug,
        description: prompt.description,
        tags: prompt.tags,
        versions: prompt.versions.map((v) => ({
          version: v.version,
          type: v.type,
          template: v.content as PromptTemplate,
          variables: v.variables as PromptVariable[] | null,
          config: v.config as PromptConfig | null,
          labels: prompt.labels.filter((l) => l.versionId === v.id).map((l) => l.name),
        })),
      }));
    }),

  /**
   * Get labels and presets for UI
   */
  getPresets: protectedProcedure.query(() => {
    return {
      typeLabels: PROMPT_TYPE_LABELS,
      labelLabels: PROMPT_LABEL_LABELS,
      labelColors: PROMPT_LABEL_COLORS,
      defaultLabel: DEFAULT_FETCH_LABEL,
    };
  }),

  /**
   * Get unique tags for a project (for autocomplete)
   */
  getTags: protectedProcedure
    .input(
      z.object({
        workspaceSlug: z.string(),
        projectId: z.string(),
      })
    )
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }) => {
      await verifyProjectInWorkspace(input.projectId, ctx.workspace.id);

      const prompts = await prisma.prompt.findMany({
        where: { projectId: input.projectId, isArchived: false },
        select: { tags: true },
      });

      const allTags = new Set<string>();
      for (const prompt of prompts) {
        for (const tag of prompt.tags) {
          allTags.add(tag);
        }
      }

      return Array.from(allTags).sort();
    }),

  /**
   * Get prompt analytics (usage metrics)
   */
  analytics: protectedProcedure
    .input(PromptAnalyticsInputSchema)
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }) => {
      // Get the prompt to verify access and get project
      const prompt = await prisma.prompt.findUnique({
        where: { id: input.promptId },
        select: { projectId: true },
      });

      if (!prompt) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Prompt not found" });
      }

      await verifyProjectInWorkspace(prompt.projectId, ctx.workspace.id);

      // Get all versions for this prompt
      const versions = await prisma.promptVersion.findMany({
        where: {
          promptId: input.promptId,
          ...(input.versionId && { id: input.versionId }),
        },
        select: {
          id: true,
          version: true,
        },
        orderBy: { version: "desc" },
      });

      // For now, return mock analytics since trace linkage isn't implemented yet
      // When trace linkage is implemented, this will aggregate from spans with promptId metadata
      const byVersion = versions.map((v) => ({
        versionId: v.id,
        version: v.version,
        usageCount: 0,
        avgLatencyMs: null as number | null,
        avgCost: null as number | null,
        errorRate: null as number | null,
      }));

      return {
        totalUsage: 0,
        avgLatencyMs: null as number | null,
        avgCost: null as number | null,
        errorRate: null as number | null,
        byVersion,
      };
    }),

  /**
   * Run prompt in playground (test with LLM)
   */
  runPlayground: protectedProcedure
    .input(RunPlaygroundInputSchema)
    .use(workspaceMiddleware)
    .mutation(async ({ ctx, input }) => {
      // Get the version
      const version = await prisma.promptVersion.findUnique({
        where: { id: input.versionId },
        include: {
          prompt: { select: { projectId: true } },
        },
      });

      if (!version) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Version not found" });
      }

      await verifyProjectInWorkspace(version.prompt.projectId, ctx.workspace.id);

      // Compile the template with variables
      const content = version.content as PromptTemplate;
      const compiledContent = compileTemplate(content, input.variables);

      // Get model config
      const config = input.config ?? (version.config as PromptConfig | null);
      const model = config?.model ?? "gpt-4o-mini";

      // TODO: Integrate with LLM Center for actual LLM calls
      // For now, return a mock response
      const startTime = Date.now();

      // Mock response - in production, this would call the LLM via LLM Center
      const mockOutput = `[Playground Preview]\n\nModel: ${model}\nTemplate Type: ${content.type}\n\nCompiled Content:\n${
        compiledContent.type === "text"
          ? compiledContent.text
          : compiledContent.messages.map((m) => `[${m.role}] ${m.content}`).join("\n")
      }\n\n---\nNote: LLM integration pending. This is a preview of the compiled prompt.`;

      const latencyMs = Date.now() - startTime;

      return {
        output: mockOutput,
        model,
        latencyMs,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        cost: 0,
      };
    }),
});

/**
 * Compile template with variables
 */
function compileTemplate(
  template: PromptTemplate,
  variables: Record<string, string>
): PromptTemplate {
  const compile = (text: string): string => {
    return text.replace(/\{\{(\w+)\}\}/g, (match, varName: string) => {
      return varName in variables ? (variables[varName] ?? match) : match;
    });
  };

  if (template.type === "text") {
    return { type: "text", text: compile(template.text) };
  }

  return {
    type: "chat",
    messages: template.messages.map((m) => ({
      ...m,
      content: compile(m.content),
    })),
  };
}

export type PromptsRouter = typeof promptsRouter;
