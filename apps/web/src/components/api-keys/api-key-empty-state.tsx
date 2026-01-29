"use client";

import { Key } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ApiKeyEmptyStateProps {
  onCreateClick: () => void;
}

export function ApiKeyEmptyState({ onCreateClick }: ApiKeyEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="mb-4 rounded-full bg-muted p-3">
        <Key className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="mb-1 font-medium">No API keys yet</h3>
      <p className="mb-4 text-sm text-muted-foreground">
        Create your first API key to start sending traces.
      </p>
      <Button onClick={onCreateClick}>Create API Key</Button>
    </div>
  );
}
