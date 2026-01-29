/**
 * RCA Scoring Utilities
 *
 * Implements the correlation scoring algorithm for mapping alerts to code changes.
 * Uses a weighted combination of temporal, semantic, and path-based signals.
 */

import {
  CORRELATION_WEIGHTS,
  TEMPORAL_HALF_LIFE_DAYS,
  MAX_SEARCH_QUERY_LENGTH,
} from "./constants";

// ============================================
// Constants
// ============================================

/**
 * Regex pattern to extract function names from stack traces.
 * Matches patterns like: "at functionName" or "at Module.functionName"
 */
const STACK_TRACE_FUNCTION_PATTERN =
  /at\s+([a-zA-Z_$][a-zA-Z0-9_$]*(?:\.[a-zA-Z_$][a-zA-Z0-9_$]*)*)/g;

/** Generic function names to filter out from stack traces */
const GENERIC_FUNCTION_NAMES = [
  "Object",
  "Array",
  "Function",
  "Promise",
  "async",
  "Module",
];

// ============================================
// Types
// ============================================

/** Individual correlation signal scores */
export interface CorrelationSignals {
  temporal: number;
  semantic: number;
  pathMatch: number;
}

/** Chunk with similarity score for semantic scoring */
export interface SimilarityChunk {
  filePath: string;
  similarity: number;
}

/** Error pattern for query building */
export interface ErrorPatternInput {
  message: string;
  stackTrace?: string;
}

/** Endpoint for query building */
export interface EndpointInput {
  name: string;
}

// ============================================
// Temporal Scoring
// ============================================

/**
 * Calculate temporal score using exponential decay.
 * More recent changes get higher scores.
 *
 * Formula: exp(-daysAgo / halfLife)
 *
 * @param changeTime - When the change occurred
 * @param alertTime - When the alert triggered
 * @param halfLife - Half-life in days (default: 3)
 * @returns Score between 0 and 1
 */
export function calculateTemporalScore(
  changeTime: Date,
  alertTime: Date,
  halfLife: number = TEMPORAL_HALF_LIFE_DAYS
): number {
  const diffMs = alertTime.getTime() - changeTime.getTime();

  // Future changes get score of 0
  if (diffMs < 0) return 0;

  const daysAgo = diffMs / (24 * 60 * 60 * 1000);
  return Math.exp(-daysAgo / halfLife);
}

// ============================================
// Semantic Scoring
// ============================================

/**
 * Calculate semantic score based on overlap between changed files
 * and relevant code chunks from vector search.
 *
 * For each file changed in the commit, find the max similarity
 * score from relevant chunks for that file.
 *
 * @param filesChanged - List of file paths changed in commit
 * @param relevantChunks - Chunks from vector search with similarity scores
 * @returns Score between 0 and 1
 */
export function calculateSemanticScore(
  filesChanged: string[],
  relevantChunks: SimilarityChunk[]
): number {
  if (filesChanged.length === 0 || relevantChunks.length === 0) {
    return 0;
  }

  // Create a map of filePath -> max similarity
  const chunkSimilarityMap = new Map<string, number>();
  for (const chunk of relevantChunks) {
    const normalizedPath = normalizePath(chunk.filePath);
    const existing = chunkSimilarityMap.get(normalizedPath) ?? 0;
    chunkSimilarityMap.set(normalizedPath, Math.max(existing, chunk.similarity));
  }

  // Find the maximum similarity among changed files
  let maxSimilarity = 0;
  for (const filePath of filesChanged) {
    const normalizedFilePath = normalizePath(filePath);

    // Exact match
    const exactMatch = chunkSimilarityMap.get(normalizedFilePath);
    if (exactMatch !== undefined) {
      maxSimilarity = Math.max(maxSimilarity, exactMatch);
      continue;
    }

    // Partial path match (e.g., commit changes "src/auth/login.ts",
    // chunk is for "auth/login.ts")
    for (const [chunkPath, similarity] of chunkSimilarityMap) {
      if (
        normalizedFilePath.endsWith(chunkPath) ||
        chunkPath.endsWith(normalizedFilePath)
      ) {
        maxSimilarity = Math.max(maxSimilarity, similarity * 0.9); // Slight penalty
      }
    }
  }

  return maxSimilarity;
}

// ============================================
// Path Match Scoring
// ============================================

/**
 * Extract file paths from stack traces.
 *
 * Looks for patterns like:
 * - at functionName (path/to/file.ts:123:45)
 * - at path/to/file.ts:123
 * - File: path/to/file.ts
 *
 * @param stackTraces - Array of stack trace strings
 * @returns Set of unique file paths extracted
 */
export function extractPathsFromStackTraces(
  stackTraces: Array<string | undefined>
): Set<string> {
  const paths = new Set<string>();

  // Patterns to extract file paths
  const patterns = [
    /at\s+\S+\s+\(([^:)]+):\d+:\d+\)/g, // at fn (path:line:col)
    /at\s+([^:(\s]+):\d+:\d+/g, // at path:line:col
    /(?:File|Source):\s*([^\s:]+)/gi, // File: path
    /([a-zA-Z0-9_\-./]+\.[a-z]{2,4}):\d+/g, // path.ext:line
  ];

  for (const stack of stackTraces) {
    if (!stack) continue;

    for (const pattern of patterns) {
      // Reset pattern for each stack
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(stack)) !== null) {
        const path = match[1];
        if (path && isValidFilePath(path)) {
          paths.add(normalizePath(path));
        }
      }
    }
  }

  return paths;
}

/**
 * Check if a string looks like a valid file path.
 */
function isValidFilePath(path: string): boolean {
  // Must have an extension
  if (!path.includes(".")) return false;

  // Filter out common non-file patterns
  const excludePatterns = [
    "node_modules",
    "<anonymous>",
    "internal/",
    "native ",
    "node:",
  ];

  return !excludePatterns.some((p) => path.includes(p));
}

/**
 * Normalize file path for comparison.
 */
function normalizePath(path: string): string {
  return path
    .replace(/^\.\//, "") // Remove leading ./
    .replace(/^\//, "") // Remove leading /
    .replace(/\\/g, "/") // Normalize slashes
    .toLowerCase();
}

/**
 * Calculate path match score based on overlap between
 * changed files and paths extracted from stack traces.
 *
 * @param filesChanged - List of file paths changed in commit
 * @param stackTracePaths - Paths extracted from error stack traces
 * @returns Score between 0 and 1
 */
export function calculatePathMatchScore(
  filesChanged: string[],
  stackTracePaths: Set<string>
): number {
  if (filesChanged.length === 0 || stackTracePaths.size === 0) {
    return 0;
  }

  // Normalize changed files for comparison
  const normalizedChanges = new Set(filesChanged.map(normalizePath));

  let matchCount = 0;
  for (const tracePath of stackTracePaths) {
    // Exact match
    if (normalizedChanges.has(tracePath)) {
      matchCount++;
      continue;
    }

    // Partial match (file name only)
    const traceFileName = tracePath.split("/").pop() ?? "";
    for (const changedPath of normalizedChanges) {
      const changedFileName = changedPath.split("/").pop() ?? "";
      if (traceFileName === changedFileName && traceFileName.length > 0) {
        matchCount += 0.5; // Partial credit for filename match
        break;
      }
    }
  }

  // Score is ratio of matches to total stack trace paths
  return Math.min(matchCount / stackTracePaths.size, 1);
}

// ============================================
// Combined Scoring
// ============================================

/**
 * Calculate the combined correlation score.
 *
 * @param signals - Individual signal scores
 * @param weights - Signal weights (must sum to 1)
 * @returns Combined score between 0 and 1
 */
export function calculateCombinedScore(
  signals: CorrelationSignals,
  weights: typeof CORRELATION_WEIGHTS = CORRELATION_WEIGHTS
): number {
  return (
    signals.temporal * weights.temporal +
    signals.semantic * weights.semantic +
    signals.pathMatch * weights.pathMatch
  );
}

// ============================================
// Query Building
// ============================================

/**
 * Build a semantic search query from trace analysis output.
 * Combines error messages, endpoints, and stack trace snippets.
 *
 * @param errorPatterns - Error patterns from trace analysis
 * @param affectedEndpoints - Affected endpoints from trace analysis
 * @param maxLength - Maximum query length (default: 2000)
 * @returns Search query string
 */
export function buildSearchQuery(
  errorPatterns: ErrorPatternInput[],
  affectedEndpoints: EndpointInput[],
  maxLength: number = MAX_SEARCH_QUERY_LENGTH
): string {
  const parts: string[] = [];

  // Add top error messages (most impactful)
  for (const error of errorPatterns.slice(0, 3)) {
    // Clean up error message for search
    const cleaned = error.message
      .replace(/<[^>]+>/g, "") // Remove placeholders like <UUID>
      .replace(/\d{10,}/g, "") // Remove long numbers
      .replace(/\s+/g, " ") // Normalize whitespace
      .trim();

    if (cleaned.length > 10) {
      parts.push(cleaned);
    }

    // Add unique identifiers from stack trace
    if (error.stackTrace) {
      const functions = extractFunctionNames(error.stackTrace);
      parts.push(...functions.slice(0, 3));
    }
  }

  // Add affected endpoint names
  for (const endpoint of affectedEndpoints.slice(0, 5)) {
    // Convert endpoint path to searchable terms
    const terms = endpoint.name.split(/[/\-_.]/).filter((t) => t.length > 2);
    parts.push(...terms);
  }

  // Deduplicate and join
  const unique = [...new Set(parts)];
  let query = unique.join(" ");

  // Truncate if needed
  if (query.length > maxLength) {
    query = query.slice(0, maxLength);
  }

  return query;
}

/**
 * Extract function names from stack trace.
 */
function extractFunctionNames(stackTrace: string): string[] {
  const names: string[] = [];
  // Create fresh regex instance (global regex is stateful)
  const pattern = new RegExp(STACK_TRACE_FUNCTION_PATTERN.source, "g");

  let match;
  while ((match = pattern.exec(stackTrace)) !== null) {
    const name = match[1];
    // Filter out generic names
    if (
      name &&
      name.length > 2 &&
      !GENERIC_FUNCTION_NAMES.includes(name)
    ) {
      names.push(name);
    }
  }

  return names;
}
