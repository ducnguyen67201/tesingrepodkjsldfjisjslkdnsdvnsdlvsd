# Admin Workspace Switcher - Engineering Specification

## Overview

A workspace switcher inside the General settings page that is **only visible to system admins**. Allows admins to view and manage **any** workspace without needing membership, with a searchable dropdown for quick navigation.

## Problem Statement

System administrators need to manage settings across multiple workspaces efficiently. Previously, admins had to be a member of every workspace and navigate back to the dashboard to switch. This created friction for admin workflows.

## Solution

A searchable combobox component inside the "Workspace Information" card on the General settings page that:
1. Only renders for users with `isSystemAdmin = true`
2. Lists **all** workspaces (not just ones the admin belongs to)
3. Provides search/filter for quick lookup
4. Allows one-click navigation to another workspace's settings

System admins also bypass workspace membership checks across the entire application — both the server-side layout gate and all tRPC workspace middleware.

---

## Technical Design

### Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         DATA FLOW                                   │
└─────────────────────────────────────────────────────────────────────┘

  ┌──────────────────┐     ┌──────────────────────────┐     ┌──────────────────┐
  │   General        │     │  useAdminWorkspace       │     │  tRPC Backend    │
  │   Settings Page  │────▶│  Switcher Hook           │────▶│  checkSystemAdmin│
  │                  │     │                          │     │  listWithDetails │
  └──────────────────┘     └──────────────────────────┘     └──────────────────┘
           │                          │                              │
           ▼                          ▼                              ▼
  ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────────────┐
  │   Admin          │     │  useSystemAdmin  │     │   PostgreSQL             │
  │   Workspace      │◀────│  Hook            │◀────│   User.isSystemAdmin     │
  │   Switcher       │     │                  │     │   Workspace (all)        │
  └──────────────────┘     └──────────────────┘     └──────────────────────────┘
```

### Security Model

| Layer | Protection | Description |
|-------|------------|-------------|
| Frontend | Conditional render | Component returns `null` if not admin |
| API | `protectedProcedure` | Requires authenticated session |
| Database | `isSystemAdmin` check | Only returns `true` for admins |
| Workspace layout | System admin bypass | Admins can access any workspace without membership |
| tRPC middleware | System admin bypass | `requireWorkspaceAccess` grants access to admins for any workspace |

**System admin access flow:**
1. `requireWorkspaceAccess` first checks session workspace memberships
2. If no membership found, queries DB for `isSystemAdmin`
3. If admin, resolves workspace directly and grants `ADMIN` role
4. If not admin, throws `FORBIDDEN`

---

## Implementation Details

### Key Files

| File | Purpose |
|------|---------|
| `packages/api/src/middleware/workspace.ts` | Workspace access checks with system admin bypass |
| `packages/api/src/routers/workspaces.ts` | `checkSystemAdmin` + `listWithDetails` (all workspaces for admins) |
| `apps/web/src/hooks/use-system-admin.ts` | Hook to check if current user is system admin |
| `apps/web/src/hooks/use-admin-workspace-switcher.ts` | Hook with workspace fetching and navigation logic |
| `apps/web/src/components/settings/admin-workspace-switcher.tsx` | Searchable combobox UI component |
| `apps/web/src/app/workspace/[workspaceSlug]/settings/page.tsx` | General settings page (hosts the switcher) |
| `apps/web/src/app/workspace/[workspaceSlug]/layout.tsx` | Workspace layout with system admin bypass |

---

### Backend: Workspace Middleware (System Admin Bypass)

**File:** `packages/api/src/middleware/workspace.ts`

`requireWorkspaceAccess` is async and checks `isSystemAdmin` when no membership is found:

```typescript
export async function requireWorkspaceAccess(
  ctx: Context & { session: SessionWithWorkspaces },
  workspaceIdOrSlug: string,
  bySlug = false
): Promise<WorkspaceAccess> {
  // 1. Check session memberships first (fast path)
  const access = bySlug
    ? hasWorkspaceAccessBySlug(workspaces, workspaceIdOrSlug)
    : hasWorkspaceAccess(workspaces, workspaceIdOrSlug);

  if (access) return access;

  // 2. No membership — check if system admin (DB query)
  const user = await prisma.user.findUnique({
    where: { id: ctx.session.user.id },
    select: { isSystemAdmin: true },
  });

  if (user?.isSystemAdmin) {
    // Resolve workspace and return synthetic ADMIN access
    const workspace = await prisma.workspace.findUnique({ ... });
    if (workspace) {
      return { id: workspace.id, slug: workspace.slug, role: "ADMIN", isPersonal: workspace.isPersonal };
    }
  }

  throw new TRPCError({ code: "FORBIDDEN" });
}
```

This applies globally to all procedures using `workspaceMiddleware` or `workspaceAdminMiddleware`.

---

### Backend: listWithDetails (All Workspaces for Admins)

**File:** `packages/api/src/routers/workspaces.ts`

```typescript
listWithDetails: protectedProcedure.query(async ({ ctx }) => {
  // Check if system admin
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isSystemAdmin: true },
  });
  const isAdmin = user?.isSystemAdmin ?? false;

  // Admins see ALL workspaces; regular users see only their own
  const workspaces = await prisma.workspace.findMany({
    where: isAdmin ? undefined : { members: { some: { userId: session.user.id } } },
    // ...
  });
});
```

---

### Frontend: Hook Architecture

**`useSystemAdmin`** (`hooks/use-system-admin.ts`)
- Calls `workspaces.checkSystemAdmin` tRPC query
- Cached for 5 minutes, no refetch on window focus
- Returns `{ isSystemAdmin, isLoading, error }`

**`useAdminWorkspaceSwitcher`** (`hooks/use-admin-workspace-switcher.ts`)
- Composes `useSystemAdmin` with workspace list fetching
- Handles current workspace resolution from URL params
- Provides `selectWorkspace(slug)` for navigation
- Returns `{ isSystemAdmin, isLoading, currentSlug, currentWorkspace, workspaces, selectWorkspace }`

---

### Frontend: Component

**`AdminWorkspaceSwitcher`** (`components/settings/admin-workspace-switcher.tsx`)
- Consumes `useAdminWorkspaceSwitcher` hook (no data logic)
- Uses `Popover` + `Command` (cmdk) for searchable combobox
- Shows "Admin workspace view" label next to the trigger button
- Shield icon with yellow color as admin indicator
- Renders inside "Workspace Information" card on General settings page

---

### Workspace Layout: Admin Bypass

**File:** `apps/web/src/app/workspace/[workspaceSlug]/layout.tsx`

```typescript
// Check if user is a system admin
const user = await prisma.user.findUnique({
  where: { id: session.user.id },
  select: { isSystemAdmin: true },
});
const isAdmin = user?.isSystemAdmin ?? false;

// System admins can access any workspace, even without membership
if (!membership && !isAdmin) {
  notFound();
}
```

---

## Database Requirements

**Existing field used:** `User.isSystemAdmin` (boolean, default false)

No database migrations required. The `isSystemAdmin` field already exists in the User model.

---

## Testing Plan

### Manual Testing Checklist

1. **Enable admin for test user:**
   ```sql
   UPDATE "User" SET "isSystemAdmin" = true WHERE email = 'test@example.com';
   ```

2. **Admin user tests:**
   - [ ] Navigate to `/workspace/{slug}/settings`
   - [ ] Verify switcher appears inside "Workspace Information" card
   - [ ] Verify "Admin workspace view" label is visible
   - [ ] Verify Shield icon is yellow
   - [ ] Click dropdown — **all** workspaces listed (not just member workspaces)
   - [ ] Type in search — filters workspaces by name
   - [ ] Current workspace has checkmark
   - [ ] Click different workspace — navigates to its settings
   - [ ] Navigate to a workspace admin is NOT a member of — page loads without errors
   - [ ] tRPC queries (graphs, overview, etc.) work on non-member workspaces

3. **Non-admin user tests:**
   - [ ] Navigate to `/workspace/{slug}/settings`
   - [ ] Verify switcher does NOT appear
   - [ ] No visual flash or loading state visible
   - [ ] Navigating to a non-member workspace returns 404

4. **Edge cases:**
   - [ ] User with only one workspace — switcher still works
   - [ ] Long workspace names — truncated properly
   - [ ] Rapid clicking between workspaces — no race conditions
   - [ ] Search with no results — shows "No workspace found."

### Automated Tests

Tests in `packages/api/src/routers/__tests__/workspaces-system-admin.test.ts`:
- Returns `true` for system admin
- Returns `false` for regular user
- Requires authentication

---

## Performance Considerations

| Aspect | Mitigation |
|--------|------------|
| Admin check API call | Cached for 5 minutes |
| Workspace list fetch | Conditional — only if admin |
| Component render | Returns `null` early for non-admins |
| Middleware DB query | Only triggered when no session membership found |

---

## Rollback Plan

If issues arise, the feature can be disabled by:

1. **Quick fix:** Return `null` from `AdminWorkspaceSwitcher` component
2. **Middleware rollback:** Revert `requireWorkspaceAccess` to synchronous membership-only check
3. **Full rollback:** Revert all changed files to previous state

No database changes required for rollback.
