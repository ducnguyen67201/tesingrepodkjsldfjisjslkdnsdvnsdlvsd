# Admin Workspace Switcher - Engineering Specification

## Overview

Add a workspace switcher dropdown in the workspace settings page that is **only visible to system admins**. This allows admins to quickly switch between workspaces they manage while configuring settings.

## Problem Statement

System administrators need to manage settings across multiple workspaces efficiently. Currently, they must navigate back to the dashboard, select a different workspace, then navigate to settings again. This creates friction for admin workflows.

## Solution

A dropdown component in the settings page header that:
1. Only renders for users with `isSystemAdmin = true`
2. Lists all workspaces the user belongs to
3. Allows one-click navigation to another workspace's settings

---

## Technical Design

### Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         DATA FLOW                                   │
└─────────────────────────────────────────────────────────────────────┘

  ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
  │   Settings       │     │  useSystemAdmin  │     │  tRPC Backend    │
  │   Layout         │────▶│  Hook            │────▶│  checkSystemAdmin│
  │                  │     │                  │     │                  │
  └──────────────────┘     └──────────────────┘     └──────────────────┘
           │                        │                        │
           │                        │                        │
           ▼                        ▼                        ▼
  ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
  │   Admin          │     │  listWithDetails │     │   PostgreSQL     │
  │   Workspace      │◀────│  (if admin)      │◀────│   User.isSystem  │
  │   Switcher       │     │                  │     │   Admin          │
  └──────────────────┘     └──────────────────┘     └──────────────────┘
```

### Security Model

| Layer | Protection | Description |
|-------|------------|-------------|
| Frontend | Conditional render | Component returns `null` if not admin |
| API | `protectedProcedure` | Requires authenticated session |
| Database | `isSystemAdmin` check | Only returns `true` for admins |
| Navigation | Workspace middleware | Still enforces membership on target workspace |

**Important:** The frontend check is cosmetic. System admins can only switch to workspaces they are members of - the workspace middleware enforces this on every page load.

---

## Implementation Details

### Phase 1: Backend - Add System Admin Check Procedure

**File:** `packages/api/src/routers/workspaces.ts`

**Location:** After `checkApproval` procedure (approximately line 67)

**Procedure Definition:**

```typescript
/**
 * Check if the current user is a system admin.
 * Used to conditionally show admin-only features like workspace switcher.
 */
checkSystemAdmin: protectedProcedure.query(async ({ ctx }): Promise<{ isSystemAdmin: boolean }> => {
  const session = ctx.session as SessionWithWorkspaces;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isSystemAdmin: true },
  });

  return { isSystemAdmin: user?.isSystemAdmin ?? false };
}),
```

**Rationale:**
- Returns simple boolean object for easy consumption
- Follows existing `checkApproval` pattern in same file
- Uses `protectedProcedure` to ensure authenticated users only
- Minimal database query (single field select)

---

### Phase 2: Frontend Hook - useSystemAdmin

**File:** `apps/web/src/hooks/use-system-admin.ts`

```typescript
"use client";

import { trpc } from "@/lib/trpc/client";

/**
 * Hook to check if the current user is a system admin.
 * Results are cached for 5 minutes to minimize API calls.
 */
export function useSystemAdmin() {
  const { data, isLoading, error } = trpc.workspaces.checkSystemAdmin.useQuery(
    undefined,
    {
      staleTime: 5 * 60 * 1000, // Cache for 5 minutes
      refetchOnWindowFocus: false,
    }
  );

  return {
    isSystemAdmin: data?.isSystemAdmin ?? false,
    isLoading,
    error: error as Error | null,
  };
}
```

**Rationale:**
- Encapsulates admin check logic for reuse
- Aggressive caching (5 min) since admin status rarely changes
- Defaults to `false` during loading (safe default)
- `refetchOnWindowFocus: false` prevents unnecessary calls

---

### Phase 3: Frontend Component - AdminWorkspaceSwitcher

**File:** `apps/web/src/components/settings/admin-workspace-switcher.tsx`

**Component Structure:**

```typescript
"use client";

import { useParams, useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Building2, User, Shield } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { trpc } from "@/lib/trpc/client";
import { useSystemAdmin } from "@/hooks/use-system-admin";

export function AdminWorkspaceSwitcher() {
  const params = useParams();
  const router = useRouter();
  const currentSlug = params.workspaceSlug as string;

  // Check if user is system admin
  const { isSystemAdmin, isLoading: isAdminLoading } = useSystemAdmin();

  // Only fetch workspaces if user is admin (conditional query)
  const { data: workspaces, isLoading: isWorkspacesLoading } =
    trpc.workspaces.listWithDetails.useQuery(undefined, {
      enabled: isSystemAdmin, // Only fetch if admin
      staleTime: 5 * 60 * 1000,
    });

  // Return null if not admin or still loading admin status
  if (isAdminLoading || !isSystemAdmin) {
    return null;
  }

  const currentWorkspace = workspaces?.find((w) => w.slug === currentSlug);
  const isLoading = isWorkspacesLoading;

  const handleWorkspaceSelect = (slug: string) => {
    if (slug !== currentSlug) {
      router.push(`/workspace/${slug}/settings`);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={isLoading}
        >
          <Shield className="h-4 w-4 text-yellow-600" />
          {isLoading ? (
            "Loading..."
          ) : currentWorkspace ? (
            <>
              <span className="max-w-[150px] truncate">
                {currentWorkspace.name}
              </span>
              <ChevronsUpDown className="h-4 w-4 opacity-50" />
            </>
          ) : (
            "Select workspace"
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[220px]">
        <DropdownMenuLabel className="flex items-center gap-2 text-xs text-muted-foreground">
          <Shield className="h-3 w-3" />
          Admin: Switch Workspace
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {workspaces?.map((workspace) => {
          const isCurrentWorkspace = workspace.slug === currentSlug;
          const Icon = workspace.isPersonal ? User : Building2;

          return (
            <DropdownMenuItem
              key={workspace.id}
              onClick={() => handleWorkspaceSelect(workspace.slug)}
              className="flex items-center justify-between gap-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{workspace.name}</span>
              </div>
              {isCurrentWorkspace && (
                <Check className="h-4 w-4 shrink-0 text-primary" />
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

**Key Design Decisions:**

| Decision | Rationale |
|----------|-----------|
| `enabled: isSystemAdmin` | Prevents API call if not admin |
| Shield icon with yellow color | Visual indicator this is admin feature |
| Returns `null` during loading | No UI flash for non-admins |
| Same workspace item pattern | Consistent with existing `workspace-switcher.tsx` |
| Truncation on names | Handles long workspace names gracefully |

---

### Phase 4: Integration - Settings Layout

**File:** `apps/web/src/app/workspace/[workspaceSlug]/settings/layout.tsx`

**Changes Required:**

1. Add import at top of file:
```typescript
import { AdminWorkspaceSwitcher } from "@/components/settings/admin-workspace-switcher";
```

2. Wrap existing content and add switcher:
```typescript
return (
  <div className="space-y-6">
    {/* Admin Workspace Switcher - Only shows for system admins */}
    <div className="flex justify-end">
      <AdminWorkspaceSwitcher />
    </div>

    <div className="flex gap-6">
      {/* Existing sidebar */}
      <aside className="w-48 shrink-0">
        <SettingsSidebar />
      </aside>

      {/* Existing main content */}
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  </div>
);
```

---

## File Summary

| File | Action | Lines Changed |
|------|--------|---------------|
| `packages/api/src/routers/workspaces.ts` | Modify | +15 |
| `apps/web/src/hooks/use-system-admin.ts` | Create | ~25 |
| `apps/web/src/components/settings/admin-workspace-switcher.tsx` | Create | ~100 |
| `apps/web/src/app/workspace/[workspaceSlug]/settings/layout.tsx` | Modify | +10 |

**Total estimated changes:** ~150 lines

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
   - [ ] Verify switcher appears in top-right corner
   - [ ] Verify Shield icon is yellow
   - [ ] Click dropdown - all user's workspaces listed
   - [ ] Current workspace has checkmark
   - [ ] Click different workspace - navigates to its settings
   - [ ] Personal workspace shows User icon
   - [ ] Team workspace shows Building2 icon

3. **Non-admin user tests:**
   - [ ] Navigate to `/workspace/{slug}/settings`
   - [ ] Verify switcher does NOT appear
   - [ ] No visual flash or loading state visible

4. **Edge cases:**
   - [ ] User with only one workspace - switcher still works
   - [ ] Long workspace names - truncated properly
   - [ ] Rapid clicking between workspaces - no race conditions

### Automated Tests (Future)

```typescript
// packages/api/src/routers/__tests__/workspaces.test.ts

describe("checkSystemAdmin", () => {
  it("returns true for system admin", async () => {
    // Setup admin user
    const result = await caller.workspaces.checkSystemAdmin();
    expect(result.isSystemAdmin).toBe(true);
  });

  it("returns false for regular user", async () => {
    // Setup regular user
    const result = await caller.workspaces.checkSystemAdmin();
    expect(result.isSystemAdmin).toBe(false);
  });
});
```

---

## Performance Considerations

| Aspect | Mitigation |
|--------|------------|
| Extra API call for admin check | Cached for 5 minutes |
| Workspace list fetch | Conditional - only if admin |
| Component render | Returns `null` early for non-admins |

**Expected impact:** Negligible. One additional small query for authenticated users, cached aggressively.

---

## Future Enhancements

1. **Show all workspaces for super-admins** - Currently only shows workspaces user belongs to
2. **Quick actions per workspace** - Could add sub-menus for common actions
3. **Search/filter** - For users with many workspaces
4. **Keyboard navigation** - Ctrl+K style workspace search

---

## Rollback Plan

If issues arise, the feature can be disabled by:

1. **Quick fix:** Return `null` from `AdminWorkspaceSwitcher` component
2. **Full rollback:** Revert all 4 files to previous state

No database changes required for rollback.

---

## Approval Checklist

- [ ] Security review - admin check pattern approved
- [ ] UX review - placement and interaction approved
- [ ] Code review - follows project patterns
- [ ] Testing - manual tests passed
- [ ] Documentation - spec complete

---

## References

- **Similar patterns:** `apps/web/src/components/workspace-switcher.tsx` (workspace rendering)
- **Auth pattern:** `packages/api/src/routers/workspaces.ts:checkApproval` (DB query pattern)
- **Protected procedure:** `packages/api/src/trpc.ts` (authentication)
