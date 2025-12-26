"use client";

import { useCallback } from "react";
import { formatDistanceToNow } from "date-fns";
import { TableCell, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/format";
import { type SpanType } from "@ducsigr/api/schemas";

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------

export interface TraceListItem {
  id: string;
  externalTraceId: string;
  serviceName: string;
  serviceVersion: string | null;
  environment: string | null;
  startTime: Date;
  endTime: Date | null;
  durationMs: number | null;
  spanCount: number;
  errorCount: number;
  /** Span types - can be string[] from API or SpanType[] */
  spanTypes: string[];
}

interface TraceRowProps {
  trace: TraceListItem;
  isSelected: boolean;
  onSelect: (traceId: string) => void;
  onHover?: (traceId: string) => void;
}

// ------------------------------------------------------------
// Span Type Badge Colors
// ------------------------------------------------------------

const SPAN_TYPE_COLORS: Record<SpanType, string> = {
  LLM: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  HTTP: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  DB: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  RPC: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  FUNCTION: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  CUSTOM: "bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-200",
};

// ------------------------------------------------------------
// Component
// ------------------------------------------------------------

export function TraceRow({ trace, isSelected, onSelect, onHover }: TraceRowProps) {
  const handleClick = useCallback(() => {
    onSelect(trace.id);
  }, [trace.id, onSelect]);

  const handleMouseEnter = useCallback(() => {
    onHover?.(trace.id);
  }, [trace.id, onHover]);

  const hasErrors = trace.errorCount > 0;

  return (
    <TableRow
      className={cn(
        "cursor-pointer border-0 hover:bg-muted/30",
        isSelected && "bg-muted/50"
      )}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
    >
      {/* Service */}
      <TableCell className="py-1.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium">{trace.serviceName}</span>
          {trace.environment && (
            <Badge variant="outline" className="h-4 px-1 text-[10px]">
              {trace.environment}
            </Badge>
          )}
        </div>
      </TableCell>

      {/* Duration */}
      <TableCell className="py-1.5">
        <span className="font-mono text-xs">
          {formatDuration(trace.durationMs)}
        </span>
      </TableCell>

      {/* Span Count */}
      <TableCell className="py-1.5">
        <span className="text-xs text-muted-foreground">{trace.spanCount}</span>
      </TableCell>

      {/* Error Count */}
      <TableCell className="py-1.5">
        {hasErrors ? (
          <span className="text-xs text-destructive font-medium">{trace.errorCount}</span>
        ) : (
          <span className="text-xs text-muted-foreground">-</span>
        )}
      </TableCell>

      {/* Span Types */}
      <TableCell className="py-1.5">
        <div className="flex flex-wrap gap-0.5">
          {trace.spanTypes.slice(0, 3).map((type) => (
            <Badge
              key={type}
              variant="secondary"
              className={cn(
                "h-4 px-1.5 text-[10px] font-normal",
                SPAN_TYPE_COLORS[type as SpanType] ?? SPAN_TYPE_COLORS.CUSTOM
              )}
            >
              {type}
            </Badge>
          ))}
          {trace.spanTypes.length > 3 && (
            <Badge variant="secondary" className="h-4 px-1.5 text-[10px] font-normal">
              +{trace.spanTypes.length - 3}
            </Badge>
          )}
        </div>
      </TableCell>

      {/* Time */}
      <TableCell className="py-1.5">
        <span className="text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(trace.startTime), { addSuffix: true })}
        </span>
      </TableCell>
    </TableRow>
  );
}
