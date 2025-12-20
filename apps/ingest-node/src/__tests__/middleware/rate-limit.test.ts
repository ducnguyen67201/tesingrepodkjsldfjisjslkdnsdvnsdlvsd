/**
 * Rate Limit Middleware Tests
 *
 * Tests for token bucket rate limiting algorithm.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import type { Request, Response, NextFunction } from "express";

// We need to mock the config before importing the middleware
vi.mock("../../config/env.js", () => ({
  config: {
    rateLimit: {
      rps: 10, // 10 requests per second for testing
      burst: 20, // 20 burst capacity
    },
    logging: {
      level: "error",
    },
    server: {
      isDev: false,
    },
  },
}));

// Import after mocking
const { rateLimitMiddleware, getRateLimitStatus } = await import(
  "../../middleware/rate-limit.js"
);

describe("Rate Limit Middleware", () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response> & {
    _statusCode: number;
    _headers: Record<string, string>;
    _body: unknown;
  };
  let mockNext: NextFunction;

  beforeEach(() => {
    vi.useFakeTimers();

    mockReq = {
      headers: {},
      ip: "127.0.0.1",
      socket: { remoteAddress: "127.0.0.1" } as Request["socket"],
    };

    mockRes = {
      _statusCode: 200,
      _headers: {},
      _body: undefined,
      status(code: number) {
        this._statusCode = code;
        return this as unknown as Response;
      },
      json(body: unknown) {
        this._body = body;
        return this as unknown as Response;
      },
      setHeader(name: string, value: string) {
        this._headers[name] = value;
        return this as unknown as Response;
      },
    };

    mockNext = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe("Request Identification", () => {
    it("should use API key for identification when present in X-API-Key header", () => {
      mockReq.headers = { "x-api-key": "sk-test-key-12345678" };

      rateLimitMiddleware(
        mockReq as Request,
        mockRes as unknown as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();

      // Check that the status was retrieved using the key prefix (first 16 chars)
      const status = getRateLimitStatus("key:sk-test-key-1234");
      expect(status).not.toBeNull();
    });

    it("should use Bearer token for identification when present", () => {
      mockReq.headers = { authorization: "Bearer sk-bearer-token-123" };

      rateLimitMiddleware(
        mockReq as Request,
        mockRes as unknown as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
    });

    it("should fallback to IP address when no API key present", () => {
      mockReq.ip = "192.168.1.100";

      rateLimitMiddleware(
        mockReq as Request,
        mockRes as unknown as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();

      const status = getRateLimitStatus("ip:192.168.1.100");
      expect(status).not.toBeNull();
    });

    it("should use socket remoteAddress if req.ip is undefined", () => {
      mockReq.ip = undefined;
      (mockReq.socket as { remoteAddress: string }).remoteAddress = "10.0.0.1";

      rateLimitMiddleware(
        mockReq as Request,
        mockRes as unknown as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe("Token Bucket Algorithm", () => {
    it("should allow requests within burst limit", () => {
      mockReq.headers = { "x-api-key": "burst-test-key" };

      // Make burst number of requests (20)
      for (let i = 0; i < 20; i++) {
        mockNext = vi.fn();
        rateLimitMiddleware(
          mockReq as Request,
          mockRes as unknown as Response,
          mockNext
        );
        expect(mockNext).toHaveBeenCalled();
      }
    });

    it("should reject requests exceeding burst limit", () => {
      mockReq.headers = { "x-api-key": "burst-exceed-key" };

      // Exhaust burst capacity
      for (let i = 0; i < 20; i++) {
        mockNext = vi.fn();
        rateLimitMiddleware(
          mockReq as Request,
          mockRes as unknown as Response,
          mockNext
        );
      }

      // Next request should be rejected
      mockNext = vi.fn();
      rateLimitMiddleware(
        mockReq as Request,
        mockRes as unknown as Response,
        mockNext
      );

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRes._statusCode).toBe(429);
    });

    it("should refill tokens over time", () => {
      mockReq.headers = { "x-api-key": "refill-test-key" };

      // Exhaust burst capacity
      for (let i = 0; i < 20; i++) {
        mockNext = vi.fn();
        rateLimitMiddleware(
          mockReq as Request,
          mockRes as unknown as Response,
          mockNext
        );
      }

      // Wait for 1 second (should refill 10 tokens at 10 RPS)
      vi.advanceTimersByTime(1000);

      // Should be able to make more requests
      let successCount = 0;
      for (let i = 0; i < 15; i++) {
        mockNext = vi.fn();
        rateLimitMiddleware(
          mockReq as Request,
          mockRes as unknown as Response,
          mockNext
        );
        if (mockNext.mock.calls.length > 0) {
          successCount++;
        }
      }

      expect(successCount).toBeGreaterThan(0);
    });

    it("should not exceed burst limit when refilling", () => {
      mockReq.headers = { "x-api-key": "burst-limit-key-abc" };

      // Make a few requests
      for (let i = 0; i < 5; i++) {
        mockNext = vi.fn();
        rateLimitMiddleware(
          mockReq as Request,
          mockRes as unknown as Response,
          mockNext
        );
      }

      // Wait a long time (would refill way more than burst)
      vi.advanceTimersByTime(60000); // 1 minute = 600 tokens at 10 RPS

      // Should still only have burst capacity (20) - key prefix is first 16 chars
      const status = getRateLimitStatus("key:burst-limit-key-");
      expect(status?.tokens).toBeLessThanOrEqual(20);
    });
  });

  describe("Rate Limit Response", () => {
    it("should return 429 status code when rate limited", () => {
      mockReq.headers = { "x-api-key": "rate-limit-response-key" };

      // Exhaust tokens
      for (let i = 0; i < 21; i++) {
        mockNext = vi.fn();
        rateLimitMiddleware(
          mockReq as Request,
          mockRes as unknown as Response,
          mockNext
        );
      }

      expect(mockRes._statusCode).toBe(429);
    });

    it("should include Retry-After header", () => {
      mockReq.headers = { "x-api-key": "retry-after-key" };

      // Exhaust tokens
      for (let i = 0; i < 21; i++) {
        mockNext = vi.fn();
        rateLimitMiddleware(
          mockReq as Request,
          mockRes as unknown as Response,
          mockNext
        );
      }

      expect(mockRes._headers["Retry-After"]).toBeDefined();
      expect(parseInt(mockRes._headers["Retry-After"])).toBeGreaterThan(0);
    });

    it("should include rate limit headers", () => {
      mockReq.headers = { "x-api-key": "rate-headers-key" };

      // Exhaust tokens
      for (let i = 0; i < 21; i++) {
        mockNext = vi.fn();
        rateLimitMiddleware(
          mockReq as Request,
          mockRes as unknown as Response,
          mockNext
        );
      }

      expect(mockRes._headers["X-RateLimit-Limit"]).toBe("10");
      expect(mockRes._headers["X-RateLimit-Remaining"]).toBe("0");
      expect(mockRes._headers["X-RateLimit-Reset"]).toBeDefined();
    });

    it("should return error body with RATE_LIMITED code", () => {
      mockReq.headers = { "x-api-key": "error-body-key" };

      // Exhaust tokens
      for (let i = 0; i < 21; i++) {
        mockNext = vi.fn();
        rateLimitMiddleware(
          mockReq as Request,
          mockRes as unknown as Response,
          mockNext
        );
      }

      expect(mockRes._body).toEqual({
        error: "RATE_LIMITED",
        message: expect.any(String),
        retryAfter: expect.any(Number),
      });
    });
  });

  describe("getRateLimitStatus", () => {
    it("should return null for unknown identifier", () => {
      const status = getRateLimitStatus("unknown:identifier");
      expect(status).toBeNull();
    });

    it("should return status for known identifier", () => {
      mockReq.headers = { "x-api-key": "status-test-key-abc" };

      // Make some requests
      for (let i = 0; i < 5; i++) {
        mockNext = vi.fn();
        rateLimitMiddleware(
          mockReq as Request,
          mockRes as unknown as Response,
          mockNext
        );
      }

      // Key prefix is first 16 chars of "status-test-key-abc"
      const status = getRateLimitStatus("key:status-test-key-");
      expect(status).not.toBeNull();
      expect(status?.tokens).toBeLessThan(20);
      expect(status?.limit).toBe(10);
      expect(status?.burst).toBe(20);
    });
  });

  describe("Different Identifiers", () => {
    it("should track rate limits separately per identifier", () => {
      // First user exhausts their limit
      mockReq.headers = { "x-api-key": "user1-separate-key" };
      for (let i = 0; i < 21; i++) {
        mockNext = vi.fn();
        rateLimitMiddleware(
          mockReq as Request,
          mockRes as unknown as Response,
          mockNext
        );
      }
      expect(mockRes._statusCode).toBe(429);

      // Second user should still be allowed
      mockReq.headers = { "x-api-key": "user2-separate-key" };
      mockRes._statusCode = 200;
      mockNext = vi.fn();
      rateLimitMiddleware(
        mockReq as Request,
        mockRes as unknown as Response,
        mockNext
      );
      expect(mockNext).toHaveBeenCalled();
    });
  });
});
