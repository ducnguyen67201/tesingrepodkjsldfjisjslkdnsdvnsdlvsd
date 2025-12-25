/**
 * useInfiniteScroll Hook
 *
 * Provides infinite scroll functionality using IntersectionObserver.
 * Reusable across data tables (logs, traces, etc.).
 */
import { useEffect, useRef, useCallback } from "react";

export interface UseInfiniteScrollOptions {
  /** Whether there are more items to load */
  hasNextPage: boolean;
  /** Whether currently fetching the next page */
  isFetchingNextPage: boolean;
  /** Function to load more items */
  onLoadMore: () => void;
  /** Intersection threshold (0-1), default 0.1 */
  threshold?: number;
  /** Whether the observer is enabled, default true */
  enabled?: boolean;
}

export interface UseInfiniteScrollReturn {
  /** Ref to attach to the sentinel element */
  observerRef: React.RefObject<HTMLDivElement | null>;
  /** Manual load more function */
  loadMore: () => void;
}

/**
 * Hook for infinite scroll with IntersectionObserver
 *
 * @example
 * ```tsx
 * const { observerRef, loadMore } = useInfiniteScroll({
 *   hasNextPage,
 *   isFetchingNextPage,
 *   onLoadMore: () => fetchNextPage(),
 * });
 *
 * return (
 *   <>
 *     <DataTable data={data} />
 *     <div ref={observerRef} className="h-4" />
 *     {hasNextPage && <Button onClick={loadMore}>Load More</Button>}
 *   </>
 * );
 * ```
 */
export function useInfiniteScroll({
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  threshold = 0.1,
  enabled = true,
}: UseInfiniteScrollOptions): UseInfiniteScrollReturn {
  const observerRef = useRef<HTMLDivElement>(null);

  // Stable load more function
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      onLoadMore();
    }
  }, [hasNextPage, isFetchingNextPage, onLoadMore]);

  // Set up intersection observer
  useEffect(() => {
    if (!enabled) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          onLoadMore();
        }
      },
      { threshold }
    );

    const currentRef = observerRef.current;
    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, [enabled, hasNextPage, isFetchingNextPage, onLoadMore, threshold]);

  return {
    observerRef,
    loadMore,
  };
}
