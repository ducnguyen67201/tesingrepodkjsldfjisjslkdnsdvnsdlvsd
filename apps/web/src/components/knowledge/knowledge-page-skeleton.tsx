"use client";

import { Skeleton } from "@/components/ui/skeleton";

export function KnowledgePageSkeleton() {
  return (
    <div className="flex h-full">
      {/* Left */}
      <div className="w-[250px] flex flex-col border-r p-4 space-y-3">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-6 w-3/4" />
      </div>
      {/* Middle */}
      <div className="flex-1 flex flex-col border-r p-4 space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </div>
      {/* Right */}
      <div className="w-[400px] p-4 space-y-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    </div>
  );
}
