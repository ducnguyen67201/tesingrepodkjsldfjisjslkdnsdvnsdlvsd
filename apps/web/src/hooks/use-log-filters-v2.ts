/**
 * Log Filters v2 Hook
 *
 * Manages LogFilterExpression-based filter state synchronized with URL query parameters.
 * Supports AND/OR/NOT expressions, field predicates, attribute predicates, and full-text search.
 *
 * @see packages/api/src/schemas/log-filtering.ts for DSL types
 */

import { useCallback, useMemo } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import type {
  LogFilterExpression,
  LogField,
  LogFieldPredicate,
} from "@ducsigr/api/schemas";
import type { FilterOperator } from "@ducsigr/api/schemas";
import {
  LOG_FILTER_V2_URL_PARAMS,
  compressLogFilterForUrl,
  decompressLogFilterFromUrl,
  LOG_QUICK_FILTER_PRESETS,
  type LogQuickFilterPreset,
} from "@/lib/log-filter";

// ============================================================================
// Types
// ============================================================================

interface UseLogFiltersV2Options {
  /** Default time range in hours (default: 24) */
  defaultHours?: number;
}

interface TimeRangeInput {
  from: string;
  to: string;
}

interface UseLogFiltersV2Return {
  /** Current filter expression (null if no filters) */
  filter: LogFilterExpression | null;
  /** Time range for the query */
  timeRange: TimeRangeInput;
  /** Search query from the query builder */
  searchQuery: string;
  /** Whether any filters are active */
  hasFilters: boolean;
  /** Count of active predicates */
  predicateCount: number;
  /** Flattened list of predicates for chip display */
  predicates: LogFilterPredicate[];
  /** Add a field predicate */
  addFieldPredicate: (
    field: LogField,
    op: FilterOperator,
    value?: string | number | boolean | string[] | number[]
  ) => void;
  /** Add a search predicate */
  addSearchPredicate: (query: string) => void;
  /** Remove a predicate by index */
  removePredicate: (index: number) => void;
  /** Update a predicate */
  updatePredicate: (index: number, predicate: LogFilterPredicate) => void;
  /** Apply a quick filter preset */
  applyQuickPreset: (presetId: string) => void;
  /** Check if a quick preset is active */
  isPresetActive: (presetId: string) => boolean;
  /** Set the time range */
  setTimeRange: (from: Date, to: Date) => void;
  /** Set time range by preset (1h, 6h, 24h, 7d, 30d) */
  setTimeRangePreset: (preset: "1h" | "6h" | "24h" | "7d" | "30d") => void;
  /** Set search query (parsed into predicates) */
  setSearchQuery: (query: string) => void;
  /** Clear all filters */
  clearFilters: () => void;
  /** Set complete filter expression (for advanced use) */
  setFilter: (filter: LogFilterExpression | null) => void;
  /** Get quick filter presets */
  quickPresets: readonly LogQuickFilterPreset[];
}

/**
 * Flattened predicate for UI display and manipulation
 */
export interface LogFilterPredicate {
  type: "field" | "attribute" | "search";
  /** Field name (for field predicates) */
  field?: LogField;
  /** Operator */
  op?: FilterOperator;
  /** Value */
  value?: string | number | boolean | string[] | number[];
  /** Search query (for search predicates) */
  query?: string;
  /** Scope (for attribute predicates) */
  scope?: "resource" | "log";
  /** Attribute key (for attribute predicates) */
  attributeKey?: string;
  /** Display label */
  label: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a time range from hours ago to now
 */
const createTimeRange = (hoursAgo: number): TimeRangeInput => {
  const now = new Date();
  const from = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000);
  return {
    from: from.toISOString(),
    to: now.toISOString(),
  };
};

/**
 * Flatten a LogFilterExpression into a list of predicates for display
 */
const flattenPredicates = (
  expr: LogFilterExpression | null
): LogFilterPredicate[] => {
  if (!expr) return [];

  const predicates: LogFilterPredicate[] = [];

  const collect = (e: LogFilterExpression): void => {
    if ("and" in e) {
      for (const child of e.and) {
        collect(child);
      }
    } else if ("or" in e) {
      for (const child of e.or) {
        collect(child);
      }
    } else if ("not" in e) {
      collect(e.not);
    } else if ("field" in e) {
      const fieldPred = e as LogFieldPredicate;
      predicates.push({
        type: "field",
        field: fieldPred.field,
        op: fieldPred.op,
        value: fieldPred.value,
        label: `${fieldPred.field} ${fieldPred.op} ${String(fieldPred.value ?? "")}`,
      });
    } else if ("attribute" in e) {
      predicates.push({
        type: "attribute",
        attributeKey: e.attribute.key,
        scope: e.attribute.scope,
        op: e.attribute.op,
        value: e.attribute.value,
        label: `${e.attribute.scope}.${e.attribute.key} ${e.attribute.op} ${String(e.attribute.value ?? "")}`,
      });
    } else if ("search" in e) {
      predicates.push({
        type: "search",
        query: e.search.query,
        label: `body contains "${e.search.query}"`,
      });
    }
  };

  collect(expr);
  return predicates;
};

/**
 * Build LogFilterExpression from a list of predicates (AND them together)
 */
const buildFilterFromPredicates = (
  predicates: LogFilterPredicate[]
): LogFilterExpression | null => {
  if (predicates.length === 0) return null;

  const expressions: LogFilterExpression[] = predicates
    .map((p) => {
      if (p.type === "field" && p.field && p.op) {
        return {
          field: p.field,
          op: p.op,
          value: p.value,
        } as LogFilterExpression;
      }
      if (p.type === "attribute" && p.attributeKey && p.op) {
        return {
          attribute: {
            scope: p.scope as "resource" | "log",
            key: p.attributeKey,
            op: p.op,
            value: p.value,
          },
        } as LogFilterExpression;
      }
      if (p.type === "search" && p.query) {
        return {
          search: {
            query: p.query,
            mode: "terms" as const,
          },
        } as LogFilterExpression;
      }
      return null;
    })
    .filter((e): e is LogFilterExpression => e !== null);

  if (expressions.length === 0) return null;
  if (expressions.length === 1) return expressions[0]!;
  return { and: expressions };
};

// ============================================================================
// Hook
// ============================================================================

export function useLogFiltersV2(
  options: UseLogFiltersV2Options = {}
): UseLogFiltersV2Return {
  const { defaultHours = 24 } = options;

  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // ============================================================================
  // Parse URL params
  // ============================================================================

  const filter = useMemo((): LogFilterExpression | null => {
    const encoded = searchParams.get(LOG_FILTER_V2_URL_PARAMS.filter);
    if (!encoded) return null;
    return decompressLogFilterFromUrl(encoded);
  }, [searchParams]);

  const timeRange = useMemo((): TimeRangeInput => {
    const from = searchParams.get(LOG_FILTER_V2_URL_PARAMS.from);
    const to = searchParams.get(LOG_FILTER_V2_URL_PARAMS.to);

    if (from && to) {
      return { from, to };
    }

    return createTimeRange(defaultHours);
  }, [searchParams, defaultHours]);

  const searchQuery = useMemo(() => {
    return searchParams.get(LOG_FILTER_V2_URL_PARAMS.query) ?? "";
  }, [searchParams]);

  // ============================================================================
  // Derived state
  // ============================================================================

  const predicates = useMemo(() => flattenPredicates(filter), [filter]);
  const hasFilters = predicates.length > 0 || searchQuery.length > 0;
  const predicateCount = predicates.length;

  // ============================================================================
  // URL update helper
  // ============================================================================

  const updateParams = useCallback(
    (updates: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());

      for (const [key, value] of Object.entries(updates)) {
        if (value === undefined || value === "") {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }

      const newUrl = params.toString()
        ? `${pathname}?${params.toString()}`
        : pathname;
      router.replace(newUrl, { scroll: false });
    },
    [searchParams, pathname, router]
  );

  // ============================================================================
  // Filter manipulation
  // ============================================================================

  const setFilter = useCallback(
    (newFilter: LogFilterExpression | null) => {
      updateParams({
        [LOG_FILTER_V2_URL_PARAMS.filter]: newFilter
          ? compressLogFilterForUrl(newFilter)
          : undefined,
      });
    },
    [updateParams]
  );

  const addFieldPredicate = useCallback(
    (
      field: LogField,
      op: FilterOperator,
      value?: string | number | boolean | string[] | number[]
    ) => {
      const newPred: LogFilterPredicate = {
        type: "field",
        field,
        op,
        value,
        label: `${field} ${op} ${String(value ?? "")}`,
      };

      const newPredicates = [...predicates, newPred];
      const newFilter = buildFilterFromPredicates(newPredicates);
      setFilter(newFilter);
    },
    [predicates, setFilter]
  );

  const addSearchPredicate = useCallback(
    (query: string) => {
      const newPred: LogFilterPredicate = {
        type: "search",
        query,
        label: `body contains "${query}"`,
      };

      const newPredicates = [...predicates, newPred];
      const newFilter = buildFilterFromPredicates(newPredicates);
      setFilter(newFilter);
    },
    [predicates, setFilter]
  );

  const removePredicate = useCallback(
    (index: number) => {
      const newPredicates = predicates.filter((_, i) => i !== index);
      const newFilter = buildFilterFromPredicates(newPredicates);
      setFilter(newFilter);
    },
    [predicates, setFilter]
  );

  const updatePredicate = useCallback(
    (index: number, predicate: LogFilterPredicate) => {
      const newPredicates = [...predicates];
      newPredicates[index] = predicate;
      const newFilter = buildFilterFromPredicates(newPredicates);
      setFilter(newFilter);
    },
    [predicates, setFilter]
  );

  // ============================================================================
  // Quick presets
  // ============================================================================

  const applyQuickPreset = useCallback(
    (presetId: string) => {
      const preset = LOG_QUICK_FILTER_PRESETS.find((p) => p.id === presetId);
      if (!preset) return;

      // Toggle: if already active, remove it
      if (isPresetActiveCheck(filter, preset)) {
        setFilter(null);
      } else {
        setFilter(preset.createFilter());
      }
    },
    [filter, setFilter]
  );

  const isPresetActive = useCallback(
    (presetId: string): boolean => {
      const preset = LOG_QUICK_FILTER_PRESETS.find((p) => p.id === presetId);
      if (!preset || !filter) return false;
      return isPresetActiveCheck(filter, preset);
    },
    [filter]
  );

  // ============================================================================
  // Time range
  // ============================================================================

  const setTimeRange = useCallback(
    (from: Date, to: Date) => {
      updateParams({
        [LOG_FILTER_V2_URL_PARAMS.from]: from.toISOString(),
        [LOG_FILTER_V2_URL_PARAMS.to]: to.toISOString(),
      });
    },
    [updateParams]
  );

  const setTimeRangePreset = useCallback(
    (preset: "1h" | "6h" | "24h" | "7d" | "30d") => {
      const hours =
        preset === "1h"
          ? 1
          : preset === "6h"
            ? 6
            : preset === "24h"
              ? 24
              : preset === "7d"
                ? 168
                : 720;

      const range = createTimeRange(hours);
      updateParams({
        [LOG_FILTER_V2_URL_PARAMS.from]: range.from,
        [LOG_FILTER_V2_URL_PARAMS.to]: range.to,
      });
    },
    [updateParams]
  );

  // ============================================================================
  // Search
  // ============================================================================

  const setSearchQuery = useCallback(
    (query: string) => {
      updateParams({
        [LOG_FILTER_V2_URL_PARAMS.query]: query || undefined,
      });
    },
    [updateParams]
  );

  // ============================================================================
  // Clear all
  // ============================================================================

  const clearFilters = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());

    // Keep log selection param
    const logParam = params.get(LOG_FILTER_V2_URL_PARAMS.log);

    // Clear filter-related params
    params.delete(LOG_FILTER_V2_URL_PARAMS.filter);
    params.delete(LOG_FILTER_V2_URL_PARAMS.query);

    // Keep time range (don't clear)

    // Restore log param if it existed
    if (logParam) {
      params.set(LOG_FILTER_V2_URL_PARAMS.log, logParam);
    }

    const newUrl = params.toString()
      ? `${pathname}?${params.toString()}`
      : pathname;
    router.replace(newUrl, { scroll: false });
  }, [searchParams, pathname, router]);

  // ============================================================================
  // Return
  // ============================================================================

  return {
    filter,
    timeRange,
    searchQuery,
    hasFilters,
    predicateCount,
    predicates,
    addFieldPredicate,
    addSearchPredicate,
    removePredicate,
    updatePredicate,
    applyQuickPreset,
    isPresetActive,
    setTimeRange,
    setTimeRangePreset,
    setSearchQuery,
    clearFilters,
    setFilter,
    quickPresets: LOG_QUICK_FILTER_PRESETS,
  };
}

// ============================================================================
// Helper: Check if a preset is active
// ============================================================================

function isPresetActiveCheck(
  filter: LogFilterExpression | null,
  preset: LogQuickFilterPreset
): boolean {
  if (!filter) return false;

  // Simple heuristic: stringify and compare
  const presetFilter = preset.createFilter();
  const presetStr = JSON.stringify(presetFilter);
  const filterStr = JSON.stringify(filter);

  // Direct match
  if (filterStr === presetStr) return true;

  // Check if filter is AND containing the preset
  if ("and" in filter) {
    for (const child of filter.and) {
      if (JSON.stringify(child) === presetStr) return true;
    }
  }

  return false;
}
