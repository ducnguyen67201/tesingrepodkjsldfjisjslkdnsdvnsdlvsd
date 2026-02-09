/**
 * GitHub Router
 *
 * tRPC router for workspace-level GitHub repository management.
 * Handles GitHub App installation, repository listing, and indexing controls.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  prisma,
  searchSimilarChunks,
  searchSimilarChunksWithPatterns,
} from "@ducsigr/db";
import {
  createLLMCenter,
  getConfig,
  type LLMCenter,
} from "@ducsigr/shared/llm";
import {
  createRouter,
  protectedProcedure,
  workspaceMiddleware,
} from "../trpc";
import { WORKSPACE_ADMIN_ROLES, type WorkspaceRole } from "../middleware/workspace";
import { getTemporalClient, getTaskQueue } from "../lib/temporal";
import {
  AssignRepoToProjectSchema,
  UnassignRepoFromProjectSchema,
} from "../schemas/github";
import { createAppOctokit } from "../lib/github";

// ============================================
// LLM Center (Lazy Initialization)
// ============================================

let _llmCenter: LLMCenter | null = null;

function getLLMCenter(): LLMCenter {
  if (!_llmCenter) {
    _llmCenter = createLLMCenter(getConfig());
  }
  return _llmCenter;
}

// ============================================
// Input Schemas
// ============================================

const GetInstallationSchema = z.object({
  workspaceSlug: z.string(),
});

const RepoFilterSchema = z.enum(["enabled", "disabled", "all"]);

const ListRepositoriesSchema = z.object({
  workspaceSlug: z.string(),
  filter: RepoFilterSchema.default("all"),
  search: z.string().optional(),
  page: z.number().min(1).default(1),
  pageSize: z.number().min(1).max(100).default(20),
});

const RepositoryActionSchema = z.object({
  workspaceSlug: z.string(),
  repositoryId: z.string(),
});

const SearchCodebaseSchema = z.object({
  workspaceSlug: z.string(),
  repositoryId: z.string(),
  query: z.string().min(1).max(10000),
  topK: z.number().min(1).max(100).default(10),
  minSimilarity: z.number().min(0).max(1).default(0.5),
  filePatterns: z.array(z.string()).optional(),
});

// ============================================
// Router
// ============================================

export const githubRouter = createRouter({
  /**
   * Get GitHub installation status for workspace
   */
  getInstallation: protectedProcedure
    .input(GetInstallationSchema)
    .use(workspaceMiddleware)
    .query(async ({ ctx }) => {
      const installation = await prisma.gitHubInstallation.findUnique({
        where: { workspaceId: ctx.workspace.id },
        select: {
          id: true,
          workspaceId: true,
          installationId: true,
          accountLogin: true,
          accountType: true,
          createdAt: true,
        },
      });

      return installation;
    }),

  /**
   * List all repositories for a workspace
   */
  listRepositories: protectedProcedure
    .input(ListRepositoriesSchema)
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }) => {
      const { filter, search, page, pageSize } = input;

      const installation = await prisma.gitHubInstallation.findUnique({
        where: { workspaceId: ctx.workspace.id },
      });

      if (!installation) {
        return {
          repositories: [],
          counts: { enabled: 0, disabled: 0, all: 0 },
          pagination: { page: 1, pageSize, totalCount: 0, totalPages: 0 },
        };
      }

      // Build where clause
      const where: {
        installationId: string;
        enabled?: boolean;
        fullName?: { contains: string; mode: "insensitive" };
      } = {
        installationId: installation.id,
      };

      if (filter === "enabled") {
        where.enabled = true;
      } else if (filter === "disabled") {
        where.enabled = false;
      }

      if (search) {
        where.fullName = { contains: search, mode: "insensitive" };
      }

      const skip = (page - 1) * pageSize;

      const [repositories, totalCount, enabledCount, disabledCount] =
        await Promise.all([
          prisma.gitHubRepository.findMany({
            where,
            orderBy: [{ enabled: "desc" }, { fullName: "asc" }],
            skip,
            take: pageSize,
            select: {
              id: true,
              fullName: true,
              owner: true,
              repo: true,
              defaultBranch: true,
              isPrivate: true,
              enabled: true,
              indexStatus: true,
              lastIndexedAt: true,
              projectId: true,
              indexBranch: true,
              project: {
                select: { id: true, name: true },
              },
              _count: { select: { chunks: true } },
            },
          }),
          prisma.gitHubRepository.count({ where }),
          prisma.gitHubRepository.count({
            where: { installationId: installation.id, enabled: true },
          }),
          prisma.gitHubRepository.count({
            where: { installationId: installation.id, enabled: false },
          }),
        ]);

      return {
        repositories: repositories.map((r) => ({
          ...r,
          chunkCount: r._count.chunks,
          projectName: r.project?.name ?? null,
        })),
        counts: {
          enabled: enabledCount,
          disabled: disabledCount,
          all: enabledCount + disabledCount,
        },
        pagination: {
          page,
          pageSize,
          totalCount,
          totalPages: Math.ceil(totalCount / pageSize),
        },
      };
    }),

  /**
   * Assign a repository to a project and start indexing
   */
  assignToProject: protectedProcedure
    .input(AssignRepoToProjectSchema)
    .use(workspaceMiddleware)
    .mutation(async ({ ctx, input }) => {
      const { repositoryId, projectId, indexBranch } = input;

      // 1. Admin check
      const role = ctx.workspace.role as WorkspaceRole;
      if (!WORKSPACE_ADMIN_ROLES.includes(role)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only workspace admins can assign repositories",
        });
      }

      // 2. Verify repo belongs to workspace installation
      const repo = await prisma.gitHubRepository.findFirst({
        where: {
          id: repositoryId,
          installation: { workspaceId: ctx.workspace.id },
        },
        select: { id: true, defaultBranch: true },
      });
      if (!repo) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Repository not found" });
      }

      // 3. Verify project belongs to workspace
      const project = await prisma.project.findFirst({
        where: { id: projectId, workspaceId: ctx.workspace.id },
        select: { id: true, name: true },
      });
      if (!project) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      }

      // 4. Assign repo to project (unique constraint on projectId handles conflicts atomically)
      const effectiveBranch = indexBranch || repo.defaultBranch;
      let updatedRepo;
      try {
        updatedRepo = await prisma.gitHubRepository.update({
          where: { id: repositoryId },
          data: {
            projectId,
            indexBranch: indexBranch || null,
            enabled: true,
            indexStatus: "PENDING",
          },
          include: { installation: true },
        });
      } catch (error: unknown) {
        // P2002 = unique constraint violation (another repo already assigned to this project)
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          (error as { code: string }).code === "P2002"
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Project already has a repository assigned",
          });
        }
        throw error;
      }

      // 6. Start indexing workflow
      try {
        const client = await getTemporalClient();
        await client.workflow.start("repositoryIndexWorkflow", {
          taskQueue: getTaskQueue(),
          workflowId: `repo-index-${repositoryId}-${Date.now()}`,
          args: [{
            repositoryId: updatedRepo.id,
            installationId: Number(updatedRepo.installation.installationId),
            owner: updatedRepo.owner,
            repo: updatedRepo.repo,
            branch: effectiveBranch,
            mode: "initial",
          }],
        });
        console.log(`[GitHub] Started indexing workflow for ${updatedRepo.fullName}`);
      } catch (error) {
        console.error("[GitHub] Failed to start indexing workflow:", error);
      }

      return { success: true, projectName: project.name };
    }),

  /**
   * Unassign a repository from its project
   */
  unassignFromProject: protectedProcedure
    .input(UnassignRepoFromProjectSchema)
    .use(workspaceMiddleware)
    .mutation(async ({ ctx, input }) => {
      const { repositoryId } = input;

      const role = ctx.workspace.role as WorkspaceRole;
      if (!WORKSPACE_ADMIN_ROLES.includes(role)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only workspace admins can unassign repositories",
        });
      }

      const repo = await prisma.gitHubRepository.findFirst({
        where: {
          id: repositoryId,
          installation: { workspaceId: ctx.workspace.id },
        },
        select: { id: true },
      });
      if (!repo) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Repository not found" });
      }

      await prisma.$transaction([
        prisma.gitHubRepository.update({
          where: { id: repositoryId },
          data: {
            projectId: null,
            indexBranch: null,
            enabled: false,
            indexStatus: "PENDING",
          },
        }),
        prisma.codeChunk.deleteMany({
          where: { repoId: repositoryId },
        }),
      ]);

      return { success: true };
    }),

  /**
   * List projects available for assignment
   */
  listProjectsForAssignment: protectedProcedure
    .input(z.object({ workspaceSlug: z.string() }))
    .use(workspaceMiddleware)
    .query(async ({ ctx }) => {
      const projects = await prisma.project.findMany({
        where: { workspaceId: ctx.workspace.id },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          githubRepo: {
            select: { id: true, fullName: true },
          },
        },
      });

      return projects.map((p) => ({
        id: p.id,
        name: p.name,
        hasRepo: !!p.githubRepo,
        repoName: p.githubRepo?.fullName ?? null,
      }));
    }),

  /**
   * List branches for a repository from GitHub API
   */
  listBranches: protectedProcedure
    .input(z.object({
      workspaceSlug: z.string(),
      repositoryId: z.string(),
    }))
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }) => {
      const { repositoryId } = input;

      // Find repo with installation details
      const repo = await prisma.gitHubRepository.findFirst({
        where: {
          id: repositoryId,
          installation: { workspaceId: ctx.workspace.id },
        },
        select: {
          owner: true,
          repo: true,
          defaultBranch: true,
          installation: {
            select: { installationId: true },
          },
        },
      });

      if (!repo) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Repository not found" });
      }

      // Get GitHub App credentials from environment
      const appId = process.env.GITHUB_APP_ID;
      const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;

      if (!appId || !privateKey) {
        console.warn("[GitHub] GitHub App credentials not configured, returning default branch only");
        return [{ name: repo.defaultBranch, isDefault: true }];
      }

      try {
        const octokit = createAppOctokit(
          Number(repo.installation.installationId),
          appId,
          privateKey
        );

        // Fetch branches (paginated, up to 100)
        const { data: branches } = await octokit.repos.listBranches({
          owner: repo.owner,
          repo: repo.repo,
          per_page: 100,
        });

        return branches.map((b) => ({
          name: b.name,
          isDefault: b.name === repo.defaultBranch,
        }));
      } catch (error) {
        console.error("[GitHub] Failed to fetch branches:", error);
        // Fallback to just default branch on API failure
        return [{ name: repo.defaultBranch, isDefault: true }];
      }
    }),

  /**
   * Disable indexing for a repository
   */
  disableRepository: protectedProcedure
    .input(RepositoryActionSchema)
    .use(workspaceMiddleware)
    .mutation(async ({ ctx, input }) => {
      const { repositoryId } = input;

      // Only admins can disable repositories
      const role = ctx.workspace.role as WorkspaceRole;
      if (!WORKSPACE_ADMIN_ROLES.includes(role)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only workspace admins can disable repositories",
        });
      }

      // Verify repository belongs to workspace's installation
      const repo = await prisma.gitHubRepository.findFirst({
        where: {
          id: repositoryId,
          installation: {
            workspaceId: ctx.workspace.id,
          },
        },
      });

      if (!repo) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Repository not found" });
      }

      // Disable repository, clear assignment, and delete chunks
      await prisma.$transaction([
        prisma.gitHubRepository.update({
          where: { id: repositoryId },
          data: {
            enabled: false,
            projectId: null,
            indexBranch: null,
          },
        }),
        // Delete all chunks to free space
        prisma.codeChunk.deleteMany({
          where: { repoId: repositoryId },
        }),
      ]);

      return { success: true };
    }),

  /**
   * Trigger re-index for a repository
   */
  reindexRepository: protectedProcedure
    .input(RepositoryActionSchema)
    .use(workspaceMiddleware)
    .mutation(async ({ ctx, input }) => {
      const { repositoryId } = input;

      // Verify repository belongs to workspace's installation and is enabled
      const repo = await prisma.gitHubRepository.findFirst({
        where: {
          id: repositoryId,
          enabled: true,
          installation: {
            workspaceId: ctx.workspace.id,
          },
        },
      });

      if (!repo) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Repository not found or not enabled",
        });
      }

      // Set status to PENDING (workflow will change to INDEXING)
      const updatedRepo = await prisma.gitHubRepository.update({
        where: { id: repositoryId },
        data: { indexStatus: "PENDING" },
        include: {
          installation: true,
        },
      });

      // Trigger re-index workflow via Temporal
      try {
        const client = await getTemporalClient();
        await client.workflow.start("repositoryIndexWorkflow", {
          taskQueue: getTaskQueue(),
          workflowId: `repo-reindex-${repositoryId}-${Date.now()}`,
          args: [{
            repositoryId: updatedRepo.id,
            installationId: Number(updatedRepo.installation.installationId),
            owner: updatedRepo.owner,
            repo: updatedRepo.repo,
            branch: updatedRepo.indexBranch ?? updatedRepo.defaultBranch,
            mode: "reindex",
          }],
        });
        console.log(`[GitHub] Started reindex workflow for ${updatedRepo.fullName}`);
      } catch (error) {
        // Log but don't fail the mutation - user can retry
        console.error("[GitHub] Failed to start reindex workflow:", error);
      }

      return { success: true };
    }),

  /**
   * Get repository details with stats
   */
  getRepository: protectedProcedure
    .input(RepositoryActionSchema)
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }) => {
      const { repositoryId } = input;

      const repo = await prisma.gitHubRepository.findFirst({
        where: {
          id: repositoryId,
          installation: {
            workspaceId: ctx.workspace.id,
          },
        },
        include: {
          _count: {
            select: {
              chunks: true,
              commits: true,
              prs: true,
            },
          },
        },
      });

      if (!repo) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Repository not found" });
      }

      return {
        ...repo,
        stats: {
          chunks: repo._count.chunks,
          commits: repo._count.commits,
          prs: repo._count.prs,
        },
      };
    }),

  /**
   * Get comprehensive repository statistics
   */
  getRepositoryStats: protectedProcedure
    .input(RepositoryActionSchema)
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }) => {
      const { repositoryId } = input;

      // Verify repository belongs to workspace
      const repo = await prisma.gitHubRepository.findFirst({
        where: {
          id: repositoryId,
          installation: {
            workspaceId: ctx.workspace.id,
          },
        },
        select: {
          id: true,
          fullName: true,
          owner: true,
          repo: true,
          defaultBranch: true,
          isPrivate: true,
          enabled: true,
          indexStatus: true,
          lastIndexedAt: true,
        },
      });

      if (!repo) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Repository not found" });
      }

      // Get aggregate stats from chunks
      const [
        totalChunks,
        languageStats,
        chunkTypeStats,
        fileStats,
        topFiles,
      ] = await Promise.all([
        // Total chunk count
        prisma.codeChunk.count({
          where: { repoId: repositoryId },
        }),

        // Group by language
        prisma.codeChunk.groupBy({
          by: ["language"],
          where: { repoId: repositoryId },
          _count: true,
          _sum: { endLine: true, startLine: true },
        }),

        // Group by chunk type
        prisma.codeChunk.groupBy({
          by: ["chunkType"],
          where: { repoId: repositoryId },
          _count: true,
        }),

        // Unique files count
        prisma.codeChunk.findMany({
          where: { repoId: repositoryId },
          distinct: ["filePath"],
          select: { filePath: true },
        }),

        // Top 15 files by chunk count
        prisma.$queryRaw<{ filePath: string; language: string | null; chunkCount: bigint; totalLines: bigint }[]>`
          SELECT
            "filePath",
            "language",
            COUNT(*)::bigint as "chunkCount",
            SUM("endLine" - "startLine" + 1)::bigint as "totalLines"
          FROM "code_chunks"
          WHERE "repoId" = ${repositoryId}
          GROUP BY "filePath", "language"
          ORDER BY "chunkCount" DESC
          LIMIT 15
        `,
      ]);

      // Sort language stats by count descending
      const sortedLanguageStats = [...languageStats].sort(
        (a, b) => (b._count ?? 0) - (a._count ?? 0)
      );

      // Sort chunk type stats by count descending
      const sortedChunkTypeStats = [...chunkTypeStats].sort(
        (a, b) => (b._count ?? 0) - (a._count ?? 0)
      );

      // Calculate total lines indexed
      const totalLines = sortedLanguageStats.reduce((sum, stat) => {
        const endLineSum = stat._sum?.endLine ?? 0;
        const startLineSum = stat._sum?.startLine ?? 0;
        const count = stat._count ?? 0;
        const lines = endLineSum - startLineSum + count;
        return sum + lines;
      }, 0);

      return {
        repository: repo,
        overview: {
          totalFiles: fileStats.length,
          totalChunks,
          totalLines,
          lastIndexedAt: repo.lastIndexedAt,
        },
        languageBreakdown: sortedLanguageStats.map((stat) => {
          const count = stat._count ?? 0;
          return {
            language: stat.language ?? "Unknown",
            count,
            percentage: totalChunks > 0 ? Math.round((count / totalChunks) * 100) : 0,
          };
        }),
        chunkTypeBreakdown: sortedChunkTypeStats.map((stat) => ({
          type: stat.chunkType,
          count: stat._count ?? 0,
        })),
        topFiles: topFiles.map((file) => ({
          filePath: file.filePath,
          language: file.language ?? "Unknown",
          chunkCount: Number(file.chunkCount),
          totalLines: Number(file.totalLines),
        })),
      };
    }),

  /**
   * Search codebase using vector similarity
   *
   * Performs semantic search on indexed code chunks.
   * Uses LLM Center for embedding generation.
   */
  searchCodebase: protectedProcedure
    .input(SearchCodebaseSchema)
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }) => {
      const { repositoryId, query, topK, minSimilarity, filePatterns } = input;
      const startTime = Date.now();

      // Verify repository belongs to workspace
      const repo = await prisma.gitHubRepository.findFirst({
        where: {
          id: repositoryId,
          installation: {
            workspaceId: ctx.workspace.id,
          },
        },
        select: { id: true, indexStatus: true },
      });

      if (!repo) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Repository not found",
        });
      }

      if (repo.indexStatus !== "READY") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Repository is not indexed. Status: ${repo.indexStatus}`,
        });
      }

      // Truncate query if too long (~8K tokens max)
      const queryText = query.slice(0, 24000);

      // Generate query embedding using LLM Center
      const llm = getLLMCenter();
      const embedResult = await llm.embed([queryText]);

      const queryEmbedding = embedResult.embeddings[0];
      if (!queryEmbedding) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to generate query embedding",
        });
      }

      const queryTokens = embedResult.usage.totalTokens;

      // Perform vector search
      let results;
      if (filePatterns && filePatterns.length > 0) {
        results = await searchSimilarChunksWithPatterns(
          repositoryId,
          queryEmbedding,
          filePatterns,
          topK,
          minSimilarity
        );
      } else {
        results = await searchSimilarChunks(
          repositoryId,
          queryEmbedding,
          topK,
          minSimilarity
        );
      }

      return {
        results: results.map((r) => ({
          chunkId: r.id,
          filePath: r.filePath,
          startLine: r.startLine,
          endLine: r.endLine,
          content: r.content,
          language: r.language,
          chunkType: r.chunkType,
          similarity: r.similarity,
        })),
        queryTokens,
        searchLatencyMs: Date.now() - startTime,
      };
    }),
});

export type GitHubRouter = typeof githubRouter;
