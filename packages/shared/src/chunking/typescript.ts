/**
 * TypeScript/JavaScript Chunker
 *
 * Uses heuristic patterns to detect function/class boundaries in TS/JS code.
 * This approach is simpler than AST parsing and handles most common cases well.
 *
 * Future enhancement: Add @typescript-eslint/parser for true AST-based chunking.
 */

import type { CodeChunk, ChunkOptions, RawChunk, ChunkType } from "./types";
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
 * Patterns for detecting TypeScript/JavaScript constructs
 */
const TS_PATTERNS = {
  // Function declarations: function foo(), async function foo()
  functionDecl: /^(export\s+)?(async\s+)?function\s+\w+\s*[<(]/,
  // Arrow function assignments: const foo = () =>, export const foo = () =>
  arrowFunction: /^(export\s+)?(const|let|var)\s+\w+\s*[=:][^=]*=>/,
  // Class declarations: class Foo, export class Foo
  classDecl: /^(export\s+)?(abstract\s+)?class\s+\w+/,
  // Interface declarations: interface Foo
  interfaceDecl: /^(export\s+)?interface\s+\w+/,
  // Type declarations: type Foo =
  typeDecl: /^(export\s+)?type\s+\w+\s*[<=]/,
  // Enum declarations: enum Foo
  enumDecl: /^(export\s+)?(const\s+)?enum\s+\w+/,
  // Export default: export default function/class
  exportDefault: /^export\s+default\s+(function|class|async\s+function)/,
};

/**
 * Determine chunk type from matched pattern
 */
function getChunkType(line: string): ChunkType {
  if (TS_PATTERNS.classDecl.test(line) || (TS_PATTERNS.exportDefault.test(line) && line.includes("class"))) {
    return "class";
  }
  if (
    TS_PATTERNS.functionDecl.test(line) ||
    TS_PATTERNS.arrowFunction.test(line) ||
    TS_PATTERNS.exportDefault.test(line)
  ) {
    return "function";
  }
  if (TS_PATTERNS.interfaceDecl.test(line) || TS_PATTERNS.typeDecl.test(line)) {
    return "class"; // Treat interfaces/types as class-like for chunking purposes
  }
  return "block";
}

/**
 * Check if a line starts a new top-level construct
 */
function isConstructStart(line: string): boolean {
  const trimmed = line.trim();
  return (
    TS_PATTERNS.functionDecl.test(trimmed) ||
    TS_PATTERNS.arrowFunction.test(trimmed) ||
    TS_PATTERNS.classDecl.test(trimmed) ||
    TS_PATTERNS.interfaceDecl.test(trimmed) ||
    TS_PATTERNS.typeDecl.test(trimmed) ||
    TS_PATTERNS.enumDecl.test(trimmed) ||
    TS_PATTERNS.exportDefault.test(trimmed)
  );
}

/**
 * Find the end of a brace-delimited block
 */
function findBraceEnd(lines: string[], startIndex: number): number {
  let braceCount = 0;
  let foundOpen = false;
  let inString = false;
  let stringChar = "";
  let inTemplate = false;

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i] ?? "";

    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      const prevChar = j > 0 ? line[j - 1] : "";

      // Handle string literals
      if (!inTemplate && (char === '"' || char === "'" || char === "`") && prevChar !== "\\") {
        if (!inString) {
          inString = true;
          stringChar = char ?? "";
          if (char === "`") {
            inTemplate = true;
            // templateDepth tracking reserved for future nested template support
          }
        } else if (char === stringChar) {
          inString = false;
          stringChar = "";
          if (char === "`") {
            inTemplate = false;
          }
        }
        continue;
      }

      // Skip content inside strings
      if (inString) continue;

      // Count braces
      if (char === "{") {
        braceCount++;
        foundOpen = true;
      } else if (char === "}") {
        braceCount--;
      }

      // Check for block end
      if (foundOpen && braceCount === 0) {
        return i;
      }
    }
  }

  return lines.length - 1;
}

/**
 * Find the end of a type/interface declaration
 * These can span multiple lines without braces (union types, etc.)
 */
function findTypeEnd(lines: string[], startIndex: number): number {
  const startLine = lines[startIndex] ?? "";

  // If it has an opening brace, find the matching close
  if (startLine.includes("{")) {
    return findBraceEnd(lines, startIndex);
  }

  // For simple type aliases, find the end of the statement
  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i] ?? "";
    // Type ends at semicolon (if present) or at next construct
    if (line.includes(";")) {
      return i;
    }
    // Check if next line starts a new construct
    if (i > startIndex && isConstructStart(line)) {
      return i - 1;
    }
  }

  return lines.length - 1;
}

/**
 * Chunk TypeScript/JavaScript code
 */
function chunkTypeScriptCode(
  content: string,
  _filePath: string,
  _opts: ResolvedOptions
): RawChunk[] {
  const lines = content.split("\n");
  const chunks: RawChunk[] = [];
  let currentStart = 0;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();

    // Skip empty lines and comments at the start
    if (i === currentStart && (trimmed === "" || trimmed.startsWith("//"))) {
      currentStart++;
      i++;
      continue;
    }

    // Check for construct start (must be at start of line or after 'export')
    if (isConstructStart(trimmed)) {
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

      // Determine the type and find the end
      const chunkType = getChunkType(trimmed);
      let blockEnd: number;

      if (TS_PATTERNS.typeDecl.test(trimmed) && !trimmed.includes("{")) {
        blockEnd = findTypeEnd(lines, i);
      } else {
        blockEnd = findBraceEnd(lines, i);
      }

      chunks.push({
        startLine: i + 1,
        endLine: blockEnd + 1,
        content: lines.slice(i, blockEnd + 1).join("\n"),
        chunkType,
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
 * Merge small chunks to meet minimum size
 */
function mergeSmallChunks(
  chunks: RawChunk[],
  opts: ResolvedOptions
): RawChunk[] {
  if (chunks.length <= 1) return chunks;

  const merged: RawChunk[] = [];
  let current: RawChunk | null = null;

  for (const chunk of chunks) {
    if (!current) {
      current = { ...chunk };
      continue;
    }

    const currentLineCount = current.endLine - current.startLine + 1;
    const chunkLineCount = chunk.endLine - chunk.startLine + 1;

    // If current is too small and merging won't exceed limits
    if (currentLineCount < opts.minLines) {
      const mergedLineCount = currentLineCount + chunkLineCount;
      const currentContent = current.content;
      const mergedContent: string = currentContent + "\n" + chunk.content;

      if (mergedLineCount <= opts.maxLines && mergedContent.length <= opts.maxBytes) {
        current = {
          startLine: current.startLine,
          endLine: chunk.endLine,
          content: mergedContent,
          chunkType: current.chunkType === chunk.chunkType ? current.chunkType : "block",
        };
        continue;
      }
    }

    // Push current and start new
    merged.push(current);
    current = { ...chunk };
  }

  if (current) {
    merged.push(current);
  }

  return merged;
}

/**
 * Chunk TypeScript/JavaScript code using heuristic patterns
 */
export function chunkTypeScript(
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

  // Try heuristic chunking
  let chunks: RawChunk[];
  try {
    chunks = chunkTypeScriptCode(content, filePath, opts);
  } catch {
    // Fall back to line-based chunking on error
    return chunkFallback(content, filePath, language, options);
  }

  // If no chunks found, use fallback
  if (chunks.length === 0) {
    return chunkFallback(content, filePath, language, options);
  }

  // Enforce size limits
  chunks = enforceSizeLimits(chunks, opts);

  // Merge small chunks
  chunks = mergeSmallChunks(chunks, opts);

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
