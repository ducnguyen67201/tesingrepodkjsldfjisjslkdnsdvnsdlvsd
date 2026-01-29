"use client";

import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------

interface TracesErrorProps {
  error: { message: string };
  onRetry: () => void;
}

// ------------------------------------------------------------
// Component
// ------------------------------------------------------------

export function TracesError({ error, onRetry }: TracesErrorProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <AlertCircle className="h-12 w-12 text-destructive/50" />
      <h3 className="mt-4 text-lg font-semibold">Failed to load traces</h3>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        {error.message || "An unexpected error occurred while loading traces."}
      </p>
      <Button variant="outline" className="mt-4" onClick={onRetry}>
        <RefreshCw className="mr-2 h-4 w-4" />
        Retry
      </Button>
    </div>
  );
}
