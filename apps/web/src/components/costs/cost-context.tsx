"use client";

import { createContext, useContext, useCallback, useMemo, type ReactNode } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import type { TraceFilters, TimeRange, SpanType, SpanLevel, CustomDateRange } from "@ducsigr/api/schemas";
import {
  SpanTypeSchema,
  SpanLevelSchema,
  TimeRangeSchema,
  FILTER_PARAM_KEYS,
  hasActiveFilters,
  countActiveFilters,
} from "@ducsigr/api/schemas";

interface ProjectFilterContextValue {
  /** All filters including timeRange */
  filters: TraceFilters;
  /** Time range (always has a value, defaults to 7d) */
  timeRange: TimeRange;
  /** Custom date range (when timeRange is "custom") */
  customRange: CustomDateRange | undefined;
  /** Whether any filters (excluding timeRange) are active */
  hasFilters: boolean;
  /** Number of active filter categories */
  filterCount: number;
  /** Set time range (preset) */
  setTimeRange: (range: TimeRange) => void;
  /** Set custom date range */
  setCustomDateRange: (from: string, to: string) => void;
  /** Update filters (merges with existing) */
  setFilters: (newFilters: Partial<TraceFilters>) => void;
  /** Clear all filters (except timeRange) */
  clearFilters: () => void;
  /** Toggle a value in an array filter */
  toggleArrayFilter: <K extends "types" | "levels" | "models">(
    key: K,
    value: K extends "types" ? SpanType : K extends "levels" ? SpanLevel : string
  ) => void;
  /** Apply a quick toggle preset */
  applyQuickToggle: (filter: Partial<TraceFilters>) => void;
}

const ProjectFilterContext = createContext<ProjectFilterContextValue | null>(null);

const DEFAULT_TIME_RANGE: TimeRange = "7d";

/**
 * Parse a comma-separated URL param into an array.
 */
const parseArrayParam = (value: string | null): string[] | undefined => {
  if (!value) return undefined;
  const items = value.split(",").filter(Boolean);
  return items.length > 0 ? items : undefined;
};

/**
 * Parse a number URL param.
 */
const parseNumberParam = (value: string | null): number | undefined => {
  if (!value) return undefined;
  const num = parseInt(value, 10);
  return isNaN(num) ? undefined : num;
};

/**
 * Validate array values against a schema.
 */
const validateArrayParam = <T extends string>(
  values: string[] | undefined,
  options: readonly T[]
): T[] | undefined => {
  if (!values) return undefined;
  const valid = values.filter((v) => options.includes(v as T)) as T[];
  return valid.length > 0 ? valid : undefined;
};

export function ProjectFilterProvider({ children }: { children: ReactNode }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Parse filters from URL
  const filters = useMemo((): TraceFilters => {
    const search = searchParams.get(FILTER_PARAM_KEYS.search) ?? undefined;
    const typesRaw = parseArrayParam(searchParams.get(FILTER_PARAM_KEYS.types));
    const levelsRaw = parseArrayParam(searchParams.get(FILTER_PARAM_KEYS.levels));
    const modelsRaw = parseArrayParam(searchParams.get(FILTER_PARAM_KEYS.models));
    const minDuration = parseNumberParam(searchParams.get(FILTER_PARAM_KEYS.minDuration));
    const maxDuration = parseNumberParam(searchParams.get(FILTER_PARAM_KEYS.maxDuration));
    const timeRangeRaw = searchParams.get(FILTER_PARAM_KEYS.timeRange);
    const customFrom = searchParams.get(FILTER_PARAM_KEYS.customFrom) ?? undefined;
    const customTo = searchParams.get(FILTER_PARAM_KEYS.customTo) ?? undefined;

    // Validate enum values
    const types = validateArrayParam(typesRaw, SpanTypeSchema.options);
    const levels = validateArrayParam(levelsRaw, SpanLevelSchema.options);
    const timeRangeParsed = TimeRangeSchema.safeParse(timeRangeRaw);
    const timeRange = timeRangeParsed.success ? timeRangeParsed.data : DEFAULT_TIME_RANGE;

    // Build custom range if both from and to are present
    const customRange = customFrom && customTo ? { from: customFrom, to: customTo } : undefined;

    return {
      search,
      types,
      levels,
      models: modelsRaw,
      minDuration,
      maxDuration,
      timeRange,
      customRange,
    };
  }, [searchParams]);

  // Always have a timeRange value
  const timeRange = filters.timeRange ?? DEFAULT_TIME_RANGE;
  const customRange = filters.customRange;

  // Update URL with new filters
  const updateUrl = useCallback(
    (newFilters: TraceFilters) => {
      const params = new URLSearchParams();

      if (newFilters.search) {
        params.set(FILTER_PARAM_KEYS.search, newFilters.search);
      }
      if (newFilters.types?.length) {
        params.set(FILTER_PARAM_KEYS.types, newFilters.types.join(","));
      }
      if (newFilters.levels?.length) {
        params.set(FILTER_PARAM_KEYS.levels, newFilters.levels.join(","));
      }
      if (newFilters.models?.length) {
        params.set(FILTER_PARAM_KEYS.models, newFilters.models.join(","));
      }
      if (newFilters.minDuration !== undefined) {
        params.set(FILTER_PARAM_KEYS.minDuration, newFilters.minDuration.toString());
      }
      if (newFilters.maxDuration !== undefined) {
        params.set(FILTER_PARAM_KEYS.maxDuration, newFilters.maxDuration.toString());
      }
      // Always set timeRange
      params.set(FILTER_PARAM_KEYS.timeRange, newFilters.timeRange ?? DEFAULT_TIME_RANGE);
      // Set custom date range if applicable
      if (newFilters.customRange) {
        params.set(FILTER_PARAM_KEYS.customFrom, newFilters.customRange.from);
        params.set(FILTER_PARAM_KEYS.customTo, newFilters.customRange.to);
      }

      const queryString = params.toString();
      const newUrl = queryString ? `${pathname}?${queryString}` : pathname;
      router.replace(newUrl, { scroll: false });
    },
    [pathname, router]
  );

  const setTimeRange = useCallback(
    (range: TimeRange) => {
      // Clear custom range when switching to preset
      const newFilters = { ...filters, timeRange: range };
      if (range !== "custom") {
        newFilters.customRange = undefined;
      }
      updateUrl(newFilters);
    },
    [filters, updateUrl]
  );

  const setCustomDateRange = useCallback(
    (from: string, to: string) => {
      updateUrl({ ...filters, timeRange: "custom", customRange: { from, to } });
    },
    [filters, updateUrl]
  );

  const setFilters = useCallback(
    (newFilters: Partial<TraceFilters>) => {
      const merged = { ...filters, ...newFilters };

      // Clean up empty arrays
      if (Array.isArray(merged.types) && merged.types.length === 0) {
        merged.types = undefined;
      }
      if (Array.isArray(merged.levels) && merged.levels.length === 0) {
        merged.levels = undefined;
      }
      if (Array.isArray(merged.models) && merged.models.length === 0) {
        merged.models = undefined;
      }

      updateUrl(merged);
    },
    [filters, updateUrl]
  );

  const clearFilters = useCallback(() => {
    // Keep only timeRange
    updateUrl({ timeRange: filters.timeRange ?? DEFAULT_TIME_RANGE });
  }, [filters.timeRange, updateUrl]);

  const toggleArrayFilter = useCallback(
    <K extends "types" | "levels" | "models">(
      key: K,
      value: K extends "types" ? SpanType : K extends "levels" ? SpanLevel : string
    ) => {
      const current = (filters[key] ?? []) as string[];
      const newValues = current.includes(value as string)
        ? current.filter((v) => v !== value)
        : [...current, value];

      setFilters({
        [key]: newValues.length > 0 ? newValues : undefined,
      } as Partial<TraceFilters>);
    },
    [filters, setFilters]
  );

  const applyQuickToggle = useCallback(
    (filter: Partial<TraceFilters>) => {
      // Check if preset is already active
      const isActive = Object.entries(filter).every(([key, value]) => {
        const currentValue = filters[key as keyof TraceFilters];
        if (Array.isArray(value) && Array.isArray(currentValue)) {
          return (
            value.length === currentValue.length &&
            value.every((v) => (currentValue as string[]).includes(v as string))
          );
        }
        return currentValue === value;
      });

      if (isActive) {
        // Turn off preset
        const clearedFilters = { ...filters };
        Object.keys(filter).forEach((key) => {
          clearedFilters[key as keyof TraceFilters] = undefined;
        });
        updateUrl(clearedFilters);
      } else {
        setFilters(filter);
      }
    },
    [filters, setFilters, updateUrl]
  );

  // Exclude timeRange from active filter checks
  const filtersWithoutTime = useMemo(() => {
    const { timeRange: _timeRange, ...rest } = filters;
    void _timeRange; // Intentionally unused
    return rest;
  }, [filters]);

  const value: ProjectFilterContextValue = {
    filters,
    timeRange,
    customRange,
    hasFilters: hasActiveFilters(filtersWithoutTime),
    filterCount: countActiveFilters(filtersWithoutTime),
    setTimeRange,
    setCustomDateRange,
    setFilters,
    clearFilters,
    toggleArrayFilter,
    applyQuickToggle,
  };

  return (
    <ProjectFilterContext.Provider value={value}>
      {children}
    </ProjectFilterContext.Provider>
  );
}

export function useProjectFilters() {
  const context = useContext(ProjectFilterContext);
  if (!context) {
    throw new Error("useProjectFilters must be used within a ProjectFilterProvider");
  }
  return context;
}

// Backward compatibility alias
export const CostProvider = ProjectFilterProvider;
export const useCostContext = useProjectFilters;
