"use client";

import { Clock, Hash, AlertCircle, Server, Copy, Check, Calendar } from "lucide-react";
import { useState, useCallback } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { trpc } from "@/lib/trpc/client";
import { clipboardToast } from "@/lib/success";
import { formatDuration } from "@/lib/format";
import { SpanTree } from "./span-tree";
import { TraceKnowledgeSection } from "@/components/knowledge/integration";

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------

interface TraceDetailPanelProps {
  workspaceSlug: string;
  projectId: string;
  traceId: string | null;
  onClose: () => void;
}

// ------------------------------------------------------------
// Copy Button Component
// ------------------------------------------------------------

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      clipboardToast.copyFailed();
    }
  }, [text]);

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleCopy}
      className="h-6 px-2 text-xs"
    >
      {copied ? (
        <>
          <Check className="mr-1 h-3 w-3" />
          Copied
        </>
      ) : (
        <>
          <Copy className="mr-1 h-3 w-3" />
          {label || "Copy"}
        </>
      )}
    </Button>
  );
}

// ------------------------------------------------------------
// Stat Card Component
// ------------------------------------------------------------

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  variant?: "default" | "destructive";
}

function StatCard({ icon, label, value, variant = "default" }: StatCardProps) {
  return (
    <div className="flex items-center gap-3 rounded-lg border p-3">
      <div className={`rounded-md p-2 ${
        variant === "destructive"
          ? "bg-destructive/10 text-destructive"
          : "bg-muted"
      }`}>
        {icon}
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-lg font-semibold ${
          variant === "destructive" ? "text-destructive" : ""
        }`}>
          {value}
        </p>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Main Component
// ------------------------------------------------------------

export function TraceDetailPanel({
  workspaceSlug,
  projectId,
  traceId,
  onClose,
}: TraceDetailPanelProps) {
  const { data, isLoading, error } = trpc.traces.get.useQuery(
    {
      workspaceSlug,
      projectId,
      traceId: traceId ?? "",
    },
    {
      enabled: !!traceId && !!workspaceSlug && !!projectId,
    }
  );

  return (
    <Sheet open={!!traceId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-[700px] sm:max-w-[700px] p-0 flex flex-col">
        {isLoading && (
          <>
            <SheetHeader className="sr-only">
              <SheetTitle>Loading trace details</SheetTitle>
              <SheetDescription>Please wait while trace data is being loaded</SheetDescription>
            </SheetHeader>
            <TraceDetailSkeleton />
          </>
        )}

        {error && (
          <>
            <SheetHeader className="sr-only">
              <SheetTitle>Error loading trace</SheetTitle>
              <SheetDescription>An error occurred while loading the trace details</SheetDescription>
            </SheetHeader>
            <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
              <div className="rounded-full bg-destructive/10 p-3">
                <AlertCircle className="h-8 w-8 text-destructive" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">Failed to load trace</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {error.message || "An unexpected error occurred."}
              </p>
            </div>
          </>
        )}

        {data && (
          <>
            {/* Header */}
            <SheetHeader className="px-6 pt-6 pb-4 border-b">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <SheetTitle className="flex items-center gap-2 text-xl">
                    <Server className="h-5 w-5" />
                    {data.trace.serviceName}
                    {data.trace.serviceVersion && (
                      <Badge variant="secondary" className="font-normal">
                        v{data.trace.serviceVersion}
                      </Badge>
                    )}
                  </SheetTitle>
                  <SheetDescription className="flex items-center gap-2">
                    {data.trace.environment && (
                      <Badge variant="outline">{data.trace.environment}</Badge>
                    )}
                    <span className="text-muted-foreground">
                      {new Date(data.trace.startTime).toLocaleString()}
                    </span>
                  </SheetDescription>
                </div>
              </div>
            </SheetHeader>

            {/* Content */}
            <ScrollArea className="flex-1">
              <div className="p-6 space-y-6">
                {/* Stats Grid */}
                <div className="grid grid-cols-3 gap-3">
                  <StatCard
                    icon={<Clock className="h-4 w-4" />}
                    label="Duration"
                    value={formatDuration(data.trace.durationMs)}
                  />
                  <StatCard
                    icon={<Hash className="h-4 w-4" />}
                    label="Spans"
                    value={data.trace.spanCount}
                  />
                  <StatCard
                    icon={<AlertCircle className="h-4 w-4" />}
                    label="Errors"
                    value={data.trace.errorCount}
                    variant={data.trace.errorCount > 0 ? "destructive" : "default"}
                  />
                </div>

                {/* Trace ID Card */}
                <Card>
                  <CardHeader className="py-3 px-4">
                    <CardTitle className="text-sm font-medium">Trace ID</CardTitle>
                  </CardHeader>
                  <CardContent className="py-0 px-4 pb-3">
                    <div className="flex items-center justify-between gap-2 rounded-md bg-muted px-3 py-2">
                      <code className="text-xs font-mono break-all">
                        {data.trace.externalTraceId}
                      </code>
                      <CopyButton text={data.trace.externalTraceId} />
                    </div>
                  </CardContent>
                </Card>

                {/* Timestamps */}
                <Card>
                  <CardHeader className="py-3 px-4">
                    <CardTitle className="text-sm font-medium">Timeline</CardTitle>
                  </CardHeader>
                  <CardContent className="py-0 px-4 pb-3">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          Started
                        </span>
                        <span className="font-mono">
                          {new Date(data.trace.startTime).toLocaleString()}
                        </span>
                      </div>
                      {data.trace.endTime && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground flex items-center gap-2">
                            <Calendar className="h-4 w-4" />
                            Ended
                          </span>
                          <span className="font-mono">
                            {new Date(data.trace.endTime).toLocaleString()}
                          </span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Knowledge Articles */}
                <TraceKnowledgeSection
                  workspaceSlug={workspaceSlug}
                  traceId={data.trace.id}
                />

                <Separator />

                {/* Spans Section */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">
                      Spans ({data.spans.length})
                    </h3>
                  </div>
                  <SpanTree spans={data.spans} />
                </div>
              </div>
            </ScrollArea>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ------------------------------------------------------------
// Skeleton
// ------------------------------------------------------------

function TraceDetailSkeleton() {
  return (
    <div className="flex flex-col h-full">
      {/* Header Skeleton */}
      <div className="px-6 pt-6 pb-4 border-b space-y-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-5" />
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-5 w-16" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>

      {/* Content Skeleton */}
      <div className="p-6 space-y-6">
        {/* Stats Grid Skeleton */}
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-lg border p-3">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-md" />
                <div className="space-y-1.5">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-6 w-12" />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Trace ID Skeleton */}
        <div className="rounded-lg border">
          <div className="p-4 space-y-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-8 w-full" />
          </div>
        </div>

        {/* Spans Skeleton */}
        <div className="space-y-3">
          <Skeleton className="h-5 w-24" />
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
