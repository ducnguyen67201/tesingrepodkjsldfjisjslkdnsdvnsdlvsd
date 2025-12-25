/**
 * OTLP Logs Test Fixtures
 *
 * Sample OTLP log payloads for testing the logs ingestion pipeline.
 */
import type { OtlpLogsExportRequest } from "@cognobserve/api/schemas";

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
 * Severity numbers as per OTLP spec
 */
export const SEVERITY_NUMBERS = {
  TRACE: 1,
  DEBUG: 5,
  INFO: 9,
  WARN: 13,
  ERROR: 17,
  FATAL: 21,
} as const;

/**
 * Create a basic OTLP log record
 */
export function createOtlpLogRecord(overrides: {
  timeUnixNano?: string;
  observedTimeUnixNano?: string;
  severityNumber?: number;
  severityText?: string;
  body?: { stringValue?: string; intValue?: string; boolValue?: boolean };
  attributes?: Array<{
    key: string;
    value: {
      stringValue?: string;
      intValue?: string;
      doubleValue?: number;
      boolValue?: boolean;
    };
  }>;
  traceId?: string;
  spanId?: string;
  flags?: number;
  droppedAttributesCount?: number;
} = {}) {
  const now = new Date();

  return {
    timeUnixNano: overrides.timeUnixNano ?? dateToNanoString(now),
    observedTimeUnixNano:
      overrides.observedTimeUnixNano ?? dateToNanoString(now),
    severityNumber: overrides.severityNumber ?? SEVERITY_NUMBERS.INFO,
    severityText: overrides.severityText ?? "INFO",
    body: overrides.body ?? { stringValue: "Test log message" },
    attributes: overrides.attributes ?? [],
    traceId: overrides.traceId,
    spanId: overrides.spanId,
    flags: overrides.flags,
    droppedAttributesCount: overrides.droppedAttributesCount,
  };
}

/**
 * Create a basic OTLP logs export request
 */
export function createBasicLogsRequest(overrides: {
  serviceName?: string;
  serviceVersion?: string;
  environment?: string;
  scopeName?: string;
  scopeVersion?: string;
  logRecords?: ReturnType<typeof createOtlpLogRecord>[];
} = {}): OtlpLogsExportRequest {
  const logRecords = overrides.logRecords ?? [createOtlpLogRecord()];

  return {
    resourceLogs: [
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
        scopeLogs: [
          {
            scope: {
              name: overrides.scopeName ?? "test-scope",
              version: overrides.scopeVersion ?? "1.0.0",
            },
            logRecords,
          },
        ],
      },
    ],
  };
}

/**
 * Create logs with trace correlation
 */
export function createCorrelatedLogsRequest(): OtlpLogsExportRequest {
  const traceId = generateTraceId();
  const spanId = generateSpanId();

  return createBasicLogsRequest({
    serviceName: "correlated-service",
    logRecords: [
      createOtlpLogRecord({
        severityNumber: SEVERITY_NUMBERS.INFO,
        severityText: "INFO",
        body: { stringValue: "Request started" },
        traceId,
        spanId,
        attributes: [
          { key: "http.method", value: { stringValue: "POST" } },
          { key: "http.url", value: { stringValue: "/api/users" } },
        ],
      }),
      createOtlpLogRecord({
        severityNumber: SEVERITY_NUMBERS.DEBUG,
        severityText: "DEBUG",
        body: { stringValue: "Processing user data" },
        traceId,
        spanId,
        attributes: [
          { key: "user.count", value: { intValue: "42" } },
        ],
      }),
      createOtlpLogRecord({
        severityNumber: SEVERITY_NUMBERS.INFO,
        severityText: "INFO",
        body: { stringValue: "Request completed" },
        traceId,
        spanId,
        attributes: [
          { key: "http.status_code", value: { intValue: "200" } },
          { key: "duration_ms", value: { doubleValue: 123.45 } },
        ],
      }),
    ],
  });
}

/**
 * Create logs with various severity levels
 */
export function createMultiSeverityLogsRequest(): OtlpLogsExportRequest {
  return createBasicLogsRequest({
    serviceName: "multi-severity-service",
    logRecords: [
      createOtlpLogRecord({
        severityNumber: SEVERITY_NUMBERS.TRACE,
        severityText: "TRACE",
        body: { stringValue: "Trace level log" },
      }),
      createOtlpLogRecord({
        severityNumber: SEVERITY_NUMBERS.DEBUG,
        severityText: "DEBUG",
        body: { stringValue: "Debug level log" },
      }),
      createOtlpLogRecord({
        severityNumber: SEVERITY_NUMBERS.INFO,
        severityText: "INFO",
        body: { stringValue: "Info level log" },
      }),
      createOtlpLogRecord({
        severityNumber: SEVERITY_NUMBERS.WARN,
        severityText: "WARN",
        body: { stringValue: "Warning level log" },
      }),
      createOtlpLogRecord({
        severityNumber: SEVERITY_NUMBERS.ERROR,
        severityText: "ERROR",
        body: { stringValue: "Error level log" },
      }),
      createOtlpLogRecord({
        severityNumber: SEVERITY_NUMBERS.FATAL,
        severityText: "FATAL",
        body: { stringValue: "Fatal level log" },
      }),
    ],
  });
}

/**
 * Create logs with error details
 */
export function createErrorLogsRequest(): OtlpLogsExportRequest {
  return createBasicLogsRequest({
    serviceName: "error-service",
    logRecords: [
      createOtlpLogRecord({
        severityNumber: SEVERITY_NUMBERS.ERROR,
        severityText: "ERROR",
        body: { stringValue: "Connection timeout to database" },
        attributes: [
          { key: "exception.type", value: { stringValue: "ConnectionTimeoutError" } },
          { key: "exception.message", value: { stringValue: "Timeout after 30000ms" } },
          {
            key: "exception.stacktrace",
            value: {
              stringValue:
                "Error: Timeout\n  at Connection.query (db.ts:42)\n  at UserService.getUsers (users.ts:15)",
            },
          },
          { key: "db.system", value: { stringValue: "postgresql" } },
          { key: "db.name", value: { stringValue: "users_db" } },
        ],
      }),
    ],
  });
}

/**
 * Create logs with PII data for scrubbing tests
 */
export function createPiiLogsRequest(): OtlpLogsExportRequest {
  return createBasicLogsRequest({
    serviceName: "pii-service",
    logRecords: [
      // Log with PII in body
      createOtlpLogRecord({
        body: {
          stringValue:
            "User john.doe@example.com logged in from 192.168.1.100 with card 4111-1111-1111-1111",
        },
        attributes: [
          { key: "user.email", value: { stringValue: "jane.smith@company.org" } },
          { key: "user.phone", value: { stringValue: "555-123-4567" } },
        ],
      }),
      // Log with sensitive attribute keys
      createOtlpLogRecord({
        body: { stringValue: "Authentication attempt" },
        attributes: [
          { key: "password", value: { stringValue: "secret123" } },
          { key: "api_key", value: { stringValue: "sk-12345abcdef" } },
          { key: "authorization", value: { stringValue: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test" } },
          { key: "token", value: { stringValue: "refresh-token-xyz" } },
          { key: "session", value: { stringValue: "session-id-abc" } },
        ],
      }),
      // Log with SSN
      createOtlpLogRecord({
        body: { stringValue: "Processing SSN: 123-45-6789" },
        attributes: [
          { key: "ssn", value: { stringValue: "987-65-4321" } },
        ],
      }),
    ],
  });
}

/**
 * Create a large logs request for limit testing
 */
export function createLargeLogsRequest(logCount: number): OtlpLogsExportRequest {
  const logRecords = [];

  for (let i = 0; i < logCount; i++) {
    logRecords.push(
      createOtlpLogRecord({
        severityNumber: SEVERITY_NUMBERS.INFO,
        severityText: "INFO",
        body: { stringValue: `Log message ${i}` },
        attributes: [
          { key: "log.index", value: { intValue: i.toString() } },
        ],
      })
    );
  }

  return createBasicLogsRequest({
    serviceName: "large-service",
    logRecords,
  });
}

/**
 * Create logs with many attributes for limit testing
 */
export function createManyAttributesLogsRequest(
  attrCount: number
): OtlpLogsExportRequest {
  const attributes = [];

  for (let i = 0; i < attrCount; i++) {
    attributes.push({
      key: `attr_${i}`,
      value: { stringValue: `value_${i}` },
    });
  }

  return createBasicLogsRequest({
    serviceName: "many-attrs-service",
    logRecords: [
      createOtlpLogRecord({
        body: { stringValue: "Log with many attributes" },
        attributes,
      }),
    ],
  });
}

/**
 * Create logs with long body for truncation testing
 */
export function createLongBodyLogsRequest(bodyLength: number): OtlpLogsExportRequest {
  const longBody = "x".repeat(bodyLength);

  return createBasicLogsRequest({
    serviceName: "long-body-service",
    logRecords: [
      createOtlpLogRecord({
        body: { stringValue: longBody },
      }),
    ],
  });
}

/**
 * Create logs with future timestamp for drift testing
 */
export function createFutureTimestampLogsRequest(): OtlpLogsExportRequest {
  const futureDate = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours in future

  return createBasicLogsRequest({
    serviceName: "future-timestamp-service",
    logRecords: [
      createOtlpLogRecord({
        timeUnixNano: dateToNanoString(futureDate),
        observedTimeUnixNano: dateToNanoString(futureDate),
        body: { stringValue: "Log from the future" },
      }),
    ],
  });
}

/**
 * Create logs with past timestamp for drift testing
 */
export function createPastTimestampLogsRequest(): OtlpLogsExportRequest {
  const pastDate = new Date(Date.now() - 48 * 60 * 60 * 1000); // 48 hours in past

  return createBasicLogsRequest({
    serviceName: "past-timestamp-service",
    logRecords: [
      createOtlpLogRecord({
        timeUnixNano: dateToNanoString(pastDate),
        observedTimeUnixNano: dateToNanoString(pastDate),
        body: { stringValue: "Log from the past" },
      }),
    ],
  });
}

/**
 * Create logs with various body types
 */
export function createVariousBodyTypesLogsRequest(): OtlpLogsExportRequest {
  return createBasicLogsRequest({
    serviceName: "various-body-service",
    logRecords: [
      // String body
      createOtlpLogRecord({
        body: { stringValue: "String log body" },
      }),
      // Int body
      createOtlpLogRecord({
        body: { intValue: "42" },
      }),
      // Bool body
      createOtlpLogRecord({
        body: { boolValue: true },
      }),
    ],
  });
}

/**
 * Create an empty logs request
 */
export function createEmptyLogsRequest(): OtlpLogsExportRequest {
  return {
    resourceLogs: [],
  };
}

/**
 * Create logs request with multiple resources
 */
export function createMultiResourceLogsRequest(): OtlpLogsExportRequest {
  return {
    resourceLogs: [
      {
        resource: {
          attributes: [
            { key: "service.name", value: { stringValue: "service-a" } },
          ],
        },
        scopeLogs: [
          {
            scope: { name: "scope-a" },
            logRecords: [
              createOtlpLogRecord({
                body: { stringValue: "Log from service A" },
              }),
            ],
          },
        ],
      },
      {
        resource: {
          attributes: [
            { key: "service.name", value: { stringValue: "service-b" } },
          ],
        },
        scopeLogs: [
          {
            scope: { name: "scope-b" },
            logRecords: [
              createOtlpLogRecord({
                body: { stringValue: "Log from service B" },
              }),
            ],
          },
        ],
      },
    ],
  };
}

/**
 * Create logs request without optional fields
 */
export function createMinimalLogsRequest(): OtlpLogsExportRequest {
  return {
    resourceLogs: [
      {
        scopeLogs: [
          {
            logRecords: [
              {
                timeUnixNano: dateToNanoString(new Date()),
                body: { stringValue: "Minimal log" },
              },
            ],
          },
        ],
      },
    ],
  };
}

/**
 * Convert to JSON string
 */
export function toLogsJson(request: OtlpLogsExportRequest): string {
  return JSON.stringify(request);
}

/**
 * Convert to JSON buffer
 */
export function toLogsJsonBuffer(request: OtlpLogsExportRequest): Buffer {
  return Buffer.from(toLogsJson(request), "utf-8");
}
