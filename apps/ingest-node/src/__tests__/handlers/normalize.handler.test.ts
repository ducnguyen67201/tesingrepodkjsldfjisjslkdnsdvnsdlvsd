/**
 * Normalize Handler Tests
 *
 * Tests for OTLP to internal format conversion, attribute extraction, and GenAI field mapping.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { NormalizeHandler } from "../../pipeline/handlers/normalize.handler.js";
import { createParsedContext } from "../helpers/mock-context.js";
import {
  createBasicOtlpRequest,
  createGenAiOtlpRequest,
  createErrorOtlpRequest,
  createMultiTraceOtlpRequest,
  generateTraceId,
  generateSpanId,
  createOtlpSpan,
  dateToNanoString,
} from "../fixtures/otlp.fixtures.js";

describe("NormalizeHandler", () => {
  let handler: NormalizeHandler;

  beforeEach(() => {
    handler = new NormalizeHandler();
  });

  describe("Basic Normalization", () => {
    it("should normalize a basic OTLP request", async () => {
      const ctx = createParsedContext({
        parsedRequest: createBasicOtlpRequest({
          serviceName: "test-service",
          serviceVersion: "1.0.0",
          environment: "production",
        }),
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(true);
      expect(ctx.normalizedTraces).toBeDefined();
      expect(ctx.normalizedSpans).toBeDefined();
      expect(ctx.normalizedTraces).toHaveLength(1);
      expect(ctx.normalizedSpans).toHaveLength(1);
    });

    it("should extract service metadata from resource attributes", async () => {
      const ctx = createParsedContext({
        parsedRequest: createBasicOtlpRequest({
          serviceName: "my-api",
          serviceVersion: "2.5.0",
          environment: "staging",
        }),
      });

      await handler.handle(ctx);

      const trace = ctx.normalizedTraces![0]!;
      expect(trace.serviceName).toBe("my-api");
      expect(trace.serviceVersion).toBe("2.5.0");
      expect(trace.environment).toBe("staging");
    });

    it("should fail if parsedRequest is missing", async () => {
      const ctx = createParsedContext();
      ctx.parsedRequest = undefined;

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(false);
      expect(result.error?.code).toBe("INTERNAL_ERROR");
      expect(result.error?.httpStatus).toBe(500);
    });

    it("should handle empty resourceSpans", async () => {
      const ctx = createParsedContext({
        parsedRequest: { resourceSpans: [] },
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(true);
      expect(ctx.normalizedTraces).toHaveLength(0);
      expect(ctx.normalizedSpans).toHaveLength(0);
    });
  });

  describe("Span Normalization", () => {
    it("should normalize span IDs correctly", async () => {
      const traceId = generateTraceId();
      const spanId = generateSpanId();
      const parentSpanId = generateSpanId();

      const ctx = createParsedContext({
        parsedRequest: createBasicOtlpRequest({
          spans: [
            createOtlpSpan({ traceId, spanId, parentSpanId, name: "test-span" }),
          ],
        }),
      });

      await handler.handle(ctx);

      const span = ctx.normalizedSpans![0]!;
      expect(span.externalSpanId).toBe(spanId);
      expect(span.externalTraceId).toBe(traceId);
      expect(span.externalParentId).toBe(parentSpanId);
    });

    it("should convert nanosecond timestamps to Date objects", async () => {
      const now = new Date();
      const endTime = new Date(now.getTime() + 500);

      const ctx = createParsedContext({
        parsedRequest: createBasicOtlpRequest({
          spans: [
            createOtlpSpan({ startTime: now, endTime }),
          ],
        }),
      });

      await handler.handle(ctx);

      const span = ctx.normalizedSpans![0]!;
      expect(span.startTime).toBeInstanceOf(Date);
      expect(span.endTime).toBeInstanceOf(Date);
      // Allow 1ms tolerance due to precision
      expect(Math.abs(span.startTime.getTime() - now.getTime())).toBeLessThan(2);
    });

    it("should calculate durationMs correctly", async () => {
      const startTime = new Date("2024-01-01T00:00:00.000Z");
      const endTime = new Date("2024-01-01T00:00:00.500Z"); // 500ms later

      const ctx = createParsedContext({
        parsedRequest: createBasicOtlpRequest({
          spans: [createOtlpSpan({ startTime, endTime })],
        }),
      });

      await handler.handle(ctx);

      const span = ctx.normalizedSpans![0]!;
      expect(span.durationMs).toBe(500);
    });

    it("should handle missing endTime", async () => {
      const traceId = generateTraceId();
      const request = {
        resourceSpans: [
          {
            resource: { attributes: [{ key: "service.name", value: { stringValue: "test" } }] },
            scopeSpans: [
              {
                spans: [
                  {
                    traceId,
                    spanId: generateSpanId(),
                    name: "in-progress-span",
                    startTimeUnixNano: dateToNanoString(new Date()),
                    // No endTimeUnixNano
                  },
                ],
              },
            ],
          },
        ],
      };

      const ctx = createParsedContext({ parsedRequest: request });
      await handler.handle(ctx);

      const span = ctx.normalizedSpans![0]!;
      expect(span.endTime).toBeUndefined();
      expect(span.durationMs).toBeUndefined();
    });

    it("should map span kind correctly", async () => {
      const spanKindTests = [
        { kind: 0, expected: "INTERNAL" },
        { kind: 1, expected: "INTERNAL" }, // UNSPECIFIED -> INTERNAL
        { kind: 2, expected: "SERVER" },
        { kind: 3, expected: "CLIENT" },
        { kind: 4, expected: "PRODUCER" },
        { kind: 5, expected: "CONSUMER" },
      ];

      for (const { kind, expected } of spanKindTests) {
        const ctx = createParsedContext({
          parsedRequest: createBasicOtlpRequest({
            spans: [createOtlpSpan({ kind })],
          }),
        });

        await handler.handle(ctx);
        expect(ctx.normalizedSpans![0]!.kind).toBe(expected);
      }
    });

    it("should map status code correctly", async () => {
      const statusTests = [
        { code: 0, expected: "UNSET" },
        { code: 1, expected: "OK" },
        { code: 2, expected: "ERROR" },
      ];

      for (const { code, expected } of statusTests) {
        const ctx = createParsedContext({
          parsedRequest: createBasicOtlpRequest({
            spans: [createOtlpSpan({ statusCode: code })],
          }),
        });

        await handler.handle(ctx);
        expect(ctx.normalizedSpans![0]!.statusCode).toBe(expected);
      }
    });

    it("should preserve status message", async () => {
      const ctx = createParsedContext({
        parsedRequest: createErrorOtlpRequest(),
      });

      await handler.handle(ctx);

      const span = ctx.normalizedSpans![0]!;
      expect(span.statusCode).toBe("ERROR");
      expect(span.statusMessage).toBe("Something went wrong");
    });
  });

  describe("Attribute Flattening", () => {
    it("should flatten string attributes", async () => {
      const ctx = createParsedContext({
        parsedRequest: createBasicOtlpRequest({
          spans: [
            createOtlpSpan({
              attributes: [
                { key: "http.method", value: { stringValue: "POST" } },
              ],
            }),
          ],
        }),
      });

      await handler.handle(ctx);

      const span = ctx.normalizedSpans![0]!;
      expect(span.attributes?.["http.method"]).toBe("POST");
    });

    it("should flatten integer attributes", async () => {
      const ctx = createParsedContext({
        parsedRequest: createBasicOtlpRequest({
          spans: [
            createOtlpSpan({
              attributes: [
                { key: "http.status_code", value: { intValue: "200" } },
              ],
            }),
          ],
        }),
      });

      await handler.handle(ctx);

      const span = ctx.normalizedSpans![0]!;
      expect(span.attributes?.["http.status_code"]).toBe(200);
    });

    it("should flatten boolean attributes", async () => {
      const ctx = createParsedContext({
        parsedRequest: createBasicOtlpRequest({
          spans: [
            createOtlpSpan({
              attributes: [
                { key: "custom.flag", value: { boolValue: true } },
              ],
            }),
          ],
        }),
      });

      await handler.handle(ctx);

      const span = ctx.normalizedSpans![0]!;
      expect(span.attributes?.["custom.flag"]).toBe(true);
    });

    it("should flatten double attributes", async () => {
      const ctx = createParsedContext({
        parsedRequest: createBasicOtlpRequest({
          spans: [
            createOtlpSpan({
              attributes: [
                { key: "custom.latency", value: { doubleValue: 1.5 } },
              ],
            }),
          ],
        }),
      });

      await handler.handle(ctx);

      const span = ctx.normalizedSpans![0]!;
      expect(span.attributes?.["custom.latency"]).toBe(1.5);
    });
  });

  describe("GenAI Field Extraction", () => {
    it("should extract GenAI fields from attributes", async () => {
      const ctx = createParsedContext({
        parsedRequest: createGenAiOtlpRequest(),
      });

      await handler.handle(ctx);

      // Find the LLM span (child span with GenAI attributes)
      const llmSpan = ctx.normalizedSpans!.find(s => s.name === "openai.chat.completions");
      expect(llmSpan).toBeDefined();
      expect(llmSpan?.model).toBe("gpt-4");
      expect(llmSpan?.promptTokens).toBe(150);
      expect(llmSpan?.completionTokens).toBe(50);
      expect(llmSpan?.input).toBe("Hello, world!");
      expect(llmSpan?.output).toBe("Hi there!");
    });

    it("should handle missing GenAI fields gracefully", async () => {
      const ctx = createParsedContext({
        parsedRequest: createBasicOtlpRequest(),
      });

      await handler.handle(ctx);

      const span = ctx.normalizedSpans![0]!;
      expect(span.model).toBeUndefined();
      expect(span.promptTokens).toBeUndefined();
      expect(span.completionTokens).toBeUndefined();
    });
  });

  describe("Trace Aggregation", () => {
    it("should aggregate multiple spans into a single trace", async () => {
      const ctx = createParsedContext({
        parsedRequest: createMultiTraceOtlpRequest(1), // 1 trace with 2 spans
      });

      await handler.handle(ctx);

      expect(ctx.normalizedTraces).toHaveLength(1);
      expect(ctx.normalizedSpans).toHaveLength(2);
      expect(ctx.normalizedTraces![0]!.spanCount).toBe(2);
    });

    it("should count error spans correctly", async () => {
      const ctx = createParsedContext({
        parsedRequest: createErrorOtlpRequest(),
      });

      await handler.handle(ctx);

      expect(ctx.normalizedTraces![0]!.errorCount).toBe(1);
    });

    it("should handle multiple traces", async () => {
      const ctx = createParsedContext({
        parsedRequest: createMultiTraceOtlpRequest(3), // 3 traces with 2 spans each
      });

      await handler.handle(ctx);

      expect(ctx.normalizedTraces).toHaveLength(3);
      expect(ctx.normalizedSpans).toHaveLength(6);
    });

    it("should set earliest startTime for trace", async () => {
      const traceId = generateTraceId();
      const earlier = new Date("2024-01-01T00:00:00.000Z");
      const later = new Date("2024-01-01T00:00:01.000Z");

      const ctx = createParsedContext({
        parsedRequest: createBasicOtlpRequest({
          spans: [
            createOtlpSpan({ traceId, name: "span-2", startTime: later }),
            createOtlpSpan({ traceId, name: "span-1", startTime: earlier }),
          ],
        }),
      });

      await handler.handle(ctx);

      const trace = ctx.normalizedTraces![0]!;
      expect(trace.startTime.getTime()).toBe(earlier.getTime());
    });
  });

  describe("Instrumentation Scope", () => {
    it("should extract library name and version", async () => {
      const request = createBasicOtlpRequest();
      // The fixture already includes scope info
      const ctx = createParsedContext({ parsedRequest: request });

      await handler.handle(ctx);

      const span = ctx.normalizedSpans![0]!;
      expect(span.libraryName).toBe("@opentelemetry/instrumentation-test");
      expect(span.libraryVersion).toBe("1.0.0");
    });
  });

  describe("Handler Properties", () => {
    it("should have correct name", () => {
      expect(handler.name).toBe("NormalizeHandler");
    });
  });
});
