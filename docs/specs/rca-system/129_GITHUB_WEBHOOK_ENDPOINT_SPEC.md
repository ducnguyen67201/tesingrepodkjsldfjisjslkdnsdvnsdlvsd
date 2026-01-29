# Engineering Spec: #129 GitHub Webhook Receiver Endpoint

**Story Points:** 5
**Priority:** P0
**Sprint:** Sprint 1 - Foundation
**Dependencies:** #128 (Database Schema - Completed)

---

## Overview

Create an API endpoint that receives GitHub webhook events (push, pull_request) and validates the payload signature. This endpoint will trigger the GitHub indexing workflow via Temporal.

---

## Acceptance Criteria

- [ ] `POST /api/webhooks/github` endpoint created
- [ ] Validates `X-Hub-Signature-256` header using HMAC-SHA256
- [ ] Handles `push` events (commits to default branch)
- [ ] Handles `pull_request` events (opened, closed, merged)
- [ ] Returns 200 quickly, processes async via Temporal
- [ ] Rejects invalid signatures with 401
- [ ] Logs webhook events for debugging

---

## Technical Architecture

### Request Flow

```
GitHub                     Web App                      Temporal
  │                          │                            │
  │  POST /api/webhooks/     │                            │
  │  github                  │                            │
  │ ─────────────────────────>                            │
  │  Headers:                │                            │
  │  - X-Hub-Signature-256   │                            │
  │  - X-GitHub-Event        │                            │
  │  - X-GitHub-Delivery     │                            │
  │                          │                            │
  │                    ┌─────┴─────┐                      │
  │                    │  Validate │                      │
  │                    │ Signature │                      │
  │                    └─────┬─────┘                      │
  │                          │                            │
  │                    ┌─────┴─────┐                      │
  │                    │  Lookup   │                      │
  │                    │   Repo    │                      │
  │                    └─────┬─────┘                      │
  │                          │                            │
  │                          │  Start githubIndexWorkflow │
  │                          │ ───────────────────────────>
  │                          │                            │
  │         200 OK           │                            │
  │ <─────────────────────────                            │
  │                          │                            │
```

### GitHub Webhook Headers

| Header | Description | Example |
|--------|-------------|---------|
| `X-Hub-Signature-256` | HMAC-SHA256 signature of payload | `sha256=abc123...` |
| `X-GitHub-Event` | Event type | `push`, `pull_request` |
| `X-GitHub-Delivery` | Unique delivery ID (UUID) | `72d3162e-cc78-11e3-81ab-4c9367dc0958` |

### Signature Verification

GitHub signs webhooks using HMAC-SHA256 with the webhook secret:

```typescript
import { createHmac, timingSafeEqual } from "crypto";

function verifyGitHubSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  if (!signature.startsWith("sha256=")) {
    return false;
  }

  const expected = `sha256=${createHmac("sha256", secret)
    .update(payload)
    .digest("hex")}`;

  // Constant-time comparison to prevent timing attacks
  if (signature.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
```

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/web/src/app/api/webhooks/github/route.ts` | Create | Webhook handler endpoint |
| `packages/api/src/lib/github/signature.ts` | Create | Signature verification utility |
| `packages/api/src/schemas/github.ts` | Modify | Add webhook payload schemas |
| `apps/web/src/lib/env.ts` | Modify | Add GITHUB_WEBHOOK_SECRET |
| `apps/web/src/lib/temporal-client.ts` | Create | Temporal client for web app |
| `.env.example` | Modify | Add GITHUB_WEBHOOK_SECRET |

---

## Implementation Steps

### Step 1: Add Environment Variable

**File: `apps/web/src/lib/env.ts`**

Add to server schema:
```typescript
// Optional - allows app to start without GitHub integration
// Webhook endpoint returns 500 if not configured when called
GITHUB_WEBHOOK_SECRET: z.string().min(32).optional(),
```

> **Note:** The env var is intentionally optional to allow the app to start without GitHub integration configured. The webhook endpoint handles the missing configuration gracefully by returning a 500 error with a clear message.

**File: `.env.example`**

```env
# GitHub Webhook
GITHUB_WEBHOOK_SECRET=your-github-webhook-secret-here
```

---

### Step 2: Create Signature Verification Utility

**File: `packages/api/src/lib/github/signature.ts`**

```typescript
import { createHmac, timingSafeEqual } from "crypto";

/**
 * Verifies GitHub webhook signature using HMAC-SHA256.
 * Uses constant-time comparison to prevent timing attacks.
 */
export function verifyGitHubSignature(
  payload: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature || !signature.startsWith("sha256=")) {
    return false;
  }

  const expected = `sha256=${createHmac("sha256", secret)
    .update(payload)
    .digest("hex")}`;

  if (signature.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
```

---

### Step 3: Add Webhook Payload Schemas

**File: `packages/api/src/schemas/github.ts`**

Add the following schemas:

```typescript
// ============================================
// GitHub Webhook Payload Schemas
// ============================================

// Common types
export const GitHubUserSchema = z.object({
  login: z.string(),
  id: z.number(),
  email: z.string().nullable().optional(),
});

export const GitHubRepositorySchema = z.object({
  id: z.number(),
  name: z.string(),
  full_name: z.string(),
  owner: GitHubUserSchema,
  default_branch: z.string(),
  private: z.boolean(),
});

// Push event
export const GitHubCommitSchema = z.object({
  id: z.string(),
  message: z.string(),
  timestamp: z.string(),
  author: z.object({
    name: z.string(),
    email: z.string(),
  }),
  added: z.array(z.string()),
  removed: z.array(z.string()),
  modified: z.array(z.string()),
});

export const GitHubPushPayloadSchema = z.object({
  ref: z.string(),
  before: z.string(),
  after: z.string(),
  repository: GitHubRepositorySchema,
  pusher: z.object({
    name: z.string(),
    email: z.string().optional(),
  }),
  sender: GitHubUserSchema,
  commits: z.array(GitHubCommitSchema),
  head_commit: GitHubCommitSchema.nullable(),
});
export type GitHubPushPayload = z.infer<typeof GitHubPushPayloadSchema>;

// Pull request event
export const GitHubPullRequestSchema = z.object({
  number: z.number(),
  state: z.string(),
  title: z.string(),
  body: z.string().nullable(),
  user: GitHubUserSchema,
  head: z.object({
    ref: z.string(),
    sha: z.string(),
  }),
  base: z.object({
    ref: z.string(),
    sha: z.string(),
  }),
  merged: z.boolean().nullable(),
  merged_at: z.string().nullable(),
  closed_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const GitHubPRPayloadSchema = z.object({
  action: z.enum(["opened", "closed", "synchronize", "reopened", "edited"]),
  number: z.number(),
  pull_request: GitHubPullRequestSchema,
  repository: GitHubRepositorySchema,
  sender: GitHubUserSchema,
});
export type GitHubPRPayload = z.infer<typeof GitHubPRPayloadSchema>;

// Discriminated union for webhook events
export const GitHubWebhookEventSchema = z.discriminatedUnion("event", [
  z.object({
    event: z.literal("push"),
    delivery: z.string(),
    payload: GitHubPushPayloadSchema,
  }),
  z.object({
    event: z.literal("pull_request"),
    delivery: z.string(),
    payload: GitHubPRPayloadSchema,
  }),
]);
export type GitHubWebhookEvent = z.infer<typeof GitHubWebhookEventSchema>;
```

---

### Step 4: Create Temporal Client for Web App

**File: `apps/web/src/lib/temporal-client.ts`**

```typescript
import { Client, Connection } from "@temporalio/client";
import { env } from "./env";

let _client: Client | null = null;
let _connection: Connection | null = null;

/**
 * Get or create a Temporal client singleton.
 * Used for starting workflows from the web app.
 */
export async function getTemporalClient(): Promise<Client> {
  if (_client) {
    return _client;
  }

  _connection = await Connection.connect({
    address: env.TEMPORAL_ADDRESS ?? "localhost:7233",
  });

  _client = new Client({
    connection: _connection,
    namespace: "default",
  });

  return _client;
}

/**
 * Start the GitHub indexing workflow.
 */
export async function startGitHubIndexWorkflow(input: {
  repoId: string;
  projectId: string;
  event: "push" | "pull_request";
  payload: unknown;
  deliveryId: string;
}): Promise<string> {
  const client = await getTemporalClient();

  const handle = await client.workflow.start("githubIndexWorkflow", {
    taskQueue: "ducsigr-worker",
    workflowId: `github-index-${input.deliveryId}`,
    args: [input],
  });

  return handle.workflowId;
}
```

---

### Step 5: Create Webhook Handler Endpoint

**File: `apps/web/src/app/api/webhooks/github/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ducsigr/db";
import { verifyGitHubSignature } from "@ducsigr/api/lib/github/signature";
import {
  GitHubPushPayloadSchema,
  GitHubPRPayloadSchema,
} from "@ducsigr/api/schemas";
import { env } from "@/lib/env";
import { startGitHubIndexWorkflow } from "@/lib/temporal-client";

// GitHub webhook headers
const SIGNATURE_HEADER = "x-hub-signature-256";
const EVENT_HEADER = "x-github-event";
const DELIVERY_HEADER = "x-github-delivery";

// Supported events
const SUPPORTED_EVENTS = ["push", "pull_request"] as const;
type SupportedEvent = (typeof SUPPORTED_EVENTS)[number];

export async function POST(req: NextRequest) {
  const headers = { "Cache-Control": "no-store, no-cache, must-revalidate" };

  // 1. Check if webhook secret is configured
  if (!env.GITHUB_WEBHOOK_SECRET) {
    console.error("GITHUB_WEBHOOK_SECRET not configured");
    return NextResponse.json(
      { error: "Webhook not configured" },
      { status: 500, headers }
    );
  }

  // 2. Get required headers
  const signature = req.headers.get(SIGNATURE_HEADER);
  const event = req.headers.get(EVENT_HEADER) as SupportedEvent | null;
  const delivery = req.headers.get(DELIVERY_HEADER);

  if (!event || !delivery) {
    return NextResponse.json(
      { error: "Missing required headers" },
      { status: 400, headers }
    );
  }

  // 3. Get raw payload for signature verification
  const rawPayload = await req.text();

  // 4. Verify signature
  if (!verifyGitHubSignature(rawPayload, signature, env.GITHUB_WEBHOOK_SECRET)) {
    console.warn("Invalid GitHub webhook signature", {
      delivery,
      event,
      ip: req.headers.get("x-forwarded-for") || "unknown",
      timestamp: new Date().toISOString(),
    });
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 401, headers }
    );
  }

  // 5. Parse payload
  let payload: unknown;
  try {
    payload = JSON.parse(rawPayload);
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON payload" },
      { status: 400, headers }
    );
  }

  // 6. Handle ping event (GitHub sends this when webhook is first created)
  if (event === "ping") {
    console.log("GitHub webhook ping received", { delivery });
    return NextResponse.json({ message: "pong" }, { status: 200, headers });
  }

  // 7. Check if event is supported
  if (!SUPPORTED_EVENTS.includes(event as SupportedEvent)) {
    console.log("Unsupported GitHub event", { event, delivery });
    return NextResponse.json(
      { message: "Event not supported" },
      { status: 200, headers }
    );
  }

  // 8. Extract repository info based on event type
  let owner: string;
  let repo: string;

  try {
    if (event === "push") {
      const parsed = GitHubPushPayloadSchema.parse(payload);
      const [repoOwner, repoName] = parsed.repository.full_name.split("/");
      owner = repoOwner;
      repo = repoName;

      // Only process pushes to default branch
      const branch = parsed.ref.replace("refs/heads/", "");
      if (branch !== parsed.repository.default_branch) {
        console.log("Push to non-default branch, skipping", {
          delivery,
          branch,
          defaultBranch: parsed.repository.default_branch,
        });
        return NextResponse.json(
          { message: "Non-default branch push ignored" },
          { status: 200, headers }
        );
      }
    } else if (event === "pull_request") {
      const parsed = GitHubPRPayloadSchema.parse(payload);
      const [repoOwner, repoName] = parsed.repository.full_name.split("/");
      owner = repoOwner;
      repo = repoName;

      // Only process opened, closed, and synchronize events
      const relevantActions = ["opened", "closed", "synchronize"];
      if (!relevantActions.includes(parsed.action)) {
        console.log("PR action not relevant, skipping", {
          delivery,
          action: parsed.action,
        });
        return NextResponse.json(
          { message: "PR action not relevant" },
          { status: 200, headers }
        );
      }
    } else {
      return NextResponse.json(
        { message: "Event not supported" },
        { status: 200, headers }
      );
    }
  } catch (error) {
    console.error("Failed to parse webhook payload", { delivery, event, error });
    return NextResponse.json(
      { error: "Invalid payload structure" },
      { status: 400, headers }
    );
  }

  // 9. Look up repository in database
  const githubRepo = await prisma.gitHubRepository.findFirst({
    where: { owner, repo },
    select: { id: true, projectId: true },
  });

  if (!githubRepo) {
    console.log("Repository not registered", { delivery, owner, repo });
    return NextResponse.json(
      { message: "Repository not registered" },
      { status: 200, headers }
    );
  }

  // 10. Start Temporal workflow asynchronously
  try {
    const workflowId = await startGitHubIndexWorkflow({
      repoId: githubRepo.id,
      projectId: githubRepo.projectId,
      event,
      payload,
      deliveryId: delivery,
    });

    console.log("GitHub index workflow started", {
      delivery,
      event,
      owner,
      repo,
      workflowId,
    });

    return NextResponse.json(
      {
        message: "Webhook received",
        workflowId,
      },
      { status: 200, headers }
    );
  } catch (error) {
    console.error("Failed to start workflow", { delivery, event, error });
    return NextResponse.json(
      { error: "Failed to process webhook" },
      { status: 500, headers }
    );
  }
}
```

---

### Step 6: Export Signature Utility

**File: `packages/api/src/lib/github/index.ts`**

```typescript
export { verifyGitHubSignature } from "./signature";
```

**File: `packages/api/package.json`**

Add export to package.json exports field if not already using wildcard exports.

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GITHUB_WEBHOOK_SECRET` | Yes | - | Secret used to sign GitHub webhooks |
| `TEMPORAL_ADDRESS` | No | `localhost:7233` | Temporal server address |

---

## Testing

### Manual Testing

1. **Configure webhook in GitHub:**
   - Go to Repository Settings → Webhooks → Add webhook
   - Payload URL: `https://your-domain.com/api/webhooks/github`
   - Content type: `application/json`
   - Secret: Your `GITHUB_WEBHOOK_SECRET` value
   - Events: Select "Pushes" and "Pull requests"

2. **Test with ngrok (local development):**
   ```bash
   ngrok http 3000
   # Use ngrok URL as webhook endpoint
   ```

3. **Verify signature validation:**
   - Send request without signature → 401
   - Send request with wrong signature → 401
   - Send request with valid signature → 200

### Integration Test

```typescript
describe("GitHub Webhook", () => {
  it("rejects requests without signature", async () => {
    const response = await fetch("/api/webhooks/github", {
      method: "POST",
      headers: {
        "x-github-event": "push",
        "x-github-delivery": "test-123",
      },
      body: JSON.stringify({}),
    });
    expect(response.status).toBe(401);
  });

  it("accepts valid push event", async () => {
    const payload = JSON.stringify(mockPushPayload);
    const signature = createValidSignature(payload);

    const response = await fetch("/api/webhooks/github", {
      method: "POST",
      headers: {
        "x-hub-signature-256": signature,
        "x-github-event": "push",
        "x-github-delivery": "test-123",
      },
      body: payload,
    });
    expect(response.status).toBe(200);
  });
});
```

---

## Security Considerations

1. **Signature Verification**: Use constant-time comparison to prevent timing attacks
2. **Raw Payload**: Verify signature against raw payload string (before JSON parsing)
3. **Secret Length**: Minimum 32 characters for webhook secret
4. **Logging**: Never log the webhook secret; log delivery ID for debugging
5. **Rate Limiting**: Consider adding rate limiting for webhook endpoint

---

## Monitoring & Debugging

### Logs to Monitor

- `GitHub webhook ping received` - Initial webhook setup
- `Invalid GitHub webhook signature` - Potential attack or misconfiguration
- `Repository not registered` - Webhook for unconnected repo
- `GitHub index workflow started` - Successful processing
- `Failed to start workflow` - Temporal connection issues

### Metrics to Track

- Webhook requests by event type
- Signature validation failures
- Workflow start success/failure rate
- Processing latency (webhook receive → workflow start)

---

## Notes

- Webhook returns 200 immediately to avoid GitHub timeout (10 seconds)
- Actual processing happens asynchronously via Temporal workflow
- The `githubIndexWorkflow` is created in ticket #130 (next story)
- Repository must be registered in `GitHubRepository` table to process events
