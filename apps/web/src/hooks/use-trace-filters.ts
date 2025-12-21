/**
 * Trace Filters Hook
 *
 * Manages trace filter state synchronized with URL query parameters.
 * Supports debounced search and all filter types from TraceFiltersSchema.
 */

import { useCallback, useMemo } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useDebounce } from "./use-debounce";
import {
  type TraceFilters,
  type SpanType,
  type SpanLevel,
  FILTER_PARAM_KEYS,
  hasActiveFilters,
  countActiveFilters,
  QUICK_TOGGLES,
} from "@cognobserve/api/schemas";
import { type TimeRange } from "@cognobserve/api/schemas";

// ------------------------------------------------------------
// Constants
// ------------------------------------------------------------

const DEBOUNCE_DELAY = 300;
const DEFAULT_TIME_RANGE: TimeRange = "24h";

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------

interface UseTraceFiltersOptions {
  /** Debounce delay for search input in ms (default: 300) */
  debounceDelay?: number;
  /** Default time range (default: "24h") */
  defaultTimeRange?: TimeRange;
}

interface UseTraceFiltersReturn {
  /** Current filter state (with debounced search) */
  filters: TraceFilters;
  /** Raw search value (for input display) */
  searchValue: string;
  /** Debounced search value */
  debouncedSearch: string;
  /** Whether any filters are active */
  hasFilters: boolean;
  /** Count of active filter categories */
  filterCount: number;
  /** Update search value */
  setSearch: (value: string) => void;
  /** Update time range */
  setTimeRange: (range: TimeRange) => void;
  /** Update custom date range */
  setCustomRange: (from: string, to: string) => void;
  /** Toggle a span type filter */
  toggleType: (type: SpanType) => void;
  /** Toggle a span level filter */
  toggleLevel: (level: SpanLevel) => void;
  /** Set duration range */
  setDuration: (min?: number, max?: number) => void;
  /** Apply a quick toggle preset */
  applyQuickToggle: (toggleId: string) => void;
  /** Check if a quick toggle is active */
  isQuickToggleActive: (toggleId: string) => boolean;
  /** Clear all filters */
  clearFilters: () => void;
  /** Update multiple filters at once */
  setFilters: (updates: Partial<TraceFilters>) => void;
}

// ------------------------------------------------------------
// Hook
// ------------------------------------------------------------

export function useTraceFilters(
  options: UseTraceFiltersOptions = {}
): UseTraceFiltersReturn {
  const {
    debounceDelay = DEBOUNCE_DELAY,
    defaultTimeRange = DEFAULT_TIME_RANGE,
  } = options;

  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // ------------------------------------------------------------
  // Parse URL params to filters
  // ------------------------------------------------------------

  const searchValue = searchParams.get(FILTER_PARAM_KEYS.search) ?? "";
  const debouncedSearch = useDebounce(searchValue, debounceDelay);

  const filters: TraceFilters = useMemo(() => {
    const typesParam = searchParams.get(FILTER_PARAM_KEYS.types);
    const levelsParam = searchParams.get(FILTER_PARAM_KEYS.levels);
    const modelsParam = searchParams.get(FILTER_PARAM_KEYS.models);
    const minDurationParam = searchParams.get(FILTER_PARAM_KEYS.minDuration);
    const maxDurationParam = searchParams.get(FILTER_PARAM_KEYS.maxDuration);
    const timeRangeParam = searchParams.get(FILTER_PARAM_KEYS.timeRange);
    const customFromParam = searchParams.get(FILTER_PARAM_KEYS.customFrom);
    const customToParam = searchParams.get(FILTER_PARAM_KEYS.customTo);

    return {
      search: debouncedSearch || undefined,
      types: typesParam
        ? (typesParam.split(",") as SpanType[])
        : undefined,
      levels: levelsParam
        ? (levelsParam.split(",") as SpanLevel[])
        : undefined,
      models: modelsParam ? modelsParam.split(",") : undefined,
      minDuration: minDurationParam ? parseInt(minDurationParam, 10) : undefined,
      maxDuration: maxDurationParam ? parseInt(maxDurationParam, 10) : undefined,
      timeRange: (timeRangeParam as TimeRange) || defaultTimeRange,
      customRange:
        customFromParam && customToParam
          ? { from: customFromParam, to: customToParam }
          : undefined,
    };
  }, [searchParams, debouncedSearch, defaultTimeRange]);

  // ------------------------------------------------------------
  // URL update helper
  // ------------------------------------------------------------

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

      // Preserve tab param
      const newUrl = params.toString()
        ? `${pathname}?${params.toString()}`
        : pathname;
      router.replace(newUrl, { scroll: false });
    },
    [searchParams, pathname, router]
  );

  // ------------------------------------------------------------
  // Filter setters
  // ------------------------------------------------------------

  const setSearch = useCallback(
    (value: string) => {
      updateParams({ [FILTER_PARAM_KEYS.search]: value || undefined });
    },
    [updateParams]
  );

  const setTimeRange = useCallback(
    (range: TimeRange) => {
      const updates: Record<string, string | undefined> = {
        [FILTER_PARAM_KEYS.timeRange]: range === defaultTimeRange ? undefined : range,
      };
      // Clear custom range if switching to preset
      if (range !== "custom") {
        updates[FILTER_PARAM_KEYS.customFrom] = undefined;
        updates[FILTER_PARAM_KEYS.customTo] = undefined;
      }
      updateParams(updates);
    },
    [updateParams, defaultTimeRange]
  );

  const setCustomRange = useCallback(
    (from: string, to: string) => {
      updateParams({
        [FILTER_PARAM_KEYS.timeRange]: "custom",
        [FILTER_PARAM_KEYS.customFrom]: from,
        [FILTER_PARAM_KEYS.customTo]: to,
      });
    },
    [updateParams]
  );

  const toggleType = useCallback(
    (type: SpanType) => {
      const currentTypes = filters.types ?? [];
      const newTypes = currentTypes.includes(type)
        ? currentTypes.filter((t) => t !== type)
        : [...currentTypes, type];
      updateParams({
        [FILTER_PARAM_KEYS.types]:
          newTypes.length > 0 ? newTypes.join(",") : undefined,
      });
    },
    [filters.types, updateParams]
  );

  const toggleLevel = useCallback(
    (level: SpanLevel) => {
      const currentLevels = filters.levels ?? [];
      const newLevels = currentLevels.includes(level)
        ? currentLevels.filter((l) => l !== level)
        : [...currentLevels, level];
      updateParams({
        [FILTER_PARAM_KEYS.levels]:
          newLevels.length > 0 ? newLevels.join(",") : undefined,
      });
    },
    [filters.levels, updateParams]
  );

  const setDuration = useCallback(
    (min?: number, max?: number) => {
      updateParams({
        [FILTER_PARAM_KEYS.minDuration]: min?.toString(),
        [FILTER_PARAM_KEYS.maxDuration]: max?.toString(),
      });
    },
    [updateParams]
  );

  const setFilters = useCallback(
    (updates: Partial<TraceFilters>) => {
      const paramUpdates: Record<string, string | undefined> = {};

      if ("search" in updates) {
        paramUpdates[FILTER_PARAM_KEYS.search] = updates.search;
      }
      if ("types" in updates) {
        paramUpdates[FILTER_PARAM_KEYS.types] =
          updates.types && updates.types.length > 0
            ? updates.types.join(",")
            : undefined;
      }
      if ("levels" in updates) {
        paramUpdates[FILTER_PARAM_KEYS.levels] =
          updates.levels && updates.levels.length > 0
            ? updates.levels.join(",")
            : undefined;
      }
      if ("models" in updates) {
        paramUpdates[FILTER_PARAM_KEYS.models] =
          updates.models && updates.models.length > 0
            ? updates.models.join(",")
            : undefined;
      }
      if ("minDuration" in updates) {
        paramUpdates[FILTER_PARAM_KEYS.minDuration] =
          updates.minDuration?.toString();
      }
      if ("maxDuration" in updates) {
        paramUpdates[FILTER_PARAM_KEYS.maxDuration] =
          updates.maxDuration?.toString();
      }
      if ("timeRange" in updates) {
        paramUpdates[FILTER_PARAM_KEYS.timeRange] =
          updates.timeRange === defaultTimeRange ? undefined : updates.timeRange;
      }
      if ("customRange" in updates) {
        paramUpdates[FILTER_PARAM_KEYS.customFrom] = updates.customRange?.from;
        paramUpdates[FILTER_PARAM_KEYS.customTo] = updates.customRange?.to;
      }

      updateParams(paramUpdates);
    },
    [updateParams, defaultTimeRange]
  );

  // ------------------------------------------------------------
  // Quick toggles
  // ------------------------------------------------------------

  const applyQuickToggle = useCallback(
    (toggleId: string) => {
      const toggle = QUICK_TOGGLES.find((t) => t.id === toggleId);
      if (!toggle) return;

      // If toggle is already active, clear it
      if (toggle.isActive(filters)) {
        // Clear the specific filter this toggle sets
        const clearUpdates: Partial<TraceFilters> = {};
        if (toggle.filter.levels) clearUpdates.levels = undefined;
        if (toggle.filter.types) clearUpdates.types = undefined;
        if (toggle.filter.minDuration !== undefined)
          clearUpdates.minDuration = undefined;
        if (toggle.filter.maxDuration !== undefined)
          clearUpdates.maxDuration = undefined;
        setFilters(clearUpdates);
      } else {
        // Apply the toggle filter
        setFilters(toggle.filter);
      }
    },
    [filters, setFilters]
  );

  const isQuickToggleActive = useCallback(
    (toggleId: string): boolean => {
      const toggle = QUICK_TOGGLES.find((t) => t.id === toggleId);
      return toggle?.isActive(filters) ?? false;
    },
    [filters]
  );

  // ------------------------------------------------------------
  // Clear all
  // ------------------------------------------------------------

  const clearFilters = useCallback(() => {
    // Keep tab param, clear everything else filter-related
    const params = new URLSearchParams(searchParams.toString());
    const tabParam = params.get("tab");

    const newParams = new URLSearchParams();
    if (tabParam) {
      newParams.set("tab", tabParam);
    }

    const newUrl = newParams.toString()
      ? `${pathname}?${newParams.toString()}`
      : pathname;
    router.replace(newUrl, { scroll: false });
  }, [searchParams, pathname, router]);

  // ------------------------------------------------------------
  // Return
  // ------------------------------------------------------------

  return {
    filters,
    searchValue,
    debouncedSearch,
    hasFilters: hasActiveFilters(filters),
    filterCount: countActiveFilters(filters),
    setSearch,
    setTimeRange,
    setCustomRange,
    toggleType,
    toggleLevel,
    setDuration,
    applyQuickToggle,
    isQuickToggleActive,
    clearFilters,
    setFilters,
  };
}
