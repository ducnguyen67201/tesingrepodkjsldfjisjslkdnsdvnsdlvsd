/**
 * Trace Filters v2 Hook
 *
 * Manages FilterExpression-based filter state synchronized with URL query parameters.
 * Supports AND/OR/NOT expressions, field predicates, attribute predicates, and full-text search.
 *
 * @see packages/api/src/schemas/filtering.ts for DSL types
 */

import { useCallback, useMemo } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import type {
  FilterExpression,
  FilterField,
  FilterOperator,
  TimeRangeInput,
  SearchScope,
  FieldPredicate,
} from "@cognobserve/api/schemas";
import {
  FILTER_V2_URL_PARAMS,
  compressFilterForUrl,
  decompressFilterFromUrl,
  QUICK_FILTER_PRESETS,
  type QuickFilterPreset,
} from "@/lib/trace-filter";

// ============================================================================
// Types
// ============================================================================

interface UseTraceFiltersV2Options {
  /** Default time range in hours (default: 24) */
  defaultHours?: number;
}

interface UseTraceFiltersV2Return {
  /** Current filter expression (null if no filters) */
  filter: FilterExpression | null;
  /** Time range for the query */
  timeRange: TimeRangeInput;
  /** Search query from the query builder */
  searchQuery: string;
  /** Search scope */
  searchScope: SearchScope;
  /** Whether any filters are active */
  hasFilters: boolean;
  /** Count of active predicates */
  predicateCount: number;
  /** Flattened list of predicates for chip display */
  predicates: FilterPredicate[];
  /** Add a field predicate */
  addFieldPredicate: (
    field: FilterField,
    op: FilterOperator,
    value?: string | number | boolean | string[] | number[]
  ) => void;
  /** Add a search predicate */
  addSearchPredicate: (query: string, scope?: SearchScope) => void;
  /** Remove a predicate by index */
  removePredicate: (index: number) => void;
  /** Update a predicate */
  updatePredicate: (index: number, predicate: FilterPredicate) => void;
  /** Apply a quick filter preset */
  applyQuickPreset: (presetId: string) => void;
  /** Check if a quick preset is active */
  isPresetActive: (presetId: string) => boolean;
  /** Set the time range */
  setTimeRange: (from: Date, to: Date) => void;
  /** Set time range by preset (24h, 7d, 30d) */
  setTimeRangePreset: (preset: "1h" | "6h" | "24h" | "7d" | "30d") => void;
  /** Set search query (parsed into predicates) */
  setSearchQuery: (query: string) => void;
  /** Set search scope */
  setSearchScope: (scope: SearchScope) => void;
  /** Clear all filters */
  clearFilters: () => void;
  /** Set complete filter expression (for advanced use) */
  setFilter: (filter: FilterExpression | null) => void;
  /** Get quick filter presets */
  quickPresets: readonly QuickFilterPreset[];
}

/**
 * Flattened predicate for UI display and manipulation
 */
export interface FilterPredicate {
  type: "field" | "attribute" | "event" | "search";
  /** Field name (for field predicates) */
  field?: FilterField;
  /** Operator */
  op?: FilterOperator;
  /** Value */
  value?: string | number | boolean | string[] | number[];
  /** Search query (for search predicates) */
  query?: string;
  /** Scope (for search/attribute predicates) */
  scope?: SearchScope | "resource" | "span";
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
 * Flatten a FilterExpression into a list of predicates for display
 */
const flattenPredicates = (
  expr: FilterExpression | null
): FilterPredicate[] => {
  if (!expr) return [];

  const predicates: FilterPredicate[] = [];

  const collect = (e: FilterExpression): void => {
    if ("and" in e) {
      for (const child of e.and) {
        collect(child);
      }
    } else if ("or" in e) {
      // For OR, we treat the whole OR as one unit
      // In UI we might want to show it differently
      for (const child of e.or) {
        collect(child);
      }
    } else if ("not" in e) {
      collect(e.not);
    } else if ("field" in e) {
      const fieldPred = e as FieldPredicate;
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
        scope: e.search.scope ?? "both",
        label: `search: "${e.search.query}"`,
      });
    }
  };

  collect(expr);
  return predicates;
};

/**
 * Build FilterExpression from a list of predicates (AND them together)
 */
const buildFilterFromPredicates = (
  predicates: FilterPredicate[]
): FilterExpression | null => {
  if (predicates.length === 0) return null;

  const expressions: FilterExpression[] = predicates
    .map((p) => {
      if (p.type === "field" && p.field && p.op) {
        return {
          field: p.field,
          op: p.op,
          value: p.value,
        } as FilterExpression;
      }
      if (p.type === "attribute" && p.attributeKey && p.op) {
        return {
          attribute: {
            scope: p.scope as "resource" | "span",
            key: p.attributeKey,
            op: p.op,
            value: p.value,
          },
        } as FilterExpression;
      }
      if (p.type === "search" && p.query) {
        return {
          search: {
            query: p.query,
            scope: (p.scope as SearchScope) ?? "both",
            mode: "terms" as const,
          },
        } as FilterExpression;
      }
      return null;
    })
    .filter((e): e is FilterExpression => e !== null);

  if (expressions.length === 0) return null;
  if (expressions.length === 1) return expressions[0]!;
  return { and: expressions };
};

// ============================================================================
// Hook
// ============================================================================

export function useTraceFiltersV2(
  options: UseTraceFiltersV2Options = {}
): UseTraceFiltersV2Return {
  const { defaultHours = 24 } = options;

  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // ============================================================================
  // Parse URL params
  // ============================================================================

  const filter = useMemo((): FilterExpression | null => {
    const encoded = searchParams.get(FILTER_V2_URL_PARAMS.filter);
    if (!encoded) return null;
    return decompressFilterFromUrl(encoded);
  }, [searchParams]);

  const timeRange = useMemo((): TimeRangeInput => {
    const from = searchParams.get(FILTER_V2_URL_PARAMS.from);
    const to = searchParams.get(FILTER_V2_URL_PARAMS.to);

    if (from && to) {
      return { from, to };
    }

    // Default time range
    return createTimeRange(defaultHours);
  }, [searchParams, defaultHours]);

  const searchQuery = useMemo(() => {
    return searchParams.get(FILTER_V2_URL_PARAMS.query) ?? "";
  }, [searchParams]);

  const searchScope = useMemo((): SearchScope => {
    const scope = searchParams.get(FILTER_V2_URL_PARAMS.scope);
    if (scope === "trace" || scope === "span" || scope === "both") {
      return scope;
    }
    return "both";
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
    (newFilter: FilterExpression | null) => {
      updateParams({
        [FILTER_V2_URL_PARAMS.filter]: newFilter
          ? compressFilterForUrl(newFilter)
          : undefined,
      });
    },
    [updateParams]
  );

  const addFieldPredicate = useCallback(
    (
      field: FilterField,
      op: FilterOperator,
      value?: string | number | boolean | string[] | number[]
    ) => {
      const newPred: FilterPredicate = {
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
    (query: string, scope: SearchScope = "both") => {
      const newPred: FilterPredicate = {
        type: "search",
        query,
        scope,
        label: `search: "${query}"`,
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
    (index: number, predicate: FilterPredicate) => {
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
      const preset = QUICK_FILTER_PRESETS.find((p) => p.id === presetId);
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
      const preset = QUICK_FILTER_PRESETS.find((p) => p.id === presetId);
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
        [FILTER_V2_URL_PARAMS.from]: from.toISOString(),
        [FILTER_V2_URL_PARAMS.to]: to.toISOString(),
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
        [FILTER_V2_URL_PARAMS.from]: range.from,
        [FILTER_V2_URL_PARAMS.to]: range.to,
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
        [FILTER_V2_URL_PARAMS.query]: query || undefined,
      });
    },
    [updateParams]
  );

  const setSearchScope = useCallback(
    (scope: SearchScope) => {
      updateParams({
        [FILTER_V2_URL_PARAMS.scope]: scope === "both" ? undefined : scope,
      });
    },
    [updateParams]
  );

  // ============================================================================
  // Clear all
  // ============================================================================

  const clearFilters = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());

    // Keep trace selection param
    const traceParam = params.get(FILTER_V2_URL_PARAMS.trace);

    // Clear filter-related params
    params.delete(FILTER_V2_URL_PARAMS.filter);
    params.delete(FILTER_V2_URL_PARAMS.query);
    params.delete(FILTER_V2_URL_PARAMS.scope);

    // Keep time range (don't clear)

    // Restore trace param if it existed
    if (traceParam) {
      params.set(FILTER_V2_URL_PARAMS.trace, traceParam);
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
    searchScope,
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
    setSearchScope,
    clearFilters,
    setFilter,
    quickPresets: QUICK_FILTER_PRESETS,
  };
}

// ============================================================================
// Helper: Check if a preset is active
// ============================================================================

function isPresetActiveCheck(
  filter: FilterExpression | null,
  preset: QuickFilterPreset
): boolean {
  if (!filter) return false;

  // Simple heuristic: stringify and compare
  // This works for simple presets but not for complex ones
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
