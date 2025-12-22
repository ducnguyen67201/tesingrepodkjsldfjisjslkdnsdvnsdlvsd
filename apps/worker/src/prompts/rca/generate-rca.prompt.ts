/**
 * RCA Generation Prompt
 *
 * Prompt configuration for the generateRCA activity.
 */

import type { RCAGenerationInput } from "../../temporal/types";
import type { PromptConfig } from "../types";

// ============================================
// Configuration
// ============================================

/** Prompt configuration for generateRCA */
export const RCA_PROMPT_CONFIG: PromptConfig = {
  temperature: 0.3, // Low for consistent reasoning
  maxTokens: 1500, // Sufficient for RCA output
};

// ============================================
// System Prompt
// ============================================

/** System prompt - defines LLM role and guidelines */
export const RCA_SYSTEM_PROMPT = `You are an expert Site Reliability Engineer (SRE) analyzing a production incident.

Your task is to analyze the provided trace data and code changes to identify the most likely root cause of the alert.

Guidelines:
1. Be specific and actionable in your hypothesis
2. Cite evidence from the provided data
3. Confidence should reflect certainty (0.9+ = very certain, 0.5-0.7 = moderate, <0.5 = uncertain)
4. Prioritize recent code changes when they correlate with the error patterns
5. Suggest practical remediation steps that engineers can act on immediately

Focus on accuracy over speculation. If the data is insufficient, acknowledge uncertainty.`;

// ============================================
// User Prompt Builder
// ============================================

/** Build user prompt from RCA generation input */
export function buildRCAUserPrompt(input: RCAGenerationInput): string {
  const { alertContext, traceAnalysis, codeCorrelation } = input;
  const { summary, errorPatterns, affectedEndpoints, anomalies } = traceAnalysis;
  const { suspectedCommits, suspectedPRs } = codeCorrelation;

  const sections: string[] = [];

  // Alert context
  sections.push(`## Alert Context
- **Alert Name:** ${alertContext.alertName}
- **Type:** ${alertContext.alertType}
- **Severity:** ${alertContext.severity}
- **Current Value:** ${alertContext.currentValue}
- **Threshold:** ${alertContext.threshold}
- **Triggered At:** ${alertContext.triggeredAt}
- **Analysis Window:** ${alertContext.windowMins} minutes`);

  // Trace analysis summary
  sections.push(`## Trace Analysis Summary
- **Total Traces:** ${summary.totalTraces}
- **Total Spans:** ${summary.totalSpans}
- **Error Count:** ${summary.errorCount} (${(summary.errorRate * 100).toFixed(1)}% error rate)
- **Latency P50:** ${summary.latencyP50.toFixed(0)}ms
- **Latency P95:** ${summary.latencyP95.toFixed(0)}ms
- **Latency P99:** ${summary.latencyP99.toFixed(0)}ms`);

  // Error patterns (top 5)
  if (errorPatterns.length > 0) {
    const patterns = errorPatterns
      .slice(0, 5)
      .map(
        (e, i) =>
          `${i + 1}. "${e.message}" - ${e.count} occurrences (${e.percentage.toFixed(1)}%)${e.stackTrace ? `\n   Stack: ${e.stackTrace.slice(0, 200)}...` : ""}`
      )
      .join("\n");
    sections.push(`## Top Error Patterns\n${patterns}`);
  }

  // Affected endpoints (top 5)
  if (affectedEndpoints.length > 0) {
    const endpoints = affectedEndpoints
      .slice(0, 5)
      .map(
        (e) =>
          `- ${e.name}: ${e.errorCount} errors (${(e.errorRate * 100).toFixed(1)}%), P95: ${e.latencyP95.toFixed(0)}ms`
      )
      .join("\n");
    sections.push(`## Affected Endpoints\n${endpoints}`);
  }

  // Anomalies
  if (anomalies.length > 0) {
    const anomalyList = anomalies
      .map((a) => `- [${a.severity.toUpperCase()}] ${a.type}: ${a.description}`)
      .join("\n");
    sections.push(`## Detected Anomalies\n${anomalyList}`);
  }

  // Suspected commits (top 5)
  if (suspectedCommits.length > 0) {
    const commits = suspectedCommits
      .slice(0, 5)
      .map(
        (c) =>
          `- ${c.sha.slice(0, 7)}: "${c.message}" by ${c.author} (score: ${c.score.toFixed(2)})\n  Signals: temporal=${c.signals.temporal.toFixed(2)}, semantic=${c.signals.semantic.toFixed(2)}, pathMatch=${c.signals.pathMatch.toFixed(2)}`
      )
      .join("\n");
    sections.push(`## Suspected Commits\n${commits}`);
  } else if (codeCorrelation.hasRepository) {
    sections.push(
      `## Suspected Commits\nNo commits with significant correlation found in the lookback window.`
    );
  } else {
    sections.push(
      `## Suspected Commits\nNo GitHub repository linked to this project.`
    );
  }

  // Suspected PRs (top 3)
  if (suspectedPRs.length > 0) {
    const prs = suspectedPRs
      .slice(0, 3)
      .map(
        (pr) =>
          `- PR #${pr.number}: "${pr.title}" by ${pr.author} (score: ${pr.score.toFixed(2)})`
      )
      .join("\n");
    sections.push(`## Suspected Pull Requests\n${prs}`);
  }

  // Knowledge context (if available)
  if (input.knowledgeContext?.promptContext) {
    sections.push(input.knowledgeContext.promptContext);
  }

  // Instructions
  sections.push(`## Instructions
Analyze the above data and provide:
1. A clear hypothesis of the root cause
2. Your confidence level (0-1) based on evidence strength
3. The root cause category and supporting evidence
4. Related changes (commits/PRs) with relevance explanations
5. Immediate and long-term remediation steps

Respond with a structured analysis following the provided schema.`);

  return sections.join("\n\n");
}
