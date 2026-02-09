# Engineering Spec: Assign GitHub Repository to Project with Branch Selection

> **Sprint**: GitHub Integration v2
> **Priority**: P0 (blocks RCA pipeline -- enabled repos never receive webhook indexing)
> **Estimated Effort**: 5-8 story points
> **Author**: Senior Architect

---

## 1. Problem Statement

### The Gap

The `GitHubRepository` model has an optional `projectId` field (`String? @unique`), but the current `enableRepository` mutation only sets `enabled: true` without linking to a project. Meanwhile, the webhook handler at `apps/web/src/app/api/webhooks/github/route.ts` checks `githubRepo.projectId` and skips indexing if it is null (lines 189-193):

```typescript
if (!githubRepo.projectId) {
  console.log("Repository not linked to project", { delivery, owner, repo });
  return webhookSuccess.skipped(SKIP_REASONS.REPO_NOT_REGISTERED);
}
```

This creates a dead end: users can enable a repo and the initial full-index runs (using `defaultBranch`), but incremental push indexing never works because `projectId` is never set. The RCA `correlateCodeChanges` activity also looks up repos by `projectId`, making it impossible to correlate alerts with code changes.

Additionally, there is no way for users to choose which branch to index. The system always uses `defaultBranch` (set from GitHub's API at sync time), but users may want to track a different branch (e.g., `develop`, `staging`).

### Impact

| Scenario | What Happens Now | Expected |
|----------|-----------------|----------|
| User enables a repo | Initial index runs, but no `projectId` set | Repo linked to a project, webhooks work |
| Push to default branch | Webhook skips: "Repository not linked to project" | Webhook triggers incremental index |
| RCA runs after alert | `correlateCodeChanges` finds no repo for project | Finds linked repo, correlates changes |
| User wants to index `develop` branch | No UI option, always uses `defaultBranch` | User can select branch |

### Current State

```
enableRepository mutation:
  Sets enabled: true, indexStatus: PENDING
  Starts repositoryIndexWorkflow with defaultBranch
  Does NOT set projectId  <-- THE BUG

Webhook handler:
  Finds repo by owner/repo + enabled: true
  Checks githubRepo.projectId  <-- Always null
  Skips: "Repository not linked to project"  <-- Dead end
```

---

## 2. Technical Design

### 2.1 Database Schema Change

**File**: `packages/db/prisma/schema/github.prisma`

Add a new `indexBranch` field to `GitHubRepository`:

```prisma
model GitHubRepository {
  // ... existing fields ...
  defaultBranch  String      @default("main")
  indexBranch    String?     // User-selected branch to index (falls back to defaultBranch)
  // ... rest of fields ...
}
```

- `indexBranch` is nullable. When null, the system uses `defaultBranch`.
- This separates the GitHub-reported default from the user's choice.
- Migration: `pnpm db:migrate --name add_index_branch_to_github_repository`

### 2.2 Architecture After Fix

```
User clicks "Assign to Project" on repo row
  |
  +-- 1. Select target project from dropdown
  +-- 2. Optionally override branch (defaults to repo's defaultBranch)
  |
  v
assignToProject mutation (tRPC)
  |
  +-- Validates repo belongs to workspace
  +-- Validates project belongs to workspace
  +-- Checks no other repo is assigned to this project
  +-- Updates: projectId, indexBranch, enabled=true, indexStatus=PENDING
  |
  +-- Starts repositoryIndexWorkflow (Temporal)
  |     branch = indexBranch ?? defaultBranch
  |
  v
Webhook handler (push event)
  |
  +-- Finds repo by owner/repo + enabled=true
  +-- Checks githubRepo.projectId  <-- NOW SET
  +-- Compares push branch vs (indexBranch ?? defaultBranch)
  +-- Starts githubIndexWorkflow  <-- NOW WORKS
```

### 2.3 API Changes

#### 2.3.1 New Zod Schemas

**File**: `packages/api/src/schemas/github.ts`

```typescript
// ============================================
// Repository-Project Assignment Schemas
// ============================================

export const AssignRepoToProjectSchema = z.object({
  workspaceSlug: z.string(),
  repositoryId: z.string(),
  projectId: z.string(),
  indexBranch: z.string().min(1).optional(),
});
export type AssignRepoToProjectInput = z.infer<typeof AssignRepoToProjectSchema>;

export const UnassignRepoFromProjectSchema = z.object({
  workspaceSlug: z.string(),
  repositoryId: z.string(),
});
export type UnassignRepoFromProjectInput = z.infer<typeof UnassignRepoFromProjectSchema>;
```

#### 2.3.2 New Procedure: `assignToProject`

**File**: `packages/api/src/routers/github.ts`

Replaces the "Enable" action in the UI. The old `enableRepository` without `projectId` is the root cause of the bug.

```typescript
assignToProject: protectedProcedure
  .input(AssignRepoToProjectSchema)
  .use(workspaceMiddleware)
  .mutation(async ({ ctx, input }) => {
    const { repositoryId, projectId, indexBranch } = input;

    // 1. Admin check
    const role = ctx.workspace.role as WorkspaceRole;
    if (!WORKSPACE_ADMIN_ROLES.includes(role)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Only workspace admins can assign repositories",
      });
    }

    // 2. Verify repo belongs to workspace installation
    const repo = await prisma.gitHubRepository.findFirst({
      where: {
        id: repositoryId,
        installation: { workspaceId: ctx.workspace.id },
      },
    });
    if (!repo) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Repository not found" });
    }

    // 3. Verify project belongs to workspace
    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId: ctx.workspace.id },
      select: { id: true, name: true },
    });
    if (!project) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
    }

    // 4. Check no other repo assigned to this project (unique constraint)
    const existingAssignment = await prisma.gitHubRepository.findUnique({
      where: { projectId },
      select: { id: true, fullName: true },
    });
    if (existingAssignment && existingAssignment.id !== repositoryId) {
      throw new TRPCError({
        code: "CONFLICT",
        message: `Project already has repository "${existingAssignment.fullName}" assigned`,
      });
    }

    // 5. Assign repo to project
    const effectiveBranch = indexBranch || repo.defaultBranch;
    const updatedRepo = await prisma.gitHubRepository.update({
      where: { id: repositoryId },
      data: {
        projectId,
        indexBranch: indexBranch || null,
        enabled: true,
        indexStatus: "PENDING",
      },
      include: { installation: true },
    });

    // 6. Start indexing workflow
    try {
      const client = await getTemporalClient();
      await client.workflow.start("repositoryIndexWorkflow", {
        taskQueue: getTaskQueue(),
        workflowId: `repo-index-${repositoryId}-${Date.now()}`,
        args: [{
          repositoryId: updatedRepo.id,
          installationId: Number(updatedRepo.installation.installationId),
          owner: updatedRepo.owner,
          repo: updatedRepo.repo,
          branch: effectiveBranch,
          mode: "initial",
        }],
      });
    } catch (error) {
      console.error("[GitHub] Failed to start indexing workflow:", error);
    }

    return { success: true, projectName: project.name };
  }),
```

#### 2.3.3 New Procedure: `unassignFromProject`

```typescript
unassignFromProject: protectedProcedure
  .input(UnassignRepoFromProjectSchema)
  .use(workspaceMiddleware)
  .mutation(async ({ ctx, input }) => {
    const { repositoryId } = input;

    const role = ctx.workspace.role as WorkspaceRole;
    if (!WORKSPACE_ADMIN_ROLES.includes(role)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Only workspace admins can unassign repositories",
      });
    }

    const repo = await prisma.gitHubRepository.findFirst({
      where: {
        id: repositoryId,
        installation: { workspaceId: ctx.workspace.id },
      },
    });
    if (!repo) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Repository not found" });
    }

    await prisma.$transaction([
      prisma.gitHubRepository.update({
        where: { id: repositoryId },
        data: {
          projectId: null,
          indexBranch: null,
          enabled: false,
          indexStatus: "PENDING",
        },
      }),
      prisma.codeChunk.deleteMany({
        where: { repoId: repositoryId },
      }),
    ]);

    return { success: true };
  }),
```

#### 2.3.4 New Procedure: `listProjectsForAssignment`

A lightweight query for the project selector dropdown:

```typescript
listProjectsForAssignment: protectedProcedure
  .input(z.object({ workspaceSlug: z.string() }))
  .use(workspaceMiddleware)
  .query(async ({ ctx }) => {
    const projects = await prisma.project.findMany({
      where: { workspaceId: ctx.workspace.id },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        githubRepo: {
          select: { id: true, fullName: true },
        },
      },
    });

    return projects.map((p) => ({
      id: p.id,
      name: p.name,
      hasRepo: !!p.githubRepo,
      repoName: p.githubRepo?.fullName ?? null,
    }));
  }),
```

#### 2.3.5 Modify Existing Procedures

**`disableRepository`** -- add clearing of `projectId` and `indexBranch`:

```typescript
// In the transaction, change the update data:
data: {
  enabled: false,
  projectId: null,
  indexBranch: null,
},
```

**`listRepositories`** -- add `projectId`, `indexBranch`, and project name to select:

```typescript
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
  projectId: true,        // NEW
  indexBranch: true,       // NEW
  project: {              // NEW
    select: { id: true, name: true },
  },
  _count: { select: { chunks: true } },
},
```

Update the return mapping to include `projectName`:

```typescript
repositories: repositories.map((r) => ({
  ...r,
  chunkCount: r._count.chunks,
  projectName: r.project?.name ?? null,  // NEW
})),
```

**`reindexRepository`** -- use `indexBranch` when starting the workflow:

```typescript
// Change the workflow args branch:
branch: updatedRepo.indexBranch ?? updatedRepo.defaultBranch,
```

**`enableRepository`** -- REMOVE this procedure entirely. Its functionality is replaced by `assignToProject`. Keeping it would allow users to enable repos without a project, recreating the original bug.

### 2.4 Webhook Handler Changes

**File**: `apps/web/src/app/api/webhooks/github/route.ts`

The branch check for push events currently happens at line 92-99 BEFORE the repo lookup. It compares against `parsed.repository.default_branch` (GitHub's API value). We need to move it AFTER the repo lookup so we can check against `indexBranch`.

**Before** (current, lines 91-99):
```typescript
// Only process pushes to default branch
const branch = parsed.ref.replace("refs/heads/", "");
if (branch !== parsed.repository.default_branch) {
  return webhookSuccess.skipped(SKIP_REASONS.NON_DEFAULT_BRANCH);
}
```

**After**:
1. Remove the branch check from the push parsing section (lines 91-99)
2. Store the push branch for later use
3. Add the branch check AFTER the repo lookup (after line 193)

```typescript
// In the push parsing section, extract branch but DON'T check it yet:
let pushBranch: string | null = null;
if (event === "push") {
  const parsed = GitHubPushPayloadSchema.parse(payload);
  // ... existing owner/repo extraction ...
  pushBranch = parsed.ref.replace("refs/heads/", "");
}

// After repo lookup + projectId check (line ~194):
if (event === "push" && pushBranch) {
  const trackedBranch = githubRepo.indexBranch ?? githubRepo.defaultBranch;
  if (pushBranch !== trackedBranch) {
    console.log("Push to non-tracked branch, skipping", {
      delivery, pushBranch, trackedBranch,
    });
    return webhookSuccess.skipped(SKIP_REASONS.NON_DEFAULT_BRANCH);
  }
}
```

Also update the `select` on the repo lookup (line 181) to include `indexBranch` and `defaultBranch`:

```typescript
select: { id: true, projectId: true, indexBranch: true, defaultBranch: true },
```

### 2.5 Frontend Changes

#### 2.5.1 Update Repository Type

**File**: `apps/web/src/components/github/types.ts`

```typescript
export interface Repository {
  // ... existing fields ...
  projectId: string | null;      // NEW
  indexBranch: string | null;     // NEW
  projectName: string | null;    // NEW
}
```

#### 2.5.2 New Component: Assign Repository Dialog

**File**: `apps/web/src/components/github/assign-repo-dialog.tsx` (NEW, ~120 lines)

A `Dialog` (from shadcn/ui) containing:
1. Repository name (read-only display)
2. Project `Select` dropdown (from `@/components/ui/select`)
   - Fetches projects via `trpc.github.listProjectsForAssignment`
   - Projects with `hasRepo: true` are disabled with a note "(has repo: owner/name)"
3. Branch `Input` (from `@/components/ui/input`)
   - Pre-filled with `repository.defaultBranch`
   - User can change to any branch name
4. Cancel and "Assign & Start Index" buttons

```
+-----------------------------------------------------+
|  Assign Repository to Project                       |
|                                                     |
|  Repository: owner/repo-name                        |
|                                                     |
|  Project:    [Select a project          v]          |
|              +---------------------------+          |
|              | My API Project            |          |
|              | Frontend App              |          |
|              | Data Pipeline  (has repo) | disabled |
|              +---------------------------+          |
|                                                     |
|  Branch:     [main                       ]          |
|              (branch to index, defaults to default) |
|                                                     |
|  [Cancel]    [Assign & Start Index]                 |
+-----------------------------------------------------+
```

Calls `trpc.github.assignToProject.useMutation` on submit.

#### 2.5.3 Modify Repository Row

**File**: `apps/web/src/components/github/repository-row.tsx`

Changes:
1. Add state for the assign dialog
2. Replace the "Enable" dropdown item with "Assign to Project" (opens the dialog)
3. Show project assignment info below the repo name:
   - Enabled with project: `"Project: My API Project  |  Branch: main"`
   - Enabled without project (legacy): `"Not assigned to any project" (warning styling)`
   - Disabled: No additional info
4. Replace "Disable" with "Unassign & Disable" for assigned repos (calls `unassignFromProject`)
5. Add "Reassign" option for enabled repos that already have a project

Dropdown menu structure:
- **Disabled repo**: "Assign to Project" (opens dialog), "View on GitHub"
- **Enabled repo**: "Re-index", "View Stats", "Reassign Project" (opens dialog), "Unassign & Disable" (confirmation), "View on GitHub"

#### 2.5.4 Modify Repository List

**File**: `apps/web/src/components/github/repository-list.tsx`

Add a "Project" column to the table header.

### 2.6 Toast Messages

**File**: `apps/web/src/lib/success.ts` -- add to `githubToast`:

```typescript
repositoryAssigned: (repoName: string, projectName: string) =>
  toast.success("Repository Assigned", {
    description: `"${repoName}" is now linked to "${projectName}". Indexing will begin shortly.`,
  }),

repositoryUnassigned: (repoName: string) =>
  toast.success("Repository Unassigned", {
    description: `"${repoName}" has been unlinked and disabled.`,
  }),

repositoryReassigned: (repoName: string, projectName: string) =>
  toast.success("Repository Reassigned", {
    description: `"${repoName}" is now linked to "${projectName}". Re-indexing will begin shortly.`,
  }),
```

**File**: `apps/web/src/lib/errors.ts` -- add to `githubError`:

```typescript
projectAlreadyHasRepo: (repoName: string) =>
  toast.error("Project Already Has Repository", {
    description: `This project already has "${repoName}" assigned. Unassign it first.`,
  }),

assignFailed: () =>
  toast.error("Assignment Failed", {
    description: "Failed to assign repository to project. Please try again.",
  }),
```

---

## 3. File-by-File Changes Summary

| File | Change Type | Est. Lines |
|------|------------|------------|
| `packages/db/prisma/schema/github.prisma` | ADD `indexBranch` field | ~1 |
| `packages/api/src/schemas/github.ts` | ADD 2 new schemas | ~15 |
| `packages/api/src/routers/github.ts` | ADD 3 procedures, MODIFY 3 procedures, REMOVE 1 | ~140 |
| `apps/web/src/app/api/webhooks/github/route.ts` | MODIFY branch check logic | ~20 |
| `apps/web/src/components/github/types.ts` | ADD 3 fields to Repository | ~3 |
| `apps/web/src/components/github/assign-repo-dialog.tsx` | NEW component | ~120 |
| `apps/web/src/components/github/repository-row.tsx` | MODIFY to use assign dialog + show project info | ~50 |
| `apps/web/src/components/github/repository-list.tsx` | ADD Project column | ~5 |
| `apps/web/src/lib/success.ts` | ADD 3 toast methods | ~15 |
| `apps/web/src/lib/errors.ts` | ADD 2 error methods | ~10 |

**Total**: ~380 lines across 10 files (1 new file)

---

## 4. Testing Plan

### 4.1 Unit Tests

**File**: `packages/api/src/routers/__tests__/github-assignment.test.ts`

| Test Case | Description |
|-----------|-------------|
| `assignToProject` -- happy path | Sets projectId, enabled, indexBranch correctly |
| `assignToProject` -- with custom branch | Stores `indexBranch` when provided |
| `assignToProject` -- no branch defaults to null | `indexBranch` is null, system uses `defaultBranch` |
| `assignToProject` -- repo not found | Returns NOT_FOUND |
| `assignToProject` -- project not found | Returns NOT_FOUND |
| `assignToProject` -- project already has different repo | Returns CONFLICT with repo name in message |
| `assignToProject` -- reassign same repo (idempotent) | Succeeds when repo already assigned to same project |
| `assignToProject` -- non-admin | Returns FORBIDDEN for MEMBER/VIEWER roles |
| `unassignFromProject` -- happy path | Clears projectId, indexBranch, disables, deletes chunks |
| `unassignFromProject` -- repo not found | Returns NOT_FOUND |
| `unassignFromProject` -- non-admin | Returns FORBIDDEN |
| `disableRepository` -- clears assignment | Verify projectId and indexBranch are null after disable |
| `listRepositories` -- includes new fields | Response has projectId, indexBranch, projectName |
| `listProjectsForAssignment` -- lists projects | Returns id, name, hasRepo, repoName |
| `listProjectsForAssignment` -- marks assigned | `hasRepo: true` for projects with repos |
| `reindexRepository` -- uses indexBranch | Workflow started with correct branch |
| `reindexRepository` -- falls back to defaultBranch | When indexBranch is null |

### 4.2 Webhook Tests

| Test Case | Description |
|-----------|-------------|
| Push to tracked branch (indexBranch set) | Processes normally |
| Push to non-tracked branch | Skips with NON_DEFAULT_BRANCH |
| Push when indexBranch is null | Uses defaultBranch for comparison |
| Push to repo without projectId | Skips with REPO_NOT_REGISTERED |

---

## 5. Execution Order

| Step | Action | Files | Depends On |
|------|--------|-------|------------|
| 1 | Database: Add indexBranch + run migration | `packages/db/prisma/schema/github.prisma` | - |
| 2 | Schemas: Add new Zod schemas | `packages/api/src/schemas/github.ts` | Step 1 |
| 3 | Tests: Write unit tests | `packages/api/src/routers/__tests__/github-assignment.test.ts` | Step 2 |
| 4 | API: Implement assignToProject, unassignFromProject, listProjectsForAssignment | `packages/api/src/routers/github.ts` | Step 2 |
| 5 | API: Modify disableRepository, listRepositories, reindexRepository | `packages/api/src/routers/github.ts` | Step 4 |
| 6 | API: Remove enableRepository | `packages/api/src/routers/github.ts` | Step 5 |
| 7 | Webhook: Move branch check, use indexBranch | `apps/web/src/app/api/webhooks/github/route.ts` | Step 1 |
| 8 | Toast: Add success/error messages | `apps/web/src/lib/success.ts`, `errors.ts` | - |
| 9 | Frontend: Update types.ts | `apps/web/src/components/github/types.ts` | Step 5 |
| 10 | Frontend: Create assign-repo-dialog.tsx | `apps/web/src/components/github/assign-repo-dialog.tsx` | Step 9 |
| 11 | Frontend: Update repository-row.tsx | `apps/web/src/components/github/repository-row.tsx` | Step 10 |
| 12 | Frontend: Update repository-list.tsx | `apps/web/src/components/github/repository-list.tsx` | Step 11 |
| 13 | Manual test: Full flow | - | All |

---

## 6. Acceptance Criteria

- [ ] User can assign a GitHub repository to a project via dialog
- [ ] User can select which branch to index (defaults to default branch)
- [ ] Assigned repos have `projectId` set in the database
- [ ] Push webhooks to the tracked branch trigger incremental indexing
- [ ] Push webhooks to non-tracked branches are skipped
- [ ] RCA `correlateCodeChanges` finds the linked repository
- [ ] User can unassign a repo (clears projectId, disables, deletes chunks)
- [ ] User can reassign a repo to a different project
- [ ] Disabling a repo also clears projectId and indexBranch
- [ ] Repository list shows assigned project name and branch
- [ ] Projects already assigned are disabled in the project selector
- [ ] All unit tests pass

---

## 7. Out of Scope

| Feature | Why Deferred |
|---------|-------------|
| Multi-project repo assignment (1:N) | Schema is 1:1 via `@unique`; sufficient for now |
| GitHub branch listing API | User types branch name; avoids GitHub API complexity |
| Auto-assign on install | Requires knowing which project; needs user decision |
| Branch validation (check exists on GitHub) | Invalid branch fails gracefully during index |
| Batch assign multiple repos | One-by-one is sufficient |
