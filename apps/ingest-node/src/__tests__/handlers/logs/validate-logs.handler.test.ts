/**
 * Validate Logs Handler Tests
 *
 * Tests for the handler that validates logs against configured limits.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ValidateLogsHandler } from "../../../pipeline/logs/validate-logs.handler.js";
import {
  createMockLogsPipelineContext,
  createNormalizedLogRecord,
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

// Mock the config
vi.mock("../../../config/env.js", () => ({
  config: {
    limits: {
      maxLogsPerRequest: 1000,
      maxAttrPerLog: 64,
      maxLogBodyLen: 8192,
      logTimestampDriftHours: 24,
    },
  },
}));

describe("ValidateLogsHandler", () => {
  let handler: ValidateLogsHandler;

  beforeEach(() => {
    handler = new ValidateLogsHandler();
    vi.clearAllMocks();
  });

  describe("Basic Validation", () => {
    it("should pass valid logs", async () => {
      const ctx = createMockLogsPipelineContext({
        normalizedLogs: [
          createNormalizedLogRecord({ bodyText: "Valid log message" }),
        ],
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(true);
      expect(ctx.validationPassed).toBe(true);
    });

    it("should pass multiple valid logs", async () => {
      const logs = [];
      for (let i = 0; i < 10; i++) {
        logs.push(createNormalizedLogRecord({ bodyText: `Log ${i}` }));
      }

      const ctx = createMockLogsPipelineContext({
        normalizedLogs: logs,
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(true);
      expect(ctx.validationPassed).toBe(true);
    });

    it("should pass empty logs array", async () => {
      const ctx = createMockLogsPipelineContext({
        normalizedLogs: [],
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(true);
    });

    it("should return error if no normalized logs in context", async () => {
      const ctx = createMockLogsPipelineContext({
        normalizedLogs: undefined,
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(false);
      expect(result.error?.code).toBe("INTERNAL_ERROR");
      expect(result.error?.httpStatus).toBe(500);
    });
  });

  describe("Max Logs Per Request", () => {
    it("should reject requests exceeding max logs limit", async () => {
      const logs = [];
      for (let i = 0; i < 150; i++) {
        // Exceeds 100 limit
        logs.push(createNormalizedLogRecord({ bodyText: `Log ${i}` }));
      }

      const ctx = createMockLogsPipelineContext({
        normalizedLogs: logs,
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(false);
      expect(result.error?.code).toBe("TOO_MANY_LOGS");
      expect(result.error?.httpStatus).toBe(400);
      expect(result.error?.message).toContain("150");
      expect(result.error?.message).toContain("100");
    });

    it("should accept exactly max logs", async () => {
      const logs = [];
      for (let i = 0; i < 100; i++) {
        // Exactly at limit
        logs.push(createNormalizedLogRecord({ bodyText: `Log ${i}` }));
      }

      const ctx = createMockLogsPipelineContext({
        normalizedLogs: logs,
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(true);
    });
  });

  describe("Attribute Truncation", () => {
    it("should truncate logs with too many attributes", async () => {
      const attributes: Record<string, unknown> = {};
      for (let i = 0; i < 60; i++) {
        // Exceeds 50 limit
        attributes[`attr_${i}`] = `value_${i}`;
      }

      const ctx = createMockLogsPipelineContext({
        normalizedLogs: [
          createNormalizedLogRecord({
            attributes,
            droppedAttributesCount: 0,
          }),
        ],
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(true);
      const log = ctx.normalizedLogs![0]!;
      expect(Object.keys(log.attributes!).length).toBe(50);
      expect(log.droppedAttributesCount).toBe(10); // 60 - 50
    });

    it("should preserve existing droppedAttributesCount", async () => {
      const attributes: Record<string, unknown> = {};
      for (let i = 0; i < 60; i++) {
        attributes[`attr_${i}`] = `value_${i}`;
      }

      const ctx = createMockLogsPipelineContext({
        normalizedLogs: [
          createNormalizedLogRecord({
            attributes,
            droppedAttributesCount: 5, // Already had 5 dropped
          }),
        ],
      });

      await handler.handle(ctx);

      const log = ctx.normalizedLogs![0]!;
      expect(log.droppedAttributesCount).toBe(15); // 5 + 10
    });

    it("should not modify logs with attributes at limit", async () => {
      const attributes: Record<string, unknown> = {};
      for (let i = 0; i < 50; i++) {
        // Exactly at limit
        attributes[`attr_${i}`] = `value_${i}`;
      }

      const ctx = createMockLogsPipelineContext({
        normalizedLogs: [createNormalizedLogRecord({ attributes })],
      });

      await handler.handle(ctx);

      const log = ctx.normalizedLogs![0]!;
      expect(Object.keys(log.attributes!).length).toBe(50);
      expect(log.droppedAttributesCount).toBeUndefined();
    });

    it("should handle logs without attributes", async () => {
      const ctx = createMockLogsPipelineContext({
        normalizedLogs: [createNormalizedLogRecord({ attributes: undefined })],
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(true);
    });
  });

  describe("Body Truncation", () => {
    it("should truncate long log body", async () => {
      const longBody = "x".repeat(15000); // Exceeds 10000 limit

      const ctx = createMockLogsPipelineContext({
        normalizedLogs: [createNormalizedLogRecord({ bodyText: longBody })],
      });

      await handler.handle(ctx);

      const log = ctx.normalizedLogs![0]!;
      expect(log.bodyText!.length).toBeLessThan(longBody.length);
      expect(log.bodyText!.endsWith("...[truncated]")).toBe(true);
    });

    it("should not modify body at limit", async () => {
      const body = "x".repeat(10000); // Exactly at limit

      const ctx = createMockLogsPipelineContext({
        normalizedLogs: [createNormalizedLogRecord({ bodyText: body })],
      });

      await handler.handle(ctx);

      const log = ctx.normalizedLogs![0]!;
      expect(log.bodyText).toBe(body);
    });

    it("should handle logs without body", async () => {
      const ctx = createMockLogsPipelineContext({
        normalizedLogs: [createNormalizedLogRecord({ bodyText: undefined })],
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(true);
    });

    it("should handle empty body", async () => {
      const ctx = createMockLogsPipelineContext({
        normalizedLogs: [createNormalizedLogRecord({ bodyText: "" })],
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(true);
      expect(ctx.normalizedLogs![0]!.bodyText).toBe("");
    });
  });

  describe("Timestamp Drift Validation", () => {
    it("should clamp future timestamps", async () => {
      const futureDate = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours in future

      const ctx = createMockLogsPipelineContext({
        normalizedLogs: [createNormalizedLogRecord({ timestamp: futureDate })],
      });

      const beforeHandle = Date.now();
      await handler.handle(ctx);
      const afterHandle = Date.now();

      const log = ctx.normalizedLogs![0]!;
      expect(log.timestamp.getTime()).toBeGreaterThanOrEqual(beforeHandle);
      expect(log.timestamp.getTime()).toBeLessThanOrEqual(afterHandle);
      expect(ctx.rejectionReasons).toContain("timestamp_clamped");
    });

    it("should clamp past timestamps beyond drift limit", async () => {
      const pastDate = new Date(Date.now() - 48 * 60 * 60 * 1000); // 48 hours in past

      const ctx = createMockLogsPipelineContext({
        normalizedLogs: [createNormalizedLogRecord({ timestamp: pastDate })],
      });

      await handler.handle(ctx);

      const log = ctx.normalizedLogs![0]!;
      // Should be clamped to now - maxDrift
      const maxDriftMs = 24 * 60 * 60 * 1000;
      expect(log.timestamp.getTime()).toBeGreaterThan(
        Date.now() - maxDriftMs - 1000
      );
      expect(ctx.rejectionReasons).toContain("timestamp_clamped");
    });

    it("should not modify timestamps within drift limit", async () => {
      const validDate = new Date(Date.now() - 12 * 60 * 60 * 1000); // 12 hours ago (within 24h limit)

      const ctx = createMockLogsPipelineContext({
        normalizedLogs: [createNormalizedLogRecord({ timestamp: validDate })],
      });

      await handler.handle(ctx);

      const log = ctx.normalizedLogs![0]!;
      expect(log.timestamp.getTime()).toBe(validDate.getTime());
      expect(ctx.rejectionReasons).toHaveLength(0);
    });

    it("should handle current timestamp", async () => {
      const now = new Date();

      const ctx = createMockLogsPipelineContext({
        normalizedLogs: [createNormalizedLogRecord({ timestamp: now })],
      });

      await handler.handle(ctx);

      expect(ctx.rejectionReasons).toHaveLength(0);
    });
  });

  describe("Combined Validations", () => {
    it("should handle multiple validation issues in same log", async () => {
      const attributes: Record<string, unknown> = {};
      for (let i = 0; i < 60; i++) {
        attributes[`attr_${i}`] = `value_${i}`;
      }

      const longBody = "x".repeat(15000);
      const futureDate = new Date(Date.now() + 48 * 60 * 60 * 1000);

      const ctx = createMockLogsPipelineContext({
        normalizedLogs: [
          createNormalizedLogRecord({
            attributes,
            bodyText: longBody,
            timestamp: futureDate,
          }),
        ],
      });

      await handler.handle(ctx);

      const log = ctx.normalizedLogs![0]!;
      expect(Object.keys(log.attributes!).length).toBe(50);
      expect(log.bodyText!.endsWith("...[truncated]")).toBe(true);
      expect(ctx.rejectionReasons).toContain("timestamp_clamped");
    });

    it("should validate all logs in request", async () => {
      const logs = [
        createNormalizedLogRecord({ bodyText: "Normal log" }),
        createNormalizedLogRecord({ bodyText: "x".repeat(15000) }), // Will be truncated
        createNormalizedLogRecord({
          timestamp: new Date(Date.now() + 48 * 60 * 60 * 1000),
        }), // Will be clamped
      ];

      const ctx = createMockLogsPipelineContext({
        normalizedLogs: logs,
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(true);
      expect(ctx.validationPassed).toBe(true);
      expect(ctx.normalizedLogs![1]!.bodyText!.endsWith("...[truncated]")).toBe(
        true
      );
    });
  });

  describe("Edge Cases", () => {
    it("should handle log with null attributes values", async () => {
      const ctx = createMockLogsPipelineContext({
        normalizedLogs: [
          createNormalizedLogRecord({
            attributes: { key1: null, key2: "value" },
          }),
        ],
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(true);
    });

    it("should handle log with nested attributes", async () => {
      const ctx = createMockLogsPipelineContext({
        normalizedLogs: [
          createNormalizedLogRecord({
            attributes: {
              nested: { key1: "value1", key2: "value2" },
              simple: "value",
            },
          }),
        ],
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(true);
    });
  });
});
