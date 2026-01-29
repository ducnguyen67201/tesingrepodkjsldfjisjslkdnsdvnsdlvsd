/**
 * Evals Router
 *
 * tRPC router for eval pipeline management.
 * Handles eval suites and runs for proactive regression detection.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { prisma } from "@ducsigr/db";
import { createRouter, protectedProcedure, workspaceMiddleware } from "../trpc";
import {
  EvalPromptSchema,
  ExpectedBehaviorSchema,
  EVAL_STATUS_LABELS,
  EVAL_TRIGGER_LABELS,
  type EvalPrompt,
  type ExpectedBehavior,
} from "../schemas/eval";
import { getTemporalClient, getTaskQueue, WorkflowNotFoundError } from "../lib/temporal";

// ============================================================
// Input Schemas
// ============================================================

const ListSuitesSchema = z.object({
  workspaceSlug: z.string(),
  projectId: z.string(),
});

const GetSuiteSchema = z.object({
  workspaceSlug: z.string(),
  suiteId: z.string(),
});

const CreateSuiteSchema = z.object({
  workspaceSlug: z.string(),
  projectId: z.string(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  endpoint: z.string().url("Must be a valid URL"),
  enabled: z.boolean().default(true),
  prompts: z.array(EvalPromptSchema).min(1, "At least one prompt is required"),
  expectedBehaviors: z.array(ExpectedBehaviorSchema).default([]),
  latencyRegressionThreshold: z.number().min(1).default(1.2),
  errorRegressionThreshold: z.number().min(1).default(2.0),
});

const UpdateSuiteSchema = z.object({
  workspaceSlug: z.string(),
  suiteId: z.string(),
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  endpoint: z.string().url("Must be a valid URL").optional(),
  enabled: z.boolean().optional(),
  prompts: z.array(EvalPromptSchema).min(1).optional(),
  expectedBehaviors: z.array(ExpectedBehaviorSchema).optional(),
  latencyRegressionThreshold: z.number().min(1).optional(),
  errorRegressionThreshold: z.number().min(1).optional(),
});

const ListRunsSchema = z.object({
  workspaceSlug: z.string(),
  suiteId: z.string(),
  limit: z.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

const GetRunSchema = z.object({
  workspaceSlug: z.string(),
  runId: z.string(),
});

const TriggerRunSchema = z.object({
  workspaceSlug: z.string(),
  suiteId: z.string(),
});

const UpdateBaselineSchema = z.object({
  workspaceSlug: z.string(),
  runId: z.string(),
});

// ============================================================
// Evals Router
// ============================================================

export const evalsRouter = createRouter({
  /**
   * List eval suites for a project
   */
  listSuites: protectedProcedure
    .input(ListSuitesSchema)
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }) => {
      // Verify project belongs to workspace
      const project = await prisma.project.findFirst({
        where: { id: input.projectId, workspaceId: ctx.workspace.id },
        select: { id: true },
      });

      if (!project) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      }

      const suites = await prisma.evalSuite.findMany({
        where: { projectId: input.projectId },
        include: {
          _count: { select: { runs: true } },
          runs: {
            take: 1,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              status: true,
              isRegression: true,
              createdAt: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      return suites.map((suite) => ({
        id: suite.id,
        name: suite.name,
        description: suite.description,
        enabled: suite.enabled,
        endpoint: suite.endpoint,
        promptCount: (suite.prompts as EvalPrompt[]).length,
        runCount: suite._count.runs,
        lastRun: suite.runs[0] ?? null,
        latencyRegressionThreshold: suite.latencyRegressionThreshold,
        errorRegressionThreshold: suite.errorRegressionThreshold,
        hasBaseline: suite.baselineLatencyP95 !== null || suite.baselineErrorRate !== null,
        createdAt: suite.createdAt,
        updatedAt: suite.updatedAt,
      }));
    }),

  /**
   * Get single eval suite with full details
   */
  getSuite: protectedProcedure
    .input(GetSuiteSchema)
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }) => {
      const suite = await prisma.evalSuite.findUnique({
        where: { id: input.suiteId },
        include: {
          project: { select: { workspaceId: true, name: true } },
          runs: {
            take: 5,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              status: true,
              triggeredBy: true,
              triggerRef: true,
              isRegression: true,
              latencyP95: true,
              errorRate: true,
              passedPrompts: true,
              failedPrompts: true,
              totalPrompts: true,
              createdAt: true,
              completedAt: true,
            },
          },
        },
      });

      if (!suite) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Eval suite not found" });
      }

      if (suite.project.workspaceId !== ctx.workspace.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      return {
        ...suite,
        prompts: suite.prompts as EvalPrompt[],
        expectedBehaviors: suite.expectedBehaviors as ExpectedBehavior[],
        baselineScores: suite.baselineScores as Record<string, number> | null,
      };
    }),

  /**
   * Create new eval suite
   */
  createSuite: protectedProcedure
    .input(CreateSuiteSchema)
    .use(workspaceMiddleware)
    .mutation(async ({ ctx, input }) => {
      // Verify project belongs to workspace
      const project = await prisma.project.findFirst({
        where: { id: input.projectId, workspaceId: ctx.workspace.id },
        select: { id: true },
      });

      if (!project) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      }

      return prisma.evalSuite.create({
        data: {
          projectId: input.projectId,
          name: input.name,
          description: input.description,
          endpoint: input.endpoint,
          enabled: input.enabled,
          prompts: input.prompts,
          expectedBehaviors: input.expectedBehaviors,
          latencyRegressionThreshold: input.latencyRegressionThreshold,
          errorRegressionThreshold: input.errorRegressionThreshold,
        },
      });
    }),

  /**
   * Update eval suite
   */
  updateSuite: protectedProcedure
    .input(UpdateSuiteSchema)
    .use(workspaceMiddleware)
    .mutation(async ({ ctx, input }) => {
      // Verify suite exists and belongs to workspace
      const suite = await prisma.evalSuite.findUnique({
        where: { id: input.suiteId },
        include: { project: { select: { workspaceId: true } } },
      });

      if (!suite) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Eval suite not found" });
      }

      if (suite.project.workspaceId !== ctx.workspace.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const {
        name,
        description,
        endpoint,
        enabled,
        prompts,
        expectedBehaviors,
        latencyRegressionThreshold,
        errorRegressionThreshold,
      } = input;

      return prisma.evalSuite.update({
        where: { id: input.suiteId },
        data: {
          name,
          description,
          endpoint,
          enabled,
          prompts,
          expectedBehaviors,
          latencyRegressionThreshold,
          errorRegressionThreshold,
        },
      });
    }),

  /**
   * Delete eval suite
   */
  deleteSuite: protectedProcedure
    .input(GetSuiteSchema)
    .use(workspaceMiddleware)
    .mutation(async ({ ctx, input }) => {
      // Verify suite exists and belongs to workspace
      const suite = await prisma.evalSuite.findUnique({
        where: { id: input.suiteId },
        include: { project: { select: { workspaceId: true } } },
      });

      if (!suite) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Eval suite not found" });
      }

      if (suite.project.workspaceId !== ctx.workspace.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      await prisma.evalSuite.delete({ where: { id: input.suiteId } });
      return { success: true };
    }),

  /**
   * Toggle eval suite enabled/disabled
   */
  toggleSuite: protectedProcedure
    .input(GetSuiteSchema)
    .use(workspaceMiddleware)
    .mutation(async ({ ctx, input }) => {
      // Verify suite exists and belongs to workspace
      const suite = await prisma.evalSuite.findUnique({
        where: { id: input.suiteId },
        include: { project: { select: { workspaceId: true } } },
      });

      if (!suite) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Eval suite not found" });
      }

      if (suite.project.workspaceId !== ctx.workspace.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      return prisma.evalSuite.update({
        where: { id: input.suiteId },
        data: { enabled: !suite.enabled },
      });
    }),

  /**
   * List runs for an eval suite
   */
  listRuns: protectedProcedure
    .input(ListRunsSchema)
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }) => {
      // Verify suite exists and belongs to workspace
      const suite = await prisma.evalSuite.findUnique({
        where: { id: input.suiteId },
        include: { project: { select: { workspaceId: true } } },
      });

      if (!suite) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Eval suite not found" });
      }

      if (suite.project.workspaceId !== ctx.workspace.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const runs = await prisma.evalRun.findMany({
        where: { suiteId: input.suiteId },
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        orderBy: { createdAt: "desc" },
      });

      let nextCursor: string | undefined;
      if (runs.length > input.limit) {
        const next = runs.pop();
        nextCursor = next?.id;
      }

      return {
        items: runs.map((run) => ({
          ...run,
          scores: run.scores as Record<string, number> | null,
          regressionDetails: run.regressionDetails as object | null,
        })),
        nextCursor,
      };
    }),

  /**
   * Get single eval run with full details
   */
  getRun: protectedProcedure
    .input(GetRunSchema)
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }) => {
      const run = await prisma.evalRun.findUnique({
        where: { id: input.runId },
        include: {
          suite: {
            include: {
              project: { select: { workspaceId: true, name: true } },
            },
          },
        },
      });

      if (!run) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Eval run not found" });
      }

      if (run.suite.project.workspaceId !== ctx.workspace.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      return {
        ...run,
        scores: run.scores as Record<string, number> | null,
        regressionDetails: run.regressionDetails as object | null,
        suite: {
          id: run.suite.id,
          name: run.suite.name,
          baselineLatencyP95: run.suite.baselineLatencyP95,
          baselineErrorRate: run.suite.baselineErrorRate,
        },
        project: run.suite.project,
      };
    }),

  /**
   * Trigger a manual eval run
   */
  triggerRun: protectedProcedure
    .input(TriggerRunSchema)
    .use(workspaceMiddleware)
    .mutation(async ({ ctx, input }) => {
      // Verify suite exists and belongs to workspace
      const suite = await prisma.evalSuite.findUnique({
        where: { id: input.suiteId },
        include: { project: { select: { id: true, workspaceId: true } } },
      });

      if (!suite) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Eval suite not found" });
      }

      if (suite.project.workspaceId !== ctx.workspace.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      if (!suite.enabled) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot trigger run for disabled suite",
        });
      }

      // Generate unique workflow ID
      const timestamp = Date.now();
      const workflowId = `eval-${input.suiteId}-manual-${timestamp}`;

      // Check if a run is already in progress
      try {
        const client = await getTemporalClient();
        const handle = client.workflow.getHandle(workflowId);
        const desc = await handle.describe();
        if (desc.status.name === "RUNNING") {
          return {
            status: "already_running" as const,
            workflowId,
            message: "An eval run is already in progress",
          };
        }
      } catch (error) {
        // WorkflowNotFoundError means workflow doesn't exist - proceed to start
        if (!(error instanceof WorkflowNotFoundError)) {
          throw error;
        }
      }

      // Start eval workflow
      const client = await getTemporalClient();
      await client.workflow.start("evalPipelineWorkflow", {
        taskQueue: getTaskQueue(),
        workflowId,
        args: [
          {
            projectId: suite.projectId,
            suiteId: input.suiteId,
            triggeredBy: "manual",
            triggerRef: `Manual by ${ctx.session.user.email}`,
          },
        ],
      });

      return {
        status: "started" as const,
        workflowId,
        message: "Eval run started",
      };
    }),

  /**
   * Update baseline from a successful run
   */
  updateBaseline: protectedProcedure
    .input(UpdateBaselineSchema)
    .use(workspaceMiddleware)
    .mutation(async ({ ctx, input }) => {
      // Fetch run with suite
      const run = await prisma.evalRun.findUnique({
        where: { id: input.runId },
        include: {
          suite: {
            include: { project: { select: { workspaceId: true } } },
          },
        },
      });

      if (!run) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Eval run not found" });
      }

      if (run.suite.project.workspaceId !== ctx.workspace.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      // Only allow updating baseline from successful runs
      if (run.status !== "PASSED" && run.status !== "REGRESSION_DETECTED") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Can only set baseline from completed runs",
        });
      }

      // Update suite baseline
      const updated = await prisma.evalSuite.update({
        where: { id: run.suiteId },
        data: {
          baselineLatencyP95: run.latencyP95,
          baselineErrorRate: run.errorRate,
          baselineScores: run.scores ?? undefined,
        },
      });

      return {
        success: true,
        baseline: {
          latencyP95: updated.baselineLatencyP95,
          errorRate: updated.baselineErrorRate,
          scores: updated.baselineScores,
        },
      };
    }),

  /**
   * Get run status for polling
   */
  getRunStatus: protectedProcedure
    .input(
      z.object({
        workspaceSlug: z.string(),
        runId: z.string(),
      })
    )
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }) => {
      const run = await prisma.evalRun.findUnique({
        where: { id: input.runId },
        include: {
          suite: {
            include: { project: { select: { workspaceId: true } } },
          },
        },
      });

      if (!run) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      if (run.suite.project.workspaceId !== ctx.workspace.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      return {
        status: run.status,
        statusLabel: EVAL_STATUS_LABELS[run.status as keyof typeof EVAL_STATUS_LABELS],
        isRegression: run.isRegression,
        completedAt: run.completedAt,
        latencyP95: run.latencyP95,
        errorRate: run.errorRate,
        passedPrompts: run.passedPrompts,
        failedPrompts: run.failedPrompts,
        totalPrompts: run.totalPrompts,
      };
    }),

  /**
   * Get labels and presets for UI
   */
  getPresets: protectedProcedure.query(() => {
    return {
      statusLabels: EVAL_STATUS_LABELS,
      triggerLabels: EVAL_TRIGGER_LABELS,
      defaultThresholds: {
        latencyRegression: 1.2,
        errorRegression: 2.0,
      },
    };
  }),
});

export type EvalsRouter = typeof evalsRouter;
