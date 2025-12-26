/**
 * Knowledge Router
 *
 * tRPC router for workspace knowledge base management.
 * Handles groups, articles, versioning, links, rules, and search.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import crypto from "crypto";
import { prisma, Prisma } from "@ducsigr/db";
import {
  createRouter,
  protectedProcedure,
  workspaceMiddleware,
} from "../trpc";
import { getTemporalClient, getTaskQueue } from "../lib/temporal";
import {
  CreateGroupInputSchema,
  UpdateGroupInputSchema,
  DeleteGroupInputSchema,
  ListGroupsInputSchema,
  CreateArticleInputSchema,
  UpdateArticleInputSchema,
  PublishArticleInputSchema,
  ArchiveArticleInputSchema,
  ListArticlesInputSchema,
  GetArticleInputSchema,
  ListVersionsInputSchema,
  GetVersionInputSchema,
  RevertToVersionInputSchema,
  CompareVersionsInputSchema,
  UploadAttachmentInputSchema,
  DeleteAttachmentInputSchema,
  ListAttachmentsInputSchema,
  SearchKnowledgeInputSchema,
  LinkEntityInputSchema,
  UnlinkEntityInputSchema,
  ListLinksInputSchema,
  UpsertRuleInputSchema,
  DeleteRuleInputSchema,
  ListRulesInputSchema,
  PreviewRuleInputSchema,
  KnowledgeStatsInputSchema,
  ArticleFeedbackInputSchema,
} from "../schemas/knowledge";

// ============================================================
// Helper Functions
// ============================================================

/**
 * Calculate SHA-256 checksum of content for versioning
 */
function calculateChecksum(
  title: string,
  summary: string | null | undefined,
  content: string,
  tags: string[]
): string {
  const data = JSON.stringify({ title, summary, content, tags });
  return crypto.createHash("sha256").update(data).digest("hex");
}

/**
 * Build searchText from article content (strip markdown)
 */
function buildSearchText(content: string): string {
  return content
    .replace(/[#*_`~[\]()]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 10000);
}

/**
 * Verify article exists and belongs to workspace
 */
async function verifyArticleInWorkspace(
  articleId: string,
  workspaceId: string
): Promise<{
  id: string;
  workspaceId: string;
  title: string;
  slug: string;
  status: string;
}> {
  const article = await prisma.knowledgeArticle.findUnique({
    where: { id: articleId },
    select: { id: true, workspaceId: true, title: true, slug: true, status: true },
  });

  if (!article) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Article not found" });
  }

  if (article.workspaceId !== workspaceId) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }

  return article;
}

/**
 * Verify group exists and belongs to workspace
 */
async function verifyGroupInWorkspace(
  groupId: string,
  workspaceId: string
): Promise<{ id: string; name: string; parentId: string | null }> {
  const group = await prisma.knowledgeGroup.findUnique({
    where: { id: groupId },
    select: { id: true, workspaceId: true, name: true, parentId: true },
  });

  if (!group) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Group not found" });
  }

  if (group.workspaceId !== workspaceId) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }

  return { id: group.id, name: group.name, parentId: group.parentId };
}

/**
 * Evaluate a FilterExpression condition against a context object.
 * Supports operators: equals, contains, exists, gt, lt, gte, lte, and, or, not, regex
 */
function evaluateCondition(
  condition: Record<string, unknown>,
  context: Record<string, unknown>
): boolean {
  const operator = condition.operator as string | undefined;
  const field = condition.field as string | undefined;
  const value = condition.value;

  switch (operator) {
    case "equals":
      return field ? context[field] === value : false;

    case "not_equals":
      return field ? context[field] !== value : false;

    case "contains": {
      if (!field) return false;
      const fieldValue = context[field];
      if (typeof fieldValue === "string" && typeof value === "string") {
        return fieldValue.toLowerCase().includes(value.toLowerCase());
      }
      return false;
    }

    case "exists":
      return field ? context[field] !== undefined && context[field] !== null : false;

    case "gt":
      return field ? Number(context[field]) > Number(value) : false;

    case "lt":
      return field ? Number(context[field]) < Number(value) : false;

    case "gte":
      return field ? Number(context[field]) >= Number(value) : false;

    case "lte":
      return field ? Number(context[field]) <= Number(value) : false;

    case "regex": {
      if (!field) return false;
      const regexFieldValue = context[field];
      if (typeof regexFieldValue === "string" && typeof value === "string") {
        try {
          return new RegExp(value, "i").test(regexFieldValue);
        } catch {
          return false;
        }
      }
      return false;
    }

    case "and": {
      const andConditions = condition.conditions as Record<string, unknown>[] | undefined;
      if (!Array.isArray(andConditions)) return false;
      return andConditions.every((c) => evaluateCondition(c, context));
    }

    case "or": {
      const orConditions = condition.conditions as Record<string, unknown>[] | undefined;
      if (!Array.isArray(orConditions)) return false;
      return orConditions.some((c) => evaluateCondition(c, context));
    }

    case "not": {
      const notCondition = condition.condition as Record<string, unknown> | undefined;
      if (!notCondition) return false;
      return !evaluateCondition(notCondition, context);
    }

    default:
      // If no operator, treat as simple field matching (legacy support)
      if (Object.keys(condition).length > 0) {
        return Object.entries(condition).every(([key, val]) => {
          if (key === "operator" || key === "field" || key === "value" || key === "conditions") {
            return true;
          }
          return context[key] === val;
        });
      }
      return false;
  }
}

// ============================================================
// Knowledge Router
// ============================================================

export const knowledgeRouter = createRouter({
  // ============================================================
  // GROUP PROCEDURES
  // ============================================================

  /**
   * List groups for a workspace (flat or tree)
   */
  listGroups: protectedProcedure
    .input(ListGroupsInputSchema)
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }) => {
      const groups = await prisma.knowledgeGroup.findMany({
        where: { workspaceId: ctx.workspace.id },
        include: {
          _count: { select: { articles: true, children: true } },
        },
        orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
      });

      if (input.flat) {
        return groups;
      }

      // Build tree structure
      type GroupWithChildren = (typeof groups)[number] & {
        children: GroupWithChildren[];
      };

      const buildTree = (parentId: string | null): GroupWithChildren[] => {
        return groups
          .filter((g) => g.parentId === parentId)
          .map((g) => ({
            ...g,
            children: buildTree(g.id),
          }));
      };

      return buildTree(null);
    }),

  /**
   * Create a new group
   */
  createGroup: protectedProcedure
    .input(CreateGroupInputSchema)
    .use(workspaceMiddleware)
    .mutation(async ({ ctx, input }) => {
      // Verify parent exists if provided
      if (input.parentId) {
        await verifyGroupInWorkspace(input.parentId, ctx.workspace.id);
      }

      return prisma.knowledgeGroup.create({
        data: {
          workspaceId: ctx.workspace.id,
          name: input.name,
          description: input.description,
          parentId: input.parentId,
          sortOrder: input.sortOrder ?? 0,
        },
      });
    }),

  /**
   * Update a group
   */
  updateGroup: protectedProcedure
    .input(UpdateGroupInputSchema)
    .use(workspaceMiddleware)
    .mutation(async ({ ctx, input }) => {
      await verifyGroupInWorkspace(input.groupId, ctx.workspace.id);

      // Prevent circular reference
      if (input.parentId === input.groupId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Group cannot be its own parent",
        });
      }

      // Verify new parent exists if provided
      if (input.parentId) {
        await verifyGroupInWorkspace(input.parentId, ctx.workspace.id);
      }

      return prisma.knowledgeGroup.update({
        where: { id: input.groupId },
        data: {
          name: input.name,
          description: input.description,
          parentId: input.parentId,
          sortOrder: input.sortOrder,
        },
      });
    }),

  /**
   * Delete a group
   */
  deleteGroup: protectedProcedure
    .input(DeleteGroupInputSchema)
    .use(workspaceMiddleware)
    .mutation(async ({ ctx, input }) => {
      const group = await verifyGroupInWorkspace(input.groupId, ctx.workspace.id);

      if (input.preserveArticles) {
        // Move articles to parent group
        await prisma.knowledgeArticle.updateMany({
          where: { groupId: input.groupId },
          data: { groupId: group.parentId },
        });
        // Move child groups to parent
        await prisma.knowledgeGroup.updateMany({
          where: { parentId: input.groupId },
          data: { parentId: group.parentId },
        });
      }

      await prisma.knowledgeGroup.delete({ where: { id: input.groupId } });
      return { success: true };
    }),

  // ============================================================
  // ARTICLE PROCEDURES
  // ============================================================

  /**
   * List articles
   */
  listArticles: protectedProcedure
    .input(ListArticlesInputSchema)
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }) => {
      const where = {
        workspaceId: ctx.workspace.id,
        ...(input.groupId && { groupId: input.groupId }),
        ...(input.status && { status: input.status }),
        ...(input.tags?.length && { tags: { hasSome: input.tags } }),
        ...(input.query && {
          OR: [
            { title: { contains: input.query, mode: "insensitive" as const } },
            {
              searchText: { contains: input.query, mode: "insensitive" as const },
            },
          ],
        }),
      };

      const articles = await prisma.knowledgeArticle.findMany({
        where,
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        orderBy: { updatedAt: "desc" },
        include: {
          group: { select: { id: true, name: true } },
          _count: { select: { links: true, chunks: true, attachments: true } },
        },
      });

      let nextCursor: string | undefined;
      if (articles.length > input.limit) {
        const next = articles.pop();
        nextCursor = next?.id;
      }

      return { items: articles, nextCursor };
    }),

  /**
   * Get single article with full details
   */
  getArticle: protectedProcedure
    .input(GetArticleInputSchema)
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }) => {
      const article = await prisma.knowledgeArticle.findFirst({
        where: { id: input.articleId, workspaceId: ctx.workspace.id },
        include: {
          group: { select: { id: true, name: true } },
          createdBy: { select: { id: true, name: true, image: true } },
          updatedBy: { select: { id: true, name: true, image: true } },
          attachments: true,
          links: {
            include: {
              createdBy: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: "desc" },
            take: 20,
          },
          _count: {
            select: { chunks: true, links: true, rcaMatches: true, versions: true },
          },
        },
      });

      if (!article) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Article not found" });
      }

      // Increment view count (non-blocking)
      prisma.knowledgeArticle
        .update({
          where: { id: input.articleId },
          data: {
            viewCount: { increment: 1 },
            lastViewedAt: new Date(),
          },
        })
        .catch(() => {});

      return article;
    }),

  /**
   * Create new article
   */
  createArticle: protectedProcedure
    .input(CreateArticleInputSchema)
    .use(workspaceMiddleware)
    .mutation(async ({ ctx, input }) => {
      // Verify group exists if provided
      if (input.groupId) {
        await verifyGroupInWorkspace(input.groupId, ctx.workspace.id);
      }

      const searchText = buildSearchText(input.content);
      const checksum = calculateChecksum(
        input.title,
        input.summary,
        input.content,
        input.tags
      );

      // Create article and first version in transaction
      const article = await prisma.$transaction(async (tx) => {
        const created = await tx.knowledgeArticle.create({
          data: {
            workspaceId: ctx.workspace.id,
            groupId: input.groupId,
            title: input.title,
            slug: input.slug,
            summary: input.summary,
            content: input.content,
            tags: input.tags,
            status: input.status,
            searchText,
            createdById: ctx.session.user.id,
            updatedById: ctx.session.user.id,
          },
        });

        // Create initial version
        await tx.knowledgeArticleVersion.create({
          data: {
            articleId: created.id,
            version: 1,
            title: input.title,
            summary: input.summary,
            content: input.content,
            tags: input.tags,
            checksum,
            createdById: ctx.session.user.id,
          },
        });

        return created;
      });

      return article;
    }),

  /**
   * Update article
   */
  updateArticle: protectedProcedure
    .input(UpdateArticleInputSchema)
    .use(workspaceMiddleware)
    .mutation(async ({ ctx, input }) => {
      // Verify article exists in workspace (throws if not found)
      await verifyArticleInWorkspace(input.articleId, ctx.workspace.id);

      // Get current article for version comparison
      const current = await prisma.knowledgeArticle.findUnique({
        where: { id: input.articleId },
        select: {
          title: true,
          summary: true,
          content: true,
          tags: true,
          versions: {
            orderBy: { version: "desc" },
            take: 1,
            select: { version: true, checksum: true },
          },
        },
      });

      if (!current) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      // Calculate new checksum
      const newTitle = input.title ?? current.title;
      const newSummary = input.summary === null ? null : input.summary ?? current.summary;
      const newContent = input.content ?? current.content;
      const newTags = input.tags ?? current.tags;
      const newChecksum = calculateChecksum(newTitle, newSummary, newContent, newTags);

      // Check if content actually changed
      const latestVersion = current.versions[0];
      const contentChanged = !latestVersion || latestVersion.checksum !== newChecksum;

      const searchText = input.content ? buildSearchText(input.content) : undefined;

      // Update article and optionally create new version
      const article = await prisma.$transaction(async (tx) => {
        const updated = await tx.knowledgeArticle.update({
          where: { id: input.articleId },
          data: {
            groupId: input.groupId,
            title: input.title,
            slug: input.slug,
            summary: input.summary,
            content: input.content,
            tags: input.tags,
            searchText,
            updatedById: ctx.session.user.id,
          },
        });

        // Create new version if content changed
        if (contentChanged) {
          const nextVersion = (latestVersion?.version ?? 0) + 1;
          await tx.knowledgeArticleVersion.create({
            data: {
              articleId: input.articleId,
              version: nextVersion,
              title: newTitle,
              summary: newSummary,
              content: newContent,
              tags: newTags,
              checksum: newChecksum,
              createdById: ctx.session.user.id,
            },
          });
        }

        return updated;
      });

      return article;
    }),

  /**
   * Publish article (DRAFT -> PUBLISHED)
   */
  publishArticle: protectedProcedure
    .input(PublishArticleInputSchema)
    .use(workspaceMiddleware)
    .mutation(async ({ ctx, input }) => {
      const article = await verifyArticleInWorkspace(
        input.articleId,
        ctx.workspace.id
      );

      if (article.status === "PUBLISHED") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Article is already published",
        });
      }

      // Update article status
      const updated = await prisma.knowledgeArticle.update({
        where: { id: input.articleId },
        data: {
          status: "PUBLISHED",
          updatedById: ctx.session.user.id,
        },
      });

      // Trigger knowledge indexing workflow (non-blocking)
      getTemporalClient()
        .then(async (client) => {
          const workflowId = `knowledge-index-${input.articleId}-${Date.now()}`;
          await client.workflow.start("knowledgeIndexWorkflow", {
            taskQueue: getTaskQueue(),
            workflowId,
            args: [
              {
                articleId: input.articleId,
                forceReindex: true,
              },
            ],
          });
          console.log(`[Knowledge] Started indexing workflow ${workflowId}`);
        })
        .catch((error) => {
          console.error("[Knowledge] Failed to start indexing workflow:", error);
        });

      return updated;
    }),

  /**
   * Archive/unarchive article
   */
  archiveArticle: protectedProcedure
    .input(ArchiveArticleInputSchema)
    .use(workspaceMiddleware)
    .mutation(async ({ ctx, input }) => {
      await verifyArticleInWorkspace(input.articleId, ctx.workspace.id);

      return prisma.knowledgeArticle.update({
        where: { id: input.articleId },
        data: {
          status: input.archive ? "ARCHIVED" : "DRAFT",
          updatedById: ctx.session.user.id,
        },
      });
    }),

  /**
   * Delete article permanently
   */
  deleteArticle: protectedProcedure
    .input(GetArticleInputSchema)
    .use(workspaceMiddleware)
    .mutation(async ({ ctx, input }) => {
      await verifyArticleInWorkspace(input.articleId, ctx.workspace.id);
      await prisma.knowledgeArticle.delete({ where: { id: input.articleId } });
      return { success: true };
    }),

  // ============================================================
  // VERSION PROCEDURES
  // ============================================================

  /**
   * List versions for an article
   */
  listVersions: protectedProcedure
    .input(ListVersionsInputSchema)
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }) => {
      await verifyArticleInWorkspace(input.articleId, ctx.workspace.id);

      const versions = await prisma.knowledgeArticleVersion.findMany({
        where: { articleId: input.articleId },
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        orderBy: { version: "desc" },
        include: {
          createdBy: { select: { id: true, name: true, image: true } },
        },
      });

      let nextCursor: string | undefined;
      if (versions.length > input.limit) {
        const next = versions.pop();
        nextCursor = next?.id;
      }

      return { items: versions, nextCursor };
    }),

  /**
   * Get specific version
   */
  getVersion: protectedProcedure
    .input(GetVersionInputSchema)
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }) => {
      await verifyArticleInWorkspace(input.articleId, ctx.workspace.id);

      const version = await prisma.knowledgeArticleVersion.findUnique({
        where: {
          articleId_version: {
            articleId: input.articleId,
            version: input.version,
          },
        },
        include: {
          createdBy: { select: { id: true, name: true, image: true } },
        },
      });

      if (!version) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Version not found" });
      }

      return version;
    }),

  /**
   * Revert to a specific version
   */
  revertToVersion: protectedProcedure
    .input(RevertToVersionInputSchema)
    .use(workspaceMiddleware)
    .mutation(async ({ ctx, input }) => {
      await verifyArticleInWorkspace(input.articleId, ctx.workspace.id);

      const version = await prisma.knowledgeArticleVersion.findUnique({
        where: {
          articleId_version: {
            articleId: input.articleId,
            version: input.version,
          },
        },
      });

      if (!version) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Version not found" });
      }

      // Get latest version number
      const latest = await prisma.knowledgeArticleVersion.findFirst({
        where: { articleId: input.articleId },
        orderBy: { version: "desc" },
        select: { version: true },
      });

      const nextVersion = (latest?.version ?? 0) + 1;
      const searchText = buildSearchText(version.content);

      // Update article and create new version
      const article = await prisma.$transaction(async (tx) => {
        const updated = await tx.knowledgeArticle.update({
          where: { id: input.articleId },
          data: {
            title: version.title,
            summary: version.summary,
            content: version.content,
            tags: version.tags,
            searchText,
            updatedById: ctx.session.user.id,
          },
        });

        await tx.knowledgeArticleVersion.create({
          data: {
            articleId: input.articleId,
            version: nextVersion,
            title: version.title,
            summary: version.summary,
            content: version.content,
            tags: version.tags,
            checksum: version.checksum,
            diff: JSON.stringify({ revertedFrom: input.version }),
            createdById: ctx.session.user.id,
          },
        });

        return updated;
      });

      return article;
    }),

  /**
   * Compare two versions
   */
  compareVersions: protectedProcedure
    .input(CompareVersionsInputSchema)
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }) => {
      await verifyArticleInWorkspace(input.articleId, ctx.workspace.id);

      const [fromVersion, toVersion] = await Promise.all([
        prisma.knowledgeArticleVersion.findUnique({
          where: {
            articleId_version: {
              articleId: input.articleId,
              version: input.fromVersion,
            },
          },
        }),
        prisma.knowledgeArticleVersion.findUnique({
          where: {
            articleId_version: {
              articleId: input.articleId,
              version: input.toVersion,
            },
          },
        }),
      ]);

      if (!fromVersion || !toVersion) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Version not found" });
      }

      return { from: fromVersion, to: toVersion };
    }),

  // ============================================================
  // ATTACHMENT PROCEDURES
  // ============================================================

  /**
   * Get upload URL for attachment
   */
  uploadAttachment: protectedProcedure
    .input(UploadAttachmentInputSchema)
    .use(workspaceMiddleware)
    .mutation(async ({ ctx, input }) => {
      await verifyArticleInWorkspace(input.articleId, ctx.workspace.id);

      // TODO: Generate presigned upload URL from S3/R2
      // For now, create placeholder record
      const storageKey = `knowledge/${ctx.workspace.id}/${input.articleId}/${Date.now()}-${input.fileName}`;

      const attachment = await prisma.knowledgeAttachment.create({
        data: {
          workspaceId: ctx.workspace.id,
          articleId: input.articleId,
          fileName: input.fileName,
          contentType: input.contentType,
          sizeBytes: input.sizeBytes,
          storageKey,
        },
      });

      // Trigger attachment text extraction workflow (non-blocking)
      getTemporalClient()
        .then(async (client) => {
          const workflowId = `attachment-extract-${attachment.id}-${Date.now()}`;
          await client.workflow.start("attachmentExtractWorkflow", {
            taskQueue: getTaskQueue(),
            workflowId,
            args: [
              {
                attachmentId: attachment.id,
                reindexArticle: true,
              },
            ],
          });
          console.log(`[Knowledge] Started attachment extraction workflow ${workflowId}`);
        })
        .catch((error) => {
          console.error("[Knowledge] Failed to start attachment extraction workflow:", error);
        });

      return {
        attachmentId: attachment.id,
        uploadUrl: `https://placeholder-upload-url/${storageKey}`, // TODO: Real presigned URL
      };
    }),

  /**
   * Delete attachment
   */
  deleteAttachment: protectedProcedure
    .input(DeleteAttachmentInputSchema)
    .use(workspaceMiddleware)
    .mutation(async ({ ctx, input }) => {
      const attachment = await prisma.knowledgeAttachment.findUnique({
        where: { id: input.attachmentId },
        select: { id: true, workspaceId: true, storageKey: true },
      });

      if (!attachment) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Attachment not found" });
      }

      if (attachment.workspaceId !== ctx.workspace.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      // TODO: Delete from S3/R2

      await prisma.knowledgeAttachment.delete({ where: { id: input.attachmentId } });
      return { success: true };
    }),

  /**
   * List attachments for article
   */
  listAttachments: protectedProcedure
    .input(ListAttachmentsInputSchema)
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }) => {
      await verifyArticleInWorkspace(input.articleId, ctx.workspace.id);

      return prisma.knowledgeAttachment.findMany({
        where: { articleId: input.articleId },
        orderBy: { createdAt: "desc" },
      });
    }),

  // ============================================================
  // SEARCH PROCEDURES
  // ============================================================

  /**
   * Search knowledge base (keyword + semantic)
   */
  search: protectedProcedure
    .input(SearchKnowledgeInputSchema)
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }) => {
      // For now, implement keyword search only
      // Semantic search will be added via internal procedures in Phase 3
      const articles = await prisma.knowledgeArticle.findMany({
        where: {
          workspaceId: ctx.workspace.id,
          status: input.status ?? "PUBLISHED",
          ...(input.groupId && { groupId: input.groupId }),
          ...(input.tags?.length && { tags: { hasSome: input.tags } }),
          OR: [
            { title: { contains: input.query, mode: "insensitive" } },
            { summary: { contains: input.query, mode: "insensitive" } },
            { searchText: { contains: input.query, mode: "insensitive" } },
            { tags: { has: input.query } },
          ],
        },
        take: input.limit,
        orderBy: { updatedAt: "desc" },
        include: {
          group: { select: { id: true, name: true } },
        },
      });

      return articles.map((a) => ({
        articleId: a.id,
        title: a.title,
        slug: a.slug,
        summary: a.summary,
        excerpt: a.searchText?.slice(0, 200) ?? "",
        score: 1.0, // Placeholder score for keyword search
        matchType: "keyword" as const,
        tags: a.tags,
        groupId: a.groupId,
        groupName: a.group?.name ?? null,
      }));
    }),

  // ============================================================
  // LINK PROCEDURES
  // ============================================================

  /**
   * Link an article to an entity
   */
  linkEntity: protectedProcedure
    .input(LinkEntityInputSchema)
    .use(workspaceMiddleware)
    .mutation(async ({ ctx, input }) => {
      await verifyArticleInWorkspace(input.articleId, ctx.workspace.id);

      try {
        return await prisma.knowledgeLink.create({
          data: {
            workspaceId: ctx.workspace.id,
            articleId: input.articleId,
            entityType: input.entityType,
            entityId: input.entityId,
            note: input.note,
            createdById: ctx.session.user.id,
          },
        });
      } catch (error) {
        if ((error as { code?: string }).code === "P2002") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Link already exists",
          });
        }
        throw error;
      }
    }),

  /**
   * Unlink an article from an entity
   */
  unlinkEntity: protectedProcedure
    .input(UnlinkEntityInputSchema)
    .use(workspaceMiddleware)
    .mutation(async ({ ctx, input }) => {
      const link = await prisma.knowledgeLink.findFirst({
        where: {
          articleId: input.articleId,
          entityType: input.entityType,
          entityId: input.entityId,
          workspaceId: ctx.workspace.id,
        },
      });

      if (!link) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Link not found" });
      }

      await prisma.knowledgeLink.delete({ where: { id: link.id } });
      return { success: true };
    }),

  /**
   * List links
   */
  listLinks: protectedProcedure
    .input(ListLinksInputSchema)
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }) => {
      return prisma.knowledgeLink.findMany({
        where: {
          workspaceId: ctx.workspace.id,
          ...(input.articleId && { articleId: input.articleId }),
          ...(input.entityType && { entityType: input.entityType }),
          ...(input.entityId && { entityId: input.entityId }),
        },
        include: {
          article: {
            select: { id: true, title: true, slug: true, status: true },
          },
          createdBy: {
            select: { id: true, name: true },
          },
        },
        take: input.limit,
        orderBy: { createdAt: "desc" },
      });
    }),

  // ============================================================
  // RULE PROCEDURES
  // ============================================================

  /**
   * Create or update a rule
   */
  upsertRule: protectedProcedure
    .input(UpsertRuleInputSchema)
    .use(workspaceMiddleware)
    .mutation(async ({ ctx, input }) => {
      // Verify target exists
      if (input.articleId) {
        await verifyArticleInWorkspace(input.articleId, ctx.workspace.id);
      }

      if (input.groupId) {
        await verifyGroupInWorkspace(input.groupId, ctx.workspace.id);
      }

      if (input.projectId) {
        const project = await prisma.project.findFirst({
          where: { id: input.projectId, workspaceId: ctx.workspace.id },
        });
        if (!project) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
        }
      }

      if (input.ruleId) {
        // Update existing rule
        const rule = await prisma.knowledgeRule.findFirst({
          where: { id: input.ruleId, workspaceId: ctx.workspace.id },
        });

        if (!rule) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Rule not found" });
        }

        return prisma.knowledgeRule.update({
          where: { id: input.ruleId },
          data: {
            name: input.name,
            description: input.description,
            enabled: input.enabled,
            priority: input.priority,
            scope: input.scope,
            projectId: input.projectId,
            condition: input.condition as Prisma.InputJsonValue,
            articleId: input.articleId,
            groupId: input.groupId,
            matchReasonTemplate: input.matchReasonTemplate,
          },
        });
      }

      // Create new rule
      return prisma.knowledgeRule.create({
        data: {
          workspaceId: ctx.workspace.id,
          name: input.name,
          description: input.description,
          enabled: input.enabled,
          priority: input.priority,
          scope: input.scope,
          projectId: input.projectId,
          condition: input.condition as Prisma.InputJsonValue,
          articleId: input.articleId,
          groupId: input.groupId,
          matchReasonTemplate: input.matchReasonTemplate,
        },
      });
    }),

  /**
   * Delete a rule
   */
  deleteRule: protectedProcedure
    .input(DeleteRuleInputSchema)
    .use(workspaceMiddleware)
    .mutation(async ({ ctx, input }) => {
      const rule = await prisma.knowledgeRule.findFirst({
        where: { id: input.ruleId, workspaceId: ctx.workspace.id },
      });

      if (!rule) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Rule not found" });
      }

      await prisma.knowledgeRule.delete({ where: { id: input.ruleId } });
      return { success: true };
    }),

  /**
   * List rules
   */
  listRules: protectedProcedure
    .input(ListRulesInputSchema)
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }) => {
      return prisma.knowledgeRule.findMany({
        where: {
          workspaceId: ctx.workspace.id,
          ...(input.projectId && { projectId: input.projectId }),
          ...(typeof input.enabled === "boolean" && { enabled: input.enabled }),
        },
        include: {
          article: { select: { id: true, title: true, slug: true } },
          group: { select: { id: true, name: true } },
          project: { select: { id: true, name: true } },
        },
        take: input.limit,
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      });
    }),

  /**
   * Preview rule matches (dry run)
   */
  previewRule: protectedProcedure
    .input(PreviewRuleInputSchema)
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }) => {
      // Get projects for this workspace
      const projectWhere = input.projectId
        ? { id: input.projectId, workspaceId: ctx.workspace.id }
        : { workspaceId: ctx.workspace.id };

      const projects = await prisma.project.findMany({
        where: projectWhere,
        select: { id: true },
      });

      if (projects.length === 0) {
        return { matches: [], matchCount: 0, scannedCount: 0 };
      }

      // Query recent traces from these projects
      const traces = await prisma.trace.findMany({
        where: {
          projectId: { in: projects.map((p) => p.id) },
        },
        take: 100, // Scan last 100 traces
        orderBy: { startTime: "desc" },
        select: {
          id: true,
          serviceName: true,
          serviceVersion: true,
          environment: true,
          rootSpanName: true,
          rootSpanStatusCode: true,
          durationMs: true,
          errorCount: true,
          startTime: true,
          project: { select: { id: true, name: true } },
        },
      });

      // Evaluate condition against each trace
      const matches: Array<{
        traceId: string;
        serviceName: string;
        rootSpanName: string | null;
        errorCount: number;
        durationMs: number | null;
        startTime: Date;
        projectName: string;
      }> = [];

      for (const trace of traces) {
        // Build trace context for evaluation
        const traceContext = {
          serviceName: trace.serviceName,
          serviceVersion: trace.serviceVersion,
          environment: trace.environment,
          rootSpanName: trace.rootSpanName,
          rootSpanStatusCode: trace.rootSpanStatusCode,
          durationMs: trace.durationMs,
          errorCount: trace.errorCount,
          hasErrors: trace.errorCount > 0,
          projectId: trace.project.id,
          projectName: trace.project.name,
        };

        // Evaluate the condition
        if (evaluateCondition(input.condition, traceContext)) {
          matches.push({
            traceId: trace.id,
            serviceName: trace.serviceName,
            rootSpanName: trace.rootSpanName,
            errorCount: trace.errorCount,
            durationMs: trace.durationMs,
            startTime: trace.startTime,
            projectName: trace.project.name,
          });

          if (matches.length >= input.limit) break;
        }
      }

      return {
        matches,
        matchCount: matches.length,
        scannedCount: traces.length,
      };
    }),

  // ============================================================
  // STATS PROCEDURES
  // ============================================================

  /**
   * Get knowledge base statistics
   */
  stats: protectedProcedure
    .input(KnowledgeStatsInputSchema)
    .use(workspaceMiddleware)
    .query(async ({ ctx }) => {
      const [
        articleStats,
        groupCount,
        ruleStats,
        linkCount,
        viewSum,
        recentMatches,
      ] = await Promise.all([
        prisma.knowledgeArticle.groupBy({
          by: ["status"],
          where: { workspaceId: ctx.workspace.id },
          _count: true,
        }),
        prisma.knowledgeGroup.count({
          where: { workspaceId: ctx.workspace.id },
        }),
        prisma.knowledgeRule.groupBy({
          by: ["enabled"],
          where: { workspaceId: ctx.workspace.id },
          _count: true,
        }),
        prisma.knowledgeLink.count({
          where: { workspaceId: ctx.workspace.id },
        }),
        prisma.knowledgeArticle.aggregate({
          where: { workspaceId: ctx.workspace.id },
          _sum: { viewCount: true },
        }),
        prisma.alertRCAKnowledge.count({
          where: {
            article: { workspaceId: ctx.workspace.id },
            createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
          },
        }),
      ]);

      const statusCounts = Object.fromEntries(
        articleStats.map((s) => [s.status, s._count])
      ) as Record<string, number>;
      const enabledRules =
        ruleStats.find((r) => r.enabled)?._count ?? 0;
      const totalRules = ruleStats.reduce((sum, r) => sum + r._count, 0);

      return {
        totalArticles:
          (statusCounts.DRAFT ?? 0) +
          (statusCounts.PUBLISHED ?? 0) +
          (statusCounts.ARCHIVED ?? 0),
        publishedArticles: statusCounts.PUBLISHED ?? 0,
        draftArticles: statusCounts.DRAFT ?? 0,
        archivedArticles: statusCounts.ARCHIVED ?? 0,
        totalGroups: groupCount,
        totalRules,
        enabledRules,
        totalLinks: linkCount,
        totalViews: viewSum._sum.viewCount ?? 0,
        recentMatches,
      };
    }),

  /**
   * Submit article feedback
   */
  submitFeedback: protectedProcedure
    .input(ArticleFeedbackInputSchema)
    .use(workspaceMiddleware)
    .mutation(async ({ ctx, input }) => {
      await verifyArticleInWorkspace(input.articleId, ctx.workspace.id);

      return prisma.knowledgeArticle.update({
        where: { id: input.articleId },
        data: {
          helpfulCount: input.helpful ? { increment: 1 } : undefined,
          notHelpfulCount: !input.helpful ? { increment: 1 } : undefined,
        },
      });
    }),

  /**
   * Get all tags used in the workspace
   */
  getTags: protectedProcedure
    .input(z.object({ workspaceSlug: z.string() }))
    .use(workspaceMiddleware)
    .query(async ({ ctx }) => {
      const articles = await prisma.knowledgeArticle.findMany({
        where: { workspaceId: ctx.workspace.id },
        select: { tags: true },
      });

      const tagCounts = new Map<string, number>();
      for (const article of articles) {
        for (const tag of article.tags) {
          tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
        }
      }

      return Array.from(tagCounts.entries())
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count);
    }),
});

export type KnowledgeRouter = typeof knowledgeRouter;
