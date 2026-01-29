"use client";

import { Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { RepositoryRow } from "./repository-row";
import type { Repository, Pagination } from "./types";

interface RepositoryListProps {
  repositories: Repository[];
  isLoading: boolean;
  workspaceSlug: string;
  pagination: Pagination;
  onPageChange: (page: number) => void;
  onRefresh: () => void;
}

export function RepositoryList({
  repositories,
  isLoading,
  workspaceSlug,
  pagination,
  onPageChange,
  onRefresh,
}: RepositoryListProps) {
  const { page, totalCount, totalPages } = pagination;
  const hasPreviousPage = page > 1;
  const hasNextPage = page < totalPages;

  const handlePreviousPage = () => {
    if (hasPreviousPage) {
      onPageChange(page - 1);
    }
  };

  const handleNextPage = () => {
    if (hasNextPage) {
      onPageChange(page + 1);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 border rounded-lg">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (repositories.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 border rounded-lg text-center">
        <p className="text-sm text-muted-foreground">No repositories found.</p>
      </div>
    );
  }

  const renderRepositoryRow = (repo: Repository) => (
    <RepositoryRow
      key={repo.id}
      repository={repo}
      workspaceSlug={workspaceSlug}
      onRefresh={onRefresh}
    />
  );

  const startItem = (page - 1) * pagination.pageSize + 1;
  const endItem = Math.min(page * pagination.pageSize, totalCount);

  return (
    <div className="space-y-4">
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="w-[150px] text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>{repositories.map(renderRepositoryRow)}</TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-2">
          <p className="text-sm text-muted-foreground">
            Showing {startItem}-{endItem} of {totalCount} repositories
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePreviousPage}
              disabled={!hasPreviousPage}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleNextPage}
              disabled={!hasNextPage}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
