/**
 * Correlate Code Changes Activity
 *
 * Main activity for correlating alerts with recent code changes.
 * Uses temporal proximity, semantic similarity, and file path matching.
 */

import { prisma } from "@ducsigr/db";
import {
  DEFAULT_LOOKBACK_DAYS,
  MIN_CHUNK_SIMILARITY,
  MAX_RELEVANT_CHUNKS,
  MAX_CHUNK_CONTENT_LENGTH,
  extractPathsFromStackTraces,
  buildSearchQuery,
} from "@ducsigr/shared";
import { searchProjectCodebase } from "../../search.activities";
import type {
  CodeCorrelationInput,
  CodeCorrelationOutput,
  RelevantCodeChunk,
} from "../../../types";
import { createEmptyCorrelationOutput } from "./helpers";
import { scoreCommits } from "./commit-scoring";
import { scorePRs } from "./pr-scoring";

/**
 * Correlates alerts with recent code changes using:
 * - Temporal proximity (exponential decay)
 * - Semantic similarity (vector search)
 * - File path matching (stack traces → changed files)
 *
 * @param input - Correlation input with trace analysis and project context
 * @returns Ranked commits, PRs, and relevant code chunks
 */
export async function correlateCodeChanges(
  input: CodeCorrelationInput
): Promise<CodeCorrelationOutput> {
  const {
    projectId,
    traceAnalysis,
    alertTriggeredAt,
    lookbackDays = DEFAULT_LOOKBACK_DAYS,
  } = input;

  const alertTime = new Date(alertTriggeredAt);
  const cutoffDate = new Date(
    alertTime.getTime() - lookbackDays * 24 * 60 * 60 * 1000
  );

  console.log(
    `[correlateCodeChanges] Starting correlation for project ${projectId}`
  );
  console.log(
    `[correlateCodeChanges] Lookback: ${lookbackDays} days (since ${cutoffDate.toISOString()})`
  );

  // 1. Check if repository exists for project
  const repo = await prisma.gitHubRepository.findUnique({
    where: { projectId },
    select: { id: true },
  });

  if (!repo) {
    console.log(
      `[correlateCodeChanges] No repository linked to project ${projectId}`
    );
    return createEmptyCorrelationOutput(false);
  }

  // 2. Build search query from trace analysis
  const searchQuery = buildSearchQuery(
    traceAnalysis.errorPatterns,
    traceAnalysis.affectedEndpoints
  );

  console.log(
    `[correlateCodeChanges] Search query: "${searchQuery.slice(0, 100)}..."`
  );

  // 3. Perform vector search to find relevant code chunks
  let relevantCodeChunks: RelevantCodeChunk[] = [];
  if (searchQuery.trim().length > 0) {
    try {
      const searchResult = await searchProjectCodebase({
        projectId,
        query: searchQuery,
        topK: MAX_RELEVANT_CHUNKS,
        minSimilarity: MIN_CHUNK_SIMILARITY,
      });

      relevantCodeChunks = searchResult.results.map((r) => ({
        filePath: r.filePath,
        content: r.content.slice(0, MAX_CHUNK_CONTENT_LENGTH),
        startLine: r.startLine,
        endLine: r.endLine,
        similarity: r.similarity,
      }));

      console.log(
        `[correlateCodeChanges] Found ${relevantCodeChunks.length} relevant code chunks`
      );
    } catch (error) {
      console.warn(`[correlateCodeChanges] Vector search failed:`, error);
      // Continue without vector search results
    }
  }

  // 4. Extract paths from stack traces for path matching
  const stackTracePaths = extractPathsFromStackTraces(
    traceAnalysis.errorPatterns.map((e) => e.stackTrace)
  );
  console.log(
    `[correlateCodeChanges] Extracted ${stackTracePaths.size} paths from stack traces`
  );

  // 5. Fetch and score commits
  const commitResult = await scoreCommits(
    repo.id,
    cutoffDate,
    alertTime,
    relevantCodeChunks,
    stackTracePaths
  );

  // 6. Fetch and score PRs
  const prResult = await scorePRs(
    repo.id,
    cutoffDate,
    alertTime,
    relevantCodeChunks,
    stackTracePaths
  );

  console.log(
    `[correlateCodeChanges] Correlation complete: ` +
      `${commitResult.commits.length}/${commitResult.totalAnalyzed} commits, ` +
      `${prResult.prs.length}/${prResult.totalAnalyzed} PRs`
  );

  return {
    suspectedCommits: commitResult.commits,
    suspectedPRs: prResult.prs,
    relevantCodeChunks,
    hasRepository: true,
    searchQuery,
    commitsAnalyzed: commitResult.totalAnalyzed,
    prsAnalyzed: prResult.totalAnalyzed,
  };
}
