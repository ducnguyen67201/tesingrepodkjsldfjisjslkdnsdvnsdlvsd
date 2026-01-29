/**
 * Fallback Line-Based Chunker
 *
 * Simple line-based chunking for unknown languages.
 * Splits on blank line boundaries when possible, respects size limits.
 */

import type { CodeChunk, ChunkOptions, RawChunk } from "./types";
import { CHUNK_DEFAULTS } from "./constants";

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
 * Check if a chunk exceeds size limits
 */
function exceedsLimits(
  lines: string[],
  opts: ResolvedOptions
): boolean {
  if (lines.length > opts.maxLines) return true;
  const bytes = lines.join("\n").length;
  if (bytes > opts.maxBytes) return true;
  return false;
}

/**
 * Split lines into chunks respecting size limits
 */
function splitIntoChunks(
  lines: string[],
  startLine: number,
  opts: ResolvedOptions
): RawChunk[] {
  const chunks: RawChunk[] = [];
  let currentLines: string[] = [];
  let currentStart = startLine;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    currentLines.push(line ?? "");

    // Check if we should split
    const isBlankLine = (line ?? "").trim() === "";
    const nextWouldExceed = exceedsLimits([...currentLines, lines[i + 1] ?? ""], opts);
    const atLimit = exceedsLimits(currentLines, opts);

    // Split conditions:
    // 1. atLimit: Hard limit reached - must split to respect size constraints
    // 2. Natural boundary: At blank line AND next line would exceed AND we have minimum lines
    if (atLimit || (isBlankLine && nextWouldExceed && currentLines.length >= opts.minLines)) {
      // Create chunk from current lines
      chunks.push({
        startLine: currentStart,
        endLine: currentStart + currentLines.length - 1,
        content: currentLines.join("\n"),
        chunkType: "block",
      });
      // Advance to next line position
      currentStart = currentStart + currentLines.length;
      currentLines = [];
    }
  }

  // Add remaining lines as final chunk
  if (currentLines.length > 0) {
    chunks.push({
      startLine: currentStart,
      endLine: currentStart + currentLines.length - 1,
      content: currentLines.join("\n"),
      chunkType: "block",
    });
  }

  return chunks;
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
          chunkType: "block",
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
 * Chunk code using line-based fallback strategy
 */
export function chunkFallback(
  content: string,
  filePath: string,
  language: string | null,
  options: ChunkOptions = {}
): CodeChunk[] {
  const opts = resolveOptions(options);
  const lines = content.split("\n");

  // If entire file is small enough, return as single chunk
  if (lines.length <= opts.maxLines && content.length <= opts.maxBytes) {
    return [
      {
        filePath,
        startLine: 1,
        endLine: lines.length,
        content,
        contentHash: "", // Will be filled by main module
        language,
        chunkType: "module",
      },
    ];
  }

  // Split into chunks
  let chunks = splitIntoChunks(lines, 1, opts);

  // Merge small chunks
  chunks = mergeSmallChunks(chunks, opts);

  // Convert to CodeChunk format
  return chunks.map((chunk) => ({
    filePath,
    startLine: chunk.startLine,
    endLine: chunk.endLine,
    content: chunk.content,
    contentHash: "", // Will be filled by main module
    language,
    chunkType: chunk.chunkType,
  }));
}
