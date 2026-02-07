import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ApiClient } from "../../lib/api-client.js";
import {
  handleListTraces,
  handleGetTrace,
  handleGetErrorTraces,
} from "../../tools/traces.js";

function createMockApiClient(): ApiClient {
  return {
    listTraces: vi.fn(),
    getTrace: vi.fn(),
    getErrorTraces: vi.fn(),
    searchSpans: vi.fn(),
    getCostSummary: vi.fn(),
    getTraceStats: vi.fn(),
    getProjectInfo: vi.fn(),
  };
}

describe("handleListTraces", () => {
  let apiClient: ApiClient;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-02-04T12:00:00Z"));
    apiClient = createMockApiClient();
  });

  it("returns formatted trace table", async () => {
    (apiClient.listTraces as ReturnType<typeof vi.fn>).mockResolvedValue({
      traces: [
        {
          id: "trace-001",
          serviceName: "api-service",
          rootSpanName: "POST /chat",
          durationMs: 2340,
          errorCount: 0,
          spanCount: 5,
          startTime: new Date("2025-02-04T11:50:00Z"),
          hasError: false,
        },
      ],
      total: 1,
      nextCursor: null,
    });

    const result = await handleListTraces(apiClient, {
      limit: 20,
      timeRange: "24h",
    });

    expect(result.content[0]!.text).toContain("trace-00");
    expect(result.content[0]!.text).toContain("api-service");
    expect(result.content[0]!.text).toContain("POST /chat");
    expect(result.content[0]!.text).toContain("2.34s");
  });

  it("passes all filters to API client", async () => {
    (apiClient.listTraces as ReturnType<typeof vi.fn>).mockResolvedValue({
      traces: [],
      total: 0,
      nextCursor: null,
    });

    await handleListTraces(apiClient, {
      limit: 10,
      timeRange: "24h",
      hasError: true,
      search: "chat",
      serviceName: "api-service",
      minDurationMs: 100,
      maxDurationMs: 5000,
    });

    expect(apiClient.listTraces).toHaveBeenCalledWith({
      limit: 10,
      cursor: undefined,
      timeRange: "24h",
      hasError: true,
      search: "chat",
      serviceName: "api-service",
      minDurationMs: 100,
      maxDurationMs: 5000,
    });
  });

  it("shows next cursor when present", async () => {
    (apiClient.listTraces as ReturnType<typeof vi.fn>).mockResolvedValue({
      traces: [
        {
          id: "trace-1",
          serviceName: "svc",
          rootSpanName: "op",
          durationMs: 100,
          errorCount: 0,
          spanCount: 1,
          startTime: new Date("2025-02-04T10:00:00Z"),
          hasError: false,
        },
      ],
      total: 10,
      nextCursor: "trace-2",
    });

    const result = await handleListTraces(apiClient, {
      limit: 1,
      timeRange: "24h",
    });

    expect(result.content[0]!.text).toContain("cursor=trace-2");
  });
});

describe("handleGetTrace", () => {
  let apiClient: ApiClient;

  beforeEach(() => {
    vi.clearAllMocks();
    apiClient = createMockApiClient();
  });

  it("returns trace detail with spans", async () => {
    (apiClient.getTrace as ReturnType<typeof vi.fn>).mockResolvedValue({
      trace: {
        id: "trace-123",
        serviceName: "my-service",
        durationMs: 500,
        startTime: new Date("2025-02-04T10:00:00Z"),
        hasError: false,
        spans: [
          {
            id: "span-1",
            externalSpanId: "aaa",
            parentSpanId: null,
            name: "root-op",
            kind: "SERVER",
            spanType: null,
            statusCode: "OK",
            statusMessage: null,
            startTime: new Date("2025-02-04T10:00:00Z"),
            endTime: new Date("2025-02-04T10:00:00.500Z"),
            durationMs: 500,
            model: null,
            promptTokens: null,
            completionTokens: null,
            totalCost: null,
            input: null,
            output: null,
            httpMethod: null,
            httpRoute: null,
            httpStatusCode: null,
            dbSystem: null,
            dbOperation: null,
            exceptionType: null,
            exceptionMessage: null,
          },
        ],
      },
    });

    const result = await handleGetTrace(apiClient, {
      traceId: "trace-123",
      includeInputOutput: true,
    });

    expect(result.content[0]!.text).toContain("# Trace: trace-123");
    expect(result.content[0]!.text).toContain("**Service:** my-service");
    expect(result.content[0]!.text).toContain("root-op");
  });

  it("returns error when trace not found (404)", async () => {
    const error = new Error("Trace not found");
    Object.assign(error, { status: 404, code: "NOT_FOUND", name: "ApiClientError" });
    (apiClient.getTrace as ReturnType<typeof vi.fn>).mockRejectedValue(error);

    const result = await handleGetTrace(apiClient, {
      traceId: "nonexistent",
    });

    expect(result.content[0]!.text).toContain("Trace not found");
    expect(result).toHaveProperty("isError", true);
  });

  it("passes correct params to API client", async () => {
    (apiClient.getTrace as ReturnType<typeof vi.fn>).mockResolvedValue({
      trace: {
        id: "trace-123",
        serviceName: "svc",
        durationMs: 100,
        startTime: new Date(),
        hasError: false,
        spans: [],
      },
    });

    await handleGetTrace(apiClient, { traceId: "trace-123" });

    expect(apiClient.getTrace).toHaveBeenCalledWith({
      traceId: "trace-123",
      includeInputOutput: true,
    });
  });
});

describe("handleGetErrorTraces", () => {
  let apiClient: ApiClient;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-02-04T12:00:00Z"));
    apiClient = createMockApiClient();
  });

  it("returns grouped error summary", async () => {
    (apiClient.getErrorTraces as ReturnType<typeof vi.fn>).mockResolvedValue({
      errorSpans: [
        {
          id: "span-1",
          name: "llm-call",
          exceptionType: "RateLimitError",
          exceptionMessage: "Too many requests",
          statusMessage: null,
          startTime: new Date("2025-02-04T11:00:00Z"),
          trace: {
            id: "trace-1",
            serviceName: "api-service",
            rootSpanName: "POST /chat",
          },
        },
        {
          id: "span-2",
          name: "db-query",
          exceptionType: "RateLimitError",
          exceptionMessage: "Rate exceeded",
          statusMessage: null,
          startTime: new Date("2025-02-04T11:30:00Z"),
          trace: {
            id: "trace-2",
            serviceName: "api-service",
            rootSpanName: "POST /embed",
          },
        },
      ],
    });

    const result = await handleGetErrorTraces(apiClient, {
      limit: 10,
      timeRange: "24h",
    });

    expect(result.content[0]!.text).toContain("RateLimitError");
    expect(result.content[0]!.text).toContain("2 occurrences");
  });

  it("passes exceptionType filter to API client", async () => {
    (apiClient.getErrorTraces as ReturnType<typeof vi.fn>).mockResolvedValue({
      errorSpans: [],
    });

    await handleGetErrorTraces(apiClient, {
      limit: 10,
      timeRange: "24h",
      exceptionType: "TypeError",
    });

    expect(apiClient.getErrorTraces).toHaveBeenCalledWith({
      limit: 10,
      timeRange: "24h",
      exceptionType: "TypeError",
    });
  });
});
