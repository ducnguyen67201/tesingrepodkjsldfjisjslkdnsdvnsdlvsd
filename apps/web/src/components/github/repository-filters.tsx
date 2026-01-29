"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { FilterType, RepositoryCounts } from "./types";

interface RepositoryFiltersProps {
  filter: FilterType;
  search: string;
  counts: RepositoryCounts;
  onFilterChange: (filter: FilterType) => void;
  onSearchChange: (search: string) => void;
}

const FILTER_OPTIONS: { value: FilterType; label: string }[] = [
  { value: "enabled", label: "Enabled" },
  { value: "disabled", label: "Disabled" },
  { value: "all", label: "All" },
];

export function RepositoryFilters({
  filter,
  search,
  counts,
  onFilterChange,
  onSearchChange,
}: RepositoryFiltersProps) {
  const getCount = (value: FilterType) => counts[value];

  const handleSearchInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    onSearchChange(e.target.value);
  };

  const createFilterHandler = (value: FilterType) => () => {
    onFilterChange(value);
  };

  const renderFilterButton = (option: { value: FilterType; label: string }) => (
    <button
      key={option.value}
      onClick={createFilterHandler(option.value)}
      className={cn(
        "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        filter === option.value
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {option.label} ({getCount(option.value)})
    </button>
  );

  return (
    <div className="flex items-center gap-4">
      {/* Search */}
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search repository"
          value={search}
          onChange={handleSearchInput}
          className="pl-9"
        />
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
        {FILTER_OPTIONS.map(renderFilterButton)}
      </div>
    </div>
  );
}
