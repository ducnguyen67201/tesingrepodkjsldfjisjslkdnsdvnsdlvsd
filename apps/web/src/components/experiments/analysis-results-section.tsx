"use client";

import {
  Trophy,
  Clock,
  Loader2,
  AlertCircle,
  FlaskConical,
} from "lucide-react";

// ============================================================
// Types
// ============================================================

export interface AnalysisVariant {
  id: string;
  name: "A" | "B";
  isControl: boolean;
  promptVersion?: {
    version: number;
    prompt?: { name: string } | null;
  };
}

export interface AnalysisResultsSectionProps {
  status: "pending" | "running" | "completed" | "failed";
  error?: string | null;
  result?: Record<string, unknown> | null;
  winnerVariantId?: string | null;
  winnerConfidence?: number | null;
  variants: AnalysisVariant[];
}

// ============================================================
// Helper Functions
// ============================================================

interface ParsedAnalysisResult {
  summary: string | null;
  metricComparison: Record<
    string,
    { winner: string | null; summary: string }
  > | null;
  recommendations: string[];
}

function parseAnalysisResult(
  result: Record<string, unknown> | null | undefined
): ParsedAnalysisResult {
  if (!result || typeof result !== "object") {
    return { summary: null, metricComparison: null, recommendations: [] };
  }

  const summary =
    "summary" in result && typeof result.summary === "string"
      ? result.summary
      : null;

  const metricComparison =
    "metricComparison" in result &&
    result.metricComparison &&
    typeof result.metricComparison === "object"
      ? (result.metricComparison as Record<
          string,
          { winner: string | null; summary: string }
        >)
      : null;

  const recommendations =
    "recommendations" in result && Array.isArray(result.recommendations)
      ? (result.recommendations as string[])
      : [];

  return { summary, metricComparison, recommendations };
}

// ============================================================
// Metric Comparison Component
// ============================================================

function MetricComparisonSection({
  metricComparison,
}: {
  metricComparison: Record<string, { winner: string | null; summary: string }>;
}) {
  return (
    <div className="border-t pt-3 mt-3 space-y-2">
      <p className="text-xs font-medium">Metric Comparison</p>
      <div className="grid grid-cols-2 gap-2">
        {Object.entries(metricComparison).map(([metric, data]) => (
          <div key={metric} className="bg-muted/30 rounded p-2 text-xs">
            <p className="font-medium capitalize">{metric}</p>
            <p className="text-muted-foreground mt-0.5">{data.summary}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// Main Component
// ============================================================

export function AnalysisResultsSection({
  status,
  error,
  result,
  winnerVariantId,
  winnerConfidence,
  variants,
}: AnalysisResultsSectionProps) {
  const winnerVariant = winnerVariantId
    ? variants.find((v) => v.id === winnerVariantId)
    : null;

  // Parse the result for safe access
  const parsedResult = parseAnalysisResult(result);

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium flex items-center gap-2">
        <Trophy className="h-4 w-4" />
        LLM Analysis
      </h3>

      <div className="rounded-lg border bg-background p-4">
        {/* Status badges */}
        {status === "pending" && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span className="text-sm">Analysis pending...</span>
          </div>
        )}

        {status === "running" && (
          <div className="flex items-center gap-2 text-blue-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Analyzing experiment data...</span>
          </div>
        )}

        {status === "failed" && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-red-600">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm font-medium">Analysis failed</span>
            </div>
            {error && (
              <p className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                {error}
              </p>
            )}
          </div>
        )}

        {status === "completed" && (
          <div className="space-y-4">
            {/* Winner section */}
            {winnerVariant ? (
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-green-100 p-2 dark:bg-green-900/30">
                  <Trophy className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-sm font-medium">
                    Variant {winnerVariant.name} wins
                    {winnerVariant.isControl ? " (Control)" : " (Treatment)"}
                  </p>
                  {winnerConfidence != null && (
                    <p className="text-xs text-muted-foreground">
                      {Math.round(winnerConfidence * 100)}% confidence
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-muted p-2">
                  <FlaskConical className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium">No clear winner</p>
                  <p className="text-xs text-muted-foreground">
                    Both variants perform similarly
                  </p>
                </div>
              </div>
            )}

            {/* Summary from LLM result */}
            {parsedResult.summary && (
              <div className="border-t pt-3 mt-3">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {parsedResult.summary}
                </p>
              </div>
            )}

            {/* Metric comparison */}
            {parsedResult.metricComparison && (
              <MetricComparisonSection
                metricComparison={parsedResult.metricComparison}
              />
            )}

            {/* Recommendations */}
            {parsedResult.recommendations.length > 0 && (
              <div className="border-t pt-3 mt-3">
                <p className="text-xs font-medium mb-2">Recommendations</p>
                <ul className="space-y-1">
                  {parsedResult.recommendations.map((rec, idx) => (
                    <li
                      key={idx}
                      className="text-xs text-muted-foreground flex gap-2"
                    >
                      <span className="text-primary">•</span>
                      {rec}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
