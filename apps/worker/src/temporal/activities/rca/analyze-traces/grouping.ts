/**
 * Span Grouping
 *
 * Functions for grouping spans by endpoint and model.
 */

import type { AffectedEndpoint, AffectedModel } from "../../../types";
import type { SpanRow } from "../types";
import { percentile } from "./summary";

/**
 * Group spans by endpoint (span name) and calculate statistics.
 */
export function groupByEndpoint(spans: SpanRow[]): AffectedEndpoint[] {
  const endpointMap = new Map<
    string,
    {
      errors: number;
      total: number;
      latencies: number[];
      sampleTraceIds: Set<string>;
    }
  >();

  for (const span of spans) {
    const existing = endpointMap.get(span.name) ?? {
      errors: 0,
      total: 0,
      latencies: [],
      sampleTraceIds: new Set(),
    };

    existing.total++;
    if (span.statusCode === "ERROR") existing.errors++;
    if (span.endTime) {
      existing.latencies.push(span.endTime.getTime() - span.startTime.getTime());
    }
    if (existing.sampleTraceIds.size < 3) {
      existing.sampleTraceIds.add(span.traceId);
    }

    endpointMap.set(span.name, existing);
  }

  return Array.from(endpointMap.entries())
    .map(([name, data]) => {
      const sortedLatencies = [...data.latencies].sort((a, b) => a - b);
      return {
        name,
        errorCount: data.errors,
        totalCount: data.total,
        errorRate: data.total > 0 ? data.errors / data.total : 0,
        latencyP95: percentile(sortedLatencies, 95),
        sampleTraceIds: Array.from(data.sampleTraceIds),
      };
    })
    .sort((a, b) => b.errorCount - a.errorCount)
    .slice(0, 20);
}

/**
 * Group spans by LLM model and calculate statistics.
 */
export function groupByModel(spans: SpanRow[]): AffectedModel[] {
  const modelMap = new Map<
    string,
    {
      errors: number;
      latencies: number[];
      tokens: number[];
      costs: number[];
    }
  >();

  const modelSpans = spans.filter((s) => s.model);

  for (const span of modelSpans) {
    const existing = modelMap.get(span.model!) ?? {
      errors: 0,
      latencies: [],
      tokens: [],
      costs: [],
    };

    if (span.statusCode === "ERROR") existing.errors++;
    if (span.endTime) {
      existing.latencies.push(span.endTime.getTime() - span.startTime.getTime());
    }

    const tokens = (span.promptTokens ?? 0) + (span.completionTokens ?? 0);
    if (tokens > 0) existing.tokens.push(tokens);
    if (span.totalCost) existing.costs.push(Number(span.totalCost));

    modelMap.set(span.model!, existing);
  }

  return Array.from(modelMap.entries())
    .map(([model, data]) => ({
      model,
      errorCount: data.errors,
      avgLatency:
        data.latencies.length > 0
          ? data.latencies.reduce((a, b) => a + b, 0) / data.latencies.length
          : 0,
      avgTokens:
        data.tokens.length > 0
          ? data.tokens.reduce((a, b) => a + b, 0) / data.tokens.length
          : 0,
      totalCost: data.costs.reduce((a, b) => a + b, 0),
    }))
    .sort((a, b) => b.errorCount - a.errorCount)
    .slice(0, 10);
}
