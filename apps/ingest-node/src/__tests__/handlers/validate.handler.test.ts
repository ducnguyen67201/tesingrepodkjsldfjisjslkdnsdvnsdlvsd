/**
 * Validate Handler Tests
 *
 * Tests for validation of span limits, attribute counts, and timestamp sanity.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { ValidateHandler } from "../../pipeline/handlers/validate.handler.js";
import { createNormalizedContext } from "../helpers/mock-context.js";
import type { NormalizedSpan } from "@ducsigr/api/schemas";

describe("ValidateHandler", () => {
  let handler: ValidateHandler;

  beforeEach(() => {
    handler = new ValidateHandler();
  });

  /**
   * Create a normalized span for testing
   */
  function createTestSpan(overrides: Partial<NormalizedSpan> = {}): NormalizedSpan {
    return {
      externalSpanId: "span123",
      externalTraceId: "trace123",
      name: "test-span",
      startTime: new Date(),
      endTime: new Date(Date.now() + 100),
      durationMs: 100,
      statusCode: "OK",
      kind: "INTERNAL",
      ...overrides,
    };
  }

  describe("Basic Validation", () => {
    it("should pass valid spans", async () => {
      const ctx = createNormalizedContext({
        normalizedSpans: [createTestSpan()],
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(true);
      expect(ctx.validationPassed).toBe(true);
    });

    it("should fail if normalizedSpans is missing", async () => {
      const ctx = createNormalizedContext();
      ctx.normalizedSpans = undefined;

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(false);
      expect(result.error?.code).toBe("INTERNAL_ERROR");
    });
  });

  describe("Span Count Limits", () => {
    it("should pass when span count is within limit", async () => {
      const spans = Array.from({ length: 100 }, (_, i) =>
        createTestSpan({ externalSpanId: `span-${i}` })
      );

      const ctx = createNormalizedContext({ normalizedSpans: spans });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(true);
    });

    it("should fail when span count exceeds limit", async () => {
      // Create more spans than the default limit (500)
      const spans = Array.from({ length: 600 }, (_, i) =>
        createTestSpan({ externalSpanId: `span-${i}` })
      );

      const ctx = createNormalizedContext({ normalizedSpans: spans });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(false);
      expect(result.error?.code).toBe("TOO_MANY_SPANS");
      expect(result.error?.httpStatus).toBe(400);
    });
  });

  describe("Attribute Count Limits", () => {
    it("should pass when attribute count is within limit", async () => {
      const attributes: Record<string, unknown> = {};
      for (let i = 0; i < 50; i++) {
        attributes[`attr-${i}`] = `value-${i}`;
      }

      const ctx = createNormalizedContext({
        normalizedSpans: [createTestSpan({ attributes })],
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(true);
    });

    it("should fail when attribute count exceeds limit", async () => {
      const attributes: Record<string, unknown> = {};
      for (let i = 0; i < 100; i++) {
        // Default limit is 64
        attributes[`attr-${i}`] = `value-${i}`;
      }

      const ctx = createNormalizedContext({
        normalizedSpans: [createTestSpan({ attributes })],
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(false);
      expect(result.error?.code).toBe("VALIDATION_FAILED");
    });
  });

  describe("Event Count Limits", () => {
    it("should pass when event count is within limit", async () => {
      const events = Array.from({ length: 50 }, (_, i) => ({
        timeUnixNano: "1000000000000000000",
        name: `event-${i}`,
      }));

      const ctx = createNormalizedContext({
        normalizedSpans: [createTestSpan({ events })],
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(true);
    });

    it("should fail when event count exceeds limit", async () => {
      const events = Array.from({ length: 100 }, (_, i) => ({
        // Default limit is 64
        timeUnixNano: "1000000000000000000",
        name: `event-${i}`,
      }));

      const ctx = createNormalizedContext({
        normalizedSpans: [createTestSpan({ events })],
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(false);
      expect(result.error?.code).toBe("VALIDATION_FAILED");
    });
  });

  describe("Link Count Limits", () => {
    it("should pass when link count is within limit", async () => {
      const links = Array.from({ length: 20 }, (_, i) => ({
        traceId: `trace-${i}`.padEnd(32, "0"),
        spanId: `span-${i}`.padEnd(16, "0"),
      }));

      const ctx = createNormalizedContext({
        normalizedSpans: [createTestSpan({ links })],
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(true);
    });

    it("should fail when link count exceeds limit", async () => {
      const links = Array.from({ length: 50 }, (_, i) => ({
        // Default limit is 32
        traceId: `trace-${i}`.padEnd(32, "0"),
        spanId: `span-${i}`.padEnd(16, "0"),
      }));

      const ctx = createNormalizedContext({
        normalizedSpans: [createTestSpan({ links })],
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(false);
      expect(result.error?.code).toBe("VALIDATION_FAILED");
    });
  });

  describe("Attribute Value Length Limits", () => {
    it("should pass when attribute values are within length limit", async () => {
      const ctx = createNormalizedContext({
        normalizedSpans: [
          createTestSpan({
            attributes: {
              shortValue: "hello",
              mediumValue: "a".repeat(100),
            },
          }),
        ],
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(true);
    });

    it("should fail when attribute value exceeds length limit", async () => {
      const ctx = createNormalizedContext({
        normalizedSpans: [
          createTestSpan({
            attributes: {
              // Default limit is 2048
              longValue: "a".repeat(3000),
            },
          }),
        ],
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(false);
      expect(result.error?.code).toBe("VALIDATION_FAILED");
    });
  });

  describe("Timestamp Validation", () => {
    it("should pass spans with valid timestamps", async () => {
      const ctx = createNormalizedContext({
        normalizedSpans: [createTestSpan()],
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(true);
    });

    it("should fail spans with timestamps too far in the future", async () => {
      const futureDate = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours in future

      const ctx = createNormalizedContext({
        normalizedSpans: [
          createTestSpan({
            startTime: futureDate,
            endTime: new Date(futureDate.getTime() + 100),
          }),
        ],
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(false);
      expect(result.error?.code).toBe("VALIDATION_FAILED");
    });

    it("should fail spans with timestamps too far in the past", async () => {
      const pastDate = new Date(Date.now() - 48 * 60 * 60 * 1000); // 48 hours in past

      const ctx = createNormalizedContext({
        normalizedSpans: [
          createTestSpan({
            startTime: pastDate,
            endTime: new Date(pastDate.getTime() + 100),
          }),
        ],
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(false);
      expect(result.error?.code).toBe("VALIDATION_FAILED");
    });

    it("should fail spans where endTime is before startTime", async () => {
      const now = new Date();

      const ctx = createNormalizedContext({
        normalizedSpans: [
          createTestSpan({
            startTime: now,
            endTime: new Date(now.getTime() - 100), // endTime before startTime
          }),
        ],
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(false);
      expect(result.error?.code).toBe("VALIDATION_FAILED");
    });
  });

  describe("Empty Span Name Validation", () => {
    it("should fail spans with empty names", async () => {
      const ctx = createNormalizedContext({
        normalizedSpans: [createTestSpan({ name: "" })],
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(false);
      expect(result.error?.code).toBe("VALIDATION_FAILED");
    });

    it("should fail spans with whitespace-only names", async () => {
      const ctx = createNormalizedContext({
        normalizedSpans: [createTestSpan({ name: "   " })],
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(false);
      expect(result.error?.code).toBe("VALIDATION_FAILED");
    });
  });

  describe("Multiple Validation Errors", () => {
    it("should collect all validation errors", async () => {
      const ctx = createNormalizedContext({
        normalizedSpans: [
          // Span with too many attributes
          createTestSpan({
            externalSpanId: "span-1",
            attributes: Object.fromEntries(
              Array.from({ length: 100 }, (_, i) => [`attr-${i}`, "value"])
            ),
          }),
          // Span with empty name
          createTestSpan({
            externalSpanId: "span-2",
            name: "",
          }),
        ],
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(false);
      expect(result.error?.code).toBe("VALIDATION_FAILED");
      // The error details should contain multiple validation errors
      expect(result.error?.details?.errors).toBeDefined();
      expect(Array.isArray(result.error?.details?.errors)).toBe(true);
      expect((result.error?.details?.errors as unknown[]).length).toBeGreaterThan(1);
    });
  });

  describe("Handler Properties", () => {
    it("should have correct name", () => {
      expect(handler.name).toBe("ValidateHandler");
    });
  });
});
