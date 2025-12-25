"use client";

import { type LucideIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DataTableEmptyProps {
  /** Icon to display */
  icon: LucideIcon;
  /** Title when no results found */
  title: string;
  /** Description when no results found */
  description: string;
  /** Title when filters are active but no results */
  filteredTitle?: string;
  /** Description when filters are active but no results */
  filteredDescription?: string;
  /** Whether filters are currently active */
  hasFilters?: boolean;
  /** Callback to clear filters */
  onClearFilters?: () => void;
}

/**
 * Shared empty state component for data tables.
 * Displays different content based on whether filters are active.
 */
export function DataTableEmpty({
  icon: Icon,
  title,
  description,
  filteredTitle = "No results match your filters",
  filteredDescription = "Try adjusting your search query or filter settings.",
  hasFilters = false,
  onClearFilters,
}: DataTableEmptyProps) {
  if (hasFilters && onClearFilters) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Icon className="h-12 w-12 text-muted-foreground/50" />
        <h3 className="mt-4 text-lg font-semibold">{filteredTitle}</h3>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          {filteredDescription}
        </p>
        <Button variant="outline" className="mt-4" onClick={onClearFilters}>
          <X className="mr-2 h-4 w-4" />
          Clear Filters
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Icon className="h-12 w-12 text-muted-foreground/50" />
      <h3 className="mt-4 text-lg font-semibold">{title}</h3>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        {description}
      </p>
    </div>
  );
}
