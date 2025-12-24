/**
 * Code Chunking Module
 *
 * Main entry point for the code chunking system.
 * Provides intelligent chunking that preserves semantic boundaries.
 */

import { createHash } from "crypto";
import type { ChunkInput, ChunkOptions, CodeChunk } from "./types";
import {
  EXTENSION_TO_LANGUAGE,
  TS_LANGUAGES,
  HEURISTIC_LANGUAGES,
  EXCLUDED_PATH_PATTERNS,
} from "./constants";
import { chunkTypeScript } from "./typescript";
import { chunkHeuristic } from "./heuristic";
import { chunkFallback } from "./fallback";

/**
 * Detect programming language from file path
 */
export function detectLanguage(filePath: string): string | null {
  const lastDot = filePath.lastIndexOf(".");
  if (lastDot === -1) return null;
  const ext = filePath.substring(lastDot);
  return EXTENSION_TO_LANGUAGE[ext] ?? null;
}

/**
 * Generate SHA-256 hash of content for deduplication
 */
export function generateContentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Check if a file should be indexed based on extension and path patterns
 */
export function shouldIndexFile(path: string): boolean {
  // Check excluded patterns (from constants)
  for (const pattern of EXCLUDED_PATH_PATTERNS) {
    if (pattern.test(path)) {
      return false;
    }
  }

  // Check for supported extension
  return detectLanguage(path) !== null;
}

/**
 * Main chunking function
 *
 * Intelligently splits code files into semantic chunks, preserving
 * function and class boundaries when possible.
 *
 * @param input - Chunking input with content, filePath, and optional language
 * @param options - Optional chunking options (max/min lines, max bytes)
 * @returns Array of code chunks with content hashes
 *
 * @example
 * ```typescript
 * const chunks = chunkCode({
 *   content: "function foo() { return 1; }",
 *   filePath: "src/utils.ts",
 * });
 * ```
 */
export function chunkCode(
  input: ChunkInput,
  options: ChunkOptions = {}
): CodeChunk[] {
  const { content, filePath, language: inputLang } = input;
  const language = inputLang ?? detectLanguage(filePath);

  // Select chunking strategy based on language
  let chunks: CodeChunk[];

  if (language && (TS_LANGUAGES as readonly string[]).includes(language)) {
    // TypeScript/JavaScript - use heuristic pattern matching
    chunks = chunkTypeScript(content, filePath, language, options);
  } else if (language && (HEURISTIC_LANGUAGES as readonly string[]).includes(language)) {
    // Python/Go - use language-specific heuristics
    chunks = chunkHeuristic(content, filePath, language, options);
  } else {
    // Unknown language - use line-based fallback
    chunks = chunkFallback(content, filePath, language, options);
  }

  // Generate content hashes for all chunks
  return chunks.map((chunk) => ({
    ...chunk,
    contentHash: chunk.contentHash || generateContentHash(chunk.content),
  }));
}

// Re-export types
export type { CodeChunk, ChunkInput, ChunkOptions, ChunkType } from "./types";

// Re-export constants
export { CHUNK_DEFAULTS, EXTENSION_TO_LANGUAGE } from "./constants";

// Re-export individual chunkers for advanced use cases
export { chunkTypeScript } from "./typescript";
export { chunkHeuristic } from "./heuristic";
export { chunkFallback } from "./fallback";
