/**
 * GitHub Indexing Activities
 *
 * Activities for processing GitHub webhook events and indexing code.
 * These handle side effects (database, network) for the workflow.
 *
 * IMPORTANT: Follows READ-ONLY pattern - all mutations via tRPC internal procedures.
 */

import { z } from "zod";
import { prisma } from "@ducsigr/db";
import { GitHubPushPayloadSchema } from "@ducsigr/api/schemas";
import {
  chunkCode as sharedChunkCode,
  shouldIndexFile as sharedShouldIndexFile,
} from "@ducsigr/shared";
import { getInternalCaller } from "@/lib/trpc-caller";
import { env } from "@/lib/env";
import type {
  GitHubIndexInput,
  ChangedFile,
  FileContent,
  CodeChunkData,
  StoreGitHubIndexInput,
} from "../types";

// ============================================
// Constants
// ============================================

const MAX_FILE_SIZE = 100 * 1024; // 100KB max per file
const MAX_FILES_PER_BATCH = 50;

// ============================================
// Zod Schemas for External API Responses
// ============================================

/**
 * Schema for GitHub Contents API response.
 * Used to validate unknown data from external API.
 */
const GitHubContentResponseSchema = z.object({
  size: z.number(),
  content: z.string(),
  encoding: z.string(),
});

// ============================================
// Activity: Extract Changed Files
// ============================================

/**
 * Extract changed files from GitHub push/PR payload.
 * Pure computation - no side effects.
 */
export async function extractChangedFiles(
  input: GitHubIndexInput
): Promise<ChangedFile[]> {
  const { event, payload } = input;

  if (event === "push") {
    const parsed = GitHubPushPayloadSchema.parse(payload);
    const changedFiles: ChangedFile[] = [];

    for (const commit of parsed.commits) {
      for (const file of commit.added) {
        changedFiles.push({ path: file, status: "added" });
      }
      for (const file of commit.modified) {
        changedFiles.push({ path: file, status: "modified" });
      }
      for (const file of commit.removed) {
        changedFiles.push({ path: file, status: "removed" });
      }
    }

    // Deduplicate by path (keep last status)
    const fileMap = new Map<string, ChangedFile>();
    for (const file of changedFiles) {
      fileMap.set(file.path, file);
    }

    return Array.from(fileMap.values());
  }

  if (event === "pull_request") {
    // For PRs, we only store metadata (no file indexing yet)
    // File diff indexing can be added later
    return [];
  }

  return [];
}

// ============================================
// Activity: Fetch File Contents from GitHub
// ============================================

/**
 * Fetch file contents from GitHub API.
 * Network I/O - reads repo info from database.
 */
export async function fetchFileContents(input: {
  repoId: string;
  files: ChangedFile[];
  ref: string;
}): Promise<FileContent[]> {
  const { repoId, files, ref } = input;

  // Get repo info for API calls (READ-ONLY)
  const repo = await prisma.gitHubRepository.findUnique({
    where: { id: repoId },
    select: { owner: true, repo: true, installationId: true },
  });

  if (!repo) {
    throw new Error(`Repository not found: ${repoId}`);
  }

  // Filter to non-removed files only
  const filesToFetch = files.filter((f) => f.status !== "removed");

  // Batch fetch to avoid rate limits
  const contents: FileContent[] = [];
  const batches = chunkArray(filesToFetch, MAX_FILES_PER_BATCH);

  for (const batch of batches) {
    const batchResults = await Promise.all(
      batch.map(async (file) => {
        try {
          const content = await fetchSingleFile(
            repo.owner,
            repo.repo,
            file.path,
            ref
          );
          return content;
        } catch (error) {
          console.warn(`[GitHub] Failed to fetch ${file.path}:`, error);
          return null;
        }
      })
    );

    contents.push(...batchResults.filter((c): c is FileContent => c !== null));
  }

  return contents;
}

/**
 * Fetch a single file from GitHub API.
 */
async function fetchSingleFile(
  owner: string,
  repo: string,
  path: string,
  ref: string
): Promise<FileContent | null> {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${ref}`;

  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "Ducsigr-Indexer",
  };

  // Use token if available for higher rate limits
  const token = env.GITHUB_TOKEN;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, { headers });

  if (!response.ok) {
    if (response.status === 404) {
      return null; // File doesn't exist at this ref
    }
    throw new Error(`GitHub API error: ${response.status}`);
  }

  // Validate response with Zod (per CLAUDE.md: "ALWAYS use Zod to validate unknown data")
  const json: unknown = await response.json();
  const parsed = GitHubContentResponseSchema.safeParse(json);

  if (!parsed.success) {
    console.warn(`[GitHub] Invalid response for ${path}:`, parsed.error.flatten());
    return null;
  }

  const data = parsed.data;

  // Skip files that are too large
  if (data.size > MAX_FILE_SIZE) {
    console.log(`[GitHub] Skipping large file: ${path} (${data.size} bytes)`);
    return null;
  }

  // Decode base64 content
  const content = Buffer.from(data.content, "base64").toString("utf-8");

  return {
    path,
    content,
    encoding: "utf-8",
  };
}

// ============================================
// Activity: Chunk Code Files
// ============================================

/**
 * Split code files into chunks for indexing.
 * Uses the shared chunking module for intelligent semantic chunking.
 */
export async function chunkCodeFiles(
  files: FileContent[]
): Promise<CodeChunkData[]> {
  const allChunks: CodeChunkData[] = [];

  for (const file of files) {
    const chunks = sharedChunkCode({
      content: file.content,
      filePath: file.path,
    });

    // Map to CodeChunkData format
    for (const chunk of chunks) {
      allChunks.push({
        filePath: chunk.filePath,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        content: chunk.content,
        contentHash: chunk.contentHash,
        language: chunk.language,
        chunkType: chunk.chunkType,
      });
    }
  }

  return allChunks;
}

// ============================================
// Activity: Store Indexed Data
// ============================================

/**
 * Store indexed data via tRPC internal procedure.
 * Mutations go through internal router - NOT direct database access.
 */
export async function storeIndexedData(
  input: StoreGitHubIndexInput
): Promise<{ chunksCreated: number; chunkIds: Array<{ id: string; contentHash: string }> }> {
  const caller = getInternalCaller();
  return caller.internal.storeGitHubIndex(input);
}

// ============================================
// Activity: Get Tree Root Hash
// ============================================

/**
 * Get the current Merkle tree root hash for a repository.
 * READ-ONLY database operation.
 */
export async function getTreeRootHash(repoId: string): Promise<string | null> {
  const repo = await prisma.gitHubRepository.findUnique({
    where: { id: repoId },
    select: { treeRootHash: true },
  });
  return repo?.treeRootHash ?? null;
}

// ============================================
// Activity: Update Tree Root Hash
// ============================================

/**
 * Update the Merkle tree root hash via tRPC internal procedure.
 * Mutation goes through internal router - NOT direct database access.
 */
export async function updateTreeRootHash(
  repoId: string,
  hash: string
): Promise<void> {
  const caller = getInternalCaller();
  await caller.internal.updateTreeRootHash({
    repositoryId: repoId,
    treeRootHash: hash,
  });
}

// ============================================
// Helper: Filter Indexable Files
// ============================================

/**
 * Check if a file should be indexed based on extension and path.
 * Delegates to shared shouldIndexFile for consistency.
 */
export function shouldIndexFile(path: string): boolean {
  return sharedShouldIndexFile(path);
}

// ============================================
// Helper: Chunk Array
// ============================================

/**
 * Split an array into chunks of specified size.
 */
function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}
