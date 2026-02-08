import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock prisma - factory must not reference outer variables
vi.mock("@ducsigr/db", () => ({
  prisma: {
    $transaction: vi.fn(),
  },
}));

// Import after mocks
import { prisma } from "@ducsigr/db";
import { GitHubService } from "../github.service";

// ============================================================
// TEST FIXTURES
// ============================================================

const MOCK_REPO_ID = "repo_123";

const MOCK_CHUNKS = [
  {
    filePath: "src/index.ts",
    startLine: 1,
    endLine: 10,
    content: "export function main() {}",
    contentHash: "hash_aaa",
    language: "typescript",
    chunkType: "function",
  },
  {
    filePath: "src/utils.ts",
    startLine: 1,
    endLine: 5,
    content: "export const add = (a, b) => a + b;",
    contentHash: "hash_bbb",
    language: "typescript",
    chunkType: "function",
  },
  {
    filePath: "src/lib/format.ts",
    startLine: 1,
    endLine: 8,
    content: "export function formatDate(d: Date) {}",
    contentHash: "hash_ccc",
    language: "typescript",
    chunkType: "function",
  },
];

const BASE_INPUT = {
  repoId: MOCK_REPO_ID,
  event: "push" as const,
  commitSha: "abc123",
  commitMessage: "test commit",
  commitAuthor: "Test User",
  commitAuthorEmail: "test@test.com",
  commitTimestamp: new Date().toISOString(),
  changedFiles: ["src/index.ts", "src/utils.ts", "src/lib/format.ts"],
  chunks: MOCK_CHUNKS,
};

// Helper to set up the transaction mock with custom tx behavior
function setupTransaction(txFactory: () => Record<string, unknown>) {
  vi.mocked(prisma.$transaction).mockImplementation(async (fn) => {
    const tx = txFactory();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (fn as any)(tx);
  });
}

// ============================================================
// TESTS
// ============================================================

describe("GitHubService.storeIndexedData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns chunkIds with id and contentHash for created chunks", async () => {
    const mockCreatedChunks = [
      { id: "chunk_1", contentHash: "hash_aaa" },
      { id: "chunk_2", contentHash: "hash_bbb" },
      { id: "chunk_3", contentHash: "hash_ccc" },
    ];

    setupTransaction(() => ({
      gitCommit: { upsert: vi.fn().mockResolvedValue({}) },
      codeChunk: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        createMany: vi.fn().mockResolvedValue({ count: 3 }),
        findMany: vi.fn().mockResolvedValue(mockCreatedChunks),
      },
      gitHubRepository: { update: vi.fn().mockResolvedValue({}) },
    }));

    const result = await GitHubService.storeIndexedData(BASE_INPUT);

    expect(result.chunksCreated).toBe(3);
    expect(result.chunkIds).toHaveLength(3);
    expect(result.chunkIds[0]).toEqual({ id: "chunk_1", contentHash: "hash_aaa" });
    expect(result.chunkIds[1]).toEqual({ id: "chunk_2", contentHash: "hash_bbb" });
    expect(result.chunkIds[2]).toEqual({ id: "chunk_3", contentHash: "hash_ccc" });
  });

  it("returns empty chunkIds when no chunks provided", async () => {
    setupTransaction(() => ({
      gitCommit: { upsert: vi.fn().mockResolvedValue({}) },
      codeChunk: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        createMany: vi.fn(),
        findMany: vi.fn(),
      },
      gitHubRepository: { update: vi.fn().mockResolvedValue({}) },
    }));

    const result = await GitHubService.storeIndexedData({
      ...BASE_INPUT,
      changedFiles: [],
      chunks: [],
    });

    expect(result.chunksCreated).toBe(0);
    expect(result.chunkIds).toEqual([]);
  });

  it("queries back chunks by contentHash after createMany", async () => {
    const findManyMock = vi.fn().mockResolvedValue([
      { id: "chunk_1", contentHash: "hash_aaa" },
    ]);

    setupTransaction(() => ({
      gitCommit: { upsert: vi.fn().mockResolvedValue({}) },
      codeChunk: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
        findMany: findManyMock,
      },
      gitHubRepository: { update: vi.fn().mockResolvedValue({}) },
    }));

    await GitHubService.storeIndexedData({
      ...BASE_INPUT,
      changedFiles: ["src/index.ts"],
      chunks: [MOCK_CHUNKS[0]!],
    });

    expect(findManyMock).toHaveBeenCalledWith({
      where: {
        repoId: MOCK_REPO_ID,
        contentHash: { in: ["hash_aaa"] },
      },
      select: { id: true, contentHash: true },
    });
  });

  it("uses skipDuplicates when creating chunks", async () => {
    const createManyMock = vi.fn().mockResolvedValue({ count: 2 });

    setupTransaction(() => ({
      gitCommit: { upsert: vi.fn().mockResolvedValue({}) },
      codeChunk: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        createMany: createManyMock,
        findMany: vi.fn().mockResolvedValue([
          { id: "chunk_1", contentHash: "hash_aaa" },
          { id: "chunk_2", contentHash: "hash_bbb" },
        ]),
      },
      gitHubRepository: { update: vi.fn().mockResolvedValue({}) },
    }));

    await GitHubService.storeIndexedData({
      ...BASE_INPUT,
      changedFiles: ["src/index.ts", "src/utils.ts"],
      chunks: [MOCK_CHUNKS[0]!, MOCK_CHUNKS[1]!],
    });

    expect(createManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true })
    );
  });

  it("deletes old chunks for changed files before inserting", async () => {
    const deleteManyMock = vi.fn().mockResolvedValue({ count: 2 });

    setupTransaction(() => ({
      gitCommit: { upsert: vi.fn().mockResolvedValue({}) },
      codeChunk: {
        deleteMany: deleteManyMock,
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
        findMany: vi.fn().mockResolvedValue([
          { id: "chunk_1", contentHash: "hash_aaa" },
        ]),
      },
      gitHubRepository: { update: vi.fn().mockResolvedValue({}) },
    }));

    await GitHubService.storeIndexedData({
      ...BASE_INPUT,
      changedFiles: ["src/index.ts", "src/old-file.ts"],
      chunks: [MOCK_CHUNKS[0]!],
    });

    expect(deleteManyMock).toHaveBeenCalledWith({
      where: {
        repoId: MOCK_REPO_ID,
        filePath: { in: ["src/index.ts", "src/old-file.ts"] },
      },
    });
  });

  it("handles PR event without chunks", async () => {
    setupTransaction(() => ({
      gitPullRequest: { upsert: vi.fn().mockResolvedValue({}) },
      codeChunk: {
        deleteMany: vi.fn(),
        createMany: vi.fn(),
        findMany: vi.fn(),
      },
      gitHubRepository: { update: vi.fn().mockResolvedValue({}) },
    }));

    const result = await GitHubService.storeIndexedData({
      repoId: MOCK_REPO_ID,
      event: "pull_request",
      prNumber: 42,
      prTitle: "Test PR",
      prState: "open",
      prAuthor: "test-user",
      prBaseBranch: "main",
      prHeadBranch: "feature/test",
      changedFiles: [],
      chunks: [],
    });

    expect(result.chunksCreated).toBe(0);
    expect(result.chunkIds).toEqual([]);
  });
});
