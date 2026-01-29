"use client";

import { Clock, Hash, AlertCircle, Server, Copy, Check, ChevronDown, RefreshCw } from "lucide-react";
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { trpc } from "@/lib/trpc/client";
import { clipboardToast } from "@/lib/success";
import { formatDuration } from "@/lib/format";
import { SpanTree } from "./span-tree";
import { TraceKnowledgeSection } from "@/components/knowledge/integration";
import { cn } from "@/lib/utils";

// ------------------------------------------------------------
// Constants
// ------------------------------------------------------------

const TRACE_CACHE_TIME_MS = 5 * 60 * 1000; // 5 minutes

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
// Prefetch Hook - use on hover to preload trace data
// ------------------------------------------------------------

export function usePrefetchTrace(workspaceSlug: string, projectId: string) {
  const utils = trpc.useUtils();

  const prefetch = useCallback(
    (traceId: string) => {
      // Prefetch into cache - will be instant when panel opens
      void utils.traces.get.prefetch(
        { workspaceSlug, projectId, traceId },
        { staleTime: TRACE_CACHE_TIME_MS }
      );
    },
    [utils, workspaceSlug, projectId]
  );

  return prefetch;
}

// ------------------------------------------------------------
// Copy Icon Button Component
// ------------------------------------------------------------

function CopyIconButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      clipboardToast.copied("Trace ID");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      clipboardToast.copyFailed();
    }
  }, [text]);

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleCopy}
      className="h-5 w-5 shrink-0"
    >
      {copied ? (
        <Check className="h-3 w-3 text-green-600" />
      ) : (
        <Copy className="h-3 w-3 text-muted-foreground hover:text-foreground" />
      )}
    </Button>
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
  const { data, isLoading, isFetching, error, refetch } = trpc.traces.get.useQuery(
    {
      workspaceSlug,
      projectId,
      traceId: traceId ?? "",
    },
    {
      enabled: !!traceId && !!workspaceSlug && !!projectId,
      staleTime: TRACE_CACHE_TIME_MS,
      placeholderData: (prev) => prev, // Keep showing previous data while loading new
    }
  );

  // Show skeleton only on first load (no cached data)
  const showSkeleton = isLoading && !data;

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  return (
    <Sheet open={!!traceId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-[55vw] sm:max-w-[55vw] p-0 flex flex-col">
        {showSkeleton && (
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
            {/* Loading indicator for background refresh */}
            {isFetching && (
              <div className="h-0.5 bg-primary/20 overflow-hidden">
                <div className="h-full w-1/3 bg-primary animate-pulse" />
              </div>
            )}
            {/* Compact Header */}
            <SheetHeader className="px-3 pt-3 pb-2 border-b bg-muted/30">
              {/* Line 1: Service name + badges + date + refresh */}
              <div className="flex items-center gap-2">
                <Server className="h-4 w-4 shrink-0 text-muted-foreground" />
                <SheetTitle className="text-sm font-semibold truncate">
                  {data.trace.serviceName}
                </SheetTitle>
                {data.trace.serviceVersion && (
                  <Badge variant="secondary" className="font-mono text-[10px] px-1.5 py-0 shrink-0">
                    v{data.trace.serviceVersion}
                  </Badge>
                )}
                {data.trace.environment && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
                    {data.trace.environment}
                  </Badge>
                )}
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {new Date(data.trace.startTime).toLocaleString()}
                </span>
                {/* Refresh button */}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleRefresh}
                  disabled={isFetching}
                  className="h-6 w-6 ml-auto shrink-0"
                  title="Refresh trace data"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
                </Button>
              </div>
              <SheetDescription className="sr-only">Trace details</SheetDescription>
              {/* Line 2: Trace ID + Metrics (left aligned) */}
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <code className="text-[11px] font-mono text-muted-foreground">
                  {data.trace.externalTraceId}
                </code>
                <CopyIconButton text={data.trace.externalTraceId} />
                {/* Metrics - next to trace ID */}
                <Badge variant="outline" className="text-[11px] px-2 py-0.5 font-mono gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDuration(data.trace.durationMs)}
                </Badge>
                <Badge variant="outline" className="text-[11px] px-2 py-0.5 font-mono gap-1">
                  <Hash className="h-3 w-3" />
                  {data.trace.spanCount} spans
                </Badge>
                {data.trace.errorCount > 0 && (
                  <Badge variant="destructive" className="text-[11px] px-2 py-0.5 font-mono gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {data.trace.errorCount} errors
                  </Badge>
                )}
              </div>
            </SheetHeader>

            {/* Content */}
            <ScrollArea className="flex-1">
              <div className="p-3 space-y-3">
                {/* Knowledge Articles - Collapsible */}
                <TraceKnowledgeCollapsible
                  workspaceSlug={workspaceSlug}
                  traceId={data.trace.id}
                />

                {/* Spans Section */}
                <div className="space-y-1.5">
                  <h3 className="text-xs font-semibold text-muted-foreground">
                    Spans ({data.spans.length})
                  </h3>
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
// Knowledge Articles Collapsible Wrapper
// ------------------------------------------------------------

function TraceKnowledgeCollapsible({ workspaceSlug, traceId }: { workspaceSlug: string; traceId: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <button className="flex w-full items-center justify-between rounded border px-2.5 py-1.5 text-[11px] hover:bg-muted/50 transition-colors">
          <span className="font-medium">Knowledge Articles</span>
          <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2">
        <TraceKnowledgeSection
          workspaceSlug={workspaceSlug}
          traceId={traceId}
        />
      </CollapsibleContent>
    </Collapsible>
  );
}

// ------------------------------------------------------------
// Skeleton
// ------------------------------------------------------------

function TraceDetailSkeleton() {
  return (
    <div className="flex flex-col h-full">
      {/* Header Skeleton */}
      <div className="px-3 pt-3 pb-2 border-b bg-muted/30 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-12" />
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-3 w-8" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-3 w-6" />
          <Skeleton className="h-3 w-64" />
          <Skeleton className="h-3 w-32 ml-auto" />
        </div>
      </div>

      {/* Content Skeleton */}
      <div className="p-3 space-y-3">
        {/* Knowledge collapse skeleton */}
        <Skeleton className="h-8 w-full" />

        {/* Spans Skeleton */}
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-20" />
          <div className="space-y-1">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
