"use client";

/**
 * Project Logs Table Component
 *
 * Displays logs for a specific project with filtering and search.
 * Similar to TracesTableV2 but for log records.
 */

import { useState, useCallback, useMemo } from "react";
import { ScrollText, Search, X, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
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
import { useLogs, useLogServices, useLogSeverityStats } from "@/hooks/use-logs";
import {
  SEVERITY_FILTER_OPTIONS,
  type SeverityFilterValue,
} from "@/lib/log-utils";
import { cn } from "@/lib/utils";

interface ProjectLogsTableProps {
  workspaceSlug: string;
  projectId: string;
}

// Sidebar filter component
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
}: {
  severityFilter: SeverityFilterValue;
  serviceName: string | null;
  services: { serviceName: string; count: number }[];
  servicesLoading: boolean;
  stats: { trace: number; debug: number; info: number; warn: number; error: number; fatal: number } | null;
  onSeverityChange: (value: SeverityFilterValue) => void;
  onServiceChange: (value: string | null) => void;
  onClearFilters: () => void;
  hasFilters: boolean;
}) {
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
            {SEVERITY_FILTER_OPTIONS.map((option) => {
              const isActive = severityFilter === option.value;
              const count =
                option.value === "all"
                  ? Object.values(stats).reduce((a, b) => a + b, 0)
                  : option.value === "debug"
                  ? stats.debug + stats.info + stats.warn + stats.error + stats.fatal
                  : option.value === "info"
                  ? stats.info + stats.warn + stats.error + stats.fatal
                  : option.value === "warn"
                  ? stats.warn + stats.error + stats.fatal
                  : stats.error + stats.fatal;

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
            })}
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
                <Badge variant="outline" className="h-4 px-1.5 text-[10px] border-yellow-500 text-yellow-600">
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

export function ProjectLogsTable({
  workspaceSlug,
  projectId,
}: ProjectLogsTableProps) {
  // Filter state
  const [severityFilter, setSeverityFilter] = useState<SeverityFilterValue>("all");
  const [serviceName, setServiceName] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setSearchQuery(value);

      // Debounce the actual search
      const timeout = setTimeout(() => {
        setDebouncedSearch(value);
      }, 300);

      return () => clearTimeout(timeout);
    },
    []
  );

  const handleClearSearch = useCallback(() => {
    setSearchQuery("");
    setDebouncedSearch("");
  }, []);

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
    setSearchQuery("");
    setDebouncedSearch("");
  }, []);

  // Active filter count
  const hasFilters = useMemo(() => {
    return severityFilter !== "all" || !!serviceName || !!debouncedSearch;
  }, [severityFilter, serviceName, debouncedSearch]);

  // Fetch data - project-scoped
  const {
    logs,
    totalCount,
    isLoading,
    loadMore,
    hasNextPage,
    isFetchingNextPage,
  } = useLogs(workspaceSlug, {
    projectId, // Filter by specific project
    severityFilter,
    serviceName,
    search: debouncedSearch || undefined,
  });

  const { services, isLoading: servicesLoading } = useLogServices(
    workspaceSlug,
    projectId // Filter services by project
  );

  const { stats } = useLogSeverityStats(workspaceSlug, projectId);

  // Search bar component
  const searchBar = (
    <div className="border-b px-3 py-2 space-y-2">
      <div className="flex items-center gap-2">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search log body..."
            value={searchQuery}
            onChange={handleSearchChange}
            className="h-8 pl-8 pr-8 text-xs"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 h-5 w-5 -translate-y-1/2"
              onClick={handleClearSearch}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>

        {/* Stats */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ScrollText className="h-3.5 w-3.5" />
          <span>{totalCount.toLocaleString()} logs</span>
        </div>
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
