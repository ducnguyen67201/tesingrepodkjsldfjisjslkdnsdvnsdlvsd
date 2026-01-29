/**
 * Cost Tracking Schemas
 *
 * Zod schemas for cost analytics API.
 */

import { z } from "zod";

/**
 * Preset time ranges
 */
export const PresetTimeRangeSchema = z.enum(["24h", "7d", "30d"]);
export type PresetTimeRange = z.infer<typeof PresetTimeRangeSchema>;
export const ALL_PRESET_TIME_RANGES: readonly PresetTimeRange[] = PresetTimeRangeSchema.options;

/**
 * Custom date range
 */
export const CustomDateRangeSchema = z.object({
  from: z.string(), // ISO date string
  to: z.string(),   // ISO date string
});
export type CustomDateRange = z.infer<typeof CustomDateRangeSchema>;

/**
 * Time range for cost queries - can be preset or custom
 */
export const TimeRangeSchema = z.union([
  PresetTimeRangeSchema,
  z.literal("custom"),
]);
export type TimeRange = z.infer<typeof TimeRangeSchema>;
export const ALL_TIME_RANGES: readonly (PresetTimeRange | "custom")[] = [...PresetTimeRangeSchema.options, "custom"];

/**
 * Cost overview - summary stats for a project
 */
export const CostOverviewSchema = z.object({
  totalCost: z.number(),
  costChange: z.number(), // % vs previous period
  totalTokens: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  tokenChange: z.number(),
  avgCostPerTrace: z.number(),
  billableSpans: z.number(),
  breakdown: z.object({
    inputCost: z.number(),
    outputCost: z.number(),
  }),
});
export type CostOverview = z.infer<typeof CostOverviewSchema>;

/**
 * Model cost breakdown - per-model stats
 */
export const ModelCostBreakdownSchema = z.object({
  model: z.string(),
  displayName: z.string(),
  provider: z.string(),
  cost: z.number(),
  percentage: z.number(),
  tokens: z.number(),
  spanCount: z.number(),
});
export type ModelCostBreakdown = z.infer<typeof ModelCostBreakdownSchema>;

/**
 * Cost time series point
 */
export const CostTimePointSchema = z.object({
  date: z.string(),
  cost: z.number(),
  inputCost: z.number(),
  outputCost: z.number(),
  tokens: z.number(),
});
export type CostTimePoint = z.infer<typeof CostTimePointSchema>;

/**
 * LLM Provider schema
 */
export const LLMProviderSchema = z.enum([
  "openai",
  "anthropic",
  "google",
  "mistral",
  "cohere",
  "meta",
  "unknown",
]);
export type LLMProvider = z.infer<typeof LLMProviderSchema>;

/**
 * Model pricing info
 */
export const ModelPricingSchema = z.object({
  id: z.string(),
  provider: z.string(),
  model: z.string(),
  displayName: z.string(),
  inputPricePerMillion: z.number(),
  outputPricePerMillion: z.number(),
});
export type ModelPricing = z.infer<typeof ModelPricingSchema>;
