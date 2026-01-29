import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  withTimeout,
  withQueryTimeout,
  QueryTimeoutError,
  QUERY_TIMEOUTS,
} from "../query-utils";

describe("query-utils", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("QUERY_TIMEOUTS", () => {
    it("should have correct timeout values", () => {
      expect(QUERY_TIMEOUTS.LIST).toBe(5_000);
      expect(QUERY_TIMEOUTS.DETAIL).toBe(10_000);
      expect(QUERY_TIMEOUTS.SPAN).toBe(3_000);
    });
  });

  describe("QueryTimeoutError", () => {
    it("should create error with correct message", () => {
      const error = new QueryTimeoutError("test-context", 5000);

      expect(error.message).toBe("Query timed out: test-context (5000ms)");
      expect(error.code).toBe("TIMEOUT");
    });

    it("should be an instance of TRPCError", () => {
      const error = new QueryTimeoutError("test", 1000);

      expect(error.name).toBe("TRPCError");
    });
  });

  describe("withTimeout", () => {
    it("should return result when promise resolves before timeout", async () => {
      const mockData = { id: "123", name: "test" };
      const fastPromise = Promise.resolve(mockData);

      const resultPromise = withTimeout(fastPromise, 5000, "test-query");

      // Advance time slightly (but not past timeout)
      await vi.advanceTimersByTimeAsync(100);

      const result = await resultPromise;
      expect(result).toEqual(mockData);
    });

    it("should throw QueryTimeoutError when promise times out", async () => {
      const slowPromise = new Promise((resolve) => {
        setTimeout(() => resolve("data"), 10000);
      });

      const resultPromise = withTimeout(slowPromise, 5000, "slow-query");

      // Advance time past timeout
      vi.advanceTimersByTime(5001);

      await expect(resultPromise).rejects.toThrow(QueryTimeoutError);
      await expect(resultPromise).rejects.toThrow(
        "Query timed out: slow-query (5000ms)"
      );
    });

    it("should propagate errors from the original promise", async () => {
      const errorPromise = Promise.reject(new Error("Database error"));

      const resultPromise = withTimeout(errorPromise, 5000, "error-query");

      await expect(resultPromise).rejects.toThrow("Database error");
    });

    it("should clear timeout after successful resolution", async () => {
      const clearTimeoutSpy = vi.spyOn(global, "clearTimeout");

      const fastPromise = Promise.resolve("data");
      await withTimeout(fastPromise, 5000, "test");

      expect(clearTimeoutSpy).toHaveBeenCalled();
    });

    it("should clear timeout after error", async () => {
      const clearTimeoutSpy = vi.spyOn(global, "clearTimeout");

      const errorPromise = Promise.reject(new Error("fail"));

      try {
        await withTimeout(errorPromise, 5000, "test");
      } catch {
        // Expected
      }

      expect(clearTimeoutSpy).toHaveBeenCalled();
    });
  });

  describe("withQueryTimeout", () => {
    it("should use LIST timeout for LIST type", async () => {
      const promise = Promise.resolve("data");

      const result = await withQueryTimeout(promise, "LIST");

      expect(result).toBe("data");
    });

    it("should use DETAIL timeout for DETAIL type", async () => {
      const promise = Promise.resolve("data");

      const result = await withQueryTimeout(promise, "DETAIL");

      expect(result).toBe("data");
    });

    it("should use SPAN timeout for SPAN type", async () => {
      const promise = Promise.resolve("data");

      const result = await withQueryTimeout(promise, "SPAN");

      expect(result).toBe("data");
    });

    it("should use custom context when provided", async () => {
      const slowPromise = new Promise((resolve) => {
        setTimeout(() => resolve("data"), 10000);
      });

      const resultPromise = withQueryTimeout(
        slowPromise,
        "LIST",
        "custom-context"
      );

      vi.advanceTimersByTime(5001);

      await expect(resultPromise).rejects.toThrow(
        "Query timed out: custom-context (5000ms)"
      );
    });

    it("should use type as context when not provided", async () => {
      const slowPromise = new Promise((resolve) => {
        setTimeout(() => resolve("data"), 10000);
      });

      const resultPromise = withQueryTimeout(slowPromise, "SPAN");

      vi.advanceTimersByTime(3001);

      await expect(resultPromise).rejects.toThrow(
        "Query timed out: span (3000ms)"
      );
    });
  });
});
