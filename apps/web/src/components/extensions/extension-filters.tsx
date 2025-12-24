"use client";

import { memo, useCallback } from "react";
import { Search, X, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  type ExtensionType,
  EXTENSION_TYPES,
  EXTENSION_TYPE_LABELS,
} from "@cognobserve/api/schemas";

// ============================================================================
// Constants
// ============================================================================

const ALL_TYPES_VALUE = "all";

// ============================================================================
// Types
// ============================================================================

interface ExtensionFiltersProps {
  search: string;
  type: ExtensionType | undefined;
  installedOnly: boolean;
  onSearchChange: (search: string) => void;
  onTypeChange: (type: ExtensionType | undefined) => void;
  onInstalledOnlyChange: (installedOnly: boolean) => void;
}

// ============================================================================
// Component
// ============================================================================

export const ExtensionFilters = memo(function ExtensionFilters({
  search,
  type,
  installedOnly,
  onSearchChange,
  onTypeChange,
  onInstalledOnlyChange,
}: ExtensionFiltersProps) {
  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onSearchChange(e.target.value);
    },
    [onSearchChange]
  );

  const handleClearSearch = useCallback(() => {
    onSearchChange("");
  }, [onSearchChange]);

  const handleTypeChange = useCallback(
    (value: string) => {
      onTypeChange(value === ALL_TYPES_VALUE ? undefined : (value as ExtensionType));
    },
    [onTypeChange]
  );

  const handleInstalledOnlyToggle = useCallback(() => {
    onInstalledOnlyChange(!installedOnly);
  }, [installedOnly, onInstalledOnlyChange]);

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      {/* Search */}
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search extensions..."
          value={search}
          onChange={handleSearchChange}
          className="pl-10 pr-10"
        />
        {search && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
            onClick={handleClearSearch}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        {/* Type filter */}
        <Select value={type ?? ALL_TYPES_VALUE} onValueChange={handleTypeChange}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_TYPES_VALUE}>All types</SelectItem>
            {EXTENSION_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {EXTENSION_TYPE_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Installed only toggle */}
        <Button
          variant={installedOnly ? "default" : "outline"}
          size="sm"
          onClick={handleInstalledOnlyToggle}
          className={cn(
            "whitespace-nowrap gap-2",
            installedOnly && "bg-primary text-primary-foreground"
          )}
        >
          {installedOnly && <Check className="h-3 w-3" />}
          Installed only
        </Button>
      </div>
    </div>
  );
});
