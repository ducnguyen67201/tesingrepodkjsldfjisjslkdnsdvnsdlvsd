"use client";

import { FlaskConical, FolderKanban, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export function NoProjectsEmptyState() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center max-w-md">
        <div className="rounded-full bg-muted/50 p-5 mx-auto w-fit">
          <FolderKanban className="h-10 w-10 text-muted-foreground/70" />
        </div>
        <h2 className="mt-6 text-lg font-semibold">No projects yet</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Create a project first to start running experiments.
        </p>
      </div>
    </div>
  );
}

export function NoExperimentsEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="rounded-full bg-muted/50 p-5">
        <FlaskConical className="h-10 w-10 text-muted-foreground/70" />
      </div>
      <h3 className="mt-6 text-base font-semibold">No experiments yet</h3>
      <p className="mt-2 text-sm text-muted-foreground max-w-[260px] leading-relaxed">
        Create A/B experiments to test different prompt versions and measure
        performance.
      </p>
      <Button className="mt-4" disabled title="Coming soon">
        <Plus className="mr-2 h-4 w-4" />
        Create First Experiment
      </Button>
    </div>
  );
}

export interface NoResultsEmptyStateProps {
  onClearFilters: () => void;
}

export function NoResultsEmptyState({ onClearFilters }: NoResultsEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <h3 className="text-base font-semibold">No matching experiments</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        Try adjusting your search or filters
      </p>
      <Button variant="outline" className="mt-4" onClick={onClearFilters}>
        Clear Filters
      </Button>
    </div>
  );
}

export function NoSelectionEmptyState() {
  return (
    <div className="flex flex-col h-full">
      {/* Row 1: Empty header - matches left panel */}
      <div className="flex items-center h-[72px] px-4 border-b bg-background">
        <span className="text-muted-foreground text-sm">
          No experiment selected
        </span>
      </div>
      {/* Row 2: Empty tabs placeholder - matches left panel */}
      <div className="h-[52px] px-4 border-b bg-background" />
      {/* Row 3: Empty filters placeholder - matches left panel */}
      <div className="h-[36px] border-b bg-muted/30" />
      {/* Content: Empty state */}
      <div className="flex-1 flex items-center justify-center text-center p-8">
        <div>
          <FlaskConical className="h-12 w-12 text-muted-foreground/30 mx-auto" />
          <p className="mt-4 text-sm text-muted-foreground">
            Select an experiment to view details and analytics
          </p>
        </div>
      </div>
    </div>
  );
}
