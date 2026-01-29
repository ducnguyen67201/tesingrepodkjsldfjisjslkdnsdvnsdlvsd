# Alerting System - Engineering Specs

**EPIC:** #80 - Alerting System
**Package:** Core Platform

---

## Sprint Breakdown

| Sprint | Focus | Points |
|--------|-------|--------|
| 1 | Core Alerting + Adapter Pattern | 8 |
| 2 | Gmail & Discord Providers | 5 |
| 3 | UI & Alert History | 5 |

**Total: 18 points**

---

## Overview

The Alerting System enables users to create threshold-based alerts for error rates and latency metrics, receiving notifications via extensible provider adapters (Gmail, Discord initially, with Slack, PagerDuty, webhooks planned).

### Architecture Pattern: AlertingAdapter

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Alerting Architecture                            │
└─────────────────────────────────────────────────────────────────────────┘

  ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
  │  Alert Evaluator │────▶│  NotificationSvc │────▶│ AlertingAdapter  │
  │  (Worker Cron)   │     │  (Orchestrator)  │     │  (Interface)     │
  └──────────────────┘     └──────────────────┘     └────────┬─────────┘
                                                             │
                           ┌─────────────────────────────────┼─────────────────────────────────┐
                           │                                 │                                 │
                           ▼                                 ▼                                 ▼
                  ┌──────────────────┐            ┌──────────────────┐            ┌──────────────────┐
                  │  GmailAdapter    │            │  DiscordAdapter  │            │  SlackAdapter    │
                  │  (Nodemailer)    │            │  (Webhook)       │            │  (Future)        │
                  └──────────────────┘            └──────────────────┘            └──────────────────┘
```

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Adapter Pattern** | Interface-based providers | Easy to add new channels without modifying core logic |
| **Provider Registry** | Runtime registration | Supports dynamic provider discovery |
| **Channel Config** | JSON in DB | Flexible per-provider configuration |
| **Evaluation** | Worker cron job | Decoupled from request path, reliable execution |

---

## Data Models

### Alert

```prisma
model Alert {
  id           String        @id @default(cuid())
  projectId    String
  project      Project       @relation(fields: [projectId], references: [id], onDelete: Cascade)
  name         String
  type         AlertType
  threshold    Float
  operator     AlertOperator @default(GREATER_THAN)
  windowMins   Int           @default(5)
  cooldownMins Int           @default(60)
  enabled      Boolean       @default(true)
  channels     AlertChannel[]
  history      AlertHistory[]
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt

  @@index([projectId])
  @@index([enabled])
}
```

### AlertChannel

```prisma
model AlertChannel {
  id         String       @id @default(cuid())
  alertId    String
  alert      Alert        @relation(fields: [alertId], references: [id], onDelete: Cascade)
  provider   ChannelProvider
  config     Json         // Provider-specific config (encrypted at rest)
  verified   Boolean      @default(false)
  createdAt  DateTime     @default(now())

  @@index([alertId])
}
```

### AlertHistory

```prisma
model AlertHistory {
  id           String    @id @default(cuid())
  alertId      String
  alert        Alert     @relation(fields: [alertId], references: [id], onDelete: Cascade)
  triggeredAt  DateTime  @default(now())
  value        Float
  threshold    Float
  resolved     Boolean   @default(false)
  resolvedAt   DateTime?
  notifiedVia  String[]  // ["GMAIL", "DISCORD"]

  @@index([alertId, triggeredAt])
}
```

### Enums

```prisma
enum AlertType {
  ERROR_RATE
  LATENCY_P50
  LATENCY_P95
  LATENCY_P99
}

enum AlertOperator {
  GREATER_THAN
  LESS_THAN
}

enum ChannelProvider {
  GMAIL
  DISCORD
  SLACK      // Future
  PAGERDUTY  // Future
  WEBHOOK    // Future
}
```

---

## API Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `alerts.list` | Query | Member | List alerts for project |
| `alerts.get` | Query | Member | Get alert with channels |
| `alerts.create` | Mutation | Admin | Create new alert |
| `alerts.update` | Mutation | Admin | Update alert config |
| `alerts.delete` | Mutation | Admin | Delete alert |
| `alerts.toggle` | Mutation | Admin | Enable/disable alert |
| `alerts.history` | Query | Member | Get alert history |
| `alerts.testChannel` | Mutation | Admin | Send test notification |
| `alerts.addChannel` | Mutation | Admin | Add notification channel |
| `alerts.removeChannel` | Mutation | Admin | Remove channel |

---

## Documents

| Document | Purpose |
|----------|---------|
| [OPERATIONS_GUIDE.md](./OPERATIONS_GUIDE.md) | How to run, configure, and troubleshoot |
| [90_SPRINT_1_CORE_ALERTING_SPEC.md](./90_SPRINT_1_CORE_ALERTING_SPEC.md) | Sprint 1: Core alerting spec |
| [91_SPRINT_2_GMAIL_DISCORD_SPEC.md](./91_SPRINT_2_GMAIL_DISCORD_SPEC.md) | Sprint 2: Gmail & Discord spec |
| [92_SPRINT_3_UI_HISTORY_SPEC.md](./92_SPRINT_3_UI_HISTORY_SPEC.md) | Sprint 3: UI & History spec |
| [93_NOTIFICATION_CHANNELS_SETTINGS_SPEC.md](./93_NOTIFICATION_CHANNELS_SETTINGS_SPEC.md) | Channels Settings Page (#93) |

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Alert evaluation latency | < 5 seconds |
| Notification delivery | < 30 seconds from trigger |
| False positive rate | < 1% |
| Channel delivery success | > 99% |
