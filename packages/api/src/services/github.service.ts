import { prisma, type Prisma } from "@ducsigr/db";
import type { StoreGitHubIndexInput } from "../schemas/github";

/**
 * GitHubService - Business logic for GitHub indexing operations
 */
export class GitHubService {
  /**
   * Store indexed GitHub data (commits, PRs, code chunks)
   * Called by Temporal activities via tRPC internal router
   *
   * Operations:
   * 1. Upsert commit metadata (for push events)
   * 2. Upsert PR metadata (for pull_request events)
   * 3. Delete old chunks for changed files
   * 4. Insert new code chunks
   * 5. Update repository lastIndexedAt
   */
  static async storeIndexedData(
    input: StoreGitHubIndexInput
  ): Promise<{ chunksCreated: number }> {
    const {
      repoId,
      event,
      commitSha,
      commitMessage,
      commitAuthor,
      commitAuthorEmail,
      commitTimestamp,
      prNumber,
      prTitle,
      prBody,
      prState,
      prAuthor,
      prBaseBranch,
      prHeadBranch,
      prMergedAt,
      prClosedAt,
      changedFiles,
      chunks,
    } = input;

    return prisma.$transaction(async (tx) => {
      // 1. Upsert commit metadata (for push events)
      if (event === "push" && commitSha) {
        await this.upsertCommit(tx, {
          repoId,
          sha: commitSha,
          message: commitMessage || "",
          author: commitAuthor || "unknown",
          authorEmail: commitAuthorEmail,
          timestamp: commitTimestamp ? new Date(commitTimestamp) : new Date(),
        });
      }

      // 2. Upsert PR metadata (for pull_request events)
      if (event === "pull_request" && prNumber) {
        await this.upsertPullRequest(tx, {
          repoId,
          number: prNumber,
          title: prTitle || "",
          body: prBody,
          state: prState || "open",
          author: prAuthor || "unknown",
          baseBranch: prBaseBranch || "main",
          headBranch: prHeadBranch || "",
          mergedAt: prMergedAt ? new Date(prMergedAt) : null,
          closedAt: prClosedAt ? new Date(prClosedAt) : null,
        });
      }

      // 3. Delete old chunks for changed files
      if (changedFiles.length > 0) {
        await this.deleteChunksForFiles(tx, repoId, changedFiles);
      }

      // 4. Insert new chunks
      const chunksCreated = await this.createChunks(tx, repoId, chunks);

      // 5. Update repo lastIndexedAt
      await this.updateRepoIndexStatus(tx, repoId, "READY");

      console.log(
        `[GitHubService:storeIndexedData] Stored ${chunksCreated} chunks for repo ${repoId}`
      );

      return { chunksCreated };
    });
  }

  // ============================================
  // Private Helper Methods
  // ============================================

  /**
   * Upsert commit metadata
   */
  private static async upsertCommit(
    tx: Prisma.TransactionClient,
    data: {
      repoId: string;
      sha: string;
      message: string;
      author: string;
      authorEmail?: string | null;
      timestamp: Date;
    }
  ): Promise<void> {
    await tx.gitCommit.upsert({
      where: {
        repoId_sha: { repoId: data.repoId, sha: data.sha },
      },
      create: {
        repoId: data.repoId,
        sha: data.sha,
        message: data.message,
        author: data.author,
        authorEmail: data.authorEmail,
        timestamp: data.timestamp,
      },
      update: {
        message: data.message,
        author: data.author,
        authorEmail: data.authorEmail,
      },
    });
  }

  /**
   * Upsert pull request metadata
   */
  private static async upsertPullRequest(
    tx: Prisma.TransactionClient,
    data: {
      repoId: string;
      number: number;
      title: string;
      body?: string | null;
      state: string;
      author: string;
      baseBranch: string;
      headBranch: string;
      mergedAt: Date | null;
      closedAt: Date | null;
    }
  ): Promise<void> {
    await tx.gitPullRequest.upsert({
      where: {
        repoId_number: { repoId: data.repoId, number: data.number },
      },
      create: {
        repoId: data.repoId,
        number: data.number,
        title: data.title,
        body: data.body,
        state: data.state,
        author: data.author,
        baseBranch: data.baseBranch,
        headBranch: data.headBranch,
        mergedAt: data.mergedAt,
        closedAt: data.closedAt,
      },
      update: {
        title: data.title,
        body: data.body,
        state: data.state,
        mergedAt: data.mergedAt,
        closedAt: data.closedAt,
      },
    });
  }

  /**
   * Delete code chunks for specific files
   */
  private static async deleteChunksForFiles(
    tx: Prisma.TransactionClient,
    repoId: string,
    filePaths: string[]
  ): Promise<number> {
    const result = await tx.codeChunk.deleteMany({
      where: {
        repoId,
        filePath: { in: filePaths },
      },
    });
    return result.count;
  }

  /**
   * Create new code chunks
   */
  private static async createChunks(
    tx: Prisma.TransactionClient,
    repoId: string,
    chunks: Array<{
      filePath: string;
      startLine: number;
      endLine: number;
      content: string;
      contentHash: string;
      language: string | null;
      chunkType: string;
    }>
  ): Promise<number> {
    if (chunks.length === 0) {
      return 0;
    }

    const result = await tx.codeChunk.createMany({
      data: chunks.map((chunk) => ({
        repoId,
        filePath: chunk.filePath,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        content: chunk.content,
        contentHash: chunk.contentHash,
        language: chunk.language,
        chunkType: chunk.chunkType,
      })),
    });

    return result.count;
  }

  /**
   * Update repository index status
   */
  private static async updateRepoIndexStatus(
    tx: Prisma.TransactionClient,
    repoId: string,
    status: "PENDING" | "INDEXING" | "READY" | "FAILED"
  ): Promise<void> {
    await tx.gitHubRepository.update({
      where: { id: repoId },
      data: {
        lastIndexedAt: new Date(),
        indexStatus: status,
      },
    });
  }
}
