# Ducsigr Documentation

## Overview

Ducsigr is an AI Platform Monitoring & Observability system. It provides tracing, monitoring, and analytics for AI/LLM applications.

## Documentation Index

| Document | Description |
|----------|-------------|
| [Getting Started](./GETTING_STARTED.md) | Installation, setup, and quick start guide |
| [Architecture](./ARCHITECTURE.md) | Project structure, data flow, and service overview |
| [Type System](./TYPE_SYSTEM.md) | Protobuf and Prisma type systems explained |
| [Roadmap](./ROADMAP.md) | Future architecture, scaling strategy, and feature roadmap |

## Quick Links

### Development

```bash
# Install dependencies
make install

# Start infrastructure
make docker-up

# Generate types
make proto && pnpm db:generate

# Run services
pnpm dev                    # TypeScript apps
cd apps/ingest && make dev  # Go service
```

### Services

| Service | Port | URL |
|---------|------|-----|
| Web | 3000 | http://localhost:3000 |
| Ingest | 8080 | http://localhost:8080 |
| PostgreSQL | 5432 | - |
| Redis | 6379 | - |

### Key Directories

| Path | Purpose |
|------|---------|
| `proto/` | Protobuf definitions (source of truth) |
| `packages/proto/` | Generated TypeScript types |
| `packages/db/` | Prisma schema and client |
| `apps/ingest/` | Go ingestion service |
| `apps/web/` | Next.js dashboard |
| `apps/worker/` | Background processor |

## Tech Stack

- **Monorepo**: pnpm workspaces + Turborepo
- **Web**: Next.js 16, React 19, TypeScript 5.7
- **Ingest**: Go 1.23
- **Worker**: Node.js 24, TypeScript 5.7
- **Database**: PostgreSQL + Prisma 7
- **Queue**: Redis
- **Types**: Protocol Buffers (Buf)
