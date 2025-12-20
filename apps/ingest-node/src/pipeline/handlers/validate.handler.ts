/**
 * Validate Handler
 *
 * Third handler in the pipeline. Responsible for:
 * 1. Validating request limits (spans, attributes, events, links)
 * 2. Enforcing size constraints
 * 3. Validating timestamp sanity
 */
import { config } from "../../config/env.js";
import { logger } from "../../lib/logger.js";
import { metrics } from "../../lib/metrics.js";
import type {
  PipelineContext,
  PipelineHandler,
  HandlerResult,
} from "../types.js";
import { PipelineErrorCodes } from "../types.js";
import type { NormalizedSpan } from "@cognobserve/api/schemas";

/** Validation error details */
interface ValidationError {
  spanId: string;
  field: string;
  message: string;
}

/** Maximum timestamp drift (24 hours in ms) */
const MAX_TIMESTAMP_DRIFT_MS = 24 * 60 * 60 * 1000;

/**
 * Validate Handler - Validates request limits
 */
export class ValidateHandler implements PipelineHandler {
  readonly name = "ValidateHandler";

  async handle(ctx: PipelineContext): Promise<HandlerResult> {
    if (!ctx.normalizedSpans) {
      logger.error("ValidateHandler called without normalizedSpans");
      return {
        continue: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Missing normalized spans in pipeline context",
          httpStatus: 500,
        },
      };
    }

    // Validate payload size first (before processing spans)
    const payloadSize = ctx.rawBody.length;
    if (payloadSize > config.limits.maxPayloadBytes) {
      logger.warn(
        { payloadSize, max: config.limits.maxPayloadBytes },
        "Payload too large"
      );
      metrics.rejectCounter.inc({ reason: "payload_too_large" });

      return {
        continue: false,
        error: {
          code: PipelineErrorCodes.PAYLOAD_TOO_LARGE,
          message: `Payload size ${payloadSize} bytes exceeds maximum ${config.limits.maxPayloadBytes} bytes`,
          httpStatus: 413,
          details: { payloadSize, maxAllowed: config.limits.maxPayloadBytes },
        },
      };
    }

    // Validate span count
    const spanCount = ctx.normalizedSpans.length;
    if (spanCount > config.limits.maxSpansPerRequest) {
      logger.warn(
        { spanCount, max: config.limits.maxSpansPerRequest },
        "Too many spans in request"
      );
      metrics.rejectCounter.inc({ reason: "too_many_spans" });

      return {
        continue: false,
        error: {
          code: PipelineErrorCodes.TOO_MANY_SPANS,
          message: `Request contains ${spanCount} spans, maximum allowed is ${config.limits.maxSpansPerRequest}`,
          httpStatus: 400,
          details: { spanCount, maxAllowed: config.limits.maxSpansPerRequest },
        },
      };
    }

    // Validate each span
    const validationErrors: ValidationError[] = [];
    const now = Date.now();

    for (const span of ctx.normalizedSpans) {
      this.validateSpan(span, now, validationErrors);
    }

    // If there are validation errors, reject the request
    if (validationErrors.length > 0) {
      logger.warn(
        { errorCount: validationErrors.length, errors: validationErrors.slice(0, 5) },
        "Span validation failed"
      );
      metrics.rejectCounter.inc({ reason: "validation_failed" });

      return {
        continue: false,
        error: {
          code: PipelineErrorCodes.VALIDATION_FAILED,
          message: `Validation failed for ${validationErrors.length} span(s)`,
          httpStatus: 400,
          details: {
            errorCount: validationErrors.length,
            errors: validationErrors.slice(0, 10), // Limit to first 10 errors
          },
        },
      };
    }

    // Record payload size metric
    metrics.payloadSize.observe(payloadSize);

    ctx.validationPassed = true;

    logger.debug(
      { spanCount, payloadSize },
      "Request validation passed"
    );

    return { continue: true };
  }

  /**
   * Validate a single span
   */
  private validateSpan(
    span: NormalizedSpan,
    nowMs: number,
    errors: ValidationError[]
  ): void {
    const spanId = span.externalSpanId;

    // Validate attribute count
    const attrCount = Object.keys(span.attributes ?? {}).length;
    if (attrCount > config.limits.maxAttrPerSpan) {
      errors.push({
        spanId,
        field: "attributes",
        message: `Too many attributes: ${attrCount} (max: ${config.limits.maxAttrPerSpan})`,
      });
    }

    // Validate event count
    const eventCount = span.events?.length ?? 0;
    if (eventCount > config.limits.maxEventsPerSpan) {
      errors.push({
        spanId,
        field: "events",
        message: `Too many events: ${eventCount} (max: ${config.limits.maxEventsPerSpan})`,
      });
    }

    // Validate link count
    const linkCount = span.links?.length ?? 0;
    if (linkCount > config.limits.maxLinksPerSpan) {
      errors.push({
        spanId,
        field: "links",
        message: `Too many links: ${linkCount} (max: ${config.limits.maxLinksPerSpan})`,
      });
    }

    // Validate attribute value lengths
    if (span.attributes) {
      for (const [key, value] of Object.entries(span.attributes)) {
        if (typeof value === "string" && value.length > config.limits.maxAttrValueLen) {
          errors.push({
            spanId,
            field: `attributes.${key}`,
            message: `Attribute value too long: ${value.length} chars (max: ${config.limits.maxAttrValueLen})`,
          });
        }
      }
    }

    // Validate timestamp sanity
    const startTimeMs = span.startTime.getTime();
    const drift = Math.abs(nowMs - startTimeMs);
    if (drift > MAX_TIMESTAMP_DRIFT_MS) {
      errors.push({
        spanId,
        field: "startTime",
        message: `Timestamp too far from current time: ${Math.round(drift / 3600000)}h drift`,
      });
    }

    // Validate end time is after start time
    if (span.endTime && span.endTime < span.startTime) {
      errors.push({
        spanId,
        field: "endTime",
        message: "End time cannot be before start time",
      });
    }

    // Validate span name is not empty
    if (!span.name || span.name.trim().length === 0) {
      errors.push({
        spanId,
        field: "name",
        message: "Span name cannot be empty",
      });
    }
  }
}
