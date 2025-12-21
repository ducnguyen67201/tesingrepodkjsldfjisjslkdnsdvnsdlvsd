"use client";

import { useCallback } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type TraceFilters as TraceFiltersType,
  type SpanType,
  type SpanLevel,
  QUICK_TOGGLES,
} from "@cognobserve/api/schemas";
import { type TimeRange, ALL_PRESET_TIME_RANGES } from "@cognobserve/api/schemas";
import { cn } from "@/lib/utils";
import { FilterPopover } from "./filter-popover";

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------

interface TraceFiltersProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  timeRange: TimeRange;
  onTimeRangeChange: (range: TimeRange) => void;
  onCustomRangeChange: (from: string, to: string) => void;
  onToggleType: (type: SpanType) => void;
  onToggleLevel: (level: SpanLevel) => void;
  onDurationChange: (min?: number, max?: number) => void;
  onQuickToggle: (toggleId: string) => void;
  isQuickToggleActive: (toggleId: string) => boolean;
  onClearFilters: () => void;
  hasFilters: boolean;
  filterCount: number;
  filters: TraceFiltersType;
}

// ------------------------------------------------------------
// Constants
// ------------------------------------------------------------

const TIME_RANGE_LABELS: Record<TimeRange, string> = {
  "24h": "Last 24 hours",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  custom: "Custom range",
};

// ------------------------------------------------------------
// Component
// ------------------------------------------------------------

export function TraceFilters({
  searchValue,
  onSearchChange,
  timeRange,
  onTimeRangeChange,
  onCustomRangeChange: _onCustomRangeChange,
  onToggleType,
  onToggleLevel,
  onDurationChange,
  onQuickToggle,
  isQuickToggleActive,
  onClearFilters,
  hasFilters,
  filterCount,
  filters,
}: TraceFiltersProps) {
  // Note: _onCustomRangeChange will be used when custom date picker is implemented
  void _onCustomRangeChange;
  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onSearchChange(e.target.value);
    },
    [onSearchChange]
  );

  const handleClearSearch = useCallback(() => {
    onSearchChange("");
  }, [onSearchChange]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Search Input */}
      <div className="relative w-64">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search services..."
          value={searchValue}
          onChange={handleSearchChange}
          className="pl-9 pr-8"
        />
        {searchValue && (
          <button
            onClick={handleClearSearch}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Quick Toggles */}
      {QUICK_TOGGLES.map((toggle) => {
        const isActive = isQuickToggleActive(toggle.id);
        return (
          <Button
            key={toggle.id}
            variant={isActive ? "default" : "outline"}
            size="sm"
            onClick={() => onQuickToggle(toggle.id)}
            className={cn(
              "h-9",
              isActive && "bg-primary text-primary-foreground"
            )}
          >
            {toggle.label}
          </Button>
        );
      })}

      {/* Advanced Filters Popover */}
      <FilterPopover
        filters={filters}
        onToggleType={onToggleType}
        onToggleLevel={onToggleLevel}
        onDurationChange={onDurationChange}
        filterCount={filterCount}
      />

      {/* Time Range Select */}
      <Select
        value={timeRange}
        onValueChange={(value) => onTimeRangeChange(value as TimeRange)}
      >
        <SelectTrigger className="h-9 w-[160px]">
          <SelectValue placeholder="Time range" />
        </SelectTrigger>
        <SelectContent>
          {ALL_PRESET_TIME_RANGES.map((range) => (
            <SelectItem key={range} value={range}>
              {TIME_RANGE_LABELS[range]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Clear Filters */}
      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearFilters}
          className="h-9 text-muted-foreground hover:text-foreground"
        >
          <X className="mr-1 h-4 w-4" />
          Clear
          {filterCount > 0 && (
            <Badge variant="secondary" className="ml-1">
              {filterCount}
            </Badge>
          )}
        </Button>
      )}
    </div>
  );
}
