/**
 * OTLP Test Fixtures
 *
 * Sample OTLP payloads for testing the ingestion pipeline.
 */
import type { OtlpExportRequest } from "@cognobserve/api/schemas";

/**
 * Generate a random hex string of given length
 */
export function randomHex(length: number): string {
  const chars = "0123456789abcdef";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

/**
 * Generate a trace ID (32 hex chars)
 */
export function generateTraceId(): string {
  return randomHex(32);
}

/**
 * Generate a span ID (16 hex chars)
 */
export function generateSpanId(): string {
  return randomHex(16);
}

/**
 * Convert Date to nanosecond string (OTLP format)
 */
export function dateToNanoString(date: Date): string {
  return (BigInt(date.getTime()) * 1_000_000n).toString();
}

/**
 * Create a basic OTLP span
 */
export function createOtlpSpan(overrides: {
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  name?: string;
  kind?: number;
  startTime?: Date;
  endTime?: Date;
  statusCode?: number;
  statusMessage?: string;
  attributes?: Array<{ key: string; value: { stringValue?: string; intValue?: string; doubleValue?: number; boolValue?: boolean } }>;
  events?: Array<{ timeUnixNano: string; name: string; attributes?: Array<{ key: string; value: { stringValue?: string } }> }>;
} = {}) {
  const now = new Date();
  const startTime = overrides.startTime ?? now;
  const endTime = overrides.endTime ?? new Date(now.getTime() + 100);

  return {
    traceId: overrides.traceId ?? generateTraceId(),
    spanId: overrides.spanId ?? generateSpanId(),
    parentSpanId: overrides.parentSpanId,
    name: overrides.name ?? "test-span",
    kind: overrides.kind ?? 1,
    startTimeUnixNano: dateToNanoString(startTime),
    endTimeUnixNano: dateToNanoString(endTime),
    status: {
      code: overrides.statusCode ?? 1,
      message: overrides.statusMessage,
    },
    attributes: overrides.attributes ?? [],
    events: overrides.events,
  };
}

/**
 * Create a basic OTLP export request with one resource and one span
 */
export function createBasicOtlpRequest(overrides: {
  serviceName?: string;
  serviceVersion?: string;
  environment?: string;
  spans?: ReturnType<typeof createOtlpSpan>[];
} = {}): OtlpExportRequest {
  const spans = overrides.spans ?? [createOtlpSpan()];

  return {
    resourceSpans: [
      {
        resource: {
          attributes: [
            {
              key: "service.name",
              value: { stringValue: overrides.serviceName ?? "test-service" },
            },
            {
              key: "service.version",
              value: { stringValue: overrides.serviceVersion ?? "1.0.0" },
            },
            {
              key: "deployment.environment",
              value: { stringValue: overrides.environment ?? "test" },
            },
          ],
        },
        scopeSpans: [
          {
            scope: {
              name: "@opentelemetry/instrumentation-test",
              version: "1.0.0",
            },
            spans,
          },
        ],
      },
    ],
  };
}

/**
 * Create an OTLP request with GenAI attributes
 */
export function createGenAiOtlpRequest(): OtlpExportRequest {
  const traceId = generateTraceId();
  const rootSpanId = generateSpanId();
  const llmSpanId = generateSpanId();

  return {
    resourceSpans: [
      {
        resource: {
          attributes: [
            { key: "service.name", value: { stringValue: "ai-service" } },
          ],
        },
        scopeSpans: [
          {
            scope: {
              name: "@opentelemetry/instrumentation-openai",
              version: "0.1.0",
            },
            spans: [
              // Root span
              createOtlpSpan({
                traceId,
                spanId: rootSpanId,
                name: "chat-completion",
                kind: 2, // SERVER
                statusCode: 1, // OK
              }),
              // LLM span with GenAI attributes
              createOtlpSpan({
                traceId,
                spanId: llmSpanId,
                parentSpanId: rootSpanId,
                name: "openai.chat.completions",
                kind: 3, // CLIENT
                statusCode: 1, // OK
                attributes: [
                  { key: "gen_ai.request.model", value: { stringValue: "gpt-4" } },
                  { key: "gen_ai.usage.input_tokens", value: { intValue: "150" } },
                  { key: "gen_ai.usage.output_tokens", value: { intValue: "50" } },
                  { key: "gen_ai.prompt", value: { stringValue: "Hello, world!" } },
                  { key: "gen_ai.completion", value: { stringValue: "Hi there!" } },
                ],
              }),
            ],
          },
        ],
      },
    ],
  };
}

/**
 * Create an OTLP request with error spans
 */
export function createErrorOtlpRequest(): OtlpExportRequest {
  const traceId = generateTraceId();

  return {
    resourceSpans: [
      {
        resource: {
          attributes: [
            { key: "service.name", value: { stringValue: "error-service" } },
          ],
        },
        scopeSpans: [
          {
            spans: [
              createOtlpSpan({
                traceId,
                name: "failing-operation",
                statusCode: 2, // ERROR
                statusMessage: "Something went wrong",
                events: [
                  {
                    timeUnixNano: dateToNanoString(new Date()),
                    name: "exception",
                    attributes: [
                      { key: "exception.type", value: { stringValue: "Error" } },
                      { key: "exception.message", value: { stringValue: "Test error" } },
                    ],
                  },
                ],
              }),
            ],
          },
        ],
      },
    ],
  };
}

/**
 * Create a large OTLP request with many spans
 */
export function createLargeOtlpRequest(spanCount: number): OtlpExportRequest {
  const traceId = generateTraceId();
  const spans = [];

  for (let i = 0; i < spanCount; i++) {
    spans.push(
      createOtlpSpan({
        traceId,
        name: `span-${i}`,
        attributes: [
          { key: "span.index", value: { intValue: i.toString() } },
        ],
      })
    );
  }

  return {
    resourceSpans: [
      {
        resource: {
          attributes: [
            { key: "service.name", value: { stringValue: "large-service" } },
          ],
        },
        scopeSpans: [{ spans }],
      },
    ],
  };
}

/**
 * Create an OTLP request with PII data for scrubbing tests
 */
export function createPiiOtlpRequest(): OtlpExportRequest {
  return createBasicOtlpRequest({
    serviceName: "pii-service",
    spans: [
      createOtlpSpan({
        name: "pii-span",
        attributes: [
          // Sensitive keys that should be removed
          { key: "user.password", value: { stringValue: "secret123" } },
          { key: "api_key", value: { stringValue: "sk-12345" } },
          { key: "auth_token", value: { stringValue: "bearer-xyz" } },
          // Safe keys with PII values that should be redacted
          { key: "user.email", value: { stringValue: "test@example.com" } },
          { key: "user.phone", value: { stringValue: "555-123-4567" } },
          { key: "user.ssn", value: { stringValue: "123-45-6789" } },
          // Safe keys with safe values
          { key: "http.method", value: { stringValue: "POST" } },
          { key: "http.status_code", value: { intValue: "200" } },
        ],
      }),
    ],
  });
}

/**
 * Create an OTLP request with invalid timestamps
 */
export function createInvalidTimestampOtlpRequest(): OtlpExportRequest {
  const traceId = generateTraceId();
  const futureDate = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours in future

  return {
    resourceSpans: [
      {
        resource: {
          attributes: [
            { key: "service.name", value: { stringValue: "invalid-service" } },
          ],
        },
        scopeSpans: [
          {
            spans: [
              createOtlpSpan({
                traceId,
                name: "future-span",
                startTime: futureDate,
                endTime: new Date(futureDate.getTime() + 100),
              }),
            ],
          },
        ],
      },
    ],
  };
}

/**
 * Create an OTLP request with multiple traces
 */
export function createMultiTraceOtlpRequest(traceCount: number): OtlpExportRequest {
  const allSpans = [];

  for (let i = 0; i < traceCount; i++) {
    const traceId = generateTraceId();
    allSpans.push(
      createOtlpSpan({
        traceId,
        name: `root-span-${i}`,
        statusCode: i % 3 === 0 ? 2 : 1, // Every 3rd trace has error
      })
    );
    // Add a child span
    allSpans.push(
      createOtlpSpan({
        traceId,
        parentSpanId: allSpans[allSpans.length - 1].spanId,
        name: `child-span-${i}`,
        statusCode: 1,
      })
    );
  }

  return {
    resourceSpans: [
      {
        resource: {
          attributes: [
            { key: "service.name", value: { stringValue: "multi-trace-service" } },
          ],
        },
        scopeSpans: [{ spans: allSpans }],
      },
    ],
  };
}

/**
 * Create an OTLP JSON string
 */
export function toOtlpJson(request: OtlpExportRequest): string {
  return JSON.stringify(request);
}

/**
 * Create an OTLP JSON buffer
 */
export function toOtlpJsonBuffer(request: OtlpExportRequest): Buffer {
  return Buffer.from(toOtlpJson(request), "utf-8");
}
