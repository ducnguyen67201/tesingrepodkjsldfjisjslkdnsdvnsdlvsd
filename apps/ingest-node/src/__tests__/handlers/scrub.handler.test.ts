/**
 * Scrub Handler Tests
 *
 * Tests for PII detection and scrubbing from span attributes and content.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { ScrubHandler } from "../../pipeline/handlers/scrub.handler.js";
import { createNormalizedContext } from "../helpers/mock-context.js";
import type { NormalizedSpan } from "@cognobserve/api/schemas";

describe("ScrubHandler", () => {
  let handler: ScrubHandler;

  beforeEach(() => {
    handler = new ScrubHandler();
  });

  /**
   * Create a test span with given attributes
   */
  function createSpanWithAttributes(
    attributes: Record<string, unknown>,
    overrides: Partial<NormalizedSpan> = {}
  ): NormalizedSpan {
    return {
      externalSpanId: "span123",
      externalTraceId: "trace123",
      name: "test-span",
      startTime: new Date(),
      attributes,
      ...overrides,
    };
  }

  describe("Sensitive Key Removal", () => {
    it("should remove attributes with 'password' in key", async () => {
      const ctx = createNormalizedContext({
        normalizedSpans: [
          createSpanWithAttributes({
            "user.password": "secret123",
            "http.method": "POST",
          }),
        ],
      });

      await handler.handle(ctx);

      const span = ctx.normalizedSpans![0]!;
      expect(span.attributes?.["user.password"]).toBeUndefined();
      expect(span.attributes?.["http.method"]).toBe("POST");
    });

    it("should remove attributes with 'secret' in key", async () => {
      const ctx = createNormalizedContext({
        normalizedSpans: [
          createSpanWithAttributes({
            "db.secret": "mysecret",
            "app.secret_key": "key123",
            "http.url": "https://example.com",
          }),
        ],
      });

      await handler.handle(ctx);

      const span = ctx.normalizedSpans![0]!;
      expect(span.attributes?.["db.secret"]).toBeUndefined();
      expect(span.attributes?.["app.secret_key"]).toBeUndefined();
      expect(span.attributes?.["http.url"]).toBe("https://example.com");
    });

    it("should remove attributes with 'token' in key", async () => {
      const ctx = createNormalizedContext({
        normalizedSpans: [
          createSpanWithAttributes({
            "auth.token": "bearer-xyz",
            "access_token": "abc123",
            "refresh_token": "def456",
          }),
        ],
      });

      await handler.handle(ctx);

      const span = ctx.normalizedSpans![0]!;
      expect(span.attributes?.["auth.token"]).toBeUndefined();
      expect(span.attributes?.["access_token"]).toBeUndefined();
      expect(span.attributes?.["refresh_token"]).toBeUndefined();
    });

    it("should remove attributes with 'api_key' or 'apikey' in key", async () => {
      const ctx = createNormalizedContext({
        normalizedSpans: [
          createSpanWithAttributes({
            "service.api_key": "sk-12345",
            "external_apikey": "pk-67890",
            "api-key": "key-abc",
          }),
        ],
      });

      await handler.handle(ctx);

      const span = ctx.normalizedSpans![0]!;
      expect(span.attributes?.["service.api_key"]).toBeUndefined();
      expect(span.attributes?.["external_apikey"]).toBeUndefined();
      expect(span.attributes?.["api-key"]).toBeUndefined();
    });

    it("should remove attributes with 'auth' in key", async () => {
      const ctx = createNormalizedContext({
        normalizedSpans: [
          createSpanWithAttributes({
            "user.auth_code": "123456",
            authorization: "Bearer token123",
          }),
        ],
      });

      await handler.handle(ctx);

      const span = ctx.normalizedSpans![0]!;
      expect(span.attributes?.["user.auth_code"]).toBeUndefined();
      expect(span.attributes?.["authorization"]).toBeUndefined();
    });

    it("should remove attributes with 'credential' in key", async () => {
      const ctx = createNormalizedContext({
        normalizedSpans: [
          createSpanWithAttributes({
            "db.credentials": "user:pass",
            "user_credential": "cred123",
          }),
        ],
      });

      await handler.handle(ctx);

      const span = ctx.normalizedSpans![0]!;
      expect(span.attributes?.["db.credentials"]).toBeUndefined();
      expect(span.attributes?.["user_credential"]).toBeUndefined();
    });

    it("should be case-insensitive for sensitive keys", async () => {
      const ctx = createNormalizedContext({
        normalizedSpans: [
          createSpanWithAttributes({
            PASSWORD: "secret",
            "User.PASSWORD": "another",
            API_KEY: "key123",
          }),
        ],
      });

      await handler.handle(ctx);

      const span = ctx.normalizedSpans![0]!;
      expect(span.attributes?.["PASSWORD"]).toBeUndefined();
      expect(span.attributes?.["User.PASSWORD"]).toBeUndefined();
      expect(span.attributes?.["API_KEY"]).toBeUndefined();
    });
  });

  describe("Allowlist Keys", () => {
    it("should NOT remove 'token_count' (allowlisted)", async () => {
      const ctx = createNormalizedContext({
        normalizedSpans: [
          createSpanWithAttributes({
            token_count: 150,
            token_usage: 200,
          }),
        ],
      });

      await handler.handle(ctx);

      const span = ctx.normalizedSpans![0]!;
      expect(span.attributes?.["token_count"]).toBe(150);
      expect(span.attributes?.["token_usage"]).toBe(200);
    });

    it("should NOT remove 'access_token_expires_at' (allowlisted)", async () => {
      const ctx = createNormalizedContext({
        normalizedSpans: [
          createSpanWithAttributes({
            access_token_expires_at: "2024-12-31T00:00:00Z",
          }),
        ],
      });

      await handler.handle(ctx);

      const span = ctx.normalizedSpans![0]!;
      expect(span.attributes?.["access_token_expires_at"]).toBe("2024-12-31T00:00:00Z");
    });

    it("should NOT remove 'auth_method' (allowlisted)", async () => {
      const ctx = createNormalizedContext({
        normalizedSpans: [
          createSpanWithAttributes({
            auth_method: "oauth",
          }),
        ],
      });

      await handler.handle(ctx);

      const span = ctx.normalizedSpans![0]!;
      expect(span.attributes?.["auth_method"]).toBe("oauth");
    });
  });

  describe("PII Value Redaction", () => {
    it("should redact email addresses in values", async () => {
      const ctx = createNormalizedContext({
        normalizedSpans: [
          createSpanWithAttributes({
            "user.info": "Contact user@example.com for help",
            "log.message": "Email sent to test.user@domain.org",
          }),
        ],
      });

      await handler.handle(ctx);

      const span = ctx.normalizedSpans![0]!;
      expect(span.attributes?.["user.info"]).toBe("Contact [REDACTED] for help");
      expect(span.attributes?.["log.message"]).toBe("Email sent to [REDACTED]");
    });

    it("should redact SSN patterns in values", async () => {
      const ctx = createNormalizedContext({
        normalizedSpans: [
          createSpanWithAttributes({
            "user.ssn": "123-45-6789",
            "log.message": "SSN: 987-65-4321",
          }),
        ],
      });

      await handler.handle(ctx);

      const span = ctx.normalizedSpans![0]!;
      expect(span.attributes?.["user.ssn"]).toBe("[REDACTED]");
      expect(span.attributes?.["log.message"]).toBe("SSN: [REDACTED]");
    });

    it("should redact credit card patterns in values", async () => {
      const ctx = createNormalizedContext({
        normalizedSpans: [
          createSpanWithAttributes({
            "payment.card": "1234-5678-9012-3456",
            "card_number": "1234567890123456",
          }),
        ],
      });

      await handler.handle(ctx);

      const span = ctx.normalizedSpans![0]!;
      expect(span.attributes?.["payment.card"]).toBe("[REDACTED]");
      expect(span.attributes?.["card_number"]).toBe("[REDACTED]");
    });

    it("should redact phone number patterns in values", async () => {
      const ctx = createNormalizedContext({
        normalizedSpans: [
          createSpanWithAttributes({
            "user.phone": "555-123-4567",
            "contact": "Call (555) 987-6543",
            "international": "+1 555-111-2222",
          }),
        ],
      });

      await handler.handle(ctx);

      const span = ctx.normalizedSpans![0]!;
      expect(span.attributes?.["user.phone"]).toBe("[REDACTED]");
      expect(span.attributes?.["contact"]).toBe("Call [REDACTED]");
      expect(span.attributes?.["international"]).toBe("[REDACTED]");
    });

    it("should redact IP addresses in values", async () => {
      const ctx = createNormalizedContext({
        normalizedSpans: [
          createSpanWithAttributes({
            "client.ip": "192.168.1.100",
            "log.message": "Request from 10.0.0.1 to server",
          }),
        ],
      });

      await handler.handle(ctx);

      const span = ctx.normalizedSpans![0]!;
      expect(span.attributes?.["client.ip"]).toBe("[REDACTED]");
      expect(span.attributes?.["log.message"]).toBe("Request from [REDACTED] to server");
    });

    it("should redact multiple PII patterns in single value", async () => {
      const ctx = createNormalizedContext({
        normalizedSpans: [
          createSpanWithAttributes({
            message: "User user@example.com from 192.168.1.1 called 555-123-4567",
          }),
        ],
      });

      await handler.handle(ctx);

      const span = ctx.normalizedSpans![0]!;
      expect(span.attributes?.["message"]).toBe(
        "User [REDACTED] from [REDACTED] called [REDACTED]"
      );
    });
  });

  describe("Input/Output Field Scrubbing", () => {
    it("should redact PII in input field", async () => {
      const ctx = createNormalizedContext({
        normalizedSpans: [
          createSpanWithAttributes(
            {},
            {
              input: "My email is test@example.com and phone is 555-123-4567",
            }
          ),
        ],
      });

      await handler.handle(ctx);

      const span = ctx.normalizedSpans![0]!;
      expect(span.input).toBe("My email is [REDACTED] and phone is [REDACTED]");
    });

    it("should redact PII in output field", async () => {
      const ctx = createNormalizedContext({
        normalizedSpans: [
          createSpanWithAttributes(
            {},
            {
              output: "Contact support at support@company.com",
            }
          ),
        ],
      });

      await handler.handle(ctx);

      const span = ctx.normalizedSpans![0]!;
      expect(span.output).toBe("Contact support at [REDACTED]");
    });

    it("should handle non-string input/output gracefully", async () => {
      const ctx = createNormalizedContext({
        normalizedSpans: [
          createSpanWithAttributes(
            {},
            {
              input: { messages: [{ content: "test@example.com" }] },
              output: ["response with user@test.com"],
            }
          ),
        ],
      });

      await handler.handle(ctx);

      // Should handle nested objects and arrays
      expect(ctx.normalizedSpans![0]!.input).toBeDefined();
      expect(ctx.normalizedSpans![0]!.output).toBeDefined();
    });
  });

  describe("Event Attribute Scrubbing", () => {
    it("should scrub sensitive keys from event attributes", async () => {
      const ctx = createNormalizedContext({
        normalizedSpans: [
          createSpanWithAttributes(
            {},
            {
              events: [
                {
                  timeUnixNano: "1000000000000000000",
                  name: "exception",
                  attributes: {
                    "exception.type": "Error",
                    "user.password": "leaked",
                    "user.email": "test@example.com",
                  },
                },
              ],
            }
          ),
        ],
      });

      await handler.handle(ctx);

      const span = ctx.normalizedSpans![0]!;
      const eventAttrs = (span.events?.[0] as { attributes: Record<string, unknown> })?.attributes;
      expect(eventAttrs?.["exception.type"]).toBe("Error");
      expect(eventAttrs?.["user.password"]).toBeUndefined();
      expect(eventAttrs?.["user.email"]).toBe("[REDACTED]");
    });
  });

  describe("Edge Cases", () => {
    it("should handle spans with no attributes", async () => {
      const ctx = createNormalizedContext({
        normalizedSpans: [
          createSpanWithAttributes({}),
        ],
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(true);
    });

    it("should handle spans with undefined attributes", async () => {
      const ctx = createNormalizedContext({
        normalizedSpans: [
          {
            externalSpanId: "span123",
            externalTraceId: "trace123",
            name: "test",
            startTime: new Date(),
            attributes: undefined,
          },
        ],
      });

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(true);
    });

    it("should handle multiple spans", async () => {
      const ctx = createNormalizedContext({
        normalizedSpans: [
          createSpanWithAttributes({
            password: "secret1",
            "http.url": "https://api.com",
          }),
          createSpanWithAttributes({
            api_key: "key123",
            "http.method": "GET",
          }),
        ],
      });

      await handler.handle(ctx);

      expect(ctx.normalizedSpans![0]!.attributes?.["password"]).toBeUndefined();
      expect(ctx.normalizedSpans![0]!.attributes?.["http.url"]).toBe("https://api.com");
      expect(ctx.normalizedSpans![1]!.attributes?.["api_key"]).toBeUndefined();
      expect(ctx.normalizedSpans![1]!.attributes?.["http.method"]).toBe("GET");
    });

    it("should fail if normalizedSpans is missing", async () => {
      const ctx = createNormalizedContext();
      ctx.normalizedSpans = undefined;

      const result = await handler.handle(ctx);

      expect(result.continue).toBe(false);
      expect(result.error?.code).toBe("INTERNAL_ERROR");
    });
  });

  describe("Handler Properties", () => {
    it("should have correct name", () => {
      expect(handler.name).toBe("ScrubHandler");
    });
  });
});
