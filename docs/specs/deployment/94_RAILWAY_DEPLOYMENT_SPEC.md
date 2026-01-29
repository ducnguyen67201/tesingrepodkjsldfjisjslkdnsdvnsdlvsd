# Railway Deployment - Engineering Spec

**Issue:** #94
**Points:** 2
**Dependencies:** Doppler setup (#118), Temporal migration (#115)
**Approach:** Easiest deployment, git-push workflow (~$25-35/month)

---

## Executive Summary

Deploy Ducsigr to **Railway** with:
- **Neon PostgreSQL** (free tier) - Application database
- **Temporal Cloud** (free tier) - Workflow orchestration
- **Doppler** - Secret management (already integrated)

### Why Railway + Temporal Cloud?

| Benefit | Description |
|---------|-------------|
| **Git-push deploys** | Push to main → auto deploys |
| **No Temporal self-hosting** | Temporal Cloud handles orchestration |
| **Doppler integration** | Secrets already configured |
| **No server management** | No VPS, SSH, or firewall config |
| **Auto HTTPS** | Free SSL certificates |

### Your Stack (3 Services)

| Service | Platform | Cost |
|---------|----------|------|
| **Web** (Next.js) | Railway | ~$10-15/mo |
| **Ingest** (Go) | Railway | ~$3-5/mo |
| **Worker** (Temporal) | Railway | ~$5-10/mo |
| **PostgreSQL** | Neon (free tier) | $0 |
| **Temporal** | Temporal Cloud (free) | $0 |
| **Secrets** | Doppler (free tier) | $0 |
| **Total** | | **~$20-35/mo** |

---

## Architecture

```
                         Internet
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
    ┌─────────────────┐         ┌─────────────────┐
    │   Railway Web   │         │ Railway Ingest  │
    │    (Next.js)    │         │      (Go)       │
    │  ducsigr.io │         │ ingest.cogn...  │
    └────────┬────────┘         └────────┬────────┘
             │                           │
             │    ┌──────────────────────┘
             │    │
             ▼    ▼
    ┌─────────────────┐         ┌─────────────────┐
    │  Temporal Cloud │◀────────│ Railway Worker  │
    │  (Workflows)    │         │   (Temporal)    │
    └────────┬────────┘         └─────────────────┘
             │
    ┌────────┴────────┐
    ▼                 ▼
┌─────────┐     ┌─────────┐
│  Neon   │     │ Doppler │
│Postgres │     │ Secrets │
└─────────┘     └─────────┘
```

### Data Flow

```
SDK → [Ingest (Go)] → [Temporal Cloud] → [Worker (TS)] → [Web API] → Neon PostgreSQL
                                                             ↑
                                                       [Web (Next.js)]

Note: Worker activities are READ-ONLY. All mutations go through Web API.
```

---

## Phase 1: External Services Setup (1 hour)

### 1.1 Create Neon PostgreSQL (Free Tier)

1. Go to [neon.tech](https://neon.tech)
2. Sign up / Log in
3. Create new project:
   - **Name:** `ducsigr`
   - **Region:** `us-east-1` (or closest to you)
   - **Postgres version:** 16
4. Copy the connection string:
   ```
   postgresql://username:password@ep-xxx.us-east-1.aws.neon.tech/ducsigr?sslmode=require
   ```

**Neon Free Tier Limits:**

| Resource | Free Tier Limit | Enough for MVP? |
|----------|-----------------|-----------------|
| Storage | 0.5 GB | Yes |
| Compute | 0.25 vCPU | Yes |
| Branches | 10 | Yes |

### 1.2 Create Temporal Cloud Account (Free Tier)

1. Go to [temporal.io/cloud](https://temporal.io/cloud)
2. Sign up for free tier
3. Create namespace: `ducsigr-prod`
4. Note the connection details:
   ```
   Address: <namespace>.<account>.tmprl.cloud:7233
   Namespace: ducsigr-prod
   ```
5. Create API key for authentication

**Temporal Cloud Free Tier:**

| Resource | Free Tier Limit |
|----------|-----------------|
| Actions | 1M/month |
| Namespaces | 1 |
| Retention | 7 days |

### 1.3 Configure Doppler for Production

You already have Doppler set up. Add/update these secrets in `prd` config:

```bash
# Doppler Dashboard → ducsigr → prd

# Database (Neon)
DATABASE_URL=postgresql://...@neon.tech/ducsigr?sslmode=require

# Temporal Cloud
TEMPORAL_ADDRESS=<namespace>.<account>.tmprl.cloud:7233
TEMPORAL_NAMESPACE=ducsigr-prod
TEMPORAL_TASK_QUEUE=ducsigr-tasks
TEMPORAL_API_KEY=<your-temporal-cloud-api-key>

# Auth
NEXTAUTH_URL=https://ducsigr.io
NEXTAUTH_SECRET=<generate-32-char-secret>

# Cross-service
INTERNAL_API_SECRET=<generate-32-char-secret>
JWT_SHARED_SECRET=<generate-32-char-secret>
WEB_API_URL=https://ducsigr.io

# Optional OAuth
AUTH_GOOGLE_ID=xxx
AUTH_GOOGLE_SECRET=xxx
```

---

## Phase 2: Railway Setup (1 hour)

### 2.1 Create Railway Project

1. Go to [railway.app](https://railway.app)
2. Sign up with GitHub
3. Click **"New Project"** → **"Empty Project"**
4. Name it: `ducsigr`

### 2.2 Deploy Web Service

1. Click **"+ New"** → **"GitHub Repo"**
2. Select your `Ducsigr` repository
3. Configure:
   - **Root Directory:** `/` (monorepo root)
   - **Watch Paths:** `apps/web/**`, `packages/**`

4. Add environment variables (Settings → Variables):
   ```
   DOPPLER_TOKEN=<your-doppler-prd-service-token>
   ```

5. Set build & start commands (Settings → Build):
   ```
   # Build Command
   curl -Ls https://cli.doppler.com/install.sh | sh && doppler run -- pnpm install && doppler run -- pnpm --filter @ducsigr/db generate && doppler run -- pnpm --filter @ducsigr/web build

   # Start Command
   doppler run -- node apps/web/.next/standalone/apps/web/server.js
   ```

6. Add custom domain (Settings → Networking):
   - `ducsigr.io`

### 2.3 Deploy Ingest Service

1. Click **"+ New"** → **"GitHub Repo"**
2. Select same repository
3. Configure:
   - **Root Directory:** `apps/ingest`
   - **Watch Paths:** `apps/ingest/**`

4. Add environment variables:
   ```
   DOPPLER_TOKEN=<your-doppler-prd-service-token>
   ```

5. Set build & start commands:
   ```
   # Build Command (Railway auto-detects Go, but we need Doppler)
   curl -Ls https://cli.doppler.com/install.sh | sh && go build -o /app/ingest ./cmd/ingest

   # Start Command
   doppler run -- /app/ingest
   ```

6. Add custom domain:
   - `ingest.ducsigr.io`

### 2.4 Deploy Worker Service

1. Click **"+ New"** → **"GitHub Repo"**
2. Select same repository
3. Configure:
   - **Root Directory:** `/` (monorepo root)
   - **Watch Paths:** `apps/worker/**`, `packages/**`

4. Add environment variables:
   ```
   DOPPLER_TOKEN=<your-doppler-prd-service-token>
   ```

5. Set build & start commands:
   ```
   # Build Command
   curl -Ls https://cli.doppler.com/install.sh | sh && doppler run -- pnpm install && doppler run -- pnpm --filter @ducsigr/db generate && doppler run -- pnpm --filter @ducsigr/worker build

   # Start Command
   doppler run -- node apps/worker/dist/index.js
   ```

6. No public domain needed (worker connects outbound to Temporal Cloud)

---

## Phase 3: Code Configuration

### 3.1 Update Next.js Config

```typescript
// apps/web/next.config.ts
import type { NextConfig } from "next";
import "./src/lib/env";

const nextConfig: NextConfig = {
  output: "standalone",  // Required for Railway
  transpilePackages: ["@ducsigr/shared", "@ducsigr/db"],
};

export default nextConfig;
```

### 3.2 Update Worker for Temporal Cloud

The worker needs to connect to Temporal Cloud with mTLS or API key auth:

```typescript
// apps/worker/src/temporal/client.ts
import { Connection, Client } from "@temporalio/client";
import { env } from "../lib/env";

let clientInstance: Client | null = null;

export async function getTemporalClient(): Promise<Client> {
  if (clientInstance) {
    return clientInstance;
  }

  const connection = await Connection.connect({
    address: env.TEMPORAL_ADDRESS,
    // For Temporal Cloud, use API key or mTLS
    ...(env.TEMPORAL_API_KEY && {
      apiKey: env.TEMPORAL_API_KEY,
    }),
  });

  clientInstance = new Client({
    connection,
    namespace: env.TEMPORAL_NAMESPACE,
  });

  return clientInstance;
}
```

### 3.3 Update Worker Environment Schema

```typescript
// apps/worker/src/lib/env.ts
export const env = createEnv({
  server: {
    // ... existing fields ...

    // Temporal Configuration
    TEMPORAL_ADDRESS: z.string().default("localhost:7233"),
    TEMPORAL_NAMESPACE: z.string().default("default"),
    TEMPORAL_TASK_QUEUE: z.string().default("ducsigr-tasks"),
    TEMPORAL_API_KEY: z.string().optional(), // For Temporal Cloud
  },
  // ...
});
```

### 3.4 Update Ingest for Temporal Cloud

```go
// apps/ingest/internal/config/config.go
type Config struct {
    // ... existing fields ...

    TemporalAddress   string `env:"TEMPORAL_ADDRESS" envDefault:"localhost:7233"`
    TemporalNamespace string `env:"TEMPORAL_NAMESPACE" envDefault:"default"`
    TemporalTaskQueue string `env:"TEMPORAL_TASK_QUEUE" envDefault:"ducsigr-tasks"`
    TemporalAPIKey    string `env:"TEMPORAL_API_KEY"` // For Temporal Cloud
}
```

### 3.5 Create Health Endpoints

**Web Health (if not exists):**
```typescript
// apps/web/src/app/api/health/route.ts
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "web",
    timestamp: new Date().toISOString()
  });
}
```

**Ingest already has `/health` endpoint.**

---

## Phase 4: Doppler Service Tokens

### 4.1 Create Railway Service Token

In Doppler Dashboard:

1. Go to `ducsigr` project → `prd` config
2. Click **"Access"** → **"Service Tokens"**
3. Create token: `railway-prd`
4. Copy the token (starts with `dp.st.`)

### 4.2 Add to Railway

For each Railway service (Web, Ingest, Worker):
1. Go to service → **Variables**
2. Add: `DOPPLER_TOKEN` = `dp.st.xxx...`

---

## Phase 5: Domain & DNS Setup

### 5.1 Railway Domain Configuration

1. **Web Service** → Settings → Networking → Custom Domain
   - Add: `ducsigr.io`
   - Railway provides CNAME target

2. **Ingest Service** → Settings → Networking → Custom Domain
   - Add: `ingest.ducsigr.io`
   - Railway provides CNAME target

### 5.2 DNS Configuration

Add these records at your domain registrar:

```
CNAME    @       → <railway-web-target>.railway.app
CNAME    ingest  → <railway-ingest-target>.railway.app
```

---

## Phase 6: Database Migration

### 6.1 Run Initial Migration

With Doppler configured, run migration locally:

```bash
# From project root
doppler run -c prd -- pnpm --filter @ducsigr/db db:push
```

Or use Railway CLI:
```bash
railway run --service web -- npx prisma migrate deploy
```

---

## Cost Breakdown

### Railway Usage-Based Pricing

| Service | RAM | CPU | Est. Monthly |
|---------|-----|-----|--------------|
| Web (Next.js) | ~512MB | ~0.25 vCPU | ~$10-15 |
| Ingest (Go) | ~128MB | ~0.1 vCPU | ~$3-5 |
| Worker (Temporal) | ~256MB | ~0.15 vCPU | ~$5-10 |
| **Subtotal** | | | **~$18-30** |

### Total Cost

| Item | Monthly Cost |
|------|-------------|
| Railway (Hobby + usage) | ~$20-35 |
| Neon PostgreSQL | $0 (free tier) |
| Temporal Cloud | $0 (free tier) |
| Doppler | $0 (free tier) |
| Domain (amortized) | ~$1 |
| **Total** | **~$21-36/month** |

---

## Deployment Workflow

### Automatic Deploys

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   GitHub    │────▶│   Railway   │────▶│    Live     │
│  (push to   │     │  (builds &  │     │  (services  │
│    main)    │     │   deploys)  │     │   updated)  │
└─────────────┘     └─────────────┘     └─────────────┘
                           │
                    ┌──────┴──────┐
                    ▼             ▼
             ┌─────────┐   ┌───────────┐
             │ Doppler │   │ Temporal  │
             │(secrets)│   │  Cloud    │
             └─────────┘   └───────────┘
```

### Manual Deploy

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login & link
railway login
railway link

# Deploy specific service
railway up --service web
```

---

## Monitoring & Logs

### Built-in Features

| Platform | What to Monitor |
|----------|-----------------|
| **Railway** | Logs, CPU, RAM per service |
| **Temporal Cloud** | Workflow executions, failures, latency |
| **Neon** | Query performance, storage usage |
| **Doppler** | Secret access audit logs |

### Health Check URLs

- Web: `https://ducsigr.io/api/health`
- Ingest: `https://ingest.ducsigr.io/health`
- Temporal: Via Temporal Cloud dashboard

---

## File Changes Summary

```
Ducsigr/
├── apps/
│   ├── web/
│   │   └── next.config.ts           # Add: output: 'standalone'
│   ├── ingest/
│   │   └── internal/config/config.go # Add: TEMPORAL_API_KEY
│   └── worker/
│       └── src/
│           ├── lib/env.ts           # Add: TEMPORAL_API_KEY
│           └── temporal/client.ts   # Add: API key auth option
└── (Doppler handles all secrets - no .env files!)
```

---

## Implementation Checklist

### Phase 1: External Services (1 hour)
- [ ] Create Neon PostgreSQL database
- [ ] Create Temporal Cloud account & namespace
- [ ] Configure Doppler `prd` secrets

### Phase 2: Railway Setup (1 hour)
- [ ] Create Railway project
- [ ] Deploy Web service
- [ ] Deploy Ingest service
- [ ] Deploy Worker service
- [ ] Add `DOPPLER_TOKEN` to each service

### Phase 3: Code Changes (30 mins)
- [ ] Add `output: 'standalone'` to Next.js config
- [ ] Add `TEMPORAL_API_KEY` support to worker
- [ ] Add `TEMPORAL_API_KEY` support to ingest
- [ ] Push to main

### Phase 4: Domain & DNS (30 mins)
- [ ] Add custom domains in Railway
- [ ] Configure DNS CNAME records
- [ ] Verify HTTPS working

### Phase 5: Database (15 mins)
- [ ] Run Prisma migrations against Neon

### Phase 6: Verification (15 mins)
- [ ] Access `https://ducsigr.io`
- [ ] Test ingest endpoint
- [ ] Check Temporal Cloud for workflow execution
- [ ] Verify worker processes workflows

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Build fails | Check Railway logs, ensure Doppler token valid |
| Can't connect to Neon | Verify `?sslmode=require` in DATABASE_URL |
| Temporal connection fails | Check API key, namespace, address in Doppler |
| Worker not processing | Check Temporal Cloud dashboard for errors |
| Doppler token invalid | Regenerate service token, update Railway |

---

## Scaling (Future)

| Trigger | Action |
|---------|--------|
| Web slow | Increase Railway RAM/replicas |
| DB limits | Upgrade Neon to paid ($19/mo) |
| Temporal limits | Upgrade Temporal Cloud plan |
| High ingest volume | Add Railway replicas |

---

## Definition of Done

- [ ] Neon PostgreSQL provisioned
- [ ] Temporal Cloud namespace created
- [ ] Doppler `prd` config complete
- [ ] Railway services deployed (Web, Ingest, Worker)
- [ ] Custom domains configured with HTTPS
- [ ] Can access `https://ducsigr.io`
- [ ] Can POST traces to `https://ingest.ducsigr.io/v1/traces`
- [ ] Workflows execute in Temporal Cloud
- [ ] Auto-deploys working on push to main
