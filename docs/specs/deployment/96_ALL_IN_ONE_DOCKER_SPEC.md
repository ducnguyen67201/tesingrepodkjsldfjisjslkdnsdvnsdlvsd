# Self-Hosted Docker Distribution - Engineering Spec

**Issue:** #96
**Epic:** Open Source Distribution
**Points:** 13
**Priority:** P0
**Dependencies:** #94 (Railway Deployment), #118 (Doppler Integration), #115 (Temporal Migration)

---

## 1. Executive Summary

Enable Ducsigr to be self-hosted with **two deployment options**:

1. **Quick Start (Single Container)** - One `docker run` command, everything included
2. **Production (Docker Compose)** - Separate containers, scalable, production-ready

Both options should get users to their first trace in under 5 minutes.

### Success Criteria

| Metric | Quick Start | Production |
|--------|-------------|------------|
| Time to first trace | < 3 minutes | < 5 minutes |
| Required commands | 1 | 2-3 |
| Required env vars | 2 | 4 |
| Memory (idle) | < 2GB | < 1.5GB |
| Scalability | None | Horizontal |
| Recommended for | Evaluation, demos | Real usage |

---

## 2. User Experience

### 2.1 Quick Start: Single Container

**For:** Developers evaluating Ducsigr, demos, local development

```bash
# That's it. One command.
docker run -d --name ducsigr \
  -p 3000:3000 \
  -p 8080:8080 \
  -v ducsigr_data:/data \
  ghcr.io/ducsigr/ducsigr:latest

# Wait ~60 seconds, then open http://localhost:3000
```

**What happens:**
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│   $ docker run ghcr.io/ducsigr/ducsigr:latest                       │
│                                                                              │
│   ┌──────────────────────────────────────────────────────────────────────┐  │
│   │                    ducsigr:latest                                 │  │
│   │                                                                       │  │
│   │   ┌─────────────────────────────────────────────────────────────┐    │  │
│   │   │                      supervisord                             │    │  │
│   │   └─────────────────────────────────────────────────────────────┘    │  │
│   │        │         │         │         │         │         │           │  │
│   │   ┌────▼───┐ ┌───▼────┐ ┌──▼───┐ ┌───▼──┐ ┌───▼───┐ ┌───▼────┐     │  │
│   │   │Postgres│ │ Redis  │ │Tempor│ │ Web  │ │Worker │ │ Ingest │     │  │
│   │   │ :5432  │ │ :6379  │ │:7233 │ │:3000 │ │       │ │ :8080  │     │  │
│   │   └────────┘ └────────┘ └──────┘ └──────┘ └───────┘ └────────┘     │  │
│   │                                                                       │  │
│   │   All data persisted to /data volume                                 │  │
│   └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│   Exposed:                                                                   │
│   • http://localhost:3000 → Dashboard                                       │
│   • http://localhost:8080 → Ingest API (SDKs send traces here)             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Key Features:**
- Zero configuration required
- Auto-generates all secrets on first run
- Embedded PostgreSQL, Redis, Temporal
- Data persisted in Docker volume
- Auto-creates first admin user on first access

### 2.2 Production: Docker Compose

**For:** Teams using Ducsigr in production, need scalability

```bash
# 1. Download compose file
curl -fsSL https://get.ducsigr.dev/docker-compose.yml -o docker-compose.yml

# 2. Configure (edit .env or export)
export NEXTAUTH_SECRET=$(openssl rand -base64 32)
export NEXTAUTH_URL="https://observe.yourcompany.com"

# 3. Start
docker compose up -d

# Open http://localhost:3000 (or your configured URL)
```

**What happens:**
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│   $ docker compose up -d                                                    │
│                                                                              │
│   Starts 5 independent containers:                                          │
│                                                                              │
│   ┌────────────┐  ┌────────────┐  ┌────────────┐                           │
│   │ PostgreSQL │  │   Redis    │  │  Temporal  │                           │
│   │   :5432    │  │   :6379    │  │   :7233    │                           │
│   └─────┬──────┘  └─────┬──────┘  └─────┬──────┘                           │
│         │               │               │                                    │
│         └───────────────┼───────────────┘                                   │
│                         │                                                    │
│                         ▼                                                    │
│         ┌───────────────────────────────────┐                               │
│         │         ducsigr-app           │                               │
│         │  ┌───────┐ ┌────────┐ ┌────────┐  │                               │
│         │  │  Web  │ │ Worker │ │ Ingest │  │                               │
│         │  │ :3000 │ │        │ │ :8080  │  │                               │
│         │  └───────┘ └────────┘ └────────┘  │                               │
│         └───────────────────────────────────┘                               │
│                                                                              │
│   Optional (for debugging):                                                  │
│   ┌────────────┐                                                            │
│   │Temporal UI │  docker compose --profile debug up                         │
│   │   :8088    │                                                            │
│   └────────────┘                                                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Key Features:**
- Separate containers for each infrastructure service
- Can swap PostgreSQL/Redis for managed services (RDS, ElastiCache)
- Horizontal scaling possible
- Independent service restarts
- Production-grade health checks

---

## 3. Architecture Comparison

| Aspect | Quick Start (Single) | Production (Compose) |
|--------|---------------------|---------------------|
| **Containers** | 1 | 5 |
| **Image Size** | ~1.2GB | ~300MB app + standard images |
| **Startup Time** | ~60s | ~45s |
| **Memory (idle)** | ~1.8GB | ~1.2GB |
| **Memory (load)** | ~3GB | ~2.5GB (can scale) |
| **Data Location** | `/data` volume | Separate volumes per service |
| **Scaling** | Vertical only | Horizontal possible |
| **Debugging** | Harder (all-in-one logs) | Easier (separate logs) |
| **Upgrades** | Replace container | Rolling updates possible |
| **External DB** | Not supported | Supported |
| **Backup** | Single volume | Per-service backup |
| **Best For** | Eval, demos, dev | Production, teams |

---

## 4. Technical Design

### 4.1 Quick Start: Single Container Image

#### 4.1.1 Dockerfile

```dockerfile
# Dockerfile.quickstart
#
# Ducsigr Quick Start - Everything in one container
# Includes: PostgreSQL, Redis, Temporal, Web, Worker, Ingest

# ============================================================
# Stage 1: Build Node.js Applications
# ============================================================
FROM node:24-alpine AS node-builder

RUN apk add --no-cache python3 make g++
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/web/package.json ./apps/web/
COPY apps/worker/package.json ./apps/worker/
COPY packages/db/package.json ./packages/db/
COPY packages/api/package.json ./packages/api/
COPY packages/shared/package.json ./packages/shared/
COPY packages/proto/package.json ./packages/proto/
COPY packages/config-eslint/package.json ./packages/config-eslint/
COPY packages/config-typescript/package.json ./packages/config-typescript/

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm --filter @ducsigr/db db:generate
RUN pnpm --filter @ducsigr/web build
RUN pnpm --filter @ducsigr/worker build

# ============================================================
# Stage 2: Build Go Ingest Service
# ============================================================
FROM golang:1.23-alpine AS go-builder

WORKDIR /app
COPY apps/ingest/go.mod apps/ingest/go.sum ./
RUN go mod download
COPY apps/ingest/ ./
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o /ingest ./cmd/ingest

# ============================================================
# Stage 3: Build Temporal Server
# ============================================================
FROM temporalio/server:latest AS temporal-server

# ============================================================
# Stage 4: Production Runtime (All-in-One)
# ============================================================
FROM alpine:3.19 AS runtime

# Install all required services and tools
RUN apk add --no-cache \
    # Node.js runtime
    nodejs \
    npm \
    # PostgreSQL
    postgresql16 \
    postgresql16-contrib \
    # Redis
    redis \
    # Process manager
    supervisor \
    # Utilities
    bash \
    curl \
    wget \
    openssl \
    netcat-openbsd \
    # Temporal dependencies
    ca-certificates \
    tzdata

# Create user
RUN addgroup -S ducsigr && adduser -S ducsigr -G ducsigr

# Setup PostgreSQL
ENV PGDATA=/data/postgresql
RUN mkdir -p /data/postgresql /run/postgresql \
    && chown -R postgres:postgres /data/postgresql /run/postgresql

# Setup Redis
RUN mkdir -p /data/redis \
    && chown -R redis:redis /data/redis

# Setup Temporal
COPY --from=temporal-server /usr/local/bin/temporal-server /usr/local/bin/
COPY --from=temporal-server /usr/local/bin/tctl /usr/local/bin/
RUN mkdir -p /data/temporal /etc/temporal/config

# Copy Node.js application
WORKDIR /app
COPY --from=node-builder /app/apps/web/.next/standalone ./
COPY --from=node-builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=node-builder /app/apps/web/public ./apps/web/public
COPY --from=node-builder /app/apps/worker/dist ./apps/worker/dist
COPY --from=node-builder /app/node_modules ./node_modules
COPY --from=node-builder /app/packages ./packages

# Copy Go binary
COPY --from=go-builder /ingest ./ingest

# Copy configuration files
COPY docker/quickstart/supervisord.conf /etc/supervisord.conf
COPY docker/quickstart/entrypoint.sh /entrypoint.sh
COPY docker/quickstart/temporal-config.yaml /etc/temporal/config/development.yaml
COPY docker/quickstart/init-postgres.sh /init-postgres.sh

RUN chmod +x /entrypoint.sh /init-postgres.sh

# Create data directories
RUN mkdir -p /data/secrets /app/logs \
    && chown -R ducsigr:ducsigr /app /data/secrets /app/logs

# Expose ports
EXPOSE 3000 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
    CMD wget -qO- http://localhost:3000/api/health || exit 1

# Volume for persistent data
VOLUME ["/data"]

ENTRYPOINT ["/entrypoint.sh"]
```

#### 4.1.2 Supervisor Configuration (Quick Start)

```ini
; docker/quickstart/supervisord.conf
;
; All-in-one process manager for Ducsigr Quick Start
; Manages: PostgreSQL, Redis, Temporal, Web, Worker, Ingest

[supervisord]
nodaemon=true
logfile=/dev/stdout
logfile_maxbytes=0
pidfile=/tmp/supervisord.pid
loglevel=info

[unix_http_server]
file=/tmp/supervisor.sock

[rpcinterface:supervisor]
supervisor.rpcinterface_factory = supervisor.rpcinterface:make_main_rpcinterface

[supervisorctl]
serverurl=unix:///tmp/supervisor.sock

; ============================================================
; Infrastructure Services (Start First)
; ============================================================

[program:postgresql]
command=/usr/bin/postgres -D /data/postgresql
user=postgres
autostart=true
autorestart=true
priority=100
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0

[program:redis]
command=/usr/bin/redis-server --dir /data/redis --appendonly yes
user=redis
autostart=true
autorestart=true
priority=100
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0

[program:temporal]
command=/usr/local/bin/temporal-server start --config /etc/temporal/config
autostart=true
autorestart=true
startsecs=10
priority=200
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0

; ============================================================
; Application Services (Start After Infrastructure)
; ============================================================

[program:web]
command=node /app/apps/web/server.js
directory=/app
autostart=true
autorestart=true
startsecs=15
priority=300
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0
environment=NODE_ENV="production",PORT="3000",HOSTNAME="0.0.0.0"

[program:worker]
command=node /app/apps/worker/dist/index.js
directory=/app
autostart=true
autorestart=true
startsecs=20
priority=400
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0
environment=NODE_ENV="production"

[program:ingest]
command=/app/ingest
directory=/app
autostart=true
autorestart=true
startsecs=10
priority=300
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0
environment=PORT="8080"

; ============================================================
; Service Groups
; ============================================================

[group:infrastructure]
programs=postgresql,redis,temporal
priority=100

[group:application]
programs=web,worker,ingest
priority=300
```

#### 4.1.3 Entrypoint Script (Quick Start)

```bash
#!/bin/bash
# docker/quickstart/entrypoint.sh
#
# Ducsigr Quick Start Entrypoint
# Handles: First-run setup, secret generation, database init, migrations

set -e

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                                                              ║"
echo "║     ██████╗ ██████╗  ██████╗ ███╗   ██╗                     ║"
echo "║    ██╔════╝██╔═══██╗██╔════╝ ████╗  ██║                     ║"
echo "║    ██║     ██║   ██║██║  ███╗██╔██╗ ██║                     ║"
echo "║    ██║     ██║   ██║██║   ██║██║╚██╗██║                     ║"
echo "║    ╚██████╗╚██████╔╝╚██████╔╝██║ ╚████║                     ║"
echo "║     ╚═════╝ ╚═════╝  ╚═════╝ ╚═╝  ╚═══╝                     ║"
echo "║                                                              ║"
echo "║              Ducsigr Quick Start                         ║"
echo "║                                                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

FIRST_RUN=false
SECRETS_FILE="/data/secrets/.env"
INIT_MARKER="/data/.initialized"

# ============================================================
# 1. Check if this is first run
# ============================================================
if [ ! -f "$INIT_MARKER" ]; then
    FIRST_RUN=true
    echo "[1/6] First run detected - initializing..."
else
    echo "[1/6] Existing installation detected"
fi

# ============================================================
# 2. Generate secrets (first run only)
# ============================================================
echo "[2/6] Checking secrets..."

if [ ! -f "$SECRETS_FILE" ]; then
    echo "  → Generating secrets..."
    mkdir -p /data/secrets

    NEXTAUTH_SECRET=$(openssl rand -hex 32)
    INTERNAL_API_SECRET=$(openssl rand -hex 32)
    JWT_SHARED_SECRET=$(openssl rand -hex 32)
    POSTGRES_PASSWORD=$(openssl rand -hex 16)

    cat > "$SECRETS_FILE" << EOF
# Ducsigr Auto-Generated Secrets
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# WARNING: Do not edit unless you know what you're doing

NEXTAUTH_SECRET=$NEXTAUTH_SECRET
NEXTAUTH_URL=http://localhost:3000
INTERNAL_API_SECRET=$INTERNAL_API_SECRET
JWT_SHARED_SECRET=$JWT_SHARED_SECRET
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
DATABASE_URL=postgresql://ducsigr:$POSTGRES_PASSWORD@localhost:5432/ducsigr
REDIS_URL=redis://localhost:6379
TEMPORAL_ADDRESS=localhost:7233
TEMPORAL_NAMESPACE=default
TEMPORAL_TASK_QUEUE=ducsigr-tasks
WEB_API_URL=http://localhost:3000
EOF

    echo "  → Secrets generated and saved to /data/secrets/.env"
else
    echo "  → Using existing secrets"
fi

# Load secrets into environment
set -a
source "$SECRETS_FILE"
set +a

# ============================================================
# 3. Initialize PostgreSQL (first run only)
# ============================================================
echo "[3/6] Checking PostgreSQL..."

if [ ! -d "/data/postgresql/base" ]; then
    echo "  → Initializing PostgreSQL database..."

    # Initialize PostgreSQL
    su postgres -c "initdb -D /data/postgresql"

    # Configure PostgreSQL
    cat >> /data/postgresql/postgresql.conf << EOF
listen_addresses = 'localhost'
port = 5432
max_connections = 100
shared_buffers = 128MB
EOF

    cat >> /data/postgresql/pg_hba.conf << EOF
local   all             all                                     trust
host    all             all             127.0.0.1/32            md5
host    all             all             ::1/128                 md5
EOF

    # Start PostgreSQL temporarily to create database
    su postgres -c "pg_ctl -D /data/postgresql -l /tmp/postgres.log start"
    sleep 3

    # Create user and database
    su postgres -c "psql -c \"CREATE USER ducsigr WITH PASSWORD '$POSTGRES_PASSWORD';\""
    su postgres -c "psql -c \"CREATE DATABASE ducsigr OWNER ducsigr;\""
    su postgres -c "psql -c \"GRANT ALL PRIVILEGES ON DATABASE ducsigr TO ducsigr;\""

    # Stop PostgreSQL (supervisor will start it)
    su postgres -c "pg_ctl -D /data/postgresql stop"

    echo "  → PostgreSQL initialized"
else
    echo "  → PostgreSQL already initialized"
fi

# ============================================================
# 4. Initialize Redis data directory
# ============================================================
echo "[4/6] Checking Redis..."

if [ ! -d "/data/redis" ]; then
    mkdir -p /data/redis
    chown redis:redis /data/redis
    echo "  → Redis data directory created"
else
    echo "  → Redis data directory exists"
fi

# ============================================================
# 5. Start supervisor (starts all services)
# ============================================================
echo "[5/6] Starting services..."
/usr/bin/supervisord -c /etc/supervisord.conf &
SUPERVISOR_PID=$!

# Wait for PostgreSQL to be ready
echo "  → Waiting for PostgreSQL..."
MAX_RETRIES=30
RETRY=0
until pg_isready -h localhost -p 5432 -U ducsigr -q 2>/dev/null; do
    RETRY=$((RETRY + 1))
    if [ $RETRY -ge $MAX_RETRIES ]; then
        echo "ERROR: PostgreSQL failed to start"
        exit 1
    fi
    sleep 2
done
echo "  → PostgreSQL ready"

# Wait for Temporal to be ready
echo "  → Waiting for Temporal..."
RETRY=0
until nc -z localhost 7233 2>/dev/null; do
    RETRY=$((RETRY + 1))
    if [ $RETRY -ge $MAX_RETRIES ]; then
        echo "ERROR: Temporal failed to start"
        exit 1
    fi
    sleep 2
done
echo "  → Temporal ready"

# ============================================================
# 6. Run migrations (first run or if needed)
# ============================================================
echo "[6/6] Running database migrations..."

cd /app/packages/db
npx prisma migrate deploy --schema=./prisma/schema.prisma
cd /app

echo "  → Migrations complete"

# Mark as initialized
touch "$INIT_MARKER"

# ============================================================
# Ready!
# ============================================================
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                                                              ║"
echo "║   Ducsigr is ready!                                      ║"
echo "║                                                              ║"
echo "║   Dashboard:    http://localhost:3000                        ║"
echo "║   Ingest API:   http://localhost:8080                        ║"
echo "║   Health Check: http://localhost:3000/api/health             ║"
echo "║                                                              ║"
echo "║   Your secrets are stored in the Docker volume at:           ║"
echo "║   /data/secrets/.env                                         ║"
echo "║                                                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Keep container running (wait for supervisor)
wait $SUPERVISOR_PID
```

#### 4.1.4 Temporal Configuration (Embedded)

```yaml
# docker/quickstart/temporal-config.yaml
log:
  stdout: true
  level: info

persistence:
  defaultStore: postgres-default
  visibilityStore: postgres-visibility
  numHistoryShards: 4
  datastores:
    postgres-default:
      sql:
        pluginName: postgres
        databaseName: temporal
        connectAddr: localhost:5432
        connectProtocol: tcp
        user: ducsigr
        password: ${POSTGRES_PASSWORD}
        maxConns: 20
        maxIdleConns: 20
    postgres-visibility:
      sql:
        pluginName: postgres
        databaseName: temporal_visibility
        connectAddr: localhost:5432
        connectProtocol: tcp
        user: ducsigr
        password: ${POSTGRES_PASSWORD}
        maxConns: 10
        maxIdleConns: 10

global:
  membership:
    maxJoinDuration: 30s
  pprof:
    port: 7936

services:
  frontend:
    rpc:
      grpcPort: 7233
      membershipPort: 6933
      bindOnLocalHost: true
  history:
    rpc:
      grpcPort: 7234
      membershipPort: 6934
      bindOnLocalHost: true
  matching:
    rpc:
      grpcPort: 7235
      membershipPort: 6935
      bindOnLocalHost: true
  worker:
    rpc:
      grpcPort: 7239
      membershipPort: 6939
      bindOnLocalHost: true

clusterMetadata:
  enableGlobalNamespace: false
  failoverVersionIncrement: 10
  masterClusterName: active
  currentClusterName: active
  clusterInformation:
    active:
      enabled: true
      initialFailoverVersion: 1
      rpcName: frontend
      rpcAddress: localhost:7233
```

---

### 4.2 Production: Docker Compose

#### 4.2.1 Docker Compose File

```yaml
# docker-compose.yml
#
# Ducsigr Production Deployment
#
# Quick Start:
#   export NEXTAUTH_SECRET=$(openssl rand -base64 32)
#   export NEXTAUTH_URL="http://localhost:3000"
#   docker compose up -d
#
# Documentation: https://docs.ducsigr.dev/self-hosting

name: ducsigr

services:
  # ============================================================
  # PostgreSQL Database
  # ============================================================
  postgres:
    image: postgres:16-alpine
    container_name: ducsigr-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: ducsigr
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-ducsigr}
      POSTGRES_DB: ducsigr
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ducsigr"]
      interval: 5s
      timeout: 5s
      retries: 10
    networks:
      - ducsigr-internal
    # Uncomment to expose PostgreSQL externally
    # ports:
    #   - "5432:5432"

  # ============================================================
  # Redis Cache
  # ============================================================
  redis:
    image: redis:7-alpine
    container_name: ducsigr-redis
    restart: unless-stopped
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 10
    networks:
      - ducsigr-internal
    # Uncomment to expose Redis externally
    # ports:
    #   - "6379:6379"

  # ============================================================
  # Temporal Server (Workflow Orchestration)
  # ============================================================
  temporal:
    image: temporalio/auto-setup:latest
    container_name: ducsigr-temporal
    restart: unless-stopped
    environment:
      - DB=postgresql
      - DB_PORT=5432
      - POSTGRES_USER=ducsigr
      - POSTGRES_PWD=${POSTGRES_PASSWORD:-ducsigr}
      - POSTGRES_SEEDS=postgres
      - DYNAMIC_CONFIG_FILE_PATH=config/dynamicconfig/development.yaml
      - SKIP_DEFAULT_NAMESPACE_CREATION=false
    volumes:
      - ./config/temporal:/etc/temporal/config/dynamicconfig:ro
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "tctl", "--address", "temporal:7233", "cluster", "health"]
      interval: 10s
      timeout: 5s
      retries: 20
      start_period: 40s
    networks:
      - ducsigr-internal

  # ============================================================
  # Temporal UI (Optional - for debugging)
  # ============================================================
  temporal-ui:
    image: temporalio/ui:latest
    container_name: ducsigr-temporal-ui
    restart: unless-stopped
    environment:
      - TEMPORAL_ADDRESS=temporal:7233
      - TEMPORAL_CORS_ORIGINS=http://localhost:3000,${NEXTAUTH_URL:-http://localhost:3000}
    ports:
      - "8088:8080"
    depends_on:
      temporal:
        condition: service_healthy
    networks:
      - ducsigr-internal
    profiles:
      - debug

  # ============================================================
  # Ducsigr Application
  # ============================================================
  app:
    image: ghcr.io/ducsigr/ducsigr-app:${VERSION:-latest}
    container_name: ducsigr-app
    restart: unless-stopped
    ports:
      - "${WEB_PORT:-3000}:3000"
      - "${INGEST_PORT:-8080}:8080"
    environment:
      # Required
      NEXTAUTH_SECRET: ${NEXTAUTH_SECRET:?NEXTAUTH_SECRET is required}
      NEXTAUTH_URL: ${NEXTAUTH_URL:-http://localhost:3000}

      # Database (auto-configured for bundled services)
      DATABASE_URL: postgresql://ducsigr:${POSTGRES_PASSWORD:-ducsigr}@postgres:5432/ducsigr
      REDIS_URL: redis://redis:6379

      # Temporal
      TEMPORAL_ADDRESS: temporal:7233
      TEMPORAL_NAMESPACE: default
      TEMPORAL_TASK_QUEUE: ducsigr-tasks

      # Internal (auto-generated if not set)
      INTERNAL_API_SECRET: ${INTERNAL_API_SECRET:-}
      JWT_SHARED_SECRET: ${JWT_SHARED_SECRET:-}
      WEB_API_URL: http://localhost:3000

      # Optional
      NODE_ENV: production
      LOG_LEVEL: ${LOG_LEVEL:-info}
      RETENTION_DAYS: ${RETENTION_DAYS:-30}
      ENABLE_REGISTRATION: ${ENABLE_REGISTRATION:-true}
    volumes:
      - app_secrets:/app/secrets
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      temporal:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s
    networks:
      - ducsigr-internal

volumes:
  postgres_data:
  redis_data:
  app_secrets:

networks:
  ducsigr-internal:
    driver: bridge
```

#### 4.2.2 Application Dockerfile (Production)

```dockerfile
# Dockerfile.app
#
# Ducsigr Application Container (Web + Worker + Ingest)
# For use with Docker Compose (separate infra containers)

# ============================================================
# Stage 1: Build Node.js Applications
# ============================================================
FROM node:24-alpine AS node-builder

RUN apk add --no-cache python3 make g++
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/web/package.json ./apps/web/
COPY apps/worker/package.json ./apps/worker/
COPY packages/db/package.json ./packages/db/
COPY packages/api/package.json ./packages/api/
COPY packages/shared/package.json ./packages/shared/
COPY packages/proto/package.json ./packages/proto/
COPY packages/config-eslint/package.json ./packages/config-eslint/
COPY packages/config-typescript/package.json ./packages/config-typescript/

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm --filter @ducsigr/db db:generate
RUN pnpm --filter @ducsigr/web build
RUN pnpm --filter @ducsigr/worker build

# ============================================================
# Stage 2: Build Go Ingest Service
# ============================================================
FROM golang:1.23-alpine AS go-builder

WORKDIR /app
COPY apps/ingest/go.mod apps/ingest/go.sum ./
RUN go mod download
COPY apps/ingest/ ./
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o /ingest ./cmd/ingest

# ============================================================
# Stage 3: Production Runtime
# ============================================================
FROM node:24-alpine AS runtime

RUN apk add --no-cache supervisor wget openssl netcat-openbsd

RUN addgroup -S ducsigr && adduser -S ducsigr -G ducsigr

WORKDIR /app

# Copy Node.js artifacts
COPY --from=node-builder /app/apps/web/.next/standalone ./
COPY --from=node-builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=node-builder /app/apps/web/public ./apps/web/public
COPY --from=node-builder /app/apps/worker/dist ./apps/worker/dist
COPY --from=node-builder /app/node_modules ./node_modules
COPY --from=node-builder /app/packages ./packages

# Copy Go binary
COPY --from=go-builder /ingest ./ingest

# Copy configuration
COPY docker/production/supervisord.conf /etc/supervisord.conf
COPY docker/production/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

RUN mkdir -p /app/secrets \
    && chown -R ducsigr:ducsigr /app

USER ducsigr

EXPOSE 3000 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD wget -qO- http://localhost:3000/api/health || exit 1

ENTRYPOINT ["/entrypoint.sh"]
```

#### 4.2.3 Supervisor Configuration (Production)

```ini
; docker/production/supervisord.conf
;
; Application-only supervisor config (no infrastructure)

[supervisord]
nodaemon=true
logfile=/dev/stdout
logfile_maxbytes=0
pidfile=/tmp/supervisord.pid
loglevel=info

[unix_http_server]
file=/tmp/supervisor.sock

[rpcinterface:supervisor]
supervisor.rpcinterface_factory = supervisor.rpcinterface:make_main_rpcinterface

[supervisorctl]
serverurl=unix:///tmp/supervisor.sock

[program:web]
command=node /app/apps/web/server.js
directory=/app
autostart=true
autorestart=true
startsecs=10
priority=100
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0
environment=NODE_ENV="production",PORT="3000",HOSTNAME="0.0.0.0"

[program:worker]
command=node /app/apps/worker/dist/index.js
directory=/app
autostart=true
autorestart=true
startsecs=15
priority=200
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0
environment=NODE_ENV="production"

[program:ingest]
command=/app/ingest
directory=/app
autostart=true
autorestart=true
startsecs=5
priority=100
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0
environment=PORT="8080"
```

#### 4.2.4 Entrypoint Script (Production)

```bash
#!/bin/sh
# docker/production/entrypoint.sh
#
# Ducsigr Production Entrypoint
# Infrastructure is external, just validate and start

set -e

echo "════════════════════════════════════════════════════════════════"
echo "  Ducsigr Production"
echo "════════════════════════════════════════════════════════════════"

# ============================================================
# 1. Validate Required Environment Variables
# ============================================================
echo "[1/4] Validating configuration..."

if [ -z "$NEXTAUTH_SECRET" ]; then
    echo "ERROR: NEXTAUTH_SECRET is required"
    echo "Generate with: openssl rand -base64 32"
    exit 1
fi

if [ ${#NEXTAUTH_SECRET} -lt 32 ]; then
    echo "ERROR: NEXTAUTH_SECRET must be at least 32 characters"
    exit 1
fi

if [ -z "$DATABASE_URL" ]; then
    echo "ERROR: DATABASE_URL is required"
    exit 1
fi

echo "  ✓ Configuration valid"

# ============================================================
# 2. Generate Internal Secrets (if not provided)
# ============================================================
echo "[2/4] Checking internal secrets..."

SECRETS_FILE="/app/secrets/.env"

if [ -z "$INTERNAL_API_SECRET" ] || [ -z "$JWT_SHARED_SECRET" ]; then
    if [ -f "$SECRETS_FILE" ]; then
        echo "  → Loading existing secrets..."
        set -a
        source "$SECRETS_FILE"
        set +a
    else
        echo "  → Generating internal secrets..."
        mkdir -p /app/secrets

        export INTERNAL_API_SECRET=$(openssl rand -hex 32)
        export JWT_SHARED_SECRET=$(openssl rand -hex 32)

        cat > "$SECRETS_FILE" << EOF
INTERNAL_API_SECRET=$INTERNAL_API_SECRET
JWT_SHARED_SECRET=$JWT_SHARED_SECRET
EOF
        echo "  ✓ Secrets generated"
    fi
else
    echo "  ✓ Using provided secrets"
fi

# ============================================================
# 3. Wait for Dependencies
# ============================================================
echo "[3/4] Waiting for dependencies..."

# Extract host from DATABASE_URL
DB_HOST=$(echo "$DATABASE_URL" | sed -n 's|.*@\([^:/]*\).*|\1|p')
DB_PORT=$(echo "$DATABASE_URL" | sed -n 's|.*:\([0-9]*\)/.*|\1|p')
DB_PORT=${DB_PORT:-5432}

echo "  → Waiting for PostgreSQL ($DB_HOST:$DB_PORT)..."
MAX_RETRIES=30
RETRY=0
until nc -z "$DB_HOST" "$DB_PORT" 2>/dev/null; do
    RETRY=$((RETRY + 1))
    if [ $RETRY -ge $MAX_RETRIES ]; then
        echo "ERROR: PostgreSQL not available"
        exit 1
    fi
    sleep 2
done
echo "  ✓ PostgreSQL ready"

# Wait for Temporal
TEMPORAL_HOST=$(echo "$TEMPORAL_ADDRESS" | cut -d: -f1)
TEMPORAL_PORT=$(echo "$TEMPORAL_ADDRESS" | cut -d: -f2)

echo "  → Waiting for Temporal ($TEMPORAL_HOST:$TEMPORAL_PORT)..."
RETRY=0
until nc -z "$TEMPORAL_HOST" "$TEMPORAL_PORT" 2>/dev/null; do
    RETRY=$((RETRY + 1))
    if [ $RETRY -ge $MAX_RETRIES ]; then
        echo "ERROR: Temporal not available"
        exit 1
    fi
    sleep 2
done
echo "  ✓ Temporal ready"

# ============================================================
# 4. Run Migrations
# ============================================================
echo "[4/4] Running migrations..."

cd /app/packages/db
npx prisma migrate deploy --schema=./prisma/schema.prisma
cd /app

echo "  ✓ Migrations complete"

# ============================================================
# Start Application
# ============================================================
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  Starting Ducsigr services..."
echo ""
echo "  Web:    http://localhost:3000"
echo "  Ingest: http://localhost:8080"
echo "  Health: http://localhost:3000/api/health"
echo "════════════════════════════════════════════════════════════════"
echo ""

exec /usr/bin/supervisord -c /etc/supervisord.conf
```

---

## 5. Configuration Reference

### 5.1 Environment Variables

#### Quick Start (Single Container)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| (none) | - | - | All secrets auto-generated |

**Optional overrides:**
| Variable | Default | Description |
|----------|---------|-------------|
| `NEXTAUTH_URL` | `http://localhost:3000` | Public URL |
| `LOG_LEVEL` | `info` | Log verbosity |
| `RETENTION_DAYS` | `30` | Data retention |

#### Production (Docker Compose)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NEXTAUTH_SECRET` | **Yes** | - | Session encryption (32+ chars) |
| `NEXTAUTH_URL` | **Yes** | - | Public URL |
| `POSTGRES_PASSWORD` | No | `ducsigr` | PostgreSQL password |
| `LOG_LEVEL` | No | `info` | Log verbosity |
| `RETENTION_DAYS` | No | `30` | Data retention |
| `ENABLE_REGISTRATION` | No | `true` | Allow signups |

### 5.2 Ports

| Port | Service | Description |
|------|---------|-------------|
| `3000` | Web | Dashboard & API |
| `8080` | Ingest | SDK trace endpoint |
| `8088` | Temporal UI | Workflow debugging (optional) |

### 5.3 Volumes

#### Quick Start
| Volume | Container Path | Description |
|--------|----------------|-------------|
| `ducsigr_data` | `/data` | All persistent data |

#### Production
| Volume | Container Path | Description |
|--------|----------------|-------------|
| `postgres_data` | `/var/lib/postgresql/data` | Database |
| `redis_data` | `/data` | Redis AOF |
| `app_secrets` | `/app/secrets` | Generated secrets |

---

## 6. Build & Publish Pipeline

### 6.1 GitHub Actions Workflow

```yaml
# .github/workflows/docker-publish.yml

name: Build and Publish Docker Images

on:
  push:
    tags:
      - 'v*'
  workflow_dispatch:
    inputs:
      tag:
        description: 'Image tag'
        required: true
        default: 'latest'

env:
  REGISTRY: ghcr.io
  ORG: ducsigr

jobs:
  build-quickstart:
    name: Build Quick Start Image
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

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

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.ORG }}/ducsigr
          tags: |
            type=semver,pattern={{version}}
            type=semver,pattern={{major}}.{{minor}}
            type=raw,value=latest,enable={{is_default_branch}}

      - name: Build and push Quick Start image
        uses: docker/build-push-action@v5
        with:
          context: .
          file: ./Dockerfile.quickstart
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
          platforms: linux/amd64,linux/arm64

  build-app:
    name: Build App Image (for Compose)
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

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

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.ORG }}/ducsigr-app
          tags: |
            type=semver,pattern={{version}}
            type=semver,pattern={{major}}.{{minor}}
            type=raw,value=latest,enable={{is_default_branch}}

      - name: Build and push App image
        uses: docker/build-push-action@v5
        with:
          context: .
          file: ./Dockerfile.app
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
          platforms: linux/amd64,linux/arm64
```

### 6.2 Published Images

| Image | Purpose | Size (est.) |
|-------|---------|-------------|
| `ghcr.io/ducsigr/ducsigr:latest` | Quick Start (all-in-one) | ~1.2GB |
| `ghcr.io/ducsigr/ducsigr-app:latest` | Production (app only) | ~300MB |

---

## 7. Documentation

### 7.1 Quick Start README Section

```markdown
## Self-Hosting Ducsigr

### Option 1: Quick Start (Recommended for Evaluation)

Run Ducsigr with a single command:

```bash
docker run -d --name ducsigr \
  -p 3000:3000 \
  -p 8080:8080 \
  -v ducsigr_data:/data \
  ghcr.io/ducsigr/ducsigr:latest
```

Wait ~60 seconds, then open http://localhost:3000

**What's included:**
- PostgreSQL database
- Redis cache
- Temporal workflow engine
- Web dashboard
- Ingest API

**System requirements:**
- Docker 24+
- 4GB RAM minimum
- 10GB disk space

### Option 2: Production Setup (Docker Compose)

For production deployments with better scalability:

```bash
# Download compose file
curl -fsSL https://get.ducsigr.dev/docker-compose.yml -o docker-compose.yml

# Set required environment variables
export NEXTAUTH_SECRET=$(openssl rand -base64 32)
export NEXTAUTH_URL="https://observe.yourcompany.com"

# Start services
docker compose up -d
```

**Advantages over Quick Start:**
- Separate containers for each service
- Can use external PostgreSQL/Redis
- Horizontal scaling possible
- Easier debugging
- Production-grade health checks

### Verifying Installation

```bash
# Check health status
curl http://localhost:3000/api/health | jq

# Expected response:
{
  "status": "healthy",
  "services": {
    "database": { "status": "pass" },
    "redis": { "status": "pass" },
    "temporal": { "status": "pass" },
    "ingest": { "status": "pass" }
  }
}
```

### Sending Your First Trace

1. Create a project in the dashboard
2. Copy your API key
3. Send a test trace:

```bash
curl -X POST http://localhost:8080/v1/traces \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "X-Project-ID: YOUR_PROJECT_ID" \
  -d '{
    "id": "test-trace-001",
    "name": "hello-world",
    "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
    "spans": []
  }'
```

### Upgrading

**Quick Start:**
```bash
docker pull ghcr.io/ducsigr/ducsigr:latest
docker stop ducsigr && docker rm ducsigr
docker run -d --name ducsigr \
  -p 3000:3000 -p 8080:8080 \
  -v ducsigr_data:/data \
  ghcr.io/ducsigr/ducsigr:latest
```

**Production:**
```bash
docker compose pull
docker compose up -d
```
```

---

## 8. File Structure

```
Ducsigr/
├── Dockerfile.quickstart           # All-in-one image (includes infra)
├── Dockerfile.app                  # App-only image (for compose)
├── docker-compose.yml              # Production compose file
├── docker/
│   ├── quickstart/
│   │   ├── supervisord.conf        # All services supervisor config
│   │   ├── entrypoint.sh           # First-run setup script
│   │   ├── temporal-config.yaml    # Embedded Temporal config
│   │   └── init-postgres.sh        # PostgreSQL init script
│   └── production/
│       ├── supervisord.conf        # App-only supervisor config
│       └── entrypoint.sh           # Production startup script
├── config/
│   └── temporal/
│       └── development.yaml        # Temporal dynamic config
├── .github/
│   └── workflows/
│       └── docker-publish.yml      # Build & publish pipeline
└── docs/
    └── self-hosting/
        ├── README.md               # Quick start guide
        ├── quick-start.md          # Single container guide
        ├── production.md           # Compose setup guide
        ├── configuration.md        # All config options
        ├── upgrading.md            # Upgrade procedures
        └── troubleshooting.md      # Common issues
```

---

## 9. Implementation Plan

### Phase 1: Quick Start Image (5 points)

| Task | Points | Priority |
|------|--------|----------|
| Create `Dockerfile.quickstart` | 2 | P0 |
| Create quickstart supervisor & entrypoint | 2 | P0 |
| Test embedded PostgreSQL/Redis/Temporal | 1 | P0 |

### Phase 2: Production Image (3 points)

| Task | Points | Priority |
|------|--------|----------|
| Create `Dockerfile.app` | 1 | P0 |
| Create `docker-compose.yml` | 1 | P0 |
| Create production entrypoint | 1 | P0 |

### Phase 3: CI/CD & Docs (3 points)

| Task | Points | Priority |
|------|--------|----------|
| Create GitHub Actions workflow | 1 | P1 |
| Write self-hosting documentation | 1 | P1 |
| Integration tests | 1 | P1 |

### Phase 4: Polish (2 points)

| Task | Points | Priority |
|------|--------|----------|
| ARM64 support | 1 | P2 |
| One-click deploy buttons | 1 | P2 |

---

## 10. Definition of Done

### Quick Start Image
- [ ] `docker run ghcr.io/ducsigr/ducsigr` works with zero config
- [ ] All secrets auto-generated on first run
- [ ] Data persists across container restarts
- [ ] Health endpoint returns healthy status
- [ ] Startup completes in < 90 seconds
- [ ] Works on both AMD64 and ARM64

### Production Image
- [ ] `docker compose up` works with only 2 env vars
- [ ] Can swap PostgreSQL/Redis for external services
- [ ] Migrations run automatically
- [ ] Health checks for all services
- [ ] Separate logs per service

### Documentation
- [ ] README quick start section complete
- [ ] Full self-hosting guide published
- [ ] Upgrade procedures documented
- [ ] Troubleshooting guide available

---

## 11. Testing Plan

### 11.1 Quick Start Tests

```bash
#!/bin/bash
# test-quickstart.sh

set -e

echo "=== Quick Start Integration Test ==="

# Clean up any existing container
docker rm -f ducsigr-test 2>/dev/null || true
docker volume rm ducsigr_test_data 2>/dev/null || true

# Run container
echo "[1/5] Starting container..."
docker run -d --name ducsigr-test \
  -p 13000:3000 \
  -p 18080:8080 \
  -v ducsigr_test_data:/data \
  ghcr.io/ducsigr/ducsigr:latest

# Wait for startup
echo "[2/5] Waiting for startup (max 120s)..."
RETRY=0
MAX_RETRY=60
until curl -sf http://localhost:13000/api/health > /dev/null 2>&1; do
  RETRY=$((RETRY + 1))
  if [ $RETRY -ge $MAX_RETRY ]; then
    echo "FAILED: Health check timeout"
    docker logs ducsigr-test
    exit 1
  fi
  sleep 2
done

# Verify health
echo "[3/5] Verifying health..."
HEALTH=$(curl -s http://localhost:13000/api/health)
if ! echo "$HEALTH" | jq -e '.status == "healthy"' > /dev/null; then
  echo "FAILED: Not healthy"
  echo "$HEALTH" | jq
  exit 1
fi

# Verify ingest
echo "[4/5] Verifying ingest endpoint..."
INGEST_HEALTH=$(curl -s http://localhost:18080/health)
if ! echo "$INGEST_HEALTH" | jq -e '.status == "ok"' > /dev/null; then
  echo "FAILED: Ingest not healthy"
  exit 1
fi

# Cleanup
echo "[5/5] Cleaning up..."
docker rm -f ducsigr-test
docker volume rm ducsigr_test_data

echo "=== All tests passed ==="
```

### 11.2 Production Tests

```bash
#!/bin/bash
# test-production.sh

set -e

echo "=== Production Integration Test ==="

cd /tmp
rm -rf ducsigr-test && mkdir ducsigr-test && cd ducsigr-test

# Download compose file
curl -fsSL https://raw.githubusercontent.com/.../docker-compose.yml -o docker-compose.yml

# Set env vars
export NEXTAUTH_SECRET=$(openssl rand -base64 32)
export NEXTAUTH_URL="http://localhost:3000"

# Start services
docker compose up -d

# Wait and test (similar to quickstart)
# ...

# Cleanup
docker compose down -v
cd / && rm -rf /tmp/ducsigr-test

echo "=== All tests passed ==="
```

---

## 12. Risk Analysis

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Large image size (>1.5GB) | Medium | Low | Multi-stage builds, Alpine base |
| Temporal embedded fails | Low | High | Extensive testing, fallback docs |
| Memory pressure (<4GB) | Medium | Medium | Document requirements clearly |
| ARM64 compatibility | Low | Medium | Test on Apple Silicon, use multi-arch builds |
| Upgrade data loss | Low | Critical | Clear upgrade docs, backup reminders |

---

## 13. Success Metrics

| Metric | Quick Start | Production | Measurement |
|--------|-------------|------------|-------------|
| Time to first trace | < 3 min | < 5 min | User testing |
| GitHub stars after launch | - | +100 | GitHub |
| Docker pulls (30 days) | 1000+ | 500+ | GHCR stats |
| Support tickets | < 5/week | < 3/week | GitHub issues |
| Documentation satisfaction | > 80% | > 80% | User survey |
