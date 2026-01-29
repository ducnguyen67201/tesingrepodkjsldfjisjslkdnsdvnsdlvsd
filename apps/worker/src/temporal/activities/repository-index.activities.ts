/**
 * Repository Index Activities
 *
 * Activities for full repository indexing workflow.
 * Handles fetching repository tree, file contents, and storing chunks.
 *
 * IMPORTANT: Follows READ-ONLY pattern - all mutations via tRPC internal procedures.
 */

import { z } from "zod";
import { Octokit } from "@octokit/rest";
import { createAppAuth } from "@octokit/auth-app";
import { getInternalCaller } from "@/lib/trpc-caller";
import { env } from "@/lib/env";
import type {
  FetchTreeInput,
  FetchContentsInput,
  FileContent,
  StoreRepositoryChunksInput,
  StoreRepositoryChunksResult,
} from "../types";

// ============================================
// Constants
// ============================================

const MAX_FILE_SIZE = 100 * 1024; // 100KB max per file
const MAX_FILES_PER_BATCH = 20; // Lower batch size for rate limit safety
const BATCH_DELAY_MS = 100; // Small delay between batches

// ============================================
// Zod Schemas for External API Responses
// ============================================

/**
 * Schema for GitHub Tree API response item.
 */
const GitHubTreeItemSchema = z.object({
  path: z.string(),
  mode: z.string(),
  type: z.enum(["blob", "tree", "commit"]),
  sha: z.string().optional(),
  size: z.number().optional(),
});

/**
 * Schema for GitHub Tree API response.
 */
const GitHubTreeResponseSchema = z.object({
  sha: z.string(),
  truncated: z.boolean(),
  tree: z.array(GitHubTreeItemSchema),
});

/**
 * Schema for GitHub Contents API response.
 */
const GitHubContentResponseSchema = z.object({
  size: z.number(),
  content: z.string(),
  encoding: z.string(),
});

// ============================================
// Helper: Create App Octokit
// ============================================

/**
 * Create an authenticated Octokit client for a GitHub App installation.
 */
function createAppOctokit(installationId: number): Octokit {
  if (!env.GITHUB_APP_ID || !env.GITHUB_APP_PRIVATE_KEY) {
    throw new Error(
      "GitHub App not configured: GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY required"
    );
  }

  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: env.GITHUB_APP_ID,
      privateKey: env.GITHUB_APP_PRIVATE_KEY,
      installationId,
    },
  });
}

// ============================================
// Activity: Update Repository Index Status
// ============================================

/**
 * Update repository index status via tRPC internal procedure.
 * Mutations go through internal router - NOT direct database access.
 */
export async function updateRepositoryIndexStatus(
  repositoryId: string,
  status: "PENDING" | "INDEXING" | "READY" | "FAILED"
): Promise<void> {
  const caller = getInternalCaller();
  await caller.internal.updateRepositoryIndexStatus({
    repositoryId,
    status,
    lastIndexedAt: status === "READY" ? new Date() : undefined,
  });
}

// ============================================
// Activity: Cleanup Repository Chunks
// ============================================

/**
 * Delete all existing chunks for a repository (for reindex).
 * Mutations go through internal router - NOT direct database access.
 */
export async function cleanupRepositoryChunks(
  repositoryId: string
): Promise<void> {
  const caller = getInternalCaller();
  await caller.internal.deleteRepositoryChunks({ repositoryId });
}

// ============================================
// Activity: Fetch Repository Tree
// ============================================

/**
 * Fetch repository file tree from GitHub API.
 * Returns array of file paths (not directories).
 */
export async function fetchRepositoryTree(
  input: FetchTreeInput
): Promise<string[]> {
  const { installationId, owner, repo, branch } = input;
  const octokit = createAppOctokit(installationId);

  // Use recursive tree API to get all files
  const response = await octokit.git.getTree({
    owner,
    repo,
    tree_sha: branch,
    recursive: "1", // Get full tree recursively
  });

  // Validate response with Zod
  const parsed = GitHubTreeResponseSchema.safeParse(response.data);
  if (!parsed.success) {
    console.error("[RepositoryIndex] Invalid tree response:", parsed.error.flatten());
    throw new Error("Invalid GitHub tree response");
  }

  const data = parsed.data;

  // Warn if tree was truncated (>100k files)
  if (data.truncated) {
    console.warn(`[RepositoryIndex] Tree was truncated for ${owner}/${repo}`);
  }

  // Filter to blobs (files) only and extract paths
  const filePaths = data.tree
    .filter((item) => item.type === "blob")
    .filter((item) => !item.size || item.size <= MAX_FILE_SIZE) // Skip large files early
    .map((item) => item.path);

  return filePaths;
}

// ============================================
// Activity: Fetch Repository Contents
// ============================================

/**
 * Fetch file contents from GitHub API.
 * Processes files in batches to respect rate limits.
 */
export async function fetchRepositoryContents(
  input: FetchContentsInput
): Promise<FileContent[]> {
  const { installationId, owner, repo, branch, files } = input;
  const octokit = createAppOctokit(installationId);
  const contents: FileContent[] = [];

  // Process in batches
  const batches = chunkArray(files, MAX_FILES_PER_BATCH);

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]!;

    // Fetch batch in parallel
    const batchResults = await Promise.all(
      batch.map((path) =>
        fetchSingleFile(octokit, owner, repo, path, branch)
      )
    );

    // Filter out failed fetches
    const successfulResults = batchResults.filter(
      (result): result is FileContent => result !== null
    );
    contents.push(...successfulResults);

    // Add delay between batches to avoid rate limits
    if (i < batches.length - 1) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  return contents;
}

/**
 * Fetch a single file from GitHub API.
 */
async function fetchSingleFile(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string,
  ref: string
): Promise<FileContent | null> {
  try {
    const response = await octokit.repos.getContent({
      owner,
      repo,
      path,
      ref,
    });

    // Handle directory response (shouldn't happen but safety check)
    if (Array.isArray(response.data)) {
      console.warn(`[RepositoryIndex] Unexpected directory response for ${path}`);
      return null;
    }

    // Validate response
    const data = response.data as Record<string, unknown>;
    const parsed = GitHubContentResponseSchema.safeParse(data);
    if (!parsed.success) {
      console.warn(`[RepositoryIndex] Invalid content response for ${path}:`, parsed.error.flatten());
      return null;
    }

    const content = parsed.data;

    // Skip files that are too large
    if (content.size > MAX_FILE_SIZE) {
      return null;
    }

    // Verify encoding is base64
    if (content.encoding !== "base64") {
      console.warn(`[RepositoryIndex] Unexpected encoding for ${path}: ${content.encoding}`);
      return null;
    }

    // Decode base64 content
    const decodedContent = Buffer.from(content.content, "base64").toString("utf-8");

    return {
      path,
      content: decodedContent,
      encoding: "utf-8",
    };
  } catch (error) {
    // Log but don't throw - we want to continue with other files
    console.warn(`[RepositoryIndex] Failed to fetch ${path}:`, error);
    return null;
  }
}

// ============================================
// Activity: Store Repository Chunks
// ============================================

/**
 * Store chunks via tRPC internal procedure.
 * Mutations go through internal router - NOT direct database access.
 * Returns chunk IDs for embedding generation.
 */
export async function storeRepositoryChunks(
  input: StoreRepositoryChunksInput
): Promise<StoreRepositoryChunksResult> {
  const caller = getInternalCaller();
  return caller.internal.storeRepositoryChunks(input);
}

// ============================================
// Helper Functions
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

/**
 * Sleep for specified milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
