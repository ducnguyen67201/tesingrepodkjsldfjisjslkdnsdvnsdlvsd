# Alert System + RCA Integration Improvements

**Date:** December 21, 2025
**Author:** Development Session
**Status:** Completed

---

## Overview

This document covers the integration work done to connect the Alert system with Root Cause Analysis (RCA) and improve the notification experience. The changes enable users to quickly access RCA reports directly from Discord notifications when alerts fire.

---

## Changes Summary

| Area | Change | Files Modified |
|------|--------|----------------|
| Discord Notifications | Added RCA button alongside Dashboard link | `discord.ts`, `alerting.ts`, `internal.ts` |
| RCA URL Handling | Created lookup page for `?historyId` param | New: `rca/page.tsx` |
| Trace Viewing | Panel opens on RCA page instead of navigating away | `rca-detail-page.tsx`, `rca-traces-card.tsx` |
| Alert Workflow | Auto-trigger RCA when alert fires | `alert.workflow.ts` |
| Bug Fixes | Fixed metrics query, URL patterns | `metrics-service.ts`, `internal.ts` |

---

## Detailed Changes

### 1. Discord Notification - RCA Button

**Problem:** When alerts fired, Discord notifications only had a Dashboard link. Users had to manually navigate to find the RCA.

**Solution:** Added an RCA button that links directly to the RCA analysis page.

**Files Modified:**

#### `packages/api/src/schemas/alerting.ts`
- Added `rcaUrl` optional field to `AlertPayloadSchema`
```typescript
/** URL to RCA page - populated when RCA is triggered */
rcaUrl: z.string().url().optional(),
```

#### `packages/api/src/routers/internal.ts`
- Added `buildRcaUrl()` helper function (lines 192-203)
- Refactored `dispatchNotification` to:
  - Create `alertHistory` FIRST to get the ID for RCA URL
  - Include `rcaUrl` in the notification payload
  - Update `alertHistory` with `notifiedVia` after sending

```typescript
function buildRcaUrl(
  workspaceSlug: string,
  projectId: string,
  alertId: string,
  alertHistoryId: string
): string {
  return `${getAppBaseUrl()}/workspace/${workspaceSlug}/projects/${projectId}/alerts/${alertId}/rca?historyId=${alertHistoryId}`;
}
```

#### `packages/api/src/lib/alerting/adapters/discord.ts`
- Added `buildActionLinks()` method to create both Dashboard and RCA buttons
- Discord notification now shows:
```
🔗 Quick Actions
📈 Dashboard  •  🔍 View RCA
```

---

### 2. RCA Lookup Page

**Problem:** The RCA URL pattern `/alerts/{alertId}/rca?historyId={id}` returned 404 because the existing RCA page required `[rcaId]` in the path, which isn't known at notification time.

**Solution:** Created a new page that handles the `historyId` query param.

**File Created:** `apps/web/src/app/workspace/[workspaceSlug]/projects/[projectId]/alerts/[alertId]/rca/page.tsx`

**Behavior:**
1. Reads `historyId` from URL query params
2. Calls `getRCAStatus` tRPC procedure to check status
3. If RCA not started → auto-triggers RCA workflow
4. If running → shows "Analyzing Root Cause..." with progress animation
5. If completed → redirects to `/rca/{rcaId}` detail page
6. If failed → shows error with retry button

**Key Features:**
- Auto-polling every 3 seconds while RCA is running
- Animated progress indicator
- Graceful error handling with retry option

---

### 3. Trace Detail Panel on RCA Page

**Problem:** Clicking "View" on affected traces in the RCA page navigated to a non-existent `/traces/{id}` route (404).

**Solution:** Open the trace detail panel directly on the RCA page using URL params.

**Files Modified:**

#### `apps/web/src/components/rca/rca-detail-page.tsx`
- Added URL search params handling for `?trace={traceId}`
- Added `handleTraceSelect` and `handleCloseTracePanel` callbacks
- Integrated `TraceDetailPanel` component

```typescript
const selectedTraceId = searchParams.get("trace");

const handleTraceSelect = useCallback((traceId: string) => {
  const params = new URLSearchParams(searchParams.toString());
  params.set("trace", traceId);
  router.push(`${pathname}?${params.toString()}`, { scroll: false });
}, [searchParams, pathname, router]);
```

#### `apps/web/src/components/rca/rca-traces-card.tsx`
- Changed from `Link` navigation to `onTraceSelect` callback
- Removed `workspaceSlug` and `projectId` props (no longer needed)
- Changed icon from `ExternalLink` to `Eye` (opens in-page)

**New Props:**
```typescript
interface RCATracesCardProps {
  traces: Trace[];
  onTraceSelect: (traceId: string) => void; // Changed from Link
}
```

---

### 4. Alert Workflow - Auto-trigger RCA

**Problem:** RCA had to be manually triggered after alerts fired.

**Solution:** Automatically start RCA workflow as a child workflow when alert transitions to FIRING state.

**File Modified:** `apps/worker/src/workflows/alert.workflow.ts`

**Changes:**
- Added imports for `startChild` and `rcaAnalysisWorkflow`
- In `evaluateAlertCycle()`, after successful notification dispatch:
  - Check if state is FIRING and we have required data
  - Start RCA as child workflow with `parentClosePolicy: "ABANDON"`
  - Use workflow ID pattern: `rca-{alertHistoryId}`

```typescript
if (
  dispatchResult.success &&
  transition.newState === "FIRING" &&
  dispatchResult.alertHistoryId &&
  dispatchResult.projectId
) {
  await startChild(rcaAnalysisWorkflow, {
    workflowId: `rca-${dispatchResult.alertHistoryId}`,
    args: [rcaInput],
    parentClosePolicy: "ABANDON", // Let RCA complete even if parent restarts
  });
}
```

---

### 5. Bug Fixes

#### Fixed: Alert not catching errors
**File:** `packages/api/src/lib/alerting/metrics-service.ts`

**Problem:** Error rate calculation queried non-existent `level` field instead of `statusCode`.

**Before:**
```sql
COUNT(*) FILTER (WHERE s."level" = 'ERROR') as errors
```

**After:**
```sql
COUNT(*) FILTER (WHERE s."statusCode" = 'ERROR') as errors
```

#### Fixed: Discord link showing `undefined`
**File:** `packages/api/src/routers/internal.ts`

**Problem:** `NEXT_PUBLIC_APP_URL` not available in API context.

**Solution:** Added `getAppBaseUrl()` helper with fallback chain:
```typescript
function getAppBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "http://localhost:3000"
  );
}
```

#### Fixed: 404 on dashboard link
**File:** `packages/api/src/routers/internal.ts`

**Problem:** URL pattern was `/{workspace}/{projectId}/dashboard` but Next.js routes use `/workspace/{workspace}/projects/{projectId}`.

**Solution:** Updated `buildDashboardUrl()` to correct pattern.

---

## Flow Diagram

```
Alert Fires (FIRING state)
        │
        ▼
┌───────────────────────┐
│ dispatchNotification  │
│ - Create AlertHistory │
│ - Build rcaUrl        │
│ - Send to channels    │
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐      ┌─────────────────────┐
│   Discord Message     │      │  Start RCA Workflow │
│ ┌───────────────────┐ │      │  (child, fire&forget)│
│ │ 🚨 Alert: Error   │ │      └──────────┬──────────┘
│ │                   │ │                 │
│ │ 🔗 Quick Actions  │ │                 ▼
│ │ Dashboard • RCA   │ │      ┌─────────────────────┐
│ └───────────────────┘ │      │ RCA Analysis runs   │
└───────────────────────┘      │ - Query traces      │
            │                  │ - Correlate changes │
   User clicks "View RCA"      │ - LLM analysis      │
            │                  │ - Store results     │
            ▼                  └─────────────────────┘
┌───────────────────────┐
│ RCA Lookup Page       │
│ /alerts/{id}/rca?     │
│   historyId={id}      │
│                       │
│ - Check RCA status    │
│ - Show progress/wait  │
│ - Redirect when ready │
└───────────────────────┘
            │
            ▼
┌───────────────────────┐
│ RCA Detail Page       │
│ /alerts/{id}/rca/{id} │
│                       │
│ - Hypothesis          │
│ - Evidence            │
│ - Related Changes     │
│ - Affected Traces ◄───┼──► Trace Panel (in-page)
│ - Remediation         │
└───────────────────────┘
```

---

## Testing Notes

### Prerequisites
- `OPENAI_API_KEY` must be set in `.env` for full LLM analysis
- Without it, RCA falls back to template-based analysis (30% confidence)

### Test Scenarios
1. **Alert fires** → Check Discord has both Dashboard and RCA links
2. **Click RCA link** → Should show "Analyzing..." then redirect to RCA page
3. **View trace** → Panel should open on RCA page, not navigate away
4. **RCA auto-trigger** → Check Temporal UI for `rca-{historyId}` workflows

---

## Known Issues / Future Work

1. **RCA URL in initial notification** - Points to lookup page since actual RCA ID isn't known yet. Once RCA completes, the lookup page redirects automatically.

2. **Temporal nondeterminism** - If alert workflows are running when code changes, they need to be terminated and restarted. Consider using `patched()` API for backwards-compatible changes.

3. **LLM fallback** - When `OPENAI_API_KEY` is not set, RCA uses template-based analysis with limited insights.

---

## Related Files Summary

```
packages/api/src/
├── schemas/alerting.ts          # AlertPayloadSchema + rcaUrl field
├── routers/internal.ts          # dispatchNotification, buildRcaUrl
└── lib/alerting/
    ├── adapters/discord.ts      # Discord embed with action links
    └── metrics-service.ts       # Fixed statusCode query

apps/worker/src/
├── workflows/alert.workflow.ts  # Auto-trigger RCA child workflow
└── temporal/activities/
    └── alert.activities.ts      # DispatchNotificationResult type

apps/web/src/
├── app/.../alerts/[alertId]/rca/
│   └── page.tsx                 # NEW: RCA lookup page
└── components/rca/
    ├── rca-detail-page.tsx      # Added TraceDetailPanel
    └── rca-traces-card.tsx      # Changed to onTraceSelect callback
```

---

## Revision History

| Date | Changes |
|------|---------|
| 2025-12-21 | Initial implementation of Alert + RCA integration |
