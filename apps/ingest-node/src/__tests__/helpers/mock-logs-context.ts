/**
 * Mock Logs Context Helper
 *
 * Creates mock Express request/response objects and pipeline contexts for logs testing.
 */
import type { Request, Response } from "express";
import type { LogsPipelineContext } from "../../pipeline/logs/types.js";
import type { NormalizedLogRecord } from "@ducsigr/api/schemas";
import {
  toLogsJsonBuffer,
  createBasicLogsRequest,
} from "../fixtures/otlp-logs.fixtures.js";

/**
 * Create a mock Express request for logs
 */
export function createMockLogsRequest(overrides: {
  headers?: Record<string, string | string[] | undefined>;
  body?: Buffer | object;
  ip?: string;
  socket?: { remoteAddress?: string };
} = {}): Request {
  return {
    headers: {
      "content-type": "application/json",
      ...overrides.headers,
    },
    body: overrides.body,
    ip: overrides.ip ?? "127.0.0.1",
    socket: {
      remoteAddress: overrides.socket?.remoteAddress ?? "127.0.0.1",
    },
  } as unknown as Request;
}

/**
 * Create a mock Express response for logs
 */
export function createMockLogsResponse(): Response & {
  _statusCode: number;
  _headers: Record<string, string>;
  _body: unknown;
  _headersSent: boolean;
} {
  const res = {
    _statusCode: 200,
    _headers: {} as Record<string, string>,
    _body: undefined as unknown,
    _headersSent: false,

    status(code: number) {
      this._statusCode = code;
      return this;
    },

    json(body: unknown) {
      this._body = body;
      this._headersSent = true;
      return this;
    },

    setHeader(name: string, value: string) {
      this._headers[name] = value;
      return this;
    },

    get headersSent() {
      return this._headersSent;
    },

    end(body?: string) {
      if (body) this._body = body;
      this._headersSent = true;
      return this;
    },
  };

  return res as unknown as Response & typeof res;
}

/**
 * Create a basic logs pipeline context for testing
 */
export function createMockLogsPipelineContext(
  overrides: Partial<LogsPipelineContext> = {}
): LogsPipelineContext {
  const req = createMockLogsRequest(
    overrides.req
      ? { headers: overrides.req.headers as Record<string, string> }
      : {}
  );
  const res = createMockLogsResponse();
  const rawBody =
    overrides.rawBody ?? toLogsJsonBuffer(createBasicLogsRequest());

  return {
    req,
    res,
    rawBody,
    contentType: overrides.contentType ?? "application/json",
    contentEncoding: overrides.contentEncoding ?? "",
    parsedRequest: overrides.parsedRequest,
    normalizedLogs: overrides.normalizedLogs,
    validationPassed: overrides.validationPassed,
    rejectedCount: overrides.rejectedCount,
    rejectionReasons: overrides.rejectionReasons,
    projectId: overrides.projectId,
    apiKeyId: overrides.apiKeyId,
    persistedCount: overrides.persistedCount,
  };
}

/**
 * Create a context with parsed logs request
 */
export function createParsedLogsContext(
  overrides: Partial<LogsPipelineContext> = {}
): LogsPipelineContext {
  const request = overrides.parsedRequest ?? createBasicLogsRequest();
  return createMockLogsPipelineContext({
    ...overrides,
    parsedRequest: request,
    rawBody: toLogsJsonBuffer(request),
  });
}

/**
 * Create a normalized log record for testing
 * Use 'key in overrides' check to respect explicit undefined values
 */
export function createNormalizedLogRecord(
  overrides: Partial<NormalizedLogRecord> = {}
): NormalizedLogRecord {
  return {
    projectId: "projectId" in overrides ? overrides.projectId! : "",
    serviceName:
      "serviceName" in overrides ? overrides.serviceName : "test-service",
    serviceVersion:
      "serviceVersion" in overrides ? overrides.serviceVersion : "1.0.0",
    environment: "environment" in overrides ? overrides.environment : "test",
    resource:
      "resource" in overrides
        ? overrides.resource
        : { "service.name": "test-service" },
    scopeName: "scopeName" in overrides ? overrides.scopeName : "test-scope",
    scopeVersion:
      "scopeVersion" in overrides ? overrides.scopeVersion : "1.0.0",
    timestamp: overrides.timestamp ?? new Date(),
    observedTime: overrides.observedTime,
    severityNumber:
      "severityNumber" in overrides ? overrides.severityNumber : 9,
    severityText:
      "severityText" in overrides ? overrides.severityText : "INFO",
    body:
      "body" in overrides
        ? overrides.body
        : { stringValue: "Test log message" },
    bodyText:
      "bodyText" in overrides ? overrides.bodyText : "Test log message",
    attributes: "attributes" in overrides ? overrides.attributes : {},
    droppedAttributesCount: overrides.droppedAttributesCount,
    traceId: overrides.traceId,
    spanId: overrides.spanId,
    flags: overrides.flags,
    ingestSource: overrides.ingestSource,
  };
}

/**
 * Create a context after logs normalization
 */
export function createNormalizedLogsContext(
  overrides: Partial<LogsPipelineContext> = {}
): LogsPipelineContext {
  return createMockLogsPipelineContext({
    ...overrides,
    parsedRequest: overrides.parsedRequest ?? createBasicLogsRequest(),
    normalizedLogs: overrides.normalizedLogs ?? [createNormalizedLogRecord()],
  });
}

/**
 * Create a context after logs authentication
 * Use 'key in overrides' to respect explicit undefined for normalizedLogs
 */
export function createAuthenticatedLogsContext(
  overrides: Partial<LogsPipelineContext> = {}
): LogsPipelineContext {
  // Determine normalizedLogs: use override if key exists, otherwise default to one log
  const normalizedLogs =
    "normalizedLogs" in overrides
      ? overrides.normalizedLogs
      : [createNormalizedLogRecord()];

  const ctx = createMockLogsPipelineContext({
    ...overrides,
    parsedRequest: overrides.parsedRequest ?? createBasicLogsRequest(),
    normalizedLogs,
  });

  ctx.projectId = overrides.projectId ?? "test-project-id";
  ctx.apiKeyId = overrides.apiKeyId ?? "test-api-key-id";

  // Update logs with project ID
  if (ctx.normalizedLogs) {
    for (const log of ctx.normalizedLogs) {
      log.projectId = ctx.projectId;
    }
  }

  return ctx;
}
