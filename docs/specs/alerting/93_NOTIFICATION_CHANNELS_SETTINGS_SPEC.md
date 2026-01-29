# Notification Channels Settings Page

**Epic:** #80 - Alerting System
**Type:** Enhancement
**Priority:** P1

---

## Problem Statement

Currently, notification channels (Discord, Email) are configured per-alert via a 3-dot menu → "Add Channel" flow. This has UX issues:

1. **Repetitive configuration** - Users must re-enter webhook URLs for each alert
2. **Hidden feature** - Channel configuration is buried in a dropdown menu
3. **No reusability** - Cannot share a Discord webhook across multiple alerts
4. **Poor discoverability** - New users don't know where to configure notifications

## Proposed Solution

Create a dedicated **"Channels"** tab in Workspace Settings (`/workspace/:slug/settings`) where users can:

1. Configure notification channels once (Discord webhooks, Email addresses)
2. Name and manage channels centrally
3. Link alerts to pre-configured channels via dropdown

---

## User Flow Comparison

### Current Flow (Before)
```
Project → Alerts Panel → ⋮ Menu → Add Channel → Configure Discord/Email
                                              ↓
                                    Channel tied to single alert
```

### Proposed Flow (After)
```
Workspace Settings → Channels Tab → Add Discord/Email → Save
                                              ↓
                                    Channel available workspace-wide
                                              ↓
Project → Alerts Panel → ⋮ Menu → Link Channel → Select from dropdown
```

---

## Database Schema Changes

### New Model: `NotificationChannel`

```prisma
model NotificationChannel {
  id          String          @id @default(cuid())
  workspaceId String
  workspace   Workspace       @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  name        String          // User-friendly name: "Engineering Discord", "On-call Email"
  provider    ChannelProvider // DISCORD, GMAIL, SLACK, WEBHOOK
  config      Json            // Provider-specific config (webhookUrl, email, etc.)
  verified    Boolean         @default(false)

  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt

  // Alerts using this channel
  alertLinks  AlertChannelLink[]

  @@unique([workspaceId, name])
  @@index([workspaceId])
  @@map("notification_channels")
}

model AlertChannelLink {
  id        String              @id @default(cuid())
  alertId   String
  alert     Alert               @relation(fields: [alertId], references: [id], onDelete: Cascade)
  channelId String
  channel   NotificationChannel @relation(fields: [channelId], references: [id], onDelete: Cascade)

  createdAt DateTime            @default(now())

  @@unique([alertId, channelId])
  @@index([alertId])
  @@index([channelId])
  @@map("alert_channel_links")
}
```

### Migration Strategy

1. Create new tables
2. Migrate existing `AlertChannel` data to `NotificationChannel` + `AlertChannelLink`
3. Deprecate `AlertChannel` model
4. Remove old table after verification

---

## API Endpoints

### New Router: `channels.ts`

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `channels.list` | Query | Member | List workspace channels |
| `channels.get` | Query | Member | Get channel details |
| `channels.create` | Mutation | Admin | Create notification channel |
| `channels.update` | Mutation | Admin | Update channel config |
| `channels.delete` | Mutation | Admin | Delete channel |
| `channels.test` | Mutation | Admin | Send test notification |

### Updated Alerts Router

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `alerts.linkChannel` | Mutation | Admin | Link alert to channel |
| `alerts.unlinkChannel` | Mutation | Admin | Unlink channel from alert |
| `alerts.getLinkedChannels` | Query | Member | Get channels linked to alert |

---

## UI Components

### 1. Channels Settings Page

**Location:** `/workspace/:slug/settings` → New "Channels" tab

```
┌─────────────────────────────────────────────────────────────────────┐
│  Workspace Settings                                                  │
├─────────────────────────────────────────────────────────────────────┤
│  [General] [Members] [Domains] [API Keys] [Channels]                │
│                                            ^^^^^^^^                  │
│                                            NEW TAB                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Notification Channels                          [+ Add Channel]     │
│  Configure where to send alert notifications                        │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ 🔔 Engineering Discord          Discord    ✓ Verified    ⋮   │  │
│  │    Used by 3 alerts                                           │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ 📧 On-call Team                 Email      ✓ Verified    ⋮   │  │
│  │    Used by 5 alerts                                           │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ 💬 Ops Slack                    Slack      ○ Not verified ⋮   │  │
│  │    Used by 0 alerts                                           │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 2. Add Channel Dialog

```
┌─────────────────────────────────────────────────────────────────────┐
│  Add Notification Channel                                      ✕    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Channel Name                                                        │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ Engineering Discord                                              ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  Provider                                                            │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐                    │
│  │ Discord │ │  Email  │ │  Slack  │ │ Webhook │                    │
│  │   ✓     │ │         │ │         │ │         │                    │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘                    │
│                                                                      │
│  Webhook URL                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ https://discord.com/api/webhooks/...                             ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                      │
│                              [Cancel]  [Test & Save]                 │
└─────────────────────────────────────────────────────────────────────┘
```

### 3. Updated Alerts Panel - Link Channel

Replace current "Add Channel" with "Link Channel" dropdown:

```
┌─────────────────────────────────────────────────────────────────────┐
│  Link Notification Channel                                     ✕    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Select channels to notify when this alert triggers:                 │
│                                                                      │
│  ☑ Engineering Discord                                              │
│  ☐ On-call Team                                                     │
│  ☐ Ops Slack                                                        │
│                                                                      │
│  No channels configured?                                             │
│  [Go to Workspace Settings → Channels]                              │
│                                                                      │
│                                          [Cancel]  [Save]            │
└─────────────────────────────────────────────────────────────────────┘
```

---

## File Structure

```
apps/web/src/
├── app/(dashboard)/[workspaceSlug]/settings/
│   └── channels/
│       └── page.tsx                    # New channels settings page
├── components/
│   ├── channels/                       # New folder
│   │   ├── channels-list.tsx           # List of configured channels
│   │   ├── channel-card.tsx            # Individual channel card
│   │   ├── create-channel-dialog.tsx   # Create/edit channel form
│   │   └── link-channel-dialog.tsx     # Link channel to alert
│   └── alerts/
│       ├── alerts-panel.tsx            # Update: use LinkChannelDialog
│       └── add-channel-dialog.tsx      # DEPRECATED → remove
├── hooks/
│   └── use-channels.ts                 # Channel CRUD hooks

packages/api/src/
├── routers/
│   ├── channels.ts                     # New router
│   └── alerts.ts                       # Update: link/unlink endpoints
├── schemas/
│   └── channels.ts                     # New schemas
└── services/
    └── channel.service.ts              # Business logic
```

---

## Implementation Tasks

### Phase 1: Backend (API & Database)
- [ ] Create Prisma migration for `NotificationChannel` and `AlertChannelLink`
- [ ] Create `channels.ts` router with CRUD operations
- [ ] Create `channels.ts` Zod schemas
- [ ] Update `alerts.ts` router with link/unlink endpoints
- [ ] Write migration script for existing `AlertChannel` data

### Phase 2: Settings UI
- [ ] Add "Channels" tab to workspace settings navigation
- [ ] Create `channels-list.tsx` component
- [ ] Create `channel-card.tsx` component
- [ ] Create `create-channel-dialog.tsx` with provider forms
- [ ] Add test notification button

### Phase 3: Alert Integration
- [ ] Create `link-channel-dialog.tsx` component
- [ ] Update `alerts-panel.tsx` to use new dialog
- [ ] Remove deprecated `add-channel-dialog.tsx`
- [ ] Update worker to use new `AlertChannelLink` relation

### Phase 4: Cleanup
- [ ] Remove old `AlertChannel` model after migration verification
- [ ] Update documentation

---

## Success Criteria

1. Users can configure notification channels once in Workspace Settings
2. Channels can be linked to multiple alerts
3. Alert panel shows dropdown of available channels
4. Existing alert channels are migrated to new structure
5. Test notification works from settings page

---

## Estimated Effort

| Phase | Tasks | Estimate |
|-------|-------|----------|
| Phase 1 | Backend | Medium |
| Phase 2 | Settings UI | Medium |
| Phase 3 | Alert Integration | Small |
| Phase 4 | Cleanup | Small |

**Total: Medium complexity**

---

## Dependencies

- Existing alerting infrastructure (#80)
- Workspace settings page structure
- shadcn/ui components (Tabs, Dialog, Card)

---

## Future Enhancements

- Slack OAuth integration (instead of webhook URL)
- PagerDuty integration
- Channel groups (notify multiple channels at once)
- Channel-specific alert templates
