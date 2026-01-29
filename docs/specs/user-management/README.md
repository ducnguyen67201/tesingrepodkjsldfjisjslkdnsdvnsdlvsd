# User Management - Engineering Specs

**EPIC:** #6 - User Management
**Package:** Core Platform

---

## Sprint Breakdown

| Sprint | Focus | Points |
|--------|-------|--------|
| 1 | Core Member Management | 5 |
| 2 | Domain Matcher | 5 |

**Total: 10 points**

---

## Overview

User Management enables team collaboration through direct member additions and domain-based auto-provisioning.

### Core Flow (Simplified)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         How It Works                                     │
└─────────────────────────────────────────────────────────────────────────┘

  1. User signs up     → Created in DB (NO workspace)
  2. User logs in      → Sees "No Workspace" page
  3. Admin adds them   → User becomes workspace member
  4. User refreshes    → Now can access workspace

  OR (with Domain Matcher):

  1. Admin sets up domain matcher: "acme.com" → Acme Workspace
  2. User signs up with "john@acme.com"
  3. Auto-added to Acme Workspace on signup
```

**No email invitations. No tokens. Direct membership.**

### Key Features

| Feature | Description |
|---------|-------------|
| **No Default Workspace** | New users start without any workspace |
| **Direct Add by Email** | Admins add existing users by email |
| **Domain Matcher** | Auto-join based on email domain |
| **No Workspace Page** | Users without access see waiting page |

### Out of Scope (Future)

- Role-based access control (RBAC)
- Email invitation flow with tokens
- SSO/SAML integration

---

## Data Models

### AllowedDomain (NEW)

```prisma
model AllowedDomain {
  id          String        @id
  workspaceId String
  domain      String        @unique  // e.g., "acme.com"
  role        WorkspaceRole          // MEMBER or ADMIN
  createdById String
}
```

**Key constraint:** One domain = one workspace globally. A domain cannot be claimed by multiple workspaces.

---

## API Endpoints

### Member Management

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `workspaces.addMember` | Mutation | Admin | Add user by email |
| `workspaces.removeMember` | Mutation | Admin | Remove member |
| `workspaces.listMembers` | Query | Admin | List all members |

### Domain Matcher

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `domains.list` | Query | Admin | List allowed domains |
| `domains.create` | Mutation | Admin | Add domain to workspace |
| `domains.delete` | Mutation | Admin | Remove domain |

---

## User Flows

### Flow 1: Admin Adds Member

```
Admin → Settings → Members → "Add Member"
  ↓
Enter email: "john@example.com"
  ↓
API checks: Does user exist?
  ├── YES → Create WorkspaceMember → Success!
  └── NO  → Error: "User must sign up first"
```

### Flow 2: Domain Matcher Auto-Join

```
Admin → Settings → Domains → "Add Domain"
  ↓
Enter: "acme.com" (role: MEMBER)
  ↓
Saved to AllowedDomain table

--- Later ---

New user signs up: "alice@acme.com"
  ↓
Signup checks AllowedDomain for "acme.com"
  ↓
Match found! Auto-create WorkspaceMember
  ↓
Alice redirected to Acme workspace
```

---

## Quick Reference

### Sprint 1 Tasks (Core)
- [ ] Remove auto-workspace on signup
- [ ] Create `/no-workspace` page
- [ ] Add `workspaces.addMember` endpoint
- [ ] Add Member dialog UI
- [ ] Middleware redirect for no-workspace users

### Sprint 2 Tasks (Domain Matcher)
- [ ] Add `AllowedDomain` model + migration
- [ ] Create `domains` tRPC router
- [ ] Domain matcher service
- [ ] Integrate into signup flow
- [ ] Domain settings UI

---

## Spec Document

Full specification: [01_USER_MANAGEMENT_SPEC.md](./01_USER_MANAGEMENT_SPEC.md)
