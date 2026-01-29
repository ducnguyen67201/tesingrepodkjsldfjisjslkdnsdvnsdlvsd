/**
 * PR Scoring
 *
 * Functions for scoring pull requests based on correlation signals.
 */

import { prisma } from "@ducsigr/db";
import {
  MIN_CORRELATION_SCORE,
  MAX_PRS_TO_ANALYZE,
  MAX_SUSPECTED_PRS,
  calculateTemporalScore,
  calculateSemanticScore,
  calculatePathMatchScore,
  calculateCombinedScore,
  CORRELATION_WEIGHTS,
} from "@ducsigr/shared";
import type { CorrelatedPR, RelevantCodeChunk } from "../../../types";
import { getRepoFilePaths } from "./commit-scoring";

/** Result from scoring PRs */
export interface ScorePRsResult {
  prs: CorrelatedPR[];
  totalAnalyzed: number;
}

/**
 * Score PRs based on temporal, semantic, and path signals.
 */
export async function scorePRs(
  repoId: string,
  cutoffDate: Date,
  alertTime: Date,
  relevantChunks: RelevantCodeChunk[],
  stackTracePaths: Set<string>
): Promise<ScorePRsResult> {
  // Fetch recently merged PRs
  const prs = await prisma.gitPullRequest.findMany({
    where: {
      repoId,
      mergedAt: { gte: cutoffDate, lte: alertTime },
    },
    orderBy: { mergedAt: "desc" },
    take: MAX_PRS_TO_ANALYZE,
  });

  console.log(`[scorePRs] Analyzing ${prs.length} merged PRs`);

  // Get all indexed files once (outside the loop for performance)
  // TODO: Replace with PR-specific file mapping when available
  const repoFiles = await getRepoFilePaths(repoId);

  // Score each PR
  const scored: CorrelatedPR[] = [];

  for (const pr of prs) {
    if (!pr.mergedAt) continue;

    const signals = {
      temporal: calculateTemporalScore(pr.mergedAt, alertTime),
      semantic: calculateSemanticScore(repoFiles, relevantChunks),
      pathMatch: calculatePathMatchScore(repoFiles, stackTracePaths),
    };

    const score = calculateCombinedScore(signals, CORRELATION_WEIGHTS);

    if (score >= MIN_CORRELATION_SCORE) {
      scored.push({
        number: pr.number,
        title: pr.title.slice(0, 200),
        author: pr.author,
        mergedAt: pr.mergedAt.toISOString(),
        score,
        signals,
      });
    }
  }

  return {
    prs: scored.sort((a, b) => b.score - a.score).slice(0, MAX_SUSPECTED_PRS),
    totalAnalyzed: prs.length,
  };
}
