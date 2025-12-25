"use client";

import { useCallback } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { ExternalLink, ScrollText } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTableEmpty } from "@/components/shared/data-table-empty";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { cn } from "@/lib/utils";
import {
  truncateLogBody,
  getSeverityShortLabel,
} from "@/lib/log-utils";
import type { LogListItem } from "@cognobserve/api/client";

// Severity badge colors for compact display
const SEVERITY_COLORS: Record<string, string> = {
  TRC: "bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-400",
  DBG: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  INF: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  WRN: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  ERR: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  FTL: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
};

interface LogsTableProps {
  logs: LogListItem[];
  isLoading: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
  onSelectLog: (logId: string) => void;
  selectedLogId: string | null;
  workspaceSlug: string;
}

export function LogsTable({
  logs,
  isLoading,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  onSelectLog,
  selectedLogId,
  workspaceSlug,
}: LogsTableProps) {
  // Use shared infinite scroll hook
  const { observerRef, loadMore } = useInfiniteScroll({
    hasNextPage,
    isFetchingNextPage,
    onLoadMore,
  });

  const handleRowClick = useCallback(
    (logId: string) => {
      onSelectLog(logId);
    },
    [onSelectLog]
  );

  const renderSkeletonRow = (index: number) => (
    <TableRow key={`skeleton-${index}`} className="border-0">
      <TableCell className="py-1.5">
        <Skeleton className="h-4 w-24" />
      </TableCell>
      <TableCell className="py-1.5">
        <Skeleton className="h-4 w-10" />
      </TableCell>
      <TableCell className="py-1.5">
        <Skeleton className="h-4 w-20" />
      </TableCell>
      <TableCell className="py-1.5">
        <Skeleton className="h-4 w-full max-w-md" />
      </TableCell>
      <TableCell className="py-1.5">
        <Skeleton className="h-4 w-16" />
      </TableCell>
      <TableCell className="py-1.5">
        <Skeleton className="h-4 w-6" />
      </TableCell>
    </TableRow>
  );

  const renderLogRow = (log: LogListItem) => {
    const isSelected = log.id === selectedLogId;
    const severityLabel = getSeverityShortLabel(log.severityNumber);

    return (
      <TableRow
        key={log.id}
        className={cn(
          "cursor-pointer border-0 hover:bg-muted/30",
          isSelected && "bg-muted/50"
        )}
        onClick={() => handleRowClick(log.id)}
      >
        {/* Timestamp */}
        <TableCell className="py-1.5">
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(log.timestamp), { addSuffix: true })}
          </span>
        </TableCell>

        {/* Severity */}
        <TableCell className="py-1.5">
          <Badge
            variant="secondary"
            className={cn(
              "h-4 px-1.5 text-[10px] font-medium",
              SEVERITY_COLORS[severityLabel] ?? SEVERITY_COLORS.INF
            )}
          >
            {severityLabel}
          </Badge>
        </TableCell>

        {/* Service */}
        <TableCell className="py-1.5">
          {log.serviceName ? (
            <span className="text-xs font-medium">{log.serviceName}</span>
          ) : (
            <span className="text-xs text-muted-foreground">-</span>
          )}
        </TableCell>

        {/* Body */}
        <TableCell className="py-1.5 max-w-md">
          <span className="text-xs truncate block">
            {truncateLogBody(log.bodyText, 120) || (
              <span className="text-muted-foreground italic">No body</span>
            )}
          </span>
        </TableCell>

        {/* Project */}
        <TableCell className="py-1.5">
          <Badge variant="outline" className="h-4 px-1.5 text-[10px] font-normal">
            {log.projectName}
          </Badge>
        </TableCell>

        {/* Trace Link */}
        <TableCell className="py-1.5">
          {log.traceId ? (
            <Link
              href={`/workspace/${workspaceSlug}/projects/${log.projectId}/traces?trace=${log.traceId}`}
              onClick={(e) => e.stopPropagation()}
            >
              <Button variant="ghost" size="icon" className="h-5 w-5">
                <ExternalLink className="h-3 w-3" />
              </Button>
            </Link>
          ) : (
            <span className="text-xs text-muted-foreground">-</span>
          )}
        </TableCell>
      </TableRow>
    );
  };

  if (isLoading) {
    return (
      <Table>
        <TableHeader className="sticky top-0 bg-background z-10">
          <TableRow className="border-b hover:bg-transparent">
            <TableHead className="w-[100px] h-8 text-xs font-medium text-muted-foreground">
              Time
            </TableHead>
            <TableHead className="w-[50px] h-8 text-xs font-medium text-muted-foreground">
              Level
            </TableHead>
            <TableHead className="w-[120px] h-8 text-xs font-medium text-muted-foreground">
              Service
            </TableHead>
            <TableHead className="h-8 text-xs font-medium text-muted-foreground">
              Body
            </TableHead>
            <TableHead className="w-[100px] h-8 text-xs font-medium text-muted-foreground">
              Project
            </TableHead>
            <TableHead className="w-[40px] h-8 text-xs font-medium text-muted-foreground">
              Trace
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>{[0, 1, 2, 3, 4].map(renderSkeletonRow)}</TableBody>
      </Table>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <DataTableEmpty
          icon={ScrollText}
          title="No logs yet"
          description="Logs will appear here when your application sends log data."
          filteredTitle="No logs match your filters"
          filteredDescription="Try adjusting your search query or filter settings."
        />
      </div>
    );
  }

  return (
    <>
      <Table>
        <TableHeader className="sticky top-0 bg-background z-10">
          <TableRow className="border-b hover:bg-transparent">
            <TableHead className="w-[100px] h-8 text-xs font-medium text-muted-foreground">
              Time
            </TableHead>
            <TableHead className="w-[50px] h-8 text-xs font-medium text-muted-foreground">
              Level
            </TableHead>
            <TableHead className="w-[120px] h-8 text-xs font-medium text-muted-foreground">
              Service
            </TableHead>
            <TableHead className="h-8 text-xs font-medium text-muted-foreground">
              Body
            </TableHead>
            <TableHead className="w-[100px] h-8 text-xs font-medium text-muted-foreground">
              Project
            </TableHead>
            <TableHead className="w-[40px] h-8 text-xs font-medium text-muted-foreground">
              Trace
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map(renderLogRow)}
          {isFetchingNextPage && [0, 1].map(renderSkeletonRow)}
        </TableBody>
      </Table>

      {/* Infinite scroll trigger */}
      <div ref={observerRef} className="h-4" />

      {/* Load more button (fallback) */}
      {hasNextPage && !isFetchingNextPage && (
        <div className="flex justify-center py-4">
          <Button variant="outline" size="sm" onClick={loadMore}>
            Load More
          </Button>
        </div>
      )}
    </>
  );
}
