# GitHub App Integration - Implementation Specification

**Ticket:** #128 - Database schema for GitHub indexing
**Sprint:** RCA Sprint 1 (Foundation)
**Story Points:** 3 (expanded to include full integration)
**Priority:** P0

---

## 1. Overview

### Problem Statement
Users need to connect their GitHub repositories to Ducsigr for automated Root Cause Analysis (RCA). When alerts fire, the system should correlate them with recent code changes by indexing the codebase.

### Solution
Build a GitHub App integration that allows users to:
1. Click "Connect GitHub" in project settings
2. Get redirected to GitHub to install the Ducsigr App
3. Select which repositories to grant access to
4. Return to Ducsigr where repos are synced and indexing begins automatically

### Why GitHub App (not OAuth)
| Feature | GitHub App | OAuth App |
|---------|------------|-----------|
| Permissions | Fine-grained (only what's needed) | Broad scopes |
| Token lifetime | Short-lived (1 hour) | Until revoked |
| Webhooks | Built-in, auto-configured | Manual setup per repo |
| Rate limits | Higher, scales with repos | Fixed, lower |
| User control | Select specific repos | All repos user can access |
| Independence | Works after user leaves org | Tied to user account |

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    GITHUB APP INTEGRATION FLOW                          │
└─────────────────────────────────────────────────────────────────────────┘

User clicks "Connect GitHub"
         │
         ▼
┌────────────────────────────────────────┐
│  /api/github/install                   │
│  - Validate user session               │
│  - Generate CSRF state token           │
│  - Redirect to GitHub App install URL  │
└────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────┐
│  GitHub.com                            │
│  - User authenticates (if needed)      │
│  - User selects repos to grant access  │
│  - GitHub creates installation         │
│  - GitHub sends webhook (installation) │
└────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────┐
│  /api/github/callback                  │
│  - Validate CSRF state token           │
│  - Receive installation_id             │
│  - Store installation → project link   │
│  - Fetch and sync repositories list    │
│  - Redirect to project settings        │
└────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────┐
│  /api/github/webhook                   │
│  - Verify X-Hub-Signature-256          │
│  - Parse event type (push, PR, etc.)   │
│  - Look up repository in database      │
│  - Start Temporal indexing workflow    │
│  - Return 200 immediately              │
└────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────┐
│  Temporal: repositoryIndexingWorkflow  │
│  - Fetch commits via GitHub API        │
│  - Filter indexable files              │
│  - Chunk code semantically             │
│  - Persist via tRPC internal router    │
│  - Update repository index status      │
└────────────────────────────────────────┘
```

---

## 3. Database Schema

### New Enums

```prisma
enum GitHubInstallationStatus {
  ACTIVE      // Installation is active and working
  SUSPENDED   // User suspended the installation
  UNINSTALLED // User removed the installation
}

enum RepositoryIndexStatus {
  PENDING   // Not yet indexed
  INDEXING  // Currently being indexed
  INDEXED   // Successfully indexed
  FAILED    // Indexing failed
}
```

### New Models

#### GitHubInstallation
Links a Ducsigr project to a GitHub App installation.

```prisma
model GitHubInstallation {
  id              String                   @id @default(cuid())
  projectId       String
  project         Project                  @relation(fields: [projectId], references: [id], onDelete: Cascade)

  installationId  BigInt                   @unique  // GitHub's installation ID
  accountLogin    String                            // GitHub org/user login (e.g., "ducsigr")
  accountType     String                            // "Organization" or "User"
  status          GitHubInstallationStatus @default(ACTIVE)

  createdAt       DateTime                 @default(now())
  updatedAt       DateTime                 @updatedAt

  repositories    GitHubRepository[]

  @@index([projectId])
  @@map("github_installations")
}
```

#### GitHubRepository
Stores metadata about repositories the app has access to.

```prisma
model GitHubRepository {
  id              String                @id @default(cuid())
  installationId  String
  installation    GitHubInstallation    @relation(fields: [installationId], references: [id], onDelete: Cascade)

  githubId        BigInt                @unique  // GitHub's repo ID
  owner           String                          // e.g., "ducsigr"
  name            String                          // e.g., "web-app"
  fullName        String                          // e.g., "ducsigr/web-app"
  defaultBranch   String                @default("main")
  isPrivate       Boolean               @default(true)

  indexStatus     RepositoryIndexStatus @default(PENDING)
  lastIndexedAt   DateTime?
  lastIndexedSha  String?               // Last commit SHA that was indexed
  indexingError   String?               // Error message if indexing failed

  createdAt       DateTime              @default(now())
  updatedAt       DateTime              @updatedAt

  commits         GitCommit[]
  pullRequests    GitPullRequest[]
  codeChunks      CodeChunk[]

  @@unique([installationId, fullName])
  @@index([indexStatus])
  @@map("github_repositories")
}
```

#### GitCommit
Stores commit metadata for correlation with alerts.

```prisma
model GitCommit {
  id            String           @id @default(cuid())
  repositoryId  String
  repository    GitHubRepository @relation(fields: [repositoryId], references: [id], onDelete: Cascade)

  sha           String
  message       String           @db.Text
  authorName    String
  authorEmail   String
  committedAt   DateTime
  filesChanged  Int              @default(0)

  createdAt     DateTime         @default(now())

  @@unique([repositoryId, sha])
  @@index([repositoryId, committedAt(sort: Desc)])
  @@map("git_commits")
}
```

#### GitPullRequest
Stores PR metadata for correlation with alerts.

```prisma
model GitPullRequest {
  id           String           @id @default(cuid())
  repositoryId String
  repository   GitHubRepository @relation(fields: [repositoryId], references: [id], onDelete: Cascade)

  number       Int
  title        String
  state        String           // "open", "closed", "merged"
  authorLogin  String
  mergedAt     DateTime?

  createdAt    DateTime         @default(now())

  @@unique([repositoryId, number])
  @@map("git_pull_requests")
}
```

#### CodeChunk
Stores indexed code chunks for semantic search.

```prisma
model CodeChunk {
  id           String           @id @default(cuid())
  repositoryId String
  repository   GitHubRepository @relation(fields: [repositoryId], references: [id], onDelete: Cascade)

  filePath     String           // e.g., "src/components/Button.tsx"
  startLine    Int
  endLine      Int
  content      String           @db.Text
  contentHash  String           // SHA256 for deduplication/caching
  language     String?          // Detected language
  commitSha    String           // Commit this chunk was extracted from

  createdAt    DateTime         @default(now())

  @@index([repositoryId, filePath])
  @@index([contentHash])
  @@map("code_chunks")
}
```

#### AlertRCA
Stores RCA analysis results (for Sprint 3+).

```prisma
model AlertRCA {
  id             String   @id @default(cuid())
  alertHistoryId String

  hypothesis     String   @db.Text  // AI-generated root cause hypothesis
  confidence     Float              // 0.0 - 1.0 confidence score
  analysis       Json               // Detailed analysis data
  relatedCommits String[]           // Array of commit IDs

  createdAt      DateTime @default(now())

  @@index([alertHistoryId])
  @@map("alert_rca")
}
```

### Relation Updates

Add to existing `Project` model:
```prisma
model Project {
  // ... existing fields
  githubInstallations GitHubInstallation[]
}
```

---

## 4. Environment Variables

Add to `apps/web/src/lib/env.ts`:

```typescript
// GitHub App Configuration
GITHUB_APP_ID: z.string().min(1, "GITHUB_APP_ID is required"),
GITHUB_APP_NAME: z.string().min(1, "GITHUB_APP_NAME is required"),
GITHUB_APP_CLIENT_ID: z.string().min(1, "GITHUB_APP_CLIENT_ID is required"),
GITHUB_APP_CLIENT_SECRET: z.string().min(1, "GITHUB_APP_CLIENT_SECRET is required"),
GITHUB_APP_PRIVATE_KEY: z.string().min(1, "GITHUB_APP_PRIVATE_KEY is required"),
GITHUB_APP_WEBHOOK_SECRET: z.string().min(32, "Webhook secret must be at least 32 characters"),
```

Add to `.env.example`:
```bash
# GitHub App (for repository indexing)
GITHUB_APP_ID=""
GITHUB_APP_NAME=""
GITHUB_APP_CLIENT_ID=""
GITHUB_APP_CLIENT_SECRET=""
GITHUB_APP_PRIVATE_KEY=""
GITHUB_APP_WEBHOOK_SECRET=""
```

---

## 5. Implementation Phases

### Phase 1: Database Schema & Environment
**Files:**
- `packages/db/prisma/schema.prisma`
- `apps/web/src/lib/env.ts`
- `.env.example`

**Tasks:**
1. Add enums: `GitHubInstallationStatus`, `RepositoryIndexStatus`
2. Add models: `GitHubInstallation`, `GitHubRepository`, `GitCommit`, `GitPullRequest`, `CodeChunk`, `AlertRCA`
3. Add relation to `Project` model
4. Add environment variable schemas
5. Run migration: `pnpm db:migrate:dev --name add_github_integration`

---

### Phase 2: Zod Schemas
**File:** `packages/api/src/schemas/github.ts` (new)

**Tasks:**
1. Define enum schemas: `GitHubInstallationStatusSchema`, `RepositoryIndexStatusSchema`
2. Define input schemas for tRPC procedures
3. Define webhook payload schemas for validation
4. Define workflow input/output types
5. Export label constants for UI
6. Update `packages/api/src/schemas/index.ts` to export

---

### Phase 3: GitHub Utility Library
**Files:** `packages/api/src/lib/github/` (new directory)

| File | Purpose |
|------|---------|
| `client.ts` | `GitHubAppClient` class using @octokit/app |
| `webhook.ts` | `verifyWebhookSignature()` function |
| `state.ts` | CSRF state token generation/verification |
| `chunker.ts` | Code chunking utilities |
| `index.ts` | Re-exports |

**Tasks:**
1. Install dependencies: `pnpm add @octokit/app @octokit/rest --filter @ducsigr/api`
2. Implement `GitHubAppClient` with methods: `listRepositories`, `getCommit`, `getTree`, `getBlob`
3. Implement webhook signature verification using HMAC-SHA256
4. Implement state token generation using JWT
5. Implement code chunking with language detection

---

### Phase 4: API Routes
**Files:** `apps/web/src/app/api/github/` (new directory)

| Route | Method | Purpose |
|-------|--------|---------|
| `install/route.ts` | GET | Redirect to GitHub App installation |
| `callback/route.ts` | GET | Handle return from GitHub |
| `webhook/route.ts` | POST | Receive GitHub webhook events |

**Tasks:**
1. Implement install route with state token generation
2. Implement callback route with installation processing
3. Implement webhook route with signature verification
4. Add webhook handlers for push, pull_request, installation events

---

### Phase 5: tRPC Router
**Files:**
- `packages/api/src/routers/github.ts` (new)
- `packages/api/src/routers/internal.ts` (add procedures)
- `packages/api/src/routers/index.ts` (update)

**tRPC Procedures:**
| Procedure | Type | Purpose |
|-----------|------|---------|
| `listInstallations` | Query | List GitHub installations for project |
| `getInstallation` | Query | Get installation with repositories |
| `removeInstallation` | Mutation | Mark installation as uninstalled |
| `listRepositories` | Query | List repositories for project |
| `getRepository` | Query | Get repository with recent commits |
| `syncRepositories` | Mutation | Fetch latest repos from GitHub |
| `triggerIndexing` | Mutation | Start manual indexing workflow |

**Internal Procedures (for Temporal):**
| Procedure | Purpose |
|-----------|---------|
| `persistCommit` | Upsert commit record |
| `persistCodeChunks` | Replace chunks for files |
| `updateRepositoryIndexStatus` | Update repo status |

---

### Phase 6: Temporal Workflow
**Files:**
- `apps/worker/src/temporal/types.ts` (add types)
- `apps/worker/src/temporal/activities/github.activities.ts` (new)
- `apps/worker/src/temporal/activities/index.ts` (update)
- `apps/worker/src/workflows/github.workflow.ts` (new)
- `apps/worker/src/workflows/index.ts` (update)

**Workflow:** `repositoryIndexingWorkflow`
1. Update status to INDEXING
2. Fetch commits from GitHub API
3. For each commit, fetch changed files
4. Filter indexable files (skip node_modules, etc.)
5. Chunk code semantically
6. Persist chunks via tRPC internal
7. Update status to INDEXED (or FAILED)

**Activities:**
| Activity | Purpose |
|----------|---------|
| `fetchCommits` | Fetch commits from GitHub API |
| `fetchAndChunkFiles` | Fetch file content and chunk |
| `persistCommit` | Call tRPC internal.persistCommit |
| `updateIndexStatus` | Call tRPC internal.updateRepositoryIndexStatus |

---

### Phase 7: Frontend Components
**Files:** `apps/web/src/components/github/` (new directory)

| Component | Purpose |
|-----------|---------|
| `connect-github-button.tsx` | Button to initiate GitHub connection |
| `repository-list.tsx` | Table of repositories with status |
| `installation-card.tsx` | Card showing GitHub account info |
| `index.ts` | Re-exports |

---

### Phase 8: Settings Page & Navigation
**Files:**
- `apps/web/src/app/workspace/[workspaceSlug]/projects/[projectId]/settings/integrations/page.tsx` (new)
- `apps/web/src/lib/success.ts` (add toasts)
- `apps/web/src/lib/errors.ts` (add error handlers)

**Tasks:**
1. Create integrations settings page
2. Add GitHub section with connect/manage UI
3. Add toast handlers for success/error states
4. Add navigation link to integrations page

---

## 6. GitHub App Setup Instructions

### Create GitHub App

1. Go to https://github.com/settings/apps/new
2. Fill in:
   - **App name:** `Ducsigr-Dev` (or your name)
   - **Homepage URL:** `http://localhost:3000`
   - **Callback URL:** `http://localhost:3000/api/github/callback`
   - **Setup URL:** `http://localhost:3000/api/github/callback`
   - **Webhook URL:** Use ngrok URL (e.g., `https://abc123.ngrok.io/api/github/webhook`)
   - **Webhook secret:** Generate a 32+ character secret

3. Set Permissions:
   - **Repository permissions:**
     - Contents: Read-only
     - Metadata: Read-only
     - Pull requests: Read-only
   - **Subscribe to events:**
     - Push
     - Pull request
     - Installation

4. After creation:
   - Note the **App ID**
   - Note the **Client ID**
   - Generate and note the **Client secret**
   - Generate a **Private key** (downloads .pem file)

5. Set environment variables with the values

---

## 7. Testing Plan

### Unit Tests
- [ ] Code chunker handles various languages
- [ ] Webhook signature verification
- [ ] State token generation/verification

### Integration Tests
- [ ] GitHub App installation flow (with ngrok)
- [ ] Repository sync from GitHub API
- [ ] Webhook delivery and processing
- [ ] Temporal workflow execution

### Manual Testing
- [ ] Install GitHub App on test repo
- [ ] Verify repos appear in UI
- [ ] Trigger manual indexing
- [ ] Push commit and verify webhook triggers indexing
- [ ] Verify code chunks are created

---

## 8. Security Considerations (Open-Source Audit)

### 8.1 Critical Security Requirements

| Category | Requirement | Implementation |
|----------|-------------|----------------|
| **Secrets** | Never log secrets | Filter `GITHUB_APP_*` from logs |
| **Tokens** | Never store access tokens | Fetch on-demand via @octokit/app |
| **Webhooks** | Always verify signature | `timingSafeEqual()` for HMAC |
| **State** | Expire state tokens | 10-minute TTL in Redis |
| **Errors** | Sanitize error messages | Generic messages to clients |
| **Rate Limit** | Protect webhook endpoint | Rate limit by IP |

### 8.2 No Token Storage Policy

**GitHub Installation Access Tokens are NEVER stored in the database.**

```typescript
// CORRECT: Fetch token on-demand (auto-refreshes, 1-hour lifetime)
const octokit = await app.getInstallationOctokit(installationId);

// WRONG: Never store tokens
await prisma.gitHubInstallation.update({
  data: { accessToken: token } // NEVER DO THIS
});
```

The `@octokit/app` library handles token refresh automatically. We only store the `installationId` (a public identifier).

### 8.3 Webhook Security

```typescript
// Constant-time comparison to prevent timing attacks
import { timingSafeEqual, createHmac } from "crypto";

export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  if (!signature || !secret) return false;

  const expected = `sha256=${createHmac("sha256", secret)
    .update(payload, "utf8")
    .digest("hex")}`;

  // MUST use timingSafeEqual to prevent timing attacks
  try {
    return timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    );
  } catch {
    return false; // Lengths differ
  }
}
```

### 8.4 State Token Security (CSRF Protection)

```typescript
// State token structure (signed JWT)
interface StatePayload {
  userId: string;
  projectId: string;
  workspaceSlug: string;
  nonce: string;    // Random bytes for uniqueness
  exp: number;      // 10-minute expiration
}

// Storage: Redis with TTL (prevents replay attacks)
await redis.setex(`github:state:${nonce}`, 600, JSON.stringify(payload));

// Verification: Delete after use (one-time use)
const stored = await redis.get(`github:state:${nonce}`);
if (!stored) throw new Error("Invalid or expired state");
await redis.del(`github:state:${nonce}`);  // Prevent replay
```

### 8.5 Error Sanitization

```typescript
// WRONG: Leaks internal details
catch (error) {
  return NextResponse.json({ error: error.message }, { status: 500 });
}

// CORRECT: Generic message to client, detailed log server-side
catch (error) {
  console.error("[GitHub Webhook] Processing error:", {
    deliveryId,
    event,
    error: error instanceof Error ? error.message : "Unknown",
    // NEVER log: payload, tokens, secrets
  });
  return NextResponse.json(
    { error: "Failed to process webhook" },
    { status: 500 }
  );
}
```

### 8.6 Logging Security Rules

**Never log:**
- `GITHUB_APP_PRIVATE_KEY`
- `GITHUB_APP_CLIENT_SECRET`
- `GITHUB_APP_WEBHOOK_SECRET`
- Access tokens
- Full webhook payloads (may contain sensitive commit data)

**Safe to log:**
- Delivery ID
- Event type
- Repository full name
- Installation ID
- Error messages (sanitized)

```typescript
// Example safe logging
console.log("[GitHub] Webhook received", {
  deliveryId: headers.get("x-github-delivery"),
  event: headers.get("x-github-event"),
  repo: payload.repository?.full_name,
  installationId: payload.installation?.id,
});
```

### 8.7 Rate Limiting (Webhook Endpoint)

Protect `/api/github/webhook` from abuse:

```typescript
// Using existing rate limiting pattern or add:
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(100, "1 m"), // 100 requests/minute
});

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  const { success } = await ratelimit.limit(`github-webhook:${ip}`);

  if (!success) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }
  // ... rest of handler
}
```

### 8.8 Input Validation

All GitHub payloads MUST be validated with Zod before processing:

```typescript
// WRONG: Trust GitHub blindly
const { repository, commits } = JSON.parse(body);

// CORRECT: Validate everything
const parseResult = WebhookPushPayloadSchema.safeParse(JSON.parse(body));
if (!parseResult.success) {
  console.error("[GitHub] Invalid payload", parseResult.error.flatten());
  return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
}
const { repository, commits } = parseResult.data;
```

### 8.9 Private Key Handling

The GitHub App private key is multi-line PEM format:

```typescript
// Environment variable contains escaped newlines
// GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----"

// Must convert \n to actual newlines
const privateKey = env.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, "\n");

const app = new App({
  appId: env.GITHUB_APP_ID,
  privateKey,  // Now proper PEM format
  // ...
});
```

### 8.10 Database Security

- **No sensitive data in database**: Only store installation ID (public), not tokens
- **Cascade deletes**: When project deleted, all GitHub data deleted
- **Index by ID not secrets**: Never index or query by secret values

### 8.11 Content Indexing Security

When indexing code:
- **Skip `.env` files**: Never index files matching `.env*` pattern
- **Skip secrets files**: Skip `*credentials*`, `*secrets*`, `*.pem`, `*.key`
- **Size limits**: Skip files > 1MB to prevent DoS

```typescript
const SKIP_PATTERNS = [
  /\.env/,
  /credentials/i,
  /secrets/i,
  /\.pem$/,
  /\.key$/,
  /\.p12$/,
  /\.pfx$/,
  /id_rsa/,
  /id_ed25519/,
];

function shouldIndexFile(path: string, size: number): boolean {
  if (size > 1_000_000) return false; // Skip > 1MB
  if (SKIP_PATTERNS.some(p => p.test(path))) return false;
  return INDEXABLE_EXTENSIONS.some(ext => path.endsWith(ext));
}
```

### 8.12 Security Checklist

Before deployment, verify:

- [ ] Webhook signature verification uses `timingSafeEqual()`
- [ ] State tokens expire after 10 minutes
- [ ] State tokens are one-time use (deleted after verification)
- [ ] No tokens stored in database
- [ ] Error messages don't leak internal details
- [ ] Logs don't contain secrets or tokens
- [ ] `.env` files are never indexed
- [ ] Rate limiting enabled on webhook endpoint
- [ ] All GitHub payloads validated with Zod
- [ ] Private key newlines properly converted

---

## 9. Dependencies

```bash
# Add to @ducsigr/api
pnpm add @octokit/app @octokit/rest --filter @ducsigr/api
```

---

## 10. Files Summary

| Category | Files |
|----------|-------|
| **Database** | `packages/db/prisma/schema.prisma` |
| **Environment** | `apps/web/src/lib/env.ts`, `.env.example` |
| **Schemas** | `packages/api/src/schemas/github.ts` |
| **Library** | `packages/api/src/lib/github/*.ts` |
| **API Routes** | `apps/web/src/app/api/github/*.ts` |
| **tRPC** | `packages/api/src/routers/github.ts`, `internal.ts` |
| **Temporal** | `apps/worker/src/workflows/github.workflow.ts`, `temporal/activities/github.activities.ts` |
| **Frontend** | `apps/web/src/components/github/*.tsx` |
| **Settings** | `apps/web/src/app/.../settings/integrations/page.tsx` |
| **Toasts** | `apps/web/src/lib/success.ts`, `apps/web/src/lib/errors.ts` |

---

## 11. References

- [GitHub Apps vs OAuth Apps](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/differences-between-github-apps-and-oauth-apps)
- [Creating a GitHub App](https://docs.github.com/en/apps/creating-github-apps/about-creating-github-apps/about-creating-github-apps)
- [Octokit.js](https://github.com/octokit/octokit.js)
- [Webhook Events](https://docs.github.com/en/webhooks/webhook-events-and-payloads)
