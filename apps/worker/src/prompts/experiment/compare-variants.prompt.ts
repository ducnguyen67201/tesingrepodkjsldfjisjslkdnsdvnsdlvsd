/**
 * A/B Experiment Variant Comparison Prompt
 *
 * Prompt configuration for the generateComparisonAnalysis activity.
 * Compares two prompt variants based on aggregated metrics.
 */

import type { PromptConfig } from "../types";
import type { AggregatedVariantMetrics } from "@ducsigr/api/schemas";

// ============================================
// Configuration
// ============================================

/** Prompt configuration for variant comparison */
export const COMPARE_VARIANTS_PROMPT_CONFIG: PromptConfig = {
  temperature: 0.3, // Low for consistent analysis
  maxTokens: 2000, // Sufficient for detailed comparison
};

// ============================================
// Types
// ============================================

export interface ComparisonInput {
  variantA: AggregatedVariantMetrics;
  variantB: AggregatedVariantMetrics;
  experimentName: string;
}

// ============================================
// System Prompt
// ============================================

/** System prompt - defines LLM role and guidelines */
export const COMPARE_VARIANTS_SYSTEM_PROMPT = `You are an expert A/B testing analyst for AI/LLM applications. Your task is to analyze metrics from a prompt A/B experiment and determine which variant performs better.

## Analysis Framework

Evaluate variants using these factors in order of importance:

1. **Error Rate** (Critical - 40% weight)
   - Lower is better
   - Any increase in errors is a potential regression
   - Consider both absolute rate and relative difference

2. **Latency** (High - 30% weight)
   - Lower average and P95 latency is better
   - User experience depends on response time
   - Flag significant latency regressions (>20% increase)

3. **Cost Efficiency** (Medium - 20% weight)
   - Lower cost per request is better
   - Consider total cost and average cost per span
   - Balance cost against quality (errors, latency)

4. **Token Efficiency** (Low - 10% weight)
   - Reasonable token usage without excessive costs
   - Watch for token bloat in either prompt or completion

## Guidelines

1. Be objective and data-driven
2. Acknowledge statistical uncertainty with small sample sizes
3. Recommend the control variant when differences are not significant
4. Identify any regressions (treatment performing worse than control)
5. Provide actionable recommendations

## Output Structure

Your response must follow the provided JSON schema with:
- summary: Brief overall analysis (2-3 sentences)
- winner: Which variant wins (A, B, or null if no clear winner)
- confidence: 0-1 score based on data quality and difference magnitude
- metricComparison: Per-metric analysis
- regressions: List any metrics where treatment is worse
- recommendations: Actionable next steps`;

// ============================================
// User Prompt Builder
// ============================================

/** Build user prompt from comparison input */
export function buildComparisonUserPrompt(input: ComparisonInput): string {
  const { variantA, variantB, experimentName } = input;

  const sections: string[] = [];

  // Header
  sections.push(`# A/B Experiment Analysis: "${experimentName}"`);

  // Variant A details
  sections.push(buildVariantSection(variantA, "A"));

  // Variant B details
  sections.push(buildVariantSection(variantB, "B"));

  // Data quality assessment
  sections.push(buildDataQualitySection(variantA, variantB));

  // Instructions
  sections.push(`## Analysis Instructions

Compare the two variants above and provide:

1. **Winner Determination**
   - Which variant performs better overall?
   - If differences are negligible, recommend staying with control
   - Provide confidence score (0-1) based on data quality

2. **Metric-by-Metric Comparison**
   - Latency: Compare avg and P95
   - Cost: Compare per-request cost
   - Error Rate: Compare reliability
   - Token Efficiency: Compare token usage

3. **Regression Analysis**
   - Does treatment (usually B) perform worse than control on any metric?
   - Flag any concerning patterns

4. **Recommendations**
   - Should the experiment continue?
   - Should the winner be promoted?
   - What improvements could be made?

Respond with a structured analysis following the provided JSON schema.`);

  return sections.join("\n\n");
}

// ============================================
// Helper Functions
// ============================================

function buildVariantSection(
  variant: AggregatedVariantMetrics,
  name: string
): string {
  const role = variant.isControl ? "Control" : "Treatment";

  return `## Variant ${name} (${role})

**Prompt:** ${variant.promptName} v${variant.promptVersion}

### Usage Metrics
- **Total Spans:** ${variant.totalSpans}
- **Error Spans:** ${variant.errorSpans}
- **Error Rate:** ${(variant.errorRate * 100).toFixed(2)}%

### Latency Metrics
- **Avg Latency:** ${formatMs(variant.avgLatencyMs)}
- **P50 Latency:** ${formatMs(variant.p50LatencyMs)}
- **P95 Latency:** ${formatMs(variant.p95LatencyMs)}
- **P99 Latency:** ${formatMs(variant.p99LatencyMs)}
- **Min/Max:** ${formatMs(variant.minLatencyMs)} / ${formatMs(variant.maxLatencyMs)}

### Cost Metrics
- **Total Cost:** ${formatCost(variant.totalCost)}
- **Avg Cost per Request:** ${formatCost(variant.avgCost)}

### Token Usage
- **Avg Prompt Tokens:** ${formatNumber(variant.avgPromptTokens)}
- **Avg Completion Tokens:** ${formatNumber(variant.avgCompletionTokens)}
- **Total Tokens Used:** ${variant.totalTokens.toLocaleString()}`;
}

function buildDataQualitySection(
  variantA: AggregatedVariantMetrics,
  variantB: AggregatedVariantMetrics
): string {
  const minSpans = Math.min(variantA.totalSpans, variantB.totalSpans);
  const maxSpans = Math.max(variantA.totalSpans, variantB.totalSpans);
  const imbalance = maxSpans > 0 ? (maxSpans - minSpans) / maxSpans : 0;

  let quality = "High";
  let notes: string[] = [];

  if (minSpans < 100) {
    quality = "Low";
    notes.push("Sample size is small - results may not be statistically significant");
  } else if (minSpans < 500) {
    quality = "Medium";
    notes.push("Moderate sample size - consider running longer for more confidence");
  }

  if (imbalance > 0.3) {
    notes.push(`Traffic imbalance detected (${(imbalance * 100).toFixed(0)}% difference)`);
  }

  if (variantA.totalSpans === 0 || variantB.totalSpans === 0) {
    quality = "Insufficient";
    notes = ["One or both variants have no data"];
  }

  return `## Data Quality Assessment

- **Quality:** ${quality}
- **Variant A Samples:** ${variantA.totalSpans}
- **Variant B Samples:** ${variantB.totalSpans}
${notes.length > 0 ? `\n**Notes:**\n${notes.map((n) => `- ${n}`).join("\n")}` : ""}`;
}

function formatMs(value: number | null): string {
  if (value === null) return "N/A";
  return `${value.toFixed(2)}ms`;
}

function formatCost(value: number | null): string {
  if (value === null) return "N/A";
  return `$${value.toFixed(6)}`;
}

function formatNumber(value: number | null): string {
  if (value === null) return "N/A";
  return value.toFixed(0);
}
