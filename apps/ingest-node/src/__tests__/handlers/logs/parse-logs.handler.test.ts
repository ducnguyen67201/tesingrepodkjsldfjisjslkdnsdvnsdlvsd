/**
 * Parse Logs Handler Tests
 *
 * Tests for the first handler in the logs pipeline that:
 * - Validates content types
 * - Decompresses gzip payloads
 * - Parses JSON and protobuf OTLP logs
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { gzipSync } from "node:zlib";
import { ParseLogsHandler } from "../../../pipeline/logs/parse-logs.handler.js";
import {
  createMockLogsPipelineContext,
} from "../../helpers/mock-logs-context.js";
import {
  createBasicLogsRequest,
  createEmptyLogsRequest,
  createMultiResourceLogsRequest,
  createMinimalLogsRequest,
  toLogsJson,
  toLogsJsonBuffer,
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

// Mock the protobuf parser
vi.mock("../../../lib/otlp-logs-proto.js", () => ({
  parseOtlpLogsProtobuf: vi.fn().mockResolvedValue({
    resourceLogs: [
      {
        resource: {
          attributes: [
            { key: "service.name", value: { stringValue: "test-service" } },
          ],
        },
        scopeLogs: [
          {
            scope: { name: "test-scope" },
            logRecords: [
              {
                timeUnixNano: "1704067200000000000",
                severityNumber: 9,
                severityText: "INFO",
                body: { stringValue: "Test log" },
              },
            ],
          },
        ],
      },
    ],
  }),
}));

describe("ParseLogsHandler", () => {
  let handler: ParseLogsHandler;

  beforeEach(() => {
    handler = new ParseLogsHandler();
    vi.clearAllMocks();
  });

  describe("Content-Type Validation", () => {
    it("should accept application/json content type", async () => {
      const ctx = createMockLogsPipelineContext({
        contentType: "application/json",
        rawBody: toLogsJsonBuffer(createBasicLogsRequest()),
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(true);
      expect(result.error).toBeUndefined();
      expect(ctx.parsedRequest).toBeDefined();
    });

    it("should accept application/json with charset", async () => {
      const ctx = createMockLogsPipelineContext({
        contentType: "application/json; charset=utf-8",
        rawBody: toLogsJsonBuffer(createBasicLogsRequest()),
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should accept application/x-protobuf content type", async () => {
      const ctx = createMockLogsPipelineContext({
        contentType: "application/x-protobuf",
        rawBody: Buffer.from([0x0a, 0x01, 0x00]), // dummy protobuf
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should reject text/plain content type", async () => {
      const ctx = createMockLogsPipelineContext({
        contentType: "text/plain",
        rawBody: Buffer.from("plain text"),
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(false);
      expect(result.error?.code).toBe("INVALID_CONTENT_TYPE");
      expect(result.error?.httpStatus).toBe(415);
    });

    it("should reject text/html content type", async () => {
      const ctx = createMockLogsPipelineContext({
        contentType: "text/html",
        rawBody: Buffer.from("<html></html>"),
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(false);
      expect(result.error?.code).toBe("INVALID_CONTENT_TYPE");
      expect(result.error?.httpStatus).toBe(415);
    });

    it("should reject application/xml content type", async () => {
      const ctx = createMockLogsPipelineContext({
        contentType: "application/xml",
        rawBody: Buffer.from("<xml></xml>"),
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(false);
      expect(result.error?.code).toBe("INVALID_CONTENT_TYPE");
    });

    it("should handle uppercase content type", async () => {
      const ctx = createMockLogsPipelineContext({
        contentType: "APPLICATION/JSON",
        rawBody: toLogsJsonBuffer(createBasicLogsRequest()),
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(true);
    });
  });

  describe("JSON Parsing", () => {
    it("should parse valid OTLP JSON logs", async () => {
      const request = createBasicLogsRequest({
        serviceName: "my-service",
      });
      const ctx = createMockLogsPipelineContext({
        contentType: "application/json",
        rawBody: toLogsJsonBuffer(request),
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(true);
      expect(ctx.parsedRequest).toBeDefined();
      expect(ctx.parsedRequest?.resourceLogs).toHaveLength(1);
    });

    it("should parse empty resourceLogs array", async () => {
      const ctx = createMockLogsPipelineContext({
        contentType: "application/json",
        rawBody: toLogsJsonBuffer(createEmptyLogsRequest()),
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(true);
      expect(ctx.parsedRequest?.resourceLogs).toHaveLength(0);
    });

    it("should parse multiple resource logs", async () => {
      const ctx = createMockLogsPipelineContext({
        contentType: "application/json",
        rawBody: toLogsJsonBuffer(createMultiResourceLogsRequest()),
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(true);
      expect(ctx.parsedRequest?.resourceLogs).toHaveLength(2);
    });

    it("should parse minimal logs request", async () => {
      const ctx = createMockLogsPipelineContext({
        contentType: "application/json",
        rawBody: toLogsJsonBuffer(createMinimalLogsRequest()),
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(true);
    });

    it("should reject invalid JSON", async () => {
      const ctx = createMockLogsPipelineContext({
        contentType: "application/json",
        rawBody: Buffer.from("{ invalid json }"),
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(false);
      expect(result.error?.code).toBe("PARSE_ERROR");
      expect(result.error?.httpStatus).toBe(400);
    });

    it("should reject empty body", async () => {
      const ctx = createMockLogsPipelineContext({
        contentType: "application/json",
        rawBody: Buffer.from(""),
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(false);
      expect(result.error?.code).toBe("PARSE_ERROR");
    });

    it("should reject JSON that doesn't match OTLP schema", async () => {
      const ctx = createMockLogsPipelineContext({
        contentType: "application/json",
        rawBody: Buffer.from(JSON.stringify({ invalid: "schema" })),
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(false);
      expect(result.error?.code).toBe("PARSE_ERROR");
    });

    it("should reject null body", async () => {
      const ctx = createMockLogsPipelineContext({
        contentType: "application/json",
        rawBody: Buffer.from("null"),
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(false);
      expect(result.error?.code).toBe("PARSE_ERROR");
    });

    it("should reject array body", async () => {
      const ctx = createMockLogsPipelineContext({
        contentType: "application/json",
        rawBody: Buffer.from("[]"),
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(false);
      expect(result.error?.code).toBe("PARSE_ERROR");
    });
  });

  describe("Gzip Decompression", () => {
    it("should decompress gzip-encoded JSON", async () => {
      const request = createBasicLogsRequest();
      const jsonBuffer = Buffer.from(toLogsJson(request), "utf-8");
      const gzippedBuffer = gzipSync(jsonBuffer);

      const ctx = createMockLogsPipelineContext({
        contentType: "application/json",
        contentEncoding: "gzip",
        rawBody: gzippedBuffer,
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(true);
      expect(ctx.parsedRequest).toBeDefined();
    });

    it("should reject invalid gzip data", async () => {
      const ctx = createMockLogsPipelineContext({
        contentType: "application/json",
        contentEncoding: "gzip",
        rawBody: Buffer.from("not gzip data"),
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(false);
      expect(result.error?.code).toBe("DECOMPRESSION_ERROR");
      expect(result.error?.httpStatus).toBe(400);
    });

    it("should reject truncated gzip data", async () => {
      const request = createBasicLogsRequest();
      const jsonBuffer = Buffer.from(toLogsJson(request), "utf-8");
      const gzippedBuffer = gzipSync(jsonBuffer);
      // Truncate the gzip data
      const truncatedBuffer = gzippedBuffer.subarray(0, gzippedBuffer.length / 2);

      const ctx = createMockLogsPipelineContext({
        contentType: "application/json",
        contentEncoding: "gzip",
        rawBody: truncatedBuffer,
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(false);
      expect(result.error?.code).toBe("DECOMPRESSION_ERROR");
    });

    it("should handle non-gzip content-encoding gracefully", async () => {
      const ctx = createMockLogsPipelineContext({
        contentType: "application/json",
        contentEncoding: "", // no encoding
        rawBody: toLogsJsonBuffer(createBasicLogsRequest()),
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(true);
    });
  });

  describe("Edge Cases", () => {
    it("should handle very large JSON payload", async () => {
      // Create a request with many log records
      const logRecords = [];
      for (let i = 0; i < 100; i++) {
        logRecords.push({
          timeUnixNano: "1704067200000000000",
          severityNumber: 9,
          severityText: "INFO",
          body: { stringValue: `Log message ${i}` },
        });
      }

      const request = {
        resourceLogs: [
          {
            resource: {
              attributes: [
                { key: "service.name", value: { stringValue: "test" } },
              ],
            },
            scopeLogs: [
              {
                scope: { name: "test" },
                logRecords,
              },
            ],
          },
        ],
      };

      const ctx = createMockLogsPipelineContext({
        contentType: "application/json",
        rawBody: Buffer.from(JSON.stringify(request)),
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(true);
    });

    it("should handle unicode in log body", async () => {
      const request = {
        resourceLogs: [
          {
            resource: {
              attributes: [
                { key: "service.name", value: { stringValue: "test" } },
              ],
            },
            scopeLogs: [
              {
                scope: { name: "test" },
                logRecords: [
                  {
                    timeUnixNano: "1704067200000000000",
                    severityNumber: 9,
                    body: { stringValue: "日本語ログ 🎉 émojis" },
                  },
                ],
              },
            ],
          },
        ],
      };

      const ctx = createMockLogsPipelineContext({
        contentType: "application/json",
        rawBody: Buffer.from(JSON.stringify(request)),
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(true);
    });

    it("should handle logs with no body", async () => {
      const request = {
        resourceLogs: [
          {
            scopeLogs: [
              {
                logRecords: [
                  {
                    timeUnixNano: "1704067200000000000",
                    severityNumber: 9,
                    // No body field
                  },
                ],
              },
            ],
          },
        ],
      };

      const ctx = createMockLogsPipelineContext({
        contentType: "application/json",
        rawBody: Buffer.from(JSON.stringify(request)),
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(true);
    });
  });
});
