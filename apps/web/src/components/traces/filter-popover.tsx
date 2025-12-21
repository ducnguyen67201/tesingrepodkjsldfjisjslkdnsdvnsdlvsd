"use client";

import { useState, useCallback } from "react";
import { SlidersHorizontal, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  type TraceFilters,
  type SpanType,
  type SpanLevel,
  ALL_SPAN_TYPES,
  ALL_SPAN_LEVELS,
} from "@cognobserve/api/schemas";
import { cn } from "@/lib/utils";

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------

interface FilterPopoverProps {
  filters: TraceFilters;
  onToggleType: (type: SpanType) => void;
  onToggleLevel: (level: SpanLevel) => void;
  onDurationChange: (min?: number, max?: number) => void;
  filterCount: number;
}

// ------------------------------------------------------------
// Constants
// ------------------------------------------------------------

const SPAN_TYPE_LABELS: Record<SpanType, string> = {
  LLM: "LLM Calls",
  HTTP: "HTTP Requests",
  DB: "Database",
  FUNCTION: "Functions",
  LOG: "Logs",
  CUSTOM: "Custom",
};

const SPAN_LEVEL_LABELS: Record<SpanLevel, string> = {
  UNSET: "Unset",
  OK: "Success",
  ERROR: "Error",
};

// ------------------------------------------------------------
// Component
// ------------------------------------------------------------

export function FilterPopover({
  filters,
  onToggleType,
  onToggleLevel,
  onDurationChange,
  filterCount,
}: FilterPopoverProps) {
  const [minDuration, setMinDuration] = useState(
    filters.minDuration?.toString() ?? ""
  );
  const [maxDuration, setMaxDuration] = useState(
    filters.maxDuration?.toString() ?? ""
  );

  const handleMinDurationChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setMinDuration(e.target.value);
    },
    []
  );

  const handleMaxDurationChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setMaxDuration(e.target.value);
    },
    []
  );

  const handleApplyDuration = useCallback(() => {
    const min = minDuration ? parseInt(minDuration, 10) : undefined;
    const max = maxDuration ? parseInt(maxDuration, 10) : undefined;
    onDurationChange(min, max);
  }, [minDuration, maxDuration, onDurationChange]);

  const isTypeSelected = (type: SpanType) =>
    filters.types?.includes(type) ?? false;

  const isLevelSelected = (level: SpanLevel) =>
    filters.levels?.includes(level) ?? false;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9">
          <SlidersHorizontal className="mr-2 h-4 w-4" />
          Filters
          {filterCount > 0 && (
            <Badge variant="secondary" className="ml-1">
              {filterCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <div className="space-y-4">
          {/* Span Types */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Span Types</Label>
            <div className="flex flex-wrap gap-2">
              {ALL_SPAN_TYPES.map((type) => (
                <Button
                  key={type}
                  variant="outline"
                  size="sm"
                  onClick={() => onToggleType(type)}
                  className={cn(
                    "h-7",
                    isTypeSelected(type) &&
                      "border-primary bg-primary/10 text-primary"
                  )}
                >
                  {isTypeSelected(type) && (
                    <Check className="mr-1 h-3 w-3" />
                  )}
                  {SPAN_TYPE_LABELS[type]}
                </Button>
              ))}
            </div>
          </div>

          {/* Status Levels */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Status</Label>
            <div className="flex flex-wrap gap-2">
              {ALL_SPAN_LEVELS.map((level) => (
                <Button
                  key={level}
                  variant="outline"
                  size="sm"
                  onClick={() => onToggleLevel(level)}
                  className={cn(
                    "h-7",
                    isLevelSelected(level) &&
                      "border-primary bg-primary/10 text-primary"
                  )}
                >
                  {isLevelSelected(level) && (
                    <Check className="mr-1 h-3 w-3" />
                  )}
                  {SPAN_LEVEL_LABELS[level]}
                </Button>
              ))}
            </div>
          </div>

          {/* Duration Range */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Duration (ms)</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                placeholder="Min"
                value={minDuration}
                onChange={handleMinDurationChange}
                className="h-8"
              />
              <span className="text-muted-foreground">to</span>
              <Input
                type="number"
                placeholder="Max"
                value={maxDuration}
                onChange={handleMaxDurationChange}
                className="h-8"
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={handleApplyDuration}
                className="h-8"
              >
                Apply
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
