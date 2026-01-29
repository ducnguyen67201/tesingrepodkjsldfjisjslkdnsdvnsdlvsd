/**
 * RCA (Root Cause Analysis) Constants
 *
 * Configuration constants for the code correlation scoring algorithm.
 */

// ============================================
// Signal Weights
// ============================================

/**
 * Weights for combining correlation signals.
 * MUST sum to 1.0 for proper normalization.
 *
 * - temporal: Recency of code change (exponential decay)
 * - semantic: Vector similarity between error context and code
 * - pathMatch: Stack trace paths matching changed files
 */
export const CORRELATION_WEIGHTS = {
  temporal: 0.3,
  semantic: 0.4,
  pathMatch: 0.3,
} as const;

// ============================================
// Temporal Scoring
// ============================================

/**
 * Half-life for temporal decay scoring in days.
 *
 * Score examples with 3-day half-life:
 * - 0 days ago: 1.0
 * - 3 days ago: 0.37 (e^-1)
 * - 7 days ago: 0.10
 * - 14 days ago: 0.01
 */
export const TEMPORAL_HALF_LIFE_DAYS = 3;

/**
 * Default lookback window for finding commits/PRs.
 */
export const DEFAULT_LOOKBACK_DAYS = 7;

// ============================================
// Result Filtering
// ============================================

/**
 * Minimum correlation score to include in results.
 * Filters out noise from low-confidence matches.
 */
export const MIN_CORRELATION_SCORE = 0.2;

/**
 * Minimum similarity threshold for vector search results.
 */
export const MIN_CHUNK_SIMILARITY = 0.4;

// ============================================
// Query Limits
// ============================================

/**
 * Maximum commits to analyze for correlation.
 * Balances thoroughness with performance.
 */
export const MAX_COMMITS_TO_ANALYZE = 100;

/**
 * Maximum pull requests to analyze for correlation.
 */
export const MAX_PRS_TO_ANALYZE = 50;

// ============================================
// Result Limits
// ============================================

/**
 * Maximum suspected commits to return in results.
 */
export const MAX_SUSPECTED_COMMITS = 10;

/**
 * Maximum suspected PRs to return in results.
 */
export const MAX_SUSPECTED_PRS = 5;

/**
 * Maximum relevant code chunks to return from vector search.
 */
export const MAX_RELEVANT_CHUNKS = 20;

/**
 * Maximum length for code chunk content in output.
 * Truncates to reduce payload size.
 */
export const MAX_CHUNK_CONTENT_LENGTH = 500;

/**
 * Maximum length for search query string.
 */
export const MAX_SEARCH_QUERY_LENGTH = 2000;
