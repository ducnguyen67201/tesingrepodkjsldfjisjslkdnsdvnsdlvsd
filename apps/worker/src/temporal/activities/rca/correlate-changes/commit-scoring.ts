/**
 * Commit Scoring
 *
 * Functions for scoring commits based on correlation signals.
 */

import { prisma } from "@ducsigr/db";
import {
  MIN_CORRELATION_SCORE,
  MAX_COMMITS_TO_ANALYZE,
  MAX_SUSPECTED_COMMITS,
  calculateTemporalScore,
  calculateSemanticScore,
  calculatePathMatchScore,
  calculateCombinedScore,
  CORRELATION_WEIGHTS,
} from "@ducsigr/shared";
import type { CorrelatedCommit, RelevantCodeChunk } from "../../../types";

/**
 * Get all indexed file paths for a repository.
 *
 * Note: This is an approximation. In a full implementation,
 * we would store the actual files changed per commit (commitSha → files mapping).
 */
export async function getRepoFilePaths(repoId: string): Promise<string[]> {
  // Query distinct file paths from code chunks for this repo
  // TODO: Implement commit → files mapping for accurate results
  const chunks = await prisma.codeChunk.findMany({
    where: { repoId },
    select: { filePath: true },
    distinct: ["filePath"],
  });

  return chunks.map((c) => c.filePath);
}

/** Result from scoring commits */
export interface ScoreCommitsResult {
  commits: CorrelatedCommit[];
  totalAnalyzed: number;
}

/**
 * Score commits based on temporal, semantic, and path signals.
 */
export async function scoreCommits(
  repoId: string,
  cutoffDate: Date,
  alertTime: Date,
  relevantChunks: RelevantCodeChunk[],
  stackTracePaths: Set<string>
): Promise<ScoreCommitsResult> {
  // Fetch recent commits
  const commits = await prisma.gitCommit.findMany({
    where: {
      repoId,
      timestamp: { gte: cutoffDate, lte: alertTime },
    },
    orderBy: { timestamp: "desc" },
    take: MAX_COMMITS_TO_ANALYZE,
  });

  console.log(`[scoreCommits] Analyzing ${commits.length} commits`);

  // Get all indexed files once (outside the loop for performance)
  // TODO: Replace with commit-specific file mapping when available
  const repoFiles = await getRepoFilePaths(repoId);

  // Score each commit
  const scored: CorrelatedCommit[] = [];

  for (const commit of commits) {
    const signals = {
      temporal: calculateTemporalScore(commit.timestamp, alertTime),
      semantic: calculateSemanticScore(repoFiles, relevantChunks),
      pathMatch: calculatePathMatchScore(repoFiles, stackTracePaths),
    };

    const score = calculateCombinedScore(signals, CORRELATION_WEIGHTS);

    // Only include if above threshold
    if (score >= MIN_CORRELATION_SCORE) {
      scored.push({
        sha: commit.sha,
        message: commit.message.slice(0, 200),
        author: commit.author,
        authorEmail: commit.authorEmail,
        timestamp: commit.timestamp.toISOString(),
        score,
        signals,
        filesChanged: repoFiles.slice(0, 10), // Limit files in output
      });
    }
  }

  // Sort by score descending and take top N
  return {
    commits: scored.sort((a, b) => b.score - a.score).slice(0, MAX_SUSPECTED_COMMITS),
    totalAnalyzed: commits.length,
  };
}
