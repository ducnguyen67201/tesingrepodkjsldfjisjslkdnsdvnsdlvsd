"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

// ------------------------------------------------------------
// Constants
// ------------------------------------------------------------

const SKELETON_ROWS = [0, 1, 2, 3, 4, 5, 6, 7] as const;

// ------------------------------------------------------------
// Component
// ------------------------------------------------------------

export function TracesSkeleton() {
  const renderSkeletonRow = (index: number) => (
    <TableRow key={index}>
      {/* Service */}
      <TableCell className="py-3">
        <div className="space-y-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-16" />
        </div>
      </TableCell>
      {/* Duration */}
      <TableCell className="py-3">
        <Skeleton className="h-5 w-16" />
      </TableCell>
      {/* Spans */}
      <TableCell className="py-3">
        <Skeleton className="h-5 w-8" />
      </TableCell>
      {/* Errors */}
      <TableCell className="py-3">
        <Skeleton className="h-5 w-8" />
      </TableCell>
      {/* Types */}
      <TableCell className="py-3">
        <div className="flex gap-1">
          <Skeleton className="h-5 w-10" />
          <Skeleton className="h-5 w-10" />
        </div>
      </TableCell>
      {/* Time */}
      <TableCell className="py-3">
        <Skeleton className="h-5 w-20" />
      </TableCell>
    </TableRow>
  );

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[200px]">Service</TableHead>
            <TableHead className="w-[100px]">Duration</TableHead>
            <TableHead className="w-[80px]">Spans</TableHead>
            <TableHead className="w-[80px]">Errors</TableHead>
            <TableHead className="w-[120px]">Types</TableHead>
            <TableHead className="w-[140px]">Time</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>{SKELETON_ROWS.map(renderSkeletonRow)}</TableBody>
      </Table>
    </div>
  );
}
