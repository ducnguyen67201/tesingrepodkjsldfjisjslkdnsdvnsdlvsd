import { describe, it, expect } from "vitest";
import {
  TrackedUserInputSchema,
  TrackedUserListFiltersSchema,
  TrackedUserWithStatsSchema,
  TrackedUserAnalyticsSchema,
  UpdateTrackedUserSchema,
  TrackedUserSummarySchema,
} from "./trackedUsers";

describe("TrackedUserInputSchema", () => {
  it("validates required id field", () => {
    const result = TrackedUserInputSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toContain("id");
    }
  });

  it("validates minimum id length", () => {
    const result = TrackedUserInputSchema.safeParse({ id: "" });
    expect(result.success).toBe(false);
  });

  it("validates maximum id length", () => {
    const longId = "a".repeat(256);
    const result = TrackedUserInputSchema.safeParse({ id: longId });
    expect(result.success).toBe(false);
  });

  it("accepts valid minimal input", () => {
    const result = TrackedUserInputSchema.safeParse({ id: "user_123" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe("user_123");
    }
  });

  it("accepts valid full input", () => {
    const input = {
      id: "user_123",
      name: "John Doe",
      email: "john@example.com",
      metadata: { plan: "pro", company: "Acme" },
    };
    const result = TrackedUserInputSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(input);
    }
  });

  it("validates email format", () => {
    const result = TrackedUserInputSchema.safeParse({
      id: "user_123",
      email: "invalid-email",
    });
    expect(result.success).toBe(false);
  });

  it("validates name max length", () => {
    const longName = "a".repeat(256);
    const result = TrackedUserInputSchema.safeParse({
      id: "user_123",
      name: longName,
    });
    expect(result.success).toBe(false);
  });
});

describe("TrackedUserListFiltersSchema", () => {
  it("requires projectId", () => {
    const result = TrackedUserListFiltersSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("accepts minimal input with defaults", () => {
    const result = TrackedUserListFiltersSchema.safeParse({ projectId: "proj_123" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.projectId).toBe("proj_123");
      expect(result.data.sortBy).toBe("lastSeenAt");
      expect(result.data.sortOrder).toBe("desc");
      expect(result.data.limit).toBe(50);
    }
  });

  it("validates sortBy enum values", () => {
    const result = TrackedUserListFiltersSchema.safeParse({
      projectId: "proj_123",
      sortBy: "invalidSort",
    });
    expect(result.success).toBe(false);
  });

  it("validates sortOrder enum values", () => {
    const result = TrackedUserListFiltersSchema.safeParse({
      projectId: "proj_123",
      sortOrder: "invalid",
    });
    expect(result.success).toBe(false);
  });

  it("validates limit range", () => {
    const tooLow = TrackedUserListFiltersSchema.safeParse({
      projectId: "proj_123",
      limit: 0,
    });
    expect(tooLow.success).toBe(false);

    const tooHigh = TrackedUserListFiltersSchema.safeParse({
      projectId: "proj_123",
      limit: 101,
    });
    expect(tooHigh.success).toBe(false);

    const valid = TrackedUserListFiltersSchema.safeParse({
      projectId: "proj_123",
      limit: 50,
    });
    expect(valid.success).toBe(true);
  });

  it("accepts all sort options", () => {
    const sortOptions = ["lastSeenAt", "firstSeenAt", "traceCount", "totalCost"];
    for (const sortBy of sortOptions) {
      const result = TrackedUserListFiltersSchema.safeParse({
        projectId: "proj_123",
        sortBy,
      });
      expect(result.success).toBe(true);
    }
  });

  it("accepts date filters", () => {
    const result = TrackedUserListFiltersSchema.safeParse({
      projectId: "proj_123",
      from: new Date("2024-01-01"),
      to: new Date("2024-12-31"),
    });
    expect(result.success).toBe(true);
  });
});

describe("TrackedUserWithStatsSchema", () => {
  it("validates required fields", () => {
    const result = TrackedUserWithStatsSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("accepts valid user with stats", () => {
    const now = new Date();
    const user = {
      id: "user_123",
      projectId: "proj_123",
      externalId: "ext_123",
      name: "John Doe",
      email: "john@example.com",
      metadata: { plan: "pro" },
      firstSeenAt: now,
      lastSeenAt: now,
      traceCount: 100,
      sessionCount: 10,
      totalTokens: 50000,
      totalCost: 1.5,
      errorCount: 5,
      errorRate: 5.0,
      avgLatencyMs: 250,
    };

    const result = TrackedUserWithStatsSchema.safeParse(user);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.traceCount).toBe(100);
      expect(result.data.totalCost).toBe(1.5);
      expect(result.data.errorRate).toBe(5.0);
    }
  });

  it("accepts null for optional fields", () => {
    const now = new Date();
    const user = {
      id: "user_123",
      projectId: "proj_123",
      externalId: "ext_123",
      name: null,
      email: null,
      metadata: null,
      firstSeenAt: now,
      lastSeenAt: now,
      traceCount: 0,
      sessionCount: 0,
      totalTokens: 0,
      totalCost: 0,
      errorCount: 0,
      errorRate: 0,
      avgLatencyMs: null,
    };

    const result = TrackedUserWithStatsSchema.safeParse(user);
    expect(result.success).toBe(true);
  });
});

describe("TrackedUserAnalyticsSchema", () => {
  it("validates analytics data point", () => {
    const result = TrackedUserAnalyticsSchema.safeParse({
      date: new Date(),
      traceCount: 50,
      totalTokens: 25000,
      totalCost: 0.75,
      errorCount: 2,
    });
    expect(result.success).toBe(true);
  });

  it("requires all fields", () => {
    const result = TrackedUserAnalyticsSchema.safeParse({
      date: new Date(),
      traceCount: 50,
      // missing other fields
    });
    expect(result.success).toBe(false);
  });
});

describe("UpdateTrackedUserSchema", () => {
  it("requires id field", () => {
    const result = UpdateTrackedUserSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("accepts partial updates", () => {
    const result = UpdateTrackedUserSchema.safeParse({
      id: "user_123",
      name: "Updated Name",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Updated Name");
      expect(result.data.email).toBeUndefined();
    }
  });

  it("validates email if provided", () => {
    const result = UpdateTrackedUserSchema.safeParse({
      id: "user_123",
      email: "invalid",
    });
    expect(result.success).toBe(false);
  });

  it("accepts metadata updates", () => {
    const result = UpdateTrackedUserSchema.safeParse({
      id: "user_123",
      metadata: { plan: "enterprise", tier: 3 },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.metadata).toEqual({ plan: "enterprise", tier: 3 });
    }
  });
});

describe("TrackedUserSummarySchema", () => {
  it("validates summary structure", () => {
    const summary = {
      totalUsers: 100,
      activeUsers: 45,
      newUsers: 12,
      topUsersByCost: [
        { userId: "u1", externalId: "ext1", name: "Top User", totalCost: 50.0 },
        { userId: "u2", externalId: "ext2", name: null, totalCost: 30.0 },
      ],
    };

    const result = TrackedUserSummarySchema.safeParse(summary);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.totalUsers).toBe(100);
      expect(result.data.topUsersByCost).toHaveLength(2);
    }
  });

  it("accepts empty top users array", () => {
    const summary = {
      totalUsers: 0,
      activeUsers: 0,
      newUsers: 0,
      topUsersByCost: [],
    };

    const result = TrackedUserSummarySchema.safeParse(summary);
    expect(result.success).toBe(true);
  });
});
