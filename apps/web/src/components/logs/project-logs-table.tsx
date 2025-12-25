"use client";

/**
 * Project Logs Table Component
 *
 * Displays logs for a specific project with v2 filtering and search.
 * Uses LogQueryBuilderInput with autocomplete for advanced DSL queries.
 */

import { useState, useCallback, useMemo } from "react";
import { ScrollText, Filter } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LogsTable } from "./logs-table";
import { LogDetailPanel } from "./log-detail-panel";
import { LogQueryBuilderInput } from "./filters-v2/log-query-builder-input";
import { LogFilterChips, LogFilterPills } from "./filters-v2/log-filter-chips";
import { useLogsV2, useLogServices, useLogSeverityStats } from "@/hooks/use-logs";
import { useLogFiltersV2 } from "@/hooks/use-log-filters-v2";
import { parseQueryToFilter } from "@/lib/log-filter";
import {
  SEVERITY_FILTER_OPTIONS,
  type SeverityFilterValue,
} from "@/lib/log-utils";
import { cn } from "@/lib/utils";
import type { LogFilterExpression } from "@cognobserve/api/schemas";

interface ProjectLogsTableProps {
  workspaceSlug: string;
  projectId: string;
}

// ============================================================================
// Sidebar Filter Component
// ============================================================================

interface LogsFilterSidebarProps {
  severityFilter: SeverityFilterValue;
  serviceName: string | null;
  services: { serviceName: string; count: number }[];
  servicesLoading: boolean;
  stats: {
    trace: number;
    debug: number;
    info: number;
    warn: number;
    error: number;
    fatal: number;
  } | null;
  onSeverityChange: (value: SeverityFilterValue) => void;
  onServiceChange: (value: string | null) => void;
  onClearFilters: () => void;
  hasFilters: boolean;
}

function LogsFilterSidebar({
  severityFilter,
  serviceName,
  services,
  servicesLoading,
  stats,
  onSeverityChange,
  onServiceChange,
  onClearFilters,
  hasFilters,
}: LogsFilterSidebarProps) {
  const getSeverityCount = useCallback(
    (option: SeverityFilterValue): number => {
      if (!stats) return 0;
      switch (option) {
        case "all":
          return Object.values(stats).reduce((a, b) => a + b, 0);
        case "debug":
          return stats.debug + stats.info + stats.warn + stats.error + stats.fatal;
        case "info":
          return stats.info + stats.warn + stats.error + stats.fatal;
        case "warn":
          return stats.warn + stats.error + stats.fatal;
        case "error":
          return stats.error + stats.fatal;
        default:
          return 0;
      }
    },
    [stats]
  );

  const renderSeverityOption = useCallback(
    (option: (typeof SEVERITY_FILTER_OPTIONS)[number]) => {
      const isActive = severityFilter === option.value;
      const count = getSeverityCount(option.value);

      return (
        <button
          key={option.value}
          onClick={() => onSeverityChange(option.value)}
          className={cn(
            "w-full flex items-center justify-between px-2 py-1 rounded text-xs transition-colors",
            isActive
              ? "bg-primary/10 text-primary"
              : "hover:bg-muted text-muted-foreground hover:text-foreground"
          )}
        >
          <span>{option.label}</span>
          <span className="text-[10px]">{count.toLocaleString()}</span>
        </button>
      );
    },
    [severityFilter, getSeverityCount, onSeverityChange]
  );

  return (
    <div className="w-[200px] shrink-0 border-r bg-muted/20 p-3 space-y-4 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">Filters</span>
        </div>
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearFilters}
            className="h-6 px-2 text-[10px]"
          >
            Clear
          </Button>
        )}
      </div>

      {/* Severity Stats */}
      {stats && (
        <div className="space-y-1.5">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
            Severity
          </span>
          <div className="space-y-0.5">
            {SEVERITY_FILTER_OPTIONS.map(renderSeverityOption)}
          </div>
        </div>
      )}

      {/* Services */}
      <div className="space-y-1.5">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
          Service
        </span>
        <Select
          value={serviceName ?? "all"}
          onValueChange={(v) => onServiceChange(v === "all" ? null : v)}
          disabled={servicesLoading}
        >
          <SelectTrigger className="h-7 text-xs">
            <SelectValue placeholder="All Services" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">
              All Services
            </SelectItem>
            {services.map((service) => (
              <SelectItem
                key={service.serviceName}
                value={service.serviceName}
                className="text-xs"
              >
                {service.serviceName} ({service.count})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Quick Stats */}
      {stats && (stats.error > 0 || stats.warn > 0) && (
        <div className="space-y-1.5 pt-2 border-t">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
            Alerts
          </span>
          <div className="space-y-1">
            {stats.error > 0 && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-red-600">Errors</span>
                <Badge variant="destructive" className="h-4 px-1.5 text-[10px]">
                  {stats.error}
                </Badge>
              </div>
            )}
            {stats.warn > 0 && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-yellow-600">Warnings</span>
                <Badge
                  variant="outline"
                  className="h-4 px-1.5 text-[10px] border-yellow-500 text-yellow-600"
                >
                  {stats.warn}
                </Badge>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function ProjectLogsTable({
  workspaceSlug,
  projectId,
}: ProjectLogsTableProps) {
  // V2 filter state (URL-synced)
  const {
    filter,
    timeRange,
    hasFilters: hasV2Filters,
    predicates,
    removePredicate,
    applyQuickPreset,
    isPresetActive,
    clearFilters: clearV2Filters,
    setFilter,
    quickPresets,
  } = useLogFiltersV2();

  // V1 sidebar filter state (local state for sidebar compatibility)
  const [severityFilter, setSeverityFilter] = useState<SeverityFilterValue>("all");
  const [serviceName, setServiceName] = useState<string | null>(null);
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);

  // Local query input state
  const [queryInput, setQueryInput] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  // Execute query handler
  const handleQueryExecute = useCallback(
    (query: string) => {
      setIsSearching(true);
      const parsed = parseQueryToFilter(query);
      setFilter(parsed);
      setTimeout(() => setIsSearching(false), 500);
    },
    [setFilter]
  );

  const handleSeverityChange = useCallback((value: SeverityFilterValue) => {
    setSeverityFilter(value);
  }, []);

  const handleServiceChange = useCallback((value: string | null) => {
    setServiceName(value);
  }, []);

  const handleSelectLog = useCallback((logId: string) => {
    setSelectedLogId(logId);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setSelectedLogId(null);
  }, []);

  const handleClearFilters = useCallback(() => {
    setSeverityFilter("all");
    setServiceName(null);
    setQueryInput("");
    clearV2Filters();
  }, [clearV2Filters]);

  // Combine V1 sidebar filters with V2 expression filter
  const combinedFilter = useMemo((): LogFilterExpression | undefined => {
    const expressions: LogFilterExpression[] = [];

    // Add V2 filter if present
    if (filter) {
      expressions.push(filter);
    }

    // Add severity filter from sidebar
    if (severityFilter !== "all") {
      const severityMinMap: Record<SeverityFilterValue, number> = {
        all: 0,
        debug: 5,
        info: 9,
        warn: 13,
        error: 17,
      };
      expressions.push({
        field: "log.severityNumber",
        op: "gte",
        value: severityMinMap[severityFilter],
      });
    }

    // Add service filter from sidebar
    if (serviceName) {
      expressions.push({
        field: "log.serviceName",
        op: "eq",
        value: serviceName,
      });
    }

    if (expressions.length === 0) return undefined;
    if (expressions.length === 1) return expressions[0];
    return { and: expressions };
  }, [filter, severityFilter, serviceName]);

  // Active filter count
  const hasFilters = useMemo(() => {
    return severityFilter !== "all" || !!serviceName || hasV2Filters;
  }, [severityFilter, serviceName, hasV2Filters]);

  // Fetch data with V2 endpoint - project-scoped
  const {
    logs,
    totalCount,
    isLoading,
    isFetching,
    loadMore,
    hasNextPage,
    isFetchingNextPage,
  } = useLogsV2(workspaceSlug, {
    filter: combinedFilter,
    projectId,
    timeRange,
  });

  const { services, isLoading: servicesLoading } = useLogServices(
    workspaceSlug,
    projectId
  );

  const { stats } = useLogSeverityStats(workspaceSlug, projectId);

  // Search bar component with query builder
  const searchBar = (
    <div className="border-b px-3 py-2 space-y-2">
      {/* Query Builder Input */}
      <div className="flex items-center gap-2">
        <LogQueryBuilderInput
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          value={queryInput}
          onChange={setQueryInput}
          onExecute={handleQueryExecute}
          isLoading={isSearching || isFetching}
          className="flex-1"
        />

        {/* Stats */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
          <ScrollText className="h-3.5 w-3.5" />
          <span>{totalCount.toLocaleString()} logs</span>
        </div>
      </div>

      {/* Quick filter chips */}
      <div className="flex items-center gap-3 flex-wrap">
        <LogFilterChips
          presets={quickPresets}
          isPresetActive={isPresetActive}
          onPresetClick={applyQuickPreset}
        />

        {/* Active filter pills */}
        {predicates.length > 0 && (
          <LogFilterPills
            predicates={predicates}
            onRemove={removePredicate}
            onClearAll={clearV2Filters}
          />
        )}
      </div>
    </div>
  );

  return (
    <>
      <div className="flex h-[calc(100vh-200px)] min-h-[400px] border-t">
        {/* Sidebar */}
        <LogsFilterSidebar
          severityFilter={severityFilter}
          serviceName={serviceName}
          services={services}
          servicesLoading={servicesLoading}
          stats={stats}
          onSeverityChange={handleSeverityChange}
          onServiceChange={handleServiceChange}
          onClearFilters={handleClearFilters}
          hasFilters={hasFilters}
        />

        {/* Table Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {searchBar}
          <div className="flex-1 overflow-auto">
            <LogsTable
              logs={logs}
              isLoading={isLoading}
              hasNextPage={hasNextPage}
              isFetchingNextPage={isFetchingNextPage}
              onLoadMore={loadMore}
              onSelectLog={handleSelectLog}
              selectedLogId={selectedLogId}
              workspaceSlug={workspaceSlug}
            />
          </div>
        </div>
      </div>

      {/* Log detail panel - Sheet that slides in */}
      <LogDetailPanel
        workspaceSlug={workspaceSlug}
        logId={selectedLogId}
        onClose={handleCloseDetail}
      />
    </>
  );
}
