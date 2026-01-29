# API Response Utilities

Centralized response utilities for all API routes. **Never use `NextResponse.json()` directly.**

## Files

| File | Purpose |
|------|---------|
| `apps/web/src/lib/api-responses.ts` | REST API responses |
| `apps/web/src/lib/webhook-responses.ts` | Webhook-specific responses |

---

## Usage

```typescript
import { apiError, apiSuccess, apiServerError } from "@/lib/api-responses";

export async function POST(req: NextRequest) {
  // Errors
  return apiError.unauthorized();
  return apiError.validation("Invalid input", zodError.issues);
  return apiError.notFound("User");
  return apiServerError.internal();

  // Success
  return apiSuccess.ok({ data: result });
  return apiSuccess.created(newResource);
}
```

---

## Available Utilities

### Success Responses (`apiSuccess`)

| Method | Status | Use Case |
|--------|--------|----------|
| `ok(data)` | 200 | Generic success with data |
| `okWithFlag(data)` | 200 | Success with `{ success: true, ...data }` |
| `created(data)` | 201 | Resource created |
| `noContent()` | 204 | Success with no body |

### Client Error Responses (`apiError`)

| Method | Status | Use Case |
|--------|--------|----------|
| `invalidJson()` | 400 | Failed to parse JSON body |
| `validation(message?, details?)` | 400 | Zod or custom validation failed |
| `badRequest(message)` | 400 | Generic bad request |
| `unauthorized(message?)` | 401 | Missing/invalid auth |
| `invalidApiKey()` | 401 | Invalid API key |
| `invalidSignature()` | 401 | Invalid webhook signature |
| `forbidden(message?)` | 403 | Lacks permission |
| `notFound(resource?)` | 404 | Resource not found |
| `conflict(message)` | 409 | Resource conflict |
| `userExists()` | 409 | User already exists |
| `rateLimited(retryAfter?)` | 429 | Rate limit exceeded |

### Server Error Responses (`apiServerError`)

| Method | Status | Use Case |
|--------|--------|----------|
| `internal(message?)` | 500 | Generic server error |
| `notConfigured(service)` | 500 | Service not configured |
| `unavailable(message?)` | 503 | Service temporarily unavailable |

---

## Internal API Responses

For Go ingest service communication (uses `{ success: boolean, ... }` format):

```typescript
import { internalApiError, internalApiSuccess } from "@/lib/api-responses";

// Success
return internalApiSuccess.ok({ alertId, results });
return internalApiSuccess.valid({ projectId });  // { valid: true, projectId }
return internalApiSuccess.invalid("Expired");    // { valid: false, error }

// Errors
return internalApiError.unauthorized();
return internalApiError.notFound("Alert");
return internalApiError.internal();
```

| Object | Methods |
|--------|---------|
| `internalApiSuccess` | `ok(data)`, `valid(data)`, `invalid(error)` |
| `internalApiError` | `unauthorized()`, `invalidJson()`, `validation(msg?, details?)`, `notFound(resource?)`, `internal()` |

---

## Webhook Responses

For GitHub webhooks:

```typescript
import {
  webhookSuccess,
  webhookError,
  webhookServerError,
  parseRepositoryFullName,
  SKIP_REASONS,
} from "@/lib/webhook-responses";

// Success
return webhookSuccess.received(workflowId);
return webhookSuccess.pong();
return webhookSuccess.skipped(SKIP_REASONS.NON_DEFAULT_BRANCH);

// Errors
return webhookError.invalidSignature();
return webhookError.invalidJson();
return webhookServerError.notConfigured();

// Helper
const repoInfo = parseRepositoryFullName("owner/repo");
```

| Object | Methods |
|--------|---------|
| `webhookSuccess` | `received(workflowId?)`, `pong()`, `skipped(reason)` |
| `webhookError` | `missingHeaders()`, `invalidJson()`, `invalidPayload()`, `invalidRepoFormat()`, `invalidSignature()` |
| `webhookServerError` | `notConfigured()`, `processingFailed()` |
| `SKIP_REASONS` | `EVENT_NOT_SUPPORTED`, `NON_DEFAULT_BRANCH`, `PR_ACTION_NOT_RELEVANT`, `REPO_NOT_REGISTERED` |

---

## Adding New Responses

1. **Identify the type** - Success, client error, server error, or internal?
2. **Add to the appropriate object** in `api-responses.ts` or `webhook-responses.ts`
3. **Follow existing patterns**:

```typescript
export const apiError = {
  // ... existing methods
  newError: (param: string) =>
    json({ error: `New error: ${param}`, code: "NEW_ERROR_CODE" }, { status: 400 }),
} as const;
```
