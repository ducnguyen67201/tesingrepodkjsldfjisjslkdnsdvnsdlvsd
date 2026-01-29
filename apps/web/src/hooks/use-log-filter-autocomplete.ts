/**
 * Log Filter Autocomplete Hook
 *
 * Provides autocomplete suggestions for log filter field keys and values
 * by fetching from the logs.filterKeys and logs.filterValues endpoints.
 */

import { useMemo } from "react";
import type { LogField, LogAttributeScope } from "@ducsigr/api/schemas";
import { trpc } from "@/lib/trpc/client";
import {
  LOG_FIELD_META,
  getLogFieldMeta,
  type LogFilterFieldMeta,
  type LogFilterFieldCategory,
  LOG_FILTER_CATEGORY_LABELS,
} from "@/lib/log-filter";

// ============================================================================
// Types
// ============================================================================

interface UseLogFilterAutocompleteOptions {
  /** Workspace slug for API calls */
  workspaceSlug: string;
  /** Optional project ID to filter */
  projectId?: string;
  /** Attribute scope for dynamic attributes */
  scope?: LogAttributeScope;
  /** Enable/disable the hook */
  enabled?: boolean;
}

interface UseLogFilterAutocompleteReturn {
  /** All available filter fields (static + dynamic) */
  fields: LogFieldSuggestion[];
  /** Get value suggestions for a field */
  getValueSuggestions: (field: LogField, prefix?: string) => string[];
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
export interface LogFieldSuggestion {
  /** Field identifier */
  field: LogField | string;
  /** Display label */
  label: string;
  /** Category for grouping */
  category: string;
  /** Description */
  description?: string;
  /** Is this a dynamic attribute (not a static field) */
  isDynamic?: boolean;
  /** Field metadata */
  meta?: LogFilterFieldMeta;
}

// ============================================================================
// Hook
// ============================================================================

export function useLogFilterAutocomplete(
  options: UseLogFilterAutocompleteOptions
): UseLogFilterAutocompleteReturn {
  const { workspaceSlug, projectId, scope = "log", enabled = true } = options;

  // Fetch dynamic attribute keys
  const keysQuery = trpc.logs.filterKeys.useQuery(
    {
      workspaceSlug,
      projectId,
      scope,
      limit: 50,
    },
    {
      enabled: enabled && !!workspaceSlug,
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes
    }
  );

  // Build static field suggestions
  const staticFields = useMemo((): LogFieldSuggestion[] => {
    const suggestions: LogFieldSuggestion[] = [];

    for (const [field, meta] of Object.entries(LOG_FIELD_META)) {
      suggestions.push({
        field: field as LogField,
        label: meta.label,
        category: getCategoryLabel(meta.category),
        description: meta.description,
        meta,
      });
    }

    return suggestions;
  }, []);

  // Build dynamic attribute suggestions from API
  const dynamicFields = useMemo((): LogFieldSuggestion[] => {
    if (!keysQuery.data?.keys) return [];

    return keysQuery.data.keys.map((key) => ({
      field: `${scope}.${key}`,
      label: key,
      category: scope === "resource" ? "Resource Attributes" : "Log Attributes",
      isDynamic: true,
    }));
  }, [keysQuery.data?.keys, scope]);

  // Combined fields
  const fields = useMemo(
    () => [...staticFields, ...dynamicFields],
    [staticFields, dynamicFields]
  );

  // Get value suggestions for a field
  const getValueSuggestions = (field: LogField, prefix?: string): string[] => {
    const meta = getLogFieldMeta(field);
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

interface UseLogValueAutocompleteOptions {
  /** Workspace slug */
  workspaceSlug: string;
  /** Optional project ID */
  projectId?: string;
  /** Scope (resource or log) */
  scope: LogAttributeScope;
  /** Attribute key to get values for */
  attributeKey: string;
  /** Prefix to filter values */
  prefix?: string;
  /** Enable/disable */
  enabled?: boolean;
}

interface UseLogValueAutocompleteReturn {
  /** Suggested values */
  values: string[];
  /** Loading state */
  isLoading: boolean;
}

export function useLogValueAutocomplete(
  options: UseLogValueAutocompleteOptions
): UseLogValueAutocompleteReturn {
  const {
    workspaceSlug,
    projectId,
    scope,
    attributeKey,
    prefix,
    enabled = true,
  } = options;

  const valuesQuery = trpc.logs.filterValues.useQuery(
    {
      workspaceSlug,
      projectId,
      scope,
      key: attributeKey,
      prefix,
      limit: 20,
    },
    {
      enabled: enabled && !!workspaceSlug && !!attributeKey,
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

interface UseLogFilterStatsOptions {
  /** Workspace slug */
  workspaceSlug: string;
  /** Optional project ID */
  projectId?: string;
  /** Time range */
  timeRange: { from: string; to: string };
  /** Current filter to apply */
  filter?: import("@ducsigr/api/schemas").LogFilterExpression;
  /** Enable/disable */
  enabled?: boolean;
}

interface LogFilterStats {
  services: { name: string; count: number }[];
  severities: { level: string; count: number }[];
  environments: { name: string; count: number }[];
  totalCount: number;
}

interface UseLogFilterStatsReturn {
  /** Filter statistics */
  stats: LogFilterStats | null;
  /** Loading state */
  isLoading: boolean;
}

export function useLogFilterStats(
  options: UseLogFilterStatsOptions
): UseLogFilterStatsReturn {
  const { workspaceSlug, projectId, timeRange, filter, enabled = true } = options;

  const statsQuery = trpc.logs.filterStats.useQuery(
    {
      workspaceSlug,
      projectId,
      timeRange,
      filter,
    },
    {
      enabled: enabled && !!workspaceSlug,
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

function getCategoryLabel(category: LogFilterFieldCategory): string {
  return LOG_FILTER_CATEGORY_LABELS[category] ?? category;
}
