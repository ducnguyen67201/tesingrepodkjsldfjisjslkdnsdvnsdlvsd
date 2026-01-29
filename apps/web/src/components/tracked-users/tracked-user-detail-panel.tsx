"use client";

import { useCallback } from "react";
import {
  User,
  AlertCircle,
  RefreshCw,
  Mail,
  Calendar,
  Activity,
  MessagesSquare,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc/client";

interface TrackedUserDetailPanelProps {
  workspaceSlug: string;
  userId: string | null;
  onClose: () => void;
}

/**
 * Sheet panel showing tracked user details with stats and recent activity.
 */
export function TrackedUserDetailPanel({
  workspaceSlug,
  userId,
  onClose,
}: TrackedUserDetailPanelProps) {
  const { data: user, isLoading, error, refetch } = trpc.trackedUsers.get.useQuery(
    { workspaceSlug, id: userId ?? "" },
    { enabled: !!workspaceSlug && !!userId }
  );

  const isOpen = userId !== null;

  const handleRetry = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        onClose();
      }
    },
    [onClose]
  );

  return (
    <Sheet open={isOpen} onOpenChange={handleOpenChange}>
      <SheetContent className="!w-[600px] !max-w-[90vw] p-0 flex flex-col overflow-hidden">
        {/* Accessibility */}
        <SheetTitle className="sr-only">
          {user?.name ?? "User Details"}
        </SheetTitle>
        <SheetDescription className="sr-only">
          Detailed view of tracked user including stats and metadata
        </SheetDescription>

        {error ? (
          <TrackedUserDetailError error={error} onRetry={handleRetry} />
        ) : isLoading || !user ? (
          <TrackedUserDetailSkeleton />
        ) : (
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="px-6 pt-6 pb-4 flex-shrink-0 border-b">
              {/* Top label */}
              <div className="flex items-center gap-2 text-muted-foreground mb-3">
                <User className="h-4 w-4" />
                <span className="text-sm">User detail</span>
              </div>

              {/* Title */}
              <h2 className="text-2xl font-semibold mb-2 flex items-center gap-2">
                {user.name || user.externalId || user.id.slice(0, 8)}
              </h2>

              {/* User info */}
              <div className="space-y-1 mb-4">
                {user.email && (
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5" />
                    {user.email}
                  </p>
                )}
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <span className="font-mono text-xs">ID:</span>
                  {user.externalId}
                </p>
              </div>

              {/* Date info */}
              <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>First seen {formatDistanceToNow(new Date(user.firstSeenAt), { addSuffix: true })}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Activity className="h-3.5 w-3.5" />
                  <span>Last seen {formatDistanceToNow(new Date(user.lastSeenAt), { addSuffix: true })}</span>
                </div>
              </div>

              {/* Stats row */}
              <div className="flex items-start gap-6 text-sm flex-wrap">
                <StatItem label="Sessions">
                  <div className="flex items-center gap-1.5">
                    <MessagesSquare className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-medium">{user._count?.sessions ?? 0}</span>
                  </div>
                </StatItem>
                {/* NOTE: Total Traces removed - will be reworked for OTLP-first design */}
                <StatItem label="Status">
                  <Badge
                    variant="default"
                    className={cn(
                      "bg-green-500/10 text-green-600 hover:bg-green-500/20"
                    )}
                  >
                    Active
                  </Badge>
                </StatItem>
              </div>
            </div>

            {/* Sessions list */}
            <div className="flex-1 overflow-auto p-6">
              <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                <MessagesSquare className="h-4 w-4" />
                Recent Sessions
              </h3>
              {user.sessions && user.sessions.length > 0 ? (
                <div className="space-y-2">
                  {user.sessions.slice(0, 10).map((session) => (
                    <div
                      key={session.id}
                      className="p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">
                          {session.externalId || session.id.slice(0, 8)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(session.updatedAt), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No sessions yet.</p>
              )}

              {/* Metadata */}
              {user.metadata && Object.keys(user.metadata).length > 0 && (
                <div className="mt-6">
                  <h3 className="text-sm font-medium mb-3">Metadata</h3>
                  <div className="p-3 rounded-lg border bg-muted/30">
                    <pre className="text-xs overflow-auto">
                      {JSON.stringify(user.metadata, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function StatItem({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-muted-foreground text-xs mb-1">{label}</div>
      {children}
    </div>
  );
}

function TrackedUserDetailSkeleton() {
  return (
    <div className="p-6 space-y-6">
      {/* Header skeleton */}
      <div className="space-y-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-32" />
        <div className="flex gap-6">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-1">
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-5 w-16" />
            </div>
          ))}
        </div>
      </div>

      {/* Sessions skeleton */}
      <div className="space-y-2 pt-4 border-t">
        <Skeleton className="h-5 w-32" />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    </div>
  );
}

function TrackedUserDetailError({
  error,
  onRetry,
}: {
  error: { message?: string };
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full p-6 text-center">
      <AlertCircle className="h-12 w-12 text-destructive mb-4" />
      <h3 className="text-lg font-semibold mb-2">Failed to load user</h3>
      <p className="text-sm text-muted-foreground mb-4 max-w-md">
        {error.message || "An unexpected error occurred while loading the user details."}
      </p>
      <Button variant="outline" onClick={onRetry} className="gap-2">
        <RefreshCw className="h-4 w-4" />
        Try again
      </Button>
    </div>
  );
}
