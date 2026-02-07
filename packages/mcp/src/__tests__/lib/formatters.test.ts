import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  formatDuration,
  formatRelativeTime,
  formatCost,
  formatTokens,
  truncate,
  buildSpanTree,
  groupErrorsByType,
  formatTraceTable,
  formatTraceDetail,
  formatProjectInfo,
} from "../../lib/formatters.js";
import type { FlatSpan, TraceRow, ProjectInfo } from "../../lib/types.js";

describe("formatDuration", () => {
  it("handles null", () => {
    expect(formatDuration(null)).toBe("-");
  });

  it("formats milliseconds", () => {
    expect(formatDuration(500)).toBe("500ms");
  });

  it("formats seconds", () => {
    expect(formatDuration(2500)).toBe("2.50s");
  });

  it("formats minutes", () => {
    expect(formatDuration(125000)).toBe("2.08m");
  });

  it("formats zero", () => {
    expect(formatDuration(0)).toBe("0ms");
  });

  it("formats boundary at 1000ms", () => {
    expect(formatDuration(1000)).toBe("1.00s");
  });
});

describe("formatRelativeTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-02-04T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("formats just now", () => {
    expect(formatRelativeTime(new Date("2025-02-04T12:00:00Z"))).toBe("just now");
  });

  it("formats minutes ago", () => {
    expect(formatRelativeTime(new Date("2025-02-04T11:50:00Z"))).toBe("10 min ago");
  });

  it("formats hours ago", () => {
    expect(formatRelativeTime(new Date("2025-02-04T09:00:00Z"))).toBe("3 hours ago");
  });

  it("formats 1 hour ago singular", () => {
    expect(formatRelativeTime(new Date("2025-02-04T11:00:00Z"))).toBe("1 hour ago");
  });

  it("formats days ago", () => {
    expect(formatRelativeTime(new Date("2025-02-02T12:00:00Z"))).toBe("2 days ago");
  });

  it("formats 1 day ago singular", () => {
    expect(formatRelativeTime(new Date("2025-02-03T11:00:00Z"))).toBe("1 day ago");
  });
});

describe("formatCost", () => {
  it("handles null", () => {
    expect(formatCost(null)).toBe("-");
  });

  it("formats number", () => {
    expect(formatCost(0.0234)).toBe("$0.0234");
  });

  it("formats small costs", () => {
    expect(formatCost(0.0567)).toBe("$0.0567");
  });
});

describe("formatTokens", () => {
  it("handles null", () => {
    expect(formatTokens(null)).toBe("-");
  });

  it("formats small numbers", () => {
    expect(formatTokens(500)).toBe("500");
  });

  it("formats thousands", () => {
    expect(formatTokens(1500)).toBe("1.5K");
  });

  it("formats millions", () => {
    expect(formatTokens(2500000)).toBe("2.50M");
  });

  it("formats large numbers", () => {
    expect(formatTokens(5000)).toBe("5.0K");
  });
});

describe("truncate", () => {
  it("returns short strings unchanged", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  it("truncates long strings with ellipsis", () => {
    expect(truncate("hello world, this is a test", 10)).toBe("hello w...");
  });

  it("handles exact length", () => {
    expect(truncate("hello", 5)).toBe("hello");
  });
});

describe("buildSpanTree", () => {
  it("builds tree from flat spans using externalSpanId", () => {
    const spans: FlatSpan[] = [
      makeSpan({ externalSpanId: "aaa", parentSpanId: null, name: "root" }),
      makeSpan({ externalSpanId: "bbb", parentSpanId: "aaa", name: "child1" }),
      makeSpan({ externalSpanId: "ccc", parentSpanId: "aaa", name: "child2" }),
      makeSpan({ externalSpanId: "ddd", parentSpanId: "bbb", name: "grandchild" }),
    ];

    const tree = buildSpanTree(spans);

    expect(tree).toHaveLength(1);
    expect(tree[0]!.name).toBe("root");
    expect(tree[0]!.children).toHaveLength(2);
    expect(tree[0]!.children[0]!.name).toBe("child1");
    expect(tree[0]!.children[0]!.children).toHaveLength(1);
    expect(tree[0]!.children[0]!.children[0]!.name).toBe("grandchild");
    expect(tree[0]!.children[1]!.name).toBe("child2");
    expect(tree[0]!.children[1]!.children).toHaveLength(0);
  });

  it("handles orphan spans as roots", () => {
    const spans: FlatSpan[] = [
      makeSpan({ externalSpanId: "aaa", parentSpanId: "zzz", name: "orphan" }),
      makeSpan({ externalSpanId: "bbb", parentSpanId: null, name: "root" }),
    ];

    const tree = buildSpanTree(spans);
    expect(tree).toHaveLength(2);
  });

  it("handles empty array", () => {
    expect(buildSpanTree([])).toEqual([]);
  });
});

describe("groupErrorsByType", () => {
  it("groups errors by exception type", () => {
    const spans = [
      makeErrorSpan({ exceptionType: "TypeError", exceptionMessage: "bad" }),
      makeErrorSpan({ exceptionType: "TypeError", exceptionMessage: "worse" }),
      makeErrorSpan({ exceptionType: "ValueError", exceptionMessage: "invalid" }),
    ];

    const groups = groupErrorsByType(spans);

    expect(groups).toHaveLength(2);
    expect(groups[0]!.exceptionType).toBe("TypeError");
    expect(groups[0]!.count).toBe(2);
    expect(groups[1]!.exceptionType).toBe("ValueError");
    expect(groups[1]!.count).toBe(1);
  });

  it("uses 'Unknown Error' for null exceptionType", () => {
    const spans = [
      {
        id: "span-1",
        name: "error-span",
        exceptionType: null,
        exceptionMessage: null,
        statusMessage: "something broke",
        startTime: new Date("2025-02-04T10:00:00Z"),
        trace: { id: "trace-1", serviceName: "api-service", rootSpanName: "POST /api" },
      },
    ];
    const groups = groupErrorsByType(spans);
    expect(groups[0]!.exceptionType).toBe("Unknown Error");
  });
});

describe("formatTraceTable", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-02-04T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("formats traces into markdown table", () => {
    const traces: TraceRow[] = [
      {
        id: "cuid12345678901234",
        serviceName: "api-service",
        rootSpanName: "POST /chat",
        durationMs: 2340,
        errorCount: 0,
        spanCount: 5,
        startTime: new Date("2025-02-04T11:50:00Z"),
        hasError: false,
      },
    ];

    const result = formatTraceTable(traces, {
      total: 1,
      timeRange: "24h",
    });

    expect(result).toContain("Found 1 traces");
    expect(result).toContain("cuid1234");
    expect(result).toContain("api-service");
    expect(result).toContain("POST /chat");
    expect(result).toContain("2.34s");
  });

  it("includes next cursor when present", () => {
    const result = formatTraceTable([], {
      total: 0,
      timeRange: "24h",
      nextCursor: "next-id",
    });

    expect(result).toContain("cursor=next-id");
  });
});

describe("formatTraceDetail", () => {
  it("formats trace header and span tree", () => {
    const trace = {
      id: "trace-123",
      serviceName: "my-service",
      durationMs: 500,
      startTime: new Date("2025-02-04T10:00:00Z"),
      hasError: false,
      spans: [
        makeSpan({ externalSpanId: "aaa", parentSpanId: null, name: "root", durationMs: 500 }),
        makeSpan({ externalSpanId: "bbb", parentSpanId: "aaa", name: "child", durationMs: 200 }),
      ],
    };

    const result = formatTraceDetail(trace, false);

    expect(result).toContain("# Trace: trace-123");
    expect(result).toContain("**Service:** my-service");
    expect(result).toContain("**Status:** OK");
    expect(result).toContain("root (500ms)");
    expect(result).toContain("child (200ms)");
  });

  it("includes LLM span details when requested", () => {
    const trace = {
      id: "trace-123",
      serviceName: "my-service",
      durationMs: 500,
      startTime: new Date("2025-02-04T10:00:00Z"),
      hasError: false,
      spans: [
        makeSpan({
          externalSpanId: "aaa",
          parentSpanId: null,
          name: "llm-call",
          spanType: "LLM",
          model: "gpt-4o",
          promptTokens: 100,
          completionTokens: 50,
          input: { messages: [{ role: "user", content: "hello" }] },
          output: { content: "hi there" },
        }),
      ],
    };

    const result = formatTraceDetail(trace, true);

    expect(result).toContain("## LLM Span Details");
    expect(result).toContain("**Model:** gpt-4o");
    expect(result).toContain("**Tokens:** 100 in / 50 out");
    expect(result).toContain("**Input:**");
    expect(result).toContain("**Output:**");
  });
});

describe("formatProjectInfo", () => {
  it("formats project details", () => {
    const project: ProjectInfo = {
      id: "proj-123",
      name: "My Project",
      createdAt: new Date("2025-01-01T00:00:00Z"),
      workspace: { id: "ws-1", name: "My Workspace" },
      _count: { traces: 1000, apiKeys: 3 },
    };

    const result = formatProjectInfo(project);

    expect(result).toContain("# Project: My Project");
    expect(result).toContain("**Project ID:** proj-123");
    expect(result).toContain("**Workspace:** My Workspace");
    expect(result).toContain("**Total Traces:** 1000");
    expect(result).toContain("**API Keys:** 3");
  });
});

// ============================================================
// Test Helpers
// ============================================================

function makeSpan(overrides: Partial<FlatSpan> = {}): FlatSpan {
  return {
    id: "span-id",
    externalSpanId: "ext-span-id",
    parentSpanId: null,
    name: "test-span",
    kind: "INTERNAL",
    spanType: null,
    statusCode: "UNSET",
    statusMessage: null,
    durationMs: 100,
    startTime: new Date("2025-02-04T10:00:00Z"),
    endTime: new Date("2025-02-04T10:00:00.100Z"),
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
    ...overrides,
  };
}

function makeErrorSpan(
  overrides: Partial<{
    exceptionType: string | null;
    exceptionMessage: string | null;
    statusMessage: string | null;
  }> = {}
) {
  return {
    id: `span-${Math.random().toString(36).slice(2)}`,
    name: "error-span",
    exceptionType: overrides.exceptionType ?? "Error",
    exceptionMessage: overrides.exceptionMessage ?? null,
    statusMessage: overrides.statusMessage ?? null,
    startTime: new Date("2025-02-04T10:00:00Z"),
    trace: {
      id: "trace-1",
      serviceName: "api-service",
      rootSpanName: "POST /api",
    },
  };
}
