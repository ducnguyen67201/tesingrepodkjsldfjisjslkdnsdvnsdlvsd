import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ApiClient } from "../../lib/api-client.js";
import {
  handleGetCostSummary,
  handleGetTraceStats,
} from "../../tools/analytics.js";
import { handleListProjects } from "../../tools/projects.js";

function createMockApiClient(): ApiClient {
  return {
    listTraces: vi.fn(),
    getTrace: vi.fn(),
    getErrorTraces: vi.fn(),
    searchSpans: vi.fn(),
    getCostSummary: vi.fn(),
    getTraceStats: vi.fn(),
    getProjectInfo: vi.fn(),
    listAlerts: vi.fn(),
    getRCA: vi.fn(),
  };
}

describe("handleGetCostSummary", () => {
  let apiClient: ApiClient;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-02-04T12:00:00Z"));
    apiClient = createMockApiClient();
  });

  it("returns cost by model", async () => {
    (apiClient.getCostSummary as ReturnType<typeof vi.fn>).mockResolvedValue({
      groupBy: "model",
      data: [
        {
          model: "gpt-4o",
          spanCount: 100,
          inputTokens: 50000,
          outputTokens: 25000,
          totalCost: 1.5,
        },
        {
          model: "claude-3-5-sonnet",
          spanCount: 50,
          inputTokens: 30000,
          outputTokens: 15000,
          totalCost: 0.8,
        },
      ],
    });

    const result = await handleGetCostSummary(apiClient, {
      timeRange: "7d",
      groupBy: "model",
    });

    expect(result.content[0]!.text).toContain("gpt-4o");
    expect(result.content[0]!.text).toContain("claude-3-5-sonnet");
    expect(result.content[0]!.text).toContain("$1.5000");
    expect(result.content[0]!.text).toContain("Total Cost");
  });

  it("returns cost by day", async () => {
    (apiClient.getCostSummary as ReturnType<typeof vi.fn>).mockResolvedValue({
      groupBy: "day",
      data: [
        {
          date: new Date("2025-02-04"),
          spanCount: 200,
          inputTokens: 100000,
          outputTokens: 50000,
          totalCost: 3.2,
        },
      ],
    });

    const result = await handleGetCostSummary(apiClient, {
      timeRange: "7d",
      groupBy: "day",
    });

    expect(result.content[0]!.text).toContain("2025-02-04");
    expect(result.content[0]!.text).toContain("$3.2000");
  });

  it("returns cost by service via span groupBy", async () => {
    (apiClient.getCostSummary as ReturnType<typeof vi.fn>).mockResolvedValue({
      groupBy: "service",
      data: [
        {
          model: "gpt-4o",
          spanCount: 50,
          promptTokens: 5000,
          completionTokens: 2500,
          totalCost: 0.5,
        },
      ],
    });

    const result = await handleGetCostSummary(apiClient, {
      timeRange: "7d",
      groupBy: "service",
    });

    expect(result.content[0]!.text).toContain("gpt-4o");
    expect(result.content[0]!.text).toContain("50");
  });

  it("passes correct params to API client", async () => {
    (apiClient.getCostSummary as ReturnType<typeof vi.fn>).mockResolvedValue({
      groupBy: "model",
      data: [],
    });

    await handleGetCostSummary(apiClient, {
      timeRange: "7d",
      groupBy: "model",
    });

    expect(apiClient.getCostSummary).toHaveBeenCalledWith({
      timeRange: "7d",
      groupBy: "model",
    });
  });
});

describe("handleGetTraceStats", () => {
  let apiClient: ApiClient;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-02-04T12:00:00Z"));
    apiClient = createMockApiClient();
  });

  it("returns aggregate statistics with percentiles", async () => {
    (apiClient.getTraceStats as ReturnType<typeof vi.fn>).mockResolvedValue({
      totalCount: 100,
      errorCount: 5,
      percentiles: { p50: 500, p90: 900, p95: 950, p99: 990 },
      serviceStats: [
        {
          serviceName: "api-service",
          _count: 80,
          _avg: { durationMs: 500 },
        },
        {
          serviceName: "worker",
          _count: 20,
          _avg: { durationMs: 200 },
        },
      ],
      errorRateByService: [
        { serviceName: "api-service", _count: 4 },
        { serviceName: "worker", _count: 1 },
      ],
    });

    const result = await handleGetTraceStats(apiClient, {
      timeRange: "24h",
    });

    const text = result.content[0]!.text;
    expect(text).toContain("**Total Traces:** 100");
    expect(text).toContain("**Error Traces:** 5 (5.0%)");
    expect(text).toContain("p50");
    expect(text).toContain("p90");
    expect(text).toContain("p95");
    expect(text).toContain("p99");
    expect(text).toContain("api-service");
    expect(text).toContain("worker");
  });

  it("passes serviceName filter to API client", async () => {
    (apiClient.getTraceStats as ReturnType<typeof vi.fn>).mockResolvedValue({
      totalCount: 0,
      errorCount: 0,
      percentiles: { p50: 0, p90: 0, p95: 0, p99: 0 },
      serviceStats: [],
      errorRateByService: [],
    });

    await handleGetTraceStats(apiClient, {
      timeRange: "24h",
      serviceName: "api-service",
    });

    expect(apiClient.getTraceStats).toHaveBeenCalledWith({
      timeRange: "24h",
      serviceName: "api-service",
    });
  });
});

describe("handleListProjects", () => {
  let apiClient: ApiClient;

  beforeEach(() => {
    vi.clearAllMocks();
    apiClient = createMockApiClient();
  });

  it("returns project info", async () => {
    (apiClient.getProjectInfo as ReturnType<typeof vi.fn>).mockResolvedValue({
      project: {
        id: "proj-1",
        name: "My Project",
        createdAt: new Date("2025-01-01T00:00:00Z"),
        workspace: { id: "ws-1", name: "My Workspace" },
        _count: { traces: 500, apiKeys: 2 },
      },
    });

    const result = await handleListProjects(apiClient);

    expect(result.content[0]!.text).toContain("# Project: My Project");
    expect(result.content[0]!.text).toContain("**Workspace:** My Workspace");
    expect(result.content[0]!.text).toContain("**Total Traces:** 500");
  });

  it("returns error when project not found (404)", async () => {
    const error = new Error("Project not found");
    Object.assign(error, { status: 404, code: "NOT_FOUND", name: "ApiClientError" });
    (apiClient.getProjectInfo as ReturnType<typeof vi.fn>).mockRejectedValue(error);

    const result = await handleListProjects(apiClient);

    expect(result.content[0]!.text).toContain("Project not found");
    expect(result).toHaveProperty("isError", true);
  });
});
