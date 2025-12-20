# Getting Started

## TL;DR - Fastest Setup

```bash
# One command setup
./scripts/setup.sh

# Then start services (2 terminals)
pnpm dev           # Terminal 1: Web + Worker
make dev-ingest    # Terminal 2: Ingest Service
```

Done! 🎉
- Web: http://localhost:3000
- API: http://localhost:8080

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 24+ | https://nodejs.org/ or `nvm install 24` |
| pnpm | 9+ | `npm install -g pnpm` |
| Docker | Latest | https://www.docker.com/ |

### Verify Installation

```bash
node -v    # v24.x.x
pnpm -v    # 9.x.x
docker -v  # Docker version 2x.x.x
```

---

## Manual Setup (Step by Step)

### 1. Clone & Install

```bash
git clone https://github.com/your-org/cognobserve.git
cd cognobserve

# Install all dependencies
pnpm install
```

### 2. Start Infrastructure

```bash
# Start PostgreSQL, Redis, and Temporal
docker-compose up -d

# Verify containers are running
docker ps
```

### 3. Setup Environment

```bash
# Copy environment file
cp .env.example .env
```

### 4. Setup Database

```bash
# Generate Prisma client
pnpm db:generate

# Push schema to database
pnpm db:push
```

### 5. Start Development

**Terminal 1 - TypeScript apps:**
```bash
pnpm dev
```

**Terminal 2 - Ingest service:**
```bash
make dev-ingest
```

---

## Services

| Service | URL | Description |
|---------|-----|-------------|
| Web | http://localhost:3000 | Next.js Dashboard |
| Ingest | http://localhost:8080 | OTLP Ingestion API |
| Temporal UI | http://localhost:8088 | Workflow Monitoring |
| PostgreSQL | localhost:5432 | Database |
| Redis | localhost:6379 | Cache |

---

## Quick Verification

### Check Health

```bash
curl http://localhost:8080/health
```

Expected response:
```json
{"status":"ok","timestamp":"2024-01-01T00:00:00.000Z"}
```

### Check Metrics

```bash
curl http://localhost:8080/metrics
```

### Send Test OTLP Trace

```bash
curl -X POST http://localhost:8080/v1/traces \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "resourceSpans": [{
      "resource": {
        "attributes": [
          {"key": "service.name", "value": {"stringValue": "test-service"}}
        ]
      },
      "scopeSpans": [{
        "spans": [{
          "traceId": "a1b2c3d4e5f6789012345678901234ab",
          "spanId": "a1b2c3d4e5f67890",
          "name": "test-span",
          "startTimeUnixNano": "1704067200000000000"
        }]
      }]
    }]
  }'
```

Expected response:
```json
{
  "accepted": true,
  "traceCount": 1,
  "spanCount": 1
}
```

---

## Common Commands

### Development

```bash
pnpm dev              # Start all TypeScript apps
make dev-ingest       # Start ingest service with hot reload
```

### Database

```bash
pnpm db:generate      # Generate Prisma client
pnpm db:push          # Push schema changes
pnpm db:studio        # Open Prisma Studio GUI
pnpm db:migrate       # Create migration (production)
```

### Proto/Types

```bash
make proto            # Generate TypeScript types
make proto-lint       # Lint proto files
```

### Docker

```bash
make docker-up        # Start PostgreSQL + Redis + Temporal
make docker-down      # Stop containers
docker-compose logs   # View logs
```

### Build

```bash
pnpm build            # Build all TypeScript apps
```

---

## Project Structure Quick Reference

```
CognObserve/
├── apps/
│   ├── web/          # Next.js dashboard (port 3000)
│   ├── ingest-node/  # OTLP ingestion service (port 8080)
│   └── worker/       # Temporal background worker
├── packages/
│   ├── proto/        # Generated TypeScript types
│   ├── api/          # tRPC routers & schemas
│   ├── db/           # Prisma schema
│   └── shared/       # Shared utilities
├── proto/            # Protobuf definitions
├── scripts/
│   └── setup.sh      # One-command setup
└── docs/             # Documentation
```

---

## Troubleshooting

### Docker containers won't start

```bash
# Check if ports are in use
lsof -i :5432  # PostgreSQL
lsof -i :6379  # Redis

# Reset containers
docker-compose down -v
docker-compose up -d
```

### Prisma errors

```bash
# Regenerate client
pnpm db:generate

# Reset database
pnpm db:push --force-reset
```

### Proto generation fails

```bash
# Install buf CLI
make install-buf

# Update dependencies
make proto-deps

# Regenerate
make proto
```

### Port already in use

```bash
# Kill process on port
kill $(lsof -t -i:3000)  # Web
kill $(lsof -t -i:8080)  # Ingest
```

---

## Next Steps

1. **Explore the Dashboard** - http://localhost:3000
2. **Read the Architecture** - [docs/ARCHITECTURE.md](./ARCHITECTURE.md)
3. **Understand Types** - [docs/TYPE_SYSTEM.md](./TYPE_SYSTEM.md)
4. **See the Roadmap** - [docs/ROADMAP.md](./ROADMAP.md)
