/**
 * Filter Autocomplete Hook
 *
 * Provides autocomplete suggestions for filter field keys and values
 * by fetching from the filters API endpoints.
 *
 * @see packages/api/src/routers/filters.ts
 */

import { useMemo } from "react";
import type { AttributeScope, FilterField } from "@cognobserve/api/schemas";
import { trpc } from "@/lib/trpc/client";
import {
  TRACE_FIELD_META,
  SPAN_FIELD_META,
  getFieldMeta,
  type FilterFieldMeta,
} from "@/lib/trace-filter";

// ============================================================================
// Types
// ============================================================================

interface UseFilterAutocompleteOptions {
  /** Project ID for API calls */
  projectId: string;
  /** Attribute scope for dynamic attributes */
  scope?: AttributeScope;
  /** Enable/disable the hook */
  enabled?: boolean;
}

interface UseFilterAutocompleteReturn {
  /** All available filter fields (static + dynamic) */
  fields: FilterFieldSuggestion[];
  /** Get value suggestions for a field */
  getValueSuggestions: (field: FilterField, prefix?: string) => string[];
  /** Loading state for dynamic keys */
  isLoadingKeys: boolean;
  /** Fetch dynamic attribute keys */
  fetchKeys: () => void;
  /** Dynamic attribute keys from API */
  dynamicKeys: string[];
}

/**
 * Field suggestion for autocomplete dropdown
 */
export interface FilterFieldSuggestion {
  /** Field identifier */
  field: FilterField | string;
  /** Display label */
  label: string;
  /** Category for grouping */
  category: string;
  /** Description */
  description?: string;
  /** Is this a dynamic attribute (not a static field) */
  isDynamic?: boolean;
  /** Field metadata */
  meta?: FilterFieldMeta;
}

// ============================================================================
// Hook
// ============================================================================

export function useFilterAutocomplete(
  options: UseFilterAutocompleteOptions
): UseFilterAutocompleteReturn {
  const { projectId, scope = "span", enabled = true } = options;

  // Fetch dynamic attribute keys
  const keysQuery = trpc.filters.keys.useQuery(
    {
      projectId,
      scope,
      limit: 50,
    },
    {
      enabled: enabled && !!projectId,
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes (was cacheTime)
    }
  );

  // Build static field suggestions
  const staticFields = useMemo((): FilterFieldSuggestion[] => {
    const suggestions: FilterFieldSuggestion[] = [];

    // Trace fields
    for (const [field, meta] of Object.entries(TRACE_FIELD_META)) {
      suggestions.push({
        field: field as FilterField,
        label: meta.label,
        category: "Trace",
        description: meta.description,
        meta,
      });
    }

    // Span fields
    for (const [field, meta] of Object.entries(SPAN_FIELD_META)) {
      suggestions.push({
        field: field as FilterField,
        label: meta.label,
        category: getCategoryLabel(meta.category),
        description: meta.description,
        meta,
      });
    }

    return suggestions;
  }, []);

  // Build dynamic attribute suggestions from API
  const dynamicFields = useMemo((): FilterFieldSuggestion[] => {
    if (!keysQuery.data?.keys) return [];

    return keysQuery.data.keys.map((key) => ({
      field: `${scope}.${key}`,
      label: key,
      category: scope === "resource" ? "Resource Attributes" : "Span Attributes",
      isDynamic: true,
    }));
  }, [keysQuery.data?.keys, scope]);

  // Combined fields
  const fields = useMemo(
    () => [...staticFields, ...dynamicFields],
    [staticFields, dynamicFields]
  );

  // Get value suggestions for a field
  const getValueSuggestions = (field: FilterField, prefix?: string): string[] => {
    const meta = getFieldMeta(field);
    if (meta?.knownValues) {
      const values = [...meta.knownValues];
      if (prefix) {
        return values.filter((v) =>
          v.toLowerCase().includes(prefix.toLowerCase())
        );
      }
      return values;
    }
    return [];
  };

  // Fetch dynamic keys (trigger refetch)
  const fetchKeys = () => {
    keysQuery.refetch();
  };

  return {
    fields,
    getValueSuggestions,
    isLoadingKeys: keysQuery.isLoading,
    fetchKeys,
    dynamicKeys: keysQuery.data?.keys ?? [],
  };
}

// ============================================================================
// Value Autocomplete Hook
// ============================================================================

interface UseValueAutocompleteOptions {
  /** Project ID */
  projectId: string;
  /** Scope (resource or span) */
  scope: AttributeScope;
  /** Attribute key to get values for */
  attributeKey: string;
  /** Prefix to filter values */
  prefix?: string;
  /** Enable/disable */
  enabled?: boolean;
}

interface UseValueAutocompleteReturn {
  /** Suggested values */
  values: string[];
  /** Loading state */
  isLoading: boolean;
}

export function useValueAutocomplete(
  options: UseValueAutocompleteOptions
): UseValueAutocompleteReturn {
  const { projectId, scope, attributeKey, prefix, enabled = true } = options;

  const valuesQuery = trpc.filters.values.useQuery(
    {
      projectId,
      scope,
      key: attributeKey,
      prefix,
      limit: 20,
    },
    {
      enabled: enabled && !!projectId && !!attributeKey,
      staleTime: 30 * 1000, // 30 seconds
      gcTime: 60 * 1000, // 1 minute
    }
  );

  return {
    values: valuesQuery.data?.values ?? [],
    isLoading: valuesQuery.isLoading,
  };
}

// ============================================================================
// Filter Stats Hook
// ============================================================================

interface UseFilterStatsOptions {
  /** Project ID */
  projectId: string;
  /** Time range */
  timeRange: { from: string; to: string };
  /** Current filter to apply */
  filter?: import("@cognobserve/api/schemas").FilterExpression;
  /** Enable/disable */
  enabled?: boolean;
}

interface FilterStats {
  services: { name: string; count: number }[];
  environments: { name: string; count: number }[];
  statusCodes: { code: string; count: number }[];
  spanTypes: { type: string; count: number }[];
  httpRoutes: { route: string; count: number }[];
  dbSystems: { system: string; count: number }[];
}

interface UseFilterStatsReturn {
  /** Filter statistics */
  stats: FilterStats | null;
  /** Loading state */
  isLoading: boolean;
}

export function useFilterStats(
  options: UseFilterStatsOptions
): UseFilterStatsReturn {
  const { projectId, timeRange, filter, enabled = true } = options;

  const statsQuery = trpc.filters.stats.useQuery(
    {
      projectId,
      timeRange,
      filter,
    },
    {
      enabled: enabled && !!projectId,
      staleTime: 60 * 1000, // 1 minute
      gcTime: 5 * 60 * 1000, // 5 minutes
    }
  );

  return {
    stats: statsQuery.data ?? null,
    isLoading: statsQuery.isLoading,
  };
}

// ============================================================================
// Helpers
// ============================================================================

function getCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    trace: "Trace",
    http: "HTTP",
    database: "Database",
    rpc: "RPC",
    genai: "GenAI / LLM",
    exception: "Exceptions",
    general: "Span",
  };
  return labels[category] ?? category;
}
