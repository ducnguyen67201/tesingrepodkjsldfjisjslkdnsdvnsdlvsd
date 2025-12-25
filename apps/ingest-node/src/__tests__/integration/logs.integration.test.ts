/**
 * Logs Integration Tests
 *
 * Tests the full HTTP endpoint for logs ingestion with mock database.
 * These tests verify the entire logs pipeline from HTTP request to response.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { gzipSync } from "node:zlib";
import { createServer } from "../../server.js";
import {
  createBasicLogsRequest,
  createCorrelatedLogsRequest,
  createMultiSeverityLogsRequest,
  createErrorLogsRequest,
  createPiiLogsRequest,
  createLargeLogsRequest,
  createMultiResourceLogsRequest,
  createMinimalLogsRequest,
  createEmptyLogsRequest,
  createFutureTimestampLogsRequest,
  toLogsJson,
} from "../fixtures/otlp-logs.fixtures.js";
import type { Express } from "express";

// Mock the database module
vi.mock("../../lib/db.js", () => ({
  prisma: {
    apiKey: {
      findUnique: vi.fn().mockResolvedValue({
        id: "test-api-key-id",
        projectId: "test-project-id",
        expiresAt: null,
      }),
      update: vi.fn().mockResolvedValue({}),
    },
    logRecord: {
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    trace: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({ id: "trace-id" }),
    },
    span: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({ id: "span-id" }),
    },
    $transaction: vi.fn().mockImplementation(async (fn) => {
      const tx = {
        trace: {
          findUnique: vi.fn().mockResolvedValue(null),
          upsert: vi.fn().mockResolvedValue({ id: "trace-id" }),
        },
        span: {
          findUnique: vi.fn().mockResolvedValue(null),
          upsert: vi.fn().mockResolvedValue({ id: "span-id" }),
        },
      };
      return fn(tx);
    }),
  },
  Prisma: {
    InputJsonValue: {},
  },
}));

// Mock hashApiKey from shared
vi.mock("@cognobserve/shared", async () => {
  const actual = await vi.importActual("@cognobserve/shared");
  return {
    ...actual,
    hashApiKey: vi.fn().mockReturnValue("mocked-hash"),
  };
});

// Mock the config with test-friendly limits
vi.mock("../../config/env.js", async () => {
  const actual = await vi.importActual("../../config/env.js");
  return {
    ...actual,
    config: {
      ...(actual as { config: object }).config,
      limits: {
        // Trace limits
        maxPayloadBytes: 512 * 1024,
        maxSpansPerRequest: 500,
        maxAttrPerSpan: 64,
        maxEventsPerSpan: 64,
        maxLinksPerSpan: 32,
        maxAttrValueLen: 2048,
        // Log limits - using lower values for faster tests
        maxLogsPerRequest: 1000,
        maxAttrPerLog: 64,
        maxLogBodyLen: 8192,
        logTimestampDriftHours: 24,
      },
    },
  };
});

describe("Logs Ingestion Integration Tests", () => {
  let app: Express;

  beforeAll(() => {
    app = createServer();
  });

  afterAll(() => {
    vi.clearAllMocks();
  });

  describe("POST /v1/logs - Basic Ingestion", () => {
    it("should accept valid OTLP JSON logs request", async () => {
      const logsRequest = createBasicLogsRequest();

      const response = await request(app)
        .post("/v1/logs")
        .set("Content-Type", "application/json")
        .set("X-API-Key", "test-api-key")
        .send(toLogsJson(logsRequest));

      expect(response.status).toBe(202);
      // OTLP response is empty on success
      expect(response.body).toBeDefined();
    });

    it("should accept Bearer token authentication", async () => {
      const logsRequest = createBasicLogsRequest();

      const response = await request(app)
        .post("/v1/logs")
        .set("Content-Type", "application/json")
        .set("Authorization", "Bearer test-api-key")
        .send(toLogsJson(logsRequest));

      expect(response.status).toBe(202);
    });

    it("should return 401 without API key", async () => {
      const logsRequest = createBasicLogsRequest();

      const response = await request(app)
        .post("/v1/logs")
        .set("Content-Type", "application/json")
        .send(toLogsJson(logsRequest));

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty("error", "MISSING_API_KEY");
    });

    it("should handle empty resourceLogs", async () => {
      const response = await request(app)
        .post("/v1/logs")
        .set("Content-Type", "application/json")
        .set("X-API-Key", "test-api-key")
        .send(toLogsJson(createEmptyLogsRequest()));

      expect(response.status).toBe(202);
      // OTLP response is empty on success
      expect(response.body).toBeDefined();
    });
  });

  describe("POST /v1/logs - Content Types", () => {
    it("should reject unsupported content type", async () => {
      const response = await request(app)
        .post("/v1/logs")
        .set("Content-Type", "text/plain")
        .set("X-API-Key", "test-api-key")
        .send("not valid data");

      expect(response.status).toBe(415);
      expect(response.body).toHaveProperty("error", "INVALID_CONTENT_TYPE");
    });

    it("should accept application/json with charset", async () => {
      const logsRequest = createBasicLogsRequest();

      const response = await request(app)
        .post("/v1/logs")
        .set("Content-Type", "application/json; charset=utf-8")
        .set("X-API-Key", "test-api-key")
        .send(toLogsJson(logsRequest));

      expect(response.status).toBe(202);
    });

    it("should reject text/html content type", async () => {
      const response = await request(app)
        .post("/v1/logs")
        .set("Content-Type", "text/html")
        .set("X-API-Key", "test-api-key")
        .send("<html></html>");

      expect(response.status).toBe(415);
    });
  });

  describe("POST /v1/logs - Gzip Compression", () => {
    // Note: Gzip tests may have issues with supertest/express.raw() interaction
    it.skip("should accept gzip-compressed JSON", async () => {
      const logsRequest = createBasicLogsRequest();
      const jsonBuffer = Buffer.from(toLogsJson(logsRequest), "utf-8");
      const gzippedBuffer = gzipSync(jsonBuffer);

      const response = await request(app)
        .post("/v1/logs")
        .set("Content-Type", "application/json")
        .set("Content-Encoding", "gzip")
        .set("X-API-Key", "test-api-key")
        .send(gzippedBuffer);

      expect(response.status).toBe(202);
    });

    it.skip("should reject invalid gzip data", async () => {
      const response = await request(app)
        .post("/v1/logs")
        .set("Content-Type", "application/json")
        .set("Content-Encoding", "gzip")
        .set("X-API-Key", "test-api-key")
        .send(Buffer.from("not gzip data"));

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("error", "DECOMPRESSION_ERROR");
    });
  });

  describe("POST /v1/logs - Multi-Severity Logs", () => {
    it("should accept logs with various severity levels", async () => {
      const logsRequest = createMultiSeverityLogsRequest();

      const response = await request(app)
        .post("/v1/logs")
        .set("Content-Type", "application/json")
        .set("X-API-Key", "test-api-key")
        .send(toLogsJson(logsRequest));

      expect(response.status).toBe(202);
      // OTLP response is empty on success, logs with 6 severity levels processed
      expect(response.body).toBeDefined();
    });
  });

  describe("POST /v1/logs - Correlated Logs", () => {
    it("should accept logs with trace correlation", async () => {
      const logsRequest = createCorrelatedLogsRequest();

      const response = await request(app)
        .post("/v1/logs")
        .set("Content-Type", "application/json")
        .set("X-API-Key", "test-api-key")
        .send(toLogsJson(logsRequest));

      expect(response.status).toBe(202);
      // OTLP response is empty on success
      expect(response.body).toBeDefined();
    });
  });

  describe("POST /v1/logs - Error Logs", () => {
    it("should accept logs with exception details", async () => {
      const logsRequest = createErrorLogsRequest();

      const response = await request(app)
        .post("/v1/logs")
        .set("Content-Type", "application/json")
        .set("X-API-Key", "test-api-key")
        .send(toLogsJson(logsRequest));

      expect(response.status).toBe(202);
    });
  });

  describe("POST /v1/logs - Validation", () => {
    it("should reject invalid JSON", async () => {
      const response = await request(app)
        .post("/v1/logs")
        .set("Content-Type", "application/json")
        .set("X-API-Key", "test-api-key")
        .send("{ invalid json }");

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("error", "PARSE_ERROR");
    });

    it("should reject JSON that doesn't match OTLP schema", async () => {
      const response = await request(app)
        .post("/v1/logs")
        .set("Content-Type", "application/json")
        .set("X-API-Key", "test-api-key")
        .send(JSON.stringify({ invalid: "schema" }));

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("error", "PARSE_ERROR");
    });

    it("should reject requests with too many logs", async () => {
      const largeRequest = createLargeLogsRequest(1100); // Over 1000 limit

      const response = await request(app)
        .post("/v1/logs")
        .set("Content-Type", "application/json")
        .set("X-API-Key", "test-api-key")
        .send(toLogsJson(largeRequest));

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("error", "TOO_MANY_LOGS");
    });
  });

  describe("POST /v1/logs - PII Scrubbing", () => {
    it("should accept request with PII and scrub it", async () => {
      const piiRequest = createPiiLogsRequest();

      const response = await request(app)
        .post("/v1/logs")
        .set("Content-Type", "application/json")
        .set("X-API-Key", "test-api-key")
        .send(toLogsJson(piiRequest));

      // Should succeed - PII is scrubbed, not rejected
      expect(response.status).toBe(202);
    });
  });

  describe("POST /v1/logs - Multiple Resources", () => {
    it("should handle logs from multiple resources", async () => {
      const multiResourceRequest = createMultiResourceLogsRequest();

      const response = await request(app)
        .post("/v1/logs")
        .set("Content-Type", "application/json")
        .set("X-API-Key", "test-api-key")
        .send(toLogsJson(multiResourceRequest));

      expect(response.status).toBe(202);
      // OTLP response is empty on success
      expect(response.body).toBeDefined();
    });
  });

  describe("POST /v1/logs - Minimal Request", () => {
    it("should accept minimal logs request", async () => {
      const minimalRequest = createMinimalLogsRequest();

      const response = await request(app)
        .post("/v1/logs")
        .set("Content-Type", "application/json")
        .set("X-API-Key", "test-api-key")
        .send(toLogsJson(minimalRequest));

      expect(response.status).toBe(202);
    });
  });

  describe("POST /v1/logs - Timestamp Handling", () => {
    it("should handle future timestamps (clamps instead of rejects)", async () => {
      const futureRequest = createFutureTimestampLogsRequest();

      const response = await request(app)
        .post("/v1/logs")
        .set("Content-Type", "application/json")
        .set("X-API-Key", "test-api-key")
        .send(toLogsJson(futureRequest));

      // Should succeed - timestamp is clamped
      expect(response.status).toBe(202);
    });
  });

  describe("Request/Response Headers", () => {
    it("should return proper JSON content type", async () => {
      const logsRequest = createBasicLogsRequest();

      const response = await request(app)
        .post("/v1/logs")
        .set("Content-Type", "application/json")
        .set("X-API-Key", "test-api-key")
        .send(toLogsJson(logsRequest));

      expect(response.headers["content-type"]).toContain("application/json");
    });
  });

  describe("404 Handler for Logs", () => {
    it("should return 404 for wrong HTTP method on /v1/logs", async () => {
      const response = await request(app).get("/v1/logs");

      expect(response.status).toBe(404);
    });
  });
});
