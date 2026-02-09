import type { IndexStatus } from "@ducsigr/api/schemas";

export type { IndexStatus };

/**
 * Filter type for repository list
 */
export type FilterType = "enabled" | "disabled" | "all";

/**
 * Repository counts by filter type
 */
export interface RepositoryCounts {
  enabled: number;
  disabled: number;
  all: number;
}

/**
 * Pagination info from tRPC query
 */
export interface Pagination {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

/**
 * Repository data from tRPC query
 */
export interface Repository {
  id: string;
  fullName: string;
  owner: string;
  repo: string;
  defaultBranch: string;
  isPrivate: boolean;
  enabled: boolean;
  indexStatus: IndexStatus;
  lastIndexedAt: Date | null;
  chunkCount: number;
  projectId: string | null;
  indexBranch: string | null;
  projectName: string | null;
}
