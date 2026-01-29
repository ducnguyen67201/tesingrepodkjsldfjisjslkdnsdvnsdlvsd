# Single VPS Deployment Specification

**Issue:** #94
**Points:** 5
**Dependencies:** None

---

## 1. Overview

Deploy Ducsigr (Web, Worker, Ingest) to a single Hetzner VPS with Docker Compose, automated CI/CD via GitHub Actions, and secrets management via Doppler.

### Goals

- Minimal cost (~$5-7/month)
- Automated deployments on push to `main`
- Secure secrets management (public repo)
- Zero-downtime deployments
- Automated backups

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Hetzner VPS (CX22 - €4.35/mo)                │
│                    4GB RAM, 2 vCPU, 40GB SSD                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                    Caddy (Reverse Proxy)                │   │
│   │              Auto HTTPS (Let's Encrypt)                 │   │
│   │         :443 → web:3000, ingest.* → ingest:8080        │   │
│   └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│        ┌─────────────────────┼─────────────────────┐            │
│        ▼                     ▼                     ▼            │
│   ┌─────────┐          ┌─────────┐          ┌─────────┐        │
│   │   Web   │          │ Worker  │          │ Ingest  │        │
│   │ Next.js │          │ Node.js │          │   Go    │        │
│   │  :3000  │          │    -    │          │  :8080  │        │
│   └─────────┘          └─────────┘          └─────────┘        │
│        │                     │                     │            │
│        └─────────────────────┼─────────────────────┘            │
│                              ▼                                  │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │              PostgreSQL          Redis                 │   │
│   │                :5432             :6379                  │   │
│   │              (internal)        (internal)               │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │     Doppler     │
                    │ (Secrets Mgmt)  │
                    └─────────────────┘
```

### Deployment Flow

```
┌──────────┐     ┌──────────────┐     ┌─────────────┐     ┌─────────┐
│  GitHub  │────▶│GitHub Actions│────▶│   Doppler   │────▶│   VPS   │
│  (push)  │     │  (CI/CD)     │     │  (secrets)  │     │(deploy) │
└──────────┘     └──────────────┘     └─────────────┘     └─────────┘
```

---

## 2. Infrastructure

### 2.1 VPS Provider: Hetzner

| Spec | Value |
|------|-------|
| Plan | CX22 |
| RAM | 4GB |
| vCPU | 2 (shared) |
| Storage | 40GB SSD |
| Traffic | 20TB/month |
| Cost | €4.35/month (~$5) |
| OS | Ubuntu 24.04 LTS |
| Location | Nuremberg, DE (or Ashburn, US) |

### 2.2 Domain & DNS

Configure DNS A records pointing to VPS IP:

```
A     @                  → <VPS_IP>    # ducsigr.io
A     api                → <VPS_IP>    # api.ducsigr.io (optional)
A     ingest             → <VPS_IP>    # ingest.ducsigr.io
```

### 2.3 Resource Allocation

| Service | Memory Limit | CPU Limit | Notes |
|---------|-------------|-----------|-------|
| PostgreSQL | 512MB | 0.5 | Shared, persistent |
| Redis | 128MB | 0.25 | Queue + cache |
| Web | 768MB | 0.5 | Next.js SSR |
| Worker | 384MB | 0.5 | Background jobs |
| Ingest | 128MB | 0.25 | Go, lightweight |
| Caddy | 64MB | 0.1 | Reverse proxy |
| **Total** | ~2GB | ~2 | 2GB headroom |

---

## 3. Secrets Management (Doppler)

### 3.1 Why Doppler

- **Public repo safety**: Secrets never in code or env files
- **Single source of truth**: All environments managed centrally
- **Automatic injection**: CLI injects at runtime
- **Audit trail**: Track who accessed what
- **Free tier**: 5 projects, unlimited secrets

### 3.2 Doppler Project Structure

```
ducsigr (Project)
├── dev          # Local development
├── staging      # Staging environment (future)
└── prod         # Production VPS
```

### 3.3 Required Secrets

| Secret | Description | Example |
|--------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection | `postgresql://user:pass@postgres:5432/ducsigr` |
| `REDIS_URL` | Redis connection | `redis://redis:6379` |
| `NEXTAUTH_SECRET` | NextAuth.js secret | `<random-32-char>` |
| `NEXTAUTH_URL` | App URL | `https://ducsigr.io` |
| `GOOGLE_CLIENT_ID` | OAuth (if used) | `xxx.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | OAuth secret | `GOCSPX-xxx` |
| `GMAIL_APP_PASSWORD` | Alerting emails | `xxxx xxxx xxxx xxxx` |
| `GMAIL_FROM_EMAIL` | Sender email | `alerts@ducsigr.io` |

### 3.4 Doppler Setup

```bash
# Install Doppler CLI (on VPS)
curl -Ls https://cli.doppler.com/install.sh | sh

# Login (interactive, one-time)
doppler login

# Setup project
doppler setup --project ducsigr --config prod

# Run any command with secrets injected
doppler run -- docker compose up -d

# Or export to .env file (for Docker Compose)
doppler secrets download --no-file --format env > .env
```

### 3.5 GitHub Actions Integration

Doppler provides a service token for CI/CD:

```yaml
# In GitHub Actions
- name: Install Doppler
  uses: dopplerhq/cli-action@v3

- name: Deploy with secrets
  run: doppler run -- ./deploy.sh
  env:
    DOPPLER_TOKEN: ${{ secrets.DOPPLER_TOKEN }}
```

---

## 4. Docker Configuration

### 4.1 Production Docker Compose

```yaml
# docker-compose.prod.yml
version: "3.8"

services:
  # ===========================================
  # DATABASES
  # ===========================================
  postgres:
    image: postgres:16-alpine
    container_name: ducsigr-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${DB_USER:-ducsigr}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: ${DB_NAME:-ducsigr}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER:-ducsigr}"]
      interval: 10s
      timeout: 5s
      retries: 5
    deploy:
      resources:
        limits:
          memory: 512M
    networks:
      - internal

  redis:
    image: redis:7-alpine
    container_name: ducsigr-redis
    restart: unless-stopped
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    deploy:
      resources:
        limits:
          memory: 128M
    networks:
      - internal

  # ===========================================
  # APPLICATION SERVICES
  # ===========================================
  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
    container_name: ducsigr-web
    restart: unless-stopped
    environment:
      NODE_ENV: production
      DATABASE_URL: ${DATABASE_URL}
      REDIS_URL: ${REDIS_URL}
      NEXTAUTH_SECRET: ${NEXTAUTH_SECRET}
      NEXTAUTH_URL: ${NEXTAUTH_URL}
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    deploy:
      resources:
        limits:
          memory: 768M
    networks:
      - internal
    labels:
      - "caddy.reverse_proxy={{upstreams 3000}}"

  worker:
    build:
      context: .
      dockerfile: apps/worker/Dockerfile
    container_name: ducsigr-worker
    restart: unless-stopped
    environment:
      NODE_ENV: production
      DATABASE_URL: ${DATABASE_URL}
      REDIS_URL: ${REDIS_URL}
      GMAIL_APP_PASSWORD: ${GMAIL_APP_PASSWORD}
      GMAIL_FROM_EMAIL: ${GMAIL_FROM_EMAIL}
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    deploy:
      resources:
        limits:
          memory: 384M
    networks:
      - internal

  ingest:
    build:
      context: ./apps/ingest
      dockerfile: Dockerfile
    container_name: ducsigr-ingest
    restart: unless-stopped
    environment:
      PORT: "8080"
      REDIS_URL: ${REDIS_URL}
      LOG_LEVEL: ${LOG_LEVEL:-info}
    depends_on:
      redis:
        condition: service_healthy
    deploy:
      resources:
        limits:
          memory: 128M
    networks:
      - internal

  # ===========================================
  # REVERSE PROXY
  # ===========================================
  caddy:
    image: caddy:2-alpine
    container_name: ducsigr-caddy
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - web
      - ingest
    deploy:
      resources:
        limits:
          memory: 64M
    networks:
      - internal

volumes:
  postgres_data:
  redis_data:
  caddy_data:
  caddy_config:

networks:
  internal:
    driver: bridge
```

### 4.2 Caddyfile

```caddyfile
# Caddyfile
{
    email admin@ducsigr.io
}

# Main application
ducsigr.io {
    reverse_proxy web:3000

    # Security headers
    header {
        X-Content-Type-Options nosniff
        X-Frame-Options DENY
        Referrer-Policy strict-origin-when-cross-origin
    }

    # Compression
    encode gzip zstd
}

# Ingest service (separate subdomain for SDK)
ingest.ducsigr.io {
    reverse_proxy ingest:8080

    # Higher limits for trace ingestion
    request_body {
        max_size 10MB
    }
}

# Health check endpoint (for monitoring)
:8888 {
    respond /health "OK" 200
}
```

### 4.3 Service Dockerfiles

#### Web (Next.js)

```dockerfile
# apps/web/Dockerfile
FROM node:24-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Dependencies
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/
COPY packages/db/package.json ./packages/db/
COPY packages/api/package.json ./packages/api/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile

# Builder
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm db:generate
RUN pnpm --filter web build

# Runner
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public
USER nextjs
EXPOSE 3000
ENV PORT=3000
CMD ["node", "apps/web/server.js"]
```

#### Worker (Node.js)

```dockerfile
# apps/worker/Dockerfile
FROM node:24-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Dependencies
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/worker/package.json ./apps/worker/
COPY packages/db/package.json ./packages/db/
COPY packages/api/package.json ./packages/api/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile --prod

# Builder
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm db:generate
RUN pnpm --filter worker build

# Runner
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 worker
COPY --from=builder /app/apps/worker/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
USER worker
CMD ["node", "dist/index.js"]
```

#### Ingest (Go) - Already exists

```dockerfile
# apps/ingest/Dockerfile (existing, for reference)
FROM golang:1.23-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /ingest ./cmd/ingest

FROM alpine:3.19
RUN apk --no-cache add ca-certificates
COPY --from=builder /ingest /ingest
EXPOSE 8080
CMD ["/ingest"]
```

---

## 5. CI/CD Pipeline (GitHub Actions)

### 5.1 Deployment Workflow

```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [main]
  workflow_dispatch:  # Manual trigger

concurrency:
  group: deploy-production
  cancel-in-progress: false

env:
  REGISTRY: ghcr.io
  IMAGE_PREFIX: ghcr.io/${{ github.repository }}

jobs:
  # =========================================
  # BUILD & PUSH IMAGES
  # =========================================
  build:
    name: Build Images
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    outputs:
      web_image: ${{ steps.meta-web.outputs.tags }}
      worker_image: ${{ steps.meta-worker.outputs.tags }}
      ingest_image: ${{ steps.meta-ingest.outputs.tags }}

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      # Web
      - name: Docker meta (web)
        id: meta-web
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.IMAGE_PREFIX }}/web
          tags: |
            type=sha,prefix=
            type=raw,value=latest

      - name: Build and push (web)
        uses: docker/build-push-action@v5
        with:
          context: .
          file: apps/web/Dockerfile
          push: true
          tags: ${{ steps.meta-web.outputs.tags }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      # Worker
      - name: Docker meta (worker)
        id: meta-worker
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.IMAGE_PREFIX }}/worker
          tags: |
            type=sha,prefix=
            type=raw,value=latest

      - name: Build and push (worker)
        uses: docker/build-push-action@v5
        with:
          context: .
          file: apps/worker/Dockerfile
          push: true
          tags: ${{ steps.meta-worker.outputs.tags }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      # Ingest
      - name: Docker meta (ingest)
        id: meta-ingest
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.IMAGE_PREFIX }}/ingest
          tags: |
            type=sha,prefix=
            type=raw,value=latest

      - name: Build and push (ingest)
        uses: docker/build-push-action@v5
        with:
          context: ./apps/ingest
          file: apps/ingest/Dockerfile
          push: true
          tags: ${{ steps.meta-ingest.outputs.tags }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  # =========================================
  # DEPLOY TO VPS
  # =========================================
  deploy:
    name: Deploy to VPS
    needs: build
    runs-on: ubuntu-latest
    environment: production

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Install Doppler CLI
        uses: dopplerhq/cli-action@v3

      - name: Deploy to VPS
        env:
          DOPPLER_TOKEN: ${{ secrets.DOPPLER_TOKEN }}
        run: |
          # Install SSH key
          mkdir -p ~/.ssh
          echo "${{ secrets.VPS_SSH_KEY }}" > ~/.ssh/deploy_key
          chmod 600 ~/.ssh/deploy_key

          # Add host to known_hosts
          ssh-keyscan -H ${{ secrets.VPS_HOST }} >> ~/.ssh/known_hosts

          # Deploy
          ssh -i ~/.ssh/deploy_key ${{ secrets.VPS_USER }}@${{ secrets.VPS_HOST }} << 'ENDSSH'
            cd /opt/ducsigr

            # Pull latest config
            git pull origin main

            # Fetch secrets from Doppler and write to .env
            doppler secrets download --no-file --format env --project ducsigr --config prod > .env

            # Pull new images
            docker compose -f docker-compose.prod.yml pull

            # Deploy with zero-downtime
            docker compose -f docker-compose.prod.yml up -d --remove-orphans

            # Cleanup old images
            docker image prune -f

            # Health check
            sleep 10
            curl -f http://localhost:3000/api/health || exit 1
          ENDSSH

      - name: Notify on failure
        if: failure()
        run: |
          echo "Deployment failed! Check GitHub Actions logs."
          # Add Slack/Discord notification here
```

### 5.2 Required GitHub Secrets

> **IMPORTANT: This is a public repository. NEVER commit secrets to code.**

Configure these in GitHub Repository Settings → Secrets → Actions:

| Secret | Description | How to Get |
|--------|-------------|------------|
| `VPS_HOST` | VPS IP or hostname | Hetzner dashboard |
| `VPS_USER` | SSH user | `deploy` (created during setup) |
| `VPS_SSH_KEY` | Private SSH key | `ssh-keygen -t ed25519` |
| `DOPPLER_TOKEN` | Doppler service token | Doppler dashboard → Access |

### 5.3 Generate SSH Keys (Local Machine)

```bash
# Generate deploy key (no passphrase for CI)
ssh-keygen -t ed25519 -f ~/.ssh/ducsigr_deploy -N ""

# Copy public key (add to VPS authorized_keys)
cat ~/.ssh/ducsigr_deploy.pub

# Copy private key (add to GitHub Secrets as VPS_SSH_KEY)
cat ~/.ssh/ducsigr_deploy
```

---

## 6. VPS Initial Setup

### 6.1 Setup Script

```bash
#!/bin/bash
# scripts/vps-setup.sh
# Run this once on a fresh VPS

set -e

echo "=== Ducsigr VPS Setup ==="

# Update system
apt update && apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh

# Install Docker Compose plugin
apt install -y docker-compose-plugin

# Install Doppler CLI
curl -Ls https://cli.doppler.com/install.sh | sh

# Create deploy user
useradd -m -s /bin/bash deploy
usermod -aG docker deploy

# Setup SSH for deploy user
mkdir -p /home/deploy/.ssh
# Add your public key here:
echo "ssh-ed25519 AAAA... your-deploy-key" >> /home/deploy/.ssh/authorized_keys
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh

# Create app directory
mkdir -p /opt/ducsigr
chown deploy:deploy /opt/ducsigr

# Configure firewall
ufw allow 22/tcp   # SSH
ufw allow 80/tcp   # HTTP
ufw allow 443/tcp  # HTTPS
ufw --force enable

# Setup Doppler (as deploy user)
su - deploy << 'EOF'
cd /opt/ducsigr
doppler login
doppler setup --project ducsigr --config prod
EOF

echo "=== Setup Complete ==="
echo "Next steps:"
echo "1. Clone repo: git clone https://github.com/YOUR_ORG/ducsigr.git /opt/ducsigr"
echo "2. Start services: cd /opt/ducsigr && doppler run -- docker compose -f docker-compose.prod.yml up -d"
```

### 6.2 Manual Setup Commands

```bash
# 1. SSH into VPS
ssh root@<VPS_IP>

# 2. Run setup script or manual commands:
curl -fsSL https://get.docker.com | sh
apt install -y docker-compose-plugin

# 3. Install Doppler
curl -Ls https://cli.doppler.com/install.sh | sh

# 4. Create deploy user
useradd -m -s /bin/bash deploy
usermod -aG docker deploy

# 5. Setup SSH key for deploy user
mkdir -p /home/deploy/.ssh
echo "<YOUR_PUBLIC_KEY>" >> /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys

# 6. Create app directory
mkdir -p /opt/ducsigr
chown deploy:deploy /opt/ducsigr

# 7. Configure firewall
ufw allow 22 && ufw allow 80 && ufw allow 443 && ufw enable

# 8. Switch to deploy user
su - deploy

# 9. Login to Doppler
doppler login
doppler setup --project ducsigr --config prod

# 10. Clone repository
git clone https://github.com/YOUR_ORG/ducsigr.git /opt/ducsigr

# 11. Initial deploy
cd /opt/ducsigr
doppler run -- docker compose -f docker-compose.prod.yml up -d
```

---

## 7. Backup Strategy

### 7.1 Database Backup Script

```bash
#!/bin/bash
# scripts/backup.sh
# Run via cron: 0 3 * * * /opt/ducsigr/scripts/backup.sh

set -e

BACKUP_DIR="/opt/ducsigr/backups"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=7

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup PostgreSQL
echo "Backing up PostgreSQL..."
docker exec ducsigr-postgres pg_dump -U ducsigr ducsigr | gzip > "$BACKUP_DIR/db_$DATE.sql.gz"

# Backup Redis (optional, for persistence)
echo "Backing up Redis..."
docker exec ducsigr-redis redis-cli BGSAVE
sleep 2
docker cp ducsigr-redis:/data/dump.rdb "$BACKUP_DIR/redis_$DATE.rdb"

# Upload to cloud storage (optional, requires rclone)
# rclone copy $BACKUP_DIR remote:ducsigr-backups --max-age 24h

# Cleanup old backups
find $BACKUP_DIR -mtime +$RETENTION_DAYS -delete

echo "Backup complete: $DATE"
```

### 7.2 Cron Setup

```bash
# Add to crontab (crontab -e)
# Daily backup at 3 AM
0 3 * * * /opt/ducsigr/scripts/backup.sh >> /var/log/ducsigr-backup.log 2>&1
```

---

## 8. Monitoring

### 8.1 Simple Health Checks

```bash
# scripts/healthcheck.sh
#!/bin/bash

check_service() {
    if curl -sf "$1" > /dev/null; then
        echo "✓ $2 is healthy"
    else
        echo "✗ $2 is DOWN"
        exit 1
    fi
}

check_service "http://localhost:3000/api/health" "Web"
check_service "http://localhost:8080/health" "Ingest"

echo "All services healthy!"
```

### 8.2 Uptime Monitoring (Recommended)

Use free external monitoring:
- **Uptime Kuma** (self-hosted)
- **Better Uptime** (free tier)
- **Cloudflare Health Checks** (if using CF)

---

## 9. Security Checklist

### 9.1 Public Repository Safety

| Item | Status | Notes |
|------|--------|-------|
| No secrets in code | Required | Use Doppler |
| No .env files committed | Required | Add to .gitignore |
| SSH keys in GitHub Secrets | Required | Never in code |
| Doppler token in GitHub Secrets | Required | Service token only |
| Database passwords via Doppler | Required | Never hardcoded |

### 9.2 VPS Security

| Item | Status | Notes |
|------|--------|-------|
| UFW firewall enabled | Required | Only 22, 80, 443 |
| SSH key-only auth | Required | Disable password auth |
| Non-root deploy user | Required | `deploy` user |
| Automatic security updates | Recommended | `unattended-upgrades` |
| Fail2ban | Recommended | Brute-force protection |

### 9.3 Docker Security

| Item | Status | Notes |
|------|--------|-------|
| Non-root container users | Required | USER directive |
| Resource limits | Required | Memory/CPU limits |
| Internal network | Required | No exposed ports except Caddy |
| Read-only mounts where possible | Recommended | `:ro` flag |

---

## 10. File Structure

```
Ducsigr/
├── docker-compose.prod.yml      # NEW: Production compose
├── Caddyfile                    # NEW: Reverse proxy config
├── apps/
│   ├── web/
│   │   └── Dockerfile           # NEW: Web Dockerfile
│   ├── worker/
│   │   └── Dockerfile           # NEW: Worker Dockerfile
│   └── ingest/
│       └── Dockerfile           # EXISTS: Go Dockerfile
├── scripts/
│   ├── vps-setup.sh             # NEW: VPS initialization
│   ├── backup.sh                # NEW: Database backup
│   └── healthcheck.sh           # NEW: Health check script
├── .github/
│   └── workflows/
│       └── deploy.yml           # NEW: Deployment workflow
└── docs/
    └── specs/
        └── deployment/
            └── 100_SINGLE_VPS_DEPLOYMENT_SPEC.md
```

---

## 11. Cost Summary

| Item | Monthly Cost |
|------|-------------|
| Hetzner CX22 VPS | €4.35 (~$5) |
| Domain (amortized) | ~$1 |
| Backup storage (B2/R2) | ~$1 |
| Doppler | Free |
| GitHub Actions | Free |
| **Total** | **~$7/month** |

---

## 12. Implementation Tasks

### Phase 1: Infrastructure Setup (One-time)
- [ ] Create Hetzner account and VPS
- [ ] Point domain DNS to VPS
- [ ] Create Doppler account and project
- [ ] Configure Doppler secrets for prod
- [ ] Generate SSH deploy key
- [ ] Run VPS setup script

### Phase 2: Docker Configuration
- [ ] Create `docker-compose.prod.yml`
- [ ] Create `Caddyfile`
- [ ] Create `apps/web/Dockerfile`
- [ ] Create `apps/worker/Dockerfile`
- [ ] Verify `apps/ingest/Dockerfile` works

### Phase 3: CI/CD Pipeline
- [ ] Create `.github/workflows/deploy.yml`
- [ ] Add GitHub Secrets (VPS_HOST, VPS_USER, VPS_SSH_KEY, DOPPLER_TOKEN)
- [ ] Test deployment workflow

### Phase 4: Operations
- [ ] Setup backup cron job
- [ ] Configure external monitoring
- [ ] Document runbook for common operations

---

## 13. Definition of Done

- [ ] VPS provisioned and configured
- [ ] All services running via Docker Compose
- [ ] HTTPS working via Caddy (Let's Encrypt)
- [ ] CI/CD deploys automatically on push to main
- [ ] Secrets managed via Doppler (no secrets in code)
- [ ] Daily database backups running
- [ ] Health monitoring configured
- [ ] Documentation complete
