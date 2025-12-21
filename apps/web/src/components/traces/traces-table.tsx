"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc/client";
import { useTraceFilters } from "@/hooks/use-trace-filters";
import { TraceRow } from "./trace-row";
import { TracesEmpty } from "./traces-empty";
import { TracesSkeleton } from "./traces-skeleton";
import { TracesError } from "./traces-error";
import { FilterSidebar } from "./filter-sidebar";
import { TraceDetailPanel } from "./trace-detail-panel";
import { useSearchParams, useRouter, usePathname } from "next/navigation";

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------

interface TracesTableProps {
  workspaceSlug: string;
  projectId: string;
}

// ------------------------------------------------------------
// Component
// ------------------------------------------------------------

export function TracesTable({ workspaceSlug, projectId }: TracesTableProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Filter state from URL
  const {
    filters,
    searchValue,
    setSearch,
    setTimeRange,
    toggleType,
    toggleLevel,
    setDuration,
    clearFilters,
    hasFilters,
    filterCount,
  } = useTraceFilters();

  // Selected trace from URL
  const selectedTraceId = searchParams.get("trace");

  // Fetch traces with infinite query
  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = trpc.traces.list.useInfiniteQuery(
    {
      workspaceSlug,
      projectId,
      filters,
      limit: 50,
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      enabled: !!workspaceSlug && !!projectId,
    }
  );

  // Flatten pages to traces array
  const traces = data?.pages.flatMap((page) => page.traces) ?? [];

  // Handle trace selection
  const handleSelectTrace = useCallback(
    (traceId: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("trace", traceId);
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [searchParams, router, pathname]
  );

  // Handle panel close
  const handleClosePanel = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("trace");
    const newUrl = params.toString()
      ? `${pathname}?${params.toString()}`
      : pathname;
    router.push(newUrl, { scroll: false });
  }, [searchParams, router, pathname]);

  // Intersection observer for infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 }
    );

    const currentRef = loadMoreRef.current;
    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Local search input state (only applies on Enter)
  const [localSearch, setLocalSearch] = useState(searchValue);

  // Sync local state when URL search value changes
  useEffect(() => {
    setLocalSearch(searchValue);
  }, [searchValue]);

  // Handle search input change (local only)
  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setLocalSearch(e.target.value);
    },
    []
  );

  // Handle Enter key to apply search
  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        setSearch(localSearch);
      }
    },
    [localSearch, setSearch]
  );

  // Handle search button click
  const handleSearchSubmit = useCallback(() => {
    setSearch(localSearch);
  }, [localSearch, setSearch]);

  const handleClearSearch = useCallback(() => {
    setLocalSearch("");
    setSearch("");
  }, [setSearch]);

  // Sidebar component (shared across all states)
  const sidebar = (
    <FilterSidebar
      timeRange={filters.timeRange ?? "24h"}
      onTimeRangeChange={setTimeRange}
      filters={filters}
      onToggleType={toggleType}
      onToggleLevel={toggleLevel}
      onDurationChange={setDuration}
      onClearFilters={clearFilters}
      hasFilters={hasFilters}
    />
  );

  // Search bar component (shared across all states)
  const searchBar = (
    <div className="border-b px-3 py-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search traces... (press Enter to search)"
            value={localSearch}
            onChange={handleSearchChange}
            onKeyDown={handleSearchKeyDown}
            className="pl-8 pr-7 h-7 text-xs bg-muted/30 border-muted"
          />
          {localSearch && (
            <button
              onClick={handleClearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        <Button
          onClick={handleSearchSubmit}
          size="sm"
          className="h-7 px-3 text-xs"
        >
          Run Query
        </Button>
      </div>
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
                  <TableHead className="w-[180px] h-8 text-xs font-medium text-muted-foreground">Service</TableHead>
                  <TableHead className="w-[80px] h-8 text-xs font-medium text-muted-foreground">Duration</TableHead>
                  <TableHead className="w-[60px] h-8 text-xs font-medium text-muted-foreground">Spans</TableHead>
                  <TableHead className="w-[60px] h-8 text-xs font-medium text-muted-foreground">Errors</TableHead>
                  <TableHead className="w-[140px] h-8 text-xs font-medium text-muted-foreground">Types</TableHead>
                  <TableHead className="w-[120px] h-8 text-xs font-medium text-muted-foreground">Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {traces.map((trace) => (
                  <TraceRow
                    key={trace.id}
                    trace={trace}
                    isSelected={trace.id === selectedTraceId}
                    onSelect={handleSelectTrace}
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
