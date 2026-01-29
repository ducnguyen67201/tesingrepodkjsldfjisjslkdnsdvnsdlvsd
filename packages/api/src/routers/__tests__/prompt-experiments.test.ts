import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { createCallerFactory } from "../../trpc";
import type { SessionWithWorkspaces } from "../../context";

// Mock Temporal client
vi.mock("../../lib/temporal", () => ({
  getTemporalClient: vi.fn().mockResolvedValue({
    workflow: {
      start: vi.fn().mockResolvedValue({ workflowId: "test-workflow-id" }),
    },
  }),
  getTaskQueue: vi.fn().mockReturnValue("test-queue"),
}));

// Mock prisma
vi.mock("@ducsigr/db", () => ({
  Prisma: {
    JsonNull: null,
  },
  prisma: {
    project: {
      findFirst: vi.fn(),
    },
    promptExperiment: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    promptExperimentVariant: {
      create: vi.fn(),
      update: vi.fn(),
    },
    promptVersion: {
      findUnique: vi.fn(),
    },
    span: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn((callback) => {
      if (typeof callback === "function") {
        return callback({
          promptExperiment: {
            create: vi.fn(),
            update: vi.fn(),
          },
          promptExperimentVariant: {
            create: vi.fn(),
            update: vi.fn(),
          },
        });
      }
      return Promise.resolve(callback);
    }),
  },
}));

// Import after mocks
import { prisma } from "@ducsigr/db";
import { promptExperimentsRouter } from "../prompt-experiments";

// ============================================================
// TEST FIXTURES
// ============================================================

const mockUser = {
  id: "user_123",
  name: "Test User",
  email: "test@example.com",
  image: null,
};

const mockWorkspace = {
  id: "ws_123",
  slug: "test-workspace",
  role: "ADMIN",
  isPersonal: false,
};

const mockProject = {
  id: "proj_123",
  workspaceId: "ws_123",
  name: "Test Project",
};

const mockSession: SessionWithWorkspaces = {
  user: {
    ...mockUser,
    workspaces: [mockWorkspace],
    projects: [{ id: "proj_123", role: "ADMIN" }],
  },
  expires: new Date(Date.now() + 86400000).toISOString(),
};

const mockPromptVersion = {
  id: "ver_123",
  promptId: "prompt_123",
  version: 1,
  type: "TEXT",
  content: { text: "Hello {{name}}" },
  variables: [{ name: "name", type: "string" }],
  config: null,
  createdAt: new Date(),
  prompt: {
    id: "prompt_123",
    name: "Test Prompt",
    slug: "test-prompt",
    project: {
      workspaceId: "ws_123",
    },
  },
};

const mockPromptVersionB = {
  ...mockPromptVersion,
  id: "ver_456",
  version: 2,
  content: { text: "Hi {{name}}" },
};

const mockExperiment = {
  id: "exp_123",
  projectId: "proj_123",
  name: "Test Experiment",
  slug: "test-experiment",
  description: "Test description",
  status: "draft",
  allocationPct: 100,
  assignmentKey: "userId",
  assignmentSeed: "seed_123",
  tags: ["test"],
  metrics: null,
  startedAt: null,
  endedAt: null,
  createdById: "user_123",
  createdAt: new Date(),
  updatedAt: new Date(),
  project: {
    workspaceId: "ws_123",
    name: "Test Project",
  },
  variants: [
    {
      id: "var_a",
      name: "A",
      weight: 5000,
      isControl: true,
      promptVersionId: "ver_123",
      createdAt: new Date(),
      promptVersion: {
        id: "ver_123",
        version: 1,
        type: "TEXT",
        prompt: { id: "prompt_123", name: "Test Prompt", slug: "test-prompt" },
      },
    },
    {
      id: "var_b",
      name: "B",
      weight: 5000,
      isControl: false,
      promptVersionId: "ver_456",
      createdAt: new Date(),
      promptVersion: {
        id: "ver_456",
        version: 2,
        type: "TEXT",
        prompt: { id: "prompt_123", name: "Test Prompt", slug: "test-prompt" },
      },
    },
  ],
};

const mockRunningExperiment = {
  ...mockExperiment,
  id: "exp_running",
  status: "running",
  startedAt: new Date(),
};

// ============================================================
// TEST HELPERS
// ============================================================

const createCaller = createCallerFactory(promptExperimentsRouter);

const createTestCaller = (session: SessionWithWorkspaces | null = mockSession) => {
  return createCaller({ session });
};

// ============================================================
// TESTS
// ============================================================

describe("promptExperimentsRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================================
  // list
  // ============================================================
  describe("list", () => {
    it("returns list of experiments for a project", async () => {
      const caller = createTestCaller();
      vi.mocked(prisma.project.findFirst).mockResolvedValue(mockProject as never);
      vi.mocked(prisma.promptExperiment.findMany).mockResolvedValue([mockExperiment] as never);

      const result = await caller.list({
        workspaceSlug: "test-workspace",
        projectId: "proj_123",
        limit: 20,
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.id).toBe("exp_123");
      expect(result.items[0]?.name).toBe("Test Experiment");
      expect(result.items[0]?.variants).toHaveLength(2);
    });

    it("filters by status", async () => {
      const caller = createTestCaller();
      vi.mocked(prisma.project.findFirst).mockResolvedValue(mockProject as never);
      vi.mocked(prisma.promptExperiment.findMany).mockResolvedValue([mockRunningExperiment] as never);

      const result = await caller.list({
        workspaceSlug: "test-workspace",
        projectId: "proj_123",
        status: "running",
        limit: 20,
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.status).toBe("running");
    });

    it("filters by query", async () => {
      const caller = createTestCaller();
      vi.mocked(prisma.project.findFirst).mockResolvedValue(mockProject as never);
      vi.mocked(prisma.promptExperiment.findMany).mockResolvedValue([mockExperiment] as never);

      await caller.list({
        workspaceSlug: "test-workspace",
        projectId: "proj_123",
        query: "test",
        limit: 20,
      });

      expect(prisma.promptExperiment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { name: { contains: "test", mode: "insensitive" } },
            ]),
          }),
        })
      );
    });

    it("throws NOT_FOUND if project not in workspace", async () => {
      const caller = createTestCaller();
      vi.mocked(prisma.project.findFirst).mockResolvedValue(null);

      await expect(
        caller.list({
          workspaceSlug: "test-workspace",
          projectId: "proj_123",
          limit: 20,
        })
      ).rejects.toThrow(TRPCError);
    });

    it("requires authentication", async () => {
      const caller = createTestCaller(null);

      await expect(
        caller.list({
          workspaceSlug: "test-workspace",
          projectId: "proj_123",
          limit: 20,
        })
      ).rejects.toThrow(TRPCError);
    });
  });

  // ============================================================
  // get
  // ============================================================
  describe("get", () => {
    it("returns experiment with full details", async () => {
      const caller = createTestCaller();
      vi.mocked(prisma.promptExperiment.findUnique).mockResolvedValue(mockExperiment as never);

      const result = await caller.get({
        workspaceSlug: "test-workspace",
        experimentId: "exp_123",
      });

      expect(result.id).toBe("exp_123");
      expect(result.name).toBe("Test Experiment");
      expect(result.variants).toHaveLength(2);
      expect(result.variants[0]?.isControl).toBe(true);
    });

    it("throws NOT_FOUND if experiment does not exist", async () => {
      const caller = createTestCaller();
      vi.mocked(prisma.promptExperiment.findUnique).mockResolvedValue(null);

      await expect(
        caller.get({
          workspaceSlug: "test-workspace",
          experimentId: "nonexistent",
        })
      ).rejects.toThrow(TRPCError);
    });

    it("throws FORBIDDEN if experiment in different workspace", async () => {
      const caller = createTestCaller();
      vi.mocked(prisma.promptExperiment.findUnique).mockResolvedValue({
        ...mockExperiment,
        project: { workspaceId: "other_workspace", name: "Other" },
      } as never);

      await expect(
        caller.get({
          workspaceSlug: "test-workspace",
          experimentId: "exp_123",
        })
      ).rejects.toThrow(TRPCError);
    });
  });

  // ============================================================
  // create
  // ============================================================
  describe("create", () => {
    it("creates experiment with variants", async () => {
      const caller = createTestCaller();
      vi.mocked(prisma.project.findFirst).mockResolvedValue(mockProject as never);
      vi.mocked(prisma.promptExperiment.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.promptVersion.findUnique)
        .mockResolvedValueOnce(mockPromptVersion as never)
        .mockResolvedValueOnce(mockPromptVersionB as never);

      const mockTx = {
        promptExperiment: {
          create: vi.fn().mockResolvedValue({ id: "new_exp", slug: "new-experiment" }),
        },
        promptExperimentVariant: {
          create: vi.fn().mockResolvedValue({}),
        },
      };

      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        if (typeof callback === "function") {
          return callback(mockTx as never);
        }
        return Promise.resolve(callback);
      });

      const result = await caller.create({
        workspaceSlug: "test-workspace",
        projectId: "proj_123",
        name: "New Experiment",
        slug: "new-experiment",
        allocationPct: 100,
        assignmentKey: "userId",
        variants: [
          { name: "A", weight: 5000, promptVersionId: "ver_123", isControl: true },
          { name: "B", weight: 5000, promptVersionId: "ver_456", isControl: false },
        ],
      });

      expect(result.id).toBe("new_exp");
      expect(result.slug).toBe("new-experiment");
      expect(mockTx.promptExperimentVariant.create).toHaveBeenCalledTimes(2);
    });

    it("throws CONFLICT if slug already exists", async () => {
      const caller = createTestCaller();
      vi.mocked(prisma.project.findFirst).mockResolvedValue(mockProject as never);
      vi.mocked(prisma.promptExperiment.findUnique).mockResolvedValue(mockExperiment as never);

      await expect(
        caller.create({
          workspaceSlug: "test-workspace",
          projectId: "proj_123",
          name: "New Experiment",
          slug: "test-experiment",
          allocationPct: 100,
          assignmentKey: "userId",
          variants: [
            { name: "A", weight: 5000, promptVersionId: "ver_123", isControl: true },
            { name: "B", weight: 5000, promptVersionId: "ver_456", isControl: false },
          ],
        })
      ).rejects.toThrow(TRPCError);
    });

    it("throws NOT_FOUND if prompt version does not exist", async () => {
      const caller = createTestCaller();
      vi.mocked(prisma.project.findFirst).mockResolvedValue(mockProject as never);
      vi.mocked(prisma.promptExperiment.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.promptVersion.findUnique).mockResolvedValue(null);

      await expect(
        caller.create({
          workspaceSlug: "test-workspace",
          projectId: "proj_123",
          name: "New Experiment",
          slug: "new-experiment",
          allocationPct: 100,
          assignmentKey: "userId",
          variants: [
            { name: "A", weight: 5000, promptVersionId: "ver_123", isControl: true },
            { name: "B", weight: 5000, promptVersionId: "ver_456", isControl: false },
          ],
        })
      ).rejects.toThrow(TRPCError);
    });
  });

  // ============================================================
  // start
  // ============================================================
  describe("start", () => {
    it("starts a draft experiment", async () => {
      const caller = createTestCaller();
      vi.mocked(prisma.promptExperiment.findUnique).mockResolvedValue({
        ...mockExperiment,
        status: "draft",
        project: { workspaceId: "ws_123" },
      } as never);
      vi.mocked(prisma.promptExperiment.update).mockResolvedValue({
        id: "exp_123",
        status: "running",
      } as never);

      const result = await caller.start({
        workspaceSlug: "test-workspace",
        experimentId: "exp_123",
      });

      expect(result.status).toBe("running");
      expect(prisma.promptExperiment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "running",
          }),
        })
      );
    });

    it("resumes a paused experiment", async () => {
      const caller = createTestCaller();
      vi.mocked(prisma.promptExperiment.findUnique).mockResolvedValue({
        ...mockExperiment,
        status: "paused",
        project: { workspaceId: "ws_123" },
      } as never);
      vi.mocked(prisma.promptExperiment.update).mockResolvedValue({
        id: "exp_123",
        status: "running",
      } as never);

      const result = await caller.start({
        workspaceSlug: "test-workspace",
        experimentId: "exp_123",
      });

      expect(result.status).toBe("running");
    });

    it("throws BAD_REQUEST if already running", async () => {
      const caller = createTestCaller();
      vi.mocked(prisma.promptExperiment.findUnique).mockResolvedValue({
        ...mockExperiment,
        status: "running",
        project: { workspaceId: "ws_123" },
      } as never);

      await expect(
        caller.start({
          workspaceSlug: "test-workspace",
          experimentId: "exp_123",
        })
      ).rejects.toThrow(TRPCError);
    });

    it("throws BAD_REQUEST if completed", async () => {
      const caller = createTestCaller();
      vi.mocked(prisma.promptExperiment.findUnique).mockResolvedValue({
        ...mockExperiment,
        status: "completed",
        project: { workspaceId: "ws_123" },
      } as never);

      await expect(
        caller.start({
          workspaceSlug: "test-workspace",
          experimentId: "exp_123",
        })
      ).rejects.toThrow(TRPCError);
    });
  });

  // ============================================================
  // pause
  // ============================================================
  describe("pause", () => {
    it("pauses a running experiment", async () => {
      const caller = createTestCaller();
      vi.mocked(prisma.promptExperiment.findUnique).mockResolvedValue({
        ...mockExperiment,
        status: "running",
        project: { workspaceId: "ws_123" },
      } as never);
      vi.mocked(prisma.promptExperiment.update).mockResolvedValue({
        id: "exp_123",
        status: "paused",
      } as never);

      const result = await caller.pause({
        workspaceSlug: "test-workspace",
        experimentId: "exp_123",
      });

      expect(result.status).toBe("paused");
    });

    it("throws BAD_REQUEST if not running", async () => {
      const caller = createTestCaller();
      vi.mocked(prisma.promptExperiment.findUnique).mockResolvedValue({
        ...mockExperiment,
        status: "draft",
        project: { workspaceId: "ws_123" },
      } as never);

      await expect(
        caller.pause({
          workspaceSlug: "test-workspace",
          experimentId: "exp_123",
        })
      ).rejects.toThrow(TRPCError);
    });
  });

  // ============================================================
  // stop
  // ============================================================
  describe("stop", () => {
    it("completes a running experiment", async () => {
      const caller = createTestCaller();
      vi.mocked(prisma.promptExperiment.findUnique).mockResolvedValue({
        ...mockExperiment,
        status: "running",
        project: { workspaceId: "ws_123" },
      } as never);
      vi.mocked(prisma.promptExperiment.update).mockResolvedValue({
        id: "exp_123",
        status: "completed",
      } as never);

      const result = await caller.stop({
        workspaceSlug: "test-workspace",
        experimentId: "exp_123",
      });

      expect(result.status).toBe("completed");
    });

    it("completes a paused experiment", async () => {
      const caller = createTestCaller();
      vi.mocked(prisma.promptExperiment.findUnique).mockResolvedValue({
        ...mockExperiment,
        status: "paused",
        project: { workspaceId: "ws_123" },
      } as never);
      vi.mocked(prisma.promptExperiment.update).mockResolvedValue({
        id: "exp_123",
        status: "completed",
      } as never);

      const result = await caller.stop({
        workspaceSlug: "test-workspace",
        experimentId: "exp_123",
      });

      expect(result.status).toBe("completed");
    });

    it("accepts optional winner ID", async () => {
      const caller = createTestCaller();
      vi.mocked(prisma.promptExperiment.findUnique).mockResolvedValue({
        ...mockExperiment,
        status: "running",
        project: { workspaceId: "ws_123" },
      } as never);
      vi.mocked(prisma.promptExperiment.update).mockResolvedValue({
        id: "exp_123",
        status: "completed",
      } as never);

      const result = await caller.stop({
        workspaceSlug: "test-workspace",
        experimentId: "exp_123",
        winnerId: "var_a",
      });

      expect(result.status).toBe("completed");
    });
  });

  // ============================================================
  // archive
  // ============================================================
  describe("archive", () => {
    it("archives a completed experiment", async () => {
      const caller = createTestCaller();
      vi.mocked(prisma.promptExperiment.findUnique).mockResolvedValue({
        ...mockExperiment,
        status: "completed",
        project: { workspaceId: "ws_123" },
      } as never);
      vi.mocked(prisma.promptExperiment.update).mockResolvedValue({
        id: "exp_123",
        status: "archived",
      } as never);

      const result = await caller.archive({
        workspaceSlug: "test-workspace",
        experimentId: "exp_123",
      });

      expect(result.status).toBe("archived");
    });

    it("archives a draft experiment", async () => {
      const caller = createTestCaller();
      vi.mocked(prisma.promptExperiment.findUnique).mockResolvedValue({
        ...mockExperiment,
        status: "draft",
        project: { workspaceId: "ws_123" },
      } as never);
      vi.mocked(prisma.promptExperiment.update).mockResolvedValue({
        id: "exp_123",
        status: "archived",
      } as never);

      const result = await caller.archive({
        workspaceSlug: "test-workspace",
        experimentId: "exp_123",
      });

      expect(result.status).toBe("archived");
    });

    it("throws BAD_REQUEST if running", async () => {
      const caller = createTestCaller();
      vi.mocked(prisma.promptExperiment.findUnique).mockResolvedValue({
        ...mockExperiment,
        status: "running",
        project: { workspaceId: "ws_123" },
      } as never);

      await expect(
        caller.archive({
          workspaceSlug: "test-workspace",
          experimentId: "exp_123",
        })
      ).rejects.toThrow(TRPCError);
    });
  });

  // ============================================================
  // delete
  // ============================================================
  describe("delete", () => {
    it("deletes a draft experiment", async () => {
      const caller = createTestCaller();
      vi.mocked(prisma.promptExperiment.findUnique).mockResolvedValue({
        ...mockExperiment,
        status: "draft",
        project: { workspaceId: "ws_123" },
      } as never);
      vi.mocked(prisma.promptExperiment.delete).mockResolvedValue({} as never);

      const result = await caller.delete({
        workspaceSlug: "test-workspace",
        experimentId: "exp_123",
      });

      expect(result.success).toBe(true);
    });

    it("deletes an archived experiment", async () => {
      const caller = createTestCaller();
      vi.mocked(prisma.promptExperiment.findUnique).mockResolvedValue({
        ...mockExperiment,
        status: "archived",
        project: { workspaceId: "ws_123" },
      } as never);
      vi.mocked(prisma.promptExperiment.delete).mockResolvedValue({} as never);

      const result = await caller.delete({
        workspaceSlug: "test-workspace",
        experimentId: "exp_123",
      });

      expect(result.success).toBe(true);
    });

    it("throws BAD_REQUEST if running", async () => {
      const caller = createTestCaller();
      vi.mocked(prisma.promptExperiment.findUnique).mockResolvedValue({
        ...mockExperiment,
        status: "running",
        project: { workspaceId: "ws_123" },
      } as never);

      await expect(
        caller.delete({
          workspaceSlug: "test-workspace",
          experimentId: "exp_123",
        })
      ).rejects.toThrow(TRPCError);
    });

    it("throws BAD_REQUEST if completed", async () => {
      const caller = createTestCaller();
      vi.mocked(prisma.promptExperiment.findUnique).mockResolvedValue({
        ...mockExperiment,
        status: "completed",
        project: { workspaceId: "ws_123" },
      } as never);

      await expect(
        caller.delete({
          workspaceSlug: "test-workspace",
          experimentId: "exp_123",
        })
      ).rejects.toThrow(TRPCError);
    });
  });

  // ============================================================
  // analytics
  // ============================================================
  describe("analytics", () => {
    it("returns analytics for experiment", async () => {
      const caller = createTestCaller();
      vi.mocked(prisma.promptExperiment.findUnique).mockResolvedValue({
        ...mockExperiment,
        project: { workspaceId: "ws_123" },
      } as never);
      vi.mocked(prisma.span.findMany).mockResolvedValue([
        {
          promptVariantId: "var_a",
          promptVariantName: "A",
          durationMs: 100,
          totalCost: 0.01,
          statusCode: "OK",
        },
        {
          promptVariantId: "var_a",
          promptVariantName: "A",
          durationMs: 150,
          totalCost: 0.02,
          statusCode: "OK",
        },
        {
          promptVariantId: "var_b",
          promptVariantName: "B",
          durationMs: 120,
          totalCost: 0.015,
          statusCode: "OK",
        },
        {
          promptVariantId: "var_b",
          promptVariantName: "B",
          durationMs: 200,
          totalCost: 0.025,
          statusCode: "ERROR",
        },
      ] as never);

      const result = await caller.analytics({
        workspaceSlug: "test-workspace",
        experimentId: "exp_123",
      });

      expect(result.totalUsage).toBe(4);
      expect(result.byVariant).toHaveLength(2);

      const varA = result.byVariant.find((v) => v.variantId === "var_a");
      expect(varA?.usageCount).toBe(2);
      expect(varA?.avgLatencyMs).toBe(125);
      expect(varA?.errorRate).toBe(0);

      const varB = result.byVariant.find((v) => v.variantId === "var_b");
      expect(varB?.usageCount).toBe(2);
      expect(varB?.errorRate).toBe(0.5);

      expect(result.delta).toBeDefined();
    });

    it("returns empty analytics when no spans", async () => {
      const caller = createTestCaller();
      vi.mocked(prisma.promptExperiment.findUnique).mockResolvedValue({
        ...mockExperiment,
        project: { workspaceId: "ws_123" },
      } as never);
      vi.mocked(prisma.span.findMany).mockResolvedValue([]);

      const result = await caller.analytics({
        workspaceSlug: "test-workspace",
        experimentId: "exp_123",
      });

      expect(result.totalUsage).toBe(0);
      expect(result.byVariant).toHaveLength(2);
      expect(result.byVariant[0]?.usageCount).toBe(0);
    });
  });

  // ============================================================
  // updateWeights
  // ============================================================
  describe("updateWeights", () => {
    it("updates variant weights", async () => {
      const caller = createTestCaller();
      vi.mocked(prisma.promptExperiment.findUnique).mockResolvedValue({
        ...mockExperiment,
        project: { workspaceId: "ws_123" },
      } as never);

      const mockTx = {
        promptExperiment: {
          update: vi.fn().mockResolvedValue({}),
        },
        promptExperimentVariant: {
          update: vi.fn().mockResolvedValue({}),
        },
      };

      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        if (typeof callback === "function") {
          return callback(mockTx as never);
        }
        return Promise.resolve(callback);
      });

      const result = await caller.updateWeights({
        workspaceSlug: "test-workspace",
        experimentId: "exp_123",
        variants: [
          { variantId: "var_a", weight: 3000 },
          { variantId: "var_b", weight: 7000 },
        ],
      });

      expect(result.success).toBe(true);
      expect(mockTx.promptExperimentVariant.update).toHaveBeenCalledTimes(2);
    });
  });

  // ============================================================
  // getPresets
  // ============================================================
  describe("getPresets", () => {
    it("returns status labels and colors", async () => {
      const caller = createTestCaller();

      const result = await caller.getPresets();

      expect(result.statusLabels).toBeDefined();
      expect(result.statusLabels.draft).toBe("Draft");
      expect(result.statusLabels.running).toBe("Running");
      expect(result.statusColors).toBeDefined();
      expect(result.assignmentKeyLabels).toBeDefined();
      expect(result.totalBasisPoints).toBe(10000);
    });

    it("requires authentication", async () => {
      const caller = createTestCaller(null);

      await expect(caller.getPresets()).rejects.toThrow(TRPCError);
    });
  });

  // ============================================================
  // getTags
  // ============================================================
  describe("getTags", () => {
    it("returns unique tags for project", async () => {
      const caller = createTestCaller();
      vi.mocked(prisma.project.findFirst).mockResolvedValue(mockProject as never);
      vi.mocked(prisma.promptExperiment.findMany).mockResolvedValue([
        { tags: ["a", "b"] },
        { tags: ["b", "c"] },
        { tags: ["a", "d"] },
      ] as never);

      const result = await caller.getTags({
        workspaceSlug: "test-workspace",
        projectId: "proj_123",
      });

      expect(result).toEqual(["a", "b", "c", "d"]);
    });

    it("returns empty array when no experiments", async () => {
      const caller = createTestCaller();
      vi.mocked(prisma.project.findFirst).mockResolvedValue(mockProject as never);
      vi.mocked(prisma.promptExperiment.findMany).mockResolvedValue([]);

      const result = await caller.getTags({
        workspaceSlug: "test-workspace",
        projectId: "proj_123",
      });

      expect(result).toEqual([]);
    });
  });
});
