# Engineering Specification: API Keys Authentication

**Status:** Draft
**Version:** 1.0
**Date:** 2025-11-29

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [API Key Format](#3-api-key-format)
4. [Database Schema](#4-database-schema)
5. [API Endpoints](#5-api-endpoints)
6. [Go Ingest Service Integration](#6-go-ingest-service-integration)
7. [UI Components](#7-ui-components)
8. [Security Considerations](#8-security-considerations)
9. [Environment Variables](#9-environment-variables)
10. [Implementation Plan](#10-implementation-plan)
11. [Testing Checklist](#11-testing-checklist)
12. [Future Enhancements](#12-future-enhancements)

---

## 1. Overview

Enable secure API key-based authentication for trace ingestion. Users can create projects, generate API keys, and validate incoming traces via the ingest service.

### 1.1 Goals

- Allow SDK/CLI clients to authenticate using API keys
- Provide CRUD operations for API key management
- Integrate with existing JWT-based authentication
- Support key expiration and revocation

### 1.2 Non-Goals (v1)

- Rate limiting per API key
- Usage tracking (lastUsedAt, usageCount)
- Key rotation endpoint
- Redis caching for validation

---

## 2. Architecture

### 2.1 Authentication Flow

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  SDK/Client     │────▶│  Ingest (Go)    │────▶│  Web API (Next) │
│  X-API-Key      │     │  Middleware     │     │  /api/validate  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
                                                        ▼
                                                ┌─────────────────┐
                                                │  PostgreSQL     │
                                                │  ApiKey table   │
                                                └─────────────────┘
```

### 2.2 Key Decision

**Go ingest service calls internal Next.js API to validate keys.**

Rationale:
- Single database client (Prisma in web app)
- Simpler architecture, no direct DB connection from Go
- Easier to add caching layer later (in web API)

### 2.3 Authentication Priority

1. Check for `X-API-Key` header → API key authentication
2. If no API key, check `Authorization: Bearer` → JWT authentication
3. If neither, reject with 401 Unauthorized

---

## 3. API Key Format

```
co_sk_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
│  │  └── 32 random alphanumeric characters (base62)
│  └── "sk_" = secret key type
└── "co_" = Ducsigr vendor prefix
```

### 3.1 Properties

| Property | Value |
|----------|-------|
| Prefix | `co_sk_` |
| Random bytes | 32 bytes (256 bits) |
| Encoding | Base62 (alphanumeric, URL-safe) |
| Total length | ~50 characters |
| Entropy | 256 bits (exceeds 128-bit recommendation) |

### 3.2 Display Format

- **Full key**: `co_sk_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6` (shown only once at creation)
- **Masked key**: `co_sk_...o5p6` (shown in UI for identification)

### 3.3 Storage

- Store SHA-256 hash of full key (never plaintext)
- Hash is 64 hex characters
- Use constant-time comparison for validation

---

## 4. Database Schema

The `ApiKey` model already exists in `packages/db/prisma/schema.prisma`:

```prisma
model ApiKey {
  id          String    @id @default(cuid())
  projectId   String
  project     Project   @relation(fields: [projectId], references: [id], onDelete: Cascade)
  name        String    @default("Default")
  hashedKey   String    @unique
  displayKey  String
  createdById String?
  createdAt   DateTime  @default(now())
  lastUsedAt  DateTime?  // Not used in v1
  expiresAt   DateTime?

  @@index([projectId])
  @@index([hashedKey])
}
```

**No schema changes required for v1.**

---

## 5. API Endpoints

### 5.1 List API Keys

```http
GET /api/projects/{projectId}/api-keys
Authorization: Bearer <jwt-token>
```

**Response 200:**
```json
{
  "data": [
    {
      "id": "clx1234567890",
      "name": "Production",
      "displayKey": "co_sk_...o5p6",
      "createdAt": "2025-01-01T00:00:00.000Z",
      "expiresAt": null,
      "createdBy": {
        "id": "user_123",
        "name": "John Doe"
      }
    }
  ]
}
```

### 5.2 Create API Key

```http
POST /api/projects/{projectId}/api-keys
Authorization: Bearer <jwt-token>
Content-Type: application/json

{
  "name": "Production",
  "expiresAt": "2026-01-01T00:00:00.000Z"  // optional
}
```

**Response 201:**
```json
{
  "id": "clx1234567890",
  "name": "Production",
  "key": "co_sk_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
  "displayKey": "co_sk_...o5p6",
  "createdAt": "2025-01-01T00:00:00.000Z",
  "expiresAt": null,
  "_warning": "Save this key securely. It won't be shown again."
}
```

> **Important**: The full `key` is only returned once at creation time.

### 5.3 Delete API Key

```http
DELETE /api/projects/{projectId}/api-keys/{keyId}
Authorization: Bearer <jwt-token>
```

**Response 200:**
```json
{
  "success": true
}
```

### 5.4 Internal: Validate Key

Internal endpoint called by Go ingest service:

```http
POST /api/internal/validate-key
X-Internal-Secret: {INTERNAL_API_SECRET}
Content-Type: application/json

{
  "hashedKey": "sha256-hash-of-api-key"
}
```

**Response 200 (valid):**
```json
{
  "valid": true,
  "projectId": "proj_xxx"
}
```

**Response 401 (invalid):**
```json
{
  "valid": false,
  "error": "Invalid or expired API key"
}
```

---

## 6. Go Ingest Service Integration

### 6.1 New Middleware

Create `apps/ingest/internal/middleware/apikey.go`:

```go
package middleware

import (
    "bytes"
    "crypto/sha256"
    "encoding/hex"
    "encoding/json"
    "net/http"
    "strings"

    "github.com/ducsigr/ingest/internal/config"
)

const (
    APIKeyHeader   = "X-API-Key"
    APIKeyPrefix   = "co_sk_"
)

type validateKeyResponse struct {
    Valid     bool   `json:"valid"`
    ProjectID string `json:"projectId,omitempty"`
    Error     string `json:"error,omitempty"`
}

// APIKeyAuth validates X-API-Key header by calling web API
func APIKeyAuth(cfg *config.Config) func(http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            apiKey := r.Header.Get(APIKeyHeader)

            // If no API key, fall through to JWT auth
            if apiKey == "" {
                next.ServeHTTP(w, r)
                return
            }

            // Validate format
            if !strings.HasPrefix(apiKey, APIKeyPrefix) {
                writeError(w, http.StatusUnauthorized, "Invalid API key format")
                return
            }

            // Hash the key
            hash := sha256.Sum256([]byte(apiKey))
            hashedKey := hex.EncodeToString(hash[:])

            // Validate via internal API
            projectID, err := validateKeyViaAPI(cfg, hashedKey)
            if err != nil {
                writeError(w, http.StatusUnauthorized, "Invalid API key")
                return
            }

            // Set project ID in header for downstream handlers
            r.Header.Set("X-Project-ID", projectID)

            next.ServeHTTP(w, r)
        })
    }
}

func validateKeyViaAPI(cfg *config.Config, hashedKey string) (string, error) {
    url := cfg.WebAPIURL + "/api/internal/validate-key"

    body, _ := json.Marshal(map[string]string{"hashedKey": hashedKey})
    req, _ := http.NewRequest("POST", url, bytes.NewBuffer(body))
    req.Header.Set("Content-Type", "application/json")
    req.Header.Set("X-Internal-Secret", cfg.InternalAPISecret)

    resp, err := http.DefaultClient.Do(req)
    if err != nil {
        return "", err
    }
    defer resp.Body.Close()

    var result validateKeyResponse
    json.NewDecoder(resp.Body).Decode(&result)

    if !result.Valid {
        return "", fmt.Errorf(result.Error)
    }

    return result.ProjectID, nil
}

func writeError(w http.ResponseWriter, status int, message string) {
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(status)
    json.NewEncoder(w).Encode(map[string]string{"error": message})
}
```

### 6.2 Config Updates

Add to `apps/ingest/internal/config/config.go`:

```go
type Config struct {
    // ... existing fields
    WebAPIURL         string `env:"WEB_API_URL" envDefault:"http://localhost:3000"`
    InternalAPISecret string `env:"INTERNAL_API_SECRET,required"`
}
```

### 6.3 Route Integration

Update `apps/ingest/internal/server/server.go`:

```go
r.Route("/v1", func(r chi.Router) {
    r.Use(authmw.APIKeyAuth(s.cfg))  // Try API key first
    r.Use(authmw.JWTAuth)            // Fallback to JWT

    r.Route("/traces", func(r chi.Router) {
        r.Use(authmw.RequireProjectAccess("X-Project-ID"))
        r.Post("/", s.handler.IngestTrace)
    })
})
```

---

## 7. UI Components

### 7.1 Component Structure

```
apps/web/src/
├── components/
│   └── api-keys/
│       ├── api-key-list.tsx           # Table of API keys
│       ├── create-api-key-dialog.tsx  # Create key modal
│       ├── api-key-created-dialog.tsx # Shows new key (copy once)
│       └── delete-api-key-dialog.tsx  # Confirmation dialog
│
├── hooks/
│   └── use-api-keys.ts                # Data fetching hook
│
└── app/(dashboard)/projects/[projectId]/settings/
    └── page.tsx                       # Settings page with API keys
```

### 7.2 useApiKeys Hook

```typescript
// apps/web/src/hooks/use-api-keys.ts
export function useApiKeys(projectId: string) {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchApiKeys = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/api-keys`);
    const data = await res.json();
    setApiKeys(data.data);
    setIsLoading(false);
  }, [projectId]);

  const createApiKey = useCallback(async (input: CreateApiKeyInput) => {
    const res = await fetch(`/api/projects/${projectId}/api-keys`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const data = await res.json();
    await fetchApiKeys();
    return data; // Contains the full key
  }, [projectId, fetchApiKeys]);

  const deleteApiKey = useCallback(async (keyId: string) => {
    await fetch(`/api/projects/${projectId}/api-keys/${keyId}`, {
      method: "DELETE",
    });
    await fetchApiKeys();
  }, [projectId, fetchApiKeys]);

  useEffect(() => { fetchApiKeys(); }, [fetchApiKeys]);

  return { apiKeys, isLoading, createApiKey, deleteApiKey, refetch: fetchApiKeys };
}
```

### 7.3 Key Created Dialog (Critical UX)

The dialog shown after creating a key must:
- Display warning: "Store this key securely. It won't be shown again."
- Show full key in monospace font
- Provide copy-to-clipboard button with feedback
- Show quick start code snippets (curl, Python, Node.js)
- Require user to click "I've saved my key" to close

---

## 8. Security Considerations

| Concern | Implementation |
|---------|----------------|
| Key Storage | SHA-256 hash only, never plaintext |
| Key Display | Full key shown only once at creation |
| Internal API | Protected by `X-Internal-Secret` header |
| Authorization | Verify OWNER/ADMIN role for key management |
| Expiration | Check `expiresAt` during validation |
| Transport | HTTPS required in production |

### 8.1 Why SHA-256 (not bcrypt)?

- API keys have high entropy (256 bits)
- Brute-force is computationally infeasible
- bcrypt adds 100ms+ latency per validation
- Industry standard (Stripe, GitHub, AWS use similar approach)

---

## 9. Environment Variables

Add to `.env.example`:

```env
# Internal API Communication
INTERNAL_API_SECRET=generate-a-secure-random-string-min-32-chars

# Go Ingest Service
WEB_API_URL=http://localhost:3000
```

Update `apps/web/src/lib/env.ts`:

```typescript
export const env = createEnv({
  server: {
    // ... existing
    INTERNAL_API_SECRET: z.string().min(32),
  },
});
```

---

## 10. Implementation Plan

### Step 1: API Key Utility Library
- [ ] Create `apps/web/src/lib/api-keys.ts`
- [ ] Implement `generateApiKey()`, `hashApiKey()`, `maskApiKey()`

### Step 2: API Routes
- [ ] Create `apps/web/src/app/api/projects/[projectId]/api-keys/route.ts` (GET, POST)
- [ ] Create `apps/web/src/app/api/projects/[projectId]/api-keys/[keyId]/route.ts` (DELETE)
- [ ] Create `apps/web/src/app/api/internal/validate-key/route.ts`
- [ ] Add authorization checks (OWNER/ADMIN only)

### Step 3: Go Ingest Service
- [ ] Create `apps/ingest/internal/middleware/apikey.go`
- [ ] Update `apps/ingest/internal/config/config.go`
- [ ] Update `apps/ingest/internal/server/server.go` (route chain)

### Step 4: UI Components
- [ ] Create `apps/web/src/hooks/use-api-keys.ts`
- [ ] Create API key components in `apps/web/src/components/api-keys/`
- [ ] Add API keys section to project settings page

### Step 5: Environment & Testing
- [ ] Update `.env.example`
- [ ] Update `apps/web/src/lib/env.ts`
- [ ] Manual testing of full flow

---

## 11. Testing Checklist

- [ ] Generate API key and verify `co_sk_` format
- [ ] List keys shows masked `displayKey` only
- [ ] Delete key removes from database
- [ ] Ingest service accepts valid `X-API-Key` header
- [ ] Ingest service rejects invalid keys with 401
- [ ] Ingest service rejects expired keys with 401
- [ ] JWT auth still works when no API key provided
- [ ] UI shows full key only once on creation
- [ ] Copy to clipboard works
- [ ] Only OWNER/ADMIN can manage keys

---

## 12. Future Enhancements

| Feature | Description | Priority |
|---------|-------------|----------|
| Rate Limiting | Per-key request limits (RPM) | P1 |
| Usage Tracking | lastUsedAt, usageCount updates | P1 |
| Key Rotation | Create new key, revoke old atomically | P2 |
| Redis Caching | Cache key lookups for performance | P2 |
| IP Allowlisting | Optional per-key IP restrictions | P3 |
| Audit Logging | Track key create/revoke/use events | P3 |

---

## Appendix A: File Changes Summary

### New Files

| File | Purpose |
|------|---------|
| `apps/web/src/lib/api-keys.ts` | Key generation utilities |
| `apps/web/src/app/api/projects/[projectId]/api-keys/route.ts` | List/Create endpoints |
| `apps/web/src/app/api/projects/[projectId]/api-keys/[keyId]/route.ts` | Delete endpoint |
| `apps/web/src/app/api/internal/validate-key/route.ts` | Internal validation |
| `apps/web/src/hooks/use-api-keys.ts` | React data hook |
| `apps/web/src/components/api-keys/api-key-list.tsx` | Key list table |
| `apps/web/src/components/api-keys/create-api-key-dialog.tsx` | Create dialog |
| `apps/web/src/components/api-keys/api-key-created-dialog.tsx` | Success dialog |
| `apps/web/src/components/api-keys/delete-api-key-dialog.tsx` | Delete confirmation |
| `apps/ingest/internal/middleware/apikey.go` | Go middleware |

### Modified Files

| File | Changes |
|------|---------|
| `apps/ingest/internal/server/server.go` | Add API key middleware to chain |
| `apps/ingest/internal/config/config.go` | Add WEB_API_URL, INTERNAL_API_SECRET |
| `apps/web/src/lib/env.ts` | Add INTERNAL_API_SECRET |
| `.env.example` | Add new env vars |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-11-29 | Claude | Initial specification |
