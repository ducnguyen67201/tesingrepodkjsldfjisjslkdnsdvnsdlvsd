import { describe, it, expect } from "vitest";
import {
  StoreRCAInputSchema,
  RCAReportSchema,
  LLMRCAOutputSchema,
  LLMMetadataSchema,
  AlertContextSchema,
  RootCauseCategorySchema,
  RelevanceLevelSchema,
} from "./rca";

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
  evidence: [
    "Commit abc123 removed null check on line 142",
    "Error rate spiked from 0.1% to 15%",
  ],
};

const validRemediation = {
  immediate: ["Revert commit abc123", "Add null check guard clause"],
  longTerm: ["Add unit tests for null token scenarios"],
};

const validLLMRCAOutput = {
  hypothesis: "A recent code change introduced a null reference error",
  confidence: 0.85,
  reasoning: "Error patterns show 95% of failures originate from auth/token.ts",
  rootCause: validRootCause,
  relatedChanges: [
    {
      changeId: "abc123",
      type: "commit" as const,
      relevance: "high" as const,
      explanation: "Removed null check in token validation",
    },
  ],
  affectedComponents: ["auth-service", "api-gateway"],
  remediation: validRemediation,
};

const validRCAReport = {
  ...validLLMRCAOutput,
  llmMetadata: validLLMMetadata,
};

const validAlertContext = {
  alertId: "alert_456",
  alertHistoryId: "ah_123",
  alertName: "High Error Rate - Auth Service",
  projectId: "proj_789",
  projectName: "Ducsigr",
  alertType: "ERROR_RATE" as const,
  severity: "HIGH" as const,
  currentValue: 0.15,
  threshold: 0.05,
  triggeredAt: "2025-01-15T10:30:00.000Z",
  windowMins: 15,
};

const validTraceAnalysisSummary = {
  totalTraces: 1500,
  totalSpans: 4500,
  errorRate: 0.15,
  errorPatternCount: 3,
  anomalyCount: 2,
};

// ============================================================
// LLMMetadataSchema TESTS
// ============================================================

describe("LLMMetadataSchema", () => {
  it("validates required fields", () => {
    const result = LLMMetadataSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("accepts valid LLM metadata", () => {
    const result = LLMMetadataSchema.safeParse(validLLMMetadata);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.model).toBe("claude-3-5-sonnet-20241022");
      expect(result.data.provider).toBe("anthropic");
      expect(result.data.tokensUsed).toBe(1234);
      expect(result.data.estimatedCost).toBe(0.0185);
      expect(result.data.latencyMs).toBe(2500);
      expect(result.data.usedTemplate).toBe(false);
    }
  });

  it("validates tokensUsed is non-negative integer", () => {
    const negative = LLMMetadataSchema.safeParse({
      ...validLLMMetadata,
      tokensUsed: -1,
    });
    expect(negative.success).toBe(false);
  });

  it("validates estimatedCost is non-negative", () => {
    const negative = LLMMetadataSchema.safeParse({
      ...validLLMMetadata,
      estimatedCost: -0.01,
    });
    expect(negative.success).toBe(false);
  });

  it("validates latencyMs is non-negative integer", () => {
    const negative = LLMMetadataSchema.safeParse({
      ...validLLMMetadata,
      latencyMs: -100,
    });
    expect(negative.success).toBe(false);
  });
});

// ============================================================
// RootCauseCategorySchema TESTS
// ============================================================

describe("RootCauseCategorySchema", () => {
  it("accepts valid root cause categories", () => {
    const categories = [
      "CODE_CHANGE",
      "INFRASTRUCTURE",
      "EXTERNAL_DEPENDENCY",
      "DATA_ISSUE",
      "CONFIGURATION",
      "UNKNOWN",
    ];

    for (const category of categories) {
      const result = RootCauseCategorySchema.safeParse(category);
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid category", () => {
    const result = RootCauseCategorySchema.safeParse("INVALID_CATEGORY");
    expect(result.success).toBe(false);
  });
});

// ============================================================
// RelevanceLevelSchema TESTS
// ============================================================

describe("RelevanceLevelSchema", () => {
  it("accepts valid relevance levels", () => {
    const levels = ["high", "medium", "low"];

    for (const level of levels) {
      const result = RelevanceLevelSchema.safeParse(level);
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid relevance level", () => {
    const result = RelevanceLevelSchema.safeParse("critical");
    expect(result.success).toBe(false);
  });
});

// ============================================================
// LLMRCAOutputSchema TESTS
// ============================================================

describe("LLMRCAOutputSchema", () => {
  it("validates required fields", () => {
    const result = LLMRCAOutputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("accepts valid LLM RCA output", () => {
    const result = LLMRCAOutputSchema.safeParse(validLLMRCAOutput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.hypothesis).toBe(validLLMRCAOutput.hypothesis);
      expect(result.data.confidence).toBe(0.85);
      expect(result.data.rootCause.category).toBe("CODE_CHANGE");
    }
  });

  it("validates confidence range 0-1", () => {
    const tooLow = LLMRCAOutputSchema.safeParse({
      ...validLLMRCAOutput,
      confidence: -0.1,
    });
    expect(tooLow.success).toBe(false);

    const tooHigh = LLMRCAOutputSchema.safeParse({
      ...validLLMRCAOutput,
      confidence: 1.1,
    });
    expect(tooHigh.success).toBe(false);

    const valid = LLMRCAOutputSchema.safeParse({
      ...validLLMRCAOutput,
      confidence: 0.5,
    });
    expect(valid.success).toBe(true);
  });

  it("validates relatedChanges max length of 5", () => {
    const tooMany = LLMRCAOutputSchema.safeParse({
      ...validLLMRCAOutput,
      relatedChanges: Array(6).fill({
        changeId: "abc123",
        type: "commit",
        relevance: "high",
        explanation: "Test",
      }),
    });
    expect(tooMany.success).toBe(false);

    const exactlyFive = LLMRCAOutputSchema.safeParse({
      ...validLLMRCAOutput,
      relatedChanges: Array(5).fill({
        changeId: "abc123",
        type: "commit",
        relevance: "high",
        explanation: "Test",
      }),
    });
    expect(exactlyFive.success).toBe(true);
  });

  it("validates relatedChanges type enum", () => {
    const invalidType = LLMRCAOutputSchema.safeParse({
      ...validLLMRCAOutput,
      relatedChanges: [
        {
          changeId: "abc123",
          type: "invalid",
          relevance: "high",
          explanation: "Test",
        },
      ],
    });
    expect(invalidType.success).toBe(false);
  });
});

// ============================================================
// RCAReportSchema TESTS
// ============================================================

describe("RCAReportSchema", () => {
  it("validates required fields", () => {
    const result = RCAReportSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("accepts valid RCA report", () => {
    const result = RCAReportSchema.safeParse(validRCAReport);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.hypothesis).toBe(validLLMRCAOutput.hypothesis);
      expect(result.data.llmMetadata.model).toBe("claude-3-5-sonnet-20241022");
    }
  });

  it("requires llmMetadata", () => {
    const result = RCAReportSchema.safeParse(validLLMRCAOutput);
    expect(result.success).toBe(false);
  });
});

// ============================================================
// AlertContextSchema TESTS
// ============================================================

describe("AlertContextSchema", () => {
  it("validates required fields", () => {
    const result = AlertContextSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("accepts valid alert context", () => {
    const result = AlertContextSchema.safeParse(validAlertContext);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.alertId).toBe("alert_456");
      expect(result.data.alertType).toBe("ERROR_RATE");
      expect(result.data.severity).toBe("HIGH");
    }
  });

  it("validates alertType enum", () => {
    const validTypes = ["ERROR_RATE", "LATENCY_P50", "LATENCY_P95", "LATENCY_P99"];
    for (const alertType of validTypes) {
      const result = AlertContextSchema.safeParse({
        ...validAlertContext,
        alertType,
      });
      expect(result.success).toBe(true);
    }

    const invalid = AlertContextSchema.safeParse({
      ...validAlertContext,
      alertType: "INVALID_TYPE",
    });
    expect(invalid.success).toBe(false);
  });

  it("validates triggeredAt is ISO datetime", () => {
    const valid = AlertContextSchema.safeParse(validAlertContext);
    expect(valid.success).toBe(true);

    const invalid = AlertContextSchema.safeParse({
      ...validAlertContext,
      triggeredAt: "not-a-date",
    });
    expect(invalid.success).toBe(false);
  });

  it("validates windowMins is positive", () => {
    const zero = AlertContextSchema.safeParse({
      ...validAlertContext,
      windowMins: 0,
    });
    expect(zero.success).toBe(false);

    const negative = AlertContextSchema.safeParse({
      ...validAlertContext,
      windowMins: -5,
    });
    expect(negative.success).toBe(false);
  });
});

// ============================================================
// StoreRCAInputSchema TESTS
// ============================================================

describe("StoreRCAInputSchema", () => {
  it("validates required alertHistoryId", () => {
    const result = StoreRCAInputSchema.safeParse({
      rcaReport: validRCAReport,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("alertHistoryId");
    }
  });

  it("validates required rcaReport", () => {
    const result = StoreRCAInputSchema.safeParse({
      alertHistoryId: "ah_123",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("rcaReport");
    }
  });

  it("accepts valid minimal input", () => {
    const result = StoreRCAInputSchema.safeParse({
      alertHistoryId: "ah_123",
      rcaReport: validRCAReport,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.alertHistoryId).toBe("ah_123");
      expect(result.data.rcaReport.hypothesis).toBe(validLLMRCAOutput.hypothesis);
      // Check defaults
      expect(result.data.suspectedCommitShas).toEqual([]);
      expect(result.data.suspectedPRNumbers).toEqual([]);
    }
  });

  it("accepts valid full input", () => {
    const input = {
      alertHistoryId: "ah_123",
      rcaReport: validRCAReport,
      suspectedCommitShas: ["abc123", "def456"],
      suspectedPRNumbers: ["42", "43"],
      alertContext: validAlertContext,
      traceAnalysisSummary: validTraceAnalysisSummary,
    };

    const result = StoreRCAInputSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.alertHistoryId).toBe("ah_123");
      expect(result.data.suspectedCommitShas).toEqual(["abc123", "def456"]);
      expect(result.data.suspectedPRNumbers).toEqual(["42", "43"]);
      expect(result.data.alertContext?.alertId).toBe("alert_456");
      expect(result.data.traceAnalysisSummary?.totalTraces).toBe(1500);
    }
  });

  it("applies default empty arrays for commit/PR arrays", () => {
    const result = StoreRCAInputSchema.safeParse({
      alertHistoryId: "ah_123",
      rcaReport: validRCAReport,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.suspectedCommitShas).toEqual([]);
      expect(result.data.suspectedPRNumbers).toEqual([]);
    }
  });

  it("validates suspectedCommitShas is array of strings", () => {
    const result = StoreRCAInputSchema.safeParse({
      alertHistoryId: "ah_123",
      rcaReport: validRCAReport,
      suspectedCommitShas: [123, 456], // numbers instead of strings
    });
    expect(result.success).toBe(false);
  });

  it("validates suspectedPRNumbers is array of strings", () => {
    const result = StoreRCAInputSchema.safeParse({
      alertHistoryId: "ah_123",
      rcaReport: validRCAReport,
      suspectedPRNumbers: [42, 43], // numbers instead of strings
    });
    expect(result.success).toBe(false);
  });

  it("validates traceAnalysisSummary structure", () => {
    const result = StoreRCAInputSchema.safeParse({
      alertHistoryId: "ah_123",
      rcaReport: validRCAReport,
      traceAnalysisSummary: {
        totalTraces: 100,
        // missing required fields
      },
    });
    expect(result.success).toBe(false);
  });

  it("accepts traceAnalysisSummary as optional", () => {
    const result = StoreRCAInputSchema.safeParse({
      alertHistoryId: "ah_123",
      rcaReport: validRCAReport,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.traceAnalysisSummary).toBeUndefined();
    }
  });

  it("accepts alertContext as optional", () => {
    const result = StoreRCAInputSchema.safeParse({
      alertHistoryId: "ah_123",
      rcaReport: validRCAReport,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.alertContext).toBeUndefined();
    }
  });

  it("validates nested rcaReport.llmMetadata", () => {
    const result = StoreRCAInputSchema.safeParse({
      alertHistoryId: "ah_123",
      rcaReport: {
        ...validLLMRCAOutput,
        llmMetadata: {
          ...validLLMMetadata,
          tokensUsed: -1, // invalid
        },
      },
    });
    expect(result.success).toBe(false);
  });

  it("validates nested rcaReport.confidence range", () => {
    const result = StoreRCAInputSchema.safeParse({
      alertHistoryId: "ah_123",
      rcaReport: {
        ...validRCAReport,
        confidence: 1.5, // invalid - exceeds 1
      },
    });
    expect(result.success).toBe(false);
  });
});
