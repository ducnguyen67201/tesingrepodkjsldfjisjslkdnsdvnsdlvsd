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
  type SpanType,
  SPAN_STATUS_CODE_MAP,
  SPAN_KIND_MAP,
  GENAI_ATTRIBUTE_KEYS,
  GENAI_ATTRIBUTE_ALIASES,
  HTTP_ATTRIBUTE_KEYS,
  DB_ATTRIBUTE_KEYS,
  RPC_ATTRIBUTE_KEYS,
  EXCEPTION_ATTRIBUTE_KEYS,
  GENAI_EXTENDED_KEYS,
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
              // V2: Initialize new fields
              hasError: false,
              hasException: false,
              spanTypes: [],
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

    // V2: After processing all spans, compute trace aggregates
    const spansByTrace = this.groupSpansByTraceId(spans);
    for (const trace of traceMap.values()) {
      const traceSpans = spansByTrace.get(trace.externalTraceId) ?? [];
      this.computeTraceAggregates(trace, traceSpans);
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

    // V2: Extract semantic convention fields
    const httpFields = this.extractHttpFields(attributes);
    const dbFields = this.extractDbFields(attributes);
    const rpcFields = this.extractRpcFields(attributes);
    const exceptionFields = this.extractExceptionFields(span.events);
    const genAiExtended = this.extractGenAiExtendedFields(attributes);

    const startTime = this.nanoToDate(span.startTimeUnixNano);
    const endTime = span.endTimeUnixNano
      ? this.nanoToDate(span.endTimeUnixNano)
      : undefined;

    const durationMs =
      endTime && startTime
        ? endTime.getTime() - startTime.getTime()
        : undefined;

    const normalizedSpan: NormalizedSpan = {
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
      // V2: Add extracted fields
      ...httpFields,
      ...dbFields,
      ...rpcFields,
      ...exceptionFields,
      ...genAiExtended,
    };

    // V2: Infer span type
    normalizedSpan.spanType = this.inferSpanType(normalizedSpan);

    // V2: Build search text
    normalizedSpan.searchText = this.buildSpanSearchText(normalizedSpan);

    return normalizedSpan;
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

  // ============================================================
  // V2: HTTP Field Extraction
  // ============================================================

  /**
   * Extract HTTP fields from span attributes
   */
  private extractHttpFields(attributes: Record<string, unknown>): {
    httpMethod?: string;
    httpRoute?: string;
    httpStatusCode?: number;
    httpUrl?: string;
  } {
    const result: {
      httpMethod?: string;
      httpRoute?: string;
      httpStatusCode?: number;
      httpUrl?: string;
    } = {};

    // Method (prefer new convention)
    const method =
      attributes[HTTP_ATTRIBUTE_KEYS.REQUEST_METHOD] ??
      attributes[HTTP_ATTRIBUTE_KEYS.METHOD];
    if (typeof method === "string") {
      result.httpMethod = method;
    }

    // Route
    const route = attributes[HTTP_ATTRIBUTE_KEYS.ROUTE];
    if (typeof route === "string") {
      result.httpRoute = route;
    }

    // Status code (prefer new convention)
    const statusCode =
      attributes[HTTP_ATTRIBUTE_KEYS.RESPONSE_STATUS_CODE] ??
      attributes[HTTP_ATTRIBUTE_KEYS.STATUS_CODE];
    if (typeof statusCode === "number") {
      result.httpStatusCode = statusCode;
    }

    // URL (prefer full URL, truncate to 2048)
    const url =
      attributes[HTTP_ATTRIBUTE_KEYS.URL_FULL] ??
      attributes[HTTP_ATTRIBUTE_KEYS.URL];
    if (typeof url === "string") {
      result.httpUrl = url.slice(0, 2048);
    }

    return result;
  }

  // ============================================================
  // V2: Database Field Extraction
  // ============================================================

  /**
   * Extract database fields from span attributes
   */
  private extractDbFields(attributes: Record<string, unknown>): {
    dbSystem?: string;
    dbName?: string;
    dbOperation?: string;
    dbStatement?: string;
    dbCollection?: string;
  } {
    const result: {
      dbSystem?: string;
      dbName?: string;
      dbOperation?: string;
      dbStatement?: string;
      dbCollection?: string;
    } = {};

    const system = attributes[DB_ATTRIBUTE_KEYS.SYSTEM];
    if (typeof system === "string") {
      result.dbSystem = system;
    }

    const name = attributes[DB_ATTRIBUTE_KEYS.NAME];
    if (typeof name === "string") {
      result.dbName = name;
    }

    const operation = attributes[DB_ATTRIBUTE_KEYS.OPERATION];
    if (typeof operation === "string") {
      result.dbOperation = operation;
    }

    // Statement (prefer db.statement, fallback to db.query.text, truncate to 4096)
    const statement =
      attributes[DB_ATTRIBUTE_KEYS.STATEMENT] ??
      attributes[DB_ATTRIBUTE_KEYS.QUERY_TEXT];
    if (typeof statement === "string") {
      result.dbStatement = statement.slice(0, 4096);
    }

    const collection = attributes[DB_ATTRIBUTE_KEYS.COLLECTION_NAME];
    if (typeof collection === "string") {
      result.dbCollection = collection;
    }

    return result;
  }

  // ============================================================
  // V2: RPC Field Extraction
  // ============================================================

  /**
   * Extract RPC fields from span attributes
   */
  private extractRpcFields(attributes: Record<string, unknown>): {
    rpcSystem?: string;
    rpcService?: string;
    rpcMethod?: string;
    rpcStatusCode?: number;
  } {
    const result: {
      rpcSystem?: string;
      rpcService?: string;
      rpcMethod?: string;
      rpcStatusCode?: number;
    } = {};

    const system = attributes[RPC_ATTRIBUTE_KEYS.SYSTEM];
    if (typeof system === "string") {
      result.rpcSystem = system;
    }

    const service = attributes[RPC_ATTRIBUTE_KEYS.SERVICE];
    if (typeof service === "string") {
      result.rpcService = service;
    }

    const method = attributes[RPC_ATTRIBUTE_KEYS.METHOD];
    if (typeof method === "string") {
      result.rpcMethod = method;
    }

    // Status code (prefer gRPC code)
    const statusCode =
      attributes[RPC_ATTRIBUTE_KEYS.GRPC_STATUS_CODE] ??
      attributes[RPC_ATTRIBUTE_KEYS.RESPONSE_STATUS_CODE];
    if (typeof statusCode === "number") {
      result.rpcStatusCode = statusCode;
    }

    return result;
  }

  // ============================================================
  // V2: Exception Field Extraction
  // ============================================================

  /**
   * Extract exception fields from span events
   */
  private extractExceptionFields(events: unknown[] | undefined): {
    exceptionType?: string;
    exceptionMessage?: string;
  } {
    if (!events || !Array.isArray(events)) return {};

    // Find exception event
    for (const event of events) {
      if (typeof event !== "object" || event === null) continue;
      const e = event as {
        name?: string;
        attributes?: Array<{ key: string; value: unknown }>;
      };

      if (e.name === "exception" && e.attributes) {
        const attrs = this.flattenAttributes(
          e.attributes as OtlpAttribute[]
        );
        const result: { exceptionType?: string; exceptionMessage?: string } =
          {};

        const type = attrs[EXCEPTION_ATTRIBUTE_KEYS.TYPE];
        if (typeof type === "string") {
          result.exceptionType = type;
        }

        const message = attrs[EXCEPTION_ATTRIBUTE_KEYS.MESSAGE];
        if (typeof message === "string") {
          result.exceptionMessage = message.slice(0, 1024);
        }

        return result;
      }
    }

    return {};
  }

  // ============================================================
  // V2: GenAI Extended Field Extraction
  // ============================================================

  /**
   * Extract extended GenAI fields from span attributes
   */
  private extractGenAiExtendedFields(attributes: Record<string, unknown>): {
    genAiOperation?: string;
    genAiProvider?: string;
  } {
    const result: { genAiOperation?: string; genAiProvider?: string } = {};

    const operation = attributes[GENAI_EXTENDED_KEYS.OPERATION_NAME];
    if (typeof operation === "string") {
      result.genAiOperation = operation;
    }

    const provider = attributes[GENAI_EXTENDED_KEYS.PROVIDER_NAME];
    if (typeof provider === "string") {
      result.genAiProvider = provider;
    }

    return result;
  }

  // ============================================================
  // V2: Span Type Inference
  // ============================================================

  /**
   * Infer span type from extracted fields and attributes
   */
  private inferSpanType(span: NormalizedSpan): SpanType {
    // LLM takes priority
    if (span.model || span.genAiOperation || span.genAiProvider) {
      return "LLM";
    }

    // HTTP
    if (span.httpMethod || span.httpRoute || span.httpStatusCode) {
      return "HTTP";
    }

    // DB
    if (span.dbSystem || span.dbOperation) {
      return "DB";
    }

    // RPC
    if (span.rpcSystem || span.rpcService) {
      return "RPC";
    }

    // Function (check attributes)
    const attrs = span.attributes as Record<string, unknown> | undefined;
    if (attrs?.["code.function"] || attrs?.["code.namespace"]) {
      return "FUNCTION";
    }

    return "CUSTOM";
  }

  // ============================================================
  // V2: Search Text Building
  // ============================================================

  /**
   * Build search text for a span (for full-text search)
   */
  private buildSpanSearchText(span: NormalizedSpan): string {
    const parts: string[] = [];

    // Always include span name
    parts.push(span.name);

    // Include model for LLM spans
    if (span.model) parts.push(span.model);

    // Include HTTP route/method
    if (span.httpRoute) parts.push(span.httpRoute);
    if (span.httpMethod) parts.push(span.httpMethod);

    // Include DB operation/system
    if (span.dbSystem) parts.push(span.dbSystem);
    if (span.dbOperation) parts.push(span.dbOperation);

    // Include RPC service/method
    if (span.rpcService) parts.push(span.rpcService);
    if (span.rpcMethod) parts.push(span.rpcMethod);

    // Include exception info
    if (span.exceptionType) parts.push(span.exceptionType);
    if (span.exceptionMessage) parts.push(span.exceptionMessage);

    // Include status message for errors
    if (span.statusMessage) parts.push(span.statusMessage);

    return parts.filter(Boolean).join(" ");
  }

  // ============================================================
  // V2: Trace Aggregates Computation
  // ============================================================

  /**
   * Compute trace-level aggregates from spans
   */
  private computeTraceAggregates(
    trace: NormalizedTrace,
    spans: NormalizedSpan[]
  ): void {
    // Find root span (no parent or parent not in this trace)
    const spanIds = new Set(spans.map((s) => s.externalSpanId));
    const rootSpan = spans.find(
      (s) => !s.externalParentId || !spanIds.has(s.externalParentId)
    );

    if (rootSpan) {
      trace.rootSpanId = rootSpan.externalSpanId;
      trace.rootSpanName = rootSpan.name;
      trace.rootSpanKind = rootSpan.kind;
      trace.rootSpanStatusCode = rootSpan.statusCode;
      trace.rootSpanDurationMs = rootSpan.durationMs;
    }

    // Compute hasError
    trace.hasError = spans.some((s) => s.statusCode === "ERROR");

    // Compute hasException
    trace.hasException = spans.some((s) => s.exceptionType !== undefined);

    // Compute spanTypes (unique types)
    const types = new Set<string>();
    for (const span of spans) {
      if (span.spanType) types.add(span.spanType);
    }
    trace.spanTypes = Array.from(types);

    // Build trace search text
    const searchParts: string[] = [];
    if (trace.serviceName) searchParts.push(trace.serviceName);
    if (trace.environment) searchParts.push(trace.environment);
    if (rootSpan?.name) searchParts.push(rootSpan.name);

    // Include unique span names (limited)
    const spanNames = [...new Set(spans.map((s) => s.name))].slice(0, 10);
    searchParts.push(...spanNames);

    // Include models
    const models = [
      ...new Set(spans.map((s) => s.model).filter(Boolean)),
    ] as string[];
    searchParts.push(...models);

    // Include error messages
    const errorMessages = spans
      .filter((s) => s.statusCode === "ERROR" && s.statusMessage)
      .map((s) => s.statusMessage!)
      .slice(0, 3);
    searchParts.push(...errorMessages);

    trace.searchText = searchParts.join(" ");
  }

  /**
   * Group spans by trace ID
   */
  private groupSpansByTraceId(
    spans: NormalizedSpan[]
  ): Map<string, NormalizedSpan[]> {
    const grouped = new Map<string, NormalizedSpan[]>();
    for (const span of spans) {
      const existing = grouped.get(span.externalTraceId);
      if (existing) {
        existing.push(span);
      } else {
        grouped.set(span.externalTraceId, [span]);
      }
    }
    return grouped;
  }
}
