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
import { prisma, Prisma, SpanLevel, setChunkEmbeddings } from "@cognobserve/db";
import { createRouter, publicProcedure, middleware } from "../trpc";
import { calculateSpanCost } from "../lib/cost";
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

type Decimal = Prisma.Decimal;
const Decimal = Prisma.Decimal;

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

const UserInputSchema = z.object({
  name: z.string().optional(),
  email: z.string().optional(),
}).optional();

const SpanInputSchema = z.object({
  id: z.string(),
  parentSpanId: z.string().optional(),
  name: z.string(),
  startTime: z.string(),
  endTime: z.string().optional(),
  input: z.unknown().optional(),
  output: z.unknown().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  model: z.string().optional(),
  modelParameters: z.record(z.string(), z.unknown()).optional(),
  promptTokens: z.number().optional(),
  completionTokens: z.number().optional(),
  totalTokens: z.number().optional(),
  level: z.string().optional(),
  statusMessage: z.string().optional(),
});

const TraceIngestSchema = z.object({
  trace: z.object({
    id: z.string(),
    projectId: z.string(),
    name: z.string(),
    timestamp: z.string(),
    sessionId: z.string().optional(),
    userId: z.string().optional(),
    user: UserInputSchema,
    metadata: z.record(z.string(), z.unknown()).optional(),
  }),
  spans: z.array(SpanInputSchema),
});

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

function parseDate(dateStr: string | undefined | null): Date {
  if (!dateStr) return new Date();
  const date = new Date(dateStr);
  if (isNaN(date.getTime()) || date.getFullYear() < 2000) {
    return new Date();
  }
  return date;
}

function convertSpanLevel(level?: string): SpanLevel {
  switch (level) {
    case "DEBUG": return SpanLevel.DEBUG;
    case "WARNING": return SpanLevel.WARNING;
    case "ERROR": return SpanLevel.ERROR;
    default: return SpanLevel.DEFAULT;
  }
}

async function resolveUserId(
  tx: Prisma.TransactionClient,
  projectId: string,
  externalUserId: string | undefined,
  userMetadata?: { name?: string; email?: string }
): Promise<string | null> {
  if (!externalUserId) return null;

  const user = await tx.trackedUser.upsert({
    where: {
      projectId_externalId: { projectId, externalId: externalUserId },
    },
    create: {
      projectId,
      externalId: externalUserId,
      name: userMetadata?.name ?? null,
      email: userMetadata?.email ?? null,
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
    },
    update: {
      ...(userMetadata?.name?.trim() && { name: userMetadata.name.trim() }),
      ...(userMetadata?.email?.trim() && { email: userMetadata.email.trim() }),
      lastSeenAt: new Date(),
    },
  });

  return user.id;
}

async function resolveSessionId(
  tx: Prisma.TransactionClient,
  projectId: string,
  externalSessionId: string | undefined,
  userId: string | null
): Promise<string | null> {
  if (!externalSessionId) return null;

  const session = await tx.traceSession.upsert({
    where: {
      projectId_externalId: { projectId, externalId: externalSessionId },
    },
    create: {
      projectId,
      externalId: externalSessionId,
      ...(userId && { userId }),
    },
    update: {
      updatedAt: new Date(),
      ...(userId && { userId }),
    },
    select: { id: true },
  });

  return session.id;
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
  /**
   * Persist a trace with spans
   * Called by: trace.activities.ts → persistTrace
   */
  ingestTrace: internalProcedure
    .input(TraceIngestSchema)
    .mutation(async ({ input }) => {
      const { trace, spans } = input;

      const result = await prisma.$transaction(async (tx) => {
        // Resolve user if provided
        const userId = await resolveUserId(
          tx,
          trace.projectId,
          trace.userId,
          trace.user
        );

        // Resolve session if provided
        const sessionId = await resolveSessionId(
          tx,
          trace.projectId,
          trace.sessionId,
          userId
        );

        // Create trace
        const createdTrace = await tx.trace.create({
          data: {
            id: trace.id,
            name: trace.name,
            timestamp: parseDate(trace.timestamp),
            metadata: (trace.metadata as Prisma.InputJsonValue) ?? Prisma.JsonNull,
            project: { connect: { id: trace.projectId } },
            ...(sessionId && { session: { connect: { id: sessionId } } }),
            ...(userId && { user: { connect: { id: userId } } }),
          },
        });

        // Create spans
        if (spans.length > 0) {
          await tx.span.createMany({
            data: spans.map((span) => ({
              id: span.id,
              traceId: trace.id,
              parentSpanId: span.parentSpanId ?? null,
              name: span.name,
              startTime: parseDate(span.startTime),
              endTime: span.endTime ? parseDate(span.endTime) : null,
              input: (span.input as Prisma.InputJsonValue) ?? Prisma.JsonNull,
              output: (span.output as Prisma.InputJsonValue) ?? Prisma.JsonNull,
              metadata: (span.metadata as Prisma.InputJsonValue) ?? Prisma.JsonNull,
              model: span.model ?? null,
              modelParameters: (span.modelParameters as Prisma.InputJsonValue) ?? Prisma.JsonNull,
              promptTokens: span.promptTokens ?? null,
              completionTokens: span.completionTokens ?? null,
              totalTokens: span.totalTokens ?? null,
              level: convertSpanLevel(span.level),
              statusMessage: span.statusMessage ?? null,
            })),
          });
        }

        return createdTrace;
      });

      console.log(`[Internal:ingestTrace] Trace ${result.id} persisted with ${spans.length} spans`);
      return { traceId: result.id };
    }),

  /**
   * Calculate costs for a trace's spans
   * Called by: trace.activities.ts → calculateTraceCosts
   */
  calculateTraceCosts: internalProcedure
    .input(z.object({ traceId: z.string() }))
    .mutation(async ({ input }) => {
      const { traceId } = input;

      // Find spans with model and tokens but no cost
      const spans = await prisma.span.findMany({
        where: {
          traceId,
          model: { not: null },
          OR: [
            { promptTokens: { gt: 0 } },
            { completionTokens: { gt: 0 } },
          ],
          totalCost: null,
        },
        select: {
          id: true,
          model: true,
          promptTokens: true,
          completionTokens: true,
        },
      });

      if (spans.length === 0) {
        return { updatedCount: 0 };
      }

      let updatedCount = 0;

      for (const span of spans) {
        if (!span.model) continue;

        const cost = await calculateSpanCost({
          model: span.model,
          promptTokens: span.promptTokens,
          completionTokens: span.completionTokens,
        });

        if (cost) {
          await prisma.span.update({
            where: { id: span.id },
            data: {
              inputCost: cost.inputCost,
              outputCost: cost.outputCost,
              totalCost: cost.totalCost,
              pricingId: cost.pricingId,
            },
          });
          updatedCount++;
        }
      }

      console.log(`[Internal:calculateTraceCosts] Updated costs for ${updatedCount} spans`);
      return { updatedCount };
    }),

  /**
   * Update daily cost summaries for a project
   * Called by: trace.activities.ts → updateCostSummaries
   */
  updateCostSummaries: internalProcedure
    .input(z.object({
      projectId: z.string(),
      date: z.string(),
    }))
    .mutation(async ({ input }) => {
      const { projectId, date: dateStr } = input;

      const date = parseDate(dateStr);
      const dateOnly = date.toISOString().split("T")[0]!;
      const startOfDay = new Date(dateOnly);
      const endOfDay = new Date(startOfDay);
      endOfDay.setDate(endOfDay.getDate() + 1);

      // Get spans with costs for this day
      const spans = await prisma.span.findMany({
        where: {
          trace: { projectId },
          startTime: { gte: startOfDay, lt: endOfDay },
          totalCost: { not: null },
        },
        select: {
          model: true,
          promptTokens: true,
          completionTokens: true,
          totalTokens: true,
          inputCost: true,
          outputCost: true,
          totalCost: true,
        },
      });

      if (spans.length === 0) {
        return { success: true };
      }

      // Aggregate by model
      const aggregations = new Map<string, {
        spanCount: number;
        inputTokens: bigint;
        outputTokens: bigint;
        totalTokens: bigint;
        inputCost: Prisma.Decimal;
        outputCost: Prisma.Decimal;
        totalCost: Prisma.Decimal;
      }>();

      for (const span of spans) {
        const model = span.model?.toLowerCase() ?? "__unknown__";

        if (!aggregations.has(model)) {
          aggregations.set(model, {
            spanCount: 0,
            inputTokens: BigInt(0),
            outputTokens: BigInt(0),
            totalTokens: BigInt(0),
            inputCost: new Decimal(0),
            outputCost: new Decimal(0),
            totalCost: new Decimal(0),
          });
        }

        const agg = aggregations.get(model)!;
        agg.spanCount += 1;
        agg.inputTokens += BigInt(span.promptTokens ?? 0);
        agg.outputTokens += BigInt(span.completionTokens ?? 0);
        agg.totalTokens += BigInt(span.totalTokens ?? 0);
        agg.inputCost = agg.inputCost.add(span.inputCost ?? new Decimal(0));
        agg.outputCost = agg.outputCost.add(span.outputCost ?? new Decimal(0));
        agg.totalCost = agg.totalCost.add(span.totalCost ?? new Decimal(0));
      }

      // Upsert summaries
      await prisma.$transaction(async (tx) => {
        for (const [model, agg] of aggregations) {
          await tx.costDailySummary.upsert({
            where: {
              projectId_date_model: { projectId, date: startOfDay, model },
            },
            create: {
              projectId,
              date: startOfDay,
              model,
              ...agg,
            },
            update: agg,
          });
        }
      });

      console.log(`[Internal:updateCostSummaries] Updated ${aggregations.size} model summaries`);
      return { success: true };
    }),

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
});

export type InternalRouter = typeof internalRouter;
