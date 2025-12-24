/**
 * Heuristic Chunker
 *
 * Uses regex patterns to detect function/class boundaries for Python and Go.
 * Falls back to line-based chunking if patterns don't match well.
 */

import type { CodeChunk, ChunkOptions, RawChunk } from "./types";
import { CHUNK_DEFAULTS } from "./constants";
import { chunkFallback } from "./fallback";

interface ResolvedOptions {
  maxLines: number;
  maxBytes: number;
  minLines: number;
}

/**
 * Resolve options with defaults
 */
function resolveOptions(options: ChunkOptions): ResolvedOptions {
  return {
    maxLines: options.maxLines ?? CHUNK_DEFAULTS.MAX_LINES,
    maxBytes: options.maxBytes ?? CHUNK_DEFAULTS.MAX_BYTES,
    minLines: options.minLines ?? CHUNK_DEFAULTS.MIN_LINES,
  };
}

/**
 * Pattern definitions for different languages
 */
interface LanguagePatterns {
  functionStart: RegExp;
  classStart: RegExp;
  blockEnd?: RegExp;
}

const PYTHON_PATTERNS: LanguagePatterns = {
  functionStart: /^(async\s+)?def\s+\w+\s*\(/,
  classStart: /^class\s+\w+/,
};

const GO_PATTERNS: LanguagePatterns = {
  functionStart: /^func\s+(\([^)]*\)\s*)?\w+\s*\(/,
  classStart: /^type\s+\w+\s+struct\s*\{/,
};

/**
 * Get patterns for a language
 */
function _getPatternsForLanguage(language: string): LanguagePatterns | null {
  switch (language) {
    case "python":
      return PYTHON_PATTERNS;
    case "go":
      return GO_PATTERNS;
    default:
      return null;
  }
}

/**
 * Detect indentation level of a line
 */
function getIndentation(line: string): number {
  const match = line.match(/^(\s*)/);
  return match?.[1]?.length ?? 0;
}

/**
 * Find the end of a Python function/class by tracking indentation
 */
function findPythonBlockEnd(
  lines: string[],
  startIndex: number,
  startIndent: number
): number {
  for (let i = startIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;

    // Skip empty lines and comments
    if (line.trim() === "" || line.trim().startsWith("#")) {
      continue;
    }

    const indent = getIndentation(line);
    // Block ends when we hit a line at same or lower indentation
    if (indent <= startIndent && line.trim() !== "") {
      return i - 1;
    }
  }
  return lines.length - 1;
}

/**
 * Find the end of a Go function/struct by counting braces
 */
function findGoBraceEnd(lines: string[], startIndex: number): number {
  let braceCount = 0;
  let foundOpen = false;

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i] ?? "";
    for (const char of line) {
      if (char === "{") {
        braceCount++;
        foundOpen = true;
      } else if (char === "}") {
        braceCount--;
      }
    }
    if (foundOpen && braceCount === 0) {
      return i;
    }
  }
  return lines.length - 1;
}

/**
 * Chunk Python code using indentation-based detection
 */
function chunkPython(
  content: string,
  _filePath: string,
  _opts: ResolvedOptions
): RawChunk[] {
  const lines = content.split("\n");
  const patterns = PYTHON_PATTERNS;
  const chunks: RawChunk[] = [];
  let currentStart = 0;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();

    // Check for function or class start at top level (no indentation)
    const isFunction = patterns.functionStart.test(trimmed);
    const isClass = patterns.classStart.test(trimmed);
    const indent = getIndentation(line);

    if ((isFunction || isClass) && indent === 0) {
      // If we have content before this, create a chunk for it
      if (i > currentStart) {
        const prevContent = lines.slice(currentStart, i).join("\n");
        if (prevContent.trim()) {
          chunks.push({
            startLine: currentStart + 1,
            endLine: i,
            content: prevContent,
            chunkType: "block",
          });
        }
      }

      // Find the end of this function/class
      const blockEnd = findPythonBlockEnd(lines, i, indent);

      chunks.push({
        startLine: i + 1,
        endLine: blockEnd + 1,
        content: lines.slice(i, blockEnd + 1).join("\n"),
        chunkType: isClass ? "class" : "function",
      });

      currentStart = blockEnd + 1;
      i = blockEnd + 1;
    } else {
      i++;
    }
  }

  // Handle remaining content
  if (currentStart < lines.length) {
    const remaining = lines.slice(currentStart).join("\n");
    if (remaining.trim()) {
      chunks.push({
        startLine: currentStart + 1,
        endLine: lines.length,
        content: remaining,
        chunkType: "block",
      });
    }
  }

  return chunks;
}

/**
 * Chunk Go code using brace matching
 */
function chunkGo(
  content: string,
  _filePath: string,
  _opts: ResolvedOptions
): RawChunk[] {
  const lines = content.split("\n");
  const patterns = GO_PATTERNS;
  const chunks: RawChunk[] = [];
  let currentStart = 0;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();

    // Check for function or type start
    const isFunction = patterns.functionStart.test(trimmed);
    const isClass = patterns.classStart.test(trimmed);

    if (isFunction || isClass) {
      // If we have content before this, create a chunk for it
      if (i > currentStart) {
        const prevContent = lines.slice(currentStart, i).join("\n");
        if (prevContent.trim()) {
          chunks.push({
            startLine: currentStart + 1,
            endLine: i,
            content: prevContent,
            chunkType: "block",
          });
        }
      }

      // Find the end of this function/struct
      const blockEnd = findGoBraceEnd(lines, i);

      chunks.push({
        startLine: i + 1,
        endLine: blockEnd + 1,
        content: lines.slice(i, blockEnd + 1).join("\n"),
        chunkType: isClass ? "class" : "function",
      });

      currentStart = blockEnd + 1;
      i = blockEnd + 1;
    } else {
      i++;
    }
  }

  // Handle remaining content
  if (currentStart < lines.length) {
    const remaining = lines.slice(currentStart).join("\n");
    if (remaining.trim()) {
      chunks.push({
        startLine: currentStart + 1,
        endLine: lines.length,
        content: remaining,
        chunkType: "block",
      });
    }
  }

  return chunks;
}

/**
 * Enforce chunk size limits by splitting large chunks
 */
function enforceSizeLimits(
  chunks: RawChunk[],
  lines: string[],
  opts: ResolvedOptions
): RawChunk[] {
  const result: RawChunk[] = [];

  for (const chunk of chunks) {
    const chunkLines = chunk.content.split("\n");

    if (chunkLines.length <= opts.maxLines && chunk.content.length <= opts.maxBytes) {
      result.push(chunk);
      continue;
    }

    // Split large chunk
    let start = 0;
    while (start < chunkLines.length) {
      const end = Math.min(start + opts.maxLines, chunkLines.length);
      const subContent = chunkLines.slice(start, end).join("\n");

      result.push({
        startLine: chunk.startLine + start,
        endLine: chunk.startLine + end - 1,
        content: subContent,
        chunkType: "block", // Downgrade to block when splitting
      });

      start = end;
    }
  }

  return result;
}

/**
 * Chunk code using heuristic patterns
 */
export function chunkHeuristic(
  content: string,
  filePath: string,
  language: string | null,
  options: ChunkOptions = {}
): CodeChunk[] {
  const opts = resolveOptions(options);
  const lines = content.split("\n");

  // If file is small enough, return as single chunk
  if (lines.length <= opts.maxLines && content.length <= opts.maxBytes) {
    return [
      {
        filePath,
        startLine: 1,
        endLine: lines.length,
        content,
        contentHash: "",
        language,
        chunkType: "module",
      },
    ];
  }

  // Try language-specific chunking
  let chunks: RawChunk[];
  if (language === "python") {
    chunks = chunkPython(content, filePath, opts);
  } else if (language === "go") {
    chunks = chunkGo(content, filePath, opts);
  } else {
    // Fall back to line-based
    return chunkFallback(content, filePath, language, options);
  }

  // If no chunks found or only one large chunk, use fallback
  if (chunks.length === 0) {
    return chunkFallback(content, filePath, language, options);
  }

  // Enforce size limits
  chunks = enforceSizeLimits(chunks, lines, opts);

  // Convert to CodeChunk format
  return chunks.map((chunk) => ({
    filePath,
    startLine: chunk.startLine,
    endLine: chunk.endLine,
    content: chunk.content,
    contentHash: "",
    language,
    chunkType: chunk.chunkType,
  }));
}
