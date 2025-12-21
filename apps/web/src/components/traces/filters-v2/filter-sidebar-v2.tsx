"use client";

/**
 * Filter Sidebar v2 Component
 *
 * Enhanced filter sidebar that uses FilterExpression DSL and displays
 * facet statistics from the filters.stats API.
 */

import { useState, useCallback, useMemo } from "react";
import {
  Plus,
  Minus,
  X,
  Clock,
  Server,
  Globe,
  Database,
  AlertTriangle,
  Cpu,
  Activity,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { useFilterStats } from "@/hooks/use-filter-autocomplete";
import type { FilterField, FilterOperator, TimeRangeInput } from "@cognobserve/api/schemas";

// ============================================================================
// Types
// ============================================================================

interface FilterSidebarV2Props {
  /** Project ID for stats */
  projectId: string;
  /** Current time range */
  timeRange: TimeRangeInput;
  /** Callback to set time range preset */
  onTimeRangePreset: (preset: "1h" | "6h" | "24h" | "7d" | "30d") => void;
  /** Add a filter predicate */
  onAddFilter: (
    field: FilterField,
    op: FilterOperator,
    value: string | number | boolean
  ) => void;
  /** Clear all filters */
  onClearFilters: () => void;
  /** Whether any filters are active */
  hasFilters: boolean;
  /** Number of active predicates */
  predicateCount: number;
}

// ============================================================================
// Constants
// ============================================================================

const TIME_PRESETS = [
  { id: "1h" as const, label: "Last hour" },
  { id: "6h" as const, label: "Last 6 hours" },
  { id: "24h" as const, label: "Last 24 hours" },
  { id: "7d" as const, label: "Last 7 days" },
  { id: "30d" as const, label: "Last 30 days" },
] as const;

const SPAN_TYPES = [
  { value: "LLM", label: "LLM", icon: Cpu },
  { value: "HTTP", label: "HTTP", icon: Globe },
  { value: "DB", label: "Database", icon: Database },
  { value: "RPC", label: "RPC", icon: Activity },
  { value: "FUNCTION", label: "Function", icon: Activity },
  { value: "CUSTOM", label: "Custom", icon: Activity },
] as const;

const STATUS_CODES = [
  { value: "OK", label: "Success" },
  { value: "ERROR", label: "Error" },
  { value: "UNSET", label: "Unset" },
] as const;

// ============================================================================
// Filter Section Component
// ============================================================================

interface FilterSectionProps {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  count?: number;
}

function FilterSection({
  title,
  icon,
  children,
  defaultOpen = false,
  count,
}: FilterSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <button className="flex w-full items-center justify-between py-1.5 text-xs font-medium text-foreground hover:text-foreground/80 transition-colors">
          <span className="flex items-center gap-1.5">
            {icon}
            {title}
            {count !== undefined && count > 0 && (
              <span className="ml-1 text-[10px] text-muted-foreground">
                ({count})
              </span>
            )}
          </span>
          {isOpen ? (
            <Minus className="h-3 w-3 text-muted-foreground" />
          ) : (
            <Plus className="h-3 w-3 text-muted-foreground" />
          )}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pb-1.5">{children}</CollapsibleContent>
    </Collapsible>
  );
}

// ============================================================================
// Facet List Component
// ============================================================================

interface FacetListProps {
  items: { name: string; count: number }[];
  field: FilterField;
  onSelect: (field: FilterField, value: string) => void;
  isLoading?: boolean;
  maxItems?: number;
}

function FacetList({
  items,
  field,
  onSelect,
  isLoading,
  maxItems = 5,
}: FacetListProps) {
  const [showAll, setShowAll] = useState(false);

  const displayItems = showAll ? items : items.slice(0, maxItems);
  const hasMore = items.length > maxItems;

  const handleSelect = useCallback(
    (value: string) => () => {
      onSelect(field, value);
    },
    [field, onSelect]
  );

  const handleShowMore = useCallback(() => {
    setShowAll((prev) => !prev);
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-1">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-5 w-full" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <p className="text-[10px] text-muted-foreground py-1">No data available</p>
    );
  }

  return (
    <div className="space-y-0.5">
      {displayItems.map((item) => (
        <button
          key={item.name}
          onClick={handleSelect(item.name)}
          className="flex w-full items-center justify-between rounded px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <span className="truncate">{item.name}</span>
          <span className="ml-2 text-[10px] text-muted-foreground/70">
            {item.count}
          </span>
        </button>
      ))}
      {hasMore && (
        <button
          onClick={handleShowMore}
          className="text-[10px] text-primary hover:underline px-2"
        >
          {showAll ? "Show less" : `Show ${items.length - maxItems} more`}
        </button>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function FilterSidebarV2({
  projectId,
  timeRange,
  onTimeRangePreset,
  onAddFilter,
  onClearFilters,
  hasFilters,
  predicateCount,
}: FilterSidebarV2Props) {
  const [minDuration, setMinDuration] = useState("");
  const [maxDuration, setMaxDuration] = useState("");

  // Fetch filter statistics
  const { stats, isLoading: isLoadingStats } = useFilterStats({
    projectId,
    timeRange,
    enabled: !!projectId,
  });

  // Determine current time preset
  const currentPreset = useMemo(() => {
    // Simple heuristic based on time range
    const from = new Date(timeRange.from).getTime();
    const to = new Date(timeRange.to).getTime();
    const hours = (to - from) / (60 * 60 * 1000);

    if (hours <= 1.5) return "1h";
    if (hours <= 8) return "6h";
    if (hours <= 25) return "24h";
    if (hours <= 170) return "7d";
    return "30d";
  }, [timeRange]);

  // Handle facet selection
  const handleFacetSelect = useCallback(
    (field: FilterField, value: string) => {
      onAddFilter(field, "eq", value);
    },
    [onAddFilter]
  );

  // Handle span type toggle
  const handleSpanTypeToggle = useCallback(
    (type: string) => () => {
      onAddFilter("span.spanType" as FilterField, "eq", type);
    },
    [onAddFilter]
  );

  // Handle status toggle
  const handleStatusToggle = useCallback(
    (status: string) => () => {
      onAddFilter("trace.rootSpanStatusCode" as FilterField, "eq", status);
    },
    [onAddFilter]
  );

  // Handle duration filter
  const handleApplyDuration = useCallback(() => {
    if (minDuration) {
      onAddFilter("trace.durationMs" as FilterField, "gte", parseInt(minDuration, 10));
    }
    if (maxDuration) {
      onAddFilter("trace.durationMs" as FilterField, "lte", parseInt(maxDuration, 10));
    }
  }, [minDuration, maxDuration, onAddFilter]);

  const handleClearDuration = useCallback(() => {
    setMinDuration("");
    setMaxDuration("");
  }, []);

  return (
    <div className="flex h-full w-56 flex-col border-r bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <h3 className="text-xs font-semibold">Filters</h3>
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearFilters}
            className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
          >
            Clear ({predicateCount})
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="px-3 pb-3 pt-2">
          {/* Time Range */}
          <FilterSection
            title="Time Range"
            icon={<Clock className="h-3 w-3" />}
            defaultOpen
          >
            <div className="space-y-0.5">
              {TIME_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => onTimeRangePreset(preset.id)}
                  className={cn(
                    "flex w-full items-center gap-1.5 rounded px-2 py-1 text-[11px] transition-colors",
                    currentPreset === preset.id
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </FilterSection>

          {/* Services */}
          <FilterSection
            title="Services"
            icon={<Server className="h-3 w-3" />}
            count={stats?.services.length}
          >
            <FacetList
              items={stats?.services ?? []}
              field={"trace.serviceName" as FilterField}
              onSelect={handleFacetSelect}
              isLoading={isLoadingStats}
            />
          </FilterSection>

          {/* Span Types */}
          <FilterSection
            title="Span Type"
            icon={<Activity className="h-3 w-3" />}
            count={stats?.spanTypes.length}
          >
            <div className="space-y-1">
              {SPAN_TYPES.map((type) => {
                const Icon = type.icon;
                const statItem = stats?.spanTypes.find((s) => s.type === type.value);
                return (
                  <label
                    key={type.value}
                    className="flex items-center gap-1.5 cursor-pointer group"
                  >
                    <Checkbox
                      checked={false}
                      onCheckedChange={handleSpanTypeToggle(type.value)}
                      className="h-3 w-3"
                    />
                    <Icon className="h-3 w-3 text-muted-foreground" />
                    <span className="flex-1 text-[11px] text-muted-foreground group-hover:text-foreground transition-colors">
                      {type.label}
                    </span>
                    {statItem && (
                      <span className="text-[10px] text-muted-foreground/70">
                        {statItem.count}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          </FilterSection>

          {/* Status */}
          <FilterSection
            title="Status"
            icon={<AlertTriangle className="h-3 w-3" />}
            count={stats?.statusCodes.length}
          >
            <div className="space-y-1">
              {STATUS_CODES.map((status) => {
                const statItem = stats?.statusCodes.find(
                  (s) => s.code === status.value
                );
                return (
                  <label
                    key={status.value}
                    className="flex items-center gap-1.5 cursor-pointer group"
                  >
                    <Checkbox
                      checked={false}
                      onCheckedChange={handleStatusToggle(status.value)}
                      className="h-3 w-3"
                    />
                    <span
                      className={cn(
                        "flex-1 text-[11px] text-muted-foreground group-hover:text-foreground transition-colors",
                        status.value === "ERROR" && "text-destructive"
                      )}
                    >
                      {status.label}
                    </span>
                    {statItem && (
                      <span className="text-[10px] text-muted-foreground/70">
                        {statItem.count}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          </FilterSection>

          {/* HTTP Routes */}
          <FilterSection
            title="HTTP Routes"
            icon={<Globe className="h-3 w-3" />}
            count={stats?.httpRoutes.length}
          >
            <FacetList
              items={stats?.httpRoutes.map((r) => ({ name: r.route, count: r.count })) ?? []}
              field={"span.httpRoute" as FilterField}
              onSelect={handleFacetSelect}
              isLoading={isLoadingStats}
            />
          </FilterSection>

          {/* Database Systems */}
          <FilterSection
            title="Databases"
            icon={<Database className="h-3 w-3" />}
            count={stats?.dbSystems.length}
          >
            <FacetList
              items={stats?.dbSystems.map((d) => ({ name: d.system, count: d.count })) ?? []}
              field={"span.dbSystem" as FilterField}
              onSelect={handleFacetSelect}
              isLoading={isLoadingStats}
            />
          </FilterSection>

          {/* Duration */}
          <FilterSection title="Duration" icon={<Clock className="h-3 w-3" />}>
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <div className="flex-1">
                  <Label className="text-[10px] text-muted-foreground">
                    Min (ms)
                  </Label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={minDuration}
                    onChange={(e) => setMinDuration(e.target.value)}
                    className="h-6 mt-0.5 text-xs"
                  />
                </div>
                <div className="flex-1">
                  <Label className="text-[10px] text-muted-foreground">
                    Max (ms)
                  </Label>
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
                  disabled={!minDuration && !maxDuration}
                >
                  Apply
                </Button>
                {(minDuration || maxDuration) && (
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
