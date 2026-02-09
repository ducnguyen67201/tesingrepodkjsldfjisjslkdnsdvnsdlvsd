import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ApiClient } from "../../lib/api-client.js";
import { ApiClientError } from "../../lib/api-client.js";
import { handleListAlerts, handleGetRCA } from "../../tools/alerts.js";

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

describe("handleListAlerts", () => {
  let apiClient: ApiClient;

  beforeEach(() => {
    vi.clearAllMocks();
    apiClient = createMockApiClient();
  });

  it("returns formatted alert list", async () => {
    (apiClient.listAlerts as ReturnType<typeof vi.fn>).mockResolvedValue({
      alerts: [
        {
          id: "alert_1",
          name: "High Error Rate",
          type: "ERROR_RATE",
          severity: "HIGH",
          state: "FIRING",
          threshold: 0.05,
          operator: "GREATER_THAN",
          windowMins: 5,
          enabled: true,
          lastTriggeredAt: new Date("2026-01-15"),
          history: [{ id: "h1", state: "FIRING", value: 0.12, triggeredAt: new Date() }],
          _count: { rcaAnalyses: 2 },
        },
      ],
    });

    const result = await handleListAlerts(apiClient, {});
    expect(result.content[0]!.text).toContain("High Error Rate");
    expect(result.content[0]!.text).toContain("FIRING");
    expect(result.content[0]!.text).toContain("ERROR_RATE");
  });

  it("returns empty message when no alerts", async () => {
    (apiClient.listAlerts as ReturnType<typeof vi.fn>).mockResolvedValue({ alerts: [] });
    const result = await handleListAlerts(apiClient, {});
    expect(result.content[0]!.text).toContain("No alerts");
  });

  it("passes limit and enabled filters", async () => {
    (apiClient.listAlerts as ReturnType<typeof vi.fn>).mockResolvedValue({ alerts: [] });
    await handleListAlerts(apiClient, { limit: 5, enabled: true });
    expect(apiClient.listAlerts).toHaveBeenCalledWith({ limit: 5, enabled: true });
  });
});

describe("handleGetRCA", () => {
  let apiClient: ApiClient;

  beforeEach(() => {
    vi.clearAllMocks();
    apiClient = createMockApiClient();
  });

  it("returns formatted RCA detail", async () => {
    (apiClient.getRCA as ReturnType<typeof vi.fn>).mockResolvedValue({
      rca: {
        id: "rca_1",
        alertId: "alert_1",
        triggeredAt: new Date("2026-01-15"),
        confidence: 0.87,
        suspectedCommits: ["abc1234"],
        suspectedPRs: ["42"],
        analysis: {
          hypothesis: "Memory leak in connection pool",
          confidence: 0.87,
          reasoning: "Error rate spiked after deployment",
          rootCause: {
            category: "CODE_CHANGE",
            summary: "Unclosed DB connections",
            evidence: ["Connection pool exhaustion logs"],
          },
          relatedChanges: [],
          affectedComponents: ["api-server"],
          remediation: {
            immediate: ["Restart service"],
            longTerm: ["Add connection pool monitoring"],
          },
        },
      },
      alert: {
        id: "alert_1",
        name: "High Error Rate",
        type: "ERROR_RATE",
        severity: "HIGH",
        threshold: 0.05,
        operator: "GREATER_THAN",
      },
      triggerValue: 0.12,
      commits: [
        {
          sha: "abc1234567890",
          message: "fix: update connection handling",
          author: "dev@example.com",
          timestamp: new Date("2026-01-14"),
        },
      ],
    });

    const result = await handleGetRCA(apiClient, { rcaId: "rca_1" });
    const text = result.content[0]!.text;

    expect(text).toContain("Root Cause Analysis");
    expect(text).toContain("Memory leak in connection pool");
    expect(text).toContain("87%");
    expect(text).toContain("CODE_CHANGE");
    expect(text).toContain("Restart service");
    expect(text).toContain("abc1234");
  });

  it("returns error for not found RCA", async () => {
    const error = new ApiClientError("Not found", 404);
    (apiClient.getRCA as ReturnType<typeof vi.fn>).mockRejectedValue(error);

    const result = await handleGetRCA(apiClient, { rcaId: "nonexistent" });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("not found");
  });

  it("validates required rcaId input", async () => {
    await expect(handleGetRCA(apiClient, {} as { rcaId: string })).rejects.toThrow();
  });
});
