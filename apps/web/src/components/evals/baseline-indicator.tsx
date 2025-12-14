"use client";

import { Activity, TrendingDown, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface BaselineIndicatorProps {
  latencyP95?: number | null;
  errorRate?: number | null;
  currentLatencyP95?: number | null;
  currentErrorRate?: number | null;
  className?: string;
}

export function BaselineIndicator({
  latencyP95,
  errorRate,
  currentLatencyP95,
  currentErrorRate,
  className,
}: BaselineIndicatorProps) {
  const hasBaseline = latencyP95 !== null || errorRate !== null;

  if (!hasBaseline) {
    return (
      <Badge variant="outline" className={cn("text-muted-foreground", className)}>
        No baseline set
      </Badge>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={cn("gap-1", className)}>
            <Activity className="h-3 w-3" />
            Baseline set
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="space-y-1">
          {latencyP95 !== null && latencyP95 !== undefined && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">P95 Latency:</span>
              <span>{latencyP95.toFixed(0)}ms</span>
              {currentLatencyP95 !== null && currentLatencyP95 !== undefined && (
                <ComparisonIndicator baseline={latencyP95} current={currentLatencyP95} />
              )}
            </div>
          )}
          {errorRate !== null && errorRate !== undefined && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Error Rate:</span>
              <span>{errorRate.toFixed(2)}%</span>
              {currentErrorRate !== null && currentErrorRate !== undefined && (
                <ComparisonIndicator baseline={errorRate} current={currentErrorRate} />
              )}
            </div>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface ComparisonIndicatorProps {
  baseline: number;
  current: number;
}

function ComparisonIndicator({ baseline, current }: ComparisonIndicatorProps) {
  if (baseline === 0 || current === baseline) return null;

  const changePercent = ((current - baseline) / baseline) * 100;
  const isIncrease = changePercent > 0;

  return (
    <span
      className={cn(
        "flex items-center text-xs",
        isIncrease ? "text-red-500" : "text-green-500"
      )}
    >
      {isIncrease ? (
        <TrendingUp className="h-3 w-3" />
      ) : (
        <TrendingDown className="h-3 w-3" />
      )}
      {Math.abs(changePercent).toFixed(1)}%
    </span>
  );
}
