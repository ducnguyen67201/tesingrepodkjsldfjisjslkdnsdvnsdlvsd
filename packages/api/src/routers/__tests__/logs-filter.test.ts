import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { createCallerFactory } from "../../trpc";
import type { SessionWithWorkspaces } from "../../context";

// Mock prisma
vi.mock("@cognobserve/db", () => ({
  prisma: {
    logRecord: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
    project: {
      findMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
  Prisma: {
    sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
      strings,
      values,
    })),
    raw: vi.fn((value: string) => ({ __prismaRaw: value })),
  },
}));

// Import after mocks
import { prisma } from "@cognobserve/db";
import { logsRouter } from "../logs";

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

const MOCK_PROJECT = {
  id: "proj_123",
  name: "Test Project",
  workspaceId: MOCK_WORKSPACE.id,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const MOCK_LOG_RECORD = {
  id: "log_123",
  projectId: "proj_123",
  timestamp: new Date("2024-01-15T10:00:00Z"),
  severityNumber: 17, // ERROR
  severityText: "ERROR",
  serviceName: "api-service",
  serviceVersion: "1.0.0",
  environment: "production",
  bodyText: "Something went wrong: connection refused",
  body: { message: "Something went wrong: connection refused" },
  traceId: "abc123",
  spanId: "def456",
  scopeName: "my-logger",
  scopeVersion: "1.0.0",
  resource: { "service.name": "api-service" },
  attributes: { "http.status_code": 500 },
  droppedAttributesCount: 0,
  flags: 0,
  observedTime: new Date("2024-01-15T10:00:00Z"),
  ingestSource: "otlp",
  createdAt: new Date(),
};

const MOCK_LOG_RECORD_2 = {
  ...MOCK_LOG_RECORD,
  id: "log_124",
  severityNumber: 9, // INFO
  severityText: "INFO",
  bodyText: "Request completed successfully",
  body: { message: "Request completed successfully" },
};

const MOCK_LOG_RECORD_3 = {
  ...MOCK_LOG_RECORD,
  id: "log_125",
  serviceName: "worker-service",
  severityNumber: 13, // WARN
  severityText: "WARN",
  bodyText: "Rate limit approaching",
  body: { message: "Rate limit approaching" },
};

// ============================================================
// TEST HELPERS
// ============================================================

const createCaller = createCallerFactory(logsRouter);

const createTestCaller = (session: SessionWithWorkspaces | null = MOCK_SESSION) => {
  return createCaller({ session });
};

const TIME_RANGE = {
  from: "2024-01-01T00:00:00Z",
  to: "2024-01-31T23:59:59Z",
};

// ============================================================
// TESTS
// ============================================================

describe("logsRouter - Advanced Filtering (v2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default project mock
    vi.mocked(prisma.project.findMany).mockResolvedValue([MOCK_PROJECT]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================================
  // listV2
  // ============================================================
  describe("listV2", () => {
    it("returns logs with basic filter", async () => {
      const caller = createTestCaller();

      vi.mocked(prisma.logRecord.findMany).mockResolvedValue([MOCK_LOG_RECORD]);
      vi.mocked(prisma.logRecord.count).mockResolvedValue(1);

      const result = await caller.listV2({
        workspaceSlug: "test-workspace",
        timeRange: TIME_RANGE,
        filter: {
          field: "log.serviceName",
          op: "eq",
          value: "api-service",
        },
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.id).toBe("log_123");
      expect(result.items[0]!.serviceName).toBe("api-service");
    });

    it("supports AND expressions", async () => {
      const caller = createTestCaller();

      vi.mocked(prisma.logRecord.findMany).mockResolvedValue([MOCK_LOG_RECORD]);
      vi.mocked(prisma.logRecord.count).mockResolvedValue(1);

      const result = await caller.listV2({
        workspaceSlug: "test-workspace",
        timeRange: TIME_RANGE,
        filter: {
          and: [
            { field: "log.serviceName", op: "eq", value: "api-service" },
            { field: "log.severityNumber", op: "gte", value: 17 },
          ],
        },
      });

      expect(result.items).toHaveLength(1);

      // Verify Prisma was called with AND clause
      expect(prisma.logRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.any(Array),
          }),
        })
      );
    });

    it("supports OR expressions", async () => {
      const caller = createTestCaller();

      vi.mocked(prisma.logRecord.findMany).mockResolvedValue([
        MOCK_LOG_RECORD,
        MOCK_LOG_RECORD_3,
      ]);
      vi.mocked(prisma.logRecord.count).mockResolvedValue(2);

      const result = await caller.listV2({
        workspaceSlug: "test-workspace",
        timeRange: TIME_RANGE,
        filter: {
          or: [
            { field: "log.serviceName", op: "eq", value: "api-service" },
            { field: "log.serviceName", op: "eq", value: "worker-service" },
          ],
        },
      });

      expect(result.items).toHaveLength(2);
    });

    it("supports NOT expressions", async () => {
      const caller = createTestCaller();

      vi.mocked(prisma.logRecord.findMany).mockResolvedValue([MOCK_LOG_RECORD_2]);
      vi.mocked(prisma.logRecord.count).mockResolvedValue(1);

      const result = await caller.listV2({
        workspaceSlug: "test-workspace",
        timeRange: TIME_RANGE,
        filter: {
          not: { field: "log.severityNumber", op: "gte", value: 17 },
        },
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.severityNumber).toBeLessThan(17);
    });

    it("filters by severity gte", async () => {
      const caller = createTestCaller();

      vi.mocked(prisma.logRecord.findMany).mockResolvedValue([MOCK_LOG_RECORD]);
      vi.mocked(prisma.logRecord.count).mockResolvedValue(1);

      await caller.listV2({
        workspaceSlug: "test-workspace",
        timeRange: TIME_RANGE,
        filter: {
          field: "log.severityNumber",
          op: "gte",
          value: 17,
        },
      });

      expect(prisma.logRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([
              expect.objectContaining({
                severityNumber: { gte: 17 },
              }),
            ]),
          }),
        })
      );
    });

    it("filters by severity lte", async () => {
      const caller = createTestCaller();

      vi.mocked(prisma.logRecord.findMany).mockResolvedValue([MOCK_LOG_RECORD_2]);
      vi.mocked(prisma.logRecord.count).mockResolvedValue(1);

      await caller.listV2({
        workspaceSlug: "test-workspace",
        timeRange: TIME_RANGE,
        filter: {
          field: "log.severityNumber",
          op: "lte",
          value: 12,
        },
      });

      expect(prisma.logRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([
              expect.objectContaining({
                severityNumber: { lte: 12 },
              }),
            ]),
          }),
        })
      );
    });

    it("filters by serviceName", async () => {
      const caller = createTestCaller();

      vi.mocked(prisma.logRecord.findMany).mockResolvedValue([MOCK_LOG_RECORD]);
      vi.mocked(prisma.logRecord.count).mockResolvedValue(1);

      await caller.listV2({
        workspaceSlug: "test-workspace",
        timeRange: TIME_RANGE,
        filter: {
          field: "log.serviceName",
          op: "eq",
          value: "api-service",
        },
      });

      expect(prisma.logRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([
              expect.objectContaining({
                serviceName: "api-service",
              }),
            ]),
          }),
        })
      );
    });

    it("filters by body contains", async () => {
      const caller = createTestCaller();

      vi.mocked(prisma.logRecord.findMany).mockResolvedValue([MOCK_LOG_RECORD]);
      vi.mocked(prisma.logRecord.count).mockResolvedValue(1);

      await caller.listV2({
        workspaceSlug: "test-workspace",
        timeRange: TIME_RANGE,
        filter: {
          search: {
            query: "connection refused",
            mode: "phrase",
          },
        },
      });

      expect(prisma.logRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([
              expect.objectContaining({
                bodyText: expect.objectContaining({
                  contains: "connection refused",
                  mode: "insensitive",
                }),
              }),
            ]),
          }),
        })
      );
    });

    it("supports attribute filtering", async () => {
      const caller = createTestCaller();

      vi.mocked(prisma.logRecord.findMany).mockResolvedValue([MOCK_LOG_RECORD]);
      vi.mocked(prisma.logRecord.count).mockResolvedValue(1);

      await caller.listV2({
        workspaceSlug: "test-workspace",
        timeRange: TIME_RANGE,
        filter: {
          attribute: {
            scope: "log",
            key: "http.status_code",
            op: "eq",
            value: 500,
          },
        },
      });

      expect(prisma.logRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([
              expect.objectContaining({
                attributes: expect.objectContaining({
                  path: ["http.status_code"],
                  equals: 500,
                }),
              }),
            ]),
          }),
        })
      );
    });

    it("returns paginated results with cursor", async () => {
      const caller = createTestCaller();

      vi.mocked(prisma.logRecord.findMany).mockResolvedValue([MOCK_LOG_RECORD_2]);
      vi.mocked(prisma.logRecord.count).mockResolvedValue(2);

      const result = await caller.listV2({
        workspaceSlug: "test-workspace",
        timeRange: TIME_RANGE,
        cursor: "log_123",
        limit: 1,
      });

      expect(result.items).toHaveLength(1);
    });

    it("requires authentication", async () => {
      const caller = createTestCaller(null);

      await expect(
        caller.listV2({
          workspaceSlug: "test-workspace",
          timeRange: TIME_RANGE,
        })
      ).rejects.toThrow(TRPCError);
    });

    it("requires workspace access", async () => {
      const noAccessSession: SessionWithWorkspaces = {
        ...MOCK_SESSION,
        user: {
          ...MOCK_SESSION.user,
          workspaces: [], // No workspace access
        },
      };
      const caller = createTestCaller(noAccessSession);

      await expect(
        caller.listV2({
          workspaceSlug: "test-workspace",
          timeRange: TIME_RANGE,
        })
      ).rejects.toThrow(TRPCError);
    });
  });

  // ============================================================
  // filterKeys
  // ============================================================
  describe("filterKeys", () => {
    it("returns distinct attribute keys", async () => {
      const caller = createTestCaller();

      // Mock raw query for distinct keys
      vi.mocked(prisma.$queryRaw).mockResolvedValue([
        { key: "http.status_code" },
        { key: "http.method" },
        { key: "db.system" },
      ]);

      const result = await caller.filterKeys({
        workspaceSlug: "test-workspace",
        scope: "log",
      });

      expect(result.keys).toContain("http.status_code");
      expect(result.keys).toContain("http.method");
      expect(result.keys).toContain("db.system");
    });

    it("filters by prefix", async () => {
      const caller = createTestCaller();

      vi.mocked(prisma.$queryRaw).mockResolvedValue([
        { key: "http.status_code" },
        { key: "http.method" },
      ]);

      const result = await caller.filterKeys({
        workspaceSlug: "test-workspace",
        scope: "log",
        prefix: "http",
      });

      expect(result.keys.every((k) => k.startsWith("http"))).toBe(true);
    });

    it("requires authentication", async () => {
      const caller = createTestCaller(null);

      await expect(
        caller.filterKeys({
          workspaceSlug: "test-workspace",
          scope: "log",
        })
      ).rejects.toThrow(TRPCError);
    });
  });

  // ============================================================
  // filterValues
  // ============================================================
  describe("filterValues", () => {
    it("returns values for a key", async () => {
      const caller = createTestCaller();

      vi.mocked(prisma.$queryRaw).mockResolvedValue([
        { value: "200" },
        { value: "404" },
        { value: "500" },
      ]);

      const result = await caller.filterValues({
        workspaceSlug: "test-workspace",
        scope: "log",
        key: "http.status_code",
      });

      expect(result.values).toContain("200");
      expect(result.values).toContain("404");
      expect(result.values).toContain("500");
    });

    it("requires authentication", async () => {
      const caller = createTestCaller(null);

      await expect(
        caller.filterValues({
          workspaceSlug: "test-workspace",
          scope: "log",
          key: "http.status_code",
        })
      ).rejects.toThrow(TRPCError);
    });
  });

  // ============================================================
  // filterStats
  // ============================================================
  describe("filterStats", () => {
    it("returns service counts", async () => {
      const caller = createTestCaller();

      vi.mocked(prisma.logRecord.groupBy).mockResolvedValue([
        { serviceName: "api-service", _count: { serviceName: 100 } },
        { serviceName: "worker-service", _count: { serviceName: 50 } },
      ] as never);

      vi.mocked(prisma.logRecord.count).mockResolvedValue(150);

      const result = await caller.filterStats({
        workspaceSlug: "test-workspace",
        timeRange: TIME_RANGE,
      });

      expect(result.services).toHaveLength(2);
      expect(result.services[0]!.name).toBe("api-service");
      expect(result.services[0]!.count).toBe(100);
    });

    it("returns severity distribution", async () => {
      const caller = createTestCaller();

      vi.mocked(prisma.logRecord.groupBy)
        .mockResolvedValueOnce([
          { serviceName: "api-service", _count: { serviceName: 100 } },
        ] as never)
        .mockResolvedValueOnce([
          { severityNumber: 9, _count: { severityNumber: 50 } },
          { severityNumber: 17, _count: { severityNumber: 30 } },
          { severityNumber: 21, _count: { severityNumber: 10 } },
        ] as never)
        .mockResolvedValueOnce([
          { environment: "production", _count: { environment: 70 } },
          { environment: "staging", _count: { environment: 20 } },
        ] as never);

      vi.mocked(prisma.logRecord.count).mockResolvedValue(90);

      const result = await caller.filterStats({
        workspaceSlug: "test-workspace",
        timeRange: TIME_RANGE,
      });

      expect(result.severities.length).toBeGreaterThan(0);
      expect(result.totalCount).toBe(90);
    });

    it("requires authentication", async () => {
      const caller = createTestCaller(null);

      await expect(
        caller.filterStats({
          workspaceSlug: "test-workspace",
          timeRange: TIME_RANGE,
        })
      ).rejects.toThrow(TRPCError);
    });

    it("requires workspace access", async () => {
      const noAccessSession: SessionWithWorkspaces = {
        ...MOCK_SESSION,
        user: {
          ...MOCK_SESSION.user,
          workspaces: [],
        },
      };
      const caller = createTestCaller(noAccessSession);

      await expect(
        caller.filterStats({
          workspaceSlug: "test-workspace",
          timeRange: TIME_RANGE,
        })
      ).rejects.toThrow(TRPCError);
    });
  });
});
