"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart3, AlertTriangle, Clock, Layers, FileText, CheckCircle } from "lucide-react";
import type { LLMRCAOutput } from "@cognobserve/api/schemas";

interface RCAEvidenceCardProps {
  analysis: LLMRCAOutput;
  alertHistory: {
    value: number;
    triggeredAt: Date;
  } | null;
}

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(date));
}

export function RCAEvidenceCard({ analysis, alertHistory }: RCAEvidenceCardProps) {
  const evidenceItems = analysis.rootCause.evidence;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Evidence Summary
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Alert metrics */}
        <div className="grid grid-cols-2 gap-3">
          {alertHistory && (
            <div className="p-3 bg-destructive/10 rounded-lg border border-destructive/20">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                Alert Value
              </div>
              <p className="text-xl font-bold text-destructive">{alertHistory.value.toFixed(2)}</p>
            </div>
          )}

          {alertHistory && (
            <div className="p-3 bg-muted rounded-lg">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <Clock className="h-4 w-4" />
                Triggered At
              </div>
              <p className="text-sm font-medium">
                {formatDateTime(alertHistory.triggeredAt)}
              </p>
            </div>
          )}
        </div>

        {/* Evidence list from root cause analysis */}
        {evidenceItems.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <FileText className="h-4 w-4" />
              Key Evidence Points
            </div>
            <ul className="space-y-2">
              {evidenceItems.map((evidence, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <span className="text-muted-foreground">{evidence}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Affected components */}
        {analysis.affectedComponents.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Layers className="h-4 w-4" />
              Affected Components
            </div>
            <div className="flex flex-wrap gap-1.5">
              {analysis.affectedComponents.map((component, i) => (
                <Badge
                  key={i}
                  variant="secondary"
                  className="font-mono text-xs"
                >
                  {component}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
