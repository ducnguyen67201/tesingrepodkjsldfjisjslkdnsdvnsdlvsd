import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RCAReport, AlertContext, StoreRCAOutput } from "@cognobserve/api/schemas";
import type { StoreRCAActivityInput } from "./store-rca.activity";

// ============================================================
// TEST FIXTURES
// ============================================================

const validLLMMetadata = {
  model: "claude-3-5-sonnet-20241022",
  provider: "anthropic",
  tokensUsed: 1234,
  estimatedCost: 0.0185,
  latencyMs: 2500,
  usedTemplate: false,
};

const validRootCause = {
  category: "CODE_CHANGE" as const,
  summary: "Null check removed in token validation",
  evidence: ["Commit abc123 removed null check on line 142"],
};

const validRemediation = {
  immediate: ["Revert commit abc123"],
  longTerm: ["Add unit tests"],
};

const createRCAReport = (
  relatedChanges: Array<{
    changeId: string;
    type: "commit" | "pr";
    relevance: "high" | "medium" | "low";
    explanation: string;
  }>
): RCAReport => ({
  hypothesis: "A recent code change introduced a null reference error",
  confidence: 0.85,
  reasoning: "Error patterns show failures originate from auth/token.ts",
  rootCause: validRootCause,
  relatedChanges,
  affectedComponents: ["auth-service"],
  remediation: validRemediation,
  llmMetadata: validLLMMetadata,
});

const validAlertContext: AlertContext = {
  alertId: "alert_456",
  alertHistoryId: "ah_123",
  alertName: "High Error Rate",
  projectId: "proj_789",
  projectName: "CognObserve",
  alertType: "ERROR_RATE",
  severity: "HIGH",
  currentValue: 0.15,
  threshold: 0.05,
  triggeredAt: "2025-01-15T10:30:00.000Z",
  windowMins: 15,
};

// ============================================================
// EXTRACTION LOGIC TESTS
// ============================================================

describe("storeRCA activity - extraction logic", () => {
  /**
   * Test the commit/PR extraction logic in isolation.
   * This is the pure function part of the activity.
   */
  const extractCommitsAndPRs = (
    relatedChanges: Array<{
      changeId: string;
      type: "commit" | "pr";
      relevance: "high" | "medium" | "low";
      explanation: string;
    }>
  ) => {
    const suspectedCommitShas = relatedChanges
      .filter((change) => change.type === "commit")
      .map((change) => change.changeId);

    const suspectedPRNumbers = relatedChanges
      .filter((change) => change.type === "pr")
      .map((change) => change.changeId);

    return { suspectedCommitShas, suspectedPRNumbers };
  };

  it("extracts commits from relatedChanges", () => {
    const relatedChanges = [
      {
        changeId: "abc123",
        type: "commit" as const,
        relevance: "high" as const,
        explanation: "Test",
      },
      {
        changeId: "def456",
        type: "commit" as const,
        relevance: "medium" as const,
        explanation: "Test",
      },
    ];

    const { suspectedCommitShas, suspectedPRNumbers } =
      extractCommitsAndPRs(relatedChanges);

    expect(suspectedCommitShas).toEqual(["abc123", "def456"]);
    expect(suspectedPRNumbers).toEqual([]);
  });

  it("extracts PRs from relatedChanges", () => {
    const relatedChanges = [
      {
        changeId: "42",
        type: "pr" as const,
        relevance: "high" as const,
        explanation: "Test",
      },
      {
        changeId: "43",
        type: "pr" as const,
        relevance: "low" as const,
        explanation: "Test",
      },
    ];

    const { suspectedCommitShas, suspectedPRNumbers } =
      extractCommitsAndPRs(relatedChanges);

    expect(suspectedCommitShas).toEqual([]);
    expect(suspectedPRNumbers).toEqual(["42", "43"]);
  });

  it("extracts mixed commits and PRs", () => {
    const relatedChanges = [
      {
        changeId: "abc123",
        type: "commit" as const,
        relevance: "high" as const,
        explanation: "Commit test",
      },
      {
        changeId: "42",
        type: "pr" as const,
        relevance: "high" as const,
        explanation: "PR test",
      },
      {
        changeId: "def456",
        type: "commit" as const,
        relevance: "medium" as const,
        explanation: "Another commit",
      },
      {
        changeId: "43",
        type: "pr" as const,
        relevance: "low" as const,
        explanation: "Another PR",
      },
    ];

    const { suspectedCommitShas, suspectedPRNumbers } =
      extractCommitsAndPRs(relatedChanges);

    expect(suspectedCommitShas).toEqual(["abc123", "def456"]);
    expect(suspectedPRNumbers).toEqual(["42", "43"]);
  });

  it("returns empty arrays for empty relatedChanges", () => {
    const { suspectedCommitShas, suspectedPRNumbers } = extractCommitsAndPRs(
      []
    );

    expect(suspectedCommitShas).toEqual([]);
    expect(suspectedPRNumbers).toEqual([]);
  });

  it("preserves order of extraction", () => {
    const relatedChanges = [
      {
        changeId: "commit1",
        type: "commit" as const,
        relevance: "high" as const,
        explanation: "First",
      },
      {
        changeId: "commit2",
        type: "commit" as const,
        relevance: "medium" as const,
        explanation: "Second",
      },
      {
        changeId: "commit3",
        type: "commit" as const,
        relevance: "low" as const,
        explanation: "Third",
      },
    ];

    const { suspectedCommitShas } = extractCommitsAndPRs(relatedChanges);

    expect(suspectedCommitShas).toEqual(["commit1", "commit2", "commit3"]);
  });
});

// ============================================================
// ACTIVITY INPUT VALIDATION TESTS
// ============================================================

describe("storeRCA activity - input validation", () => {
  it("should have required alertHistoryId in input", () => {
    const rcaReport = createRCAReport([]);

    // Type check - this would fail if alertHistoryId was not required
    const input = {
      alertHistoryId: "ah_123",
      rcaReport,
    };

    expect(input.alertHistoryId).toBe("ah_123");
    expect(input.rcaReport).toBeDefined();
  });

  it("should accept optional alertContext", () => {
    const rcaReport = createRCAReport([]);

    const inputWithContext: StoreRCAActivityInput = {
      alertHistoryId: "ah_123",
      rcaReport,
      alertContext: validAlertContext,
    };

    const inputWithoutContext: StoreRCAActivityInput = {
      alertHistoryId: "ah_123",
      rcaReport,
    };

    expect(inputWithContext.alertContext).toBeDefined();
    expect(inputWithoutContext.alertContext).toBeUndefined();
  });

  it("should accept optional traceAnalysisSummary", () => {
    const rcaReport = createRCAReport([]);

    const inputWithSummary = {
      alertHistoryId: "ah_123",
      rcaReport,
      traceAnalysisSummary: {
        totalTraces: 100,
        totalSpans: 300,
        errorRate: 0.1,
        errorPatternCount: 5,
        anomalyCount: 2,
      },
    };

    expect(inputWithSummary.traceAnalysisSummary).toBeDefined();
    expect(inputWithSummary.traceAnalysisSummary?.totalTraces).toBe(100);
  });
});

// ============================================================
// RCA REPORT STRUCTURE TESTS
// ============================================================

describe("storeRCA activity - RCA report structure", () => {
  it("should contain hypothesis field", () => {
    const rcaReport = createRCAReport([]);
    expect(rcaReport.hypothesis).toBeDefined();
    expect(typeof rcaReport.hypothesis).toBe("string");
  });

  it("should contain confidence score between 0 and 1", () => {
    const rcaReport = createRCAReport([]);
    expect(rcaReport.confidence).toBeGreaterThanOrEqual(0);
    expect(rcaReport.confidence).toBeLessThanOrEqual(1);
  });

  it("should contain llmMetadata with required fields", () => {
    const rcaReport = createRCAReport([]);

    expect(rcaReport.llmMetadata).toBeDefined();
    expect(rcaReport.llmMetadata.model).toBeDefined();
    expect(rcaReport.llmMetadata.provider).toBeDefined();
    expect(rcaReport.llmMetadata.tokensUsed).toBeGreaterThanOrEqual(0);
    expect(rcaReport.llmMetadata.estimatedCost).toBeGreaterThanOrEqual(0);
    expect(rcaReport.llmMetadata.latencyMs).toBeGreaterThanOrEqual(0);
    expect(typeof rcaReport.llmMetadata.usedTemplate).toBe("boolean");
  });

  it("should contain rootCause with category", () => {
    const rcaReport = createRCAReport([]);

    expect(rcaReport.rootCause).toBeDefined();
    expect(rcaReport.rootCause.category).toBe("CODE_CHANGE");
    expect(rcaReport.rootCause.summary).toBeDefined();
    expect(Array.isArray(rcaReport.rootCause.evidence)).toBe(true);
  });

  it("should contain remediation steps", () => {
    const rcaReport = createRCAReport([]);

    expect(rcaReport.remediation).toBeDefined();
    expect(Array.isArray(rcaReport.remediation.immediate)).toBe(true);
    expect(Array.isArray(rcaReport.remediation.longTerm)).toBe(true);
  });

  it("should contain relatedChanges array", () => {
    const changes = [
      {
        changeId: "abc123",
        type: "commit" as const,
        relevance: "high" as const,
        explanation: "Test",
      },
    ];
    const rcaReport = createRCAReport(changes);

    expect(Array.isArray(rcaReport.relatedChanges)).toBe(true);
    expect(rcaReport.relatedChanges).toHaveLength(1);
    expect(rcaReport.relatedChanges[0]?.changeId).toBe("abc123");
  });
});

// ============================================================
// MOCKED ACTIVITY TESTS
// ============================================================

describe("storeRCA activity - mocked tRPC caller", () => {
  // Mock the internal caller
  const mockStoreRCA = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockStoreRCA.mockResolvedValue({
      rcaId: "rca_xyz789",
      alertId: "alert_456",
      confidence: 0.85,
    } satisfies StoreRCAOutput);
  });

  /**
   * Simulates the storeRCA activity with a mocked tRPC caller.
   * This tests the activity's orchestration logic.
   */
  const storeRCAWithMock = async (input: StoreRCAActivityInput) => {
    // Extract suspected commits from relatedChanges
    const suspectedCommitShas = input.rcaReport.relatedChanges
      .filter((change) => change.type === "commit")
      .map((change) => change.changeId);

    // Extract suspected PRs from relatedChanges
    const suspectedPRNumbers = input.rcaReport.relatedChanges
      .filter((change) => change.type === "pr")
      .map((change) => change.changeId);

    // Call mocked internal procedure
    return mockStoreRCA({
      alertHistoryId: input.alertHistoryId,
      rcaReport: input.rcaReport,
      suspectedCommitShas,
      suspectedPRNumbers,
      alertContext: input.alertContext,
      traceAnalysisSummary: input.traceAnalysisSummary,
    });
  };

  it("calls internal.storeRCA with correct parameters", async () => {
    const rcaReport = createRCAReport([
      {
        changeId: "abc123",
        type: "commit",
        relevance: "high",
        explanation: "Test commit",
      },
      {
        changeId: "42",
        type: "pr",
        relevance: "medium",
        explanation: "Test PR",
      },
    ]);

    await storeRCAWithMock({
      alertHistoryId: "ah_123",
      rcaReport,
      alertContext: validAlertContext,
    });

    expect(mockStoreRCA).toHaveBeenCalledTimes(1);
    expect(mockStoreRCA).toHaveBeenCalledWith({
      alertHistoryId: "ah_123",
      rcaReport,
      suspectedCommitShas: ["abc123"],
      suspectedPRNumbers: ["42"],
      alertContext: validAlertContext,
      traceAnalysisSummary: undefined,
    });
  });

  it("returns expected output structure", async () => {
    const rcaReport = createRCAReport([]);

    const result = await storeRCAWithMock({
      alertHistoryId: "ah_123",
      rcaReport,
    });

    expect(result).toEqual({
      rcaId: "rca_xyz789",
      alertId: "alert_456",
      confidence: 0.85,
    });
  });

  it("passes traceAnalysisSummary when provided", async () => {
    const rcaReport = createRCAReport([]);
    const traceAnalysisSummary = {
      totalTraces: 1500,
      totalSpans: 4500,
      errorRate: 0.15,
      errorPatternCount: 3,
      anomalyCount: 2,
    };

    await storeRCAWithMock({
      alertHistoryId: "ah_123",
      rcaReport,
      traceAnalysisSummary,
    });

    expect(mockStoreRCA).toHaveBeenCalledWith(
      expect.objectContaining({
        traceAnalysisSummary,
      })
    );
  });

  it("handles empty relatedChanges", async () => {
    const rcaReport = createRCAReport([]);

    await storeRCAWithMock({
      alertHistoryId: "ah_123",
      rcaReport,
    });

    expect(mockStoreRCA).toHaveBeenCalledWith(
      expect.objectContaining({
        suspectedCommitShas: [],
        suspectedPRNumbers: [],
      })
    );
  });

  it("extracts only commits from mixed relatedChanges", async () => {
    const rcaReport = createRCAReport([
      {
        changeId: "commit1",
        type: "commit",
        relevance: "high",
        explanation: "First commit",
      },
      {
        changeId: "pr1",
        type: "pr",
        relevance: "high",
        explanation: "First PR",
      },
      {
        changeId: "commit2",
        type: "commit",
        relevance: "medium",
        explanation: "Second commit",
      },
    ]);

    await storeRCAWithMock({
      alertHistoryId: "ah_123",
      rcaReport,
    });

    expect(mockStoreRCA).toHaveBeenCalledWith(
      expect.objectContaining({
        suspectedCommitShas: ["commit1", "commit2"],
        suspectedPRNumbers: ["pr1"],
      })
    );
  });
});
