import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { createCallerFactory } from "../../trpc";
import type { SessionWithWorkspaces } from "../../context";

// Mock prisma
vi.mock("@ducsigr/db", () => ({
  prisma: {
    dashboard: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    dashboardWidget: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    project: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
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
import { prisma } from "@ducsigr/db";
import { dashboardsRouter, graphsRouter } from "../dashboards";

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

const MOCK_DASHBOARD = {
  id: "dash_123",
  workspaceId: "ws_123",
  projectId: null,
  name: "My Dashboard",
  description: "Test dashboard",
  visibility: "workspace",
  isDefault: false,
  createdById: "user_123",
  createdAt: new Date(),
  updatedAt: new Date(),
  widgets: [],
  createdBy: {
    id: "user_123",
    name: "Test User",
    email: "test@example.com",
    image: null,
  },
  project: null,
};

const MOCK_WIDGET = {
  id: "widget_123",
  dashboardId: "dash_123",
  title: "Trace Count",
  type: "line",
  query: {
    source: "trace",
    metric: "count",
    op: "count",
    timeRange: "24h",
    bucket: "auto",
  },
  display: {
    unit: "count",
    decimals: 0,
    showLegend: true,
  },
  layout: { x: 0, y: 0, w: 6, h: 4 },
  createdById: "user_123",
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ============================================================
// TEST HELPERS
// ============================================================

const createDashboardsCaller = createCallerFactory(dashboardsRouter);
const createGraphsCaller = createCallerFactory(graphsRouter);

const createTestCaller = (session: SessionWithWorkspaces | null = MOCK_SESSION) => {
  return createDashboardsCaller({ session });
};

const createGraphsTestCaller = (session: SessionWithWorkspaces | null = MOCK_SESSION) => {
  return createGraphsCaller({ session });
};

// ============================================================
// TESTS
// ============================================================

describe("dashboardsRouter", () => {
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
    it("returns list of dashboards for workspace", async () => {
      const caller = createTestCaller();
      vi.mocked(prisma.dashboard.findMany).mockResolvedValue([MOCK_DASHBOARD]);

      const result = await caller.list({
        workspaceSlug: "test-workspace",
      });

      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe(MOCK_DASHBOARD.id);
      expect(result[0]!.name).toBe(MOCK_DASHBOARD.name);
    });

    it("filters by projectId when provided", async () => {
      const caller = createTestCaller();
      vi.mocked(prisma.dashboard.findMany).mockResolvedValue([]);

      await caller.list({
        workspaceSlug: "test-workspace",
        projectId: "proj_123",
      });

      expect(prisma.dashboard.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            projectId: "proj_123",
          }),
        })
      );
    });

    it("filters by visibility when provided", async () => {
      const caller = createTestCaller();
      vi.mocked(prisma.dashboard.findMany).mockResolvedValue([]);

      await caller.list({
        workspaceSlug: "test-workspace",
        visibility: "personal",
      });

      expect(prisma.dashboard.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            visibility: "personal",
          }),
        })
      );
    });

    it("requires authentication", async () => {
      const caller = createTestCaller(null);

      await expect(
        caller.list({ workspaceSlug: "test-workspace" })
      ).rejects.toThrow(TRPCError);
    });
  });

  // ============================================================
  // get
  // ============================================================
  describe("get", () => {
    it("returns dashboard with widgets", async () => {
      const caller = createTestCaller();
      vi.mocked(prisma.dashboard.findUnique).mockResolvedValue({
        ...MOCK_DASHBOARD,
        widgets: [MOCK_WIDGET],
      } as ReturnType<typeof prisma.dashboard.findUnique> extends Promise<infer T> ? T : never);

      const result = await caller.get({
        workspaceSlug: "test-workspace",
        id: "dash_123",
      });

      expect(result).toBeDefined();
      expect(result.id).toBe("dash_123");
      expect(result.widgets).toHaveLength(1);
    });

    it("throws NOT_FOUND for non-existent dashboard", async () => {
      const caller = createTestCaller();
      vi.mocked(prisma.dashboard.findUnique).mockResolvedValue(null);

      await expect(
        caller.get({ workspaceSlug: "test-workspace", id: "nonexistent" })
      ).rejects.toThrow(TRPCError);
    });

    it("throws FORBIDDEN for wrong workspace", async () => {
      const caller = createTestCaller();
      vi.mocked(prisma.dashboard.findUnique).mockResolvedValue({
        ...MOCK_DASHBOARD,
        workspaceId: "other_ws",
      } as ReturnType<typeof prisma.dashboard.findUnique> extends Promise<infer T> ? T : never);

      await expect(
        caller.get({ workspaceSlug: "test-workspace", id: "dash_123" })
      ).rejects.toThrow(TRPCError);
    });

    it("throws FORBIDDEN for personal dashboard of another user", async () => {
      const caller = createTestCaller();
      vi.mocked(prisma.dashboard.findUnique).mockResolvedValue({
        ...MOCK_DASHBOARD,
        visibility: "personal",
        createdById: "other_user",
      } as ReturnType<typeof prisma.dashboard.findUnique> extends Promise<infer T> ? T : never);

      await expect(
        caller.get({ workspaceSlug: "test-workspace", id: "dash_123" })
      ).rejects.toThrow(TRPCError);
    });

    it("requires authentication", async () => {
      const caller = createTestCaller(null);

      await expect(
        caller.get({ workspaceSlug: "test-workspace", id: "dash_123" })
      ).rejects.toThrow(TRPCError);
    });
  });

  // ============================================================
  // create
  // ============================================================
  describe("create", () => {
    it("creates a new dashboard", async () => {
      const caller = createTestCaller();
      vi.mocked(prisma.dashboard.create).mockResolvedValue(MOCK_DASHBOARD as ReturnType<typeof prisma.dashboard.create> extends Promise<infer T> ? T : never);

      const result = await caller.create({
        workspaceSlug: "test-workspace",
        name: "New Dashboard",
        description: "A new dashboard",
      });

      expect(result).toBeDefined();
      expect(result.name).toBe(MOCK_DASHBOARD.name);
      expect(prisma.dashboard.create).toHaveBeenCalled();
    });

    it("verifies project belongs to workspace when projectId provided", async () => {
      const caller = createTestCaller();
      vi.mocked(prisma.project.findFirst).mockResolvedValue(null);

      await expect(
        caller.create({
          workspaceSlug: "test-workspace",
          name: "Project Dashboard",
          projectId: "nonexistent_proj",
        })
      ).rejects.toThrow(TRPCError);
    });

    it("unsets other defaults when isDefault is true", async () => {
      const caller = createTestCaller();
      vi.mocked(prisma.dashboard.updateMany).mockResolvedValue({ count: 1 });
      vi.mocked(prisma.dashboard.create).mockResolvedValue({
        ...MOCK_DASHBOARD,
        isDefault: true,
      } as ReturnType<typeof prisma.dashboard.create> extends Promise<infer T> ? T : never);

      await caller.create({
        workspaceSlug: "test-workspace",
        name: "Default Dashboard",
        isDefault: true,
      });

      expect(prisma.dashboard.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { isDefault: false },
        })
      );
    });

    it("requires authentication", async () => {
      const caller = createTestCaller(null);

      await expect(
        caller.create({
          workspaceSlug: "test-workspace",
          name: "New Dashboard",
        })
      ).rejects.toThrow(TRPCError);
    });
  });

  // ============================================================
  // update
  // ============================================================
  describe("update", () => {
    it("updates dashboard metadata", async () => {
      const caller = createTestCaller();
      vi.mocked(prisma.dashboard.findUnique).mockResolvedValue(MOCK_DASHBOARD as ReturnType<typeof prisma.dashboard.findUnique> extends Promise<infer T> ? T : never);
      vi.mocked(prisma.dashboard.update).mockResolvedValue({
        ...MOCK_DASHBOARD,
        name: "Updated Name",
      } as ReturnType<typeof prisma.dashboard.update> extends Promise<infer T> ? T : never);

      const result = await caller.update({
        workspaceSlug: "test-workspace",
        id: "dash_123",
        name: "Updated Name",
      });

      expect(result.name).toBe("Updated Name");
    });

    it("throws FORBIDDEN when modifying personal dashboard of another user", async () => {
      const caller = createTestCaller();
      vi.mocked(prisma.dashboard.findUnique).mockResolvedValue({
        ...MOCK_DASHBOARD,
        visibility: "personal",
        createdById: "other_user",
      } as ReturnType<typeof prisma.dashboard.findUnique> extends Promise<infer T> ? T : never);

      await expect(
        caller.update({
          workspaceSlug: "test-workspace",
          id: "dash_123",
          name: "Hacked",
        })
      ).rejects.toThrow(TRPCError);
    });

    it("requires authentication", async () => {
      const caller = createTestCaller(null);

      await expect(
        caller.update({
          workspaceSlug: "test-workspace",
          id: "dash_123",
          name: "Updated",
        })
      ).rejects.toThrow(TRPCError);
    });
  });

  // ============================================================
  // delete
  // ============================================================
  describe("delete", () => {
    it("deletes dashboard", async () => {
      const caller = createTestCaller();
      vi.mocked(prisma.dashboard.findUnique).mockResolvedValue(MOCK_DASHBOARD as ReturnType<typeof prisma.dashboard.findUnique> extends Promise<infer T> ? T : never);
      vi.mocked(prisma.dashboard.delete).mockResolvedValue(MOCK_DASHBOARD as ReturnType<typeof prisma.dashboard.delete> extends Promise<infer T> ? T : never);

      const result = await caller.delete({
        workspaceSlug: "test-workspace",
        id: "dash_123",
      });

      expect(result.success).toBe(true);
    });

    it("throws FORBIDDEN when deleting personal dashboard of another user", async () => {
      const caller = createTestCaller();
      vi.mocked(prisma.dashboard.findUnique).mockResolvedValue({
        ...MOCK_DASHBOARD,
        visibility: "personal",
        createdById: "other_user",
      } as ReturnType<typeof prisma.dashboard.findUnique> extends Promise<infer T> ? T : never);

      await expect(
        caller.delete({ workspaceSlug: "test-workspace", id: "dash_123" })
      ).rejects.toThrow(TRPCError);
    });

    it("requires authentication", async () => {
      const caller = createTestCaller(null);

      await expect(
        caller.delete({ workspaceSlug: "test-workspace", id: "dash_123" })
      ).rejects.toThrow(TRPCError);
    });
  });

  // ============================================================
  // upsertWidget
  // ============================================================
  describe("upsertWidget", () => {
    it("creates a new widget", async () => {
      const caller = createTestCaller();
      vi.mocked(prisma.dashboard.findUnique).mockResolvedValue(MOCK_DASHBOARD as ReturnType<typeof prisma.dashboard.findUnique> extends Promise<infer T> ? T : never);
      vi.mocked(prisma.dashboardWidget.create).mockResolvedValue(MOCK_WIDGET);

      const result = await caller.upsertWidget({
        workspaceSlug: "test-workspace",
        dashboardId: "dash_123",
        title: "New Widget",
        type: "line",
        query: {
          source: "trace",
          metric: "count",
          op: "count",
          timeRange: "24h",
          bucket: "auto",
        },
        display: {
          unit: "count",
        },
        layout: { x: 0, y: 0, w: 6, h: 4 },
      });

      expect(result).toBeDefined();
      expect(prisma.dashboardWidget.create).toHaveBeenCalled();
    });

    it("updates existing widget when widgetId provided", async () => {
      const caller = createTestCaller();
      vi.mocked(prisma.dashboard.findUnique).mockResolvedValue(MOCK_DASHBOARD as ReturnType<typeof prisma.dashboard.findUnique> extends Promise<infer T> ? T : never);
      vi.mocked(prisma.dashboardWidget.findUnique).mockResolvedValue(MOCK_WIDGET);
      vi.mocked(prisma.dashboardWidget.update).mockResolvedValue({
        ...MOCK_WIDGET,
        title: "Updated Widget",
      });

      const result = await caller.upsertWidget({
        workspaceSlug: "test-workspace",
        dashboardId: "dash_123",
        widgetId: "widget_123",
        title: "Updated Widget",
        type: "line",
        query: {
          source: "trace",
          metric: "count",
          op: "count",
          timeRange: "24h",
          bucket: "auto",
        },
        display: { unit: "count" },
        layout: { x: 0, y: 0, w: 6, h: 4 },
      });

      expect(result.title).toBe("Updated Widget");
      expect(prisma.dashboardWidget.update).toHaveBeenCalled();
    });

    it("throws NOT_FOUND when widget not found in dashboard", async () => {
      const caller = createTestCaller();
      vi.mocked(prisma.dashboard.findUnique).mockResolvedValue(MOCK_DASHBOARD as ReturnType<typeof prisma.dashboard.findUnique> extends Promise<infer T> ? T : never);
      vi.mocked(prisma.dashboardWidget.findUnique).mockResolvedValue({
        ...MOCK_WIDGET,
        dashboardId: "other_dash",
      });

      await expect(
        caller.upsertWidget({
          workspaceSlug: "test-workspace",
          dashboardId: "dash_123",
          widgetId: "widget_123",
          title: "Widget",
          type: "line",
          query: { source: "trace", metric: "count", op: "count", timeRange: "24h", bucket: "auto" },
          display: { unit: "count" },
          layout: { x: 0, y: 0, w: 6, h: 4 },
        })
      ).rejects.toThrow(TRPCError);
    });

    it("requires authentication", async () => {
      const caller = createTestCaller(null);

      await expect(
        caller.upsertWidget({
          workspaceSlug: "test-workspace",
          dashboardId: "dash_123",
          title: "Widget",
          type: "line",
          query: { source: "trace", metric: "count", op: "count", timeRange: "24h", bucket: "auto" },
          display: { unit: "count" },
          layout: { x: 0, y: 0, w: 6, h: 4 },
        })
      ).rejects.toThrow(TRPCError);
    });
  });

  // ============================================================
  // deleteWidget
  // ============================================================
  describe("deleteWidget", () => {
    it("deletes widget", async () => {
      const caller = createTestCaller();
      vi.mocked(prisma.dashboard.findUnique).mockResolvedValue(MOCK_DASHBOARD as ReturnType<typeof prisma.dashboard.findUnique> extends Promise<infer T> ? T : never);
      vi.mocked(prisma.dashboardWidget.findUnique).mockResolvedValue(MOCK_WIDGET);
      vi.mocked(prisma.dashboardWidget.delete).mockResolvedValue(MOCK_WIDGET);

      const result = await caller.deleteWidget({
        workspaceSlug: "test-workspace",
        dashboardId: "dash_123",
        widgetId: "widget_123",
      });

      expect(result.success).toBe(true);
    });

    it("throws NOT_FOUND when widget not in dashboard", async () => {
      const caller = createTestCaller();
      vi.mocked(prisma.dashboard.findUnique).mockResolvedValue(MOCK_DASHBOARD as ReturnType<typeof prisma.dashboard.findUnique> extends Promise<infer T> ? T : never);
      vi.mocked(prisma.dashboardWidget.findUnique).mockResolvedValue({
        ...MOCK_WIDGET,
        dashboardId: "other_dash",
      });

      await expect(
        caller.deleteWidget({
          workspaceSlug: "test-workspace",
          dashboardId: "dash_123",
          widgetId: "widget_123",
        })
      ).rejects.toThrow(TRPCError);
    });

    it("requires authentication", async () => {
      const caller = createTestCaller(null);

      await expect(
        caller.deleteWidget({
          workspaceSlug: "test-workspace",
          dashboardId: "dash_123",
          widgetId: "widget_123",
        })
      ).rejects.toThrow(TRPCError);
    });
  });

  // ============================================================
  // updateLayout
  // ============================================================
  describe("updateLayout", () => {
    it("batch updates widget layouts", async () => {
      const caller = createTestCaller();
      vi.mocked(prisma.dashboard.findUnique).mockResolvedValue(MOCK_DASHBOARD as ReturnType<typeof prisma.dashboard.findUnique> extends Promise<infer T> ? T : never);
      vi.mocked(prisma.$transaction).mockResolvedValue([MOCK_WIDGET]);

      const result = await caller.updateLayout({
        workspaceSlug: "test-workspace",
        dashboardId: "dash_123",
        layouts: [
          { widgetId: "widget_123", layout: { x: 0, y: 0, w: 6, h: 4 } },
          { widgetId: "widget_456", layout: { x: 6, y: 0, w: 6, h: 4 } },
        ],
      });

      expect(result.success).toBe(true);
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it("requires authentication", async () => {
      const caller = createTestCaller(null);

      await expect(
        caller.updateLayout({
          workspaceSlug: "test-workspace",
          dashboardId: "dash_123",
          layouts: [],
        })
      ).rejects.toThrow(TRPCError);
    });
  });

  // ============================================================
  // getPresets
  // ============================================================
  describe("getPresets", () => {
    it("returns labels and options", async () => {
      const caller = createTestCaller();

      const result = await caller.getPresets();

      expect(result.labels).toBeDefined();
      expect(result.labels.widgetTypes).toBeDefined();
      expect(result.labels.dataSources).toBeDefined();
      expect(result.labels.metricOps).toBeDefined();
      expect(result.labels.timeRanges).toBeDefined();
    });

    it("requires authentication", async () => {
      const caller = createTestCaller(null);

      await expect(caller.getPresets()).rejects.toThrow(TRPCError);
    });
  });
});

// ============================================================
// graphsRouter Tests
// ============================================================

describe("graphsRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================================
  // query
  // ============================================================
  describe("query", () => {
    it("executes trace count query", async () => {
      const caller = createGraphsTestCaller();
      vi.mocked(prisma.$queryRaw).mockResolvedValue([
        { bucket_time: new Date(), value: BigInt(100) },
      ]);

      const result = await caller.query({
        workspaceSlug: "test-workspace",
        projectId: "proj_123",
        query: {
          source: "trace",
          metric: "count",
          op: "count",
          timeRange: "24h",
          bucket: "1h",
        },
      });

      expect(result.series).toBeDefined();
      expect(result.series).toHaveLength(1);
      expect(result.metadata?.source).toBe("trace");
    });

    it("executes span error rate query", async () => {
      const caller = createGraphsTestCaller();
      vi.mocked(prisma.$queryRaw).mockResolvedValue([
        { bucket_time: new Date(), value: 5.5 },
      ]);

      const result = await caller.query({
        workspaceSlug: "test-workspace",
        projectId: "proj_123",
        query: {
          source: "span",
          metric: "error",
          op: "error_rate",
          timeRange: "7d",
          bucket: "1d",
        },
      });

      expect(result.series).toBeDefined();
      expect(result.metadata?.source).toBe("span");
    });

    it("supports groupBy in query", async () => {
      const caller = createGraphsTestCaller();
      vi.mocked(prisma.$queryRaw).mockResolvedValue([
        { bucket_time: new Date(), value: BigInt(50), serviceName: "api" },
        { bucket_time: new Date(), value: BigInt(30), serviceName: "worker" },
      ]);

      const result = await caller.query({
        workspaceSlug: "test-workspace",
        projectId: "proj_123",
        query: {
          source: "trace",
          metric: "count",
          op: "count",
          timeRange: "24h",
          bucket: "1h",
          groupBy: ["serviceName"],
        },
      });

      expect(result.series.length).toBeGreaterThan(0);
    });

    it("supports filters in query", async () => {
      const caller = createGraphsTestCaller();
      vi.mocked(prisma.$queryRaw).mockResolvedValue([]);

      await caller.query({
        workspaceSlug: "test-workspace",
        projectId: "proj_123",
        query: {
          source: "trace",
          metric: "count",
          op: "count",
          timeRange: "24h",
          bucket: "1h",
          filters: [
            { field: "serviceName", op: "eq", value: "api" },
            { field: "hasError", op: "eq", value: true },
          ],
        },
      });

      expect(prisma.$queryRaw).toHaveBeenCalled();
    });

    it("requires authentication", async () => {
      const caller = createGraphsTestCaller(null);

      await expect(
        caller.query({
          workspaceSlug: "test-workspace",
          projectId: "proj_123",
          query: {
            source: "trace",
            metric: "count",
            op: "count",
            timeRange: "24h",
            bucket: "auto",
          },
        })
      ).rejects.toThrow(TRPCError);
    });
  });

  // ============================================================
  // projectSummaries
  // ============================================================
  describe("projectSummaries", () => {
    it("returns project summaries for workspace", async () => {
      const caller = createGraphsTestCaller();
      vi.mocked(prisma.$queryRaw).mockResolvedValue([
        {
          projectId: "proj_123",
          projectName: "My Project",
          traceCount: BigInt(100),
          errorRate: 5.2,
          avgLatency: 150.5,
          p95Latency: 500,
          tokenCount: BigInt(10000),
          costUsd: 1.25,
          lastActiveAt: new Date(),
        },
      ]);

      const result = await caller.projectSummaries({
        workspaceSlug: "test-workspace",
        timeRange: "24h",
      });

      expect(result).toHaveLength(1);
      expect(result[0]!.projectId).toBe("proj_123");
      expect(result[0]!.traceCount).toBe(100);
    });

    it("supports custom time range", async () => {
      const caller = createGraphsTestCaller();
      vi.mocked(prisma.$queryRaw).mockResolvedValue([]);

      await caller.projectSummaries({
        workspaceSlug: "test-workspace",
        timeRange: "custom",
        customTimeRange: {
          from: "2024-01-01T00:00:00Z",
          to: "2024-01-31T23:59:59Z",
        },
      });

      expect(prisma.$queryRaw).toHaveBeenCalled();
    });

    it("requires authentication", async () => {
      const caller = createGraphsTestCaller(null);

      await expect(
        caller.projectSummaries({
          workspaceSlug: "test-workspace",
          timeRange: "24h",
        })
      ).rejects.toThrow(TRPCError);
    });
  });
});
