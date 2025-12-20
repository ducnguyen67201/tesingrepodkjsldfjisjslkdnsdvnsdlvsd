/**
 * Unit Tests for Vector Operations
 *
 * These tests require a running PostgreSQL database with pgvector extension.
 * Run with: pnpm test
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "../index";
import {
  setChunkEmbedding,
  getChunkEmbedding,
  setChunkEmbeddings,
  searchSimilarChunks,
  countChunksWithEmbeddings,
  clearRepositoryEmbeddings,
  EMBEDDING_DIMENSIONS,
  type EmbeddingBatchItem,
} from "../vector";

describe("Vector Operations", () => {
  // Test data IDs
  const TEST_WORKSPACE_ID = "test-workspace-vector";
  const TEST_PROJECT_ID = "test-project-vector";
  const TEST_INSTALLATION_ID = "test-installation-vector";
  const TEST_REPO_ID = "test-repo-vector";
  const testChunkIds: string[] = [];

  // Helper to get chunk ID with type safety (populated in beforeAll)
  const getChunkId = (index: number): string => {
    const id = testChunkIds[index];
    if (!id) throw new Error(`Chunk ID at index ${index} not found`);
    return id;
  };

  // Helper to create a valid embedding
  const createTestEmbedding = (seed: number = 0): number[] => {
    const embedding = Array(EMBEDDING_DIMENSIONS)
      .fill(0)
      .map((_, i) => Math.sin(seed + i * 0.01));

    // Normalize
    const magnitude = Math.sqrt(
      embedding.reduce((sum, val) => sum + val * val, 0)
    );
    return embedding.map((val) => val / magnitude);
  };

  // Setup: Create test workspace, project, installation, repo, and chunks
  beforeAll(async () => {
    // Create test workspace
    await prisma.workspace.create({
      data: {
        id: TEST_WORKSPACE_ID,
        name: "Test Workspace for Vector",
        slug: "test-workspace-vector",
      },
    });

    // Create test project
    await prisma.project.create({
      data: {
        id: TEST_PROJECT_ID,
        name: "Test Project for Vector",
        workspaceId: TEST_WORKSPACE_ID,
      },
    });

    // Create test GitHub installation
    await prisma.gitHubInstallation.create({
      data: {
        id: TEST_INSTALLATION_ID,
        workspaceId: TEST_WORKSPACE_ID,
        installationId: BigInt(999999),
        accountLogin: "test-account",
        accountType: "User",
      },
    });

    // Create test repository
    await prisma.gitHubRepository.create({
      data: {
        id: TEST_REPO_ID,
        installationId: TEST_INSTALLATION_ID,
        githubId: BigInt(888888),
        owner: "test-owner",
        repo: "test-repo",
        fullName: "test-owner/test-repo",
        defaultBranch: "main",
        enabled: true,
      },
    });

    // Create test code chunks
    for (let i = 0; i < 5; i++) {
      const chunk = await prisma.codeChunk.create({
        data: {
          repoId: TEST_REPO_ID,
          filePath: `src/file${i}.ts`,
          startLine: i * 10,
          endLine: i * 10 + 9,
          content: `// Test content for chunk ${i}\nfunction test${i}() { return ${i}; }`,
          contentHash: `hash-${i}-${Date.now()}`,
          language: "typescript",
          chunkType: "function",
        },
      });
      testChunkIds.push(chunk.id);
    }
  });

  // Cleanup: Remove test data
  afterAll(async () => {
    // Delete in reverse order of dependencies
    await prisma.codeChunk.deleteMany({
      where: { repoId: TEST_REPO_ID },
    });

    await prisma.gitHubRepository.deleteMany({
      where: { id: TEST_REPO_ID },
    });

    await prisma.gitHubInstallation.deleteMany({
      where: { id: TEST_INSTALLATION_ID },
    });

    await prisma.project.deleteMany({
      where: { id: TEST_PROJECT_ID },
    });

    await prisma.workspace.deleteMany({
      where: { id: TEST_WORKSPACE_ID },
    });

    await prisma.$disconnect();
  });

  // Clear embeddings before each test
  beforeEach(async () => {
    await clearRepositoryEmbeddings(TEST_REPO_ID);
  });

  describe("setChunkEmbedding", () => {
    it("should store embedding for a chunk", async () => {
      const embedding = createTestEmbedding(1);
      await setChunkEmbedding(getChunkId(0), embedding);

      const result = await getChunkEmbedding(getChunkId(0));
      expect(result).not.toBeNull();
      expect(result).toHaveLength(EMBEDDING_DIMENSIONS);
    });

    it("should reject invalid dimensions (too few)", async () => {
      const invalidEmbedding = Array(100).fill(0.1);
      await expect(
        setChunkEmbedding(getChunkId(0), invalidEmbedding)
      ).rejects.toThrow("Invalid embedding dimensions");
    });

    it("should reject invalid dimensions (too many)", async () => {
      const invalidEmbedding = Array(2000).fill(0.1);
      await expect(
        setChunkEmbedding(getChunkId(0), invalidEmbedding)
      ).rejects.toThrow("Invalid embedding dimensions");
    });
  });

  describe("getChunkEmbedding", () => {
    it("should return null for chunk without embedding", async () => {
      const result = await getChunkEmbedding(getChunkId(0));
      expect(result).toBeNull();
    });

    it("should retrieve stored embedding", async () => {
      const embedding = createTestEmbedding(2);
      await setChunkEmbedding(getChunkId(0), embedding);

      const result = await getChunkEmbedding(getChunkId(0));
      expect(result).not.toBeNull();
      expect(result).toHaveLength(EMBEDDING_DIMENSIONS);

      // Check values are approximately equal (floating point precision)
      for (let i = 0; i < EMBEDDING_DIMENSIONS; i++) {
        expect(result![i]).toBeCloseTo(embedding[i], 5);
      }
    });
  });

  describe("setChunkEmbeddings (batch)", () => {
    it("should store multiple embeddings in batch", async () => {
      const items: EmbeddingBatchItem[] = [
        { chunkId: getChunkId(0), embedding: createTestEmbedding(10) },
        { chunkId: getChunkId(1), embedding: createTestEmbedding(11) },
        { chunkId: getChunkId(2), embedding: createTestEmbedding(12) },
      ];

      await setChunkEmbeddings(items);

      // Verify all embeddings were stored
      for (const item of items) {
        const result = await getChunkEmbedding(item.chunkId);
        expect(result).not.toBeNull();
        expect(result).toHaveLength(EMBEDDING_DIMENSIONS);
      }
    });

    it("should handle empty array", async () => {
      await expect(setChunkEmbeddings([])).resolves.not.toThrow();
    });

    it("should reject if any embedding has invalid dimensions", async () => {
      const items: EmbeddingBatchItem[] = [
        { chunkId: getChunkId(0), embedding: createTestEmbedding(20) },
        { chunkId: getChunkId(1), embedding: Array(100).fill(0.1) }, // Invalid
      ];

      await expect(setChunkEmbeddings(items)).rejects.toThrow(
        "Invalid embedding dimensions"
      );
    });

    it("should reject invalid chunk IDs (SQL injection prevention)", async () => {
      const maliciousItems: EmbeddingBatchItem[] = [
        {
          chunkId: "'; DROP TABLE \"CodeChunk\"; --",
          embedding: createTestEmbedding(99),
        },
      ];

      await expect(setChunkEmbeddings(maliciousItems)).rejects.toThrow(
        "Invalid chunkId: must be a valid CUID"
      );
    });
  });

  describe("searchSimilarChunks", () => {
    beforeEach(async () => {
      // Store embeddings for all test chunks
      const items: EmbeddingBatchItem[] = testChunkIds.map((id, i) => ({
        chunkId: id,
        embedding: createTestEmbedding(i * 100), // Different seeds for variety
      }));
      await setChunkEmbeddings(items);
    });

    it("should return chunks ordered by similarity", async () => {
      const queryEmbedding = createTestEmbedding(0); // Same as first chunk
      const results = await searchSimilarChunks(
        TEST_REPO_ID,
        queryEmbedding,
        5,
        0.0
      );

      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(5);

      // Verify descending similarity order
      for (let i = 1; i < results.length; i++) {
        const prev = results[i - 1]!;
        const curr = results[i]!;
        expect(prev.similarity).toBeGreaterThanOrEqual(curr.similarity);
      }
    });

    it("should filter by minimum similarity", async () => {
      const queryEmbedding = createTestEmbedding(0);
      const highThreshold = 0.99;
      const results = await searchSimilarChunks(
        TEST_REPO_ID,
        queryEmbedding,
        10,
        highThreshold
      );

      for (const result of results) {
        expect(result.similarity).toBeGreaterThanOrEqual(highThreshold);
      }
    });

    it("should respect topK limit", async () => {
      const queryEmbedding = createTestEmbedding(0);
      const topK = 2;
      const results = await searchSimilarChunks(
        TEST_REPO_ID,
        queryEmbedding,
        topK,
        0.0
      );

      expect(results.length).toBeLessThanOrEqual(topK);
    });

    it("should return correct chunk fields", async () => {
      const queryEmbedding = createTestEmbedding(0);
      const results = await searchSimilarChunks(
        TEST_REPO_ID,
        queryEmbedding,
        1,
        0.0
      );

      expect(results.length).toBe(1);
      const result = results[0]!;

      expect(result).toHaveProperty("id");
      expect(result).toHaveProperty("repoId");
      expect(result).toHaveProperty("filePath");
      expect(result).toHaveProperty("startLine");
      expect(result).toHaveProperty("endLine");
      expect(result).toHaveProperty("content");
      expect(result).toHaveProperty("language");
      expect(result).toHaveProperty("chunkType");
      expect(result).toHaveProperty("similarity");

      expect(result.repoId).toBe(TEST_REPO_ID);
      expect(typeof result.similarity).toBe("number");
    });
  });

  describe("countChunksWithEmbeddings", () => {
    it("should return correct counts", async () => {
      // Initially no embeddings
      const before = await countChunksWithEmbeddings(TEST_REPO_ID);
      expect(before.total).toBe(5);
      expect(before.withEmbedding).toBe(0);

      // Add embeddings to 3 chunks
      await setChunkEmbeddings([
        { chunkId: getChunkId(0), embedding: createTestEmbedding(30) },
        { chunkId: getChunkId(1), embedding: createTestEmbedding(31) },
        { chunkId: getChunkId(2), embedding: createTestEmbedding(32) },
      ]);

      const after = await countChunksWithEmbeddings(TEST_REPO_ID);
      expect(after.total).toBe(5);
      expect(after.withEmbedding).toBe(3);
    });
  });

  describe("clearRepositoryEmbeddings", () => {
    it("should clear all embeddings for a repository", async () => {
      // Add embeddings to all chunks
      await setChunkEmbeddings(
        testChunkIds.map((id, i) => ({
          chunkId: id,
          embedding: createTestEmbedding(40 + i),
        }))
      );

      // Verify embeddings exist
      const before = await countChunksWithEmbeddings(TEST_REPO_ID);
      expect(before.withEmbedding).toBe(5);

      // Clear embeddings
      const cleared = await clearRepositoryEmbeddings(TEST_REPO_ID);
      expect(cleared).toBe(5);

      // Verify embeddings are gone
      const after = await countChunksWithEmbeddings(TEST_REPO_ID);
      expect(after.withEmbedding).toBe(0);
    });
  });
});
