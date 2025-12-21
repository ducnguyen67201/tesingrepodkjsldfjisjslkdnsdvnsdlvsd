"use client";

import { useState, useCallback } from "react";
import { Plus, Minus, X, Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  type TraceFilters,
  type SpanType,
  type SpanLevel,
  ALL_SPAN_TYPES,
  ALL_SPAN_LEVELS,
} from "@cognobserve/api/schemas";
import { type TimeRange, ALL_PRESET_TIME_RANGES } from "@cognobserve/api/schemas";
import { cn } from "@/lib/utils";

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------

interface FilterSidebarProps {
  timeRange: TimeRange;
  onTimeRangeChange: (range: TimeRange) => void;
  filters: TraceFilters;
  onToggleType: (type: SpanType) => void;
  onToggleLevel: (level: SpanLevel) => void;
  onDurationChange: (min?: number, max?: number) => void;
  onClearFilters: () => void;
  hasFilters: boolean;
}

// ------------------------------------------------------------
// Constants
// ------------------------------------------------------------

const SPAN_TYPE_LABELS: Record<SpanType, string> = {
  LLM: "LLM",
  HTTP: "HTTP",
  DB: "Database",
  FUNCTION: "Function",
  LOG: "Log",
  CUSTOM: "Custom",
};

const SPAN_LEVEL_LABELS: Record<SpanLevel, string> = {
  UNSET: "Unset",
  OK: "Success",
  ERROR: "Error",
};

const TIME_RANGE_LABELS: Record<TimeRange, string> = {
  "24h": "Last 24 hours",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  custom: "Custom range",
};

// ------------------------------------------------------------
// Filter Section Component
// ------------------------------------------------------------

interface FilterSectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function FilterSection({
  title,
  children,
  defaultOpen = false,
}: FilterSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <button className="flex w-full items-center justify-between py-1.5 text-xs font-medium text-foreground hover:text-foreground/80 transition-colors">
          <span>{title}</span>
          {isOpen ? (
            <Minus className="h-3 w-3 text-muted-foreground" />
          ) : (
            <Plus className="h-3 w-3 text-muted-foreground" />
          )}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pb-1.5">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

// ------------------------------------------------------------
// Main Component
// ------------------------------------------------------------

export function FilterSidebar({
  timeRange,
  onTimeRangeChange,
  filters,
  onToggleType,
  onToggleLevel,
  onDurationChange,
  onClearFilters,
  hasFilters,
}: FilterSidebarProps) {
  const [minDuration, setMinDuration] = useState(
    filters.minDuration?.toString() ?? ""
  );
  const [maxDuration, setMaxDuration] = useState(
    filters.maxDuration?.toString() ?? ""
  );

  const handleApplyDuration = useCallback(() => {
    const min = minDuration ? parseInt(minDuration, 10) : undefined;
    const max = maxDuration ? parseInt(maxDuration, 10) : undefined;
    onDurationChange(min, max);
  }, [minDuration, maxDuration, onDurationChange]);

  const handleClearDuration = useCallback(() => {
    setMinDuration("");
    setMaxDuration("");
    onDurationChange(undefined, undefined);
  }, [onDurationChange]);

  const isTypeSelected = (type: SpanType) =>
    filters.types?.includes(type) ?? false;

  const isLevelSelected = (level: SpanLevel) =>
    filters.levels?.includes(level) ?? false;

  const selectedTypesCount = filters.types?.length ?? 0;
  const selectedLevelsCount = filters.levels?.length ?? 0;
  const hasDurationFilter =
    filters.minDuration !== undefined || filters.maxDuration !== undefined;

  return (
    <div className="flex h-full w-52 flex-col border-r bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2">
        <h3 className="text-xs font-semibold">Filters</h3>
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearFilters}
            className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
          >
            Clear
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="px-3 pb-3">
          {/* Time Range */}
          <FilterSection title="Time Range" defaultOpen>
            <div className="space-y-0.5">
              {ALL_PRESET_TIME_RANGES.map((range) => (
                <button
                  key={range}
                  onClick={() => onTimeRangeChange(range)}
                  className={cn(
                    "flex w-full items-center gap-1.5 rounded px-2 py-1 text-[11px] transition-colors",
                    timeRange === range
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Clock className="h-3 w-3" />
                  {TIME_RANGE_LABELS[range]}
                </button>
              ))}
            </div>
          </FilterSection>

          {/* Span Types */}
          <FilterSection
            title="Span Type"
            defaultOpen={selectedTypesCount > 0}
          >
            <div className="space-y-1">
              {ALL_SPAN_TYPES.map((type) => (
                <label
                  key={type}
                  className="flex items-center gap-1.5 cursor-pointer group"
                >
                  <Checkbox
                    checked={isTypeSelected(type)}
                    onCheckedChange={() => onToggleType(type)}
                    className="h-3 w-3"
                  />
                  <span
                    className={cn(
                      "text-[11px] transition-colors",
                      isTypeSelected(type)
                        ? "text-foreground font-medium"
                        : "text-muted-foreground group-hover:text-foreground"
                    )}
                  >
                    {SPAN_TYPE_LABELS[type]}
                  </span>
                </label>
              ))}
            </div>
          </FilterSection>

          {/* Status */}
          <FilterSection
            title="Status"
            defaultOpen={selectedLevelsCount > 0}
          >
            <div className="space-y-1">
              {ALL_SPAN_LEVELS.map((level) => (
                <label
                  key={level}
                  className="flex items-center gap-1.5 cursor-pointer group"
                >
                  <Checkbox
                    checked={isLevelSelected(level)}
                    onCheckedChange={() => onToggleLevel(level)}
                    className="h-3 w-3"
                  />
                  <span
                    className={cn(
                      "text-[11px] transition-colors",
                      isLevelSelected(level)
                        ? "text-foreground font-medium"
                        : "text-muted-foreground group-hover:text-foreground",
                      level === "ERROR" && isLevelSelected(level) && "text-destructive"
                    )}
                  >
                    {SPAN_LEVEL_LABELS[level]}
                  </span>
                </label>
              ))}
            </div>
          </FilterSection>

          {/* Duration */}
          <FilterSection
            title="Duration"
            defaultOpen={hasDurationFilter}
          >
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <div className="flex-1">
                  <Label className="text-[10px] text-muted-foreground">Min (ms)</Label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={minDuration}
                    onChange={(e) => setMinDuration(e.target.value)}
                    className="h-6 mt-0.5 text-xs"
                  />
                </div>
                <div className="flex-1">
                  <Label className="text-[10px] text-muted-foreground">Max (ms)</Label>
                  <Input
                    type="number"
                    placeholder="∞"
                    value={maxDuration}
                    onChange={(e) => setMaxDuration(e.target.value)}
                    className="h-6 mt-0.5 text-xs"
                  />
                </div>
              </div>
              <div className="flex gap-1.5">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleApplyDuration}
                  className="flex-1 h-6 text-[10px]"
                >
                  Apply
                </Button>
                {hasDurationFilter && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClearDuration}
                    className="h-6 px-1.5"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
          </FilterSection>
        </div>
      </ScrollArea>
    </div>
  );
}
