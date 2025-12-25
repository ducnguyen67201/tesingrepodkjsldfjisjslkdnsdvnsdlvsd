/**
 * Persist Logs Handler Tests
 *
 * Tests for the handler that inserts logs into the database.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PersistLogsHandler } from "../../../pipeline/logs/persist-logs.handler.js";
import {
  createMockLogsPipelineContext,
  createNormalizedLogRecord,
  createAuthenticatedLogsContext,
} from "../../helpers/mock-logs-context.js";

// Mock the logger
vi.mock("../../../lib/logger.js", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock the database
const mockCreateMany = vi.fn();
vi.mock("../../../lib/db.js", () => ({
  prisma: {
    logRecord: {
      createMany: mockCreateMany,
    },
  },
  Prisma: {
    InputJsonValue: {},
  },
}));

describe("PersistLogsHandler", () => {
  let handler: PersistLogsHandler;

  beforeEach(() => {
    handler = new PersistLogsHandler();
    vi.clearAllMocks();
    mockCreateMany.mockResolvedValue({ count: 1 });
  });

  describe("Basic Persistence", () => {
    it("should persist single log record", async () => {
      const ctx = createAuthenticatedLogsContext({
        normalizedLogs: [
          createNormalizedLogRecord({
            bodyText: "Test log",
            serviceName: "test-service",
          }),
        ],
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(true);
      expect(mockCreateMany).toHaveBeenCalledTimes(1);
      expect(ctx.persistedCount).toBe(1);
    });

    it("should persist multiple log records", async () => {
      mockCreateMany.mockResolvedValue({ count: 5 });

      const logs = [];
      for (let i = 0; i < 5; i++) {
        logs.push(createNormalizedLogRecord({ bodyText: `Log ${i}` }));
      }

      const ctx = createAuthenticatedLogsContext({
        normalizedLogs: logs,
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(true);
      expect(ctx.persistedCount).toBe(5);
    });

    it("should handle empty logs array", async () => {
      const ctx = createAuthenticatedLogsContext({
        normalizedLogs: [],
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(true);
      expect(ctx.persistedCount).toBe(0);
      expect(mockCreateMany).not.toHaveBeenCalled();
    });

    it("should handle undefined normalized logs", async () => {
      const ctx = createAuthenticatedLogsContext({
        normalizedLogs: undefined,
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(true);
      expect(ctx.persistedCount).toBe(0);
      expect(mockCreateMany).not.toHaveBeenCalled();
    });
  });

  describe("Project ID Validation", () => {
    it("should return error if no project ID", async () => {
      const ctx = createMockLogsPipelineContext({
        normalizedLogs: [createNormalizedLogRecord()],
        projectId: undefined,
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(false);
      expect(result.error?.code).toBe("INTERNAL_ERROR");
      expect(result.error?.httpStatus).toBe(500);
      expect(result.error?.message).toContain("project ID");
    });

    it("should use context project ID for all logs", async () => {
      const ctx = createAuthenticatedLogsContext({
        projectId: "my-project-123",
        normalizedLogs: [
          createNormalizedLogRecord(),
          createNormalizedLogRecord(),
        ],
      });

      await handler.handle(ctx);

      const callArgs = mockCreateMany.mock.calls[0]![0];
      expect(callArgs.data[0].projectId).toBe("my-project-123");
      expect(callArgs.data[1].projectId).toBe("my-project-123");
    });
  });

  describe("Data Mapping", () => {
    it("should map all log fields correctly", async () => {
      const timestamp = new Date("2024-01-15T12:00:00.000Z");
      const observedTime = new Date("2024-01-15T12:00:01.000Z");

      const ctx = createAuthenticatedLogsContext({
        projectId: "proj-123",
        normalizedLogs: [
          createNormalizedLogRecord({
            serviceName: "my-service",
            serviceVersion: "2.0.0",
            environment: "production",
            resource: { "host.name": "server-1" },
            scopeName: "my-scope",
            scopeVersion: "1.0.0",
            timestamp,
            observedTime,
            severityNumber: 9,
            severityText: "INFO",
            body: { stringValue: "Log body" },
            bodyText: "Log body",
            attributes: { key: "value" },
            droppedAttributesCount: 2,
            traceId: "abc123",
            spanId: "def456",
            flags: 1,
            ingestSource: "sdk",
          }),
        ],
      });

      await handler.handle(ctx);

      const callArgs = mockCreateMany.mock.calls[0]![0];
      const logData = callArgs.data[0];

      expect(logData.projectId).toBe("proj-123");
      expect(logData.serviceName).toBe("my-service");
      expect(logData.serviceVersion).toBe("2.0.0");
      expect(logData.environment).toBe("production");
      expect(logData.resource).toEqual({ "host.name": "server-1" });
      expect(logData.scopeName).toBe("my-scope");
      expect(logData.scopeVersion).toBe("1.0.0");
      expect(logData.timestamp).toEqual(timestamp);
      expect(logData.observedTime).toEqual(observedTime);
      expect(logData.severityNumber).toBe(9);
      expect(logData.severityText).toBe("INFO");
      expect(logData.body).toEqual({ stringValue: "Log body" });
      expect(logData.bodyText).toBe("Log body");
      expect(logData.attributes).toEqual({ key: "value" });
      expect(logData.droppedAttributesCount).toBe(2);
      expect(logData.traceId).toBe("abc123");
      expect(logData.spanId).toBe("def456");
      expect(logData.flags).toBe(1);
      expect(logData.ingestSource).toBe("sdk");
    });

    it("should use default ingestSource if not provided", async () => {
      const ctx = createAuthenticatedLogsContext({
        normalizedLogs: [
          createNormalizedLogRecord({
            ingestSource: undefined,
          }),
        ],
      });

      await handler.handle(ctx);

      const callArgs = mockCreateMany.mock.calls[0]![0];
      expect(callArgs.data[0].ingestSource).toBe("otlp");
    });

    it("should handle optional fields as undefined", async () => {
      const ctx = createAuthenticatedLogsContext({
        normalizedLogs: [
          createNormalizedLogRecord({
            serviceVersion: undefined,
            environment: undefined,
            resource: undefined,
            scopeName: undefined,
            scopeVersion: undefined,
            observedTime: undefined,
            severityNumber: undefined,
            severityText: undefined,
            body: undefined,
            bodyText: undefined,
            attributes: undefined,
            droppedAttributesCount: undefined,
            traceId: undefined,
            spanId: undefined,
            flags: undefined,
          }),
        ],
      });

      await handler.handle(ctx);

      const callArgs = mockCreateMany.mock.calls[0]![0];
      const logData = callArgs.data[0];

      expect(logData.serviceVersion).toBeUndefined();
      expect(logData.environment).toBeUndefined();
      expect(logData.observedTime).toBeUndefined();
    });
  });

  describe("Batch Insert", () => {
    it("should use skipDuplicates option", async () => {
      const ctx = createAuthenticatedLogsContext({
        normalizedLogs: [createNormalizedLogRecord()],
      });

      await handler.handle(ctx);

      expect(mockCreateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skipDuplicates: true,
        })
      );
    });

    it("should insert all logs in single batch", async () => {
      mockCreateMany.mockResolvedValue({ count: 100 });

      const logs = [];
      for (let i = 0; i < 100; i++) {
        logs.push(createNormalizedLogRecord({ bodyText: `Log ${i}` }));
      }

      const ctx = createAuthenticatedLogsContext({
        normalizedLogs: logs,
      });

      await handler.handle(ctx);

      expect(mockCreateMany).toHaveBeenCalledTimes(1);
      const callArgs = mockCreateMany.mock.calls[0]![0];
      expect(callArgs.data).toHaveLength(100);
    });
  });

  describe("Error Handling", () => {
    it("should handle database errors", async () => {
      mockCreateMany.mockRejectedValue(new Error("Connection refused"));

      const ctx = createAuthenticatedLogsContext({
        normalizedLogs: [createNormalizedLogRecord()],
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(false);
      expect(result.error?.code).toBe("DATABASE_ERROR");
      expect(result.error?.httpStatus).toBe(500);
      expect(result.error?.details?.error).toBe("Connection refused");
    });

    it("should handle unique constraint violations gracefully", async () => {
      // skipDuplicates should prevent this, but test error handling
      mockCreateMany.mockRejectedValue(
        new Error("Unique constraint violation")
      );

      const ctx = createAuthenticatedLogsContext({
        normalizedLogs: [createNormalizedLogRecord()],
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(false);
      expect(result.error?.code).toBe("DATABASE_ERROR");
    });

    it("should handle timeout errors", async () => {
      mockCreateMany.mockRejectedValue(new Error("Query timeout"));

      const ctx = createAuthenticatedLogsContext({
        normalizedLogs: [createNormalizedLogRecord()],
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(false);
      expect(result.error?.code).toBe("DATABASE_ERROR");
      expect(result.error?.details?.error).toBe("Query timeout");
    });

    it("should handle non-Error exceptions", async () => {
      mockCreateMany.mockRejectedValue("String error");

      const ctx = createAuthenticatedLogsContext({
        normalizedLogs: [createNormalizedLogRecord()],
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(false);
      expect(result.error?.code).toBe("DATABASE_ERROR");
      expect(result.error?.details?.error).toBe("String error");
    });
  });

  describe("Persisted Count", () => {
    it("should report correct persisted count", async () => {
      mockCreateMany.mockResolvedValue({ count: 10 });

      const logs = [];
      for (let i = 0; i < 15; i++) {
        logs.push(createNormalizedLogRecord());
      }

      const ctx = createAuthenticatedLogsContext({
        normalizedLogs: logs,
      });

      await handler.handle(ctx);

      expect(ctx.persistedCount).toBe(10); // Some may be skipped as duplicates
    });

    it("should handle partial success", async () => {
      mockCreateMany.mockResolvedValue({ count: 3 }); // Only 3 of 5 inserted

      const logs = [];
      for (let i = 0; i < 5; i++) {
        logs.push(createNormalizedLogRecord());
      }

      const ctx = createAuthenticatedLogsContext({
        normalizedLogs: logs,
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(true);
      expect(ctx.persistedCount).toBe(3);
    });
  });

  describe("Edge Cases", () => {
    it("should handle logs with complex JSON body", async () => {
      const ctx = createAuthenticatedLogsContext({
        normalizedLogs: [
          createNormalizedLogRecord({
            body: {
              arrayValue: {
                values: [
                  { stringValue: "item1" },
                  { stringValue: "item2" },
                ],
              },
            },
          }),
        ],
      });

      await handler.handle(ctx);

      const callArgs = mockCreateMany.mock.calls[0]![0];
      expect(callArgs.data[0].body).toBeDefined();
    });

    it("should handle logs with large attributes", async () => {
      const attributes: Record<string, unknown> = {};
      for (let i = 0; i < 50; i++) {
        attributes[`attr_${i}`] = "x".repeat(100);
      }

      const ctx = createAuthenticatedLogsContext({
        normalizedLogs: [createNormalizedLogRecord({ attributes })],
      });

      await handler.handle(ctx);

      expect(mockCreateMany).toHaveBeenCalled();
    });

    it("should handle unicode in log data", async () => {
      const ctx = createAuthenticatedLogsContext({
        normalizedLogs: [
          createNormalizedLogRecord({
            bodyText: "日本語ログ 🎉 émojis",
            serviceName: "サービス",
          }),
        ],
      });

      await handler.handle(ctx);

      const callArgs = mockCreateMany.mock.calls[0]![0];
      expect(callArgs.data[0].bodyText).toBe("日本語ログ 🎉 émojis");
    });
  });
});
