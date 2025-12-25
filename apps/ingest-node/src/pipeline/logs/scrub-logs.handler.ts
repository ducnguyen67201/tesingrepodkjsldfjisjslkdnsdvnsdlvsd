/**
 * Scrub Logs Handler
 *
 * Redacts PII from log records:
 * - Scrubs sensitive patterns from bodyText
 * - Scrubs sensitive attribute values
 * - Removes sensitive attribute keys
 */
import { logger } from "../../lib/logger.js";
import type {
  LogsPipelineContext,
  LogsPipelineHandler,
  LogsHandlerResult,
} from "./types.js";

/**
 * Patterns to redact from log content
 */
const SENSITIVE_PATTERNS = [
  // Email addresses
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  // Credit card numbers (basic pattern)
  /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g,
  // API keys (common patterns)
  /\b(sk-|pk-|api[_-]?key[=:]\s*)[a-zA-Z0-9_-]{20,}/gi,
  // Bearer tokens
  /bearer\s+[a-zA-Z0-9._-]+/gi,
  // JWT tokens
  /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g,
  // Phone numbers (US format)
  /\b\d{3}[- ]?\d{3}[- ]?\d{4}\b/g,
  // SSN
  /\b\d{3}[- ]?\d{2}[- ]?\d{4}\b/g,
];

/**
 * Attribute keys to completely remove
 */
const SENSITIVE_KEYS = new Set([
  "password",
  "passwd",
  "secret",
  "token",
  "api_key",
  "apikey",
  "api-key",
  "authorization",
  "auth",
  "credential",
  "credentials",
  "private_key",
  "privatekey",
  "private-key",
  "access_token",
  "refresh_token",
  "bearer",
  "cookie",
  "session",
  "ssn",
  "social_security",
  "credit_card",
  "creditcard",
  "cvv",
  "cvc",
]);

const REDACTED = "[REDACTED]";

/**
 * Scrub Logs Handler - Redacts PII from logs
 */
export class ScrubLogsHandler implements LogsPipelineHandler {
  readonly name = "ScrubLogsHandler";

  async handle(ctx: LogsPipelineContext): Promise<LogsHandlerResult> {
    if (!ctx.normalizedLogs) {
      return {
        continue: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "No normalized logs in context",
          httpStatus: 500,
        },
      };
    }

    let scrubbedCount = 0;

    for (const log of ctx.normalizedLogs) {
      // Scrub body text
      if (log.bodyText) {
        const scrubbed = this.scrubString(log.bodyText);
        if (scrubbed !== log.bodyText) {
          log.bodyText = scrubbed;
          scrubbedCount++;
        }
      }

      // Scrub attributes
      if (log.attributes) {
        const [scrubbedAttrs, wasModified] = this.scrubAttributes(
          log.attributes
        );
        if (wasModified) {
          log.attributes = scrubbedAttrs;
          scrubbedCount++;
        }
      }
    }

    if (scrubbedCount > 0) {
      logger.debug({ scrubbedCount }, "Scrubbed PII from logs");
    }

    return { continue: true };
  }

  /**
   * Scrub sensitive patterns from a string
   */
  private scrubString(str: string): string {
    let result = str;
    for (const pattern of SENSITIVE_PATTERNS) {
      result = result.replace(pattern, REDACTED);
    }
    return result;
  }

  /**
   * Scrub sensitive data from attributes
   * Returns [scrubbedAttrs, wasModified]
   */
  private scrubAttributes(
    attrs: Record<string, unknown>
  ): [Record<string, unknown>, boolean] {
    const result: Record<string, unknown> = {};
    let wasModified = false;

    for (const [key, value] of Object.entries(attrs)) {
      const lowerKey = key.toLowerCase();

      // Remove completely if sensitive key
      if (SENSITIVE_KEYS.has(lowerKey)) {
        result[key] = REDACTED;
        wasModified = true;
        continue;
      }

      // Scrub string values
      if (typeof value === "string") {
        const scrubbed = this.scrubString(value);
        if (scrubbed !== value) {
          result[key] = scrubbed;
          wasModified = true;
        } else {
          result[key] = value;
        }
      } else if (typeof value === "object" && value !== null) {
        // Recursively scrub nested objects
        const [scrubbedNested, nestedModified] = this.scrubAttributes(
          value as Record<string, unknown>
        );
        result[key] = scrubbedNested;
        if (nestedModified) wasModified = true;
      } else {
        result[key] = value;
      }
    }

    return [result, wasModified];
  }
}
