/**
 * Normalize Logs Handler Tests
 *
 * Tests for the handler that transforms OTLP log structure to normalized records.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NormalizeLogsHandler } from "../../../pipeline/logs/normalize-logs.handler.js";
import { createMockLogsPipelineContext } from "../../helpers/mock-logs-context.js";
import {
  createBasicLogsRequest,
  createCorrelatedLogsRequest,
  createMultiSeverityLogsRequest,
  createMultiResourceLogsRequest,
  createVariousBodyTypesLogsRequest,
  createMinimalLogsRequest,
  dateToNanoString,
  SEVERITY_NUMBERS,
} from "../../fixtures/otlp-logs.fixtures.js";

// Mock the logger
vi.mock("../../../lib/logger.js", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("NormalizeLogsHandler", () => {
  let handler: NormalizeLogsHandler;

  beforeEach(() => {
    handler = new NormalizeLogsHandler();
    vi.clearAllMocks();
  });

  describe("Basic Normalization", () => {
    it("should normalize basic log request", async () => {
      const ctx = createMockLogsPipelineContext({
        parsedRequest: createBasicLogsRequest({
          serviceName: "my-service",
          serviceVersion: "2.0.0",
          environment: "production",
        }),
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(true);
      expect(ctx.normalizedLogs).toBeDefined();
      expect(ctx.normalizedLogs).toHaveLength(1);
      expect(ctx.normalizedLogs![0]!.serviceName).toBe("my-service");
      expect(ctx.normalizedLogs![0]!.serviceVersion).toBe("2.0.0");
      expect(ctx.normalizedLogs![0]!.environment).toBe("production");
    });

    it("should normalize multiple log records", async () => {
      const ctx = createMockLogsPipelineContext({
        parsedRequest: createMultiSeverityLogsRequest(),
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(true);
      expect(ctx.normalizedLogs).toHaveLength(6); // TRACE, DEBUG, INFO, WARN, ERROR, FATAL
    });

    it("should handle empty resourceLogs", async () => {
      const ctx = createMockLogsPipelineContext({
        parsedRequest: { resourceLogs: [] },
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(true);
      expect(ctx.normalizedLogs).toHaveLength(0);
    });

    it("should return error if no parsed request", async () => {
      const ctx = createMockLogsPipelineContext({
        parsedRequest: undefined,
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(false);
      expect(result.error?.code).toBe("INTERNAL_ERROR");
      expect(result.error?.httpStatus).toBe(500);
    });
  });

  describe("Resource Attributes Extraction", () => {
    it("should extract service.name from resource", async () => {
      const ctx = createMockLogsPipelineContext({
        parsedRequest: createBasicLogsRequest({ serviceName: "test-svc" }),
      });

      await handler.handle(ctx);

      expect(ctx.normalizedLogs![0]!.serviceName).toBe("test-svc");
    });

    it("should extract service.version from resource", async () => {
      const ctx = createMockLogsPipelineContext({
        parsedRequest: createBasicLogsRequest({ serviceVersion: "3.0.0" }),
      });

      await handler.handle(ctx);

      expect(ctx.normalizedLogs![0]!.serviceVersion).toBe("3.0.0");
    });

    it("should extract deployment.environment from resource", async () => {
      const ctx = createMockLogsPipelineContext({
        parsedRequest: createBasicLogsRequest({ environment: "staging" }),
      });

      await handler.handle(ctx);

      expect(ctx.normalizedLogs![0]!.environment).toBe("staging");
    });

    it("should preserve all resource attributes", async () => {
      const ctx = createMockLogsPipelineContext({
        parsedRequest: createBasicLogsRequest(),
      });

      await handler.handle(ctx);

      expect(ctx.normalizedLogs![0]!.resource).toBeDefined();
      expect(ctx.normalizedLogs![0]!.resource!["service.name"]).toBe(
        "test-service"
      );
    });

    it("should handle missing resource attributes", async () => {
      const ctx = createMockLogsPipelineContext({
        parsedRequest: createMinimalLogsRequest(),
      });

      await handler.handle(ctx);

      expect(ctx.normalizedLogs![0]!.serviceName).toBeUndefined();
      expect(ctx.normalizedLogs![0]!.serviceVersion).toBeUndefined();
    });
  });

  describe("Scope Extraction", () => {
    it("should extract scope name and version", async () => {
      const ctx = createMockLogsPipelineContext({
        parsedRequest: createBasicLogsRequest({
          scopeName: "my-scope",
          scopeVersion: "1.2.3",
        }),
      });

      await handler.handle(ctx);

      expect(ctx.normalizedLogs![0]!.scopeName).toBe("my-scope");
      expect(ctx.normalizedLogs![0]!.scopeVersion).toBe("1.2.3");
    });

    it("should handle missing scope", async () => {
      const ctx = createMockLogsPipelineContext({
        parsedRequest: createMinimalLogsRequest(),
      });

      await handler.handle(ctx);

      expect(ctx.normalizedLogs![0]!.scopeName).toBeUndefined();
      expect(ctx.normalizedLogs![0]!.scopeVersion).toBeUndefined();
    });
  });

  describe("Timestamp Parsing", () => {
    it("should parse timeUnixNano correctly", async () => {
      const testDate = new Date("2024-01-01T12:00:00.000Z");
      const nanoStr = dateToNanoString(testDate);

      const ctx = createMockLogsPipelineContext({
        parsedRequest: {
          resourceLogs: [
            {
              scopeLogs: [
                {
                  logRecords: [
                    {
                      timeUnixNano: nanoStr,
                      body: { stringValue: "Test" },
                    },
                  ],
                },
              ],
            },
          ],
        },
      });

      await handler.handle(ctx);

      const log = ctx.normalizedLogs![0]!;
      expect(log.timestamp.getTime()).toBe(testDate.getTime());
    });

    it("should use observedTimeUnixNano as fallback", async () => {
      const testDate = new Date("2024-01-01T12:00:00.000Z");
      const nanoStr = dateToNanoString(testDate);

      const ctx = createMockLogsPipelineContext({
        parsedRequest: {
          resourceLogs: [
            {
              scopeLogs: [
                {
                  logRecords: [
                    {
                      observedTimeUnixNano: nanoStr,
                      body: { stringValue: "Test" },
                    },
                  ],
                },
              ],
            },
          ],
        },
      });

      await handler.handle(ctx);

      const log = ctx.normalizedLogs![0]!;
      expect(log.timestamp.getTime()).toBe(testDate.getTime());
    });

    it("should use current time if no timestamp provided", async () => {
      const beforeTest = Date.now();

      const ctx = createMockLogsPipelineContext({
        parsedRequest: {
          resourceLogs: [
            {
              scopeLogs: [
                {
                  logRecords: [
                    {
                      body: { stringValue: "Test" },
                    },
                  ],
                },
              ],
            },
          ],
        },
      });

      await handler.handle(ctx);

      const afterTest = Date.now();
      const logTime = ctx.normalizedLogs![0]!.timestamp.getTime();
      expect(logTime).toBeGreaterThanOrEqual(beforeTest);
      expect(logTime).toBeLessThanOrEqual(afterTest);
    });
  });

  describe("Severity Handling", () => {
    it("should preserve severity number and text", async () => {
      const ctx = createMockLogsPipelineContext({
        parsedRequest: createMultiSeverityLogsRequest(),
      });

      await handler.handle(ctx);

      const logs = ctx.normalizedLogs!;
      expect(logs[0]!.severityNumber).toBe(SEVERITY_NUMBERS.TRACE);
      expect(logs[0]!.severityText).toBe("TRACE");
      expect(logs[4]!.severityNumber).toBe(SEVERITY_NUMBERS.ERROR);
      expect(logs[4]!.severityText).toBe("ERROR");
    });

    it("should handle missing severity", async () => {
      const ctx = createMockLogsPipelineContext({
        parsedRequest: {
          resourceLogs: [
            {
              scopeLogs: [
                {
                  logRecords: [
                    {
                      timeUnixNano: dateToNanoString(new Date()),
                      body: { stringValue: "No severity" },
                    },
                  ],
                },
              ],
            },
          ],
        },
      });

      await handler.handle(ctx);

      expect(ctx.normalizedLogs![0]!.severityNumber).toBeUndefined();
      expect(ctx.normalizedLogs![0]!.severityText).toBeUndefined();
    });
  });

  describe("Body Extraction", () => {
    it("should extract string body as bodyText", async () => {
      const ctx = createMockLogsPipelineContext({
        parsedRequest: createBasicLogsRequest(),
      });

      await handler.handle(ctx);

      expect(ctx.normalizedLogs![0]!.bodyText).toBe("Test log message");
    });

    it("should handle various body types", async () => {
      const ctx = createMockLogsPipelineContext({
        parsedRequest: createVariousBodyTypesLogsRequest(),
      });

      await handler.handle(ctx);

      expect(ctx.normalizedLogs![0]!.bodyText).toBe("String log body");
      expect(ctx.normalizedLogs![1]!.bodyText).toBe("42");
      expect(ctx.normalizedLogs![2]!.bodyText).toBe("true");
    });

    it("should preserve original body object", async () => {
      const ctx = createMockLogsPipelineContext({
        parsedRequest: createBasicLogsRequest(),
      });

      await handler.handle(ctx);

      expect(ctx.normalizedLogs![0]!.body).toEqual({
        stringValue: "Test log message",
      });
    });

    it("should handle missing body", async () => {
      const ctx = createMockLogsPipelineContext({
        parsedRequest: {
          resourceLogs: [
            {
              scopeLogs: [
                {
                  logRecords: [
                    {
                      timeUnixNano: dateToNanoString(new Date()),
                      severityNumber: 9,
                    },
                  ],
                },
              ],
            },
          ],
        },
      });

      await handler.handle(ctx);

      expect(ctx.normalizedLogs![0]!.bodyText).toBeUndefined();
      expect(ctx.normalizedLogs![0]!.body).toBeUndefined();
    });
  });

  describe("Attributes Flattening", () => {
    it("should flatten log attributes", async () => {
      const ctx = createMockLogsPipelineContext({
        parsedRequest: createCorrelatedLogsRequest(),
      });

      await handler.handle(ctx);

      const log = ctx.normalizedLogs![0]!;
      expect(log.attributes!["http.method"]).toBe("POST");
      expect(log.attributes!["http.url"]).toBe("/api/users");
    });

    it("should handle different attribute value types", async () => {
      const ctx = createMockLogsPipelineContext({
        parsedRequest: {
          resourceLogs: [
            {
              scopeLogs: [
                {
                  logRecords: [
                    {
                      timeUnixNano: dateToNanoString(new Date()),
                      body: { stringValue: "Test" },
                      attributes: [
                        { key: "str_val", value: { stringValue: "hello" } },
                        { key: "int_val", value: { intValue: "42" } },
                        { key: "double_val", value: { doubleValue: 3.14 } },
                        { key: "bool_val", value: { boolValue: true } },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      });

      await handler.handle(ctx);

      const attrs = ctx.normalizedLogs![0]!.attributes!;
      expect(attrs["str_val"]).toBe("hello");
      expect(attrs["int_val"]).toBe("42");
      expect(attrs["double_val"]).toBe(3.14);
      expect(attrs["bool_val"]).toBe(true);
    });

    it("should handle empty attributes", async () => {
      const ctx = createMockLogsPipelineContext({
        parsedRequest: createMinimalLogsRequest(),
      });

      await handler.handle(ctx);

      expect(ctx.normalizedLogs![0]!.attributes).toEqual({});
    });
  });

  describe("Trace Correlation", () => {
    it("should preserve traceId and spanId", async () => {
      const ctx = createMockLogsPipelineContext({
        parsedRequest: createCorrelatedLogsRequest(),
      });

      await handler.handle(ctx);

      const log = ctx.normalizedLogs![0]!;
      expect(log.traceId).toBeDefined();
      expect(log.spanId).toBeDefined();
      expect(log.traceId!.length).toBe(32);
      expect(log.spanId!.length).toBe(16);
    });

    it("should handle logs without trace context", async () => {
      const ctx = createMockLogsPipelineContext({
        parsedRequest: createBasicLogsRequest(),
      });

      await handler.handle(ctx);

      expect(ctx.normalizedLogs![0]!.traceId).toBeUndefined();
      expect(ctx.normalizedLogs![0]!.spanId).toBeUndefined();
    });
  });

  describe("Multiple Resources and Scopes", () => {
    it("should normalize logs from multiple resources", async () => {
      const ctx = createMockLogsPipelineContext({
        parsedRequest: createMultiResourceLogsRequest(),
      });

      await handler.handle(ctx);

      expect(ctx.normalizedLogs).toHaveLength(2);
      expect(ctx.normalizedLogs![0]!.serviceName).toBe("service-a");
      expect(ctx.normalizedLogs![1]!.serviceName).toBe("service-b");
    });

    it("should normalize logs from multiple scopes", async () => {
      const ctx = createMockLogsPipelineContext({
        parsedRequest: {
          resourceLogs: [
            {
              resource: {
                attributes: [
                  { key: "service.name", value: { stringValue: "multi-scope" } },
                ],
              },
              scopeLogs: [
                {
                  scope: { name: "scope-1" },
                  logRecords: [
                    {
                      timeUnixNano: dateToNanoString(new Date()),
                      body: { stringValue: "Log 1" },
                    },
                  ],
                },
                {
                  scope: { name: "scope-2" },
                  logRecords: [
                    {
                      timeUnixNano: dateToNanoString(new Date()),
                      body: { stringValue: "Log 2" },
                    },
                  ],
                },
              ],
            },
          ],
        },
      });

      await handler.handle(ctx);

      expect(ctx.normalizedLogs).toHaveLength(2);
      expect(ctx.normalizedLogs![0]!.scopeName).toBe("scope-1");
      expect(ctx.normalizedLogs![1]!.scopeName).toBe("scope-2");
    });
  });

  describe("Edge Cases", () => {
    it("should handle logs with droppedAttributesCount", async () => {
      const ctx = createMockLogsPipelineContext({
        parsedRequest: {
          resourceLogs: [
            {
              scopeLogs: [
                {
                  logRecords: [
                    {
                      timeUnixNano: dateToNanoString(new Date()),
                      body: { stringValue: "Test" },
                      droppedAttributesCount: 5,
                    },
                  ],
                },
              ],
            },
          ],
        },
      });

      await handler.handle(ctx);

      expect(ctx.normalizedLogs![0]!.droppedAttributesCount).toBe(5);
    });

    it("should handle logs with flags", async () => {
      const ctx = createMockLogsPipelineContext({
        parsedRequest: {
          resourceLogs: [
            {
              scopeLogs: [
                {
                  logRecords: [
                    {
                      timeUnixNano: dateToNanoString(new Date()),
                      body: { stringValue: "Test" },
                      flags: 1,
                    },
                  ],
                },
              ],
            },
          ],
        },
      });

      await handler.handle(ctx);

      expect(ctx.normalizedLogs![0]!.flags).toBe(1);
    });
  });
});
