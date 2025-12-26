"use client";

/**
 * Traces Table v2 Component
 *
 * Enhanced traces table using FilterExpression DSL and v2 API endpoints.
 * Integrates query builder, filter chips, and faceted sidebar.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc/client";
import { useTraceFiltersV2 } from "@/hooks/use-trace-filters-v2";
import { TraceRow } from "./trace-row";
import { TracesEmpty } from "./traces-empty";
import { TracesSkeleton } from "./traces-skeleton";
import { TracesError } from "./traces-error";
import { TraceDetailPanel, usePrefetchTrace } from "./trace-detail-panel";
import {
  FilterSidebarV2,
  QueryBuilderInput,
  FilterChips,
  QuickFilterChips,
} from "./filters-v2";
import type { FilterField, FilterOperator, FilterExpression } from "@ducsigr/api/schemas";

// ============================================================================
// Types
// ============================================================================

interface TracesTableV2Props {
  workspaceSlug: string;
  projectId: string;
}

// ============================================================================
// Query Parser
// ============================================================================

interface ParsedCondition {
  field: FilterField;
  value: string;
  /** Comparison operator (eq, neq, gt, gte, lt, lte) */
  comparisonOp: FilterOperator;
  /** Logical operator before this condition (AND/OR) */
  logicalOp?: "AND" | "OR";
}

/**
 * Map user-friendly operators to FilterOperator values
 */
const OPERATOR_MAP: Record<string, FilterOperator> = {
  "=": "eq",
  "==": "eq",
  "!=": "neq",
  "<>": "neq",
  ">": "gt",
  ">=": "gte",
  "<": "lt",
  "<=": "lte",
};

/**
 * Parse a query string like `service.name="api" AND trace.durationMs>200`
 * into filter conditions. Supports comparison operators: =, !=, >, >=, <, <=
 */
function parseQueryToConditions(query: string): ParsedCondition[] {
  const conditions: ParsedCondition[] = [];
  const parts = query.split(/\s+(AND|OR)\s+/i);
  let lastLogicalOp: "AND" | "OR" | undefined;

  for (const part of parts) {
    const trimmed = part.trim();

    if (trimmed.toUpperCase() === "AND" || trimmed.toUpperCase() === "OR") {
      lastLogicalOp = trimmed.toUpperCase() as "AND" | "OR";
      continue;
    }

    // Match field, operator, and value
    // Operators: >=, <=, !=, <>, ==, =, >, <
    const match = trimmed.match(/^([a-zA-Z][a-zA-Z0-9_.]*)\s*(>=|<=|!=|<>|==|=|>|<)\s*(.+)$/);
    if (match) {
      const [, field, op, rawValue] = match;
      let value = rawValue!.trim();

      // Remove surrounding quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      const comparisonOp = OPERATOR_MAP[op!] ?? "eq";

      if (field && value) {
        conditions.push({
          field: field as FilterField,
          value,
          comparisonOp,
          logicalOp: lastLogicalOp,
        });
        lastLogicalOp = undefined;
      }
    }
  }

  return conditions;
}

/**
 * Build a FilterExpression from parsed conditions, respecting AND/OR operators.
 *
 * For uniform operators (all AND or all OR), creates a flat expression.
 * For mixed operators, AND takes precedence over OR (standard boolean logic).
 *
 * Examples:
 * - `A AND B AND C` → { and: [A, B, C] }
 * - `A OR B OR C` → { or: [A, B, C] }
 * - `A AND B OR C` → { or: [{ and: [A, B] }, C] }  (AND binds tighter)
 * - `A OR B AND C` → { or: [A, { and: [B, C] }] }
 */
function buildFilterExpression(conditions: ParsedCondition[]): FilterExpression {
  if (conditions.length === 0) {
    return { and: [] };
  }

  // Convert a single condition to a FieldPredicate
  // Handles numeric values for comparison operators
  const toPredicate = (c: ParsedCondition): FilterExpression => {
    // Parse numeric values for comparison operators
    let value: string | number = c.value;
    if (["gt", "gte", "lt", "lte"].includes(c.comparisonOp)) {
      const numValue = parseFloat(c.value);
      if (!isNaN(numValue)) {
        value = numValue;
      }
    }
    return {
      field: c.field,
      op: c.comparisonOp,
      value,
    };
  };

  if (conditions.length === 1) {
    return toPredicate(conditions[0]!);
  }

  // Check if all logical operators are the same (or undefined/AND which defaults to AND)
  const logicalOps = conditions.slice(1).map((c) => c.logicalOp ?? "AND");
  const allAnd = logicalOps.every((op) => op === "AND");
  const allOr = logicalOps.every((op) => op === "OR");

  // Simple case: all same logical operator
  if (allAnd) {
    return { and: conditions.map(toPredicate) };
  }

  if (allOr) {
    return { or: conditions.map(toPredicate) };
  }

  // Mixed operators: AND has higher precedence than OR
  // Group consecutive AND conditions, then OR them together
  const orGroups: FilterExpression[] = [];
  let currentAndGroup: ParsedCondition[] = [conditions[0]!];

  for (let i = 1; i < conditions.length; i++) {
    const cond = conditions[i]!;
    const logicalOp = cond.logicalOp ?? "AND";

    if (logicalOp === "AND") {
      // Continue the AND group
      currentAndGroup.push(cond);
    } else {
      // OR: flush the current AND group and start a new one
      if (currentAndGroup.length === 1) {
        orGroups.push(toPredicate(currentAndGroup[0]!));
      } else {
        orGroups.push({ and: currentAndGroup.map(toPredicate) });
      }
      currentAndGroup = [cond];
    }
  }

  // Flush the last AND group
  if (currentAndGroup.length === 1) {
    orGroups.push(toPredicate(currentAndGroup[0]!));
  } else {
    orGroups.push({ and: currentAndGroup.map(toPredicate) });
  }

  // If we only have one OR group, return it directly
  if (orGroups.length === 1) {
    return orGroups[0]!;
  }

  return { or: orGroups };
}

// ============================================================================
// Component
// ============================================================================

export function TracesTableV2({
  workspaceSlug,
  projectId,
}: TracesTableV2Props) {
  const searchParams = useSearchParams();

  // Query input state (separate from filters - only applied on execute)
  const [queryInput, setQueryInput] = useState("");
  const [isExecuting, setIsExecuting] = useState(false);

  // Filter state from URL using v2 hook
  const {
    filter,
    timeRange,
    predicates,
    hasFilters,
    predicateCount,
    addFieldPredicate,
    removePredicate,
    applyQuickPreset,
    isPresetActive,
    setTimeRangePreset,
    setFilter,
    clearFilters,
    quickPresets,
  } = useTraceFiltersV2();

  // Selected trace - use local state to prevent re-renders/scroll reset
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(() => {
    // Initialize from URL if present
    return searchParams.get("trace");
  });

  // Prefetch trace data on hover for instant loading
  const prefetchTrace = usePrefetchTrace(workspaceSlug, projectId);

  // Track which traces have been prefetched to avoid duplicate fetches
  const prefetchedIdsRef = useRef<Set<string>>(new Set());

  // Fetch traces using v2 endpoint
  const {
    data,
    isLoading,
    isFetching,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = trpc.traces.listV2.useInfiniteQuery(
    {
      workspaceSlug,
      projectId,
      timeRange,
      filter: filter ?? undefined,
      limit: 50,
    },
    {
      getNextPageParam: (lastPage) =>
        lastPage.nextCursor
          ? {
              startTime: lastPage.nextCursor.startTime ?? "",
              id: lastPage.nextCursor.id ?? "",
            }
          : undefined,
      enabled: !!workspaceSlug && !!projectId,
    }
  );

  // Track executing state based on fetching
  useEffect(() => {
    if (!isFetching) {
      setIsExecuting(false);
    }
  }, [isFetching]);

  // Prefetch all trace details when data changes (initial load + infinite scroll)
  useEffect(() => {
    if (!data?.pages) return;

    // Get all trace IDs from all pages
    const allTraces = data.pages.flatMap((page) => page.traces);
    let delay = 0;

    // Prefetch traces that haven't been prefetched yet
    for (const trace of allTraces) {
      if (!prefetchedIdsRef.current.has(trace.id)) {
        prefetchedIdsRef.current.add(trace.id);
        // Stagger prefetch to avoid overwhelming the server
        setTimeout(() => {
          prefetchTrace(trace.id);
        }, delay);
        delay += 100; // 100ms between each prefetch
      }
    }
  }, [data?.pages, prefetchTrace]);

  // Flatten pages to traces array
  const traces = data?.pages.flatMap((page) => page.traces) ?? [];

  // Handle trace selection - just update local state, no router navigation
  const handleSelectTrace = useCallback((traceId: string) => {
    setSelectedTraceId(traceId);
  }, []);

  // Handle panel close - just update local state
  const handleClosePanel = useCallback(() => {
    setSelectedTraceId(null);
  }, []);

  // Handle filter addition from sidebar
  const handleAddFilter = useCallback(
    (field: FilterField, op: FilterOperator, value: string | number | boolean) => {
      addFieldPredicate(field, op, value);
    },
    [addFieldPredicate]
  );

  // Handle query execution (Cmd+Enter or button click)
  const handleExecute = useCallback(
    (query: string) => {
      setIsExecuting(true);

      // Parse the query into conditions
      const conditions = parseQueryToConditions(query);

      // Build filter expression directly (single state update)
      if (conditions.length === 0) {
        setFilter(null);
        return;
      }

      // Build filter expression respecting AND/OR operators
      const newFilter = buildFilterExpression(conditions);
      setFilter(newFilter);
    },
    [setFilter]
  );

  // Shared infinite scroll hook
  const { observerRef: loadMoreRef } = useInfiniteScroll({
    hasNextPage: hasNextPage ?? false,
    isFetchingNextPage,
    onLoadMore: fetchNextPage,
  });

  // Sidebar component
  const sidebar = (
    <FilterSidebarV2
      projectId={projectId}
      timeRange={timeRange}
      onTimeRangePreset={setTimeRangePreset}
      onAddFilter={handleAddFilter}
      onClearFilters={clearFilters}
      hasFilters={hasFilters}
      predicateCount={predicateCount}
    />
  );

  // Search bar with query builder and filter chips
  const searchBar = (
    <div className="border-b px-3 py-2 space-y-2">
      {/* Query builder input */}
      <QueryBuilderInput
        projectId={projectId}
        value={queryInput}
        onChange={setQueryInput}
        onExecute={handleExecute}
        isLoading={isExecuting || isFetching}
        className="flex-1"
      />

      {/* Quick filter presets */}
      <QuickFilterChips
        presets={quickPresets}
        isActive={isPresetActive}
        onApply={applyQuickPreset}
      />

      {/* Active filter chips */}
      {hasFilters && (
        <FilterChips
          predicates={predicates}
          onRemove={removePredicate}
          onClearAll={clearFilters}
          hasFilters={hasFilters}
        />
      )}
    </div>
  );

  // Render loading state
  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-200px)] min-h-[400px] border-t">
        {sidebar}
        <div className="flex-1 flex flex-col">
          {searchBar}
          <div className="flex-1">
            <TracesSkeleton />
          </div>
        </div>
      </div>
    );
  }

  // Render error state
  if (error) {
    return (
      <div className="flex h-[calc(100vh-200px)] min-h-[400px] border-t">
        {sidebar}
        <div className="flex-1 flex flex-col">
          {searchBar}
          <div className="flex-1 flex items-center justify-center">
            <TracesError error={error} onRetry={() => refetch()} />
          </div>
        </div>
      </div>
    );
  }

  // Render empty state
  if (traces.length === 0) {
    return (
      <div className="flex h-[calc(100vh-200px)] min-h-[400px] border-t">
        {sidebar}
        <div className="flex-1 flex flex-col">
          {searchBar}
          <div className="flex-1 flex items-center justify-center">
            <TracesEmpty hasFilters={hasFilters} onClearFilters={clearFilters} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex h-[calc(100vh-200px)] min-h-[400px] border-t">
        {sidebar}
        <div className="flex-1 flex flex-col overflow-hidden">
          {searchBar}
          {/* Table */}
          <div className="flex-1 overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow className="border-b hover:bg-transparent">
                  <TableHead className="w-[180px] h-8 text-xs font-medium text-muted-foreground">
                    Service
                  </TableHead>
                  <TableHead className="w-[80px] h-8 text-xs font-medium text-muted-foreground">
                    Duration
                  </TableHead>
                  <TableHead className="w-[60px] h-8 text-xs font-medium text-muted-foreground">
                    Spans
                  </TableHead>
                  <TableHead className="w-[60px] h-8 text-xs font-medium text-muted-foreground">
                    Errors
                  </TableHead>
                  <TableHead className="w-[140px] h-8 text-xs font-medium text-muted-foreground">
                    Types
                  </TableHead>
                  <TableHead className="w-[120px] h-8 text-xs font-medium text-muted-foreground">
                    Time
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {traces.map((trace) => (
                  <TraceRow
                    key={trace.id}
                    trace={trace}
                    isSelected={trace.id === selectedTraceId}
                    onSelect={handleSelectTrace}
                    onHover={prefetchTrace}
                  />
                ))}
              </TableBody>
            </Table>

            {/* Infinite scroll trigger */}
            <div ref={loadMoreRef} className="h-4" />

            {/* Load more button (fallback) */}
            {hasNextPage && (
              <div className="flex justify-center py-4">
                <Button
                  variant="outline"
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                >
                  {isFetchingNextPage ? "Loading..." : "Load More"}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Trace detail panel */}
      <TraceDetailPanel
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        traceId={selectedTraceId}
        onClose={handleClosePanel}
      />
    </>
  );
}
