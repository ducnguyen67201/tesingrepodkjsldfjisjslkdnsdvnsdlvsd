/**
 * Pipeline Runner Tests
 *
 * Tests for the Chain of Responsibility pipeline execution.
 */
import { describe, it, expect, vi } from "vitest";
import { createPipeline } from "../../pipeline/runner.js";
import type {
  PipelineContext,
  PipelineHandler,
  HandlerResult,
} from "../../pipeline/types.js";
import { createMockPipelineContext } from "../helpers/mock-context.js";

describe("Pipeline Runner", () => {
  /**
   * Create a mock handler for testing
   */
  function createMockHandler(
    name: string,
    behavior: (ctx: PipelineContext) => Promise<HandlerResult>
  ): PipelineHandler {
    return {
      name,
      handle: vi.fn(behavior),
    };
  }

  describe("Handler Chain Execution", () => {
    it("should execute handlers in order", async () => {
      const executionOrder: string[] = [];

      const handler1 = createMockHandler("Handler1", async () => {
        executionOrder.push("handler1");
        return { continue: true };
      });

      const handler2 = createMockHandler("Handler2", async () => {
        executionOrder.push("handler2");
        return { continue: true };
      });

      const handler3 = createMockHandler("Handler3", async () => {
        executionOrder.push("handler3");
        return { continue: true };
      });

      const pipeline = createPipeline()
        .addHandler(handler1)
        .addHandler(handler2)
        .addHandler(handler3);

      const ctx = createMockPipelineContext();
      await pipeline.execute(ctx);

      expect(executionOrder).toEqual(["handler1", "handler2", "handler3"]);
    });

    it("should stop chain when handler returns continue: false", async () => {
      const executionOrder: string[] = [];

      const handler1 = createMockHandler("Handler1", async () => {
        executionOrder.push("handler1");
        return { continue: true };
      });

      const handler2 = createMockHandler("Handler2", async () => {
        executionOrder.push("handler2");
        return {
          continue: false,
          error: {
            code: "TEST_ERROR",
            message: "Test error",
            httpStatus: 400,
          },
        };
      });

      const handler3 = createMockHandler("Handler3", async () => {
        executionOrder.push("handler3");
        return { continue: true };
      });

      const pipeline = createPipeline()
        .addHandler(handler1)
        .addHandler(handler2)
        .addHandler(handler3);

      const ctx = createMockPipelineContext();
      await pipeline.execute(ctx);

      expect(executionOrder).toEqual(["handler1", "handler2"]);
      expect(executionOrder).not.toContain("handler3");
    });

    it("should pass context between handlers", async () => {
      const handler1 = createMockHandler("Handler1", async (ctx) => {
        (ctx as PipelineContext & { customField?: string }).customField = "set by handler1";
        return { continue: true };
      });

      const handler2 = createMockHandler("Handler2", async (ctx) => {
        const customCtx = ctx as PipelineContext & { customField?: string };
        expect(customCtx.customField).toBe("set by handler1");
        customCtx.customField = "modified by handler2";
        return { continue: true };
      });

      const handler3 = createMockHandler("Handler3", async (ctx) => {
        const customCtx = ctx as PipelineContext & { customField?: string };
        expect(customCtx.customField).toBe("modified by handler2");
        return { continue: true };
      });

      const pipeline = createPipeline()
        .addHandler(handler1)
        .addHandler(handler2)
        .addHandler(handler3);

      const ctx = createMockPipelineContext();
      await pipeline.execute(ctx);
    });
  });

  describe("Error Handling", () => {
    it("should set error on context when handler fails", async () => {
      const handler = createMockHandler("FailingHandler", async () => {
        return {
          continue: false,
          error: {
            code: "TEST_ERROR",
            message: "Something went wrong",
            httpStatus: 400,
          },
        };
      });

      const pipeline = createPipeline().addHandler(handler);
      const ctx = createMockPipelineContext();

      await pipeline.execute(ctx);

      expect(ctx.error).toBeDefined();
      expect(ctx.error?.code).toBe("TEST_ERROR");
      expect(ctx.error?.message).toBe("Something went wrong");
      expect(ctx.error?.httpStatus).toBe(400);
    });

    it("should send error response when handler fails", async () => {
      const handler = createMockHandler("FailingHandler", async () => {
        return {
          continue: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid input",
            httpStatus: 422,
          },
        };
      });

      const pipeline = createPipeline().addHandler(handler);
      const ctx = createMockPipelineContext();

      await pipeline.execute(ctx);

      const mockRes = ctx.res as unknown as {
        _statusCode: number;
        _body: unknown;
      };
      expect(mockRes._statusCode).toBe(422);
      expect(mockRes._body).toEqual({
        error: "VALIDATION_ERROR",
        message: "Invalid input",
      });
    });

    it("should handle handler throwing exception", async () => {
      const handler = createMockHandler("ThrowingHandler", async () => {
        throw new Error("Unexpected error");
      });

      const pipeline = createPipeline().addHandler(handler);
      const ctx = createMockPipelineContext();

      await pipeline.execute(ctx);

      const mockRes = ctx.res as unknown as {
        _statusCode: number;
        _body: unknown;
      };
      expect(mockRes._statusCode).toBe(500);
    });

    it("should include error details when provided", async () => {
      const handler = createMockHandler("DetailedErrorHandler", async () => {
        return {
          continue: false,
          error: {
            code: "DETAILED_ERROR",
            message: "Error with details",
            httpStatus: 400,
            details: {
              field: "name",
              reason: "too short",
            },
          },
        };
      });

      const pipeline = createPipeline().addHandler(handler);
      const ctx = createMockPipelineContext();

      await pipeline.execute(ctx);

      expect(ctx.error?.details).toEqual({
        field: "name",
        reason: "too short",
      });
    });
  });

  describe("Empty Pipeline", () => {
    it("should handle empty pipeline gracefully", async () => {
      const pipeline = createPipeline();
      const ctx = createMockPipelineContext();

      // Should not throw
      await expect(pipeline.execute(ctx)).resolves.not.toThrow();
    });
  });

  describe("Handler Modification After Execution", () => {
    it("should allow adding handlers after creation", async () => {
      const pipeline = createPipeline();

      const handler1 = createMockHandler("Handler1", async () => {
        return { continue: true };
      });

      const handler2 = createMockHandler("Handler2", async () => {
        return { continue: true };
      });

      pipeline.addHandler(handler1);
      pipeline.addHandler(handler2);

      const ctx = createMockPipelineContext();
      await pipeline.execute(ctx);

      expect(handler1.handle).toHaveBeenCalled();
      expect(handler2.handle).toHaveBeenCalled();
    });
  });

  describe("Performance", () => {
    it("should execute handlers efficiently", async () => {
      const handlers: PipelineHandler[] = [];
      for (let i = 0; i < 100; i++) {
        handlers.push(
          createMockHandler(`Handler${i}`, async () => ({ continue: true }))
        );
      }

      const pipeline = createPipeline();
      for (const handler of handlers) {
        pipeline.addHandler(handler);
      }

      const ctx = createMockPipelineContext();
      const startTime = performance.now();
      await pipeline.execute(ctx);
      const duration = performance.now() - startTime;

      // Should complete quickly (less than 100ms for 100 handlers)
      expect(duration).toBeLessThan(100);

      // All handlers should have been called
      for (const handler of handlers) {
        expect(handler.handle).toHaveBeenCalled();
      }
    });
  });

  describe("Context Mutation", () => {
    it("should allow handlers to set standard context fields", async () => {
      const handler1 = createMockHandler("ParseHandler", async (ctx) => {
        ctx.parsedRequest = {
          resourceSpans: [],
        };
        return { continue: true };
      });

      const handler2 = createMockHandler("AuthHandler", async (ctx) => {
        ctx.projectId = "test-project";
        ctx.apiKeyId = "test-api-key";
        return { continue: true };
      });

      const handler3 = createMockHandler("PersistHandler", async (ctx) => {
        ctx.persistedTraceIds = ["trace-1", "trace-2"];
        ctx.persistedSpanCount = 5;
        return { continue: true };
      });

      const pipeline = createPipeline()
        .addHandler(handler1)
        .addHandler(handler2)
        .addHandler(handler3);

      const ctx = createMockPipelineContext();
      await pipeline.execute(ctx);

      expect(ctx.parsedRequest).toBeDefined();
      expect(ctx.projectId).toBe("test-project");
      expect(ctx.apiKeyId).toBe("test-api-key");
      expect(ctx.persistedTraceIds).toEqual(["trace-1", "trace-2"]);
      expect(ctx.persistedSpanCount).toBe(5);
    });
  });

  describe("Stop Without Error", () => {
    it("should allow stopping chain without error (e.g., ResponseHandler)", async () => {
      const handler1 = createMockHandler("Handler1", async () => {
        return { continue: true };
      });

      const responseHandler = createMockHandler("ResponseHandler", async (ctx) => {
        // Send response
        ctx.res.status(202).json({ accepted: true });
        return { continue: false }; // Stop chain, but no error
      });

      const handler3 = createMockHandler("Handler3", async () => {
        return { continue: true };
      });

      const pipeline = createPipeline()
        .addHandler(handler1)
        .addHandler(responseHandler)
        .addHandler(handler3);

      const ctx = createMockPipelineContext();
      await pipeline.execute(ctx);

      // Handler3 should not have been called
      expect(handler3.handle).not.toHaveBeenCalled();

      // Response should have been sent
      const mockRes = ctx.res as unknown as { _statusCode: number };
      expect(mockRes._statusCode).toBe(202);

      // No error should be set
      expect(ctx.error).toBeUndefined();
    });
  });
});
