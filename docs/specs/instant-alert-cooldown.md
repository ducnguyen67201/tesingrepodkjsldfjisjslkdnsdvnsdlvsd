# Implementation Plan: Instant Alert Cooldown (No Cooldown / 0-min)

## Problem

Currently the minimum cooldown is **1 minute** (Zod `.min(1)`, form `min={1}`). The fastest severity (CRITICAL P1) has a 5-minute cooldown default. For demos and time-sensitive production alerts, users want to **alert immediately every time** the condition is caught, with no cooldown between notifications.

## Solution

Allow `cooldownMins = 0` to mean **"no cooldown — alert on every evaluation cycle."**

With CRITICAL severity (10s eval interval) + `cooldownMins=0` + `pendingMins=0`, an alert fires within **~10-20 seconds** of the condition being detected, and re-fires every 10 seconds while the condition persists.

## How It Works Today

```
Condition detected → INACTIVE → PENDING (wait pendingMins) → FIRING (notify)
                                                              ↓
                                          FIRING (wait cooldownMs before re-notifying)
```

**Cooldown enforcement** (`packages/api/src/routers/internal.ts:280-284`):
```typescript
case "FIRING": {
  const lastNotifyAge = alert.lastTriggeredAt
    ? now.getTime() - alert.lastTriggeredAt.getTime()
    : Infinity;
  shouldNotify = lastNotifyAge >= cooldownMs;  // ← cooldownMs=0 → always true
  break;
}
```

Setting `cooldownMins=0` makes `cooldownMs=0`, so `lastNotifyAge >= 0` is **always true**. The existing logic already handles this correctly — no state machine changes needed.

## Changes Required

### 1. Schema — `packages/api/src/schemas/alerting.ts`

**Change `SEVERITY_DEFAULTS` for CRITICAL** (optional — only if we want P1 default to be 0):

No change to defaults needed. The change is just allowing 0 as a valid override value. Defaults stay as-is (CRITICAL=5min etc.).

### 2. Zod Validation — `packages/api/src/routers/alerts.ts`

**Lines 47, 59**: Change `cooldownMins` min from `1` to `0`.

```diff
// CreateAlertSchema (line 47)
- cooldownMins: z.number().int().min(1).max(1440).optional(),
+ cooldownMins: z.number().int().min(0).max(1440).optional(),

// UpdateAlertSchema (line 59)
- cooldownMins: z.number().int().min(1).max(1440).optional(),
+ cooldownMins: z.number().int().min(0).max(1440).optional(),
```

### 3. Frontend Form Validation — `apps/web/src/components/alerts/create-alert-dialog.tsx`

**Line 138**: Change client-side validation from `< 1` to `< 0`.

```diff
- if (cooldownMins !== undefined && (isNaN(cooldownMins) || cooldownMins < 1 || cooldownMins > 1440)) {
-   form.setError("cooldownMins", { message: "Must be 1-1440" });
+ if (cooldownMins !== undefined && (isNaN(cooldownMins) || cooldownMins < 0 || cooldownMins > 1440)) {
+   form.setError("cooldownMins", { message: "Must be 0-1440" });
```

### 4. Frontend Form Input — `apps/web/src/components/alerts/create-alert-dialog.tsx`

**Line 380**: Change `min` attribute on the cooldown input.

```diff
  <Input
    type="number"
-   min={1}
+   min={0}
    max={1440}
    placeholder="Use severity default"
```

### 5. Severity Selector Display — `apps/web/src/components/alerts/severity-selector.tsx`

**Line 73**: Format the cooldown display to handle 0.

```diff
  <span className="text-xs text-muted-foreground">
-   ({option.defaults.cooldownMins}min cooldown)
+   ({option.defaults.cooldownMins === 0
+     ? "no cooldown"
+     : `${option.defaults.cooldownMins}min cooldown`})
  </span>
```

**Lines 87**: Same for the expanded defaults view.

```diff
  <p>
-   Cooldown: {selectedDefaults.cooldownMins} min between notifications
+   Cooldown: {selectedDefaults.cooldownMins === 0
+     ? "None (alert every eval cycle)"
+     : `${selectedDefaults.cooldownMins} min between notifications`}
  </p>
```

### 6. Dry Run Display — `packages/api/src/routers/alerts.ts`

**Line 741**: The dry run endpoint already handles `cooldownMs = 0` correctly (remaining would be 0). No change needed.

## Files Changed (5 files)

| # | File | Change |
|---|------|--------|
| 1 | `packages/api/src/routers/alerts.ts:47,59` | Zod min: `1` → `0` for `cooldownMins` |
| 2 | `apps/web/src/components/alerts/create-alert-dialog.tsx:138` | Client validation: `< 1` → `< 0` |
| 3 | `apps/web/src/components/alerts/create-alert-dialog.tsx:380` | Input `min={0}` |
| 4 | `apps/web/src/components/alerts/severity-selector.tsx:73,87` | Display "no cooldown" when value is 0 |
| 5 | `packages/api/src/routers/internal.ts` | **No change** — already handles cooldownMs=0 correctly |

## What Does NOT Change

- **Prisma schema** — `cooldownMins Int @default(60)` already accepts 0. No migration needed.
- **State machine logic** — `lastNotifyAge >= 0` is always true, so `shouldNotify=true` every eval cycle. Works as-is.
- **Severity defaults** — Keep CRITICAL=5min, HIGH=30min etc. Users override to 0 via Advanced Settings.
- **`pendingMins`** — Already allows 0. Users can set `pendingMins=0` + `cooldownMins=0` for fastest possible alerting.

## Demo Usage

To create an "instant alert" for the demo:

1. Create Alert → Severity: **Critical (P1)**
2. Open **Advanced Settings**
3. Set **Pending Duration**: `0` (fire immediately, no waiting)
4. Set **Cooldown**: `0` (re-alert every eval cycle)
5. Result: Alert fires within **~10 seconds** of condition detection, re-fires every 10 seconds

## Verification

1. Create an alert with `cooldownMins=0`, `pendingMins=0`, severity=CRITICAL
2. Trigger the condition (e.g., send error traces via demo app)
3. Verify alert transitions: INACTIVE → PENDING → FIRING within ~20 seconds
4. Verify notification fires immediately on FIRING transition
5. Verify re-notification fires every ~10 seconds while condition persists
6. Verify existing alerts with `cooldownMins >= 1` still work normally
