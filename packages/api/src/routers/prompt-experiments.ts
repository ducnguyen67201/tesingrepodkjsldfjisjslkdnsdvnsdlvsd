/**
 * Prompt Experiments Router
 *
 * tRPC router for A/B testing of prompts.
 * Handles experiment lifecycle, variant management, and analytics.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import crypto from "crypto";
import { prisma, Prisma } from "@cognobserve/db";
import { createRouter, protectedProcedure, workspaceMiddleware } from "../trpc";
import { getTemporalClient, getTaskQueue } from "../lib/temporal";
import {
  CreateExperimentInputSchema,
  UpdateExperimentInputSchema,
  UpdateVariantWeightsInputSchema,
  ListExperimentsInputSchema,
  GetExperimentInputSchema,
  GetExperimentBySlugInputSchema,
  StartExperimentInputSchema,
  PauseExperimentInputSchema,
  StopExperimentInputSchema,
  ArchiveExperimentInputSchema,
  ExperimentAnalyticsInputSchema,
  ComparePromptsInputSchema,
  EXPERIMENT_STATUS_LABELS,
  EXPERIMENT_STATUS_COLORS,
  ASSIGNMENT_KEY_LABELS,
  VALID_STATUS_TRANSITIONS,
  TOTAL_BASIS_POINTS,
  type ExperimentStatus,
  type ExperimentMetricsConfig,
  type VariantName,
} from "../schemas/prompt-experiments";
import {
  type PromptTemplate,
  type PromptVariable,
  type PromptConfig,
} from "../schemas/prompts";

// ============================================================
// Helper Functions
// ============================================================

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
 * Verify experiment exists and belongs to workspace
 */
async function verifyExperimentInWorkspace(
  experimentId: string,
  workspaceId: string
): Promise<{
  id: string;
  projectId: string;
  status: ExperimentStatus;
  slug: string;
  name: string;
}> {
  const experiment = await prisma.promptExperiment.findUnique({
    where: { id: experimentId },
    include: { project: { select: { workspaceId: true } } },
  });

  if (!experiment) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Experiment not found" });
  }

  if (experiment.project.workspaceId !== workspaceId) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }

  return {
    id: experiment.id,
    projectId: experiment.projectId,
    status: experiment.status as ExperimentStatus,
    slug: experiment.slug,
    name: experiment.name,
  };
}

/**
 * Verify prompt version exists and belongs to workspace
 */
async function verifyPromptVersionInWorkspace(
  versionId: string,
  workspaceId: string
): Promise<{ id: string; promptId: string; version: number }> {
  const version = await prisma.promptVersion.findUnique({
    where: { id: versionId },
    include: {
      prompt: {
        include: { project: { select: { workspaceId: true } } },
      },
    },
  });

  if (!version) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Prompt version not found" });
  }

  if (version.prompt.project.workspaceId !== workspaceId) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }

  return { id: version.id, promptId: version.promptId, version: version.version };
}

/**
 * Validate status transition
 */
function validateStatusTransition(current: ExperimentStatus, target: ExperimentStatus): void {
  const allowed = VALID_STATUS_TRANSITIONS[current];
  if (!allowed.includes(target)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Cannot transition from "${current}" to "${target}"`,
    });
  }
}

// ============================================================
// Prompt Experiments Router
// ============================================================

export const promptExperimentsRouter = createRouter({
  /**
   * List experiments for a project
   */
  list: protectedProcedure
    .input(ListExperimentsInputSchema)
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }) => {
      await verifyProjectInWorkspace(input.projectId, ctx.workspace.id);

      const experiments = await prisma.promptExperiment.findMany({
        where: {
          projectId: input.projectId,
          ...(input.status && { status: input.status }),
          ...(input.query && {
            OR: [
              { name: { contains: input.query, mode: "insensitive" } },
              { slug: { contains: input.query, mode: "insensitive" } },
              { description: { contains: input.query, mode: "insensitive" } },
            ],
          }),
          ...(input.tags?.length && { tags: { hasSome: input.tags } }),
        },
        include: {
          variants: {
            include: {
              promptVersion: {
                include: {
                  prompt: { select: { name: true, slug: true } },
                },
              },
            },
          },
        },
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        orderBy: { createdAt: "desc" },
      });

      let nextCursor: string | undefined;
      if (experiments.length > input.limit) {
        const next = experiments.pop();
        nextCursor = next?.id;
      }

      return {
        items: experiments.map((exp) => ({
          id: exp.id,
          name: exp.name,
          slug: exp.slug,
          description: exp.description,
          status: exp.status as ExperimentStatus,
          allocationPct: exp.allocationPct,
          assignmentKey: exp.assignmentKey,
          tags: exp.tags,
          startedAt: exp.startedAt,
          endedAt: exp.endedAt,
          variantCount: exp.variants.length,
          variants: exp.variants.map((v) => ({
            id: v.id,
            name: v.name as VariantName,
            weight: v.weight,
            isControl: v.isControl,
            promptName: v.promptVersion.prompt.name,
            promptSlug: v.promptVersion.prompt.slug,
            version: v.promptVersion.version,
          })),
          // Analysis fields for card display
          analysisStatus: exp.analysisStatus as "pending" | "running" | "completed" | "failed" | null,
          analysisError: exp.analysisError,
          winnerVariantId: exp.winnerVariantId,
          winnerConfidence: exp.winnerConfidence,
          createdAt: exp.createdAt,
          updatedAt: exp.updatedAt,
        })),
        nextCursor,
      };
    }),

  /**
   * Get single experiment with full details
   */
  get: protectedProcedure
    .input(GetExperimentInputSchema)
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }) => {
      const experiment = await prisma.promptExperiment.findUnique({
        where: { id: input.experimentId },
        include: {
          project: { select: { workspaceId: true, name: true } },
          variants: {
            include: {
              promptVersion: {
                include: {
                  prompt: { select: { id: true, name: true, slug: true } },
                },
              },
            },
          },
        },
      });

      if (!experiment) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Experiment not found" });
      }

      if (experiment.project.workspaceId !== ctx.workspace.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      return {
        id: experiment.id,
        projectId: experiment.projectId,
        projectName: experiment.project.name,
        name: experiment.name,
        slug: experiment.slug,
        description: experiment.description,
        status: experiment.status as ExperimentStatus,
        allocationPct: experiment.allocationPct,
        assignmentSeed: experiment.assignmentSeed,
        assignmentKey: experiment.assignmentKey,
        startedAt: experiment.startedAt,
        endedAt: experiment.endedAt,
        metrics: experiment.metrics as ExperimentMetricsConfig | null,
        tags: experiment.tags,
        createdById: experiment.createdById,
        createdAt: experiment.createdAt,
        updatedAt: experiment.updatedAt,
        // Analysis fields
        analysisStatus: experiment.analysisStatus as "pending" | "running" | "completed" | "failed" | null,
        analysisStartedAt: experiment.analysisStartedAt,
        analysisCompletedAt: experiment.analysisCompletedAt,
        analysisResult: experiment.analysisResult as Record<string, unknown> | null,
        analysisError: experiment.analysisError,
        winnerVariantId: experiment.winnerVariantId,
        winnerConfidence: experiment.winnerConfidence,
        variants: experiment.variants.map((v) => ({
          id: v.id,
          name: v.name as VariantName,
          weight: v.weight,
          isControl: v.isControl,
          promptVersionId: v.promptVersionId,
          promptVersion: {
            id: v.promptVersion.id,
            version: v.promptVersion.version,
            type: v.promptVersion.type,
            promptId: v.promptVersion.prompt.id,
            prompt: {
              id: v.promptVersion.prompt.id,
              name: v.promptVersion.prompt.name,
              slug: v.promptVersion.prompt.slug,
            },
          },
          createdAt: v.createdAt,
        })),
      };
    }),

  /**
   * Get experiment by slug
   */
  getBySlug: protectedProcedure
    .input(GetExperimentBySlugInputSchema)
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }) => {
      await verifyProjectInWorkspace(input.projectId, ctx.workspace.id);

      const experiment = await prisma.promptExperiment.findUnique({
        where: {
          projectId_slug: {
            projectId: input.projectId,
            slug: input.slug,
          },
        },
        include: {
          variants: {
            include: {
              promptVersion: {
                include: {
                  prompt: { select: { id: true, name: true, slug: true } },
                },
              },
            },
          },
        },
      });

      if (!experiment) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Experiment not found" });
      }

      return {
        id: experiment.id,
        name: experiment.name,
        slug: experiment.slug,
        description: experiment.description,
        status: experiment.status as ExperimentStatus,
        allocationPct: experiment.allocationPct,
        assignmentKey: experiment.assignmentKey,
        variants: experiment.variants.map((v) => ({
          id: v.id,
          name: v.name as VariantName,
          weight: v.weight,
          isControl: v.isControl,
          promptVersionId: v.promptVersionId,
          promptVersion: {
            id: v.promptVersion.id,
            version: v.promptVersion.version,
            promptName: v.promptVersion.prompt.name,
            promptSlug: v.promptVersion.prompt.slug,
          },
        })),
      };
    }),

  /**
   * Create new experiment
   */
  create: protectedProcedure
    .input(CreateExperimentInputSchema)
    .use(workspaceMiddleware)
    .mutation(async ({ ctx, input }) => {
      await verifyProjectInWorkspace(input.projectId, ctx.workspace.id);

      // Check slug uniqueness
      const existing = await prisma.promptExperiment.findUnique({
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
          message: `Experiment with slug "${input.slug}" already exists`,
        });
      }

      // Verify all prompt versions exist and belong to workspace
      for (const variant of input.variants) {
        await verifyPromptVersionInWorkspace(variant.promptVersionId, ctx.workspace.id);
      }

      // Create experiment with variants
      const experiment = await prisma.$transaction(async (tx) => {
        const newExperiment = await tx.promptExperiment.create({
          data: {
            projectId: input.projectId,
            name: input.name,
            slug: input.slug,
            description: input.description,
            allocationPct: input.allocationPct,
            assignmentKey: input.assignmentKey,
            tags: input.tags,
            metrics: input.metrics as object | undefined,
            createdById: ctx.session.user.id,
          },
        });

        // Create variants
        for (const variant of input.variants) {
          await tx.promptExperimentVariant.create({
            data: {
              experimentId: newExperiment.id,
              name: variant.name,
              weight: variant.weight,
              promptVersionId: variant.promptVersionId,
              isControl: variant.isControl,
            },
          });
        }

        return newExperiment;
      });

      console.info("Experiment created", {
        experimentId: experiment.id,
        slug: input.slug,
        projectId: input.projectId,
        userId: ctx.session.user.id,
      });

      return { id: experiment.id, slug: experiment.slug };
    }),

  /**
   * Update experiment (metadata only - not variants when running)
   */
  update: protectedProcedure
    .input(UpdateExperimentInputSchema)
    .use(workspaceMiddleware)
    .mutation(async ({ ctx, input }) => {
      const experiment = await verifyExperimentInWorkspace(input.experimentId, ctx.workspace.id);

      // Only allow metadata updates when running
      if (experiment.status === "running" && input.allocationPct !== undefined) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot change allocation while experiment is running",
        });
      }

      const updated = await prisma.promptExperiment.update({
        where: { id: input.experimentId },
        data: {
          name: input.name,
          description: input.description,
          allocationPct: input.allocationPct,
          tags: input.tags,
          metrics: input.metrics as object | undefined,
        },
      });

      return { id: updated.id, name: updated.name };
    }),

  /**
   * Update variant weights
   */
  updateWeights: protectedProcedure
    .input(UpdateVariantWeightsInputSchema)
    .use(workspaceMiddleware)
    .mutation(async ({ ctx, input }) => {
      // Verify experiment exists in workspace
      await verifyExperimentInWorkspace(input.experimentId, ctx.workspace.id);

      // Updating weights resets assignment seed to avoid mixed cohorts
      const newSeed = crypto.randomUUID();

      await prisma.$transaction(async (tx) => {
        // Update seed
        await tx.promptExperiment.update({
          where: { id: input.experimentId },
          data: { assignmentSeed: newSeed },
        });

        // Update each variant weight
        for (const variant of input.variants) {
          await tx.promptExperimentVariant.update({
            where: { id: variant.variantId },
            data: { weight: variant.weight },
          });
        }
      });

      console.info("Experiment weights updated", {
        experimentId: input.experimentId,
        newSeed,
        userId: ctx.session.user.id,
      });

      return { success: true };
    }),

  /**
   * Start experiment and trigger analysis workflow
   */
  start: protectedProcedure
    .input(StartExperimentInputSchema)
    .use(workspaceMiddleware)
    .mutation(async ({ ctx, input }) => {
      const experiment = await verifyExperimentInWorkspace(input.experimentId, ctx.workspace.id);

      validateStatusTransition(experiment.status, "running");

      const updated = await prisma.promptExperiment.update({
        where: { id: input.experimentId },
        data: {
          status: "running",
          startedAt: experiment.status === "draft" ? new Date() : undefined,
          // Reset analysis status when starting
          analysisStatus: "pending",
          analysisResult: Prisma.JsonNull,
          analysisError: null,
          winnerVariantId: null,
          winnerConfidence: null,
        },
      });

      // Trigger analysis workflow
      const timestamp = Date.now();
      const workflowId = `experiment-analysis-${input.experimentId}-${timestamp}`;

      try {
        const client = await getTemporalClient();
        await client.workflow.start("experimentAnalysisWorkflow", {
          taskQueue: getTaskQueue(),
          workflowId,
          args: [
            {
              experimentId: input.experimentId,
              projectId: experiment.projectId,
            },
          ],
        });

        console.info("Experiment started and analysis workflow triggered", {
          experimentId: input.experimentId,
          workflowId,
          userId: ctx.session.user.id,
        });
      } catch (error) {
        // Log error but don't fail the experiment start
        console.error("Failed to start analysis workflow", {
          experimentId: input.experimentId,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }

      return { id: updated.id, status: updated.status };
    }),

  /**
   * Pause experiment
   */
  pause: protectedProcedure
    .input(PauseExperimentInputSchema)
    .use(workspaceMiddleware)
    .mutation(async ({ ctx, input }) => {
      const experiment = await verifyExperimentInWorkspace(input.experimentId, ctx.workspace.id);

      validateStatusTransition(experiment.status, "paused");

      const updated = await prisma.promptExperiment.update({
        where: { id: input.experimentId },
        data: { status: "paused" },
      });

      console.info("Experiment paused", {
        experimentId: input.experimentId,
        userId: ctx.session.user.id,
      });

      return { id: updated.id, status: updated.status };
    }),

  /**
   * Stop experiment (complete)
   */
  stop: protectedProcedure
    .input(StopExperimentInputSchema)
    .use(workspaceMiddleware)
    .mutation(async ({ ctx, input }) => {
      const experiment = await verifyExperimentInWorkspace(input.experimentId, ctx.workspace.id);

      validateStatusTransition(experiment.status, "completed");

      const updated = await prisma.promptExperiment.update({
        where: { id: input.experimentId },
        data: {
          status: "completed",
          endedAt: new Date(),
        },
      });

      // If winner specified, optionally promote to production label
      // This is a future enhancement - for now just log
      if (input.winnerId) {
        console.info("Experiment completed with winner", {
          experimentId: input.experimentId,
          winnerId: input.winnerId,
          userId: ctx.session.user.id,
        });
      } else {
        console.info("Experiment completed", {
          experimentId: input.experimentId,
          userId: ctx.session.user.id,
        });
      }

      return { id: updated.id, status: updated.status };
    }),

  /**
   * Archive experiment
   */
  archive: protectedProcedure
    .input(ArchiveExperimentInputSchema)
    .use(workspaceMiddleware)
    .mutation(async ({ ctx, input }) => {
      const experiment = await verifyExperimentInWorkspace(input.experimentId, ctx.workspace.id);

      validateStatusTransition(experiment.status, "archived");

      const updated = await prisma.promptExperiment.update({
        where: { id: input.experimentId },
        data: { status: "archived" },
      });

      console.info("Experiment archived", {
        experimentId: input.experimentId,
        userId: ctx.session.user.id,
      });

      return { id: updated.id, status: updated.status };
    }),

  /**
   * Delete experiment (only if draft or archived)
   */
  delete: protectedProcedure
    .input(GetExperimentInputSchema)
    .use(workspaceMiddleware)
    .mutation(async ({ ctx, input }) => {
      const experiment = await verifyExperimentInWorkspace(input.experimentId, ctx.workspace.id);

      if (!["draft", "archived"].includes(experiment.status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Can only delete draft or archived experiments",
        });
      }

      await prisma.promptExperiment.delete({ where: { id: input.experimentId } });

      console.info("Experiment deleted", {
        experimentId: input.experimentId,
        userId: ctx.session.user.id,
      });

      return { success: true };
    }),

  /**
   * Get experiment analytics
   */
  analytics: protectedProcedure
    .input(ExperimentAnalyticsInputSchema)
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }) => {
      const experiment = await prisma.promptExperiment.findUnique({
        where: { id: input.experimentId },
        include: {
          project: { select: { workspaceId: true } },
          variants: true,
        },
      });

      if (!experiment) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Experiment not found" });
      }

      if (experiment.project.workspaceId !== ctx.workspace.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      // Calculate date range
      const end = input.dateRange?.end ?? new Date();
      const start =
        input.dateRange?.start ?? new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days ago

      // Query spans with experiment metadata
      const spans = await prisma.span.findMany({
        where: {
          promptExperimentId: input.experimentId,
          startTime: { gte: start, lte: end },
        },
        select: {
          promptVariantId: true,
          promptVariantName: true,
          durationMs: true,
          totalCost: true,
          statusCode: true,
        },
      });

      // Aggregate by variant
      const variantStats = new Map<
        string,
        {
          count: number;
          latencies: number[];
          costs: number[];
          errors: number;
        }
      >();

      for (const variant of experiment.variants) {
        variantStats.set(variant.id, {
          count: 0,
          latencies: [],
          costs: [],
          errors: 0,
        });
      }

      for (const span of spans) {
        if (!span.promptVariantId) continue;
        const stats = variantStats.get(span.promptVariantId);
        if (!stats) continue;

        stats.count++;
        if (span.durationMs != null) stats.latencies.push(span.durationMs);
        if (span.totalCost != null) stats.costs.push(Number(span.totalCost));
        if (span.statusCode === "ERROR") stats.errors++;
      }

      const byVariant = experiment.variants.map((v) => {
        const stats = variantStats.get(v.id) ?? { count: 0, latencies: [], costs: [], errors: 0 };
        const avgLatency =
          stats.latencies.length > 0
            ? stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length
            : null;
        const p95Latency =
          stats.latencies.length > 0
            ? stats.latencies.sort((a, b) => a - b)[Math.floor(stats.latencies.length * 0.95)]
            : null;
        const avgCost =
          stats.costs.length > 0
            ? stats.costs.reduce((a, b) => a + b, 0) / stats.costs.length
            : null;
        const totalCost =
          stats.costs.length > 0 ? stats.costs.reduce((a, b) => a + b, 0) : null;
        const errorRate = stats.count > 0 ? stats.errors / stats.count : null;

        return {
          variantId: v.id,
          variantName: v.name as VariantName,
          isControl: v.isControl,
          usageCount: stats.count,
          avgLatencyMs: avgLatency,
          p95LatencyMs: p95Latency ?? null,
          avgCost,
          totalCost,
          errorRate,
          errorCount: stats.errors,
        };
      });

      // Calculate delta between control and treatment
      const control = byVariant.find((v) => v.isControl);
      const treatment = byVariant.find((v) => !v.isControl);

      const delta =
        control && treatment
          ? {
              latencyMs:
                control.avgLatencyMs != null && treatment.avgLatencyMs != null
                  ? treatment.avgLatencyMs - control.avgLatencyMs
                  : null,
              cost:
                control.avgCost != null && treatment.avgCost != null
                  ? treatment.avgCost - control.avgCost
                  : null,
              errorRate:
                control.errorRate != null && treatment.errorRate != null
                  ? treatment.errorRate - control.errorRate
                  : null,
            }
          : null;

      return {
        experimentId: input.experimentId,
        totalUsage: spans.length,
        dateRange: { start, end },
        byVariant,
        delta,
      };
    }),

  /**
   * Compare two prompt versions
   */
  compare: protectedProcedure
    .input(ComparePromptsInputSchema)
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }) => {
      // Verify both versions
      await verifyPromptVersionInWorkspace(input.versionIdA, ctx.workspace.id);
      await verifyPromptVersionInWorkspace(input.versionIdB, ctx.workspace.id);

      const [versionA, versionB] = await Promise.all([
        prisma.promptVersion.findUnique({
          where: { id: input.versionIdA },
          include: { prompt: { select: { id: true, name: true, slug: true } } },
        }),
        prisma.promptVersion.findUnique({
          where: { id: input.versionIdB },
          include: { prompt: { select: { id: true, name: true, slug: true } } },
        }),
      ]);

      if (!versionA || !versionB) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Version not found" });
      }

      const contentA = JSON.stringify(versionA.content);
      const contentB = JSON.stringify(versionB.content);
      const configA = JSON.stringify(versionA.config);
      const configB = JSON.stringify(versionB.config);
      const varsA = JSON.stringify(versionA.variables);
      const varsB = JSON.stringify(versionB.variables);

      return {
        versionA: {
          id: versionA.id,
          version: versionA.version,
          promptId: versionA.promptId,
          promptName: versionA.prompt.name,
          promptSlug: versionA.prompt.slug,
          type: versionA.type,
          content: versionA.content as PromptTemplate,
          variables: versionA.variables as PromptVariable[] | null,
          config: versionA.config as PromptConfig | null,
          createdAt: versionA.createdAt,
        },
        versionB: {
          id: versionB.id,
          version: versionB.version,
          promptId: versionB.promptId,
          promptName: versionB.prompt.name,
          promptSlug: versionB.prompt.slug,
          type: versionB.type,
          content: versionB.content as PromptTemplate,
          variables: versionB.variables as PromptVariable[] | null,
          config: versionB.config as PromptConfig | null,
          createdAt: versionB.createdAt,
        },
        contentDiffers: contentA !== contentB,
        configDiffers: configA !== configB,
        variablesDiffer: varsA !== varsB,
      };
    }),

  /**
   * Get presets for UI
   */
  getPresets: protectedProcedure.query(() => {
    return {
      statusLabels: EXPERIMENT_STATUS_LABELS,
      statusColors: EXPERIMENT_STATUS_COLORS,
      assignmentKeyLabels: ASSIGNMENT_KEY_LABELS,
      totalBasisPoints: TOTAL_BASIS_POINTS,
    };
  }),

  /**
   * Get unique tags for experiments in a project
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

      const experiments = await prisma.promptExperiment.findMany({
        where: {
          projectId: input.projectId,
          status: { not: "archived" },
        },
        select: { tags: true },
      });

      const allTags = new Set<string>();
      for (const exp of experiments) {
        for (const tag of exp.tags) {
          allTags.add(tag);
        }
      }

      return Array.from(allTags).sort();
    }),
});

export type PromptExperimentsRouter = typeof promptExperimentsRouter;
