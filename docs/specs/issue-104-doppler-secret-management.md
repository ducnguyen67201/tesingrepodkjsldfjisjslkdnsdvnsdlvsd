# Engineering Specification: Doppler Secret Management Integration

**Status:** Draft
**Version:** 1.1
**Date:** 2025-12-07
**Issue:** #118

---

## Table of Contents

1. [Overview](#1-overview)
2. [Current State Analysis](#2-current-state-analysis)
3. [Architecture](#3-architecture)
4. [Doppler Project Structure](#4-doppler-project-structure)
5. [Implementation Plan](#5-implementation-plan)
6. [Configuration Files](#6-configuration-files)
7. [Development Workflow](#7-development-workflow)
8. [CI/CD Integration](#8-cicd-integration)
9. [Docker & Production](#9-docker--production)
10. [Migration Plan](#10-migration-plan)
11. [Security Considerations](#11-security-considerations)
12. [Testing Checklist](#12-testing-checklist)
13. [Rollback Plan](#13-rollback-plan)

---

## 1. Overview

### 1.1 Problem Statement

Currently, Ducsigr uses `.env` files for secret management:
- Secrets are stored in plaintext in `.env` files
- Developers must manually sync secrets across machines
- No audit trail for secret access or changes
- Risk of accidentally committing secrets to version control
- No centralized secret rotation mechanism
- Cross-service secret synchronization is manual and error-prone

### 1.2 Solution

Integrate [Doppler](https://dashboard.doppler.com/) as the centralized secret management platform to:
- Eliminate local `.env` files containing secrets
- Provide real-time secret injection at runtime
- Enable audit logging for secret access
- Support environment-specific configurations (dev, staging, prod)
- Synchronize secrets across all services (Web, Ingest, Worker)

### 1.3 Goals

- Zero secrets stored in the repository or local `.env` files
- Seamless developer experience with `doppler run` commands
- Environment parity across development, staging, and production
- Centralized secret rotation and management
- Audit trail for compliance

### 1.4 Non-Goals (v1)

- Dynamic secret rotation automation
- Doppler webhooks for secret change notifications
- Service account OIDC authentication (use service tokens initially)
- Custom Doppler integrations beyond CLI

---

## 2. Current State Analysis

### 2.1 Services Requiring Secrets

| Service | Location | Runtime | Secrets Required |
|---------|----------|---------|------------------|
| Web (Next.js) | `apps/web` | Node.js | DATABASE_URL, NEXTAUTH_SECRET, JWT_SHARED_SECRET, OAuth credentials, INTERNAL_API_SECRET, TEMPORAL_* |
| Ingest (Go) | `apps/ingest` | Go 1.23 | WEB_API_URL, INTERNAL_API_SECRET, JWT_SHARED_SECRET, TEMPORAL_* |
| Worker (Temporal) | `apps/worker` | Node.js | DATABASE_URL, JWT_SHARED_SECRET, INTERNAL_API_SECRET, TEMPORAL_* |
| Database (Prisma) | `packages/db` | Node.js | DATABASE_URL |

### 2.2 Architecture Overview

```
SDK → [Ingest (Go)] → [Temporal] → [Worker (TS)] → [Web API] → PostgreSQL
                                                       ↑
                                                 [Web (Next.js)]

Note: Worker activities are READ-ONLY. All mutations go through Web API.
```

**Key Services:**
- **Web (Next.js)**: Dashboard, API (authoritative for mutations)
- **Ingest (Go)**: High-throughput trace ingestion, starts Temporal workflows
- **Worker (Temporal)**: Temporal worker with READ-ONLY activities, calls tRPC internal procedures for mutations

### 2.3 Current Secret Loading

**Web App (`apps/web/src/lib/env.ts`):**
```typescript
import { config } from "dotenv";
config({ path: resolve(process.cwd(), "../../.env") });
// Uses @t3-oss/env-nextjs for validation
```

**Go Ingest (`apps/ingest/cmd/ingest/main.go`):**
```go
_ = godotenv.Load("../../.env")
cfg, err := config.Load() // Uses caarlos0/env for parsing
```

**Worker (`apps/worker/src/lib/env.ts`):**
```typescript
// Similar pattern using dotenv + Zod validation
```

### 2.4 Secret Inventory

From `.env.example`:
```
# Database
DATABASE_URL

# Auth
NEXTAUTH_SECRET
NEXTAUTH_URL
AUTH_GOOGLE_ID
AUTH_GOOGLE_SECRET
AUTH_GITHUB_ID
AUTH_GITHUB_SECRET

# Cross-service
JWT_SHARED_SECRET
INTERNAL_API_SECRET
WEB_API_URL

# API Keys
API_KEY_PREFIX
API_KEY_RANDOM_BYTES_LENGTH
API_KEY_BASE62_CHARSET

# Temporal
TEMPORAL_ADDRESS
TEMPORAL_NAMESPACE
TEMPORAL_TASK_QUEUE
```

---

## 3. Architecture

### 3.1 Secret Injection Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        DOPPLER DASHBOARD                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │  ducsigr│  │  ducsigr│  │  ducsigr│  │  ducsigr│    │
│  │  -web       │  │  -ingest    │  │  -worker    │  │  -shared    │    │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘    │
│         │                │                │                │           │
│         │    ┌───────────┴────────────────┴────────────────┘           │
│         │    │         (inherits shared secrets)                       │
└─────────┼────┼─────────────────────────────────────────────────────────┘
          │    │
          ▼    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         DOPPLER CLI                                     │
│                     `doppler run -- <command>`                          │
└─────────────────────────────────────────────────────────────────────────┘
          │
          │ Injects secrets as environment variables
          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         APPLICATION                                     │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                 │
│  │    Web      │    │   Ingest    │    │   Worker    │                 │
│  │  (Next.js)  │    │    (Go)     │    │ (Temporal)  │                 │
│  │             │    │             │    │             │                 │
│  │ process.env │    │   os.Env    │    │ process.env │                 │
│  └─────────────┘    └─────────────┘    └─────────────┘                 │
│         │                │                    │                        │
│         └────────────────┼────────────────────┘                        │
│                          ▼                                             │
│                   ┌─────────────┐                                      │
│                   │  Temporal   │ (uses PostgreSQL for persistence)   │
│                   │   Server    │                                      │
│                   └─────────────┘                                      │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Environment Strategy

| Doppler Config | Use Case | Access |
|----------------|----------|--------|
| `dev` | Local development | All developers |
| `dev_personal` | Personal overrides | Individual developer |
| `stg` | Staging environment | CI/CD, QA team |
| `prd` | Production | CI/CD only (restricted) |

---

## 4. Doppler Project Structure

### 4.1 Recommended Project Layout (Single Project for Turbo Compatibility)

**Strategy**: Use a **single Doppler project** with ALL secrets. This works best with Turbo because:
- `doppler run -- turbo dev` injects secrets once at the root
- Turbo spawns child processes that inherit the environment
- Each service's `env.ts` validates only the variables it needs

```
Doppler Workspace: ducsigr
└── ducsigr            # Single project with ALL secrets
    ├── dev                # Local development
    ├── stg                # Staging environment
    └── prd                # Production environment
```

### 4.2 All Secrets in Single Project

All secrets go into the `ducsigr` project. Each service reads only what it needs:

| Secret | Used By | Required |
|--------|---------|----------|
| DATABASE_URL | web, worker, db | Yes |
| JWT_SHARED_SECRET | web, ingest, worker | Yes |
| INTERNAL_API_SECRET | web, ingest, worker | Yes |
| TEMPORAL_ADDRESS | ingest, worker | Yes |
| TEMPORAL_NAMESPACE | ingest, worker | Yes |
| TEMPORAL_TASK_QUEUE | ingest, worker | Yes |
| NEXTAUTH_SECRET | web | Yes |
| NEXTAUTH_URL | web | Yes |
| AUTH_GOOGLE_ID | web | Optional |
| AUTH_GOOGLE_SECRET | web | Optional |
| AUTH_GITHUB_ID | web | Optional |
| AUTH_GITHUB_SECRET | web | Optional |
| WEB_API_URL | web, ingest, worker | Yes |
| PORT | ingest | Optional (default: 8080) |
| API_KEY_PREFIX | web, ingest | Optional (default: co_sk_) |
| API_KEY_RANDOM_BYTES_LENGTH | web | Optional (default: 32) |
| NODE_ENV | web, worker | Optional (default: development) |
| SMTP_HOST | worker | Optional |
| SMTP_PORT | worker | Optional |
| SMTP_USER | worker | Optional |
| SMTP_PASS | worker | Optional |
| SMTP_FROM | worker | Optional |

---

## 5. Implementation Plan

### Phase 1: Setup & Configuration (Day 1)

1. **Install Doppler CLI** on all developer machines
2. **Create Doppler projects** in dashboard
3. **Create `doppler.yaml`** for monorepo configuration
4. **Populate secrets** in Doppler dashboard

### Phase 2: Local Development (Day 1-2)

1. **Update `package.json`** scripts to use `doppler run`
2. **Update Go Makefile** for ingest service
3. **Remove dotenv loading** from application code
4. **Update `.env.example`** to document Doppler usage
5. **Update `.gitignore`** to enforce no `.env` files

### Phase 3: CI/CD Integration (Day 2-3)

1. **Create service tokens** for CI/CD environments
2. **Configure GitHub Actions** to inject Doppler secrets
3. **Update Docker builds** for production

### Phase 4: Production Deployment (Day 3)

1. **Deploy with Doppler** service tokens
2. **Verify all services** start correctly
3. **Remove legacy `.env` files** from servers

---

## 6. Configuration Files

### 6.1 Root `doppler.yaml`

```yaml
# doppler.yaml - Monorepo configuration (single project approach)
# All services share one Doppler project for Turbo compatibility
# Run `doppler setup --no-interactive` to configure

setup:
  # Root level (for turbo commands)
  - project: web
    config: dev_personal
    path: .

  # Web application (Next.js)
  - project: web
    config: dev_personal
    path: apps/web

  # Ingest service (Go)
  - project: web
    config: dev_personal
    path: apps/ingest

  # Worker service (Temporal)
  - project: web
    config: dev_personal
    path: apps/worker

  # Database package (Prisma)
  - project: web
    config: dev_personal
    path: packages/db
```

### 6.2 Updated `package.json` Scripts

```json
{
  "scripts": {
    "dev": "doppler run -- turbo dev",
    "dev:no-doppler": "turbo dev",
    "build": "doppler run -- turbo build",
    "build:ci": "turbo build",
    "db:generate": "doppler run -- turbo db:generate",
    "db:generate:ci": "turbo db:generate",
    "db:push": "doppler run -- turbo db:push",
    "db:studio": "doppler run -- pnpm --filter @ducsigr/db db:studio"
  }
}
```

### 6.3 Go Ingest Makefile

```makefile
# apps/ingest/Makefile

.PHONY: dev build test

# Development with Doppler
dev:
	doppler run -p ducsigr-ingest -c dev -- go run ./cmd/ingest

# Build binary
build:
	go build -o bin/ingest ./cmd/ingest

# Run tests with Doppler
test:
	doppler run -p ducsigr-ingest -c dev -- go test ./...

# Production run (expects DOPPLER_TOKEN env var)
run-prod:
	doppler run -- ./bin/ingest
```

---

## 7. Development Workflow

### 7.1 Initial Setup (One-time)

```bash
# 1. Install Doppler CLI
# macOS
brew install dopplerhq/cli/doppler

# Linux
curl -sLf https://cli.doppler.com/install.sh | sh

# 2. Authenticate
doppler login

# 3. Configure monorepo (from project root)
doppler setup --no-interactive
```

### 7.2 Daily Development

```bash
# Start infrastructure (PostgreSQL, Temporal)
make docker-up

# Start all services (from root)
pnpm dev

# Or start individual services
cd apps/web && doppler run -- pnpm dev
cd apps/ingest && make dev
cd apps/worker && doppler run -- pnpm dev

# Database operations
pnpm db:studio
pnpm db:migrate

# Temporal UI
open http://localhost:8088
```

### 7.3 Personal Config Overrides

Developers can create personal branches in Doppler for testing:

```bash
# Use personal development config
doppler run -c dev_john -- pnpm dev
```

---

## 8. CI/CD Integration

### 8.1 GitHub Actions Configuration

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

env:
  DOPPLER_TOKEN: ${{ secrets.DOPPLER_TOKEN_CI }}

jobs:
  build:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: ducsigr
          POSTGRES_PASSWORD: ducsigr
          POSTGRES_DB: ducsigr
        ports:
          - 5432:5432

    steps:
      - uses: actions/checkout@v4

      - name: Install Doppler CLI
        uses: dopplerhq/cli-action@v3

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '24'

      - name: Setup Go
        uses: actions/setup-go@v5
        with:
          go-version: '1.23'

      - name: Install pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      # Option A: Use Doppler in CI (requires DOPPLER_TOKEN secret)
      - name: Generate Prisma Client
        run: doppler run -p web -c ci -- pnpm db:generate

      - name: Build
        run: doppler run -p web -c ci -- pnpm build

      - name: Test
        run: doppler run -p web -c ci -- pnpm test

      # Option B: Use :ci scripts (no Doppler needed, env vars set in workflow)
      # - name: Generate Prisma Client
      #   run: pnpm db:generate:ci
      # - name: Build
      #   run: pnpm build:ci
```

### 8.2 Service Token Setup

Create service tokens in Doppler Dashboard (single project approach):

| Token Name | Project | Config | GitHub Secret |
|------------|---------|--------|---------------|
| CI Token | web | ci | `DOPPLER_TOKEN` |
| Staging | web | stg | `DOPPLER_TOKEN_STG` |
| Production | web | prd | `DOPPLER_TOKEN_PRD` |

---

## 9. Docker & Production

### 9.1 Updated Dockerfile for Ingest

```dockerfile
# apps/ingest/Dockerfile
# Build stage
FROM golang:1.23-alpine AS builder

WORKDIR /app
RUN apk add --no-cache git ca-certificates
COPY go.mod go.sum* ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o /ingest ./cmd/ingest

# Runtime stage
FROM alpine:3.20

WORKDIR /app
RUN apk add --no-cache ca-certificates

# Install Doppler CLI for secret injection
RUN wget -q -t3 'https://packages.doppler.com/public/cli/rsa.8004D9FF50437357.key' \
    -O /etc/apk/keys/cli@doppler-8004D9FF50437357.rsa.pub && \
    echo 'https://packages.doppler.com/public/cli/alpine/any-version/main' >> /etc/apk/repositories && \
    apk add doppler

COPY --from=builder /ingest /app/ingest

RUN adduser -D -g '' appuser
USER appuser

EXPOSE 8080

# Run with Doppler secret injection
# Requires DOPPLER_TOKEN environment variable
ENTRYPOINT ["doppler", "run", "--"]
CMD ["/app/ingest"]
```

### 9.2 Docker Compose for Production

```yaml
# docker-compose.prod.yml
version: "3.8"

services:
  web:
    image: ducsigr/web:latest
    environment:
      - DOPPLER_TOKEN=${DOPPLER_TOKEN_WEB_PRD}
    ports:
      - "3000:3000"
    depends_on:
      - postgres
      - temporal

  ingest:
    image: ducsigr/ingest:latest
    environment:
      - DOPPLER_TOKEN=${DOPPLER_TOKEN_INGEST_PRD}
    ports:
      - "8080:8080"
    depends_on:
      - temporal

  worker:
    image: ducsigr/worker:latest
    environment:
      - DOPPLER_TOKEN=${DOPPLER_TOKEN_WORKER_PRD}
    depends_on:
      - postgres
      - temporal

  postgres:
    image: postgres:16-alpine
    volumes:
      - postgres_data:/var/lib/postgresql/data
    # Database credentials injected via Doppler in application

  temporal:
    image: temporalio/auto-setup:latest
    environment:
      - DB=postgresql
      - DB_PORT=5432
      - POSTGRES_USER=temporal
      - POSTGRES_PWD=temporal
      - POSTGRES_SEEDS=temporal-db
    ports:
      - "7233:7233"
    depends_on:
      - temporal-db

  temporal-db:
    image: postgres:16-alpine
    environment:
      - POSTGRES_USER=temporal
      - POSTGRES_PASSWORD=temporal
    volumes:
      - temporal_data:/var/lib/postgresql/data

  temporal-ui:
    image: temporalio/ui:latest
    environment:
      - TEMPORAL_ADDRESS=temporal:7233
    ports:
      - "8088:8080"
    depends_on:
      - temporal

volumes:
  postgres_data:
  temporal_data:
```

### 9.3 Alternative: Kubernetes Secret Sync

For Kubernetes deployments, use Doppler Kubernetes Operator:

```yaml
# k8s/doppler-secret.yaml
apiVersion: secrets.doppler.com/v1alpha1
kind: DopplerSecret
metadata:
  name: ducsigr-web-secrets
spec:
  tokenSecret:
    name: doppler-token-secret
  config: prd
  project: ducsigr-web
  managedSecret:
    name: ducsigr-web
    type: Opaque
```

---

## 10. Migration Plan

### 10.1 Pre-Migration Checklist

- [ ] All team members have Doppler accounts
- [ ] Doppler projects created with correct structure
- [ ] All secrets populated in Doppler `dev` configs
- [ ] Service tokens created for CI/CD
- [ ] Documentation updated

### 10.2 Migration Steps

**Step 1: Parallel Running (Day 1-2)**
- Keep `.env` files as fallback
- Update scripts to prefer Doppler but fall back to dotenv
- Test all services with Doppler

**Step 2: Cutover (Day 3)**
- Remove dotenv loading from application code
- Update all scripts to use Doppler
- Archive `.env` files (don't delete yet)

**Step 3: Cleanup (Day 4-5)**
- Remove `.env` files from local machines
- Update `.gitignore` to prevent `.env` creation
- Remove `dotenv` and `godotenv` dependencies
- Update developer onboarding docs

### 10.3 Code Changes Required

**Remove from `apps/web/src/lib/env.ts`:**
```typescript
// REMOVE these lines
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), "../../.env") });
config({ path: resolve(process.cwd(), ".env") });
```

**Remove from `apps/ingest/cmd/ingest/main.go`:**
```go
// REMOVE this import
"github.com/joho/godotenv"

// REMOVE this line
_ = godotenv.Load("../../.env")
```

**Remove from `apps/worker/src/lib/env.ts`:**
```typescript
// REMOVE dotenv loading (similar to web)
```

**Remove dependencies:**
```bash
# Remove from web
pnpm remove dotenv --filter @ducsigr/web

# Remove from worker
pnpm remove dotenv --filter @ducsigr/worker

# Remove from Go
cd apps/ingest && go mod tidy
# (godotenv should be unused after code removal)
```

---

## 11. Security Considerations

### 11.1 Access Control

| Role | dev | stg | prd |
|------|-----|-----|-----|
| Developer | Read/Write | Read | No Access |
| DevOps | Read/Write | Read/Write | Read/Write |
| CI/CD Bot | No Access | Read | Read |

### 11.2 Audit Logging

Doppler automatically logs:
- Secret access events
- Secret modifications
- Configuration changes
- User authentication events

Enable audit log alerts for:
- Production secret access
- Secret value changes
- New service token creation

### 11.3 Secret Rotation

Implement rotation schedule:

| Secret | Rotation Frequency | Method |
|--------|-------------------|--------|
| DATABASE_URL | Quarterly | Coordinate with DBA |
| JWT_SHARED_SECRET | Monthly | Rolling update all services |
| INTERNAL_API_SECRET | Monthly | Rolling update |
| OAuth Secrets | Annually | Provider dashboard + Doppler |
| NEXTAUTH_SECRET | Monthly | Session invalidation expected |
| TEMPORAL_* | Rarely | Infrastructure change only |

### 11.4 Emergency Procedures

**Compromised Secret Response:**
1. Immediately rotate the compromised secret in Doppler
2. All running services automatically get new values (if using `--watch` flag)
3. For services without watch, trigger redeployment
4. Audit logs to identify scope of exposure

---

## 12. Testing Checklist

### 12.1 Local Development

- [ ] `doppler login` works for all developers
- [ ] `doppler setup --no-interactive` configures all projects
- [ ] `pnpm dev` starts all services with correct secrets
- [ ] `make dev` (in apps/ingest) starts Go service
- [ ] `pnpm db:studio` opens Prisma Studio
- [ ] All OAuth flows work (Google, GitHub)
- [ ] Cross-service JWT validation works
- [ ] API key generation and validation works
- [ ] Temporal workflows execute successfully
- [ ] Worker activities can call tRPC internal procedures

### 12.2 CI/CD

- [ ] GitHub Actions can fetch secrets
- [ ] Build completes with Doppler
- [ ] Tests pass with CI config secrets
- [ ] Docker images build successfully

### 12.3 Production

- [ ] Services start with production service tokens
- [ ] No secrets appear in logs
- [ ] Health checks pass
- [ ] Cross-service communication works
- [ ] Database connections work
- [ ] Temporal workflows execute in production
- [ ] Temporal UI accessible (if exposed)

---

## 13. Rollback Plan

### 13.1 If Doppler Fails

**Temporary Fallback:**
1. Restore `.env` files from secure backup
2. Revert `package.json` scripts to remove `doppler run`
3. Restore dotenv imports in code
4. Redeploy

**Permanent Rollback:**
1. Git revert all Doppler-related commits
2. Restore `.env.example` as template
3. Re-secure distribute secrets via secure channel

### 13.2 Doppler Outage Response

Doppler CLI caches secrets locally (encrypted). During an outage:
- Existing processes continue to work
- New process starts use cached secrets
- Cache TTL: configurable (default varies by plan)

Configure fallback secret fetch interval:
```bash
doppler run --fallback-passphrase="$FALLBACK_KEY" --fallback-readonly -- <command>
```

---

## Appendix A: Doppler CLI Quick Reference

```bash
# Authentication
doppler login                    # Interactive login
doppler logout                   # Clear credentials

# Project Setup
doppler setup                    # Interactive setup
doppler setup --no-interactive   # Use doppler.yaml

# Secret Management
doppler secrets                  # List all secrets
doppler secrets get KEY          # Get specific secret
doppler secrets set KEY=value    # Set secret (dev only)

# Running Commands
doppler run -- <command>         # Run with secrets injected
doppler run -p PROJECT -c CONFIG -- <command>  # Specific project/config

# Debugging
doppler run --print-env          # Print injected env vars
doppler secrets download --no-file --format env  # Download as .env format
```

---

## Appendix B: Environment Variable Reference

| Variable | Required By | Description |
|----------|-------------|-------------|
| `DATABASE_URL` | web, worker, db | PostgreSQL connection string |
| `NEXTAUTH_SECRET` | web | NextAuth.js encryption key |
| `NEXTAUTH_URL` | web | Base URL for auth callbacks |
| `JWT_SHARED_SECRET` | web, ingest, worker | Cross-service JWT signing |
| `INTERNAL_API_SECRET` | web, ingest, worker | Internal API authentication |
| `AUTH_GOOGLE_ID` | web | Google OAuth client ID |
| `AUTH_GOOGLE_SECRET` | web | Google OAuth client secret |
| `AUTH_GITHUB_ID` | web | GitHub OAuth client ID |
| `AUTH_GITHUB_SECRET` | web | GitHub OAuth client secret |
| `WEB_API_URL` | ingest, worker | URL to web API for internal calls |
| `PORT` | ingest | Ingest service port |
| `API_KEY_PREFIX` | web, ingest | API key prefix (co_sk_) |
| `API_KEY_RANDOM_BYTES_LENGTH` | web | API key entropy bytes |
| `NODE_ENV` | web, worker | Environment mode |
| `TEMPORAL_ADDRESS` | ingest, worker | Temporal server address |
| `TEMPORAL_NAMESPACE` | ingest, worker | Temporal namespace |
| `TEMPORAL_TASK_QUEUE` | ingest, worker | Temporal task queue name |
