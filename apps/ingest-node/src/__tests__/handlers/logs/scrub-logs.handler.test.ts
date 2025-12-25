/**
 * Scrub Logs Handler Tests
 *
 * Tests for the handler that redacts PII from log records.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ScrubLogsHandler } from "../../../pipeline/logs/scrub-logs.handler.js";
import {
  createMockLogsPipelineContext,
  createNormalizedLogRecord,
} from "../../helpers/mock-logs-context.js";

// Mock the logger
vi.mock("../../../lib/logger.js", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("ScrubLogsHandler", () => {
  let handler: ScrubLogsHandler;

  beforeEach(() => {
    handler = new ScrubLogsHandler();
    vi.clearAllMocks();
  });

  describe("Basic Scrubbing", () => {
    it("should pass logs without PII unchanged", async () => {
      const ctx = createMockLogsPipelineContext({
        normalizedLogs: [
          createNormalizedLogRecord({
            bodyText: "Normal log message without PII",
            attributes: {
              "http.method": "GET",
              "http.status_code": 200,
            },
          }),
        ],
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(true);
      expect(ctx.normalizedLogs![0]!.bodyText).toBe(
        "Normal log message without PII"
      );
    });

    it("should return error if no normalized logs in context", async () => {
      const ctx = createMockLogsPipelineContext({
        normalizedLogs: undefined,
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(false);
      expect(result.error?.code).toBe("INTERNAL_ERROR");
    });

    it("should handle empty logs array", async () => {
      const ctx = createMockLogsPipelineContext({
        normalizedLogs: [],
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(true);
    });
  });

  describe("Email Scrubbing", () => {
    it("should redact email addresses in body", async () => {
      const ctx = createMockLogsPipelineContext({
        normalizedLogs: [
          createNormalizedLogRecord({
            bodyText: "User john.doe@example.com logged in",
          }),
        ],
      });

      await handler.handle(ctx);

      expect(ctx.normalizedLogs![0]!.bodyText).toBe(
        "User [REDACTED] logged in"
      );
    });

    it("should redact multiple email addresses", async () => {
      const ctx = createMockLogsPipelineContext({
        normalizedLogs: [
          createNormalizedLogRecord({
            bodyText:
              "Email from alice@test.org to bob@company.net was processed",
          }),
        ],
      });

      await handler.handle(ctx);

      expect(ctx.normalizedLogs![0]!.bodyText).toBe(
        "Email from [REDACTED] to [REDACTED] was processed"
      );
    });

    it("should redact email in attributes", async () => {
      const ctx = createMockLogsPipelineContext({
        normalizedLogs: [
          createNormalizedLogRecord({
            attributes: {
              "user.email": "test@example.com",
            },
          }),
        ],
      });

      await handler.handle(ctx);

      expect(ctx.normalizedLogs![0]!.attributes!["user.email"]).toBe(
        "[REDACTED]"
      );
    });
  });

  describe("Credit Card Scrubbing", () => {
    it("should redact credit card numbers with dashes", async () => {
      const ctx = createMockLogsPipelineContext({
        normalizedLogs: [
          createNormalizedLogRecord({
            bodyText: "Payment with card 4111-1111-1111-1111 processed",
          }),
        ],
      });

      await handler.handle(ctx);

      expect(ctx.normalizedLogs![0]!.bodyText).toBe(
        "Payment with card [REDACTED] processed"
      );
    });

    it("should redact credit card numbers with spaces", async () => {
      const ctx = createMockLogsPipelineContext({
        normalizedLogs: [
          createNormalizedLogRecord({
            bodyText: "Card number: 4111 1111 1111 1111",
          }),
        ],
      });

      await handler.handle(ctx);

      expect(ctx.normalizedLogs![0]!.bodyText).toBe("Card number: [REDACTED]");
    });

    it("should redact credit card numbers without separators", async () => {
      const ctx = createMockLogsPipelineContext({
        normalizedLogs: [
          createNormalizedLogRecord({
            bodyText: "CC: 4111111111111111",
          }),
        ],
      });

      await handler.handle(ctx);

      expect(ctx.normalizedLogs![0]!.bodyText).toBe("CC: [REDACTED]");
    });
  });

  describe("API Key Scrubbing", () => {
    it("should redact sk- prefixed API keys", async () => {
      const ctx = createMockLogsPipelineContext({
        normalizedLogs: [
          createNormalizedLogRecord({
            bodyText: "Using API key sk-1234567890abcdefghijklmnop",
          }),
        ],
      });

      await handler.handle(ctx);

      expect(ctx.normalizedLogs![0]!.bodyText).toBe(
        "Using API key [REDACTED]"
      );
    });

    it("should redact pk- prefixed API keys", async () => {
      const ctx = createMockLogsPipelineContext({
        normalizedLogs: [
          createNormalizedLogRecord({
            bodyText: "Public key: pk-abcdefghij1234567890xyz",
          }),
        ],
      });

      await handler.handle(ctx);

      expect(ctx.normalizedLogs![0]!.bodyText).toBe("Public key: [REDACTED]");
    });

    it("should redact api_key= patterns", async () => {
      const ctx = createMockLogsPipelineContext({
        normalizedLogs: [
          createNormalizedLogRecord({
            bodyText: "Request with api_key=abc123def456ghi789jkl012mno",
          }),
        ],
      });

      await handler.handle(ctx);

      expect(ctx.normalizedLogs![0]!.bodyText).toContain("[REDACTED]");
    });
  });

  describe("Bearer Token Scrubbing", () => {
    it("should redact bearer tokens", async () => {
      const ctx = createMockLogsPipelineContext({
        normalizedLogs: [
          createNormalizedLogRecord({
            bodyText: "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.token",
          }),
        ],
      });

      await handler.handle(ctx);

      expect(ctx.normalizedLogs![0]!.bodyText).toContain("[REDACTED]");
    });
  });

  describe("JWT Token Scrubbing", () => {
    it("should redact JWT tokens", async () => {
      const jwt =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
      const ctx = createMockLogsPipelineContext({
        normalizedLogs: [
          createNormalizedLogRecord({
            bodyText: `Token: ${jwt}`,
          }),
        ],
      });

      await handler.handle(ctx);

      expect(ctx.normalizedLogs![0]!.bodyText).toBe("Token: [REDACTED]");
    });
  });

  describe("Phone Number Scrubbing", () => {
    it("should redact US phone numbers with dashes", async () => {
      const ctx = createMockLogsPipelineContext({
        normalizedLogs: [
          createNormalizedLogRecord({
            bodyText: "Contact: 555-123-4567",
          }),
        ],
      });

      await handler.handle(ctx);

      expect(ctx.normalizedLogs![0]!.bodyText).toBe("Contact: [REDACTED]");
    });

    it("should redact phone numbers with spaces", async () => {
      const ctx = createMockLogsPipelineContext({
        normalizedLogs: [
          createNormalizedLogRecord({
            bodyText: "Phone: 555 123 4567",
          }),
        ],
      });

      await handler.handle(ctx);

      expect(ctx.normalizedLogs![0]!.bodyText).toBe("Phone: [REDACTED]");
    });
  });

  describe("SSN Scrubbing", () => {
    it("should redact SSN with dashes", async () => {
      const ctx = createMockLogsPipelineContext({
        normalizedLogs: [
          createNormalizedLogRecord({
            bodyText: "SSN: 123-45-6789",
          }),
        ],
      });

      await handler.handle(ctx);

      expect(ctx.normalizedLogs![0]!.bodyText).toBe("SSN: [REDACTED]");
    });

    it("should redact SSN with spaces", async () => {
      const ctx = createMockLogsPipelineContext({
        normalizedLogs: [
          createNormalizedLogRecord({
            bodyText: "Social: 123 45 6789",
          }),
        ],
      });

      await handler.handle(ctx);

      expect(ctx.normalizedLogs![0]!.bodyText).toBe("Social: [REDACTED]");
    });
  });

  describe("Sensitive Attribute Keys", () => {
    it("should redact password attribute", async () => {
      const ctx = createMockLogsPipelineContext({
        normalizedLogs: [
          createNormalizedLogRecord({
            attributes: { password: "secret123" },
          }),
        ],
      });

      await handler.handle(ctx);

      expect(ctx.normalizedLogs![0]!.attributes!["password"]).toBe(
        "[REDACTED]"
      );
    });

    it("should redact secret attribute", async () => {
      const ctx = createMockLogsPipelineContext({
        normalizedLogs: [
          createNormalizedLogRecord({
            attributes: { secret: "mysecret" },
          }),
        ],
      });

      await handler.handle(ctx);

      expect(ctx.normalizedLogs![0]!.attributes!["secret"]).toBe("[REDACTED]");
    });

    it("should redact token attribute", async () => {
      const ctx = createMockLogsPipelineContext({
        normalizedLogs: [
          createNormalizedLogRecord({
            attributes: { token: "abc123" },
          }),
        ],
      });

      await handler.handle(ctx);

      expect(ctx.normalizedLogs![0]!.attributes!["token"]).toBe("[REDACTED]");
    });

    it("should redact api_key attribute", async () => {
      const ctx = createMockLogsPipelineContext({
        normalizedLogs: [
          createNormalizedLogRecord({
            attributes: { api_key: "key123" },
          }),
        ],
      });

      await handler.handle(ctx);

      expect(ctx.normalizedLogs![0]!.attributes!["api_key"]).toBe("[REDACTED]");
    });

    it("should redact authorization attribute", async () => {
      const ctx = createMockLogsPipelineContext({
        normalizedLogs: [
          createNormalizedLogRecord({
            attributes: { authorization: "Bearer xyz" },
          }),
        ],
      });

      await handler.handle(ctx);

      expect(ctx.normalizedLogs![0]!.attributes!["authorization"]).toBe(
        "[REDACTED]"
      );
    });

    it("should redact cookie attribute", async () => {
      const ctx = createMockLogsPipelineContext({
        normalizedLogs: [
          createNormalizedLogRecord({
            attributes: { cookie: "session=abc123" },
          }),
        ],
      });

      await handler.handle(ctx);

      expect(ctx.normalizedLogs![0]!.attributes!["cookie"]).toBe("[REDACTED]");
    });

    it("should redact session attribute", async () => {
      const ctx = createMockLogsPipelineContext({
        normalizedLogs: [
          createNormalizedLogRecord({
            attributes: { session: "session-id-xyz" },
          }),
        ],
      });

      await handler.handle(ctx);

      expect(ctx.normalizedLogs![0]!.attributes!["session"]).toBe("[REDACTED]");
    });

    it("should handle case-insensitive key matching", async () => {
      const ctx = createMockLogsPipelineContext({
        normalizedLogs: [
          createNormalizedLogRecord({
            attributes: {
              PASSWORD: "secret1",
              Password: "secret2",
              API_KEY: "key1",
            },
          }),
        ],
      });

      await handler.handle(ctx);

      expect(ctx.normalizedLogs![0]!.attributes!["PASSWORD"]).toBe(
        "[REDACTED]"
      );
      expect(ctx.normalizedLogs![0]!.attributes!["Password"]).toBe(
        "[REDACTED]"
      );
      expect(ctx.normalizedLogs![0]!.attributes!["API_KEY"]).toBe("[REDACTED]");
    });

    it("should redact all sensitive key variants", async () => {
      const ctx = createMockLogsPipelineContext({
        normalizedLogs: [
          createNormalizedLogRecord({
            attributes: {
              passwd: "pass1",
              credential: "cred1",
              credentials: "cred2",
              private_key: "pk1",
              privatekey: "pk2",
              access_token: "at1",
              refresh_token: "rt1",
              bearer: "b1",
              ssn: "123456789",
              social_security: "987654321",
              credit_card: "4111111111111111",
              creditcard: "4111111111111112",
              cvv: "123",
              cvc: "456",
            },
          }),
        ],
      });

      await handler.handle(ctx);

      const attrs = ctx.normalizedLogs![0]!.attributes!;
      expect(Object.values(attrs).every((v) => v === "[REDACTED]")).toBe(true);
    });
  });

  describe("Nested Attributes", () => {
    it("should scrub nested object attributes", async () => {
      const ctx = createMockLogsPipelineContext({
        normalizedLogs: [
          createNormalizedLogRecord({
            attributes: {
              user: {
                email: "test@example.com",
                password: "secret",
              },
            },
          }),
        ],
      });

      await handler.handle(ctx);

      const user = ctx.normalizedLogs![0]!.attributes!["user"] as Record<
        string,
        unknown
      >;
      expect(user["email"]).toBe("[REDACTED]");
      expect(user["password"]).toBe("[REDACTED]");
    });

    it("should handle deeply nested attributes", async () => {
      const ctx = createMockLogsPipelineContext({
        normalizedLogs: [
          createNormalizedLogRecord({
            attributes: {
              level1: {
                level2: {
                  password: "secret",
                  safe: "value",
                },
              },
            },
          }),
        ],
      });

      await handler.handle(ctx);

      const level1 = ctx.normalizedLogs![0]!.attributes!["level1"] as Record<
        string,
        unknown
      >;
      const level2 = level1["level2"] as Record<string, unknown>;
      expect(level2["password"]).toBe("[REDACTED]");
      expect(level2["safe"]).toBe("value");
    });
  });

  describe("Multiple Logs Scrubbing", () => {
    it("should scrub all logs in request", async () => {
      const ctx = createMockLogsPipelineContext({
        normalizedLogs: [
          createNormalizedLogRecord({
            bodyText: "User alice@test.com logged in",
          }),
          createNormalizedLogRecord({
            bodyText: "Card 4111-1111-1111-1111 charged",
          }),
          createNormalizedLogRecord({
            attributes: { password: "secret" },
          }),
        ],
      });

      await handler.handle(ctx);

      expect(ctx.normalizedLogs![0]!.bodyText).toContain("[REDACTED]");
      expect(ctx.normalizedLogs![1]!.bodyText).toContain("[REDACTED]");
      expect(ctx.normalizedLogs![2]!.attributes!["password"]).toBe(
        "[REDACTED]"
      );
    });
  });

  describe("Edge Cases", () => {
    it("should handle log without bodyText", async () => {
      const ctx = createMockLogsPipelineContext({
        normalizedLogs: [
          createNormalizedLogRecord({
            bodyText: undefined,
            attributes: { key: "value" },
          }),
        ],
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(true);
    });

    it("should handle log without attributes", async () => {
      const ctx = createMockLogsPipelineContext({
        normalizedLogs: [
          createNormalizedLogRecord({
            bodyText: "test@example.com",
            attributes: undefined,
          }),
        ],
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(true);
      expect(ctx.normalizedLogs![0]!.bodyText).toBe("[REDACTED]");
    });

    it("should handle non-string attribute values", async () => {
      const ctx = createMockLogsPipelineContext({
        normalizedLogs: [
          createNormalizedLogRecord({
            attributes: {
              count: 42,
              enabled: true,
              ratio: 3.14,
            },
          }),
        ],
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(true);
      expect(ctx.normalizedLogs![0]!.attributes!["count"]).toBe(42);
      expect(ctx.normalizedLogs![0]!.attributes!["enabled"]).toBe(true);
      expect(ctx.normalizedLogs![0]!.attributes!["ratio"]).toBe(3.14);
    });

    it("should preserve safe data while scrubbing PII", async () => {
      const ctx = createMockLogsPipelineContext({
        normalizedLogs: [
          createNormalizedLogRecord({
            bodyText:
              "User test@example.com with ID 12345 accessed resource /api/data",
            attributes: {
              "http.method": "GET",
              "http.url": "/api/data",
              "user.id": "12345",
              password: "secret",
            },
          }),
        ],
      });

      await handler.handle(ctx);

      const log = ctx.normalizedLogs![0]!;
      expect(log.bodyText).toContain("ID 12345");
      expect(log.bodyText).toContain("/api/data");
      expect(log.bodyText).toContain("[REDACTED]");
      expect(log.attributes!["http.method"]).toBe("GET");
      expect(log.attributes!["http.url"]).toBe("/api/data");
      expect(log.attributes!["user.id"]).toBe("12345");
      expect(log.attributes!["password"]).toBe("[REDACTED]");
    });
  });
});
