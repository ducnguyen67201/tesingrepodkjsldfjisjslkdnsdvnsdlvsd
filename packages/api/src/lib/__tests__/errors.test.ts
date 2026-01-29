import { describe, it, expect } from "vitest";
import { TRPCError } from "@trpc/server";
import { ERROR_CODES, createTraceError, isTraceNotFound } from "../errors";

describe("errors", () => {
  describe("ERROR_CODES", () => {
    it("should have TRACE_NOT_FOUND code", () => {
      expect(ERROR_CODES.TRACE_NOT_FOUND).toEqual({
        code: "NOT_FOUND",
        message: "Trace not found",
      });
    });

    it("should have SPAN_NOT_FOUND code", () => {
      expect(ERROR_CODES.SPAN_NOT_FOUND).toEqual({
        code: "NOT_FOUND",
        message: "Span not found",
      });
    });

    it("should have INVALID_CURSOR code", () => {
      expect(ERROR_CODES.INVALID_CURSOR).toEqual({
        code: "BAD_REQUEST",
        message: "Invalid pagination cursor",
      });
    });

    it("should have QUERY_TIMEOUT code", () => {
      expect(ERROR_CODES.QUERY_TIMEOUT).toEqual({
        code: "TIMEOUT",
        message: "Query timed out",
      });
    });

    it("should have UNAUTHORIZED code", () => {
      expect(ERROR_CODES.UNAUTHORIZED).toEqual({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    });

    it("should have FORBIDDEN code", () => {
      expect(ERROR_CODES.FORBIDDEN).toEqual({
        code: "FORBIDDEN",
        message: "Access denied",
      });
    });

    it("should have VALIDATION_ERROR code", () => {
      expect(ERROR_CODES.VALIDATION_ERROR).toEqual({
        code: "BAD_REQUEST",
        message: "Validation failed",
      });
    });
  });

  describe("createTraceError", () => {
    it("should create TRPCError with correct code and message", () => {
      const error = createTraceError("TRACE_NOT_FOUND");

      expect(error).toBeInstanceOf(TRPCError);
      expect(error.code).toBe("NOT_FOUND");
      expect(error.message).toBe("Trace not found");
    });

    it("should include details as cause when provided", () => {
      const details = { traceId: "123", projectId: "456" };
      const error = createTraceError("TRACE_NOT_FOUND", details);

      // TRPCError wraps cause in UnknownCauseError, check properties exist
      expect(error.cause).toBeDefined();
      expect((error.cause as unknown as Record<string, unknown>).traceId).toBe("123");
      expect((error.cause as unknown as Record<string, unknown>).projectId).toBe("456");
    });

    it("should create different errors for different keys", () => {
      const notFoundError = createTraceError("TRACE_NOT_FOUND");
      const timeoutError = createTraceError("QUERY_TIMEOUT");
      const forbiddenError = createTraceError("FORBIDDEN");

      expect(notFoundError.code).toBe("NOT_FOUND");
      expect(timeoutError.code).toBe("TIMEOUT");
      expect(forbiddenError.code).toBe("FORBIDDEN");
    });
  });

  describe("isTraceNotFound", () => {
    it("should return true for NOT_FOUND TRPCError", () => {
      const error = new TRPCError({
        code: "NOT_FOUND",
        message: "Not found",
      });

      expect(isTraceNotFound(error)).toBe(true);
    });

    it("should return true for createTraceError TRACE_NOT_FOUND", () => {
      const error = createTraceError("TRACE_NOT_FOUND");

      expect(isTraceNotFound(error)).toBe(true);
    });

    it("should return true for createTraceError SPAN_NOT_FOUND", () => {
      const error = createTraceError("SPAN_NOT_FOUND");

      expect(isTraceNotFound(error)).toBe(true);
    });

    it("should return false for other TRPCError codes", () => {
      const timeoutError = new TRPCError({
        code: "TIMEOUT",
        message: "Timeout",
      });
      const forbiddenError = new TRPCError({
        code: "FORBIDDEN",
        message: "Forbidden",
      });

      expect(isTraceNotFound(timeoutError)).toBe(false);
      expect(isTraceNotFound(forbiddenError)).toBe(false);
    });

    it("should return false for non-TRPCError", () => {
      const regularError = new Error("Not found");
      const nullValue = null;
      const undefinedValue = undefined;
      const stringValue = "error";

      expect(isTraceNotFound(regularError)).toBe(false);
      expect(isTraceNotFound(nullValue)).toBe(false);
      expect(isTraceNotFound(undefinedValue)).toBe(false);
      expect(isTraceNotFound(stringValue)).toBe(false);
    });
  });
});
