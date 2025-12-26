# Ducsigr Architecture

## Complete Project Structure

```
Ducsigr/
│
├── proto/                                 # 🔵 SOURCE OF TRUTH (you edit these)
│   └── ducsigr/v1/
│       ├── common.proto                   #    TokenUsage, SpanLevel
│       ├── trace.proto                    #    Trace, Span, Project, ApiKey
│       └── ingest.proto                   #    IngestTraceRequest/Response
│
├── buf.yaml                               # Buf configuration
├── buf.gen.yaml                           # Generation targets
│
│   ┌─────────────────────────────────────────────────────────────────┐
│   │                    make proto (buf generate)                    │
│   └─────────────────────────────────────────────────────────────────┘
│                          │                           │
│                          ▼                           ▼
├── packages/
│   ├── proto/                             # 🟢 GENERATED TypeScript types
│   │   ├── package.json
│   │   └── src/
│   │       ├── index.ts                   #    Re-exports all
│   │       └── generated/                 #    ⚡ Auto-generated
│   │           └── ducsigr/v1/
│   │               ├── common.ts          #    TokenUsage, SpanLevel
│   │               ├── trace.ts           #    Trace, Span, etc.
│   │               └── ingest.ts          #    IngestTraceRequest, etc.
│   │
│   ├── db/                                # 🟡 Prisma (Database types)
│   │   ├── package.json
│   │   ├── prisma/
│   │   │   └── schema.prisma              #    DB schema definition
│   │   └── src/
│   │       └── index.ts                   #    Exports prisma client
│   │           │
│   │           └── generates → node_modules/@prisma/client
│   │                           (Prisma.TraceCreateInput, etc.)
│   │
│   ├── shared/                            # 🔷 Shared utilities (no types!)
│   │   └── src/
│   │       ├── index.ts
│   │       ├── constants.ts               #    APP_NAME, QUEUE_KEYS
│   │       └── utils.ts                   #    generateId, retry, etc.
│   │
│   ├── config-typescript/
│   └── config-eslint/
│
├── apps/
│   ├── ingest/                            # 🟠 Go Service (github.com/ducsigr/ingest)
│   │   ├── go.mod
│   │   ├── cmd/ingest/main.go
│   │   ├── Dockerfile
│   │   ├── Makefile
│   │   └── internal/
│   │       ├── config/
│   │       ├── handler/
│   │       ├── model/
│   │       ├── queue/
│   │       ├── server/
│   │       └── proto/                     # 🟢 GENERATED Go types
│   │           └── ducsigrv1/         #    ⚡ Auto-generated
│   │               ├── common.pb.go
│   │               ├── trace.pb.go
│   │               └── ingest.pb.go
│   │
│   ├── web/                               # 🟣 Next.js Dashboard
│   │   ├── package.json
│   │   ├── next.config.ts
│   │   └── src/app/
│   │       └── ...
│   │
│   └── worker/                            # 🟤 Background Processor
│       ├── package.json
│       └── src/
│           ├── index.ts
│           ├── queue/consumer.ts
│           └── processors/trace.ts        #    Proto → Prisma conversion
│
├── docker-compose.yml
├── Makefile
├── package.json
├── pnpm-workspace.yaml
└── turbo.json
```

## Type System Graph

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           TYPE DEFINITIONS                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌──────────────────────┐              ┌──────────────────────┐           │
│   │   proto/*.proto      │              │  prisma/schema.prisma │           │
│   │   (API contracts)    │              │  (Database schema)    │           │
│   └──────────┬───────────┘              └──────────┬───────────┘           │
│              │                                     │                        │
│              │ buf generate                        │ prisma generate        │
│              │                                     │                        │
│              ▼                                     ▼                        │
│   ┌──────────────────────┐              ┌──────────────────────┐           │
│   │ packages/proto/      │              │ @prisma/client       │           │
│   │ src/generated/*.ts   │              │ (in node_modules)    │           │
│   ├──────────────────────┤              ├──────────────────────┤           │
│   │ apps/ingest/         │              │ Prisma.TraceCreate   │           │
│   │ internal/proto/*.go  │              │ Prisma.SpanCreate    │           │
│   └──────────────────────┘              └──────────────────────┘           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Data Flow Graph

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              DATA FLOW                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│                                                                             │
│   ┌─────────┐         ┌─────────────┐         ┌─────────────┐              │
│   │   SDK   │  HTTP   │   Ingest    │  Redis  │   Worker    │              │
│   │  (TS)   │ ──────► │    (Go)     │ ──────► │    (TS)     │              │
│   └─────────┘  JSON   └─────────────┘  Queue  └──────┬──────┘              │
│       │                     │                        │                      │
│       │ uses                │ uses                   │ converts             │
│       ▼                     ▼                        ▼                      │
│   ┌─────────┐         ┌─────────────┐         ┌─────────────┐              │
│   │ Proto   │         │ Proto (Go)  │         │ Proto → DB  │              │
│   │ Types   │         │ Types       │         │ Conversion  │              │
│   │  (TS)   │         │ *.pb.go     │         │             │              │
│   └─────────┘         └─────────────┘         └──────┬──────┘              │
│                                                      │                      │
│                                                      │ Prisma ORM           │
│                                                      ▼                      │
│                                               ┌─────────────┐              │
│                                               │ PostgreSQL  │              │
│   ┌─────────┐                                 └──────┬──────┘              │
│   │   Web   │  Prisma                                │                      │
│   │(Next.js)│ ◄──────────────────────────────────────┘                      │
│   └─────────┘  Query                                                        │
│       │                                                                     │
│       │ uses                                                                │
│       ▼                                                                     │
│   ┌─────────┐                                                               │
│   │ Prisma  │                                                               │
│   │ Types   │                                                               │
│   └─────────┘                                                               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Which Service Uses What Types

| Service | Proto Types | Prisma Types | Shared Utils |
|---------|-------------|--------------|--------------|
| **SDK** (external) | `@ducsigr/proto` | - | - |
| **Ingest** (Go) | `github.com/ducsigr/ingest/internal/proto/ducsigrv1` | - | - |
| **Worker** (TS) | `@ducsigr/proto` | `@ducsigr/db` | `@ducsigr/shared` |
| **Web** (Next.js) | `@ducsigr/proto` (API) | `@ducsigr/db` | `@ducsigr/shared` |

## Generation Commands

```bash
# Generate Proto types (Go + TypeScript)
make proto
# Output:
#   → packages/proto/src/generated/*.ts
#   → apps/ingest/internal/proto/ducsigrv1/*.pb.go

# Generate Prisma client
pnpm db:generate
# Output:
#   → node_modules/@prisma/client (TypeScript types)
```

## Generated Types Summary

| Location | What | Generated By | Used By |
|----------|------|--------------|---------|
| `proto/*.proto` | Source definitions | You (manual) | buf generate |
| `packages/proto/src/generated/` | TypeScript proto types | `buf generate` | web, worker, SDK |
| `apps/ingest/internal/proto/ducsigrv1/` | Go proto types | `buf generate` | ingest |
| `node_modules/@prisma/client` | Database types | `prisma generate` | web, worker |

## Services Overview

| Service | Port | Language | Purpose |
|---------|------|----------|---------|
| **Web** | 3000 | TypeScript (Next.js) | Dashboard, API |
| **Ingest** | 8080 | Go | High-throughput trace ingestion |
| **Worker** | - | TypeScript | Background jobs, queue processing |
| **PostgreSQL** | 5432 | - | Primary database |
| **Redis** | 6379 | - | Queue, cache |

## Go Module Structure

The Go ingest service uses a clean module path:

```
Module: github.com/ducsigr/ingest

Imports:
├── github.com/ducsigr/ingest/internal/config
├── github.com/ducsigr/ingest/internal/handler
├── github.com/ducsigr/ingest/internal/model
├── github.com/ducsigr/ingest/internal/queue
├── github.com/ducsigr/ingest/internal/server
└── github.com/ducsigr/ingest/internal/proto/ducsigrv1  (generated)
```

## UI Filtering Flow (Read Path)

The UI reads data directly from PostgreSQL via tRPC, bypassing the Worker entirely.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         UI FILTERING FLOW                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                 │
│   │  Filter Bar  │───▶│  URL Params  │───▶│   Context    │                 │
│   │   (React)    │    │              │    │              │                 │
│   └──────────────┘    └──────────────┘    └──────────────┘                 │
│                                                  │                          │
│                                                  ▼                          │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                 │
│   │  UI Renders  │◀───│  tRPC API    │◀───│  React Hook  │                 │
│   │              │    │   (Server)   │    │              │                 │
│   └──────────────┘    └──────────────┘    └──────────────┘                 │
│                              │                                              │
│                              ▼                                              │
│                       ┌──────────────┐                                      │
│                       │  PostgreSQL  │                                      │
│                       └──────────────┘                                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Step-by-Step Flow

| Step | Location | Description |
|------|----------|-------------|
| 1 | Filter Bar (`traces-filter-bar.tsx`) | User selects filters (time range, model, search) |
| 2 | URL Params | Filter state persisted to URL (`?timeRange=7d&models=gpt-4o`) |
| 3 | Context (`cost-context.tsx`) | Parses URL params → `TraceFilters` object |
| 4 | React Hook (`use-traces.ts`) | Calls tRPC with filters |
| 5 | tRPC API (`costs.ts`, `traces.ts`) | Builds Prisma WHERE clause from filters |
| 6 | PostgreSQL | Executes filtered query |

### Key Files

```
apps/web/src/
├── components/
│   ├── traces/
│   │   └── traces-filter-bar.tsx     # Filter UI components
│   └── costs/
│       ├── cost-context.tsx          # URL ↔ Filter state sync
│       └── cost-sidebar-panel.tsx    # Cost display (calls tRPC)
├── hooks/
│   └── traces/
│       └── use-traces.ts             # tRPC hook for traces

packages/api/src/
├── routers/
│   ├── traces.ts                     # traces.list, traces.get
│   └── costs.ts                      # costs.getOverview, costs.getByModel
└── schemas/
    └── traces.ts                     # TraceFilters schema
```

### Filter State Management

Filters are stored in URL params for shareability:

```typescript
// URL: /projects/xxx?timeRange=7d&models=gpt-4o,claude-3-5-sonnet&search=hello

// Parsed to TraceFilters:
{
  timeRange: "7d",
  models: ["gpt-4o", "claude-3-5-sonnet"],
  search: "hello",
  types: undefined,
  levels: undefined,
}
```

### Server-Side Query Building

```typescript
// packages/api/src/routers/costs.ts
const buildSpanFilters = (input, dateRange): Prisma.SpanWhereInput => {
  const conditions = {
    trace: {
      projectId: input.projectId,
      timestamp: { gte: dateRange.start, lte: dateRange.end },
    },
  };

  if (input.search) {
    conditions.trace.name = { contains: input.search, mode: "insensitive" };
  }

  if (input.models?.length) {
    conditions.model = { in: input.models };
  }

  return conditions;
};
```

### Write vs Read Path Comparison

| Aspect | Write Path | Read Path |
|--------|------------|-----------|
| Entry | SDK | UI Filter Bar |
| Flow | SDK → Ingest → Redis → Worker → DB | UI → tRPC → DB |
| Worker | Required | Not involved |
| Purpose | Persist traces, calculate costs | Query & display data |

## Type Conversion Flow

The worker handles conversion between Proto types (API) and Prisma types (Database):

```
Queue (Proto-like JSON) → TraceProcessor → Prisma → PostgreSQL
```

### Example Conversion

```typescript
// Queue format (from Go)          →  Prisma format (to DB)
{                                     {
  ID: "abc123",                         id: "abc123",
  ProjectID: "proj1",                   project: { connect: { id: "proj1" } },
  Name: "my-trace",                     name: "my-trace",
  Timestamp: "2024-01-01T...",          timestamp: new Date("2024-01-01T..."),
  Metadata: {...},                      metadata: {...},
}                                     }

// Span level conversion
Proto enum (number)  →  Prisma enum (string)
0 (UNSPECIFIED)     →  DEFAULT
1 (DEBUG)           →  DEBUG
2 (DEFAULT)         →  DEFAULT
3 (WARNING)         →  WARNING
4 (ERROR)           →  ERROR
```
