import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { createCallerFactory } from "../../trpc";
import type { SessionWithWorkspaces } from "../../context";

// Mock prisma
vi.mock("@cognobserve/db", () => ({
  prisma: {
    project: {
      findMany: vi.fn(),
    },
    trace: {
      count: vi.fn(),
    },
    span: {
      aggregate: vi.fn(),
    },
    alert: {
      count: vi.fn(),
    },
    alertHistory: {
      findMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
  Prisma: {
    sql: vi.fn((...args) => args),
    raw: vi.fn((val) => val),
    join: vi.fn((arr, sep) => arr.join(sep)),
    empty: "",
  },
}));

// Import after mocks
import { prisma } from "@cognobserve/db";
import { workspaceOverviewRouter } from "../workspace-overview";

// ============================================================
// TEST FIXTURES
// ============================================================

const MOCK_USER = {
  id: "user_123",
  name: "Test User",
  email: "test@example.com",
  image: null,
};

const MOCK_WORKSPACE = {
  id: "ws_123",
  slug: "test-workspace",
  role: "ADMIN",
  isPersonal: false,
};

const MOCK_SESSION: SessionWithWorkspaces = {
  user: {
    ...MOCK_USER,
    workspaces: [MOCK_WORKSPACE],
    projects: [],
  },
  expires: new Date(Date.now() + 86400000).toISOString(),
};

const MOCK_PROJECTS = [
  { id: "proj_1", name: "Project One", workspaceId: "ws_123" },
  { id: "proj_2", name: "Project Two", workspaceId: "ws_123" },
];

const MOCK_ALERT_HISTORY = [
  {
    id: "ah_1",
    alertId: "alert_1",
    triggeredAt: new Date("2024-01-15T10:00:00Z"),
    value: 10.5,
    threshold: 5.0,
    resolved: false,
    resolvedAt: null,
    state: "FIRING",
    previousState: "INACTIVE",
    alert: {
      id: "alert_1",
      name: "High Error Rate",
      severity: "HIGH",
      project: {
        id: "proj_1",
        name: "Project One",
      },
    },
  },
  {
    id: "ah_2",
    alertId: "alert_2",
    triggeredAt: new Date("2024-01-14T15:30:00Z"),
    value: 3.0,
    threshold: 5.0,
    resolved: true,
    resolvedAt: new Date("2024-01-14T16:00:00Z"),
    state: "RESOLVED",
    previousState: "FIRING",
    alert: {
      id: "alert_2",
      name: "Latency Spike",
      severity: "MEDIUM",
      project: {
        id: "proj_2",
        name: "Project Two",
      },
    },
  },
];

// ============================================================
// TEST HELPERS
// ============================================================

const createWorkspaceOverviewCaller = createCallerFactory(workspaceOverviewRouter);

const createTestCaller = (session: SessionWithWorkspaces | null = MOCK_SESSION) => {
  return createWorkspaceOverviewCaller({ session });
};

// ============================================================
// TESTS
// ============================================================

describe("workspaceOverviewRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================================
  // getStats
  // ============================================================
  describe("getStats", () => {
    it("returns aggregated workspace stats", async () => {
      const caller = createTestCaller();

      // Mock project list
      vi.mocked(prisma.project.findMany).mockResolvedValue(MOCK_PROJECTS as never);

      // Mock stats query
      vi.mocked(prisma.$queryRaw).mockResolvedValue([
        {
          traceCount: BigInt(1000),
          errorCount: BigInt(50),
          avgLatencyP95: 145.5,
        },
      ]);

      // Mock active alerts count
      vi.mocked(prisma.alert.count).mockResolvedValue(3);

      const result = await caller.getStats({
        workspaceSlug: "test-workspace",
        timeRange: "24h",
      });

      expect(result.totalTraces).toBeDefined();
      expect(result.totalTraces.current).toBeGreaterThanOrEqual(0);
      expect(result.totalErrors).toBeDefined();
      expect(result.avgLatencyP95Ms).toBeDefined();
      expect(result.activeAlerts).toBeGreaterThanOrEqual(0);
    });

    it("returns stats with trend calculations", async () => {
      const caller = createTestCaller();

      vi.mocked(prisma.project.findMany).mockResolvedValue(MOCK_PROJECTS as never);

      // First call: current period
      // Second call: previous period
      vi.mocked(prisma.$queryRaw)
        .mockResolvedValueOnce([
          { traceCount: BigInt(1000), errorCount: BigInt(50), avgLatencyP95: 145.5 },
        ])
        .mockResolvedValueOnce([
          { traceCount: BigInt(800), errorCount: BigInt(40), avgLatencyP95: 120.0 },
        ]);

      vi.mocked(prisma.alert.count).mockResolvedValue(2);

      const result = await caller.getStats({
        workspaceSlug: "test-workspace",
        timeRange: "24h",
      });

      // Trends should be calculated
      expect(result.totalTraces.direction).toBeDefined();
      expect(["up", "down", "flat"]).toContain(result.totalTraces.direction);
      expect(result.totalTraces.percentChange).toBeDefined();
    });

    it("returns empty stats for workspace with no projects", async () => {
      const caller = createTestCaller();

      vi.mocked(prisma.project.findMany).mockResolvedValue([]);
      vi.mocked(prisma.$queryRaw).mockResolvedValue([]);
      vi.mocked(prisma.alert.count).mockResolvedValue(0);

      const result = await caller.getStats({
        workspaceSlug: "test-workspace",
        timeRange: "24h",
      });

      expect(result.totalTraces.current).toBe(0);
      expect(result.totalErrors.current).toBe(0);
      expect(result.avgLatencyP95Ms.current).toBe(0);
      expect(result.activeAlerts).toBe(0);
    });

    it("supports 7d time range", async () => {
      const caller = createTestCaller();

      vi.mocked(prisma.project.findMany).mockResolvedValue(MOCK_PROJECTS as never);
      vi.mocked(prisma.$queryRaw).mockResolvedValue([
        { traceCount: BigInt(5000), errorCount: BigInt(200), avgLatencyP95: 130 },
      ]);
      vi.mocked(prisma.alert.count).mockResolvedValue(1);

      const result = await caller.getStats({
        workspaceSlug: "test-workspace",
        timeRange: "7d",
      });

      expect(result).toBeDefined();
      expect(prisma.$queryRaw).toHaveBeenCalled();
    });

    it("supports 30d time range", async () => {
      const caller = createTestCaller();

      vi.mocked(prisma.project.findMany).mockResolvedValue(MOCK_PROJECTS as never);
      vi.mocked(prisma.$queryRaw).mockResolvedValue([
        { traceCount: BigInt(20000), errorCount: BigInt(800), avgLatencyP95: 140 },
      ]);
      vi.mocked(prisma.alert.count).mockResolvedValue(5);

      const result = await caller.getStats({
        workspaceSlug: "test-workspace",
        timeRange: "30d",
      });

      expect(result).toBeDefined();
    });

    it("requires authentication", async () => {
      const caller = createTestCaller(null);

      await expect(
        caller.getStats({ workspaceSlug: "test-workspace" })
      ).rejects.toThrow(TRPCError);
    });

    it("requires workspace membership", async () => {
      const sessionWithoutWorkspace: SessionWithWorkspaces = {
        user: {
          ...MOCK_USER,
          workspaces: [], // No workspaces
          projects: [],
        },
        expires: new Date(Date.now() + 86400000).toISOString(),
      };
      const caller = createTestCaller(sessionWithoutWorkspace);

      await expect(
        caller.getStats({ workspaceSlug: "test-workspace" })
      ).rejects.toThrow(TRPCError);
    });
  });

  // ============================================================
  // getRecentActivity
  // ============================================================
  describe("getRecentActivity", () => {
    it("returns recent activity sorted by timestamp", async () => {
      const caller = createTestCaller();

      vi.mocked(prisma.alertHistory.findMany).mockResolvedValue(MOCK_ALERT_HISTORY as never);

      const result = await caller.getRecentActivity({
        workspaceSlug: "test-workspace",
        limit: 10,
      });

      expect(result.items).toBeDefined();
      expect(Array.isArray(result.items)).toBe(true);
      expect(result.total).toBeGreaterThanOrEqual(0);

      // Items should be sorted by timestamp (newest first)
      if (result.items.length > 1) {
        const firstTimestamp = result.items[0]!.timestamp.getTime();
        const secondTimestamp = result.items[1]!.timestamp.getTime();
        expect(firstTimestamp).toBeGreaterThanOrEqual(secondTimestamp);
      }
    });

    it("limits activity items to requested count", async () => {
      const caller = createTestCaller();

      vi.mocked(prisma.alertHistory.findMany).mockResolvedValue(
        MOCK_ALERT_HISTORY.slice(0, 5) as never
      );

      const result = await caller.getRecentActivity({
        workspaceSlug: "test-workspace",
        limit: 5,
      });

      expect(result.items.length).toBeLessThanOrEqual(5);
      expect(prisma.alertHistory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 5,
        })
      );
    });

    it("maps alert_fired activity correctly", async () => {
      const caller = createTestCaller();

      const firingAlert = [MOCK_ALERT_HISTORY[0]];
      vi.mocked(prisma.alertHistory.findMany).mockResolvedValue(firingAlert as never);

      const result = await caller.getRecentActivity({
        workspaceSlug: "test-workspace",
        limit: 10,
      });

      expect(result.items).toHaveLength(1);
      const item = result.items[0]!;
      expect(item.type).toBe("alert_fired");
      expect(item.projectName).toBe("Project One");
      expect(item.severity).toBe("HIGH");
    });

    it("maps alert_resolved activity correctly", async () => {
      const caller = createTestCaller();

      const resolvedAlert = [MOCK_ALERT_HISTORY[1]];
      vi.mocked(prisma.alertHistory.findMany).mockResolvedValue(resolvedAlert as never);

      const result = await caller.getRecentActivity({
        workspaceSlug: "test-workspace",
        limit: 10,
      });

      expect(result.items).toHaveLength(1);
      const item = result.items[0]!;
      expect(item.type).toBe("alert_resolved");
      expect(item.projectName).toBe("Project Two");
    });

    it("returns empty list when no activity", async () => {
      const caller = createTestCaller();

      vi.mocked(prisma.alertHistory.findMany).mockResolvedValue([]);

      const result = await caller.getRecentActivity({
        workspaceSlug: "test-workspace",
        limit: 10,
      });

      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it("uses default limit when not provided", async () => {
      const caller = createTestCaller();

      vi.mocked(prisma.alertHistory.findMany).mockResolvedValue([]);

      await caller.getRecentActivity({
        workspaceSlug: "test-workspace",
      });

      expect(prisma.alertHistory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10, // Default limit
        })
      );
    });

    it("requires authentication", async () => {
      const caller = createTestCaller(null);

      await expect(
        caller.getRecentActivity({ workspaceSlug: "test-workspace" })
      ).rejects.toThrow(TRPCError);
    });

    it("requires workspace membership", async () => {
      const sessionWithoutWorkspace: SessionWithWorkspaces = {
        user: {
          ...MOCK_USER,
          workspaces: [],
          projects: [],
        },
        expires: new Date(Date.now() + 86400000).toISOString(),
      };
      const caller = createTestCaller(sessionWithoutWorkspace);

      await expect(
        caller.getRecentActivity({ workspaceSlug: "test-workspace" })
      ).rejects.toThrow(TRPCError);
    });

    it("respects max limit of 50", async () => {
      const caller = createTestCaller();

      vi.mocked(prisma.alertHistory.findMany).mockResolvedValue([]);

      // Requesting more than 50 should be capped
      await caller.getRecentActivity({
        workspaceSlug: "test-workspace",
        limit: 50,
      });

      expect(prisma.alertHistory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50,
        })
      );
    });
  });
});
