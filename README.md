# T3 Monorepo

A T3-style monorepo with Next.js 15, tRPC, Prisma, and BullMQ.

## Tech Stack

- **Runtime**: Node.js 20+
- **Package Manager**: pnpm with workspaces
- **Build**: Turborepo
- **Web**: Next.js 15, React 19, Tailwind CSS 4
- **API**: tRPC v11
- **Database**: PostgreSQL + Prisma 6
- **Queue**: BullMQ (Redis-based)
- **Validation**: Zod

## Structure

```
├── apps/
│   ├── web/          # Next.js app
│   └── worker/       # BullMQ worker
├── packages/
│   ├── api/          # tRPC routers
│   ├── db/           # Prisma schema + client
│   ├── queue/        # BullMQ setup
│   └── shared/       # Shared types & utilities
└── tooling/
    ├── eslint/       # ESLint config
    └── typescript/   # TypeScript config
```

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker (for PostgreSQL and Redis)

### Setup

```bash
# Install dependencies
pnpm install

# Start PostgreSQL and Redis
docker-compose up -d

# Copy env file
cp .env.example .env

# Generate Prisma client
pnpm db:generate

# Push schema to database
pnpm db:push

# Start all apps in dev mode
pnpm dev
```

### Available Scripts

| Script | Description |
|--------|-------------|
| `pnpm dev` | Start all apps in development mode |
| `pnpm build` | Build all apps and packages |
| `pnpm lint` | Run ESLint on all packages |
| `pnpm typecheck` | Run TypeScript type checking |
| `pnpm db:generate` | Generate Prisma client |
| `pnpm db:push` | Push schema changes to database |
| `pnpm db:migrate` | Run database migrations |

## Type Architecture

All types are centralized in two packages:

- **`@t3/shared`**: Zod schemas and inferred types (validation + runtime)
- **`@t3/db`**: Prisma-generated types (database models)

Import types from these packages:

```typescript
// Zod schemas and types
import { createUserSchema, type CreateUserInput } from "@t3/shared";

// Prisma types
import { db, type User, type Post } from "@t3/db";
```
