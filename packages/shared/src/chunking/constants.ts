/**
 * Code Chunking Constants
 */

/**
 * Default chunking limits
 */
export const CHUNK_DEFAULTS = {
  MAX_LINES: 500,
  MAX_BYTES: 10 * 1024, // 10KB
  MIN_LINES: 10,
} as const;

/**
 * Language detection mapping from file extension
 */
export const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".go": "go",
  ".rs": "rust",
  ".java": "java",
};

/**
 * Languages with TypeScript/JavaScript heuristic chunking
 * Note: Uses pattern matching, not true AST parsing.
 * Future: Add @typescript-eslint/parser for AST-based chunking.
 */
export const TS_LANGUAGES = ["typescript", "javascript"] as const;

/**
 * Languages with heuristic chunking support (Python/Go)
 */
export const HEURISTIC_LANGUAGES = ["python", "go"] as const;

/**
 * Excluded path patterns for indexing
 */
export const EXCLUDED_PATH_PATTERNS = [
  /node_modules/,
  /\.git\//,
  /dist\//,
  /build\//,
  /\.next\//,
  /\.min\./,
  /package-lock\.json$/,
  /pnpm-lock\.yaml$/,
  /yarn\.lock$/,
  /\.d\.ts$/,
] as const;
