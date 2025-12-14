"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Lightbulb, CheckCircle } from "lucide-react";
import type { LLMRCAOutput } from "@cognobserve/api/schemas";

const CATEGORY_CONFIG = {
  CODE_CHANGE: { label: "Code Change", icon: "code", color: "bg-blue-100 text-blue-800" },
  INFRASTRUCTURE: { label: "Infrastructure", icon: "server", color: "bg-orange-100 text-orange-800" },
  EXTERNAL_DEPENDENCY: { label: "External Dependency", icon: "link", color: "bg-purple-100 text-purple-800" },
  DATA_ISSUE: { label: "Data Issue", icon: "database", color: "bg-yellow-100 text-yellow-800" },
  CONFIGURATION: { label: "Configuration", icon: "settings", color: "bg-gray-100 text-gray-800" },
  UNKNOWN: { label: "Unknown", icon: "help", color: "bg-gray-100 text-gray-600" },
} as const;

interface RCAHypothesisCardProps {
  analysis: LLMRCAOutput;
  confidence: number | null;
}

function getConfidenceColor(pct: number): string {
  if (pct >= 70) return "text-green-600";
  if (pct >= 50) return "text-yellow-600";
  return "text-orange-600";
}

export function RCAHypothesisCard({ analysis, confidence }: RCAHypothesisCardProps) {
  const category = CATEGORY_CONFIG[analysis.rootCause.category] ?? CATEGORY_CONFIG.UNKNOWN;
  const confidencePercent = confidence ? Math.round(confidence * 100) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-yellow-500" />
          Root Cause Hypothesis
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Main hypothesis */}
        <div className="p-4 bg-muted rounded-lg border-l-4 border-primary">
          <p className="text-lg font-medium">{analysis.hypothesis}</p>
        </div>

        {/* Confidence and category */}
        <div className="flex flex-wrap gap-4">
          {confidencePercent !== null && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Confidence:</span>
              <div className="flex items-center gap-2">
                <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full ${getConfidenceColor(confidencePercent)} bg-current`}
                    style={{ width: `${confidencePercent}%` }}
                  />
                </div>
                <span className={`font-semibold ${getConfidenceColor(confidencePercent)}`}>
                  {confidencePercent}%
                </span>
              </div>
            </div>
          )}

          <Badge className={category.color}>{category.label}</Badge>
        </div>

        {/* Reasoning */}
        <div>
          <h4 className="font-medium text-muted-foreground mb-2">Reasoning</h4>
          <p className="text-sm">{analysis.reasoning}</p>
        </div>

        {/* Evidence */}
        {analysis.rootCause.evidence.length > 0 && (
          <div>
            <h4 className="font-medium text-muted-foreground mb-2">Evidence</h4>
            <ul className="space-y-2">
              {analysis.rootCause.evidence.map((evidence, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                  {evidence}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
