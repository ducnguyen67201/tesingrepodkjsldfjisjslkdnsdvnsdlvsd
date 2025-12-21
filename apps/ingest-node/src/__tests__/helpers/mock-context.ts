/**
 * Mock Context Helper
 *
 * Creates mock Express request/response objects and pipeline contexts for testing.
 */
import type { Request, Response } from "express";
import type { PipelineContext } from "../../pipeline/types.js";
import { toOtlpJsonBuffer, createBasicOtlpRequest } from "../fixtures/otlp.fixtures.js";

/**
 * Create a mock Express request
 */
export function createMockRequest(overrides: {
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
 * Create a mock Express response
 */
export function createMockResponse(): Response & {
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
 * Create a basic pipeline context for testing
 */
export function createMockPipelineContext(overrides: Partial<PipelineContext> = {}): PipelineContext {
  const req = createMockRequest(overrides.req ? { headers: overrides.req.headers as Record<string, string> } : {});
  const res = createMockResponse();
  const rawBody = overrides.rawBody ?? toOtlpJsonBuffer(createBasicOtlpRequest());

  return {
    req,
    res,
    rawBody,
    contentType: overrides.contentType ?? "application/json",
    contentEncoding: overrides.contentEncoding ?? "",
    parsedRequest: overrides.parsedRequest,
    normalizedTraces: overrides.normalizedTraces,
    normalizedSpans: overrides.normalizedSpans,
    validationPassed: overrides.validationPassed,
    projectId: overrides.projectId,
    apiKeyId: overrides.apiKeyId,
    persistedTraceIds: overrides.persistedTraceIds,
    persistedSpanCount: overrides.persistedSpanCount,
    error: overrides.error,
  };
}

/**
 * Create a context with parsed request
 */
export function createParsedContext(overrides: Partial<PipelineContext> = {}): PipelineContext {
  const request = overrides.parsedRequest ?? createBasicOtlpRequest();
  return createMockPipelineContext({
    ...overrides,
    parsedRequest: request,
    rawBody: toOtlpJsonBuffer(request),
  });
}

/**
 * Create a context after normalization
 */
export function createNormalizedContext(overrides: Partial<PipelineContext> = {}): PipelineContext {
  return createMockPipelineContext({
    ...overrides,
    parsedRequest: overrides.parsedRequest ?? createBasicOtlpRequest(),
    normalizedTraces: overrides.normalizedTraces ?? [
      {
        externalTraceId: "abc123",
        projectId: "",
        serviceName: "test-service",
        startTime: new Date(),
        spanCount: 1,
        errorCount: 0,
        // V2 required fields
        hasError: false,
        hasException: false,
        spanTypes: [],
      },
    ],
    normalizedSpans: overrides.normalizedSpans ?? [
      {
        externalSpanId: "span123",
        externalTraceId: "abc123",
        name: "test-span",
        startTime: new Date(),
        endTime: new Date(),
        durationMs: 100,
        statusCode: "OK",
        kind: "INTERNAL",
      },
    ],
  });
}

/**
 * Create a context after authentication
 */
export function createAuthenticatedContext(overrides: Partial<PipelineContext> = {}): PipelineContext {
  const ctx = createNormalizedContext(overrides);
  ctx.projectId = overrides.projectId ?? "test-project-id";
  ctx.apiKeyId = overrides.apiKeyId ?? "test-api-key-id";

  // Update traces with project ID
  if (ctx.normalizedTraces) {
    for (const trace of ctx.normalizedTraces) {
      trace.projectId = ctx.projectId;
    }
  }

  return ctx;
}
