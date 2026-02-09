import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ApiClient } from "../../lib/api-client.js";
import { handleSearchSpans } from "../../tools/spans.js";

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

describe("handleSearchSpans", () => {
  let apiClient: ApiClient;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-02-04T12:00:00Z"));
    apiClient = createMockApiClient();
  });

  it("returns formatted span results", async () => {
    (apiClient.searchSpans as ReturnType<typeof vi.fn>).mockResolvedValue({
      spans: [
        {
          id: "span-1",
          traceId: "trace-1",
          name: "chat-completion",
          spanType: "LLM",
          statusCode: "OK",
          durationMs: 1500,
          startTime: new Date("2025-02-04T11:50:00Z"),
          model: "gpt-4o",
          exceptionType: null,
          trace: { serviceName: "api-service" },
        },
      ],
    });

    const result = await handleSearchSpans(apiClient, {
      limit: 20,
      timeRange: "24h",
    });

    expect(result.content[0]!.text).toContain("chat-completion");
    expect(result.content[0]!.text).toContain("LLM");
    expect(result.content[0]!.text).toContain("gpt-4o");
  });

  it("passes all filters to API client", async () => {
    (apiClient.searchSpans as ReturnType<typeof vi.fn>).mockResolvedValue({
      spans: [],
    });

    await handleSearchSpans(apiClient, {
      limit: 10,
      timeRange: "24h",
      spanType: "LLM",
      query: "chat",
      hasError: true,
      model: "gpt-4",
    });

    expect(apiClient.searchSpans).toHaveBeenCalledWith({
      query: "chat",
      spanType: "LLM",
      hasError: true,
      model: "gpt-4",
      limit: 10,
      timeRange: "24h",
    });
  });
});
