"use client";

import { Activity, X } from "lucide-react";
import { Button } from "@/components/ui/button";

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------

interface TracesEmptyProps {
  hasFilters: boolean;
  onClearFilters: () => void;
}

// ------------------------------------------------------------
// Component
// ------------------------------------------------------------

export function TracesEmpty({ hasFilters, onClearFilters }: TracesEmptyProps) {
  if (hasFilters) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Activity className="h-12 w-12 text-muted-foreground/50" />
        <h3 className="mt-4 text-lg font-semibold">No traces match your filters</h3>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          Try adjusting your search query or filter settings to find what
          you&apos;re looking for.
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
      <Activity className="h-12 w-12 text-muted-foreground/50" />
      <h3 className="mt-4 text-lg font-semibold">No traces yet</h3>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        Traces will appear here when your application sends telemetry data. Make
        sure you&apos;ve configured the SDK with your API key.
      </p>
    </div>
  );
}
