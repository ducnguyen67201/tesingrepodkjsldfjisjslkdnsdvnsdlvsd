/**
 * Code Chunking Types
 *
 * Type definitions for the code chunking system.
 */

/**
 * Chunk type classification
 */
export type ChunkType = "function" | "class" | "module" | "block";

/**
 * Code chunk output
 */
export interface CodeChunk {
  filePath: string;
  startLine: number;
  endLine: number;
  content: string;
  contentHash: string;
  language: string | null;
  chunkType: ChunkType;
}

/**
 * Chunking input
 */
export interface ChunkInput {
  content: string;
  filePath: string;
  language?: string | null;
}

/**
 * Chunking options
 */
export interface ChunkOptions {
  /** Maximum lines per chunk (default: 500) */
  maxLines?: number;
  /** Maximum bytes per chunk (default: 10KB) */
  maxBytes?: number;
  /** Minimum lines per chunk (default: 10) */
  minLines?: number;
}

/**
 * Internal chunk representation (without hash)
 */
export interface RawChunk {
  startLine: number;
  endLine: number;
  content: string;
  chunkType: ChunkType;
}
