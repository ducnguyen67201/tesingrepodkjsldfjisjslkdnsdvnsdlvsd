"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Wrench, Zap, Calendar } from "lucide-react";
import type { LLMRCAOutput } from "@cognobserve/api/schemas";

interface RCARemediationCardProps {
  remediation: LLMRCAOutput["remediation"];
}

export function RCARemediationCard({ remediation }: RCARemediationCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wrench className="h-5 w-5" />
          Recommended Actions
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Immediate actions */}
        {remediation.immediate.length > 0 && (
          <div>
            <h4 className="flex items-center gap-2 font-medium text-sm text-muted-foreground mb-3">
              <Zap className="h-4 w-4 text-yellow-500" />
              Immediate Steps
            </h4>
            <ol className="space-y-2">
              {remediation.immediate.map((step, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-medium flex-shrink-0">
                    {i + 1}
                  </span>
                  <span className="text-sm pt-0.5">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* Long-term actions */}
        {remediation.longTerm.length > 0 && (
          <div>
            <h4 className="flex items-center gap-2 font-medium text-sm text-muted-foreground mb-3">
              <Calendar className="h-4 w-4 text-blue-500" />
              Long-term Improvements
            </h4>
            <ol className="space-y-2">
              {remediation.longTerm.map((step, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-muted text-muted-foreground text-xs font-medium flex-shrink-0">
                    {i + 1}
                  </span>
                  <span className="text-sm pt-0.5">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
