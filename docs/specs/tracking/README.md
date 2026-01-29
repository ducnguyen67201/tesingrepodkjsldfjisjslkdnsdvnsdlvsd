# Tracking System - Engineering Specs

**EPIC:** Sessions & User Tracking
**Package:** Core Platform

---

## Sprint Breakdown

| Sprint | Focus | Points |
|--------|-------|--------|
| 1 | Sessions (Multi-turn Conversations) | 5 |
| 2 | User Tracking (End-User Analytics) | 5 |

**Total: 10 points**

---

## Overview

The Tracking System enables users to group traces into sessions (multi-turn conversations) and track end-user behavior for analytics, debugging, and cost allocation.

### Architecture Pattern

```
                     ┌─────────────────────────────────────────────────────────┐
                     │                  Tracking Hierarchy                      │
                     └─────────────────────────────────────────────────────────┘

    Project
       │
       ├── TrackedUser (your end-users)
       │      │
       │      └── Session (conversations)
       │             │
       │             └── Trace (single request)
       │                    │
       │                    └── Span (operations)
       │
       └── Trace (without user/session - still supported)
```

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Optional User/Session** | Both nullable on Trace | Backwards compatible, not all traces need tracking |
| **External IDs** | User provides their own IDs | Integration with existing auth systems |
| **Session Auto-Create** | Create on first trace if not exists | Reduce SDK complexity |
| **Aggregation** | Materialized via queries | Avoid sync complexity |

---

## Data Models

### TrackedUser

```prisma
model TrackedUser {
  id         String   @id @default(cuid())
  projectId  String
  project    Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  externalId String   // User's ID from their system
  name       String?
  email      String?
  metadata   Json?
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  sessions   Session[]
  traces     Trace[]

  @@unique([projectId, externalId])
  @@index([projectId])
  @@map("tracked_users")
}
```

### Session

```prisma
model Session {
  id         String       @id @default(cuid())
  projectId  String
  project    Project      @relation(fields: [projectId], references: [id], onDelete: Cascade)
  externalId String?      // Optional external session ID
  userId     String?
  user       TrackedUser? @relation(fields: [userId], references: [id], onDelete: SetNull)
  name       String?
  metadata   Json?
  createdAt  DateTime     @default(now())
  updatedAt  DateTime     @updatedAt

  traces     Trace[]

  @@unique([projectId, externalId])
  @@index([projectId, createdAt])
  @@index([userId])
  @@map("sessions")
}
```

---

## Documents

| Document | Purpose |
|----------|---------|
| [102_SPRINT_1_SESSIONS_SPEC.md](./102_SPRINT_1_SESSIONS_SPEC.md) | Sprint 1: Sessions spec |
| [103_SPRINT_2_USER_TRACKING_SPEC.md](./103_SPRINT_2_USER_TRACKING_SPEC.md) | Sprint 2: User Tracking spec |

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Session grouping accuracy | 100% (traces linked correctly) |
| User analytics query time | < 500ms for 30-day rollup |
| SDK overhead | < 1ms per trace |
| Migration backwards compat | 100% (existing traces work) |
