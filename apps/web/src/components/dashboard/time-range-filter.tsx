"use client";

import { useCallback } from "react";
import { Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DashboardTimeRange } from "@cognobserve/api/schemas";

// ============================================================
// Constants
// ============================================================

const TIME_RANGE_OPTIONS: Array<{
  value: DashboardTimeRange;
  label: string;
}> = [
  { value: "24h", label: "Last 24 Hours" },
  { value: "7d", label: "Last 7 Days" },
  { value: "30d", label: "Last 30 Days" },
];

// ============================================================
// Props
// ============================================================

interface TimeRangeFilterProps {
  value: DashboardTimeRange;
  onChange: (value: DashboardTimeRange) => void;
  className?: string;
}

// ============================================================
// Component
// ============================================================

export function TimeRangeFilter({
  value,
  onChange,
  className,
}: TimeRangeFilterProps) {
  const handleChange = useCallback(
    (newValue: string) => {
      onChange(newValue as DashboardTimeRange);
    },
    [onChange]
  );

  return (
    <div className={className}>
      <Select value={value} onValueChange={handleChange}>
        <SelectTrigger className="w-[160px]">
          <Calendar className="mr-2 h-4 w-4" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TIME_RANGE_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ============================================================
// Quick Buttons variant
// ============================================================

interface TimeRangeButtonsProps {
  value: DashboardTimeRange;
  onChange: (value: DashboardTimeRange) => void;
  className?: string;
}

export function TimeRangeButtons({
  value,
  onChange,
  className,
}: TimeRangeButtonsProps) {
  const handleClick = useCallback(
    (newValue: DashboardTimeRange) => () => {
      onChange(newValue);
    },
    [onChange]
  );

  return (
    <div className={`flex items-center gap-1 ${className ?? ""}`}>
      {TIME_RANGE_OPTIONS.map((option) => (
        <Button
          key={option.value}
          variant={value === option.value ? "default" : "ghost"}
          size="sm"
          onClick={handleClick(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}
