# Issue #118: Integrate Doppler for Centralized Secret Management

## Ticket Details

| Field | Value |
|-------|-------|
| **Type** | Story |
| **Priority** | High |
| **Epic** | Infrastructure & DevOps |
| **Sprint** | Backlog (Ready for Refinement) |
| **Story Points** | 8 |
| **Labels** | `security`, `devops`, `infrastructure`, `secrets` |

---

## Summary

As a **developer**, I want to **use Doppler for centralized secret management** so that **secrets are never stored in .env files, are easily rotated, and synchronized across all services**.

---

## Description

### Background

Currently, Ducsigr uses `.env` files for secret management which presents security and operational challenges:
- Secrets stored in plaintext locally
- Manual synchronization across developer machines
- No audit trail for secret access
- Risk of accidental commit to version control
- Difficult to rotate secrets across services

### Architecture

```
SDK → [Ingest (Go)] → [Temporal] → [Worker (TS)] → [Web API] → PostgreSQL
                                                       ↑
                                                 [Web (Next.js)]
```

**Services:**
- **Web (Next.js)**: Dashboard, API (authoritative for mutations)
- **Ingest (Go)**: High-throughput trace ingestion, starts Temporal workflows
- **Worker (Temporal)**: Temporal worker with READ-ONLY activities

### Solution

Integrate [Doppler](https://dashboard.doppler.com/) as the single source of truth for all environment variables and secrets across the monorepo (Web, Ingest, Worker services).

### Technical Specification

Full engineering spec: `docs/specs/issue-104-doppler-secret-management.md`

---

## Acceptance Criteria

### AC1: Doppler Project Setup
- [ ] Doppler workspace created with project structure:
  - `ducsigr-shared` (DATABASE_URL, JWT secrets, TEMPORAL_*)
  - `ducsigr-web` (NextAuth, OAuth credentials)
  - `ducsigr-ingest` (PORT, WEB_API_URL)
  - `ducsigr-worker` (worker-specific configs)
- [ ] Environments configured: `dev`, `stg`, `prd` for each project
- [ ] All secrets from `.env.example` populated in Doppler

### AC2: Monorepo Configuration
- [ ] `doppler.yaml` created at repository root with path mappings for all apps
- [ ] Running `doppler setup --no-interactive` configures all projects correctly
- [ ] Each app directory uses its designated Doppler project

### AC3: Local Development Works
- [ ] `pnpm dev` starts all services with Doppler-injected secrets
- [ ] `make dev` in `apps/ingest` starts Go service with secrets
- [ ] `pnpm db:studio` opens Prisma Studio with correct DATABASE_URL
- [ ] OAuth flows (Google, GitHub) work correctly
- [ ] Cross-service JWT validation works
- [ ] API key generation and validation works
- [ ] Temporal workflows execute successfully
- [ ] Worker activities can call tRPC internal procedures

### AC4: Code Changes
- [ ] `apps/web/src/lib/env.ts` no longer loads dotenv
- [ ] `apps/ingest/cmd/ingest/main.go` no longer loads godotenv
- [ ] `apps/worker/src/lib/env.ts` no longer loads dotenv
- [ ] `dotenv` removed from web and worker package dependencies
- [ ] `godotenv` removed from ingest go.mod (or unused)
- [ ] `package.json` scripts updated to use `doppler run`
- [ ] `apps/ingest/Makefile` updated to use `doppler run`

### AC5: CI/CD Integration
- [ ] GitHub Actions workflow updated with Doppler CLI installation
- [ ] Service token created and stored as GitHub secret `DOPPLER_TOKEN_CI`
- [ ] CI builds pass with Doppler-injected secrets
- [ ] Tests run successfully with CI config

### AC6: Docker & Production Ready
- [ ] Ingest Dockerfile updated with Doppler CLI installation
- [ ] Docker Compose production template supports `DOPPLER_TOKEN` injection
- [ ] Service tokens created for staging and production environments
- [ ] Production deployment documented
- [ ] Temporal server configuration included in docker-compose

### AC7: Documentation
- [ ] Developer onboarding docs updated with Doppler setup steps
- [ ] `.env.example` updated to reference Doppler (not for actual secrets)
- [ ] README updated with new development workflow
- [ ] Runbook created for secret rotation procedures

### AC8: Security & Cleanup
- [ ] No `.env` files containing secrets exist in repository
- [ ] `.gitignore` updated to prevent `.env` file creation
- [ ] Doppler access controls configured (dev: all, prod: restricted)
- [ ] Audit logging enabled for production secret access

---

## Subtasks

### Phase 1: Setup & Configuration (2 points)
- [ ] **118.1** Install Doppler CLI on development machines
- [ ] **118.2** Create Doppler projects (shared, web, ingest, worker)
- [ ] **118.3** Populate all secrets in Doppler dashboard (including TEMPORAL_*)
- [ ] **118.4** Create `doppler.yaml` configuration file

### Phase 2: Code Integration (3 points)
- [ ] **118.5** Update `package.json` scripts with `doppler run`
- [ ] **118.6** Update Go Makefile for ingest service
- [ ] **118.7** Remove dotenv from `apps/web/src/lib/env.ts`
- [ ] **118.8** Remove godotenv from `apps/ingest/cmd/ingest/main.go`
- [ ] **118.9** Remove dotenv from `apps/worker/src/lib/env.ts`
- [ ] **118.10** Remove dotenv/godotenv dependencies

### Phase 3: CI/CD (2 points)
- [ ] **118.11** Create CI service token in Doppler
- [ ] **118.12** Add `DOPPLER_TOKEN_CI` to GitHub Secrets
- [ ] **118.13** Update GitHub Actions workflow
- [ ] **118.14** Test CI pipeline with Doppler

### Phase 4: Docker & Docs (1 point)
- [ ] **118.15** Update Ingest Dockerfile with Doppler CLI
- [ ] **118.16** Create docker-compose.prod.yml template (with Temporal)
- [ ] **118.17** Update developer documentation
- [ ] **118.18** Clean up and remove `.env` files

---

## Story Points

**Total: 8 points** (Fibonacci)

Recommended sprint breakdown:
- Sprint 1 (4 points): Phases 1-2 (Setup + Code Integration)
- Sprint 2 (4 points): Phases 3-4 (CI/CD + Docker + Docs)

## Definition of Done

- [ ] All acceptance criteria met
- [ ] Code reviewed and approved
- [ ] All tests passing in CI
- [ ] No secrets in repository or local `.env` files
- [ ] All team members can run `doppler setup` and start development
- [ ] Documentation updated
- [ ] Production deployment tested in staging
- [ ] Temporal workflows execute with Doppler-injected secrets

---

## Technical Notes

### Secret Inventory (Updated for Temporal)

```
# Database
DATABASE_URL

# Auth
NEXTAUTH_SECRET, NEXTAUTH_URL
AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET
AUTH_GITHUB_ID, AUTH_GITHUB_SECRET

# Cross-service
JWT_SHARED_SECRET
INTERNAL_API_SECRET
WEB_API_URL

# API Keys
API_KEY_PREFIX
API_KEY_RANDOM_BYTES_LENGTH

# Temporal (NEW)
TEMPORAL_ADDRESS
TEMPORAL_NAMESPACE
TEMPORAL_TASK_QUEUE
```

### Doppler CLI Installation

```bash
# macOS
brew install dopplerhq/cli/doppler

# Linux
curl -sLf https://cli.doppler.com/install.sh | sh

# Windows
scoop install doppler
```

### Quick Start After Implementation

```bash
# One-time setup
doppler login
doppler setup --no-interactive

# Start infrastructure
make docker-up  # PostgreSQL + Temporal

# Daily development
pnpm dev  # All services with secrets

# Temporal UI
open http://localhost:8088
```

### Dependencies

- Doppler Team/Enterprise plan for audit logging
- GitHub Actions access to add secrets
- Access to production infrastructure for service tokens

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Doppler service outage | High | CLI caches secrets locally; fallback passphrase configured |
| Developer onboarding friction | Medium | Clear documentation; automated setup via `doppler.yaml` |
| Secret leakage during migration | High | Never commit secrets; use secure channels for migration |
| Temporal connectivity issues | Medium | TEMPORAL_* secrets properly configured in all environments |

---

## Out of Scope (Future Enhancements)

- Dynamic secret rotation automation
- Doppler webhooks for secret change notifications
- OIDC authentication (use service tokens initially)
- Kubernetes Operator integration

---

## Related Issues

- Depends on: None
- Blocks: Production deployment automation
- Related: Alert System (uses Temporal workflows)

---

## Attachments

- Engineering Spec: `docs/specs/issue-104-doppler-secret-management.md`

---

## Sprint Planning Notes

### Recommended Sprint Breakdown

**Sprint 1 (4 points):**
- Subtasks 118.1 - 118.10 (Setup + Code Integration)
- Deliverable: Local development works with Doppler

**Sprint 2 (4 points):**
- Subtasks 118.11 - 118.18 (CI/CD + Docker + Docs)
- Deliverable: Full pipeline with Doppler, production-ready

### Team Capacity

- 1 developer: 3-4 days estimated
- Requires DevOps access for GitHub secrets and production tokens

### Blockers to Address Before Sprint

1. Confirm Doppler plan (Team vs Enterprise)
2. Get Doppler workspace admin access
3. Coordinate production access with DevOps team
