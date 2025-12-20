/**
 * Internal Router - Server-to-Server Procedures
 *
 * These procedures are called by Temporal activities (worker → API).
 * They use internal secret authentication, NOT user sessions.
 *
 * IMPORTANT: All database mutations go through this router.
 * Temporal activities are READ-ONLY and call these procedures.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { prisma, Prisma, setChunkEmbeddings } from "@cognobserve/db";
import { createRouter, publicProcedure, middleware } from "../trpc";
import {
  SEVERITY_DEFAULTS,
  type AlertPayload,
  type ChannelProvider,
  type RCASummary,
  type RCATopChange,
  RCA_CATEGORY_LABELS,
} from "../schemas/alerting";
import { StoreGitHubIndexSchema } from "../schemas/github";
import { StoreRCAInputSchema, LLMRCAOutputSchema } from "../schemas/rca";
import { AdapterRegistry } from "../lib/alerting/registry";
import { GitHubService, RCAService } from "../services";

// ============================================================
// INTERNAL AUTH MIDDLEWARE
// ============================================================

/**
 * Internal procedure middleware - verifies internal API secret.
 * Used instead of session auth for server-to-server calls.
 */
const internalMiddleware = middleware(({ ctx, next }) => {
  // For internal calls, we check the internalSecret in context
  // The caller must set this when creating the context
  const internalCtx = ctx as { internalSecret?: string };

  if (!internalCtx.internalSecret) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Internal secret required",
    });
  }

  const expectedSecret = process.env.INTERNAL_API_SECRET;
  if (!expectedSecret || internalCtx.internalSecret !== expectedSecret) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Invalid internal secret",
    });
  }

  return next();
});

const internalProcedure = publicProcedure.use(internalMiddleware);

// ============================================================
// INPUT SCHEMAS
// ============================================================

// NOTE: Legacy trace ingestion schemas removed - replaced by OTLP-first ingest-node service
// See: apps/ingest-node/ and docs/specs/ingest/README.md

const ScoreIngestSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  configId: z.string().optional(),
  traceId: z.string().optional(),
  spanId: z.string().optional(),
  sessionId: z.string().optional(),
  trackedUserId: z.string().optional(),
  name: z.string(),
  value: z.union([z.number(), z.string(), z.boolean()]),
  comment: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// ============================================================
// HELPER FUNCTIONS
// ============================================================

// NOTE: Legacy trace ingestion helpers removed - replaced by OTLP-first ingest-node service

function parseDate(dateStr: string | undefined | null): Date {
  if (!dateStr) return new Date();
  const date = new Date(dateStr);
  if (isNaN(date.getTime()) || date.getFullYear() < 2000) {
    return new Date();
  }
  return date;
}

// ============================================================
// RCA NOTIFICATION HELPERS
// ============================================================

/** Minimum RCA confidence to include in notifications */
const MIN_RCA_CONFIDENCE = 0.30;

/** Maximum age of RCA to include (5 minutes) */
const MAX_RCA_AGE_MS = 5 * 60 * 1000;

/**
 * Lookup most recent RCA for an alert within reasonable time window
 * Returns undefined if no RCA available, too old, or below confidence threshold
 */
async function lookupRecentRCA(
  alertId: string,
  workspaceSlug: string,
  projectId: string
): Promise<RCASummary | undefined> {
  try {
    const alertRCA = await prisma.alertRCA.findFirst({
      where: {
        alertId,
        createdAt: { gte: new Date(Date.now() - MAX_RCA_AGE_MS) },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!alertRCA) {
      console.log(`[Internal:lookupRecentRCA] No recent RCA for alert ${alertId}`);
      return undefined;
    }

    // Check confidence threshold
    if (alertRCA.confidence && alertRCA.confidence < MIN_RCA_CONFIDENCE) {
      console.log(`[Internal:lookupRecentRCA] RCA confidence ${alertRCA.confidence} below threshold`);
      return undefined;
    }

    // Validate analysisJson with Zod schema
    const parseResult = LLMRCAOutputSchema.safeParse(alertRCA.analysisJson);
    if (!parseResult.success) {
      console.error(
        `[Internal:lookupRecentRCA] Invalid analysisJson for RCA ${alertRCA.id}:`,
        parseResult.error.flatten()
      );
      return undefined;
    }
    const analysis = parseResult.data;

    // Extract top suspected change
    let topChange: RCATopChange | undefined;
    if (analysis.relatedChanges && analysis.relatedChanges.length > 0) {
      const top = analysis.relatedChanges[0]!;
      topChange = {
        id: top.changeId,
        type: top.type,
        summary: top.explanation.slice(0, 100),
        author: "Unknown", // Would need to join with GitCommit/GitPullRequest
        relevance: top.relevance,
      };
    }

    return {
      hypothesis: analysis.hypothesis,
      confidence: analysis.confidence,
      category: analysis.rootCause.category,
      topChange,
      remediation: analysis.remediation.immediate.slice(0, 3),
      detailUrl: `${process.env.NEXT_PUBLIC_APP_URL}/${workspaceSlug}/${projectId}/alerts/${alertId}/rca/${alertRCA.id}`,
    };
  } catch (error) {
    console.error(`[Internal:lookupRecentRCA] Error fetching RCA:`, error);
    return undefined;
  }
}

/**
 * Build dashboard URL for alert
 */
function buildDashboardUrl(workspaceSlug: string, projectId: string): string {
  return `${process.env.NEXT_PUBLIC_APP_URL}/${workspaceSlug}/${projectId}/dashboard`;
}

// ============================================================
// INTERNAL ROUTER
// ============================================================

export const internalRouter = createRouter({
  // NOTE: Legacy trace ingestion procedures removed (ingestTrace, calculateTraceCosts, updateCostSummaries)
  // These are replaced by the OTLP-first ingest-node service
  // See: apps/ingest-node/ and docs/specs/ingest/README.md

  /**
   * Persist a score
   * Called by: score.activities.ts → persistScore
   * TODO(Issue #104): Enable when Score model is added
   */
  ingestScore: internalProcedure
    .input(ScoreIngestSchema)
    .mutation(async ({ input }) => {
      // TODO(Issue #104): Implement when Score model exists
      console.log(`[Internal:ingestScore] STUB: Would persist score ${input.id}`);
      return { scoreId: input.id };
    }),

  /**
   * Validate score against config
   * Called by: score.activities.ts → validateScoreConfig
   * TODO(Issue #104): Enable when ScoreConfig model is added
   */
  validateScoreConfig: internalProcedure
    .input(z.object({
      configId: z.string(),
      value: z.unknown(),
    }))
    .mutation(async ({ input }) => {
      // TODO(Issue #104): Implement when ScoreConfig model exists
      console.log(`[Internal:validateScoreConfig] STUB: Would validate against ${input.configId}`);
      return { valid: true };
    }),

  /**
   * Transition alert state
   * Called by: alert.activities.ts → transitionAlertState
   */
  transitionAlertState: internalProcedure
    .input(z.object({
      alertId: z.string(),
      conditionMet: z.boolean(),
    }))
    .mutation(async ({ input }) => {
      const { alertId, conditionMet } = input;

      const alert = await prisma.alert.findUnique({ where: { id: alertId } });
      if (!alert) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Alert not found" });
      }

      const previousState = alert.state;
      let newState = previousState;
      let shouldNotify = false;

      const now = new Date();
      const stateAge = alert.stateChangedAt
        ? now.getTime() - alert.stateChangedAt.getTime()
        : Infinity;

      const MS_PER_MINUTE = 60_000;
      const defaults = SEVERITY_DEFAULTS[alert.severity as keyof typeof SEVERITY_DEFAULTS];
      const pendingMs = (alert.pendingMins ?? defaults?.pendingMins ?? 3) * MS_PER_MINUTE;
      const cooldownMs = (alert.cooldownMins ?? defaults?.cooldownMins ?? 30) * MS_PER_MINUTE;

      // State machine transitions
      if (conditionMet) {
        switch (previousState) {
          case "INACTIVE":
            newState = "PENDING";
            break;
          case "PENDING":
            if (stateAge >= pendingMs) {
              newState = "FIRING";
              shouldNotify = true;
            }
            break;
          case "RESOLVED":
            newState = "PENDING";
            break;
          case "FIRING":
            const lastNotifyAge = alert.lastTriggeredAt
              ? now.getTime() - alert.lastTriggeredAt.getTime()
              : Infinity;
            shouldNotify = lastNotifyAge >= cooldownMs;
            break;
        }
      } else {
        switch (previousState) {
          case "FIRING":
            newState = "RESOLVED";
            shouldNotify = true;
            break;
          case "PENDING":
          case "RESOLVED":
            newState = "INACTIVE";
            break;
        }
      }

      // Update database
      if (newState !== previousState || shouldNotify) {
        await prisma.alert.update({
          where: { id: alertId },
          data: {
            state: newState,
            lastEvaluatedAt: now,
            ...(newState !== previousState && { stateChangedAt: now }),
            ...(shouldNotify && { lastTriggeredAt: now }),
          },
        });
      }

      console.log(`[Internal:transitionAlertState] ${previousState} → ${newState} (notify: ${shouldNotify})`);
      return { alertId, previousState, newState, shouldNotify };
    }),

  /**
   * Dispatch notification for an alert
   * Called by: alert.activities.ts → dispatchNotification
   * Enhanced with RCA lookup for enriched notifications
   */
  dispatchNotification: internalProcedure
    .input(z.object({
      alertId: z.string(),
      state: z.string(),
      value: z.number(),
      threshold: z.number(),
    }))
    .mutation(async ({ input }) => {
      const { alertId, state, value, threshold } = input;

      const alert = await prisma.alert.findUnique({
        where: { id: alertId },
        include: {
          project: {
            include: { workspace: true },
          },
          channelLinks: {
            include: { channel: true },
          },
        },
      });

      if (!alert) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Alert not found" });
      }

      if (alert.channelLinks.length === 0) {
        console.log(`[Internal:dispatchNotification] No channels configured`);
        return { channelCount: 0, sentCount: 0, failedCount: 0 };
      }

      const workspaceSlug = alert.project.workspace.slug;

      // Lookup most recent RCA for this alert (if available)
      const rcaData = await lookupRecentRCA(alertId, workspaceSlug, alert.projectId);
      if (rcaData) {
        console.log(`[Internal:dispatchNotification] Including RCA with confidence ${rcaData.confidence}`);
      }

      // Build alert payload with optional RCA
      const payload: AlertPayload = {
        alertId: alert.id,
        alertName: alert.name,
        projectId: alert.projectId,
        projectName: alert.project.name,
        type: alert.type as AlertPayload["type"],
        threshold: alert.threshold,
        actualValue: value,
        operator: alert.operator as AlertPayload["operator"],
        triggeredAt: new Date().toISOString(),
        dashboardUrl: buildDashboardUrl(workspaceSlug, alert.projectId),
        rca: rcaData,
      };

      // Send to each channel
      let sentCount = 0;
      let failedCount = 0;
      const notifiedProviders: string[] = [];

      for (const link of alert.channelLinks) {
        const { channel } = link;
        const provider = channel.provider as ChannelProvider;

        try {
          // Check if adapter is registered
          if (!AdapterRegistry.has(provider)) {
            console.warn(`[Internal:dispatchNotification] No adapter for ${provider}`);
            failedCount++;
            continue;
          }

          const adapter = AdapterRegistry.get(provider);
          const result = await adapter.send(channel.config, payload);

          if (result.success) {
            sentCount++;
            notifiedProviders.push(provider);
            console.log(`[Internal:dispatchNotification] Sent to ${provider} channel: ${channel.name}`);
          } else {
            failedCount++;
            console.error(`[Internal:dispatchNotification] Failed ${provider}: ${result.error}`);
          }
        } catch (error) {
          failedCount++;
          console.error(`[Internal:dispatchNotification] Error sending to ${provider}:`, error);
        }
      }

      // Record in alert history
      await prisma.alertHistory.create({
        data: {
          alertId,
          value,
          threshold,
          state: state as "INACTIVE" | "PENDING" | "FIRING" | "RESOLVED",
          previousState: alert.state,
          notifiedVia: notifiedProviders,
        },
      });

      console.log(`[Internal:dispatchNotification] Sent to ${sentCount}/${alert.channelLinks.length} channels`);
      return { channelCount: alert.channelLinks.length, sentCount, failedCount };
    }),

  /**
   * Store GitHub indexed data
   * Called by: github.activities.ts → storeIndexedData
   */
  storeGitHubIndex: internalProcedure
    .input(StoreGitHubIndexSchema)
    .mutation(({ input }) => GitHubService.storeIndexedData(input)),

  // ============================================================
  // REPOSITORY INDEXING PROCEDURES
  // ============================================================

  /**
   * Update repository index status
   * Called by: repository-index.activities.ts → updateRepositoryIndexStatus
   */
  updateRepositoryIndexStatus: internalProcedure
    .input(z.object({
      repositoryId: z.string(),
      status: z.enum(["PENDING", "INDEXING", "READY", "FAILED"]),
      lastIndexedAt: z.date().optional(),
    }))
    .mutation(async ({ input }) => {
      const { repositoryId, status, lastIndexedAt } = input;

      const updated = await prisma.gitHubRepository.update({
        where: { id: repositoryId },
        data: {
          indexStatus: status,
          ...(lastIndexedAt && { lastIndexedAt }),
        },
      });

      console.log(`[Internal:updateRepositoryIndexStatus] ${repositoryId} → ${status}`);
      return updated;
    }),

  /**
   * Delete all chunks for a repository (for reindex)
   * Called by: repository-index.activities.ts → cleanupRepositoryChunks
   */
  deleteRepositoryChunks: internalProcedure
    .input(z.object({
      repositoryId: z.string(),
    }))
    .mutation(async ({ input }) => {
      const { repositoryId } = input;

      const result = await prisma.codeChunk.deleteMany({
        where: { repoId: repositoryId },
      });

      console.log(`[Internal:deleteRepositoryChunks] Deleted ${result.count} chunks for ${repositoryId}`);
      return { deletedCount: result.count };
    }),

  /**
   * Store repository chunks and return chunk IDs
   * Called by: repository-index.activities.ts → storeRepositoryChunks
   *
   * Optimized for batch operations:
   * 1. Batch lookup existing chunks by contentHash
   * 2. Filter to only new chunks
   * 3. Batch insert new chunks
   * 4. Return all chunk IDs (existing + new)
   */
  storeRepositoryChunks: internalProcedure
    .input(z.object({
      repositoryId: z.string(),
      chunks: z.array(z.object({
        filePath: z.string(),
        startLine: z.number(),
        endLine: z.number(),
        content: z.string(),
        contentHash: z.string(),
        language: z.string().nullable(),
        chunkType: z.enum(["function", "class", "module", "block"]),
      })),
    }))
    .mutation(async ({ input }) => {
      const { repositoryId, chunks } = input;

      if (chunks.length === 0) {
        return { chunksCreated: 0, chunkIds: [] };
      }

      console.log(`[Internal:storeRepositoryChunks] Processing ${chunks.length} chunks for ${repositoryId}`);

      // Step 1: Batch lookup existing chunks by contentHash
      const contentHashes = chunks.map((c) => c.contentHash);
      const existingChunks = await prisma.codeChunk.findMany({
        where: {
          repoId: repositoryId,
          contentHash: { in: contentHashes },
        },
        select: { id: true, contentHash: true },
      });

      // Create lookup map: contentHash -> id
      const existingMap = new Map(existingChunks.map((c) => [c.contentHash, c.id]));
      console.log(`[Internal:storeRepositoryChunks] Found ${existingMap.size} existing chunks`);

      // Step 2: Filter to only new chunks
      const newChunks = chunks.filter((c) => !existingMap.has(c.contentHash));
      console.log(`[Internal:storeRepositoryChunks] Creating ${newChunks.length} new chunks`);

      // Step 3: Batch insert new chunks (in batches of 100 for safety)
      const BATCH_SIZE = 100;
      const createdIds: string[] = [];

      for (let i = 0; i < newChunks.length; i += BATCH_SIZE) {
        const batch = newChunks.slice(i, i + BATCH_SIZE);

        // Use createMany then fetch IDs (Prisma limitation: createMany doesn't return IDs)
        await prisma.codeChunk.createMany({
          data: batch.map((chunk) => ({
            repoId: repositoryId,
            filePath: chunk.filePath,
            startLine: chunk.startLine,
            endLine: chunk.endLine,
            content: chunk.content,
            contentHash: chunk.contentHash,
            language: chunk.language,
            chunkType: chunk.chunkType,
          })),
          skipDuplicates: true,
        });

        // Fetch IDs for this batch
        const batchHashes = batch.map((c) => c.contentHash);
        const created = await prisma.codeChunk.findMany({
          where: {
            repoId: repositoryId,
            contentHash: { in: batchHashes },
          },
          select: { id: true },
        });
        createdIds.push(...created.map((c) => c.id));

        if (i + BATCH_SIZE < newChunks.length) {
          console.log(`[Internal:storeRepositoryChunks] Batch ${Math.floor(i / BATCH_SIZE) + 1} complete`);
        }
      }

      // Step 4: Combine existing + new IDs
      const existingIds = chunks
        .filter((c) => existingMap.has(c.contentHash))
        .map((c) => existingMap.get(c.contentHash)!);

      const allChunkIds = [...existingIds, ...createdIds];
      console.log(`[Internal:storeRepositoryChunks] Total: ${allChunkIds.length} chunks (${existingIds.length} existing, ${createdIds.length} new)`);

      return { chunksCreated: allChunkIds.length, chunkIds: allChunkIds };
    }),

  /**
   * Store embeddings for code chunks
   * Called by: embedding.activities.ts → storeEmbeddings
   */
  storeChunkEmbeddings: internalProcedure
    .input(z.object({
      embeddings: z.array(z.object({
        chunkId: z.string(),
        embedding: z.array(z.number()),
      })),
    }))
    .mutation(async ({ input }) => {
      const { embeddings } = input;

      if (embeddings.length === 0) {
        return { storedCount: 0 };
      }

      // Use batch operation from vector utilities
      await setChunkEmbeddings(
        embeddings.map((e) => ({
          chunkId: e.chunkId,
          embedding: e.embedding,
        }))
      );

      console.log(`[Internal:storeChunkEmbeddings] Stored ${embeddings.length} embeddings`);
      return { storedCount: embeddings.length };
    }),

  // ============================================================
  // RCA STORAGE PROCEDURES
  // ============================================================

  /**
   * Store RCA analysis result
   * Called by: rca.workflow.ts → storeRCA activity
   *
   * Links RCA to AlertHistory via shared alertId.
   * Stores complete analysis JSON with LLM metadata.
   */
  storeRCA: internalProcedure
    .input(StoreRCAInputSchema)
    .mutation(({ input }) => RCAService.storeRCA(input)),

  /**
   * Track manual RCA request
   * Called by: alerts.triggerRCA router (for consistency with internal patterns)
   *
   * Updates alertHistory with RCA request metadata.
   */
  trackRCARequest: internalProcedure
    .input(z.object({
      alertHistoryId: z.string(),
      requestedBy: z.string(),
    }))
    .mutation(({ input }) => RCAService.trackRCARequest(input)),

  // ============================================================
  // EVAL PIPELINE PROCEDURES
  // ============================================================

  /**
   * Create a new eval run
   * Called by: eval.activities.ts → createEvalRun
   *
   * Creates an EvalRun record with RUNNING status.
   */
  createEvalRun: internalProcedure
    .input(z.object({
      suiteId: z.string(),
      triggeredBy: z.enum(["pr_merge", "manual", "scheduled"]),
      triggerRef: z.string().optional(),
      totalPrompts: z.number().int().positive(),
    }))
    .mutation(async ({ input }) => {
      const run = await prisma.evalRun.create({
        data: {
          suiteId: input.suiteId,
          triggeredBy: input.triggeredBy,
          triggerRef: input.triggerRef,
          status: "RUNNING",
          startedAt: new Date(),
          totalPrompts: input.totalPrompts,
        },
      });

      console.log(`[Internal:createEvalRun] Created run ${run.id} for suite ${input.suiteId}`);
      return { runId: run.id };
    }),

  /**
   * Update eval run with results
   * Called by: eval.activities.ts → storeResults
   *
   * Updates EvalRun with metrics, status, and regression details.
   */
  updateEvalRun: internalProcedure
    .input(z.object({
      runId: z.string(),
      status: z.enum(["PENDING", "RUNNING", "PASSED", "FAILED", "REGRESSION_DETECTED"]),
      completedAt: z.date().optional(),
      passedPrompts: z.number().int().nonnegative().optional(),
      failedPrompts: z.number().int().nonnegative().optional(),
      latencyP95: z.number().optional(),
      errorRate: z.number().optional(),
      scores: z.record(z.string(), z.number()).optional(),
      isRegression: z.boolean().optional(),
      regressionDetails: z.array(z.object({
        metric: z.enum(["latency_p95", "error_rate", "pass_rate"]),
        baseline: z.number(),
        current: z.number(),
        threshold: z.number(),
        changePercent: z.number(),
        message: z.string(),
      })).optional(),
    }))
    .mutation(async ({ input }) => {
      const { runId, ...updateData } = input;

      const run = await prisma.evalRun.update({
        where: { id: runId },
        data: {
          status: updateData.status,
          completedAt: updateData.completedAt ?? (updateData.status !== "RUNNING" ? new Date() : undefined),
          passedPrompts: updateData.passedPrompts,
          failedPrompts: updateData.failedPrompts,
          latencyP95: updateData.latencyP95,
          errorRate: updateData.errorRate,
          scores: updateData.scores as Prisma.InputJsonValue ?? undefined,
          isRegression: updateData.isRegression,
          regressionDetails: updateData.regressionDetails as Prisma.InputJsonValue ?? undefined,
        },
      });

      console.log(`[Internal:updateEvalRun] Updated run ${runId} to ${updateData.status}`);
      return { runId: run.id, status: run.status };
    }),

  /**
   * Dispatch regression alert notification
   * Called by: eval.activities.ts → triggerAlert
   *
   * Sends notifications to workspace channels when regression is detected.
   */
  dispatchRegressionAlert: internalProcedure
    .input(z.object({
      suiteId: z.string(),
      runId: z.string(),
      regressionDetails: z.array(z.object({
        metric: z.enum(["latency_p95", "error_rate", "pass_rate"]),
        baseline: z.number(),
        current: z.number(),
        threshold: z.number(),
        changePercent: z.number(),
        message: z.string(),
      })),
    }))
    .mutation(async ({ input }) => {
      const { suiteId, runId, regressionDetails } = input;

      // Fetch suite with project and workspace
      const suite = await prisma.evalSuite.findUnique({
        where: { id: suiteId },
        include: {
          project: {
            include: {
              workspace: {
                include: {
                  notificationChannels: true,
                },
              },
            },
          },
        },
      });

      if (!suite) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Eval suite not found" });
      }

      const channels = suite.project.workspace.notificationChannels;
      if (channels.length === 0) {
        console.log(`[Internal:dispatchRegressionAlert] No channels configured`);
        return { channelCount: 0, sentCount: 0, failedCount: 0 };
      }

      const workspaceSlug = suite.project.workspace.slug;
      const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL}/${workspaceSlug}/${suite.projectId}/evals/${suiteId}/runs/${runId}`;

      // Build regression alert payload
      const payload: AlertPayload = {
        alertId: runId,
        alertName: `Regression: ${suite.name}`,
        projectId: suite.projectId,
        projectName: suite.project.name,
        type: "ERROR_RATE", // Use ERROR_RATE as placeholder for regression alerts
        threshold: 0,
        actualValue: 0,
        operator: "GREATER_THAN",
        triggeredAt: new Date().toISOString(),
        dashboardUrl,
      };

      // Send to each channel
      let sentCount = 0;
      let failedCount = 0;

      for (const channel of channels) {
        const provider = channel.provider as ChannelProvider;

        try {
          if (!AdapterRegistry.has(provider)) {
            console.warn(`[Internal:dispatchRegressionAlert] No adapter for ${provider}`);
            failedCount++;
            continue;
          }

          const adapter = AdapterRegistry.get(provider);
          // Add regression details to the payload for adapters that support it
          const enhancedPayload = { ...payload, regressionInfo: { details: regressionDetails } };
          const result = await adapter.send(channel.config, enhancedPayload);

          if (result.success) {
            sentCount++;
            console.log(`[Internal:dispatchRegressionAlert] Sent to ${provider} channel: ${channel.name}`);
          } else {
            failedCount++;
            console.error(`[Internal:dispatchRegressionAlert] Failed ${provider}: ${result.error}`);
          }
        } catch (error) {
          failedCount++;
          console.error(`[Internal:dispatchRegressionAlert] Error sending to ${provider}:`, error);
        }
      }

      console.log(`[Internal:dispatchRegressionAlert] Sent to ${sentCount}/${channels.length} channels`);
      return { channelCount: channels.length, sentCount, failedCount };
    }),
});

export type InternalRouter = typeof internalRouter;
