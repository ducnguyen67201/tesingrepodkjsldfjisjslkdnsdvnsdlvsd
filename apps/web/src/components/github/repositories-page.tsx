"use client";

import { useState, useCallback, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { useDebounce } from "@/hooks/use-debounce";
import { RepositoryList } from "./repository-list";
import { RepositoryFilters } from "./repository-filters";
import { GitHubEmptyState } from "./github-empty-state";
import { GitHubConnectionStatus } from "./github-connection-status";
import { RepositoryStatsSheet } from "./repository-stats-sheet";
import type { FilterType } from "./types";

const PAGE_SIZE = 20;
const POLLING_INTERVAL_MS = 5000; // Poll every 5 seconds when indexing

interface RepositoriesPageProps {
  workspaceSlug: string;
}

export function RepositoriesPage({ workspaceSlug }: RepositoriesPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filter, setFilter] = useState<FilterType>("enabled");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(search, 300);

  // Get stats view params from URL
  const repoId = searchParams.get("repo");
  const view = searchParams.get("view");
  const showStats = view === "stats" && !!repoId;

  // Handle closing the stats sheet
  const handleStatsClose = useCallback((open: boolean) => {
    if (!open) {
      // Remove query params when closing
      router.push(`/workspace/${workspaceSlug}/settings/repositories`);
    }
  }, [router, workspaceSlug]);

  const { data: installation, isLoading: installationLoading } =
    trpc.github.getInstallation.useQuery({ workspaceSlug });

  // Track if we should poll (when repos are indexing)
  const [shouldPoll, setShouldPoll] = useState(false);

  const { data, isLoading, refetch } = trpc.github.listRepositories.useQuery(
    {
      workspaceSlug,
      filter,
      search: debouncedSearch || undefined,
      page,
      pageSize: PAGE_SIZE,
    },
    {
      enabled: !!installation,
      refetchInterval: shouldPoll ? POLLING_INTERVAL_MS : false,
    }
  );

  // Check if any repositories are currently indexing and update polling state
  useEffect(() => {
    const hasIndexing = data?.repositories.some(
      (repo) => repo.enabled && (repo.indexStatus === "INDEXING" || repo.indexStatus === "PENDING")
    ) ?? false;
    setShouldPoll(hasIndexing);
  }, [data?.repositories]);

  const handleFilterChange = useCallback((newFilter: FilterType) => {
    setFilter(newFilter);
    setPage(1);
  }, []);

  const handleSearchChange = useCallback((newSearch: string) => {
    setSearch(newSearch);
    setPage(1);
  }, []);

  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
  }, []);

  // Loading state
  if (installationLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // No GitHub connected
  if (!installation) {
    return <GitHubEmptyState workspaceSlug={workspaceSlug} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Repositories</h1>
          <p className="text-sm text-muted-foreground">
            Manage which repositories are indexed for Root Cause Analysis.
          </p>
        </div>
      </div>

      <GitHubConnectionStatus
        installation={installation}
        workspaceId={installation.workspaceId}
      />

      <RepositoryFilters
        filter={filter}
        search={search}
        counts={data?.counts ?? { enabled: 0, disabled: 0, all: 0 }}
        onFilterChange={handleFilterChange}
        onSearchChange={handleSearchChange}
      />

      <RepositoryList
        repositories={data?.repositories ?? []}
        isLoading={isLoading}
        workspaceSlug={workspaceSlug}
        pagination={data?.pagination ?? { page: 1, pageSize: PAGE_SIZE, totalCount: 0, totalPages: 0 }}
        onPageChange={handlePageChange}
        onRefresh={refetch}
      />

      {/* Repository Stats Sheet */}
      <RepositoryStatsSheet
        workspaceSlug={workspaceSlug}
        repositoryId={repoId}
        open={showStats}
        onOpenChange={handleStatsClose}
      />
    </div>
  );
}
