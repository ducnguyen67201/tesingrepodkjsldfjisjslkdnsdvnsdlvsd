/**
 * RCAService - Business logic for RCA (Root Cause Analysis) operations
 *
 * This service handles RCA storage operations, called by the internal router.
 */

import { prisma, type Prisma } from "@cognobserve/db";
import { TRPCError } from "@trpc/server";
import type { StoreRCAInput, StoreRCAOutput } from "../schemas/rca";

export type { StoreRCAOutput };

/**
 * RCAService - Business logic for RCA operations
 */
export class RCAService {
  /**
   * Store RCA analysis result
   *
   * Links RCA to AlertHistory via shared alertId.
   * Stores complete analysis JSON with LLM metadata.
   *
   * @param input - RCA data to store
   * @returns Created RCA record info
   * @throws TRPCError NOT_FOUND if AlertHistory doesn't exist
   */
  static async storeRCA(input: StoreRCAInput): Promise<StoreRCAOutput> {
    const {
      alertHistoryId,
      rcaReport,
      suspectedCommitShas,
      suspectedPRNumbers,
      alertContext,
      traceAnalysisSummary,
    } = input;

    // 1. Verify AlertHistory exists and get alertId
    const alertHistory = await prisma.alertHistory.findUnique({
      where: { id: alertHistoryId },
      select: {
        id: true,
        alertId: true,
        triggeredAt: true,
      },
    });

    if (!alertHistory) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `AlertHistory ${alertHistoryId} not found`,
      });
    }

    // 2. Build complete analysisJson
    const analysisJson: Prisma.InputJsonValue = {
      ...rcaReport,
      alertContext,
      traceAnalysisSummary,
    };

    // 3. Create AlertRCA record
    const alertRCA = await prisma.alertRCA.create({
      data: {
        alertId: alertHistory.alertId,
        triggeredAt: alertHistory.triggeredAt,
        analysisJson,
        suspectedPRs: suspectedPRNumbers,
        suspectedCommits: suspectedCommitShas,
        confidence: rcaReport.confidence,
      },
    });

    return {
      rcaId: alertRCA.id,
      alertId: alertHistory.alertId,
      confidence: alertRCA.confidence,
    };
  }
}
