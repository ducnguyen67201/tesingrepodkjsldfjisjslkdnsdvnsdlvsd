"use client";

import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Activity, ExternalLink, Clock, AlertTriangle } from "lucide-react";

interface Trace {
  id: string;
  name: string;
  timestamp: Date;
  spans: Array<{
    id: string;
    name: string;
    level: string;
    statusMessage: string | null;
  }>;
}

interface RCATracesCardProps {
  traces: Trace[];
  workspaceSlug: string;
  projectId: string;
}

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(new Date(date));
}

export function RCATracesCard({ traces, workspaceSlug, projectId }: RCATracesCardProps) {
  if (traces.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Affected Traces
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {traces.map((trace) => {
            const errorSpans = trace.spans.filter((s) => s.level === "ERROR");
            const hasErrors = errorSpans.length > 0;

            // Get first error message for display
            const firstErrorMessage = errorSpans[0]?.statusMessage;

            return (
              <div
                key={trace.id}
                className="p-3 bg-muted rounded-lg space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="min-w-0">
                      <p className="font-mono text-sm truncate">
                        {trace.name ?? trace.id.slice(0, 8)}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatTime(trace.timestamp)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {hasErrors && (
                      <Badge variant="destructive" className="flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        {errorSpans.length} error{errorSpans.length !== 1 ? "s" : ""}
                      </Badge>
                    )}
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/workspace/${workspaceSlug}/projects/${projectId}/traces/${trace.id}`}>
                        View
                        <ExternalLink className="h-3 w-3 ml-1" />
                      </Link>
                    </Button>
                  </div>
                </div>

                {/* Show first error message if available */}
                {hasErrors && firstErrorMessage && (
                  <div className="p-2 bg-destructive/10 border border-destructive/20 rounded text-xs font-mono text-destructive truncate">
                    {firstErrorMessage}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
