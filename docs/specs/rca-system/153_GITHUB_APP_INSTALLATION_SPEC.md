# Engineering Spec: #133 GitHub App Installation Flow

**Story Points:** 5
**Priority:** P0
**Sprint:** Sprint 1 - Foundation (UI Debt)
**Dependencies:** #132 GitHub Settings UI

---

## Overview

Implement the GitHub App OAuth installation flow that allows users to connect their GitHub account to a workspace. This enables Ducsigr to access repositories for code indexing.

---

## User Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        GitHub App Installation Flow                          │
└─────────────────────────────────────────────────────────────────────────────┘

  User clicks "Connect GitHub"
           │
           ▼
  ┌─────────────────────┐
  │ /api/github/install │  ← Verify auth + workspace access
  │                     │  ← Generate state token
  │                     │  ← Redirect to GitHub
  └──────────┬──────────┘
             │
             ▼
  ┌─────────────────────────────────────────┐
  │         GitHub App Install Page         │
  │  https://github.com/apps/{app}/install  │
  │                                         │
  │  ┌─────────────────────────────────┐   │
  │  │  Install Ducsigr App        │   │
  │  │                                 │   │
  │  │  [Select repositories]         │   │
  │  │  ○ All repositories            │   │
  │  │  ○ Only select repositories    │   │
  │  │                                 │   │
  │  │  [Install & Authorize]         │   │
  │  └─────────────────────────────────┘   │
  └──────────┬──────────────────────────────┘
             │
             ▼
  ┌──────────────────────┐
  │ /api/github/callback │  ← Verify state token
  │                      │  ← Exchange for installation ID
  │                      │  ← Fetch accessible repos from GitHub API
  │                      │  ← Store installation + repos in DB
  │                      │  ← Redirect to settings page
  └──────────┬───────────┘
             │
             ▼
  ┌──────────────────────────────────────────┐
  │  /workspace/{slug}/settings/repositories │
  │                                          │
  │  ✅ GitHub Connected: @username          │
  │                                          │
  │  Repositories (57)                       │
  │  ├── repo-1         ○ DISABLED           │
  │  ├── repo-2         ○ DISABLED           │
  │  └── repo-3         ○ DISABLED           │
  └──────────────────────────────────────────┘
```

---

## Acceptance Criteria

- [ ] Clicking "Connect GitHub" redirects to GitHub App installation
- [ ] State token prevents CSRF attacks
- [ ] Callback validates state and processes installation
- [ ] All accessible repositories are synced to database
- [ ] User is redirected back to settings page after installation
- [ ] Error states are handled gracefully (user cancels, invalid state, etc.)
- [ ] Existing installation can be updated (add/remove repos)
- [ ] Installation can be disconnected from workspace

---

## Technical Architecture

### Environment Variables

```bash
# GitHub App Configuration
GITHUB_APP_ID="123456"
GITHUB_APP_NAME="ducsigr-dev"           # App slug for install URL
GITHUB_APP_CLIENT_ID="Iv1.abc123..."
GITHUB_APP_CLIENT_SECRET="secret..."
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA..."  # For API authentication
GITHUB_APP_WEBHOOK_SECRET="webhook-secret"  # Already exists as GITHUB_WEBHOOK_SECRET
```

### API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/github/install` | GET | Redirect to GitHub App installation |
| `/api/github/callback` | GET | Handle OAuth callback from GitHub |
| `/api/github/disconnect` | POST | Remove GitHub installation from workspace |

---

## Implementation Details

### Route 1: `/api/github/install`

**Purpose:** Initiate GitHub App installation

**Flow:**
1. Verify user is authenticated
2. Verify user has OWNER/ADMIN role in workspace
3. Check if GitHub App is configured (env vars)
4. Generate secure state token (signed JWT or encrypted payload)
5. Redirect to `https://github.com/apps/{GITHUB_APP_NAME}/installations/new?state={token}`

**State Token Payload:**
```typescript
interface InstallState {
  workspaceId: string;
  workspaceSlug: string;
  userId: string;
  timestamp: number;  // For expiry check
  nonce: string;      // Random value for uniqueness
}
```

**Code:**
```typescript
// apps/web/src/app/api/github/install/route.ts

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@ducsigr/db";
import { SignJWT } from "jose";

const GITHUB_APP_NAME = process.env.GITHUB_APP_NAME;
const STATE_SECRET = process.env.GITHUB_STATE_SECRET || process.env.AUTH_SECRET;

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const workspaceSlug = searchParams.get("workspace");

  // 1. Verify authentication
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // 2. Verify workspace access
  if (!workspaceSlug) {
    return NextResponse.redirect(new URL("/error?code=missing_workspace", request.url));
  }

  const workspace = await prisma.workspace.findFirst({
    where: {
      slug: workspaceSlug,
      members: {
        some: {
          userId: session.user.id,
          role: { in: ["OWNER", "ADMIN"] },
        },
      },
    },
  });

  if (!workspace) {
    return NextResponse.redirect(new URL("/error?code=workspace_not_found", request.url));
  }

  // 3. Check GitHub App configuration
  if (!GITHUB_APP_NAME) {
    return NextResponse.redirect(new URL("/error?code=github_not_configured", request.url));
  }

  // 4. Generate signed state token
  const state = await new SignJWT({
    workspaceId: workspace.id,
    workspaceSlug: workspace.slug,
    userId: session.user.id,
    nonce: crypto.randomUUID(),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(new TextEncoder().encode(STATE_SECRET));

  // 5. Redirect to GitHub
  const installUrl = `https://github.com/apps/${GITHUB_APP_NAME}/installations/new`;
  const redirectUrl = new URL(installUrl);
  redirectUrl.searchParams.set("state", state);

  return NextResponse.redirect(redirectUrl.toString());
}
```

---

### Route 2: `/api/github/callback`

**Purpose:** Handle GitHub's redirect after installation

**GitHub Callback Parameters:**
- `installation_id` - The GitHub App installation ID
- `setup_action` - Either "install" or "update"
- `state` - Our state token (for verification)

**Flow:**
1. Verify state token (signature + expiry)
2. Extract workspace info from state
3. Fetch installation details from GitHub API
4. Fetch accessible repositories from GitHub API
5. Store/update installation in database
6. Sync repositories to database
7. Redirect to workspace settings

**Code:**
```typescript
// apps/web/src/app/api/github/callback/route.ts

import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { prisma } from "@ducsigr/db";
import { Octokit } from "@octokit/rest";
import { createAppAuth } from "@octokit/auth-app";

const STATE_SECRET = process.env.GITHUB_STATE_SECRET || process.env.AUTH_SECRET;
const GITHUB_APP_ID = process.env.GITHUB_APP_ID;
const GITHUB_APP_PRIVATE_KEY = process.env.GITHUB_APP_PRIVATE_KEY;

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const installationId = searchParams.get("installation_id");
  const setupAction = searchParams.get("setup_action");
  const state = searchParams.get("state");

  // 1. Handle user cancellation
  if (!installationId) {
    const error = searchParams.get("error");
    if (error === "access_denied") {
      return NextResponse.redirect(new URL("/error?code=github_cancelled", request.url));
    }
    return NextResponse.redirect(new URL("/error?code=missing_installation", request.url));
  }

  // 2. Verify state token
  if (!state) {
    return NextResponse.redirect(new URL("/error?code=invalid_state", request.url));
  }

  let payload: {
    workspaceId: string;
    workspaceSlug: string;
    userId: string;
  };

  try {
    const { payload: verified } = await jwtVerify(
      state,
      new TextEncoder().encode(STATE_SECRET)
    );
    payload = verified as typeof payload;
  } catch {
    return NextResponse.redirect(new URL("/error?code=invalid_state", request.url));
  }

  // 3. Create GitHub App authenticated client
  const octokit = new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: GITHUB_APP_ID,
      privateKey: GITHUB_APP_PRIVATE_KEY,
      installationId: Number(installationId),
    },
  });

  // 4. Fetch installation details
  const { data: installation } = await octokit.apps.getInstallation({
    installation_id: Number(installationId),
  });

  // 5. Fetch accessible repositories
  const { data: reposResponse } = await octokit.apps.listReposAccessibleToInstallation({
    per_page: 100,
  });

  // 6. Store installation in database
  const dbInstallation = await prisma.gitHubInstallation.upsert({
    where: { workspaceId: payload.workspaceId },
    create: {
      workspaceId: payload.workspaceId,
      installationId: BigInt(installationId),
      accountLogin: installation.account?.login || "unknown",
      accountType: installation.account?.type || "User",
    },
    update: {
      installationId: BigInt(installationId),
      accountLogin: installation.account?.login || "unknown",
      accountType: installation.account?.type || "User",
    },
  });

  // 7. Sync repositories
  const repos = reposResponse.repositories;

  for (const repo of repos) {
    await prisma.gitHubRepository.upsert({
      where: { githubId: BigInt(repo.id) },
      create: {
        installationId: dbInstallation.id,
        githubId: BigInt(repo.id),
        owner: repo.owner.login,
        repo: repo.name,
        fullName: repo.full_name,
        defaultBranch: repo.default_branch || "main",
        isPrivate: repo.private,
        enabled: false,  // User must explicitly enable
      },
      update: {
        installationId: dbInstallation.id,
        owner: repo.owner.login,
        repo: repo.name,
        fullName: repo.full_name,
        defaultBranch: repo.default_branch || "main",
        isPrivate: repo.private,
      },
    });
  }

  // 8. Redirect to settings page
  const redirectUrl = new URL(
    `/workspace/${payload.workspaceSlug}/settings/repositories`,
    request.url
  );
  redirectUrl.searchParams.set("connected", "true");

  return NextResponse.redirect(redirectUrl.toString());
}
```

---

### Route 3: `/api/github/disconnect` (Optional)

**Purpose:** Remove GitHub installation from workspace

**Flow:**
1. Verify user is authenticated and has admin access
2. Delete installation and all repositories from database
3. Optionally revoke installation on GitHub (via API)

---

## Error Handling

| Error Code | Description | User Message |
|------------|-------------|--------------|
| `missing_workspace` | No workspace param | "Missing workspace. Please try again." |
| `workspace_not_found` | Invalid workspace or no access | "Workspace not found or you don't have admin access." |
| `github_not_configured` | Missing env vars | "GitHub integration is not configured." |
| `github_cancelled` | User clicked cancel | "GitHub authorization was cancelled." |
| `invalid_state` | State token invalid/expired | "Session expired. Please try again." |
| `missing_installation` | No installation_id in callback | "GitHub installation failed. Please try again." |
| `github_api_error` | GitHub API failure | "Failed to connect to GitHub. Please try again." |

---

## Dependencies

### NPM Packages

```json
{
  "dependencies": {
    "@octokit/rest": "^20.0.0",
    "@octokit/auth-app": "^6.0.0",
    "jose": "^5.0.0"
  }
}
```

### GitHub App Setup

1. Create GitHub App at https://github.com/settings/apps/new
2. Configure:
   - **App Name:** `ducsigr-dev` (or production name)
   - **Homepage URL:** `https://ducsigr.com`
   - **Callback URL:** `https://app.ducsigr.com/api/github/callback`
   - **Setup URL:** `https://app.ducsigr.com/api/github/callback`
   - **Webhook URL:** `https://app.ducsigr.com/api/webhooks/github`
   - **Permissions:**
     - Repository contents: Read
     - Metadata: Read
     - Pull requests: Read
   - **Events:**
     - Push
     - Pull request
3. Generate private key and download
4. Note App ID and Client credentials

---

## Files to Create/Modify

### New Files

| File | Description |
|------|-------------|
| `apps/web/src/app/api/github/install/route.ts` | Install redirect route |
| `apps/web/src/app/api/github/callback/route.ts` | OAuth callback handler |
| `apps/web/src/lib/github.ts` | GitHub API utilities |

### Modified Files

| File | Changes |
|------|---------|
| `.env.example` | Add GitHub App env vars |
| `apps/web/package.json` | Add @octokit dependencies |
| `apps/web/src/components/github/github-empty-state.tsx` | Update connect URL |

---

## Security Considerations

1. **State Token:** Use signed JWT with short expiry (10 min)
2. **CSRF Protection:** State token prevents cross-site request forgery
3. **Installation Validation:** Verify installation belongs to expected account
4. **Rate Limiting:** GitHub API has rate limits, handle gracefully
5. **Private Key Security:** Never expose in client-side code or logs

---

## Testing Checklist

- [ ] Click "Connect GitHub" redirects to GitHub
- [ ] Canceling on GitHub shows friendly error
- [ ] Completing installation syncs repositories
- [ ] State token expiry is enforced (wait 10+ min, should fail)
- [ ] Invalid state token is rejected
- [ ] Repositories appear in settings after connection
- [ ] Re-installing updates repositories (doesn't duplicate)
- [ ] Multiple workspaces can connect same GitHub account

---

## Future Enhancements

| Enhancement | Priority | Description |
|-------------|----------|-------------|
| Repository selection during install | P2 | Let user choose repos during OAuth |
| Webhook auto-configuration | P1 | Auto-register webhooks on enable |
| Installation health check | P3 | Verify installation is still valid |
| Organization support | P2 | Handle org-level installations |
| Repository sync job | P2 | Periodic sync of new/removed repos |
