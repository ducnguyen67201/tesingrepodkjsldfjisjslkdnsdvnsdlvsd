// ============================================================
// EXPERIMENT ANALYSIS ACTIVITIES - A/B Testing Workflow
// ============================================================
// IMPORTANT: Temporal activities are READ-ONLY for database.
// All mutations go through tRPC internal procedures.
//
// Activities:
// - getExperimentWithVariants (READ)
// - aggregateVariantMetrics (READ)
// - markAnalysisStarted (tRPC mutation)
// - generateComparisonAnalysis (LLM - pure)
// - storeExperimentAnalysis (tRPC mutation)
// ============================================================

import { prisma } from "@cognobserve/db";
import { getInternalCaller } from "@/lib/trpc-caller";
import { getLLM } from "@/lib/llm-manager";
import {
  LLMComparisonResultSchema,
  type AggregatedVariantMetrics,
  type LLMComparisonResult,
  type VariantName,
  MIN_SPANS_FOR_ANALYSIS,
} from "@cognobserve/api/schemas";
import {
  COMPARE_VARIANTS_SYSTEM_PROMPT,
  COMPARE_VARIANTS_PROMPT_CONFIG,
  buildComparisonUserPrompt,
} from "@/prompts/experiment";

// ============================================================
// TYPES
// ============================================================

export interface ExperimentWithVariants {
  id: string;
  name: string;
  slug: string;
  projectId: string;
  status: string;
  variantA: VariantInfo;
  variantB: VariantInfo;
}

export interface VariantInfo {
  id: string;
  name: "A" | "B";
  weight: number;
  isControl: boolean;
  promptVersionId: string;
  promptName: string;
  promptSlug: string;
  promptVersion: number;
}

export interface ComparisonInput {
  variantA: AggregatedVariantMetrics;
  variantB: AggregatedVariantMetrics;
  experimentName: string;
}

// ============================================================
// READ-ONLY ACTIVITIES (Database reads)
// ============================================================

/**
 * Get experiment with both variants and prompt details (read-only)
 * Returns null if experiment not found
 */
export async function getExperimentWithVariants(
  experimentId: string
): Promise<ExperimentWithVariants | null> {
  console.log(`[Activity:getExperimentWithVariants] Fetching experiment: ${experimentId}`);

  const experiment = await prisma.promptExperiment.findUnique({
    where: { id: experimentId },
    include: {
      variants: {
        include: {
          promptVersion: {
            include: {
              prompt: {
                select: { name: true, slug: true },
              },
            },
          },
        },
      },
    },
  });

  if (!experiment) {
    console.log(`[Activity:getExperimentWithVariants] Experiment not found: ${experimentId}`);
    return null;
  }

  // Find variants A and B
  const variantA = experiment.variants.find((v) => v.name === "A");
  const variantB = experiment.variants.find((v) => v.name === "B");

  if (!variantA || !variantB) {
    console.log(`[Activity:getExperimentWithVariants] Missing variants for experiment: ${experimentId}`);
    return null;
  }

  console.log(`[Activity:getExperimentWithVariants] Found experiment: ${experiment.name}`);

  return {
    id: experiment.id,
    name: experiment.name,
    slug: experiment.slug,
    projectId: experiment.projectId,
    status: experiment.status,
    variantA: {
      id: variantA.id,
      name: "A",
      weight: variantA.weight,
      isControl: variantA.isControl,
      promptVersionId: variantA.promptVersionId,
      promptName: variantA.promptVersion.prompt?.name ?? "Unknown",
      promptSlug: variantA.promptVersion.prompt?.slug ?? "unknown",
      promptVersion: variantA.promptVersion.version,
    },
    variantB: {
      id: variantB.id,
      name: "B",
      weight: variantB.weight,
      isControl: variantB.isControl,
      promptVersionId: variantB.promptVersionId,
      promptName: variantB.promptVersion.prompt?.name ?? "Unknown",
      promptSlug: variantB.promptVersion.prompt?.slug ?? "unknown",
      promptVersion: variantB.promptVersion.version,
    },
  };
}

/**
 * Aggregate span metrics for a variant (read-only)
 * Queries spans with matching promptVariantId
 */
export async function aggregateVariantMetrics(
  variantId: string,
  variantInfo: VariantInfo
): Promise<AggregatedVariantMetrics> {
  console.log(`[Activity:aggregateVariantMetrics] Aggregating metrics for variant: ${variantId}`);

  // Query spans for this variant
  const spans = await prisma.span.findMany({
    where: {
      promptVariantId: variantId,
    },
    select: {
      id: true,
      statusCode: true,
      durationMs: true,
      promptTokens: true,
      completionTokens: true,
      totalTokens: true,
      totalCost: true,
    },
  });

  const totalSpans = spans.length;
  const errorSpans = spans.filter((s) => s.statusCode === "ERROR").length;
  const errorRate = totalSpans > 0 ? errorSpans / totalSpans : 0;

  // Calculate latency metrics
  const latencies = spans
    .map((s) => s.durationMs)
    .filter((d): d is number => d !== null)
    .sort((a, b) => a - b);

  let avgLatencyMs: number | null = null;
  let p50LatencyMs: number | null = null;
  let p95LatencyMs: number | null = null;
  let p99LatencyMs: number | null = null;
  let minLatencyMs: number | null = null;
  let maxLatencyMs: number | null = null;

  if (latencies.length > 0) {
    avgLatencyMs = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    minLatencyMs = latencies[0]!;
    maxLatencyMs = latencies[latencies.length - 1]!;
    p50LatencyMs = latencies[Math.floor(latencies.length * 0.5)]!;
    p95LatencyMs = latencies[Math.min(Math.floor(latencies.length * 0.95), latencies.length - 1)]!;
    p99LatencyMs = latencies[Math.min(Math.floor(latencies.length * 0.99), latencies.length - 1)]!;
  }

  // Calculate token usage
  const totalPromptTokens = spans.reduce((sum, s) => sum + (s.promptTokens ?? 0), 0);
  const totalCompletionTokens = spans.reduce((sum, s) => sum + (s.completionTokens ?? 0), 0);
  const totalTokens = spans.reduce((sum, s) => sum + (s.totalTokens ?? 0), 0);

  const avgPromptTokens = totalSpans > 0 ? totalPromptTokens / totalSpans : null;
  const avgCompletionTokens = totalSpans > 0 ? totalCompletionTokens / totalSpans : null;

  // Calculate cost
  const totalCost = spans.reduce((sum, s) => {
    const cost = s.totalCost ? Number(s.totalCost) : 0;
    return sum + cost;
  }, 0);
  const avgCost = totalSpans > 0 ? totalCost / totalSpans : null;

  const metrics: AggregatedVariantMetrics = {
    variantId,
    variantName: variantInfo.name as VariantName,
    isControl: variantInfo.isControl,
    promptVersionId: variantInfo.promptVersionId,
    promptName: variantInfo.promptName,
    promptVersion: variantInfo.promptVersion,
    totalSpans,
    errorSpans,
    errorRate,
    avgLatencyMs,
    p50LatencyMs,
    p95LatencyMs,
    p99LatencyMs,
    minLatencyMs,
    maxLatencyMs,
    totalPromptTokens,
    totalCompletionTokens,
    totalTokens,
    avgPromptTokens,
    avgCompletionTokens,
    totalCost,
    avgCost,
  };

  console.log(`[Activity:aggregateVariantMetrics] Variant ${variantInfo.name}: ${totalSpans} spans, ${errorRate.toFixed(2)} error rate`);
  return metrics;
}

// ============================================================
// MUTATION ACTIVITIES (via tRPC internal)
// ============================================================

/**
 * Mark analysis as started
 * Uses tRPC internal procedure for mutation
 */
export async function markAnalysisStarted(experimentId: string): Promise<void> {
  console.log(`[Activity:markAnalysisStarted] Starting analysis for: ${experimentId}`);

  const caller = getInternalCaller();
  await caller.internal.startExperimentAnalysis({ experimentId });

  console.log(`[Activity:markAnalysisStarted] Analysis started for: ${experimentId}`);
}

/**
 * Store experiment analysis results
 * Uses tRPC internal procedure for mutation
 */
export async function storeExperimentAnalysis(input: {
  experimentId: string;
  status: "completed" | "failed";
  result?: {
    analyzedAt: string;
    variantMetrics: {
      A: AggregatedVariantMetrics;
      B: AggregatedVariantMetrics;
    };
    comparison: LLMComparisonResult;
  };
  error?: string;
  winnerVariantId?: string | null;
  winnerConfidence?: number | null;
}): Promise<void> {
  console.log(`[Activity:storeExperimentAnalysis] Storing results for: ${input.experimentId}`);

  const caller = getInternalCaller();
  await caller.internal.updateExperimentAnalysis({
    experimentId: input.experimentId,
    status: input.status,
    result: input.result,
    error: input.error,
    winnerVariantId: input.winnerVariantId,
    winnerConfidence: input.winnerConfidence,
  });

  console.log(`[Activity:storeExperimentAnalysis] Results stored with status: ${input.status}`);
}

// ============================================================
// LLM ACTIVITIES
// ============================================================

/**
 * Generate comparison analysis using LLM
 * Returns structured comparison with winner determination
 */
export async function generateComparisonAnalysis(
  input: ComparisonInput
): Promise<LLMComparisonResult> {
  console.log(`[Activity:generateComparisonAnalysis] Comparing variants for: ${input.experimentName}`);

  const { variantA, variantB } = input;

  // Check if we have sufficient data
  const hasSufficientData =
    variantA.totalSpans >= MIN_SPANS_FOR_ANALYSIS &&
    variantB.totalSpans >= MIN_SPANS_FOR_ANALYSIS;

  if (!hasSufficientData) {
    console.log(`[Activity:generateComparisonAnalysis] Insufficient data for analysis`);

    // Return early with insufficient data result
    return {
      summary: `Insufficient data for meaningful analysis. Variant A has ${variantA.totalSpans} spans, Variant B has ${variantB.totalSpans} spans. Minimum ${MIN_SPANS_FOR_ANALYSIS} spans required per variant.`,
      winner: {
        variantName: null,
        variantId: null,
        reason: "Insufficient data to determine a winner",
      },
      confidence: 0,
      metricComparison: {
        latency: { winner: null, summary: "Insufficient data" },
        cost: { winner: null, summary: "Insufficient data" },
        errorRate: { winner: null, summary: "Insufficient data" },
        tokenEfficiency: { winner: null, summary: "Insufficient data" },
      },
      regressions: [],
      recommendations: [
        `Collect at least ${MIN_SPANS_FOR_ANALYSIS} spans per variant before analysis`,
        "Consider increasing traffic allocation if collection is slow",
      ],
      sufficientData: false,
      minimumSpansRecommendation: MIN_SPANS_FOR_ANALYSIS,
    };
  }

  // Build prompts from dedicated prompt file
  const systemPrompt = COMPARE_VARIANTS_SYSTEM_PROMPT;
  const userPrompt = buildComparisonUserPrompt(input);

  try {
    const llm = getLLM();
    const result = await llm.chat<LLMComparisonResult>(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      {
        schema: LLMComparisonResultSchema,
        temperature: COMPARE_VARIANTS_PROMPT_CONFIG.temperature,
        maxTokens: COMPARE_VARIANTS_PROMPT_CONFIG.maxTokens,
      }
    );

    const comparison = result.data;

    // Ensure sufficientData is set correctly
    comparison.sufficientData = true;

    console.log(`[Activity:generateComparisonAnalysis] Analysis complete. Winner: ${comparison.winner.variantName ?? "None"}`);
    return comparison;
  } catch (error) {
    console.error(`[Activity:generateComparisonAnalysis] LLM error:`, error);

    // Return a fallback comparison on error
    return {
      summary: `Failed to generate LLM analysis: ${error instanceof Error ? error.message : "Unknown error"}`,
      winner: {
        variantName: null,
        variantId: null,
        reason: "Analysis failed due to LLM error",
      },
      confidence: 0,
      metricComparison: {
        latency: { winner: null, summary: "Analysis failed" },
        cost: { winner: null, summary: "Analysis failed" },
        errorRate: { winner: null, summary: "Analysis failed" },
        tokenEfficiency: { winner: null, summary: "Analysis failed" },
      },
      regressions: [],
      recommendations: ["Retry the analysis", "Check LLM service availability"],
      sufficientData: true,
    };
  }
}
