/**
 * Correlation Helpers
 *
 * Utility functions for code correlation activity.
 */

import type { CodeCorrelationOutput } from "../../../types";

/**
 * Create empty correlation output when no repository is linked.
 */
export function createEmptyCorrelationOutput(
  hasRepository: boolean
): CodeCorrelationOutput {
  return {
    suspectedCommits: [],
    suspectedPRs: [],
    relevantCodeChunks: [],
    hasRepository,
    searchQuery: "",
    commitsAnalyzed: 0,
    prsAnalyzed: 0,
  };
}
