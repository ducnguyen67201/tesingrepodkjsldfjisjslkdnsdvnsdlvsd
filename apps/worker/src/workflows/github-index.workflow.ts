// ============================================================
// GITHUB INDEX WORKFLOW - Process GitHub events and index code
// ============================================================
// This workflow processes GitHub push/PR events and indexes changed files.
// Flow: extract files → filter → fetch → chunk → merkle diff → store → embed
// ============================================================

import {
  proxyActivities,
  log,
  ApplicationFailure,
} from "@temporalio/workflow";
import type * as activities from "../temporal/activities";
import type { GitHubIndexInput, GitHubIndexResult, ChangedFile, EmbeddingChunk } from "../temporal/types";
import {
  GitHubPushPayloadSchema,
  GitHubPRPayloadSchema,
} from "@ducsigr/api/schemas";
import { ACTIVITY_RETRY, buildMerkleTree } from "@ducsigr/shared";

// ============================================================
// Activity Configuration
// ============================================================

const {
  extractChangedFiles,
  fetchFileContents,
  chunkCodeFiles,
  storeIndexedData,
  getTreeRootHash,
  updateTreeRootHash,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "2m",
  retry: {
    ...ACTIVITY_RETRY.DEFAULT,
    maximumAttempts: 3,
  },
});

// Embedding activities with longer timeout (LLM API calls can be slow)
const {
  generateEmbeddings,
  storeEmbeddings,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "60m",
  retry: {
    ...ACTIVITY_RETRY.DEFAULT,
    maximumAttempts: 5,
  },
});

// ============================================================
// Constants (inline to avoid bundling issues)
// ============================================================
// NOTE: These constants are intentionally duplicated from @ducsigr/shared
// to avoid Temporal bundler issues. Workflows run in an isolated sandbox and
// cannot import non-deterministic code or modules with side effects.
// Keep in sync with packages/shared/src/chunking/index.ts

const INDEXABLE_EXTENSIONS = [
  ".ts", ".tsx", ".js", ".jsx",
  ".py", ".go", ".rs", ".java",
];

const EXCLUDED_PATTERNS = [
  "node_modules",
  ".git/",
  "dist/",
  "build/",
  ".next/",
  ".min.",
  ".d.ts",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
];

/**
 * Check if a file should be indexed (pure function - safe in workflow).
 */
function shouldIndexFile(path: string): boolean {
  // Check excluded patterns
  for (const pattern of EXCLUDED_PATTERNS) {
    if (path.includes(pattern)) {
      return false;
    }
  }

  // Check extension
  for (const ext of INDEXABLE_EXTENSIONS) {
    if (path.endsWith(ext)) {
      return true;
    }
  }

  return false;
}

// ============================================================
// Main Workflow
// ============================================================

/**
 * GitHub Index Workflow
 *
 * Processes GitHub push/PR events and indexes changed code files.
 *
 * Flow:
 * 1. Extract changed files from event payload
 * 2. Filter to indexable files (by extension, exclude patterns)
 * 3. Fetch file contents from GitHub API
 * 4. Chunk code into semantic pieces
 * 4b. Merkle tree diff to detect truly changed chunks
 * 5. Store chunks and metadata in database
 * 6. Generate embeddings for new/changed chunks
 * 7. Store embeddings in pgvector
 * 8. Update Merkle tree root hash
 *
 * @param input - Workflow input from webhook
 * @returns Result with counts of files processed and chunks created
 */
export async function githubIndexWorkflow(
  input: GitHubIndexInput
): Promise<GitHubIndexResult> {
  const { repoId, event, payload, deliveryId } = input;

  log.info("Starting GitHub index workflow", {
    repoId,
    event,
    deliveryId,
  });

  try {
    if (event === "push") {
      return await handlePushEvent(input, payload);
    }

    if (event === "pull_request") {
      return await handlePREvent(input, payload);
    }

    throw ApplicationFailure.create({
      type: "UNSUPPORTED_EVENT",
      message: `Unsupported event type: ${event}`,
      nonRetryable: true,
    });
  } catch (error) {
    log.error("GitHub index workflow failed", { error, repoId, event });

    // Re-throw ApplicationFailure as-is
    if (error instanceof ApplicationFailure) {
      throw error;
    }

    // Wrap other errors
    throw ApplicationFailure.create({
      type: "WORKFLOW_ERROR",
      message: error instanceof Error ? error.message : "Unknown error",
      cause: error instanceof Error ? error : undefined,
    });
  }
}

/**
 * Handle push event - index changed files.
 */
async function handlePushEvent(
  input: GitHubIndexInput,
  payload: unknown
): Promise<GitHubIndexResult> {
  const { repoId, event } = input;

  // Parse push payload
  const parsed = GitHubPushPayloadSchema.parse(payload);
  const commitSha = parsed.after;
  const ref = parsed.after;

  // Step 1: Extract changed files from commits
  const changedFiles = await extractChangedFiles(input);
  log.info("Extracted changed files", { count: changedFiles.length });

  // Step 2: Filter to indexable files (in workflow - deterministic)
  const filesToIndex = changedFiles.filter(
    (f: ChangedFile) => f.status !== "removed" && shouldIndexFile(f.path)
  );
  log.info("Files to index after filtering", { count: filesToIndex.length });

  // If no files to index, return early
  if (filesToIndex.length === 0) {
    log.info("No indexable files found, skipping");

    // Still store commit metadata even if no files
    const headCommit = parsed.head_commit;
    await storeIndexedData({
      repoId,
      event,
      commitSha: parsed.after,
      commitMessage: headCommit?.message,
      commitAuthor: headCommit?.author.name,
      commitAuthorEmail: headCommit?.author.email,
      commitTimestamp: headCommit?.timestamp,
      changedFiles: changedFiles.map((f: ChangedFile) => f.path),
      chunks: [],
    });

    return {
      success: true,
      repoId,
      event,
      filesProcessed: 0,
      chunksCreated: 0,
      commitSha,
    };
  }

  // Step 3: Fetch file contents from GitHub API
  const fileContents = await fetchFileContents({
    repoId,
    files: filesToIndex,
    ref,
  });
  log.info("Fetched file contents", { count: fileContents.length });

  // Step 4: Chunk code files
  const allChunks = await chunkCodeFiles(fileContents);
  log.info("Created code chunks", { count: allChunks.length });

  // Step 4b: Merkle tree change detection
  // Build a Merkle tree from the current push's chunks to get a root hash.
  // This root hash is compared against the stored hash to short-circuit
  // identical re-pushes (e.g., force-push of same content).
  // Content-level deduplication is handled by skipDuplicates + contentHash at the DB layer.
  const newTree = buildMerkleTree(
    allChunks.map((c) => ({ path: c.filePath, contentHash: c.contentHash }))
  );
  const storedRootHash = await getTreeRootHash(repoId);

  let chunks = allChunks;
  let treeChanged = true;
  if (storedRootHash && storedRootHash === newTree.rootHash) {
    log.info("Merkle root unchanged, skipping chunk storage and embedding");
    chunks = [];
    treeChanged = false;
  } else if (storedRootHash) {
    log.info("Merkle root changed, processing chunks", {
      oldRootHash: storedRootHash,
      newRootHash: newTree.rootHash,
      totalChunks: allChunks.length,
    });
  } else {
    log.info("No previous Merkle root, processing all chunks", {
      totalChunks: allChunks.length,
    });
  }

  // Step 5: Store indexed data via internal procedure
  const headCommit = parsed.head_commit;
  const result = await storeIndexedData({
    repoId,
    event,
    commitSha: parsed.after,
    commitMessage: headCommit?.message,
    commitAuthor: headCommit?.author.name,
    commitAuthorEmail: headCommit?.author.email,
    commitTimestamp: headCommit?.timestamp,
    changedFiles: changedFiles.map((f: ChangedFile) => f.path),
    chunks,
  });

  // Step 6: Generate embeddings for new chunks
  if (result.chunkIds.length > 0) {
    log.info("Generating embeddings for push chunks", {
      chunkCount: result.chunkIds.length,
    });

    // Map chunk IDs to content using contentHash (not index-based, since
    // findMany doesn't guarantee ordering). Build a lookup by contentHash.
    const contentByHash = new Map(
      chunks.map((c) => [c.contentHash, c.content])
    );

    const embeddingChunks: EmbeddingChunk[] = result.chunkIds
      .map((chunk) => {
        const content = contentByHash.get(chunk.contentHash);
        if (!content) {
          log.warn("Chunk content not found for hash", { contentHash: chunk.contentHash, chunkId: chunk.id });
          return null;
        }
        return { id: chunk.id, content, contentHash: chunk.contentHash };
      })
      .filter((c): c is EmbeddingChunk => c !== null);

    const embeddingResult = await generateEmbeddings({
      chunks: embeddingChunks,
    });
    log.info("Generated embeddings", {
      count: embeddingResult.chunksProcessed,
      cached: embeddingResult.cached,
      generated: embeddingResult.generated,
    });

    // Step 7: Store embeddings in pgvector
    if (embeddingResult.embeddings.length > 0) {
      const storeResult = await storeEmbeddings({
        embeddings: embeddingResult.embeddings,
      });
      log.info("Stored embeddings", { count: storeResult.storedCount });
    }
  }

  // Step 8: Update Merkle tree root hash (skip if unchanged)
  if (treeChanged) {
    await updateTreeRootHash(repoId, newTree.rootHash);
    log.info("Updated Merkle tree root hash", { rootHash: newTree.rootHash });
  }

  log.info("GitHub push workflow completed", {
    repoId,
    filesProcessed: fileContents.length,
    chunksCreated: result.chunksCreated,
    commitSha,
  });

  return {
    success: true,
    repoId,
    event,
    filesProcessed: fileContents.length,
    chunksCreated: result.chunksCreated,
    commitSha,
  };
}

/**
 * Handle PR event - store PR metadata.
 * Note: File indexing for PRs can be added later.
 */
async function handlePREvent(
  input: GitHubIndexInput,
  payload: unknown
): Promise<GitHubIndexResult> {
  const { repoId, event } = input;

  // Parse PR payload
  const parsed = GitHubPRPayloadSchema.parse(payload);
  const prNumber = parsed.number;

  // Store PR metadata only (no file indexing yet)
  const result = await storeIndexedData({
    repoId,
    event,
    prNumber: parsed.number,
    prTitle: parsed.pull_request.title,
    prBody: parsed.pull_request.body || undefined,
    prState: parsed.pull_request.state,
    prAuthor: parsed.pull_request.user.login,
    prBaseBranch: parsed.pull_request.base.ref,
    prHeadBranch: parsed.pull_request.head.ref,
    prMergedAt: parsed.pull_request.merged_at || undefined,
    prClosedAt: parsed.pull_request.closed_at || undefined,
    changedFiles: [],
    chunks: [],
  });

  log.info("GitHub PR metadata stored", {
    repoId,
    prNumber,
  });

  return {
    success: true,
    repoId,
    event,
    filesProcessed: 0,
    chunksCreated: result.chunksCreated,
    prNumber,
  };
}
