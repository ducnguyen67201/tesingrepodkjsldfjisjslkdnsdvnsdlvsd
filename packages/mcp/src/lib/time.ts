import type { TimeRange } from "./schemas.js";

const TIME_RANGE_MS: Record<TimeRange, number> = {
  "1h": 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

export function parseTimeRange(range: TimeRange): Date {
  return new Date(Date.now() - TIME_RANGE_MS[range]);
}

export function calculatePercentiles(
  values: number[],
  percentiles: number[]
): Record<string, number> {
  if (values.length === 0) {
    return Object.fromEntries(percentiles.map((p) => [`p${p}`, 0]));
  }

  const result: Record<string, number> = {};
  for (const p of percentiles) {
    const index = Math.ceil((p / 100) * values.length) - 1;
    result[`p${p}`] = values[Math.max(0, index)] ?? 0;
  }

  return result;
}
