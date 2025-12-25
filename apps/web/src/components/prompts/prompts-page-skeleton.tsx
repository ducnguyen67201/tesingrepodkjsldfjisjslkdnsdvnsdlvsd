"use client";

import { Skeleton } from "@/components/ui/skeleton";

export function PromptsPageSkeleton() {
  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col border-r p-4 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
      <div className="w-[480px] p-4 space-y-4">
        <Skeleton className="h-6 w-32" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
    </div>
  );
}
