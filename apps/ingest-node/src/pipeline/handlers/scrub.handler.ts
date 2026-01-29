/**
 * Scrub Handler (PII Scrubbing)
 *
 * Handler for removing/redacting sensitive data from spans.
 * Runs after validation, before persistence.
 *
 * Features:
 * 1. Removes attributes with sensitive keys (passwords, tokens, etc.)
 * 2. Redacts values matching sensitive patterns (emails, SSNs, etc.)
 * 3. Configurable allowlist for safe attribute keys
 */
import { logger } from "../../lib/logger.js";
import { metrics } from "../../lib/metrics.js";
import type {
  PipelineContext,
  PipelineHandler,
  HandlerResult,
} from "../types.js";

/**
 * Patterns for detecting sensitive attribute keys
 * These attributes will be completely removed
 */
const SENSITIVE_KEY_PATTERNS: RegExp[] = [
  /password/i,
  /passwd/i,
  /secret/i,
  /token/i,
  /api[_-]?key/i,
  /auth/i,
  /credential/i,
  /private[_-]?key/i,
  /access[_-]?key/i,
  /session[_-]?id/i,
  /cookie/i,
  /jwt/i,
  /bearer/i,
];

/**
 * Keys that are safe even if they match sensitive patterns
 */
const ALLOWLIST_KEYS = new Set([
  "access_token_expires_at",
  "token_count",
  "token_usage",
  "auth_method", // e.g., "oauth", "api_key" (the method name, not the key itself)
  "session_duration",
]);

/**
 * Patterns for detecting PII values that should be redacted
 */
const PII_VALUE_PATTERNS: Array<{ pattern: RegExp; type: string }> = [
  // Email addresses
  { pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, type: "email" },
  // US Social Security Numbers
  { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, type: "ssn" },
  // Credit card numbers (basic pattern)
  { pattern: /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g, type: "credit_card" },
  // Phone numbers (various formats) - uses lookahead/lookbehind for proper boundary matching
  { pattern: /(?<![0-9])(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}(?![0-9])/g, type: "phone" },
  // IP addresses (when they appear in values)
  { pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, type: "ip_address" },
];

/** Redaction placeholder */
const REDACTED = "[REDACTED]";

/**
 * Scrub Handler - Removes/redacts PII from spans
 */
export class ScrubHandler implements PipelineHandler {
  readonly name = "ScrubHandler";

  async handle(ctx: PipelineContext): Promise<HandlerResult> {
    if (!ctx.normalizedSpans) {
      logger.error("ScrubHandler called without normalizedSpans");
      return {
        continue: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Missing normalized spans in pipeline context",
          httpStatus: 500,
        },
      };
    }

    let scrubbedKeyCount = 0;
    let redactedValueCount = 0;

    // Process each span
    for (const span of ctx.normalizedSpans) {
      // Scrub attributes
      if (span.attributes) {
        const result = this.scrubAttributes(span.attributes);
        scrubbedKeyCount += result.removedKeys;
        redactedValueCount += result.redactedValues;
        span.attributes = result.scrubbed;
      }

      // Scrub input/output fields (GenAI content)
      if (span.input) {
        const result = this.scrubValue(span.input);
        if (result.wasRedacted) redactedValueCount++;
        span.input = result.value;
      }

      if (span.output) {
        const result = this.scrubValue(span.output);
        if (result.wasRedacted) redactedValueCount++;
        span.output = result.value;
      }

      // Scrub events
      if (span.events && Array.isArray(span.events)) {
        for (const event of span.events) {
          if (event && typeof event === "object" && "attributes" in event) {
            const eventAttrs = event.attributes as Record<string, unknown> | undefined;
            if (eventAttrs) {
              const result = this.scrubAttributes(eventAttrs);
              scrubbedKeyCount += result.removedKeys;
              redactedValueCount += result.redactedValues;
              (event as { attributes: Record<string, unknown> }).attributes = result.scrubbed;
            }
          }
        }
      }
    }

    // Record metrics
    if (scrubbedKeyCount > 0 || redactedValueCount > 0) {
      logger.debug(
        { scrubbedKeys: scrubbedKeyCount, redactedValues: redactedValueCount },
        "PII scrubbing completed"
      );
      metrics.rejectCounter.inc({ reason: "pii_scrubbed" }, scrubbedKeyCount + redactedValueCount);
    }

    return { continue: true };
  }

  /**
   * Scrub sensitive keys and redact PII values from attributes
   */
  private scrubAttributes(
    attributes: Record<string, unknown>
  ): { scrubbed: Record<string, unknown>; removedKeys: number; redactedValues: number } {
    const scrubbed: Record<string, unknown> = {};
    let removedKeys = 0;
    let redactedValues = 0;

    for (const [key, value] of Object.entries(attributes)) {
      // Check if key matches sensitive patterns
      if (this.isSensitiveKey(key)) {
        removedKeys++;
        continue; // Remove the entire attribute
      }

      // Redact PII in string values
      if (typeof value === "string") {
        const result = this.redactPiiInString(value);
        scrubbed[key] = result.value;
        if (result.wasRedacted) redactedValues++;
      } else {
        scrubbed[key] = value;
      }
    }

    return { scrubbed, removedKeys, redactedValues };
  }

  /**
   * Check if an attribute key matches sensitive patterns
   */
  private isSensitiveKey(key: string): boolean {
    // Check allowlist first
    if (ALLOWLIST_KEYS.has(key)) {
      return false;
    }

    // Check against sensitive patterns
    return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
  }

  /**
   * Redact PII patterns in a string value
   */
  private redactPiiInString(value: string): { value: string; wasRedacted: boolean } {
    let result = value;
    let wasRedacted = false;

    for (const { pattern } of PII_VALUE_PATTERNS) {
      // Reset pattern state (for global patterns)
      pattern.lastIndex = 0;
      if (pattern.test(result)) {
        wasRedacted = true;
        pattern.lastIndex = 0;
        result = result.replace(pattern, REDACTED);
      }
    }

    return { value: result, wasRedacted };
  }

  /**
   * Scrub an arbitrary value (used for input/output fields)
   */
  private scrubValue(value: unknown): { value: unknown; wasRedacted: boolean } {
    if (typeof value === "string") {
      return this.redactPiiInString(value);
    }

    if (Array.isArray(value)) {
      let wasRedacted = false;
      const scrubbedArray = value.map((item) => {
        const result = this.scrubValue(item);
        if (result.wasRedacted) wasRedacted = true;
        return result.value;
      });
      return { value: scrubbedArray, wasRedacted };
    }

    if (value && typeof value === "object") {
      let wasRedacted = false;
      const scrubbedObj: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value)) {
        if (this.isSensitiveKey(key)) {
          wasRedacted = true;
          continue;
        }
        const result = this.scrubValue(val);
        if (result.wasRedacted) wasRedacted = true;
        scrubbedObj[key] = result.value;
      }
      return { value: scrubbedObj, wasRedacted };
    }

    return { value, wasRedacted: false };
  }
}
