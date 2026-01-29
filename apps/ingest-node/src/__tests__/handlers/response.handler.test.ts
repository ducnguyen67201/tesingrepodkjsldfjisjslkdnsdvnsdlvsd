/**
 * Response Handler Tests
 *
 * Tests for sending success responses after successful ingestion.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { ResponseHandler } from "../../pipeline/handlers/response.handler.js";
import { createAuthenticatedContext } from "../helpers/mock-context.js";

describe("ResponseHandler", () => {
  let handler: ResponseHandler;

  beforeEach(() => {
    handler = new ResponseHandler();
  });

  describe("Success Response", () => {
    it("should send 202 Accepted response", async () => {
      const ctx = createAuthenticatedContext({
        normalizedTraces: [
          {
            externalTraceId: "trace1",
            projectId: "proj1",
            startTime: new Date(),
            spanCount: 2,
            errorCount: 0,
            hasError: false,
            hasException: false,
            spanTypes: [],
          },
        ],
        normalizedSpans: [
          {
            externalSpanId: "span1",
            externalTraceId: "trace1",
            name: "span-1",
            startTime: new Date(),
          },
          {
            externalSpanId: "span2",
            externalTraceId: "trace1",
            name: "span-2",
            startTime: new Date(),
          },
        ],
        persistedTraceIds: ["trace1"],
        persistedSpanCount: 2,
      });

      await handler.handle(ctx);

      const mockRes = ctx.res as unknown as {
        _statusCode: number;
        _body: unknown;
      };

      expect(mockRes._statusCode).toBe(202);
    });

    it("should include trace and span counts in response", async () => {
      const ctx = createAuthenticatedContext({
        normalizedTraces: [
          {
            externalTraceId: "trace1",
            projectId: "proj1",
            startTime: new Date(),
            spanCount: 3,
            errorCount: 0,
            hasError: false,
            hasException: false,
            spanTypes: [],
          },
        ],
        normalizedSpans: [
          { externalSpanId: "span1", externalTraceId: "trace1", name: "s1", startTime: new Date() },
          { externalSpanId: "span2", externalTraceId: "trace1", name: "s2", startTime: new Date() },
          { externalSpanId: "span3", externalTraceId: "trace1", name: "s3", startTime: new Date() },
        ],
      });

      await handler.handle(ctx);

      const mockRes = ctx.res as unknown as { _body: { traceCount: number; spanCount: number } };
      expect(mockRes._body.traceCount).toBe(1);
      expect(mockRes._body.spanCount).toBe(3);
    });

    it("should include accepted flag in response", async () => {
      const ctx = createAuthenticatedContext();

      await handler.handle(ctx);

      const mockRes = ctx.res as unknown as { _body: { accepted: boolean } };
      expect(mockRes._body.accepted).toBe(true);
    });

    it("should include persisted trace IDs in response", async () => {
      const ctx = createAuthenticatedContext({
        persistedTraceIds: ["trace-abc", "trace-def"],
      });

      await handler.handle(ctx);

      const mockRes = ctx.res as unknown as { _body: { persistedTraceIds: string[] } };
      expect(mockRes._body.persistedTraceIds).toEqual(["trace-abc", "trace-def"]);
    });
  });

  describe("Empty Data", () => {
    it("should handle empty traces gracefully", async () => {
      const ctx = createAuthenticatedContext({
        normalizedTraces: [],
        normalizedSpans: [],
      });

      await handler.handle(ctx);

      const mockRes = ctx.res as unknown as { _body: { traceCount: number; spanCount: number } };
      expect(mockRes._body.traceCount).toBe(0);
      expect(mockRes._body.spanCount).toBe(0);
    });

    it("should handle undefined traces gracefully", async () => {
      const ctx = createAuthenticatedContext();
      ctx.normalizedTraces = undefined;
      ctx.normalizedSpans = undefined;

      await handler.handle(ctx);

      const mockRes = ctx.res as unknown as { _body: { traceCount: number; spanCount: number } };
      expect(mockRes._body.traceCount).toBe(0);
      expect(mockRes._body.spanCount).toBe(0);
    });
  });

  describe("Chain Termination", () => {
    it("should return continue: false to end chain", async () => {
      const ctx = createAuthenticatedContext();

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(false);
    });

    it("should not set error on context", async () => {
      const ctx = createAuthenticatedContext();

      const result = await handler.handle(ctx);

      expect(result.error).toBeUndefined();
      expect(ctx.error).toBeUndefined();
    });
  });

  describe("Multiple Traces", () => {
    it("should correctly count multiple traces", async () => {
      const ctx = createAuthenticatedContext({
        normalizedTraces: [
          { externalTraceId: "t1", projectId: "p1", startTime: new Date(), spanCount: 1, errorCount: 0, hasError: false, hasException: false, spanTypes: [] },
          { externalTraceId: "t2", projectId: "p1", startTime: new Date(), spanCount: 2, errorCount: 1, hasError: true, hasException: false, spanTypes: [] },
          { externalTraceId: "t3", projectId: "p1", startTime: new Date(), spanCount: 1, errorCount: 0, hasError: false, hasException: false, spanTypes: [] },
        ],
        normalizedSpans: [
          { externalSpanId: "s1", externalTraceId: "t1", name: "s1", startTime: new Date() },
          { externalSpanId: "s2", externalTraceId: "t2", name: "s2", startTime: new Date() },
          { externalSpanId: "s3", externalTraceId: "t2", name: "s3", startTime: new Date() },
          { externalSpanId: "s4", externalTraceId: "t3", name: "s4", startTime: new Date() },
        ],
      });

      await handler.handle(ctx);

      const mockRes = ctx.res as unknown as { _body: { traceCount: number; spanCount: number } };
      expect(mockRes._body.traceCount).toBe(3);
      expect(mockRes._body.spanCount).toBe(4);
    });
  });

  describe("Handler Properties", () => {
    it("should have correct name", () => {
      expect(handler.name).toBe("ResponseHandler");
    });
  });
});
