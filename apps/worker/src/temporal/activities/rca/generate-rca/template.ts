/**
 * Template-Based RCA Generation
 *
 * Fallback for low-severity alerts with minimal data.
 * Zero LLM cost - uses static templates.
 */

import { TEMPLATE_FALLBACK_CONDITIONS } from "../../../../lib/llm-config";
import {
  TEMPLATE_REMEDIATION,
  TEMPLATE_REASONING,
  TEMPLATE_CONFIDENCE,
} from "../../../../prompts/rca";
import type {
  RCAGenerationInput,
  RCAReport,
  RelatedChange,
  RootCauseCategory,
} from "../../../types";

/**
 * Check if template-based RCA should be used (cost optimization).
 *
 * Template is used when ALL conditions are met:
 * - LOW severity alert
 * - Minimal error patterns (≤1)
 * - No suspected commits
 * - No anomalies detected
 *
 * @param input - RCA generation input
 * @returns True if template should be used
 */
export function shouldUseTemplate(input: RCAGenerationInput): boolean {
  const { alertContext, traceAnalysis, codeCorrelation } = input;
  const { severity } = alertContext;
  const conditions = TEMPLATE_FALLBACK_CONDITIONS;

  // Only LOW severity qualifies
  if (severity !== conditions.maxSeverity) return false;

  // Check data thresholds
  const hasMinimalErrors =
    traceAnalysis.errorPatterns.length <= conditions.maxErrorPatterns;
  const hasNoSuspectedCommits =
    codeCorrelation.suspectedCommits.length <= conditions.maxSuspectedCommits;
  const hasNoAnomalies =
    traceAnalysis.anomalies.length <= conditions.maxAnomalies;

  return hasMinimalErrors && hasNoSuspectedCommits && hasNoAnomalies;
}

/**
 * Generate template-based RCA (no LLM cost).
 *
 * @param input - RCA generation input
 * @param startTime - When generation started (for latency tracking)
 * @param isErrorFallback - Whether this is a fallback due to LLM error
 * @returns RCA report with template-based content
 */
export function generateTemplateRCA(
  input: RCAGenerationInput,
  startTime: number,
  isErrorFallback = false
): RCAReport {
  const { alertContext, traceAnalysis, codeCorrelation } = input;

  // Build hypothesis from available data
  const topError = traceAnalysis.errorPatterns[0];
  const topCommit = codeCorrelation.suspectedCommits[0];

  let hypothesis: string;
  let category: RootCauseCategory = "UNKNOWN";
  const evidence: string[] = [];

  if (topError) {
    hypothesis = `Elevated ${alertContext.alertType.toLowerCase().replace("_", " ")} likely caused by: ${topError.message.slice(0, 100)}`;
    evidence.push(
      `Error occurred ${topError.count} times (${topError.percentage.toFixed(1)}% of errors)`
    );
    category = "CODE_CHANGE";
  } else if (topCommit) {
    hypothesis = `Recent code change may have introduced the issue: ${topCommit.message.slice(0, 100)}`;
    evidence.push(
      `Commit ${topCommit.sha.slice(0, 7)} by ${topCommit.author} (correlation score: ${topCommit.score.toFixed(2)})`
    );
    category = "CODE_CHANGE";
  } else {
    hypothesis = `${alertContext.alertType.replace("_", " ")} threshold exceeded. Further investigation needed.`;
    category = "UNKNOWN";
  }

  // Build related changes
  const relatedChanges: RelatedChange[] = codeCorrelation.suspectedCommits
    .slice(0, 3)
    .map((commit) => ({
      changeId: commit.sha,
      type: "commit" as const,
      relevance:
        commit.score > 0.7 ? "high" : commit.score > 0.4 ? "medium" : "low",
      explanation: `Commit "${commit.message.slice(0, 50)}..." has correlation score ${commit.score.toFixed(2)}`,
    }));

  // Add PRs
  codeCorrelation.suspectedPRs.slice(0, 2).forEach((pr) => {
    relatedChanges.push({
      changeId: String(pr.number),
      type: "pr" as const,
      relevance: pr.score > 0.7 ? "high" : pr.score > 0.4 ? "medium" : "low",
      explanation: `PR #${pr.number} "${pr.title.slice(0, 50)}..." merged recently`,
    });
  });

  const latencyMs = Date.now() - startTime;

  return {
    hypothesis,
    confidence: TEMPLATE_CONFIDENCE,
    reasoning: isErrorFallback
      ? TEMPLATE_REASONING.errorFallback
      : TEMPLATE_REASONING.costOptimization,
    rootCause: {
      category,
      summary: hypothesis,
      evidence,
    },
    relatedChanges,
    affectedComponents: traceAnalysis.affectedEndpoints
      .slice(0, 5)
      .map((e) => e.name),
    remediation: TEMPLATE_REMEDIATION,
    llmMetadata: {
      model: "template",
      provider: "none",
      tokensUsed: 0,
      estimatedCost: 0,
      latencyMs,
      usedTemplate: true,
    },
  };
}
