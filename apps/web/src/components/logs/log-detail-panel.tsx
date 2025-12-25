"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { ExternalLink, Copy, Check, Server, Hash, AlertCircle } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useLogDetail } from "@/hooks/use-logs";
import { clipboardToast } from "@/lib/success";
import {
  getSeverityLabel,
  getSeverityColorClass,
} from "@/lib/log-utils";
import { cn } from "@/lib/utils";

// Severity badge colors
const SEVERITY_COLORS: Record<string, string> = {
  Trace: "bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-400",
  Debug: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  Info: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  Warn: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  Error: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  Fatal: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
};

interface LogDetailPanelProps {
  workspaceSlug: string;
  logId: string | null;
  onClose: () => void;
}

// Copy Icon Button Component
function CopyIconButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      clipboardToast.copied(label);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      clipboardToast.copyFailed();
    }
  }, [text, label]);

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

// Skeleton for loading state
function LogDetailSkeleton() {
  return (
    <div className="p-4 space-y-4">
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-20 w-full" />
      </div>
      <Separator />
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-4 w-36" />
      </div>
      <Separator />
      <div className="space-y-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-32 w-full" />
      </div>
    </div>
  );
}

export function LogDetailPanel({
  workspaceSlug,
  logId,
  onClose,
}: LogDetailPanelProps) {
  const { log, isLoading, error } = useLogDetail(workspaceSlug, logId);

  const showSkeleton = isLoading && !log;
  const severityLabel = getSeverityLabel(log?.severityNumber);

  const renderField = (label: string, value: string | null | undefined) => {
    if (!value) return null;
    return (
      <div className="flex items-center justify-between gap-2 py-1">
        <span className="text-[11px] text-muted-foreground shrink-0">{label}</span>
        <div className="flex items-center gap-1 min-w-0">
          <span className="text-xs font-mono truncate">{value}</span>
          <CopyIconButton text={value} label={label} />
        </div>
      </div>
    );
  };

  const renderJsonField = (label: string, value: unknown) => {
    if (!value || (typeof value === "object" && Object.keys(value as object).length === 0)) {
      return null;
    }
    const jsonStr = JSON.stringify(value, null, 2);
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
          <CopyIconButton text={jsonStr} label={label} />
        </div>
        <pre className="text-[11px] font-mono bg-muted/50 p-2 rounded-md overflow-x-auto whitespace-pre-wrap break-all max-h-[200px] overflow-y-auto">
          {jsonStr}
        </pre>
      </div>
    );
  };

  return (
    <Sheet open={!!logId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-[45vw] sm:max-w-[45vw] p-0 flex flex-col">
        {showSkeleton && (
          <>
            <SheetHeader className="sr-only">
              <SheetTitle>Loading log details</SheetTitle>
              <SheetDescription>Please wait while log data is being loaded</SheetDescription>
            </SheetHeader>
            <LogDetailSkeleton />
          </>
        )}

        {error && (
          <>
            <SheetHeader className="sr-only">
              <SheetTitle>Error loading log</SheetTitle>
              <SheetDescription>An error occurred while loading the log details</SheetDescription>
            </SheetHeader>
            <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
              <div className="rounded-full bg-destructive/10 p-3">
                <AlertCircle className="h-8 w-8 text-destructive" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">Failed to load log</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {error.message || "An unexpected error occurred."}
              </p>
            </div>
          </>
        )}

        {log && (
          <>
            {/* Compact Header */}
            <SheetHeader className="px-3 pt-3 pb-2 border-b bg-muted/30">
              {/* Line 1: Service name + badges + date */}
              <div className="flex items-center gap-2">
                <Server className="h-4 w-4 shrink-0 text-muted-foreground" />
                <SheetTitle className="text-sm font-semibold truncate">
                  {log.serviceName ?? "Unknown Service"}
                </SheetTitle>
                <Badge
                  variant="secondary"
                  className={cn(
                    "text-[10px] px-1.5 py-0 shrink-0",
                    SEVERITY_COLORS[severityLabel] ?? SEVERITY_COLORS.Info
                  )}
                >
                  {severityLabel}
                </Badge>
                {log.environment && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
                    {log.environment}
                  </Badge>
                )}
                <span className="text-[10px] text-muted-foreground shrink-0 ml-auto">
                  {new Date(log.timestamp).toLocaleString()}
                </span>
              </div>

              {/* Line 2: Trace/Span IDs */}
              {(log.traceId || log.spanId) && (
                <div className="flex items-center gap-3 mt-1">
                  {log.traceId && (
                    <div className="flex items-center gap-1">
                      <Hash className="h-3 w-3 text-muted-foreground" />
                      <code className="text-[10px] font-mono text-muted-foreground">
                        trace:{log.traceId.slice(0, 12)}...
                      </code>
                      <Link
                        href={`/workspace/${workspaceSlug}/projects/${log.projectId}/traces?trace=${log.traceId}`}
                      >
                        <Button variant="ghost" size="icon" className="h-4 w-4">
                          <ExternalLink className="h-2.5 w-2.5" />
                        </Button>
                      </Link>
                    </div>
                  )}
                  {log.spanId && (
                    <div className="flex items-center gap-1">
                      <code className="text-[10px] font-mono text-muted-foreground">
                        span:{log.spanId.slice(0, 8)}
                      </code>
                    </div>
                  )}
                </div>
              )}

              <SheetDescription className="sr-only">
                Log details for {log.serviceName}
              </SheetDescription>
            </SheetHeader>

            {/* Content */}
            <ScrollArea className="flex-1">
              <div className="p-3 space-y-3">
                {/* Body */}
                {log.bodyText && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-muted-foreground">Body</span>
                      <CopyIconButton text={log.bodyText} label="Body" />
                    </div>
                    <p
                      className={cn(
                        "text-xs whitespace-pre-wrap break-all bg-muted/30 p-2 rounded-md",
                        getSeverityColorClass(log.severityNumber)
                      )}
                    >
                      {log.bodyText}
                    </p>
                  </div>
                )}

                <Separator />

                {/* Service Info */}
                <div className="space-y-0.5">
                  <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                    Service
                  </span>
                  {renderField("Name", log.serviceName)}
                  {renderField("Version", log.serviceVersion)}
                  {renderField("Project", log.projectName)}
                </div>

                {/* Scope */}
                {(log.scopeName || log.scopeVersion) && (
                  <>
                    <Separator />
                    <div className="space-y-0.5">
                      <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                        Scope
                      </span>
                      {renderField("Name", log.scopeName)}
                      {renderField("Version", log.scopeVersion)}
                    </div>
                  </>
                )}

                {/* Attributes */}
                {log.attributes &&
                typeof log.attributes === "object" &&
                Object.keys(log.attributes as object).length > 0 ? (
                  <>
                    <Separator />
                    {renderJsonField("Attributes", log.attributes)}
                  </>
                ) : null}

                {/* Resource */}
                {log.resource &&
                typeof log.resource === "object" &&
                Object.keys(log.resource as object).length > 0 ? (
                  <>
                    <Separator />
                    {renderJsonField("Resource", log.resource)}
                  </>
                ) : null}

                {/* Raw Body (if different from bodyText) */}
                {log.body && typeof log.body !== "string" ? (
                  <>
                    <Separator />
                    {renderJsonField("Body (raw)", log.body)}
                  </>
                ) : null}

                {/* Metadata */}
                <Separator />
                <div className="space-y-0.5">
                  <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                    Metadata
                  </span>
                  {renderField("Ingest Source", log.ingestSource)}
                  {log.observedTime && renderField("Observed Time", log.observedTime)}
                  {log.droppedAttributesCount !== null && log.droppedAttributesCount > 0 && (
                    <div className="flex items-center justify-between gap-2 py-1">
                      <span className="text-[11px] text-muted-foreground">Dropped Attributes</span>
                      <span className="text-xs text-yellow-600">{log.droppedAttributesCount}</span>
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
