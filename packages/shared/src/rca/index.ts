/**
 * RCA (Root Cause Analysis) Module
 *
 * Provides scoring utilities for correlating alerts with code changes.
 * Used by the correlateCodeChanges activity in the worker.
 */

// ============================================
// Constants
// ============================================

export {
  CORRELATION_WEIGHTS,
  TEMPORAL_HALF_LIFE_DAYS,
  DEFAULT_LOOKBACK_DAYS,
  MIN_CORRELATION_SCORE,
  MIN_CHUNK_SIMILARITY,
  MAX_COMMITS_TO_ANALYZE,
  MAX_PRS_TO_ANALYZE,
  MAX_SUSPECTED_COMMITS,
  MAX_SUSPECTED_PRS,
  MAX_RELEVANT_CHUNKS,
  MAX_CHUNK_CONTENT_LENGTH,
  MAX_SEARCH_QUERY_LENGTH,
} from "./constants";

// ============================================
// Scoring Functions
// ============================================

export {
  // Temporal scoring
  calculateTemporalScore,

  // Semantic scoring
  calculateSemanticScore,

  // Path match scoring
  extractPathsFromStackTraces,
  calculatePathMatchScore,

  // Combined scoring
  calculateCombinedScore,

  // Query building
  buildSearchQuery,
} from "./scoring";

// ============================================
// Types
// ============================================

export type {
  CorrelationSignals,
  SimilarityChunk,
  ErrorPatternInput,
  EndpointInput,
} from "./scoring";
