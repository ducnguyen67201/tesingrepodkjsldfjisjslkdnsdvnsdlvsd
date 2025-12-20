"use client";

import * as React from "react";
import { useCallback, useState } from "react";
import {
  AlertCircle,
  RefreshCw,
  Users,
  Search,
  Mail,
  Calendar,
  Activity,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { TrackedUser } from "@cognobserve/db";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { useTrackedUsers } from "@/hooks/tracked-users/use-tracked-users";
import { cn } from "@/lib/utils";
import { TrackedUserDetailPanel } from "./tracked-user-detail-panel";

// Use TrackedUser from @cognobserve/db
// NOTE: Metrics like traceCount, totalCost will be reworked for OTLP-first design
type TrackedUserBasic = TrackedUser;

/** Skeleton row indices for loading state */
const SKELETON_ROWS = [0, 1, 2, 3, 4] as const;

interface TrackedUsersTableProps {
  workspaceSlug: string;
  projectId: string;
}

export function TrackedUsersTable({ workspaceSlug, projectId }: TrackedUsersTableProps) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  // Debounce search
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { users, isLoading, error, hasMore, loadMore, isLoadingMore, refetch } = useTrackedUsers({
    workspaceSlug,
    projectId,
    search: debouncedSearch || undefined,
  });

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
  }, []);

  const handleUserSelect = useCallback((userId: string) => {
    setSelectedUserId(userId);
  }, []);

  const handleClosePanel = useCallback(() => {
    setSelectedUserId(null);
  }, []);

  if (isLoading) {
    return (
      <>
        <SearchBar value={search} onChange={handleSearchChange} />
        <TrackedUsersTableSkeleton />
      </>
    );
  }

  if (error) {
    return (
      <>
        <SearchBar value={search} onChange={handleSearchChange} />
        <TrackedUsersErrorState error={error} onRetry={refetch} />
      </>
    );
  }

  if (users.length === 0) {
    return (
      <>
        <SearchBar value={search} onChange={handleSearchChange} />
        <TrackedUsersEmptyState hasSearch={!!debouncedSearch} />
      </>
    );
  }

  return (
    <>
      <SearchBar value={search} onChange={handleSearchChange} />
      <div className="space-y-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[250px]">User</TableHead>
              <TableHead className="w-[180px]">External ID</TableHead>
              <TableHead className="w-[150px]">First Seen</TableHead>
              <TableHead className="w-[150px]">Last Seen</TableHead>
              {/* NOTE: Metrics columns removed - will be reworked for OTLP-first design */}
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TrackedUserRow
                key={user.id}
                user={user}
                isSelected={user.id === selectedUserId}
                onSelect={handleUserSelect}
              />
            ))}
          </TableBody>
        </Table>

        {hasMore && (
          <div className="flex justify-center">
            <Button variant="outline" onClick={loadMore} disabled={isLoadingMore}>
              {isLoadingMore ? "Loading..." : "Load More"}
            </Button>
          </div>
        )}
      </div>

      <TrackedUserDetailPanel
        workspaceSlug={workspaceSlug}
        userId={selectedUserId}
        onClose={handleClosePanel}
      />
    </>
  );
}

interface SearchBarProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

function SearchBar({ value, onChange }: SearchBarProps) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <div className="relative max-w-sm flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search users by name, email, or ID..."
          value={value}
          onChange={onChange}
          className="pl-9"
        />
      </div>
    </div>
  );
}

interface TrackedUserRowProps {
  user: TrackedUserBasic;
  isSelected: boolean;
  onSelect: (userId: string) => void;
}

function TrackedUserRow({ user, isSelected, onSelect }: TrackedUserRowProps) {
  const handleClick = useCallback(() => {
    onSelect(user.id);
  }, [user.id, onSelect]);

  return (
    <TableRow
      className={cn(
        "cursor-pointer hover:bg-muted/30",
        isSelected && "bg-muted/50"
      )}
      onClick={handleClick}
    >
      <TableCell className="py-3">
        <div className="flex flex-col gap-1">
          <span className="font-medium">
            {user.name || user.externalId || user.id.slice(0, 8)}
          </span>
          {user.email && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Mail className="h-3 w-3" />
              {user.email}
            </span>
          )}
        </div>
      </TableCell>
      <TableCell className="py-3">
        <span className="font-mono text-sm text-muted-foreground">
          {user.externalId}
        </span>
      </TableCell>
      <TableCell className="py-3">
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Calendar className="h-3.5 w-3.5" />
          {formatDistanceToNow(new Date(user.firstSeenAt), { addSuffix: true })}
        </span>
      </TableCell>
      <TableCell className="py-3">
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Activity className="h-3.5 w-3.5" />
          {formatDistanceToNow(new Date(user.lastSeenAt), { addSuffix: true })}
        </span>
      </TableCell>
    </TableRow>
  );
}

function TrackedUsersTableSkeleton() {
  const renderSkeletonRow = (index: number) => (
    <TableRow key={index}>
      <TableCell className="py-3">
        <div className="space-y-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-40" />
        </div>
      </TableCell>
      <TableCell className="py-3">
        <Skeleton className="h-5 w-24" />
      </TableCell>
      <TableCell className="py-3">
        <Skeleton className="h-5 w-20" />
      </TableCell>
      <TableCell className="py-3">
        <Skeleton className="h-5 w-20" />
      </TableCell>
    </TableRow>
  );

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[250px]">User</TableHead>
          <TableHead className="w-[180px]">External ID</TableHead>
          <TableHead className="w-[150px]">First Seen</TableHead>
          <TableHead className="w-[150px]">Last Seen</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>{SKELETON_ROWS.map(renderSkeletonRow)}</TableBody>
    </Table>
  );
}

interface TrackedUsersEmptyStateProps {
  hasSearch: boolean;
}

function TrackedUsersEmptyState({ hasSearch }: TrackedUsersEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Users className="h-12 w-12 text-muted-foreground/50" />
      <h3 className="mt-4 text-lg font-semibold">
        {hasSearch ? "No users found" : "No users yet"}
      </h3>
      <p className="mt-2 text-sm text-muted-foreground">
        {hasSearch
          ? "Try adjusting your search query."
          : "Users will appear here when your application sends traces with user IDs."}
      </p>
    </div>
  );
}

interface TrackedUsersErrorStateProps {
  error: Error;
  onRetry: () => void;
}

function TrackedUsersErrorState({ error, onRetry }: TrackedUsersErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <AlertCircle className="h-12 w-12 text-destructive/50" />
      <h3 className="mt-4 text-lg font-semibold">Failed to load users</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        {error.message || "An unexpected error occurred."}
      </p>
      <Button variant="outline" className="mt-4" onClick={onRetry}>
        <RefreshCw className="mr-2 h-4 w-4" />
        Retry
      </Button>
    </div>
  );
}
