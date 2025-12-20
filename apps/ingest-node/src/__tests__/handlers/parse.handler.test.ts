/**
 * Parse Handler Tests
 *
 * Tests for OTLP parsing (JSON and protobuf), decompression, and content type validation.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { gzipSync } from "node:zlib";
import { ParseHandler } from "../../pipeline/handlers/parse.handler.js";
import { createMockPipelineContext } from "../helpers/mock-context.js";
import {
  createBasicOtlpRequest,
  toOtlpJsonBuffer,
} from "../fixtures/otlp.fixtures.js";

describe("ParseHandler", () => {
  let handler: ParseHandler;

  beforeEach(() => {
    handler = new ParseHandler();
  });

  describe("Content Type Validation", () => {
    it("should accept application/json content type", async () => {
      const ctx = createMockPipelineContext({
        contentType: "application/json",
        rawBody: toOtlpJsonBuffer(createBasicOtlpRequest()),
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(true);
      expect(ctx.parsedRequest).toBeDefined();
    });

    it("should accept application/json with charset", async () => {
      const ctx = createMockPipelineContext({
        contentType: "application/json; charset=utf-8",
        rawBody: toOtlpJsonBuffer(createBasicOtlpRequest()),
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(true);
      expect(ctx.parsedRequest).toBeDefined();
    });

    it("should accept application/x-protobuf content type", async () => {
      // An empty protobuf buffer is valid (empty ExportTraceServiceRequest)
      const ctx = createMockPipelineContext({
        contentType: "application/x-protobuf",
        rawBody: Buffer.from([]), // Empty buffer is valid, represents empty request
      });

      const result = await handler.handle(ctx);

      // Empty protobuf is valid but results in empty resourceSpans
      expect(result.continue).toBe(true);
      expect(ctx.parsedRequest?.resourceSpans).toEqual([]);
    });

    it("should reject unsupported content types", async () => {
      const ctx = createMockPipelineContext({
        contentType: "text/plain",
        rawBody: Buffer.from("hello"),
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(false);
      expect(result.error?.code).toBe("INVALID_CONTENT_TYPE");
      expect(result.error?.httpStatus).toBe(415);
    });

    it("should reject empty content type", async () => {
      const ctx = createMockPipelineContext({
        contentType: "",
        rawBody: Buffer.from("{}"),
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(false);
      expect(result.error?.code).toBe("INVALID_CONTENT_TYPE");
    });

    it("should reject application/xml", async () => {
      const ctx = createMockPipelineContext({
        contentType: "application/xml",
        rawBody: Buffer.from("<root></root>"),
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(false);
      expect(result.error?.code).toBe("INVALID_CONTENT_TYPE");
    });
  });

  describe("JSON Parsing", () => {
    it("should parse valid OTLP JSON", async () => {
      const request = createBasicOtlpRequest({
        serviceName: "my-service",
        environment: "production",
      });

      const ctx = createMockPipelineContext({
        contentType: "application/json",
        rawBody: toOtlpJsonBuffer(request),
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(true);
      expect(ctx.parsedRequest).toBeDefined();
      expect(ctx.parsedRequest?.resourceSpans).toHaveLength(1);
    });

    it("should fail on invalid JSON", async () => {
      const ctx = createMockPipelineContext({
        contentType: "application/json",
        rawBody: Buffer.from("not valid json {"),
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(false);
      expect(result.error?.code).toBe("PARSE_ERROR");
      expect(result.error?.httpStatus).toBe(400);
    });

    it("should fail on JSON that doesn't match OTLP schema", async () => {
      const ctx = createMockPipelineContext({
        contentType: "application/json",
        rawBody: Buffer.from(JSON.stringify({ foo: "bar" })),
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(false);
      expect(result.error?.code).toBe("PARSE_ERROR");
    });

    it("should handle empty resourceSpans array", async () => {
      const ctx = createMockPipelineContext({
        contentType: "application/json",
        rawBody: Buffer.from(JSON.stringify({ resourceSpans: [] })),
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(true);
      expect(ctx.parsedRequest?.resourceSpans).toHaveLength(0);
    });

    it("should parse OTLP JSON with minimal data", async () => {
      const minimalRequest = {
        resourceSpans: [
          {
            scopeSpans: [
              {
                spans: [
                  {
                    traceId: "a".repeat(32),
                    spanId: "b".repeat(16),
                    name: "minimal-span",
                    startTimeUnixNano: "1000000000000000000",
                  },
                ],
              },
            ],
          },
        ],
      };

      const ctx = createMockPipelineContext({
        contentType: "application/json",
        rawBody: Buffer.from(JSON.stringify(minimalRequest)),
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(true);
      expect(ctx.parsedRequest?.resourceSpans).toHaveLength(1);
    });
  });

  describe("Gzip Decompression", () => {
    it("should decompress gzip-encoded JSON payload", async () => {
      const request = createBasicOtlpRequest();
      const jsonBuffer = toOtlpJsonBuffer(request);
      const gzippedBuffer = gzipSync(jsonBuffer);

      const ctx = createMockPipelineContext({
        contentType: "application/json",
        contentEncoding: "gzip",
        rawBody: gzippedBuffer,
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(true);
      expect(ctx.parsedRequest).toBeDefined();
    });

    it("should fail on invalid gzip data", async () => {
      const ctx = createMockPipelineContext({
        contentType: "application/json",
        contentEncoding: "gzip",
        rawBody: Buffer.from("not gzip data"),
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(false);
      expect(result.error?.code).toBe("DECOMPRESSION_ERROR");
      expect(result.error?.httpStatus).toBe(400);
    });

    it("should pass through uncompressed data when no encoding specified", async () => {
      const request = createBasicOtlpRequest();

      const ctx = createMockPipelineContext({
        contentType: "application/json",
        contentEncoding: "",
        rawBody: toOtlpJsonBuffer(request),
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(true);
      expect(ctx.parsedRequest).toBeDefined();
    });

    it("should handle large gzipped payloads", async () => {
      // Create a request with many spans to test larger payloads
      const request = createBasicOtlpRequest();
      for (let i = 0; i < 50; i++) {
        request.resourceSpans[0].scopeSpans[0].spans.push({
          traceId: "a".repeat(32),
          spanId: `span${i.toString().padStart(14, "0")}`,
          name: `span-${i}`,
          startTimeUnixNano: "1000000000000000000",
        });
      }

      const jsonBuffer = toOtlpJsonBuffer(request);
      const gzippedBuffer = gzipSync(jsonBuffer);

      const ctx = createMockPipelineContext({
        contentType: "application/json",
        contentEncoding: "gzip",
        rawBody: gzippedBuffer,
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(true);
      expect(ctx.parsedRequest?.resourceSpans[0].scopeSpans[0].spans.length).toBeGreaterThan(50);
    });
  });

  describe("Handler Properties", () => {
    it("should have correct name", () => {
      expect(handler.name).toBe("ParseHandler");
    });
  });
});
