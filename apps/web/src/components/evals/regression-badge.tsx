"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  EVAL_STATUS_LABELS,
  EVAL_STATUS_COLORS,
  type EvalRunStatus,
} from "@ducsigr/api/schemas";

interface RegressionBadgeProps {
  status: EvalRunStatus;
  isRegression?: boolean | null;
  className?: string;
}

export function RegressionBadge({
  status,
  isRegression,
  className,
}: RegressionBadgeProps) {
  const label = EVAL_STATUS_LABELS[status] ?? status;
  const colorClass = EVAL_STATUS_COLORS[status] ?? "bg-gray-100 text-gray-800";

  return (
    <Badge variant="outline" className={cn(colorClass, className)}>
      {isRegression && status === "REGRESSION_DETECTED" ? "Regression" : label}
    </Badge>
  );
}

interface StatusDotProps {
  status: EvalRunStatus;
  className?: string;
}

export function StatusDot({ status, className }: StatusDotProps) {
  const dotColor = {
    PENDING: "bg-gray-400",
    RUNNING: "bg-blue-500 animate-pulse",
    PASSED: "bg-green-500",
    FAILED: "bg-red-500",
    REGRESSION_DETECTED: "bg-orange-500",
  }[status];

  return (
    <span
      className={cn("inline-block h-2 w-2 rounded-full", dotColor, className)}
    />
  );
}
