/**
 * Normalize Handler
 *
 * Second handler in the pipeline. Responsible for:
 * 1. Converting OTLP format to normalized internal format
 * 2. Extracting resource attributes (service.name, environment)
 * 3. Computing derived fields (durationMs, etc.)
 * 4. Extracting GenAI attributes to first-class fields
 */
import {
  type OtlpExportRequest,
  type OtlpAttribute,
  type OtlpAnyValue,
  type NormalizedTrace,
  type NormalizedSpan,
  type SpanStatusCode,
  type SpanKind,
  SPAN_STATUS_CODE_MAP,
  SPAN_KIND_MAP,
  GENAI_ATTRIBUTE_KEYS,
  GENAI_ATTRIBUTE_ALIASES,
} from "@cognobserve/api/schemas";
import { logger } from "../../lib/logger.js";
import type {
  PipelineContext,
  PipelineHandler,
  HandlerResult,
} from "../types.js";

/**
 * Resource attribute keys for service identification
 */
const RESOURCE_KEYS = {
  SERVICE_NAME: "service.name",
  SERVICE_VERSION: "service.version",
  DEPLOYMENT_ENVIRONMENT: "deployment.environment",
} as const;

/**
 * Normalize Handler - Converts OTLP to internal format
 */
export class NormalizeHandler implements PipelineHandler {
  readonly name = "NormalizeHandler";

  async handle(ctx: PipelineContext): Promise<HandlerResult> {
    if (!ctx.parsedRequest) {
      logger.error("NormalizeHandler called without parsedRequest");
      return {
        continue: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Missing parsed request in pipeline context",
          httpStatus: 500,
        },
      };
    }

    const { traces, spans } = this.normalizeRequest(ctx.parsedRequest);

    ctx.normalizedTraces = traces;
    ctx.normalizedSpans = spans;

    logger.debug(
      {
        traceCount: traces.length,
        spanCount: spans.length,
      },
      "Normalized OTLP request"
    );

    return { continue: true };
  }

  /**
   * Normalize the full OTLP request
   */
  private normalizeRequest(request: OtlpExportRequest): {
    traces: NormalizedTrace[];
    spans: NormalizedSpan[];
  } {
    const traceMap = new Map<string, NormalizedTrace>();
    const spans: NormalizedSpan[] = [];

    for (const resourceSpans of request.resourceSpans) {
      // Extract resource attributes
      const resourceAttrs = this.flattenAttributes(
        resourceSpans.resource?.attributes ?? []
      );

      const serviceName = resourceAttrs[RESOURCE_KEYS.SERVICE_NAME] as
        | string
        | undefined;
      const serviceVersion = resourceAttrs[RESOURCE_KEYS.SERVICE_VERSION] as
        | string
        | undefined;
      const environment = resourceAttrs[
        RESOURCE_KEYS.DEPLOYMENT_ENVIRONMENT
      ] as string | undefined;

      for (const scopeSpans of resourceSpans.scopeSpans) {
        const libraryName = scopeSpans.scope?.name;
        const libraryVersion = scopeSpans.scope?.version;

        for (const otlpSpan of scopeSpans.spans) {
          // Normalize the span
          const normalizedSpan = this.normalizeSpan(
            otlpSpan,
            libraryName,
            libraryVersion
          );
          spans.push(normalizedSpan);

          // Get or create trace
          const traceId = otlpSpan.traceId;
          if (!traceMap.has(traceId)) {
            traceMap.set(traceId, {
              externalTraceId: traceId,
              projectId: "", // Will be set by auth handler
              serviceName,
              serviceVersion,
              environment,
              resource: resourceAttrs,
              startTime: normalizedSpan.startTime,
              spanCount: 0,
              errorCount: 0,
            });
          }

          // Update trace aggregates
          const trace = traceMap.get(traceId)!;
          trace.spanCount = (trace.spanCount ?? 0) + 1;

          if (normalizedSpan.statusCode === "ERROR") {
            trace.errorCount = (trace.errorCount ?? 0) + 1;
          }

          // Update trace start time (earliest span)
          if (normalizedSpan.startTime < trace.startTime) {
            trace.startTime = normalizedSpan.startTime;
          }

          // Update trace duration (latest end time - earliest start time)
          if (normalizedSpan.endTime && normalizedSpan.durationMs) {
            const traceEndTime = new Date(
              trace.startTime.getTime() + (trace.durationMs ?? 0)
            );
            const spanEndTime = normalizedSpan.endTime;
            if (spanEndTime > traceEndTime) {
              trace.durationMs =
                spanEndTime.getTime() - trace.startTime.getTime();
            }
          }
        }
      }
    }

    return {
      traces: Array.from(traceMap.values()),
      spans,
    };
  }

  /**
   * Normalize a single OTLP span
   */
  private normalizeSpan(
    span: OtlpExportRequest["resourceSpans"][0]["scopeSpans"][0]["spans"][0],
    libraryName?: string,
    libraryVersion?: string
  ): NormalizedSpan {
    const attributes = this.flattenAttributes(span.attributes ?? []);
    const genAiFields = this.extractGenAiFields(attributes);

    const startTime = this.nanoToDate(span.startTimeUnixNano);
    const endTime = span.endTimeUnixNano
      ? this.nanoToDate(span.endTimeUnixNano)
      : undefined;

    const durationMs =
      endTime && startTime
        ? endTime.getTime() - startTime.getTime()
        : undefined;

    return {
      externalSpanId: span.spanId,
      externalTraceId: span.traceId,
      externalParentId: span.parentSpanId,
      name: span.name,
      startTime,
      endTime,
      durationMs,
      statusCode: this.mapStatusCode(span.status?.code),
      statusMessage: span.status?.message,
      kind: this.mapSpanKind(span.kind),
      attributes,
      events: span.events,
      links: span.links,
      libraryName,
      libraryVersion,
      traceState: span.traceState,
      ...genAiFields,
    };
  }

  /**
   * Flatten OTLP attributes array to key-value object
   */
  private flattenAttributes(
    attributes: OtlpAttribute[]
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const attr of attributes) {
      result[attr.key] = this.extractValue(attr.value);
    }

    return result;
  }

  /**
   * Extract the actual value from OtlpAnyValue
   */
  private extractValue(anyValue: OtlpAnyValue): unknown {
    if (anyValue.stringValue !== undefined) return anyValue.stringValue;
    if (anyValue.boolValue !== undefined) return anyValue.boolValue;
    if (anyValue.intValue !== undefined) {
      return typeof anyValue.intValue === "number"
        ? anyValue.intValue
        : parseInt(anyValue.intValue, 10);
    }
    if (anyValue.doubleValue !== undefined) return anyValue.doubleValue;
    if (anyValue.bytesValue !== undefined) return anyValue.bytesValue;
    if (anyValue.arrayValue?.values) {
      return anyValue.arrayValue.values;
    }
    if (anyValue.kvlistValue?.values) {
      const obj: Record<string, unknown> = {};
      for (const kv of anyValue.kvlistValue.values) {
        obj[kv.key as string] = kv.value;
      }
      return obj;
    }
    return null;
  }

  /**
   * Convert nanosecond timestamp to Date
   */
  private nanoToDate(nanoStr: string): Date {
    const nanos = BigInt(nanoStr);
    const millis = Number(nanos / 1_000_000n);
    return new Date(millis);
  }

  /**
   * Map OTLP status code number to string
   */
  private mapStatusCode(code?: number): SpanStatusCode | undefined {
    if (code === undefined || code === null) return undefined;
    return SPAN_STATUS_CODE_MAP[code] ?? "UNSET";
  }

  /**
   * Map OTLP span kind number to string
   */
  private mapSpanKind(kind?: number): SpanKind | undefined {
    if (kind === undefined || kind === null) return undefined;
    return SPAN_KIND_MAP[kind] ?? "INTERNAL";
  }

  /**
   * Extract GenAI fields from attributes
   */
  private extractGenAiFields(attributes: Record<string, unknown>): {
    model?: string;
    promptTokens?: number;
    completionTokens?: number;
    input?: unknown;
    output?: unknown;
  } {
    const result: {
      model?: string;
      promptTokens?: number;
      completionTokens?: number;
      input?: unknown;
      output?: unknown;
    } = {};

    // Extract model
    result.model = this.getAttributeWithAliases(
      attributes,
      GENAI_ATTRIBUTE_KEYS.MODEL,
      GENAI_ATTRIBUTE_ALIASES[GENAI_ATTRIBUTE_KEYS.MODEL]
    ) as string | undefined;

    // Extract prompt tokens
    const promptTokens = this.getAttributeWithAliases(
      attributes,
      GENAI_ATTRIBUTE_KEYS.PROMPT_TOKENS,
      GENAI_ATTRIBUTE_ALIASES[GENAI_ATTRIBUTE_KEYS.PROMPT_TOKENS]
    );
    if (typeof promptTokens === "number") {
      result.promptTokens = promptTokens;
    }

    // Extract completion tokens
    const completionTokens = this.getAttributeWithAliases(
      attributes,
      GENAI_ATTRIBUTE_KEYS.COMPLETION_TOKENS,
      GENAI_ATTRIBUTE_ALIASES[GENAI_ATTRIBUTE_KEYS.COMPLETION_TOKENS]
    );
    if (typeof completionTokens === "number") {
      result.completionTokens = completionTokens;
    }

    // Extract prompt/completion content
    result.input = attributes[GENAI_ATTRIBUTE_KEYS.PROMPT];
    result.output = attributes[GENAI_ATTRIBUTE_KEYS.COMPLETION];

    return result;
  }

  /**
   * Get attribute value with fallback aliases
   */
  private getAttributeWithAliases(
    attributes: Record<string, unknown>,
    primaryKey: string,
    aliases?: readonly string[]
  ): unknown {
    // Try primary key first
    if (attributes[primaryKey] !== undefined) {
      return attributes[primaryKey];
    }

    // Try aliases
    if (aliases) {
      for (const alias of aliases) {
        if (attributes[alias] !== undefined) {
          return attributes[alias];
        }
      }
    }

    return undefined;
  }
}
