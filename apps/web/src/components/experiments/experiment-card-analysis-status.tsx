"use client";

import { Trophy, AlertCircle, Loader2, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type AnalysisStatus = "pending" | "running" | "completed" | "failed" | null;

interface Variant {
  id: string;
  name: "A" | "B";
}

interface ExperimentCardAnalysisStatusProps {
  analysisStatus: AnalysisStatus;
  analysisError?: string | null;
  winnerVariant: Variant | null;
  winnerConfidence?: number | null;
}

export function ExperimentCardAnalysisStatus({
  analysisStatus,
  analysisError,
  winnerVariant,
  winnerConfidence,
}: ExperimentCardAnalysisStatusProps) {
  if (!analysisStatus) return null;

  return (
    <div className="flex items-center gap-2 mt-3">
      {analysisStatus === "pending" && (
        <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 gap-1">
          <Clock className="h-3 w-3" />
          Analysis pending
        </Badge>
      )}
      {analysisStatus === "running" && (
        <Badge
          variant="outline"
          className="text-[10px] px-1.5 py-0.5 gap-1 text-blue-600 border-blue-200 bg-blue-50"
        >
          <Loader2 className="h-3 w-3 animate-spin" />
          Analyzing...
        </Badge>
      )}
      {analysisStatus === "completed" && winnerVariant && (
        <Badge
          variant="outline"
          className="text-[10px] px-1.5 py-0.5 gap-1 text-green-600 border-green-200 bg-green-50"
        >
          <Trophy className="h-3 w-3" />
          Winner: Variant {winnerVariant.name}
          {winnerConfidence && (
            <span className="text-muted-foreground">
              ({Math.round(winnerConfidence * 100)}% conf)
            </span>
          )}
        </Badge>
      )}
      {analysisStatus === "completed" && !winnerVariant && (
        <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 gap-1">
          No clear winner
        </Badge>
      )}
      {analysisStatus === "failed" && (
        <Badge
          variant="outline"
          className="text-[10px] px-1.5 py-0.5 gap-1 text-red-600 border-red-200 bg-red-50"
        >
          <AlertCircle className="h-3 w-3" />
          Analysis failed
          {analysisError && (
            <span title={analysisError} className="cursor-help">
              (hover for details)
            </span>
          )}
        </Badge>
      )}
    </div>
  );
}
