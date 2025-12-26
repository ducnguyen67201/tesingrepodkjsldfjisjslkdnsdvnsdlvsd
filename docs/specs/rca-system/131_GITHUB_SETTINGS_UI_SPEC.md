# Engineering Spec: #132 GitHub Settings UI

**Story Points:** 8
**Priority:** P0
**Sprint:** Sprint 1 - Foundation (UI)
**Dependencies:** #128 (Database Schema), #129 (Webhook Endpoint)

---

## Overview

Create a GitHub integration UI at the **workspace level** where users can connect their GitHub account, view all accessible repositories, and enable/disable indexing for specific repos. This follows the pattern shown in the reference UI with repository list, status badges, and filtering.

---

## Acceptance Criteria

- [ ] "Repositories" tab in workspace settings at `/workspace/[slug]/settings/repositories`
- [ ] GitHub account connection flow (OAuth or GitHub App)
- [ ] List all repositories user has access to
- [ ] Enable/disable indexing per repository
- [ ] Filter tabs: Enabled / Disabled / All
- [ ] Search repositories by name
- [ ] Status badges: ENABLED, DISABLED, INDEXING, UPDATING, FAILED
- [ ] Real-time status updates during indexing
- [ ] Empty state when no GitHub account connected

---

## UI Design

### Workspace Settings - Repositories Tab

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ┌──────────────┐  ┌──────────────┐                                         │
│  │ Repositories │  │  Settings    │                                    ⚙️   │
│  └──────────────┘  └──────────────┘                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Repositories                                                           ⚙️   │
│                                                                              │
│  ┌────────────────────────────────────────────┐  ┌─────────┐ ┌─────────┐ ┌─────────┐
│  │ 🔍 Search repository                       │  │Enabled(2)│ │Disabled │ │ All(57) │
│  └────────────────────────────────────────────┘  └─────────┘ └─────────┘ └─────────┘
│                                                   ▲ active                   │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  NAME                                                          STATUS   │ │
│  ├─────────────────────────────────────────────────────────────────────────┤ │
│  │  🐙 ducnguyen67201/ducsigr                              ● INDEXING  │ │
│  ├─────────────────────────────────────────────────────────────────────────┤ │
│  │  🐙 ducnguyen67201/my-other-repo                            ✓ ENABLED   │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Empty State (No GitHub Connected)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Repositories                                                               │
│                                                                              │
│                           ┌─────────────────────┐                           │
│                           │         🐙          │                           │
│                           │                     │                           │
│                           │  Connect GitHub     │                           │
│                           │                     │                           │
│                           │  Connect your       │                           │
│                           │  GitHub account to  │                           │
│                           │  import and index   │                           │
│                           │  repositories.      │                           │
│                           │                     │                           │
│                           │  [Connect GitHub]   │                           │
│                           └─────────────────────┘                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Repository Row States

| Status | Badge | Description |
|--------|-------|-------------|
| `ENABLED` | `✓ ENABLED` (green) | Indexing enabled, up to date |
| `INDEXING` | `● INDEXING` (blue, animated) | Currently being indexed |
| `UPDATING` | `● UPDATING` (blue, animated) | Processing new commits |
| `DISABLED` | `○ DISABLED` (gray) | Not being indexed |
| `FAILED` | `✕ FAILED` (red) | Indexing failed |

### Repository Row Actions (on hover/click)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  🐙 ducnguyen67201/ducsigr                          ● INDEXING    [···] │
│                                                                              │
│     └─> Dropdown Menu:                                                       │
│         ┌────────────────────┐                                              │
│         │ ↻ Re-index         │                                              │
│         │ ⊘ Disable          │                                              │
│         │ ↗ View on GitHub   │                                              │
│         ├────────────────────┤                                              │
│         │ 📊 View Stats      │                                              │
│         └────────────────────┘                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Database Schema Updates

### New: GitHubInstallation Model

```prisma
model GitHubInstallation {
  id             String   @id @default(cuid())
  workspaceId    String   @unique
  installationId BigInt   @unique
  accountLogin   String   // GitHub username or org
  accountType    String   // "User" or "Organization"
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  workspace    Workspace          @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  repositories GitHubRepository[]

  @@map("github_installations")
}
```

### Update: GitHubRepository Model

```prisma
model GitHubRepository {
  id             String      @id @default(cuid())
  installationId String      // Link to GitHubInstallation
  projectId      String?     @unique // Optional - only set when enabled for a project
  githubId       BigInt      @unique // GitHub's repository ID
  owner          String
  repo           String
  fullName       String      // "owner/repo"
  defaultBranch  String      @default("main")
  isPrivate      Boolean     @default(false)
  enabled        Boolean     @default(false)
  indexStatus    IndexStatus @default(PENDING)
  lastIndexedAt  DateTime?
  createdAt      DateTime    @default(now())
  updatedAt      DateTime    @updatedAt

  installation GitHubInstallation @relation(fields: [installationId], references: [id], onDelete: Cascade)
  project      Project?           @relation(fields: [projectId], references: [id], onDelete: SetNull)
  commits      GitCommit[]
  prs          GitPullRequest[]
  chunks       CodeChunk[]

  @@index([installationId])
  @@index([owner, repo])
  @@map("github_repositories")
}
```

### Update: IndexStatus Enum

```prisma
enum IndexStatus {
  PENDING    // Never indexed
  INDEXING   // Initial indexing in progress
  UPDATING   // Processing new commits
  READY      // Up to date
  FAILED     // Indexing failed
}
```

---

## Technical Architecture

### Route Structure

```
apps/web/src/app/workspace/[workspaceSlug]/settings/
├── layout.tsx              # Existing settings layout
├── page.tsx                # General settings
├── members/page.tsx        # Existing
├── channels/page.tsx       # Existing
├── repositories/           # NEW
│   └── page.tsx           # GitHub repositories page
└── api-keys/page.tsx      # Existing
```

### Component Structure

```
apps/web/src/components/github/
├── repositories-page.tsx       # Main page component
├── repository-list.tsx         # Table of repositories
├── repository-row.tsx          # Single repository row
├── repository-status-badge.tsx # Status badge
├── repository-actions.tsx      # Dropdown menu actions
├── repository-filters.tsx      # Search + filter tabs
├── connect-github-button.tsx   # OAuth trigger
└── github-empty-state.tsx      # No connection state
```

---

## Files to Create/Modify

### New Files

| File | Description |
|------|-------------|
| `apps/web/src/app/.../settings/repositories/page.tsx` | Repositories settings page |
| `apps/web/src/components/github/repositories-page.tsx` | Main page component |
| `apps/web/src/components/github/repository-list.tsx` | Repository table |
| `apps/web/src/components/github/repository-row.tsx` | Table row component |
| `apps/web/src/components/github/repository-status-badge.tsx` | Status badge |
| `apps/web/src/components/github/repository-filters.tsx` | Search & tabs |
| `apps/web/src/components/github/github-empty-state.tsx` | Empty state |
| `apps/web/src/hooks/use-github-repositories.ts` | Data fetching hook |
| `packages/api/src/routers/github.ts` | tRPC router |

### Modified Files

| File | Changes |
|------|---------|
| `apps/web/src/app/.../settings/layout.tsx` | Add "Repositories" nav item |
| `packages/api/src/routers/index.ts` | Export github router |
| `packages/api/src/schemas/github.ts` | Add new schemas |
| `packages/db/prisma/schema.prisma` | Add GitHubInstallation model |

---

## Implementation Steps

### Step 1: Update Settings Layout Navigation

**File: `apps/web/src/app/workspace/[workspaceSlug]/settings/layout.tsx`**

```typescript
// Add to SETTINGS_NAV_ITEMS array
const SETTINGS_NAV_ITEMS: SettingsNavItem[] = [
  { title: "General", path: "/settings", icon: Building2 },
  { title: "Members", path: "/settings/members", icon: Users },
  { title: "Repositories", path: "/settings/repositories", icon: Github }, // NEW
  { title: "Domains", path: "/settings/domains", icon: Globe },
  { title: "Channels", path: "/settings/channels", icon: Bell },
  { title: "API Keys", path: "/settings/api-keys", icon: Key },
];
```

---

### Step 2: Create tRPC Router

**File: `packages/api/src/routers/github.ts`**

```typescript
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, protectedProcedure } from "../trpc";
import { prisma } from "@ducsigr/db";

export const githubRouter = createRouter({
  /**
   * Get GitHub installation status for workspace
   */
  getInstallation: protectedProcedure
    .input(z.object({ workspaceSlug: z.string() }))
    .query(async ({ input, ctx }) => {
      const workspace = await prisma.workspace.findFirst({
        where: {
          slug: input.workspaceSlug,
          members: { some: { userId: ctx.session.user.id } },
        },
        include: {
          githubInstallation: true,
        },
      });

      if (!workspace) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      return workspace.githubInstallation;
    }),

  /**
   * List all repositories for a workspace
   */
  listRepositories: protectedProcedure
    .input(
      z.object({
        workspaceSlug: z.string(),
        filter: z.enum(["enabled", "disabled", "all"]).default("all"),
        search: z.string().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const { workspaceSlug, filter, search } = input;

      const workspace = await prisma.workspace.findFirst({
        where: {
          slug: workspaceSlug,
          members: { some: { userId: ctx.session.user.id } },
        },
        include: { githubInstallation: true },
      });

      if (!workspace?.githubInstallation) {
        return { repositories: [], counts: { enabled: 0, disabled: 0, all: 0 } };
      }

      const where: any = {
        installationId: workspace.githubInstallation.id,
      };

      if (filter === "enabled") {
        where.enabled = true;
      } else if (filter === "disabled") {
        where.enabled = false;
      }

      if (search) {
        where.fullName = { contains: search, mode: "insensitive" };
      }

      const [repositories, counts] = await Promise.all([
        prisma.gitHubRepository.findMany({
          where,
          orderBy: [{ enabled: "desc" }, { fullName: "asc" }],
          select: {
            id: true,
            fullName: true,
            owner: true,
            repo: true,
            defaultBranch: true,
            isPrivate: true,
            enabled: true,
            indexStatus: true,
            lastIndexedAt: true,
            _count: { select: { chunks: true } },
          },
        }),
        prisma.gitHubRepository.groupBy({
          by: ["enabled"],
          where: { installationId: workspace.githubInstallation.id },
          _count: true,
        }),
      ]);

      const enabledCount = counts.find((c) => c.enabled)?._count ?? 0;
      const disabledCount = counts.find((c) => !c.enabled)?._count ?? 0;

      return {
        repositories: repositories.map((r) => ({
          ...r,
          chunkCount: r._count.chunks,
        })),
        counts: {
          enabled: enabledCount,
          disabled: disabledCount,
          all: enabledCount + disabledCount,
        },
      };
    }),

  /**
   * Enable indexing for a repository
   */
  enableRepository: protectedProcedure
    .input(z.object({ workspaceSlug: z.string(), repositoryId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const { workspaceSlug, repositoryId } = input;

      // Verify access
      const repo = await prisma.gitHubRepository.findFirst({
        where: {
          id: repositoryId,
          installation: {
            workspace: {
              slug: workspaceSlug,
              members: {
                some: {
                  userId: ctx.session.user.id,
                  role: { in: ["OWNER", "ADMIN"] },
                },
              },
            },
          },
        },
      });

      if (!repo) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      // Enable and set to pending
      await prisma.gitHubRepository.update({
        where: { id: repositoryId },
        data: {
          enabled: true,
          indexStatus: "PENDING",
        },
      });

      // TODO: Trigger initial indexing workflow

      return { success: true };
    }),

  /**
   * Disable indexing for a repository
   */
  disableRepository: protectedProcedure
    .input(z.object({ workspaceSlug: z.string(), repositoryId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const { workspaceSlug, repositoryId } = input;

      const repo = await prisma.gitHubRepository.findFirst({
        where: {
          id: repositoryId,
          installation: {
            workspace: {
              slug: workspaceSlug,
              members: {
                some: {
                  userId: ctx.session.user.id,
                  role: { in: ["OWNER", "ADMIN"] },
                },
              },
            },
          },
        },
      });

      if (!repo) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      // Disable and optionally clear chunks
      await prisma.$transaction([
        prisma.gitHubRepository.update({
          where: { id: repositoryId },
          data: { enabled: false },
        }),
        // Optionally delete chunks to free space
        prisma.codeChunk.deleteMany({
          where: { repoId: repositoryId },
        }),
      ]);

      return { success: true };
    }),

  /**
   * Trigger re-index for a repository
   */
  reindexRepository: protectedProcedure
    .input(z.object({ workspaceSlug: z.string(), repositoryId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const { workspaceSlug, repositoryId } = input;

      const repo = await prisma.gitHubRepository.findFirst({
        where: {
          id: repositoryId,
          enabled: true,
          installation: {
            workspace: {
              slug: workspaceSlug,
              members: { some: { userId: ctx.session.user.id } },
            },
          },
        },
      });

      if (!repo) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      await prisma.gitHubRepository.update({
        where: { id: repositoryId },
        data: { indexStatus: "INDEXING" },
      });

      // TODO: Trigger full re-index workflow

      return { success: true };
    }),
});
```

---

### Step 3: Create Repositories Page

**File: `apps/web/src/app/workspace/[workspaceSlug]/settings/repositories/page.tsx`**

```typescript
import { RepositoriesPage } from "@/components/github/repositories-page";

interface PageProps {
  params: Promise<{ workspaceSlug: string }>;
}

export default async function WorkspaceRepositoriesPage({ params }: PageProps) {
  const { workspaceSlug } = await params;
  return <RepositoriesPage workspaceSlug={workspaceSlug} />;
}
```

---

### Step 4: Create Main Repositories Component

**File: `apps/web/src/components/github/repositories-page.tsx`**

```typescript
"use client";

import { useState, useCallback } from "react";
import { Github, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { RepositoryList } from "./repository-list";
import { RepositoryFilters } from "./repository-filters";
import { GitHubEmptyState } from "./github-empty-state";

type FilterType = "enabled" | "disabled" | "all";

interface RepositoriesPageProps {
  workspaceSlug: string;
}

export function RepositoriesPage({ workspaceSlug }: RepositoriesPageProps) {
  const [filter, setFilter] = useState<FilterType>("enabled");
  const [search, setSearch] = useState("");

  const { data: installation, isLoading: installationLoading } =
    trpc.github.getInstallation.useQuery({ workspaceSlug });

  const { data, isLoading, refetch } = trpc.github.listRepositories.useQuery(
    { workspaceSlug, filter, search: search || undefined },
    { enabled: !!installation }
  );

  const handleFilterChange = useCallback((newFilter: FilterType) => {
    setFilter(newFilter);
  }, []);

  const handleSearchChange = useCallback((newSearch: string) => {
    setSearch(newSearch);
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
        onRefresh={refetch}
      />
    </div>
  );
}
```

---

### Step 5: Create Repository Filters Component

**File: `apps/web/src/components/github/repository-filters.tsx`**

```typescript
"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type FilterType = "enabled" | "disabled" | "all";

interface Counts {
  enabled: number;
  disabled: number;
  all: number;
}

interface RepositoryFiltersProps {
  filter: FilterType;
  search: string;
  counts: Counts;
  onFilterChange: (filter: FilterType) => void;
  onSearchChange: (search: string) => void;
}

const FILTER_OPTIONS: { value: FilterType; label: string }[] = [
  { value: "enabled", label: "Enabled" },
  { value: "disabled", label: "Disabled" },
  { value: "all", label: "All" },
];

export function RepositoryFilters({
  filter,
  search,
  counts,
  onFilterChange,
  onSearchChange,
}: RepositoryFiltersProps) {
  const getCount = (value: FilterType) => counts[value];

  return (
    <div className="flex items-center gap-4">
      {/* Search */}
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search repository"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
        {FILTER_OPTIONS.map((option) => (
          <button
            key={option.value}
            onClick={() => onFilterChange(option.value)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              filter === option.value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {option.label} ({getCount(option.value)})
          </button>
        ))}
      </div>
    </div>
  );
}
```

---

### Step 6: Create Repository List Component

**File: `apps/web/src/components/github/repository-list.tsx`**

```typescript
"use client";

import { Loader2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RepositoryRow } from "./repository-row";
import type { IndexStatus } from "@ducsigr/api/schemas";

interface Repository {
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
}

interface RepositoryListProps {
  repositories: Repository[];
  isLoading: boolean;
  workspaceSlug: string;
  onRefresh: () => void;
}

export function RepositoryList({
  repositories,
  isLoading,
  workspaceSlug,
  onRefresh,
}: RepositoryListProps) {
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

  return (
    <div className="border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead className="w-[150px] text-right">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {repositories.map((repo) => (
            <RepositoryRow
              key={repo.id}
              repository={repo}
              workspaceSlug={workspaceSlug}
              onRefresh={onRefresh}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

---

### Step 7: Create Repository Row Component

**File: `apps/web/src/components/github/repository-row.tsx`**

```typescript
"use client";

import { useCallback } from "react";
import {
  Github,
  MoreHorizontal,
  RefreshCw,
  Power,
  PowerOff,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { showError } from "@/lib/errors";
import { showSuccess } from "@/lib/success";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TableCell, TableRow } from "@/components/ui/table";
import { RepositoryStatusBadge } from "./repository-status-badge";
import type { IndexStatus } from "@ducsigr/api/schemas";

interface Repository {
  id: string;
  fullName: string;
  owner: string;
  repo: string;
  enabled: boolean;
  indexStatus: IndexStatus;
  lastIndexedAt: Date | null;
  chunkCount: number;
}

interface RepositoryRowProps {
  repository: Repository;
  workspaceSlug: string;
  onRefresh: () => void;
}

export function RepositoryRow({
  repository,
  workspaceSlug,
  onRefresh,
}: RepositoryRowProps) {
  const enable = trpc.github.enableRepository.useMutation({
    onSuccess: () => {
      showSuccess("Repository enabled", "Indexing will begin shortly.");
      onRefresh();
    },
    onError: showError,
  });

  const disable = trpc.github.disableRepository.useMutation({
    onSuccess: () => {
      showSuccess("Repository disabled", "Indexing has been stopped.");
      onRefresh();
    },
    onError: showError,
  });

  const reindex = trpc.github.reindexRepository.useMutation({
    onSuccess: () => {
      showSuccess("Re-indexing started", "This may take a few minutes.");
      onRefresh();
    },
    onError: showError,
  });

  const isLoading = enable.isPending || disable.isPending || reindex.isPending;

  const handleEnable = useCallback(() => {
    enable.mutate({ workspaceSlug, repositoryId: repository.id });
  }, [enable, workspaceSlug, repository.id]);

  const handleDisable = useCallback(() => {
    disable.mutate({ workspaceSlug, repositoryId: repository.id });
  }, [disable, workspaceSlug, repository.id]);

  const handleReindex = useCallback(() => {
    reindex.mutate({ workspaceSlug, repositoryId: repository.id });
  }, [reindex, workspaceSlug, repository.id]);

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-3">
          <Github className="h-5 w-5 text-muted-foreground" />
          <span className="font-medium">{repository.fullName}</span>
        </div>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-2">
          <RepositoryStatusBadge
            enabled={repository.enabled}
            status={repository.indexStatus}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" disabled={isLoading}>
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <MoreHorizontal className="h-4 w-4" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {repository.enabled ? (
                <>
                  <DropdownMenuItem onClick={handleReindex}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Re-index
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleDisable}>
                    <PowerOff className="mr-2 h-4 w-4" />
                    Disable
                  </DropdownMenuItem>
                </>
              ) : (
                <DropdownMenuItem onClick={handleEnable}>
                  <Power className="mr-2 h-4 w-4" />
                  Enable
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <a
                  href={`https://github.com/${repository.fullName}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  View on GitHub
                </a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
    </TableRow>
  );
}
```

---

### Step 8: Create Status Badge Component

**File: `apps/web/src/components/github/repository-status-badge.tsx`**

```typescript
import { CheckCircle, Circle, Loader2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { IndexStatus } from "@ducsigr/api/schemas";

interface RepositoryStatusBadgeProps {
  enabled: boolean;
  status: IndexStatus;
}

export function RepositoryStatusBadge({
  enabled,
  status,
}: RepositoryStatusBadgeProps) {
  if (!enabled) {
    return (
      <Badge variant="secondary" className="gap-1">
        <Circle className="h-3 w-3" />
        DISABLED
      </Badge>
    );
  }

  switch (status) {
    case "INDEXING":
    case "UPDATING":
      return (
        <Badge
          variant="secondary"
          className="gap-1 bg-blue-500/10 text-blue-600 border-blue-500/20"
        >
          <Loader2 className="h-3 w-3 animate-spin" />
          {status}
        </Badge>
      );
    case "READY":
      return (
        <Badge
          variant="secondary"
          className="gap-1 bg-green-500/10 text-green-600 border-green-500/20"
        >
          <CheckCircle className="h-3 w-3" />
          ENABLED
        </Badge>
      );
    case "FAILED":
      return (
        <Badge variant="destructive" className="gap-1">
          <XCircle className="h-3 w-3" />
          FAILED
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary" className="gap-1">
          <Circle className="h-3 w-3" />
          PENDING
        </Badge>
      );
  }
}
```

---

### Step 9: Create Empty State Component

**File: `apps/web/src/components/github/github-empty-state.tsx`**

```typescript
"use client";

import { Github } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface GitHubEmptyStateProps {
  workspaceSlug: string;
}

export function GitHubEmptyState({ workspaceSlug }: GitHubEmptyStateProps) {
  const handleConnect = () => {
    // TODO: Implement GitHub App OAuth flow
    // Redirect to GitHub App installation
    const installUrl = `https://github.com/apps/YOUR_APP_NAME/installations/new`;
    window.location.href = installUrl;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Repositories</h1>
        <p className="text-sm text-muted-foreground">
          Connect GitHub to index repositories for Root Cause Analysis.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <div className="rounded-full bg-muted p-4 mb-4">
            <Github className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">Connect GitHub</h3>
          <p className="text-sm text-muted-foreground text-center max-w-md mb-6">
            Connect your GitHub account to import repositories. Once connected,
            you can enable indexing for specific repositories to power Root
            Cause Analysis.
          </p>
          <Button onClick={handleConnect}>
            <Github className="mr-2 h-4 w-4" />
            Connect GitHub
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
```

---

## API Endpoints Summary

| Endpoint | Method | Description |
|----------|--------|-------------|
| `github.getInstallation` | Query | Get workspace's GitHub installation |
| `github.listRepositories` | Query | List repos with filter/search |
| `github.enableRepository` | Mutation | Enable indexing for repo |
| `github.disableRepository` | Mutation | Disable indexing for repo |
| `github.reindexRepository` | Mutation | Trigger full re-index |

---

## Testing Checklist

- [ ] Navigate to workspace settings → Repositories tab
- [ ] Empty state shows when no GitHub connected
- [ ] Repository list loads with correct data
- [ ] Filter tabs work (Enabled/Disabled/All)
- [ ] Search filters repositories by name
- [ ] Enable/disable repository works
- [ ] Status badges update correctly
- [ ] Re-index triggers status change
- [ ] Dropdown menu actions work
- [ ] External GitHub link opens correctly

---

## Future Enhancements

| Enhancement | Priority | Description |
|-------------|----------|-------------|
| GitHub App OAuth | P0 | Automatic repo sync via GitHub App |
| Webhook auto-setup | P1 | Auto-configure webhooks on enable |
| Index progress | P2 | Show % completion during indexing |
| Repo stats | P2 | Show chunk count, last commit, etc. |
| Bulk actions | P3 | Enable/disable multiple repos at once |
| Activity log | P3 | Show indexing history per repo |
