import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseTimeRange, calculatePercentiles } from "../../lib/time.js";

describe("parseTimeRange", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-02-04T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("parses 1h", () => {
    const result = parseTimeRange("1h");
    expect(result.getTime()).toBe(new Date("2025-02-04T11:00:00Z").getTime());
  });

  it("parses 6h", () => {
    const result = parseTimeRange("6h");
    expect(result.getTime()).toBe(new Date("2025-02-04T06:00:00Z").getTime());
  });

  it("parses 24h", () => {
    const result = parseTimeRange("24h");
    expect(result.getTime()).toBe(new Date("2025-02-03T12:00:00Z").getTime());
  });

  it("parses 7d", () => {
    const result = parseTimeRange("7d");
    expect(result.getTime()).toBe(new Date("2025-01-28T12:00:00Z").getTime());
  });

  it("parses 30d", () => {
    const result = parseTimeRange("30d");
    expect(result.getTime()).toBe(new Date("2025-01-05T12:00:00Z").getTime());
  });

});

describe("calculatePercentiles", () => {
  it("returns zeros for empty array", () => {
    const result = calculatePercentiles([], [50, 90, 95, 99]);
    expect(result).toEqual({ p50: 0, p90: 0, p95: 0, p99: 0 });
  });

  it("returns same value for single element", () => {
    const result = calculatePercentiles([100], [50, 90, 95, 99]);
    expect(result).toEqual({ p50: 100, p90: 100, p95: 100, p99: 100 });
  });

  it("calculates correct percentiles", () => {
    const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    const result = calculatePercentiles(values, [50, 90, 95, 99]);

    expect(result.p50).toBe(50);
    expect(result.p90).toBe(90);
    expect(result.p95).toBe(100);
    expect(result.p99).toBe(100);
  });

  it("handles two elements", () => {
    const values = [100, 200];
    const result = calculatePercentiles(values, [50]);
    expect(result.p50).toBe(100);
  });
});
