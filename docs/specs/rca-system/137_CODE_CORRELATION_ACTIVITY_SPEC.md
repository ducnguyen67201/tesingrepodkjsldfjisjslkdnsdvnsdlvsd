# Engineering Spec: #137 Code Correlation Activity

**Story Points:** 8
**Priority:** P0
**Sprint:** Sprint 3 - RCA Engine
**Dependencies:** #136 (Trace Analysis Activity - Completed), Sprint 2 (Vector Search - Completed)

---

## Overview

Create an algorithm that correlates alerts with recent code changes by combining temporal proximity, vector similarity, and file path matching. This activity takes trace analysis output and finds the most likely commits/PRs that caused the issue.

---

## Acceptance Criteria

- [ ] Discovers commits within configurable time window (default: 7 days)
- [ ] Scores correlations using weighted signals (temporal: 0.3, semantic: 0.4, path: 0.3)
- [ ] Applies vector similarity for semantic analysis of error → code correlation
- [ ] Matches file paths extracted from error stack traces to changed files
- [ ] Returns ranked list of probable causes with confidence scores
- [ ] Performance: < 5 seconds for correlation analysis
- [ ] Unit tests for scoring algorithms

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      CODE CORRELATION ACTIVITY                               │
└─────────────────────────────────────────────────────────────────────────────┘

  Input: TraceAnalysisOutput + AlertContext
         │
         ▼
  ┌──────────────────────────────────────────────────────────────────────────┐
  │                          correlateCodeChanges                             │
  │                                                                           │
  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐   │
  │  │ 1. Fetch Recent │  │ 2. Build Query  │  │ 3. Vector Search        │   │
  │  │    Commits/PRs  │  │    From Errors  │  │    (existing activity)  │   │
  │  │                 │  │                 │  │                         │   │
  │  │ • GitCommit     │  │ • Error msgs    │  │ • searchProjectCodebase │   │
  │  │ • GitPullRequest│  │ • Stack traces  │  │ • Top 20 chunks         │   │
  │  │ • 7-day window  │  │ • Endpoints     │  │ • minSimilarity: 0.4    │   │
  │  └────────┬────────┘  └────────┬────────┘  └────────────┬────────────┘   │
  │           │                    │                        │                 │
  │           ▼                    ▼                        ▼                 │
  │  ┌────────────────────────────────────────────────────────────────────┐  │
  │  │                         SCORING ENGINE                              │  │
  │  │                                                                     │  │
  │  │   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │  │
  │  │   │   Temporal   │  │   Semantic   │  │  Path Match  │             │  │
  │  │   │   Score      │  │   Score      │  │  Score       │             │  │
  │  │   │              │  │              │  │              │             │  │
  │  │   │ Weight: 0.3  │  │ Weight: 0.4  │  │ Weight: 0.3  │             │  │
  │  │   │              │  │              │  │              │             │  │
  │  │   │ exp(-d/3)    │  │ max(chunk    │  │ matches /    │             │  │
  │  │   │ d = days ago │  │ similarity)  │  │ total paths  │             │  │
  │  │   └──────────────┘  └──────────────┘  └──────────────┘             │  │
  │  │                           │                                         │  │
  │  │                           ▼                                         │  │
  │  │              final_score = Σ(signal × weight)                       │  │
  │  │                                                                     │  │
  │  └────────────────────────────────────────────────────────────────────┘  │
  │                                    │                                      │
  └────────────────────────────────────┼──────────────────────────────────────┘
                                       ▼
                              Output: CodeCorrelationOutput
                              • suspectedCommits (ranked by score)
                              • suspectedPRs (ranked by score)
                              • relevantCodeChunks (from vector search)
```

---

## Data Flow

```
1. Receive TraceAnalysisOutput from analyzeTraces activity
2. Build semantic search query from error patterns + stack traces
3. Perform vector search to find relevant code chunks
4. Fetch recent commits/PRs within time window
5. For each commit:
   a. Calculate temporal score (exponential decay)
   b. Calculate semantic score (overlap with relevant chunks)
   c. Calculate path match score (stack traces → changed files)
   d. Combine scores with weights
6. Rank and return top candidates
```

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/shared/src/rca/scoring.ts` | Create | Scoring algorithm utilities |
| `packages/shared/src/rca/index.ts` | Create | Module exports |
| `apps/worker/src/temporal/activities/rca.activities.ts` | Modify | Add correlateCodeChanges activity |
| `apps/worker/src/temporal/types.ts` | Modify | Add correlation types |
| `packages/api/src/schemas/rca.ts` | Modify | Add correlation schemas |

---

## Implementation

### Phase 1: Types & Schemas

#### 1.1 Add Correlation Types

**File:** `apps/worker/src/temporal/types.ts`

```typescript
// ============================================
// Code Correlation Types
// ============================================

/**
 * Input for correlateCodeChanges activity.
 * Receives trace analysis output and project context.
 */
export interface CodeCorrelationInput {
  /** Project ID to search commits/PRs for */
  projectId: string;
  /** Trace analysis output from analyzeTraces */
  traceAnalysis: TraceAnalysisOutput;
  /** When the alert was triggered (ISO 8601 datetime) */
  alertTriggeredAt: string;
  /** Lookback window in days (default: 7) */
  lookbackDays?: number;
}

/**
 * Individual signal scores for correlation transparency.
 */
export interface CorrelationSignals {
  /** Temporal proximity score (0-1) - higher = more recent */
  temporal: number;
  /** Semantic similarity score (0-1) - higher = more related to error */
  semantic: number;
  /** File path match score (0-1) - higher = more stack trace matches */
  pathMatch: number;
}

/**
 * Correlated commit with scoring breakdown.
 */
export interface CorrelatedCommit {
  /** Commit SHA */
  sha: string;
  /** Commit message (truncated to 200 chars) */
  message: string;
  /** Author name */
  author: string;
  /** Author email */
  authorEmail: string | null;
  /** Commit timestamp (ISO 8601) */
  timestamp: string;
  /** Combined correlation score (0-1) */
  score: number;
  /** Individual signal scores */
  signals: CorrelationSignals;
  /** Files changed in this commit */
  filesChanged: string[];
}

/**
 * Correlated pull request with scoring breakdown.
 */
export interface CorrelatedPR {
  /** PR number */
  number: number;
  /** PR title */
  title: string;
  /** PR author login */
  author: string;
  /** When the PR was merged (ISO 8601) */
  mergedAt: string;
  /** Combined correlation score (0-1) */
  score: number;
  /** Individual signal scores */
  signals: CorrelationSignals;
}

/**
 * Relevant code chunk from vector search.
 */
export interface RelevantCodeChunk {
  /** File path */
  filePath: string;
  /** Code content (truncated) */
  content: string;
  /** Start line number */
  startLine: number;
  /** End line number */
  endLine: number;
  /** Cosine similarity score */
  similarity: number;
}

/**
 * Output from correlateCodeChanges activity.
 */
export interface CodeCorrelationOutput {
  /** Commits ranked by correlation score (top 10) */
  suspectedCommits: CorrelatedCommit[];
  /** PRs ranked by correlation score (top 5) */
  suspectedPRs: CorrelatedPR[];
  /** Relevant code chunks from vector search (top 20) */
  relevantCodeChunks: RelevantCodeChunk[];
  /** Whether repository was found for project */
  hasRepository: boolean;
  /** Search query used for vector search */
  searchQuery: string;
  /** Total commits analyzed */
  commitsAnalyzed: number;
  /** Total PRs analyzed */
  prsAnalyzed: number;
}
```

#### 1.2 Add Zod Schemas

**File:** `packages/api/src/schemas/rca.ts`

Add to existing file:

```typescript
// ============================================
// Code Correlation Schemas
// ============================================

export const CorrelationSignalsSchema = z.object({
  temporal: z.number().min(0).max(1),
  semantic: z.number().min(0).max(1),
  pathMatch: z.number().min(0).max(1),
});
export type CorrelationSignals = z.infer<typeof CorrelationSignalsSchema>;

export const CorrelatedCommitSchema = z.object({
  sha: z.string(),
  message: z.string().max(200),
  author: z.string(),
  authorEmail: z.string().nullable(),
  timestamp: z.string().datetime(),
  score: z.number().min(0).max(1),
  signals: CorrelationSignalsSchema,
  filesChanged: z.array(z.string()),
});
export type CorrelatedCommit = z.infer<typeof CorrelatedCommitSchema>;

export const CorrelatedPRSchema = z.object({
  number: z.number().int().positive(),
  title: z.string().max(200),
  author: z.string(),
  mergedAt: z.string().datetime(),
  score: z.number().min(0).max(1),
  signals: CorrelationSignalsSchema,
});
export type CorrelatedPR = z.infer<typeof CorrelatedPRSchema>;

export const CodeCorrelationOutputSchema = z.object({
  suspectedCommits: z.array(CorrelatedCommitSchema),
  suspectedPRs: z.array(CorrelatedPRSchema),
  relevantCodeChunks: z.array(z.object({
    filePath: z.string(),
    content: z.string(),
    startLine: z.number().int().positive(),
    endLine: z.number().int().positive(),
    similarity: z.number().min(0).max(1),
  })),
  hasRepository: z.boolean(),
  searchQuery: z.string(),
  commitsAnalyzed: z.number().int().min(0),
  prsAnalyzed: z.number().int().min(0),
});
export type CodeCorrelationOutput = z.infer<typeof CodeCorrelationOutputSchema>;
```

---

### Phase 2: Scoring Utilities

**File:** `packages/shared/src/rca/scoring.ts` (NEW)

```typescript
/**
 * RCA Scoring Utilities
 *
 * Implements the correlation scoring algorithm for mapping alerts to code changes.
 * Uses a weighted combination of temporal, semantic, and path-based signals.
 */

// ============================================
// Constants
// ============================================

/** Signal weights - MUST sum to 1.0 */
export const CORRELATION_WEIGHTS = {
  temporal: 0.3,
  semantic: 0.4,
  pathMatch: 0.3,
} as const;

/** Half-life for temporal decay in days */
export const TEMPORAL_HALF_LIFE_DAYS = 3;

/** Minimum score to include in results */
export const MIN_CORRELATION_SCORE = 0.2;

/** Maximum commits to analyze */
export const MAX_COMMITS_TO_ANALYZE = 100;

/** Maximum PRs to analyze */
export const MAX_PRS_TO_ANALYZE = 50;

/** Results limits */
export const MAX_SUSPECTED_COMMITS = 10;
export const MAX_SUSPECTED_PRS = 5;
export const MAX_RELEVANT_CHUNKS = 20;

// ============================================
// Temporal Scoring
// ============================================

/**
 * Calculate temporal score using exponential decay.
 * More recent changes get higher scores.
 *
 * Formula: exp(-daysAgo / halfLife)
 *
 * Examples:
 * - 0 days ago: 1.0
 * - 3 days ago: 0.37 (e^-1)
 * - 7 days ago: 0.10
 * - 14 days ago: 0.01
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
  relevantChunks: Array<{ filePath: string; similarity: number }>
): number {
  if (filesChanged.length === 0 || relevantChunks.length === 0) {
    return 0;
  }

  // Create a map of filePath -> max similarity
  const chunkSimilarityMap = new Map<string, number>();
  for (const chunk of relevantChunks) {
    const existing = chunkSimilarityMap.get(chunk.filePath) ?? 0;
    chunkSimilarityMap.set(chunk.filePath, Math.max(existing, chunk.similarity));
  }

  // Find the maximum similarity among changed files
  let maxSimilarity = 0;
  for (const filePath of filesChanged) {
    // Exact match
    const exactMatch = chunkSimilarityMap.get(filePath);
    if (exactMatch !== undefined) {
      maxSimilarity = Math.max(maxSimilarity, exactMatch);
      continue;
    }

    // Partial path match (e.g., commit changes "src/auth/login.ts",
    // chunk is for "auth/login.ts")
    for (const [chunkPath, similarity] of chunkSimilarityMap) {
      if (filePath.endsWith(chunkPath) || chunkPath.endsWith(filePath)) {
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
    /at\s+\S+\s+\(([^:)]+):\d+:\d+\)/g,  // at fn (path:line:col)
    /at\s+([^:(\s]+):\d+:\d+/g,          // at path:line:col
    /(?:File|Source):\s*([^\s:]+)/gi,    // File: path
    /([a-zA-Z0-9_\-./]+\.[a-z]{2,4}):\d+/g,  // path.ext:line
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
    .replace(/^\.\//, "")         // Remove leading ./
    .replace(/^\//, "")           // Remove leading /
    .replace(/\\/g, "/")          // Normalize slashes
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
      if (traceFileName === changedFileName) {
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
  signals: { temporal: number; semantic: number; pathMatch: number },
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
  errorPatterns: Array<{ message: string; stackTrace?: string }>,
  affectedEndpoints: Array<{ name: string }>,
  maxLength: number = 2000
): string {
  const parts: string[] = [];

  // Add top error messages (most impactful)
  for (const error of errorPatterns.slice(0, 3)) {
    // Clean up error message for search
    const cleaned = error.message
      .replace(/<[^>]+>/g, "")       // Remove placeholders like <UUID>
      .replace(/\d{10,}/g, "")       // Remove long numbers
      .replace(/\s+/g, " ")          // Normalize whitespace
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
    const terms = endpoint.name
      .split(/[/\-_.]/)
      .filter((t) => t.length > 2);
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
  const pattern = /at\s+([a-zA-Z_$][a-zA-Z0-9_$]*(?:\.[a-zA-Z_$][a-zA-Z0-9_$]*)*)/g;

  let match;
  while ((match = pattern.exec(stackTrace)) !== null) {
    const name = match[1];
    // Filter out generic names
    if (
      name &&
      name.length > 2 &&
      !["Object", "Array", "Function", "Promise", "async"].includes(name)
    ) {
      names.push(name);
    }
  }

  return names;
}
```

**File:** `packages/shared/src/rca/index.ts` (NEW)

```typescript
/**
 * RCA (Root Cause Analysis) Module
 *
 * Exports scoring utilities for code correlation.
 */

export {
  // Constants
  CORRELATION_WEIGHTS,
  TEMPORAL_HALF_LIFE_DAYS,
  MIN_CORRELATION_SCORE,
  MAX_COMMITS_TO_ANALYZE,
  MAX_PRS_TO_ANALYZE,
  MAX_SUSPECTED_COMMITS,
  MAX_SUSPECTED_PRS,
  MAX_RELEVANT_CHUNKS,

  // Scoring functions
  calculateTemporalScore,
  calculateSemanticScore,
  calculatePathMatchScore,
  calculateCombinedScore,

  // Utilities
  extractPathsFromStackTraces,
  buildSearchQuery,
} from "./scoring";
```

---

### Phase 3: Activity Implementation

**File:** `apps/worker/src/temporal/activities/rca.activities.ts`

Add the following to the existing file:

```typescript
import { searchProjectCodebase } from "./search.activities";
import {
  CORRELATION_WEIGHTS,
  MIN_CORRELATION_SCORE,
  MAX_COMMITS_TO_ANALYZE,
  MAX_PRS_TO_ANALYZE,
  MAX_SUSPECTED_COMMITS,
  MAX_SUSPECTED_PRS,
  MAX_RELEVANT_CHUNKS,
  calculateTemporalScore,
  calculateSemanticScore,
  calculatePathMatchScore,
  calculateCombinedScore,
  extractPathsFromStackTraces,
  buildSearchQuery,
} from "@ducsigr/shared/rca";
import type {
  CodeCorrelationInput,
  CodeCorrelationOutput,
  CorrelatedCommit,
  CorrelatedPR,
  RelevantCodeChunk,
} from "../types";

// ============================================
// Constants
// ============================================

/** Default lookback window in days */
const DEFAULT_LOOKBACK_DAYS = 7;

/** Minimum similarity for vector search results */
const MIN_CHUNK_SIMILARITY = 0.4;

// ============================================
// Activity: Correlate Code Changes
// ============================================

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
  const cutoffDate = new Date(alertTime.getTime() - lookbackDays * 24 * 60 * 60 * 1000);

  console.log(`[correlateCodeChanges] Starting correlation for project ${projectId}`);
  console.log(`[correlateCodeChanges] Lookback: ${lookbackDays} days (since ${cutoffDate.toISOString()})`);

  // 1. Check if repository exists for project
  const repo = await prisma.gitHubRepository.findUnique({
    where: { projectId },
    select: { id: true },
  });

  if (!repo) {
    console.log(`[correlateCodeChanges] No repository linked to project ${projectId}`);
    return createEmptyOutput(false);
  }

  // 2. Build search query from trace analysis
  const searchQuery = buildSearchQuery(
    traceAnalysis.errorPatterns,
    traceAnalysis.affectedEndpoints
  );

  console.log(`[correlateCodeChanges] Search query: "${searchQuery.slice(0, 100)}..."`);

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
        content: r.content.slice(0, 500), // Truncate for output
        startLine: r.startLine,
        endLine: r.endLine,
        similarity: r.similarity,
      }));

      console.log(`[correlateCodeChanges] Found ${relevantCodeChunks.length} relevant code chunks`);
    } catch (error) {
      console.warn(`[correlateCodeChanges] Vector search failed:`, error);
      // Continue without vector search results
    }
  }

  // 4. Extract paths from stack traces for path matching
  const stackTracePaths = extractPathsFromStackTraces(
    traceAnalysis.errorPatterns.map((e) => e.stackTrace)
  );
  console.log(`[correlateCodeChanges] Extracted ${stackTracePaths.size} paths from stack traces`);

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
    commitsAnalyzed: commitResult.totalAnalyzed,  // Total from DB query, not result count
    prsAnalyzed: prResult.totalAnalyzed,          // Total from DB query, not result count
  };
}

// ============================================
// Helper: Score Commits
// ============================================

interface ScoreCommitsResult {
  commits: CorrelatedCommit[];
  totalAnalyzed: number;
}

async function scoreCommits(
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

// ============================================
// Helper: Score PRs
// ============================================

interface ScorePRsResult {
  prs: CorrelatedPR[];
  totalAnalyzed: number;
}

async function scorePRs(
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

// ============================================
// Helper: Get Repository File Paths
// ============================================

/**
 * Get all indexed file paths for a repository.
 *
 * Note: This is an approximation. In a full implementation,
 * we would store the actual files changed per commit (commitSha → files mapping).
 */
async function getRepoFilePaths(repoId: string): Promise<string[]> {
  // Query distinct file paths from code chunks for this repo
  // TODO: Implement commit → files mapping for accurate results
  const chunks = await prisma.codeChunk.findMany({
    where: { repoId },
    select: { filePath: true },
    distinct: ["filePath"],
  });

  return chunks.map((c) => c.filePath);
}

// ============================================
// Helper: Create Empty Output
// ============================================

function createEmptyOutput(hasRepository: boolean): CodeCorrelationOutput {
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
```

---

### Phase 4: Activity Export

**File:** `apps/worker/src/temporal/activities/index.ts`

Add to existing exports:

```typescript
export { analyzeTraces, correlateCodeChanges } from "./rca";
```

> **Note:** Activities are now organized in a modular folder structure under `rca/`.

---

## Scoring Algorithm Details

### Signal Weights

| Signal | Weight | Rationale |
|--------|--------|-----------|
| **Temporal** | 0.3 | Recency matters, but not the most important factor |
| **Semantic** | 0.4 | Highest weight - semantic match is strongest indicator |
| **Path Match** | 0.3 | Stack traces provide direct evidence |

### Temporal Score Formula

```
score = exp(-daysAgo / halfLife)

where:
- daysAgo = (alertTime - changeTime) / (24 * 60 * 60 * 1000)
- halfLife = 3 days (configurable)
```

**Score Examples:**
| Days Ago | Score |
|----------|-------|
| 0 | 1.00 |
| 1 | 0.72 |
| 3 | 0.37 |
| 5 | 0.19 |
| 7 | 0.10 |

### Semantic Score

```
For each file changed in commit:
  Find max similarity from relevant chunks for that file
Return maximum similarity found
```

### Path Match Score

```
matches = count of stack trace paths that match changed files
score = min(matches / total_stack_trace_paths, 1.0)

Matching rules:
- Exact path match: 1.0
- Filename only match: 0.5
```

---

## Testing Strategy

### Unit Tests

**File:** `packages/shared/src/rca/__tests__/scoring.test.ts`

```typescript
import {
  calculateTemporalScore,
  calculateSemanticScore,
  calculatePathMatchScore,
  extractPathsFromStackTraces,
  buildSearchQuery,
} from "../scoring";

describe("calculateTemporalScore", () => {
  it("returns 1.0 for changes at alert time", () => {
    const now = new Date();
    expect(calculateTemporalScore(now, now)).toBeCloseTo(1.0);
  });

  it("returns ~0.37 for changes 3 days ago (half-life)", () => {
    const alertTime = new Date();
    const changeTime = new Date(alertTime.getTime() - 3 * 24 * 60 * 60 * 1000);
    expect(calculateTemporalScore(changeTime, alertTime)).toBeCloseTo(0.368, 2);
  });

  it("returns 0 for future changes", () => {
    const alertTime = new Date();
    const futureTime = new Date(alertTime.getTime() + 1000);
    expect(calculateTemporalScore(futureTime, alertTime)).toBe(0);
  });
});

describe("extractPathsFromStackTraces", () => {
  it("extracts paths from Node.js stack traces", () => {
    const stack = `Error: Something failed
    at processRequest (src/handlers/api.ts:45:12)
    at Router.handle (src/router.ts:120:8)`;

    const paths = extractPathsFromStackTraces([stack]);
    expect(paths.has("src/handlers/api.ts")).toBe(true);
    expect(paths.has("src/router.ts")).toBe(true);
  });

  it("filters out node_modules paths", () => {
    const stack = `Error
    at node_modules/express/lib/router.js:45
    at src/app.ts:10`;

    const paths = extractPathsFromStackTraces([stack]);
    expect(paths.size).toBe(1);
    expect(paths.has("src/app.ts")).toBe(true);
  });
});

describe("calculatePathMatchScore", () => {
  it("returns 1.0 for perfect match", () => {
    const changed = ["src/api.ts", "src/db.ts"];
    const stackPaths = new Set(["src/api.ts"]);

    expect(calculatePathMatchScore(changed, stackPaths)).toBe(1.0);
  });

  it("returns 0.5 for filename-only match", () => {
    const changed = ["lib/utils/api.ts"];
    const stackPaths = new Set(["src/api.ts"]);

    expect(calculatePathMatchScore(changed, stackPaths)).toBe(0.5);
  });

  it("returns 0 for no match", () => {
    const changed = ["src/foo.ts"];
    const stackPaths = new Set(["src/bar.ts"]);

    expect(calculatePathMatchScore(changed, stackPaths)).toBe(0);
  });
});
```

### Integration Tests

Test the full activity with mocked database:

```typescript
describe("correlateCodeChanges activity", () => {
  it("returns ranked commits when repository exists", async () => {
    // Mock prisma.gitHubRepository.findUnique
    // Mock prisma.gitCommit.findMany
    // Mock searchProjectCodebase

    const result = await correlateCodeChanges({
      projectId: "test-project",
      traceAnalysis: mockTraceAnalysis,
      alertTriggeredAt: new Date().toISOString(),
    });

    expect(result.hasRepository).toBe(true);
    expect(result.suspectedCommits.length).toBeGreaterThan(0);
    expect(result.suspectedCommits[0].score).toBeGreaterThan(0);
  });

  it("returns empty results when no repository linked", async () => {
    // Mock prisma.gitHubRepository.findUnique to return null

    const result = await correlateCodeChanges({
      projectId: "no-repo-project",
      traceAnalysis: mockTraceAnalysis,
      alertTriggeredAt: new Date().toISOString(),
    });

    expect(result.hasRepository).toBe(false);
    expect(result.suspectedCommits).toEqual([]);
  });
});
```

---

## Performance Considerations

| Operation | Expected Time | Notes |
|-----------|--------------|-------|
| Vector search | < 500ms | pgvector with HNSW index |
| Commit fetch | < 100ms | Indexed by repoId + timestamp |
| PR fetch | < 100ms | Indexed by repoId + mergedAt |
| Scoring (100 commits) | < 50ms | Pure computation |
| **Total** | < 1 second | Well under 5s requirement |

### Optimization Opportunities

1. **Parallel queries**: Fetch commits and PRs in parallel
2. **Chunk file caching**: Cache commit → files mapping
3. **Early termination**: Stop if high-confidence match found early

---

## Error Handling

| Scenario | Handling |
|----------|----------|
| No repository linked | Return empty results with `hasRepository: false` |
| Vector search fails | Log warning, continue with temporal + path scoring only |
| No commits in window | Return empty `suspectedCommits` array |
| Database error | Throw and let Temporal retry |

---

## Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| Sprint 2 (Vector Search) | ✅ Done | `searchProjectCodebase` available |
| Trace Analysis (#136) | ✅ Done | `TraceAnalysisOutput` types |
| GitCommit model | ✅ Exists | Schema in place |
| GitPullRequest model | ✅ Exists | Schema in place |
| CodeChunk model | ✅ Exists | For file tracking |

---

## Definition of Done

- [ ] `correlateCodeChanges` activity implemented
- [ ] Scoring utilities in `packages/shared/src/rca/scoring.ts`
- [ ] Types and schemas defined
- [ ] Unit tests for scoring algorithms
- [ ] Integration tests with mocked database
- [ ] Performance < 5 seconds per correlation
- [ ] Exported from activities index
- [ ] Documentation updated

---

## Future Enhancements

1. **Commit-file tracking**: Store direct mapping of commit → files changed for accurate file attribution
2. **Blame integration**: Use git blame to identify exact lines changed
3. **ML-based scoring**: Train model on confirmed RCAs to improve weights
4. **Cross-repo correlation**: Support monorepo with multiple services
