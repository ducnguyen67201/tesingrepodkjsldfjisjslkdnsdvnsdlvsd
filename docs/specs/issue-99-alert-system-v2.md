# Engineering Specification: Alert System v2

**Issue:** #99 - Configure Alert Cooldown Periods & Threshold Presets
**Status:** Implemented (Testing)
**Last Updated:** 2025-12-07

---

## Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [Solution Overview](#2-solution-overview)
3. [Architecture](#3-architecture)
4. [Database Schema](#4-database-schema)
5. [Interfaces & Implementations](#5-interfaces--implementations)
6. [API Endpoints](#6-api-endpoints)
7. [UI Design](#7-ui-design)
8. [Implementation Plan](#8-implementation-plan)

---

## 1. Problem Statement

### The Core Problems We're Solving

```
PROBLEM 1: ALERT FATIGUE (Too Many Notifications)
═══════════════════════════════════════════════════

  Current behavior:

    Error rate spikes to 6% for 2 seconds
                │
                ▼
    ┌─────────────────────┐
    │  ALERT FIRES!       │ ──► Discord notification
    └─────────────────────┘
                │
    Error rate drops back to 1%

    Result: 50 notifications/day for transient spikes
            Team ignores all alerts = ALERT FATIGUE


PROBLEM 2: NO SEVERITY DISTINCTION
═══════════════════════════════════

  Current behavior:

    "Server is down" alert     ──► Same 10s check interval
    "Latency slightly high"    ──► Same 10s check interval

    Both treated equally. No priority.

    Result: Critical issues buried in noise


PROBLEM 3: NOTIFICATION SPAM
═════════════════════════════

  Current behavior:

    10 alerts fire at same time
                │
                ▼
    10 separate API calls to Discord

    Result: Hit rate limits, notifications delayed or lost


PROBLEM 4: NO SENSIBLE DEFAULTS
════════════════════════════════

  User creates alert:
    "What threshold should I set for error rate?"
    "What's a good cooldown time?"

    Result: Guessing leads to too many or too few alerts
```

### What Users Actually Need

| User Need | Solution |
|-----------|----------|
| "Only alert me if the problem is REAL, not a blip" | **Pending period** - condition must persist |
| "Don't spam me - I saw it the first time" | **Cooldown** - minimum time between notifications |
| "Critical issues should notify me FAST" | **Severity levels** - CRITICAL/HIGH/MEDIUM/LOW |
| "I don't know what thresholds to set" | **Presets** - Aggressive/Balanced/Conservative |
| "Did my webhook work?" | **Test Alert** button |
| "Would this fire right now?" | **Dry Run** preview |

---

## 2. Solution Overview

### Before vs After

```
BEFORE (Current System)                 AFTER (With This Feature)
──────────────────────                  ──────────────────────────

• Error spike 2s → Alert               • Error spike 2s → Wait → Ends → No alert
• All alerts check every 10s           • CRITICAL=10s, LOW=5min
• Each alert = 1 API call              • Batch 10 alerts into 1 notification
• User guesses thresholds              • Presets: "Balanced" = industry defaults
• No visibility into state             • See: PENDING (45s), FIRING, RESOLVED
```

### State Machine

```
                              ┌─────────────────┐
                              │    INACTIVE     │◄──────────────────────────┐
                              └────────┬────────┘                           │
                                       │ Condition MET                      │
                                       ▼                                    │
                              ┌─────────────────┐                           │
                  ┌──────────►│    PENDING      │───────────────────────────┤
                  │           └────────┬────────┘    Condition NOT MET      │
                  │                    │                                    │
                  │                    │ pendingDuration elapsed            │
                  │                    │ AND condition still MET            │
                  │                    ▼                                    │
                  │           ┌─────────────────┐                           │
                  │           │    FIRING       │───────────────────────────┘
                  │           └────────┬────────┘    Condition NOT MET
                  │                    │
                  │                    ▼
                  │           ┌─────────────────┐
                  └───────────│   RESOLVED      │
     Condition MET            └─────────────────┘
     (alert recurs)


STATE TRANSITION TABLE
┌─────────────────┬────────────────────┬───────────────────┬──────────────────────────┐
│  Current State  │     Condition      │     New State     │         Action           │
├─────────────────┼────────────────────┼───────────────────┼──────────────────────────┤
│  INACTIVE       │  MET               │  PENDING          │  Start pending timer     │
│  PENDING        │  MET + time >= dur │  FIRING           │  Enqueue for dispatch    │
│  PENDING        │  NOT MET           │  INACTIVE         │  Reset pending timer     │
│  FIRING         │  MET + cooldown ok │  FIRING           │  Re-enqueue              │
│  FIRING         │  NOT MET           │  RESOLVED         │  Mark resolved           │
│  RESOLVED       │  MET               │  PENDING          │  Start pending timer     │
└─────────────────┴────────────────────┴───────────────────┴──────────────────────────┘
```

### Notification Logic

**When are notifications sent?**

| State Transition | Notification Sent? | Notes |
|------------------|-------------------|-------|
| INACTIVE → PENDING | ❌ No | Just waiting, condition might be transient |
| PENDING → FIRING | ✅ **YES** | First notification when alert fires |
| FIRING → FIRING (staying) | ✅ Only if cooldown passed | Re-notification for ongoing issues |
| FIRING → RESOLVED | ❌ No | Condition no longer met |
| RESOLVED → PENDING | ❌ No | Alert recurring, starts pending again |
| RESOLVED → INACTIVE | ❌ No | Back to normal |

**Key Concepts:**

1. **First Fire Notification**: Sent immediately when transitioning PENDING → FIRING
2. **Re-Notification**: Only sent if alert stays in FIRING AND cooldown has passed
3. **No Spam**: Cooldown prevents multiple notifications during an ongoing incident

### Detailed Timeline Example

```
CRITICAL Alert: Error Rate > 5% (1 min pending, 5 min cooldown)
═════════════════════════════════════════════════════════════════════════════

T+0:00    Error rate spikes to 8%
          ┌──────────────────────────────────────────────────────────────┐
          │  State: INACTIVE → PENDING                                   │
          │  Action: Start pending timer                                 │
          │  Notification: ❌ None (waiting to confirm it's not a blip) │
          └──────────────────────────────────────────────────────────────┘

T+0:30    Error rate still at 8% (30 seconds elapsed)
          ┌──────────────────────────────────────────────────────────────┐
          │  State: PENDING (stays)                                      │
          │  Pending Progress: 50% (30s / 60s)                          │
          │  Notification: ❌ None (still waiting)                       │
          └──────────────────────────────────────────────────────────────┘

T+1:00    Error rate still at 8% (60 seconds elapsed = pending duration met)
          ┌──────────────────────────────────────────────────────────────┐
          │  State: PENDING → FIRING                                     │
          │  Action: Enqueue for dispatch                               │
          │  Notification: ✅ SENT (Discord, Gmail)                      │
          │  lastTriggeredAt: T+1:00                                     │
          └──────────────────────────────────────────────────────────────┘

T+2:00    Error rate still at 7% (above threshold)
          ┌──────────────────────────────────────────────────────────────┐
          │  State: FIRING (stays)                                       │
          │  Cooldown: 4 min remaining (5 min - 1 min elapsed)          │
          │  Notification: ❌ None (cooldown active)                     │
          └──────────────────────────────────────────────────────────────┘

T+4:00    Error rate still at 6% (above threshold)
          ┌──────────────────────────────────────────────────────────────┐
          │  State: FIRING (stays)                                       │
          │  Cooldown: 2 min remaining                                   │
          │  Notification: ❌ None (cooldown active)                     │
          └──────────────────────────────────────────────────────────────┘

T+6:00    Error rate still at 6% (cooldown expired: 5 min since T+1:00)
          ┌──────────────────────────────────────────────────────────────┐
          │  State: FIRING (stays)                                       │
          │  Cooldown: EXPIRED                                           │
          │  Notification: ✅ RE-SENT (reminder that issue persists)     │
          │  lastTriggeredAt: T+6:00                                     │
          └──────────────────────────────────────────────────────────────┘

T+8:00    Error rate drops to 3% (below threshold)
          ┌──────────────────────────────────────────────────────────────┐
          │  State: FIRING → RESOLVED                                    │
          │  Action: Mark as resolved                                    │
          │  Notification: ❌ None                                       │
          │  Duration: 7 minutes (from T+1:00 to T+8:00)                 │
          └──────────────────────────────────────────────────────────────┘

T+9:00    Error rate stays at 2% (below threshold)
          ┌──────────────────────────────────────────────────────────────┐
          │  State: RESOLVED → INACTIVE                                  │
          │  Action: Reset, ready for next incident                     │
          │  Notification: ❌ None                                       │
          └──────────────────────────────────────────────────────────────┘

═════════════════════════════════════════════════════════════════════════════
SUMMARY: 2 notifications sent over 8 minutes (not 48 notifications every 10s!)
═════════════════════════════════════════════════════════════════════════════
```

**What happens if error rate spikes again later?**

```
T+20:00   Error rate spikes to 10% again
          State: INACTIVE → PENDING (fresh cycle starts)

T+21:00   Still at 10% (pending duration met)
          State: PENDING → FIRING
          Notification: ✅ SENT (new incident)
```

The alert goes through the full cycle again: INACTIVE → PENDING → FIRING → RESOLVED → INACTIVE

### Severity-Based Configuration

| Severity | Eval Interval | Pending Duration | Cooldown | Use Case |
|----------|---------------|------------------|----------|----------|
| **CRITICAL** | 10s | 1 min | 5 min | System down, data loss |
| **HIGH** | 30s | 2 min | 30 min | Service degradation |
| **MEDIUM** | 60s | 3 min | 2 hours | Performance issues |
| **LOW** | 5 min | 5 min | 12 hours | Warnings, capacity |

### Threshold Presets

| Preset | Error Rate | P50 Latency | P95 Latency | P99 Latency | Use Case |
|--------|------------|-------------|-------------|-------------|----------|
| **Aggressive** | > 1% | > 100ms | > 500ms | > 1000ms | Dev/Staging |
| **Balanced** | > 5% | > 200ms | > 1000ms | > 2000ms | Production |
| **Conservative** | > 10% | > 500ms | > 2000ms | > 5000ms | High-traffic |

---

## 3. Architecture

### Design Principles

1. **Interface-based** - Easy to swap implementations for scale
2. **Queue-based batching** - Reduce API calls, handle rate limits
3. **Severity priority** - Critical alerts process faster
4. **Future-proof** - Simple today, scalable tomorrow

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              ALERT SYSTEM V2                                         │
└─────────────────────────────────────────────────────────────────────────────────────┘

                         ┌─────────────────────────────────────┐
                         │         ALERT EVALUATOR             │
                         │         (Orchestrator)              │
                         │                                     │
                         │  • Uses interfaces, not concrete    │
                         │  • Doesn't change when scaling      │
                         └──────────────┬──────────────────────┘
                                        │
           ┌────────────────────────────┼────────────────────────────┐
           │                            │                            │
           ▼                            ▼                            ▼
  ┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
  │  IAlertStore    │         │  ITriggerQueue  │         │  IDispatcher    │
  │  (Interface)    │         │  (Interface)    │         │  (Interface)    │
  └────────┬────────┘         └────────┬────────┘         └────────┬────────┘
           │                           │                           │
     TODAY │                     TODAY │                     TODAY │
           ▼                           ▼                           ▼
  ┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
  │  PrismaStore    │         │  MemoryQueue    │         │ SimpleDispatcher│
  │  (Direct DB)    │         │  (In-process)   │         │ (fetch POST)    │
  └─────────────────┘         └─────────────────┘         └─────────────────┘
           │                           │                           │
    FUTURE │                    FUTURE │                    FUTURE │
           ▼                           ▼                           ▼
  ┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
  │  CachedStore    │         │  RedisQueue     │         │ RateLimited     │
  │  (Redis+Prisma) │         │  (Persistent)   │         │ Dispatcher      │
  └─────────────────┘         └─────────────────┘         └─────────────────┘
```

### Queue-Based Batch Processing

```
     EVALUATION PHASE (Continuous)                    DISPATCH PHASE (Batched)
     ════════════════════════════                     ═══════════════════════════

┌─────────────────────────────┐
│     Alert Evaluator         │
│     (runs every 10s)        │
│                             │
│  For each alert:            │
│  1. Check metric            │
│  2. Evaluate state machine  │
│  3. If FIRING → enqueue     │
└──────────────┬──────────────┘
               │
               ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                         TRIGGER QUEUES                                      │
│                                                                             │
│   ┌──────────────────┐                                                     │
│   │  CRITICAL Queue  │  Flush every 10s  ────────────────────┐             │
│   └──────────────────┘                                       │             │
│   ┌──────────────────┐                                       │             │
│   │    HIGH Queue    │  Flush every 30s  ─────────────┐      │             │
│   └──────────────────┘                                │      │             │
│   ┌──────────────────┐                                │      │             │
│   │   MEDIUM Queue   │  Flush every 60s  ──────┐      │      │             │
│   └──────────────────┘                         │      │      │             │
│   ┌──────────────────┐                         │      │      │             │
│   │    LOW Queue     │  Flush every 5min ─┐    │      │      │             │
│   └──────────────────┘                    │    │      │      │             │
│                                           │    │      │      │             │
└───────────────────────────────────────────┼────┼──────┼──────┼─────────────┘
                                            │    │      │      │
                                            ▼    ▼      ▼      ▼
                              ┌─────────────────────────────────────────┐
                              │         BATCH DISPATCHER                 │
                              │                                          │
                              │   Drain queue → Batch POST to Web API   │
                              └───────────────────┬─────────────────────┘
                                                  │
                                                  ▼
                              ┌─────────────────────────────────────────┐
                              │    /api/internal/alerts/trigger-batch   │
                              └───────────────────┬─────────────────────┘
                                                  │
                          ┌───────────────────────┼───────────────────────┐
                          ▼                       ▼                       ▼
                   ┌─────────────┐         ┌─────────────┐         ┌─────────────┐
                   │   Discord   │         │    Gmail    │         │    Slack    │
                   └─────────────┘         └─────────────┘         └─────────────┘
```

### Benefits of Queue-Based Batching

| Without Batching | With Batching |
|------------------|---------------|
| 10 alerts → 10 API calls | 10 alerts → 1 batched API call |
| 10 Discord messages | 1 message: "10 alerts triggered" |
| Hit rate limits | Stay under limits |
| Notifications delayed | Reliable delivery |

---

## 4. Database Schema

### Schema Changes

```prisma
// packages/db/prisma/schema.prisma

enum AlertSeverity {
  CRITICAL  // P1 - System down, data loss
  HIGH      // P2 - Service degradation
  MEDIUM    // P3 - Performance issues
  LOW       // P4 - Warnings, capacity
}

enum AlertState {
  INACTIVE   // Condition not met
  PENDING    // Condition met, waiting for pendingDuration
  FIRING     // Alert triggered, notifications sent
  RESOLVED   // Was firing, now recovered
}

model Alert {
  id              String          @id @default(cuid())
  projectId       String
  project         Project         @relation(...)
  name            String
  type            AlertType
  threshold       Float
  operator        AlertOperator   @default(GREATER_THAN)

  // NEW: Severity-based configuration
  severity        AlertSeverity   @default(MEDIUM)

  // Timing configuration
  windowMins      Int             @default(5)      // Metric aggregation window
  cooldownMins    Int             @default(60)     // Min time between notifications
  pendingMins     Int             @default(2)      // NEW: Condition must persist

  // NEW: State tracking
  state           AlertState      @default(INACTIVE)
  stateChangedAt  DateTime?
  lastEvaluatedAt DateTime?

  // Existing
  lastTriggeredAt DateTime?
  enabled         Boolean         @default(true)
  channels        AlertChannel[]
  channelLinks    AlertChannelLink[]
  history         AlertHistory[]
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt

  @@index([projectId])
  @@index([enabled, severity])  // NEW: For severity-based queries
  @@index([state, enabled])     // NEW: For state queries
  @@map("alerts")
}

model AlertHistory {
  id              String      @id @default(cuid())
  alertId         String
  alert           Alert       @relation(...)
  triggeredAt     DateTime    @default(now())
  value           Float
  threshold       Float

  // NEW: State tracking
  state           AlertState
  previousState   AlertState?

  resolved        Boolean     @default(false)
  resolvedAt      DateTime?
  notifiedVia     String[]

  // NEW: Evaluation metadata
  sampleCount     Int?
  evaluationMs    Int?

  @@index([alertId, triggeredAt])
  @@map("alert_history")
}
```

### Migration

```sql
-- Add severity enum
CREATE TYPE "AlertSeverity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- Add state enum
CREATE TYPE "AlertState" AS ENUM ('INACTIVE', 'PENDING', 'FIRING', 'RESOLVED');

-- Add new columns to alerts
ALTER TABLE "alerts"
  ADD COLUMN "severity" "AlertSeverity" NOT NULL DEFAULT 'MEDIUM',
  ADD COLUMN "state" "AlertState" NOT NULL DEFAULT 'INACTIVE',
  ADD COLUMN "pendingMins" INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN "stateChangedAt" TIMESTAMP(3),
  ADD COLUMN "lastEvaluatedAt" TIMESTAMP(3);

-- Add indexes
CREATE INDEX "alerts_enabled_severity_idx" ON "alerts"("enabled", "severity");
CREATE INDEX "alerts_state_enabled_idx" ON "alerts"("state", "enabled");
```

---

## 5. Interfaces & Implementations

### Core Interfaces

```typescript
// packages/api/src/lib/alerting/interfaces.ts

/**
 * EXTENSION POINT 1: Alert Storage
 *
 * Today: Direct Prisma queries
 * Future: Redis cache + Prisma, sharded DB
 */
export interface IAlertStore {
  getEligibleAlerts(severity?: AlertSeverity): Promise<AlertWithProject[]>;
  updateAlertState(alertId: string, state: AlertState, metadata?: StateMetadata): Promise<void>;
  getMetric(projectId: string, type: AlertType, windowMins: number): Promise<MetricResult>;
  recordHistory(entry: AlertHistoryEntry): Promise<void>;
}

/**
 * EXTENSION POINT 2: Trigger Queue
 *
 * Today: In-memory arrays
 * Future: Redis lists, SQS, RabbitMQ
 */
export interface ITriggerQueue {
  enqueue(item: TriggerQueueItem): Promise<void>;
  dequeue(severity: AlertSeverity, batchSize: number): Promise<TriggerQueueItem[]>;
  size(severity: AlertSeverity): Promise<number>;

  // Future: for distributed workers
  acquireLock?(alertId: string, ttlMs: number): Promise<boolean>;
  releaseLock?(alertId: string): Promise<void>;
}

/**
 * EXTENSION POINT 3: Notification Dispatcher
 *
 * Today: Simple HTTP POST
 * Future: Rate-limited, circuit-breaker, retry queue
 */
export interface IDispatcher {
  dispatch(items: TriggerQueueItem[]): Promise<DispatchResult>;

  // Future
  getRateLimitStatus?(channel: string): Promise<RateLimitStatus>;
  isCircuitOpen?(channel: string): Promise<boolean>;
}

/**
 * EXTENSION POINT 4: Scheduler
 *
 * Today: setInterval()
 * Future: Distributed locking, external scheduler
 */
export interface IScheduler {
  schedule(name: string, intervalMs: number, task: () => Promise<void>): void;
  cancel(name: string): void;
  cancelAll(): void;

  // Future
  updateInterval?(name: string, newIntervalMs: number): void;
}
```

### Types

```typescript
// packages/api/src/schemas/alerting.ts

import { z } from "zod";

export const AlertSeveritySchema = z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]);
export type AlertSeverity = z.infer<typeof AlertSeveritySchema>;

export const AlertStateSchema = z.enum(["INACTIVE", "PENDING", "FIRING", "RESOLVED"]);
export type AlertState = z.infer<typeof AlertStateSchema>;

export const ThresholdPresetSchema = z.enum(["AGGRESSIVE", "BALANCED", "CONSERVATIVE"]);
export type ThresholdPreset = z.infer<typeof ThresholdPresetSchema>;

// Severity defaults
export const SEVERITY_DEFAULTS: Record<AlertSeverity, {
  cooldownMins: number;
  pendingMins: number;
  evalIntervalMs: number;
  flushIntervalMs: number;
}> = {
  CRITICAL: { cooldownMins: 5, pendingMins: 1, evalIntervalMs: 10_000, flushIntervalMs: 10_000 },
  HIGH:     { cooldownMins: 30, pendingMins: 2, evalIntervalMs: 30_000, flushIntervalMs: 30_000 },
  MEDIUM:   { cooldownMins: 120, pendingMins: 3, evalIntervalMs: 60_000, flushIntervalMs: 60_000 },
  LOW:      { cooldownMins: 720, pendingMins: 5, evalIntervalMs: 300_000, flushIntervalMs: 300_000 },
} as const;

// Threshold presets
export const THRESHOLD_PRESETS: Record<ThresholdPreset, {
  errorRate: number;
  latencyP50: number;
  latencyP95: number;
  latencyP99: number;
}> = {
  AGGRESSIVE:   { errorRate: 1, latencyP50: 100, latencyP95: 500, latencyP99: 1000 },
  BALANCED:     { errorRate: 5, latencyP50: 200, latencyP95: 1000, latencyP99: 2000 },
  CONSERVATIVE: { errorRate: 10, latencyP50: 500, latencyP95: 2000, latencyP99: 5000 },
} as const;

export interface TriggerQueueItem {
  alertId: string;
  alertName: string;
  projectId: string;
  projectName: string;
  severity: AlertSeverity;
  metricType: AlertType;
  threshold: number;
  actualValue: number;
  operator: AlertOperator;
  previousState: AlertState;
  newState: AlertState;
  queuedAt: Date;
  channelIds: string[];
}
```

### Today's Implementations

```typescript
// apps/worker/src/lib/alerting/stores/prisma-alert-store.ts

export class PrismaAlertStore implements IAlertStore {
  async getEligibleAlerts(severity?: AlertSeverity): Promise<AlertWithProject[]> {
    return prisma.alert.findMany({
      where: {
        enabled: true,
        ...(severity ? { severity } : {}),
      },
      include: {
        project: { select: { id: true, name: true, workspaceId: true } },
        channelLinks: { include: { channel: true } },
      },
    });
  }

  async updateAlertState(alertId: string, state: AlertState, metadata?: StateMetadata): Promise<void> {
    await prisma.alert.update({
      where: { id: alertId },
      data: {
        state,
        stateChangedAt: new Date(),
        lastEvaluatedAt: new Date(),
        ...(state === "FIRING" ? { lastTriggeredAt: new Date() } : {}),
      },
    });
  }

  async getMetric(projectId: string, type: AlertType, windowMins: number): Promise<MetricResult> {
    return getMetric(projectId, type, windowMins);
  }

  async recordHistory(entry: AlertHistoryEntry): Promise<void> {
    await prisma.alertHistory.create({ data: entry });
  }
}
```

```typescript
// apps/worker/src/lib/alerting/queues/memory-queue.ts

export class MemoryTriggerQueue implements ITriggerQueue {
  private queues = new Map<AlertSeverity, TriggerQueueItem[]>([
    ["CRITICAL", []],
    ["HIGH", []],
    ["MEDIUM", []],
    ["LOW", []],
  ]);

  async enqueue(item: TriggerQueueItem): Promise<void> {
    this.queues.get(item.severity)!.push(item);
  }

  async dequeue(severity: AlertSeverity, batchSize: number): Promise<TriggerQueueItem[]> {
    const queue = this.queues.get(severity)!;
    return queue.splice(0, Math.min(batchSize, queue.length));
  }

  async size(severity: AlertSeverity): Promise<number> {
    return this.queues.get(severity)!.length;
  }
}
```

```typescript
// apps/worker/src/lib/alerting/dispatchers/simple-dispatcher.ts

export class SimpleDispatcher implements IDispatcher {
  constructor(
    private triggerUrl: string,
    private secret: string,
  ) {}

  async dispatch(items: TriggerQueueItem[]): Promise<DispatchResult> {
    if (items.length === 0) {
      return { success: true, sent: 0, failed: 0 };
    }

    try {
      const response = await fetch(this.triggerUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Secret": this.secret,
        },
        body: JSON.stringify({ alerts: items }),
      });

      if (!response.ok) {
        console.error(`Dispatch failed: ${response.status}`);
        return { success: false, sent: 0, failed: items.length };
      }

      return { success: true, sent: items.length, failed: 0 };
    } catch (error) {
      console.error("Dispatch error:", error);
      return { success: false, sent: 0, failed: items.length };
    }
  }
}
```

```typescript
// apps/worker/src/lib/alerting/schedulers/interval-scheduler.ts

export class IntervalScheduler implements IScheduler {
  private intervals = new Map<string, NodeJS.Timeout>();

  schedule(name: string, intervalMs: number, task: () => Promise<void>): void {
    if (this.intervals.has(name)) {
      this.cancel(name);
    }

    // Run immediately, then on interval
    task().catch(console.error);

    const id = setInterval(() => {
      task().catch(console.error);
    }, intervalMs);

    this.intervals.set(name, id);
  }

  cancel(name: string): void {
    const id = this.intervals.get(name);
    if (id) {
      clearInterval(id);
      this.intervals.delete(name);
    }
  }

  cancelAll(): void {
    for (const name of this.intervals.keys()) {
      this.cancel(name);
    }
  }
}
```

### Alert Evaluator (Orchestrator)

```typescript
// apps/worker/src/jobs/alert-evaluator.ts

import { SEVERITY_DEFAULTS, type AlertSeverity, type AlertState } from "@ducsigr/api/schemas";
import type { IAlertStore, ITriggerQueue, IDispatcher, IScheduler } from "../lib/alerting/interfaces";

const MS_PER_MINUTE = 60_000;

export class AlertEvaluator {
  constructor(
    private store: IAlertStore,
    private queue: ITriggerQueue,
    private dispatcher: IDispatcher,
    private scheduler: IScheduler,
  ) {}

  start(): void {
    // Single evaluation loop
    this.scheduler.schedule("evaluate", 10_000, () => this.evaluateAll());

    // Severity-based dispatch loops
    this.scheduler.schedule("dispatch-critical", 10_000, () => this.flush("CRITICAL"));
    this.scheduler.schedule("dispatch-high", 30_000, () => this.flush("HIGH"));
    this.scheduler.schedule("dispatch-medium", 60_000, () => this.flush("MEDIUM"));
    this.scheduler.schedule("dispatch-low", 300_000, () => this.flush("LOW"));

    console.log("AlertEvaluator started");
  }

  stop(): void {
    this.scheduler.cancelAll();
    console.log("AlertEvaluator stopped");
  }

  private async evaluateAll(): Promise<void> {
    const startTime = Date.now();
    const alerts = await this.store.getEligibleAlerts();

    for (const alert of alerts) {
      await this.evaluateAlert(alert);
    }

    console.log(`Evaluation completed in ${Date.now() - startTime}ms`);
  }

  private async evaluateAlert(alert: AlertWithProject): Promise<void> {
    const metric = await this.store.getMetric(alert.projectId, alert.type, alert.windowMins);

    if (metric.sampleCount === 0) return;

    const conditionMet = this.checkThreshold(metric.value, alert.threshold, alert.operator);
    const newState = this.computeNextState(alert, conditionMet);

    if (newState !== alert.state) {
      await this.transitionState(alert, newState, metric.value);
    } else {
      // Just update lastEvaluatedAt
      await this.store.updateAlertState(alert.id, alert.state);
    }
  }

  private computeNextState(alert: AlertWithProject, conditionMet: boolean): AlertState {
    const currentState = alert.state as AlertState;
    const pendingMs = (alert.pendingMins ?? SEVERITY_DEFAULTS[alert.severity].pendingMins) * MS_PER_MINUTE;

    switch (currentState) {
      case "INACTIVE":
        return conditionMet ? "PENDING" : "INACTIVE";

      case "PENDING":
        if (!conditionMet) return "INACTIVE";
        const pendingDuration = Date.now() - (alert.stateChangedAt?.getTime() ?? 0);
        return pendingDuration >= pendingMs ? "FIRING" : "PENDING";

      case "FIRING":
        return conditionMet ? "FIRING" : "RESOLVED";

      case "RESOLVED":
        return conditionMet ? "PENDING" : "INACTIVE";

      default:
        return "INACTIVE";
    }
  }

  private async transitionState(
    alert: AlertWithProject,
    newState: AlertState,
    currentValue: number,
  ): Promise<void> {
    console.log(`Alert "${alert.name}": ${alert.state} → ${newState}`);

    await this.store.updateAlertState(alert.id, newState);

    // Enqueue for notification on FIRING
    if (newState === "FIRING") {
      const cooldownMs = (alert.cooldownMins ?? SEVERITY_DEFAULTS[alert.severity].cooldownMins) * MS_PER_MINUTE;
      const timeSinceLastTrigger = alert.lastTriggeredAt
        ? Date.now() - alert.lastTriggeredAt.getTime()
        : Infinity;

      if (timeSinceLastTrigger >= cooldownMs) {
        await this.queue.enqueue({
          alertId: alert.id,
          alertName: alert.name,
          projectId: alert.projectId,
          projectName: alert.project.name,
          severity: alert.severity,
          metricType: alert.type,
          threshold: alert.threshold,
          actualValue: currentValue,
          operator: alert.operator,
          previousState: alert.state,
          newState,
          queuedAt: new Date(),
          channelIds: alert.channelLinks.map(l => l.channelId),
        });
      }
    }

    // Record history
    await this.store.recordHistory({
      alertId: alert.id,
      value: currentValue,
      threshold: alert.threshold,
      state: newState,
      previousState: alert.state,
      resolved: newState === "RESOLVED",
      resolvedAt: newState === "RESOLVED" ? new Date() : null,
      notifiedVia: [],
    });
  }

  private async flush(severity: AlertSeverity): Promise<void> {
    const items = await this.queue.dequeue(severity, 100);

    if (items.length > 0) {
      console.log(`Dispatching ${items.length} ${severity} alerts`);
      await this.dispatcher.dispatch(items);
    }
  }

  private checkThreshold(value: number, threshold: number, operator: AlertOperator): boolean {
    switch (operator) {
      case "GREATER_THAN": return value > threshold;
      case "LESS_THAN": return value < threshold;
      default: return false;
    }
  }
}
```

### Wiring (Dependency Injection)

```typescript
// apps/worker/src/index.ts

import { AlertEvaluator } from "./jobs/alert-evaluator";
import { PrismaAlertStore } from "./lib/alerting/stores/prisma-alert-store";
import { MemoryTriggerQueue } from "./lib/alerting/queues/memory-queue";
import { SimpleDispatcher } from "./lib/alerting/dispatchers/simple-dispatcher";
import { IntervalScheduler } from "./lib/alerting/schedulers/interval-scheduler";
import { env } from "./lib/env";

async function main() {
  // Wire up implementations
  const alertEvaluator = new AlertEvaluator(
    new PrismaAlertStore(),
    new MemoryTriggerQueue(),
    new SimpleDispatcher(
      `${env.WEB_API_URL}/api/internal/alerts/trigger-batch`,
      env.INTERNAL_API_SECRET,
    ),
    new IntervalScheduler(),
  );

  alertEvaluator.start();

  // Graceful shutdown
  const shutdown = () => {
    alertEvaluator.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch(console.error);
```

### File Structure

```
packages/api/src/lib/alerting/
├── interfaces.ts                   # Contracts (shared between worker and web)
│
├── stores/
│   ├── prisma-alert-store.ts       # TODAY
│   └── redis-alert-store.ts        # FUTURE (placeholder)
│
├── queues/
│   ├── memory-queue.ts             # TODAY
│   └── redis-queue.ts              # FUTURE (placeholder)
│
├── dispatchers/
│   ├── simple-dispatcher.ts        # TODAY
│   └── rate-limited-dispatcher.ts  # FUTURE (placeholder)
│
├── schedulers/
│   ├── interval-scheduler.ts       # TODAY
│   └── distributed-scheduler.ts    # FUTURE (placeholder)
│
└── index.ts                        # Barrel export

apps/worker/src/
├── jobs/
│   └── alert-evaluator.ts          # Orchestrator (imports from @ducsigr/api)
│
└── index.ts                        # Entry point (DI wiring)
```

---

## 6. API Endpoints

### New/Updated Endpoints

```typescript
// packages/api/src/routers/alerts.ts

// Create alert with severity and presets
create: protectedProcedure
  .input(z.object({
    projectId: z.string(),
    name: z.string().min(1).max(100),
    type: AlertTypeSchema,
    threshold: z.number().positive(),
    operator: AlertOperatorSchema.default("GREATER_THAN"),
    severity: AlertSeveritySchema.default("MEDIUM"),
    windowMins: z.number().int().min(1).max(60).default(5),
    cooldownMins: z.number().int().min(1).max(1440).optional(),
    pendingMins: z.number().int().min(0).max(30).optional(),
    channelIds: z.array(z.string()).optional(),
  }))
  .mutation(async ({ ctx, input }) => {
    // Use severity defaults if not provided
    const defaults = SEVERITY_DEFAULTS[input.severity];

    return ctx.db.alert.create({
      data: {
        ...input,
        cooldownMins: input.cooldownMins ?? defaults.cooldownMins,
        pendingMins: input.pendingMins ?? defaults.pendingMins,
        state: "INACTIVE",
      },
    });
  }),

// Test alert - send test notification
testAlert: protectedProcedure
  .input(z.object({ alertId: z.string() }))
  .mutation(async ({ ctx, input }) => {
    const alert = await ctx.db.alert.findUnique({
      where: { id: input.alertId },
      include: {
        project: true,
        channelLinks: { include: { channel: true } },
      },
    });

    if (!alert) throw new TRPCError({ code: "NOT_FOUND" });

    // Send test notification
    const result = await sendTestNotification({
      alertId: alert.id,
      alertName: `[TEST] ${alert.name}`,
      projectName: alert.project.name,
      threshold: alert.threshold,
      actualValue: alert.threshold * 1.1,
      isTest: true,
    });

    return { success: true, notifiedVia: result.notifiedVia };
  }),

// Dry run - preview what would trigger
dryRun: protectedProcedure
  .input(z.object({ alertId: z.string() }))
  .query(async ({ ctx, input }) => {
    const alert = await ctx.db.alert.findUnique({
      where: { id: input.alertId },
      include: { project: true },
    });

    if (!alert) throw new TRPCError({ code: "NOT_FOUND" });

    const metric = await getMetric(alert.projectId, alert.type, alert.windowMins);
    const wouldTrigger = checkThreshold(metric.value, alert.threshold, alert.operator);
    const defaults = SEVERITY_DEFAULTS[alert.severity];

    return {
      currentValue: metric.value,
      threshold: alert.threshold,
      wouldTrigger,
      sampleCount: metric.sampleCount,
      state: alert.state,
      pendingProgress: calculatePendingProgress(alert),
      cooldownRemaining: calculateCooldownRemaining(alert),
      effectiveConfig: {
        cooldownMins: alert.cooldownMins ?? defaults.cooldownMins,
        pendingMins: alert.pendingMins ?? defaults.pendingMins,
        evalIntervalMs: defaults.evalIntervalMs,
      },
    };
  }),

// Get alert history
getHistory: protectedProcedure
  .input(z.object({
    alertId: z.string(),
    limit: z.number().default(50),
  }))
  .query(async ({ ctx, input }) => {
    return ctx.db.alertHistory.findMany({
      where: { alertId: input.alertId },
      orderBy: { triggeredAt: "desc" },
      take: input.limit,
    });
  }),

// Get presets
getPresets: publicProcedure.query(() => ({
  thresholds: THRESHOLD_PRESETS,
  severities: SEVERITY_DEFAULTS,
})),
```

### Batch Trigger Endpoint

```typescript
// apps/web/src/app/api/internal/alerts/trigger-batch/route.ts

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@ducsigr/db";
import { validateInternalSecret } from "@ducsigr/shared";
import { AlertingAdapter } from "@ducsigr/api/lib/alerting";

const TriggerBatchSchema = z.object({
  alerts: z.array(z.object({
    alertId: z.string(),
    alertName: z.string(),
    projectId: z.string(),
    projectName: z.string(),
    severity: z.string(),
    metricType: z.string(),
    threshold: z.number(),
    actualValue: z.number(),
    operator: z.string(),
    channelIds: z.array(z.string()),
  })),
});

export async function POST(req: NextRequest) {
  // Validate internal secret
  const secret = req.headers.get("X-Internal-Secret");
  if (!validateInternalSecret(secret, env.INTERNAL_API_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { alerts } = TriggerBatchSchema.parse(body);

  const results = [];

  for (const alert of alerts) {
    // Get channels
    const channels = await prisma.notificationChannel.findMany({
      where: { id: { in: alert.channelIds } },
    });

    // Send to each channel
    const notifiedVia = [];
    for (const channel of channels) {
      const adapter = AlertingAdapter(channel.provider);
      const result = await adapter.send(channel.config, {
        alertId: alert.alertId,
        alertName: alert.alertName,
        projectName: alert.projectName,
        type: alert.metricType,
        threshold: alert.threshold,
        actualValue: alert.actualValue,
        operator: alert.operator,
        triggeredAt: new Date().toISOString(),
      });

      if (result.success) {
        notifiedVia.push(channel.provider);
      }
    }

    // Update history
    await prisma.alertHistory.updateMany({
      where: { alertId: alert.alertId, notifiedVia: { isEmpty: true } },
      data: { notifiedVia },
    });

    results.push({ alertId: alert.alertId, notifiedVia });
  }

  return NextResponse.json({ success: true, results });
}
```

---

## 7. UI Design

### 7.1 Create Alert Dialog

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Create Alert                                                      [X]  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Alert Name                                                             │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ High Error Rate Alert                                            │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                         │
│  Severity                                        Threshold Preset       │
│  ┌───────────────────────────┐                  ┌────────────────────┐ │
│  │ ● Critical (P1)      ▼   │                  │ ○ Aggressive       │ │
│  └───────────────────────────┘                  │ ● Balanced         │ │
│   ├─ 5 min cooldown                             │ ○ Conservative     │ │
│   ├─ 10s evaluation                             └────────────────────┘ │
│   └─ 1 min pending                                                      │
│                                                                         │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                         │
│  Alert Type                          Threshold                          │
│  ┌───────────────────────────┐      ┌─────────────────────────────────┐│
│  │ Error Rate            ▼   │      │ 5                           %   ││
│  └───────────────────────────┘      └─────────────────────────────────┘│
│                                                                         │
│  Operator                            Time Window                        │
│  ┌───────────────────────────┐      ┌─────────────────────────────────┐│
│  │ Greater Than          ▼   │      │ 5                      minutes  ││
│  └───────────────────────────┘      └─────────────────────────────────┘│
│                                                                         │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                         │
│  Notification Channels                                                  │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ [✓] Discord - Engineering Alerts                                │   │
│  │ [✓] Gmail - oncall@company.com                                  │   │
│  │ [ ] Slack - #incidents                                          │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ▸ Advanced Settings                                                    │
│                                                                         │
│                                          [ Cancel ]  [ Create Alert ]   │
└─────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Threshold Preset Cards

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Threshold Preset                                                       │
│                                                                         │
│  ┌─────────────────────┐ ┌─────────────────────┐ ┌─────────────────────┐│
│  │     AGGRESSIVE      │ │      BALANCED       │ │    CONSERVATIVE     ││
│  │  ─────────────────  │ │  ─────────────────  │ │  ─────────────────  ││
│  │  Error Rate: >1%    │ │  Error Rate: >5%    │ │  Error Rate: >10%   ││
│  │  P50: >100ms        │ │  P50: >200ms        │ │  P50: >500ms        ││
│  │  P95: >500ms        │ │  P95: >1000ms       │ │  P95: >2000ms       ││
│  │  P99: >1000ms       │ │  P99: >2000ms       │ │  P99: >5000ms       ││
│  │  ─────────────────  │ │  ─────────────────  │ │  ─────────────────  ││
│  │  Quick detection    │ │  ● Recommended      │ │  Reduce noise       ││
│  │  Dev/Staging        │ │  Production         │ │  High-traffic       ││
│  └─────────────────────┘ └─────────────────────┘ └─────────────────────┘│
└─────────────────────────────────────────────────────────────────────────┘
```

### 7.3 Alert Card States

#### INACTIVE
```
┌─────────────────────────────────────────────────────────────────────────┐
│  ○ INACTIVE                                                             │
│                                                                         │
│  High Error Rate Alert                              [ CRITICAL ]        │
│  Error Rate > 5% in 5 min window                                        │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Current: 2.3%        Threshold: 5%        Next check: 8s       │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  Last triggered: 2 hours ago                                            │
│  Channels: Discord, Gmail                                               │
│                                                                         │
│  [ Test Alert ]  [ Dry Run ]  [ Edit ]  [ ⋮ ]                          │
└─────────────────────────────────────────────────────────────────────────┘
```

#### PENDING
```
┌─────────────────────────────────────────────────────────────────────────┐
│  ◐ PENDING                                                  ⚠ Warning   │
│                                                                         │
│  High Error Rate Alert                              [ CRITICAL ]        │
│  Error Rate > 5% in 5 min window                                        │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Current: 7.2%        Threshold: 5%        Exceeded by: 44%     │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  Pending for 45 seconds (fires after 60s)                               │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │████████████████████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░│ 75%│
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  [ Test Alert ]  [ Dry Run ]  [ Edit ]  [ ⋮ ]                          │
└─────────────────────────────────────────────────────────────────────────┘
```

#### FIRING
```
┌─────────────────────────────────────────────────────────────────────────┐
│  ● FIRING                                                   🔴 Active   │
│                                                                         │
│  High Error Rate Alert                              [ CRITICAL ]        │
│  Error Rate > 5% in 5 min window                                        │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Current: 8.5%        Threshold: 5%        Exceeded by: 70%     │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  🔔 Notified via: Discord, Gmail                                        │
│  Cooldown: 4 min 32 sec remaining                                       │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │░░░░░░░░░░░░░░░░░░████████████████████████████████████████████████│   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  [ Test Alert ]  [ Dry Run ]  [ Acknowledge ]  [ ⋮ ]                   │
└─────────────────────────────────────────────────────────────────────────┘
```

#### RESOLVED
```
┌─────────────────────────────────────────────────────────────────────────┐
│  ✓ RESOLVED                                                 ✅ Recovered│
│                                                                         │
│  High Error Rate Alert                              [ CRITICAL ]        │
│  Error Rate > 5% in 5 min window                                        │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Current: 1.2%        Threshold: 5%        Below threshold ✓    │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  Was firing for: 12 minutes                                             │
│  Resolved: 2 minutes ago                                                │
│                                                                         │
│  [ Test Alert ]  [ Dry Run ]  [ View History ]  [ ⋮ ]                  │
└─────────────────────────────────────────────────────────────────────────┘
```

### 7.4 Dry Run Modal

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Dry Run: High Error Rate Alert                                    [X]  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Current Evaluation                                                     │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                  │   │
│  │   Current Value          Threshold           Would Trigger?      │   │
│  │   ┌──────────┐          ┌──────────┐        ┌──────────────┐    │   │
│  │   │   7.2%   │    >     │   5.0%   │   =    │   ✓ YES      │    │   │
│  │   └──────────┘          └──────────┘        └──────────────┘    │   │
│  │                                                                  │   │
│  │   Sample Count: 1,247 spans in last 5 minutes                   │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  Configuration                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Severity:      CRITICAL                                        │   │
│  │  Evaluation:    Every 10 seconds                                │   │
│  │  Pending:       1 minute (condition must persist)               │   │
│  │  Cooldown:      5 minutes (between notifications)               │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  Timing Status                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Current State:     ◐ PENDING (45s elapsed)                     │   │
│  │                     ████████████████████░░░░░░░░░░░░░ 75%       │   │
│  │                     Fires in ~15 seconds                        │   │
│  │                                                                  │   │
│  │  Last Triggered:    2 hours ago                                 │   │
│  │  Cooldown Status:   ✓ Ready to fire                             │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│                                                     [ Close ]           │
└─────────────────────────────────────────────────────────────────────────┘
```

### 7.5 Alert History Panel

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Alert History: High Error Rate Alert                              [X]  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Timeline (Last 24 hours)                                               │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │     ┃         ┃                                   ┃             │   │
│  │     ┃  FIRING ┃                                   ┃  FIRING     │   │
│  │─────┸─────────┸───────────────────────────────────┸─────────────│   │
│  │  12:00     14:00     16:00     18:00     20:00     22:00   Now  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  Event Log                                                              │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  ● 22:45  FIRING → FIRING (re-notify)                           │   │
│  │           Value: 8.5%  Threshold: 5%                            │   │
│  │           Notified: Discord, Gmail                              │   │
│  │                                                                  │   │
│  │  ● 22:40  PENDING → FIRING                                      │   │
│  │           Value: 7.2%  Threshold: 5%                            │   │
│  │           Notified: Discord, Gmail                              │   │
│  │                                                                  │   │
│  │  ◐ 22:39  INACTIVE → PENDING                                    │   │
│  │           Value: 5.8%  Threshold: 5%                            │   │
│  │                                                                  │   │
│  │  ✓ 14:15  FIRING → RESOLVED                                     │   │
│  │           Value: 3.2%  Duration: 2h 15m                         │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  [ Load More ]                                       [ Export CSV ]     │
└─────────────────────────────────────────────────────────────────────────┘
```

### 7.6 Visual System

```
SEVERITY BADGES
─────────────────────────────────────────────────────────────────
  ┌───────────┐  Red (#DC2626) - destructive
  │ CRITICAL  │
  └───────────┘

  ┌───────────┐  Orange (#EA580C) - warning
  │   HIGH    │
  └───────────┘

  ┌───────────┐  Yellow (#EAB308) - primary
  │  MEDIUM   │
  └───────────┘

  ┌───────────┐  Gray (#6B7280) - secondary
  │    LOW    │
  └───────────┘


STATE INDICATORS
─────────────────────────────────────────────────────────────────
  ○ INACTIVE   Gray outline circle
  ◐ PENDING    Half-filled yellow (animated pulse)
  ● FIRING     Solid red circle (animated pulse)
  ✓ RESOLVED   Green checkmark
```

---

## 8. Implementation Plan

### Phase 1: Database & Types (Day 1)

- [ ] Add `AlertSeverity` and `AlertState` enums to Prisma
- [ ] Add new columns: `severity`, `state`, `pendingMins`, `stateChangedAt`, `lastEvaluatedAt`
- [ ] Create migration
- [ ] Add Zod schemas: `AlertSeveritySchema`, `AlertStateSchema`, `SEVERITY_DEFAULTS`, `THRESHOLD_PRESETS`
- [ ] Run `pnpm db:generate`

### Phase 2: Interfaces & Implementations (Day 2-3)

- [ ] Create `packages/api/src/lib/alerting/interfaces.ts`
- [ ] Implement `PrismaAlertStore`
- [ ] Implement `MemoryTriggerQueue`
- [ ] Implement `SimpleDispatcher`
- [ ] Implement `IntervalScheduler`
- [ ] Create placeholder files for future implementations

### Phase 3: Alert Evaluator Refactor (Day 3-4)

- [ ] Refactor `AlertEvaluator` to use interfaces
- [ ] Implement state machine logic
- [ ] Implement queue-based batching
- [ ] Add severity-based dispatch intervals
- [ ] Update `apps/worker/src/index.ts` with DI wiring

### Phase 4: API Endpoints (Day 4-5)

- [ ] Update `create` mutation with severity/presets
- [ ] Add `testAlert` mutation
- [ ] Add `dryRun` query
- [ ] Add `getHistory` query
- [ ] Add `getPresets` query
- [ ] Create batch trigger endpoint

### Phase 5: Frontend UI (Day 5-7)

- [ ] Add severity selector to create/edit dialog
- [ ] Add threshold preset cards
- [ ] Update alert cards with state indicators
- [ ] Add pending/cooldown progress bars
- [ ] Add "Test Alert" button
- [ ] Add "Dry Run" modal
- [ ] Add alert history panel

### Phase 6: Testing & Polish (Day 7-8)

- [ ] Unit tests for state machine
- [ ] Unit tests for queue operations
- [ ] Integration test for full flow
- [ ] Update documentation
- [ ] Code review

---

## Future Enhancements (Post-MVP)

When scale is needed, swap implementations:

| Component | Today | Future |
|-----------|-------|--------|
| Alert Store | `PrismaAlertStore` | `RedisAlertStore` (cached) |
| Trigger Queue | `MemoryTriggerQueue` | `RedisTriggerQueue` (persistent) |
| Dispatcher | `SimpleDispatcher` | `RateLimitedDispatcher` (backoff) |
| Scheduler | `IntervalScheduler` | `DistributedScheduler` (multi-worker) |

No changes to `AlertEvaluator` orchestrator required.

---

## References

- [Prometheus Alerting Rules](https://prometheus.io/docs/prometheus/latest/configuration/alerting_rules/)
- [Grafana Alert Rule Evaluation](https://grafana.com/docs/grafana/latest/alerting/fundamentals/alert-rule-evaluation/)
- [PagerDuty Alert Deduplication](https://support.pagerduty.com/main/docs/alerts)
- [SigNoz - Prometheus Alert Lifecycle](https://signoz.io/guides/what-is-the-alert-lifecycle-of-prometheus/)
