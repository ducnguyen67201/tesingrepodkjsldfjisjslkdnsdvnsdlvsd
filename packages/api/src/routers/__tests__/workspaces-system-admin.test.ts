import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { createCallerFactory } from "../../trpc";
import type { SessionWithWorkspaces } from "../../context";

// Mock prisma
vi.mock("@ducsigr/db", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    workspace: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    workspaceMember: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

// Import after mocks
import { prisma } from "@ducsigr/db";
import { workspacesRouter } from "../workspaces";

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

const mockSession: SessionWithWorkspaces = {
  user: {
    ...mockUser,
    workspaces: [mockWorkspace],
    projects: [],
  },
  expires: new Date(Date.now() + 86400000).toISOString(),
};

// ============================================================
// TEST HELPERS
// ============================================================

const createCaller = createCallerFactory(workspacesRouter);

const createTestCaller = (session: SessionWithWorkspaces | null = mockSession) => {
  return createCaller({ session });
};

// ============================================================
// TESTS
// ============================================================

describe("workspacesRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================================
  // checkSystemAdmin
  // ============================================================
  describe("checkSystemAdmin", () => {
    it("returns true for system admin user", async () => {
      const caller = createTestCaller();

      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: mockUser.id,
        isSystemAdmin: true,
      } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

      const result = await caller.checkSystemAdmin();

      expect(result).toEqual({ isSystemAdmin: true });
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        select: { isSystemAdmin: true },
      });
    });

    it("returns false for non-admin user", async () => {
      const caller = createTestCaller();

      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: mockUser.id,
        isSystemAdmin: false,
      } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

      const result = await caller.checkSystemAdmin();

      expect(result).toEqual({ isSystemAdmin: false });
    });

    it("returns false when user not found", async () => {
      const caller = createTestCaller();

      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      const result = await caller.checkSystemAdmin();

      expect(result).toEqual({ isSystemAdmin: false });
    });

    it("returns false when isSystemAdmin is undefined", async () => {
      const caller = createTestCaller();

      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: mockUser.id,
        isSystemAdmin: undefined,
      } as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>);

      const result = await caller.checkSystemAdmin();

      expect(result).toEqual({ isSystemAdmin: false });
    });

    it("requires authentication", async () => {
      const caller = createTestCaller(null);

      await expect(caller.checkSystemAdmin()).rejects.toThrow(TRPCError);
    });

    it("queries the correct user from session", async () => {
      const customSession: SessionWithWorkspaces = {
        user: {
          id: "custom_user_456",
          name: "Custom User",
          email: "custom@example.com",
          image: null,
          workspaces: [],
          projects: [],
        },
        expires: new Date(Date.now() + 86400000).toISOString(),
      };
      const caller = createTestCaller(customSession);

      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: "custom_user_456",
        isSystemAdmin: true,
      } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

      await caller.checkSystemAdmin();

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: "custom_user_456" },
        select: { isSystemAdmin: true },
      });
    });
  });

  // ============================================================
  // checkApproval (existing test to verify pattern consistency)
  // ============================================================
  describe("checkApproval", () => {
    it("returns true for approved user", async () => {
      const caller = createTestCaller();

      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: mockUser.id,
        isApproved: true,
      } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

      const result = await caller.checkApproval();

      expect(result).toEqual({ isApproved: true });
    });

    it("returns false for non-approved user", async () => {
      const caller = createTestCaller();

      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: mockUser.id,
        isApproved: false,
      } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

      const result = await caller.checkApproval();

      expect(result).toEqual({ isApproved: false });
    });

    it("requires authentication", async () => {
      const caller = createTestCaller(null);

      await expect(caller.checkApproval()).rejects.toThrow(TRPCError);
    });
  });
});
